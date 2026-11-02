/* ============================================================
 * NovaAudio v3.0 — Audio Web Audio API para NovaEmu PS5 Edition
 * SFX sintetizados + música generativa + motor de racing con
 * pitch dinámico. Sin archivos externos. Unlock en 1er gesto.
 * ============================================================ */
'use strict';

class NovaAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.engineNodes = null;
    this.musicTimer = null;
    this.enabled = true;
    this._unlocked = false;
    this.volume = 0.7;
  }

  /* desbloqueo en el primer gesto del usuario (política de autoplay) */
  unlock() {
    if (this._unlocked) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.9;
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.42;
      this.sfxGain.connect(comp); this.musicGain.connect(comp);
      comp.connect(this.master); this.master.connect(this.ctx.destination);
      this._unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (e) { this.enabled = false; return false; }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _now() { return this.ctx.currentTime; }

  /* oscilador básico con envolvente */
  _tone(type, freq, t0, dur, vol, slideTo, dest) {
    if (!this._unlocked || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(t0, dur, vol, filterFreq, q = 1, type = 'bandpass') {
    if (!this._unlocked || !this.enabled) return;
    const len = Math.max(1, (this.ctx.sampleRate * dur) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur);
  }

  /* ---------- SFX ---------- */
  sfx(name) {
    if (!this._unlocked || !this.enabled) return;
    const t = this._now();
    switch (name) {
      case 'ui-move': this._tone('sine', 720, t, 0.07, 0.12, 880); break;
      case 'ui-select': this._tone('sine', 520, t, 0.09, 0.16, 1040); this._tone('sine', 780, t + 0.06, 0.12, 0.12, 1240); break;
      case 'ui-back': this._tone('sine', 600, t, 0.09, 0.13, 320); break;
      case 'ui-boot': this._tone('sine', 220, t, 0.5, 0.2, 440); this._tone('sine', 660, t + 0.18, 0.7, 0.14, 880); break;
      case 'jump': this._tone('square', 300, t, 0.16, 0.12, 640); break;
      case 'land': this._noise(t, 0.1, 0.14, 300, 0.8, 'lowpass'); break;
      case 'coin': this._tone('sine', 988, t, 0.07, 0.15); this._tone('sine', 1319, t + 0.07, 0.16, 0.15); break;
      case 'checkpoint': this._tone('triangle', 523, t, 0.1, 0.15); this._tone('triangle', 659, t + 0.1, 0.1, 0.15); this._tone('triangle', 784, t + 0.2, 0.2, 0.15); break;
      case 'boost': this._noise(t, 0.45, 0.2, 900, 0.6); this._tone('sawtooth', 140, t, 0.4, 0.14, 420); break;
      case 'crash': this._noise(t, 0.4, 0.3, 220, 0.7, 'lowpass'); this._tone('sawtooth', 90, t, 0.3, 0.2, 40); break;
      case 'shoot': this._tone('square', 880, t, 0.08, 0.1, 220); this._noise(t, 0.06, 0.08, 2200, 2); break;
      case 'explode': this._noise(t, 0.6, 0.35, 160, 0.5, 'lowpass'); this._tone('sawtooth', 70, t, 0.5, 0.22, 30); break;
      case 'hit': this._tone('square', 200, t, 0.12, 0.14, 80); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, t + i * 0.13, 0.3, 0.16)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._tone('triangle', f, t + i * 0.16, 0.34, 0.15)); break;
      case 'count': this._tone('sine', 440, t, 0.12, 0.16); break;
      case 'go': this._tone('sine', 880, t, 0.4, 0.2, 660); break;
      case 'rewind': this._tone('sine', 1200, t, 0.2, 0.08, 400); break;
    }
  }

  /* ---------- Motor de racing (loop con pitch por velocidad) ---------- */
  engineStart() {
    if (!this._unlocked || !this.enabled || this.engineNodes) return;
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 27.5;
    const g = c.createGain(); g.gain.value = 0;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 2;
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(f); f.connect(this.sfxGain);
    o1.start(); o2.start();
    this.engineNodes = { o1, o2, g, f };
  }
  engineUpdate(speedNorm, throttle) {
    if (!this.engineNodes) return;
    const { o1, o2, g, f } = this.engineNodes;
    const t = this._now();
    const pitch = 42 + speedNorm * 150;
    o1.frequency.setTargetAtTime(pitch, t, 0.05);
    o2.frequency.setTargetAtTime(pitch / 2, t, 0.05);
    f.frequency.setTargetAtTime(300 + speedNorm * 1400 + throttle * 300, t, 0.08);
    g.gain.setTargetAtTime(0.045 + throttle * 0.05 + speedNorm * 0.05, t, 0.1);
  }
  engineStop() {
    if (!this.engineNodes) return;
    const { o1, o2, g } = this.engineNodes;
    g.gain.setTargetAtTime(0, this._now(), 0.1);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 400);
    this.engineNodes = null;
  }

  /* ---------- Música generativa por juego ----------
     patrón: {bpm, scale:[...], bass:[...], root}  */
  musicStart(pattern) {
    if (!this._unlocked || !this.enabled) return;
    this.musicStop();
    const self = this;
    const stepDur = 60 / pattern.bpm / 2; // corcheas
    let step = 0;
    const timer = setInterval(() => {
      if (!self._unlocked || !self.ctx) return;
      const t = self._now() + 0.03;
      const s = step % 32;
      // bajo
      const bn = pattern.bass[s % pattern.bass.length];
      if (bn) {
        const f = pattern.root * Math.pow(2, bn / 12);
        self._tone('sawtooth', f, t, stepDur * 1.8, 0.1, undefined, self.musicGain);
        self._tone('sine', f / 2, t, stepDur * 1.9, 0.12, undefined, self.musicGain);
      }
      // arpegio
      if (s % 2 === 0) {
        const arp = pattern.scale[(step / 2 | 0) % pattern.scale.length];
        const f = pattern.root * 2 * Math.pow(2, arp / 12);
        self._tone('square', f, t, stepDur * 0.9, 0.045, undefined, self.musicGain);
      }
      // pad cada 2 compases
      if (s === 0 || s === 16) {
        const chord = pattern.scale.slice(0, 3);
        chord.forEach((iv, i) => {
          const f = pattern.root * Math.pow(2, iv / 12);
          self._tone('triangle', f, t, stepDur * 14, 0.028, undefined, self.musicGain);
        });
      }
      // percusión
      if (s % 8 === 0) self._noiseKick(t);
      if (s % 8 === 4) self._noise(t, 0.09, 0.05, 6000, 1.5, 'highpass');
      step++;
    }, stepDur * 1000);
    this.musicTimer = timer;
  }
  _noiseKick(t) {
    if (!this._unlocked) return;
    this._tone('sine', 150, t, 0.14, 0.22, 42, this.musicGain);
  }
  musicStop() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  stopAll() {
    this.musicStop();
    this.engineStop();
  }
}

if (typeof window !== 'undefined') window.NovaAudio = NovaAudio;
if (typeof module !== 'undefined') module.exports = NovaAudio;
