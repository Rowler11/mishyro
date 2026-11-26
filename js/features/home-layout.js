// Inicio personalizable (v0.28.0, idea 52): which cards Inicio shows and in what order. The days
// counter always stays on top. Stored in settings 'home' (layout: { order, hidden }), so it travels
// with the person's settings like the other Inicio preferences.
import { ui, util, db } from '../core.js';

const { el, icon } = util;
export const CARDS = [
  ['now', 'Ahora mismo'], ['both', '"Hoy los dos pasaron por aquí"'], ['celebration', 'Celebraciones del día'], ['meeting', 'Próximo encuentro'],
  ['toques', 'Buenos días, abrazo y respirar'], ['dayphoto', 'Foto del día'], ['favs', 'Sus favoritos'], ['guide', 'Primeros pasos'],
  ['slides', 'Frases, Pensando en ti y omikuji'], ['coming', 'Lo que viene'], ['today', 'Para hoy'],
  ['weekend', 'Plan del fin de semana'], ['backup', 'Recordatorio de copia'],
];
const DEFAULT = CARDS.map(([id]) => id);
// v0.37.0 (Rowler, Inicio "Tablillas y tiras"): a lighter Inicio by default. Celebraciones and Próximo
// encuentro only appear when they apply, Primeros pasos until it is done; Foto del día, Toques and Plan del
// finde wait in "Personalizar".
export const LAYOUT_V = 2;
export const DEFAULT_ORDER = ['now', 'both', 'celebration', 'meeting', 'favs', 'today', 'slides', 'coming', 'guide', 'dayphoto', 'toques', 'weekend', 'backup'];
export const DEFAULT_HIDDEN = ['dayphoto', 'toques', 'weekend']; // the backup note stays: it only shows after 14 days without a copy

export async function getLayout() {
  const s = await db.getSettings('home', {}).catch(() => ({}));
  // a layout saved before v0.37.0 gives way once to the new Inicio (it can be customized again)
  const l = s.layout && s.layout.v === LAYOUT_V ? s.layout : { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
  const base = DEFAULT_ORDER.filter((id) => DEFAULT.includes(id));
  const order = [...(l.order || []).filter((id) => DEFAULT.includes(id)), ...base.filter((id) => !(l.order || []).includes(id))];
  return { order, hidden: (l.hidden || []).filter((id) => DEFAULT.includes(id)) };
}

/** Sort and drop keyed cards ({ id, node }) by the saved layout. Required cards ignore "hidden". */
export function arrange(cards, layout) {
  return cards.filter((c) => c.node && (c.keep || !layout.hidden.includes(c.id)))
    .sort((a, b) => (a.keep ? -1 : b.keep ? 1 : layout.order.indexOf(a.id) - layout.order.indexOf(b.id)))
    .map((c) => c.node);
}

export async function openEditor({ onSaved } = {}) {
  const layout = await getLayout();
  let order = [...layout.order]; const hidden = new Set(layout.hidden);
  const list = el('ol', { class: 'layout-list' });
  const name = (id) => CARDS.find(([k]) => k === id)[1];
  const paint = () => list.replaceChildren(...order.map((id, i) => el('li', { class: `layout-row${hidden.has(id) ? ' is-off' : ''}` },
    el('label', { class: 'layout-check' },
      el('input', { type: 'checkbox', checked: !hidden.has(id), onChange: (e) => { if (e.target.checked) hidden.delete(id); else hidden.add(id); paint(); } }),
      el('span', {}, name(id))),
    el('span', { class: 'layout-move' },
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Subir ${name(id)}`, disabled: i === 0, onClick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; paint(); list.querySelectorAll('.layout-row')[i - 1]?.querySelector('button')?.focus(); } }, icon('arrow-up', { size: 16 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Bajar ${name(id)}`, disabled: i === order.length - 1, onClick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; paint(); list.querySelectorAll('.layout-row')[i + 1]?.querySelectorAll('button')[1]?.focus(); } }, icon('arrow-down', { size: 16 }))))));
  paint();
  ui.openModal({ title: 'Personalizar Inicio', size: 'sm',
    body: el('div', { class: 'stack' }, el('p', { class: 'muted small' }, 'Elige qué tarjetas ver y en qué orden. El círculo de los días siempre va primero.'), list),
    actions: [
      { label: 'Como venía', variant: 'ghost', onClick: async () => { await db.setSettings('home', { layout: null }); onSaved?.(); return true; } },
      { label: 'Guardar', variant: 'primary', onClick: async () => { await db.setSettings('home', { layout: { v: LAYOUT_V, order, hidden: [...hidden] } }); ui.toast('Inicio quedó a tu gusto.', { tone: 'success' }); onSaved?.(); return true; } }],
  });
}
