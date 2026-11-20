# Aishiteru (愛してる)

PWA de pareja con estética japonesa: Kioto de día y Tokio neón de noche. Funciona sin conexión, guarda todo en el propio dispositivo (IndexedDB) y no usa servidores ni cuentas.

> Este repositorio es **privado** y no contiene datos personales. Los datos reales se cargan dentro de la app desde un archivo que nunca se sube.

## Publicación (Cloudflare, gratis)

La app es estática: no tiene paso de build. Cloudflare la publica desde la rama `main` con `wrangler.jsonc`.

1. En Cloudflare: **Workers & Pages → Create → Import a repository** y elige `mishyro`.
2. Deja el comando de build vacío. El comando de deploy es `npx wrangler deploy` (viene por defecto).
3. Cada merge a `main` publica una versión nueva. La URL es la que muestra Cloudflare en el proyecto (termina en `.workers.dev`).

`.assetsignore` define lo que nunca se publica: `docs/`, `tests/`, `tools/`, CLAUDE.md, README, etc.

## Instalar la app

- **Android (Chrome):** abre la URL, toca el menú ⋮ → **Instalar app** (o el aviso "Agregar a la pantalla principal").
- **PC (Chrome o Edge):** abre la URL y usa el ícono de instalar en la barra de direcciones, o **Ajustes → Instalar la app**.

La primera vez se abre un asistente de 6 pasos: quién usa el dispositivo, datos iniciales, revisión, PIN opcional y la primera copia.

## Datos iniciales (seed privado)

- El formato está en `seed-privado.example.json`, que solo trae datos **ficticios**.
- El archivo real vive fuera del repo, en `../privado/seed-privado.json`, y se carga desde el paso 3 del asistente.
- `syncConfig` corre al abrir la app: agrega o actualiza los textos de `js/config.js`, pero nunca pisa lo que ustedes editaron, ocultaron o borraron.

## Copias de seguridad

**Ajustes → Copia de seguridad** exporta un `.json` (formato `aniversario-backup`). Al importar se puede **Combinar** (gana lo más reciente y respeta lo borrado) o **Reemplazar**. La parte privada va cifrada con una contraseña de la copia. Si las fotos pasan de 50 MB, se generan dos archivos: datos y fotos.

Para pasar los datos al otro teléfono: en uno, **Descargar copia** o **Enviar al otro teléfono** (menú de compartir de Android); en el otro, **Elegir archivo de copia** y **Combinar**. Antes de cambiar nada se ve un resumen; un archivo dañado o de otra versión se rechaza sin tocar los datos.

Recomendación: hacer una copia antes de cada actualización grande y guardarla fuera del teléfono.

## Centro de seguridad

**Ajustes → Centro de seguridad** muestra qué está protegido y permite crear, cambiar o quitar el PIN de la app y el PIN personal, activar la huella, la cortina, el bloqueo al salir y por inactividad, y borrar por sección o todo. Los PIN nunca se guardan: solo las llaves cifradas que abren.

## Publicar una versión nueva

1. Sube `CACHE_VERSION` en `sw.js` y `appVersion` en `js/config.js`.
2. Anota los cambios en `CHANGELOG.md`.
3. Merge a `main`. La app avisa "Hay una versión nueva" y se actualiza con un toque.

## Desarrollo y pruebas

```bash
# servidor local con el subpath /mishyro/ (desde una carpeta que contenga el repo como "mishyro")
python3 -m http.server 8765
BASE=http://127.0.0.1:8765/mishyro/ node tests/unit.cjs           # unitarias (fechas, cifrado, copias, seed)
BASE=http://127.0.0.1:8765/mishyro/ node tests/e2e.cjs            # flujo completo a 390, 820 y 1440 px
BASE=http://127.0.0.1:8765/mishyro/ AXE=ruta/axe.min.js node tests/a11y.cjs   # accesibilidad con axe-core
```

Para probar igual que en Cloudflare (que redirige `/index.html` a `/`), corre también e2e contra `npx wrangler dev`:

```bash
npx wrangler dev --port 8787
BASE=http://127.0.0.1:8787/ node tests/e2e.cjs
```

Requieren Node y Playwright con Chromium. Las pruebas usan solo datos ficticios.

## Decisiones de contenido

- Cápsula: la línea de tiempo muestra lo más reciente arriba, porque es lo que más se abre y así lo nuevo se ve sin bajar. El botón "Ver desde el inicio" la invierte para leer la historia en orden; la elección se recuerda en cada teléfono.
- Fotos: cada recuerdo lleva hasta 6. Se comprimen en el teléfono (lado mayor de 1280 px, JPEG al 70 %, con la orientación de la cámara corregida) y se guardan en IndexedDB. Las de "Solo yo" se cifran con la misma clave que su recuerdo.
- Preguntas y retos: salen en un orden barajado con una semilla compartida, así los dos teléfonos ven lo mismo sin servidor. No se repiten hasta terminar la lista, y al empezar otra vuelta se dejan fuera los últimos que salieron.
- Canciones: solo enlaces de Spotify. El título se pide a Spotify y el reproductor carga solo al tocarlo, y ambos se apagan con el Modo sin terceros.

## Estructura

- `index.html`, `styles.css`, `theme-boot.js`, `manifest.webmanifest`, `sw.js`: la base de la PWA.
- `js/core/`: base de datos, cifrado, copias, seed, rutas, tema, componentes y seguridad.
- `js/features/`: cada pantalla. `js/config.js`: textos y ajustes base (comentarios en español).
- `fonts/`, `icons/`, `vendor/`: todo alojado aquí; no se carga nada de otros dominios.
- `tools/`: scripts para regenerar íconos, sprite y fuentes.

## Ideas para más adelante (no se construyen)

- **Fase futura A:** widgets nativos de Android.
- **Fase futura B:** ubicación en vivo opcional.
