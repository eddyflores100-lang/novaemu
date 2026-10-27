/* NovaEmu - núcleo Game Boy DMG
 * CPU SM83 (intérprete tabulado, técnica RPCS3 #3), bus, timer, PPU scanline,
 * MBC1 mínimo, serial capturado (para suites Blargg), framebuffer 160x144.
 */
#ifndef NOVA_GB_H
#define NOVA_GB_H

#include "../common/nova.h"

typedef struct {
    u8 a, f, b, c, d, e, h, l;
    u16 sp, pc;
    int ime;        /* IME efectivo */
    int ime_delay;  /* EI tarda 1 instrucción en activarse */
    int halted;
} gb_cpu;

/* bits de F */
#define GB_FZ 0x80
#define GB_FN 0x40
#define GB_FH 0x20
#define GB_FC 0x10

/* accesos a pares de registros (públicos para tests) */
#define GB_BC(g) ((u16)(((g)->cpu.b << 8) | (g)->cpu.c))
#define GB_DE(g) ((u16)(((g)->cpu.d << 8) | (g)->cpu.e))
#define GB_HL(g) ((u16)(((g)->cpu.h << 8) | (g)->cpu.l))
#define SET_BC(g, v) do { (g)->cpu.b = (u8)((v) >> 8); (g)->cpu.c = (u8)(v); } while (0)
#define SET_DE(g, v) do { (g)->cpu.d = (u8)((v) >> 8); (g)->cpu.e = (u8)(v); } while (0)
#define SET_HL(g, v) do { (g)->cpu.h = (u8)((v) >> 8); (g)->cpu.l = (u8)(v); } while (0)

typedef struct {
    gb_cpu cpu;

    u8  rom[0x40000];       /* hasta 256 KB (16 bancos MBC1); tests usan 32 KB */
    u8  vram[0x2000];
    u8  eram[0x2000];
    u8  wram[0x2000];
    u8  oam[0xA0];
    u8  hram[0x7F];
    u8  ie;

    int mbc;                /* 0 = sin MBC, 1 = MBC1 */
    u8  rom_bank_low, bank2, mbc_mode;
    u32 rom_banks;

    /* registros IO usados */
    u8 lcdc, stat, scy, scx, wy, wx, bgp, obp0, obp1;
    u16 div_counter;        /* divisor interno 16-bit */
    u8  tima, tma, tac;
    u8  iflag;
    u8  p1;                 /* FF00: bits 4/5 de selección */
    u8  joyp_state;         /* bit=0 pulsada; 0-3 dpad, 4-7 botones */
    u8  sb, sc;
    u8  win_line;           /* contador interno de líneas de ventana */

    /* PPU */
    int mode;               /* 0 HBL,1 VBL,2 OAM,3 VRAM */
    int ly, lyc;
    u32 dots;               /* puntos dentro de la línea (0..455) */
    int lcd_on;
    fb_t fb;                /* shades 0..3 */

    /* estado */
    u64 cycles;
    int frame_flag;         /* se activa al entrar en VBlank */
    char serial[2048];
    int serial_len;
} gb;

void gb_init(gb *g);
int  gb_load_rom(gb *g, const u8 *data, size_t len);
u8   gb_read(gb *g, u16 a);
void gb_write(gb *g, u16 a, u8 v);
int  gb_cpu_step(gb *g);               /* 1 instrucción (+interrupciones); devuelve t-ciclos */
void gb_tick_components(gb *g, u32 cycles);
void gb_ppu_tick(gb *g, u32 cycles);   /* motor de modos + render scanline */
int  gb_run_frame(gb *g);              /* hasta VBlank; devuelve t-ciclos consumidos */
void gb_key(gb *g, int btn, int down); /* btn: 0=A 1=B 2=Select 3=Start 4=Der 5=Izq 6=Arriba 7=Abajo */

#endif
