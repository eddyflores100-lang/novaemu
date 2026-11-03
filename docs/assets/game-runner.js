/* ============================================================
 * ASTRA FALLEN — Plataformas 3D · NovaEmu PS5 Edition
 * Robot animado, plataformas flotantes + móviles, orbes de
 * energía, checkpoints, portal final. Coyote time + jump buffer,
 * squash & stretch, polvo al aterrizar, cámara orbital.
 * ============================================================ */
'use strict';

(() => {
  const { Node, V3, clamp, lerp, damp } = window.NovaCore;
  const { TexFactory, GeoFactory } = window.NovaTex;

  class RunnerGame {
    constructor(env) {
      this.env = env;
      const { tex, geo } = env;
      this.nodes = [];
      this.t = 0;
      this.state = 'play'; // play | dead | win
      this.deadT = 0;

      /* --- materiales --- */
      const mTiles = tex.get('tiles', 256, 31);
      const mConcrete = tex.get('concrete', 256, 33);
      const mHull = tex.get('hull', 256, 35);
      const mHex = tex.get('hexpanel', 256, 37);
      const mSand = tex.get('sand', 256, 39);

      /* --- cielo nocturno alienígena PROCEDURAL (estrellas + nubes tenues) --- */
      const sky = new Node(geo.sphere(300, 32, 20, true), {
        albedo: tex.solid(255, 255, 255),
        skyTop: [0.020, 0.026, 0.085], skyHor: [0.72, 0.30, 0.38], skyGnd: [0.10, 0.07, 0.13],
        clouds: 0.22, stars: 0.95,
        unlit: true, sky: true, castShadow: false
      });
      this.nodes.push(sky);

      /* --- niebla al fondo: mar de nubes --- */
      const cloudPlane = new Node(geo.plane(600, 600, 1, 1, 30, true), { albedo: tex.solid(150, 130, 190), rough: 1, normalScale: 0, castShadow: false });
      cloudPlane.y = -14;
      cloudPlane.mat.alpha = 0.9;
      this.nodes.push(cloudPlane);

      /* --- plataformas --- */
      this.platforms = [];
      const P = (x, y, z, w, h, d, mat, opts = {}) => {
        const n = new Node(geo.box(w, h, d, 2), { albedo: mat.albedo, normal: mat.normal, rough: mat.rough, normalScale: mat.normalScale, tint: opts.tint || [1, 1, 1] });
        n.pos = [x, y, z];
        n._w = w; n._h = h; n._d = d; n._vel = [0, 0, 0];
        n.baseX = x; n.baseY = y; n.baseZ = z;
        if (opts.move) { n.move = opts.move; n.castShadow = true; }
        if (opts.glow) n.mat.emissive = opts.glow;
        this.nodes.push(n);
        this.platforms.push(n);
        return n;
      };
      // suelo inicial grande
      P(0, 0, 0, 16, 1.2, 16, mTiles);
      // secuencia de saltos
      P(0, 0.6, -12, 4.2, 1, 4.2, mHex);
      P(3.5, 1.4, -19, 3.6, 1, 3.6, mHex);
      P(-2, 2.4, -26, 3.2, 1, 3.2, mTiles);
      P(-2, 2.9, -35, 7, 1, 6, mConcrete);                     // plataforma checkpoint 1
      P(2.5, 3.6, -44, 3.4, 1, 3.4, mHex, { move: { axis: 'x', amp: 4.5, speed: 0.9 } });
      P(0, 4.6, -53, 3.2, 1, 3.2, mHex, { move: { axis: 'y', amp: 1.6, speed: 1.3 } });
      P(-4, 5.4, -61, 3.4, 1, 3.4, mTiles);
      P(-4, 6.0, -70, 8, 1, 6, mConcrete);                     // checkpoint 2
      P(0, 6.6, -79, 3, 1, 3, mHex, { move: { axis: 'x', amp: 5, speed: -1.1 } });
      P(4.5, 7.6, -87, 3.2, 1, 3.2, mHex);
      P(4.5, 8.8, -95, 3.2, 1, 3.2, mTiles, { move: { axis: 'y', amp: 2.2, speed: 0.8 } });
      P(0, 9.6, -104, 9, 1.2, 9, mTiles);                      // isla final

      /* --- pilares decorativos con luz --- */
      for (const [px, pz] of [[-6.5, 6], [6.5, 6], [-6.5, -6], [6.5, -6]]) {
        const col = new Node(geo.cylinder(0.35, 0.45, 5, 10), { albedo: mHull.albedo, normal: mHull.normal, rough: mHull.rough, metal: 0.4 });
        col.pos = [px, 3.1, pz];
        this.nodes.push(col);
        const orb = new Node(geo.sphere(0.28, 12, 10), { albedo: tex.solid(120, 220, 255), unlit: true, emissive: [0.5, 1.1, 1.4], castShadow: false });
        orb.pos = [px, 6, pz];
        this.nodes.push(orb);
        this.nodes[this.nodes.length - 1]._pulse = true;
      }

      /* --- checkpoints --- */
      this.checkpoints = [];
      const mkCheckpoint = (x, y, z) => {
        const ring = new Node(geo.cylinder(1.3, 1.3, 0.12, 20), { albedo: tex.solid(60, 255, 190), unlit: true, emissive: [0.2, 1.3, 0.9], castShadow: false });
        ring.pos = [x, y + 0.62, z];
        this.nodes.push(ring);
        this.checkpoints.push({ pos: [x, y + 1.4, z], ring, active: false });
      };
      mkCheckpoint(-4, 2.9, -35);
      mkCheckpoint(-4, 6.0, -70);

      /* --- orbes --- */
      this.orbs = [];
      const orbSpots = [
        [0, 1.8, -6], [3.5, 3.2, -19], [-2, 4.2, -26], [2.5, 5.4, -44],
        [0, 6.4, -53], [-4, 7.2, -61], [0, 8.4, -79], [4.5, 9.4, -87], [2, 11, -104], [-2, 11, -104]
      ];
      for (const [x, y, z] of orbSpots) {
        const o = new Node(geo.sphere(0.42, 14, 10), { albedo: tex.solid(255, 210, 80), unlit: true, emissive: [1.7, 1.25, 0.35], castShadow: false });
        o.pos = [x, y, z];
        this.nodes.push(o);
        this.orbs.push({ n: o, got: false, baseY: y });
      }

      /* --- portal final --- */
      const portal = new Node(geo.cylinder(2.2, 2.2, 0.3, 24), { albedo: tex.solid(170, 110, 255), unlit: true, emissive: [0.9, 0.45, 1.9], castShadow: false });
      portal.pos = [0, 10.4, -108.5];
      this.nodes.push(portal);
      this.portal = portal;

      /* --- robot jugador --- */
      this.robot = this._buildRobot(tex, geo);
      this.nodes.push(...this.robot.nodes);

      /* --- partículas --- */
      this.parts = new window.NovaCore.Particles(env.renderer, 380);

      /* --- física --- */
      this.spawn = [0, 1.5, 3];
      this.p = { pos: [...this.spawn], vel: [0, 0, 0], onGround: true, coyote: 0, jumpBuf: 0, phase: 0, squash: 0 };
      this.faceYaw = Math.PI; // mira a -Z
      this.orbCount = 0;

      /* --- luz de luna alta + relleno cálido del horizonte --- */
      const R = env.renderer;
      R.sun = { dir: V3.norm([-0.35, -0.85, 0.25]), color: [0.95, 1.0, 1.35], ambSky: [0.30, 0.28, 0.52], ambGround: [0.16, 0.12, 0.2], range: 42, strength: 1 };
      R.fog = { color: [0.16, 0.14, 0.30], density: 0.0085 };
      R.opts.exposure = 1.15; R.opts.saturation = 1.1;
      R.camera.far = 640;
      this.camYaw = 0; this.camDist = 10.5; this.camPitch = 0.32;
      this.camPos = [0, 6, 12];
      this._hud();
    }

    _buildRobot(tex, geo) {
      const nodes = [];
      const root = new Node(geo.box(0.01, 0.01, 0.01), { castShadow: false });
      root.mat = { albedo: tex.solid(0, 0, 0), castShadow: false };
      nodes.push(root);
      const white = { albedo: tex.solid(232, 236, 244), rough: 0.4, metal: 0.25, normalScale: 0 };
      const accent = { albedo: tex.solid(40, 130, 255), rough: 0.35, metal: 0.5, normalScale: 0 };
      const dark = { albedo: tex.solid(38, 42, 54), rough: 0.6, normalScale: 0 };
      const torso = new Node(geo.box(0.78, 0.92, 0.5, 1), { ...white });
      torso.pos = [0, 1.28, 0]; nodes.push(torso); torso.parent = root;
      const chest = new Node(geo.box(0.4, 0.3, 0.1, 1), { ...accent, emissive: [0.1, 0.35, 0.7] });
      chest.pos = [0, 1.38, 0.26]; chest.castShadow = false; nodes.push(chest); chest.parent = root;
      const head = new Node(geo.box(0.5, 0.42, 0.46, 1), { ...white });
      head.pos = [0, 2.0, 0]; nodes.push(head); head.parent = root;
      const visor = new Node(geo.box(0.4, 0.14, 0.06, 1), { albedo: tex.solid(80, 240, 255), unlit: true, emissive: [0.4, 1.5, 1.7], castShadow: false });
      visor.pos = [0, 2.02, 0.24]; nodes.push(visor); visor.parent = root;
      const armL = new Node(geo.box(0.22, 0.72, 0.24, 1), { ...dark });
      armL.pos = [-0.56, 1.3, 0]; nodes.push(armL); armL.parent = root;
      const armR = new Node(geo.box(0.22, 0.72, 0.24, 1), { ...dark });
      armR.pos = [0.56, 1.3, 0]; nodes.push(armR); armR.parent = root;
      const legL = new Node(geo.box(0.26, 0.74, 0.28, 1), { ...accent });
      legL.pos = [-0.2, 0.46, 0]; nodes.push(legL); legL.parent = root;
      const legR = new Node(geo.box(0.26, 0.74, 0.28, 1), { ...accent });
      legR.pos = [0.2, 0.46, 0]; nodes.push(legR); legR.parent = root;
      return { nodes, root, torso, head, armL, armR, legL, legR };
    }

    _landAABB() {
      // colisión: aterrizar sobre la parte superior de plataformas (AABB expandido por radio 0.38)
      const r = 0.38;
      let best = null, bestY = -1e9;
      for (const pl of this.platforms) {
        const px = pl.pos[0], py = pl.pos[1], pz = pl.pos[2];
        const sx = pl._w, sy = pl._h, sz = pl._d;
        if (Math.abs(this.p.pos[0] - px) < sx / 2 + r && Math.abs(this.p.pos[2] - pz) < sz / 2 + r) {
          const top = py + sy / 2;
          if (top > bestY && this.p.pos[1] >= top - 0.55) { bestY = top; best = pl; }
        }
      }
      return { top: bestY, plat: best };
    }

    update(dt) {
      this.t += dt;
      const R = this.env.renderer, I = this.env.input, A = this.env.audio;
      const p = this.p;

      /* mover plataformas */
      for (const pl of this.platforms) {
        if (pl.move) {
          const off = Math.sin(this.t * pl.move.speed * Math.PI) * pl.move.amp;
          const axis = pl.move.axis;
          const base = axis === 'x' ? pl.baseX : axis === 'y' ? pl.baseY : pl.baseZ;
          const newPos = base + off;
          pl._vel = [0, 0, 0];
          pl._vel[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = (newPos - pl.pos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2]) / dt;
          pl.pos[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = newPos;
        }
      }
      /* pulsar orbes decorativos */
      for (const n of this.nodes) if (n._pulse) n.mat.emissive = [0.5 + Math.sin(this.t * 3 + n.x) * 0.3, 1.1, 1.4];

      /* --- input (leído del frame, baja latencia) --- */
      const dead = this.state !== 'play';
      const mx = dead ? 0 : I.mx, my = dead ? 0 : I.my;
      const jumpPressed = I.pressed('cross');
      const camRot = (I.held('l1') ? 1 : 0) - (I.held('r1') ? 1 : 0);

      if (jumpPressed && !dead) p.jumpBuf = 0.14;
      p.jumpBuf -= dt; p.coyote -= dt;

      /* dirección relativa a cámara */
      const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
      const fwd = [-sy, -cy], right = [cy, -sy];
      let dx = fwd[0] * my + right[0] * mx;
      let dz = fwd[1] * my + right[1] * mx;
      const dl = Math.hypot(dx, dz);
      const SPEED = 7.2;
      if (dl > 0.05) {
        dx /= dl; dz /= dl;
        const k = Math.min(1, dl) * SPEED;
        p.vel[0] = damp(p.vel[0], dx * k, 12, dt);
        p.vel[2] = damp(p.vel[2], dz * k, 12, dt);
        this.faceYaw = damp(this.faceYaw, Math.atan2(dx, dz), 10, dt);
      } else {
        p.vel[0] = damp(p.vel[0], 0, 14, dt);
        p.vel[2] = damp(p.vel[2], 0, 14, dt);
      }

      /* gravedad + salto */
      p.vel[1] -= 22 * dt;
      if (p.onGround) p.coyote = 0.1;
      if (p.jumpBuf > 0 && p.coyote > 0) {
        p.vel[1] = 9.3;
        p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
        p.squash = -0.35;
        A.sfx('jump');
        for (let i = 0; i < 8; i++) this.parts.spawn({ pos: [p.pos[0], p.pos[1] - 0.9, p.pos[2]], vel: [(Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3], size: 0.22, grow: 0.9, life: 0.5, color: [0.7, 0.75, 0.85, 0.5] });
      }

      /* mover + colisión vertical */
      const wasAir = !p.onGround;
      p.pos[0] += p.vel[0] * dt;
      p.pos[2] += p.vel[2] * dt;
      p.pos[1] += p.vel[1] * dt;
      const hit = this._landAABB();
      if (p.vel[1] <= 0 && hit.plat && p.pos[1] <= hit.top + 0.92 && p.pos[1] > hit.top - 0.6) {
        if (wasAir && p.vel[1] < -6) {
          p.squash = Math.min(0.4, -p.vel[1] * 0.04);
          A.sfx('land');
          for (let i = 0; i < 10; i++) this.parts.spawn({ pos: [p.pos[0], hit.top + 0.05, p.pos[2]], vel: [(Math.random() - 0.5) * 4, Math.random() * 1.2, (Math.random() - 0.5) * 4], size: 0.24, grow: 1.1, life: 0.55, color: [0.75, 0.78, 0.88, 0.45] });
        }
        p.pos[1] = hit.top + 0.92;
        p.vel[1] = 0;
        p.onGround = true;
        // arrastrar con plataforma móvil (velocidad real de la plataforma)
        if (hit.plat.move && hit.plat._vel) {
          p.pos[0] += hit.plat._vel[0] * dt;
          p.pos[1] += hit.plat._vel[1] * dt;
          p.pos[2] += hit.plat._vel[2] * dt;
        }
      } else {
        p.onGround = false;
      }

      /* caída al vacío */
      if (p.pos[1] < -12 && this.state === 'play') {
        this.state = 'dead'; this.deadT = 1.2;
        A.sfx('crash');
      }
      if (this.state === 'dead') {
        this.deadT -= dt;
        if (this.deadT <= 0) {
          p.pos = [...this.spawn]; p.vel = [0, 0, 0];
          this.state = 'play';
        }
      }

      /* checkpoints */
      for (const c of this.checkpoints) {
        if (!c.active && V3.dist(p.pos, c.pos) < 2.2) {
          c.active = true; this.spawn = [...c.pos];
          A.sfx('checkpoint');
          c.ring.mat.emissive = [0.1, 1.9, 1.2];
        }
      }
      /* orbes */
      for (const o of this.orbs) {
        if (!o.got && V3.dist(p.pos, o.n.pos) < 1.4) {
          o.got = true; o.n.visible = false;
          this.orbCount++;
          A.sfx('coin');
          for (let i = 0; i < 12; i++) this.parts.spawn({ pos: [...o.n.pos], vel: [(Math.random() - 0.5) * 5, (Math.random() - 0.2) * 5, (Math.random() - 0.5) * 5], size: 0.16, life: 0.6, color: [1, 0.85, 0.3, 1], grav: 4 });
        }
      }
      /* portal → victoria */
      if (this.state === 'play' && V3.dist(p.pos, this.portal.pos) < 2.6) {
        this.state = 'win';
        A.sfx('win');
        for (let i = 0; i < 40; i++) this.parts.spawn({ pos: [this.portal.x, this.portal.y + 1, this.portal.z], vel: [(Math.random() - 0.5) * 8, Math.random() * 9, (Math.random() - 0.5) * 8], size: 0.2, life: 1.4, color: [0.8 + Math.random() * 0.2, 0.5, 1, 1], grav: 5 });
      }

      /* --- animar robot --- */
      const rb = this.robot;
      rb.root.pos = [p.pos[0], p.pos[1] - 0.92 + (1 - (1 + p.squash) * 0.5) * 0.3, p.pos[2]];
      rb.root.rot = [0, this.faceYaw, 0];
      rb.root.scl = [1 + p.squash * 0.5, 1 - p.squash * 0.8, 1 + p.squash * 0.5];
      p.squash = damp(p.squash, 0, 9, dt);
      const speedH = Math.hypot(p.vel[0], p.vel[2]);
      if (p.onGround) p.phase += speedH * dt * 2.6;
      const sw = Math.sin(p.phase) * Math.min(1, speedH / 4);
      rb.legL.rot = [sw * 0.7, 0, 0];
      rb.legR.rot = [-sw * 0.7, 0, 0];
      rb.armL.rot = [-sw * 0.55, 0, 0.08];
      rb.armR.rot = [sw * 0.55, 0, -0.08];
      if (!p.onGround) {
        rb.legL.rot = [0.5, 0, 0]; rb.legR.rot = [-0.3, 0, 0];
        rb.armL.rot = [-1.8, 0, 0.4]; rb.armR.rot = [-1.8, 0, -0.4];
      }
      rb.torso.pos[1] = 1.28 + Math.abs(Math.sin(p.phase)) * 0.04 * Math.min(1, speedH / 4);

      /* --- cámara orbital con follow --- */
      this.camYaw += camRot * 2.2 * dt;
      const target = [p.pos[0] - Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist,
                      p.pos[1] + 2.2 + Math.sin(this.camPitch) * this.camDist,
                      p.pos[2] + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist];
      this.camPos = [damp(this.camPos[0], target[0], 8, dt), damp(this.camPos[1], Math.max(target[1], 1.5), 8, dt), damp(this.camPos[2], target[2], 8, dt)];
      R.camera.pos = this.camPos;
      R.camera.target = [p.pos[0], p.pos[1] + 1.4, p.pos[2]];

      this.parts.update(dt);
      this._hud();
      return this.nodes;
    }

    _hud() {
      const total = this.orbs.length;
      const msg = this.state === 'win' ? `<div class="hud-panel"><h2>¡SECTOR COMPLETADO!</h2>
        <p>Orbes <b>${this.orbCount}/${total}</b> · Astra vuelve a casa</p>
        <p class="hint">○ / ESC para volver al inicio</p></div>`
        : this.state === 'dead' ? `<div class="hud-count">✕</div>` : '';
      this.env.hud(`
        <div class="hud-tl">ORBES <b style="color:#ffd24d">${this.orbCount}</b>/${total}</div>
        <div class="hud-tr">ASTRA FALLEN</div>
        ${msg}
        <div class="hud-hint-bottom">L1/R1 giran cámara · ESPACIO salta</div>`);
    }

    dispose() { }

    saveState() { return { pos: [...this.p.pos], vel: [...this.p.vel], orbCount: this.orbCount, spawn: [...this.spawn], got: this.orbs.map(o => o.got) }; }
    loadState(st) {
      if (!st) return;
      this.p.pos = [...st.pos]; this.p.vel = [...st.vel];
      this.orbCount = st.orbCount; this.spawn = [...st.spawn];
      st.got.forEach((g, i) => { this.orbs[i].got = g; this.orbs[i].n.visible = !g; });
      this.state = 'play';
    }
    rewindSnapshot() { return this.saveState(); }
  }

  window.NovaGames = window.NovaGames || {};
  window.NovaGames.runner = {
    id: 'astra-fallen',
    title: 'ASTRA FALLEN',
    sub: 'Sector 7 · Recuerdo estelar',
    genre: 'Plataformas 3D · 1 jugador',
    year: '2026',
    gradient: ['#2a1454', '#7a3bd0', '#ff8ac2'],
    cover: 'runner',
    controls: [
      ['WASD / Stick izq.', 'Mover'],
      ['ESPACIO / ✕', 'Saltar (con coyote time)'],
      ['Q / E (L1/R1)', 'Girar cámara'],
      ['ESC / ○', 'Pausa']
    ],
    create(env) { return new RunnerGame(env); }
  };
})();
