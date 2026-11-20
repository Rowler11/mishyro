// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
// Shoji doors (decided 2026-11-19, option C "Puertas"): the 7 groups show at a glance as sliding
// doors, two per row. Tapping one slides its paper panels apart and opens the group's cards
// (route #/mas/<group>, so Atrás and "Volver" both go back to the doors, which slide shut).
// What is not built yet carries a "Pronto" pill. "Moment" sections are left out: they appear on Inicio when due.
import { ui, util, router } from '../core.js';
import { GROUPS } from '../routes.js';

const { el, icon } = util;
const READY = new Set(['1', '2']);
const OPEN_MS = 520; // the panels' slide (styles.css .door-panel)

// Short labels so the cards stay tidy. The full title goes to the tooltip.
const SHORT = {
  'Fechas especiales': 'Fechas', 'Racha e insignias': 'Insignias', 'Medidor de ánimo': 'Ánimo', 'Resumen del año': 'Resumen',
  'Próximo encuentro': 'Encuentro', 'Álbum "Nuestro año"': 'Nuestro año', 'Mapa de lugares': 'Mapa', 'Cápsula del tiempo': 'Cápsula del tiempo',
  'Preguntas y quiz': 'Preguntas', 'Lenguajes del amor': 'Lenguajes del amor', 'Gratitud y revisión': 'Gratitud', 'Planes juntos': 'Planes',
  'Sueños y viajes': 'Sueños y viajes', 'Sugerencias de citas': 'Ideas de citas', 'Regalos secretos': 'Regalos', 'Eventos de temporada': 'Temporadas',
  'Gastos compartidos': 'Gastos', 'Recetas y menú en casa': 'Recetas',
};
const GROUP_ICON = { nosotros: 'heart', recuerdos: 'image', juntos: 'heart-handshake', jugar: 'gamepad-2', hogar: 'house', personal: 'user-round', sistema: 'settings' };

// The door that was open, so coming back shows it sliding shut.
let lastOpen = null;

const count = (n) => `${n} ${n === 1 ? 'sección' : 'secciones'}`;
const visibleGroups = () => GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => !s.moment) })).filter((g) => g.sections.length);

function card(s, i) {
  const soon = !READY.has(String(s.phase));
  const a = el('a', { class: 'card card-link section-card door-card', href: `#/${s.id}`, title: soon ? `${s.title}: llega pronto` : s.title },
    el('span', { class: 'section-card-top' },
      el('span', { class: 'section-icon' }, icon(s.icon)),
      soon ? el('span', { class: 'badge soon-pill' }, 'Pronto') : null),
    el('span', { class: 'section-card-name' }, SHORT[s.title] || s.title),
    s.blurb ? el('span', { class: 'section-card-blurb' }, s.blurb) : null);
  a.style.setProperty('--i', String(i));
  return a;
}

function door(g, { open }) {
  const b = el('button', { class: `door${open ? ' is-open' : ''}`, type: 'button', 'data-group': g.id, 'aria-label': `${g.title}, ${count(g.sections.length)}` },
    el('span', { class: 'door-frame', 'aria-hidden': 'true' },
      el('span', { class: 'door-inside' }, icon(GROUP_ICON[g.id] || 'layout-grid', { size: 30 })),
      el('span', { class: 'door-panel door-panel-l' }),
      el('span', { class: 'door-panel door-panel-r' })),
    el('span', { class: 'door-icon', 'aria-hidden': 'true' }, icon(GROUP_ICON[g.id] || 'layout-grid', { size: 20 })),
    el('span', { class: 'door-label', 'aria-hidden': 'true' },
      el('span', { class: 'door-name' }, g.title),
      el('span', { class: 'door-count' }, count(g.sections.length)),
      el('span', { class: 'door-peek' }, g.sections.slice(0, 3).map((s) => icon(s.icon, { size: 14 })))));
  b.addEventListener('click', () => {
    if (b.classList.contains('is-open')) return;
    lastOpen = g.id;
    if (util.prefersReducedMotion()) { router.go(`/mas/${g.id}`); return; }
    b.classList.add('is-open');
    util.haptic(8);
    setTimeout(() => router.go(`/mas/${g.id}`), OPEN_MS);
  });
  return b;
}

function doorsView() {
  const closing = lastOpen;
  lastOpen = null;
  const doors = visibleGroups().map((g) => door(g, { open: g.id === closing && !util.prefersReducedMotion() }));
  const grid = el('div', { class: 'doors', role: 'group', 'aria-label': 'Grupos' }, doors);
  // Coming back: the door that was open slides shut and keeps the focus.
  const back = doors.find((d) => d.dataset.group === closing);
  if (back) {
    requestAnimationFrame(() => requestAnimationFrame(() => back.classList.remove('is-open')));
    setTimeout(() => back.focus({ preventScroll: true }), 60);
  }
  return grid;
}

function groupView(g) {
  lastOpen = g.id;
  const title = el('h2', { class: 'more-group-title', id: 'more-group-title' }, g.title);
  return el('section', { class: 'more-group', 'aria-labelledby': 'more-group-title' },
    el('div', { class: 'more-group-head' },
      el('button', { class: 'btn btn-ghost more-back', type: 'button', onClick: () => router.back('/mas') }, icon('chevron-left', { size: 20 }), 'Volver'),
      title),
    el('div', { class: 'section-cards more-cards' }, g.sections.map(card)));
}

export function render({ params } = {}) {
  const g = params?.a ? visibleGroups().find((x) => x.id === params.a) : null;
  return el('section', { class: 'page page-wide more' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    g ? groupView(g) : doorsView());
}
