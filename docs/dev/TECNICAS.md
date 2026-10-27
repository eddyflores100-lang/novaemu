# Técnicas extraídas de los grandes emuladores

Metodología: análisis de código de los repos shallow-clonados el 27-oct-2026
en `research/repos/` por agentes paralelos (ver worklog, Tasks A1-A4).
**Cada ruta citada existe en disco y la verifica la eval NE-E012.**
DuckStation quedó EXCLUIDO por decisión del propietario (ver nota final).

## De RPCS3 (PS3) — 8 técnicas

1. **Config por juego como capa override** — `rpcs3/Emu/system_utils.cpp:585-598`
   (`custom_configs/config_<serial>.yml`) + `System.cpp:1815-1845`.
   → NovaEmu: `profiles/*.conf` + `c8_quirks_from_profile()`; el perfil anula
   presets sin tocar código.
2. **Frame pacing acumulativo con sleep absoluto** — `Emu/RSX/RSXThread.cpp:3649-3690`
   (`needed_us = 1e6/limit; target += needed_us`). → `host/main.c::pacing()`.
3. **Decodificador tabulado separado del executor** — `Emu/Cell/PPUInterpreter.h`
   (tabla de handlers) + `PPUThread.cpp:495`. → switch principal + helpers
   indexados en `gb_cpu.c`.
4. **Doble intérprete fast/preciso seleccionable en runtime** —
   `PPUInterpreter.h:22-58` (`ppu_interpreter_rt`). → semilla del sistema de
   perfiles: los quirks son exactamente eso, swap de semántica sin recompilar.
5. **Caché de traducciones con invalidación por hash** —
   `PPUThread.cpp:5607-5641` (objeto `v9-kusa-...` con hash de settings+CPU).
   → ROADMAP: caché de bloques con nombre `sha256(rom+versión_quirks)`.
6. **Análisis por bloque antes de traducir** — `SPURecompiler.h:720-810`
   (constantes de registros, sucesores). → ROADMAP: pase `analyse_block()`
   para plegado de constantes incluso en intérprete.
7. **Caché de programas GPU en disco con cola de precarga** —
   `Emu/RSX/rsx_cache.h:23-220` (`lf_fifo`). → ROADMAP (cuando haya GPU).
8. **Tests unitarios en CI por PR** — `rpcs3/tests/` (Google Test, 22 ficheros)
   + job "RPCS3 Windows Unit Test". → `tests/run_evals.sh` + NE-E001..E012.

## De shadPS4 (PS4) — 6 técnicas

1. **Ejecución nativa + parcheo quirúrgico por instrucción** —
   `src/core/cpu_patches.cpp` (Zydis + Xbyak, TLS/RCPPS/EXTRQ) con trampolines
   (`module.cpp:131-140`). Lección: si guest==host, no hay que traducir nada —
   parchea solo los casos problemáticos.
2. **Registro declarativo HLE por NID** — `src/core/libraries/` (5.498
   funciones `LIB_FUNCTION`), resolución `symbols_resolver`. → patrón para la
   futura capa de syscalls de NovaEmu: tabla `{id, nombre, fn}` + stub con log.
3. **Pipeline de shaders de 3 fases (decode → IR → backend)** —
   `src/shader_recompiler/`. → el IR intermedio como frontera de backends es
   portable a cualquier recompilación futura.
4. **Caché de pipeline serializada a disco** —
   `renderer_vulkan/vk_pipeline_serialization.cpp`. → misma idea que RPCS3 #5.
5. **Memoria guest 1:1 con dirty-tracking por page fault** —
   `src/core/memory.cpp` + `buffer_cache/memory_tracker.h`. → para el
   ROADMAP de caché de bloques auto-modificables.
6. **Disciplina de golden tests sobre hardware real** — `tests/gcn/`
   (ejecutan shaders traducidos y comparan salidas). → `fb_hash` + golden
   hashes de NovaEmu (NE-E003/004/005).

## De xemu (Xbox clásico) — 5 técnicas

1. **Tabla MMIO declarativa tipo MemoryRegion** — `hw/xbox/nv2a/nv2a.c:358`
   (dispatch O(1) por rango). → `gb_bus.c` organiza lecturas/escrituras por
   rangos con handlers explícitos.
2. **Vblank con deadline absoluto y anti-catch-up** — `ui/xemu.c:768`
   (`vblank_timer_thread`). → refuerza el pacing acumulativo del host.
3. **Mirrors de ROM por alias de páginas** — `hw/xbox/xbox.c:104`. → el echo
   RAM de GB se mapea con máscara `& 0x1FFF` (misma idea, 1 línea).
4. **Un solo lock global UI/emulación** — `ui/xemu.c:134`. → NovaEmu es
   single-thread por diseño: la lección es no introducir hilos sin necesidad.
5. **JIT también para coprocesadores, con intérprete de referencia al lado** —
   `hw/xbox/mcpx/apu/dsp/dsp_jit.c` junto a `dsp_c.c`. → patrón para el
   ROADMAP: nunca añadir un JIT sin mantener el intérprete como oráculo.

## De Xenia (Xbox 360) — 5 técnicas

1. **Pipeline frontend → IR → pases → emisor** — `src/xenia/cpu/ppc/` +
   `docs/cpu.md` (HIR de ~40 ops). → el IR como inversión de dependencias
   entre ISA guest y backends host.
2. **Tests diferenciales por instrucción contra ejecución nativa** —
   `cpu/ppc/testing/instr_*.s` (~170 ficheros). → espíritu idéntico a Blargg:
   NovaEmu adopta la SUITE (no reinventa una).
3. **Config TOML por juego como override** — `src/xenia/config.cc:49-54`.
   → refuerza RPCS3 #1.
4. **Un IR de shaders → N backends (DXBC/SPIR-V)** — `gpu/d3d12/` y
   `gpu/vulkan/`. → prepara el terreno multi-backend.
5. **Code cache W^X por plataforma** — `cpu/backend/x64/x64_code_cache_{posix,win}.cc`.
   → ROADMAP para la fase de recompilación.

## La escala correcta (por qué no compiten aquí)

| Emulador | Líneas de código | Dependencias |
|---|---|---|
| RPCS3 (Emu/) | ~502.000 | LLVM, Qt6, Vulkan, SDL3… |
| shadPS4 (src/) | ~290.000 | Vulkan, Zydis, Xbyak… |
| xemu | ~961.000 (QEMU) | 15 submódulos, ~36 wraps |
| Xenia | ~546.000 | D3D12/Vulkan |
| **NovaEmu** | **~2.500** | **libc** |

La contribución de NovaEmu no es "mejor que RPCS3" (falso en su dominio), sino
**el mismo oficio a escala certificable**: cada línea revisada por tests,
cada afirmación con evidencia, cada técnica de los grandes citada con su ruta.

## Nota: exclusión de DuckStation

El agente de análisis detuvo su trabajo al encontrar `CLAUDE.md` en la raíz
del repo: "STOP — DO NOT OPERATE ON THIS REPOSITORY" (licencia CC BY-NC-ND
4.0, verificación upstream byte-idéntica). Se respetó el gate: 0 ficheros
leídos. Alternativas legítimas documentadas para el dueño: lectura humana,
permiso del autor, o análisis de emuladores PS1 permisivos
(Mednafen/Beetle PSX GPLv2, Avocado, Play!). Regla aplicada: *"un NO del
propietario de un artefacto de terceros es un gate, no un obstáculo"*.
