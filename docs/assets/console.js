/* ============================================================
   NovaEmu NG — UI de la consola
   Corrección de las quejas de Task 12: el juego INICIA al pulsar,
   los controles se muestran, la pantalla completa FUNCIONA.
   ============================================================ */
(function () {
'use strict';
const NG = window.NG;
const $ = function (id) { return document.getElementById(id); };

const canvas = $('screen');
const vm = new NG.NGVM({
  canvas: canvas,
  onHalt: function (e) { showHalt(e); },
  onStateChange: function () { refreshChips(); }
});
window.__vm = vm; // depuración

const current = { pkg: null };
let rewindHold = null;

/* ---------------- arranque de un juego ---------------- */
function boot(pkg) {
  hideHalt();
  const r = vm.loadPackage(pkg);
  if (!r.ok) return;
  current.pkg = pkg;
  vm.fitCanvas();
  vm.startLoop();
  $('overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('bar').classList.remove('hidden');
  buildControls(pkg);
  setupTouch(pkg);
  if (vm.modules.audio !== 'webaudio') $('btnSound').textContent = 'Sonido: no disponible';
  else $('btnSound').textContent = 'Sonido: activado';
  refreshChips();
  NGLog.push('UI', 'juego en ejecución: ' + pkg.title);
}

/* ---------------- biblioteca de juegos ---------------- */
function buildLibrary() {
  const grid = $('cards');
  grid.innerHTML = '';
  NG.NGPackage.list().forEach(function (pkg) {
    const card = document.createElement('button');
    card.className = 'card';
    const grad = (pkg.cover || ['#222', '#333', '#555']).join(',');
    card.innerHTML =
      '<div class="cover" style="background:linear-gradient(135deg,' + grad + ')">' +
      '<span class="cover-title">' + esc(pkg.title) + '</span>' +
      '<span class="cover-genre">' + esc(pkg.genre) + '</span></div>' +
      '<div class="card-body"><strong>' + esc(pkg.title) + '</strong>' +
      '<p>' + esc(pkg.desc || '') + '</p></div>' +
      '<div class="card-cta">JUGAR</div>';
    card.addEventListener('click', function () { boot(pkg); });
    grid.appendChild(card);
  });
  // zona de carga de paquetes del usuario
  const drop = document.createElement('div');
  drop.className = 'card user-card';
  drop.innerHTML = '<div class="cover user-cover"><span class="cover-title">+ Cargar tu NovaPKG</span>' +
    '<span class="cover-genre">.json / .novapk</span></div>' +
    '<div class="card-body"><p>Tu paquete corre por el mismo pipeline: command buffer → WebGL2.</p></div>' +
    '<input type="file" id="filePkg" accept=".json,.novapk,application/json" style="display:none">' +
    '<div class="card-cta">SELECCIONAR ARCHIVO</div>';
  drop.addEventListener('click', function () { $('filePkg').click(); });
  grid.appendChild(drop);
  $('filePkg').addEventListener('change', function (e) {
    const f = e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = function () {
      let obj = null;
      try { obj = JSON.parse(fr.result); } catch (err) { alert('Archivo no válido: no es JSON'); return; }
      const built = NG.NGPackage.buildFromUserCode(obj);
      if (!built.ok) { alert('Paquete rechazado:\n- ' + built.problems.join('\n- ')); return; }
      boot(built.pkg);
    };
    fr.readAsText(f);
  });
}

/* ---------------- HUD genérico ---------------- */
function renderHud() {
  const d = vm.hud.data || {};
  const el = $('hud');
  if (vm.state !== 'corriendo' && vm.state !== 'pausada') return;
  let html = '';
  if (d.big !== undefined) html += '<div class="hud-center"><div class="hud-big">' + esc(d.big) + '</div>' +
    (d.sub ? '<div class="hud-sub">' + esc(d.sub) + '</div>' : '') + '</div>';
  if (d.vel !== undefined) html += '<div class="hud-panel hud-tl"><b>' + d.vel + '</b> km/h' +
    (d.lap !== undefined ? '<br>Vuelta ' + d.lap + '/3' : '') +
    (d.time !== undefined ? '<br>' + d.time : '') +
    (d.pos !== undefined ? '<br>P' + d.pos : '') + '</div>';
  if (d.boost !== undefined && d.vel !== undefined) {
    html += '<div class="hud-panel hud-br">TURBO<div class="bar"><i style="width:' + d.boost + '%"></i></div>' +
      (d.drift ? '<em class="flash">¡DERRAPE!</em>' : '') +
      (d.off ? '<em class="warn">FUERA DE PISTA</em>' : '') + '</div>';
  }
  if (d.shield !== undefined) {
    html += '<div class="hud-panel hud-tl">ESCUDO<div class="bar sh"><i style="width:' + d.shield + '%"></i></div>' +
      'CASCO<div class="bar hu"><i style="width:' + d.hull + '%"></i></div></div>';
    html += '<div class="hud-panel hud-tr">PUNTOS ' + d.score + '<br>OLEADA ' + d.wave +
      '<br>ENEMIGOS ' + d.enemies + '<br>TURBO<div class="bar"><i style="width:' + d.boost + '%"></i></div></div>';
    html += '<div class="crosshair"></div>';
    if (d.radar && d.radar.length) {
      html += '<div class="radar">' + d.radar.map(function (p) {
        return '<i style="left:' + (50 + p.x * 46) + '%;top:' + (50 + p.y * 46) + '%"></i>';
      }).join('') + '</div>';
    }
  }
  if (d.gems !== undefined) {
    html += '<div class="hud-panel hud-tl">GEMAS ' + d.gems + '/' + d.total + '<br>' + d.time + ' s</div>';
    html += '<div class="hud-panel hud-bc">' + esc(d.tip || '') + '</div>';
  }
  el.innerHTML = html;
  const fpsEl = $('fps');
  if (fpsEl) fpsEl.textContent = vm.fps + ' fps · ' + vm.gpu.backend + ' · ' + vm.gpu.drawCalls + ' draws';
}

/* ---------------- panel de controles del juego ---------------- */
function buildControls(pkg) {
  const box = $('controls');
  box.innerHTML = '<h4>' + esc(pkg.title) + ' — CONTROLES</h4>' + (pkg.controls || []).map(function (c) {
    return '<div class="ctl"><span class="k">' + esc(c.keys || '') + '</span><span>' + esc(c.label) + '</span>' +
      '<span class="pad">' + esc(c.pad || '') + '</span></div>';
  }).join('');
}

/* ---------------- chips de estado ---------------- */
function refreshChips() {
  const gp = vm.input.gamepadInfo;
  $('chipPad').textContent = gp ? 'MANDO: ' + gp.id.slice(0, 34) : 'MANDO: no conectado (teclado activo)';
  $('chipState').textContent = 'VM: ' + vm.state;
}

/* ---------------- barra de botones ---------------- */
$('btnFs').addEventListener('click', goFullscreen);
function goFullscreen() {
  const el = $('stage');
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (fn) { try { fn.call(el); } catch (e) { NGLog.push('UI', 'fullscreen falló: ' + e.message); } }
  else NGLog.push('UI', 'fullscreen no soportado en este navegador');
  setTimeout(function () { vm.fitCanvas(); }, 120);
}
document.addEventListener('fullscreenchange', function () {
  setTimeout(function () { vm.fitCanvas(); }, 60);
});
document.addEventListener('webkitfullscreenchange', function () {
  setTimeout(function () { vm.fitCanvas(); }, 60);
});
window.addEventListener('keydown', function (e) {
  if (e.code === 'KeyF' && current.pkg && !e.repeat) goFullscreen();
});

$('btnSound').addEventListener('click', function () {
  const on = vm.audio.ensure();
  vm.audio.setMuted(vm.audio.muted ? false : true);
  this.textContent = 'Sonido: ' + (!on ? 'no disponible' : (vm.audio.muted ? 'silenciado' : 'activado'));
});
$('btnSave').addEventListener('click', function () {
  if (vm.saveToSlot()) flashBtn(this, '¡Guardado!');
});
$('btnLoad').addEventListener('click', function () {
  if (vm.loadFromSlot()) flashBtn(this, '¡Cargado!'); else flashBtn(this, 'Sin datos');
});
$('btnRewind').addEventListener('mousedown', startRewind);
$('btnRewind').addEventListener('touchstart', function (e) { e.preventDefault(); startRewind(); }, { passive: false });
['mouseup', 'mouseleave', 'touchend'].forEach(function (ev) {
  $('btnRewind').addEventListener(ev, stopRewind);
});
function startRewind() {
  if (rewindHold) return;
  const btn = $('btnRewind');
  const step = function () {
    const n = vm.rewind();
    btn.textContent = n ? '−' + (n / 60).toFixed(1) + 's' : 'Inicio';
    rewindHold = setTimeout(step, 90);
  };
  step();
}
function stopRewind() { if (rewindHold) { clearTimeout(rewindHold); rewindHold = null; $('btnRewind').textContent = 'Rebobinar'; } }
$('btnReset').addEventListener('click', function () { if (current.pkg) boot(current.pkg); });
$('btnLog').addEventListener('click', function () {
  const p = $('serial');
  p.classList.toggle('open');
  this.textContent = p.classList.contains('open') ? 'Cerrar registro' : 'Registro serial';
});
$('btnExit').addEventListener('click', function () {
  vm.stopLoop();
  vm.audio.stopAllLoops(); vm.audio.stopMusic();
  current.pkg = null;
  $('overlay').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('bar').classList.add('hidden');
});

/* ---------------- calidad ---------------- */
$('selQuality').addEventListener('change', function () {
  const v = this.value;
  if (v === 'auto') { vm.quality.auto = true; vm.quality.resScale = 1; }
  else vm.setResScale(parseFloat(v));
  NGLog.push('UI', 'calidad → ' + v);
});

/* ---------------- panel de error ---------------- */
function showHalt(e) {
  const p = $('halt');
  p.classList.remove('hidden');
  $('haltMsg').textContent = (e && e.message) ? e.message : String(e);
  $('haltStack').textContent = (e && e.stack) ? e.stack.split('\n').slice(0, 4).join('\n') : '';
}
function hideHalt() { $('halt').classList.add('hidden'); }
$('btnRetry').addEventListener('click', function () { if (current.pkg) boot(current.pkg); });
$('btnExitHalt').addEventListener('click', function () { $('btnExit').click(); });
function flashBtn(b, msg) {
  const old = b.textContent;
  b.textContent = msg;
  setTimeout(function () { b.textContent = old; }, 900);
}

/* ---------------- controles táctiles ---------------- */
function setupTouch(pkg) {
  const t = $('touch');
  if (!('ontouchstart' in window)) { t.classList.add('hidden'); return; }
  t.classList.remove('hidden');
  const stick = $('stick'), knob = $('knob');
  let sid = null, origin = null;
  const touchState = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, btn: {} };
  function stickMove(e) {
    for (const tc of e.touches) {
      if (tc.identifier !== sid) continue;
      const dx = (tc.clientX - origin.x) / 48, dy = (tc.clientY - origin.y) / 48;
      const l = Math.hypot(dx, dy) || 1, cl = Math.min(1, l);
      touchState.move.x = dx / l * cl;
      touchState.move.y = dy / l * cl;
      knob.style.transform = 'translate(' + (dx / l * cl * 34) + 'px,' + (dy / l * cl * 34) + 'px)';
    }
  }
  stick.addEventListener('touchstart', function (e) {
    const tc = e.changedTouches[0];
    sid = tc.identifier;
    const r = stick.getBoundingClientRect();
    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener('touchmove', stickMove, { passive: false });
  stick.addEventListener('touchend', function () {
    sid = null; touchState.move.x = 0; touchState.move.y = 0;
    knob.style.transform = 'translate(0,0)';
  });
  document.querySelectorAll('.tbtn').forEach(function (b) {
    const act = b.getAttribute('data-act');
    b.addEventListener('touchstart', function (e) { e.preventDefault(); touchState.btn[act] = 1; b.classList.add('on'); }, { passive: false });
    b.addEventListener('touchend', function () { touchState.btn[act] = 0; b.classList.remove('on'); });
  });
  vm.input.setTouch(touchState);
}

/* ---------------- utilidades ---------------- */
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
window.__renderHud = renderHud;
setInterval(function () {
  renderHud();
  const pre = $('serialBody');
  if (pre && $('serial').classList.contains('open')) pre.textContent = NGLog.dump();
  refreshChips();
}, 120);

/* ---------------- arranque de página ---------------- */
buildLibrary();
vm.fitCanvas();
window.addEventListener('resize', function () { vm.fitCanvas(); });
// ?game=id resalta la tarjeta (el usuario pulsa para iniciar: gesto necesario para audio)
const q = new URLSearchParams(location.search).get('game');
if (q) {
  const pkg = NG.NGPackage.get(q);
  if (pkg) {
    const cards = document.querySelectorAll('.card');
    // la biblioteca se ordena igual que NGPackage.list()
    const idx = NG.NGPackage.list().indexOf(pkg);
    if (cards[idx]) cards[idx].classList.add('featured');
    NGLog.push('UI', 'juego solicitado por URL: ' + q);
  }
}
})();
