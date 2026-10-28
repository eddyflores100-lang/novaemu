/* NovaEmu v3.0 — catálogo MODERN: sistemas modernos primero + escena oct-2026 + ruta nativa.
 * Clásico (no módulo) para funcionar en index.html, play.html y tests.html sin CORS.
 * ROMs incluidas: SOLO homebrew/freeware con licencia verificada. Los juegos modernos
 * (PSP/PSX/N64/DS/Saturn) NUNCA se distribuyen: el usuario carga SU ROM desde su dispositivo. */
(function () {
  "use strict";

  /* ── SISTEMAS — orden: modernos primero ─────────────────────────────
   * threads: requiere SharedArrayBuffer (coi-serviceworker) — PSP y DOS
   * bios:    { key: clave IndexedDB, files: nombres estándar, opcional: bool }
   * games:   guía de títulos icónicos REALES que el usuario puede cargar (no se distribuyen) */
  var SYSTEMS = {
    psp: {
      label: "PlayStation Portable", short: "PSP", era: "2004–2014", gen: "Portátil HD",
      exts: ["iso", "cso", "pbp", "elf"], core: "psp", color: "#22d3ee", beta: true, threads: true,
      note: "Núcleo ppsspp (beta oficial EmulatorJS). Requiere modo aislado (se activa solo al entrar al player). Juegos 3D: rendimiento según PC.",
      bios: null,
      games: [
        { t: "God of War: Ghost of Sparta", y: 2010, g: "acción" },
        { t: "God of War: Chains of Olympus", y: 2008, g: "acción" },
        { t: "GTA: Vice City Stories", y: 2006, g: "mundo abierto" },
        { t: "GTA: Liberty City Stories", y: 2005, g: "mundo abierto" },
        { t: "Monster Hunter Freedom Unite", y: 2008, g: "caza cooperativo" },
        { t: "Metal Gear Solid: Peace Walker", y: 2010, g: "sigilo" },
        { t: "Crisis Core: Final Fantasy VII", y: 2007, g: "RPG de acción" },
        { t: "Tekken 6", y: 2009, g: "lucha" },
        { t: "Midnight Club 3: DUB Edition", y: 2005, g: "carreras" },
        { t: "Daxter", y: 2006, g: "plataformas" }
      ]
    },
    psx: {
      label: "PlayStation 1", short: "PSX", era: "1994–2006", gen: "32-bit 3D",
      exts: ["chd", "pbp", "cue", "bin", "iso", "img", "ecm"], core: "psx", color: "#94a3b8",
      note: "Cores pcsx_rearmed / mednafen_psx_hw. Muchos juegos arrancan sin BIOS (HLE); con BIOS scph5501.bin la compatibilidad sube. .bin suelto → cue automática; multi-bin → seleccionalos juntos (se empaquetan en zip).",
      bios: { key: "psx", files: "scph5501.bin (US) · scph5500.bin (JP) · scph5502.bin (EU) · o zip con todos", opcional: true },
      games: [
        { t: "Final Fantasy VII", y: 1997, g: "JRPG" },
        { t: "Metal Gear Solid", y: 1998, g: "sigilo" },
        { t: "Tekken 3", y: 1998, g: "lucha" },
        { t: "Crash Bandicoot 3: Warped", y: 1998, g: "plataformas" },
        { t: "Resident Evil 2", y: 1998, g: "survival horror" },
        { t: "Gran Turismo 2", y: 1999, g: "carreras" },
        { t: "Castlevania: Symphony of the Night", y: 1997, g: "metroidvania" },
        { t: "Silent Hill", y: 1999, g: "horror" },
        { t: "Tony Hawk's Pro Skater 2", y: 2000, g: "deportes" },
        { t: "Spyro: Year of the Dragon", y: 2000, g: "plataformas" }
      ]
    },
    n64: {
      label: "Nintendo 64", short: "N64", era: "1996–2002", gen: "64-bit 3D",
      exts: ["z64", "n64", "v64"], core: "n64", color: "#10b981",
      note: "Cores mupen64plus_next / parallel_n64. Sin BIOS. Stick analógico = stick izquierdo del mando; requiere PC discreto.",
      bios: null,
      games: [
        { t: "Super Mario 64", y: 1996, g: "plataformas 3D" },
        { t: "Zelda: Ocarina of Time", y: 1998, g: "acción-aventura" },
        { t: "Mario Kart 64", y: 1996, g: "carreras" },
        { t: "GoldenEye 007", y: 1997, g: "FPS" },
        { t: "Banjo-Kazooie", y: 1998, g: "plataformas" },
        { t: "Star Fox 64", y: 1997, g: "acción" },
        { t: "Super Smash Bros.", y: 1999, g: "lucha" },
        { t: "Paper Mario", y: 2000, g: "RPG" }
      ]
    },
    nds: {
      label: "Nintendo DS", short: "NDS", era: "2004–2014", gen: "doble pantalla",
      exts: ["nds"], core: "nds", color: "#a3a3a3",
      note: "Cores melonds / desmume. Doble pantalla (intercambiable) y táctil con ratón/dedo. Sin BIOS arranca la mayoría; con bios7/bios9/firmware mejora.",
      bios: { key: "nds", files: "bios7.bin + bios9.bin + firmware.bin · o zip con los tres", opcional: true },
      games: [
        { t: "GTA: Chinatown Wars", y: 2009, g: "mundo abierto" },
        { t: "Mario Kart DS", y: 2005, g: "carreras" },
        { t: "Pokémon HeartGold / SoulSilver", y: 2009, g: "RPG" },
        { t: "New Super Mario Bros.", y: 2006, g: "plataformas" },
        { t: "The World Ends with You", y: 2007, g: "RPG de acción" },
        { t: "Chrono Trigger DS", y: 2008, g: "RPG" },
        { t: "Metroid Prime Hunters", y: 2006, g: "FPS" },
        { t: "Advance Wars: Dual Strike", y: 2005, g: "estrategia" }
      ]
    },
    segaSaturn: {
      label: "Sega Saturn", short: "Saturn", era: "1994–2000", gen: "32-bit",
      exts: ["cue", "bin", "iso", "zip"], core: "segaSaturn", color: "#38bdf8",
      note: "Core yabause. Muy recomendado aportar BIOS (saturn.bin) — sin ella la mayoría no arranca.",
      bios: { key: "saturn", files: "saturn.bin (o zip) — muy recomendado", opcional: false },
      games: [
        { t: "Panzer Dragoon Saga", y: 1998, g: "RPG" },
        { t: "NiGHTS into Dreams", y: 1996, g: "acción" },
        { t: "Sega Rally Championship", y: 1995, g: "carreras" },
        { t: "Virtua Fighter 2", y: 1995, g: "lucha" },
        { t: "Radiant Silvergun", y: 1998, g: "shoot'em up" }
      ]
    },
    segaCD: {
      label: "Sega CD / Mega-CD", short: "Mega-CD", era: "1992–1998", gen: "16-bit CD",
      exts: ["cue", "bin", "iso", "zip"], core: "segaCD", color: "#60a5fa",
      note: "Core genesis_plus_gx. REQUIERE BIOS de la región (us Eu/Jp) — aporta el .bin en la biblioteca.",
      bios: { key: "segacd", files: "bios_CD_E.bin / bios_CD_U.bin / bios_CD_J.bin", opcional: false },
      games: [
        { t: "Sonic CD", y: 1993, g: "plataformas" },
        { t: "Snatcher", y: 1994, g: "aventura" },
        { t: "Lunar: Eternal Blue", y: 1994, g: "RPG" },
        { t: "Night Trap", y: 1992, g: "FMV" }
      ]
    },
    dos: {
      label: "PC / MS-DOS", short: "DOS", era: "1981–2000", gen: "PC retro",
      exts: ["zip"], core: "dos", color: "#fbbf24", threads: true,
      note: "Core dosbox_pure (solo threaded). El .zip debe contener la instalación del juego (exe/com). Los .zip sueltos también valen como arcade si así lo eliges.",
      bios: null,
      games: [
        { t: "DOOM", y: 1993, g: "FPS" },
        { t: "Duke Nukem 3D", y: 1996, g: "FPS" },
        { t: "Theme Hospital", y: 1997, g: "gestión" },
        { t: "Age of Empires", y: 1997, g: "estrategia" },
        { t: "Fallout", y: 1997, g: "RPG" }
      ]
    },
    arcade: {
      label: "Arcade (FBNeo / MAME)", short: "Arcade", era: "1978–2000s", gen: "máquinas recreativas",
      exts: ["zip"], core: "arcade", color: "#eab308",
      note: "Cores fbneo / mame2003(+). El .zip debe ser el set exacto de la máquina (ej. mslug.zip).",
      bios: null,
      games: [
        { t: "The King of Fighters '97", y: 1997, g: "lucha" },
        { t: "Metal Slug 3", y: 2000, g: "run & gun" },
        { t: "Street Fighter Alpha 3", y: 1998, g: "lucha" },
        { t: "Marvel vs. Capcom", y: 1998, g: "lucha" }
      ]
    },
    gba:     { label: "Game Boy Advance", short: "GBA", era: "2001–2008", gen: "portátil 32-bit", exts: ["gba"], core: "gba", color: "#f59e0b", note: "Core mgba. L/R hombro incluidos.",
      games: [{ t: "Pokémon Emerald", y: 2004, g: "RPG" }, { t: "Metroid Fusion", y: 2002, g: "acción" }, { t: "Castlevania: Aria of Sorrow", y: 2003, g: "metroidvania" }, { t: "Golden Sun", y: 2001, g: "RPG" }] },
    snes:    { label: "Super Nintendo", short: "SNES", era: "1990–2003", gen: "16-bit", exts: ["sfc", "smc", "fig"], core: "snes", color: "#8b5cf6", note: "Core snes9x. A/B/X/Y + L/R.",
      games: [{ t: "Chrono Trigger", y: 1995, g: "RPG" }, { t: "Super Mario World", y: 1990, g: "plataformas" }, { t: "Zelda: A Link to the Past", y: 1991, g: "acción-aventura" }, { t: "Donkey Kong Country", y: 1994, g: "plataformas" }] },
    segaMD:  { label: "Mega Drive / Genesis", short: "Mega Drive", era: "1988–1998", gen: "16-bit", exts: ["md", "gen", "smd", "68k"], core: "segaMD", color: "#3b82f6", note: "Core genesis_plus_gx. A/B/C de 6 botones.",
      games: [{ t: "Sonic the Hedgehog 3", y: 1994, g: "plataformas" }, { t: "Streets of Rage 2", y: 1992, g: "beat'em up" }, { t: "Phantasy Star IV", y: 1993, g: "RPG" }] },
    nes:     { label: "NES / Famicom", short: "NES", era: "1983–2003", gen: "8-bit", exts: ["nes", "fds", "unf", "unif"], core: "nes", color: "#e11d48", note: "Core fceumm/nestopia. Cruceta + A/B + Start/Select.",
      games: [{ t: "Super Mario Bros. 3", y: 1988, g: "plataformas" }, { t: "Mega Man 2", y: 1988, g: "acción" }, { t: "Contra", y: 1987, g: "run & gun" }] },
    gb:      { label: "Game Boy", short: "GB", era: "1989–2003", gen: "portátil 8-bit", exts: ["gb"], core: "gb", color: "#84cc16", note: "Core gambatte. Mando 2 disponible para comparar juegos.",
      games: [{ t: "Pokémon Red/Blue", y: 1996, g: "RPG" }, { t: "Tetris", y: 1989, g: "puzzle" }] },
    gbc:     { label: "Game Boy Color", short: "GBC", era: "1998–2003", gen: "portátil 8-bit", exts: ["gbc"], core: "gbc", color: "#22d3ee", note: "Core gambatte. Compatible con ROMs GB.",
      games: [{ t: "Pokémon Crystal", y: 2000, g: "RPG" }, { t: "Wario Land 3", y: 2000, g: "plataformas" }] },
    segaMS:  { label: "Master System", short: "SMS", era: "1985–1996", gen: "8-bit", exts: ["sms"], core: "segaMS", color: "#0ea5e9", note: "Core smsplus/genesis_plus_gx.",
      games: [{ t: "Alex Kidd in Miracle World", y: 1986, g: "plataformas" }, { t: "Phantasy Star", y: 1987, g: "RPG" }] },
    segaGG:  { label: "Game Gear", short: "GG", era: "1990–2001", gen: "portátil 8-bit", exts: ["gg"], core: "segaGG", color: "#14b8a6", note: "Pantalla vertical ampliada.",
      games: [{ t: "Sonic Chaos", y: 1993, g: "plataformas" }] },
    sega32X: { label: "Sega 32X", short: "32X", era: "1994–1996", gen: "16-bit boost", exts: ["32x", "md"], core: "sega32X", color: "#818cf8", note: "Core picodrive.",
      games: [{ t: "Knuckles' Chaotix", y: 1995, g: "plataformas" }, { t: "Virtua Racing Deluxe", y: 1994, g: "carreras" }] },
    pce:     { label: "PC Engine / TurboGrafx-16", short: "PCE", era: "1987–1999", gen: "16-bit", exts: ["pce", "sgx"], core: "pce", color: "#ef4444", note: "Core mednafen_pce. CD-ROM² requiere cue+bin.",
      games: [{ t: "Bonk's Adventure", y: 1989, g: "plataformas" }, { t: "Castlevania: Rondo of Blood", y: 1993, g: "acción (CD)" }] },
    atari2600: { label: "Atari 2600", short: "A2600", era: "1977–1992", gen: "2ª generación", exts: ["a26"], core: "atari2600", color: "#f97316", note: "Core stella2014. Palanca de 1 botón.",
      games: [{ t: "Pitfall!", y: 1982, g: "aventura" }] },
    vb:      { label: "Virtual Boy", short: "VB", era: "1995–1996", gen: "estereoscópico", exts: ["vb"], core: "vb", color: "#dc2626", note: "Core beetle_vb. Se muestra en 2D rojo.",
      games: [{ t: "Wario Land", y: 1995, g: "plataformas" }] }
  };

  /* ── Extensiones ambiguas: el usuario elige sistema ── */
  var AMBIGUOUS = { iso: ["psx", "psp"], bin: ["psx", "segaSaturn"], zip: ["arcade", "dos", "psx", "segaSaturn"] };

  /* ── Juegos incluidos — todos libres, licencia verificada (29-oct-2026) ── */
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

  /* ── Arcade Nova — núcleo propio CHIP-8/S-CHIP certificado ── */
  var NOVA_GAMES = [
    { id: "nova-pong",   title: "Nova PONG",   desc: "El clásico 1v1 contra la CPU, física afinada.",  keys: "W/S y ↑/↓" },
    { id: "nova-snake",  title: "Nova Snake",  desc: "Serpiente acelerada con paredes en S-CHIP.",      keys: "Flechas o WASD" },
    { id: "nova-catch",  title: "Nova Catch",  desc: "Atrapa lo que cae; la velocidad no perdona.",     keys: "←/→ o A/D" },
    { id: "nova-paddle", title: "Nova Paddle", desc: "Rompe-ladrillos con la paleta a toda pantalla.",  keys: "←/→" }
  ];

  /* ── Escena oct-2026 — verificada 27-oct (Task 13: GitHub API + prensa) ──
   * stars27 = cifra al 27-oct-2026; la página intenta refrescarla en vivo. */
  var ESCENA = [
    { name: "AnyPS5", url: "https://github.com/boykopovar/AnyPS5", stars27: 49046,
      desc: "Portado automático de .exe de PS5 a PC: 100% shaders, 48,6% librerías. No es emulador: es porting nativo.", kind: "PS5 · porting" },
    { name: "KytyPS5", url: "https://github.com/KytyPS5/KytyPS5", stars27: 10014,
      desc: "Traducción C++ estilo RPCS3 (GPL-2.0). GTA V a 60 FPS, Demon's Souls 40-50. 134 títulos con render.", kind: "PS5 · emulador" },
    { name: "SharpEmu", url: "https://github.com/sharpemu/sharpemu", stars27: 6476,
      desc: "C#: 6 juegos jugables a 60 fps. Gameplay de Ghost of Yotei publicado el 11-oct.", kind: "PS5 · emulador" },
    { name: "shadPS4", url: "https://github.com/shadPS4/shadPS4", stars27: null,
      desc: "Emulador PS4 en C++ (v0.20, 14-oct): Bloodborne a 104 FPS, inFamous 4K60. El más maduro de la generación.", kind: "PS4" },
    { name: "PS5X360", url: "https://github.com/boykopovar/PS5X360", stars27: 388,
      desc: "Xbox 360 corriendo DENTRO de una PS5 real (base Xenia Canary, DualSense nativo).", kind: "PS5 · jailbreak" },
    { name: "jadyx", url: "https://github.com/jadyx/jadyx", stars27: 68,
      desc: "Switch nativo en Xbox Series X|S: Eden UWP + D3D12, 59 FPS.", kind: "Series X|S" },
    { name: "REA-Prompts", url: "https://github.com/JoasASantos/REA-Prompts", stars27: 3011,
      desc: "Metodología REAP de ingeniería inversa (26 packs) — base del Lab y del testing golden-frame de NovaEmu.", kind: "metodología" }
  ];

  /* ── Noticias datadas (verificadas) ── */
  var NOTICIAS = [
    { d: "27-oct-2026", t: "KytyPS5 empuja actualización: 134 títulos con render; GTA V 60 FPS, Demon's Souls 40-50 FPS, GT7 15 FPS." },
    { d: "22-oct-2026", t: "RPCS3 (PS3) alcanza 80% jugable («Time Extension»); xemu (Xbox OG) publica v0.8.139." },
    { d: "19-oct-2026", t: "PS5X: PS5 corriendo dentro de una Xbox Series X real — primera vez documentada." },
    { d: "14-oct-2026", t: "shadPS4 v0.20: Bloodborne a 104 FPS e inFamous en 4K60. El PS4 más capaz hasta la fecha." },
    { d: "11-oct-2026", t: "SharpEmu publica gameplay de Ghost of Yotei (aún 1-2 FPS: fase temprana)." },
    { d: "09-oct-2026", t: "Linus Tech Tips cubre AnyPS5: portado automático de exes de PS5 a PC." },
    { d: "01-oct-2026", t: "Ars Technica: «ya se puede emular PS5 en PC» — la gen-9 tiene su primer avance real." },
    { d: "jul-2026", t: "XeO3 (emulación Xbox 360 oficial de Microsoft) datamined en PC; Project Helix anunciado en marzo." }
  ];

  /* ── Ruta nativa — la forma REAL de jugar gen moderna hoy (fuera del navegador) ── */
  var NATIVA = [
    { cons: "PS5",     emu: "KytyPS5",      pct: "5-15%",   url: "https://github.com/KytyPS5/KytyPS5",      note: "GTA V 60 FPS en PCs fuertes · también SharpEmu y AnyPS5 (porting)" },
    { cons: "PS4",     emu: "shadPS4",      pct: "70-80%",  url: "https://github.com/shadPS4/shadPS4",      note: "Bloodborne 104 FPS · v0.20 14-oct" },
    { cons: "PS3",     emu: "RPCS3",        pct: "80%",     url: "https://rpcs3.net",                       note: "80% jugable · «Time Extension» 22-oct" },
    { cons: "PS2",     emu: "PCSX2",        pct: "~97%",    url: "https://pcsx2.net",                       note: "v2.9.146 diaria · 97% de la biblioteca" },
    { cons: "PS1",     emu: "DuckStation",  pct: "~99%",    url: "https://www.duckstation.org",             note: "— o NovaEmu mismo, aquí en el navegador" },
    { cons: "Xbox OG", emu: "xemu",         pct: "~80%",    url: "https://xemu.app",                        note: "v0.8.139 · 22-oct" },
    { cons: "Xbox 360",emu: "Xenia Canary", pct: "60-70%",  url: "https://xenia.jp",                        note: "+ XeO3: emulación 360 oficial de Microsoft en PC" },
    { cons: "Series X|S / One", emu: "—",   pct: "0%",      url: null,                                      note: "sin emulador en 2026 (solo puertos: jadyx corre Switch en Series)" },
    { cons: "Switch",  emu: "Ryujinx / Eden", pct: "alta",  url: "https://ryujinx.org",                     note: "nativo PC · Eden UWP también corre en Series X|S (jadyx)" }
  ];

  /* ── índices auxiliares ── */
  var EXT2CORE = {};
  Object.keys(SYSTEMS).forEach(function (k) {
    SYSTEMS[k].exts.forEach(function (e) {
      if (!EXT2CORE[e]) EXT2CORE[e] = k; /* primera definición gana (la ambigua se pregunta en UI) */
    });
  });
  /* defaults explícitos para extensiones ambiguas (el chooser permite lo demás):
   * .iso/.bin → PSX (los más comunes en web) · .zip → arcade (compat v2) */
  EXT2CORE["iso"] = "psx"; EXT2CORE["bin"] = "psx"; EXT2CORE["zip"] = "arcade";
  var CORE2KEY = {};
  Object.keys(SYSTEMS).forEach(function (k) { CORE2KEY[SYSTEMS[k].core] = k; });

  function extOf(filename) {
    var m = /\.([a-z0-9]+)$/i.exec((filename || "").trim());
    return m ? m[1].toLowerCase() : null;
  }

  window.NOVA_CATALOG = {
    SYSTEMS: SYSTEMS,
    GAMES: GAMES,
    NOVA_GAMES: NOVA_GAMES,
    ESCENA: ESCENA,
    NOTICIAS: NOTICIAS,
    NATIVA: NATIVA,
    AMBIGUOUS: AMBIGUOUS,
    EXT2CORE: EXT2CORE,
    ROM_DIR: "./assets/roms/",
    FILES: GAMES.map(function (g) { return g.file; }),
    byId: function (id) {
      for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
      return null;
    },
    /* detectCore: NUNCA lanza; devuelve core string o null (API estable para tests W2).
     * Para extensiones ambiguas devuelve la primera preferente; la UI consulta AMBIGUOUS. */
    detectCore: function (filename) {
      var ext = extOf(filename);
      if (!ext) return null;
      var sysKey = EXT2CORE[ext];
      if (!sysKey) return null;
      if (sysKey === "gb" && /\.gbc$/i.test(filename)) sysKey = "gbc";
      return SYSTEMS[sysKey].core;
    },
    detectSystemKey: function (filename) {
      var ext = extOf(filename);
      if (!ext) return null;
      var sysKey = EXT2CORE[ext];
      if (sysKey === "gb" && /\.gbc$/i.test(filename)) sysKey = "gbc";
      return sysKey || null;
    },
    systemByCore: function (core) { return SYSTEMS[CORE2KEY[core]] || null; },
    gameUrl: function (g) { return this.ROM_DIR + g.file; }
  };
})();
