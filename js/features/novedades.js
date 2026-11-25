// "Novedades" (v0.23.0): the first time the app opens after an update, a friend from the paper animals
// says what is new in two or three lines. Seen per device (localStorage). A brand-new install shows nothing.
import { ui, util, profile, CONFIG } from '../core.js';
import { draw } from '../core/art.js';
import { PETS, nameOf } from '../core/pets.js';

const { el } = util;
const KEY = `${CONFIG.storageKey}.novedades.seen`;

// Short, in plain words, about what they will notice. Edit this list on every release.
export const NOTES = {
  version: '0.28.0',
  items: [
    'Foto del día: cada uno comparte una foto de hoy y aparecen lado a lado en Inicio. La del otro se ve cuando compartes la tuya.',
    'Inicio a tu gusto: abajo, "Personalizar Inicio" para elegir qué tarjetas ver y en qué orden.',
    'Etiquetas en los recuerdos y Buscar con filtros por tipo, por quién y por año.',
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
