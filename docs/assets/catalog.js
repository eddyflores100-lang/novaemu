/* NovaEmu v2.0 — catálogo de sistemas y juegos incluidos (datos compartidos).
 * Clásico (no módulo) para que funcione en index.html, play.html y tests.html sin CORS.
 * ROMs incluidas: SOLO homebrew/freeware con licencia verificada — fuente y licencia en cada entrada. */
(function () {
  "use strict";

  var SYSTEMS = {
    nes:       { label: "NES / Famicom",            exts: ["nes", "fds", "unf", "unif"], core: "nes",       color: "#e11d48", note: "Mandos: cruceta + A/B + Start/Select" },
    snes:      { label: "Super Nintendo",           exts: ["sfc", "smc", "fig"],         core: "snes",      color: "#8b5cf6", note: "A/B/X/Y + L/R" },
    gb:        { label: "Game Boy",                 exts: ["gb"],                        core: "gb",        color: "#84cc16", note: "Compara 2 juegos con mando 2 en opciones" },
    gbc:       { label: "Game Boy Color",           exts: ["gbc"],                       core: "gbc",       color: "#22d3ee", note: "Compatible con ROMs GB también" },
    gba:       { label: "Game Boy Advance",         exts: ["gba"],                       core: "gba",       color: "#f59e0b", note: "L/R hombro incluidos" },
    segaMD:    { label: "Mega Drive / Genesis",     exts: ["md", "gen", "smd", "68k"],   core: "segaMD",    color: "#3b82f6", note: "A/B/C de 6 botones" },
    segaMS:    { label: "Master System",            exts: ["sms"],                       core: "segaMS",    color: "#0ea5e9", note: "Botón 1 y 2 + pausa" },
    segaGG:    { label: "Game Gear",                exts: ["gg"],                        core: "segaGG",    color: "#14b8a6", note: "Pantalla vertical ampliada" },
    n64:       { label: "Nintendo 64",              exts: ["z64", "n64", "v64"],         core: "n64",       color: "#10b981", note: "Requiere PC decente; stick analógico = stick izquierdo del mando" },
    nds:       { label: "Nintendo DS",              exts: ["nds"],                       core: "nds",       color: "#a3a3a3", note: "Pesado; táctil con el ratón/dedo" },
    psx:       { label: "PlayStation 1",            exts: ["chd", "pbp", "cue", "iso", "img", "ecm"], core: "psx", color: "#64748b", note: "Usa CHD o PBP; cue+bin comprimido en .zip también vale" },
    atari2600: { label: "Atari 2600",               exts: ["a26"],                       core: "atari2600", color: "#f97316", note: "Palanca de 1 botón" },
    pce:       { label: "PC Engine / TurboGrafx-16",exts: ["pce", "sgx"],                core: "pce",       color: "#ef4444", note: "CD-ROM² requiere cue+bin" },
    vb:        { label: "Virtual Boy",              exts: ["vb"],                        core: "vb",        color: "#dc2626", note: "Se muestra en 2D rojo" },
    arcade:    { label: "Arcade (FBNeo)",           exts: ["zip"],                       core: "arcade",    color: "#eab308", note: "ROMs arcade en .zip set FBNeo/mame2003" }
  };

  /* Juegos incluidos — todos libres, con fuente y licencia verificadas el 29-oct-2026. */
  var GAMES = [
    {
      id: "cavestory", title: "Cave Story", system: "segaMD", file: "cavestory.md", bytes: 4194304,
      tag: "Metroidvania completo", desc: "El clásico de Studio Pixel COMPLETO corriendo en Mega Drive: mundo abierto, jefes, armas mejorables y 3 finales. El port homebrew más ambicioso jamás hecho para la consola de SEGA.",
      license: "Port MIT · Cave Story es freeware oficial de Studio Pixel", source: "https://github.com/andwn/cave-story-md",
      controls: "Cruceta mueve · A salta · B dispara · C menú · Start=Start",
      cover: { a: "#0f4c81", b: "#123a5f", glyph: "CADEJO", sub: "Mega Drive · 4,0 MB" }
    },
    {
      id: "celeste-gba", title: "Celeste Classic", system: "gba", file: "gba_celeste-classic.gba", bytes: 5418424,
      tag: "Plataformas de precisión", desc: "El demake GBA de Celeste: 30 niveles de escalada imposible, dash de 8 direcciones, fresas y música con streaming real. Difícil, justo y adictivo.",
      license: "GPL-3.0 (JeffRuLz/Celeste-Classic-GBA)", source: "https://github.com/JeffRuLz/Celeste-Classic-GBA",
      controls: "Cruceta mueve · A salta · B agarre/dash · Start reinicia sala",
      cover: { a: "#7f1d5e", b: "#4a1250", glyph: "CELESTE", sub: "GBA · 5,2 MB" }
    },
    {
      id: "roborun", title: "RoboRun", system: "nes", file: "nes_RoboRun-NES_1.1.nes", bytes: 40976,
      opts: { "fceumm_region": "PAL" },
      tag: "Plataformas arcade", desc: "Plataformas para NES real: corre, salta y esquiva trampas en fases rápidas con pixel-art propio. 40 KB de pura era dorada.",
      license: "GPL-3.0 (heaven-hm/roborun-nes)", source: "https://github.com/heaven-hm/roborun-nes",
      controls: "Cruceta mueve · A salta · Start arranca",
      cover: { a: "#b91c1c", b: "#7f1d1d", glyph: "ROBORUN", sub: "NES · 40 KB" }
    },
    {
      id: "superbossgaiden", title: "Super Boss Gaiden", system: "snes", file: "snes_superbossgaiden-sfc", bytes: 524288,
      tag: "Acción arcade", desc: "Homebrew SNES de culto: acción a resolución baja con estética de arcade japonés de 1991, dificultad de verdad y jefes gigantes.",
      license: "Freeware homebrew (Super Boss Gaiden)", source: "https://github.com/snesdev0815/SNES-SuperBossGaiden",
      controls: "Cruceta mueve · B ataca · A salta · Y especial",
      cover: { a: "#4c1d95", b: "#2e1065", glyph: "BOSS", sub: "SNES · 512 KB" }
    },
    {
      id: "gothicvania", title: "GothicVania", system: "snes", file: "snes_gothicvania.sfc", bytes: 524288,
      tag: "Acción gótica", desc: "Aventura de acción gótica para SNES con estética castlevaniana: latigazos, candelabros y atmosfera de castillo. Homebrew MIT.",
      license: "MIT (donth77/snes-homebrew)", source: "https://github.com/donth77/snes-homebrew",
      controls: "Cruceta mueve · B ataque · A salto",
      cover: { a: "#1e293b", b: "#0f172a", glyph: "GOTHIC", sub: "SNES · 512 KB" }
    }
  ];

  /* Arcade Nova — 4 juegos CHIP-8/S-CHIP propios del motor certificado (núcleo WASM bit-exacto). */
  var NOVA_GAMES = [
    { id: "nova-pong",   title: "Nova PONG",   desc: "El clásico 1v1 contra la CPU, física afinada.",  keys: "W/S y ↑/↓" },
    { id: "nova-snake",  title: "Nova Snake",  desc: "Serpiente acelerada con paredes en S-CHIP.",      keys: "Flechas o WASD" },
    { id: "nova-catch",  title: "Nova Catch",  desc: "Atrapa lo que cae; la velocidad no perdona.",     keys: "←/→ o A/D" },
    { id: "nova-paddle", title: "Nova Paddle", desc: "Rompe-ladrillos con la paleta a toda pantalla.",  keys: "←/→" }
  ];

  /* ext (sin punto) -> core */
  var EXT2CORE = {};
  Object.keys(SYSTEMS).forEach(function (k) {
    SYSTEMS[k].exts.forEach(function (e) { EXT2CORE[e] = k; });
  });

  window.NOVA_CATALOG = {
    SYSTEMS: SYSTEMS,
    GAMES: GAMES,
    NOVA_GAMES: NOVA_GAMES,
    EXT2CORE: EXT2CORE,
    ROM_DIR: "./assets/roms/",
    FILES: GAMES.map(function (g) { return g.file; }),
    byId: function (id) {
      for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
      return null;
    },
    detectCore: function (filename) {
      var m = /\.([a-z0-9]+)$/i.exec((filename || "").trim());
      if (!m) return null;
      var ext = m[1].toLowerCase();
      var sysKey = EXT2CORE[ext];
      if (!sysKey) return null;
      if (sysKey === "gb" && /\.gbc$/i.test(filename)) sysKey = "gbc";
      return SYSTEMS[sysKey].core;
    },
    gameUrl: function (g) { return this.ROM_DIR + g.file; }
  };
})();
