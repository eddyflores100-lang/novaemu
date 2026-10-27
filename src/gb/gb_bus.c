/* NovaEmu - bus, timer, serial, DMA, MBC1 del núcleo Game Boy.
 * Tabla de mapa declarativa (técnica xemu #1: dispatch O(1) por rango).
 */
#include "gb.h"
#include <string.h>

static u32 gb_rom_bank(const gb *g)
{
    u32 n;
    if (g->mbc != 1) return 0;
    n = g->rom_bank_low & 0x1F;
    if (g->mbc_mode) n |= (u32)(g->bank2 & 0x03) << 5;
    if ((n & 0x1F) == 0) n |= 1;
    if (n >= g->rom_banks) n %= g->rom_banks ? g->rom_banks : 1;
    return n;
}

u8 gb_read(gb *g, u16 a)
{
    if (a < 0x4000) {
        if (g->mbc == 1 && g->mbc_mode) { /* modo 1: 0x0000-3FFF usa bank2 alto */
            u32 hi = (u32)(g->bank2 & 0x03) << 5;
            if (g->rom_banks > 32) return g->rom[((hi % g->rom_banks) * 0x4000) + a];
        }
        return g->rom[a];
    }
    if (a < 0x8000) {
        if (g->mbc == 1) return g->rom[(gb_rom_bank(g) * 0x4000) + (a - 0x4000)];
        return g->rom[a];
    }
    if (a < 0xA000) return g->vram[a - 0x8000];
    if (a < 0xC000) return g->eram[(a - 0xA000) & 0x1FFF];
    if (a < 0xFE00) return g->wram[(a - 0xC000) & 0x1FFF];  /* incluye echo E000-FDFF */
    if (a < 0xFEA0) return g->oam[a - 0xFE00];
    if (a < 0xFF00) return 0x00;
    if (a < 0xFF80) {
        switch (a) {
        case 0xFF00: { /* P1: joypad */
            u8 low = 0x0F;
            if (!(g->p1 & 0x10)) low &= (u8)((g->joyp_state & 0x0F) | 0xF0);
            if (!(g->p1 & 0x20)) low &= (u8)(((g->joyp_state >> 4) & 0x0F) | 0xF0);
            return (u8)(0xC0 | (g->p1 & 0x30) | low);
        }
        case 0xFF01: return g->sb;
        case 0xFF02: return g->sc;
        case 0xFF04: return (u8)(g->div_counter >> 8);
        case 0xFF05: return g->tima;
        case 0xFF06: return g->tma;
        case 0xFF07: return (u8)(0xF8 | (g->tac & 7));
        case 0xFF0F: return (u8)(0xE0 | g->iflag);
        case 0xFF40: return g->lcdc;
        case 0xFF41: return (u8)(0x80 | g->stat | (g->mode & 3));
        case 0xFF42: return g->scy;
        case 0xFF43: return g->scx;
        case 0xFF44: return (u8)g->ly;
        case 0xFF45: return (u8)g->lyc;
        case 0xFF47: return g->bgp;
        case 0xFF48: return g->obp0;
        case 0xFF49: return g->obp1;
        case 0xFF4A: return g->wy;
        case 0xFF4B: return g->wx;
        default:     return 0x00;
        }
    }
    if (a < 0xFFFF) return g->hram[a - 0xFF80];
    return g->ie;
}

void gb_write(gb *g, u16 a, u8 v)
{
    if (a < 0x8000) { /* zona MBC */
        if (g->mbc == 1) {
            if (a < 0x2000) { /* ramg: se ignora (RAM siempre activa) */ }
            else if (a < 0x4000) {
                g->rom_bank_low = (u8)(v & 0x1F);
                if ((g->rom_bank_low & 0x1F) == 0) g->rom_bank_low |= 1;
            }
            else if (a < 0x6000) g->bank2 = (u8)(v & 3);
            else g->mbc_mode = v & 1;
        }
        return;
    }
    if (a < 0xA000) { g->vram[a - 0x8000] = v; return; }
    if (a < 0xC000) { g->eram[(a - 0xA000) & 0x1FFF] = v; return; }
    if (a < 0xFE00) { g->wram[(a - 0xC000) & 0x1FFF] = v; return; }
    if (a < 0xFEA0) { g->oam[a - 0xFE00] = v; return; }
    if (a < 0xFF00) return;
    if (a < 0xFF80) {
        switch (a) {
        case 0xFF00: g->p1 = v & 0x30; return;
        case 0xFF01: g->sb = v; return;
        case 0xFF02:
            g->sc = v & 0x7F;
            if (v & 0x80) { /* transferencia con reloj interno */
                if (g->serial_len < (int)sizeof g->serial - 1)
                    g->serial[g->serial_len++] = (char)g->sb;
                g->sc = 0x7F & ~(u8)0x80;
                g->iflag |= 0x08;
            }
            return;
        case 0xFF04: { /* quirk: escribir DIV puede incrementar TIMA por flanco */
            int bit = (g->tac & 3) ? (int[]){9, 3, 5, 7}[g->tac & 3] : 9;
            if ((g->tac & 4) && (g->div_counter >> bit & 1)) {
                if (++g->tima == 0) { g->tima = g->tma; g->iflag |= 0x04; }
            }
            g->div_counter = 0;
            return;
        }
        case 0xFF05: g->tima = v; return;
        case 0xFF06: g->tma = v; return;
        case 0xFF07: g->tac = v & 7; return;
        case 0xFF0F: g->iflag = v & 0x1F; return;
        case 0xFF40:
            g->lcdc = v;
            g->lcd_on = (v & 0x80) != 0;
            if (!g->lcd_on) {
                g->ly = 0; g->dots = 0; g->mode = 0; g->win_line = 0;
                fb_clear(&g->fb, 0);
            }
            return;
        case 0xFF41: g->stat = v & 0x78; return;
        case 0xFF42: g->scy = v; return;
        case 0xFF43: g->scx = v; return;
        case 0xFF45: g->lyc = v; return;
        case 0xFF46: { /* OAM DMA (copia instantánea) */
            u16 src = (u16)(v << 8);
            int k;
            for (k = 0; k < 0xA0; k++) g->oam[k] = gb_read(g, (u16)(src + k));
            return;
        }
        case 0xFF47: g->bgp = v; return;
        case 0xFF48: g->obp0 = v; return;
        case 0xFF49: g->obp1 = v; return;
        case 0xFF4A: g->wy = v; return;
        case 0xFF4B: g->wx = v; return;
        default: return;
        }
    }
    if (a < 0xFFFF) { g->hram[a - 0xFF80] = v; return; }
    g->ie = v;
}

/* ------------------------------------------------------------------ *
 * Timer: contador interno 16-bit, flanco de caída del bit seleccionado
 * (implementación post-2020, docs/pandocs Timer).
 * ------------------------------------------------------------------ */
static void gb_timer_tick(gb *g, u32 cycles)
{
    static const int bit_sel[4] = { 9, 3, 5, 7 };
    u32 i;
    if (!(g->tac & 4)) {
        g->div_counter = (u16)(g->div_counter + cycles);
        return;
    }
    for (i = 0; i < cycles; i += 4) {
        int bit = bit_sel[g->tac & 3];
        int before = (g->div_counter >> bit) & 1;
        g->div_counter += 4;
        if (before && !((g->div_counter >> bit) & 1)) {
            if (++g->tima == 0) { g->tima = g->tma; g->iflag |= 0x04; }
        }
    }
}

/* ------------------------------------------------------------------ *
 * Tick de componentes (4 t-ciclos de granularidad)
 * ------------------------------------------------------------------ */
void gb_tick_components(gb *g, u32 cycles)
{
    u32 rem = cycles;
    while (rem) {
        u32 chunk = rem > 4 ? 4 : rem;
        gb_timer_tick(g, chunk);
        gb_ppu_tick(g, chunk);
        rem -= chunk;
        g->cycles += chunk;
    }
}

void gb_key(gb *g, int btn, int down)
{
    if (btn < 0 || btn > 7) return;
    if (down) g->joyp_state &= (u8)~(1 << btn);
    else      g->joyp_state |= (u8)(1 << btn);
    if (down) g->iflag |= 0x10; /* petición de interrupción de joypad */
}

void gb_init(gb *g)
{
    memset(g, 0, sizeof *g);
    fb_init(&g->fb, 160, 144);
    fb_clear(&g->fb, 0);
    g->cpu.sp = 0xFFFE;
    g->cpu.pc = 0x0100;
    g->bgp = 0xFC; g->obp0 = 0xFF; g->obp1 = 0xFF;
    g->p1 = 0x30;
    g->joyp_state = 0xFF;
    g->tac = 0xF8 & 7;
    g->lcdc = 0x91; /* como el boot ROM deja el LCD: on, bg on, tiles 8000 */
    g->lcd_on = 1;
    g->mode = 2;    /* arranca en OAM: la línea 0 se renderiza */
}

int gb_load_rom(gb *g, const u8 *data, size_t len)
{
    if (len == 0 || len > sizeof g->rom) return -1;
    memcpy(g->rom, data, len);
    g->rom_banks = (u32)((len + 0x3FFF) / 0x4000);
    {
        u8 cart = (len >= 0x0148) ? g->rom[0x0147] : 0;
        if (cart >= 0x01 && cart <= 0x03) g->mbc = 1;
        else g->mbc = 0;
    }
    if (g->rom_banks > 2) g->mbc = 1; /* cualquier ROM bancada usa MBC1 básico */
    return 0;
}
