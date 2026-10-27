#include "chip8.h"
#include <string.h>

/* ------------------------------------------------------------------ *
 * Fuentes
 * ------------------------------------------------------------------ */
static const u8 FONT_CHIP8[80] = { /* 16 dígitos hex, 5 bytes c/u */
    0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70, 0xF0,0x10,0xF0,0x80,0xF0,
    0xF0,0x10,0xF0,0x10,0xF0, 0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0,
    0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40, 0xF0,0x90,0xF0,0x90,0xF0,
    0xF0,0x90,0xF0,0x10,0xF0, 0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0,
    0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0, 0xF0,0x80,0xF0,0x80,0xF0,
    0xF0,0x80,0xF0,0x80,0x80
};

/* Super-Chip: 16 dígitos, 10 bytes c/u (8x10), alojada en 0xA0. */
static const u8 FONT_SCHIP[160] = {
    0x70,0x88,0x88,0x88,0x88,0x88,0x88,0x88,0x70,0x00,  /* 0 */
    0x20,0x60,0x20,0x20,0x20,0x20,0x20,0x20,0x70,0x00,  /* 1 */
    0xF0,0x08,0x08,0x08,0xF0,0x80,0x80,0x80,0xF8,0x00,  /* 2 */
    0xF0,0x08,0x08,0x08,0xF0,0x08,0x08,0x08,0xF0,0x00,  /* 3 */
    0x88,0x88,0x88,0x88,0xF8,0x08,0x08,0x08,0x08,0x00,  /* 4 */
    0xF8,0x80,0x80,0x80,0xF0,0x08,0x08,0x08,0xF0,0x00,  /* 5 */
    0x70,0x80,0x80,0x80,0xF0,0x88,0x88,0x88,0x70,0x00,  /* 6 */
    0xF8,0x08,0x08,0x08,0x10,0x20,0x20,0x20,0x20,0x00,  /* 7 */
    0x70,0x88,0x88,0x88,0x70,0x88,0x88,0x88,0x70,0x00,  /* 8 */
    0x70,0x88,0x88,0x88,0x78,0x08,0x08,0x08,0xF0,0x00,  /* 9 */
    0x70,0x88,0x88,0x88,0xF8,0x88,0x88,0x88,0x88,0x00,  /* A */
    0xF0,0x88,0x88,0x88,0xF0,0x88,0x88,0x88,0xF0,0x00,  /* B */
    0x70,0x88,0x80,0x80,0x80,0x80,0x88,0x88,0x70,0x00,  /* C */
    0xF0,0x88,0x88,0x88,0x88,0x88,0x88,0x88,0xF0,0x00,  /* D */
    0xF8,0x80,0x80,0x80,0xF0,0x80,0x80,0x80,0xF8,0x00,  /* E */
    0xF8,0x80,0x80,0x80,0xF0,0x80,0x80,0x80,0x80,0x00   /* F */
};

/* ------------------------------------------------------------------ *
 * Presets de quirks
 * ------------------------------------------------------------------ */
void c8_quirks_vip(c8_quirks *q)
{
    memset(q, 0, sizeof *q);
    q->vf_reset_alu   = 1;
    q->shift_vx       = 1;
    q->loadstore_incr = 1;
    q->clip_sprites   = 1;
    q->i_overflow_vf  = 1;
}

void c8_quirks_schip_modern(c8_quirks *q)
{
    memset(q, 0, sizeof *q);
    q->vf_reset_alu   = 0;
    q->shift_vx       = 0;   /* VX = VY desplazado */
    q->loadstore_incr = 0;
    q->clip_sprites   = 1;
    q->dxy1_schip     = 0;
}

void c8_quirks_from_profile(c8_quirks *q, const nova_profile *p)
{
    /* Preset base según campo sys (se decide antes), luego overrides. */
    q->vf_reset_alu   = nova_profile_get_int(p, "vf_reset_alu",   q->vf_reset_alu);
    q->shift_vx       = nova_profile_get_int(p, "shift_vx",       q->shift_vx);
    q->loadstore_incr = nova_profile_get_int(p, "loadstore_incr", q->loadstore_incr);
    q->clip_sprites   = nova_profile_get_int(p, "clip_sprites",   q->clip_sprites);
    q->i_overflow_vf  = nova_profile_get_int(p, "i_overflow_vf",  q->i_overflow_vf);
    q->jump_bxnn      = nova_profile_get_int(p, "jump_bxnn",      q->jump_bxnn);
    q->dxy1_schip     = nova_profile_get_int(p, "dxy1_schip",     q->dxy1_schip);
}

/* ------------------------------------------------------------------ *
 * Ciclo de vida
 * ------------------------------------------------------------------ */
void c8_init(c8_state *s, c8_sys sys, const c8_quirks *q)
{
    memset(s, 0, sizeof *s);
    s->sys = sys;
    s->wait_key = -1;
    s->rng = 0x1EE7BEEFu; /* semilla fija: ejecuciones 100% deterministas */
    if (sys == C8_SYS_CHIP8) {
        memcpy(s->mem + 0x050, FONT_CHIP8, sizeof FONT_CHIP8);
        s->screen_w = 64; s->screen_h = 32;
    } else {
        memcpy(s->mem + 0x050, FONT_CHIP8, sizeof FONT_CHIP8);
        memcpy(s->mem + 0x0A0, FONT_SCHIP, sizeof FONT_SCHIP);
        s->screen_w = 128; s->screen_h = 64;
        s->extended = 1;
    }
    fb_init(&s->fb, s->screen_w, s->screen_h);
    fb_clear(&s->fb, 0);
    s->pc = 0x200;
    if (q) s->q = *q;
    else if (sys == C8_SYS_SCHIP) c8_quirks_schip_modern(&s->q);
    else c8_quirks_vip(&s->q);
}

int c8_load_rom(c8_state *s, const u8 *rom, size_t len)
{
    if (0x200 + len > sizeof s->mem) return -1;
    memcpy(s->mem + 0x200, rom, len);
    s->pc = 0x200;
    return 0;
}

void c8_key(c8_state *s, int k, int down)
{
    if (k < 0 || k > 15) return;
    if (down) s->keys[k] = 1; else s->keys[k] = 0;
}

void c8_tick_timers(c8_state *s)
{
    if (s->dt) s->dt--;
    if (s->st) s->st--;
}

/* ------------------------------------------------------------------ *
 * Ejecución
 * ------------------------------------------------------------------ */
static u8 c8_rand(c8_state *s)
{
    u32 x = s->rng;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    s->rng = x ? x : 0x1EE7BEEFu;
    return (u8)(x & 0xFF);
}

static void fb_resize(c8_state *s, int w, int h)
{
    if (s->fb.w == w && s->fb.h == h) return;
    fb_free(&s->fb);
    fb_init(&s->fb, w, h);
    fb_clear(&s->fb, 0);
    s->screen_w = w; s->screen_h = h;
}

static void scroll_down(c8_state *s, int n)
{
    int x, y;
    for (y = s->fb.h - 1; y >= 0; y--) {
        int src = y - n;
        for (x = 0; x < s->fb.w; x++)
            fb_set(&s->fb, x, y, src >= 0 ? fb_get(&s->fb, x, src) : 0);
    }
}

static void scroll_side(c8_state *s, int dx) /* dx>0 derecha, <0 izquierda */
{
    int x, y;
    for (y = 0; y < s->fb.h; y++) {
        for (x = 0; x < s->fb.w; x++) {
            int src = x - dx;
            fb_set(&s->fb, x, y, (src >= 0 && src < s->fb.w) ? fb_get(&s->fb, src, y) : 0);
        }
    }
}

/* Dibuja sprite; ancho 1 byte (o 2 si schip16). Devuelve VF (colisión). */
static u8 draw_sprite(c8_state *s, u8 vx, u8 vy, int rows, int wide)
{
    int x0 = vx % s->fb.w, y0 = vy % s->fb.h;
    int row, col, collision = 0;
    for (row = 0; row < rows; row++) {
        for (col = 0; col < (wide ? 16 : 8); col++) {
            u8 byte = s->mem[(s->i + (u16)(row * (wide ? 2 : 1) + (col >> 3))) & 0xFFFF];
            int bit = 7 - (col & 7);
            int on = (byte >> bit) & 1;
            if (!on) continue;
            if (s->q.clip_sprites) {
                if (x0 + col >= s->fb.w || y0 + row >= s->fb.h) continue;
            }
            {
                int px = (x0 + col) % s->fb.w;
                int py = (y0 + row) % s->fb.h;
                u8 old = fb_get(&s->fb, px, py);
                u8 nw = old ^ 3;
                if (old == 3 && nw == 0) collision = 1;
                fb_set(&s->fb, px, py, nw);
            }
        }
    }
    return collision ? 1 : 0;
}

void c8_step(c8_state *s)
{
    u16 op = (u16)((s->mem[s->pc] << 8) | s->mem[(u16)(s->pc + 1)]);
    u8 x = (op >> 8) & 0xF, y = (op >> 4) & 0xF;
    u8 n = op & 0xF, nn = op & 0xFF;
    u16 nnn = op & 0xFFF;
    s->pc = (u16)(s->pc + 2);
    s->opcount++;

    switch (op >> 12) {
    case 0x0:
        if (op == 0x00E0) { fb_clear(&s->fb, 0); }
        else if (op == 0x00EE) { s->pc = s->stack[--s->sp & 0xF]; }
        else if (s->sys == C8_SYS_SCHIP && (op & 0xF0) == 0x00C0) {
            scroll_down(s, n);
        }
        else if (op == 0x00FB && s->sys == C8_SYS_SCHIP) scroll_side(s, 4);
        else if (op == 0x00FC && s->sys == C8_SYS_SCHIP) scroll_side(s, -4);
        else if (op == 0x00FE && s->sys == C8_SYS_SCHIP) { s->extended = 0; fb_resize(s, 64, 32); }
        else if (op == 0x00FF && s->sys == C8_SYS_SCHIP) { s->extended = 1; fb_resize(s, 128, 64); }
        else if (op == 0x00FD) { s->exited = 1; }
        break;
    case 0x1: s->pc = nnn; break;
    case 0x2: s->stack[s->sp++ & 0xF] = s->pc; s->pc = nnn; break;
    case 0x3: if (s->v[x] == nn) s->pc = (u16)(s->pc + 2); break;
    case 0x4: if (s->v[x] != nn) s->pc = (u16)(s->pc + 2); break;
    case 0x5: if (n == 0 && s->v[x] == s->v[y]) s->pc = (u16)(s->pc + 2); break;
    case 0x6: s->v[x] = nn; break;
    case 0x7: s->v[x] = (u8)(s->v[x] + nn); break; /* sin flags */
    case 0x8: {
        u8 vx = s->v[x], vy = s->v[y];
        switch (n) {
        case 0x0: s->v[x] = vy; break;
        case 0x1: s->v[x] = vx | vy; if (s->q.vf_reset_alu) s->v[0xF] = 0; break;
        case 0x2: s->v[x] = vx & vy; if (s->q.vf_reset_alu) s->v[0xF] = 0; break;
        case 0x3: s->v[x] = vx ^ vy; if (s->q.vf_reset_alu) s->v[0xF] = 0; break;
        case 0x4: { u16 r = (u16)vx + vy; s->v[x] = (u8)r; s->v[0xF] = r > 0xFF; break; }
        case 0x5: { u8 r = (u8)(vx - vy); s->v[x] = r; s->v[0xF] = vx >= vy; break; }
        case 0x6: { u8 src = s->q.shift_vx ? vx : vy; s->v[x] = src >> 1; s->v[0xF] = src & 1; break; }
        case 0x7: { u8 r = (u8)(vy - vx); s->v[x] = r; s->v[0xF] = vy >= vx; break; }
        case 0xE: { u8 src = s->q.shift_vx ? vx : vy; s->v[x] = (u8)(src << 1); s->v[0xF] = src >> 7; break; }
        }
        break;
    }
    case 0x9: if (n == 0 && s->v[x] != s->v[y]) s->pc = (u16)(s->pc + 2); break;
    case 0xA: s->i = nnn; break;
    case 0xB: s->pc = (u16)(s->q.jump_bxnn ? nnn : nnn + s->v[0]); break;
    case 0xC: s->v[x] = (u8)(c8_rand(s) & nn); break;
    case 0xD: {
        int rows = n ? n : (s->sys == C8_SYS_SCHIP ? 16 : n);
        int wide = (s->sys == C8_SYS_SCHIP && s->extended && n == 0) ? 1 : 0;
        s->v[0xF] = draw_sprite(s, s->v[x], s->v[y], rows, wide);
        break;
    }
    case 0xE:
        if (nn == 0x9E && s->keys[s->v[x] & 0xF]) s->pc = (u16)(s->pc + 2);
        else if (nn == 0xA1 && !s->keys[s->v[x] & 0xF]) s->pc = (u16)(s->pc + 2);
        break;
    case 0xF:
        switch (nn) {
        case 0x07: s->v[x] = s->dt; break;
        case 0x0A: {
            int k, found = -1;
            for (k = 0; k < 16; k++) if (s->keys[k]) { found = k; break; }
            if (found < 0) { s->pc = (u16)(s->pc - 2); s->wait_key = x; }
            else { s->v[x] = (u8)found; s->wait_key = -1; }
            break;
        }
        case 0x15: s->dt = s->v[x]; break;
        case 0x18: s->st = s->v[x]; break;
        case 0x1E: {
            u32 ni = (u32)s->i + s->v[x];
            if (s->q.i_overflow_vf) {           /* VIP: I es de 12 bits */
                if (ni > 0xFFF) s->v[0xF] = 1;
                s->i = (u16)(ni & 0xFFF);
            } else {
                s->i = (u16)(ni & 0xFFFF);
            }
            break;
        }
        case 0x29:
            s->i = (s->sys == C8_SYS_SCHIP) ? (u16)(0x0A0 + 10 * (s->v[x] & 0xF))
                                            : (u16)(0x050 + 5 * (s->v[x] & 0xF));
            break;
        case 0x33:
            s->mem[s->i & 0xFFFF] = s->v[x] / 100;
            s->mem[(s->i + 1) & 0xFFFF] = (s->v[x] / 10) % 10;
            s->mem[(s->i + 2) & 0xFFFF] = s->v[x] % 10;
            break;
        case 0x55: { int k; for (k = 0; k <= x; k++) s->mem[(s->i + k) & 0xFFFF] = s->v[k];
                     if (s->q.loadstore_incr) { s->i = (u16)(s->i + x + 1); } break; }
        case 0x65: { int k; for (k = 0; k <= x; k++) s->v[k] = s->mem[(s->i + k) & 0xFFFF];
                     if (s->q.loadstore_incr) { s->i = (u16)(s->i + x + 1); } break; }
        case 0x75: { int k; for (k = 0; k <= x && k < 8; k++) s->rpl[k] = s->v[k]; break; }
        case 0x85: { int k; for (k = 0; k <= x && k < 8; k++) s->v[k] = s->rpl[k]; break; }
        }
        break;
    }
}
