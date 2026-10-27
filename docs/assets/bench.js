/* NovaEmu Web — banco de pruebas en el navegador (port de scripts/test_blargg_all.mjs
 * + goldens NE-E003/E004). 15 checks: 2 goldens + determinismo + 12 Blargg.
 */
import { NovaEmu, ROM_CATALOG, BLARGG_SUITE, BLARGG_FULL } from "./nova-core.js";

export const TESTS = [
  { id: "NE-W001", name: "Golden chip8_bounce 300f → 28c31cf8df2ec325", kind: "golden", rom: "chip8-bounce" },
  { id: "NE-W002", name: "Golden schip_bounce 300f → 96b4fc937dc825b9", kind: "golden", rom: "schip-bounce" },
  { id: "NE-W003", name: "Determinismo: doble pasada → hashes idénticos", kind: "determinism" },
  ...BLARGG_SUITE.map((b) => ({ id: "NE-W" + b.id.slice(-2).padStart(2, "0"), name: "Blargg " + b.name, kind: "blargg", rom: b })),
  { id: "NE-W12",  name: "Blargg " + BLARGG_FULL.name, kind: "blargg", rom: BLARGG_FULL },
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

  let pass = 0, total = TESTS.length;
  for (const t of TESTS) {
    onResult(t.id, "run", "ejecutando…", 0);
    await new Promise((r) => setTimeout(r, 10)); // deja respirar al hilo UI
    try {
      const ok = t.kind === "golden" ? await runGolden(t)
        : t.kind === "determinism" ? await runDeterminism(t)
        : await runBlargg(t);
      if (ok) pass++;
    } catch (err) {
      onResult(t.id, "fail", String(err.message ?? err), 0);
    }
  }
  return { pass, fail: total - pass, total };
}
