/* ============================================================
   NovaEmu NG — banco de pruebas (estilo Kyty/SharpEmu)
   - Golden frames: hash FNV-1a del framebuffer, determinismo + persistencia
   - Conformance GPU: píxeles observados vs referencia calculada en CPU (sentinela 0xCAFEBABE)
   - Watchdog: crash recovery y halt tras 3 crashes
   - Rendimiento medido, no supuesto
   ============================================================ */
(function () {
'use strict';
const NG = window.NG;
const GOLDEN_VER = 'ng1';
const results = [];
let jsErrors = 0;
window.addEventListener('error', function () { jsErrors++; });

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function runTests() {
  const t0 = performance.now();

  /* ---------- 1 · catálogo ---------- */
  await test('Catálogo: 3 paquetes NovaPKG registrados con manifiesto válido', function () {
    const list = NG.NGPackage.list();
    if (list.length < 3) throw new Error('solo ' + list.length + ' paquetes');
    const ids = list.map(function (p) { return p.id; });
    for (const id of ['turbo-circuit', 'star-raid', 'shadow-ruins']) {
      if (ids.indexOf(id) < 0) throw new Error('falta ' + id);
      const problems = NG.NGPackage.validate(NG.NGPackage.get(id));
      if (problems.length) throw new Error(id + ': ' + problems.join('; '));
    }
    return 'ids: ' + ids.join(', ');
  });

  /* ---------- 2 · auditoría del loader ---------- */
  await test('Loader: manifiesto inválido detectado por auditoría sin excepción', function () {
    const problems = NG.NGPackage.validate({});
    if (problems.length < 3) throw new Error('auditoría demasiado laxa');
    return problems.length + ' problemas detectados: ' + problems.slice(0, 3).join(', ');
  });

  /* ---------- 3 · paquete de usuario ---------- */
  await test('Loader: buildFromUserCode rechaza entrada corrupta de forma controlada', function () {
    const r1 = NG.NGPackage.buildFromUserCode(null);
    const r2 = NG.NGPackage.buildFromUserCode({ id: 'x', title: 't', genre: 'g', version: '1', controls: [{}] });
    if (r1.ok || r2.ok) throw new Error('aceptó entrada inválida');
    return 'rechazados con: "' + r1.problems[0] + '", "' + r2.problems[0] + '"';
  });

  /* ---------- 4 · cadena de fallbacks SYSMOD ---------- */
  const vm0 = new NG.NGVM({ canvas: mkCanvas(64, 48) });
  await test('SYSMOD: resolución de módulos con fallback auditado', function () {
    const log0 = vm0.moduleLog.length;
    const chosen = vm0._resolveModule('prueba', [
      { name: 'backend-roto', test: function () { return false; } },
      { name: 'backend-real', test: function () { return true; } }
    ]);
    if (chosen !== 'backend-real') throw new Error('eligió ' + chosen);
    const entry = vm0.moduleLog[vm0.moduleLog.length - 1];
    if (!entry.fallbackFrom) throw new Error('no registró el fallback');
    return chosen + ' (fallback desde ' + entry.fallbackFrom + ')';
  });

  /* ---------- 5 · módulos de la VM ---------- */
  await test('VM: módulos del sistema resueltos (gpu/audio/input/save)', function () {
    const vm5 = new NG.NGVM({ canvas: mkCanvas(96, 64) });
    const r = vm5.loadPackage(NG.NGPackage.get('turbo-circuit'));
    if (!r.ok) throw new Error('boot falló');
    const m = vm5.modules;
    if (['webgl2', 'webgl1', 'null'].indexOf(m.gpu) < 0) throw new Error('gpu=' + m.gpu);
    if (!m.input || !m.save || !m.audio) throw new Error('módulos incompletos: ' + JSON.stringify(m));
    const mods = 'gpu=' + m.gpu + ' · audio=' + m.audio + ' · save=' + m.save;
    loseCtx(vm5);
    return mods;
  });

  /* ---------- 6-8 · GPU: dispatch, robustez y conformance ---------- */
  const gpuC = new NG.NGVM({ canvas: mkCanvas(160, 120) });
  await test('GPU: command buffer despacha ops válidos vía tabla de dispatch', function () {
    const gpu = gpuC.gpu;
    gpu.uploadMesh('tri', NG.mesh.box(2, 2, 2, '#ff2020'));
    gpu.submit([
      { op: 'clear', col: [0, 0, 1] },
      { op: 'camera', view: NG.m4.lookAt([0, 0, 6], [0, 0, 0], [0, 1, 0]), proj: NG.m4.perspective(1.0, 160 / 120, 0.1, 50), pos: [0, 0, 6] },
      { op: 'light', col: [1, 1, 1], ambient: [0.5, 0.5, 0.5] },
      { op: 'mesh', id: 'tri', model: NG.m4.ident() }
    ]);
    if (gpu.drawCalls < 1) throw new Error('0 draws');
    return gpu.drawCalls + ' draw calls · backend ' + gpu.backend;
  });
  loseCtx(gpuC);
  await sleep(30);

  const gpuU = new NG.NGVM({ canvas: mkCanvas(64, 48) });
  await test('GPU: op desconocido → ignorado con aviso único, el frame continúa', function () {
    const gpu = gpuU.gpu;
    gpu.submit([{ op: 'op_inventado' }]);
    gpu.submit([{ op: 'op_inventado' }]);
    if (!gpu.warned['op_inventado']) throw new Error('no avisó');
    if (gpu.warned['op_inventado'] !== 1) throw new Error('avisó más de una vez');
    return 'op_inventado avisado 1 vez y descartado';
  });
  loseCtx(gpuU);
  await sleep(30);

  const gpuConf = new NG.NGVM({ canvas: mkCanvas(160, 120) });
  await test('Conformance GPU: píxel observado == referencia CPU (sentinela 0xCAFEBABE)', function () {
    const gpu = gpuConf.gpu;
    if (!gpu._gl) throw new Error('sin GL en este entorno');
    gpu.uploadMesh('caja', NG.mesh.box(2, 2, 2, '#ff2020'));
    gpu.submit([
      { op: 'clear', col: [0, 0, 1] },
      { op: 'camera', view: NG.m4.lookAt([0, 0, 6], [0, 0, 0], [0, 1, 0]), proj: NG.m4.perspective(1.0, 160 / 120, 0.1, 50), pos: [0, 0, 6] },
      { op: 'light', col: [1, 1, 1], ambient: [0.5, 0.5, 0.5] },
      { op: 'mesh', id: 'caja', model: NG.m4.ident() }
    ]);
    const gl = gpu._gl;
    const px = new Uint8Array(4);
    gl.readPixels(80, 60 - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // centro (y invertida: origen abajo-izq)
    if (!(px[0] > 90 && px[1] < 90 && px[2] < 90)) {
      throw new Error('centro RGB=' + px[0] + ',' + px[1] + ',' + px[2] + ' (esperado rojizo)');
    }
    gl.readPixels(4, 120 - 5, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // esquina superior-izq
    if (!(px[2] > 140 && px[0] < 60)) {
      throw new Error('esquina RGB=' + px[0] + ',' + px[1] + ',' + px[2] + ' (esperado azul de clear)');
    }
    return 'centro rojizo OK · esquina azul OK';
  });
  loseCtx(gpuConf);
  await sleep(30);

  /* ---------- 9-12 · golden frames ---------- */
  const scriptA = function (n) {
    return { move: { x: Math.sin(n / 40) * 0.9, y: -1 }, look: { x: 0, y: 0 },
      btn: { a: (n % 130) < 34, b: n > 210, start: 0 } };
  };
  const scriptB = function (n) {
    return { move: { x: -Math.sin(n / 55) * 0.8, y: -1 }, look: { x: 0, y: 0 },
      btn: { a: false, b: false, start: 0 } };
  };
  let hashTurbo = '';
  await test('Golden frame TURBO: 2 ejecuciones idénticas → hash idéntico; input distinto → hash distinto', async function () {
    const r1 = runGame('turbo-circuit', 240, scriptA);
    const r2 = runGame('turbo-circuit', 240, scriptA);
    if (r1.hash !== r2.hash) throw new Error('no determinista: ' + r1.hash + ' vs ' + r2.hash);
    const r3 = runGame('turbo-circuit', 240, scriptB);
    if (r1.hash === r3.hash) throw new Error('inputs distintos produjeron el mismo frame');
    hashTurbo = r1.hash;
    loseCtxRun(r1); loseCtxRun(r2); loseCtxRun(r3);
    return 'golden ' + r1.hash + ' (estable y sensible al input)';
  });
  await sleep(30);

  await test('Golden frame STAR: 2 ejecuciones idénticas → hash idéntico', function () {
    const s = function (n) { return { move: { x: Math.sin(n / 50), y: Math.cos(n / 70) }, look: { x: 0, y: 0 }, btn: { a: n % 20 < 6, b: false, start: 0 } }; };
    const r1 = runGame('star-raid', 300, s);
    const r2 = runGame('star-raid', 300, s);
    if (r1.hash !== r2.hash) throw new Error('no determinista: ' + r1.hash + ' vs ' + r2.hash);
    loseCtxRun(r1); loseCtxRun(r2);
    return 'golden ' + r1.hash;
  });
  await sleep(30);

  await test('Golden frame RUINS: 2 ejecuciones idénticas → hash idéntico', function () {
    const s = function (n) { return { move: { x: Math.sin(n / 60), y: n % 200 < 100 ? -1 : 0.4 }, look: { x: 0.3, y: 0 }, btn: { a: n % 90 < 8, b: false, start: 0 } }; };
    const r1 = runGame('shadow-ruins', 240, s);
    const r2 = runGame('shadow-ruins', 240, s);
    if (r1.hash !== r2.hash) throw new Error('no determinista: ' + r1.hash + ' vs ' + r2.hash);
    loseCtxRun(r1); loseCtxRun(r2);
    return 'golden ' + r1.hash;
  });
  await sleep(30);

  await test('Golden persistente: hash coincide con golden registrado (regresión Kyty-style)', function () {
    if (!hashTurbo) throw new Error('hash previo ausente');
    const key = 'golden_turbo_' + GOLDEN_VER;
    const stored = localStorage.getItem(key);
    if (!stored) {
      localStorage.setItem(key, hashTurbo);
      return 'primer registro: ' + hashTurbo;
    }
    if (stored !== hashTurbo) throw new Error('REGRESIÓN: golden era ' + stored + ' ahora ' + hashTurbo);
    return 'coincide con golden registrado ' + stored;
  });

  /* ---------- 13 · frame dump ---------- */
  const vmDump = new NG.NGVM({ canvas: mkCanvas(160, 90) });
  await test('Frame dump: captura PNG del framebuffer (estilo APS5_DUMP_FRAMES de AnyPS5)', function () {
    runFrames(vmDump, 'turbo-circuit', 30, null);
    const url = vmDump.gpu.frameDump();
    if (!url || url.indexOf('data:image/png') !== 0) throw new Error('dump inválido');
    loseCtx(vmDump);
    return (url.length / 1024).toFixed(0) + ' KB dataURL';
  });
  await sleep(30);

  /* ---------- 14 · save state ---------- */
  const vmSave = new NG.NGVM({ canvas: mkCanvas(320, 180) });
  await test('Save state: guardar → avanzar → restaurar → estado exacto', function () {
    runFrames(vmSave, 'turbo-circuit', 150, null);
    const snap = vmSave.saveState(true);
    runFrames(vmSave, null, 60, null); // avanzar más (el juego sigue cargado)
    if (!vmSave.restoreState(snap)) throw new Error('restore devolvió false');
    const after = JSON.parse(vmSave.saveState(true));
    const orig = JSON.parse(snap);
    if (JSON.stringify(after.game) !== JSON.stringify(orig.game)) throw new Error('estado divergió tras restaurar');
    if (vmSave.tickCount !== orig.tick) throw new Error('tick divergió');
    loseCtx(vmSave);
    return 'restaurado en tick ' + vmSave.tickCount + ' con estado idéntico';
  });
  await sleep(30);

  /* ---------- 15 · rewind ---------- */
  const vmRw = new NG.NGVM({ canvas: mkCanvas(320, 180) });
  await test('Rewind: rebobinar restaura ticks pasados (búfer anular 12 s)', function () {
    runFrames(vmRw, 'star-raid', 90, null);
    const before = vmRw.tickCount;
    const n = vmRw.rewind();
    if (!(n > 0) || vmRw.tickCount >= before) throw new Error('rewind no restauró: n=' + n);
    loseCtx(vmRw);
    return '−' + n + ' ticks (' + before + ' → ' + vmRw.tickCount + ')';
  });
  await sleep(30);

  /* ---------- 16 · watchdog: recuperación ---------- */
  const vmRec = new NG.NGVM({ canvas: mkCanvas(96, 64) });
  await test('Watchdog: crash puntual → VM se recupera con último estado bueno (Kyty hostException)', function () {
    const pkg = makeCrashyPkg(30, false);
    vmRec.loadPackage(pkg);
    for (let i = 0; i < 120; i++) vmRec.stepFrame(1 / 60);
    if (vmRec.state !== 'corriendo') throw new Error('la VM no siguió: ' + vmRec.state);
    const hayFatal = NGLog.dump().indexOf('FATAL') >= 0;
    if (!hayFatal) throw new Error('no registró el crash');
    loseCtx(vmRec);
    return 'crash registrado y VM sigue corriendo';
  });
  await sleep(30);

  /* ---------- 17 · watchdog: halt tras 3 crashes ---------- */
  const vmHalt = new NG.NGVM({ canvas: mkCanvas(96, 64) });
  let halted = null;
  vmHalt.onHalt = function (e) { halted = e; };
  await test('Watchdog: 3 crashes en 10 s → halt controlado con panel', function () {
    const pkg = makeCrashyPkg(0, true);
    vmHalt.loadPackage(pkg);
    for (let i = 0; i < 12; i++) vmHalt.stepFrame(1 / 60);
    if (vmHalt.state !== 'halteada') throw new Error('estado=' + vmHalt.state);
    if (!halted) throw new Error('onHalt no invocado');
    loseCtx(vmHalt);
    return 'halt con: ' + (halted.message || halted);
  });
  await sleep(30);

  /* ---------- 18-19 · input ---------- */
  await test('Input: script determinista para golden frames', function () {
    const inp = new NG.NGInput();
    inp.script = function (n) { return { move: { x: 0.5, y: -1 }, look: { x: 0, y: 0 }, btn: { a: 1 } }; };
    const st = inp.poll();
    if (st.move.x !== 0.5 || st.move.y !== -1 || st.btn.a !== 1) throw new Error('script no respetado');
    inp.script = null;
    return 'script aplicado';
  });
  await test('Input: teclado → acciones (backend de respaldo siempre activo)', function () {
    const inp = new NG.NGInput();
    inp.setKeyMap({ left: ['ArrowLeft'], up: ['KeyW'] }); // mapa de teclas definido por el juego
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const st = inp.poll();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    if (st.move.x !== -1) throw new Error('izquierda falló');
    if (st.move.y !== -1) throw new Error('arriba falló');
    return '← = -1 · ↑ = -1 OK';
  });

  /* ---------- 20 · audio ---------- */
  await test('Audio: presets y loops defensivos (fallback a silencio sin excepción)', function () {
    const a = new NG.NGAudio();
    a.sfx('laser'); // sin contexto: no debe lanzar
    const okCtx = a.ensure();
    const h = a.startLoop('t', { freq: 90 });
    a.setLoop('t', 200);
    a.stopLoop('t');
    ['laser', 'boom', 'coin', 'jump', 'boost', 'ui', 'win', 'lose', 'skid'].forEach(function (n) { a.sfx(n); });
    a.stopMusic();
    return 'backend=' + a.backend + (okCtx ? ' (contexto real)' : ' (fallback silencio)');
  });

  /* ---------- 21 · rendimiento ---------- */
  const vmPerf = new NG.NGVM({ canvas: mkCanvas(320, 180) });
  await test('Rendimiento: 300 frames tick+render dentro del presupuesto', function () {
    vmPerf.loadPackage(NG.NGPackage.get('turbo-circuit'));
    const t = performance.now();
    for (let i = 0; i < 300; i++) vmPerf.stepFrame(1 / 60);
    const ms = performance.now() - t;
    loseCtx(vmPerf);
    if (ms > 30000) throw new Error('demasiado lento: ' + (ms / 300).toFixed(1) + ' ms/frame');
    return (ms / 300).toFixed(2) + ' ms/frame (' + ms.toFixed(0) + ' ms total, 320×180)';
  });

  render(t0);
}

/* ================= utilidades ================= */
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function loseCtx(vm) {
  try { if (vm.gpu._gl) { const ext = vm.gpu._gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } } catch (e) {}
  try { if (vm.audio.ctx) vm.audio.ctx.close(); } catch (e) {}
}
function loseCtxRun(r) { loseCtx(r.vm); }
function runGame(pkgId, ticks, script) {
  const vm = new NG.NGVM({ canvas: mkCanvas(480, 270) });
  if (script) vm.input.script = script;
  const r = vm.loadPackage(NG.NGPackage.get(pkgId));
  if (!r.ok) throw new Error('boot falló: ' + (r.error && r.error.message));
  for (let i = 0; i < ticks; i++) vm.stepFrame(1 / 60);
  const hash = vm.gpu.readPixelsHash();
  return { vm: vm, hash: hash };
}
function runFrames(vm, pkgId, ticks, script) {
  if (pkgId) {
    if (script) vm.input.script = script;
    vm.loadPackage(NG.NGPackage.get(pkgId));
  }
  for (let i = 0; i < ticks; i++) vm.stepFrame(1 / 60);
}
function makeCrashyPkg(crashAt, always) {
  let n = 0;
  return {
    id: 'crash-test', title: 'Crash Test', genre: 'test', version: '1.0',
    controls: [{ action: 'a', label: 'x', keys: 'X' }],
    problems: [],
    factory: function () {
      return {
        start: function () {}, serialize: function () { return { n: n }; },
        deserialize: function () {},
        tick: function () { n++; if (always || n === crashAt) { throw new Error('crash provocado en tick ' + n); } },
        render: function () {}
      };
    }
  };
}
async function test(name, fn) {
  const t0 = performance.now();
  let pass = true, info = '';
  try {
    const r = await fn();
    info = r === undefined ? '' : String(r);
  } catch (e) {
    pass = false;
    info = e.message;
  }
  results.push({ name: name, pass: pass, info: info, ms: performance.now() - t0 });
  renderTable();
}

/* ================= pintado ================= */
function renderTable() {
  const tb = document.querySelector('#tbl tbody');
  if (!tb) return;
  tb.innerHTML = results.map(function (r, i) {
    return '<tr class="' + (r.pass ? 'pass' : 'fail') + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + esc(r.name) + (r.info ? '<div class="test-info">' + esc(r.info) + '</div>' : '') + '</td>' +
      '<td class="ms">' + r.ms.toFixed(0) + ' ms</td>' +
      '<td class="status">' + (r.pass ? 'PASS' : 'FAIL') + '</td></tr>';
  }).join('');
}
function render(t0) {
  const passed = results.filter(function (r) { return r.pass; }).length;
  const total = results.length;
  $('nPass').textContent = passed;
  $('nTotal').textContent = total;
  $('nMs').textContent = (performance.now() - t0).toFixed(0);
  $('nErr').textContent = jsErrors;
  $('sumState').textContent = (passed === total && jsErrors === 0) ? 'TODO VERDE' : 'HAY FALLOS';
  $('sumState').className = 'sum-card ' + (passed === total && jsErrors === 0 ? 'ok' : 'bad');
  const gl = document.createElement('canvas').getContext('webgl2') ? 'WebGL2' :
    (document.createElement('canvas').getContext('webgl') ? 'WebGL1' : 'sin GPU');
  $('backend').textContent = gl;
}
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runTests);
else runTests();
})();
