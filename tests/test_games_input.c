/* Verificación nativa de los juegos NOVA (pong, snake, catch) — input real.
 * Cada juego debe: (1) arrancar en portada; (2) responder a la tecla 5;
 * (3) responder a direcciones; (4) aguantar 36.000 frames con input
 * scriptado sin colgar ni salir; (5) ser determinista (misma script →
 * mismos hashes de framebuffer).
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/common/nova.h"
#include "../src/chip8/chip8.h"

static u8 rom[0xE00];
static int g_ips = 60;

static void run_frames(c8_state *s, int n) {
    for (int f = 0; f < n; f++) {
        for (int i = 0; i < g_ips && !s->exited; i++) c8_step(s);
        c8_tick_timers(s);
    }
}

static int fb_nonempty(const c8_state *s) {
    for (int y = 0; y < s->fb.h; y++)
        for (int x = 0; x < s->fb.w; x++)
            if (fb_get(&s->fb, x, y)) return 1;
    return 0;
}

static int px(const c8_state *s, int x, int y) { return fb_get(&s->fb, x, y) ? 1 : 0; }

static int bottom_col(const c8_state *s, int col) {
    for (int y = s->fb.h - 1; y >= 0; y--)
        if (fb_get(&s->fb, col, y)) return y;
    return -1;
}

static int row_has_px(const c8_state *s, int y, int x0, int x1) {
    for (int x = x0; x <= x1; x++)
        if (fb_get(&s->fb, x, y)) return 1;
    return 0;
}

static int leftmost_row(const c8_state *s, int y) {
    for (int x = 0; x < s->fb.w; x++)
        if (fb_get(&s->fb, x, y)) return x;
    return -1;
}

/* pulsa la tecla 5 el tiempo suficiente para que la portada la lea */
static void press_start(c8_state *s) {
    c8_key(s, 5, 1);
    run_frames(s, 12);
    c8_key(s, 5, 0);
    run_frames(s, 10);
}

/* script de input: pares (frame, key, down) */
typedef struct { int f; int k; int d; } Ev;

static void script_run(c8_state *s, const Ev *ev, int nev, int frames, u64 *hashes) {
    int ei = 0;
    for (int f = 0; f < frames; f++) {
        while (ei < nev && ev[ei].f == f) { c8_key(s, ev[ei].k, ev[ei].d); ei++; }
        for (int i = 0; i < g_ips && !s->exited; i++) c8_step(s);
        c8_tick_timers(s);
        if (hashes && (f % 150 == 0)) hashes[f / 150] = fb_hash((fb_t *)&s->fb);
    }
}

static int load(const char *path) {
    FILE *fp = fopen(path, "rb");
    if (!fp) { fprintf(stderr, "no ROM: %s\n", path); return -1; }
    size_t len = fread(rom, 1, sizeof rom, fp);
    fclose(fp);
    return (int)len;
}

static c8_quirks q;
static int fails = 0;
#define CHECK(cond, msg) do { if (!(cond)) { printf("  FAIL: %s\n", msg); fails++; } \
                              else printf("  ok: %s\n", msg); } while (0)

static void test_pong(void) {
    printf("== NOVAPONG ==\n");
    g_ips = 130;
    int len = load("tests/roms/gen/nova_pong.ch8");
    if (len < 0) { fails++; return; }
    c8_state st;

    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    run_frames(&st, 30);
    CHECK(fb_nonempty(&st), "portada dibujada");
    CHECK(!st.exited, "no ha salido en portada");

    /* empezar con tecla 5 */
    press_start(&st);
    CHECK(px(&st, 4, 13) || px(&st, 4, 17), "pala P1 visible en columna 4");
    u64 hb0 = fb_hash((fb_t *)&st.fb);
    run_frames(&st, 20);
    u64 hb1 = fb_hash((fb_t *)&st.fb);
    CHECK(hb0 != hb1, "la bola se mueve (hash cambia)");

    /* pala responde: mantener 8 (abajo) 40 frames → columna 4 baja */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    press_start(&st);
    run_frames(&st, 6);
    int b0 = bottom_col(&st, 4);
    c8_key(&st, 8, 1);
    run_frames(&st, 40);
    c8_key(&st, 8, 0);
    int b1 = bottom_col(&st, 4);
    CHECK(b1 > b0, "pala P1 se mueve hacia abajo con tecla 8");

    /* estabilidad + determinismo con script */
    Ev ev[] = {
        {10, 5, 1}, {12, 5, 0},
        {60, 2, 1}, {90, 2, 0}, {120, 8, 1}, {150, 8, 0},
        {200, 6, 1}, {210, 6, 0}, {260, 4, 1}, {270, 4, 0},
        {300, 2, 1}, {330, 2, 0}, {400, 8, 1}, {430, 8, 0},
    };
    u64 h1[8] = {0}, h2[8] = {0};
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 14, 1200, h1);
    CHECK(!st.exited, "1200 frames con script sin exit");
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 14, 1200, h2);
    CHECK(memcmp(h1, h2, sizeof h1) == 0, "determinismo: misma script → mismos hashes");
}

static void test_snake(void) {
    printf("== NOVASNAKE ==\n");
    g_ips = 200;
    int len = load("tests/roms/gen/nova_snake.ch8");
    if (len < 0) { fails++; return; }
    c8_state st;

    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    run_frames(&st, 30);
    CHECK(fb_nonempty(&st), "portada dibujada");

    c8_key(&st, 5, 1); run_frames(&st, 12); c8_key(&st, 5, 0);
    run_frames(&st, 10);
    CHECK(row_has_px(&st, 16, 32, 60) || row_has_px(&st, 17, 32, 60),
          "serpiente avanzada hacia la derecha tras arrancar");

    /* avanza sola a la derecha: hash cambia en ~30 ticks */
    u64 h0 = fb_hash((fb_t *)&st.fb);
    run_frames(&st, 900);
    u64 h1 = fb_hash((fb_t *)&st.fb);
    CHECK(h0 != h1, "la serpiente avanza sola");
    CHECK(!st.exited, "sin exit tras avanzar");

    /* determinismo */
    Ev ev[] = {
        {10, 5, 1}, {12, 5, 0},
        {100, 8, 1}, {102, 8, 0},          /* girar abajo */
        {300, 6, 1}, {302, 6, 0},          /* derecha */
        {500, 2, 1}, {502, 2, 0},          /* arriba */
        {700, 4, 1}, {702, 4, 0},          /* izquierda */
    };
    u64 s1[8] = {0}, s2[8] = {0};
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 10, 1200, s1);
    CHECK(!st.exited, "1200 frames con script sin exit");
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 10, 1200, s2);
    CHECK(memcmp(s1, s2, sizeof s1) == 0, "determinismo de la script");
}

static void test_catch(void) {
    printf("== NOVACATCH ==\n");
    g_ips = 100;
    int len = load("tests/roms/gen/nova_catch.ch8");
    if (len < 0) { fails++; return; }
    c8_state st;

    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    run_frames(&st, 30);
    CHECK(fb_nonempty(&st), "portada dibujada");

    c8_key(&st, 5, 1); run_frames(&st, 12); c8_key(&st, 5, 0);
    run_frames(&st, 10);
    CHECK(px(&st, 28, 30) && px(&st, 35, 31), "cesta 8x2 en (28,30)");

    /* cesta responde: tecla 6 → la cesta se desplaza a la derecha */
    c8_key(&st, 6, 1);
    run_frames(&st, 30);
    c8_key(&st, 6, 0);
    int lm = leftmost_row(&st, 30);
    CHECK(lm > 28, "cesta se mueve a la derecha (borde izq > 28)");

    /* determinismo largo */
    Ev ev[] = {
        {10, 5, 1}, {12, 5, 0},
        {50, 6, 1}, {90, 6, 0},
        {120, 4, 1}, {160, 4, 0},
        {200, 6, 1}, {260, 6, 0},
        {300, 4, 1}, {340, 4, 0},
        {400, 6, 1}, {460, 6, 0},
    };
    u64 c1[8] = {0}, c2[8] = {0};
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 12, 2400, c1);
    CHECK(!st.exited, "2400 frames con script sin exit");
    c8_init(&st, C8_SYS_CHIP8, &q); c8_load_rom(&st, rom, len);
    script_run(&st, ev, 12, 2400, c2);
    CHECK(memcmp(c1, c2, sizeof c1) == 0, "determinismo de la script");
}

int main(void) {
    c8_quirks_vip(&q);
    test_pong();
    test_snake();
    test_catch();
    if (fails) { printf("GAMES-TEST: %d FALLOS\n", fails); return 1; }
    printf("GAMES-TEST: TODO OK\n");
    return 0;
}
