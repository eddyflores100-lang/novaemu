/* NovaEmu v1.0 - capa común
 * Zero-dependency C99. Tipos, framebuffer, hashing determinista, perfiles.
 * Técnica adoptada (shadPS4/tests): disciplina de golden tests → fb_hash().
 */
#ifndef NOVA_H
#define NOVA_H

#include <stdint.h>
#include <stddef.h>

typedef uint8_t  u8;
typedef uint16_t u16;
typedef uint32_t u32;
typedef uint64_t u64;
typedef int8_t   s8;
typedef int16_t  s16;
typedef int32_t  s32;
typedef int64_t  s64;

/* ------------------------------------------------------------------ *
 * Framebuffer: "shade" 0=luz ... 3=oscuro (estilo Game Boy DMG).
 * CHIP-8 usa 0 (apagado) y 3 (encendido). PPM aplica LUT de grises.
 * ------------------------------------------------------------------ */
typedef struct {
    int w, h;
    u8 *px;
} fb_t;

int  fb_init(fb_t *f, int w, int h);
void fb_free(fb_t *f);
void fb_clear(fb_t *f, u8 shade);
static inline u8 fb_get(const fb_t *f, int x, int y) { return f->px[(size_t)y * f->w + x]; }
static inline void fb_set(fb_t *f, int x, int y, u8 c) { f->px[(size_t)y * f->w + x] = c; }
u64  fnv1a64(const void *data, size_t len);
u64  fb_hash(const fb_t *f);
int  fb_write_ppm(const fb_t *f, const char *path);

/* ------------------------------------------------------------------ *
 * Perfiles key=value (patrón per-game config de RPCS3/Xenia).
 * Líneas "clave=valor", '#' inicia comentario, líneas vacías ignoradas.
 * ------------------------------------------------------------------ */
#define NOVA_PROFILE_MAX 48
typedef struct { char key[40]; char val[64]; } nova_kv;
typedef struct { nova_kv kv[NOVA_PROFILE_MAX]; int n; } nova_profile;

int  nova_profile_load(nova_profile *p, const char *path);
const char *nova_profile_get(const nova_profile *p, const char *key, const char *def);
int  nova_profile_get_int(const nova_profile *p, const char *key, int def);

/* Tiempo monótono en segundos (para benchmarks). */
double nova_now(void);

#endif /* NOVA_H */
