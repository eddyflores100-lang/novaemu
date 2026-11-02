/* ============================================================
 * VOID SQUADRON — Shooter espacial · NovaEmu PS5 Edition
 * Combate por oleadas, drones enemigos, asteroides, láseres con
 * bloom, explosiones con flash, campo de estrellas, banking.
 * ============================================================ */
'use strict';

(() => {
  const { Node, V3, clamp, lerp, damp } = window.NovaCore;
  const { TexFactory, GeoFactory } = window.NovaTex;

  class SpaceGame {
    constructor(env) {
      this.env = env;
      const { tex, geo } = env;
      this.nodes = [];
      this.t = 0;
      this.score = 0;
      this.lives = 3;
      this.wave = 1;
      this.state = 'play'; // play | gameover
      this.shake = 0;
      this.spawnT = 0;

      const mHull = tex.get('hull', 256, 51);
      const mHex = tex.get('hexpanel', 256, 53);
      const mSand = tex.get('sand', 256, 55);

      /* --- niebla espacial profunda --- */
      const sky = new Node(geo.sphere(400, 32, 20, true), {
        albedo: tex.skyGradient([
          { t: 0, c: [2, 2, 10] }, { t: 0.5, c: [10, 8, 34] },
          { t: 0.8, c: [40, 18, 70] }, { t: 1, c: [90, 40, 110] }
        ]),
        unlit: true, sky: true, emissive: [1, 1, 1], castShadow: false
      });
      this.nodes.push(sky);

      /* --- nebulosa: nubes aditivas suaves (sin transparencia rota) --- */
      this.nebColors = [[0.55, 0.2, 0.95], [0.15, 0.4, 0.95], [0.95, 0.25, 0.55], [0.3, 0.75, 0.95]];

      /* --- estrellas: partículas estáticas lejanas --- */
      this.parts = new window.NovaCore.Particles(env.renderer, 900);
      let sseed = 7;
      const srnd = () => (sseed = (sseed * 16807) % 2147483647) / 2147483647;
      this.stars = [];
      for (let i = 0; i < 240; i++) {
        const st = { pos: [(srnd() - 0.5) * 500, (srnd() - 0.5) * 300, -100 - srnd() * 350], size: 0.5 + srnd() * 1.4, tw: srnd() * 6.28, color: [0.8 + srnd() * 0.2, 0.85 + srnd() * 0.15, 1, 0.9] };
        this.stars.push(st);
      }

      /* --- nave del jugador --- */
      this.ship = this._buildShip(tex, geo, mHull);
      this.nodes.push(...this.ship.nodes);
      this.shipPos = { x: 0, y: 0, vx: 0, vy: 0 };

      /* --- pools de láseres --- */
      this.lasers = [];
      this.laserPool = [];
      for (let i = 0; i < 24; i++) {
        const l = new Node(geo.box(0.09, 0.09, 3.2, 1), { albedo: tex.solid(90, 255, 140), unlit: true, emissive: [0.4, 2.2, 0.8], castShadow: false });
        l.visible = false;
        this.nodes.push(l);
        this.laserPool.push(l);
      }
      this.enemyLasers = [];
      for (let i = 0; i < 16; i++) {
        const l = new Node(geo.box(0.09, 0.09, 2.6, 1), { albedo: tex.solid(255, 80, 80), unlit: true, emissive: [2.2, 0.3, 0.2], castShadow: false });
        l.visible = false;
        this.nodes.push(l);
        this.enemyLasers.push(l);
      }

      /* --- enemigos y asteroides --- */
      this.enemies = [];
      this.rocks = [];
      this.fireT = 0;
      this.enemyFireT = 0;

      /* --- luz: sol lejano frío + relleno magenta --- */
      const R = env.renderer;
      R.sun = { dir: V3.norm([0.4, -0.5, 0.6]), color: [1.35, 1.3, 1.5], ambSky: [0.42, 0.38, 0.6], ambGround: [0.2, 0.15, 0.3], range: 60, strength: 0.85 };
      R.fog = { color: [0.03, 0.02, 0.08], density: 0.0016 };
      R.opts.exposure = 1.45; R.opts.saturation = 1.2; R.opts.bloomAmt = 1.25;
      R.camera.fov = 66 * Math.PI / 180;
      R.camera.far = 900;
      this._hud();
    }

    _buildShip(tex, geo, mHull) {
      const nodes = [];
      const root = new Node(geo.box(0.01, 0.01, 0.01), { castShadow: false });
      root.mat = { albedo: tex.solid(0, 0, 0), castShadow: false };
      nodes.push(root);
      const body = new Node(geo.box(1.7, 0.42, 3.4, 2), { albedo: mHull.albedo, normal: mHull.normal, rough: 0.35, metal: 0.65, normalScale: 0.55 });
      body.pos = [0, 0, 0]; nodes.push(body); body.parent = root;
      const nose = new Node(geo.box(0.5, 0.3, 1.4, 1), { albedo: mHull.albedo, rough: 0.3, metal: 0.7 });
      nose.pos = [0, -0.02, 2.2]; nodes.push(nose); nose.parent = root;
      const cockpit = new Node(geo.box(0.6, 0.34, 1.1, 1), { albedo: tex.solid(30, 60, 90), rough: 0.08, metal: 0.9 });
      cockpit.pos = [0, 0.32, 0.2]; nodes.push(cockpit); cockpit.parent = root;
      const glow = new Node(geo.box(0.3, 0.08, 0.05, 1), { albedo: tex.solid(90, 220, 255), unlit: true, emissive: [0.4, 1.6, 2.0], castShadow: false });
      glow.pos = [0, 0.34, 0.78]; nodes.push(glow); glow.parent = root;
      const wingL = new Node(geo.box(1.5, 0.1, 1.1, 1), { albedo: mHull.albedo, rough: 0.35, metal: 0.6 });
      wingL.pos = [-1.45, 0, -0.5]; wingL.rot = [0, 0, 0.18]; nodes.push(wingL); wingL.parent = root;
      const wingR = new Node(geo.box(1.5, 0.1, 1.1, 1), { albedo: mHull.albedo, rough: 0.35, metal: 0.6 });
      wingR.pos = [1.45, 0, -0.5]; wingR.rot = [0, 0, -0.18]; nodes.push(wingR); wingR.parent = root;
      const engL = new Node(geo.cylinder(0.24, 0.3, 0.7, 10), { albedo: tex.solid(40, 44, 56), rough: 0.4, metal: 0.7 });
      engL.pos = [-0.62, 0, -1.7]; engL.rot = [Math.PI / 2, 0, 0]; nodes.push(engL); engL.parent = root;
      const engR = new Node(geo.cylinder(0.24, 0.3, 0.7, 10), { albedo: tex.solid(40, 44, 56), rough: 0.4, metal: 0.7 });
      engR.pos = [0.62, 0, -1.7]; engR.rot = [Math.PI / 2, 0, 0]; nodes.push(engR); engR.parent = root;
      const flameL = new Node(geo.sphere(0.2, 10, 8), { albedo: tex.solid(110, 200, 255), unlit: true, emissive: [0.6, 1.6, 2.4], castShadow: false });
      flameL.pos = [-0.62, 0, -2.15]; nodes.push(flameL); flameL.parent = root;
      const flameR = new Node(geo.sphere(0.2, 10, 8), { albedo: tex.solid(110, 200, 255), unlit: true, emissive: [0.6, 1.6, 2.4], castShadow: false });
      flameR.pos = [0.62, 0, -2.15]; nodes.push(flameR); flameR.parent = root;
      return { nodes, root, flameL, flameR, wingL, wingR };
    }

    _spawnEnemy() {
      const tex = this.env.tex, geo = this.env.geo;
      const root = new Node(geo.box(0.01, 0.01, 0.01), { castShadow: false });
      root.mat = { albedo: tex.solid(0, 0, 0), castShadow: false };
      this.nodes.push(root);
      const core = new Node(geo.box(1.3, 0.5, 1.3, 1), { albedo: this.env.tex.get('hexpanel', 128, 53).albedo, normal: this.env.tex.get('hexpanel', 128, 53).normal, rough: 0.4, metal: 0.6, tint: [1.3, 0.8, 0.8] });
      core.pos = [0, 0, 0]; this.nodes.push(core); core.parent = root;
      const eye = new Node(geo.sphere(0.3, 10, 8), { albedo: tex.solid(255, 60, 50), unlit: true, emissive: [2.4, 0.25, 0.15], castShadow: false });
      eye.pos = [0, 0, 0.75]; this.nodes.push(eye); eye.parent = root;
      const wings = [];
      for (const sx of [-0.9, 0.9]) {
        const wing = new Node(geo.box(0.7, 0.12, 0.9, 1), { albedo: this.env.tex.get('hexpanel', 128, 53).albedo, rough: 0.4, metal: 0.6, tint: [1.2, 0.75, 0.75] });
        wing.pos = [sx, 0, -0.2]; this.nodes.push(wing); wing.parent = root;
        wings.push(wing);
      }
      const e = {
        root, hp: 2 + Math.floor(this.wave / 3), t: 0,
        pos: [(Math.random() - 0.5) * 36, (Math.random() - 0.5) * 18, -120 - Math.random() * 60],
        weave: Math.random() * 6.28, speed: 13 + Math.random() * 6 + this.wave * 0.7,
        nodes: [root, core, eye, ...wings]
      };
      this.enemies.push(e);
    }

    _spawnRock() {
      const tex = this.env.tex, geo = this.env.geo;
      const r = 1.6 + Math.random() * 3.4;
      const rock = new Node(geo.sphere(r, 9, 7), { albedo: tex.get('sand', 128, 55).albedo, normal: tex.get('sand', 128, 55).normal, rough: 0.95, normalScale: 1.2, tint: [0.85, 0.76, 0.68] });
      rock.pos = [(Math.random() - 0.5) * 70, (Math.random() - 0.5) * 40, -140 - Math.random() * 80];
      rock.rot = [Math.random() * 3, Math.random() * 3, Math.random() * 3];
      rock.spin = [(Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0];
      rock.rs = r;
      this.nodes.push(rock);
      this.rocks.push(rock);
    }

    _fireLaser(fromPos, enemy, speed = 95) {
      const pool = enemy ? this.enemyLasers : this.laserPool;
      const l = pool.find(x => !x.visible);
      if (!l) return;
      l.visible = true;
      l.pos = [...fromPos];
      l._vel = enemy ? [0, 0, speed * 0.55] : [this.aimX * 30, this.aimY * 16, -speed];
      l._life = 2.2;
      this.env.audio.sfx(enemy ? 'hit' : 'shoot');
    }

    _explode(pos, big = false) {
      const n = big ? 36 : 20;
      for (let i = 0; i < n; i++) {
        const c = Math.random();
        this.parts.spawn({
          pos: [...pos],
          vel: [(Math.random() - 0.5) * (big ? 22 : 14), (Math.random() - 0.5) * (big ? 22 : 14), (Math.random() - 0.5) * (big ? 22 : 14)],
          size: 0.25 + Math.random() * 0.5, grow: big ? 3 : 1.4, life: 0.5 + Math.random() * 0.7,
          color: c > 0.55 ? [1, 0.75, 0.25, 1] : c > 0.25 ? [1, 0.35, 0.1, 1] : [1, 0.95, 0.8, 1],
          drag: 2
        });
      }
      this.parts.spawn({ pos: [...pos], size: 1.5 + (big ? 3 : 0), grow: big ? 22 : 10, life: 0.3, color: [1, 0.9, 0.7, 0.9] });
      this.shake = Math.min(1, this.shake + (big ? 0.55 : 0.3));
      this.env.audio.sfx('explode');
    }

  _removeNodeTree(nodelist) {
    for (const nd of nodelist) {
      const idx = this.nodes.indexOf(nd);
      if (idx >= 0) this.nodes.splice(idx, 1);
    }
  }

    update(dt) {
      this.t += dt;
      const R = this.env.renderer, I = this.env.input, A = this.env.audio;
      const sp = this.ship;

      if (this.state === 'gameover') {
        // deriva cinematográfica
        R.camera.pos = [damp(R.camera.pos[0], Math.sin(this.t * 0.3) * 6, 2, dt), damp(R.camera.pos[1], 2 + Math.sin(this.t * 0.2) * 2, 2, dt), damp(R.camera.pos[2], 14, 2, dt)];
        R.camera.target = [0, 0, -30];
        this.parts.update(dt);
        this._hud();
        return this.nodes;
      }

      /* --- movimiento de la nave (respuesta directa del frame) --- */
      const ax = I.mx, ay = I.my;
      const MAXX = 17, MAXY = 9;
      this.shipPos.vx = damp(this.shipPos.vx, ax * 22, 8, dt);
      this.shipPos.vy = damp(this.shipPos.vy, ay * 15, 8, dt);
      this.shipPos.x = clamp(this.shipPos.x + this.shipPos.vx * dt, -MAXX, MAXX);
      this.shipPos.y = clamp(this.shipPos.y + this.shipPos.vy * dt, -MAXY + 2, MAXY);
      this.aimX = ax; this.aimY = ay;

      sp.root.pos = [this.shipPos.x, this.shipPos.y, 4];
      sp.root.rot = [damp(sp.root.rot[0], -ay * 0.3, 8, dt), damp(sp.root.rot[1], -ax * 0.4, 8, dt), damp(sp.root.rot[2], -ax * 0.55, 8, dt)];
      const boost = 0.75 + Math.hypot(ax, ay) * 0.5;
      sp.flameL.scl = [1, 1, boost * (1 + Math.random() * 0.25)];
      sp.flameR.scl = [1, 1, boost * (1 + Math.random() * 0.25)];
      // estela del motor
      if (Math.random() < 0.8) {
        this.parts.spawn({ pos: [sp.root.pos[0] - 0.62 + (Math.random() - 0.5) * 0.1, sp.root.pos[1], sp.root.pos[2] - 2.3], vel: [0, 0, -14], size: 0.16, grow: 0.9, life: 0.4, color: [0.5, 0.9, 1, 0.6] });
        this.parts.spawn({ pos: [sp.root.pos[0] + 0.62, sp.root.pos[1], sp.root.pos[2] - 2.3], vel: [0, 0, -14], size: 0.16, grow: 0.9, life: 0.4, color: [0.5, 0.9, 1, 0.6] });
      }

      /* --- disparo (cross / espacio), cooldown corto --- */
      this.fireT -= dt;
      if (I.held('cross') && this.fireT <= 0) {
        this.fireT = 0.16;
        this._fireLaser([sp.root.pos[0] - 0.55, sp.root.pos[1] - 0.05, sp.root.pos[2] + 1.6], false);
        this._fireLaser([sp.root.pos[0] + 0.55, sp.root.pos[1] - 0.05, sp.root.pos[2] + 1.6], false);
      }

      /* --- spawns por oleada --- */
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.5, 2.2 - this.wave * 0.12);
        if (Math.random() < 0.72) this._spawnEnemy();
        else this._spawnRock();
        if (Math.random() < 0.25) this._spawnRock();
      }
      if (this.t > this.wave * 25) { this.wave++; A.sfx('checkpoint'); }

      /* --- enemigos --- */
      this.enemyFireT -= dt;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.t += dt;
        e.pos[2] += e.speed * dt;
        e.pos[0] += Math.sin(e.t * 1.6 + e.weave) * 6 * dt;
        e.pos[1] += Math.cos(e.t * 1.2 + e.weave) * 3.2 * dt;
        e.root.pos = [...e.pos];
        e.root.rot = [Math.sin(e.t * 2) * 0.12, Math.PI + Math.sin(e.t + e.weave) * 0.2, 0];
        // disparo enemigo
        if (this.enemyFireT <= 0 && e.pos[2] > -70 && e.pos[2] < -14 && Math.random() < 0.35) {
          this.enemyFireT = 0.7;
          this._fireLaser(e.pos, true);
        }
        // choque con el jugador
        if (V3.dist(e.pos, [sp.root.pos[0], sp.root.pos[1], sp.root.pos[2]]) < 2.4) {
          this._explode(e.pos, true);
          this._removeNodeTree(e.nodes);
          this.enemies.splice(i, 1);
          this._hitPlayer();
          continue;
        }
        // alcanzó la retaguardia
        if (e.pos[2] > 12) {
          this._removeNodeTree(e.nodes);
          this.enemies.splice(i, 1);
          continue;
        }
      }

      /* --- asteroides --- */
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const rk = this.rocks[i];
        rk.pos[2] += 9 * dt;
        rk.rot[0] += rk.spin[0] * dt; rk.rot[1] += rk.spin[1] * dt;
        if (rk.pos[2] > 14) { this.nodes.splice(this.nodes.indexOf(rk), 1); this.rocks.splice(i, 1); continue; }
        if (V3.dist(rk.pos, [sp.root.pos[0], sp.root.pos[1], sp.root.pos[2]]) < rk.rs + 1.2) {
          this._explode(rk.pos, true);
          this.nodes.splice(this.nodes.indexOf(rk), 1);
          this.rocks.splice(i, 1);
          this._hitPlayer();
        }
      }

      /* --- láseres --- */
      const moveLasers = (arr, enemy) => {
        for (const l of arr) {
          if (!l.visible) continue;
          l._life -= dt;
          l.pos[0] += l._vel[0] * dt;
          l.pos[1] += l._vel[1] * dt;
          l.pos[2] += l._vel[2] * dt;
          if (l._life <= 0 || l.pos[2] < -160 || l.pos[2] > 14) { l.visible = false; continue; }
          if (enemy) {
            if (V3.dist(l.pos, [sp.root.pos[0], sp.root.pos[1], sp.root.pos[2]]) < 1.3) {
              l.visible = false;
              this._hitPlayer();
            }
          } else {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
              const e = this.enemies[i];
              if (V3.dist(l.pos, e.pos) < 1.6) {
                l.visible = false;
                e.hp--;
                if (e.hp <= 0) {
                  this._explode(e.pos);
                  this._removeNodeTree(e.nodes);
                  this.enemies.splice(i, 1);
                  this.score += 100 * this.wave;
                } else { this.score += 20; A.sfx('hit'); }
                break;
              }
            }
            for (let i = this.rocks.length - 1; i >= 0; i--) {
              const rk = this.rocks[i];
              if (V3.dist(l.pos, rk.pos) < rk.rs + 0.6) {
                l.visible = false;
                this._explode(rk.pos);
                this.nodes.splice(this.nodes.indexOf(rk), 1);
                this.rocks.splice(i, 1);
                this.score += 30;
                break;
              }
            }
          }
        }
      };
      moveLasers(this.laserPool, false);
      moveLasers(this.enemyLasers, true);

      /* --- estrellas titilando --- */
      for (const st of this.stars) {
        if (Math.random() < 0.04) {
          this.parts.spawn({ pos: [...st.pos], vel: [0, 0, 6], size: st.size * (0.7 + Math.sin(this.t * 3 + st.tw) * 0.3), life: 0.4, color: [st.color[0], st.color[1], st.color[2], 0.7] });
        }
      }
      /* --- nubes de nebulosa persistentes --- */
      if (!this.nebT || this.t - this.nebT > 0.25) {
        this.nebT = this.t;
        for (let i = 0; i < 3; i++) {
          const c = this.nebColors[(Math.random() * this.nebColors.length) | 0];
          this.parts.spawn({ pos: [(Math.random() - 0.5) * 320, (Math.random() - 0.5) * 180, -240 - Math.random() * 120], vel: [0, 0, 4], size: 40 + Math.random() * 60, grow: 8, life: 6, color: [c[0], c[1], c[2], 0.1], fade: 0.5 });
        }
      }

      /* --- cámara con shake --- */
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const shx = (Math.random() - 0.5) * this.shake * 0.7, shy = (Math.random() - 0.5) * this.shake * 0.7;
      R.camera.pos = [damp(R.camera.pos[0], this.shipPos.x * 0.42 + shx, 9, dt), damp(R.camera.pos[1], this.shipPos.y * 0.4 + 2.6 + shy, 9, dt), 13.5];
      R.camera.target = [this.shipPos.x * 0.55, this.shipPos.y * 0.5, -18];

      this.parts.update(dt);
      this._hud();
      return this.nodes;
    }

    _hitPlayer() {
      if (this._invT && this.t < this._invT) return;
      this._invT = this.t + 1.4;
      this.lives--;
      this.shake = 1;
      this.env.audio.sfx('crash');
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.env.audio.sfx('lose');
        this._explode([this.ship.root.pos[0], this.ship.root.pos[1], this.ship.root.pos[2]], true);
        this.ship.root.visible = false;
      }
    }

    _hud() {
      const go = this.state === 'gameover';
      this.env.hud(`
        <div class="hud-tl">PUNTOS <b style="color:#7fe0ff">${this.score}</b> · OLEADA ${this.wave}</div>
        <div class="hud-tr">VIDAS ${'◆'.repeat(Math.max(0, this.lives)) || '—'}</div>
        ${go ? `<div class="hud-panel"><h2>PARTIDA TERMINADA</h2>
          <p>Puntuación final <b>${this.score}</b> · Oleada ${this.wave}</p>
          <p class="hint">✕ para reintentar · ○ / ESC para volver al inicio</p></div>` : ''}`);
    }

    handleUI(input) {
      if (this.state === 'gameover' && input.pressed('cross')) {
        this.lives = 3; this.score = 0; this.wave = 1; this.state = 'play';
        this.ship.root.visible = true;
        for (const e of this.enemies) this._removeNodeTree(e.nodes);
        this.enemies.length = 0;
        for (const rk of this.rocks) { const idx = this.nodes.indexOf(rk); if (idx >= 0) this.nodes.splice(idx, 1); }
        this.rocks.length = 0;
      }
      return false;
    }

    dispose() { }

    saveState() { return { score: this.score, lives: this.lives, wave: this.wave, ship: { ...this.shipPos } }; }
    loadState(st) { if (st) { this.score = st.score; this.lives = st.lives; this.wave = st.wave; Object.assign(this.shipPos, st.ship); this.state = 'play'; this.ship.root.visible = true; } }
    rewindSnapshot() { return this.saveState(); }
  }

  window.NovaGames = window.NovaGames || {};
  window.NovaGames.space = {
    id: 'void-squadron',
    title: 'VOID SQUADRON',
    sub: 'Operación Nebulosa',
    genre: 'Shooter espacial · 1 jugador',
    year: '2026',
    gradient: ['#050514', '#3b1e8f', '#c44df0'],
    cover: 'space',
    controls: [
      ['WASD / Stick izq.', 'Pilotar'],
      ['ESPACIO / ✕ (auto)', 'Disparar'],
      ['ESC / ○', 'Pausa']
    ],
    create(env) { return new SpaceGame(env); }
  };
})();
