/* Config del sitio NovaEmu NG — script clásico (sin módulos ES) */
(function () {
  'use strict';
  var GITHUB_REPO = "https://github.com/eddyflores100-lang/novaemu";
  window.NG_GITHUB_REPO = GITHUB_REPO;
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll("a[data-gh]").forEach(function (a) { a.setAttribute('href', GITHUB_REPO); });
  });
})();
