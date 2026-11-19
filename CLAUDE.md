# CLAUDE.md · mishyro (app "Aishiteru")

Contexto permanente para Claude Code en este repositorio. Este archivo es público: no escribas aquí datos personales.

## Qué es
"Aishiteru" (愛してる): PWA de pareja con estética japonesa (tema Sakura de día y Sakura suave de noche), publicada gratis en Cloudflare (Workers con archivos estáticos, desde `main`) con el repositorio privado. Se usa en dos teléfonos Android con Chrome y en un PC con Chrome o Edge. Es un regalo: calidad y pulido antes que velocidad.

## Dónde está la especificación
- `docs/00-PROMPT-EJECUCION.txt`: tu rol, misión y reglas. Léelo primero.
- `docs/01` a `docs/14`: la fuente de verdad. Mandan sobre cualquier suposición.
- `docs/` y `../privado/` existen solo en local y están en `.gitignore`. Nunca los subas ni copies su contenido a archivos versionados.
- Datos personales reales: `../privado/seed-privado.json`, con el formato de `docs/13`. No lo abras salvo que el usuario lo pida, y nunca lo modifiques.

## Reglas permanentes
1. **El usuario decide.** Nunca supongas datos, requisitos ni contenido. Antes de definir algo de diseño, contenido o funciones que los docs no fijen con detalle, plantéale la decisión: 2 a 4 opciones con su consecuencia y tu recomendación con el porqué. Agrupa las decisiones al inicio de cada fase y espera su respuesta antes de construir esa parte.
2. **Por fases.** El orden es 0, 1, 2, 3, 4A, 4B, 5, 6 y 7 (docs/07), con una fase por entrega. Cada fase cierra con su reporte de pruebas (docs/12) y "Esperando tu decisión: aprobar, denegar o complementar". Solo avanzas con "aprobar" explícito.
3. **Costo cero.** Nada que requiera pago, tarjeta o llaves con costo. La fase futura B no se construye. La fase futura A (sincronización en vivo entre los dos teléfonos) la aprobó el usuario el 2026-11-19: va como fase propia justo después de la Fase 2, con Cloudflare (plan gratis, sin tarjeta) y cifrado de extremo a extremo; antes de construirla se plantean sus decisiones.
4. **Privacidad del repositorio.** El repo es privado, pero la app publicada sí es pública y el repo podría compartirse. Ningún nombre completo, fecha de nacimiento, carta, razón, PIN, frase secreta ni contenido íntimo legible en el repositorio. Antes de cada commit, revisa `git status` y que `docs/`, `privado/` y `seed-privado.json` no aparezcan.
5. **Nunca pidas ni guardes PIN o frases secretas.** Se crean dentro de la app.
6. **Sección 33 (privada).** Respeta los límites de contenido de docs/05 §33. No copies contenido de sitios externos.
7. **Conectar, no desconectar.** Nada de control, celos ni revisar el teléfono del otro.
8. **No rompas lo aprobado.** Haz pruebas de regresión, migraciones de esquema, sube CACHE_VERSION en sw.js y mantén CHANGELOG.md al día.
9. **Prueba de verdad.** Usa un servidor local con subpath `/mishyro/`, prueba en 390, 820 y 1440 px, revisa la consola y usa solo datos ficticios. Reporta los fallos tal cual.

## Decisiones de diseño ya tomadas
- Logo: flor de sakura con corazón (`icons/icon.svg`); nada de logos que sean solo una letra o un kanji.
- Encabezado: flor suelta sin cuadro (`ui.flower`, símbolo `brand-sakura`) con el color del tema, nombre en color de acento y avatar redondo con la inicial. El logo con cuadro queda para el ícono de la app, la bienvenida, el bloqueo y Acerca de.
- Letras japonesas solo en el título de cada pantalla (única excepción, decidida el 2026-11-19: "愛してる · te amo" bajo el nombre en Acerca de); nunca en las pestañas de abajo, tarjetas, listas, grupos, botones ni modales.
- "Más": grupos plegables, uno abierto a la vez, con tarjetas de 2 por fila (nombre corto y una línea de descripción); lo que no existe aún lleva "Pronto", no "Fase N".
- PIN de la app y personal: 4 dígitos con envío automático. Rincón: 6 (docs/05 §33).
- Tema claro: paleta "Sakura" (fondo #FBF4F3, acento #C2405F). Tema oscuro: "Sakura suave" (fondo #161214, acento #E893AE, sin brillo). Al usuario no le gustan los tintes que se sienten como un filtro encima.
- "Momentos": Resumen (fin de mes y de año), Cápsula del tiempo (el día que se abre) y Eventos de temporada no van en "Más"; salen como aviso en Inicio solo cuando toca (`moment: true` en routes.js). Desde el aviso se puede volver a los anteriores.

## Skills del proyecto (`.claude/skills/`)
- `aishiteru-release`: cada versión o arreglo que va a `main` (versión, CHANGELOG, pruebas, PR, despliegue).
- `aishiteru-design-check`: antes de mostrar o publicar cualquier cambio visual (reglas propias, checklist UI y capturas).
- `ui-ux-pro-max` (MIT, de terceros): guía de UI/UX y accesibilidad como segunda opinión; las reglas de este archivo mandan sobre ella.
- También sirven, si están instaladas: `frontend-design` (construir pantallas), `design:accessibility-review`, `design:ux-copy`, `security-review` (obligatoria antes de cerrar la Fase A: sincronización y cifrado) y `dataviz` (Resumen del año).

## Estilo de trabajo
- Responde en español, con un tono cercano y directo. El código, las variables y los comentarios técnicos van en inglés; los comentarios de CONFIG van en español.
- Explica solo lo no obvio.
- Commits pequeños por fase, con un mensaje claro en español.

## Estado
Actualiza esta línea al cerrar cada fase: **Fase actual: 2 (terminada, esperando aprobación; Fase 1 aprobada el 2026-11-19). Siguiente: Fase A (sincronización en vivo).**
