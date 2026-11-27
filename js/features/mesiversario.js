// Mesiversario: "Rama que florece" (v0.39.0, Rowler chose it on 2026-11-27).
// The first time the app opens on a mesiversario, the screen dims like the Latido and an ink sakura
// branch opens one flower per month of the current year together; this month's flower glows, petals fall,
// and then the month's ritual and the surprise letter (one of their own reasons) appear. Once per day
// and device; nothing is sent anywhere. Reduced motion: everything is simply there.
import { util, profile } from '../core.js';
import * as stage from '../core/stage.js';

const { el } = util;
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

// Twelve places along the branch, from the trunk (bottom left) to the tip (top right).
export const SPOTS = [[42, 262], [78, 236], [104, 252], [124, 206], [158, 214], [176, 176], [204, 192], [214, 148], [246, 158], [250, 116], [278, 100], [292, 64]];

/** How many flowers this mesiversario shows (1..12, it starts again each year) and which year they are in. */
export function bloomOf(months) {
  const m = Math.max(1, Math.floor(months));
  return { flowers: ((m - 1) % 12) + 1, year: Math.floor((m - 1) / 12) + 1 };
}

function flower(x, y, r, cls) {
  const g = svg('g', { class: `mes-flower ${cls}`, transform: `translate(${x} ${y})` });
  const inner = svg('g', { class: 'mes-flower-in' });
  for (let i = 0; i < 5; i++) {
    const a = i * 72;
    inner.append(svg('path', { class: 'mes-petal', transform: `rotate(${a})`, d: `M0 0 C${-r * 0.55} ${-r * 0.35} ${-r * 0.6} ${-r * 0.95} ${-r * 0.18} ${-r * 1.02} L0 ${-r * 0.86} L${r * 0.18} ${-r * 1.02} C${r * 0.6} ${-r * 0.95} ${r * 0.55} ${-r * 0.35} 0 0Z` }));
  }
  inner.append(svg('circle', { class: 'mes-heart', r: (r * 0.22).toFixed(1) }));
  g.append(inner);
  return g;
}

function branch(flowers) {
  const s = svg('svg', { class: 'mes-branch', viewBox: '0 0 330 310', 'aria-hidden': 'true' });
  const ink = svg('filter', { id: 'mes-ink', x: '-5%', y: '-5%', width: '110%', height: '110%' });
  ink.append(svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '.05', numOctaves: '2', seed: '3' }), svg('feDisplacementMap', { in: 'SourceGraphic', scale: '5' }));
  const defs = svg('defs'); defs.append(ink);
  const wood = svg('g', { class: 'mes-wood', filter: 'url(#mes-ink)' });
  const dash = { pathLength: '100', 'stroke-dasharray': '100', 'stroke-dashoffset': '100' };
  wood.append(
    svg('path', { class: 'mes-limb', 'stroke-width': '9', d: 'M0 296 C40 276 70 252 104 232 S170 196 204 166 S262 102 300 52', ...dash }),
    svg('path', { class: 'mes-limb mes-twig', 'stroke-width': '4.5', d: 'M104 232 C114 244 126 250 140 252', ...dash }),
    svg('path', { class: 'mes-limb mes-twig', 'stroke-width': '4', d: 'M204 166 C214 180 226 190 240 194', ...dash }),
    svg('path', { class: 'mes-limb mes-twig', 'stroke-width': '3.5', d: 'M250 116 C238 104 230 96 226 84', ...dash }));
  s.append(defs, wood);
  SPOTS.forEach(([x, y], i) => {
    if (i < flowers) {
      const last = i === flowers - 1;
      const f = flower(x, y, last ? 24 : 14, last ? 'is-new' : '');
      f.style.setProperty('--d', `${900 + i * 170}ms`);
      s.append(f);
    } else {
      const bud = svg('circle', { class: 'mes-bud', cx: x, cy: y, r: '3.6' });
      bud.style.setProperty('--d', `${900 + i * 60}ms`);
      s.append(bud);
    }
  });
  return s;
}

/**
 * Plays the scene. ev: the 'monthly' event from Inicio ({ months, ritual }).
 * Resolves when it is closed.
 */
export async function play(ev, { reasons = [], receiver } = {}) {
  const months = ev.months || 1;
  const { flowers, year } = bloomOf(months);
  const art = el('div', { class: 'mes-art' }, branch(flowers));
  const reason = reasons.length ? profile.fill(String(reasons[Math.floor(Math.random() * reasons.length)].text || ''), receiver) : '';
  return new Promise((resolve) => {
    const st = stage.open({ label: `Feliz mesiversario: ${months === 1 ? '1 mes' : `${months} meses`} juntos`, art, tone: 'rose', onClose: resolve });
    st.layer.classList.add('mes-layer');
    st.glow(0.2);
    const count = el('p', { class: 'mes-count', 'aria-hidden': 'true' }, months === 1 ? '1 mes' : `${months} meses`);
    const ritual = ev.ritual ? el('div', { class: 'mes-tanzaku' }, el('span', { class: 'mes-tanzaku-k' }, 'Ritual de hoy'), el('span', {}, ev.ritual)) : null;
    const t = st.layer.querySelector('.stage-title');
    t.before(count);
    st.layer.querySelector('.stage-actions').before(...[ritual].filter(Boolean));
    const enter = el('button', { class: 'btn btn-primary', type: 'button' }, 'Entrar');
    enter.addEventListener('click', () => st.close());
    const letter = reason ? el('button', { class: 'btn btn-ghost', type: 'button' }, 'Carta sorpresa') : null;
    letter?.addEventListener('click', () => {
      const note = el('div', { class: 'mes-tanzaku mes-letter' }, el('span', { class: 'mes-tanzaku-k' }, 'Una razón para hoy'), el('span', {}, reason));
      (ritual || st.layer.querySelector('.stage-actions')).before(note);
      letter.remove(); util.haptic('love'); st.petals(8); enter.focus({ preventScroll: true });
    }, { once: true });
    const sub = year > 1 ? `Año ${year} juntos: una flor por cada mes de este año. La que brilla es la de hoy.` : 'Una flor por cada mes juntos. La que brilla es la de hoy.';
    // The branch draws itself, the flowers open one by one, the new one glows; then the words.
    (async () => {
      st.petals(6);
      await stage.wait(900 + flowers * 170 + 500);
      st.glow(0.75); st.sparks(16); util.haptic('love'); util.sound?.('chime');
      st.petals(20);
      await stage.wait(500);
      st.set('Feliz mesiversario', sub);
      st.layer.classList.add('is-said');
      st.actions(letter, enter);
      enter.focus({ preventScroll: true });
      await stage.wait(1400);
      st.glow(0.45);
    })();
  });
}
