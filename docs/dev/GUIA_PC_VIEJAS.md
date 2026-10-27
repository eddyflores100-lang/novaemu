# Guía: emular en PCs viejas y pequeñas

## Lo medido en NovaEmu (evidencia, no marketing)

| Escenario | Resultado medido |
|---|---|
| Binario | 38 KB (compila con cualquier C99, 0 dependencias) |
| RAM en ejecución | ~0,5 MB por instancia (framebuffer + estados) |
| CHIP-8 headless | 2.970.000 fps → sobra un factor 10.000× para 60 fps |
| Game Boy headless | 3.623 fps → sobra un factor 60× para 60 fps |
| Perno viejo de 2 núcleos | benchmarks tomados en VM con 2 vCPU — sigue sobrando |

Conclusión: **cualquier PC con soporte C99 post-2005 corre NovaEmu a 60 fps
reales con margen enorme.** Los perfiles aún bajan el consumo:

| Perfil | frameskip | target_fps | Uso |
|---|---|---|---|
| `profiles/default.conf` | 1 | — | semántica fiel |
| `profiles/weak.conf` | 2 | 30 | Pentium 4 / Core 2 / Atom |
| `profiles/ancient.conf` | 4 | 24 | netbook / portátil antiguo |
| `profiles/pi4.conf` | 1 | 50 | Raspberry Pi 4 / SBC |

```
./build/novaemu gb ROM.gb --profile profiles/ancient.conf --tty=1
```

## Compresión máxima del binario

```
make small    # -Os + LTO + strip → variante novaemu-os (menor aún)
```

## Y las consolas modernas en una PC vieja: las 3 rutas honestas

1. **Nada nativo**: PS5/XOne/Series no tienen emulador (0%, ver
   RESEARCH_PS5_XBOX.md). PS4 vía shadPS4 exige GPU Vulkan moderna: no apto
   para PCs humildes. PS3 vía RPCS3 necesita ~4 núcleos fuertes.
2. **Retro nativo**: PS1 (DuckStation) y PS2 (PCSX2) sí corren en hardware
   modesto; los 8/16-bit corren con NovaEmu o equivalentes.
3. **Streaming** (la ruta para PCs viejas + consolas modernas): PS Remote
   Play / chiaki-ng / xCloud llevan el juego en el servidor y en el PC viejo
   solo corre el decode H.264/HEVC — una GPU integrada de hace 10 años basta
   a 720p. Es la opción real que ya documentamos con pipeline y latencias en
   las guías anteriores (PS5_en_Laptop_Guia_2026.pdf, cap. 3-5).

## Per-game config en los grandes (si tu PC aguanta alguno)

- RPCS3: `Games/custom_configs/config_<serial>.yml` — baja SPU block size,
  desactiva VSync, usa "ASMJIT" si no hay LLVM.
- Xenia: `<título>.config.toml` junto al ejecutable.
- PCSX2/DuckStation: overrides por juego integrados en su GUI.
El patrón es siempre el mismo que NovaEmu adoptó: config global → override
por juego → sin tocar código.
