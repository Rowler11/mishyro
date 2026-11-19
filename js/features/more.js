// "Más" hub (docs/05 Detalles de producto): every section grouped, one coherent navigation.
import { ui, util } from '../core.js';
import { GROUPS } from '../routes.js';

const { el, icon, ja } = util;

function sectionCard(s) {
  const soon = s.phase !== '1';
  return el('a', { class: 'card card-link section-card', href: `#/${s.id}` },
    el('span', { class: 'section-icon' }, icon(s.icon)),
    el('span', { class: 'section-text' },
      el('span', { class: 'section-title' }, s.title, s.jp ? ja(s.jp, s.romaji) : null),
      el('span', { class: 'section-blurb' }, s.blurb)),
    soon ? el('span', { class: 'badge', title: `Llega en la Fase ${s.phase}` }, `Fase ${s.phase}`) : el('span', { class: 'badge badge-ok' }, 'Lista'));
}

export function render() {
  const page = el('section', { class: 'page page-wide' },
    ui.pageHeader({ title: 'Más', jp: 'もっと', romaji: 'motto' }),
    el('div', { class: 'more-groups' }, GROUPS.map((g) => el('section', { class: 'more-group', 'aria-labelledby': `g-${g.id}` },
      el('h2', { class: 'group-title', id: `g-${g.id}` }, g.title, g.jp ? ja(g.jp, g.romaji) : null),
      ui.stagger(el('div', { class: 'section-grid' }, g.sections.map(sectionCard)))))));
  return page;
}
