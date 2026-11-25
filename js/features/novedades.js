// "Novedades" (v0.23.0): the first time the app opens after an update, a friend from the paper animals
// says what is new in two or three lines. Seen per device (localStorage). A brand-new install shows nothing.
import { ui, util, profile, CONFIG } from '../core.js';
import { draw } from '../core/art.js';
import { PETS, nameOf } from '../core/pets.js';

const { el } = util;
const KEY = `${CONFIG.storageKey}.novedades.seen`;

// Short, in plain words, about what they will notice. Edit this list on every release.
export const NOTES = {
  version: '0.34.1',
  items: [
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
