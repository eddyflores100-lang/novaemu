/* NovaEmu v3.0 — lógica del hub: catálogo moderno, carga multi-archivo, BIOS, escena en vivo. */
import { openFilesDB } from "./db.js";

const C = window.NOVA_CATALOG;
const $ = (id) => document.getElementById(id);

const MODERN_KEYS = ["psp", "psx", "n64", "nds", "segaSaturn", "segaCD", "dos", "arcade"];

/* ─────────────── render: sistemas ─────────────── */
function sysCard(key) {
  const s = C.SYSTEMS[key];
  const pills = [];
  if (s.beta) pills.push(`<span class="pill amber">beta</span>`);
  if (s.threads) pills.push(`<span class="pill cyan">hilos</span>`);
  if (s.bios && !s.bios.opcional) pills.push(`<span class="pill red">BIOS requerida</span>`);
  else if (s.bios) pills.push(`<span class="pill">BIOS opcional</span>`);
  const chips = (s.games || []).slice(0, 6).map(g => `<span class="chip">${g.t} <i>${g.y}</i></span>`).join("");
  const extra = (s.games || []).length > 6 ? `<span class="chip more">+${s.games.length - 6} más</span>` : "";
  const exts = s.exts.map(e => "." + e).join(" ");
  return `<div class="sys-card modern" id="sys-${key}">
    <div class="sys-head"><b style="color:${s.color}">${s.label}</b>
      <span class="era">${s.era}</span>${pills.join("")}</div>
    <div class="chips">${chips}${extra}</div>
    <span class="note">${s.note}</span>
    <div class="controls">
      <button class="btn primary" data-loadsys="${key}">▶ Cargar ROM ${s.short} (${exts})</button>
    </div>
  </div>`;
}
$("sys-modern").innerHTML = MODERN_KEYS.map(sysCard).join("");
$("sys-retro").innerHTML = Object.keys(C.SYSTEMS).filter(k => !MODERN_KEYS.includes(k)).map(sysCard).join("");

/* ─────────────── render: ruta nativa ─────────────── */
$("tabla-nativa").querySelector("tbody").innerHTML = C.NATIVA.map(n => `
  <tr><td><b>${n.cons}</b></td>
  <td>${n.url ? `<a href="${n.url}" target="_blank" rel="noopener">${n.emu} ↗</a>` : n.emu}</td>
  <td>${n.note}</td><td class="mono" style="color:#fcd34d">${n.pct}</td></tr>`).join("");

/* ─────────────── render: escena + estrellas en vivo ─────────────── */
function escenaCard(r, starsTxt) {
  return `<a class="escena-card" href="${r.url}" target="_blank" rel="noopener">
    <b>${r.name}</b><span class="stars">${starsTxt}</span>
    <span class="kind mono">${r.kind}</span>
    <p>${r.desc}</p></a>`;
}
function fmtStars(n) { return "★ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

function pintaEscena(extra) {
  $("escena-grid").innerHTML = C.ESCENA.map(r => {
    const live = extra && extra[r.url];
    const txt = typeof live === "number" ? fmtStars(live) + " · ahora"
      : (r.stars27 ? fmtStars(r.stars27) + " · 27-oct" : "activo");
    return escenaCard(r, txt);
  }).join("");
}
pintaEscena();

/* refresco en vivo (rate-limit anónimo 60/h → cache 3h en localStorage) */
(async () => {
  try {
    const CACHE = "nova-stars-v3";
    const prev = JSON.parse(localStorage.getItem(CACHE) || "null");
    if (prev && Date.now() - prev.ts < 3 * 3600e3) { pintaEscena(prev.map); return; }
    const entradas = C.ESCENA.map(r => [r.url, r.url.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "")]);
    const res = await Promise.allSettled(entradas.map(([, repo]) =>
      fetch("https://api.github.com/repos/" + repo, { headers: { "Accept": "application/vnd.github+json" } })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))));
    const map = {}; let ok = 0;
    res.forEach((p, i) => { if (p.status === "fulfilled" && p.value.stargazers_count != null) { map[entradas[i][0]] = p.value.stargazers_count; ok++; } });
    if (ok) { pintaEscena(map); localStorage.setItem(CACHE, JSON.stringify({ ts: Date.now(), map })); }
  } catch { /* estático 27-oct */ }
})();

/* ─────────────── render: noticias ─────────────── */
$("news-list").innerHTML = C.NOTICIAS.map(n => `<li><span class="date mono">${n.d}</span> — ${n.t}</li>`).join("");

/* ─────────────── render: incluidos ─────────────── */
$("lib-grid").innerHTML = C.GAMES.map(g => {
  const s = C.SYSTEMS[g.system];
  return `<a class="lib-card" href="./play.html?sys=${s.core}&file=${encodeURIComponent(g.file)}" style="--ca:${g.cover.a};--cb:${g.cover.b}">
    <div class="cover"><span class="glyph">${g.cover.glyph}</span><span class="syspill" style="background:${s.color}">${s.label}</span></div>
    <div class="meta"><b>${g.title}</b><span class="tag">${g.tag}</span>
      <p>${g.desc}</p>
      <span class="lic mono">${g.license}</span></div>
    <span class="playbtn">▶ Jugar</span></a>`;
}).join("");

$("nova-grid").innerHTML = C.NOVA_GAMES.map(g => `
  <a class="lib-card small" href="./play.html?rom=${g.id}" style="--ca:#052e26;--cb:#064e3b">
    <div class="cover"><span class="glyph">${g.title.replace("Nova ", "").toUpperCase()}</span><span class="syspill" style="background:#10b981">CHIP-8 · núcleo propio</span></div>
    <div class="meta"><b>${g.title}</b><span class="tag">${g.keys}</span><p>${g.desc}</p></div>
    <span class="playbtn">▶ Jugar</span></a>`).join("");

/* ─────────────── carga de ROM: drag&drop multi + ambiguos + IDB ─────────────── */
const dz = $("dropzone"), inp = $("rom-input");
let pendingFiles = [];      /* File[] en espera de decisión del usuario */
let pendingSys = null;      /* sistema elegido explícitamente (botones de tarjetas) */

function extsDe(sysKey) { return C.SYSTEMS[sysKey].exts.map(e => "." + e).join(","); }

/* botones «Cargar ROM X» de las tarjetas → abren el picker pre-filtrado */
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-loadsys]");
  if (!b) return;
  pendingSys = b.getAttribute("data-loadsys");
  inp.accept = extsDe(pendingSys);
  inp.click();
});

async function guardarYJugar(file, sysKey) {
  const db = await openFilesDB();
  await new Promise((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, "pending-rom");
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  location.href = "./play.html?local=1&sys=" + encodeURIComponent(C.SYSTEMS[sysKey].core);
}

function pedirSistema(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const opciones = (C.AMBIGUOUS[ext] || Object.keys(C.SYSTEMS)).slice(0, 5);
  $("sys-chooser").hidden = false;
  $("sys-chooser").scrollIntoView({ behavior: "smooth", block: "center" });
  $("sys-chooser-file").textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) — extensión .${ext} usada por varias consolas`;
  $("sys-chooser-btns").innerHTML = opciones.map(k => {
    const s = C.SYSTEMS[k];
    return `<button class="btn primary" data-chsys="${k}">${s.label}</button>`;
  }).join("");
  $("sys-chooser-btns").onclick = (ev) => {
    const b = ev.target.closest("[data-chsys]");
    if (!b) return;
    const key = b.getAttribute("data-chsys");
    $("sys-chooser").hidden = true;
    if (pendingFiles.length > 1) jugarMulti(key);
    else guardarYJugar(pendingFiles[0], key);
  };
}

async function jugarMulti(sysKey) {
  /* multi-archivo (PS1 .bin+.cue, Saturn, sets) → zip STORE local → un blob */
  const msg = document.createElement("div");
  msg.className = "sub"; msg.style.marginTop = "8px";
  msg.textContent = "Empaquetando " + pendingFiles.length + " archivos localmente (sin compresión, sin subidas)…";
  $("sys-chooser").after(msg);
  try {
    const items = [];
    const ordenados = [...pendingFiles].sort((a, b) => (a.name.endsWith(".cue") || a.name.endsWith(".m3u") ? -1 : 1) - (b.name.endsWith(".cue") || b.name.endsWith(".m3u") ? -1 : 1));
    for (const f of ordenados) items.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    const zip = window.NovaZip.pack(items);
    const blob = new Blob([await zip], { type: "application/zip" });
    const base = (ordenados.find(f => /\.cue$/i.test(f.name))?.name || ordenados[0].name).replace(/\.[^.]+$/, "");
    const archivo = new File([blob], base + ".zip", { type: "application/zip" });
    msg.remove();
    await guardarYJugar(archivo, sysKey);
  } catch (err) {
    msg.textContent = "No se pudo empaquetar: " + err.message;
  }
}

async function sendFiles(list) {
  const files = [...list];
  if (!files.length) return;
  pendingFiles = files;
  if (files.length > 1) {
    /* multi-archivo: deducir sistema (psx por defecto con .cue/.bin) */
    const exts = files.map(f => (f.name.split(".").pop() || "").toLowerCase());
    const key = pendingSys || (exts.some(e => ["bin", "cue", "img", "ecm"].includes(e)) ? (C.AMBIGUOUS.bin ? "psx" : "psx") : null);
    if (key) return jugarMulti(key);
    return pedirSistema(files[0]);
  }
  const f = files[0];
  const key = pendingSys || C.detectSystemKey(f.name);
  if (!key) {
    alert("Extensión no reconocida. Soportadas: " + Object.keys(C.EXT2CORE).map(e => "." + e).join(" "));
    return;
  }
  if (C.AMBIGUOUS[(f.name.split(".").pop() || "").toLowerCase()] && !pendingSys) return pedirSistema(f);
  await guardarYJugar(f, key);
}

dz.addEventListener("click", () => { pendingSys = null; inp.accept = ""; inp.click(); });
dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
inp.addEventListener("change", () => { if (inp.files.length) sendFiles(inp.files); });
["dragover", "dragenter"].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) dz.classList.remove("over");
}));
document.addEventListener("drop", e => { pendingSys = null; const fs = e.dataTransfer?.files; if (fs && fs.length) sendFiles(fs); });

/* ─────────────── carga por URL ─────────────── */
$("rom-url-go").addEventListener("click", () => {
  const u = $("rom-url").value.trim();
  if (!/^https:\/\/.+/i.test(u)) { alert("Pega una URL https directa al archivo de la ROM."); return; }
  const ext = (u.split("?")[0].split(".").pop() || "").toLowerCase();
  const sys = C.EXT2CORE[ext];
  location.href = "./play.html?url=" + encodeURIComponent(u) + (sys ? "&sys=" + encodeURIComponent(C.SYSTEMS[sys].core) : "");
});
$("rom-url").addEventListener("keydown", e => { if (e.key === "Enter") $("rom-url-go").click(); });

/* ─────────────── BIOS manager ─────────────── */
const BIOS_HINT = {
  psx: "scph5501.bin (US) · scph5500.bin (JP) · scph5502.bin (EU) — o un zip con todas",
  saturn: "saturn.bin — o zip",
  segacd: "bios_CD_U.bin / bios_CD_E.bin / bios_CD_J.bin — o zip",
  nds: "bios7.bin + bios9.bin + firmware.bin — o zip con los tres"
};
async function pintaBios() {
  const db = await openFilesDB();
  const tx = db.transaction("files", "readonly");
  const st = tx.objectStore("files");
  const claves = (await new Promise((res, rej) => {
    const rq = st.getAllKeys(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  })).filter(k => String(k).startsWith("bios:"));
  const nombres = (await Promise.all(claves.map(k => new Promise((res) => {
    const rq = st.get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  }))));
  if (!claves.length) { $("bios-list").innerHTML = `<span class="sub mono">— ninguna BIOS guardada aún —</span>`; return; }
  $("bios-list").innerHTML = claves.map((k, i) => {
    const sys = String(k).slice(5);
    const f = nombres[i];
    const nombre = f && f.name ? f.name : "(archivo)";
    const tam = f && f.size ? (f.size / 1024).toFixed(0) + " KB" : "";
    return `<div class="bios-row"><b style="color:${C.SYSTEMS[sys]?.color || "var(--accent-2)"}">${C.SYSTEMS[sys]?.short || sys}</b>
      <span class="mono">${nombre} ${tam}</span>
      <button class="btn small" data-delbios="${k}">✕ quitar</button></div>`;
  }).join("");
}
$("bios-btn").addEventListener("click", () => $("bios-input").click());
$("bios-input").addEventListener("change", async () => {
  const f = $("bios-input").files[0];
  if (!f) return;
  const sys = $("bios-sys").value;
  const db = await openFilesDB();
  await new Promise((res, rej) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(f, "bios:" + sys);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  $("bios-input").value = "";
  await pintaBios();
});
$("bios-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-delbios]");
  if (!b) return;
  const db = await openFilesDB();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").delete(b.getAttribute("data-delbios"));
  tx.oncomplete = pintaBios;
});
pintaBios();
