/* ============================================================
 * APEX VELOCITY — Racing · NovaEmu PS5 Edition
 * Circuito cerrado por spline Catmull-Rom, atardecer con sombras
 * dinámicas largas, curbs neón, IA rival, derrapes con humo,
 * minimapa, vueltas cronometradas.
 * ============================================================ */
'use strict';

(() => {
  const { Node, V3, clamp, lerp, damp } = window.NovaCore;
  const { TexFactory, GeoFactory } = window.NovaTex;

  /* ---- Catmull-Rom cerrado ---- */
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0,
      0.5 * ((2 * p1[2]) + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3)
    ];
  }

  const CPS = [
    [0, 0], [55, -8], [105, 25], [118, 85], [78, 128], [18, 142],
    [-42, 122], [-88, 82], [-108, 22], [-78, -22], [-30, -16]
  ].map(([x, z]) => [x, 0, z]); // puntos 3D (y=0) para Catmull-Rom

  class RacerGame {
    constructor(env) {
      this.env = env;
      const { tex, geo } = env;
      this.nodes = [];
      this.t = 0;
      this.state = 'countdown'; // countdown | race | finished
      this.countdownT = 3.6;
      this.lap = 1; this.laps = 3;
      this.lapTime = 0; this.totalTime = 0; this.best = +(localStorage.getItem('nv_best_racer') || 0) || null;

      /* --- spline de la pista --- */
      const SAMPLES = 520;
      this.samples = [];
      const n = CPS.length;
      for (let i = 0; i < n; i++) {
        const p0 = CPS[(i - 1 + n) % n], p1 = CPS[i], p2 = CPS[(i + 1) % n], p3 = CPS[(i + 2) % n];
        const SUB = Math.ceil(SAMPLES / n);
        for (let j = 0; j < SUB; j++) {
          const t = j / SUB;
          const p = catmull(p0, p1, p2, p3, t);
          this.samples.push(p);
        }
      }
      // longitudes
      this.segLen = [];
      this.totalLen = 0;
      for (let i = 0; i < this.samples.length; i++) {
        const a = this.samples[i], b = this.samples[(i + 1) % this.samples.length];
        const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
        this.segLen.push(l); this.totalLen += l;
      }
      this.roadW = 13;

      /* --- materiales --- */
      const mAsphalt = tex.get('asphalt', 256, 7);
      const mNeon = tex.get('neon', 128, 3);
      const mGrass = tex.get('grass', 256, 21);
      const mConcrete = tex.get('concrete', 256, 5);
      const mHull = tex.get('hull', 256, 11);
      const mTiles = tex.get('tiles', 256, 9);

      /* --- cielo atardecer --- */
      const skyGeo = geo.sphere(320, 32, 20, true);
      const skyTex = tex.skyGradient([
        { t: 0, c: [24, 26, 66] }, { t: 0.42, c: [86, 44, 108] },
        { t: 0.68, c: [214, 96, 68] }, { t: 0.85, c: [252, 158, 68] }, { t: 1, c: [255, 196, 110] }
      ]);
      const sky = new Node(skyGeo, { albedo: skyTex, unlit: true, sky: true, emissive: [1, 1, 1], castShadow: false });
      this.nodes.push(sky);

      /* --- suelo --- */
      const ground = new Node(geo.plane(900, 900, 1, 1, 26, true), { albedo: mGrass.albedo, normal: mGrass.normal, rough: mGrass.rough, normalScale: mGrass.normalScale, castShadow: false });
      ground.y = -0.05;
      this.nodes.push(ground);

      /* --- cinta de la carretera + curbs --- */
      this._buildRoad(mAsphalt, mNeon);

      /* --- edificios de fondo --- */
      let bseed = 42;
      const rnd = () => (bseed = (bseed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) {
        // posiciones fuera de la pista
        let px, pz, ok = false, tries = 0;
        while (!ok && tries++ < 40) {
          px = (rnd() - 0.5) * 420; pz = (rnd() - 0.5) * 420;
          ok = true;
          for (const s of this.samples) if (Math.hypot(s[0] - px, s[2] - pz) < 34) { ok = false; break; }
        }
        if (!ok) continue;
        const w = 8 + rnd() * 16, h = 10 + rnd() * 42, d = 8 + rnd() * 16;
        const mat = rnd() > 0.5 ? mConcrete : mHull;
        const b = new Node(geo.box(w, h, d, 2), { albedo: mat.albedo, normal: mat.normal, rough: mat.rough, normalScale: mat.normalScale * 0.8, tint: [0.75 + rnd() * 0.3, 0.78 + rnd() * 0.25, 0.85 + rnd() * 0.2] });
        b.pos = [px, h / 2, pz];
        this.nodes.push(b);
        // ventanas emisivas
        const win = new Node(geo.box(w * 0.92, h * 0.7, d * 0.92, 1), { albedo: tex.solid(20, 26, 40), rough: 0.3, metal: 0.4, emissive: [0.05, 0.07, 0.12] });
        win.pos = [px, h / 2 + 1, pz]; win.scl = [1, 1, 1.001];
        win.castShadow = false;
        this.nodes.push(win);
      }

      /* --- arco de salida --- */
      const startP = this.trackAt(0);
      for (const side of [-1, 1]) {
        const pil = new Node(geo.box(1.4, 11, 1.4, 2), { albedo: mHull.albedo, normal: mHull.normal, rough: mHull.rough, metal: 0.3 });
        pil.pos = [startP.p[0] + startP.side[0] * side * (this.roadW / 2 + 1.6), 5.5, startP.p[2] + startP.side[2] * side * (this.roadW / 2 + 1.6)];
        this.nodes.push(pil);
      }
      const banner = new Node(geo.box(this.roadW + 6, 2.4, 1, 2), { albedo: tex.solid(14, 16, 26), rough: 0.5, emissive: [0.10, 0.05, 0.02] });
      banner.pos = [startP.p[0], 10.4, startP.p[2]];
      banner.rot = [0, Math.atan2(startP.tan[0], startP.tan[2]), 0];
      this.nodes.push(banner);

      /* --- farolas --- */
      for (let i = 0; i < this.samples.length; i += 42) {
        const sp = this.trackAt(i / this.samples.length * this.totalLen);
        const side = (i / 42) % 2 === 0 ? 1 : -1;
        const pole = new Node(geo.cylinder(0.14, 0.18, 7, 8, false), { albedo: mHull.albedo, normal: mHull.normal, rough: mHull.rough, metal: 0.5 });
        pole.pos = [sp.p[0] + sp.side[0] * side * (this.roadW / 2 + 2.4), 3.5, sp.p[2] + sp.side[2] * side * (this.roadW / 2 + 2.4)];
        this.nodes.push(pole);
        const lamp = new Node(geo.box(0.8, 0.25, 0.8, 1), { albedo: tex.solid(255, 230, 170), unlit: true, emissive: [1, 0.92, 0.65], castShadow: false });
        lamp.pos = [pole.x, 7.1, pole.z];
        this.nodes.push(lamp);
      }

      /* --- coche del jugador --- */
      this.car = this._buildCar(mHull, [0.85, 0.09, 0.1], 0);
      this.nodes.push(...this.car.nodes);

      /* --- IA --- */
      this.ai = [
        this._buildCar(mHull, [0.12, 0.35, 0.85], 1),
        this._buildCar(mHull, [0.95, 0.72, 0.1], 2)
      ];
      this.aiCars = this.ai.map((c, i) => ({ car: c, s: this.totalLen * (0.08 + i * 0.05), lat: (i % 2 ? 2.6 : -2.6), speed: 34 + i * 3 }));
      for (const a of this.ai) this.nodes.push(...a.nodes);

      /* --- partículas --- */
      this.parts = new window.NovaCore.Particles(env.renderer, 420);

      /* --- estado jugador --- */
      this.s = 0; this.lat = 0; this.speed = 0; this.latVel = 0; this.steerVis = 0; this.driftVis = 0;

      /* --- cámara --- */
      this.camPos = [startP.p[0], 4, startP.p[2] + 10];
      this.camTarget = [startP.p[0], 1, startP.p[2]];

      /* --- luz de hora dorada (sombras largas pero visibles) --- */
      const R = env.renderer;
      R.sun = { dir: V3.norm([-0.38, -0.72, 0.38]), color: [1.85, 1.38, 1.02], ambSky: [0.36, 0.35, 0.5], ambGround: [0.2, 0.17, 0.15], range: 46, strength: 1 };
      R.fog = { color: [0.58, 0.45, 0.42], density: 0.0045 };
      R.opts.exposure = 1.12; R.opts.saturation = 1.18;
      R.camera.fov = 62 * Math.PI / 180;
      R.camera.far = 700;

      this._hud();
      env.audio.sfx('count');
    }

    trackAt(sDist) {
      const S = this.samples.length;
      let d = ((sDist % this.totalLen) + this.totalLen) % this.totalLen;
      let i = 0;
      while (i < S && d > this.segLen[i]) { d -= this.segLen[i]; i++; }
      i = i % S;
      const a = this.samples[i], b = this.samples[(i + 1) % S];
      const k = this.segLen[i] ? d / this.segLen[i] : 0;
      const p = [lerp(a[0], b[0], k), 0, lerp(a[2], b[2], k)];
      const tx = b[0] - a[0], tz = b[2] - a[2];
      const tl = Math.hypot(tx, tz) || 1;
      const tan = [tx / tl, 0, tz / tl];
      return { p, tan, side: [-tan[2], 0, tan[0]] };
    }

    _buildRoad(mAsphalt, mNeon) {
      const env = this.env, S = this.samples.length, W = this.roadW;
      const mkRibbon = (off1, off2, uvScale, closed = true) => {
        const pos = [], nor = [], uv = [], idx = [];
        for (let i = 0; i <= (closed ? S : S - 1); i++) {
          const sp = this.samples[i % S];
          const nxt = this.samples[(i + 1) % S];
          let tx = nxt[0] - sp[0], tz = nxt[2] - sp[2];
          const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const sx = -tz, sz = tx;
          pos.push(sp[0] + sx * off1, 0.02, sp[2] + sz * off1);
          pos.push(sp[0] + sx * off2, 0.02, sp[2] + sz * off2);
          nor.push(0, 1, 0, 0, 1, 0);
          const v = i * uvScale * 0.24;
          uv.push(0, v, 1, v);
        }
        const rows = closed ? S + 1 : S;
        for (let i = 0; i < rows - 1; i++) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        return env.geo._upload({ count: pos.length / 3, pos, nor, uv, idx });
      };
      // asfalto
      const road = new Node(mkRibbon(-W / 2, W / 2, 1), { albedo: mAsphalt.albedo, normal: mAsphalt.normal, rough: mAsphalt.rough, normalScale: mAsphalt.normalScale, castShadow: false });
      this.nodes.push(road);
      // curbs neón (ligeramente elevados, emisivos suaves)
      const curbMat = { albedo: mNeon.albedo, normal: mNeon.normal, rough: 0.4, normalScale: 0.6, emissive: [0.06, 0.18, 0.22], castShadow: false };
      this.nodes.push(new Node(mkRibbon(W / 2, W / 2 + 0.8, 3), { ...curbMat }));
      this.nodes.push(new Node(mkRibbon(-W / 2 - 0.8, -W / 2, 3), { ...curbMat }));
    }

    _buildCar(mHull, tint, id) {
      const env = this.env, tex = env.tex, geo = env.geo;
      const nodes = [];
      const group = new Node(geo.box(0.01, 0.01, 0.01), { albedo: tex.solid(0, 0, 0), castShadow: false });
      group.castShadow = false;
      nodes.push(group);
      const body = new Node(geo.box(2.05, 0.62, 4.5, 2), { albedo: mHull.albedo, normal: mHull.normal, rough: 0.34, metal: 0.55, normalScale: 0.5, tint });
      body.pos = [0, 0.62, 0];
      nodes.push(body); body.parent = group;
      const cabin = new Node(geo.box(1.55, 0.55, 2.1, 1), { albedo: tex.solid(12, 14, 20), rough: 0.12, metal: 0.8, tint: [1.3, 1.3, 1.4] });
      cabin.pos = [0, 1.14, -0.25];
      nodes.push(cabin); cabin.parent = group;
      const spoiler = new Node(geo.box(1.9, 0.09, 0.55, 1), { albedo: mHull.albedo, rough: 0.3, metal: 0.6, tint });
      spoiler.pos = [0, 1.18, -2.0];
      nodes.push(spoiler); spoiler.parent = group;
      const lights = [];
      for (const lx of [-0.68, 0.68]) {
        const hl = new Node(geo.box(0.42, 0.16, 0.06, 1), { albedo: tex.solid(255, 244, 200), unlit: true, emissive: [1.6, 1.5, 1.1], castShadow: false });
        hl.pos = [lx, 0.66, 2.26];
        nodes.push(hl); hl.parent = group; lights.push(hl);
      }
      for (const lx of [-0.72, 0.72]) {
        const tl = new Node(geo.box(0.4, 0.14, 0.06, 1), { albedo: tex.solid(255, 40, 40), unlit: true, emissive: [1.7, 0.1, 0.08], castShadow: false });
        tl.pos = [lx, 0.7, -2.26];
        nodes.push(tl); tl.parent = group;
      }
      const wheels = [];
      for (const [wx, wz, front] of [[-1.02, 1.45, 1], [1.02, 1.45, 1], [-1.02, -1.5, 0], [1.02, -1.5, 0]]) {
        const w = new Node(geo.cylinder(0.42, 0.42, 0.34, 14, false), { albedo: tex.solid(22, 22, 26), rough: 0.9, normalScale: 0 });
        w.pos = [wx, 0.42, wz];
        w.rot = [0, 0, Math.PI / 2];
        nodes.push(w); w.parent = group; wheels.push({ n: w, front });
      }
      return { nodes, group, wheels, body, id };
    }

    _placeCar(car, sDist, lat, yawOffset = 0) {
      const sp = this.trackAt(sDist);
      car.group.pos = [sp.p[0] + sp.side[0] * lat, 0, sp.p[2] + sp.side[2] * lat];
      car.group.rot = [0, Math.atan2(sp.tan[0], sp.tan[2]) + yawOffset, 0];
    }

    update(dt) {
      this.t += dt;
      const R = this.env.renderer, I = this.env.input, A = this.env.audio;

      if (this.state === 'countdown') {
        const before = Math.ceil(this.countdownT - 1);
        this.countdownT -= dt;
        const now = Math.ceil(this.countdownT - 1);
        if (now !== before && now >= 0) A.sfx(now === 0 ? 'go' : 'count');
        if (this.countdownT <= 1) { this.state = 'race'; }
        this._hud();
      }

      const racing = this.state === 'race';

      /* --- física del jugador (espacio de pista: s + lateral) --- */
      const throttle = racing && (I.held('cross') || I.axis('r2') > 0.4);
      const braking = racing && (I.held('square') || I.axis('l2') > 0.4);
      const steer = racing ? I.mx : 0;
      const drifting = racing && I.held('r1');

      const maxSpeed = 52;
      if (racing) {
        if (throttle) this.speed += 26 * dt;
        else if (!braking) this.speed = Math.max(0, this.speed - 8 * dt); // coast: frena hasta 0, nunca marcha atrás por inercia
        if (braking) this.speed -= 42 * dt;
        const offroad = Math.abs(this.lat) > this.roadW / 2 - 0.5;
        this.speed -= this.speed * (offroad ? 1.25 : 0.32) * dt;
        if (drifting) this.speed -= this.speed * 0.55 * dt;
        this.speed = clamp(this.speed, -8, maxSpeed * (offroad ? 0.55 : 1));
        // lateral
        const grip = drifting ? 0.62 : 1;
        this.latVel += steer * 26 * Math.min(1, this.speed / 18 + 0.25) * dt * grip;
        this.latVel -= this.latVel * (drifting ? 2.2 : 5.5) * dt;
        this.lat += this.latVel * dt;
        // muros
        const wall = this.roadW / 2 + 5.5;
        if (Math.abs(this.lat) > wall) {
          this.lat = Math.sign(this.lat) * wall;
          if (Math.abs(this.latVel) > 4) {
            A.sfx('crash');
            for (let i = 0; i < 14; i++) this.parts.spawn({ pos: [this.car.group.x, 0.6, this.car.group.z], vel: [(Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9], size: 0.14, life: 0.5, color: [1, 0.8, 0.35, 0.9], grav: 14, fade: 1 });
          }
          this.latVel *= -0.32; this.speed *= 0.86;
        }
        const prevS = this.s;
        this.s += this.speed * dt;
        if (this.s >= this.totalLen) {
          this.s -= this.totalLen;
          if (racing) {
            if (this.lap >= this.laps) { this.state = 'finished'; A.sfx('win'); this._saveBest(); }
            else { this.lap++; A.sfx('checkpoint'); }
            this.lapTime = 0;
          }
        }
        this.lapTime += dt; this.totalTime += dt;

        // humo de derrape / polvo fuera de pista
        if (drifting && this.speed > 12 && Math.random() < 0.7) {
          const sp = this.trackAt(this.s);
          this.parts.spawn({ pos: [sp.p[0] + sp.side[0] * this.lat, 0.25, sp.p[2] + sp.side[2] * this.lat], vel: [(Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2], size: 0.5, grow: 1.6, life: 0.8, color: [0.85, 0.85, 0.9, 0.30], fade: 1 });
        }
        if (offroad && this.speed > 8 && Math.random() < 0.5) {
          this.parts.spawn({ pos: [this.car.group.x, 0.2, this.car.group.z], vel: [(Math.random() - 0.5) * 3, 1.2, (Math.random() - 0.5) * 3], size: 0.3, grow: 1.1, life: 0.7, color: [0.55, 0.5, 0.38, 0.35] });
        }

        // audio motor
        A.engineUpdate(this.speed / maxSpeed, throttle ? 1 : 0);
      } else if (this.state === 'countdown') {
        A.engineUpdate(0.06 + Math.random() * 0.04, 0.5);
      }

      /* --- visual del coche --- */
      this.steerVis = damp(this.steerVis, steer, 10, dt);
      const yawOff = clamp(this.latVel * 0.014, -0.35, 0.35);
      this._placeCar(this.car, this.s, this.lat, -yawOff);
      this.car.group.pos[1] = Math.abs(this.speed) > 2 ? Math.sin(this.t * 24) * 0.012 : 0;
      for (const w of this.car.wheels) {
        w.n.rot[1] = this.steerVis * 0.42;
        w.n.rot[2] = Math.PI / 2;
        w.n.rot[0] = -((this.s * 1.6) % (Math.PI * 2));
      }

      /* --- IA --- */
      for (const a of this.aiCars) {
        a.s += a.speed * dt;
        a.lat = damp(a.lat, Math.sin(a.s * 0.012 + a.car.id * 2.4) * 3.4, 1.5, dt);
        this._placeCar(a.car, a.s, a.lat, clamp(Math.sin(a.s * 0.05) * 0.05, -0.1, 0.1));
      }

      /* --- cámara persecución --- */
      const sp = this.trackAt(this.s + 2);
      const back = 9.2 - Math.min(3, this.speed * 0.045);
      const desired = [sp.p[0] + sp.side[0] * this.lat - sp.tan[0] * back, 3.6 + this.speed * 0.012, sp.p[2] + sp.side[2] * this.lat - sp.tan[2] * back];
      this.camPos = [damp(this.camPos[0], desired[0], 6, dt), damp(this.camPos[1], desired[1], 6, dt), damp(this.camPos[2], desired[2], 6, dt)];
      this.camTarget = [damp(this.camTarget[0], sp.p[0] + sp.side[0] * this.lat + sp.tan[0] * 7, 9, dt), damp(this.camTarget[1], 1.1, 9, dt), damp(this.camTarget[2], sp.p[2] + sp.side[2] * this.lat + sp.tan[2] * 7, 9, dt)];
      R.camera.pos = this.camPos;
      R.camera.target = this.camTarget;

      this.parts.update(dt);
      this._hud();
      return this.nodes;
    }

    _fmt(t) {
      if (t == null) return '--:--.--';
      const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t % 1) * 100);
      return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
    }

    _saveBest() {
      if (this.best == null || this.totalTime < this.best) {
        this.best = this.totalTime;
        localStorage.setItem('nv_best_racer', String(this.best));
      }
    }

    _hud() {
      const kmh = Math.round(Math.abs(this.speed) * 4);
      const cd = this.state === 'countdown' ? Math.max(1, Math.ceil(this.countdownT - 1)) : 0;
      this.env.hud(`
        <div class="hud-tl">VUELTA ${Math.min(this.lap, this.laps)}/${this.laps} &nbsp;·&nbsp; ${this._fmt(this.lapTime)}</div>
        <div class="hud-tr">MEJOR ${this._fmt(this.best)}</div>
        ${cd ? `<div class="hud-count${cd === 1 && this.countdownT <= 1.05 ? ' go' : ''}">${cd === 1 && this.countdownT <= 1.05 ? '¡YA!' : cd}</div>` : ''}
        <div class="hud-speed"><b>${kmh}</b><span>km/h</span></div>
        <canvas id="nv-minimap" width="150" height="150"></canvas>
        ${this.state === 'finished' ? `<div class="hud-panel"><h2>¡CARRERA COMPLETADA!</h2>
          <p>Tiempo total <b>${this._fmt(this.totalTime)}</b> · Mejor <b>${this._fmt(this.best)}</b></p>
          <p class="hint">○ / ESC para volver al inicio</p></div>` : ''}`);
      // minimapa
      const mc = document.getElementById('nv-minimap');
      if (mc && !this._mapPts) {
        const g = mc.getContext('2d');
        this._mapPts = this.samples.filter((_, i) => i % 8 === 0);
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
        for (const p of this._mapPts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]); }
        const sc = 130 / Math.max(maxx - minx, maxz - minz);
        this._mapDraw = p => [10 + (p[0] - minx) * sc, 140 - (10 + (p[2] - minz) * sc)];
      }
      if (mc && this._mapDraw) {
        const g = mc.getContext('2d');
        g.clearRect(0, 0, 150, 150);
        g.strokeStyle = 'rgba(160,200,255,0.75)'; g.lineWidth = 3; g.beginPath();
        this._mapPts.forEach((p, i) => { const [x, y] = this._mapDraw(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.closePath(); g.stroke();
        const [cx, cy] = this._mapDraw([this.car.group.x, 0, this.car.group.z]);
        g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
        for (const a of this.aiCars) {
          const [ax, ay] = this._mapDraw([a.car.group.x, 0, a.car.group.z]);
          g.fillStyle = '#ffd24d'; g.beginPath(); g.arc(ax, ay, 3, 0, 7); g.fill();
        }
      }
    }

    dispose() { this.env.audio.engineStop(); }

    /* save states + rewind */
    saveState() {
      return { s: this.s, lat: this.lat, speed: this.speed, lap: this.lap, lapTime: this.lapTime, totalTime: this.totalTime, state: this.state };
    }
    loadState(st) {
      if (!st) return;
      Object.assign(this, st);
      this._placeCar(this.car, this.s, this.lat);
    }
    rewindSnapshot() { return this.saveState(); }
  }

  window.NovaGames = window.NovaGames || {};
  window.NovaGames.racer = {
    id: 'apex-velocity',
    title: 'APEX VELOCITY',
    sub: 'Circuit Thunder',
    genre: 'Racing · 1 jugador',
    year: '2026',
    gradient: ['#101c3f', '#1d5ef5', '#38c6ff'],
    cover: 'racer',
    controls: [
      ['WASD / ←→ / Stick izq.', 'Dirección'],
      ['ESPACIO / ✕ / R2', 'Acelerar'],
      ['SHIFT / □ / L2', 'Frenar'],
      ['E / R1', 'Derrape'],
      ['ESC / ○', 'Pausa']
    ],
    create(env) { return new RacerGame(env); }
  };
})();
