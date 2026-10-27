# Investigación: PS5 y Xbox Series X|S — cómo funcionan y estado de su emulación (2026)

Fuentes verificadas el 27-oct-2026 por el agente R1 (≥19 consultas, 12+ URLs,
fechas de titulares confirmadas vía RSS). Etiquetas: [V] verificado con fuente,
[D] derivado/inferencia. Este documento alimenta el ROADMAP, no promete nada.

## 1. Ficha técnica PS5 (Oberon)

| Componente | Especificación | |
|---|---|---|
| CPU | AMD Zen 2 custom, 8c/16t, hasta 3,5 GHz variable | [V] Wikipedia |
| GPU | RDNA 2 custom, 36 CU @ 2,23 GHz = 10,28 TFLOPS | [V] |
| RAM | 16 GB GDDR6 unificada, 448 GB/s | [V] |
| SSD | 825 GB NVMe custom, 5,5 GB/s crudo | [V] |
| Kraken | Descompresor hardware zlib+Oodle: 8-9 GB/s típicos, 22 GB/s picos | [V] |
| API | AGC (bajo nivel, sustituye a GNM de PS4) | [V]/[D] |

Qué tendría que implementar un emulador: capa Orbis OS (HLE de librerías
firmadas), traducción AGC→Vulkan con recompilación GCN→SPIR-V (el cuello
central: AnyPS5 con 100% de cobertura shader sigue en 48,58% de librerías
[V]), CPU x86-64 por rehosting (syscalls/TLS/timing) [D], Kraken por software
[D], VSH/red/anti-piratería [V].

## 2. Ficha técnica Xbox Series X|S

| Componente | Series X | Series S | |
|---|---|---|---|
| CPU | Zen 2 3,8 GHz (3,6 SMT) | Zen 2 3,6 GHz | [V] |
| GPU | RDNA2 52 CU = 12,15 TF | RDNA2 20 CU = 4 TF | [V] |
| RAM | 16 GB: 10 GB @ 560 GB/s + 6 GB @ 336 GB/s | 8+2 GB | [V] |
| I/O | 2,4 GB/s → 4,8 GB/s con BCPack (Velocity Arch. + DirectStorage) | mitad | [V] |

Diferencias clave [D a partir de specs]: PS5 gana en ancho de banda unificado
y pico I/O; XSX en TFLOPs y memoria particionada. Los descompresores son
incompatibles entre sí (Kraken/Oodle vs BCPack). Xbox usa API de Windows
(D3D12 Ultimate) → su software "viaja" mejor a PC (Xbox Play Anywhere).

## 3. Matriz de emulación por generación (27-oct-2026)

| Generación | Proyecto | Estado | Evidencia |
|---|---|---|---|
| PS1 | DuckStation | ~99% [D] | builds activos 26-oct-2026 [V] |
| PS2 | PCSX2 | ~97% [D] | v2.9.146, ~3.800 juegos [V] |
| PS3 | RPCS3 | 80% "jugable" | Time Extension 22-oct-2026 [V] |
| PS4 | shadPS4 | ~70-80% [D] | v0.20.0 (14-oct-2026), 33.934★, Bloodborne 104 fps con RTX 5070 [V-titular] |
| **PS5** | KytyPS5 (traducción), SharpEmu, RPCSX | **~5-15% [D]** | GTA V PS5 60 FPS con crashes (Tom's HW 6-sep); ~6 títulos a 60 FPS (27-sep); Demon's Souls 40-50 FPS (28-sep); GT7 sin glitches pero 15 FPS (21-oct); Ghost of Yotei a 1-2 FPS; RPCSX llegó al menú VSH (Kotaku 6-oct) [V-titulares] |
| Xbox | xemu | ~80% | v0.8.139, ~990 juegos jugables [V] |
| Xbox 360 | Xenia Canary | ~60-70% [D] | corre RDR y GTA IV incluso en macOS [V-titular] |
| **Xbox One / Series X\|S** | **NINGUNO** | **0%** | búsquedas RSS+GitHub sin proyectos; lo que corre en una Series X son emuladores de OTRAS consolas en dev-mode [V] |

Scams a evitar (confirmado): PCSX4, PCSX5, PS5Emux y similares no son
emuladores reales. AnyPS5 NO es emulador: es relinker de juegos PS5 a PC.

## 4. Por qué PS5/Series no se emulan (5 razones)

1. **Silicio no replicable**: descompresores dedicados (Kraken/BCPack), DSPs,
   controladores SSD custom — el host no tiene esos bloques [V specs, D impacto].
2. **x86-64→x86-64**: no es traducción de ISA sino rehosting del entorno
   (syscalls privativas, TLS, código auto-modificado). shadPS4 lo resuelve en
   PS4 con carga nativa + parcheo (Zydis/Xbyak) [V]; KytyPS5 eligió ser
   "capa de traducción" por esto [V README].
3. **GPU moderna**: miles de pipelines recompilados por juego con cache —
   escala demostrada por AnyPS5 (100% shaders, 48,58% librerías) [V].
4. **Cifrado/anti-piratería**: firmware firmado; solo dumps propios del
   usuario; los repos prohíben compartir system files [V].
5. **Ancho de banda/latencia**: replicar 448-560 GB/s unificados y 22 GB/s
   de I/O comprimido desde un PC es re-ingeniería de streaming [D].

## 5. Conclusión para NovaEmu

El hueco real de 2026 no es "otro emulador de PS5" (los 3 proyectos activos
llevan años y llegan a 6 títulos), sino **rigor a escala alcanzable**: la
cadena completa intérprete→verificación→evals→documentación, que es lo que
estos proyectos no pueden enseñar en un repositorio de 500k líneas. NovaEmu
v1.0 ejecuta esa cadena al 100% y deja el ROADMAP trazado con las técnicas
exactas que necesitaría cada escalón (ver ROADMAP.md).

## Fuentes principales

1. Wikipedia — PlayStation 5 / Xbox Series X and Series S (consultado 27-oct-2026)
2. GitHub: KytyPS5/KytyPS5 · RPCSX/rpcsx · sharpemu/sharpemu · InoriRus/Kyty (dormido desde 2022)
3. Tom's Hardware: GTA V PS5 60 FPS (6-sep-2026), 6 títulos jugables (27-sep), Demon's Souls (28-sep), AnyPS5 shader milestone (10-oct)
4. Wccftech: KytyPS5 GT7 (21-oct), SharpEmu Demon's Souls Remake (13-jul)
5. Kotaku: "PS5's OS emulated to VSH" (6-oct-2026) · Time Extension: "80% PS3 playable" (22-oct)
6. GameGPU: AnyPS5 48,58% librerías (24-oct) · TechPowerUp/TweakTown: Ghost of Yotei 1-2 FPS (11-12 oct)
7. Releases GitHub: shadPS4 v0.20.0 · xemu v0.8.139 · PCSX2 v2.9.146 · DuckStation v0.1-12083
8. Wccftech/Polygon/XDA: emulador 360 "XeO3" oculto en retrocompat PC (24-jul-2026)
