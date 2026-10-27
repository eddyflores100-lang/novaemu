/* NovaEmu Web — consola interactiva (canvas, bucle rAF, entrada, telemetría).
 * Usada por index.html (modo compacto) y demo.html (modo completo).
 */
import { NovaEmu, PALETTES, paletteU32, C8_KEYS, GB_KEYS, ROM_CATALOG } from "./nova-core.js";

/* ---------------------------- Renderer ---------------------------- */
export class ScreenRenderer {
  constructor(canvas) {
    this.cv = canvas;
    this.img = null;
    this.lut = paletteU32(PALETTES[0]);
    this.paletteId = PALETTES[0].id;
    this.scanlines = false;
    this.ctx = canvas.getContext("2d");
  }
  setPalette(id) {
    const p = PALETTES.find((x) => x.id === id) ?? PALETTES[0];
    this.paletteId = p.id;
    this.lut = paletteU32(p);
    // repintar inmediato con el último fb si existe
    if (this.lastFb) this.draw(this.lastFb, this.lastW, this.lastH);
  }
  setScanlines(v) { this.scanlines = !!v; this.cv.parentElement.classList.toggle("scanlines", !!v); }
  clear() {
    if (this.ctx) this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.img = null; this.lastFb = null;
  }
  draw(fb, w, h) {
    this.lastFb = fb; this.lastW = w; this.lastH = h;
    if (!this.ctx) this.ctx = this.cv.getContext("2d");
    if (this.cv.width !== w || this.cv.height !== h || !this.img) {
      this.cv.width = w; this.cv.height = h;
      this.img = new ImageData(w, h);
    }
    const buf = new Uint32Array(this.img.data.buffer);
    const n = Math.min(fb.length, buf.length);
    for (let i = 0; i < n; i++) buf[i] = this.lut[fb[i] & 3];
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/* ---------------------------- Consola ----------------------------- */
export class ConsoleUI {
  /**
   * @param root elemento contenedor (busca[data-*] dentro)
   * @param opts { compact:boolean }
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.compact = !!opts.compact;
    this.emu = null;
    this.renderer = new ScreenRenderer(root.querySelector("[data-screen]"));
    this.playing = false;
    this.ips = 11;            // instrucciones/frame CHIP-8 (≈1000 ips a 60fps)
    this.turbo = 1;           // GB: frames por tick
    this.frames = 0;
    this.fps = 0;
    this.goldenOk = false;
    this.goldenArmed = null;  // { frames, hash }
    this.romName = "(ninguna)";
    this._raf = null;
    this._lastT = 0;
    this._acc = 0;
    this._fpsT = 0;
    this._fpsN = 0;
    this._onFrame = null;     // callback externo (test bench)
    this._bindDom();
  }

  async boot(autoRom = null) {
    this.emu = await NovaEmu.load();
    this.setStatus("WASM cargado · " + this.wasmSizeLabel());
    if (autoRom) await this.loadFromCatalog(autoRom);
    this.startLoop();
  }

  wasmSizeLabel() {
    try {
      const mod = this.emu.w.memory.buffer.byteLength;
      return (mod / 65536) + " páginas de memoria";
    } catch { return "listo"; }
  }

  _bindDom() {
    const q = (sel) => this.root.querySelector(sel);
    this.el = {
      status:   q("[data-status]"),
      play:     q("[data-play]"),
      reset:    q("[data-reset]"),
      step:     q("[data-step]"),
      frameBtn: q("[data-frame]"),
      palette:  q("[data-palette]"),
      scan:     q("[data-scan]"),
      ips:      q("[data-ips]"),
      ipsVal:   q("[data-ips-val]"),
      turbo:    q("[data-turbo]"),
      turboVal: q("[data-turbo-val]"),
      file:     q("[data-file]"),
      drop:     q("[data-drop]"),
      catalog:  q("[data-catalog]"),
      serial:   q("[data-serial]"),
      quirks:   q("[data-quirks]"),
      sysBadge: q("[data-sys]"),
      fps:      q("[data-fps]"),
      frames:   q("[data-frames]"),
      hash:     q("[data-hash]"),
      ops:      q("[data-ops]"),
      golden:   q("[data-golden]"),
      romName:  q("[data-rom-name]"),
    };

    if (this.el.play)   this.el.play.addEventListener("click", () => this.toggle());
    if (this.el.reset)  this.el.reset.addEventListener("click", () => this.resetCore());
    if (this.el.step)   this.el.step.addEventListener("click", () => { this.pause(); this.emu?.stepOne(); this.renderOnce(); });
    if (this.el.frameBtn) this.el.frameBtn.addEventListener("click", () => { this.pause(); this.tickFrame(); this.updateTelemetry(true); });
    if (this.el.palette) this.el.palette.addEventListener("change", () => this.renderer.setPalette(this.el.palette.value));
    if (this.el.scan)    this.el.scan.addEventListener("change", () => this.renderer.setScanlines(this.el.scan.checked));
    if (this.el.ips)     this.el.ips.addEventListener("input", () => { this.ips = +this.el.ips.value; if (this.el.ipsVal) this.el.ipsVal.textContent = this.ips; });
    if (this.el.turbo)   this.el.turbo.addEventListener("input", () => { this.turbo = +this.el.turbo.value; if (this.el.turboVal) this.el.turboVal.textContent = "x" + this.turbo; });

    // carga de ROM
    if (this.el.file) this.el.file.addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (f) await this.loadFile(f);
    });
    if (this.el.drop) {
      const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
      ["dragenter", "dragover"].forEach((ev) => this.el.drop.addEventListener(ev, (e) => { stop(e); this.el.drop.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => this.el.drop.addEventListener(ev, (e) => { stop(e); this.el.drop.classList.remove("drag"); }));
      this.el.drop.addEventListener("drop", async (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) await this.loadFile(f);
      });
    }
    if (this.el.catalog) this.el.catalog.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-rom]");
      if (!btn) return;
      const entry = ROM_CATALOG.find((r) => r.id === btn.dataset.rom);
      if (entry) await this.loadFromCatalog(entry);
    });

    // quirks
    if (this.el.quirks) {
      this.el.quirks.addEventListener("change", (e) => {
        const cb = e.target.closest("input[data-quirk]");
        if (cb && this.emu) this.emu.setQuirk(+cb.dataset.quirk, cb.checked);
      });
      const preset = this.el.quirks.querySelector("[data-quirk-preset]");
      if (preset) preset.addEventListener("change", () => this.applyPreset(preset.value));
    }

    this.bindKeyboard();
    this.bindTouch();
  }

  /* ------------------------- entrada ------------------------------ */
  bindKeyboard() {
    const map = {};
    C8_KEYS.forEach((x) => (map[x.code] = { k: x.k, sys: "c8", label: x.label }));
    GB_KEYS.forEach((x) => (map[x.code] = { k: x.k, sys: "gb", label: x.label }));
    const handle = (down) => (e) => {
      if (!this.emu) return;
      const m = map[e.code];
      if (!m) return;
      if (m.sys === "gb" && this.emu.sys === "gb") { this.emu.key(m.k, down); e.preventDefault(); }
      else if (m.sys === "c8" && this.emu.sys !== "gb") { this.emu.key(m.k, down); e.preventDefault(); }
      this.flashKey(m.label, down, m.sys);
    };
    window.addEventListener("keydown", handle(true));
    window.addEventListener("keyup", handle(false));
  }

  bindTouch() {
    const pad = this.root.querySelector("[data-pad]");
    if (!pad) return;
    pad.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-btn]");
      if (!b || !this.emu) return;
      e.preventDefault();
      this.emu.key(+b.dataset.btn, true);
      b.classList.add("active");
      this.flashKey(b.dataset.label, true, this.emu.sys === "gb" ? "gb" : "c8");
    });
    const up = (e) => {
      const b = e.target.closest("[data-btn]");
      if (!b || !this.emu) return;
      this.emu.key(+b.dataset.btn, false);
      b.classList.remove("active");
      this.flashKey(b.dataset.label, false, this.emu.sys === "gb" ? "gb" : "c8");
    };
    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointercancel", up);
    pad.addEventListener("pointerleave", up);
  }

  flashKey(label, down, sys) {
    const el = this.root.querySelector(`[data-keylabel="${sys}:${label}"]`)
      ?? this.root.querySelector(`[data-keylabel="${label}"]`);
    if (el) el.classList.toggle("active", down);
  }

  /* ------------------------- carga ROM ---------------------------- */
  detectSystem(name) {
    const n = name.toLowerCase();
    if (n.endsWith(".gb") || n.endsWith(".gbc")) return "gb";
    if (n.endsWith(".ch8")) {
      // S-CHIP: los ROMs del catálogo schip se marcan; los uploads a CHIP-8
      return null; // decidirá el llamador (catálogo) o default chip8
    }
    return "chip8";
  }

  async loadFile(f) {
    const buf = new Uint8Array(await f.arrayBuffer());
    let sys = this.detectSystem(f.name);
    if (!sys) {
      sys = (this.root.querySelector("[data-sys-select]")?.value) || "chip8";
    }
    await this.loadRom(buf, f.name, sys);
  }

  async loadFromCatalog(entry) {
    const res = await fetch(entry.url);
    if (!res.ok) { this.setStatus(`No se pudo cargar ${entry.url}: ${res.status}`); return; }
    const buf = new Uint8Array(await res.arrayBuffer());
    await this.loadRom(buf, entry.name, entry.system);
    this.romNote = entry.note ?? "";
    this.goldenArmed = entry.golden ?? null;
    this.goldenOk = false;
    this.updateGolden();
    if (!this.compact && this.el.romNote) this.el.romNote.textContent = entry.note ?? "";
  }

  async loadRom(bytes, name, sys) {
    if (!this.emu) await this.bootDelay();
    this.pause();
    this.emu.romBytes = null; // evita recarga implícita en init()
    this.emu.init(sys);
    const ok = this.emu.loadRom(bytes);
    if (!ok) { this.setStatus(`ROM inválida para ${sys}: ${name}`); return; }
    this.romName = name;
    this.frames = 0;
    this.goldenOk = false;
    this.goldenArmed = null;
    this.renderer.clear();
    this.setSysBadge(sys);
    if (this.el.romName) this.el.romName.textContent = name;
    if (this.el.quirks) this.el.quirks.style.display = sys === "gb" ? "none" : "";
    if (this.el.ipsWrap) this.el.ipsWrap.style.display = sys === "gb" ? "none" : "";
    this.showSystem(sys);
    this.setStatus(`ROM cargada: ${name} (${bytes.length} bytes, ${sys.toUpperCase()})`);
    this.play();
  }

  async bootDelay() { this.emu = await NovaEmu.load(); this.startLoop(); }

  setSysBadge(sys) {
    if (!this.el.sysBadge) return;
    const names = { chip8: "CHIP-8", schip: "S-CHIP", gb: "GAME BOY" };
    this.el.sysBadge.textContent = names[sys] ?? sys;
  }

  /** Muestra/oculta teclado 4x4 vs pad GB. */
  showSystem(sys) {
    const c8pad = this.root.querySelector("[data-c8pad]");
    const gbpad = this.root.querySelector("[data-gbpad]");
    if (c8pad) c8pad.style.display = sys === "gb" ? "none" : "";
    if (gbpad) gbpad.style.display = sys === "gb" ? "" : "none";
  }

  /* ------------------------- presets quirks ------------------------ */
  applyPreset(p) {
    if (!this.emu) return;
    const vip =    [1, 1, 0, 1, 1, 0, 0];
    const schip =  [0, 0, 1, 0, 0, 0, 0];
    const vals = p === "schip" ? schip : vip;
    vals.forEach((v, i) => {
      this.emu.setQuirk(i, !!v);
      const cb = this.el.quirks.querySelector(`input[data-quirk="${i}"]`);
      if (cb) cb.checked = !!v;
    });
    this.resetCore();
  }

  /* ------------------------- transporte --------------------------- */
  toggle() { this.playing ? this.pause() : this.play(); }
  play()  { this.playing = true;  if (this.el.play)  this.el.play.textContent  = "⏸ Pausa"; }
  pause() { this.playing = false; if (this.el.play)  this.el.play.textContent  = "▶ Play"; }
  resetCore() {
    if (!this.emu) return;
    const sys = this.emu.sys;
    this.emu.init(sys);
    this.frames = 0;
    this.goldenOk = false;
    this.updateGolden();
    this.renderer.clear();
  }

  startLoop() {
    if (this._raf) return;
    this._lastT = performance.now();
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const dt = t - this._lastT;
      this._lastT = t;
      if (this.playing && this.emu) {
        // objetivo 60 fps con acumulador (mismo pacer que el CLI: deadline absoluto)
        this._acc += dt;
        const stepMs = 1000 / 60;
        let n = 0;
        while (this._acc >= stepMs && n < 4) {
          this.tickFrame();
          this._acc -= stepMs;
          n++;
        }
        if (this._acc > 200) this._acc = 0; // anti catch-up tras pestaña oculta
        this.updateTelemetry();
      }
      // FPS
      this._fpsN++;
      if (t - this._fpsT >= 1000) {
        this.fps = this._fpsN * 1000 / (t - this._fpsT);
        this._fpsT = t; this._fpsN = 0;
        if (this.el.fps) this.el.fps.textContent = this.fps.toFixed(0);
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  tickFrame() {
    if (!this.emu) return;
    if (this.emu.sys === "gb") {
      for (let i = 0; i < this.turbo; i++) this.emu.frame();
    } else {
      this.emu.frame(this.ips);
    }
    this.frames++;
    if (this._onFrame) this._onFrame();
    if (this.emu.sys === "gb" || !this.emu.exited()) {
      this.renderer.draw(this.emu.fb(), this.emu.fbW(), this.emu.fbH());
    }
    if (this.goldenArmed && !this.goldenOk && this.frames === this.goldenArmed.frames) {
      if (this.emu.hashHex() === this.goldenArmed.hash) {
        this.goldenOk = true;
        this.updateGolden();
      }
    }
  }

  renderOnce() {
    if (!this.emu) return;
    this.renderer.draw(this.emu.fb(), this.emu.fbW(), this.emu.fbH());
  }

  updateGolden() {
    if (!this.el.golden) return;
    if (!this.goldenArmed) { this.el.golden.textContent = ""; return; }
    this.el.golden.textContent = this.goldenOk
      ? "GOLDEN OK (frame " + this.goldenArmed.frames + ")"
      : `esperando frame ${this.goldenArmed.frames}…`;
    this.el.golden.classList.toggle("ok", this.goldenOk);
  }

  updateTelemetry(force = false) {
    if (!this.emu) return;
    if (this.el.frames) this.el.frames.textContent = this.frames;
    if (this.el.hash)   this.el.hash.textContent = this.emu.hashHex();
    if (this.el.ops) {
      this.el.ops.textContent = this.emu.sys === "gb"
        ? (this.emu.cycles() / 1e6).toFixed(1) + "M ciclos"
        : (this.emu.opCount() / 1e6).toFixed(2) + "M ops";
    }
    if (this.el.serial && this.emu.sys === "gb") {
      const s = this.emu.serial();
      if (s) this.el.serial.textContent = s;
    }
  }

  setStatus(s) { if (this.el.status) this.el.status.textContent = s; }
}
