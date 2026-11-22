// Paper scene on top of each section of Más (v0.13.0, "Origami animado", chosen 2026-11-22):
// a short band with a couple of folded creatures, a crane or two and, in a few places, a lily for
// Sofía. Purely decorative (aria-hidden), no text, the same scene for every tab of a hub.
import { draw } from './art.js';
import { hubOf } from '../routes.js';

// [creatures left→right, crane colors, lily?, tone]
const SCENES = {
  calendario: [['rabbit'], ['#C9B8E8'], false, 'lilac'],
  galeria: [['cat', 'fox'], ['#F3B7C5'], true, 'pink'],
  'primeras-veces': [['rabbit', 'cat'], [], true, 'pink'],
  diario: [['cat'], ['#F3B7C5'], true, 'cream'],
  voz: [['rabbit'], ['#C9B8E8'], false, 'lilac'],
  preguntas: [['fox', 'rabbit'], [], false, 'cream'],
  gratitud: [['tanuki'], ['#F3B7C5'], true, 'pink'],
  retos: [['fox', 'tanuki'], ['#C9B8E8'], false, 'green'],
  canciones: [['cat'], ['#F3B7C5', '#C9B8E8'], false, 'lilac'],
  planes: [['fox', 'rabbit'], ['#F3B7C5', '#C9B8E8'], true, 'pink'],
  'modo-cita': [['fox', 'cat'], ['#F3B7C5'], true, 'pink'],
  regalos: [['tanuki'], ['#C9B8E8'], true, 'cream'],
  insignias: [['tanuki', 'fox'], [], false, 'cream'],
  animo: [['rabbit'], [], true, 'lilac'],
  mascotas: [['cat'], [], false, 'cream'],
  alcancia: [['tanuki'], ['#F3B7C5'], false, 'green'],
  listas: [['rabbit', 'tanuki'], [], false, 'cream'],
  recetas: [['fox'], ['#F3B7C5'], false, 'cream'],
  jibun: [['cat'], ['#C9B8E8'], true, 'lilac'],
  encuentro: [['fox', 'cat'], ['#F3B7C5', '#C9B8E8'], false, 'pink'],
};

/** The scene for a route id (a hub's tabs share the hub's scene), or null where there is none. */
export function scene(id) {
  const key = hubOf(id)?.id || id;
  const s = SCENES[key];
  if (!s) return null;
  const [creatures, cranes, lily, tone] = s;
  const band = document.createElement('div');
  band.className = `paper-scene tone-${tone}`;
  band.setAttribute('aria-hidden', 'true');
  creatures.forEach((c, i) => { const w = document.createElement('span'); w.className = `ps-creature ps-c${i}`; w.append(draw(c)); band.append(w); });
  cranes.forEach((col, i) => { const w = document.createElement('span'); w.className = `ps-crane ps-k${i}`; w.append(draw('crane', col)); band.append(w); });
  if (lily) { const w = document.createElement('span'); w.className = 'ps-lily'; w.append(draw('lily')); band.append(w); }
  for (let i = 0; i < 5; i++) { const p = document.createElement('span'); p.className = `ps-petal ps-p${i}`; band.append(p); }
  return band;
}
