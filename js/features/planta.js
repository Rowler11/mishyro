// Nuestro sakura (v0.14.0, option A chosen 2026-11-22): a bonsai that grows with them on Inicio.
// It grows a little each day they use the app together and more with what they do as a couple
// (letters, memories, dates, games, songs). Each one can water it once a day. Seven stages, from a
// seed to a tree in full bloom; Jorge the panda keeps it company. The watering log is shared
// (store 'streaks', id 'plant:water') so both phones see the same tree.
import { ui, util, db, profile } from '../core.js';
import { wire } from '../core/pets.js';
import { draw } from '../core/art.js';

const { el, icon } = util;
const ID = 'plant:water';
export const STAGES = [
  { at: 0, name: 'Semilla', text: 'Recién plantada. Riéguenla y cuídenla.' },
  { at: 6, name: 'Brote', text: 'Salió la primera hojita.' },
  { at: 18, name: 'Plantita', text: 'Ya tiene hojas y ganas de crecer.' },
  { at: 40, name: 'Arbolito', text: 'Su tronco ya se nota firme.' },
  { at: 75, name: 'Bonsái', text: 'Ramas con forma, como su historia.' },
  { at: 125, name: 'Primeras flores', text: 'Salieron las primeras flores de sakura.' },
  { at: 200, name: 'En plena flor', text: 'Florecido por todo lo que han hecho juntos.' },
];
// Points for what they do together (only what they write themselves counts).
const WEIGHTS = { letter: 3, memory: 2, event: 2, game: 1, song: 1, coupon: 1, diary: 1, water: 1 };

const own = (r) => r && !r.deleted && r.origin !== 'config' && r.origin !== 'seed';
const q = async (store, pred = own) => (await db.query(store).catch(() => [])).filter(pred);

export async function points() {
  const [letters, memories, events, games, songs, diary, coupons, water] = await Promise.all([
    q('content', (r) => own(r) && r.kind === 'letter'), q('memories'), q('events'), q('games'), q('songs'), q('diary'),
    q('content', (r) => own(r) && r.kind === 'coupon'), db.get('streaks', ID).catch(() => null)]);
  const days = water?.days || {};
  const waterings = Object.values(days).reduce((n, who) => n + (who?.length || 0), 0);
  const total = letters.length * WEIGHTS.letter + memories.length * WEIGHTS.memory + events.length * WEIGHTS.event + games.length * WEIGHTS.game
    + songs.length * WEIGHTS.song + coupons.length * WEIGHTS.coupon + diary.length * WEIGHTS.diary + waterings * WEIGHTS.water;
  return { total, days };
}
export const stageOf = (pts) => STAGES.reduce((k, s, i) => (pts >= s.at ? i : k), 0);

/** The bonsai drawing for a stage (0..6). Original SVG, origami-flat like the creatures. */
export function plantSvg(stage) {
  const NS = 'http://www.w3.org/2000/svg';
  const t = document.createElementNS(NS, 'svg');
  t.setAttribute('viewBox', '0 0 160 160'); t.setAttribute('class', `plant-art stage-${stage}`); t.setAttribute('aria-hidden', 'true');
  const pot = '<polygon points="44,124 116,124 106,152 54,152" fill="#B9705A"/><polygon points="80,124 116,124 106,152 80,152" fill="#A35F4B"/><rect x="38" y="118" width="84" height="9" rx="3" fill="#C98068"/><ellipse cx="80" cy="120" rx="34" ry="4" fill="#6B4A3A"/>';
  let body = '';
  if (stage === 0) body = '<ellipse cx="80" cy="116" rx="7" ry="4.5" fill="#8A5A3C"/><path d="M80 112 q2 -6 6 -7" stroke="#8DBF6A" stroke-width="2" fill="none" stroke-linecap="round"/>';
  if (stage === 1) body = '<path d="M80 118 V96" stroke="#7FA85C" stroke-width="3" stroke-linecap="round"/><path class="plant-leaf" d="M80 100 C70 92 64 96 62 100 C68 104 76 104 80 100Z" fill="#9CCB76"/><path class="plant-leaf" d="M80 96 C90 86 98 90 100 94 C94 99 86 100 80 96Z" fill="#8DBF6A"/>';
  if (stage >= 2) {
    const h = [0, 0, 70, 58, 48, 44, 40][stage];
    const trunk = stage <= 2 ? `<path d="M80 118 C78 104 82 92 80 ${h}" stroke="#7A5642" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : `<path d="M80 118 C72 104 90 92 78 80 C70 72 84 64 82 ${h}" stroke="#6E4B39" stroke-width="${stage >= 4 ? 9 : 7}" fill="none" stroke-linecap="round"/>
         <path d="M80 88 C94 84 104 78 112 70" stroke="#6E4B39" stroke-width="5" fill="none" stroke-linecap="round"/>
         <path d="M78 76 C66 72 56 66 48 60" stroke="#6E4B39" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    const clouds = stage <= 2 ? [[80, h, 22]] : stage === 3 ? [[82, h, 22], [112, 66, 16], [48, 58, 15]] : [[82, h, 26], [116, 64, 20], [44, 56, 19], [98, 44, 16], [62, 40, 15]];
    const leaf = (x, y, r) => `<ellipse class="plant-leaf" cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}" fill="#8DBF6A"/><ellipse cx="${x + r * 0.25}" cy="${y + r * 0.15}" rx="${r * 0.7}" ry="${r * 0.45}" fill="#7AAE58"/>`;
    const flowers = stage >= 5 ? clouds.flatMap(([x, y, r], i) => Array.from({ length: stage === 5 ? 3 : 6 }, (_, k) => {
      const a = (k / (stage === 5 ? 3 : 6)) * Math.PI * 2 + i; const fx = x + Math.cos(a) * r * 0.6; const fy = y + Math.sin(a) * r * 0.42;
      return `<g class="plant-flower" transform="translate(${fx.toFixed(1)} ${fy.toFixed(1)})">${[0, 72, 144, 216, 288].map((d) => `<ellipse rx="2.4" ry="4" cy="-3.4" transform="rotate(${d})" fill="#F7B6C8"/>`).join('')}<circle r="1.4" fill="#E0587E"/></g>`;
    })).join('') : '';
    body = trunk + clouds.map(([x, y, r]) => leaf(x, y, r)).join('') + flowers;
  }
  t.innerHTML = body + pot;
  return t;
}

/** Inicio card: the tree, its stage, how close the next one is, and "Regar hoy". */
export async function homeCard({ onChange } = {}) {
  const { total, days } = await points();
  const stage = stageOf(total);
  const cur = STAGES[stage]; const next = STAGES[stage + 1];
  const today = util.localDay();
  const me = profile.active();
  const watered = (days[today] || []).includes(me);
  const both = profile.PEOPLE.every((p) => (days[today] || []).includes(p));
  const fill = el('span', { class: 'guide-bar-fill' });
  fill.style.width = next ? `${Math.round(((total - cur.at) / (next.at - cur.at)) * 100)}%` : '100%';
  const pandaHost = wire(el('span', { class: 'plant-panda' }, draw('panda')), 'panda');
  const water = ui.button({ label: watered ? 'Ya la regaste hoy' : 'Regar hoy', iconName: 'droplet', small: true, variant: watered ? 'ghost' : 'primary', onClick: async () => {
    if (watered) return;
    const rec = (await db.get('streaks', ID).catch(() => null)) || { id: ID, type: 'plant', days: {}, visibility: 'shared', owner: 'both' };
    const d = { ...(rec.days || {}) }; d[today] = [...new Set([...(d[today] || []), me])];
    // Keep the log small: only the last 400 days.
    const keys = Object.keys(d).sort(); while (keys.length > 400) delete d[keys.shift()];
    await db.put('streaks', { ...rec, days: d }, { userEdit: false });
    card.classList.add('is-watering'); util.haptic([8, 40, 8]);
    setTimeout(() => onChange?.(), util.prefersReducedMotion() ? 0 : 1300);
  } });
  const card = el('section', { class: 'card paper-card plant-card', 'aria-labelledby': 'plant-title' },
    el('div', { class: 'plant-stage', 'data-bubble-root': '' }, plantSvg(stage), pandaHost, el('span', { class: 'plant-drops', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'))),
    el('div', { class: 'plant-text' },
      el('p', { class: 'card-kicker' }, 'Crece con ustedes'),
      el('h2', { class: 'card-title', id: 'plant-title' }, `Nuestro sakura · ${cur.name}`),
      el('p', { class: 'muted small' }, cur.text),
      el('span', { class: 'guide-bar', role: 'progressbar', 'aria-label': next ? `Camino a ${next.name}` : 'Florecido', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': fill.style.width.replace('%', '') }, fill),
      el('p', { class: 'small plant-next' }, next ? `Siguiente: ${next.name}. Crece con cartas, recuerdos, citas, juegos y si la riegan.` : '¡Está en plena flor! Sigan cuidándola.'),
      el('div', { class: 'card-actions' }, water, both ? el('span', { class: 'muted small' }, icon('heart', { size: 14 }), ' Hoy la regaron los dos') : null)));
  return card;
}
