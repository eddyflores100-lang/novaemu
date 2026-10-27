#define _POSIX_C_SOURCE 199309L
#include "nova.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

int fb_init(fb_t *f, int w, int h)
{
    f->w = w; f->h = h;
    f->px = (u8 *)calloc((size_t)w * (size_t)h, 1);
    return f->px ? 0 : -1;
}

void fb_free(fb_t *f)
{
    free(f->px);
    f->px = NULL; f->w = f->h = 0;
}

void fb_clear(fb_t *f, u8 shade)
{
    memset(f->px, shade, (size_t)f->w * (size_t)f->h);
}

/* FNV-1a 64-bit: hash determinista del framebuffer (golden hashes de evals). */
u64 fnv1a64(const void *data, size_t len)
{
    const u8 *p = (const u8 *)data;
    u64 h = 0xcbf29ce484222325ULL;
    size_t i;
    for (i = 0; i < len; i++) {
        h ^= p[i];
        h *= 0x100000001b3ULL;
    }
    return h;
}

u64 fb_hash(const fb_t *f)
{
    return fnv1a64(f->px, (size_t)f->w * (size_t)f->h);
}

int fb_write_ppm(const fb_t *f, const char *path)
{
    static const u8 lut[4] = { 232, 160, 88, 16 }; /* shade 0..3 -> gris */
    FILE *fp = fopen(path, "wb");
    size_t n, i;
    if (!fp) return -1;
    fprintf(fp, "P6\n%d %d\n255\n", f->w, f->h);
    n = (size_t)f->w * (size_t)f->h;
    for (i = 0; i < n; i++) {
        u8 g = lut[f->px[i] & 3];
        fwrite(&g, 1, 1, fp); fwrite(&g, 1, 1, fp); fwrite(&g, 1, 1, fp);
    }
    fclose(fp);
    return 0;
}

int nova_profile_load(nova_profile *p, const char *path)
{
    FILE *fp = fopen(path, "r");
    char line[160];
    p->n = 0;
    if (!fp) return -1;
    while (fgets(line, sizeof line, fp)) {
        char *eq, *end;
        size_t klen;
        if (p->n >= NOVA_PROFILE_MAX) break;
        end = line + strlen(line);
        while (end > line && (end[-1] == '\n' || end[-1] == '\r' || end[-1] == ' ')) *--end = 0;
        eq = strchr(line, '=');
        if (!eq || eq == line) continue;
        if (line[0] == '#') continue;
        klen = (size_t)(eq - line);
        if (klen >= sizeof p->kv[0].key) klen = sizeof p->kv[0].key - 1;
        memcpy(p->kv[p->n].key, line, klen);
        p->kv[p->n].key[klen] = 0;
        snprintf(p->kv[p->n].val, sizeof p->kv[0].val, "%s", eq + 1);
        p->n++;
    }
    fclose(fp);
    return 0;
}

const char *nova_profile_get(const nova_profile *p, const char *key, const char *def)
{
    int i;
    for (i = 0; i < p->n; i++)
        if (strcmp(p->kv[i].key, key) == 0) return p->kv[i].val;
    return def;
}

int nova_profile_get_int(const nova_profile *p, const char *key, int def)
{
    const char *v = nova_profile_get(p, key, NULL);
    return v ? atoi(v) : def;
}

double nova_now(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec * 1e-9;
}
