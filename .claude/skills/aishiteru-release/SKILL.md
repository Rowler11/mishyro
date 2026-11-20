---
name: aishiteru-release
description: Use when shipping any change of the Aishiteru PWA to production (version bump, CHANGELOG, tests, PR, merge to main, Cloudflare deploy check). Run it for every release, hotfix included.
---

# Publicar una versión de Aishiteru

Cloudflare publica `main` solo (Workers con archivos estáticos). Todo lo que llegue a `main` queda en los teléfonos, así que nada se une sin pasar esta lista.

## 1. Antes de tocar nada
- `git checkout main && git pull`, y una rama nueva con nombre en español (`estampillas-propias`, `quitar-aviso-huella`).
- Si el cambio es de diseño, contenido o funciones y los docs no lo fijan: primero la decisión al usuario (2 a 4 opciones, consecuencia y recomendación; mejor con mockup). No construir antes de su respuesta.

## 2. Versión (las tres juntas, siempre)
- `js/config.js`: `appVersion`.
- `sw.js`: `CACHE_VERSION = 'aishiteru-vX.Y.Z'`. Todo archivo nuevo de la app va en `SHELL`; lo pesado y opcional (modelos, vendor) va cache-first en su propia caché, que no empiece con `aishiteru-`.
- `CHANGELOG.md`: entrada nueva arriba, en español y en lenguaje de usuario (qué ve y qué puede hacer), no de código.
- Licencias de terceros nuevas: `config.js` > licencias, y `LICENSE` + `README.txt` dentro de `vendor/<lib>/`.

## 3. Pruebas (servidor local, solo datos ficticios)
- Las pruebas largas (e2e completas, a11y, capturas) van una sola vez al final, cuando todas las partes están construidas. Mientras tanto, solo revisiones rápidas.
- Servidor: `npx wrangler dev --port 8787 --ip 127.0.0.1` (en segundo plano), o `python3 -m http.server 8765` desde la carpeta padre para el subpath `/mishyro/`. Si el repo no tiene carpeta padre propia, crea en el scratchpad una carpeta `www/` con un enlace `mishyro -> <repo>` y sirve desde ahí. wrangler y axe se instalan con npm en el scratchpad, nunca en el repo.
- e2e: `BASE=http://127.0.0.1:8787/ node tests/e2e.cjs`. Toda función nueva suma sus pruebas aquí.
- a11y: `AXE=<ruta a axe.min.js> BASE=http://127.0.0.1:8787/ node tests/a11y.cjs` (axe-core se instala con npm en una carpeta temporal, nunca en el repo). Meta: 0 violaciones de día y de noche.
- Unitarias: `BASE=http://127.0.0.1:8765/mishyro/ node tests/unit.cjs`.
- Mira la consola: cero `pageerror` y cero errores de CSP.
- Si algo falla, vuelve a correr solo lo que falló mientras lo arreglas. Reporta los fallos tal cual.
- Capturas en 390, 820 y 1440 px, de día y de noche (ver la skill `aishiteru-design-check`).

## 4. Privacidad antes del commit
- `git status`: no pueden aparecer `docs/`, `privado/`, `seed-privado.json` ni nada con nombres completos, fechas de nacimiento, cartas, razones, PIN o frases.
- Archivos que no se deben publicar en la web van en `.assetsignore` (tests, tools, `.claude`, docs).
- Commit pequeño con mensaje claro en español.

## 5. PR, unión y despliegue
- Push y PR a `main` con resumen en español y la lista de pruebas con sus números (ej. "e2e 214/214, a11y 0, unitarias 18/18").
- Unir con squash solo cuando el usuario ya pidió el cambio (su pedido es la aprobación); `git checkout main && git pull`.
- Revisar los check-runs del commit de `main` hasta ver "Workers Builds: mishyro" con `success`. Si falla, leer el log y arreglar en una rama nueva.
- En las ramas (no en `main`), "Workers Builds" falla por las migraciones de Durable Objects: es normal y no bloquea. No lo investigues; solo cuenta el check de `main`.
- La URL publicada no se puede abrir desde el sandbox; la prueba real es en el teléfono del usuario.

## 6. Cierre
- Respuesta corta al usuario: qué cambió, versión, cómo verlo en el teléfono (cerrar y abrir la app para que entre la versión nueva), y capturas adjuntas.
- Si la versión cierra una fase: reporte de pruebas (docs/12) y "Esperando tu decisión: aprobar, denegar o complementar". Actualizar la línea de Estado de `CLAUDE.md`.
- Guardar en la memoria del proyecto la versión desplegada y las decisiones tomadas.
