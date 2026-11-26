// "Novedades" (v0.23.0): the first time the app opens after an update, a friend from the paper animals
// says what is new in two or three lines. Seen per device (localStorage). A brand-new install shows nothing.
import { ui, util, profile, CONFIG } from '../core.js';
import { draw } from '../core/art.js';
import { PETS, nameOf } from '../core/pets.js';

const { el } = util;
const KEY = `${CONFIG.storageKey}.novedades.seen`;

// Short, in plain words, about what they will notice. Edit this list on every release.
export const NOTES = {
  version: '0.37.0',
  items: [
    'Inicio más liviano: el contador quedó igual pero un poco más pequeño, los favoritos son cuatro tablillas y "Para hoy" es una lista que se va chuleando a medida que la hacen.',
    'Nuevo en Ahora mismo: la distancia entre los dos, en una escenita animada con el cielo de Inicio y un avioncito de papel que va de uno al otro. Cada uno la activa una vez desde su celular; es aproximada (más o menos 1 km), solo muestra los kilómetros y se puede pausar.',
    '"Pensando en ti" ahora es una tira más discreta, y ya no están las olas en los encabezados de las tarjetas.',
    'Cápsula, Cuponera, Cartas, Calendario, Galería, Mascotas y Ajustes ahora tienen el mismo marco de tinta y olas de Inicio: tarjetas con sello, cajitas de ayuda y pestañas de papel con trazo de pincel.',
    'Arreglé la palabra "null" que aparecía en Buscar.',
    'Inicio sigue las estaciones de Japón: en primavera la rama florece y caen pétalos de sakura, en verano hojas verdes y luciérnagas al atardecer, en otoño el arce rojo y en invierno nieve. De noche siguen, más suaves, con los faroles.',
    'Las tarjetas de Inicio tienen un encabezado con olas japonesas, doble marco de tinta y filas de papel con un trazo rojo, en los 3 estilos.',
    'La barra de arriba del teléfono (hora y batería) toma el color del fondo de cada pantalla; en Inicio sigue el cielo, de día, de tarde y de noche.',
    'La barra de arriba ahora es transparente y sin tu foto: el fondo se ve completo y la app se siente más conectada. Tu perfil y tu foto siguen en Ajustes.',
    'Todas las pantallas comparten el mismo blanco (también las ayudas y, de noche, el mismo gris oscuro en las tarjetas).',
    'Las tarjetas de toda la app son blancas, con un papel washi casi invisible, sin tinte cálido.',
    'La racha queda en una sola fila con Enviar amor, y los dos chulitos se prenden cuando cada uno envía amor.',
    'Si pierden la racha, pueden recuperarla hasta 3 días después si los dos confirman.',
    'Todas las tarjetas de Inicio tienen el mismo papel washi; Sus favoritos y Ahora mismo recuperan el sello, la tinta y el pincel japonés.',
    'Día y noche se sienten distintos: la carga y la apertura cambian de cielo, luz y saludo según la hora (con luna y estrellas de noche).',
    'De noche los animalitos duermen en Inicio, el Latido tiene estrellas y las cartas se abren a luz de vela.',
    'La apertura del día se ve más fina: flores de sakura pintadas en la rama y un paso limpio al "Para …".',
    'Volver a Inicio desde otra sección ya no parpadea.',
    'La pantalla de carga se ve más linda y el Latido empieza lento y se acelera.',
    'Volver a Inicio ya no parpadea: carga todo a la vez y sin repetir la animación.',
    'Las tarjetas de toda la app llevan papel washi, y Ahora mismo, Dormir y soñar, Ánimo y Juegos tienen el sello y la tinta japonesa de siempre.',
  ],
};

const seen = () => { try { return localStorage.getItem(KEY); } catch { return NOTES.version; } };
const mark = () => { try { localStorage.setItem(KEY, NOTES.version); } catch { /* private mode */ } };

/** Shows the notes once per version. Call after the first view is on screen. */
export function maybeShow() {
  const s = seen();
  if (s === NOTES.version) return;
  if (s === null) { mark(); return; } // fresh install: nothing is "new" yet
  const ids = Object.keys(PETS);
  const id = ids[Number(NOTES.version.replace(/\D/g, '')) % ids.length]; // a different friend for each version
  const who = nameOf(id);
  let api;
  api = ui.openModal({
    title: `Novedades de la ${NOTES.version}`, size: 'sm', onClose: mark,
    body: el('div', { class: 'stack novedades' },
      el('div', { class: 'novedades-pet', 'aria-hidden': 'true' }, draw(id)),
      el('p', {}, `${who}: ${profile.nick(profile.active()) ? `¡${profile.nick(profile.active())}, ` : '¡'}la app aprendió cosas nuevas!`),
      el('ul', { class: 'novedades-list' }, NOTES.items.map((t) => el('li', {}, t))),
      ui.button({ label: 'Entendido', variant: 'primary', onClick: () => { mark(); api.close(); } })),
  });
  mark();
}
