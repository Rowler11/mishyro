# Cambios

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
