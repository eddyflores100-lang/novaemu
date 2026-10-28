/* NovaEmu v1.0 - shim WASM (target wasm32-wasi, reactor)
 *
 * Compila los núcleos CERTIFICADOS (chip8.c + gb_*.c) sin main.c ni nova.c:
 *  - main.c usa stdio/tiempo POSIX  -> solo aplica al binario nativo.
 *  - nova.c usa stdio (ppm/perfil)  -> aquí se re-implementan las 4 funciones
 *    puras que los núcleos necesitan: fb_init, fb_clear, fnv1a64, fb_hash.
 *
 * La secuencia de ejecución replica EXACTAMENTE el bucle de src/host/main.c:
 *  CHIP-8: por frame -> ips x c8_step() (si !exited) + c8_tick_timers()
 *  GB    : por frame -> gb_run_frame()
 * De este modo los golden hashes nativos (NE-E003/E004) deben reproducirse
 * bit a bit también en WASM: mismo motor, misma verificación.
 *
 * Allocator: bump sobre __heap_base (fb_init se llama una vez por init/reset;
 * la fuga por reset es del tamaño del framebuffer, ~8-23 KB, aceptable en web).
 */

#include "../../common/nova.h"
#include "../../chip8/chip8.h"
#include "../../gb/gb.h"
#include <stdint.h>
#include <stddef.h>

#define EXP(name) __attribute__((export_name(name)))

/* ------------------------------------------------------------------
 * Allocator bump (sustituye a calloc de libc para fb_init)
 * ------------------------------------------------------------------ */
extern unsigned char __heap_base[];
static unsigned char *heap_ptr = NULL;

/* Bump allocator con memory.grow: si la reserva excede la memoria lineal
 * actual, crece. Devuelve NULL si no hay memoria. */
static void *bump(size_t n)
{
    if (!heap_ptr) heap_ptr = __heap_base;
    uintptr_t p = ((uintptr_t)heap_ptr + 15u) & ~(uintptr_t)15u;
    uintptr_t end = p + (n ? n : 1u);
    uintptr_t mem_end = (uintptr_t)__builtin_wasm_memory_size(0) << 16;
    if (end > mem_end) {
        uintptr_t diff = (end - mem_end + 65535u) & ~(uintptr_t)65535u;
        if (__builtin_wasm_memory_grow(0, (u32)(diff >> 16)) == (u32)-1)
            return NULL;
    }
    heap_ptr = (unsigned char *)end;
    return (void *)p;
}

/* El host JS aloja aquí las ROM (nueva página si hace falta). Escribir al
 * techo de la memoria NO es seguro: wasi-ld puede colocar el stack arriba. */
EXP("nova_alloc") u32 nova_alloc(u32 n)
{
    return (u32)(uintptr_t)bump(n ? (size_t)n : 1u);
}

/* fb_clear a -O1 podría emitir llamada a memset: definida en mem_ops.c, OK. */

/* ------------------------------------------------------------------ *
 * Capa común re-implementada (equivalente literal a nova.c)
 * ------------------------------------------------------------------ */
int fb_init(fb_t *f, int w, int h)
{
    size_t n = (size_t)w * (size_t)h;
    f->w = w; f->h = h;
    f->px = (u8 *)bump(n);
    if (!f->px) return -1;
    {
        /* cero explícito sin depender de que clang plegue el bucle */
        size_t i;
        for (i = 0; i < n; i++) f->px[i] = 0;
    }
    return 0;
}

void fb_clear(fb_t *f, u8 shade)
{
    size_t n = (size_t)f->w * (size_t)f->h;
    size_t i;
    for (i = 0; i < n; i++) f->px[i] = shade;
}

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

/* fb_free se usa en fb_resize() (transición 64x32 <-> 128x64 de S-CHIP).
 * El bump no libera: basta con invalidar; fb_init() asigna un bloque nuevo.
 * El host JS re-lee el puntero del framebuffer cada frame, así que el cambio
 * de dirección es transparente. */
void fb_free(fb_t *f)
{
    f->px = NULL; f->w = 0; f->h = 0;
}

/* ------------------------------------------------------------------ *
 * Estado global (una instancia por núcleo; el host JS elige)
 * ------------------------------------------------------------------ */
static c8_state g_c8;
static gb       g_gb;
static int      g_c8_sys = 0;



/* ------------------------------------------------------------------ *
 * CHIP-8 / S-CHIP
 * ------------------------------------------------------------------ */
EXP("nova_abi")       u32 nova_abi(void) { return 100u; }

EXP("c8w_init")       u32 c8w_init(u32 sys, u32 preset)
{
    c8_quirks q;
    if (preset == 1u) c8_quirks_schip_modern(&q);
    else              c8_quirks_vip(&q);
    g_c8_sys = (int)(sys & 1u);
    c8_init(&g_c8, g_c8_sys ? C8_SYS_SCHIP : C8_SYS_CHIP8, &q);
    return 0u;
}

EXP("c8w_set_quirk")  u32 c8w_set_quirk(u32 idx, u32 v)
{
    int b = (v != 0u);
    switch (idx) {
    case 0: g_c8.q.vf_reset_alu   = b; return 0u;
    case 1: g_c8.q.shift_vx       = b; return 0u;
    case 2: g_c8.q.loadstore_incr = b; return 0u;
    case 3: g_c8.q.clip_sprites   = b; return 0u;
    case 4: g_c8.q.i_overflow_vf  = b; return 0u;
    case 5: g_c8.q.jump_bxnn      = b; return 0u;
    case 6: g_c8.q.dxy1_schip     = b; return 0u;
    default: return 1u;
    }
}

EXP("c8w_get_quirk")  u32 c8w_get_quirk(u32 idx)
{
    switch (idx) {
    case 0: return (u32)g_c8.q.vf_reset_alu;
    case 1: return (u32)g_c8.q.shift_vx;
    case 2: return (u32)g_c8.q.loadstore_incr;
    case 3: return (u32)g_c8.q.clip_sprites;
    case 4: return (u32)g_c8.q.i_overflow_vf;
    case 5: return (u32)g_c8.q.jump_bxnn;
    case 6: return (u32)g_c8.q.dxy1_schip;
    default: return 0u;
    }
}

EXP("c8w_load")       u32 c8w_load(u32 ptr, u32 len)
{
    return (u32)c8_load_rom(&g_c8, (const u8 *)(uintptr_t)ptr, (size_t)len);
}

EXP("c8w_key")        void c8w_key(u32 k, u32 down) { c8_key(&g_c8, (int)k, (int)down); }

/* Bucle de frame idéntico a main.c (ips instrucciones + timers 60 Hz). */
EXP("c8w_frame")      u32 c8w_frame(u32 ips)
{
    u32 k;
    for (k = 0u; k < ips && !g_c8.exited; k++) c8_step(&g_c8);
    c8_tick_timers(&g_c8);
    return (u32)g_c8.exited;
}

EXP("c8w_step")       void c8w_step(void) { if (!g_c8.exited) c8_step(&g_c8); }
EXP("c8w_timers")     void c8w_timers(void) { c8_tick_timers(&g_c8); }
EXP("c8w_exited")     u32  c8w_exited(void)  { return (u32)g_c8.exited; }
EXP("c8w_wait_key")   u32  c8w_wait_key(void) { return (u32)g_c8.wait_key; }
EXP("c8w_extended")   u32  c8w_extended(void){ return (u32)g_c8.extended; }
EXP("c8w_fb")         u32  c8w_fb(void)      { return (u32)(uintptr_t)g_c8.fb.px; }
EXP("c8w_fb_w")       u32  c8w_fb_w(void)    { return (u32)g_c8.fb.w; }
EXP("c8w_fb_h")       u32  c8w_fb_h(void)    { return (u32)g_c8.fb.h; }
EXP("c8w_hash_lo")    u32  c8w_hash_lo(void) { u64 h = fb_hash(&g_c8.fb); return (u32)h; }
EXP("c8w_hash_hi")    u32  c8w_hash_hi(void) { u64 h = fb_hash(&g_c8.fb); return (u32)(h >> 32); }
EXP("c8w_ops_lo")     u32  c8w_ops_lo(void)  { return (u32)g_c8.opcount; }
EXP("c8w_ops_hi")     u32  c8w_ops_hi(void)  { return (u32)(g_c8.opcount >> 32); }

/* ------------------------------------------------------------------ *
 * Exportaciones aditivas v1.1 (no alteran la ejecución: los goldens
 * NE-E003/E004 se mantienen bit a bit).
 *   c8w_st/c8w_dt  → timer de sonido/retraso (buzzer WebAudio)
 *   c8w_snap*      → snapshot/restore del estado CHIP-8 (save states)
 * Formato del snapshot (little-endian):
 *   u32 magic 'NCS1' | u32 sys | u32 screen_w | u32 screen_h
 *   u8 quirks[7] | u8 extended | u8 exited | i32 wait_key
 *   u8 v[16] | u8 dt | u8 st | u8 keys[16] | u8 rpl[8]
 *   u16 i,pc,sp | u16 stack[16] | u32 rng | u64 opcount
 *   u8 mem[0x1000] | u32 fb_w | u32 fb_h | u8 px[fb_w*fb_h]
 * ------------------------------------------------------------------ */
#define NCS1_MAGIC 0x3148534Eu  /* "NSH1" little-endian: N,S,1 de NovaSnap */
#define NCS1_SIZE  (4*4 + 7 + 2 + 4 + 16 + 1 + 1 + 16 + 8 + 2*3 + 2*16 + 4 + 8 + 0x1000 + 4 + 4)
/* nota: los u16 se escriben alineados de 2 en 2 sobre el flujo */

static u32 ncs1_off = 0;
static u8 *ncs1_buf = NULL;

static void ncs1_put8(u8 v)  { ncs1_buf[ncs1_off++] = v; }
static void ncs1_put16(u16 v){ ncs1_put8((u8)v); ncs1_put8((u8)(v >> 8)); }
static void ncs1_put32(u32 v){ ncs1_put16((u16)v); ncs1_put16((u16)(v >> 16)); }
static void ncs1_put64(u64 v){ ncs1_put32((u32)v); ncs1_put32((u32)(v >> 32)); }
static u8   ncs1_get8(void)  { return ncs1_buf[ncs1_off++]; }
static u16  ncs1_get16(void) { u8 a = ncs1_get8(); return (u16)(a | ((u16)ncs1_get8() << 8)); }
static u32  ncs1_get32(void) { u16 a = ncs1_get16(); return (u32)a | ((u32)ncs1_get16() << 16); }
static u64  ncs1_get64(void) { u32 a = ncs1_get32(); return (u64)a | ((u64)ncs1_get32() << 32); }

EXP("c8w_st")         u32  c8w_st(void)     { return (u32)g_c8.st; }
EXP("c8w_dt")         u32  c8w_dt(void)     { return (u32)g_c8.dt; }

EXP("c8w_snap_size")  u32  c8w_snap_size(void)
{
    size_t px = (size_t)g_c8.fb.w * (size_t)g_c8.fb.h;
    return (u32)(NCS1_SIZE + px);
}

EXP("c8w_snap")       u32  c8w_snap(u32 ptr)
{
    ncs1_buf = (u8 *)(uintptr_t)ptr;
    ncs1_off = 0;
    ncs1_put32(NCS1_MAGIC);
    ncs1_put32((u32)g_c8.sys);
    ncs1_put32((u32)g_c8.screen_w);
    ncs1_put32((u32)g_c8.screen_h);
    ncs1_put8((u8)g_c8.q.vf_reset_alu);
    ncs1_put8((u8)g_c8.q.shift_vx);
    ncs1_put8((u8)g_c8.q.loadstore_incr);
    ncs1_put8((u8)g_c8.q.clip_sprites);
    ncs1_put8((u8)g_c8.q.i_overflow_vf);
    ncs1_put8((u8)g_c8.q.jump_bxnn);
    ncs1_put8((u8)g_c8.q.dxy1_schip);
    ncs1_put8((u8)g_c8.extended);
    ncs1_put8((u8)g_c8.exited);
    ncs1_put32((u32)g_c8.wait_key);
    for (int k = 0; k < 16; k++) ncs1_put8(g_c8.v[k]);
    ncs1_put8(g_c8.dt);
    ncs1_put8(g_c8.st);
    for (int k = 0; k < 16; k++) ncs1_put8(g_c8.keys[k]);
    for (int k = 0; k < 8; k++)  ncs1_put8(g_c8.rpl[k]);
    ncs1_put16(g_c8.i);
    ncs1_put16(g_c8.pc);
    ncs1_put16(g_c8.sp);
    for (int k = 0; k < 16; k++) ncs1_put16(g_c8.stack[k]);
    ncs1_put32(g_c8.rng);
    ncs1_put64(g_c8.opcount);
    for (int k = 0; k < 0x1000; k++) ncs1_put8(g_c8.mem[k]);
    ncs1_put32((u32)g_c8.fb.w);
    ncs1_put32((u32)g_c8.fb.h);
    {
        size_t n = (size_t)g_c8.fb.w * (size_t)g_c8.fb.h;
        for (size_t k = 0; k < n; k++) ncs1_put8(g_c8.fb.px[k]);
    }
    return (u32)ncs1_off;
}

EXP("c8w_restore")    u32  c8w_restore(u32 ptr)
{
    ncs1_buf = (u8 *)(uintptr_t)ptr;
    ncs1_off = 0;
    if (ncs1_get32() != NCS1_MAGIC) return 1u;
    u32 sys = ncs1_get32();
    u32 sw = ncs1_get32();
    u32 sh = ncs1_get32();
    g_c8.sys = (c8_sys)sys;
    g_c8.q.vf_reset_alu   = ncs1_get8();
    g_c8.q.shift_vx       = ncs1_get8();
    g_c8.q.loadstore_incr = ncs1_get8();
    g_c8.q.clip_sprites   = ncs1_get8();
    g_c8.q.i_overflow_vf  = ncs1_get8();
    g_c8.q.jump_bxnn      = ncs1_get8();
    g_c8.q.dxy1_schip     = ncs1_get8();
    g_c8.extended = (int)ncs1_get8();
    g_c8.exited   = (int)ncs1_get8();
    g_c8.wait_key = (int)ncs1_get32();
    for (int k = 0; k < 16; k++) g_c8.v[k] = ncs1_get8();
    g_c8.dt = ncs1_get8();
    g_c8.st = ncs1_get8();
    for (int k = 0; k < 16; k++) g_c8.keys[k] = ncs1_get8();
    for (int k = 0; k < 8; k++)  g_c8.rpl[k] = ncs1_get8();
    g_c8.i  = ncs1_get16();
    g_c8.pc = ncs1_get16();
    g_c8.sp = ncs1_get16();
    for (int k = 0; k < 16; k++) g_c8.stack[k] = ncs1_get16();
    g_c8.rng     = ncs1_get32();
    g_c8.opcount = ncs1_get64();
    for (int k = 0; k < 0x1000; k++) g_c8.mem[k] = ncs1_get8();
    u32 fw = ncs1_get32();
    u32 fh = ncs1_get32();
    if ((int)fw != g_c8.fb.w || (int)fh != g_c8.fb.h) {
        fb_init(&g_c8.fb, (int)fw, (int)fh);
        g_c8.screen_w = (int)fw;
        g_c8.screen_h = (int)fh;
    }
    {
        size_t n = (size_t)fw * (size_t)fh;
        for (size_t k = 0; k < n; k++) g_c8.fb.px[k] = ncs1_get8();
    }
    return 0u;
}

/* ------------------------------------------------------------------ *
 * Game Boy DMG
 * ------------------------------------------------------------------ */
EXP("gbw_init")       u32 gbw_init(void) { gb_init(&g_gb); return 0u; }
EXP("gbw_load")       u32 gbw_load(u32 ptr, u32 len)
{
    return (u32)gb_load_rom(&g_gb, (const u8 *)(uintptr_t)ptr, (size_t)len);
}
EXP("gbw_key")        void gbw_key(u32 b, u32 down) { gb_key(&g_gb, (int)b, (int)down); }
EXP("gbw_frame")      u32 gbw_frame(void) { return (u32)gb_run_frame(&g_gb); }
EXP("gbw_fb")         u32 gbw_fb(void)    { return (u32)(uintptr_t)g_gb.fb.px; }
EXP("gbw_fb_w")       u32 gbw_fb_w(void)  { return (u32)g_gb.fb.w; }
EXP("gbw_fb_h")       u32 gbw_fb_h(void)  { return (u32)g_gb.fb.h; }
EXP("gbw_hash_lo")    u32 gbw_hash_lo(void) { u64 h = fb_hash(&g_gb.fb); return (u32)h; }
EXP("gbw_hash_hi")    u32 gbw_hash_hi(void) { u64 h = fb_hash(&g_gb.fb); return (u32)(h >> 32); }
EXP("gbw_cycles_lo")  u32 gbw_cycles_lo(void) { return (u32)g_gb.cycles; }
EXP("gbw_cycles_hi")  u32 gbw_cycles_hi(void) { return (u32)(g_gb.cycles >> 32); }
EXP("gbw_serial_ptr") u32 gbw_serial_ptr(void){ return (u32)(uintptr_t)g_gb.serial; }
EXP("gbw_serial_len") u32 gbw_serial_len(void){ return (u32)g_gb.serial_len; }
EXP("gbw_ly")         u32 gbw_ly(void)        { return (u32)g_gb.ly; }

/* --- exports de depuración (bisecado nativo vs wasm) --- */
EXP("dbg_pc")      u32 dbg_pc(void)     { return (u32)g_gb.cpu.pc; }
EXP("dbg_sp")      u32 dbg_sp(void)     { return (u32)g_gb.cpu.sp; }
EXP("dbg_af")      u32 dbg_af(void)     { return (u32)((g_gb.cpu.a << 8) | g_gb.cpu.f); }
EXP("dbg_bc")      u32 dbg_bc(void)     { return (u32)GB_BC(&g_gb); }
EXP("dbg_de")      u32 dbg_de(void)     { return (u32)GB_DE(&g_gb); }
EXP("dbg_hl")      u32 dbg_hl(void)     { return (u32)GB_HL(&g_gb); }
EXP("dbg_ime")     u32 dbg_ime(void)    { return (u32)g_gb.cpu.ime; }
EXP("dbg_halted")  u32 dbg_halted(void) { return (u32)g_gb.cpu.halted; }
EXP("dbg_if")      u32 dbg_if(void)     { return (u32)g_gb.iflag; }
EXP("dbg_ie")      u32 dbg_ie(void)     { return (u32)g_gb.ie; }
EXP("dbg_tima")    u32 dbg_tima(void)   { return (u32)g_gb.tima; }
EXP("dbg_tma")     u32 dbg_tma(void)    { return (u32)g_gb.tma; }
EXP("dbg_tac")     u32 dbg_tac(void)    { return (u32)g_gb.tac; }
EXP("dbg_div")     u32 dbg_div(void)    { return (u32)(g_gb.div_counter >> 8); }
EXP("dbg_lcdc")    u32 dbg_lcdc(void)   { return (u32)g_gb.lcdc; }
EXP("dbg_stat")    u32 dbg_stat(void)   { return (u32)g_gb.stat; }
EXP("dbg_ly")      u32 dbg_ly(void)     { return (u32)g_gb.ly; }
EXP("dbg_cycles_lo") u32 dbg_cycles_lo(void) { return (u32)g_gb.cycles; }
EXP("dbg_serial_len") u32 dbg_serial_len(void) { return (u32)g_gb.serial_len; }
EXP("dbg_instr")   u32 dbg_instr(void)  { return (u32)gb_cpu_step(&g_gb); }
