/* NovaEmu NG — STAR RAID: combate espacial 3D de nueva generación
   Corre sobre el pipeline NGGPU (command buffer → WebGL2) como un paquete NovaPKG. */
(function () {
'use strict';
const NG = window.NG;

const CONTROLS = [
  { action: 'left',  label: 'Guiñar izq.',  keys: 'A / ←', pad: 'Palanca izq.' },
  { action: 'right', label: 'Guiñar der.',  keys: 'D / →', pad: 'Palanca izq.' },
  { action: 'up',    label: 'Cabecear abajo', keys: 'W / ↑', pad: 'Palanca izq.' },
  { action: 'down',  label: 'Cabecear arriba', keys: 'S / ↓', pad: 'Palanca izq.' },
  { action: 'a',     label: 'Disparar', keys: 'Espacio', pad: 'Cruz / A' },
  { action: 'b',     label: 'Postquemador', keys: 'Mayús', pad: 'Círculo / B' },
  { action: 'start', label: 'Reiniciar', keys: 'Enter', pad: 'Options' }
];

NG.NGPackage.register({
  id: 'star-raid',
  title: 'Star Raid',
  genre: 'Combate espacial',
  version: '1.0.0',
  desc: 'Caza estelar 6 grados de libertad: oleadas enemigas, escudos regenerativos y postquemador.',
  cover: ['#0b0d2a', '#41295a', '#4fc3f7'],
  controls: CONTROLS,
  keyMap: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    a: ['Space'], b: ['ShiftLeft', 'ShiftRight'], start: ['Enter']
  }
}, function (api) {
  const { m4, v3, mesh } = api;
  const rng = api.rng;
  const ARENA = 150;

  const st = {};
  function resetState() {
    st.pos = [0, 0, 60]; st.vel = [0,0,0];
    st.yaw = Math.PI; st.pitch = 0;
    st.shield = 100; st.hull = 100; st.noHitT = 0;
    st.score = 0; st.wave = 0; st.enemies = []; st.ebullets = []; st.pbullets = [];
    st.fireCd = 0; st.time = 0;
    st.phase = 'oleada'; st.phaseT = 2.2; st.pending = 0; st.spawnT = 0;
    st.parts = []; for (let i = 0; i < 300; i++) st.parts.push({ life: 0 });
    st.shake = 0; st.boostFuel = 100;
    st.camPos = null; st.camUp = [0,1,0];
    st.hits = 0; st.kills = 0;
  }
  function fwd(yaw, pitch) {
    return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  }

  // ---------- mallas ----------
  function buildShip(colorMain, colorGlow) {
    return mesh.merge([
      { mesh: mesh.cylinder(0.05, 0.75, 3.6, 6, colorGlow), at: [0, 0, -0.6], ry: Math.PI / 2 },
      { mesh: mesh.box(1.5, 0.5, 2.2, colorMain), at: [0, 0, 0.4] },
      { mesh: mesh.box(3.4, 0.14, 1.4, colorMain), at: [0, 0.1, 0.9] },
      { mesh: mesh.box(0.5, 0.4, 1.0, colorGlow), at: [-1.6, 0.15, 1.2] },
      { mesh: mesh.box(0.5, 0.4, 1.0, colorGlow), at: [ 1.6, 0.15, 1.2] },
      { mesh: mesh.box(0.8, 0.3, 0.3, colorGlow), at: [0, 0.45, 1.7] }
    ]);
  }
  function buildWorld() {
    return mesh.merge([
      { mesh: mesh.sphere(46, 18, 24, '#2b4a6f'), at: [-180, -40, -260] },   // planeta
      { mesh: mesh.sphere(13, 12, 16, '#7a5c46'), at: [220, 80, -180] }      // luna
    ]);
  }

  const gm = {};
  function spawnEnemy() {
    const a = rng.next() * Math.PI * 2, b = (rng.next() - 0.5) * Math.PI, r = rng.range(70, 120);
    st.enemies.push({
      pos: [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r],
      vel: [0,0,0], hp: 2, fireT: rng.range(0.6, 1.8), wob: rng.next() * 10
    });
  }
  function burst(pos, col, n, spd) {
    for (let i = 0; i < n; i++) {
      const slot = st.parts.find(function (p) { return p.life <= 0; });
      if (!slot) return;
      slot.life = rng.range(0.5, 1.0);
      slot.pos = pos.slice();
      slot.vel = [rng.range(-spd, spd), rng.range(-spd, spd), rng.range(-spd, spd)];
      slot.size = 1.1; slot.col = col;
    }
  }

  return {
    start: function () {
      resetState();
      if (!gm.ship) {
        gm.ship = buildShip('#c7cedb', '#33e0ff');
        gm.foe = buildShip('#8a4a4f', '#ff4f5e');
        gm.world = buildWorld();
        api.gpu.uploadMesh('ship', gm.ship);
        api.gpu.uploadMesh('foe', gm.foe);
        api.gpu.uploadMesh('world', gm.world);
      }
      api.audio.ensure();
      api.audio.startLoop('engine', { type: 'sawtooth', freq: 52, filter: 260, vol: 0.05 });
      api.audio.playMusic([110, 0, 131, 165, 0, 131, 110, 0, 98, 0, 117, 147, 0, 117, 98, 0], 100, 'sawtooth');
      api.log('GAME', 'Star Raid iniciado — sector 7 despejado');
    },
    shutdown: function () { api.audio.stopLoop('engine'); api.audio.stopMusic(); },
    serialize: function () {
      return { pos: st.pos, vel: st.vel, yaw: st.yaw, pitch: st.pitch, shield: st.shield,
        hull: st.hull, score: st.score, wave: st.wave, phase: st.phase, phaseT: st.phaseT,
        time: st.time, kills: st.kills, boostFuel: st.boostFuel,
        enemies: st.enemies.map(function (e) { return { pos: e.pos, hp: e.hp }; }) };
    },
    deserialize: function (d) {
      st.pos = d.pos; st.vel = d.vel; st.yaw = d.yaw; st.pitch = d.pitch;
      st.shield = d.shield; st.hull = d.hull; st.score = d.score; st.wave = d.wave;
      st.phase = d.phase; st.phaseT = d.phaseT; st.time = d.time; st.kills = d.kills || 0;
      st.boostFuel = d.boostFuel === undefined ? 100 : d.boostFuel;
      st.enemies = (d.enemies || []).map(function (e) {
        return { pos: e.pos, vel: [0,0,0], hp: e.hp, fireT: 1.5, wob: 0 };
      });
    },

    tick: function (dt, input) {
      st.time += dt;
      st.noHitT += dt;
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 3);

      if (st.phase === 'fin' || st.phase === 'fin-mal') {
        if (input.btn.a || input.btn.start) resetState();
        api.hud.set({
          big: st.phase === 'fin' ? 'SECTOR DESPEJADO' : 'NAVE DESTRUIDA',
          sub: 'Puntos ' + st.score + '   Bajas ' + st.kills + '   — Dispara para reintentar'
        });
        return;
      }
      if (st.phase === 'oleada') {
        st.phaseT -= dt;
        api.hud.set({ big: 'OLEADA ' + (st.wave + 1), sub: 'Prepara el caza...' });
        if (st.phaseT <= 0) {
          st.wave++;
          st.pending = 2 + st.wave * 2;
          st.spawnT = 0;
          st.phase = 'combate';
        }
        return;
      }

      // ---- vuelo del jugador ----
      const steer = input.move;
      st.yaw   += steer.x * 1.9 * dt;
      st.pitch += -steer.y * 1.35 * dt;
      st.pitch = Math.max(-1.25, Math.min(1.25, st.pitch));
      const boosting = !!input.btn.b && st.boostFuel > 1;
      const f = fwd(st.yaw, st.pitch);
      const thrust = boosting ? 62 : 34;
      st.vel = v3.add(st.vel, v3.mul(f, thrust * dt));
      if (boosting) { st.boostFuel = Math.max(0, st.boostFuel - 30 * dt); if (rng.next() < 0.4) burst(v3.add(st.pos, v3.mul(f, -2.5)), [0.4, 0.8, 1], 2, 3); }
      else st.boostFuel = Math.min(100, st.boostFuel + 14 * dt);
      st.vel = v3.mul(st.vel, Math.pow(0.32, dt));
      const spd = v3.len(st.vel);
      const cap = boosting ? 92 : 58;
      if (spd > cap) st.vel = v3.mul(st.vel, cap / spd);
      st.pos = v3.add(st.pos, v3.mul(st.vel, dt));
      // límites de arena: rebote suave
      const r = v3.len(st.pos);
      if (r > ARENA) {
        st.pos = v3.mul(st.pos, ARENA / r);
        st.vel = v3.mul(st.vel, -0.4);
        api.audio.sfx('hit');
      }
      api.audio.setLoop('engine', 48 + spd * 1.4 + (boosting ? 26 : 0), 0.04 + spd * 0.0006);

      // ---- disparo del jugador ----
      st.fireCd -= dt;
      if (input.btn.a && st.fireCd <= 0) {
        st.fireCd = 0.15;
        const nose = v3.add(st.pos, v3.mul(f, 3));
        st.pbullets.push({ pos: nose, vel: v3.mul(f, 135), life: 1.5 });
        api.audio.sfx('laser');
      }
      for (const b of st.pbullets) { b.pos = v3.add(b.pos, v3.mul(b.vel, dt)); b.life -= dt; }
      st.pbullets = st.pbullets.filter(function (b) { return b.life > 0; });

      // ---- enemigos ----
      st.spawnT -= dt;
      if (st.pending > 0 && st.spawnT <= 0) { spawnEnemy(); st.pending--; st.spawnT = 0.55; }
      for (const e of st.enemies) {
        e.wob += dt;
        const toP = v3.sub(st.pos, e.pos);
        const dist = v3.len(toP);
        const dir = v3.norm(toP);
        const desired = dist > 34 ? v3.mul(dir, 26) : v3.add(v3.mul(dir, 8), v3.mul([dir[2], 0.5 * Math.sin(e.wob * 2), -dir[0]], 16));
        e.vel = v3.lerp(e.vel, desired, 1.2 * dt);
        e.pos = v3.add(e.pos, v3.mul(e.vel, dt));
        // disparo enemigo con anticipación
        e.fireT -= dt;
        if (e.fireT <= 0 && dist < 90) {
          e.fireT = Math.max(0.5, 1.7 - st.wave * 0.12);
          const lead = v3.add(st.pos, v3.mul(st.vel, dist / 70));
          const aim = v3.norm(v3.sub(lead, e.pos));
          st.ebullets.push({ pos: v3.add(e.pos, v3.mul(aim, 2)), vel: v3.mul(aim, 72), life: 2.2 });
        }
        // impacto jugador↔enemigo (embestida)
        if (dist < 3.4) { e.hp = 0; damagePlayer(30); }
      }
      // balas enemigas
      for (const b of st.ebullets) { b.pos = v3.add(b.pos, v3.mul(b.vel, dt)); b.life -= dt; }
      st.ebullets = st.ebullets.filter(function (b) { return b.life > 0; });

      // impactos de balas del jugador
      st.pbullets = st.pbullets.filter(function (b) {
        for (const e of st.enemies) {
          if (v3.len(v3.sub(b.pos, e.pos)) < 2.3) {
            e.hp--;
            burst(b.pos, [1, 0.9, 0.4], 4, 4);
            if (e.hp <= 0) {
              burst(e.pos, [1, 0.5, 0.2], 22, 9);
              api.audio.sfx('boom');
              st.score += 100; st.kills++;
            }
            return false;
          }
        }
        return true;
      });
      st.enemies = st.enemies.filter(function (e) { return e.hp > 0; });
      // impactos al jugador
      st.ebullets = st.ebullets.filter(function (b) {
        if (v3.len(v3.sub(b.pos, st.pos)) < 2.6) {
          damagePlayer(12);
          return false;
        }
        return true;
      });

      // escudos regenerativos
      if (st.noHitT > 3 && st.shield < 100) st.shield = Math.min(100, st.shield + 9 * dt);

      if (st.hull <= 0) { st.phase = 'fin-mal'; api.audio.sfx('lose'); }
      else if (st.enemies.length === 0 && st.pending === 0) {
        st.phase = 'oleada'; st.phaseT = 2.6; st.score += 250;
        api.audio.sfx('coin');
      }

      // partículas
      for (const p of st.parts) if (p.life > 0) { p.life -= dt * 1.4; p.pos = v3.add(p.pos, v3.mul(p.vel, dt)); }

      api.hud.set({
        shield: Math.round(st.shield), hull: Math.round(st.hull),
        score: st.score, wave: st.wave,
        enemies: st.enemies.length + st.pending, boost: Math.round(st.boostFuel),
        radar: st.enemies.map(function (e) {
          const rel = v3.sub(e.pos, st.pos);
          const ry = rel[0] * Math.cos(-st.yaw) - rel[2] * Math.sin(-st.yaw);
          const rx = rel[0] * Math.sin(-st.yaw) + rel[2] * Math.cos(-st.yaw);
          return { x: Math.max(-1, Math.min(1, rx / 120)), y: Math.max(-1, Math.min(1, ry / 120)) };
        })
      });
    },

    render: function (cmds, gpu) {
      const f = fwd(st.yaw, st.pitch);
      const rightV = v3.norm([f[2], 0, -f[0]]);
      const upV = v3.cross(rightV, f);
      // cámara trasera
      let eye = v3.add(st.pos, v3.add(v3.mul(f, -10.5), v3.mul(upV, 3.2)));
      if (!st.camPos) st.camPos = eye;
      st.camPos = v3.lerp(st.camPos, eye, 0.22);
      st.camUp = v3.lerp(st.camUp, upV, 0.18);
      const look = v3.add(st.pos, v3.mul(f, 26));
      const shk = st.shake > 0 ? 0.25 * st.shake : 0;

      cmds.push({ op: 'clear', col: [0.02, 0.02, 0.06] });
      cmds.push({ op: 'camera',
        view: m4.lookAt(
          v3.add(st.camPos, [rng.range(-shk, shk), rng.range(-shk, shk), 0]), look, st.camUp),
        proj: m4.perspective(1.15, gpu.width / gpu.height, 0.4, 1200),
        pos: st.camPos });
      cmds.push({ op: 'light', dir: [0.5, -0.75, 0.4], col: [1, 0.97, 0.9], ambient: [0.3, 0.3, 0.4] });
      cmds.push({ op: 'fog', col: [0.02, 0.02, 0.07], near: 400, far: 1100 });

      // campo de estrellas (puntos)
      if (!st.stars) {
        const pts = [];
        for (let i = 0; i < 420; i++) {
          const a = rng.next() * Math.PI * 2, b = Math.acos(rng.next() * 2 - 1), rr = rng.range(350, 800);
          const br = rng.range(0.35, 1);
          pts.push(Math.cos(a) * Math.sin(b) * rr, Math.cos(b) * rr, Math.sin(a) * Math.sin(b) * rr, br, br, br * 0.95 + 0.05, 2.4);
        }
        st.stars = new Float32Array(pts);
      }
      cmds.push({ op: 'points', arr: st.stars });
      cmds.push({ op: 'mesh', id: 'world' });
      cmds.push({ op: 'mesh', id: 'ship', model: shipModel() });
      for (const e of st.enemies) {
        const toP = v3.norm(v3.sub(st.pos, e.pos));
        cmds.push({ op: 'mesh', id: 'foe', model: m4.nmul(m4.trans(e.pos[0], e.pos[1], e.pos[2]), m4.rotY(Math.atan2(toP[0], toP[2]))) });
      }
      // trazadoras y balas como puntos brillantes
      const arr = [];
      for (const b of st.pbullets) arr.push(b.pos[0], b.pos[1], b.pos[2], 0.3, 0.95, 1, 2.6);
      for (const b of st.ebullets) arr.push(b.pos[0], b.pos[1], b.pos[2], 1, 0.3, 0.3, 3.0);
      for (const p of st.parts) if (p.life > 0) arr.push(p.pos[0], p.pos[1], p.pos[2], p.col[0], p.col[1], p.col[2], p.size);
      if (arr.length) cmds.push({ op: 'points', arr: arr });
    }
  };

  function shipModel() {
    const f = fwd(st.yaw, st.pitch);
    const rightV = v3.norm([f[2], 0, -f[0]]);
    const upV = v3.cross(rightV, f);
    const m = new Float32Array(16);
    m[0] = rightV[0]; m[1] = rightV[1]; m[2] = rightV[2]; m[3] = 0;
    m[4] = upV[0];    m[5] = upV[1];    m[6] = upV[2];    m[7] = 0;
    m[8] = -f[0];     m[9] = -f[1];     m[10] = -f[2];    m[11] = 0;
    m[12] = st.pos[0]; m[13] = st.pos[1]; m[14] = st.pos[2]; m[15] = 1;
    return m;
  }
  function damagePlayer(n) {
    st.noHitT = 0;
    st.shake = 1;
    if (st.shield > 0) {
      const abs = Math.min(st.shield, n);
      st.shield -= abs; n -= abs;
      if (st.shield <= 0) api.audio.sfx('boom');
      else api.audio.sfx('hit');
    }
    if (n > 0) { st.hull -= n; api.audio.sfx('boom'); burst(st.pos, [1, 0.4, 0.3], 10, 6); }
  }
});
})();
