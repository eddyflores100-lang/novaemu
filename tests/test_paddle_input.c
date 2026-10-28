/* Verificación nativa de nova_paddle.ch8 — entrada por teclado.
 * Pasa si: (1) sin teclas el fb es estable y el bloque está en (28,14);
 * (2) mantener tecla 6 mueve a la derecha (V4 sube); (3) tecla 4 baja V4;
 * (4) teclas 2/8 mueven V5; (5) los límites 0/56 y 0/28 se respetan.
 */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/common/nova.h"
#include "../src/chip8/chip8.h"

static u8 rom[0x200];

static u64 hash_fb(const c8_state *s) { return fb_hash((fb_t *)&s->fb); }

static void run_frames(c8_state *s, int n) {
    for (int f = 0; f < n; f++) {
        for (int i = 0; i < 11 && !s->exited; i++) c8_step(s);
        c8_tick_timers(s);
    }
}

static int block_at(const c8_state *s, int bx, int by) {
    /* comprueba que el bloque 4x4 está en (bx,by): 4 px en 4 filas empezando en bx */
    for (int r = 0; r < 4; r++) {
        int y = by + r, cnt = 0, first = -1;
        for (int x = 0; x < 64; x++) {
            if (fb_get(&s->fb, x, y)) { if (first < 0) first = x; cnt++; }
        }
        if (cnt != 4 || first != bx) return 0;
    }
    return 1;
}

int main(void) {
    FILE *fp = fopen("tests/roms/gen/nova_paddle.ch8", "rb");
    if (!fp) { fprintf(stderr, "no ROM\n"); return 1; }
    size_t len = fread(rom, 1, sizeof rom, fp); fclose(fp);
    if (len != 512) { fprintf(stderr, "ROM tamaño %zu != 512\n", len); return 1; }

    c8_quirks q; c8_quirks_vip(&q);
    c8_state st;

    /* T1: sin teclas → estable en (28,14) */
    c8_init(&st, C8_SYS_CHIP8, &q);
    if (c8_load_rom(&st, rom, len) != 0) return 2;
    run_frames(&st, 60);
    u64 h1 = hash_fb(&st);
    run_frames(&st, 60);
    u64 h2 = hash_fb(&st);
    if (h1 != h2) { printf("FAIL T1: fb inestable sin teclas\n"); return 1; }
    if (!block_at(&st, 28, 14)) { printf("FAIL T1: bloque no está en (28,14)\n"); return 1; }
    printf("T1 OK: estable en (28,14)\n");

    /* T2: tecla 6 → derecha */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    run_frames(&st, 30);
    c8_key(&st, 6, 1);
    run_frames(&st, 22);   /* ~2 frames por barrido → V4 += ~10 */
    c8_key(&st, 6, 0);
    run_frames(&st, 4);
    if (st.v[4] <= 28) { printf("FAIL T2: V4=%d no se movió a la derecha\n", st.v[4]); return 1; }
    printf("T2 OK: tecla 6 mueve derecha (V4=%d)\n", st.v[4]);

    /* T3: tecla 4 → izquierda */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    c8_key(&st, 4, 1);
    run_frames(&st, 44);
    c8_key(&st, 4, 0);
    if (st.v[4] >= 28) { printf("FAIL T3: V4=%d no se movió a la izquierda\n", st.v[4]); return 1; }
    if (st.v[4] > 250 && st.v[4] < 255) { /* wrap no debería pasar: límite en 0 */ }
    printf("T3 OK: tecla 4 mueve izquierda (V4=%d)\n", st.v[4]);

    /* T4: tecla 8 → abajo, límite 28 */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    c8_key(&st, 8, 1);
    run_frames(&st, 200);
    c8_key(&st, 8, 0);
    if (st.v[5] != 28) { printf("FAIL T4: V5=%d != límite 28\n", st.v[5]); return 1; }
    printf("T4 OK: tecla 8 baja hasta el límite V5=28\n");

    /* T5: tecla 2 → arriba, límite 0 */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    c8_key(&st, 2, 1);
    run_frames(&st, 200);
    c8_key(&st, 2, 0);
    if (st.v[5] != 0) { printf("FAIL T5: V5=%d != límite 0\n", st.v[5]); return 1; }
    printf("T5 OK: tecla 2 sube hasta el límite V5=0\n");

    /* T6: límite derecho 56 */
    c8_init(&st, C8_SYS_CHIP8, &q);
    c8_load_rom(&st, rom, len);
    c8_key(&st, 6, 1);
    run_frames(&st, 300);
    c8_key(&st, 6, 0);
    if (st.v[4] != 56) { printf("FAIL T6: V4=%d != límite 56\n", st.v[4]); return 1; }
    printf("T6 OK: límite derecho V4=56\n");

    printf("PADDLE 6/6 PASS\n");
    return 0;
}
