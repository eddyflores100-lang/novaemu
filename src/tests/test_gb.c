/* NovaEmu - tests unitarios Game Boy (SM83 + bus + timer + PPU) */
#include "../gb/gb.h"
#include <string.h>
#include <stdio.h>

static int g_pass, g_fail;
static gb G;

static void ck(const char *name, int cond)
{
    if (cond) { g_pass++; printf("  PASS %s\n", name); }
    else      { g_fail++; printf("  FAIL %s\n", name); }
}

static void setup(const u8 *p, int n)
{
    gb_init(&G);
    if (p) memcpy(G.rom + 0x100, p, (size_t)n);
    G.cpu.pc = 0x100;
    G.cpu.sp = 0xFFFE;
    G.cpu.ime = 0;
}

static void run(int n) { int k; for (k = 0; k < n; k++) gb_cpu_step(&G); }

#define FZ GB_FZ
#define FN GB_FN
#define FH GB_FH
#define FC GB_FC

int test_gb_all(void)
{
    printf("gb: carga y registros\n");
    setup((u8[]){0x00}, 1);
    run(1);
    ck("nop-pc+1", G.cpu.pc == 0x101);
    setup((u8[]){0x01,0x34,0x12}, 3);
    run(1);
    ck("ld-bc-d16", G.cpu.b == 0x12 && G.cpu.c == 0x34 && G.cpu.pc == 0x103);
    setup((u8[]){0x02}, 1);
    G.cpu.a = 0x55; SET_BC(&G, 0xC100);
    run(1);
    ck("ld-(bc),a", G.wram[0x100] == 0x55);
    setup((u8[]){0x03}, 1);
    SET_BC(&G, 0x00FF);
    run(1);
    ck("inc-bc", GB_BC(&G) == 0x0100);
    setup((u8[]){0x04}, 1);
    G.cpu.b = 0x0F;
    run(1);
    ck("inc-b-flag-h", G.cpu.b == 0x10 && (G.cpu.f & FH) && !(G.cpu.f & FN));
    setup((u8[]){0x05}, 1);
    G.cpu.b = 0x0F;
    run(1);
    ck("dec-b-flag-n", G.cpu.b == 0x0E && (G.cpu.f & FN) && !(G.cpu.f & FH));
    setup((u8[]){0x06,0x99}, 2);
    run(1);
    ck("ld-b-d8", G.cpu.b == 0x99);

    printf("gb: rotaciones y acumulador\n");
    setup((u8[]){0x07}, 1);
    G.cpu.a = 0x85;
    run(1);
    ck("rlca", G.cpu.a == 0x0B && (G.cpu.f & FC) && !(G.cpu.f & (FZ|FN|FH)));
    setup((u8[]){0x17}, 1);
    G.cpu.a = 0x80; G.cpu.f = FC;
    run(1);
    ck("rla-con-carry", G.cpu.a == 0x01 && (G.cpu.f & FC));
    setup((u8[]){0x2F}, 1);
    G.cpu.a = 0x0F;
    run(1);
    ck("cpl", G.cpu.a == 0xF0 && (G.cpu.f & (FN|FH)));

    printf("gb: ALU con flags\n");
    setup((u8[]){0xC6,0x01}, 2);
    G.cpu.a = 0x0F;
    run(1);
    ck("add-half-carry", G.cpu.a == 0x10 && (G.cpu.f & FH) && !(G.cpu.f & FC));
    setup((u8[]){0xC6,0x20}, 2);
    G.cpu.a = 0xF0;
    run(1);
    ck("add-carry", G.cpu.a == 0x10 && (G.cpu.f & FC));
    setup((u8[]){0xCE,0x00}, 2);
    G.cpu.a = 0x0F; G.cpu.f = FC;
    run(1);
    ck("adc-con-carry", G.cpu.a == 0x10 && (G.cpu.f & FH));
    setup((u8[]){0xD6,0x0A}, 2);
    G.cpu.a = 5;
    run(1);
    ck("sub-prestamo", G.cpu.a == 0xFB && (G.cpu.f & (FN|FH|FC)));
    setup((u8[]){0xDE,0x01}, 2);
    G.cpu.a = 0x10; G.cpu.f = FC;
    run(1);
    ck("sbc", G.cpu.a == 0x0E && !(G.cpu.f & FC));
    setup((u8[]){0xE6,0x0E}, 2);
    G.cpu.a = 0x0F;
    run(1);
    ck("and-h", G.cpu.a == 0x0E && (G.cpu.f & FH) && !(G.cpu.f & FZ));
    setup((u8[]){0xEE,0xFF}, 2);
    G.cpu.a = 0xFF;
    run(1);
    ck("xor-cero", G.cpu.a == 0 && (G.cpu.f & FZ) && !(G.cpu.f & (FN|FH|FC)));
    setup((u8[]){0xF6,0x10}, 2);
    G.cpu.a = 0x20;
    run(1);
    ck("or", G.cpu.a == 0x30 && !(G.cpu.f & (FN|FH|FC)));
    setup((u8[]){0xFE,0x07}, 2);
    G.cpu.a = 5;
    run(1);
    ck("cp-no-modifica", G.cpu.a == 5 && (G.cpu.f & (FN|FH|FC)) && !(G.cpu.f & FZ));

    printf("gb: DAA (vectores clásicos)\n");
    setup((u8[]){0xC6,0x38, 0x27}, 3);
    G.cpu.a = 0x45;
    run(2);
    ck("daa-post-add", G.cpu.a == 0x83 && !(G.cpu.f & FC));
    setup((u8[]){0xC6,0x01, 0x27}, 3);
    G.cpu.a = 0x99;
    run(2);
    ck("daa-overflow-bcd", G.cpu.a == 0x00 && (G.cpu.f & (FC|FZ)));
    setup((u8[]){0xD6,0x01, 0x27}, 3);
    G.cpu.a = 0x00;
    run(2);
    ck("daa-post-sub", G.cpu.a == 0x99 && (G.cpu.f & FC) && !(G.cpu.f & FZ));

    printf("gb: HL y CB\n");
    setup((u8[]){0x09}, 1);
    SET_HL(&G, 0x0FFF); SET_BC(&G, 0x0001);
    run(1);
    ck("add-hl-half", GB_HL(&G) == 0x1000 && (G.cpu.f & FH));
    setup((u8[]){0x29}, 1);
    SET_HL(&G, 0x8000);
    run(1);
    ck("add-hl-hl-carry", GB_HL(&G) == 0x0000 && (G.cpu.f & FC));
    setup((u8[]){0xCB,0x37}, 2);   /* SWAP A */
    G.cpu.a = 0xAB;
    run(1);
    ck("cb-swap", G.cpu.a == 0xBA);
    setup((u8[]){0xCB,0x7F}, 2);   /* BIT 7,A */
    G.cpu.a = 0x80; G.cpu.f = FC;
    run(1);
    ck("cb-bit", !(G.cpu.f & FZ) && (G.cpu.f & FH) && (G.cpu.f & FC));
    setup((u8[]){0xCB,0xC7}, 2);   /* SET 0,A */
    G.cpu.a = 0xFE;
    run(1);
    ck("cb-set", G.cpu.a == 0xFF);
    setup((u8[]){0xCB,0x86}, 2);   /* RES 0,(HL) */
    SET_HL(&G, 0xC000); G.wram[0] = 0xFF;
    run(1);
    ck("cb-res-hl", G.wram[0] == 0xFE);
    setup((u8[]){0xCB,0x2F}, 2);   /* SRA A */
    G.cpu.a = 0x81;
    run(1);
    ck("cb-sra-signo", G.cpu.a == 0xC0 && (G.cpu.f & FC));

    printf("gb: saltos, pila, 16-bit\n");
    setup((u8[]){0x18,0x02, 0x00, 0x00, 0x60,0x01}, 6);
    run(1);
    ck("jr-fwd", G.cpu.pc == 0x104);
    setup((u8[]){0x20,0x02, 0x00, 0x00, 0x00,0x00}, 6);
    G.cpu.f = FZ;                  /* JR NZ no salta con Z=1 */
    run(1);
    ck("jr-nz-no-tomado", G.cpu.pc == 0x102);
    setup((u8[]){0xC3,0x00,0xC0}, 3);
    run(1);
    ck("jp-a16", G.cpu.pc == 0xC000);
    setup((u8[]){0xCD,0x0E,0x01}, 3);
    { u8 ret[] = {0xC9}; memcpy(G.rom + 0x10E, ret, 1); }
    run(1);
    ck("call-push", G.cpu.pc == 0x10E && G.cpu.sp == 0xFFFC && G.hram[0x7C] == 0x03 && G.hram[0x7D] == 0x01);
    run(1);
    ck("ret-pop", G.cpu.pc == 0x103 && G.cpu.sp == 0xFFFE);
    setup((u8[]){0xC5, 0xC1}, 2);
    SET_BC(&G, 0xBEEF);
    run(2);
    ck("push-pop-bc", GB_BC(&G) == 0xBEEF && G.cpu.sp == 0xFFFE);
    setup((u8[]){0xF5, 0xF1}, 2);
    G.cpu.a = 0x12; G.cpu.f = 0x13;
    run(2);
    ck("push-af-mascara-baja", G.cpu.a == 0x12 && G.cpu.f == 0x10);
    setup((u8[]){0xFF}, 1);
    run(1);
    ck("rst-38", G.cpu.pc == 0x38 && G.cpu.sp == 0xFFFC);
    setup((u8[]){0xD9}, 1);
    run(1);
    ck("reti-activa-ime", G.cpu.ime == 1);
    setup((u8[]){0xD3}, 1);        /* opcode ilegal */
    run(1);
    ck("ilegal-nop", G.cpu.pc == 0x101);
    setup((u8[]){0x08,0x00,0xC0}, 3);
    G.cpu.sp = 0x1234;
    run(1);
    ck("ld-(a16),sp", G.wram[0] == 0x34 && G.wram[1] == 0x12);
    setup((u8[]){0xE8,0x0F}, 2);
    G.cpu.sp = 0x00FF;
    run(1);
    ck("add-sp-r8-flags", G.cpu.sp == 0x010E && (G.cpu.f & (FH|FC)) && !(G.cpu.f & (FZ|FN)));
    setup((u8[]){0xF8,0x0F}, 2);
    G.cpu.sp = 0x00FF;
    run(1);
    ck("ld-hl-sp+r8", GB_HL(&G) == 0x010E && (G.cpu.f & (FH|FC)));
    setup((u8[]){0xF9}, 1);
    SET_HL(&G, 0x1234);
    run(1);
    ck("ld-sp,hl", G.cpu.sp == 0x1234);
    setup((u8[]){0xE0,0x80, 0xF0,0x80}, 4);
    G.cpu.a = 0x42;
    run(2);
    ck("ldh-a8", G.hram[0] == 0x42);
    run(1);
    ck("ldh-lectura", G.cpu.a == 0x42);
    setup((u8[]){0xE2}, 1);
    G.cpu.c = 0x80; G.cpu.a = 0x77;
    run(1);
    ck("ld-(c),a", G.hram[0] == 0x77);

    printf("gb: HALT, EI, interrupciones\n");
    setup((u8[]){0x76}, 1);
    G.ie = 0x04; G.iflag = 0x04; G.cpu.ime = 1;
    run(1);
    ck("halt-despierta-y-salta", G.cpu.pc == 0x50 && !(G.iflag & 0x04) && G.cpu.sp == 0xFFFC);
    setup((u8[]){0x76}, 1);
    run(1);
    ck("halt-sigue-parado", G.cpu.halted == 1 && G.cpu.pc == 0x101 && G.cycles >= 4);
    setup((u8[]){0xFB, 0x00, 0x00}, 3);
    G.ie = 0x01; G.iflag = 0x01; G.cpu.ime = 0;
    run(2);
    ck("ei-retraso-un-instr", G.cpu.ime == 1 && G.cpu.pc == 0x102);
    run(1);
    ck("interrupcion-vblank-vector", G.cpu.pc == 0x40 && !(G.iflag & 0x01) && G.cpu.ime == 0);

    printf("gb: timer y serial\n");
    setup(NULL, 0);
    G.tma = 0x30; G.tac = 0x05; G.tima = 0xFE;
    gb_tick_components(&G, 32);
    ck("timer-overflow-recarga", G.tima == 0x30 && (G.iflag & 0x04));
    setup(NULL, 0);
    gb_tick_components(&G, 0x200);
    ck("div-incrementa", gb_read(&G, 0xFF04) == 0x02);
    setup((u8[]){0xE0,0x01, 0x3E,0x81, 0xE0,0x02}, 6);
    G.cpu.a = 0x41;
    run(3);
    ck("serial-captura", G.serial_len == 1 && G.serial[0] == 'A' && (G.iflag & 0x08));
    setup(NULL, 0);
    { int k; for (k = 0; k < 16; k++) G.wram[0x100 + k] = (u8)(0x10 + k); }
    gb_write(&G, 0xFF46, 0xC1);
    ck("dma-oam", G.oam[0] == 0x10 && G.oam[15] == 0x1F);

    printf("gb: MBC1 y memoria\n");
    {
        static u8 bigrom[0xC000];
        int k;
        for (k = 0; k < 3; k++) bigrom[k * 0x4000 + 0x10] = (u8)(0xB0 | k);
        gb_init(&G);
        gb_load_rom(&G, bigrom, sizeof bigrom);
        ck("mbc1-detectado", G.mbc == 1);
        gb_write(&G, 0x2000, 0x02);
        ck("mbc1-banco-2", gb_read(&G, 0x4010) == 0xB2);
        ck("mbc1-banco-0-fijo", gb_read(&G, 0x0010) == 0xB0);
        gb_write(&G, 0x2000, 0x01);
        ck("mbc1-banco-1", gb_read(&G, 0x4010) == 0xB1);
    }
    setup(NULL, 0);
    gb_write(&G, 0xE123, 0x5A);
    ck("echo-ram", gb_read(&G, 0xC123) == 0x5A);
    setup(NULL, 0);
    gb_write(&G, 0xFF00, 0x10);                 /* bit5=0: selecciona botones */
    gb_key(&G, 4, 1);   /* A */
    ck("joypad-a", !(gb_read(&G, 0xFF00) & 0x01) && (G.iflag & 0x10));

    printf("gb: LD (HL),r bloque 0x70-0x77\n");
    setup((u8[]){0x73}, 1);        /* LD (HL),E */
    SET_HL(&G, 0xC100); G.cpu.e = 0x5A; G.wram[0x100] = 0x00;
    run(1);
    ck("ld-(hl),e", G.wram[0x100] == 0x5A && G.cpu.e == 0x5A);
    setup((u8[]){0x77}, 1);        /* LD (HL),A */
    SET_HL(&G, 0xC200); G.cpu.a = 0x3C; G.wram[0x200] = 0x11;
    run(1);
    ck("ld-(hl),a", G.wram[0x200] == 0x3C);
    setup((u8[]){0x7D}, 1);        /* LD A,L */
    G.cpu.l = 0x42;
    run(1);
    ck("ld-a,l", G.cpu.a == 0x42 && GB_HL(&G) == 0x0042);
    setup((u8[]){0x83}, 1);        /* ADD A,E */
    G.cpu.a = 0x10; G.cpu.e = 0x05;
    run(1);
    ck("add-a,e", G.cpu.a == 0x15);

    printf("gb: PPU render\n");
    setup(NULL, 0);
    G.vram[0x10] = 0xFF; G.vram[0x11] = 0x00;   /* tile1 fila0 */
    G.vram[0x1800] = 1;                          /* mapa[0,0] = tile1 (mapa BG en 0x1800) */
    G.bgp = 0xE4;
    gb_run_frame(&G);
    ck("ppu-frame-vblank", G.frame_flag == 1 && G.ly == 144);
    ck("ppu-ciclos-frame", G.cycles >= 65600 && G.cycles <= 65800);
    ck("bg-render-fila0", fb_get(&G.fb, 0, 0) == 1 && fb_get(&G.fb, 8, 0) == 0);
    setup(NULL, 0);
    G.lcdc |= 0x02;                             /* sprites on */
    G.vram[0x10] = 0xFF; G.vram[0x11] = 0xFF;   /* tile1: todo color 3 */
    G.vram[0x20] = 0xFF; G.vram[0x21] = 0x00;   /* tile2 fila0: color 1 */
    G.vram[0x1800] = 1;                          /* fondo tile1 (mapa en 0x1800) */
    G.oam[0] = 0x10; G.oam[1] = 0x08; G.oam[2] = 0x02; G.oam[3] = 0x00;
    G.bgp = 0xE4; G.obp0 = 0xE4;
    gb_run_frame(&G);
    ck("sprite-sobre-bg", fb_get(&G.fb, 0, 0) == 1 && fb_get(&G.fb, 8, 0) == 0);
    setup(NULL, 0);
    G.lcdc = 0x91 | 0x20;                       /* ventana on, mapa bit6=0 */
    G.wx = 7; G.wy = 0;
    G.vram[0x10] = 0xFF; G.vram[0x11] = 0x00;
    G.vram[0x1800] = 1;
    G.bgp = 0xE4;
    gb_run_frame(&G);
    ck("ventana-cubre", fb_get(&G.fb, 0, 0) == 1);
    setup(NULL, 0);
    G.lcdc = 0x91 | 0x20;
    G.wx = 20; G.wy = 0;
    G.vram[0x10] = 0xFF; G.vram[0x11] = 0x00;
    G.vram[0x1800] = 1;
    G.bgp = 0xE4;
    gb_run_frame(&G);
    ck("ventana-desde-wx", fb_get(&G.fb, 12, 0) == 0 && fb_get(&G.fb, 13, 0) == 1);

    printf("g_gb: %d PASS, %d FAIL\n", g_pass, g_fail);
    return g_fail;
}
