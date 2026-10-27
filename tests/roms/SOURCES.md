# ROMs de test para verificación de emuladores (novaemu)

**Fecha de descarga:** 27-oct-2026
**Propósito:** verificar el emulador de novaemu con suites de test públicas y libremente redistribuibles.
**Restricción cumplida:** aquí NO hay ROMs comerciales de juegos. Solo suites de test de hardware/compatibilidad, creadas por y para desarrolladores de emuladores.

Verificación de integridad: ejecutar `sha256sum -c SHA256SUMS` desde este directorio (23 ficheros, todos los hashes están en ese fichero).

---

## 1. Game Boy — Blargg's hardware test ROMs (retrio/gb-test-roms)

- **Autor original:** Shawn «blargg» Blargg. Suites clásicas de test de hardware para Game Boy, publicadas originalmente en `http://blargg.parodius.com/gb-tests/` (caído) y re-publicadas por el autor en `http://blargg.8bitalley.com/parodius/gb-tests/`.
- **URL de origen (descargado):** `https://github.com/retrio/gb-test-roms.git` — mirror de facto de la comunidad de emulación (organización retrio), clone shallow del commit `c240dd7d700e5c0b00a7bbba52b53e4ee67b5f15` (2015-06-24).
- **Licencia / redistribución:** el repositorio no incluye un fichero `LICENSE` explícito. Cada suite incluye su **código fuente ensamblador** (`*/source/*.s`) y los readmes del autor están orientados a que los usen los desarrolladores de emuladores; históricamente estas suites se han distribuido libremente y son el estándar de facto para validar emuladores GB (están referenciadas por casi todos los proyectos de emulación). Estado declarado: redistribución libre con fines de test; sin declaración restrictiva encontrada en el repo. Copia íntegra del clone conservada en `/home/z/my-project/research/testroms/gb-test-roms` para auditoría.

### Ficheros copiados en `gb/`

| Fichero | Suite | Qué verifica |
|---|---|---|
| `01-special.gb` … `11-op a,(hl).gb` (11 ficheros) | **cpu_instrs** (individual) | comportamiento de todas las instrucciones de la CPU SM83 excepto STOP y los 11 opcodes ilegales; verifica resultado y registros colaterales mediante checksums CRC-32. Salida esperada en pantalla: `cpu_instrs` / `Passed` |
| `instr_timing.gb` | **instr_timing** | duración en ciclos T de cada instrucción (timings de CPU) |
| `halt_bug.gb` | **halt_bug** | el bug de `HALT` (ejecución de la siguiente instrucción dos veces bajo ciertas condiciones de IME/IE) |
| `interrupt_time.gb` | **interrupt_time** | latencia/activación temporal de interrupciones |

Nota: el nombre correcto del último fichero de cpu_instrs es `11-op a,(hl).gb` (la instrucción `ld a,(hl)`), no «11-op a,hl,sp.gb» como aparecía en la orden original. Los 11 ficheros están completos.

---

## 2. Game Boy — dmg-acid2 (mattcurrie/dmg-acid2)

- **Autor:** Matt Currie.
- **URL de origen (descargado):** `https://github.com/mattcurrie/dmg-acid2/releases/download/v1.0/dmg-acid2.gb` — es el enlace oficial que figura en el README del proyecto.
- **Licencia / redistribución:** **MIT** (`Copyright (c) 2020 Matt Currie`), verificada en el `LICENSE` del repositorio. Redistribución explícitamente permitida.
- **Qué verifica:** la PPU (Pixel Processing Unit) del Game Boy clásico (DMG): un patrón de sprites, scroll, ventanas y paletas que debe reproducir exactamente la imagen de referencia incluida en el repo (`img/reference-dmg.png`).
- **Nota de adquisición:** la orden original pedía la release `v1.1`; **esa etiqueta no existe** (HTTP 404) y la API de GitHub de `mattcurrie/dmg-acid2` lista únicamente `v1.0` con el asset `dmg-acid2.gb`. Se descargó `v1.0` con `curl -L --fail` (32768 bytes).
- **SHA-256:** `464e14b7d42e7feea0b7ede42be7071dc88913f75b9ffa444299424b63d1dff1`

---

## 3. CHIP-8 — Timendus/chip8-test-suite

- **Autor:** Timendus (Christian Goeschel Ndjomchoua). Suite moderna de test para implementaciones de CHIP-8 y SUPER-CHIP, escrita en Octo.
- **URL de origen (descargado):** `https://github.com/Timendus/chip8-test-suite.git` — clone shallow del commit `742e9eac9f5d44466c1c9d83fcaa8158c6683cb1` (2025-11-07).
- **Licencia / redistribución:** **GNU GPL v3** (fichero `LICENSE` de 29-jun-2007 en el propio repo). Redistribución permitida bajo los términos de la GPL-3.0.
- **Formato:** los binarios compilados están en `bin/` (la orden original decía `binaries/`; el nombre real del directorio es `bin/`). Se copiaron solo los `.ch8` (binarios ejecutables), no las fuentes `.8o`.

### Ficheros copiados en `chip8/` (subconjunto "PART 1", tamaño estándar de programa)

| Fichero | Qué verifica |
|---|---|
| `1-chip8-logo.ch8` | arranque básico: `CLS`, `DRW`, font de sprites — muestra el logo de CHIP-8 |
| `2-ibm-logo.ch8` | flujo de programa, `DRW` XOR y bucles — muestra el logo de IBM |
| `3-corax+.ch8` | pantalla grande (flags de modo) — logo de Corax+ |
| `4-flags.ch8` | flags de máxima resolución, planos de dibujo y compatibilidad de quirks |
| `5-quirks.ch8` | los 8 quirks de vtiming/carga/shift/clipping/etc. más comunes (menú interactivo por grupo) |
| `6-keypad.ch8` | teclado: debouncing, orden de pulsaciones y eventos de soltar |
| `7-beep.ch8` | sonido: altavoz y registros de audio (buzzer) |
| `8-scrolling.ch8` | instrucciones de scroll (SUPER-CHIP) |

---

## Procedencia y reproducibilidad

- Clones de referencia (con historial y fuentes) conservados en:
  - `/home/z/my-project/research/testroms/gb-test-roms` (commit `c240dd7`)
  - `/home/z/my-project/research/testroms/chip8-test-suite` (commit `742e9ea`)
- `SHA256SUMS` (en este directorio) permite verificar que ninguna ROM se corrompió o modificó tras la copia. Todos los ficheros GB son imágenes ROM válidas según `file` ("Game Boy ROM image"); los `.ch8` son `data` (binario plano sin cabecera, correcto para CHIP-8).
- Metodología: `git clone --depth 1` + `cp` sin transformaciones; `dmg-acid2.gb` vía `curl -L` sobre la release oficial firmada por el autor. No se ejecutó ninguna ROM durante la adquisición.
