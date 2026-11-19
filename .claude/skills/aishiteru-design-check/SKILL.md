---
name: aishiteru-design-check
description: Use before showing or shipping any screen, component or visual change of the Aishiteru PWA. Checks the project's design rules, runs the UI UX Pro Max checklist and takes the standard screenshots.
---

# Revisión de diseño de Aishiteru

Es un regalo: calidad y pulido antes que velocidad. Esta revisión va antes de mostrar un mockup y antes de cada versión con cambios visuales.

## 1. Reglas propias (mandan sobre cualquier guía externa)
- Paletas: día "Sakura" (fondo `#FBF4F3`, acento `#C2405F`); noche "Sakura suave" (fondo `#161214`, acento `#E893AE`, sin brillo ni neón). Nada de tintes que se sientan como un filtro encima. Colores solo por tokens de `styles.css`, nunca hex sueltos en componentes.
- Letras japonesas solo en el título de cada pantalla. Nunca en pestañas, tarjetas, listas, grupos, botones ni modales.
- Encabezado: flor suelta sin cuadro con el color del tema, nombre en color de acento, avatar redondo con la inicial. El logo con cuadro es solo para ícono, bienvenida, bloqueo y Acerca de.
- Sin botón flotante (FAB): las acciones van junto al título de la sección.
- "Más": grupos plegables (uno abierto a la vez), tarjetas de 2 por fila; lo que no existe dice "Pronto".
- Nada de `alert`, `confirm` ni `prompt` nativos: usar `ui.openModal` / `confirmDialog` / toasts.
- Íconos SVG del sprite (`icons/sprite.svg`), no emojis como íconos.
- "Conectar, no desconectar": nada que vigile o controle al otro.
- Textos en español cercano, cortos, sin jerga técnica.

## 2. Checklist de UI UX Pro Max
Usa la skill `ui-ux-pro-max` (en `.claude/skills/`) como segunda opinión. Su `references/pro-rules.md` trae la lista previa a entregar; lo mínimo:
- Contraste 4.5:1 en texto (3:1 en texto grande e íconos), de día y de noche.
- Áreas táctiles de 44×44 px o más, con 8 px entre ellas.
- Foco visible con teclado; todo botón de solo ícono con `aria-label`.
- `prefers-reduced-motion`: animaciones fuera o reducidas a un fundido.
- Sin scroll horizontal; zonas seguras (`env(safe-area-inset-*)`) en teléfonos con muesca.
- Imágenes en WebP, con tamaño reservado (nada que salte al cargar).
- Animaciones con sentido (de dónde viene y a dónde va), entre 150 y 400 ms, sin animar `width`/`height`.
Lo automático lo revisa `BASE=http://127.0.0.1:8787/ node tests/ui-audit.cjs`: scroll horizontal, áreas táctiles (44×44 en teléfono y tablet, 24×24 con mouse), controles sin nombre y letras japonesas fuera del título, en todas las pantallas y algunos modales. Meta: 0 hallazgos. Si sumas una pantalla o un modal, agrégalo a sus listas `ROUTES` u `OPENED`. Para agrandar el área táctil sin cambiar el look, usa un `::after` absoluto con `inset` negativo (no sirve si el elemento tiene `overflow: hidden`).
Si una guía externa choca con las reglas del punto 1, ganan las del punto 1. Su buscador (`scripts/search.py`) es opcional: ejecútalo solo si el usuario lo permite.

## 3. Capturas estándar
- Anchos 390 (teléfono), 820 (tablet) y 1440 (PC), tema de día y de noche. Las que verá el usuario, con `deviceScaleFactor: 2`.
- Solo datos ficticios (`seed-privado.example.json` o los de `tests/e2e.cjs`).
- Guardar en `/mnt/project-files/disenos/` con nombre `vX.Y.Z-<pantalla>[-pc|-noche].png` y adjuntarlas en la respuesta.
- Revisar `tests/a11y.cjs` (axe) en 0 violaciones.

## 4. Si hay que decidir
Cuando el cambio abre una elección de diseño que los docs no fijan: tarjeta de decisión con 2 a 4 opciones, su consecuencia y una recomendación con el porqué. Mejor con mockup (Artifact o captura) de cada opción. No se construye hasta que el usuario elige.
