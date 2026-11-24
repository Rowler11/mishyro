// Nuestro jardín (v0.14.0, option C chosen 2026-11-22): a little garden on Inicio that fills up with
// what they do together. Every letter, memory, date, game, song, coupon or diary page plants its own
// flower, and each one can also plant the flower they choose once a day ("que se pueda elegir").
// Jorge the panda keeps it company. The daily plantings are shared (store 'streaks', id 'garden').
import { ui, util, db, profile } from '../core.js';
import { wire } from '../core/pets.js';
import { draw } from '../core/art.js';

const { el, icon } = util;
const ID = 'garden';

/** Flower kinds: what plants each one on its own, and how it looks. */
export const FLOWERS = {
  sakura: { name: 'Sakura', from: 'Cada recuerdo' },
  lirio: { name: 'Lirio', from: 'Cada carta' },
  tulipan: { name: 'Tulipán', from: 'Cada cita' },
  margarita: { name: 'Margarita', from: 'Cada juego' },
  campanilla: { name: 'Campanilla', from: 'Cada canción' },
  girasol: { name: 'Girasol', from: 'Cada cupón' },
  violeta: { name: 'Violeta', from: 'Cada página del diario' },
};
export const MILESTONES = [
  { at: 0, name: 'Tierra lista', text: 'Planten la primera flor hoy.' },
  { at: 1, name: 'Primer brote', text: 'Ya salió la primera flor.' },
  { at: 10, name: 'Jardín que crece', text: 'Cada cosa que hacen juntos deja una flor.' },
  { at: 25, name: 'Jardín en flor', text: 'Ya se ve lleno de colores.' },
  { at: 50, name: 'Jardín de ensueño', text: 'Todo lo que han vivido, floreciendo.' },
  { at: 100, name: 'Jardín eterno', text: 'Cien flores. Qué bonito lo que han construido.' },
];
export const milestoneOf = (n) => MILESTONES.reduce((k, m, i) => (n >= m.at ? i : k), 0);

const own = (r) => r && !r.deleted && r.origin !== 'config' && r.origin !== 'seed';
const q = async (store, pred = own) => (await db.query(store).catch(() => [])).filter(pred);
const at = (r) => r.createdAt || r.updatedAt || '';

/** Every flower in the garden, oldest first: { key, kind, at }. */
export async function flowers() {
  const [content, memories, events, games, songs, diary, rec] = await Promise.all([
    q('content'), q('memories'), q('events'), q('games'), q('songs'), q('diary'), db.get('streaks', ID).catch(() => null)]);
  const list = [];
  const add = (rows, kind) => rows.forEach((r) => list.push({ key: r.id, kind, at: at(r) }));
  add(content.filter((r) => r.kind === 'letter'), 'lirio');
  add(content.filter((r) => r.kind === 'coupon'), 'girasol');
  add(memories, 'sakura'); add(events, 'tulipan'); add(games, 'margarita'); add(songs, 'campanilla'); add(diary, 'violeta');
  const days = rec?.days || {};
  for (const [day, who] of Object.entries(days)) {
    for (const [p, kind] of Object.entries(who || {})) if (FLOWERS[kind]) list.push({ key: `${day}:${p}`, kind, at: `${day}T12:00:00`, chosen: true });
  }
  list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { list, days };
}

// ---------- drawings (original SVG, origami-flat like the creatures) ----------
const petals = (n, petal, fill, extra = '') => Array.from({ length: n }, (_, k) => `<${petal} transform="rotate(${(360 / n) * k})" fill="${fill}"${extra}/>`).join('');
const HEADS = {
  sakura: () => `${petals(5, 'ellipse rx="3.2" ry="5" cy="-4.6"', '#F7B6C8')}<circle r="1.8" fill="#E0587E"/>`,
  lirio: () => `${petals(6, 'path d="M0 0 C3 -4 3 -10 0 -13 C-3 -10 -3 -4 0 0Z"', '#FFF6F8', ' stroke="#EFA3BA" stroke-width=".8"')}<circle r="1.6" fill="#E77F9C"/><circle cy="-3" r=".8" fill="#C9822F"/>`,
  tulipan: () => '<path d="M-6 -1 C-7 -10 -4 -14 -3 -12 L0 -15 L3 -12 C4 -14 7 -10 6 -1 C4 3 -4 3 -6 -1Z" fill="#E5566F"/><path d="M0 -15 L3 -12 C4 -14 7 -10 6 -1 C4 3 0 2 0 2Z" fill="#CC4560"/>',
  margarita: () => `${petals(8, 'ellipse rx="1.9" ry="4.6" cy="-4.2"', '#FFFFFF', ' stroke="#E6DED6" stroke-width=".5"')}<circle r="2.4" fill="#F2C14E"/>`,
  campanilla: () => '<path d="M-5 2 C-5 -6 -3 -9 0 -9 C3 -9 5 -6 5 2 L3 0 L1.5 2.6 L0 0 L-1.5 2.6 L-3 0Z" fill="#8FA8E8"/><path d="M0 -9 C3 -9 5 -6 5 2 L3 0 L1.5 2.6 L0 0Z" fill="#7891D6"/>',
  girasol: () => `${petals(12, 'ellipse rx="1.9" ry="4.4" cy="-5.4"', '#F5C33B')}<circle r="3.6" fill="#7A5232"/><circle r="1.6" fill="#5E3E25"/>`,
  violeta: () => `${petals(5, 'ellipse rx="3.4" ry="4.2" cy="-3.8"', '#A98BD6')}<circle r="1.5" fill="#F2C14E"/>`,
};
const STEM = '<path d="M0 0 Q1.4 -10 0 -20" stroke="#6FA552" stroke-width="1.7" fill="none" stroke-linecap="round"/><ellipse cx="3.4" cy="-8" rx="3.6" ry="1.6" transform="rotate(-30 3.4 -8)" fill="#8DBF6A"/>';
const flowerSvg = (kind, x, y, s, cls = '') => `<g class="garden-flower${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})">${STEM}<g transform="translate(0 -22)"><g class="garden-bloom">${HEADS[kind]()}</g></g></g>`;

/** A small drawing of one flower, for the picker and the legend. */
export function flowerIcon(kind, size = 34) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  t.setAttribute('viewBox', '-14 -38 28 40'); t.setAttribute('width', String(size)); t.setAttribute('height', String(size)); t.setAttribute('aria-hidden', 'true');
  t.innerHTML = flowerSvg(kind, 0, 0, 1);
  return t;
}

// 56 places in four rows, back rows smaller; filled in a fixed order so the garden grows evenly.
const ROWS = [[76, 0.72], [96, 0.86], [117, 1], [139, 1.15]];
const SLOTS = (() => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  ROWS.forEach(([y, s], r) => { for (let c = 0; c < 14; c++) out.push({ x: 18 + c * 22 + (r % 2 ? 10 : 0) + (rnd() - 0.5) * 6, y: y + (rnd() - 0.5) * 4, s }); });
  // The first flowers go near the front and the middle; later ones spread to the edges and the back.
  return out.map((o) => ({ o, k: Math.abs(o.x - 160) / 160 + (1 - o.s) * 1.4 + rnd() * 0.7 })).sort((a, b) => a.k - b.k).map((x) => x.o);
})();

// Scenery (v0.14.0, "más bonito"): sky with sun or moon and stars, Mount Fuji, drifting clouds, a stone
// lantern that lights up at night, grass tufts, and some life that comes with the flowers: butterflies
// by day, fireflies by night and sakura petals once a sakura has bloomed. Colors live in styles.css
// (.g-*) so the night theme can repaint them; the motion stops with "Reducir movimiento".
const SCENERY = `
  <g class="g-stars">${[[24, 12], [70, 8], [112, 20], [150, 10], [196, 16], [262, 8], [300, 22], [92, 34], [134, 40]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.8 : 1.2}"/>`).join('')}</g>
  <g class="g-sun"><circle cx="54" cy="28" r="13" class="g-sun-halo"/><circle cx="54" cy="28" r="8.5" class="g-sun-disc"/><circle cx="57.5" cy="25.5" r="7" class="g-moon-cut"/></g>
  <g class="g-cloud g-cloud-1"><ellipse cx="120" cy="22" rx="16" ry="5.5"/><ellipse cx="111" cy="19" rx="8" ry="6"/><ellipse cx="126" cy="17" rx="9" ry="6.5"/></g>
  <g class="g-cloud g-cloud-2"><ellipse cx="262" cy="36" rx="13" ry="4.5"/><ellipse cx="256" cy="33" rx="7" ry="5"/><ellipse cx="268" cy="32" rx="7.5" ry="5"/></g>
  <path class="g-fuji" d="M168 66 C196 50 214 34 228 25 C232 22 238 22 242 25 C256 34 274 50 304 66Z"/>
  <path class="g-snow" d="M228 25 C232 22 238 22 242 25 C246 28 250 31 253 34 L247 32 L243 36 L238 31 L233 36 L229 32 L221 35 C224 31 226 28 228 25Z"/>
  <path class="g-hill-far" d="M0 72 C40 60 90 64 130 66 C180 68 240 58 320 62 V150 H0Z"/>
  <path class="g-hill-near" d="M0 102 C70 92 140 100 200 95 C250 91 290 97 320 93 V150 H0Z"/>
  <g class="g-tufts">${[[10, 108], [64, 100], [122, 104], [176, 99], [236, 101], [290, 104], [36, 146], [150, 148], [262, 147]].map(([x, y]) => `<path d="M${x} ${y} l-2 -5 M${x} ${y} l0 -6 M${x} ${y} l2.4 -4.6"/>`).join('')}</g>
  <g class="g-lantern" transform="translate(16 78)">
    <ellipse cx="7" cy="24" rx="9" ry="2.2" class="g-shadow"/>
    <rect x="3" y="18" width="8" height="6" rx="1" class="g-stone"/><rect x="5.2" y="10" width="3.6" height="8" class="g-stone"/>
    <rect x="1.5" y="3.5" width="11" height="7" rx="1.2" class="g-stone"/><rect x="4.4" y="5" width="5.2" height="4" rx=".8" class="g-light"/>
    <path d="M-2 4 L7 -2 L16 4 Z" class="g-stone-dark"/><circle cx="7" cy="-3" r="1.4" class="g-stone-dark"/>
  </g>
  <ellipse cx="292" cy="140" rx="9" ry="4" class="g-rock"/><ellipse cx="300" cy="137" rx="5" ry="3" class="g-rock"/>`;
const BUTTERFLY = (x, y, c, k) => `<g class="g-fly g-fly-${k}" transform="translate(${x} ${y})"><g class="g-wings"><path d="M0 0 C-6 -7 -9 -2 -5 2 C-7 5 -2 6 0 1Z" fill="${c}"/><path d="M0 0 C6 -7 9 -2 5 2 C7 5 2 6 0 1Z" fill="${c}"/></g><path d="M0 -2 V3" stroke="#5A4A40" stroke-width=".9"/></g>`;
const FIREFLIES = `<g class="g-fireflies">${[[60, 84], [140, 72], [210, 88], [270, 76], [104, 96]].map(([x, y], i) => `<circle class="g-ff g-ff-${i}" cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>`;
const PETALS = `<g class="g-petals">${[[90, -6], [180, -10], [250, -4], [40, -14]].map(([x, y], i) => `<ellipse class="g-petal g-petal-${i}" cx="${x}" cy="${y}" rx="2" ry="1.2"/>`).join('')}</g>`;

/** The garden bed with its flowers (the newest 56 when there are more). */
export function gardenSvg(list, freshKey) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  t.setAttribute('viewBox', '0 0 320 150'); t.setAttribute('class', 'garden-art'); t.setAttribute('aria-hidden', 'true');
  const shown = list.slice(-SLOTS.length);
  const placed = shown.map((f, i) => ({ ...SLOTS[i], f })).sort((a, b) => a.y - b.y);
  const empty = shown.length ? '' : '<path d="M150 118 q4 -8 10 -9" stroke="#8DBF6A" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="156" cy="120" rx="8" ry="3" class="g-shadow"/>';
  const shadows = placed.map(({ x, y, s }) => `<ellipse class="g-shadow" cx="${x.toFixed(1)}" cy="${(y + 1).toFixed(1)}" rx="${(5 * s).toFixed(1)}" ry="${(1.4 * s).toFixed(1)}"/>`).join('');
  const life = (shown.length >= 5 ? BUTTERFLY(110, 70, '#F7B6C8', 1) : '') + (shown.length >= 15 ? BUTTERFLY(230, 64, '#F5C33B', 2) : '') + (shown.length >= 30 ? BUTTERFLY(170, 80, '#A9C4F0', 3) : '');
  const petals = shown.some((f) => f.kind === 'sakura') ? PETALS : '';
  t.innerHTML = SCENERY + empty + shadows + placed.map(({ x, y, s, f }) => flowerSvg(f.kind, x, y, s, f.key === freshKey ? ' is-new' : '')).join('') + petals + life + FIREFLIES;
  return t;
}

/** Inicio card: the garden, how many flowers it has, and "Plantar hoy" (each picks the flower). */
export async function homeCard({ onChange } = {}) {
  const { list, days } = await flowers();
  const n = list.length;
  const m = milestoneOf(n); const cur = MILESTONES[m]; const next = MILESTONES[m + 1];
  const today = util.localDay();
  const me = profile.active();
  const mine = days[today]?.[me];
  const both = profile.PEOPLE.every((p) => days[today]?.[p]);
  const fill = el('span', { class: 'guide-bar-fill' });
  const pct = next ? Math.round(((n - cur.at) / (next.at - cur.at)) * 100) : 100;
  fill.style.width = `${pct}%`;
  const pandaHost = wire(el('span', { class: 'garden-panda' }, draw('panda')), 'panda');
  const stage = el('div', { class: 'garden-stage', 'data-bubble-root': '' }, gardenSvg(list), pandaHost);
  import('./gatitos.js').then((m) => m.stroll(stage, 'jardin', { chance: 0.5 })).catch(() => {});

  const plant = async (kind) => {
    const rec = (await db.get('streaks', ID).catch(() => null)) || { id: ID, type: 'garden', days: {}, visibility: 'shared', owner: 'both' };
    const d = { ...(rec.days || {}) }; d[today] = { ...(d[today] || {}), [me]: kind };
    const keys = Object.keys(d).sort(); while (keys.length > 400) delete d[keys.shift()]; // keep the log small
    await db.put('streaks', { ...rec, days: d }, { userEdit: false });
    util.haptic([8, 40, 8]);
    const after = await flowers();
    stage.querySelector('.garden-art').replaceWith(gardenSvg(after.list, `${today}:${me}`));
    picker.hidden = true;
    ui.toast(`Plantaste un${kind === 'margarita' || kind === 'campanilla' || kind === 'violeta' ? 'a' : ''} ${FLOWERS[kind].name.toLowerCase()}.`);
    setTimeout(() => onChange?.(), util.prefersReducedMotion() ? 0 : 1400);
  };
  const picker = el('div', { class: 'garden-picker', role: 'group', 'aria-label': 'Elige la flor que plantas hoy', hidden: true },
    Object.entries(FLOWERS).map(([id, f]) => el('button', { class: 'garden-pick', type: 'button', onClick: () => plant(id) }, flowerIcon(id), el('span', {}, f.name))));
  const action = mine
    ? el('span', { class: 'muted small garden-done' }, flowerIcon(mine, 22), ` Hoy plantaste: ${FLOWERS[mine]?.name || 'una flor'}`)
    : ui.button({ label: 'Plantar hoy', iconName: 'flower-2', small: true, onClick: () => { picker.hidden = !picker.hidden; } });

  const legend = el('details', { class: 'garden-legend' }, el('summary', { class: 'small' }, '¿De dónde sale cada flor?'),
    el('ul', {}, Object.entries(FLOWERS).map(([id, f]) => el('li', { class: 'small' }, flowerIcon(id, 22), el('span', {}, el('strong', {}, f.name), `: ${f.from.toLowerCase()} o si la eligen al plantar.`)))));

  return el('section', { class: 'card paper-card garden-card', 'aria-labelledby': 'garden-title' },
    el('div', { class: 'garden-head' },
      el('div', {}, el('p', { class: 'card-kicker' }, 'Crece con ustedes'),
        el('h2', { class: 'card-title', id: 'garden-title' }, `Nuestro jardín · ${cur.name}`)),
      el('span', { class: 'guide-count' }, n === 1 ? '1 flor' : `${n} flores`)),
    stage,
    el('p', { class: 'muted small' }, cur.text),
    el('span', { class: 'guide-bar', role: 'progressbar', 'aria-label': next ? `Camino a ${next.name}` : 'Jardín completo', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, fill),
    el('p', { class: 'small garden-next' }, next ? `${next.at - n === 1 ? "Falta 1" : `Faltan ${next.at - n}`} para "${next.name}". Cada carta, recuerdo, cita, juego o canción planta una flor.` : 'Sigan llenándolo de flores.'),
    el('div', { class: 'card-actions' }, action, both ? el('span', { class: 'muted small' }, icon('heart', { size: 14 }), ' Hoy plantaron los dos') : null),
    picker, legend);
}
