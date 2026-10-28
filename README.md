# NovaEmu v1.0

**Emulador unificado CHIP-8 / S-CHIP / Game Boy para hardware humilde.**
C99 puro, cero dependencias, headless-determinista, con suite de evaluación
integrada y CPU Game Boy **certificada 11/11 contra la suite completa de Blargg**.

▶ **Pruébalo sin instalar nada: [demo en GitHub Pages](docs/index.html)** —
el navegador ejecuta el mismo motor compilado a WASM (24,7 KB, bit-exacto con el nativo:
goldens `28c31cf8df2ec325` / `96b4fc937dc825b9` reproducidos). Con banco de pruebas
que corre la suite Blargg completa en tu máquina.

```
make            # compila (solo hace falta un compilador C99)
make demos      # genera ROMs demo jugables
./build/novaemu chip8 tests/roms/gen/chip8_bounce.ch8 --tty=10
make test       # ejecuta la suite completa NE-E001..E012
```

## Estructura del repo

| Ruta | Qué es |
|---|---|
| `src/` | Núcleos C99 (chip8, gb, common) + CLI + tests + shim WASM |
| `docs/` | **Raíz de GitHub Pages**: demo en vivo, banco de pruebas en el navegador, documentación |
| `docs/wasm/novaemu.wasm` | Módulo WASM precompilado (24,7 KB) que usa la web |
| `tests/` | Suite de evaluación NE-E001..E012 + ROMs de test con SHA256SUMS |
| `profiles/` | Perfiles por hardware (default/demo/weak/ancient/pi4) |
| `.github/workflows/ci.yml` | CI que compila y ejecuta los 12 evals en ubuntu-latest |

## Cómo se regenera el WASM de la web

El módulo de `docs/wasm/` se reconstruye con [zig](https://ziglang.org) (no hace falta
para compilar el emulador nativo):

```
zig cc -target wasm32-wasi -mexec-model=reactor -Os \
  src/wasm/wasm_api.c src/wasm/mem_ops.c src/chip8/chip8.c \
  src/gb/gb_bus.c src/gb/gb_ppu.c src/gb/gb_cpu.c \
  -I src/wasm/include -o docs/wasm/novaemu.wasm

Desde v1.1 el shim exporta además c8w_st/c8w_dt (buzzer WebAudio) y
c8w_snap/c8w_snap_size/c8w_restore (save states NCS1). Verificación:
`node scripts/verify_wasm.mjs` (goldens bit-exacto + roundtrip).
```

Equivalencia verificada con `scripts/test_wasm.mjs` y la suite Blargg en Bun
(12/12 "Passed"); el propio navegador puede recertificarlo en docs/tests.html.

## Por qué existe

Los grandes emuladores (RPCS3, shadPS4, Xenia, xemu) son obras maestras de
ingeniería, pero necesitan PCs modernas: Qt, Vulkan, LLVM, gigas de RAM.
NovaEmu pregunta lo contrario: **¿cuál es el emulador más pequeño, más
determinista y más verificable que se puede escribir hoy, que corra en
cualquier PC de los últimos 20 años?**

| Métrica (medida, no prometida) | Valor |
|---|---|
| Binario compilado (-O2, sin dependencias) | **38 KB** |
| Núcleo CHIP-8 | 2.970.000 fps headless (33M ops/s) |
| Núcleo Game Boy | 3.623 fps (250M ciclos/s) |
| Determinismo | 2 ejecuciones → SHA-256 idéntico del framebuffer |
| CPU SM83 | **11/11 ROMs de Blargg "Passed"** |
| Tests unitarios | 117 checks automáticos |
| Suite de evaluación | NE-E001..E012, ALL_PASS con evidencia hasheada |

## Sistemas soportados

| Sistema | Estado | Verificación |
|---|---|---|
| CHIP-8 (COSMAC VIP quirks) | Completo | 47 unitarios + demos |
| S-CHIP (Super-Chip 1.1) | Completo (128x64, scroll, RPL) | Unitarios + demo |
| Game Boy DMG (CPU/PPU/timer/MBC1/serial) | CPU certificada Blargg 11/11; PPU scanline con fondo/ventana/sprites | 70 unitarios + ROMs |
| Game Boy audio (APU) | **No implementado** (roadmap) | — |

## Uso

```
novaemu <chip8|schip|gb> <rom> [opciones]
  --frames N        fotogramas a ejecutar (def: 60)
  --tty[=N]         dibujar en terminal cada N frames (modo visual)
  --ppm F           volcar el último frame como imagen PPM
  --hash            hash FNV-1a del frame (verificación determinista)
  --bench           medir fps y emitir JSON
  --profile F       perfil low-end (profiles/weak.conf, ancient.conf, pi4.conf)
  --serial          imprimir el serial capturado (gb; así validan las ROMs Blargg)
  --detect-serial   parar al ver Passed/Failed (gb)
```

Ejemplo Game Boy con una ROM de test (usa las tuyas — las de test van incluidas):

```
./build/novaemu gb "tests/roms/gb/06-ld r,r.gb" --detect-serial --serial
# → 06-ld r,r   Passed
```

## Mapa de `src/`

```
src/common/   framebuffer, hashing FNV-1a, perfiles key=value
src/chip8/    núcleo CHIP-8/S-CHIP con perfiles de quirks (VIP/moderno)
src/gb/       SM83 + bus + timer + PPU + MBC1 + serial capturado
src/host/     CLI headless (tty/PPM/bench/perfiles)
src/wasm/     shim de exports c8w_*/gbw_* + allocator nova_alloc
src/tests/    117 checks unitarios + runner JSON
tools/        generador de ROMs demo deterministas
profiles/     default / demo / weak / ancient / pi4
```

## Disciplina anti-hallucinación

Cada afirmación de este proyecto lleva su evidencia: los hashes de las ROMs
(`sha256sum -c tests/roms/SHA256SUMS`), los golden hashes de los demos, los
resultados de Blargg reproducibles con `--serial`, y los benchmarks en JSON.
La documentación cita rutas de código real de RPCS3/shadPS4/xemu/Xenia que
existen en disco (eval NE-E012). Nada de "debería funcionar": o pasa el test
o dice FAIL.

## Qué NO es este proyecto

No es un emulador de PS5, PS4, Xbox One ni Series X|S. No existe ninguno con
ese alcance completo (ver docs/RESEARCH_PS5_XBOX.md, con fuentes). NovaEmu
toma las técnicas de ingeniería de los grandes emuladores y las aplica a una
escala donde sí pueden certificarse al 100%. El camino hacia consolas modernas
está trazado con honestidad en docs/ROADMAP.md.

## Licencia

MIT (ver LICENSE). Las ROMs de test incluidas son de distribución libre y van
atribuidas en tests/roms/SOURCES.md. **No incluye ni acepta ROMs comerciales.**
