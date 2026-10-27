# Arquitectura de NovaEmu

## Principio rector

**Nada que no se pueda verificar.** Cada capa tiene tests deterministas y cada
resultado lleva evidencia (hash, JSON, exit code). La arquitectura se eligió
para que la verificación sea trivial: emulación headless sin reloj de pared,
RNG sembrado fijo, y framebuffers hasheables.

```
┌────────────────────────────────────────────────────┐
│ host/main.c — CLI, pacing acumulativo, perfiles    │
├──────────────┬─────────────────────────────────────┤
│ chip8/chip8  │ gb/{gb_cpu,gb_bus,gb_ppu}           │
│ quirks: VIP/ │ SM83 intérprete · mapa de memoria   │
│ SCHIP moderno│ · timer flanco-2020 · PPU scanline  │
├──────────────┴─────────────────────────────────────┤
│ common/nova — fb_t 0..3 shades · fnv1a64 · perfiles│
└────────────────────────────────────────────────────┘
```

## Decisiones de diseño (y su origen)

### 1. Perfiles de quirks (CHIP-8)
La misma ROM se comporta distinto según la máquina original (VIP vs
S-CHIP-moderno). En vez de hardcodear un comportamiento, `c8_quirks`
(7 flags: vf_reset_alu, shift_vx, loadstore_incr, clip_sprites,
i_overflow_vf, jump_bxnn, dxy1_schip) se carga por preset o por perfil
`key=value` — el mismo patrón **per-game config** de RPCS3
(`Emu/system_utils.cpp:585-598` + `System.cpp:1815-1845`: config global
anulada por config por juego) y de Xenia (`src/xenia/config.cc:49-54`,
`<título>.config.toml`). En NovaEmu: `c8_quirks_vip()` / `c8_quirks_schip_modern()`
/ `c8_quirks_from_profile()`.

### 2. Intérprete SM83 con despacho por byte-de-opcode
El switch principal despacha por `x` (el byte alto = opcode real) y extrae los
índices de registro **del byte de opcode, nunca del op de 16 bits** — error que
el test real de Blargg cazó en desarrollo (ver INFORME_FINAL, lección L3).
La lección estructural de RPCS3 se aplicó: decodificador separado del executor
(`PPUInterpreter.h` usa tabla generada; aquí switch directo + helpers
`rd_r8/wr_r8` indexados — suficiente a esta escala y 100% trazable).

### 3. DAA transcrito de SameBoy
El DAA de SM83 tiene tres trampas documentadas solo en implementaciones
verificadas contra hardware: umbral `> 0x9F` (no `> 0x99`), el `-0x60` del
modo resta **sin máscara** (el bit 8 del int16 detecta el subflujo), y C que
solo se activa por desbordamiento. Transcripción literal de
`SameBoy/Core/sm83_cpu.c::daa()` (línea 705) — pasó el test DAA exhaustivo de
Blargg (256 valores de A × flags) al primer intento tras la transcripción.

### 4. Timer por flanco de caída (post-2020)
`gb_timer_tick` implementa el detector de flanco sobre el contador interno de
16 bits con los bits {9,3,5,7} según TAC — el modelo correcto documentado en
Pan Docs, no el "incremento por división" de las guías antiguas.

### 5. PPU: render en transición a modo 3
`gb_ppu_tick` mantiene la máquina de modos (2→3→0, 456 dots/línea) y renderiza
la línea al entrar en modo 3: fondo con scroll + ventana con contador interno
de líneas (`win_line`) + sprites con prioridad por OAM y flag bg-over-sprite.
Es el patrón de los emuladores de referencia (renderizar tarde, no por frame).

### 6. Frame pacing acumulativo (RPCS3 RSXThread)
El host calcula `deadline += frame_us` (acumulativo, nunca desde "ahora") y
duerme con `clock_nanosleep` absoluto — copia del patrón
`rpcs3/Emu/RSX/RSXThread.cpp:3649-3690` que evita la deriva de los pacers
naive. En headless (`target_fps=0`) no duerme: fps puro para benchmarks.

### 7. Determinismo total
- RNG de CHIP-8: xorshift32 con semilla fija `0x1EE7BEEF`.
- Sin hilos, sin reloj de pared en el bucle, sin memoria sin inicializar.
- `fb_hash` (FNV-1a 64) sobre el framebuffer → golden hashes → evals
  NE-E003/004/005. Inspirado en los golden tests de GPU de shadPS4
  (`tests/gcn/` ejecutan shader traducido y comparan salidas).

### 8. Cero dependencias
Solo libc. El frontend es terminal ASCII + PPM (formato de imagen sin
librerías). Es la razón del binario de 38 KB y de que compile en cualquier
cosa con un C99 — la respuesta de NovaEmu a "PC viejas".

## Mapa de ficheros

| Fichero | Contenido | Líneas ~ |
|---|---|---|
| src/common/nova.{h,c} | fb, hash, perfiles, tiempo monótono | 200 |
| src/chip8/chip8.{h,c} | CHIP-8 + S-CHIP completo | 380 |
| src/gb/gb.h | tipos GB, macros de pares | 90 |
| src/gb/gb_bus.c | mapa de memoria, MBC1, timer, serial, DMA | 230 |
| src/gb/gb_ppu.c | máquina de modos + render scanline | 130 |
| src/gb/gb_cpu.c | SM83: 256 opcodes + CB + interrupciones | 440 |
| src/host/main.c | CLI, pacing, perfiles, bench JSON | 220 |
| src/tests/*.c | 117 checks + runner JSON | 560 |
| tools/genrom.c | ROMs demo sintetizadas | 120 |
| tests/run_evals.sh | suite NE-E001..E012 | 130 |
