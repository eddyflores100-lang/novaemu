/* NovaEmu Web — núcleo cliente (port vanilla JS de src/lib/nova/emulator.ts)
 *
 * El módulo ./wasm/novaemu.wasm es el MISMO código C99 que pasó los evals
 * nativos (NE-E001..E012) y la suite Blargg 12/12: compilado con zig cc
 * (wasm32-wasi, reactor) desde src/{chip8,gb,wasm}.
 * Todas las rutas son RELATIVAS para funcionar bajo https://<user>.github.io/<repo>/
 */

export const WASM_URL = "./wasm/novaemu.wasm";

/* ------------------------------------------------------------------ */
/* Paletas 4-shades (shade 0 = más claro, 3 = más oscuro)             */
/* ------------------------------------------------------------------ */
export const PALETTES = [
  { id: "dmg-green", name: "DMG clásico (verde)", colors: [[155,188,15],[139,172,15],[48,98,48],[15,56,15]] },
  { id: "dmg-grey",  name: "DMG gris (LUT nativa)", colors: [[232,232,232],[160,160,160],[88,88,88],[16,16,16]] },
  { id: "pocket",    name: "GB Pocket", colors: [[197,213,176],[139,149,109],[77,91,76],[27,32,27]] },
  { id: "phosphor",  name: "Fósforo CRT", colors: [[209,255,203],[108,235,122],[38,168,73],[6,64,22]] },
  { id: "amber",     name: "Ámbar terminal", colors: [[255,236,173],[255,195,92],[198,109,22],[63,24,4]] },
  { id: "mono",      name: "Blanco y negro", colors: [[255,255,255],[170,170,170],[85,85,85],[0,0,0]] },
];

/** LUT u32 little-endian (ABGR) para ImageData de 32 bits. */
export function paletteU32(p) {
  const lut = new Uint32Array(4);
  for (let i = 0; i < 4; i++) {
    const [r, g, b] = p.colors[i];
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return lut;
}

/* ------------------------------------------------------------------ */
/* Quirks CHIP-8 (índice = export c8w_set_quirk del wasm)             */
/* ------------------------------------------------------------------ */
export const QUIRK_LABELS = [
  { idx: 0, key: "vf_reset_alu",   desc: "8XY1/2/3 ponen VF=0 (COSMAC VIP)" },
  { idx: 1, key: "shift_vx",       desc: "8XY6/E desplazan VX en vez de VY" },
  { idx: 2, key: "loadstore_incr", desc: "FX55/FX65 incrementan I" },
  { idx: 3, key: "clip_sprites",   desc: "Recorte en bordes (VIP) vs wrap (SCHIP)" },
  { idx: 4, key: "i_overflow_vf",  desc: "FX1E activa VF si I > 0xFFF" },
  { idx: 5, key: "jump_bxnn",      desc: "BNNN salta a NNN (XO-Chip) vs V0+NNN" },
  { idx: 6, key: "dxy1_schip",     desc: "S-CHIP: DXY1 dibuja 16 filas de 8 px" },
];

/* ------------------------------------------------------------------ */
/* Teclados                                                           */
/* ------------------------------------------------------------------ */
/** Teclado CHIP-8 estándar 4x4. */
export const C8_KEYS = [
  { code: "Digit1", label: "1", k: 0x1 }, { code: "Digit2", label: "2", k: 0x2 },
  { code: "Digit3", label: "3", k: 0x3 }, { code: "Digit4", label: "C", k: 0xc },
  { code: "KeyQ",   label: "4", k: 0x4 }, { code: "KeyW",   label: "5", k: 0x5 },
  { code: "KeyE",   label: "6", k: 0x6 }, { code: "KeyR",   label: "D", k: 0xd },
  { code: "KeyA",   label: "7", k: 0x7 }, { code: "KeyS",   label: "8", k: 0x8 },
  { code: "KeyD",   label: "9", k: 0x9 }, { code: "KeyF",   label: "E", k: 0xe },
  { code: "KeyZ",   label: "A", k: 0xa }, { code: "KeyX",   label: "0", k: 0x0 },
  { code: "KeyC",   label: "B", k: 0xb }, { code: "KeyV",   label: "F", k: 0xf },
];

/** Botones GB: 0=A 1=B 2=Select 3=Start 4=Der 5=Izq 6=Arriba 7=Abajo. */
export const GB_KEYS = [
  { code: "KeyX",      label: "A",      k: 0 },
  { code: "KeyZ",      label: "B",      k: 1 },
  { code: "ShiftRight", label: "Select", k: 2 },
  { code: "ShiftLeft",  label: "Select", k: 2 },
  { code: "Enter",     label: "Start",  k: 3 },
  { code: "ArrowRight", label: "→", k: 4 },
  { code: "ArrowLeft",  label: "←", k: 5 },
  { code: "ArrowUp",    label: "↑", k: 6 },
  { code: "ArrowDown",  label: "↓", k: 7 },
];

/* ------------------------------------------------------------------ */
/* Catálogo de ROMs incluidas + goldens certificados (NE-E003/E004)   */
/* ------------------------------------------------------------------ */
export const ROM_CATALOG = [
  { id: "chip8-bounce",   name: "chip8_bounce",   system: "chip8", url: "./assets/roms/chip8_bounce.ch8",
    golden: { frames: 300, hash: "28c31cf8df2ec325" },
    note: "Demo sintetizada, determinista (RNG semilla fija 0x1EE7BEEF)" },
  { id: "chip8-scroller", name: "chip8_scroller", system: "chip8", url: "./assets/roms/chip8_scroller.ch8",
    note: "Marquesina DEADCODE con la fuente hex" },
  { id: "schip-bounce",   name: "schip_bounce",   system: "schip", url: "./assets/roms/schip_bounce.ch8",
    golden: { frames: 300, hash: "96b4fc937dc825b9" },
    note: "Pelota 16x16 en pantalla extendida 128x64" },
];

export const BLARGG_SUITE = [
  { id: "bl-01", name: "01-special",             url: "./assets/roms/blargg/blargg-01-special.gb",        maxFrames: 900 },
  { id: "bl-02", name: "02-interrupts",          url: "./assets/roms/blargg/blargg-02-interrupts.gb",     maxFrames: 900 },
  { id: "bl-03", name: "03-op sp,hl",            url: "./assets/roms/blargg/blargg-03-op-sp-hl.gb",       maxFrames: 1200 },
  { id: "bl-04", name: "04-op r,imm",            url: "./assets/roms/blargg/blargg-04-op-r-imm.gb",       maxFrames: 1200 },
  { id: "bl-05", name: "05-op rp",               url: "./assets/roms/blargg/blargg-05-op-rp.gb",          maxFrames: 1200 },
  { id: "bl-06", name: "06-ld r,r",              url: "./assets/roms/blargg/blargg-06-ld-r-r.gb",         maxFrames: 900 },
  { id: "bl-07", name: "07-jr,jp,call,ret,rst",  url: "./assets/roms/blargg/blargg-07-jr-jp-call-ret-rst.gb", maxFrames: 1200 },
  { id: "bl-08", name: "08-misc instrs",         url: "./assets/roms/blargg/blargg-08-misc-instrs.gb",    maxFrames: 1200 },
  { id: "bl-09", name: "09-op r,r",              url: "./assets/roms/blargg/blargg-09-op-r-r.gb",         maxFrames: 1200 },
  { id: "bl-10", name: "10-bit ops",             url: "./assets/roms/blargg/blargg-10-bit-ops.gb",        maxFrames: 1500 },
  { id: "bl-11", name: "11-op a,(hl)",           url: "./assets/roms/blargg/blargg-11-op-a-hl.gb",        maxFrames: 1200 },
];

export const BLARGG_FULL = { id: "bl-full", name: "cpu_instrs (completa)", url: "./assets/roms/blargg/blargg-full.gb", maxFrames: 9000 };

/* ------------------------------------------------------------------ */
/* Cliente WASM                                                       */
/* ------------------------------------------------------------------ */
export class NovaEmu {
  constructor(exports) {
    this.w = exports;
    if (typeof this.w._initialize === "function") this.w._initialize();
    this.sys = "chip8";
    this.romBytes = null;
  }

  static async load(url = WASM_URL) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar ${url}: ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mod = await WebAssembly.compile(bytes);
    // Stub automático de imports WASI: los núcleos no usan stdio/tiempo;
    // wasi-libc solo los declara. Nunca se invocan.
    const imports = {};
    for (const imp of WebAssembly.Module.imports(mod)) {
      (imports[imp.module] ??= {})[imp.name] = () => 0;
    }
    const inst = await WebAssembly.instantiate(mod, imports);
    return new NovaEmu(inst.exports);
  }

  u8() { return new Uint8Array(this.w.memory.buffer); }

  /** Reinicia el núcleo para `sys`. preset: 0=VIP, 1=S-CHIP moderno. */
  init(sys, preset = 0) {
    this.sys = sys;
    if (sys === "gb") this.w.gbw_init();
    else this.w.c8w_init(sys === "schip" ? 1 : 0, preset);
    if (this.romBytes) this.loadRom(this.romBytes);
  }

  /** Copia la ROM al heap WASM (bump allocator con memory.grow) y la carga. */
  loadRom(rom) {
    if (rom.length === 0) return false;
    const ptr = this.w.nova_alloc(rom.length);
    this.u8().set(rom, ptr);
    const rc = this.sys === "gb"
      ? this.w.gbw_load(ptr, rom.length)
      : this.w.c8w_load(ptr, rom.length);
    if (rc === 0) this.romBytes = rom.slice();
    return rc === 0;
  }

  setQuirk(idx, v) { this.w.c8w_set_quirk(idx, v ? 1 : 0); }
  getQuirk(idx)    { return this.w.c8w_get_quirk(idx) !== 0; }
  key(k, down) {
    if (this.sys === "gb") this.w.gbw_key(k, down ? 1 : 0);
    else this.w.c8w_key(k, down ? 1 : 0);
  }

  /** Ejecuta 1 frame. c8: `ips` instrucciones + timers 60 Hz (igual que el CLI). */
  frame(ips = 11) {
    return this.sys === "gb" ? this.w.gbw_frame() : this.w.c8w_frame(ips);
  }

  stepOne() { if (this.sys !== "gb") this.w.c8w_step(); }
  exited()  { return this.sys !== "gb" && this.w.c8w_exited() !== 0; }
  waitKey() { return this.sys !== "gb" ? this.w.c8w_wait_key() : -1; }
  extended(){ return this.sys !== "gb" && this.w.c8w_extended() !== 0; }
  fbPtr()   { return this.sys === "gb" ? this.w.gbw_fb() : this.w.c8w_fb(); }
  fbW()     { return this.sys === "gb" ? this.w.gbw_fb_w() : this.w.c8w_fb_w(); }
  fbH()     { return this.sys === "gb" ? this.w.gbw_fb_h() : this.w.c8w_fb_h(); }

  /** Vista directa del framebuffer en memoria lineal. */
  fb() {
    const p = this.fbPtr();
    return this.u8().subarray(p, p + this.fbW() * this.fbH());
  }

  hashHex() {
    const lo = this.sys === "gb" ? this.w.gbw_hash_lo() : this.w.c8w_hash_lo();
    const hi = this.sys === "gb" ? this.w.gbw_hash_hi() : this.w.c8w_hash_hi();
    return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
  }

  opCount() {
    const lo = this.w.c8w_ops_lo(), hi = this.w.c8w_ops_hi();
    return hi * 4294967296 + lo;
  }

  cycles() {
    const lo = this.w.gbw_cycles_lo(), hi = this.w.gbw_cycles_hi();
    return hi * 4294967296 + lo;
  }

  serial() {
    const len = this.w.gbw_serial_len();
    if (!len) return "";
    const p = this.w.gbw_serial_ptr();
    return new TextDecoder().decode(this.u8().subarray(p, p + len));
  }
}
