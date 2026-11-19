// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
// Compact grid (3 per row on phones): icon + short name; a dot marks what is not built yet.
import { ui, util } from '../core.js';
import { GROUPS } from '../routes.js';

const { el, icon } = util;
const READY = new Set(['1', '2']);

// Short labels so the tiles stay on one or two lines. The full title goes to the tooltip.
const SHORT = {
  'Fechas especiales': 'Fechas', 'Racha e insignias': 'Insignias', 'Medidor de ánimo': 'Ánimo', 'Resumen del año': 'Resumen',
  'Próximo encuentro': 'Encuentro', 'Álbum "Nuestro año"': 'Nuestro año', 'Mapa de lugares': 'Mapa', 'Cápsula del tiempo': 'Cápsula del tiempo',
  'Preguntas y quiz': 'Preguntas', 'Lenguajes del amor': 'Lenguajes del amor', 'Gratitud y revisión': 'Gratitud', 'Planes juntos': 'Planes',
  'Sueños y viajes': 'Sueños y viajes', 'Sugerencias de citas': 'Ideas de citas', 'Regalos secretos': 'Regalos', 'Eventos de temporada': 'Temporadas',
  'Gastos compartidos': 'Gastos', 'Recetas y menú en casa': 'Recetas',
};

function tile(s) {
  const soon = !READY.has(String(s.phase));
  return el('a', { class: 'card card-link section-tile', href: `#/${s.id}`, title: soon ? `${s.title}: llega pronto` : s.title },
    el('span', { class: 'section-icon' }, icon(s.icon)),
    el('span', { class: 'tile-name' }, SHORT[s.title] || s.title),
    soon ? el('span', { class: 'soon-dot' }, el('span', { class: 'sr-only' }, ', llega pronto')) : null);
}

export function render() {
  return el('section', { class: 'page page-wide' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    el('div', { class: 'more-groups' }, GROUPS.map((g) => el('section', { class: 'more-group', 'aria-labelledby': `g-${g.id}` },
      el('h2', { class: 'group-title', id: `g-${g.id}` }, g.title),
      ui.stagger(el('div', { class: 'tile-grid' }, g.sections.map(tile)))))),
    el('p', { class: 'muted small more-legend' }, el('span', { class: 'soon-dot inline', 'aria-hidden': 'true' }), ' Llega pronto'));
}
