/* NovaEmu - núcleo CHIP-8 / S-CHIP
 * Patrón adoptado: perfiles de quirks por programa (RPCS3 per-game config,
 * Xenia <título>.config.toml → aquí c8_quirks + presets + .conf).
 */
#ifndef NOVA_CHIP8_H
#define NOVA_CHIP8_H

#include "../common/nova.h"

typedef enum { C8_SYS_CHIP8 = 0, C8_SYS_SCHIP = 1 } c8_sys;

typedef struct {
    int vf_reset_alu;   /* 8XY1/2/3 ponen VF=0 (COSMAC VIP)            */
    int shift_vx;       /* 8XY6/E desplazan VX (VIP) en vez de VY      */
    int loadstore_incr; /* FX55/FX65 incrementan I                     */
    int clip_sprites;   /* recorte en bordes (VIP) vs wrap (SCHIP)     */
    int i_overflow_vf;  /* FX1E activa VF si I > 0xFFF                 */
    int jump_bxnn;      /* BNNN = salto a NNN (XO-Chip) vs V0+NNN      */
    int dxy1_schip;     /* en S-CHIP, DXY1 dibuja 16 filas de 8 px     */
} c8_quirks;

typedef struct {
    c8_sys sys;
    c8_quirks q;
    u8 mem[0x10000];      /* CHIP-8 usa 4 KB; 64 KB permite carga plana */
    u8 v[16];
    u16 i, pc, sp;
    u16 stack[16];
    u8 dt, st;
    u8 keys[16];          /* bit=1 pulsada */
    int wait_key;         /* FX0A bloqueado: índice Vx, -1 si no */
    u8 rpl[8];            /* registros RPL de S-CHIP (FX75/FX85) */
    fb_t fb;
    u32 rng;              /* xorshift32 semilla fija → determinismo */
    u64 opcount;
    int extended;         /* S-CHIP: pantalla 128x64 activa */
    int exited;           /* opcode 00FD (exit) */
    int screen_w, screen_h;
} c8_state;

void c8_init(c8_state *s, c8_sys sys, const c8_quirks *q);
int  c8_load_rom(c8_state *s, const u8 *rom, size_t len);
void c8_key(c8_state *s, int k, int down);
void c8_tick_timers(c8_state *s);      /* 60 Hz */
void c8_step(c8_state *s);             /* 1 instrucción */

/* Presets de quirks (documentados en docs/ARCHITECTURA.md). */
void c8_quirks_vip(c8_quirks *q);            /* COSMAC VIP original   */
void c8_quirks_schip_modern(c8_quirks *q);   /* S-CHIP 1.1 moderno    */
void c8_quirks_from_profile(c8_quirks *q, const nova_profile *p);

#endif
