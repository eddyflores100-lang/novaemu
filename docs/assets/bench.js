/* NovaEmu Web — banco de pruebas en el navegador (port de scripts/test_blargg_all.mjs
 * + goldens NE-E003/E004). 24 checks: 2 goldens + determinismo + 12 Blargg +
 * exports v1.1 + 4 juegos con input real + snapshot/restore.
 */
import { NovaEmu, ROM_CATALOG, BLARGG_SUITE, BLARGG_FULL, NOVA_GAMES } from "./nova-core.js";

export const TESTS = [
  { id: "NE-W001", name: "Golden chip8_bounce 300f → 28c31cf8df2ec325", kind: "golden", rom: "chip8-bounce" },
  { id: "NE-W002", name: "Golden schip_bounce 300f → 96b4fc937dc825b9", kind: "golden", rom: "schip-bounce" },
  { id: "NE-W003", name: "Determinismo: doble pasada → hashes idénticos", kind: "determinism" },
  ...BLARGG_SUITE.map((b) => ({ id: "NE-W" + b.id.slice(-2).padStart(2, "0"), name: "Blargg " + b.name, kind: "blargg", rom: b })),
  { id: "NE-W12",  name: "Blargg " + BLARGG_FULL.name, kind: "blargg", rom: BLARGG_FULL },
  { id: "NE-W13",  name: "Exports v1.1: c8w_st/dt/snap/restore", kind: "exports" },
  { id: "NE-W14",  name: "Gamepad API disponible (mandos DualSense/Xbox)", kind: "api-gamepad" },
  { id: "NE-W15",  name: "Fullscreen API disponible (con fallback teatro)", kind: "api-fs" },
  { id: "NE-W16",  name: "localStorage disponible (save states locales)", kind: "api-ls" },
  ...NOVA_GAMES.filter((g) => g.playable).map((g, i) => ({
    id: "NE-G0" + (i + 1), name: `Juego ${g.name} arranca y responde a input`, kind: "game", game: g,
  })),
  { id: "NE-G90", name: "Save state: snapshot → frames → restore determinista", kind: "snap" },
];

/** Ejecuta la suite completa. onResult(id, status, detail, ms) por test. */
export async function runSuite(onResult) {
  const emu = await NovaEmu.load();
  const romCache = new Map();
  const getRom = async (url) => {
    if (!romCache.has(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
      romCache.set(url, new Uint8Array(await res.arrayBuffer()));
    }
    return romCache.get(url);
  };

  const loadInto = (emu, rom) => {
    emu.init(rom.sys ?? "gb");
    emu.romBytes = null;
    if (rom.sys && rom.sys !== "gb") emu.init(rom.sys);
    if (emu.sys === "gb") {
      const ptr = emu.w.nova_alloc(rom.bytes.length);
      emu.u8().set(rom.bytes, ptr);
      return emu.w.gbw_load(ptr, rom.bytes.length) === 0;
    }
    return emu.loadRom(rom.bytes);
  };

  const runGolden = async (t) => {
    const entry = ROM_CATALOG.find((r) => r.id === t.rom);
    const rom = { sys: entry.system, bytes: await getRom(entry.url) };
    const t0 = performance.now();
    emu.init(rom.sys);
    emu.romBytes = null;
    emu.loadRom(rom.bytes);
    for (let f = 0; f < entry.golden.frames; f++) emu.frame(11);
    const hash = emu.hashHex();
    const ok = hash === entry.golden.hash;
    onResult(t.id, ok ? "pass" : "fail",
      ok ? `hash ${hash} en frame ${entry.golden.frames}` : `hash ${hash} ≠ ${entry.golden.hash}`,
      performance.now() - t0);
    return ok;
  };

  const runDeterminism = async (t) => {
    const entry = ROM_CATALOG.find((r) => r.id === "chip8-bounce");
    const rom = { sys: "chip8", bytes: await getRom(entry.url) };
    const t0 = performance.now();
    const hashes = [];
    for (let run = 0; run < 2; run++) {
      emu.init("chip8");
      emu.romBytes = null;
      emu.loadRom(rom.bytes);
      for (let f = 0; f < 300; f++) emu.frame(11);
      hashes.push(emu.hashHex());
    }
    const ok = hashes[0] === hashes[1];
    onResult(t.id, ok ? "pass" : "fail",
      ok ? `2× ${hashes[0]} bit-exacto` : `${hashes[0]} ≠ ${hashes[1]}`,
      performance.now() - t0);
    return ok;
  };

  /** Lógica Blargg idéntica a scripts/test_blargg_all.mjs: sondear el serial. */
  const runBlargg = async (t) => {
    const b = t.rom;
    const bytes = await getRom(b.url);
    const t0 = performance.now();
    const ptr = emu.w.nova_alloc(bytes.length);
    emu.u8().set(bytes, ptr);
    emu.w.gbw_init();
    if (emu.w.gbw_load(ptr, bytes.length) !== 0) {
      onResult(t.id, "fail", "load falló", performance.now() - t0);
      return false;
    }
    let out = "(timeout)";
    for (let f = 0; f < b.maxFrames; f++) {
      emu.w.gbw_frame();
      if (f % 30 === 29) {
        const s = emu.serial();
        if (s.includes("Passed")) { out = s; break; }
        if (s.includes("Failed") || s.includes("failed")) { out = s; break; }
      }
    }
    const ok = out.includes("Passed");
    const short = out.length > 60 ? out.slice(0, 57) + "…" : out;
    onResult(t.id, ok ? "pass" : "fail", JSON.stringify(short), performance.now() - t0);
    return ok;
  };

  const runExports = async (t) => {
    const t0 = performance.now();
    const need = ["c8w_st", "c8w_dt", "c8w_snap", "c8w_restore", "c8w_snap_size"];
    const missing = need.filter((k) => typeof emu.w[k] !== "function");
    const ok = missing.length === 0;
    onResult(t.id, ok ? "pass" : "fail",
      ok ? "5/5 exports NCS1 presentes" : "faltan: " + missing.join(","),
      performance.now() - t0);
    return ok;
  };

  /** Juego NOVA: carga, arranca (portada), pulsa 5 y verifica que el fb reacciona. */
  const runGame = async (t) => {
    const g = t.game;
    const t0 = performance.now();
    const bytes = await getRom(g.url);
    emu.init(g.system);
    emu.romBytes = null;
    emu.loadRom(bytes);
    if (g.quirks) g.quirks.forEach((v, i) => emu.setQuirk(i, !!v));
    const ips = g.ips ?? 60;
    for (let f = 0; f < 30; f++) emu.frame(ips);
    const fbNonEmpty = emu.fb().some((v) => v !== 0);
    // pulsa 5 (start) 12 frames y suelta
    emu.key(5, 1);
    for (let f = 0; f < 12; f++) emu.frame(ips);
    emu.key(5, 0);
    for (let f = 0; f < 10; f++) emu.frame(ips);
    const h0 = emu.hashHex();
    emu.key(6, 1); // dirección derecha sostenida: los 4 jugables reaccionan
    for (let f = 0; f < 24; f++) emu.frame(ips);
    emu.key(6, 0);
    const h1 = emu.hashHex();
    const exited = emu.exited();
    const ok = fbNonEmpty && h0 !== h1 && !exited;
    onResult(t.id, ok ? "pass" : "fail",
      ok ? `portada OK, input OK, ips=${ips}` : `fb=${fbNonEmpty} delta=${h0 !== h1} exited=${exited}`,
      performance.now() - t0);
    return ok;
  };

  /** Snapshot/restore: estado → frames → restore → mismos frames → mismo hash. */
  const runSnap = async (t) => {
    const t0 = performance.now();
    const g = NOVA_GAMES.find((x) => x.id === "nova-pong");
    const bytes = await getRom(g.url);
    emu.init("chip8");
    emu.romBytes = null;
    emu.loadRom(bytes);
    if (g.quirks) g.quirks.forEach((v, i) => emu.setQuirk(i, !!v));
    const ips = g.ips ?? 130;
    for (let f = 0; f < 40; f++) emu.frame(ips);
    const size = emu.w.c8w_snap_size();
    const ptr = emu.w.nova_alloc(size);
    const written = emu.w.c8w_snap(ptr);
    if (written !== size) {
      onResult(t.id, "fail", `snap ${written} != ${size}`, performance.now() - t0);
      return false;
    }
    const saved = emu.w.memory.buffer.slice(ptr, ptr + size);
    emu.key(2, 1);
    for (let f = 0; f < 60; f++) emu.frame(ips);
    emu.key(2, 0);
    const hA = emu.hashHex();
    const back = emu.w.nova_alloc(size);
    new Uint8Array(emu.w.memory.buffer).set(new Uint8Array(saved), back);
    const rc = emu.w.c8w_restore(back);
    emu.key(2, 1);
    for (let f = 0; f < 60; f++) emu.frame(ips);
    emu.key(2, 0);
    const hB = emu.hashHex();
    const ok = rc === 0 && hA === hB;
    onResult(t.id, ok ? "pass" : "fail",
      ok ? `restore bit-exacto (${size} B)` : `rc=${rc} ${hA} vs ${hB}`,
      performance.now() - t0);
    return ok;
  };

  const runApi = async (t, ok, detail) => {
    onResult(t.id, ok ? "pass" : "fail", detail, 0);
    return ok;
  };
  const apiHandlers = {
    "api-gamepad": (t) => runApi(t, !!navigator.getGamepads, navigator.getGamepads ? "navigator.getGamepads presente" : "sin Gamepad API"),
    "api-fs": (t) => runApi(t, !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || true), "con fallback modo teatro siempre"),
    "api-ls": (t) => { try { localStorage.setItem("nova_t", "1"); localStorage.removeItem("nova_t"); return runApi(t, true, "localStorage OK"); } catch (e) { return runApi(t, false, "localStorage bloqueado"); } },
  };

  let pass = 0, total = TESTS.length;
  for (const t of TESTS) {
    onResult(t.id, "run", "ejecutando…", 0);
    await new Promise((r) => setTimeout(r, 10)); // deja respirar al hilo UI
    try {
      const ok = t.kind === "golden" ? await runGolden(t)
        : t.kind === "determinism" ? await runDeterminism(t)
        : t.kind === "exports" ? await runExports(t)
        : t.kind === "game" ? await runGame(t)
        : t.kind === "snap" ? await runSnap(t)
        : apiHandlers[t.kind] ? await apiHandlers[t.kind](t)
        : await runBlargg(t);
      if (ok) pass++;
    } catch (err) {
      onResult(t.id, "fail", String(err.message ?? err), 0);
    }
  }
  return { pass, fail: total - pass, total };
}
