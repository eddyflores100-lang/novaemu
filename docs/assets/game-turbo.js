/* NovaEmu NG — TURBO CIRCUIT: carreras 3D de nueva generación
   Corre sobre el pipeline NGGPU (command buffer → WebGL2) como un paquete NovaPKG. */
(function () {
'use strict';
const NG = window.NG;

const CONTROLS = [
  { action: 'up',    label: 'Acelerar', keys: 'W / ↑', pad: 'Palanca izq. arriba' },
  { action: 'down',  label: 'Frenar',   keys: 'S / ↓', pad: 'Palanca izq. abajo' },
  { action: 'left',  label: 'Girar izq.', keys: 'A / ←', pad: 'Palanca izq.' },
  { action: 'right', label: 'Girar der.', keys: 'D / →', pad: 'Palanca izq.' },
  { action: 'a',     label: 'Derrape (freno de mano)', keys: 'Espacio', pad: 'Cruz / A' },
  { action: 'b',     label: 'Turbo',    keys: 'Mayús', pad: 'Círculo / B' },
  { action: 'start', label: 'Reiniciar carrera', keys: 'Enter', pad: 'Options' }
];

NG.NGPackage.register({
  id: 'turbo-circuit',
  title: 'Turbo Circuit',
  genre: 'Carreras 3D',
  version: '1.0.0',
  desc: 'Circuito de neón con física de derrape, 3 rivales con IA, turbo y 3 vueltas.',
  cover: ['#0f2027', '#2c5364', '#ff9a3c'],
  controls: CONTROLS,
  keyMap: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    a: ['Space'], b: ['ShiftLeft', 'ShiftRight'], start: ['Enter']
  }
}, function (api) {
  const { m4, v3, mesh, spline, c } = api;
  const rng = api.rng;
  const ROAD_HALF = 5.4;

  // ---------- circuito: spline cerrada Catmull-Rom ----------
  const CPTS = [
    [0,0,-70],[46,1.5,-62],[72,3, -18],[62,4,26],[78,2,64],[40,0.5,88],
    [-6,2,70],[-40,3,86],[-74,4,44],[-58,1.5,6],[-76,0,-38],[-38,2,-72]
  ];
  const NSAMP = 560;
  let S = spline(CPTS, NSAMP, true);
  // longitud de arco acumulada + tabla de búsqueda por distancia
  let arc = [0];
  for (let i = 1; i <= NSAMP; i++) {
    const a = S[i-1].p, b = S[i % NSAMP].p;
    arc.push(arc[i-1] + Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]));
  }
  const trackLen = arc[NSAMP];
  function sampleAt(s) {
    s = ((s % trackLen) + trackLen) % trackLen;
    let lo = 0, hi = NSAMP;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arc[mid] < s) lo = mid + 1; else hi = mid; }
    const i0 = (lo - 1 + NSAMP) % NSAMP, i1 = lo % NSAMP;
    const seg = arc[lo] - arc[lo-1] || 1, f = (s - arc[lo-1]) / seg;
    return {
      p: v3.lerp(S[i0].p, S[i1].p, f),
      t: v3.norm(v3.lerp(S[i0].t, S[i1].t, f)),
      n: v3.norm(v3.lerp(S[i0].n, S[i1].n, f))
    };
  }

  // ---------- estado ----------
  const st = {};
  function resetState() {
    st.phase = 'cuenta';      // cuenta | carrera | meta
    st.phaseT = 3.2;
    st.s = 6; st.lat = 0; st.speed = 0; st.latVel = 0; st.drift = 0;
    st.lap = 1; st.cp = 0; st.time = 0; st.best = 0;
    st.boost = 100; st.boosting = false; st.driftT = 0;
    st.finished = false; st.finishT = 0;
    st.offRoad = false; st.camPos = null; st.shake = 0;
    st.ai = [
      { s: 14, lat: -2.2, speed: 30, maxF: 0.965, wob: rng.next() * 6, color: '#3aa0ff' },
      { s: 10, lat:  2.4, speed: 30, maxF: 0.935, wob: rng.next() * 6, color: '#ffd23c' },
      { s: 12, lat:  0.4, speed: 30, maxF: 0.905, wob: rng.next() * 6, color: '#43e97b' }
    ];
    st.parts = [];
    for (let i = 0; i < 260; i++) st.parts.push({ life: 0 });
  }

  // ---------- mallas ----------
  function buildTrackMesh() {
    return mesh.ribbon(S.map(function (s) { return { p: s.p, n: s.n }; }), ROAD_HALF + 1.1, function (i) {
      const lap = i % 28;
      if (lap < 3) return i % 56 < 28 ? '#d43a3a' : '#f2f2f2';  // pianos rojo/blanco
      if (i < 4) return '#ffffff';                              // línea de salida
      return i % 28 < 3 ? '#20242c' : (i % 56 < 28 ? '#2a2f3a' : '#272c36'); // asfalto con bandas
    });
  }
  function buildCar(color, isPlayer) {
    const body = mesh.box(1.7, 0.5, 3.4, isPlayer ? '#e8e8ee' : '#d8d8e0');
    const cab  = mesh.box(1.15, 0.42, 1.5, isPlayer ? '#ff5a3c' : color);
    const wing = mesh.box(2.0, 0.12, 0.5, '#181a20');
    const w1 = mesh.box(0.34, 0.62, 0.62, '#101216');
    return mesh.merge([
      { mesh: body, at: [0, 0.45, 0] },
      { mesh: cab, at: [0, 0.88, -0.25], recol: color },
      { mesh: wing, at: [0, 0.95, 1.55] },
      { mesh: w1, at: [-0.95, 0.3, -1.1] }, { mesh: w1, at: [0.95, 0.3, -1.1] },
      { mesh: w1, at: [-0.95, 0.3, 1.2] }, { mesh: w1, at: [0.95, 0.3, 1.2] }
    ]);
  }
  function buildEnv() {
    const ground = mesh.plane(560, 560, 8, 8, '#1d4a2a');
    const parts = [{ mesh: ground, at: [0, -0.06, 0] }];
    // pinos y montañas deterministas fuera de la pista
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rng.next() * 0.2;
      const r = 100 + rng.next() * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let nearTrack = false;
      for (let k = 0; k < NSAMP; k += 4) {
        const p = S[k].p;
        if ((p[0]-x)*(p[0]-x) + (p[2]-z)*(p[2]-z) < 400) { nearTrack = true; break; }
      }
      if (nearTrack) continue;
      if (i % 3 === 0) {
        parts.push({ mesh: mesh.cylinder(0.01, 11 + rng.next() * 9, 22 + rng.next() * 14, 5, '#5b6572'), at: [x, 0, z] });
      } else {
        parts.push({ mesh: mesh.cylinder(0.25, 0.4, 3.2, 5, '#5a3d28'), at: [x, 0, z] });
        parts.push({ mesh: mesh.cylinder(0.01, 2.6, 6.5, 6, '#2e7d3f'), at: [x, 3.4, z] });
      }
    }
    // arco de salida
    const sp = S[2].p, sn = S[2].n;
    for (const side of [-1, 1]) {
      parts.push({ mesh: mesh.box(1, 9, 1, '#232733'), at: [sp[0]+sn[0]*9*side, 4.5, sp[2]+sn[2]*9*side] });
    }
    parts.push({ mesh: mesh.box(19.4, 1.6, 1.2, '#ff5a3c'), at: [sp[0], 9.4, sp[2]] });
    return mesh.merge(parts);
  }

  const gm = {}; // mallas subidas
  return {
    start: function () {
      resetState();
      if (!gm.track) {
        gm.track = buildTrackMesh(); gm.env = buildEnv();
        gm.carP = buildCar('#ff5a3c', true);
        gm.ai1 = buildCar('#3aa0ff'); gm.ai2 = buildCar('#ffd23c'); gm.ai3 = buildCar('#43e97b');
        for (const k in gm) api.gpu.uploadMesh(k, gm[k]);
      }
      api.audio.ensure();
      api.audio.startLoop('engine', { type: 'sawtooth', freq: 60, filter: 420, vol: 0.07 });
      api.audio.playMusic([220, 0, 277, 0, 330, 0, 277, 0, 220, 0, 330, 0, 415, 0, 330, 0], 128, 'square');
      api.log('GAME', 'Turbo Circuit iniciado — circuito ' + trackLen.toFixed(0) + ' m');
    },
    shutdown: function () { api.audio.stopLoop('engine'); api.audio.stopMusic(); },
    serialize: function () {
      return { s: st.s, lat: st.lat, speed: st.speed, latVel: st.latVel, lap: st.lap, cp: st.cp,
        time: st.time, boost: st.boost, phase: st.phase, phaseT: st.phaseT, finished: st.finished,
        best: st.best, ai: st.ai.map(function (a) { return { s: a.s, lat: a.lat, speed: a.speed }; }) };
    },
    deserialize: function (d) {
      st.s = d.s; st.lat = d.lat; st.speed = d.speed; st.latVel = d.latVel; st.lap = d.lap;
      st.cp = d.cp; st.time = d.time; st.boost = d.boost; st.phase = d.phase; st.phaseT = d.phaseT;
      st.finished = d.finished; st.best = d.best || 0;
      if (d.ai) d.ai.forEach(function (a, i) { if (st.ai[i]) { st.ai[i].s = a.s; st.ai[i].lat = a.lat; st.ai[i].speed = a.speed; } });
    },

    tick: function (dt, input) {
      // ---- fases ----
      if (st.phase === 'cuenta') {
        st.phaseT -= dt;
        if (st.phaseT <= 0) { st.phase = 'carrera'; api.audio.sfx('boost'); }
        api.hud.set({ big: st.phaseT > 0.4 ? Math.ceil(st.phaseT - 0.4) + '' : '¡VAMOS!', sub: '' });
        return;
      }
      if (st.phase === 'meta') {
        st.finishT += dt;
        if (input.btn.a || input.btn.start) { resetState(); }
        api.hud.set({ big: '¡META!', sub: 'Tiempo ' + fmt(st.time) + '   Mejor vuelta ' + fmt(st.best) + '   — Cruz o Enter para repetir' });
        return;
      }
      st.time += dt;

      // ---- física del jugador ----
      const accelIn = -input.move.y;           // arriba = acelerar
      const steer = input.move.x;
      const driftOn = !!input.btn.a;
      st.boosting = !!input.btn.b && st.boost > 1 && st.speed > 5;
      const maxS = st.boosting ? 62 : (st.offRoad ? 17 : 50);
      if (accelIn > 0.1) st.speed += 17 * accelIn * dt;
      else if (accelIn < -0.1) st.speed -= 27 * -accelIn * dt;
      else st.speed -= (2.8 + st.speed * 0.025) * dt;
      if (st.boosting) { st.speed += 14 * dt; st.boost = Math.max(0, st.boost - 26 * dt); }
      else st.boost = Math.min(100, st.boost + (st.drift > 0.3 ? 14 : 4.5) * dt);
      st.speed = Math.max(0, Math.min(maxS, st.speed));

      // dirección y derrape
      const grip = st.offRoad ? 0.55 : 1;
      const sf = Math.min(1, st.speed / 14);
      st.latVel += steer * 16 * sf * dt * grip;
      if (driftOn && st.speed > 12) {
        st.latVel += steer * 14 * dt;
        st.drift = Math.min(1, st.drift + 2.4 * dt);
        st.driftT += dt;
      } else {
        st.drift = Math.max(0, st.drift - 3.4 * dt);
      }
      st.latVel *= Math.pow(driftOn ? 0.86 : 0.5, dt * 3.6);
      st.lat += st.latVel * dt;
      if (Math.abs(st.lat) > ROAD_HALF - 0.7) {
        st.offRoad = true;
        st.lat = Math.max(-(ROAD_HALF + 3.4), Math.min(ROAD_HALF + 3.4, st.lat));
      } else st.offRoad = false;

      // progreso + vuelta
      st.s += st.speed * dt;
      const prog = st.s / trackLen;
      const cpN = Math.floor(((prog % 1) + 1) % 1 * 4);
      if (cpN === 0 && st.cp === 3) { // cruzó meta
        st.lap++;
        if (st.lap > 3) {
          st.phase = 'meta'; st.finished = true;
          api.audio.sfx('win');
        } else {
          if (!st.best || st.time < st.best) st.best = st.time;
          st.time = 0;
          api.audio.sfx('coin');
        }
      }
      if (cpN !== st.cp) { if (cpN === st.cp + 1) st.cp = cpN; else if (cpN === 0 && st.cp === 3) {} else st.cp = cpN; }

      // ---- IA ----
      for (const a of st.ai) {
        a.wob += dt;
        const target = 50 * a.maxF;
        a.speed += (target - a.speed) * 0.4 * dt;
        a.s += a.speed * dt;
        a.lat = a.lat + (Math.sin(a.wob * 0.7) * 2.6 - a.lat) * 0.5 * dt;
      }
      // colisiones jugador-IA (empuje simple)
      for (const a of st.ai) {
        let ds = a.s - st.s; ds -= Math.round(ds / trackLen) * trackLen;
        if (Math.abs(ds) < 3.4 && Math.abs(a.lat - st.lat) < 2.1) {
          const push = ds > 0 ? -1 : 1;
          st.latVel += push * 5 * dt * 60 * 0.05;
          a.lat -= push * 0.06;
          st.speed *= 0.985;
          if (rng.next() < 0.1) api.audio.sfx('hit');
        }
      }

      // ---- partículas (derrape / turbo / hierba) ----
      spawnParts(dt);
      for (const p of st.parts) if (p.life > 0) { p.life -= dt * 1.7; p.pos = v3.add(p.pos, v3.mul(p.vel, dt)); p.vel[1] += 1.2 * dt; p.size += dt * 0.8; }

      // ---- audio continuo ----
      api.audio.setLoop('engine', 55 + st.speed * 3.2 + (st.boosting ? 30 : 0), 0.05 + Math.min(0.05, st.speed * 0.001));
      if (st.drift > 0.4 && st.speed > 14 && Math.random() < 0.5) api.audio.sfx('skid', { dur: 0.12 });

      // ---- HUD ----
      const pos = 1 + st.ai.filter(function (a) { return (a.s % trackLen) > (st.s % trackLen); }).length;
      api.hud.set({
        vel: Math.round(st.speed * 3.6), lap: Math.min(3, st.lap), time: fmt(st.time),
        pos: pos, boost: Math.round(st.boost), drift: st.drift > 0.35,
        off: st.offRoad
      });
    },

    render: function (cmds, gpu) {
      const samp = sampleAt(st.s);
      const carPos = [samp.p[0] + samp.n[0] * st.lat, samp.p[1] + 0.02, samp.p[2] + samp.n[2] * st.lat];
      const tAng = Math.atan2(samp.t[0], samp.t[2]);
      const driftAng = Math.atan2(st.latVel, Math.max(6, st.speed)) * 0.9;
      const carAng = tAng + driftAng;

      // cámara de persecución con suavizado y sacudida
      const back = v3.mul(samp.t, -9.2 + st.speed * 0.045);
      let eye = [carPos[0] + back[0], carPos[1] + 4.1, carPos[2] + back[2]];
      if (st.offRoad && st.speed > 8) { eye[1] += Math.sin(st.time * 47) * 0.09; }
      if (!st.camPos) st.camPos = eye;
      st.camPos = v3.lerp(st.camPos, eye, 0.14);
      const look = [carPos[0] + samp.t[0] * 7, carPos[1] + 1.3, carPos[2] + samp.t[2] * 7];

      cmds.push({ op: 'clear', col: st.offRoad ? [0.62, 0.66, 0.55] : [0.45, 0.62, 0.82] });
      cmds.push({ op: 'camera',
        view: m4.lookAt(st.shake ? v3.add(st.camPos, [Math.sin(st.time*60)*0.05, 0, 0]) : st.camPos, look, [0,1,0]),
        proj: m4.perspective(1.08 + st.speed * 0.003, gpu.width / gpu.height, 0.5, 600),
        pos: st.camPos });
      cmds.push({ op: 'light', dir: [0.45, -0.8, 0.35], col: [1.0, 0.96, 0.88], ambient: [0.42, 0.45, 0.5] });
      cmds.push({ op: 'fog', col: [0.55, 0.68, 0.85], near: 90, far: 330 });

      cmds.push({ op: 'mesh', id: 'track' });
      cmds.push({ op: 'mesh', id: 'env' });
      cmds.push({ op: 'mesh', id: 'carP', model: m4.nmul(m4.trans(carPos[0], carPos[1], carPos[2]), m4.rotY(carAng)) });
      cmds.push({ op: 'mesh', id: 'ai1', model: aiModel(st.ai[0]) });
      cmds.push({ op: 'mesh', id: 'ai2', model: aiModel(st.ai[1]) });
      cmds.push({ op: 'mesh', id: 'ai3', model: aiModel(st.ai[2]) });

      // partículas
      const arr = [];
      for (const p of st.parts) {
        if (p.life <= 0) continue;
        arr.push(p.pos[0], p.pos[1], p.pos[2], p.col[0], p.col[1], p.col[2], p.size);
      }
      if (arr.length) cmds.push({ op: 'points', arr: arr });
      st.shake = 0;
    }
  };

  function aiModel(a) {
    const samp = sampleAt(a.s);
    const p = [samp.p[0] + samp.n[0] * a.lat, samp.p[1] + 0.02, samp.p[2] + samp.n[2] * a.lat];
    return m4.nmul(m4.trans(p[0], p[1], p[2]), m4.rotY(Math.atan2(samp.t[0], samp.t[2])));
  }
  function spawnParts(dt) {
    const samp = sampleAt(st.s);
    const rear = [samp.p[0] + samp.n[0] * st.lat - samp.t[0] * 1.8, samp.p[1] + 0.3, samp.p[2] + samp.n[2] * st.lat - samp.t[2] * 1.8];
    const n = Math.round((st.drift > 0.35 ? 3 : 0) + (st.boosting ? 3 : 0) + (st.offRoad && st.speed > 6 ? 2 : 0));
    for (let i = 0; i < n; i++) {
      const slot = st.parts.find(function (p) { return p.life <= 0; });
      if (!slot) break;
      slot.life = 1;
      slot.pos = [rear[0] + rng.range(-0.8, 0.8), rear[1], rear[2] + rng.range(-0.8, 0.8)];
      slot.vel = [rng.range(-1.5, 1.5), rng.range(0.5, 2.2), rng.range(-1.5, 1.5)];
      slot.size = 0.9;
      slot.col = st.boosting ? [1, 0.7, 0.2] : (st.offRoad ? [0.5, 0.4, 0.25] : [0.85, 0.85, 0.9]);
    }
  }
  function fmt(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return m + ':' + ('0' + s).slice(-2) + '.' + ('0' + cs).slice(-2);
  }
});
})();
