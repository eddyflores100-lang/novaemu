/* NovaEmu - tests unitarios CHIP-8/S-CHIP (tabla de casos directos) */
#include "../chip8/chip8.h"
#include <string.h>
#include <stdio.h>

static int g_pass, g_fail;

static void ck(const char *name, int cond)
{
    if (cond) { g_pass++; printf("  PASS %s\n", name); }
    else      { g_fail++; printf("  FAIL %s\n", name); }
}

/* programa y pc a 0x200 */
static void prog(c8_state *s, const u8 *b, int n)
{
    memcpy(s->mem + 0x200, b, (size_t)n);
    s->pc = 0x200;
}

static void run_n(c8_state *s, int n) { int k; for (k = 0; k < n; k++) c8_step(s); }

int test_chip8_all(void)
{
    c8_state s;
    c8_quirks mod;

    printf("chip8: arranque y fuentes\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    ck("font-chip8-en-0x50", s.mem[0x050] == 0xF0 && s.mem[0x09F] == 0x80);
    c8_init(&s, C8_SYS_SCHIP, NULL);
    ck("font-schip-en-0xA0", s.mem[0x0A0] == 0x70 && s.mem[0x13F] == 0x00);
    ck("pantalla-schip-128x64", s.fb.w == 128 && s.fb.h == 64);
    ck("pc-inicia-0x200", s.pc == 0x200);

    printf("chip8: saltos y pila\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0x12,0x34}; prog(&s, p, 2); run_n(&s, 1); }
    ck("1NNN-salto", s.pc == 0x234);

    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0x22,0x10}; u8 r[] = {0x00,0xEE};
      prog(&s, p, 2); memcpy(s.mem + 0x210, r, 2); run_n(&s, 1); }
    ck("2NNN-call-push", s.pc == 0x210 && s.sp == 1 && s.stack[0] == 0x202);
    run_n(&s, 1);
    ck("00EE-ret-pop", s.pc == 0x202 && s.sp == 0);

    printf("chip8: skips\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[1] = 5;
    { u8 p[] = {0x31,0x05, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("3XNN-salta-si-igual", s.v[0] == 0 && s.pc == 0x206);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[1] = 6;
    { u8 p[] = {0x31,0x05, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("3XNN-no-salta-si-distinto", s.v[0] == 1 && s.pc == 0x204);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[1] = 5;
    { u8 p[] = {0x41,0x06, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("4XNN-salta-si-distinto", s.v[0] == 0 && s.pc == 0x206);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[2] = 9; s.v[3] = 9;
    { u8 p[] = {0x52,0x30, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("5XY0-salta-si-iguales", s.v[0] == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[2] = 9; s.v[3] = 8;
    { u8 p[] = {0x92,0x30, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("9XY0-salta-si-distintos", s.v[0] == 0);

    printf("chip8: aritmética 8XYx\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 0xF8; s.v[1] = 0x0A;
    { u8 p[] = {0x80,0x14}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY4-acarreo", s.v[0] == 0x02 && s.v[0xF] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 5; s.v[1] = 7;
    { u8 p[] = {0x80,0x15}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY5-préstamo", s.v[0] == 0xFE && s.v[0xF] == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 7; s.v[1] = 5;
    { u8 p[] = {0x80,0x17}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY7-resta-invertida", s.v[0] == 0xFE && s.v[0xF] == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 0b00001010;                    /* lsb=0 */
    { u8 p[] = {0x80,0x06}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY6-shift-VX-lsb0", s.v[0] == 0x05 && s.v[0xF] == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 0b00001011;                    /* lsb=1 */
    { u8 p[] = {0x80,0x06}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY6-shift-VX-lsb1", s.v[0] == 0x05 && s.v[0xF] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    c8_quirks_schip_modern(&s.q);           /* shift_vx=0: usa VY */
    s.v[1] = 0b00001100;
    { u8 p[] = {0x80,0x16}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY6-quirk-moderno-usa-VY", s.v[0] == 0x06 && s.v[0xF] == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 0x80;
    { u8 p[] = {0x80,0x0E}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XYE-msb-a-VF", s.v[0] == 0x00 && s.v[0xF] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);        /* quirk VIP: VF=0 tras lógicas */
    s.v[0] = 0x0C; s.v[1] = 0x0A; s.v[0xF] = 1;
    { u8 p[] = {0x80,0x11}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY1-vf-reset-VIP", s.v[0] == 0x0E && s.v[0xF] == 0);
    c8_quirks_schip_modern(&mod);
    c8_init(&s, C8_SYS_CHIP8, &mod);
    s.v[0] = 0x0C; s.v[1] = 0x0A; s.v[0xF] = 1;
    { u8 p[] = {0x80,0x11}; prog(&s, p, 2); run_n(&s, 1); }
    ck("8XY1-sin-vf-reset-moderno", s.v[0] == 0x0E && s.v[0xF] == 1);

    printf("chip8: registros y memoria\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0x60,0xAB, 0x70,0xFF}; prog(&s, p, 4); run_n(&s, 2); }
    ck("7XNN-envuelve-sin-flag", s.v[0] == 0xAA);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0xA1,0x23}; prog(&s, p, 2); run_n(&s, 1); }
    ck("ANNN-carga-I", s.i == 0x123);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[1] = 0x10;
    { u8 p[] = {0xF1,0x1E}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX1E-suma-I", s.i == 0x010);
    c8_init(&s, C8_SYS_CHIP8, NULL);        /* quirk VIP: overflow activa VF */
    s.i = 0xFFE; s.v[1] = 0x10;
    { u8 p[] = {0xF1,0x1E}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX1E-overflow-quirk", s.i == 0x00E && s.v[0xF] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0xB3,0x05}; s.v[0] = 2; prog(&s, p, 2); run_n(&s, 1); }
    ck("BNNN-salto-V0+NNN", s.pc == 0x307);

    printf("chip8: FX33/FX55/FX65/FX29\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 239; s.i = 0x400;
    { u8 p[] = {0xF0,0x33}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX33-bcd", s.mem[0x400] == 2 && s.mem[0x401] == 3 && s.mem[0x402] == 9);
    c8_init(&s, C8_SYS_CHIP8, NULL);        /* VIP: I se incrementa */
    s.i = 0x400; s.v[0] = 1; s.v[1] = 2; s.v[2] = 3;
    { u8 p[] = {0xF2,0x55}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX55-incr-I-quirk", s.mem[0x400] == 1 && s.mem[0x402] == 3 && s.i == 0x403);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    c8_quirks_schip_modern(&s.q);           /* moderno: I no cambia */
    s.i = 0x400; s.v[0] = 1; s.v[1] = 2;
    { u8 p[] = {0xF1,0x55}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX55-I-fijo-moderno", s.i == 0x400);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.mem[0x400] = 0x55; s.i = 0x400;
    { u8 p[] = {0xF2,0x65}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX65-carga", s.v[0] == 0x55);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[5] = 0xA;
    { u8 p[] = {0xF5,0x29}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX29-fuente-chip8", s.i == 0x050 + 5 * 0xA);
    c8_init(&s, C8_SYS_SCHIP, NULL);
    s.v[5] = 0x3;
    { u8 p[] = {0xF5,0x29}; prog(&s, p, 2); run_n(&s, 1); }
    ck("FX29-fuente-schip", s.i == 0x0A0 + 10 * 0x3);

    printf("chip8: dibujo DXYN\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.i = 0x400; s.mem[0x400] = 0xFF; s.v[0] = 0; s.v[1] = 0;
    { u8 p[] = {0xD0,0x18}; prog(&s, p, 2); run_n(&s, 1); }
    ck("DXYN-enciende-y-sin-colision",
       fb_get(&s.fb, 0, 0) == 3 && fb_get(&s.fb, 7, 0) == 3 && s.v[0xF] == 0);
    s.pc = 0x200;               /* re-ejecuta el mismo draw */
    run_n(&s, 1);
    ck("DXYN-xor-y-colision", fb_get(&s.fb, 0, 0) == 0 && s.v[0xF] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);        /* clipping VIP */
    s.i = 0x400; s.mem[0x400] = 0xFF; s.v[0] = 60; s.v[1] = 0;
    { u8 p[] = {0xD0,0x18}; prog(&s, p, 2); run_n(&s, 1); }
    ck("DXYN-clip-en-borde",
       fb_get(&s.fb, 63, 0) == 3 && fb_get(&s.fb, 0, 0) == 0);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    c8_quirks_schip_modern(&s.q); s.q.clip_sprites = 0;   /* wrap */
    s.i = 0x400; s.mem[0x400] = 0xFF; s.v[0] = 60; s.v[1] = 0;
    { u8 p[] = {0xD0,0x18}; prog(&s, p, 2); run_n(&s, 1); }
    ck("DXYN-wrap-sin-clip", fb_get(&s.fb, 0, 0) == 3);

    printf("chip8: teclado y timers\n");
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0xE0,0x9E, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("EX9E-no-pulsada-no-salta", s.v[0] == 1);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.v[0] = 3; c8_key(&s, 3, 1);
    { u8 p[] = {0xE0,0x9E, 0x60,0x01}; prog(&s, p, 4); run_n(&s, 2); }
    ck("EX9E-pulsada-salta", s.v[0] == 3 && s.pc == 0x206);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    { u8 p[] = {0xF0,0x0A}; prog(&s, p, 2); run_n(&s, 3); }
    ck("FX0A-bloquea-sin-tecla", s.pc == 0x200 && s.wait_key == 0);
    c8_key(&s, 7, 1); run_n(&s, 1);
    ck("FX0A-captura-tecla", s.v[0] == 7 && s.wait_key == -1);
    c8_init(&s, C8_SYS_CHIP8, NULL);
    s.dt = 2; s.st = 5;
    c8_tick_timers(&s); c8_tick_timers(&s); c8_tick_timers(&s);
    ck("timers-60Hz", s.dt == 0 && s.st == 2);

    printf("chip8: S-CHIP extendido\n");
    c8_init(&s, C8_SYS_SCHIP, NULL);
    { u8 p[] = {0x00,0xFE}; prog(&s, p, 2); run_n(&s, 1); }
    ck("00FE-vuelve-a-64x32", s.fb.w == 64 && s.fb.h == 32 && !s.extended);
    { u8 p[] = {0x00,0xFF}; prog(&s, p, 2); run_n(&s, 1); }
    ck("00FF-extendido", s.fb.w == 128 && s.extended);
    c8_init(&s, C8_SYS_SCHIP, NULL);
    fb_set(&s.fb, 10, 0, 3);
    { u8 p[] = {0x00,0xC4}; prog(&s, p, 2); run_n(&s, 1); }
    ck("00CN-scroll-down", fb_get(&s.fb, 10, 4) == 3 && fb_get(&s.fb, 10, 0) == 0);
    c8_init(&s, C8_SYS_SCHIP, NULL);
    { u8 p[] = {0xF0,0x75, 0xF0,0x85}; s.v[0] = 42; s.i = 0; prog(&s, p, 4); run_n(&s, 2); }
    ck("FX75/FX85-rpl", s.v[0] == 42);
    c8_init(&s, C8_SYS_SCHIP, NULL);
    s.i = 0x400;                            /* sprite 16x16: 32 bytes */
    memset(s.mem + 0x400, 0xFF, 32);
    s.v[0] = 0; s.v[1] = 0;
    { u8 p[] = {0xD0,0x50}; prog(&s, p, 2); run_n(&s, 1); }
    ck("DXY0-16x16-schip", fb_get(&s.fb, 0, 0) == 3 && fb_get(&s.fb, 15, 15) == 3 && s.v[0xF] == 0);

    printf("chip8: determinismo del RNG\n");
    {
        c8_state a, b; int k; int same = 1;
        c8_init(&a, C8_SYS_CHIP8, NULL);
        c8_init(&b, C8_SYS_CHIP8, NULL);
        { u8 p[] = {0xC0,0x0F, 0xC1,0x0F, 0xC2,0x0F, 0xC3,0x0F, 0xC4,0x0F};
          prog(&a, p, 10); prog(&b, p, 10); }
        for (k = 0; k < 5; k++) { c8_step(&a); c8_step(&b); if (a.v[k] != b.v[k]) same = 0; }
        ck("CXNN-determinista", same);
    }

    printf("g_chip8: %d PASS, %d FAIL\n", g_pass, g_fail);
    return g_fail;
}
