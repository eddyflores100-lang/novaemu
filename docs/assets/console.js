/* ============================================================
 * NovaConsole v3.0 — Interfaz estilo PS5 de NovaEmu PS5 Edition
 * Boot → Home (tiles con portadas generadas) → Juego → Pausa.
 * Bucle RAF único: input.update() SIEMPRE primero (baja latencia).
 * Rewind (buffer circular), save states, fullscreen, ajustes,
 * test de mando, insertar disco .pkg, robustez con try/catch.
 * ============================================================ */
'use strict';

(() => {
  const $ = id => document.getElementById(id);

  /* ---------- portadas generadas en 2D canvas ---------- */
  function drawCover(cv, g) {
    const ctx = cv.getContext('2d');
    const W = cv.width = 340, H = cv.height = 440;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, g.gradient[0]); grd.addColorStop(0.55, g.gradient[1]); grd.addColorStop(1, g.gradient[2]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    if (g.cover === 'racer') {
      // sol
      ctx.fillStyle = 'rgba(255,190,110,0.9)';
      ctx.beginPath(); ctx.arc(W / 2, H * 0.38, 46, 0, 7); ctx.fill();
      // carretera en perspectiva
      ctx.fillStyle = 'rgba(10,14,26,0.9)';
      ctx.beginPath(); ctx.moveTo(W * 0.42, H * 0.45); ctx.lineTo(W * 0.58, H * 0.45);
      ctx.lineTo(W * 0.95, H); ctx.lineTo(W * 0.05, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(80,220,255,0.9)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.48); ctx.lineTo(W * 0.5, H); ctx.stroke();
      // líneas de carril
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 5; i++) { const y = H * (0.55 + i * 0.1); ctx.fillRect(W / 2 - 3, y, 6, 14 + i * 8); }
      // coche silueta
      ctx.fillStyle = '#e83040';
      ctx.fillRect(W / 2 - 52, H * 0.78, 104, 26);
      ctx.fillRect(W / 2 - 34, H * 0.78 - 18, 68, 20);
    } else if (g.cover === 'runner') {
      // montañas
      ctx.fillStyle = 'rgba(20,10,50,0.85)';
      ctx.beginPath(); ctx.moveTo(0, H * 0.62); ctx.lineTo(W * 0.3, H * 0.3); ctx.lineTo(W * 0.55, H * 0.66); ctx.lineTo(W * 0.8, H * 0.38); ctx.lineTo(W, H * 0.6); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      // orbes
      for (const [x, y, r] of [[70, 120, 10], [250, 90, 12], [180, 160, 8]]) {
        ctx.fillStyle = 'rgba(255,210,80,0.95)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,210,80,0.25)';
        ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
      }
      // robot
      ctx.fillStyle = '#eef1f8';
      ctx.fillRect(W / 2 - 26, H * 0.58, 52, 60);
      ctx.fillRect(W / 2 - 16, H * 0.58 - 26, 32, 26);
      ctx.fillStyle = '#40c8ff';
      ctx.fillRect(W / 2 - 11, H * 0.58 - 20, 22, 8);
      ctx.fillStyle = '#2a6cf0';
      ctx.fillRect(W / 2 - 18, H * 0.58 + 60, 14, 34);
      ctx.fillRect(W / 2 + 4, H * 0.58 + 60, 14, 34);
    } else {
      // nebulosa
      for (const [x, y, r, c] of [[90, 130, 90, 'rgba(140,60,220,0.35)'], [240, 200, 110, 'rgba(60,110,230,0.3)'], [170, 90, 70, 'rgba(230,70,160,0.3)']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      // estrellas
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      // nave
      ctx.fillStyle = '#dfe6f2';
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.62); ctx.lineTo(W / 2 - 40, H * 0.72); ctx.lineTo(W / 2 + 40, H * 0.72); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#50e0ff';
      ctx.fillRect(W / 2 - 30, H * 0.72, 12, 5); ctx.fillRect(W / 2 + 18, H * 0.72, 12, 5);
    }
    // título
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, H - 86, W, 86);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(g.title, W / 2, H - 46);
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(g.sub + ' · ' + g.year, W / 2, H - 22);
    return cv;
  }

  /* ---------- estado global ---------- */
  const S = {
    mode: 'boot',            // boot | home | game | pause
    games: [],
    focus: 0, row: 1,        // row 0 = funciones, 1 = juegos
    funcFocus: 0,
    game: null,              // instancia activa
    gameDef: null,
    rewindBuf: [],
    rewindT: 0,
    rewinding: false,
    fpsShow: false,
    discs: [],               // pkg insertados
    settings: JSON.parse(localStorage.getItem('nv_settings') || 'null') || {
      volume: 0.7, shadows: 'high', bloom: true, resScale: 'auto', fps: false
    }
  };

  let renderer, texFactory, geoFactory, input, audio, hudEl, canvas;
  let lastTs = 0, rafId = 0, bootT = 0, toastT = 0;

  const shadowSizes = { off: 0, med: 1024, high: 2048 };

  /* ---------- arranque ---------- */
  function init() {
    canvas = $('nv-canvas');
    hudEl = $('nv-hud');
    audio = new NovaAudio();
    input = new NovaInput(canvas);
    try {
      renderer = new NovaCore.NovaRenderer(canvas, {
        bloom: S.settings.bloom,
        shadowSize: shadowSizes[S.settings.shadows] || 2048,
        autoRes: true
      });
    } catch (e) {
      fatal(e.code === 'WEBGL2_UNAVAILABLE'
        ? 'Tu navegador no soporta WebGL2. Usa Chrome, Edge o Firefox actualizados.'
        : 'Error al iniciar el motor: ' + e.message);
      return;
    }
    texFactory = new NovaTex.TexFactory(renderer);
    geoFactory = new NovaTex.GeoFactory(renderer);

    // registro de juegos nativos
    S.games = [window.NovaGames.racer, window.NovaGames.runner, window.NovaGames.space];
    buildTiles();
    buildBackdrop();
    bindUI();
    applySettings();
    S.mode = 'boot';
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function fatal(msg) {
    document.body.insertAdjacentHTML('beforeend',
      `<div class="nv-fatal"><div class="nv-fatal-box"><h2>NOVAEMU NO PUEDE INICIAR</h2><p>${msg}</p></div></div>`);
  }

  /* ---------- tiles + fondo ---------- */
  function buildTiles() {
    const row = $('nv-row');
    row.innerHTML = '';
    const all = [...S.games, ...S.discs];
    all.forEach((g, i) => {
      const tile = document.createElement('div');
      tile.className = 'nv-tile';
      tile.dataset.i = i;
      const cv = document.createElement('canvas');
      drawCover(cv, g);
      tile.appendChild(cv);
      tile.addEventListener('click', () => { if (S.mode === 'home') { focusTile(i); launch(g); } });
      row.appendChild(tile);
    });
    focusTile(0, true);
  }

  function buildBackdrop() {
    const bg = $('nv-bg');
    const ctx = bg.getContext('2d');
    const orbs = Array.from({ length: 7 }, (_, i) => ({
      x: Math.random(), y: Math.random(), r: 120 + Math.random() * 260,
      hue: [215, 260, 190, 285, 205, 235, 300][i], sp: 0.02 + Math.random() * 0.05, ph: Math.random() * 7
    }));
    (function drawBG(t) {
      if (S.mode !== 'home' && S.mode !== 'boot') { requestAnimationFrame(drawBG); return; }
      bg.width = innerWidth; bg.height = innerHeight;
      const g = ctx.createLinearGradient(0, 0, 0, bg.height);
      g.addColorStop(0, '#0b0d1c'); g.addColorStop(1, '#141a33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, bg.width, bg.height);
      for (const o of orbs) {
        const x = (o.x + Math.sin(t * 0.0001 * o.sp * 60 + o.ph) * 0.12) * bg.width;
        const y = (o.y + Math.cos(t * 0.00013 * o.sp * 60 + o.ph) * 0.1) * bg.height;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, o.r);
        rg.addColorStop(0, `hsla(${o.hue},80%,60%,0.14)`);
        rg.addColorStop(1, 'transparent');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(x, y, o.r, 0, 7); ctx.fill();
      }
      requestAnimationFrame(drawBG);
    })(0);
  }

  function focusTile(i, silent) {
    const tiles = document.querySelectorAll('.nv-tile');
    if (!tiles.length) return;
    S.focus = (i + tiles.length) % tiles.length;
    tiles.forEach((t, k) => t.classList.toggle('focus', k === S.focus));
    const g = allGames()[S.focus];
    if (g) {
      $('nv-title').textContent = g.title;
      $('nv-genre').textContent = g.genre;
      $('nv-controls').innerHTML = (g.controls || []).map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
    }
    if (!silent) audio.sfx('ui-move');
  }
  const allGames = () => [...S.games, ...S.discs];

  /* ---------- UI bindings ---------- */
  function bindUI() {
    // primer gesto → audio
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // disco .pkg
    $('nv-disc-btn').addEventListener('click', () => $('nv-disc-input').click());
    $('nv-disc-input').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (f) await insertDisc(f);
      e.target.value = '';
    });
    // drag & drop
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', async e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) await insertDisc(f);
    });

    $('nv-fs-btn').addEventListener('click', toggleFullscreen);
    $('nv-pw-btn').addEventListener('click', () => toast('Para apagar de verdad, cierra la pestaña 😉'));
    $('nv-ctl-btn').addEventListener('click', () => showPanel('ctl'));
    $('nv-set-btn').addEventListener('click', () => showPanel('set'));
    $('nv-pause-set').addEventListener('click', () => showPanel('set'));

    // botones táctiles (móvil)
    if ('ontouchstart' in window) {
      const tb = document.createElement('div');
      tb.className = 'nv-touch';
      tb.innerHTML = `<div class="tpad" id="tpad"></div><button class="tbtn tA" data-b="a">✕</button><button class="tbtn tB" data-b="b">○</button>`;
      document.body.appendChild(tb);
      tb.querySelectorAll('.tbtn').forEach(b => {
        const name = b.dataset.b;
        const on = e => { e.preventDefault(); input.setTouchButton(name, true); b.classList.add('on'); };
        const off = e => { e.preventDefault(); input.setTouchButton(name, false); b.classList.remove('on'); };
        b.addEventListener('touchstart', on, { passive: false });
        b.addEventListener('touchend', off, { passive: false });
        b.addEventListener('touchcancel', off, { passive: false });
      });
    }

    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
    $('nv-pause-resume').addEventListener('click', () => togglePause(false));
    $('nv-pause-restart').addEventListener('click', () => { restartGame(); togglePause(false); });
    $('nv-pause-save').addEventListener('click', saveSlot);
    $('nv-pause-load').addEventListener('click', loadSlot);
    $('nv-pause-quit').addEventListener('click', quitToHome);

    // sliders de ajustes
    $('set-volume').addEventListener('input', e => { S.settings.volume = +e.target.value; applySettings(); });
    $('set-shadows').addEventListener('change', e => { S.settings.shadows = e.target.value; applySettings(); toast('Reinicia el juego para aplicar sombras'); });
    $('set-bloom').addEventListener('change', e => { S.settings.bloom = e.target.checked; applySettings(); });
    $('set-res').addEventListener('change', e => { S.settings.resScale = e.target.value; applySettings(); });
    $('set-fps').addEventListener('change', e => { S.settings.fps = e.target.checked; applySettings(); });
  }

  async function insertDisc(file) {
    try {
      const v = await NovaPKG.fromFile(file);
      const d = v.data;
      const gameKey = (window.NovaGames[d.game]) ? d.game : 'racer';
      const base = window.NovaGames[gameKey];
      const disc = Object.assign({}, base, {
        id: 'disc_' + Date.now(),
        title: d.title || file.name.replace(/\.pkg$/i, ''),
        sub: 'Disco insertado', disc: d
      });
      S.discs.push(disc);
      buildTiles();
      toast(`Disco "${disc.title}" instalado ✓`);
      audio.sfx('ui-select');
    } catch (e) {
      toast('✕ Disco rechazado: ' + e.message, true);
      audio.sfx('ui-back');
    }
  }

  function toast(msg, isErr) {
    const t = $('nv-toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.className = '', 2600);
  }

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' }) || Promise.resolve())
        .then(() => toast('Pantalla completa ✓'))
        .catch(() => toast('El navegador bloqueó pantalla completa', true));
    } else document.exitFullscreen();
  }

  function applySettings() {
    localStorage.setItem('nv_settings', JSON.stringify(S.settings));
    audio.setVolume(S.settings.volume);
    if (renderer) {
      renderer.bloomOn = S.settings.bloom;
      renderer.opts.autoRes = S.settings.resScale === 'auto';
      if (S.settings.resScale !== 'auto') renderer.resScale = +S.settings.resScale;
    }
    $('set-volume').value = S.settings.volume;
    $('set-shadows').value = S.settings.shadows;
    $('set-bloom').checked = S.settings.bloom;
    $('set-res').value = S.settings.resScale;
    $('set-fps').checked = S.settings.fps;
    $('nv-fps').style.display = S.settings.fps ? 'block' : 'none';
  }

  function showPanel(which) {
    closePanels();
    audio.sfx('ui-select');
    if (which === 'ctl') $('panel-ctl').classList.add('open');
    if (which === 'set') $('panel-set').classList.add('open');
    if (which === 'help') $('panel-help').classList.add('open');
  }
  function closePanels() {
    document.querySelectorAll('.nv-panel').forEach(p => p.classList.remove('open'));
  }

  /* ---------- lanzar / pausa / salir ---------- */
  function launch(def) {
    audio.unlock(); audio.sfx('ui-select');
    audio.musicStop();
    $('nv-home').classList.add('hidden');
    $('nv-hud').innerHTML = '';
    $('nv-hud').classList.remove('hidden');
    S.mode = 'game';
    S.gameDef = def;
    try {
      S.game = def.create({
        renderer, tex: texFactory, geo: geoFactory,
        input, audio,
        hud: html => { $('nv-hud').innerHTML = html; }
      });
      audio.musicStart(MUSIC[def.id] || MUSIC.default);
      if (renderer.shadowSize !== shadowSizes[S.settings.shadows]) {
        toast('Nota: el cambio de sombras se aplica al reiniciar el juego');
      }
    } catch (e) {
      console.error('[GAME]', e);
      fatal('El juego falló al iniciar: ' + e.message);
      quitToHome();
    }
  }

  function restartGame() {
    if (!S.gameDef) return;
    if (S.game && S.game.dispose) S.game.dispose();
    S.rewindBuf = [];
    launch(S.gameDef);
  }

  function togglePause(force) {
    if (S.mode === 'game' && (force === undefined || force)) {
      S.mode = 'pause';
      $('nv-pause').classList.remove('hidden');
      audio.sfx('ui-select');
      audio.engineStop && audio.engineStop();
    } else if (S.mode === 'pause' && (!force || force === false)) {
      S.mode = 'game';
      $('nv-pause').classList.add('hidden');
      audio.sfx('ui-back');
      if (S.gameDef && S.gameDef.id === 'apex-velocity') audio.engineStart();
    }
  }

  function quitToHome() {
    if (S.game && S.game.dispose) S.game.dispose();
    audio.stopAll();
    S.game = null; S.rewindBuf = [];
    $('nv-pause').classList.add('hidden');
    $('nv-hud').classList.add('hidden');
    $('nv-hud').innerHTML = '';
    $('nv-home').classList.remove('hidden');
    S.mode = 'home';
    audio.sfx('ui-back');
  }

  /* ---------- save / rewind ---------- */
  function saveSlot() {
    if (!S.game || !S.game.saveState) return toast('Este juego no soporta guardado', true);
    localStorage.setItem('nv_save_' + S.gameDef.id, JSON.stringify(S.game.saveState()));
    toast('Partida guardada ✓'); audio.sfx('ui-select');
  }
  function loadSlot() {
    if (!S.game || !S.game.loadState) return toast('Este juego no soporta guardado', true);
    const raw = localStorage.getItem('nv_save_' + S.gameDef.id);
    if (!raw) return toast('No hay partida guardada', true);
    S.game.loadState(JSON.parse(raw));
    toast('Partida cargada ✓'); audio.sfx('checkpoint');
  }

  function handleRewind(dt) {
    if (!S.game || !S.game.rewindSnapshot) return;
    const want = input.held('back') && input.held('r1');
    if (S.mode === 'game') {
      S.rewindT += dt;
      if (S.rewindT > 0.4) {
        S.rewindT = 0;
        S.rewindBuf.push(S.game.rewindSnapshot());
        if (S.rewindBuf.length > 60) S.rewindBuf.shift();
      }
      if (want && S.rewindBuf.length) {
        S.game.loadState(S.rewindBuf.pop());
        if (!S.rewinding) audio.sfx('rewind');
        S.rewinding = true;
        $('nv-rewind').classList.add('show');
      } else {
        S.rewinding = false;
        $('nv-rewind').classList.remove('show');
      }
    }
  }

  /* ---------- navegación en home con mando/teclado ---------- */
  function homeNav() {
    if (S.mode !== 'home') return;
    const n = allGames().length;
    const left = input.pressed('left'), right = input.pressed('right');
    const confirm = input.pressed('cross');
    if (left) focusTile(S.focus - 1);
    if (right) focusTile(S.focus + 1);
    if (confirm && n) launch(allGames()[S.focus]);
    if (input.pressed('triangle')) showPanel('set');
    if (input.pressed('square')) showPanel('ctl');
  }

  /* ---------- test de mando ---------- */
  function drawControllerTest() {
    const cv = $('ctl-canvas');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    cv.width = 460; cv.height = 300;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const snap = input.snapshot();
    const gp = navigator.getGamepads && [...navigator.getGamepads()].find(p => p && p.connected);
    ctx.fillStyle = '#0d1022';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#8fa3c8';
    ctx.font = '600 15px system-ui';
    if (gp) {
      ctx.fillText('Mando: ' + gp.id.slice(0, 52), 16, 24);
    } else {
      ctx.fillText('Sin mando — conecta un DualSense/Xbox o usa el teclado', 16, 24);
    }
    // stick izquierdo
    const drawStick = (x, y, ax, ay, label) => {
      ctx.strokeStyle = '#2a3358'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 34, 0, 7); ctx.stroke();
      ctx.fillStyle = '#3b4a80';
      ctx.beginPath(); ctx.arc(x + ax * 26, y + ay * 26, 16, 0, 7); ctx.fill();
      ctx.fillStyle = '#8fa3c8'; ctx.fillText(label, x - 22, y + 60);
    };
    const [lax, lay] = [input.state.mx || 0, -(input.state.my || 0)];
    drawStick(90, 150, lax, lay, 'Stick izq (WASD)');
    const gpRX = gp ? gp.axes[2] || 0 : 0, gpRY = gp ? gp.axes[3] || 0 : 0;
    drawStick(200, 150, gpRX, gpRY, 'Stick der');
    // botones
    const btns = [['✕', 'cross', 300, 130], ['○', 'circle', 345, 100], ['□', 'square', 255, 100], ['△', 'triangle', 300, 70], ['L1', 'l1', 60, 60], ['R1', 'r1', 390, 60], ['OPC', 'start', 225, 230]];
    for (const [label, key, x, y] of btns) {
      const on = input.held(key);
      ctx.fillStyle = on ? '#3ec6ff' : '#232c50';
      ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.fill();
      ctx.fillStyle = on ? '#04101c' : '#93a5c9';
      ctx.font = '700 14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 5);
      ctx.textAlign = 'left';
    }
    // teclas
    ctx.fillStyle = '#8fa3c8'; ctx.font = '500 13px system-ui';
    ctx.fillText('Teclas: ' + (snap.keys.slice(0, 8).join(' ') || '(ninguna)'), 16, 280);
  }

  /* ---------- bucle principal (RAF único) ---------- */
  const MUSIC = {
    'apex-velocity': { bpm: 128, root: 55, scale: [0, 3, 5, 7, 10], bass: [0, 0, 7, 5, 0, 0, 10, 7] },
    'astra-fallen': { bpm: 100, root: 49, scale: [0, 4, 7, 11], bass: [0, 0, 4, 0, 5, 0, 7, 4] },
    'void-squadron': { bpm: 140, root: 46, scale: [0, 3, 7, 8, 12], bass: [0, 0, 3, 3, 8, 8, 7, 3] },
    default: { bpm: 110, root: 52, scale: [0, 4, 7, 9], bass: [0, 0, 7, 7] }
  };

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - lastTs) / 1000) || 0.016;
    lastTs = ts;

    try {
      input.update(); // ← SIEMPRE primero: estado del frame (baja latencia)

      if (S.mode === 'boot') {
        bootT += dt;
        $('nv-boot').style.opacity = String(Math.max(0, 1 - bootT * 0.5));
        if (bootT > 2.2) {
          $('nv-boot').classList.add('hidden');
          S.mode = 'home';
          audio.sfx('ui-boot');
        }
        return;
      }

      if (S.mode === 'home') { homeNav(); return; }

      if (S.mode === 'game' || S.mode === 'pause') {
        if (S.mode === 'game' && (input.pressed('start') || input.pressed('circle'))) togglePause(true);
        else if (S.mode === 'pause' && (input.pressed('start') || input.pressed('circle'))) togglePause(false);
        if (S.mode !== 'game') return;
        handleRewind(dt);
        if (S.game && S.game.handleUI) S.game.handleUI(input);
        if (S.game) {
          const nodes = S.game.update(dt);
          renderer.render(nodes, S.game.parts, dt);
          if (S.gameDef && S.gameDef.id === 'apex-velocity') {
            // el motor ya se actualiza dentro del juego
          }
        }
        const fps = renderer.fpsEMA;
        $('nv-fps').textContent = fps.toFixed(0) + ' FPS' + (renderer.resScale < 1 ? ` · ${Math.round(renderer.resScale * 100)}%` : '');
        return;
      }
    } catch (e) {
      console.error('[LOOP]', e);
      rafId && cancelAnimationFrame(rafId);
      fatal('Error en ejecución: ' + e.message + ' — recarga la página (F5) para recuperarla.');
    }
  }

  /* paneles: refresco del test de mando */
  setInterval(() => { if ($('panel-ctl').classList.contains('open')) drawControllerTest(); }, 66);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.NovaConsole = {
    launch, quitToHome, toast, toggleFullscreen,
    get state() { return S.mode; },
    get renderer() { return renderer; },
    get game() { return S.game; },
    get games() { return allGames(); },
    get input() { return input; }
  };
})();
