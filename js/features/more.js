// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
// Group tabs on top (decided 2026-11-19, option C): pick a group and its cards show below, two per
// row with a one-line description. Switching is instant, nothing folds or unfolds.
// What is not built yet carries a "Pronto" pill. "Moment" sections are left out: they appear on Inicio when due.
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

// Remembers the chosen group on this device only (a convenience; safe to lose).
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
  const visible = GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => !s.moment) })).filter((g) => g.sections.length);
  const saved = readOpen();
  let current = visible.some((g) => g.id === saved) ? saved : visible[0].id;

  const panel = el('div', { class: 'more-panel', role: 'tabpanel' });
  const tabs = visible.map((g) => el('button', {
    class: 'more-tab', type: 'button', role: 'tab', id: `mt-${g.id}`, 'aria-controls': 'more-panel',
    onClick: () => select(g.id, { scroll: true }),
  }, g.title, el('span', { class: 'more-tab-count', 'aria-hidden': 'true' }, String(g.sections.length))));
  const list = el('div', { class: 'more-tabs', role: 'tablist', 'aria-label': 'Grupos' }, tabs);
  panel.id = 'more-panel';

  // Arrow keys move between groups (tabs pattern).
  list.addEventListener('keydown', (e) => {
    const i = visible.findIndex((g) => g.id === current);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: visible.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const g = visible[(next + visible.length) % visible.length];
    select(g.id, { scroll: true });
    tabs[visible.indexOf(g)].focus();
  });

  function select(id, { scroll = false } = {}) {
    current = id;
    saveOpen(id);
    const g = visible.find((x) => x.id === id);
    tabs.forEach((t, i) => {
      const on = visible[i].id === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `mt-${id}`);
    panel.replaceChildren(el('div', { class: 'section-cards more-cards' }, g.sections.map(card)));
    if (scroll) tabs[visible.indexOf(g)].scrollIntoView({ inline: 'center', block: 'nearest', behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  select(current);

  return el('section', { class: 'page page-wide' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    list, panel);
}
