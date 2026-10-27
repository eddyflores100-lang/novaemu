/* Harness nativo de depuración: imprime el mismo estado que los exports dbg_* del wasm. */
#include "../common/nova.h"
#include "../gb/gb.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static u8 *read_file(const char *path, size_t *len)
{
    FILE *fp = fopen(path, "rb");
    u8 *buf;
    long sz;
    if (!fp) { perror("open"); exit(2); }
    fseek(fp, 0, SEEK_END); sz = ftell(fp); fseek(fp, 0, SEEK_SET);
    buf = malloc((size_t)sz);
    if (fread(buf, 1, (size_t)sz, fp) != (size_t)sz) exit(2);
    fclose(fp);
    *len = (size_t)sz;
    return buf;
}

int main(int argc, char **argv)
{
    size_t len;
    u8 *rom = read_file(argv[1], &len);
    int frames = atoi(argv[2]);
    gb g;
    gb_init(&g);
    if (gb_load_rom(&g, rom, len) != 0) { fprintf(stderr, "rom fail\n"); return 2; }
    if (argc > 3 && !strcmp(argv[3], "trace")) {
        /* paso a paso: i, ciclos, pc tras el paso, af/bc/de/hl */
        int n = atoi(argv[2]);
        for (int i = 0; i < n; i++) {
            int c = gb_cpu_step(&g);
            printf("%04d c=%d pc=%04X af=%04X bc=%04X de=%04X hl=%04X sp=%04X\n",
                i, c, g.cpu.pc, (g.cpu.a << 8) | g.cpu.f, GB_BC(&g), GB_DE(&g), GB_HL(&g), g.cpu.sp);
        }
        return 0;
    }
    for (int f = 0; f < frames; f++) gb_run_frame(&g);
    printf("pc=%04X sp=%04X af=%04X bc=%04X de=%04X hl=%04X ime=%d halt=%d if=%02X ie=%02X tima=%u tma=%u tac=%u div=%02X lcdc=%02X stat=%02X ly=%u cyc=%llu serlen=%d\n",
        g.cpu.pc, g.cpu.sp, (g.cpu.a << 8) | g.cpu.f, GB_BC(&g), GB_DE(&g), GB_HL(&g),
        g.cpu.ime, g.cpu.halted, g.iflag, g.ie, g.tima, g.tma, g.tac, g.div_counter >> 8,
        g.lcdc, g.stat, g.ly, (unsigned long long)g.cycles, g.serial_len);
    return 0;
}
