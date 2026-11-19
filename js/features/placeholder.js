// Placeholder for sections that arrive in a later phase: real page anatomy
// (header, Japanese label, empty state) without content logic.
import { ui, util } from '../core.js';

const { el } = util;
const ART = { inicio: 'sakura', capsula: 'crane', cupones: 'ticket', cartas: 'envelope', yoru: 'moon', mascotas: 'omamori', citas: 'lantern', eventos: 'lantern', juegos: 'fan', mapa: 'torii', suenos: 'moon' };
const ARTS = ['sakura', 'torii', 'lantern', 'fan', 'crane', 'omamori', 'wave'];

function artFor(id = '') {
  if (ART[id]) return ART[id];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ARTS[h % ARTS.length];
}

export function render({ def, app, route }) {
  if (def.notFound) {
    return el('section', { class: 'page' },
      ui.pageHeader({ title: 'Esta página no existe' }),
      ui.emptyState({ title: 'Nos perdimos un poquito', text: 'El enlace no lleva a ninguna parte de la app.', art: 'torii', action: { label: 'Ir a Inicio', onClick: () => { location.hash = '#/inicio'; } } }));
  }
  const isTab = ['inicio', 'capsula', 'cupones', 'cartas'].includes(def.id);
  const when = def.phase === 'próxima' ? 'Llega en una próxima fase' : `Llega en la Fase ${def.phase}`;
  const share = def.id === 'canciones' && app.shareTarget && route.path === '/canciones/nueva'
    ? el('div', { class: 'card note-card' },
      el('p', { class: 'card-kicker' }, 'Recibimos un enlace'),
      el('p', { class: 'break' }, app.shareTarget.url || app.shareTarget.text || app.shareTarget.title),
      el('p', { class: 'muted' }, 'Cuando llegue la sección de Canciones, podrás guardarlo con una dedicatoria.'))
    : null;
  return el('section', { class: 'page' },
    ui.pageHeader({ title: def.title, jp: def.jp, romaji: def.romaji, back: isTab ? null : (def.settingsPage ? '/ajustes' : '/mas') }),
    share,
    ui.emptyState({ title: when, text: def.blurb || 'Esta parte de la app se construye más adelante.', art: artFor(def.id) }));
}
