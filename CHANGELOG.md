# Cambios

## 0.1.7

- Encabezado más ligero: la flor de sakura sin el cuadro rojo, con el color del tema (rosa de día, neón de noche), el nombre en rosa y un avatar redondo con la inicial de quien usa la app.

## 0.1.6

- Tema claro nuevo, "Sakura": blanco rosado con rosa sakura y toque lila.
- Resumen, Cápsula del tiempo y Eventos de temporada salen de "Más": aparecerán como aviso en Inicio solo cuando toque (fin de mes o de año, el día que se abre una cápsula, mientras dura una temporada).

## 0.1.5

- "Más" con grupos plegables: se abre un grupo a la vez y muestra tarjetas con una línea que explica cada sección; lo que llega más adelante lleva "Pronto".
- Sin letras japonesas bajo los botones de abajo ni en el menú lateral; quedan solo en el título de cada pantalla.
- Arreglo en Ajustes y listas: la burbuja al tocar salía siempre en el mismo sitio, la lista parpadeaba al deslizar y la página podía saltar. La burbuja ahora sale donde tocas y solo con un toque real, no al deslizar.

## 0.1.4

- "Más" en cuadrícula compacta (3 por fila en el teléfono) con nombres cortos; lo que llega más adelante se marca con un punto.
- Las letras japonesas quedan solo en las pestañas y en el título de cada pantalla.
- El logo de sakura reemplaza al sello en el encabezado, el menú lateral, la bienvenida, el bloqueo y Acerca de.

## 0.1.3

- Logo nuevo: flor de sakura con corazón (ícono de la app, favicon e ícono adaptable de Android).

## 0.1.2

- El PIN de la app y el personal ahora son de 4 números y se envían solos al completar el cuarto dígito.

## 0.1.1

- Arreglo: en Cloudflare la app dejaba de abrir (ERR_FAILED) después de la primera visita, porque el modo sin conexión guardaba una redirección de `index.html`.

## 0.1.0 · Fase 1: base y diseño

- Esqueleto de la PWA: rutas, navegación adaptable (barra inferior en el teléfono, riel lateral en tablet y PC), atajos de teclado y pantalla de inicio.
- Sistema de diseño: tema Kioto (día) y Tokio (noche) automático por hora, alto contraste, fuente legible, tamaño de texto, etiquetas en japonés, patrones y movimiento con modo sobrio.
- Datos en IndexedDB con 59 secciones, migraciones, seed desde `js/config.js` sin pisar lo editado y copias de seguridad (combinar o reemplazar, parte privada cifrada).
- Seguridad: PIN de la app y por persona con cifrado AES-GCM, huella opcional, cortina de privacidad, botón de pánico, bloqueo por inactividad y espera creciente tras PIN incorrecto.
- Asistente de primera vez (6 pasos) e historia de bienvenida.
- Ajustes: apariencia, movimiento, legal, acerca de y guía de estilo.
- Funciona sin conexión (service worker) y se puede instalar en Android y PC.
- Publicación en Cloudflare con el repositorio privado.
- Pruebas: unitarias, de extremo a extremo y de accesibilidad (axe).
