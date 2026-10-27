# Subir NovaEmu a GitHub + activar GitHub Pages

Este repo está listo para publicar tal cual. Solo necesitas una cuenta de GitHub.
**El sandbox no guarda credenciales de GitHub**, así que el push final lo haces tú
(2 minutos, 3 comandos).

## Paso 0 — editar el enlace del sitio (1 línea)

Abre `docs/assets/site.js` y pon tu usuario en la primera línea:

```js
export const GITHUB_REPO = "https://github.com/TU-USUARIO/novaemu";
```

Ese único cambio actualiza todos los enlaces «GitHub ↗» de la web.

## Paso 1 — crear el repo vacío (sin README, sin .gitignore, sin licencia)

- **Web**: https://github.com/new → nombre `novaemu` → **Create repository**
- **O con gh CLI**: `gh repo create novaemu --public --source=. --push`

## Paso 2 — push (los commits ya están hechos)

```bash
cd novaemu
git remote add origin https://github.com/TU-USUARIO/novaemu.git
git push -u origin main
```

GitHub pedirá login en el navegador (o usa un PAT como contraseña).

## Paso 3 — activar GitHub Pages

En el repo: **Settings → Pages** →

- **Source**: `Deploy from a branch`
- **Branch**: `main` · **Folder**: `/docs`
- **Save**

En ~1 minuto la web vive en:

```
https://TU-USUARIO.github.io/novaemu/
```

> ¿Por qué `/docs`? Es la carpeta de Pages soportada nativamente por GitHub,
> así no hace falta ninguna rama `gh-pages` ni GitHub Actions extra.
> Ya hay un `docs/.nojekyll` para que GitHub sirva los ficheros tal cual
> (incluido el `.wasm`).

## Paso 4 — comprobar el CI (opcional pero recomendable)

Pestaña **Actions**: el workflow `ci` compila el emulador en ubuntu-latest y
ejecuta los 12 evals (NE-E001..E012). Debe quedar en verde.

## Qué contiene cada cosa

| Página | URL (una vez publicado) |
|---|---|
| Landing con consola embebida | `/novaemu/` |
| Consola completa (paletas, quirks, pads, drag&drop, serial) | `/novaemu/demo.html` |
| Banco de pruebas (15 checks: goldens + determinismo + Blargg 12/12) | `/novaemu/tests.html` |
| Documentación (6 docs markdown renderizados) | `/novaemu/dev.html` |

## Si el nombre `novaemu` está cogido

Cualquier nombre vale (`novaemu-console`, `novaemu-emulator`…); la web usa rutas
**relativas**, así que funciona bajo cualquier subcarpeta sin cambios.
Solo recuerda ajustar `docs/assets/site.js` y el remote del Paso 2.
