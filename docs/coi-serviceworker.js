/* NovaEmu — coi-serviceworker (patrón de gzuidhof/coi-serviceworker, MIT).
 * GitHub Pages no permite enviar cabeceras COOP/COEP; este service worker las
 * inyecta en las navegaciones same-origin para habilitar SharedArrayBuffer
 * (crossOriginIsolated) → núcleos threaded: PSP (ppsspp) y DOS (dosbox_pure).
 * Un solo fichero con doble rol:
 *   - ejecutado en la página: registra el SW y recarga una vez si falta aislamiento
 *   - ejecutado como SW: intercepta navegaciones y añade COOP + COEP
 */
(function () {
  "use strict";
  var EN_PAGINA = typeof window !== "undefined" && typeof window.document !== "undefined";

  if (EN_PAGINA) {
    /* ---------- lado página ---------- */
    window.coiRegister = function (swUrl) {
      if (!("serviceWorker" in navigator)) return Promise.resolve(false);
      if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        return Promise.resolve(false); /* SW requiere contexto seguro */
      }
      return navigator.serviceWorker.register(swUrl)
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function () {
          if (self.crossOriginIsolated) return true;
          /* primera visita: el SW aún no controló la página → recargar UNA vez */
          if (!sessionStorage.getItem("nova-coi-reload")) {
            sessionStorage.setItem("nova-coi-reload", "1");
            location.reload();
            return new Promise(function () {}); /* nos vamos de recarga */
          }
          sessionStorage.removeItem("nova-coi-reload");
          return false;
        })
        .catch(function () { return false; });
    };
    return;
  }

  /* ---------- lado service worker ---------- */
  self.addEventListener("install", function () { self.skipWaiting(); });
  self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

  self.addEventListener("fetch", function (event) {
    var req = event.request;
    if (req.mode !== "navigate") return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.indexOf("coi-serviceworker.js") !== -1) return; /* no reescribirnos */
    event.respondWith((async function () {
      var resp;
      try { resp = await fetch(req); } catch (e) { return new Response("Red no disponible", { status: 503 }); }
      var type = resp.headers.get("Content-Type") || "";
      if (type.indexOf("text/html") !== 0) return resp;
      var headers = new Headers(resp.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");
      var body = await resp.arrayBuffer();
      return new Response(body, { status: resp.status, statusText: resp.statusText, headers: headers });
    })());
  });
})();
