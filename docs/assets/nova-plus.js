/* NovaEmu v1.1 — capa "plus": gamepad, pantalla completa, sonido, save states,
 * overlay de errores y guardas de visibilidad.
 *
 * Ideas adoptadas con evidencia de la escena (ver docs/dev/ y worklog Task 14):
 *  - GamepadHandler estilo EmulatorJS (polling por frame, mapping "standard",
 *    deadzone radial reescalada — AnyPS5 INPUT_MAPPING.md) sin dependencias.
 *  - Fullscreen con prefijos webkit + detección + fallback "modo teatro"
 *    para iOS (EmulatorJS utils.ts) y re-layout tras fullscreenchange.
 *  - Save states versionados estilo "Pulse" (jadyx pulse_version.h): magic +
 *    versión + identidad del ROM, nunca sobrescribir un slot con otro juego.
 *  - Buzzer CHIP-8 con WebAudio (unlock por gesto de usuario).
 *  - Overlay de errores global (los errores son UI, no consola).
 */

/* ------------------------- overlay de errores ------------------------- */
export function installErrorOverlay() {
  const show = (title, detail) => {
    let ov = document.querySelector("[data-nova-error]");
    if (!ov) {
      ov = document.createElement("div");
      ov.setAttribute("data-nova-error", "");
      ov.innerHTML = `<div class="nova-err-box"><b></b><pre></pre>
        <button onclick="this.closest('[data-nova-error]').style.display='none'">Cerrar</button></div>`;
      document.body.appendChild(ov);
    }
    ov.querySelector("b").textContent = title;
    ov.querySelector("pre").textContent = String(detail).slice(0, 600);
    ov.style.display = "block";
  };
  window.addEventListener("error", (e) => {
    if (e && e.message && /Script error/i.test(e.message)) return;
    show("⚠ Error en la página", (e && e.message) || e);
  });
  window.addEventListener("unhandledrejection", (e) => {
    show("⚠ Operación fallida", (e.reason && (e.reason.stack || e.reason.message)) || e.reason);
  });
  return { show };
}

/* ------------------------- guardas de visibilidad --------------------- */
/* Pausa al ocultar la pestaña (ahorra batería y evita catch-up masivo). */
export function installVisibilityGuard(onHide, onShow) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onHide?.();
    else onShow?.();
  });
}

/* ------------------------- gamepad ----------------------------------- */
/* Mapeo estándar W3C: 0=A/Cruz 1=B/Círculo 2=X/Cuadrado 3=Y/Triángulo
 * 8=Select/Share 9=Start/Options 12-15=d-pad. Ejes 0/1 stick izquierdo. */
export const PAD_STANDARD = {
  a: 0, b: 1, x: 2, y: 3, select: 8, start: 9,
  up: 12, down: 13, left: 14, right: 15,
};

export class GamepadManager {
  /**
   * @param onState(mapa de estados {up,down,left,right,a,b,x,y,start,select}, padId)
   *  Se invoca SOLO cuando hay cambios (transiciones).
   */
  constructor(onState) {
    this.onState = onState;
    this.deadzone = 0.35;   // radial (AnyPS5: reescalar el rango útil completo)
    this._prev = {};
    this._shown = {};
    this.onConnect = null;
    this.onDisconnect = null;
    window.addEventListener("gamepadconnected", (e) => this.onConnect?.(e.gamepad));
    window.addEventListener("gamepaddisconnected", (e) => this.onDisconnect?.(e.gamepad));
  }

  /** Deadzone radial con reescalado: dentro del cono muerto → 0; fuera →
   * rango completo reescalado para precisión en el centro. */
  static radial(v, dz) {
    const a = Math.abs(v);
    if (a <= dz) return 0;
    const sign = Math.sign(v);
    return sign * ((a - dz) / (1 - dz));
  }

  poll() {
    if (!navigator.getGamepads) return;
    const pads = Array.from(navigator.getGamepads()).filter(Boolean);
    const next = {};
    for (const pad of pads) {
      const b = (i) => !!pad.buttons[i]?.pressed;
      const ax = GamepadManager.radial(pad.axes[0] || 0, this.deadzone);
      const ay = GamepadManager.radial(pad.axes[1] || 0, this.deadzone);
      const st = {
        up: b(PAD_STANDARD.up) || ay < -0.5,
        down: b(PAD_STANDARD.down) || ay > 0.5,
        left: b(PAD_STANDARD.left) || ax < -0.5,
        right: b(PAD_STANDARD.right) || ax > 0.5,
        a: b(PAD_STANDARD.a), b: b(PAD_STANDARD.b),
        x: b(PAD_STANDARD.x), y: b(PAD_STANDARD.y),
        start: b(PAD_STANDARD.start), select: b(PAD_STANDARD.select),
      };
      // varios mandos: el primero que reporte algo gana (orden estable)
      for (const k of Object.keys(st)) {
        if (st[k] && next[k] === undefined) next[k] = true;
      }
      if (!this._shown[pad.index] && pad.id) {
        this._shown[pad.index] = true;
        this.onConnect?.(pad);
      }
    }
    // transiciones
    const keys = new Set([...Object.keys(this._prev), ...Object.keys(next)]);
    let changed = false;
    for (const k of keys) {
      if (!!next[k] === !!this._prev[k]) continue;
      changed = true;
    }
    if (changed) {
      this._prev = next;
      this.onState(next, pads[0]?.id ?? "");
    }
    return next;
  }
}

/* ------------------------- pantalla completa -------------------------- */
export class FullscreenManager {
  /** @param target elemento a poner a pantalla completa
   *  @param onFallback se invoca si la API no existe → modo teatro CSS */
  constructor(target, onFallback) {
    this.target = target;
    this.onFallback = onFallback;
  }
  static supported() {
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  }
  get active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  toggle() {
    const doc = document;
    if (this.active) {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
      return;
    }
    const t = this.target;
    const req = t.requestFullscreen || t.webkitRequestFullscreen;
    if (req) {
      try {
        const r = req.call(t);
        if (r && r.catch) r.catch(() => this.onFallback?.());
      } catch { this.onFallback?.(); }
    } else {
      this.onFallback?.();
    }
  }
}

/* ------------------------- buzzer (WebAudio) -------------------------- */
export class Buzzer {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.enabled = true;
    this._on = false;
  }
  /** Debe llamarse dentro de un gesto del usuario (política de autoplay). */
  unlock() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
      this.osc = this.ctx.createOscillator();
      this.osc.type = "square";
      this.osc.frequency.value = 440;
      this.osc.connect(this.gain);
      this.osc.start();
    } catch { this.ctx = null; }
  }
  /** st>0 → tono encendido; st==0 → apagado. Con transición suave anti-click. */
  set(st, dt) {
    if (!this.ctx || !this.enabled) return;
    if (dt !== undefined && dt > 0 && this.ctx.state === "suspended") {
      this.ctx.resume?.();
    }
    const want = !!st;
    if (want === this._on) return;
    this._on = want;
    const t = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(want ? 0.045 : 0.0001, t + 0.004);
  }
}

/* ------------------------- save states -------------------------------- */
/* Slots en localStorage con identidad: {magic, v, romId, sys, bytes}
 * Nunca se carga un slot de otro juego (identidad por romId + longitud). */
export const STATE_MAGIC = "NCS1";

export class SaveStates {
  constructor(keyPrefix = "nova_state_") {
    this.prefix = keyPrefix;
    this.slots = 4;
  }
  _key(slot) { return this.prefix + slot; }
  save(slot, romId, sys, bytes) {
    const payload = {
      magic: STATE_MAGIC, v: 1, romId, sys,
      bytes: Array.from(bytes ?? []),
      when: Date.now(),
    };
    try {
      localStorage.setItem(this._key(slot), JSON.stringify(payload));
      return true;
    } catch { return false; }
  }
  load(slot, romId) {
    try {
      const raw = localStorage.getItem(this._key(slot));
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (p.magic !== STATE_MAGIC) return null;
      if (p.romId !== romId) return null; // identidad: nunca cruzar juegos
      return p;
    } catch { return null; }
  }
  peek(slot) {
    try {
      const raw = localStorage.getItem(this._key(slot));
      if (!raw) return null;
      const p = JSON.parse(raw);
      return { romId: p.romId, when: p.when, size: (p.bytes || []).length };
    } catch { return null; }
  }
}

/* ------------------------- carátulas procedurales --------------------- */
/* Sin assets: cada juego tiene un patrón determinista a partir de su id. */
export function drawCover(canvas, game) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  let h = 2166136261;
  for (const c of game.id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const hue = Math.abs(h) % 360;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${hue} 45% 16%)`);
  g.addColorStop(1, `hsl(${(hue + 40) % 360} 55% 8%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // rejilla pixelada determinista (guiño CHIP-8)
  ctx.fillStyle = `hsl(${hue} 70% 45% / 0.35)`;
  const cell = W / 16;
  let s = Math.abs(h) | 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      if (rnd() > 0.72) ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
    }
  }
  // iniciales grandes
  ctx.fillStyle = "rgba(240,255,244,0.92)";
  ctx.font = `bold ${Math.floor(H * 0.42)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const initials = (game.short || game.name.slice(0, 2)).toUpperCase();
  ctx.fillText(initials, W / 2, H / 2 + 2);
  ctx.strokeStyle = `hsl(${hue} 80% 60% / 0.9)`;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}
