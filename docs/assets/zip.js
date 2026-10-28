/* NovaEmu — empaquetador ZIP (método STORE, sin compresión) 100% local.
 * Uso: ROMs multi-archivo (PS1 .cue + .bin, Sega CD, sets arcade) → un solo blob
 * para el player. Sin dependencias externas. CRC-32 IEEE estándar.
 * API: NovaZip.pack([{name, data:Uint8Array}]) -> Promise<Uint8Array>
 *      NovaZip.crc32(u8) -> int (verificable: crc32("123456789") === 0xCBF43926)
 */
(function (global) {
  "use strict";

  var TABLA = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = TABLA[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime() {
    var d = new Date();
    var fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    return { fecha: fecha & 0xFFFF, hora: hora & 0xFFFF };
  }

  function w16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function w32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

  function pack(files) {
    if (!files || !files.length) return Promise.reject(new Error("NovaZip: sin archivos"));
    return new Promise(function (res, rej) {
      try {
        var dt = dosDateTime();
        var locales = [], centrales = [], offset = 0;

        files.forEach(function (f) {
          var nombre = String(f.name).replace(/\\/g, "/").replace(/^\/+/, "");
          var datos = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
          var crc = crc32(datos);
          var nBytes = [];
          for (var i = 0; i < nombre.length; i++) nBytes.push(nombre.charCodeAt(i) & 0xFF);

          var cab = [];
          w32(cab, 0x04034b50);      /* firma local */
          w16(cab, 20);              /* versión */
          w16(cab, 0x0800);          /* flags: UTF-8 */
          w16(cab, 0);               /* método STORE */
          w16(cab, dt.hora); w16(cab, dt.fecha);
          w32(cab, crc); w32(cab, datos.length); w32(cab, datos.length);
          w16(cab, nBytes.length); w16(cab, 0); /* nombre + extra */
          Array.prototype.push.apply(cab, nBytes);

          var cen = [];
          w32(cen, 0x02014b50);
          w16(cen, 20); w16(cen, 20);
          w16(cen, 0x0800); w16(cen, 0);
          w16(cen, dt.hora); w16(cen, dt.fecha);
          w32(cen, crc); w32(cen, datos.length); w32(cen, datos.length);
          w16(cen, nBytes.length);
          w16(cen, 0); w16(cen, 0); w16(cen, 0); w16(cen, 0);
          w32(cen, 0); w32(cen, offset);
          Array.prototype.push.apply(cen, nBytes);

          offset += cab.length + datos.length;
          Array.prototype.push.apply(locales, cab);
          Array.prototype.push.apply(centrales, cen);
        });

        var fin = [];
        w32(fin, 0x06054b50);
        w16(fin, 0); w16(fin, 0);
        w16(fin, files.length); w16(fin, files.length);
        w32(fin, centrales.length);
        w32(fin, offset);
        w16(fin, 0);

        var total = locales.length + centrales.length + fin.length;
        var out = new Uint8Array(total);
        out.set(locales, 0);
        out.set(centrales, locales.length);
        out.set(fin, locales.length + centrales.length);
        res(out);
      } catch (e) { rej(e); }
    });
  }

  global.NovaZip = { pack: pack, crc32: crc32 };
})(window);
