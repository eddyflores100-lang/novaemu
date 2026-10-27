/* Config del sitio — EDITA SOLO ESTA LÍNEA tras crear tu repo:
 * GitHub Pages: Settings → Pages → Source: "Deploy from a branch" → main → /docs */
export const GITHUB_REPO = "https://github.com/eddyflores100-lang/novaemu";

document.querySelectorAll("a[data-gh]").forEach((a) => {
  a.href = GITHUB_REPO;
});
