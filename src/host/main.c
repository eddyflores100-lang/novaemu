/* NovaEmu - host CLI headless (patrón "golden tests" + bench de shadPS4/RPCS3).
 * Sin SDL por diseño: tty ASCII, PPM y hashing determinista. Zero deps.
 */
#define _POSIX_C_SOURCE 199309L
#include "../common/nova.h"
#include "../chip8/chip8.h"
#include "../gb/gb.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static void usage(void)
{
    fprintf(stderr,
        "NovaEmu v1.0 — emulador unificado para hardware humilde (C99, zero deps)\n"
        "uso: novaemu <chip8|schip|gb> <rom> [opciones]\n"
        "  --frames N        fotogramas a ejecutar (def: 60)\n"
        "  --tty[=N]         dibujar en terminal cada N fotogramas\n"
        "  --ppm FILE        volcar el último fotograma a un PPM\n"
        "  --hash            imprimir hash FNV-1a del último fotograma\n"
        "  --bench           medir fps y emitir JSON (sin pausas)\n"
        "  --profile FILE    perfil low-end (ips_per_frame, frameskip, target_fps)\n"
        "  --serial          imprimir el serial capturado (gb)\n"
        "  --detect-serial   parar si el serial contiene Passed/Failed (gb)\n"
        "  --max-cycles N    límite de t-ciclos (gb)\n");
}

static void print_tty(const fb_t *f)
{
    static const char shades[4] = { ' ', '.', '+', '#' };
    int x, y;
    for (y = 0; y < f->h; y++) {
        for (x = 0; x < f->w; x++) putchar(shades[f->px[y * f->w + x] & 3]);
        putchar('\n');
    }
}

static u8 *read_file(const char *path, size_t *len)
{
    FILE *fp = fopen(path, "rb");
    u8 *buf;
    long sz;
    if (!fp) { fprintf(stderr, "novaemu: no se puede abrir '%s'\n", path); return NULL; }
    fseek(fp, 0, SEEK_END); sz = ftell(fp); fseek(fp, 0, SEEK_SET);
    buf = (u8 *)malloc((size_t)sz ? (size_t)sz : 1);
    if (!buf || fread(buf, 1, (size_t)sz, fp) != (size_t)sz) { fclose(fp); free(buf); return NULL; }
    fclose(fp);
    *len = (size_t)sz;
    return buf;
}

static void pacing(double target_fps, double t0, double frame_no)
{
    double deadline;
    struct timespec ts;
    if (target_fps <= 0) return;
    deadline = t0 + (frame_no + 1.0) / target_fps; /* pacing acumulativo anti-deriva (RPCS3 RSXThread) */
    if (nova_now() < deadline) {
        double d = deadline - nova_now();
        ts.tv_sec = (time_t)d;
        ts.tv_nsec = (long)((d - (double)ts.tv_sec) * 1e9);
        nanosleep(&ts, NULL);
    }
}

int main(int argc, char **argv)
{
    int i, frames = 60, tty_every = 0, want_ppm = 0, want_hash = 0, bench = 0;
    int want_serial = 0, detect_serial = 0;
    long max_cycles = 0;
    const char *ppm_path = NULL, *profile_path = NULL;
    nova_profile prof;
    int has_profile = 0;
    u8 *rom; size_t rom_len;
    const char *sysname, *rompath;
    double t0, t1;

    if (argc < 3) { usage(); return 2; }
    sysname = argv[1];
    rompath = argv[2];

    for (i = 3; i < argc; i++) {
        const char *a = argv[i];
        if (!strncmp(a, "--frames=", 9)) frames = atoi(a + 9);
        else if (!strcmp(a, "--frames") && i + 1 < argc) frames = atoi(argv[++i]);
        else if (!strncmp(a, "--tty=", 6)) tty_every = atoi(a + 6);
        else if (!strcmp(a, "--tty")) tty_every = 1;
        else if (!strncmp(a, "--ppm=", 6)) { ppm_path = a + 6; want_ppm = 1; }
        else if (!strcmp(a, "--ppm") && i + 1 < argc) { ppm_path = argv[++i]; want_ppm = 1; }
        else if (!strcmp(a, "--hash")) want_hash = 1;
        else if (!strcmp(a, "--bench")) bench = 1;
        else if (!strncmp(a, "--profile=", 10)) profile_path = a + 10;
        else if (!strcmp(a, "--profile") && i + 1 < argc) profile_path = argv[++i];
        else if (!strcmp(a, "--serial")) want_serial = 1;
        else if (!strcmp(a, "--detect-serial")) detect_serial = 1;
        else if (!strncmp(a, "--max-cycles=", 13)) max_cycles = atol(a + 13);
        else if (!strcmp(a, "--max-cycles") && i + 1 < argc) max_cycles = atol(argv[++i]);
        else { fprintf(stderr, "novaemu: opción desconocida '%s'\n", a); usage(); return 2; }
    }

    if (profile_path) {
        if (nova_profile_load(&prof, profile_path) != 0) {
            fprintf(stderr, "novaemu: perfil '%s' no encontrado\n", profile_path);
            return 2;
        }
        has_profile = 1;
    }

    rom = read_file(rompath, &rom_len);
    if (!rom) return 2;

    if (!strcmp(sysname, "chip8") || !strcmp(sysname, "schip")) {
        c8_state st;
        c8_quirks q;
        int ips, frameskip = 1;
        double target_fps = 0;
        long f;
        int is_schip = !strcmp(sysname, "schip");
        if (is_schip) c8_quirks_schip_modern(&q); else c8_quirks_vip(&q);
        if (has_profile) {
            c8_quirks_from_profile(&q, &prof);
            ips = nova_profile_get_int(&prof, "ips_per_frame", 11);
            frameskip = nova_profile_get_int(&prof, "frameskip", 1);
            target_fps = nova_profile_get_int(&prof, "target_fps", 0);
        } else ips = 11;
        if (ips < 1) ips = 1;

        c8_init(&st, is_schip ? C8_SYS_SCHIP : C8_SYS_CHIP8, &q);
        if (c8_load_rom(&st, rom, rom_len) != 0) { fprintf(stderr, "novaemu: ROM demasiado grande\n"); return 2; }

        t0 = nova_now();
        for (f = 0; f < frames; f++) {
            int k;
            if (st.exited) break;
            for (k = 0; k < ips && !st.exited; k++) c8_step(&st);
            c8_tick_timers(&st);
            if (tty_every && (f % (tty_every * frameskip) == 0)) { printf("--- frame %ld ---\n", f); print_tty(&st.fb); }
            pacing(target_fps, t0, (double)f);
        }
        t1 = nova_now();
        if (want_ppm) fb_write_ppm(&st.fb, ppm_path);
        if (want_hash) printf("hash=%016llx\n", (unsigned long long)fb_hash(&st.fb));
        if (bench)
            printf("{\"system\":\"%s\",\"frames\":%ld,\"seconds\":%.3f,\"fps\":%.0f,\"ops_per_sec\":%.0f,\"profile\":\"%s\"}\n",
                   sysname, f, t1 - t0, f / (t1 - t0 > 0 ? t1 - t0 : 1e-9),
                   st.opcount / (t1 - t0 > 0 ? t1 - t0 : 1e-9),
                   has_profile ? profile_path : "-");
        fb_free(&st.fb);
    }
    else if (!strcmp(sysname, "gb")) {
        gb g;
        double target_fps = 0;
        int frameskip = 1;
        long f;
        gb_init(&g);
        if (gb_load_rom(&g, rom, rom_len) != 0) { fprintf(stderr, "novaemu: ROM inválida (0 < size <= 32KB)\n"); return 2; }
        if (has_profile) {
            frameskip = nova_profile_get_int(&prof, "frameskip", 1);
            target_fps = nova_profile_get_int(&prof, "target_fps", 0);
        }
        t0 = nova_now();
        for (f = 0; f < frames; f++) {
            gb_run_frame(&g);
            if (tty_every && (f % (tty_every * frameskip) == 0)) { printf("--- frame %ld ---\n", f); print_tty(&g.fb); }
            if (detect_serial && g.serial_len) {
                g.serial[g.serial_len] = 0;
                if (strstr(g.serial, "Passed") || strstr(g.serial, "Failed")) break;
            }
            if (max_cycles && g.cycles > (u64)max_cycles) break;
            pacing(target_fps, t0, (double)f);
        }
        t1 = nova_now();
        if (want_ppm) fb_write_ppm(&g.fb, ppm_path);
        if (want_hash) printf("hash=%016llx\n", (unsigned long long)fb_hash(&g.fb));
        if (want_serial) { g.serial[g.serial_len] = 0; fputs(g.serial, stdout); putchar('\n'); }
        if (bench)
            printf("{\"system\":\"gb\",\"frames\":%ld,\"seconds\":%.3f,\"fps\":%.0f,\"cycles_per_sec\":%.1f,\"profile\":\"%s\"}\n",
                   f, t1 - t0, f / (t1 - t0 > 0 ? t1 - t0 : 1e-9),
                   (double)g.cycles / (t1 - t0 > 0 ? t1 - t0 : 1e-9),
                   has_profile ? profile_path : "-");
        fb_free(&g.fb);
    }
    else { fprintf(stderr, "novaemu: sistema '%s' no soportado (chip8|schip|gb)\n", sysname); free(rom); return 2; }

    free(rom);
    return 0;
}
