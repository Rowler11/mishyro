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
// v0.37.1 (Rowler: "reacomoda Inicio"): what happens today first (celebrations, the next meeting, Ahora mismo),
// then the shortcuts and what to do, and what is coming at the end. A saved layout gives way once to this order.
export const LAYOUT_V = 3;
export const DEFAULT_ORDER = ['celebration', 'meeting', 'now', 'favs', 'today', 'slides', 'coming', 'both', 'guide', 'dayphoto', 'toques', 'weekend', 'backup'];
const INFO = {
  now: 'Lo que hace cada uno y la distancia', both: 'Si los dos abrieron la app hoy', celebration: 'Aniversarios y fechas de hoy',
  meeting: 'Cuenta atrás para verse', toques: 'Saludos y respirar juntos', dayphoto: 'Una foto de cada uno al día',
  favs: 'Sus accesos rápidos', guide: 'Lo que falta para dejar la app lista', slides: 'Tarjetas que van rotando cada día',
  coming: 'Las próximas fechas', today: 'Pregunta, reto e insignias del día', weekend: 'El plan del fin de semana', backup: 'Aviso si llevan días sin copia',
};
const WHEN = new Set(['celebration', 'meeting', 'guide', 'backup']); // these only show when they apply
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
  const name = (id) => CARDS.find(([k]) => k === id)[1].replace(/"/g, '');
  const shown = el('ol', { class: 'layout-list' }); const off = el('ul', { class: 'layout-list is-off' });
  const offHead = el('p', { class: 'layout-sub' }, 'Ocultas');
  let moved = null;
  const move = (id, d) => {
    const vis = order.filter((k) => !hidden.has(k)); const i = vis.indexOf(id); const j = i + d;
    if (j < 0 || j >= vis.length) return;
    const a = order.indexOf(vis[i]); const b = order.indexOf(vis[j]); [order[a], order[b]] = [order[b], order[a]];
    moved = id; util.haptic?.('tap'); paint();
  };
  const row = (id, n, total) => {
    const isOff = hidden.has(id);
    const li = el('li', { class: `layout-row${isOff ? ' is-off' : ''}${moved === id ? ' is-moved' : ''}`, dataset: { id } },
      isOff ? null : el('span', { class: 'layout-num', 'aria-hidden': 'true' }, String(n)),
      el('span', { class: 'layout-name' }, el('strong', {}, name(id)), el('span', { class: 'small muted' }, INFO[id] || ''),
        WHEN.has(id) ? el('span', { class: 'layout-when' }, 'Solo cuando toca') : null),
      isOff
        ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { hidden.delete(id); order = [...order.filter((k) => k !== id), id]; moved = id; paint(); } }, icon('eye', { size: 16 }), 'Mostrar')
        : el('span', { class: 'layout-move' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Subir ${name(id)}`, disabled: n === 1, onClick: () => move(id, -1) }, icon('arrow-up', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Bajar ${name(id)}`, disabled: n === total, onClick: () => move(id, 1) }, icon('arrow-down', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Ocultar ${name(id)}`, onClick: () => { hidden.add(id); paint(); } }, icon('eye-off', { size: 16 }))));
    return li;
  };
  const paint = () => {
    const vis = order.filter((k) => !hidden.has(k)); const hid = order.filter((k) => hidden.has(k));
    shown.replaceChildren(...vis.map((id, i) => row(id, i + 1, vis.length)));
    off.replaceChildren(...hid.map((id) => row(id)));
    offHead.hidden = off.hidden = !hid.length;
    const m = moved && (shown.querySelector(`[data-id="${moved}"]`) || off.querySelector(`[data-id="${moved}"]`));
    m?.querySelector('button:not([disabled])')?.focus({ preventScroll: true }); moved = null;
  };
  paint();
  ui.openModal({ title: 'Personalizar Inicio', size: 'sm',
    body: el('div', { class: 'stack layout-editor' },
      el('p', { class: 'muted small' }, 'Ordena con las flechas y oculta lo que no uses. Puedes volver a mostrarlo cuando quieras.'),
      el('div', { class: 'layout-row is-fixed' }, el('span', { class: 'layout-num', 'aria-hidden': 'true' }, icon('lock', { size: 13 })),
        el('span', { class: 'layout-name' }, el('strong', {}, 'Días juntos y racha'), el('span', { class: 'small muted' }, 'Siempre va primero'))),
      shown, offHead, off),
    actions: [
      { label: 'Orden recomendado', variant: 'ghost', onClick: async () => { await db.setSettings('home', { layout: null }); ui.toast('Inicio volvió al orden recomendado.', { tone: 'success' }); onSaved?.(); return true; } },
      { label: 'Guardar', variant: 'primary', onClick: async () => { await db.setSettings('home', { layout: { v: LAYOUT_V, order, hidden: [...hidden] } }); ui.toast('Inicio quedó a tu gusto.', { tone: 'success' }); onSaved?.(); return true; } }],
  });
}
