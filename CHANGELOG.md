# Cambios

## 0.1.12 (Fase 2, Cartas)

- "Para ti": las cartas llegan en sobres japoneses con un sello con la inicial de quien escribe. Al abrir uno, el sello se rompe y la carta se lee en papel washi; se cierra con el botón o con Esc. Queda marcada "Abierta el … a las …" y pasa a "Abiertas".
- Un listón cuenta las cartas que quedan por abrir.
- "Escribimos": cada uno escribe sus cartas "Ábreme cuando…" con firma y una foto opcional. El borrador solo lo ve quien lo escribe; al sellarla ya no se edita (el sello es simbólico). Se puede leer, compartir el texto y borrar.
- En el teléfono de quien escribió las cartas iniciales aparecen como "Las que le escribiste", con su estado.

## 0.1.11 (Fase 2, Cuponera)

- Cuponera con boletos estilo kippu: muescas, línea punteada para cortar, número y espacio para el sello.
- "Para ti": los cupones que te regalaron. "Canjear" pide confirmación, estampa un sello con tu inicial, lanza confeti y guarda "Canjeado el … a las …".
- "Los que regalaste": los que diste, con su estado. Puedes crear cupones nuevos para tu pareja con dedicatoria y fecha de vencimiento opcional, editarlos, borrarlos y enviarlos por WhatsApp u otra app.
- Los vencidos ya no se pueden canjear. "Reiniciar cupones", al final, con confirmación.

## 0.1.10 (Fase 2, Cápsula)

- Cápsula de verdad: línea de tiempo vertical con lo más reciente arriba y el botón "Ver desde el inicio"; separada por años.
- Botón "+" para agregar un recuerdo con hasta 6 fotos (de la galería o arrastrándolas en el PC), título, fecha, nota y "Los dos / Solo yo". Las fotos se achican a 1280 px y se corrige la orientación de la cámara.
- Cada recuerdo abre su página con las fotos en carrusel; en el PC se ve al lado de la lista.
- "Un día como hoy" arriba cuando hay un recuerdo de esta fecha en años o meses anteriores.
- Editar cualquier recuerdo; borrar los que agregaron ustedes, con confirmación. Los que llegaron sin fecha o sin título quedan en "Por completar".
- Si el teléfono se queda sin espacio, avisa y no pierde lo escrito.

## 0.1.9 (Fase 2, primera parte)

- Inicio de verdad: contador de días juntos con el desglose en años, meses, días, horas, minutos y segundos (meses de calendario, no de 30 días), con pétalos la primera vez del día.
- Buenos días y buenas noches según la hora, con botón para enviarlo; en la tarde se puede ver el de la noche.
- "Pensando en ti": manda una frase sin repetir la anterior y cuenta cuántas veces lo hiciste hoy y este mes.
- Razón del día en forma de papel de la suerte, con "Sacar otra".
- Próxima fecha especial (aniversario y cumpleaños incluidos), próximo hito con barra de progreso, celebración con confeti el día que toca y recordatorio de copia de seguridad.
- En el teléfono se ven las 4 primeras tarjetas y el resto con "Ver más"; en tablet y PC van en cuadrícula.
- Las frases con género siguen a quien las manda (sol{o/a}, enamorad{o/a}).

## 0.1.8

- Modo oscuro nuevo, "Sakura suave": fondo casi negro con un toque cálido y rosa empolvado, sin brillos de neón. Gemelo del tema claro Sakura.

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
