// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
// Collapsible groups, one open at a time; the open group shows cards with a one-line description.
// What is not built yet carries a "Pronto" pill.
import { ui, util, CONFIG } from '../core.js';
import { GROUPS } from '../routes.js';

const { el, icon } = util;
const READY = new Set(['1', '2']);

// Short labels so the cards stay tidy. The full title goes to the tooltip.
const SHORT = {
  'Fechas especiales': 'Fechas', 'Racha e insignias': 'Insignias', 'Medidor de ánimo': 'Ánimo', 'Resumen del año': 'Resumen',
  'Próximo encuentro': 'Encuentro', 'Álbum "Nuestro año"': 'Nuestro año', 'Mapa de lugares': 'Mapa', 'Cápsula del tiempo': 'Cápsula del tiempo',
  'Preguntas y quiz': 'Preguntas', 'Lenguajes del amor': 'Lenguajes del amor', 'Gratitud y revisión': 'Gratitud', 'Planes juntos': 'Planes',
  'Sueños y viajes': 'Sueños y viajes', 'Sugerencias de citas': 'Ideas de citas', 'Regalos secretos': 'Regalos', 'Eventos de temporada': 'Temporadas',
  'Gastos compartidos': 'Gastos', 'Recetas y menú en casa': 'Recetas',
};

// Remembers the open group on this device only (a convenience; safe to lose).
const KEY = () => `${CONFIG.storageKey || 'aishiteru'}.moreOpen`;
const readOpen = () => { try { return localStorage.getItem(KEY()); } catch { return null; } };
const saveOpen = (id) => { try { localStorage.setItem(KEY(), id || ''); } catch { /* private mode */ } };

function card(s) {
  const soon = !READY.has(String(s.phase));
  return el('a', { class: 'card card-link section-card', href: `#/${s.id}`, title: soon ? `${s.title}: llega pronto` : s.title },
    el('span', { class: 'section-card-top' },
      el('span', { class: 'section-icon' }, icon(s.icon)),
      soon ? el('span', { class: 'badge soon-pill' }, 'Pronto') : null),
    el('span', { class: 'section-card-name' }, SHORT[s.title] || s.title),
    s.blurb ? el('span', { class: 'section-card-blurb' }, s.blurb) : null);
}

export function render() {
  const groups = [];
  const setOpen = (id, { focus = false } = {}) => {
    groups.forEach((g) => {
      const on = g.id === id;
      g.head.setAttribute('aria-expanded', String(on));
      g.box.classList.toggle('open', on);
      g.body.inert = !on;
    });
    saveOpen(id);
    const g = groups.find((x) => x.id === id);
    // Keep the opened group in view without jumping when it is already visible.
    if (g && focus) requestAnimationFrame(() => g.box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  const list = GROUPS.map((g) => {
    const head = el('button', {
      class: 'acc-head', type: 'button', id: `g-${g.id}`, 'aria-controls': `gb-${g.id}`, 'aria-expanded': 'false',
      onClick: () => setOpen(head.getAttribute('aria-expanded') === 'true' ? null : g.id, { focus: true }),
    },
      el('span', { class: 'acc-title' }, g.title),
      el('span', { class: 'acc-count', 'aria-label': `${g.sections.length} secciones` }, String(g.sections.length)),
      el('span', { class: 'acc-mini', 'aria-hidden': 'true' }, g.sections.slice(0, 4).map((s) => icon(s.icon))),
      icon('chevron-right', { cls: 'acc-chevron' }));
    const body = el('div', { class: 'acc-body', id: `gb-${g.id}`, role: 'region', 'aria-labelledby': `g-${g.id}` },
      el('div', { class: 'acc-inner' }, el('div', { class: 'section-cards' }, g.sections.map(card))));
    const box = el('section', { class: 'card more-acc' }, el('h2', { class: 'acc-h' }, head), body);
    groups.push({ id: g.id, head, body, box });
    return box;
  });

  const saved = readOpen();
  setOpen(saved === '' ? null : (GROUPS.some((g) => g.id === saved) ? saved : GROUPS[0].id));

  return el('section', { class: 'page page-wide' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    ui.stagger(el('div', { class: 'more-groups' }, list)));
}
