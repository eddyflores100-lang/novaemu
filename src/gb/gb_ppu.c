/* NovaEmu - PPU Game Boy DMG: máquina de modos + render scanline.
 * Render en la transición a modo 3 (patrón "render at mode 3", igual que
 * los emuladores de referencia); fondo + ventana + sprites con prioridad.
 */
#include "gb.h"
#include <string.h>

#define MODE_HBLANK 0
#define MODE_VBLANK 1
#define MODE_OAM    2
#define MODE_VRAM   3

static u8 vram_read(const gb *g, u16 a)
{
    u32 idx = (u32)a - 0x8000u;
    return idx < 0x2000u ? g->vram[idx] : 0;
}

/* color index 0..3 (sin paleta) del pixel (x,y) del fondo/ventana.
 * map: OFFSET del tilemap dentro de VRAM (0x1800 o 0x1C00), no dirección 0x8000+. */
static u8 bg_pixel(const gb *g, int x, int y, u16 map)
{
    u16 tile_base = (g->lcdc & 0x10) ? 0x8000 : 0x8800;
    int tx = (x / 8) & 31, ty = (y / 8) & 31;
    u8 tile = g->vram[(map + ty * 32 + tx) & 0x1FFF];
    u16 addr;
    int row, bit, lo, hi;
    if (tile_base == 0x8000) addr = (u16)(0x8000 + tile * 16);
    else                     addr = (u16)(0x8800 + (int)(s8)tile * 16);
    row = (y & 7) * 2;
    bit = 7 - (x & 7);
    lo = (vram_read(g, (u16)(addr + row))     >> bit) & 1;
    hi = (vram_read(g, (u16)(addr + row + 1)) >> bit) & 1;
    return (u8)((hi << 1) | lo);
}

static void render_line(gb *g, int ly)
{
    u8 row[160];
    u8 raw[160];
    int x;
    int window_active = (g->lcdc & 0x20) && (ly >= g->wy) && (g->wx < 167);
    int wl = g->win_line;

    for (x = 0; x < 160; x++) {
        u8 ci;
        int use_window = window_active && (x + 7) >= g->wx;
        if (!(g->lcdc & 0x01)) { raw[x] = 0; row[x] = 0; continue; }
        if (use_window) {
            u16 wmap = (g->lcdc & 0x40) ? 0x1C00 : 0x1800;
            ci = bg_pixel(g, x - (g->wx - 7), wl, wmap);
        } else {
            u16 bmap = (g->lcdc & 0x08) ? 0x1C00 : 0x1800;
            ci = bg_pixel(g, (x + g->scx) & 0xFF, (ly + g->scy) & 0xFF, bmap);
        }
        raw[x] = ci;
        row[x] = (g->bgp >> (ci * 2)) & 3;
    }
    if (window_active) g->win_line = (u8)(wl + 1);

    /* sprites */
    if (g->lcdc & 0x02) {
        int h = (g->lcdc & 0x04) ? 16 : 8;
        int drawn = 0, k;
        u8 sp_row[160];
        memset(sp_row, 0xFF, sizeof sp_row); /* 0xFF = sin sprite */
        for (k = 0; k < 40 && drawn < 10; k++) {
            const u8 *o = &g->oam[k * 4];
            int sy = o[0] - 16, sx = o[1] - 8;
            int ly_ = ly - sy;
            int y2, col;
            u8 tile = o[2], attr = o[3];
            u16 addr;
            u8 lo, hi, pal;
            if (ly_ < 0 || ly_ >= h) continue;
            drawn++;
            y2 = (attr & 0x40) ? (h - 1 - ly_) : ly_;
            addr = (u16)(0x8000 + tile * 16 + y2 * 2);
            lo = vram_read(g, addr);
            hi = vram_read(g, (u16)(addr + 1));
            pal = (attr & 0x10) ? g->obp1 : g->obp0;
            for (col = 0; col < 8; col++) {
                int bit = (attr & 0x20) ? col : 7 - col;
                u8 ci2 = (u8)((((hi >> bit) & 1) << 1) | ((lo >> bit) & 1));
                int px = sx + col;
                u8 shade;
                if (px < 0 || px >= 160 || ci2 == 0) continue;
                if (sp_row[px] != 0xFF) continue;      /* sprite más prioritario */
                if ((attr & 0x80) && raw[px] != 0) continue; /* detrás del bg */
                shade = (u8)((pal >> (ci2 * 2)) & 3);
                sp_row[px] = shade;
            }
        }
        for (x = 0; x < 160; x++)
            if (sp_row[x] != 0xFF) row[x] = sp_row[x];
    }

    for (x = 0; x < 160; x++) fb_set(&g->fb, x, ly, row[x]);
}

void gb_ppu_tick(gb *g, u32 cycles)
{
    if (!g->lcd_on) return;
    g->dots += cycles;

    if (g->ly < 144) {
        if (g->mode == MODE_OAM && g->dots >= 80) {
            g->mode = MODE_VRAM;
        } else if (g->mode == MODE_VRAM && g->dots >= 252) {
            render_line(g, g->ly);
            g->mode = MODE_HBLANK;
            if (g->stat & 0x08) g->iflag |= 0x02;
        }
    }
    if (g->dots >= 456) {
        g->dots -= 456;
        g->ly++;
        if (g->ly > 153) g->ly = 0;
        if (g->ly == 144) {
            g->mode = MODE_VBLANK;
            g->iflag |= 0x01;
            g->frame_flag = 1;
            if (g->stat & 0x10) g->iflag |= 0x02;
        } else {
            g->mode = MODE_OAM;
            if (g->ly == 0) g->win_line = 0;
            if (g->stat & 0x20) g->iflag |= 0x02;
        }
        if ((g->stat & 0x40) && g->ly == g->lyc) g->iflag |= 0x02;
    }
}
