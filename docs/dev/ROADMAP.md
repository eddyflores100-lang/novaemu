# Roadmap honesto de NovaEmu

Regla: **cada escalón entra por la puerta de su verificación**, igual que v1.0
entró por Blargg. Nada se declara "soportado" sin suite verde.

## v1.1 — Game Boy completo (semanas)
- APU (4 canales, FIFO de muestras) — verificación: audio test ROMs de blargg
  (`dmg_sound`), referencia de implementación: xemu `dsp_c.c`/`dsp_jit.c`
  (intérprete + JIT del DSP de MCPX).
- CGB (doble velocidad, paletas, VRAM banks) — verificación: `cgb_sound` +
  suites cgb de blargg.
- MBC3/RTC y MBC5 — verificación: ROMs dedicadas de blargg (`mbc1` ya pasa).
- dmg-acid2: hoy corre y dibuja; certificar la imagen contra `reference-dmg.png`
  comparando PPM (necesita afinar PPU: prioridad sprite/bg por pixel exacta).

## v1.3 — Timing exacto (meses)
- Instrucciones con timing ciclo-exacto → `instr_timing` de blargg en verde
  (hoy: Failed documentado, es lo único que separa v1.0 de la precisión total).
- Serial con timing real (SC bit1 = reloj externo).

## v2.0 — GB Color + framework de tests propio (meses)
- Suite tipo Xenia `instr_*.s`: tests diferenciales generados por tabla
  (instrucción × operandos × flags) contra un modelo en Python.
- Caché de bloques con invalidación por hash (RPCS3 #5): intérprete de bloques
  que ejecuta runs de instrucciones con re-despacho directo.

## v3.0 — Siguiente hardware (el salto real, con honestidad)
Orden por dificultad creciente según la investigación (RESEARCH_PS5_XBOX.md):
1. **CHIP-16 / Uxn / consolas virtuales modernas**: mismo marco, specs
   abiertas, se puede certificar al 100% igual que v1.0.
2. **NES/Famicom**: PPU sprite-FIFO real (reemplazar el scanline simplificado),
   mappers 1/3/4. Verificación: nestest + ppu_vbl_nmi de blargg.
3. **Game Gear / Master System / SNES**: la SNES entra aquí por su PPU
   (modo 7, HDMA) — es el salto de complejidad real.
4. **PS1 (vía MIPS R3000A)**: sería el primer guest ≠ host. Arquitectura
   según Xenia: frontend → IR (~40 ops) → intérprete del IR; JIT x64 solo
   cuando el intérprete esté certificado (xenia #5: code cache W^X).
5. **PS4 (vía rehosting shadPS4-style)**: ejecución nativa x86-64 + parcheo
   (Zydis/Xbyak) + HLE por NID. Es la ruta de menor riesgo demostrada en
   2026 (shadPS4 ~70-80% jugable) — y aun así es un proyecto de años con
   equipo grande. NovaEmu no lo promete: lo deja mapeado.

## Lo que NO está en el roadmap
- PS5 / Xbox Series: sin emulador funcional en 2026 (0% verificado, ver
  RESEARCH_PS5_XBOX.md §3); la vía real para jugarlos en PC humilde es
  streaming (guía previa) — no emulación.
- Cualquier "emulador" comercial PCSX4/PCSX5/PS5Emux: scams confirmados.
