/* ============================================================
 * NovaInput v3.0 — Input de BAJA LATENCIA para NovaEmu PS5 Edition
 * - El estado se lee UNA vez por frame dentro del requestAnimationFrame
 * - Cero setTimeout/debounce en la ruta caliente
 * - Gamepad API (DualSense / DualShock / Xbox) con deadzone radial
 * - Edge detection por frame (justPressed)
 * - Controles táctiles virtuales para móvil
 * Prioridad por frame: mando → teclado → táctil (técnica SharpEmu IHostInput)
 * ============================================================ */
'use strict';

class NovaInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // códigos físicos presionados ahora
    this.prevButtons = {};          // snapshot frame anterior
    this.gamepadIndex = -1;
    this.touch = { active: false, x: 0, y: 0, a: false, b: false, start: false };
    this.state = this._blank();
    this.prev = this._blank();
    this.anyActivity = false;
    this._bindKeyboard();
    this._bindGamepadEvents();
    this._bindTouch();
  }

  _blank() {
    return {
      // stick izquierdo (movimiento)
      mx: 0, my: 0,           // -1..1 (my: +1 = adelante)
      // botones estilo PS
      cross: false, circle: false, square: false, triangle: false,
      l1: false, r1: false, l2: 0, r2: 0,
      start: false, back: false,
      up: false, down: false, left: false, right: false,
      l3x: 0, l3y: 0, r3x: 0, r3y: 0
    };
  }

  _bindKeyboard() {
    // preventDefault SOLO en teclas de juego para no romper la página
    const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Enter', 'Escape', 'Backspace', 'Tab', 'KeyQ', 'KeyE', 'KeyR', 'KeyF']);
    // fallback: algunos entornos (headless, layouts raros) envían code vacío → deducir de e.key
    const KEY_FALLBACK = { ' ': 'Space', 'Enter': 'Enter', 'Escape': 'Escape', 'Backspace': 'Backspace', 'Tab': 'Tab', 'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown', 'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight', 'Shift': 'ShiftLeft', 'w': 'KeyW', 'a': 'KeyA', 's': 'KeyS', 'd': 'KeyD', 'q': 'KeyQ', 'e': 'KeyE', 'r': 'KeyR', 'f': 'KeyF', 'i': 'KeyI', 'j': 'KeyJ', 'k': 'KeyK', 'u': 'KeyU', 'p': 'KeyP', 'x': 'KeyX', 'z': 'KeyZ', 'W': 'KeyW', 'A': 'KeyA', 'S': 'KeyS', 'D': 'KeyD', 'Q': 'KeyQ', 'E': 'KeyE', 'R': 'KeyR', 'F': 'KeyF' };
    const codeOf = e => e.code || KEY_FALLBACK[e.key] || e.key;
    window.addEventListener('keydown', e => {
      const c = codeOf(e);
      if (GAME_KEYS.has(c)) e.preventDefault();
      this.keys.add(c);
      this.anyActivity = true;
    }, { passive: false });
    window.addEventListener('keyup', e => {
      this.keys.delete(codeOf(e));
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  _bindGamepadEvents() {
    window.addEventListener('gamepadconnected', e => {
      this.gamepadIndex = e.gamepad.index;
      this._gamepadInfo = { id: e.gamepad.id, buttons: e.gamepad.buttons.length, axes: e.gamepad.axes.length };
    });
    window.addEventListener('gamepaddisconnected', e => {
      if (e.gamepad.index === this.gamepadIndex) { this.gamepadIndex = -1; this._gamepadInfo = null; }
    });
  }

  _bindTouch() {
    const c = this.canvas;
    let stickId = null, stickCX = 0, stickCY = 0, stickR = 56;
    const onStart = e => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.5 && stickId === null) {
          stickId = t.identifier; stickCX = t.clientX; stickCY = t.clientY;
          this.touch.active = true; this.anyActivity = true;
        }
      }
      e.preventDefault();
    };
    const onMove = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          const dx = t.clientX - stickCX, dy = t.clientY - stickCY;
          const len = Math.hypot(dx, dy) || 1;
          const k = Math.min(1, len / stickR);
          this.touch.x = (dx / len) * k; this.touch.y = (dy / len) * k;
        }
      }
      e.preventDefault();
    };
    const onEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.touch.active = false; this.touch.x = 0; this.touch.y = 0;
        }
      }
    };
    c.addEventListener('touchstart', onStart, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onEnd, { passive: false });
    c.addEventListener('touchcancel', onEnd, { passive: false });
    // botones táctiles dibujados por la UI (A = cross, B = circle)
    this.setTouchButton = (name, v) => { this.touch[name] = v; };
  }

  /* deadzone radial con reescalado (respuesta lineal fuera del deadzone) */
  static applyDeadzone(x, y, dz = 0.18) {
    const len = Math.hypot(x, y);
    if (len < dz) return [0, 0];
    const k = (len - dz) / (1 - dz) / len;
    return [x * k, y * k];
  }

  get gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex >= 0 && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected) { this.gamepadIndex = p.index; return p; }
    return null;
  }

  /* ---- llamado UNA vez por frame desde el RAF ---- */
  update() {
    this.prev = this.state;
    const s = this._blank();
    const K = this.keys;

    // --- teclado → stick y botones ---
    let mx = 0, my = 0;
    if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) mx += 1;
    if (K.has('KeyW') || K.has('ArrowUp')) my += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) my -= 1;
    s.cross = K.has('Space') || K.has('Enter') || K.has('KeyJ');
    s.circle = K.has('Escape') || K.has('Backspace') || K.has('KeyK');
    s.square = K.has('ShiftLeft') || K.has('KeyU');
    s.triangle = K.has('KeyI');
    s.l1 = K.has('KeyQ');
    s.r1 = K.has('KeyE') || K.has('ShiftRight');
    s.l2 = K.has('KeyZ') ? 1 : 0;
    s.r2 = K.has('KeyX') ? 1 : 0;
    s.start = K.has('Enter') || K.has('KeyP');
    s.back = K.has('Escape');
    s.up = K.has('ArrowUp') || K.has('KeyW');
    s.down = K.has('ArrowDown') || K.has('KeyS');
    s.left = K.has('ArrowLeft') || K.has('KeyA');
    s.right = K.has('ArrowRight') || K.has('KeyD');

    // --- Gamepad API (poll por frame, sin eventos) ---
    const gp = this.gamepad;
    if (gp) {
      const [ax, ay] = NovaInput.applyDeadzone(gp.axes[0] || 0, gp.axes[1] || 0);
      mx += ax; my += -ay; // gamepad Y invertida
      if (gp.axes.length > 3) {
        const [rx, ry] = NovaInput.applyDeadzone(gp.axes[2] || 0, gp.axes[3] || 0, 0.22);
        s.r3x = rx; s.r3y = -ry;
      }
      const B = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const V = i => (gp.buttons[i] && gp.buttons[i].value) || 0;
      // mapping estándar: 0=cross 1=circle 2=square 3=triangle 4=L1 5=R1 6=L2 7=R2 8=share 9=options 10=L3 11=R3 12-15=dpad 16=PS
      s.cross = s.cross || B(0); s.circle = s.circle || B(1);
      s.square = s.square || B(2); s.triangle = s.triangle || B(3);
      s.l1 = s.l1 || B(4); s.r1 = s.r1 || B(5);
      s.l2 = Math.max(s.l2, V(6)); s.r2 = Math.max(s.r2, V(7));
      s.back = s.back || B(8) || B(16);
      s.start = s.start || B(9);
      s.up = s.up || B(12); s.down = s.down || B(13);
      s.left = s.left || B(14); s.right = s.right || B(15);
      this.anyActivity = this.anyActivity || gp.buttons.some(b => b.pressed) || Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) > 0.2;
    }

    // --- táctil ---
    if (this.touch.active) { mx += this.touch.x; my += -this.touch.y; }
    if (this.touch.a) s.cross = true;
    if (this.touch.b) s.circle = true;
    if (this.touch.start) s.start = true;

    s.mx = Math.max(-1, Math.min(1, mx));
    s.my = Math.max(-1, Math.min(1, my));
    this.state = s;
  }

  /* consultas: held (este frame) y justPressed (edge por frame) */
  get mx() { return this.state.mx; }
  get my() { return this.state.my; }
  held(name) { return !!this.state[name]; }
  pressed(name) { return !!this.state[name] && !this.prev[name]; }
  released(name) { return !this.state[name] && !!this.prev[name]; }
  axis(name) { return this.state[name] || 0; }

  /* para el test de mando en la UI */
  snapshot() { return { keys: [...this.keys], state: this.state, pad: this._gamepadInfo || null, touch: { ...this.touch } }; }
}

if (typeof window !== 'undefined') window.NovaInput = NovaInput;
if (typeof module !== 'undefined') module.exports = NovaInput;
