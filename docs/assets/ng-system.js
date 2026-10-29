/* ============================================================
   NovaEmu NG — capa de sistema: VM, módulos, input, audio, paquetes
   Técnicas de la escena real:
   - Módulos con cadena de fallbacks + tabla sysmodule (AnyPS5 libSceSysmodule, SharpEmu KernelModuleRegistry)
   - Input por backends unificados (SharpEmu IHostInput: DualSense/XInput/teclado)
   - Stubs auditables que no rompen la VM (AnyPS5: auditoría de imports)
   - Watchdog + recuperación de crashes (KytyPS5 hostException.cpp)
   - Logging serial por subsistemas (SharpEmu import-result-logging)
   - Save states + rewind (objetivo "indestructible" del producto)
   ============================================================ */
(function () {
'use strict';
const NG = window.NG;

/* ---------------- registro serial ---------------- */
NG.NGLog = {
  buf: [],
  push: function (tag, msg) {
    this.buf.push({ t: Date.now(), tag: tag, msg: msg });
    if (this.buf.length > 600) this.buf.shift();
  },
  dump: function () {
    return this.buf.map(function (l) { return '[' + l.tag + '] ' + l.msg; }).join('\n');
  },
  clear: function () { this.buf.length = 0; }
};
window.NGLog = NG.NGLog; // referencia global para todos los subsistemas

/* ---------------- input unificado por backends ---------------- */
// Normaliza un evento de teclado a código canónico aunque el navegador no envíe e.code
function normCode(e) {
  if (e.code) return e.code;
  const k = String(e.key || '').toLowerCase();
  if (!k) return '';
  if (/^[a-z]$/.test(k)) return 'Key' + k.toUpperCase();
  if (/^arrow(\w+)$/.test(k)) return 'Arrow' + k.slice(5, 6).toUpperCase() + k.slice(6);
  if (/^[0-9]$/.test(k)) return 'Digit' + k;
  const mapa = { ' ': 'Space', 'spacebar': 'Space', 'shift': 'ShiftLeft', 'control': 'ControlLeft',
    'alt': 'AltLeft', 'enter': 'Enter', 'escape': 'Escape', 'esc': 'Escape', 'tab': 'Tab' };
  return mapa[k] || '';
}
NG.NGInput = function () {
  this.keys = {};
  this.touch = { move: {x:0,y:0}, look: {x:0,y:0}, btn: {} };
  this.keyMap = {}; // acción → [códigos de tecla]
  this.deadzone = 0.16;
  const self = this;
  this._kd = function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const code = normCode(e);
    if (!code) return;
    self.keys[code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(code) >= 0) e.preventDefault();
  };
  this._ku = function (e) {
    const code = normCode(e);
    if (code) self.keys[code] = false;
  };
  window.addEventListener('keydown', this._kd, { passive: false });
  window.addEventListener('keyup', this._ku);
  this.gamepadInfo = null;
  window.addEventListener('gamepadconnected', function (e) {
    self.gamepadInfo = { id: e.gamepad.id, index: e.gamepad.index };
    NGLog.push('PAD', 'mando conectado: ' + e.gamepad.id);
  });
  window.addEventListener('gamepaddisconnected', function (e) {
    if (self.gamepadInfo && self.gamepadInfo.index === e.gamepad.index) {
      self.gamepadInfo = null;
      NGLog.push('PAD', 'mando desconectado');
    }
  });
  this.state = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
    btn: { a:0, b:0, x:0, y:0, lt:0, rt:0, start:0, select:0, up:0, down:0, left:0, right:0 },
    backend: 'teclado', padName: ''
  };
  this._prevPressed = {};
  this.script = null; // tests: input determinista (golden frames estilo Kyty)
  this._scriptN = 0;
};
NG.NGInput.prototype.setKeyMap = function (map) { this.keyMap = map || {}; };
NG.NGInput.prototype.setTouch = function (t) {
  if (t.move) this.touch.move = t.move;
  if (t.look) this.touch.look = t.look;
  if (t.btn) this.touch.btn = t.btn;
};
NG.NGInput.prototype._keyAction = function (action) {
  const codes = this.keyMap[action] || [];
  for (let i = 0; i < codes.length; i++) if (this.keys[codes[i]]) return 1;
  return 0;
};
function dz(v) { return Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84; }
NG.NGInput.prototype.poll = function () {
  // script determinista (tests golden-frame): devuelve estado fijo por llamada
  if (this.script) {
    const s = this.script;
    this._scriptN++;
    return typeof s === 'function' ? s(this._scriptN) : s;
  }
  const st = this.state;
  // 1) teclado (siempre activo — backend de respaldo, como el fallback de teclado de SharpEmu)
  let mx = (this._keyAction('right') - this._keyAction('left'));
  let my = (this._keyAction('down') - this._keyAction('up'));
  let lx = this._keyAction('lookR') - this._keyAction('lookL');
  let ly = this._keyAction('lookD') - this._keyAction('lookU');
  st.move.x = mx; st.move.y = my; st.look.x = lx; st.look.y = ly;
  for (const b of ['a','b','x','y','lt','rt','start','select']) st.btn[b] = this._keyAction(b);
  st.up = this._keyAction('up'); st.down = this._keyAction('down');
  st.left = this._keyAction('left'); st.right = this._keyAction('right');
  st.backend = 'teclado'; st.padName = '';
  // 2) táctil (suma sobre teclado)
  st.move.x += this.touch.move.x; st.move.y += this.touch.move.y;
  st.look.x += this.touch.look.x; st.look.y += this.touch.look.y;
  for (const b in this.touch.btn) if (this.touch.btn[b]) st.btn[b] = 1;
  // 3) mando real (Gamepad API — sobrescribe, prioridad máxima)
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
  let gp = null;
  for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
  if (gp) {
    const ax = gp.axes, bt = gp.buttons;
    const gpx = ax.length > 0 ? dz(ax[0]) : 0, gpy = ax.length > 1 ? dz(ax[1]) : 0;
    const glx = ax.length > 2 ? dz(ax[2]) : 0, gly = ax.length > 3 ? dz(ax[3]) : 0;
    if (Math.abs(gpx) > 0) st.move.x = gpx;
    if (Math.abs(gpy) > 0) st.move.y = gpy;
    st.look.x = glx; st.look.y = gly;
    const pressed = function (i) { return bt[i] && (bt[i].pressed || bt[i].value > 0.3) ? 1 : 0; };
    st.btn.a = pressed(0) || st.btn.a;      // cruz / A
    st.btn.b = pressed(1) || st.btn.b;      // círculo / B
    st.btn.x = pressed(2) || st.btn.x;      // cuadrado / X
    st.btn.y = pressed(3) || st.btn.y;      // triángulo / Y
    st.btn.lt = pressed(6) || st.btn.lt;    // L2
    st.btn.rt = pressed(7) || st.btn.rt;    // R2
    st.btn.start = pressed(9) || st.btn.start;
    st.btn.select = pressed(8) || st.btn.select;
    st.up = pressed(12); st.down = pressed(13); st.left = pressed(14); st.right = pressed(15);
    st.backend = 'mando'; st.padName = gp.id;
  }
  st.move.x = Math.max(-1, Math.min(1, st.move.x));
  st.move.y = Math.max(-1, Math.min(1, st.move.y));
  return st;
};
NG.NGInput.prototype.injectGamepad = function (fake) {
  // Para tests: mando virtual determinista
  const st = this.state;
  if (fake.move) { st.move.x = fake.move.x; st.move.y = fake.move.y; }
  if (fake.btn) for (const b in fake.btn) st.btn[b] = fake.btn[b] ? 1 : 0;
  if (fake.look) { st.look.x = fake.look.x; st.look.y = fake.look.y; }
  return st;
};

/* ---------------- audio sintetizado (WebAudio, fallback silencioso) ---------------- */
NG.NGAudio = function () {
  this.ctx = null; this.master = null; this.muted = false;
  this.loops = {}; this.musicTimer = null; this.backend = 'pendiente';
};
NG.NGAudio.prototype.ensure = function () {
  if (this.ctx) {
    if (this.ctx.state === 'suspended') {
      try { const p = this.ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('sin AudioContext');
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.backend = 'webaudio';
    NGLog.push('AUDIO', 'backend webaudio activo');
    return true;
  } catch (e) {
    this.backend = 'silencio';
    NGLog.push('AUDIO', 'fallback a silencio: ' + e.message);
    return false;
  }
};
NG.NGAudio.prototype.setMuted = function (m) {
  this.muted = m;
  if (this.master) this.master.gain.value = m ? 0 : 0.5;
};
NG.NGAudio.prototype._osc = function (type, f0, f1, dur, vol, delay) {
  if (!this.ctx || this.muted) return;
  try {
    const t0 = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) { /* audio defensivo: nunca rompe el frame */ }
};
NG.NGAudio.prototype._noise = function (dur, vol, freq) {
  if (!this.ctx || this.muted) return;
  try {
    const t0 = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  } catch (e) { /* defensivo */ }
};
NG.NGAudio.prototype.sfx = function (name, opt) {
  opt = opt || {};
  switch (name) {
    case 'laser':   this._osc('square', 880, 220, 0.12, 0.18); break;
    case 'shoot':   this._osc('square', 660, 180, 0.10, 0.16); break;
    case 'hit':     this._noise(0.15, 0.3, 700); break;
    case 'boom':    this._noise(0.5, 0.5, 400); this._osc('sine', 120, 40, 0.4, 0.4); break;
    case 'coin':    this._osc('sine', 990, 990, 0.06, 0.2); this._osc('sine', 1320, 1320, 0.09, 0.2, 0.06); break;
    case 'jump':    this._osc('sine', 300, 600, 0.12, 0.2); break;
    case 'boost':   this._osc('sawtooth', 200, 900, 0.25, 0.22); break;
    case 'ui':      this._osc('sine', 700, 700, 0.05, 0.15); break;
    case 'win':     [523,659,784,1046].forEach(function (f, i) { /* fanfarria */ }); this._osc('sine', 523, 1046, 0.6, 0.25); break;
    case 'lose':    this._osc('sawtooth', 220, 60, 0.7, 0.3); break;
    case 'skid':    this._noise(opt.dur || 0.2, 0.12, 2200); break;
    default:        this._osc('sine', 440, 440, 0.08, 0.15);
  }
};
NG.NGAudio.prototype.startLoop = function (id, opt) {
  if (!this.ctx) return null;
  try {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = opt.type || 'sawtooth'; o.frequency.value = opt.freq || 80;
    f.type = 'lowpass'; f.frequency.value = opt.filter || 500;
    g.gain.value = opt.vol || 0.08;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    const h = { osc: o, gain: g, filter: f };
    this.loops[id] = h;
    return h;
  } catch (e) { return null; }
};
NG.NGAudio.prototype.setLoop = function (id, freq, vol) {
  const h = this.loops[id];
  if (!h || !this.ctx) return;
  try {
    h.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    if (vol !== undefined) h.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  } catch (e) { /* defensivo */ }
};
NG.NGAudio.prototype.stopLoop = function (id) {
  const h = this.loops[id];
  if (!h) return;
  try { h.osc.stop(); } catch (e) {}
  delete this.loops[id];
};
NG.NGAudio.prototype.stopAllLoops = function () { for (const id in this.loops) this.stopLoop(id); };
NG.NGAudio.prototype.playMusic = function (notes, bpm, type) {
  // secuenciador simple: notes = [freqs por paso, 0 = silencio]
  this.stopMusic();
  if (!this.ctx || this.muted) return;
  const self = this;
  let step = 0;
  const stepDur = 60 / bpm / 2;
  this.musicTimer = setInterval(function () {
    if (!self.ctx || self.muted) return;
    const f = notes[step % notes.length];
    if (f) self._osc(type || 'triangle', f, f, stepDur * 0.9, 0.06);
    step++;
  }, stepDur * 1000);
};
NG.NGAudio.prototype.stopMusic = function () {
  if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
};

/* ---------------- cargador de paquetes NovaPKG ---------------- */
NG.NGPackage = {
  registry: {},
  validate: function (mf) {
    // Auditoría estilo AnyPS5 tools/import_audit.py — problemas como [LOADER][WARN]
    const problems = [];
    if (!mf) { problems.push('manifest ausente'); return problems; }
    if (!mf.id || !/^[a-z0-9_-]{2,40}$/.test(mf.id)) problems.push('id inválido: ' + mf.id);
    if (!mf.title) problems.push('title ausente');
    if (!mf.genre) problems.push('genre ausente');
    if (!Array.isArray(mf.controls) || !mf.controls.length) problems.push('controls ausente');
    if (!mf.version) problems.push('version ausente');
    return problems;
  },
  register: function (manifest, factory) {
    const problems = this.validate(manifest);
    if (problems.length) NGLog.push('LOADER', 'WARN paquete ' + (manifest && manifest.id) + ': ' + problems.join('; '));
    if (!manifest || !manifest.id || this.registry[manifest.id]) {
      NGLog.push('LOADER', 'registro rechazado/duplicado: ' + (manifest && manifest.id));
      return false;
    }
    manifest.problems = problems;
    manifest.factory = factory;
    this.registry[manifest.id] = manifest;
    NGLog.push('LOADER', 'paquete registrado: ' + manifest.id + ' v' + (manifest.version || '?'));
    return true;
  },
  get: function (id) { return this.registry[id] || null; },
  list: function () {
    return Object.keys(this.registry).map(function (k) { return NG.NGPackage.registry[k]; });
  },
  buildFromUserCode: function (obj) {
    // Paquete del usuario: {id,title,...,code:"return {...}"} → se compila aislado
    try {
      if (!obj || typeof obj.code !== 'string') throw new Error('campo code ausente');
      const mf = {
        id: obj.id, title: obj.title || 'Paquete de usuario', genre: obj.genre || 'juego',
        version: obj.version || '1.0', controls: obj.controls || [
          { action: 'move', label: 'Mover', keys: 'WASD' },
          { action: 'a', label: 'Acción', keys: 'Espacio' }
        ],
        desc: obj.desc || ''
      };
      const problems = this.validate(mf);
      if (problems.length) return { ok: false, problems: problems };
      const fn = new Function('NG', '"use strict";\n' + obj.code);
      const factory = fn(NG);
      if (typeof factory !== 'function') throw new Error('code debe devolver una función factory');
      mf.problems = [];
      mf.factory = factory;
      mf.user = true;
      return { ok: true, pkg: mf };
    } catch (e) {
      return { ok: false, problems: [e.message] };
    }
  }
};

/* ============================================================
   NGVM — máquina virtual de la consola
   ============================================================ */
NG.NGVM = function (opts) {
  opts = opts || {};
  this.canvas = opts.canvas;
  this.tickRate = 60;
  this.dt = 1 / this.tickRate;
  this.state = 'apagada';       // apagada | lista | corriendo | pausada | halteada
  this.game = null; this.pkg = null;
  this.tickCount = 0;
  this.modules = {};
  this.moduleLog = [];
  this.gpu = new NG.NGGPU(this.canvas);
  this.input = new NG.NGInput();
  this.audio = new NG.NGAudio();
  this.rng = new NG.RNG(0xC0FFEE);
  this.hud = { data: {}, set: function (d) { this.data = d; }, clear: function () { this.data = {}; } };
  this.lastError = null;
  this._acc = 0; this._lastT = 0; this._raf = null;
  this.fps = 0; this._fpsT = 0; this._fpsN = 0;
  this._rewind = [];            // anillo de snapshots (rewind 12 s)
  this._rewindEvery = 6;        // snapshot cada 6 ticks = 10 Hz
  this._crashTimes = [];
  this._lastGood = null;
  this.onHalt = opts.onHalt || function () {};
  this.onStateChange = opts.onStateChange || function () {};
  this.quality = { resScale: 1, particles: 1, auto: true };
  this._perfT0 = 0; this._perfFrames = 0;
};
NG.NGVM.prototype._resolveModule = function (name, candidates) {
  // Resolución con cadena de fallbacks (estilo libSceSysmodule de AnyPS5)
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.test()) {
      NGLog.push('SYSMOD', 'módulo ' + name + ': ' + c.name + ' no disponible, probando siguiente');
      continue;
    }
    this.moduleLog.push({ module: name, chosen: c.name, fallbackFrom: i > 0 ? candidates[i-1].name : null });
    NGLog.push('SYSMOD', 'módulo ' + name + ' → ' + c.name + (i > 0 ? ' (fallback desde ' + candidates[i-1].name + ')' : ''));
    return c.name;
  }
  NGLog.push('SYSMOD', 'módulo ' + name + ' sin resolución');
  return null;
};
NG.NGVM.prototype.loadPackage = function (pkg) {
  const self = this;
  this.reset(false);
  NGLog.push('VM', 'boot ' + pkg.id + ' v' + pkg.version);
  if (pkg.problems && pkg.problems.length) {
    NGLog.push('LOADER', 'WARN ' + pkg.id + ': ' + pkg.problems.join('; '));
  }
  // resolver módulos del sistema con fallbacks
  this.modules.gpu = this.gpu.backend || 'null';
  this.modules.audio = this.audio.ensure() ? 'webaudio' : 'silencio';
  this.modules.input = 'gamepad+teclado+touch';
  let saveBackend = 'memoria';
  try { localStorage.setItem('__nova_probe', '1'); localStorage.removeItem('__nova_probe'); saveBackend = 'localstorage'; } catch (e) {}
  this.modules.save = saveBackend;
  this.pkg = pkg;
  this.rng.load(0xC0FFEE ^ (pkg.id.length << 8));
  try {
    this.game = pkg.factory({
      gpu: this.gpu, input: this.input, audio: this.audio, rng: this.rng,
      log: function (tag, msg) { NGLog.push(tag, msg); },
      hud: this.hud, vm: self,
      m4: NG.m4, v3: NG.v3, mesh: NG.mesh, spline: NG.splineCR, c: NG.c
    });
    if (!this.game || typeof this.game.tick !== 'function') throw new Error('factory no devolvió un juego válido');
    if (typeof this.game.start === 'function') this.game.start();
    this.input.setKeyMap(pkg.keyMap || {});
    this.tickCount = 0;
    this.state = 'corriendo';
    this._rewind.length = 0;
    this._lastGood = this.saveState(true);
    this.onStateChange(this.state);
    NGLog.push('VM', 'juego iniciado, módulos: ' + JSON.stringify(this.modules));
    return { ok: true };
  } catch (e) {
    this.lastError = e;
    this.state = 'halteada';
    NGLog.push('VM', 'FATAL en boot: ' + e.message);
    this.onHalt(e, 'boot');
    return { ok: false, error: e };
  }
};
NG.NGVM.prototype.reset = function (relaunch) {
  this.stopLoop();
  if (this.game && typeof this.game.shutdown === 'function') { try { this.game.shutdown(); } catch (e) {} }
  this.audio.stopAllLoops(); this.audio.stopMusic();
  this.game = null; this.pkg = null; this.hud.clear();
  this.lastError = null; this._crashTimes.length = 0;
  this.state = 'apagada';
  this.onStateChange(this.state);
};
NG.NGVM.prototype.saveState = function (memoryOnly) {
  const data = {
    tick: this.tickCount,
    rng: this.rng.save(),
    game: this.game && typeof this.game.serialize === 'function' ? this.game.serialize() : null,
    v: 1
  };
  if (!memoryOnly && this.pkg) {
    try { localStorage.setItem('novaemu_ng_save_' + this.pkg.id, JSON.stringify(data)); } catch (e) {
      NGLog.push('SAVE', 'localStorage lleno — guardado solo en memoria');
    }
  }
  return JSON.stringify(data);
};
NG.NGVM.prototype.restoreState = function (json) {
  try {
    const data = JSON.parse(json);
    if (!data || data.v !== 1) throw new Error('estado incompatible');
    if (this.game && typeof this.game.deserialize === 'function' && data.game !== null) {
      this.game.deserialize(data.game);
    }
    this.tickCount = data.tick || 0;
    this.rng.load(data.rng || 1);
    NGLog.push('SAVE', 'estado restaurado en tick ' + this.tickCount);
    return true;
  } catch (e) {
    NGLog.push('SAVE', 'fallo al restaurar: ' + e.message);
    return false;
  }
};
NG.NGVM.prototype.saveToSlot = function () {
  if (!this.pkg) return false;
  const json = this.saveState(false);
  this._lastGood = json;
  NGLog.push('SAVE', 'guardado en ranura: ' + this.pkg.id);
  return true;
};
NG.NGVM.prototype.loadFromSlot = function () {
  if (!this.pkg) return false;
  let json = null;
  try { json = localStorage.getItem('novaemu_ng_save_' + this.pkg.id); } catch (e) {}
  if (!json) { NGLog.push('SAVE', 'sin guardado previo'); return false; }
  return this.restoreState(json);
};
NG.NGVM.prototype._pushRewind = function () {
  const snap = this.saveState(true);
  this._rewind.push(snap);
  if (this._rewind.length > 120) this._rewind.shift();
};
NG.NGVM.prototype.rewind = function () {
  // rebobina al snapshot ANTERIOR al estado actual (no al propio)
  const prevTick = this.tickCount;
  while (this._rewind.length) {
    const snap = this._rewind.pop();
    let earlier = false;
    try { earlier = JSON.parse(snap).tick < prevTick; } catch (e) { earlier = false; }
    if (earlier && this.restoreState(snap)) return prevTick - this.tickCount;
  }
  return 0;
};
NG.NGVM.prototype._onCrash = function (e, phase) {
  const now = Date.now();
  this._crashTimes = this._crashTimes.filter(function (t) { return now - t < 10000; });
  this._crashTimes.push(now);
  NGLog.push('VM', 'FATAL (' + phase + '): ' + (e && e.stack ? e.stack.split('\n')[0] : e));
  if (this._crashTimes.length >= 3) {
    this.state = 'halteada';
    this.lastError = e;
    this.onHalt(e, phase);
    this.onStateChange(this.state);
    return false;
  }
  // recuperación estilo hostException de Kyty: restaurar último estado bueno y seguir
  if (this._lastGood && this.game && typeof this.game.deserialize === 'function') {
    if (this.restoreState(this._lastGood)) {
      NGLog.push('VM', 'recuperado desde último estado bueno (tick ' + this.tickCount + ')');
      return true;
    }
  }
  return true; // seguir aunque no haya snapshot: la VM no se rinde
};
NG.NGVM.prototype._tickOnce = function () {
  const input = this.input.poll();
  this.game.tick(this.dt, input);
  this.tickCount++;
  if (this.tickCount % this._rewindEvery === 0) {
    this._pushRewind();
    if (this.tickCount % 120 === 0) this._lastGood = this.saveState(true);
  }
};
NG.NGVM.prototype.stepFrame = function (realDt) {
  // un frame: acumulador de timestep fijo (determinista) + render
  if (this.state !== 'corriendo') return;
  this._acc += Math.min(realDt, 0.25);
  let steps = 0;
  while (this._acc >= this.dt && steps < 5) {
    try { this._tickOnce(); }
    catch (e) { if (!this._onCrash(e, 'tick')) return; }
    this._acc -= this.dt;
    steps++;
  }
  try {
    const cmds = [];
    this.game.render(cmds, this.gpu);
    this.gpu.submit(cmds);
  } catch (e) { this._onCrash(e, 'render'); }
  // medición FPS / auto-calidad (PCs viejas)
  this._fpsN++;
  const now = performance.now();
  if (now - this._fpsT > 1000) {
    this.fps = Math.round(this._fpsN * 1000 / (now - this._fpsT));
    this._fpsT = now; this._fpsN = 0;
    if (this.quality.auto && this._perfFrames > 90) {
      if (this.fps < 45 && this.quality.resScale > 0.55) {
        this.quality.resScale = Math.max(0.5, this.quality.resScale - 0.2);
        this._perfFrames = 0;
        NGLog.push('VM', 'auto-calidad → escala ' + this.quality.resScale.toFixed(2));
      }
    }
    this._perfFrames++;
  }
};
NG.NGVM.prototype.startLoop = function () {
  const self = this;
  this._lastT = performance.now();
  function frame(t) {
    self._raf = requestAnimationFrame(frame);
    const dt = (t - self._lastT) / 1000;
    self._lastT = t;
    self.stepFrame(dt);
  }
  this._raf = requestAnimationFrame(frame);
};
NG.NGVM.prototype.stopLoop = function () {
  if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
};
NG.NGVM.prototype.setPaused = function (p) {
  this.state = p ? 'pausada' : 'corriendo';
  this.onStateChange(this.state);
};
NG.NGVM.prototype.hardReset = function () {
  if (!this.pkg) return;
  const pkg = this.pkg;
  this.loadPackage(pkg);
};
NG.NGVM.prototype.setResScale = function (s) {
  this.quality.resScale = s; this.quality.auto = false;
  this.fitCanvas();
};
NG.NGVM.prototype.fitCanvas = function () {
  const wrap = this.canvas.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (this.quality.resScale || 1) * dpr;
  this.gpu.setViewport(Math.floor(rect.width * scale), Math.floor(rect.height * scale));
};
})();
