/* NovaEmu - generador de ROMs demo deterministas (zero input).
 * Escribe ROMs CHIP-8/S-CHIP sintetizadas byte a byte para que cualquier
 * usuario pueda ejecutar algo real sin descargar nada.
 */
#include <stdio.h>
#include <string.h>
#include <stdint.h>

typedef uint8_t u8;

static void write_rom(const char *path, const u8 *data, int len)
{
    FILE *fp = fopen(path, "wb");
    if (!fp) { perror(path); return; }
    fwrite(data, 1, (size_t)len, fp);
    fclose(fp);
    printf("escrito %s (%d bytes)\n", path, len);
}

int main(int argc, char **argv)
{
    char path[512];
    const char *dir = (argc > 1) ? argv[1] : "tests/roms/gen";

    /* 1) chip8_bounce.ch8: pelota rebotando (auto, determinista) */
    static const u8 bounce[0x30] = {
        0x64,0x08,             /* 200: V4 = 8  (x)         */
        0x65,0x08,             /* 202: V5 = 8  (y)         */
        0x66,0x02,             /* 204: V6 = 2  (dx)        */
        0x67,0x01,             /* 206: V7 = 1  (dy)        */
        0xA2,0xF0,             /* 208: I  = sprite         */
        0x00,0xE0,             /* 20A: cls                 */
        0xD4,0x56,             /* 20C: draw V4,V5 x6       */
        0x84,0x64,             /* 20E: V4 += V6            */
        0x85,0x74,             /* 210: V5 += V7            */
        0x44,0x00, 0x66,0x02,  /* 212: si V4==0 -> dx=+2   */
        0x44,0x38, 0x66,0xFE,  /* 216: si V4==0x38 -> dx=-2*/
        0x45,0x00, 0x67,0x01,  /* 21A: si V5==0 -> dy=+1   */
        0x45,0x1A, 0x67,0xFF,  /* 21E: si V5==0x1A -> dy=-1*/
        0x12,0x0A              /* 222: jp 20A              */
    };
    static const u8 ball6[6] = { 0x18,0x3C,0x7E,0x7E,0x3C,0x18 };
    /* La ROM se carga en memoria 0x200 → offset fichero = memoria - 0x200.
     * Programa en offset 0 (mem 0x200), sprite en offset 0xF0 (mem 0x2F0). */
    u8 rom1[0x200];
    memset(rom1, 0, sizeof rom1);
    memcpy(rom1, bounce, sizeof bounce);
    memcpy(rom1 + 0x0F0, ball6, sizeof ball6);
    snprintf(path, sizeof path, "%s/chip8_bounce.ch8", dir);
    write_rom(path, rom1, (int)sizeof rom1);

    /* 2) schip_bounce.ch8: pelota 16x16 en 128x64 (S-CHIP, DXY0) */
    static const u8 bounce_s[0x30] = {
        0x64,0x08, 0x65,0x08, 0x66,0x02, 0x67,0x01, 0xA2,0xF0,
        0x00,0xE0,
        0xD4,0x50,             /* DXY0: 16x16 en modo extendido */
        0x84,0x64, 0x85,0x74,
        0x44,0x00, 0x66,0x02,
        0x44,0x70, 0x66,0xFE,  /* borde 128-16=112 */
        0x45,0x00, 0x67,0x01,
        0x45,0x30, 0x67,0xFF,  /* borde 64-16=48 */
        0x12,0x0A
    };
    static const u8 ball16[32] = {
        0x03,0xC0, 0x07,0xE0, 0x0F,0xF0, 0x1F,0xF8, 0x3F,0xFC, 0x7F,0xFE,
        0xFF,0xFF, 0xFF,0xFF, 0xFF,0xFF, 0xFF,0xFF, 0x7F,0xFE, 0x3F,0xFC,
        0x1F,0xF8, 0x0F,0xF0, 0x07,0xE0, 0x03,0xC0
    };
    u8 rom2[0x200];
    memset(rom2, 0, sizeof rom2);
    memcpy(rom2, bounce_s, sizeof bounce_s);
    memcpy(rom2 + 0x0F0, ball16, sizeof ball16);
    snprintf(path, sizeof path, "%s/schip_bounce.ch8", dir);
    write_rom(path, rom2, (int)sizeof rom2);

    /* 3) chip8_scroller.ch8: marquesina "DEADC0DE" con la fuente hex */
    static const u8 scroll[0x30] = {
        0x65,0x1C,             /* 200: V5 = 28 (y)        */
        0x66,0x00,             /* 202: V6 = 0 (offset)    */
        0x12,0x06,             /* 204: jp 206             */
        0x00,0xE0,             /* 206: cls (una vez por barrido) */
        0x62,0x00,             /* 208: V2 = 0 (índice)    */
        0xA3,0x00,             /* 20A: I = 0x300 (msg)    */
        0xF2,0x1E,             /* 20C: I += V2            */
        0xF0,0x65,             /* 20E: V0 = mem[I]        */
        0xF0,0x29,             /* 210: I = font(V0)       */
        0x82,0x40,             /* 212: V4 = V2            */
        0x84,0x44,             /* 214: V4 *= 2            */
        0x84,0x44,             /* 216: V4 *= 4            */
        0x84,0x24,             /* 218: V4 += V2  -> x6    */
        0x84,0x64,             /* 21A: V4 += V6 (offset)  */
        0xD4,0x55,             /* 21C: draw(V4,V5) 5 filas*/
        0x72,0x01,             /* 21E: V2++               */
        0x32,0x08,             /* 220: se V2==8 -> skip   */
        0x12,0x0A,             /* 222: jp 20A             */
        0x76,0x02,             /* 224: V6 += 2            */
        0x12,0x06              /* 226: jp 206             */
    };
    static const u8 msg[8] = { 0x0D,0x0E,0x0A,0x0D,0x0C,0x00,0x0D,0x0E }; /* DEADC0DE */
    /* msg "DEADC0DE" en offset 0x100 (memoria 0x300) */
    u8 rom3[0x200];
    memset(rom3, 0, sizeof rom3);
    memcpy(rom3, scroll, sizeof scroll);
    memcpy(rom3 + 0x100, msg, sizeof msg);
    snprintf(path, sizeof path, "%s/chip8_scroller.ch8", dir);
    write_rom(path, rom3, (int)sizeof rom3);

    return 0;
}
