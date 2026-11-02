/* ============================================================
 * NovaPKG v3.0 — Formato de disco ".pkg" de NovaEmu PS5 Edition
 * JSON firmado con magic NOVAPKG. Auditoría de manifiesto con
 * advertencias (técnica AnyPS5: fallar claro, no silencioso).
 * ============================================================ */
'use strict';

const NovaPKG = {
  MAGIC: 'NOVAPKG',
  FORMAT: 3,

  /* valida y normaliza un .pkg (objeto parseado) */
  validate(data) {
    const warns = [], errs = [];
    if (!data || typeof data !== 'object') errs.push('El disco no es un objeto válido');
    if (data.magic !== this.MAGIC) errs.push(`Magic inválido: esperado NOVAPKG, recibido ${data.magic || '(ninguno)'}`);
    if (!errs.length && data.format !== this.FORMAT) warns.push(`Formato ${data.format} ≠ ${this.FORMAT}: se intentará cargar igualmente`);
    let game = data.game || data.config && data.config.game;
    const known = ['racer', 'runner', 'space'];
    if (!game) errs.push('Falta "game" (racer | runner | space)');
    else if (!known.includes(game) && !(window.NovaGames && window.NovaGames[game])) warns.push(`Juego "${game}" no es nativo: se usará racer con su configuración`);
    if (data.title && typeof data.title !== 'string') warns.push('title no es string: ignorado');
    if (data.config && typeof data.config !== 'object') warns.push('config no es objeto: ignorado');
    return { ok: errs.length === 0, warns, errs, data };
  },

  /* lee un File del input/drag&drop */
  async fromFile(file) {
    if (!file) throw new Error('NO_FILE');
    const text = await file.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error('PKG_JSON_INVALID: ' + e.message); }
    const v = this.validate(parsed);
    if (!v.ok) throw new Error('PKG_INVALID: ' + v.errs.join(' | '));
    v.warns.forEach(w => console.warn('[LOADER][WARN]', w));
    return v;
  },

  /* construye un disco para descargar */
  build(game, title, config = {}) {
    return JSON.stringify({
      magic: this.MAGIC, format: this.FORMAT,
      game, title, config,
      created: new Date().toISOString(),
      engine: 'NovaCore 3.0'
    }, null, 2);
  }
};

if (typeof window !== 'undefined') window.NovaPKG = NovaPKG;
if (typeof module !== 'undefined') module.exports = NovaPKG;
