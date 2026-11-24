// Nuestro jardín as its own screen (2026-11-24, Inicio "Sereno"): Inicio got lighter, so the garden
// left it and lives here, a tap away from Favoritos or Más. Same card and data as before (planta.js).
import { ui, util } from '../core.js';

const { el } = util;

export async function render() {
  const page = el('section', { class: 'page jardin' });
  page.append(ui.pageHeader({ title: 'Nuestro jardín', jp: '庭', romaji: 'niwa', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(2));
  page.append(body);
  const draw = async () => {
    const m = await import('./planta.js');
    body.replaceChildren(await m.homeCard({ onChange: draw }));
  };
  await draw();
  return { node: page };
}
