// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
// Collapsible groups, one open at a time; the open group shows cards with a one-line description.
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
    const target = groups.find((x) => x.id === id);
    const before = target?.head.getBoundingClientRect().top;
    groups.forEach((g) => {
      const on = g.id === id;
      // A group closing above the one being opened folds at once, so the tapped header stays put.
      if (!on && target && g.box.classList.contains('open') && (g.box.compareDocumentPosition(target.box) & Node.DOCUMENT_POSITION_FOLLOWING)) g.box.classList.add('acc-instant');
      g.head.setAttribute('aria-expanded', String(on));
      g.box.classList.toggle('open', on);
      g.body.inert = !on;
    });
    if (focus && target) {
      const shift = target.head.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => groups.forEach((g) => g.box.classList.remove('acc-instant'))));
    saveOpen(id);
    if (!target || !focus) return;
    // Once open, bring its last cards into view if they ended up under the tab bar.
    const settle = (e) => {
      if (e.target !== target.body) return;
      target.body.removeEventListener('transitionend', settle);
      const r = target.box.getBoundingClientRect();
      const need = r.bottom - (innerHeight - 96);
      if (need > 0) window.scrollBy({ top: Math.min(need, r.top - 72), behavior: 'smooth' });
    };
    target.body.addEventListener('transitionend', settle);
  };

  const visible = GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => !s.moment) })).filter((g) => g.sections.length);
  const list = visible.map((g) => {
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
  setOpen(saved === '' ? null : (visible.some((g) => g.id === saved) ? saved : visible[0].id));

  return el('section', { class: 'page page-wide' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    ui.stagger(el('div', { class: 'more-groups' }, list)));
}
