/* NovaEmu NG — SHADOW RUINS: plataformas 3D de nueva generación
   Corre sobre el pipeline NGGPU (command buffer → WebGL2) como un paquete NovaPKG. */
(function () {
'use strict';
const NG = window.NG;

const CONTROLS = [
  { action: 'up',    label: 'Avanzar',  keys: 'W / ↑', pad: 'Palanca izq.' },
  { action: 'down',  label: 'Retroceder', keys: 'S / ↓', pad: 'Palanca izq.' },
  { action: 'left',  label: 'Izquierda', keys: 'A / ←', pad: 'Palanca izq.' },
  { action: 'right', label: 'Derecha',  keys: 'D / →', pad: 'Palanca izq.' },
  { action: 'a',     label: 'Saltar (x2 en el aire)', keys: 'Espacio', pad: 'Cruz / A' },
  { action: 'lookL', label: 'Cámara izq.', keys: 'J', pad: 'Palanca der.' },
  { action: 'lookR', label: 'Cámara der.', keys: 'L', pad: 'Palanca der.' },
  { action: 'lookU', label: 'Cámara arriba', keys: 'I', pad: 'Palanca der.' },
  { action: 'lookD', label: 'Cámara abajo', keys: 'K', pad: 'Palanca der.' },
  { action: 'start', label: 'Reiniciar', keys: 'Enter', pad: 'Options' }
];

NG.NGPackage.register({
  id: 'shadow-ruins',
  title: 'Shadow Ruins',
  genre: 'Plataformas 3D',
  version: '1.0.0',
  desc: 'Explora ruinas flotantes al atardecer: doble salto, 10 gemas, plataformas móviles y un portal final.',
  cover: ['#2b1055', '#7597de', '#ffb86b'],
  controls: CONTROLS,
  keyMap: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    a: ['Space'], b: ['ShiftLeft'],
    lookL: ['KeyJ'], lookR: ['KeyL'], lookU: ['KeyI'], lookD: ['KeyK'],
    start: ['Enter']
  }
}, function (api) {
  const { m4, v3, mesh } = api;
  const rng = api.rng;
  const GRAV = -26, JUMP = 10.2, JUMP2 = 9.0, SPD = 8.2;

  // ---------- nivel: plataformas [x, y, z, w, h, d, color] ----------
  const PLATS = [
    [0, 0, 0, 10, 1, 10, '#6d5a8c'],          // plaza inicial
    [0, 0.6, -10, 3.4, 1.2, 3.4, '#7c6aa0'],
    [-5.5, 1.4, -16, 3.0, 1.2, 3.0, '#7c6aa0'],
    [-11, 2.4, -21, 3.6, 1.2, 3.6, '#8a76ae'],
    [-11, 3.2, -29, 4.2, 1.2, 4.2, '#6d5a8c'],   // checkpoint 1
    [-4, 4.0, -35, 3.0, 1.2, 3.0, '#7c6aa0'],
    [4, 5.0, -39, 3.0, 1.2, 3.0, '#7c6aa0'],
    [12, 5.6, -43, 4.6, 1.2, 4.6, '#8a76ae'],    // checkpoint 2
    [12, 6.4, -52, 3.2, 1.2, 3.2, '#7c6aa0'],
    [4, 7.2, -57, 3.0, 1.2, 3.0, '#7c6aa0'],
    [-5, 8.0, -61, 5.0, 1.2, 5.0, '#6d5a8c'],    // checkpoint 3
    [-5, 8.8, -70, 3.0, 1.2, 3.0, '#7c6aa0'],
    [3, 9.6, -76, 3.4, 1.2, 3.4, '#8a76ae'],
    [12, 10.4, -80, 6.0, 1.4, 6.0, '#c9a86a'],   // plataforma del portal
    // torre lateral con gemas
    [22, 1.0, -20, 4.0, 1.2, 4.0, '#7c6aa0'],
    [27, 2.2, -25, 3.0, 1.2, 3.0, '#7c6aa0'],
    [27, 3.4, -31, 3.0, 1.2, 3.0, '#7c6aa0'],
    [22, 4.6, -35, 4.0, 1.2, 4.0, '#8a76ae']
  ];
  const MOVE_PLATS = [
    { x0: 2, y: 1.9, z0: -20, x1: -2, z1: -20, w: 2.8, d: 2.8, t: 0, spd: 0.55 },   // puente móvil
    { x0: 12, y: 7.0, z0: -66, x1: 12, z1: -72, w: 2.8, d: 2.8, t: 1.5, spd: 0.7 },
    { x0: 18, y: 5.6, z0: -18, x1: 22, z1: -18, w: 2.6, d: 2.6, t: 0.8, spd: 0.6 }
  ];
  const GEMS = [
    [0, 1.8, -10], [-5.5, 2.6, -16], [-11, 3.6, -21], [-8, 5.2, -32], [4, 5.2, -35],
    [12, 6.8, -43], [4, 8.4, -57], [-5, 10.0, -70], [27, 3.4, -28], [22, 5.8, -35]
  ];
  const SPIKES = [ [-11, 3.8, -29], [12, 11.2, -80] ]; // pinchos que suben/bajan sobre 2 plataformas

  const st = {};
  function resetState() {
    st.pos = [0, 1.4, 2]; st.vel = [0,0,0];
    st.onGround = false; st.jumps = 0; st.coyote = 0;
    st.yaw = 0; st.camYaw = Math.PI; st.camPitch = 0.34;
    st.gems = []; for (let i = 0; i < GEMS.length; i++) st.gems.push({ taken: false });
    st.checkpoint = [0, 1.4, 2];
    st.time = 0; st.phase = 'juego';
    st.respawnT = 0; st.winT = 0;
    st.parts = []; for (let i = 0; i < 200; i++) st.parts.push({ life: 0 });
    st.moving = MOVE_PLATS.map(function (p) { return { t: p.t }; });
    st.spikeT = 0;
    st.camPos = null;
    st.spikesUp = [0, 0];
  }

  const gm = {};
  function buildChar() {
    return mesh.merge([
      { mesh: mesh.box(0.72, 0.86, 0.5, '#e8b04b'), at: [0, 0.85, 0] },
      { mesh: mesh.sphere(0.34, 8, 10, '#f4d9a6'), at: [0, 1.62, 0] },
      { mesh: mesh.box(0.78, 0.2, 0.55, '#8a5a2b'), at: [0, 1.78, 0] },
      { mesh: mesh.box(0.2, 0.7, 0.24, '#c98e35'), at: [-0.47, 0.95, 0] },
      { mesh: mesh.box(0.2, 0.7, 0.24, '#c98e35'), at: [ 0.47, 0.95, 0] },
      { mesh: mesh.box(0.24, 0.5, 0.26, '#5a4632'), at: [-0.2, 0.25, 0] },
      { mesh: mesh.box(0.24, 0.5, 0.26, '#5a4632'), at: [ 0.2, 0.25, 0] }
    ]);
  }
  function buildGem() {
    return mesh.merge([{ mesh: mesh.sphere(0.42, 6, 8, '#57e6c9'), at: [0,0,0] }]);
  }
  function buildPortal() {
    return mesh.merge([
      { mesh: mesh.torus(1.9, 0.24, 18, 10, '#57b9ff') },
      { mesh: mesh.box(0.5, 4.6, 0.5, '#4a4460'), at: [-2.6, 2.1, 0] },
      { mesh: mesh.box(0.5, 4.6, 0.5, '#4a4460'), at: [ 2.6, 2.1, 0] },
      { mesh: mesh.box(6.2, 0.6, 0.6, '#4a4460'), at: [0, 4.5, 0] }
    ]);
  }
  function buildFlag() {
    return mesh.merge([
      { mesh: mesh.cylinder(0.06, 0.08, 2.2, 5, '#8a8a96'), at: [0, 1.1, 0] },
      { mesh: mesh.box(0.06, 0.5, 0.9, '#57e6c9'), at: [0.46, 1.9, 0] }
    ]);
  }
  function buildSpikes() {
    const s = mesh.merge([
      { mesh: mesh.cylinder(0.01, 0.3, 1.2, 5, '#d84a4a'), at: [0, 0.6, 0] }
    ]);
    return mesh.merge([
      { mesh: s, at: [-1.2, 0, 0] }, { mesh: s, at: [0, 0, 0] }, { mesh: s, at: [1.2, 0, 0] }
    ]);
  }

  return {
    start: function () {
      resetState();
      if (!gm.char) {
        gm.char = buildChar(); gm.gem = buildGem(); gm.portal = buildPortal();
        gm.flag = buildFlag(); gm.spikes = buildSpikes();
        for (const k in gm) api.gpu.uploadMesh(k, gm[k]);
        // plataformas estáticas en una sola malla combinada
        const parts = [];
        for (const p of PLATS) {
          parts.push({ mesh: mesh.box(p[3], p[4], p[5], p[6], '#9d86c2'), at: [p[0], p[1], p[2]] });
        }
        parts.push({ mesh: mesh.plane(300, 300, 6, 6, '#1c2f45'), at: [0, -14, -40] }); // niebla del abismo
        for (let i = 0; i < 16; i++) { // columnas decorativas
          const a = (i / 16) * Math.PI * 2, r = rng.range(18, 60);
          parts.push({ mesh: mesh.cylinder(0.7, 0.9, rng.range(4, 10), 7, '#57507a'), at: [Math.cos(a)*r, -6, -40 + Math.sin(a)*r] });
        }
        gm.level = mesh.merge(parts);
        api.gpu.uploadMesh('level', gm.level);
        const mp = [];
        for (const p of MOVE_PLATS) mp.push({ mesh: mesh.box(p.w, 0.5, p.d, '#e0a458', '#f2c98a'), at: [0, 0, 0] });
        gm.movePlat = mesh.merge(mp);
        api.gpu.uploadMesh('movePlat', gm.movePlat);
      }
      api.audio.ensure();
      api.audio.playMusic([262, 0, 330, 392, 0, 330, 262, 0, 220, 0, 262, 330, 0, 262, 0, 196], 92, 'triangle');
      api.log('GAME', 'Shadow Ruins iniciado — recoge las 10 gemas');
    },
    shutdown: function () { api.audio.stopMusic(); },
    serialize: function () {
      return { pos: st.pos, vel: st.vel, yaw: st.yaw, camYaw: st.camYaw, camPitch: st.camPitch,
        gems: st.gems.map(function (g) { return g.taken; }), checkpoint: st.checkpoint,
        time: st.time, phase: st.phase };
    },
    deserialize: function (d) {
      st.pos = d.pos; st.vel = d.vel; st.yaw = d.yaw || 0; st.camYaw = d.camYaw || Math.PI;
      st.camPitch = d.camPitch || 0.34;
      (d.gems || []).forEach(function (t, i) { if (st.gems[i]) st.gems[i].taken = !!t; });
      st.checkpoint = d.checkpoint || [0, 1.4, 2];
      st.time = d.time || 0; st.phase = d.phase || 'juego';
    },

    tick: function (dt, input) {
      st.time += dt;
      if (st.phase === 'win') {
        st.winT += dt;
        if (input.btn.a || input.btn.start) resetState();
        api.hud.set({ big: '¡RUINAS COMPLETADAS!', sub: 'Tiempo ' + st.time.toFixed(1) + ' s   — Salta para volver a jugar' });
        return;
      }
      // cámara orbital
      st.camYaw += input.look.x * 2.4 * dt;
      st.camPitch = Math.max(0.05, Math.min(1.05, st.camPitch + input.look.y * 1.8 * dt));

      // movimiento relativo a cámara
      const my = -input.move.y, mx = input.move.x;
      const cy = st.camYaw;
      const fwdX = Math.sin(cy), fwdZ = Math.cos(cy);
      let wx = fwdX * my + Math.cos(cy) * mx;
      let wz = fwdZ * my - Math.sin(cy) * mx;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      st.vel[0] = v3.lerp([st.vel[0]], [wx * SPD], Math.min(1, 12 * dt))[0];
      st.vel[2] = v3.lerp([st.vel[2]], [wz * SPD], Math.min(1, 12 * dt))[0];

      // salto con coyote-time y doble salto
      st.coyote = st.onGround ? 0.12 : Math.max(0, st.coyote - dt);
      const wantJump = input.btn.a && !st._jumpHeld;
      st._jumpHeld = !!input.btn.a;
      if (wantJump && (st.onGround || st.coyote > 0 || st.jumps < 2)) {
        const first = st.onGround || st.coyote > 0;
        st.vel[1] = first ? JUMP : JUMP2;
        st.jumps = first ? 1 : 2;
        st.coyote = 0; st.onGround = false;
        api.audio.sfx(first ? 'jump' : 'coin');
      }
      st.vel[1] += GRAV * dt;
      st.pos = v3.add(st.pos, v3.mul(st.vel, dt));

      // plataformas móviles
      st.moving = MOVE_PLATS.map(function (p, i) {
        const t = st.time * p.spd + MOVE_PLATS[i].t;
        const f = (Math.sin(t) + 1) / 2;
        return [p.x0 + (p.x1 - p.x0) * f, p.y, p.z0 + (p.z1 - p.z0) * f];
      });
      // pinchos
      st.spikeT += dt;
      st.spikesUp = SPIKES.map(function (_, i) {
        return (Math.sin(st.spikeT * 1.4 + i * 2.1) + 1) / 2;
      });

      // colisión con plataformas (AABB simple, aterrizaje por arriba)
      st.onGround = false;
      const bodies = [];
      for (const p of PLATS) bodies.push({ x: p[0], y: p[1] + p[4]/2, z: p[2], hw: p[3]/2, hd: p[5]/2 });
      MOVE_PLATS.forEach(function (p, i) {
        bodies.push({ x: st.moving[i][0], y: st.moving[i][1] + 0.25, z: st.moving[i][2], hw: p.w/2, hd: p.d/2, mov: st.moving[i] });
      });
      for (const b of bodies) {
        const insideXZ = Math.abs(st.pos[0]-b.x) < b.hw + 0.35 && Math.abs(st.pos[2]-b.z) < b.hd + 0.35;
        if (!insideXZ) continue;
        const feet = st.pos[1] - 1.5;
        if (st.vel[1] <= 0 && feet <= b.y + 0.15 && feet > b.y - 0.7) {
          st.pos[1] = b.y + 1.5;
          st.vel[1] = 0;
          st.onGround = true; st.jumps = 0;
          if (b.mov) { st.pos[0] += 0; } // las móviles se sienten por el contacto
        }
      }
      // checkpoint por zonas
      for (const cpIdx of [0, 4, 7, 10]) {
        const p = PLATS[cpIdx];
        if (Math.abs(st.pos[0]-p[0]) < p[3]/2 + 0.4 && Math.abs(st.pos[2]-p[2]) < p[5]/2 + 0.4 && Math.abs(st.pos[1] - (p[1]+p[4]/2+1.5)) < 2) {
          st.checkpoint = [p[0], p[1] + p[4]/2 + 1.4, p[2] + 0];
        }
      }
      // caída al abismo → respawn moderno (sin castigo duro)
      if (st.pos[1] < -13) {
        st.pos = st.checkpoint.slice(); st.vel = [0,0,0];
        api.audio.sfx('lose');
      }
      // pinchos
      SPIKES.forEach(function (s, i) {
        const up = st.spikesUp[i];
        if (up > 0.45 && Math.abs(st.pos[0]-s[0]) < 2.4 && Math.abs(st.pos[2]-s[2]) < 1.6 && Math.abs(st.pos[1] - (s[1] + 2.0)) < 2.2) {
          st.pos = st.checkpoint.slice(); st.vel = [0,0,0];
          api.audio.sfx('hit');
        }
      });

      // gemas
      const gemCount = st.gems.filter(function (g) { return g.taken; }).length;
      GEMS.forEach(function (g, i) {
        if (st.gems[i].taken) return;
        const bob = Math.sin(st.time * 2.4 + i) * 0.25;
        if (v3.len(v3.sub(st.pos, [g[0], g[1] + 1.0 + bob, g[2]])) < 1.35) {
          st.gems[i].taken = true;
          api.audio.sfx('coin');
          for (let k = 0; k < 10; k++) {
            const slot = st.parts.find(function (p) { return p.life <= 0; });
            if (!slot) break;
            slot.life = 0.7; slot.pos = [g[0], g[1] + 1 + bob, g[2]];
            slot.vel = [rng.range(-2, 2), rng.range(1, 3.5), rng.range(-2, 2)];
            slot.size = 0.8; slot.col = [0.35, 0.95, 0.8];
          }
        }
      });
      const total = st.gems.filter(function (g) { return g.taken; }).length;
      // portal
      const portalPos = [12, PLATS[13][1] + 0.7 + PLATS[13][4]/2, -80];
      const portalActive = total >= GEMS.length;
      if (portalActive && v3.len(v3.sub(st.pos, [portalPos[0], portalPos[1] + 1.4, portalPos[2]])) < 2.2) {
        st.phase = 'win';
        api.audio.sfx('win');
      }

      // luciérnagas
      for (const p of st.parts) if (p.life > 0) { p.life -= dt * 1.3; p.pos = v3.add(p.pos, v3.mul(p.vel, dt)); p.vel[1] -= 1.5 * dt; }

      api.hud.set({
        gems: total, total: GEMS.length, time: st.time.toFixed(1),
        tip: portalActive ? '¡Portal activo en la cima!' : 'Recoge las gemas y llega al portal'
      });
    },

    render: function (cmds, gpu) {
      const cy = st.camYaw + Math.PI, cp = st.camPitch;
      const dist = 8.6;
      const eye = [
        st.pos[0] + Math.sin(cy) * Math.cos(cp) * dist,
        st.pos[1] + 2.1 + Math.sin(cp) * dist,
        st.pos[2] + Math.cos(cy) * Math.cos(cp) * dist
      ];
      if (!st.camPos) st.camPos = eye;
      st.camPos = v3.lerp(st.camPos, eye, 0.16);
      const look = [st.pos[0], st.pos[1] + 1.4, st.pos[2]];

      cmds.push({ op: 'clear', col: [0.86, 0.56, 0.38] }); // atardecer
      cmds.push({ op: 'camera',
        view: m4.lookAt(st.camPos, look, [0,1,0]),
        proj: m4.perspective(1.05, gpu.width / gpu.height, 0.3, 400),
        pos: st.camPos });
      cmds.push({ op: 'light', dir: [-0.6, -0.5, 0.5], col: [1.0, 0.72, 0.45], ambient: [0.48, 0.4, 0.45] });
      cmds.push({ op: 'fog', col: [0.86, 0.56, 0.38], near: 55, far: 190 });

      cmds.push({ op: 'mesh', id: 'level' });
      // plataformas móviles (modelos separados)
      st.moving.forEach(function (mp, i) {
        cmds.push({ op: 'mesh', id: 'movePlat', model: m4.trans(mp[0], mp[1], mp[2]), tint: i === 0 ? '#ffffff' : (i === 1 ? '#ffd9a8' : '#c8e8ff') });
      });
      // personaje (mirando hacia la velocidad)
      const faceAng = Math.atan2(st.vel[0], st.vel[2]);
      cmds.push({ op: 'mesh', id: 'char', model: m4.nmul(m4.trans(st.pos[0], st.pos[1] - 1.5, st.pos[2]), m4.rotY(faceAng)) });
      // gemas
      GEMS.forEach(function (g, i) {
        if (st.gems[i].taken) return;
        const bob = Math.sin(st.time * 2.4 + i) * 0.25;
        cmds.push({ op: 'mesh', id: 'gem', model: m4.nmul(m4.trans(g[0], g[1] + 1.0 + bob, g[2]), m4.rotY(st.time * 1.8 + i)) });
      });
      // checkpoints
      for (const cpIdx of [4, 7, 10]) {
        const p = PLATS[cpIdx];
        cmds.push({ op: 'mesh', id: 'flag', model: m4.trans(p[0] + p[3]/2 - 0.8, p[1] + p[4]/2, p[2] + p[5]/2 - 0.8) });
      }
      // pinchos
      SPIKES.forEach(function (s, i) {
        cmds.push({ op: 'mesh', id: 'spikes', model: m4.nmul(m4.trans(s[0], s[1] + 0.5 + st.spikesUp[i] * 1.2, s[2]), m4.rotY(i * 0.8)) });
      });
      // portal
      const portalActive = st.gems.filter(function (g) { return g.taken; }).length >= GEMS.length;
      const pp = [12, PLATS[13][1] + 0.7 + PLATS[13][4]/2, -80];
      cmds.push({ op: 'mesh', id: 'portal', model: m4.nmul(m4.trans(pp[0], pp[1], pp[2]), m4.rotY(st.time * (portalActive ? 2.2 : 0.4))), tint: portalActive ? '#7df3ff' : '#5a5a72' });

      // partículas (gemas + luciérnagas ambientales)
      const arr = [];
      for (const p of st.parts) if (p.life > 0) arr.push(p.pos[0], p.pos[1], p.pos[2], p.col[0], p.col[1], p.col[2], p.size);
      if (!st.amb || st._ambTick !== Math.floor(st.time * 3)) {
        st._ambTick = Math.floor(st.time * 3);
        const slotSlot = st.parts.find(function (p) { return p.life <= 0; });
        if (slotSlot) {
          slotSlot.life = rng.range(2, 3.5);
          slotSlot.pos = [st.pos[0] + rng.range(-14, 14), st.pos[1] + rng.range(-2, 5), st.pos[2] + rng.range(-14, 14)];
          slotSlot.vel = [rng.range(-0.3, 0.3), rng.range(0.1, 0.5), rng.range(-0.3, 0.3)];
          slotSlot.size = 0.7; slotSlot.col = [1, 0.85, 0.4];
        }
      }
      if (arr.length) cmds.push({ op: 'points', arr: arr });
    }
  };
});
})();
