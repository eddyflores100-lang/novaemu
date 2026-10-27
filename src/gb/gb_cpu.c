/* NovaEmu - CPU SM83 (Game Boy).
 * Intérprete con decodificación por switch + helpers de registro indexado
 * (patrón de tabla separada del executor: RPCS3 PPUInterpreter → aquí
 * dispatch directo C99, suficiente a esta escala).
 */
#include "gb.h"

#define R_ZNHC(g, z, n, h, c) \
    ((g)->cpu.f = (u8)(((z) ? GB_FZ : 0) | ((n) ? GB_FN : 0) | \
                       ((h) ? GB_FH : 0) | ((c) ? GB_FC : 0)))

/* acceso a registros 8-bit por índice (B,C,D,E,H,L,(HL),A) */
static u8 rd_r8(gb *g, int r)
{
    switch (r) {
    case 0: return g->cpu.b;
    case 1: return g->cpu.c;
    case 2: return g->cpu.d;
    case 3: return g->cpu.e;
    case 4: return g->cpu.h;
    case 5: return g->cpu.l;
    case 6: return gb_read(g, (u16)((g->cpu.h << 8) | g->cpu.l));
    default: return g->cpu.a;
    }
}

static void wr_r8(gb *g, int r, u8 v)
{
    switch (r) {
    case 0: g->cpu.b = v; break;
    case 1: g->cpu.c = v; break;
    case 2: g->cpu.d = v; break;
    case 3: g->cpu.e = v; break;
    case 4: g->cpu.h = v; break;
    case 5: g->cpu.l = v; break;
    case 6: gb_write(g, (u16)((g->cpu.h << 8) | g->cpu.l), v); break;
    default: g->cpu.a = v; break;
    }
}

#define GB_HL(g) ((u16)(((g)->cpu.h << 8) | (g)->cpu.l))

static void push16(gb *g, u16 v)
{
    gb_write(g, (u16)--g->cpu.sp, (u8)(v >> 8));
    gb_write(g, (u16)--g->cpu.sp, (u8)(v & 0xFF));
}

static u16 pop16(gb *g)
{
    u16 lo = gb_read(g, g->cpu.sp); g->cpu.sp++;   /* sin UB: 2 instrucciones */
    u16 hi = gb_read(g, g->cpu.sp); g->cpu.sp++;
    return (u16)((hi << 8) | lo);
}

/* ------------------------------------------------------------------ *
 * ALU con flags (semántica SM83 verificada)
 * ------------------------------------------------------------------ */
static u8 alu_add(gb *g, u8 a, u8 b, u8 ci)
{
    u16 r = (u16)(a + b + ci);
    u8 res = (u8)r;
    R_ZNHC(g, res == 0, 0, ((a & 0xF) + (b & 0xF) + ci) > 0xF, r > 0xFF);
    return res;
}

static u8 alu_sub(gb *g, u8 a, u8 b, u8 ci, int keep)
{
    int r = (int)a - (int)b - (int)ci;
    u8 res = (u8)r;
    R_ZNHC(g, res == 0, 1, ((a & 0xF) - (b & 0xF) - (int)ci) < 0, r < 0);
    if (!keep) g->cpu.a = res;
    return res;
}

static void alu_and(gb *g, u8 v) { g->cpu.a &= v; R_ZNHC(g, g->cpu.a == 0, 0, 1, 0); }
static void alu_xor(gb *g, u8 v) { g->cpu.a ^= v; R_ZNHC(g, g->cpu.a == 0, 0, 0, 0); }
static void alu_or (gb *g, u8 v) { g->cpu.a |= v; R_ZNHC(g, g->cpu.a == 0, 0, 0, 0); }

static void alu_hl_add(gb *g, u16 rr)
{
    u32 r = (u32)GB_HL(g) + rr;
    int h = ((GB_HL(g) & 0xFFF) + (rr & 0xFFF)) > 0xFFF;
    g->cpu.f = (u8)((g->cpu.f & GB_FZ) | (h ? GB_FH : 0) | (r > 0xFFFF ? GB_FC : 0));
    SET_HL(g, (u16)r);
}

static u8 inc8(gb *g, u8 v)  { u8 r = (u8)(v + 1); R_ZNHC(g, r == 0, 0, (v & 0xF) == 0xF, g->cpu.f & GB_FC); return r; }
static u8 dec8(gb *g, u8 v)  { u8 r = (u8)(v - 1); R_ZNHC(g, r == 0, 1, (v & 0xF) == 0, g->cpu.f & GB_FC); return r; }

/* DAA: transcripción literal de SameBoy (Core/sm83_cpu.c, daa()),
 * verificado contra hardware real por gekkio. Claves: umbral >0x9F,
 * -0x60 SIN máscara en modo resta (bit 8 = subflujo), C solo se activa. */
static void op_daa(gb *g)
{
    int result = g->cpu.a;              /* int16, sin máscara aún */
    g->cpu.f &= (u8)~GB_FZ;

    if (g->cpu.f & GB_FN) {
        if (g->cpu.f & GB_FH) result = (result - 0x06) & 0xFF;
        if (g->cpu.f & GB_FC) result -= 0x60;
    } else {
        if ((g->cpu.f & GB_FH) || (result & 0x0F) > 0x09) result += 0x06;
        if ((g->cpu.f & GB_FC) || result > 0x9F) result += 0x60;
    }

    if ((result & 0xFF) == 0) g->cpu.f |= GB_FZ;
    if ((result & 0x100) == 0x100) g->cpu.f |= GB_FC;
    g->cpu.f &= (u8)~GB_FH;
    g->cpu.a = (u8)(result & 0xFF);
}

/* rotaciones/turnos del acumulador */
static void op_rlca(gb *g) { u8 c = g->cpu.a >> 7; g->cpu.a = (u8)((g->cpu.a << 1) | c); R_ZNHC(g, 0, 0, 0, c); }
static void op_rrca(gb *g) { u8 c = g->cpu.a & 1;  g->cpu.a = (u8)((g->cpu.a >> 1) | (c << 7)); R_ZNHC(g, 0, 0, 0, c); }
static void op_rla(gb *g)  { u8 c = g->cpu.a >> 7; g->cpu.a = (u8)((g->cpu.a << 1) | ((g->cpu.f >> 4) & 1)); R_ZNHC(g, 0, 0, 0, c); }
static void op_rra(gb *g)  { u8 c = g->cpu.a & 1;  g->cpu.a = (u8)((g->cpu.a >> 1) | (((g->cpu.f >> 4) & 1) << 7)); R_ZNHC(g, 0, 0, 0, c); }

/* ------------------------------------------------------------------ *
 * Prefijo CB (implementación completa)
 * ------------------------------------------------------------------ */
static int gb_cb_exec(gb *g, u8 op)
{
    int r = op & 7, cycles = (r == 6) ? 16 : 8;
    u8 v;
    switch (op >> 6) {
    case 0:
        v = rd_r8(g, r);
        switch ((op >> 3) & 7) {
        case 0: { u8 c = v >> 7; v = (u8)((v << 1) | c);        R_ZNHC(g, v == 0, 0, 0, c); break; } /* RLC */
        case 1: { u8 c = v & 1;  v = (u8)((v >> 1) | (c << 7)); R_ZNHC(g, v == 0, 0, 0, c); break; } /* RRC */
        case 2: { u8 c = v >> 7; v = (u8)((v << 1) | ((g->cpu.f >> 4) & 1)); R_ZNHC(g, v == 0, 0, 0, c); break; } /* RL */
        case 3: { u8 c = v & 1;  v = (u8)((v >> 1) | (((g->cpu.f >> 4) & 1) << 7)); R_ZNHC(g, v == 0, 0, 0, c); break; } /* RR */
        case 4: { u8 c = v >> 7; v = (u8)(v << 1);              R_ZNHC(g, v == 0, 0, 0, c); break; } /* SLA */
        case 5: { u8 c = v & 1;  v = (u8)((v & 0x80) | (v >> 1)); R_ZNHC(g, v == 0, 0, 0, c); break; } /* SRA */
        case 6:   v = (u8)((v >> 4) | (v << 4)); R_ZNHC(g, v == 0, 0, 0, 0); break;                  /* SWAP */
        default:{ u8 c = v & 1;  v = (u8)(v >> 1);              R_ZNHC(g, v == 0, 0, 0, c); break; } /* SRL */
        }
        wr_r8(g, r, v);
        break;
    case 1: { /* BIT */
        u8 v2 = rd_r8(g, r);
        int bit = (op >> 3) & 7;
        R_ZNHC(g, !((v2 >> bit) & 1), 0, 1, g->cpu.f & GB_FC);
        break;
    }
    case 2: { /* RES */
        v = rd_r8(g, r);
        v &= (u8)~(1 << ((op >> 3) & 7));
        wr_r8(g, r, v);
        break;
    }
    default: { /* SET */
        v = rd_r8(g, r);
        v |= (u8)(1 << ((op >> 3) & 7));
        wr_r8(g, r, v);
        break;
    }
    }
    return cycles;
}

/* ------------------------------------------------------------------ *
 * Servicio de interrupciones y despacho principal
 * ------------------------------------------------------------------ */
static const u16 INT_VECTOR[5] = { 0x40, 0x48, 0x50, 0x58, 0x60 };

static int gb_service_interrupts(gb *g)
{
    u8 pending = (u8)(g->iflag & g->ie & 0x1F);
    int i;
    if (!pending) return 0;
    if (!g->cpu.ime) return 0;
    for (i = 0; i < 5; i++) {
        if (pending & (1 << i)) {
            g->iflag &= (u8)~(1 << i);
            g->cpu.ime = 0;
            push16(g, g->cpu.pc);
            g->cpu.pc = INT_VECTOR[i];
            return 20;
        }
    }
    return 0;
}

int gb_cpu_step(gb *g)
{
    u16 op;
    int cycles;

    /* wake de HALT: cualquier interrupción pendiente despierta, con o sin IME */
    if (g->cpu.halted) {
        if (g->iflag & g->ie & 0x1F) g->cpu.halted = 0;
        else { gb_tick_components(g, 4); return 4; }
    }

    {
        int svc = gb_service_interrupts(g);
        if (svc) { gb_tick_components(g, (u32)svc); return svc; }
    }

    op = (u16)((gb_read(g, g->cpu.pc) << 8) | gb_read(g, (u16)(g->cpu.pc + 1)));
    g->cpu.pc++;                        /* consume el byte de opcode */
    u8 x = (u8)((op >> 8) & 0xFF);      /* byte alto */
    u8 d8 = (u8)(op & 0xFF);            /* operandos se leen DESPUÉS del opcode */
    /* d16: byte bajo en pc, byte alto en pc+1 (little-endian SM83) */
    u16 d16 = (u16)((gb_read(g, (u16)(g->cpu.pc + 1)) << 8) | gb_read(g, g->cpu.pc));
    cycles = 4;

    switch (x) {
    case 0x00: break; /* NOP */
    case 0x07: op_rlca(g); break;
    case 0x0F: op_rrca(g); break;
    case 0x17: op_rla(g); break;
    case 0x1F: op_rra(g); break;
    case 0x27: op_daa(g); break;
    case 0x2F: g->cpu.a = (u8)~g->cpu.a; g->cpu.f |= GB_FN | GB_FH; break; /* CPL */
    case 0x37: g->cpu.f = (u8)((g->cpu.f & GB_FZ) | GB_FC); break;         /* SCF */
    case 0x3F: g->cpu.f = (u8)((g->cpu.f & GB_FZ) | ((g->cpu.f & GB_FC) ? 0 : GB_FC)); break; /* CCF */
    case 0x01: SET_BC(g, d16); cycles = 12; g->cpu.pc += 2; break;
    case 0x02: gb_write(g, GB_BC(g), g->cpu.a); cycles = 8; break;
    case 0x03: SET_BC(g, (u16)(GB_BC(g) + 1)); cycles = 8; break;
    case 0x04: g->cpu.b = inc8(g, g->cpu.b); break;
    case 0x05: g->cpu.b = dec8(g, g->cpu.b); break;
    case 0x06: g->cpu.b = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x08: gb_write(g, d16, (u8)(g->cpu.sp & 0xFF)); gb_write(g, (u16)(d16 + 1), (u8)(g->cpu.sp >> 8)); cycles = 20; g->cpu.pc += 2; break;
    case 0x09: alu_hl_add(g, GB_BC(g)); cycles = 8; break;
    case 0x0A: g->cpu.a = gb_read(g, GB_BC(g)); cycles = 8; break;
    case 0x0B: SET_BC(g, (u16)(GB_BC(g) - 1)); cycles = 8; break;
    case 0x0C: g->cpu.c = inc8(g, g->cpu.c); break;
    case 0x0D: g->cpu.c = dec8(g, g->cpu.c); break;
    case 0x0E: g->cpu.c = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x10: g->cpu.pc++; break; /* STOP: byte extra de padding */
    case 0x11: SET_DE(g, d16); cycles = 12; g->cpu.pc += 2; break;
    case 0x12: gb_write(g, GB_DE(g), g->cpu.a); cycles = 8; break;
    case 0x13: SET_DE(g, (u16)(GB_DE(g) + 1)); cycles = 8; break;
    case 0x14: g->cpu.d = inc8(g, g->cpu.d); break;
    case 0x15: g->cpu.d = dec8(g, g->cpu.d); break;
    case 0x16: g->cpu.d = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x18: { s8 off = (s8)d8; g->cpu.pc = (u16)(g->cpu.pc + 1 + off); cycles = 12; break; }
    case 0x19: alu_hl_add(g, GB_DE(g)); cycles = 8; break;
    case 0x1A: g->cpu.a = gb_read(g, GB_DE(g)); cycles = 8; break;
    case 0x1B: SET_DE(g, (u16)(GB_DE(g) - 1)); cycles = 8; break;
    case 0x1C: g->cpu.e = inc8(g, g->cpu.e); break;
    case 0x1D: g->cpu.e = dec8(g, g->cpu.e); break;
    case 0x1E: g->cpu.e = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x20: case 0x28: case 0x30: case 0x38: { /* JR cc */
        int cond = (x == 0x20) ? !(g->cpu.f & GB_FZ)
                 : (x == 0x28) ?  (g->cpu.f & GB_FZ)
                 : (x == 0x30) ? !(g->cpu.f & GB_FC)
                               :  (g->cpu.f & GB_FC);
        s8 off = (s8)d8;
        g->cpu.pc += 1;
        if (cond) { g->cpu.pc = (u16)(g->cpu.pc + off); cycles = 12; }
        else cycles = 8;
        break;
    }
    case 0x21: SET_HL(g, d16); cycles = 12; g->cpu.pc += 2; break;
    case 0x22: gb_write(g, GB_HL(g), g->cpu.a); SET_HL(g, (u16)(GB_HL(g) + 1)); cycles = 8; break;
    case 0x23: SET_HL(g, (u16)(GB_HL(g) + 1)); cycles = 8; break;
    case 0x24: g->cpu.h = inc8(g, g->cpu.h); break;
    case 0x25: g->cpu.h = dec8(g, g->cpu.h); break;
    case 0x26: g->cpu.h = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x29: alu_hl_add(g, GB_HL(g)); cycles = 8; break;
    case 0x2A: g->cpu.a = gb_read(g, GB_HL(g)); SET_HL(g, (u16)(GB_HL(g) + 1)); cycles = 8; break;
    case 0x2B: SET_HL(g, (u16)(GB_HL(g) - 1)); cycles = 8; break;
    case 0x2C: g->cpu.l = inc8(g, g->cpu.l); break;
    case 0x2D: g->cpu.l = dec8(g, g->cpu.l); break;
    case 0x2E: g->cpu.l = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x31: g->cpu.sp = d16; cycles = 12; g->cpu.pc += 2; break;
    case 0x32: gb_write(g, GB_HL(g), g->cpu.a); SET_HL(g, (u16)(GB_HL(g) - 1)); cycles = 8; break;
    case 0x33: g->cpu.sp++; cycles = 8; break;
    case 0x34: gb_write(g, GB_HL(g), inc8(g, gb_read(g, GB_HL(g)))); cycles = 12; break;
    case 0x35: gb_write(g, GB_HL(g), dec8(g, gb_read(g, GB_HL(g)))); cycles = 12; break;
    case 0x36: gb_write(g, GB_HL(g), d8); cycles = 12; g->cpu.pc += 1; break;
    case 0x39: alu_hl_add(g, g->cpu.sp); cycles = 8; break;
    case 0x3A: g->cpu.a = gb_read(g, GB_HL(g)); SET_HL(g, (u16)(GB_HL(g) - 1)); cycles = 8; break;
    case 0x3B: g->cpu.sp--; cycles = 8; break;
    case 0x3C: g->cpu.a = inc8(g, g->cpu.a); break;
    case 0x3D: g->cpu.a = dec8(g, g->cpu.a); break;
    case 0x3E: g->cpu.a = d8; cycles = 8; g->cpu.pc += 1; break;
    case 0x40: case 0x41: case 0x42: case 0x43:
    case 0x44: case 0x45: case 0x46: case 0x47:
    case 0x48: case 0x49: case 0x4A: case 0x4B:
    case 0x4C: case 0x4D: case 0x4E: case 0x4F:
    case 0x50: case 0x51: case 0x52: case 0x53:
    case 0x54: case 0x55: case 0x56: case 0x57:
    case 0x58: case 0x59: case 0x5A: case 0x5B:
    case 0x5C: case 0x5D: case 0x5E: case 0x5F:
    case 0x60: case 0x61: case 0x62: case 0x63:
    case 0x64: case 0x65: case 0x67: case 0x68:
    case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6F:
    case 0x78: case 0x79: case 0x7A: case 0x7B:
    case 0x7C: case 0x7D: case 0x7E: case 0x7F:
        {
            int dst = (x >> 3) & 7, src = x & 7;   /* indices del BYTE DE OPCODE, no de op16 */
            wr_r8(g, dst, rd_r8(g, src));
            cycles = (dst == 6 || src == 6) ? 8 : 4;
        }
        break;
    case 0x76: g->cpu.halted = 1; cycles = 4; break; /* HALT */
    case 0x66: case 0x6E: /* LD H,(HL) / LD L,(HL) */
        wr_r8(g, (x >> 3) & 7, rd_r8(g, 6)); cycles = 8;
        break;
    case 0x70: case 0x71: case 0x72: case 0x73:
    case 0x74: case 0x75: case 0x77:
        wr_r8(g, 6, rd_r8(g, x & 7)); cycles = 8;  /* LD (HL),r: dst=(HL), src=x&7 */
        break;
    case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        g->cpu.a = alu_add(g, g->cpu.a, rd_r8(g, x & 7), 0); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        g->cpu.a = alu_add(g, g->cpu.a, rd_r8(g, x & 7), (u8)((g->cpu.f >> 4) & 1)); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        alu_sub(g, g->cpu.a, rd_r8(g, x & 7), 0, 0); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        alu_sub(g, g->cpu.a, rd_r8(g, x & 7), (u8)((g->cpu.f >> 4) & 1), 0); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
        alu_and(g, rd_r8(g, x & 7)); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
        alu_xor(g, rd_r8(g, x & 7)); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
        alu_or(g, rd_r8(g, x & 7)); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF:
        alu_sub(g, g->cpu.a, rd_r8(g, x & 7), 0, 1); cycles = (x & 7) == 6 ? 8 : 4; break;
    case 0xC0: case 0xC8: case 0xD0: case 0xD8: { /* RET cc */
        int cond = (x == 0xC0) ? !(g->cpu.f & GB_FZ)
                 : (x == 0xC8) ?  (g->cpu.f & GB_FZ)
                 : (x == 0xD0) ? !(g->cpu.f & GB_FC)
                               :  (g->cpu.f & GB_FC);
        if (cond) { g->cpu.pc = pop16(g); cycles = 20; }
        else cycles = 8;
        break;
    }
    case 0xC1: { u16 t = pop16(g); SET_BC(g, t); cycles = 12; } break;  /* sin doble eval */
    case 0xD1: { u16 t = pop16(g); SET_DE(g, t); cycles = 12; } break;
    case 0xE1: { u16 t = pop16(g); SET_HL(g, t); cycles = 12; } break;
    case 0xF1: { u16 af = pop16(g); g->cpu.a = (u8)(af >> 8); g->cpu.f = (u8)(af & 0xF0); cycles = 12; break; }
    case 0xC2: case 0xCA: case 0xD2: case 0xDA: { /* JP cc */
        int cond = (x == 0xC2) ? !(g->cpu.f & GB_FZ)
                 : (x == 0xCA) ?  (g->cpu.f & GB_FZ)
                 : (x == 0xD2) ? !(g->cpu.f & GB_FC)
                               :  (g->cpu.f & GB_FC);
        g->cpu.pc += 2;
        if (cond) { g->cpu.pc = d16; cycles = 16; }
        else cycles = 12;
        break;
    }
    case 0xC3: g->cpu.pc = d16; cycles = 16; break;
    case 0xC4: case 0xCC: case 0xD4: case 0xDC: { /* CALL cc */
        int cond = (x == 0xC4) ? !(g->cpu.f & GB_FZ)
                 : (x == 0xCC) ?  (g->cpu.f & GB_FZ)
                 : (x == 0xD4) ? !(g->cpu.f & GB_FC)
                               :  (g->cpu.f & GB_FC);
        g->cpu.pc += 2;
        if (cond) { push16(g, g->cpu.pc); g->cpu.pc = d16; cycles = 24; }
        else cycles = 12;
        break;
    }
    case 0xCD:                                    /* CALL a16 incondicional */
        g->cpu.pc += 2;
        push16(g, g->cpu.pc);
        g->cpu.pc = d16;
        cycles = 24;
        break;
    case 0xC5: push16(g, GB_BC(g)); cycles = 16; break;
    case 0xD5: push16(g, GB_DE(g)); cycles = 16; break;
    case 0xE5: push16(g, GB_HL(g)); cycles = 16; break;
    case 0xF5: push16(g, (u16)((g->cpu.a << 8) | (g->cpu.f & 0xF0))); cycles = 16; break;
    case 0xC6: g->cpu.a = alu_add(g, g->cpu.a, d8, 0); cycles = 8; g->cpu.pc += 1; break;
    case 0xD6: alu_sub(g, g->cpu.a, d8, 0, 0); cycles = 8; g->cpu.pc += 1; break;
    case 0xE6: alu_and(g, d8); cycles = 8; g->cpu.pc += 1; break;
    case 0xF6: alu_or(g, d8);  cycles = 8; g->cpu.pc += 1; break;
    case 0xEE: alu_xor(g, d8); cycles = 8; g->cpu.pc += 1; break;
    case 0xCE: g->cpu.a = alu_add(g, g->cpu.a, d8, (u8)((g->cpu.f >> 4) & 1)); cycles = 8; g->cpu.pc += 1; break;
    case 0xDE: alu_sub(g, g->cpu.a, d8, (u8)((g->cpu.f >> 4) & 1), 0); cycles = 8; g->cpu.pc += 1; break;
    case 0xFE: alu_sub(g, g->cpu.a, d8, 0, 1); cycles = 8; g->cpu.pc += 1; break;
    case 0xC7: case 0xCF: case 0xD7: case 0xDF:
    case 0xE7: case 0xEF: case 0xF7: case 0xFF:
        push16(g, g->cpu.pc);
        g->cpu.pc = (u16)(x & 0x38);   /* vector del RST viene del byte alto */
        cycles = 16;
        break;
    case 0xC9: g->cpu.pc = pop16(g); cycles = 16; break;
    case 0xD9: g->cpu.pc = pop16(g); g->cpu.ime = 1; cycles = 16; break; /* RETI */
    case 0xE9: g->cpu.pc = GB_HL(g); cycles = 4; break;
    case 0xE0: gb_write(g, (u16)(0xFF00 + d8), g->cpu.a); cycles = 12; g->cpu.pc += 1; break;
    case 0xF0: g->cpu.a = gb_read(g, (u16)(0xFF00 + d8)); cycles = 12; g->cpu.pc += 1; break;
    case 0xE2: gb_write(g, (u16)(0xFF00 + g->cpu.c), g->cpu.a); cycles = 8; break;
    case 0xF2: g->cpu.a = gb_read(g, (u16)(0xFF00 + g->cpu.c)); cycles = 8; break;
    case 0xEA: gb_write(g, d16, g->cpu.a); cycles = 16; g->cpu.pc += 2; break;
    case 0xFA: g->cpu.a = gb_read(g, d16); cycles = 16; g->cpu.pc += 2; break;
    case 0xE8: { /* ADD SP,r8 */
        s8 off = (s8)d8;
        u16 res = (u16)(g->cpu.sp + off);
        R_ZNHC(g, 0, 0, ((g->cpu.sp & 0xF) + (d8 & 0xF)) > 0xF,
               ((g->cpu.sp & 0xFF) + (d8 & 0xFF)) > 0xFF);
        g->cpu.sp = res;
        cycles = 16; g->cpu.pc += 1;
        break;
    }
    case 0xF8: { /* LD HL,SP+r8 */
        s8 off = (s8)d8;
        u16 res = (u16)(g->cpu.sp + off);
        R_ZNHC(g, 0, 0, ((g->cpu.sp & 0xF) + (d8 & 0xF)) > 0xF,
               ((g->cpu.sp & 0xFF) + (d8 & 0xFF)) > 0xFF);
        SET_HL(g, res);
        cycles = 12; g->cpu.pc += 1;
        break;
    }
    case 0xF9: g->cpu.sp = GB_HL(g); cycles = 8; break;
    case 0xF3: g->cpu.ime = 0; break;                    /* DI */
    case 0xFB: g->cpu.ime_delay = 2; break;              /* EI: el propio EI consume 1 tick del delay */
    case 0xCB: g->cpu.pc += 1; cycles = gb_cb_exec(g, d8); break;
    default:
        cycles = 4; /* opcodes ilegales: tratados como NOP (DMG los bloquea) */
        break;
    }

    if (g->cpu.ime_delay > 0 && --g->cpu.ime_delay == 0) g->cpu.ime = 1;
    gb_tick_components(g, (u32)cycles);  /* timer/PPU avanzan CON la CPU */
    return cycles;
}

/* ------------------------------------------------------------------ *
 * Frame completo: hasta VBlank (~70224 t-ciclos)
 * ------------------------------------------------------------------ */
int gb_run_frame(gb *g)
{
    u32 guard = 0;
    g->frame_flag = 0;
    while (!g->frame_flag) {
        gb_cpu_step(g);
        if (++guard > 5000000u) break; /* red de seguridad */
    }
    return (int)(g->cycles & 0x7FFFFFFF);
}

