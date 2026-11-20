// Shared engine of the Juegos en pareja (docs/05 §34 and "Pases y castigos", docs/02 game motion):
// the game list, banks without repetition, a play session (score, free passes, penalties by level,
// optional drink mode with cap, water reminder and a non-alcohol alternative), and the visual pieces
// every game uses: scoreboard with rolling digits, ring timer, card stage (deal, 3D flip, swipe),
// inertial wheel, hold-to-see secret, intro, pass stamp, penalty card and the result screen.
// One phone passed hand to hand (decided 2026-11-20).
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

// ---------- catalogue ----------
export const MOODS = [
  { value: 'tranquilos', label: 'Tranquilos' }, { value: 'risas', label: 'Risas' },
  { value: 'competencia', label: 'Competencia' }, { value: 'diferente', label: 'Algo diferente' },
];
export const DURATIONS = [5, 15, 30];
export const LEVELS = [{ value: 'suave', label: 'Suave' }, { value: 'divertido', label: 'Divertido' }, { value: 'intenso', label: 'Intenso' }];

// ready: built in Fase 5A. The rest show "Pronto" in the game room (Fase 5B).
export const GAME_LIST = [
  { id: 'ruleta', title: 'Ruleta de la noche', icon: 'loader-pinwheel', moods: ['tranquilos', 'diferente'], mins: [5], blurb: 'Decide la cena, el plan o quién elige.', ready: true },
  { id: 'mimica', title: 'Mímica', icon: 'drama', moods: ['risas', 'competencia'], mins: [5, 15, 30], blurb: 'Actúa la palabra sin hablar.', ready: true },
  { id: 'probable', title: '¿Quién es más probable…?', icon: 'pointer', moods: ['risas', 'tranquilos'], mins: [5, 15], blurb: 'A la de tres, se señalan.', ready: true },
  { id: 'estooaquello', title: 'Esto o aquello', icon: 'arrow-left-right', moods: ['risas', 'tranquilos'], mins: [5, 15], blurb: 'Rápido: ¿en qué coinciden?', ready: true },
  { id: 'yonunca', title: 'Yo nunca', icon: 'hand', moods: ['risas', 'diferente'], mins: [5, 15, 30], blurb: 'Frases para conocerse más.', ready: true },
  { id: 'dibujo', title: 'Dibuja y adivina', icon: 'brush', moods: ['risas', 'competencia'], mins: [15, 30], blurb: 'Uno dibuja y el otro adivina.', ready: true },
  { id: 'memoria', title: 'Memoria de nosotros', icon: 'brain', moods: ['tranquilos', 'competencia'], mins: [5, 15], blurb: 'Pares con sus propias fotos.', ready: true },
  { id: 'trivia', title: 'Trivia de nosotros', icon: 'lightbulb', moods: ['competencia', 'tranquilos'], mins: [5, 15], blurb: 'Preguntas sobre su historia.', ready: true },
  { id: 'cancion', title: 'Adivina la canción', icon: 'mic-vocal', moods: ['risas', 'competencia'], mins: [5, 15, 30], blurb: 'Tararea y que te adivinen.', ready: true },
  { id: 'cuentos', title: 'Cuentos a dos voces', icon: 'book-text', moods: ['tranquilos', 'diferente'], mins: [5, 15], blurb: 'Una historia inventada por turnos.', ready: true },
  { id: 'liga', title: 'Liga de pareja', icon: 'trophy', moods: ['competencia'], mins: [5, 15, 30], blurb: 'El marcador de sus juegos reales.', ready: true },
  { id: 'juntos', title: 'Modo juntos', icon: 'leaf', moods: ['tranquilos', 'diferente'], mins: [15, 30], blurb: 'Teléfonos boca abajo, tiempo de verdad.', ready: true },
  { id: 'recuerdo', title: 'Adivina el recuerdo', icon: 'image', moods: ['tranquilos', 'competencia'], mins: [5, 15], blurb: 'Una foto que se revela poco a poco.' },
  { id: 'tesoro', title: 'Búsqueda del tesoro', icon: 'map', moods: ['diferente'], mins: [30], blurb: 'Pistas escondidas en casa.' },
  { id: 'cata', title: 'Cata a ciegas', icon: 'candy', moods: ['diferente', 'risas'], mins: [15, 30], blurb: 'Snacks y bebidas con puntaje.' },
  { id: 'cocina', title: 'Reto de cocina', icon: 'chef-hat', moods: ['diferente', 'competencia'], mins: [30], blurb: 'Ruleta de recetas y votación.' },
  { id: 'bingo', title: 'Bingo de citas', icon: 'grid-3x3', moods: ['diferente'], mins: [30], blurb: 'Un cartón de planes para el mes.' },
  { id: 'misteriosa', title: 'Cita misteriosa', icon: 'mail', moods: ['diferente'], mins: [30], blurb: 'Sobres que se abren paso a paso.' },
  { id: 'reto30', title: 'Desafío de 30 días', icon: 'calendar', moods: ['tranquilos'], mins: [5], blurb: 'Un mini reto de pareja al día.' },
  { id: 'cine', title: 'Noche de cine', icon: 'film', moods: ['tranquilos'], mins: [5], blurb: 'Lo que quieren ver juntos.' },
  { id: 'origami', title: 'Origami', icon: 'jp-tsuru', moods: ['tranquilos', 'diferente'], mins: [15, 30], blurb: 'Grullas, corazones y senbazuru.' },
  { id: 'tanabata', title: 'Tanabata', icon: 'sparkles', moods: ['tranquilos'], mins: [5, 15], blurb: 'Deseos colgados en el bambú.' },
  { id: 'kotoba', title: 'Palabra del día', icon: 'languages', moods: ['tranquilos'], mins: [5], blurb: 'Japonés para el viaje.' },
  { id: 'manga', title: 'Nuestro manga', icon: 'book-open', moods: ['diferente'], mins: [30], blurb: 'Viñetas con sus fotos.' },
  { id: 'postales', title: 'Postales para imprimir', icon: 'printer', moods: ['diferente'], mins: [15], blurb: 'Para entregar en mano.' },
];
export const gameById = (id) => GAME_LIST.find((g) => g.id === id);

// ---------- pure helpers (unit-tested) ----------
export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Next item never repeated until the bank runs out. Returns { item, used, reset }. */
export function nextFromBank(items, used = [], rnd = Math.random) {
  if (!items.length) return { item: null, used, reset: false };
  const seen = new Set(used);
  let pool = items.filter((i) => !seen.has(i.id));
  let reset = false;
  if (!pool.length) { pool = items; used = []; reset = true; }
  const item = pool[Math.floor(rnd() * pool.length) % pool.length];
  return { item, used: [...used, item.id], reset };
}

/** 'sofia' | 'david' | null on a tie. */
export function winnerOf(score) {
  const [a, b] = profile.PEOPLE;
  if ((score[a] || 0) === (score[b] || 0)) return null;
  return (score[a] || 0) > (score[b] || 0) ? a : b;
}

/** Free while the player has passes left; from then on each skip draws a penalty. */
export const passOutcome = (usedSoFar, allowed) => (usedSoFar < allowed ? 'free' : 'penalty');

/** A drink penalty only in drink mode and under the cap. */
export const drinkAllowed = ({ drink, drinks = 0, cap = 3 }) => !!drink && drinks < cap;

/**
 * Final rotation (degrees, clockwise) so segment `index` of `n` stops under the pointer at the top,
 * after at least `turns` full turns from `current`. `offset` (0-1) lands inside the segment.
 */
export function wheelTarget(n, index, current = 0, turns = 5, offset = 0.5) {
  const seg = 360 / n;
  const want = (360 - (index + offset) * seg) % 360; // segment centre at 0° (top)
  const base = current - (current % 360);
  let target = base + turns * 360 + want;
  if (target - current < turns * 360) target += 360;
  return target;
}
/** Segment under the pointer for a rotation. */
export const wheelIndexAt = (n, rotation) => Math.floor((((360 - (rotation % 360)) % 360) / (360 / n))) % n;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** 'yes' (both 18+), 'no' (someone is under 18) or 'unknown' (a birth date is missing). */
export function adultsStatus(births, today = new Date()) {
  let unknown = false;
  for (const b of births) {
    const d = b ? util.parseDay(String(b).slice(0, 10)) : null;
    if (!d) { unknown = true; continue; }
    if (util.ageOn(d, today) < 18) return 'no';
  }
  return unknown ? 'unknown' : 'yes';
}

// ---------- data ----------
export async function settings() {
  return { ...(CONFIG.games?.defaults || {}), ...(await db.getSettings('games', {})) };
}
export const saveSettings = (patch) => db.setSettings('games', patch);

/** Items of a bank (editable copy in the store; CONFIG as a fallback). */
export async function bankItems(bank) {
  const kind = `game:${bank}`;
  const recs = (await db.query('content', { index: 'kind', range: IDBKeyRange.only(kind) }).catch(() => [])).filter((r) => !r.deleted && !r.hidden);
  return recs.length ? recs : (CONFIG.games?.banks?.[bank] || []);
}

/** Draw from a bank without repeating across games (and across both phones, the state syncs). */
export async function draw(gameId, items, { rnd } = {}) {
  const id = `gs:${gameId}`;
  const st = (await db.get('gameState', id).catch(() => null)) || { id, gameId, usedItemIds: [], favorites: [], neverAgain: [], visibility: 'shared', owner: 'both' };
  const pool = items.filter((i) => !(st.neverAgain || []).includes(i.id));
  const r = nextFromBank(pool.length ? pool : items, (st.usedItemIds || []).filter((u) => items.some((i) => i.id === u)), rnd);
  if (r.reset) ui.toast('Ya salieron todas: empezamos el banco de nuevo.');
  await db.put('gameState', { ...st, usedItemIds: r.used }, { userEdit: false });
  return r.item;
}

/** Birth dates of both, from Fechas especiales (birthdays linked to a person). */
async function births() {
  const dates = (await db.query('specialDates').catch(() => [])).filter((d) => !d.deleted && d.kind === 'birthday');
  return profile.PEOPLE.map((p) => {
    const d = dates.find((x) => x.personOrPetId === p);
    const v = d?.date;
    return typeof v === 'string' ? v : v?.y ? `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}` : '';
  });
}
export const adults = async () => adultsStatus(await births());

// ---------- sound and touch (optional, off by default) ----------
const soundOn = () => document.documentElement.dataset.sound === 'on';
let actx = null;
function beep(freq = 880, dur = 0.06, vol = 0.05, type = 'sine') {
  if (!soundOn()) return;
  try {
    actx = actx || new AudioContext();
    const t = actx.currentTime; const o = actx.createOscillator(); const g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no audio */ }
}
export const tick = () => beep(1400, 0.025, 0.03, 'square');
/** Short drum roll for the penalty card. */
export function drum() { if (!soundOn()) return; for (let i = 0; i < 10; i++) setTimeout(() => beep(110 + (i % 2) * 12, 0.05, 0.08, 'triangle'), i * 45); }
export const ding = () => beep(1320, 0.4, 0.06);

// ---------- session ----------
/**
 * One play session. opts: { gameId, level, drink, passes, drinkCap, waterEvery, refusePoints, first }.
 * Penalties and drinks are tracked per player; save() writes the history record.
 */
export function createSession(opts) {
  const s = {
    ...opts,
    startedAt: util.nowISO(),
    order: opts.first === profile.PEOPLE[1] ? [profile.PEOPLE[1], profile.PEOPLE[0]] : [...profile.PEOPLE],
    score: Object.fromEntries(profile.PEOPLE.map((p) => [p, 0])),
    passesUsed: Object.fromEntries(profile.PEOPLE.map((p) => [p, 0])),
    drinks: Object.fromEntries(profile.PEOPLE.map((p) => [p, 0])),
    penalties: [], rounds: 0, turnIndex: 0, listeners: new Set(),
  };
  s.turn = () => s.order[s.turnIndex % 2];
  s.other = () => s.order[(s.turnIndex + 1) % 2];
  s.emit = () => s.listeners.forEach((fn) => fn(s));
  s.onChange = (fn) => { s.listeners.add(fn); return () => s.listeners.delete(fn); };
  s.add = (p, n = 1) => { s.score[p] = (s.score[p] || 0) + n; s.emit(); };
  s.next = () => { s.turnIndex++; s.emit(); };
  s.freeLeft = (p) => Math.max(0, (s.passes ?? 1) - s.passesUsed[p]);
  /** End of a round: water reminder in drink mode. */
  s.round = () => {
    s.rounds++;
    if (s.drink && s.waterEvery && s.rounds % s.waterEvery === 0) ui.toast('Pausa de agua: un vaso para cada uno.', { tone: 'info' });
  };
  /** Skip the current card. Resolves with 'free' | 'done' | 'changed' | 'stopped' | 'alt'. */
  s.pass = async (p = s.turn()) => {
    const out = passOutcome(s.passesUsed[p], s.passes ?? 1);
    s.passesUsed[p]++;
    if (out === 'free') { await passStamp(p); s.emit(); return 'free'; }
    const r = await penaltyCard(s, p);
    s.emit();
    return r;
  };
  s.save = async (extra = {}) => {
    const rec = {
      id: util.uuid(), gameId: s.gameId, startedAt: s.startedAt, endedAt: util.nowISO(), players: [...profile.PEOPLE],
      score: { ...s.score }, passesUsed: { ...s.passesUsed }, penalties: s.penalties.slice(), level: s.level,
      drinkMode: !!s.drink, drinksCount: { ...s.drinks }, winner: winnerOf(s.score), rounds: s.rounds,
      visibility: 'shared', owner: 'both', by: profile.active(), ...extra,
    };
    await db.put('games', rec);
    import('./insignias.js').then((m) => m.evaluate?.()).catch(() => {});
    return rec;
  };
  return s;
}

// ---------- pass stamp and penalty card ----------
function overlayLayer(cls) {
  const n = el('div', { class: `game-overlay ${cls}`, 'aria-hidden': 'true' });
  document.body.append(n);
  return n;
}

async function passStamp(p) {
  ui.announce(`Pase libre de ${profile.name(p)}.`);
  util.haptic([10, 30, 10]);
  if (util.prefersReducedMotion()) { ui.toast(`Pase libre de ${profile.name(p)}.`); return; }
  const layer = overlayLayer('pass-layer');
  add(layer, el('div', { class: 'pass-stamp' }, el('span', { class: 'pass-stamp-kanji' }, icon('circle-check', { size: 36 })), el('span', {}, 'Pase libre')));
  beep(520, 0.12, 0.08, 'triangle');
  await util.sleep(950);
  layer.remove();
}

/** Draw a penalty that fits the level (and drink mode). */
async function pickPenalty(s, p) {
  const level = s.level || 'divertido';
  const useDrink = drinkAllowed({ drink: s.drink, drinks: s.drinks[p], cap: s.drinkCap ?? 3 }) && Math.random() < 0.4;
  if (useDrink) {
    const items = await bankItems('castigos-bebida');
    if (items.length) return { ...(await draw('castigos-bebida', items)), drink: true };
  }
  const items = await bankItems(`castigos-${level}`);
  const item = await draw(`castigos-${level}`, items);
  return item ? { ...item, drink: false } : { id: 'none', text: 'Dale un abrazo a tu pareja.', drink: false };
}

function penaltyCard(s, p) {
  return new Promise(async (resolve) => {
    let item = await pickPenalty(s, p);
    let usingAlt = false;
    const capReached = () => s.drink && s.drinks[p] >= (s.drinkCap ?? 3);
    const textNode = el('p', { class: 'penalty-text' });
    const note = el('p', { class: 'muted small penalty-note' });
    const altBtn = ui.button({ label: 'Sin alcohol', iconName: 'droplet', variant: 'ghost', small: true, onClick: () => { usingAlt = true; paint(); } });
    const paint = () => {
      if (item.drink && capReached()) usingAlt = true;
      textNode.textContent = item.drink && usingAlt ? item.alt : item.text;
      note.textContent = item.drink ? (capReached() ? 'Llegaste al tope de bebidas: va la alternativa sin alcohol.' : usingAlt ? 'Alternativa sin alcohol.' : 'Siempre puedes elegir la alternativa sin alcohol.') : '';
      altBtn.hidden = !item.drink || usingAlt;
    };
    paint();
    const card = el('div', { class: 'penalty-card' }, el('span', { class: 'penalty-kicker' }, `Castigo para ${profile.name(p)}`), textNode, note);
    const finish = (outcome, cost = 0) => {
      if (cost) s.add(p, -cost);
      if (outcome === 'done' && item.drink && !usingAlt) s.drinks[p]++;
      s.penalties.push({ by: p, text: textNode.textContent, outcome: outcome === 'done' && usingAlt ? 'alt' : outcome, at: util.nowISO() });
      m.close();
      resolve(outcome === 'done' && usingAlt ? 'alt' : outcome);
    };
    const cost = s.refusePoints ?? 1;
    const m = ui.openModal({
      title: 'Carta de castigo', size: 'sm', className: 'penalty-modal', dismissible: false,
      body: el('div', { class: 'stack center-col' }, card, altBtn,
        el('p', { class: 'muted small' }, `"Cambiar" o "Parar" solo cuesta ${cost} ${cost === 1 ? 'punto' : 'puntos'}. Nadie tiene que hacer algo que no quiera.`)),
      actions: [
        { label: 'Parar', variant: 'ghost', onClick: () => { finish('stopped', cost); return false; } },
        { label: 'Cambiar', variant: 'secondary', onClick: async () => { s.add(p, -cost); s.penalties.push({ by: p, text: textNode.textContent, outcome: 'changed', at: util.nowISO() }); item = await pickPenalty(s, p); usingAlt = false; paint(); card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in'); drum(); return false; } },
        { label: 'Cumplido', variant: 'primary', onClick: () => { finish('done'); return false; } },
      ],
    });
    requestAnimationFrame(() => card.classList.add('is-in'));
    drum(); util.haptic([20, 40, 20]);
    ui.announce(`Castigo para ${profile.name(p)}: ${textNode.textContent}`);
  });
}

// ---------- scoreboard (rolling digits) ----------
function roller(value) {
  const str = String(value);
  return el('span', { class: 'roller', 'aria-hidden': 'true' }, [...str].map((ch) => (/\d/.test(ch)
    ? el('span', { class: 'roller-digit' }, el('span', { class: 'roller-col', style: { transform: `translateY(-${Number(ch) * 10}%)` } }, Array.from({ length: 10 }, (_, i) => el('span', {}, String(i)))))
    : el('span', { class: 'roller-sign' }, ch))));
}

export function scoreboard(s, { showTurn = true, label = 'Marcador' } = {}) {
  const node = el('div', { class: 'scoreboard', role: 'group', 'aria-label': label });
  const live = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  const paint = () => {
    put(node, ...profile.PEOPLE.map((p) => el('div', { class: `score-cell${showTurn && s.turn() === p ? ' is-turn' : ''}`, dataset: { who: p } },
      el('span', { class: 'score-avatar', 'aria-hidden': 'true' }, (profile.name(p) || '?').slice(0, 1)),
      el('span', { class: 'score-name' }, profile.name(p)),
      roller(s.score[p]),
      el('span', { class: 'sr-only' }, `${s.score[p]} ${Math.abs(s.score[p]) === 1 ? 'punto' : 'puntos'}`),
      showTurn && s.turn() === p ? el('span', { class: 'score-turn' }, 'Tu turno') : null)), live);
    live.textContent = profile.PEOPLE.map((p) => `${profile.name(p)} ${s.score[p]}`).join(', ');
  };
  paint();
  // Roll from the previous value: paint at once, then let the transition run.
  const off = s.onChange(() => requestAnimationFrame(paint));
  node.cleanup = off;
  return node;
}

// ---------- ring timer ----------
/** Ring timer. Returns { node, start, pause, reset, left, running }. Uses an end time, so it survives a sleeping screen. */
export function timer({ seconds = 60, onEnd, label = 'Tiempo' } = {}) {
  const R = 44; const C = 2 * Math.PI * R;
  const ring = svg('circle', { cx: 50, cy: 50, r: R, class: 'timer-ring', 'stroke-dasharray': C, 'stroke-dashoffset': 0 });
  const box = svg('svg', { viewBox: '0 0 100 100', class: 'timer-svg', 'aria-hidden': 'true' });
  add(box, svg('circle', { cx: 50, cy: 50, r: R, class: 'timer-track' }), ring);
  const num = el('span', { class: 'timer-num' });
  const node = el('div', { class: 'timer', role: 'timer', 'aria-label': label }, box, num);
  let total = seconds; let remaining = seconds * 1000; let endAt = 0; let raf = 0; let lastWhole = null;
  const fmt = (ms) => { const t = Math.ceil(ms / 1000); return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : String(t); };
  const draw = () => {
    const ms = endAt ? Math.max(0, endAt - Date.now()) : remaining;
    num.textContent = fmt(ms);
    ring.setAttribute('stroke-dashoffset', String(C * (1 - ms / (total * 1000))));
    node.classList.toggle('is-ending', ms <= Math.max(5000, total * 200));
    const whole = Math.ceil(ms / 1000);
    if (endAt && whole !== lastWhole) { lastWhole = whole; if (whole <= 5 && whole > 0) { tick(); util.haptic(5); } if (whole === 10) ui.announce('Quedan 10 segundos.'); }
    return ms;
  };
  const loop = () => {
    const ms = draw();
    if (ms <= 0) { endAt = 0; remaining = 0; node.classList.add('is-done'); ding(); util.haptic([30, 60, 30]); ui.announce('¡Tiempo!'); onEnd?.(); return; }
    raf = requestAnimationFrame(loop);
  };
  const api = {
    node,
    start() { if (endAt || remaining <= 0) return; endAt = Date.now() + remaining; node.classList.remove('is-done'); loop(); },
    pause() { if (!endAt) return; remaining = Math.max(0, endAt - Date.now()); endAt = 0; cancelAnimationFrame(raf); draw(); },
    reset(s = total) { cancelAnimationFrame(raf); total = s; remaining = s * 1000; endAt = 0; lastWhole = null; node.classList.remove('is-done', 'is-ending'); draw(); },
    left: () => (endAt ? Math.max(0, endAt - Date.now()) : remaining),
    get running() { return !!endAt; },
    stop() { cancelAnimationFrame(raf); endAt = 0; },
  };
  draw();
  return api;
}

// ---------- card stage ----------
const cardBack = () => el('div', { class: 'gcard-face gcard-back', 'aria-hidden': 'true' }, el('span', { class: 'gcard-seal' }, icon('jp-sakura', { size: 40 })));

/**
 * A pile where one card at a time is dealt and flipped. show(front) deals a new card.
 * Swiping it (or the arrow keys) calls onSwipe(dir). Returns { node, show, flip }.
 */
export function cardStage({ onSwipe, swipe = true, label = 'Carta' } = {}) {
  const stage = el('div', { class: 'gcard-stage', tabindex: swipe ? '0' : '-1', role: 'region', 'aria-label': label });
  const pile = el('div', { class: 'gcard-pile', 'aria-hidden': 'true' }, el('span'), el('span'));
  add(stage, pile);
  let current = null;
  const show = (front, { faceDown = false } = {}) => {
    const old = current;
    if (old) { old.classList.add('is-leaving'); setTimeout(() => old.remove(), 360); }
    const inner = el('div', { class: 'gcard-inner' }, cardBack(), el('div', { class: 'gcard-face gcard-front' }, front));
    const card = el('div', { class: 'gcard is-dealing', 'aria-live': 'polite' }, inner);
    add(stage, card); current = card;
    requestAnimationFrame(() => requestAnimationFrame(() => { card.classList.remove('is-dealing'); if (!faceDown) setTimeout(() => card.classList.add('is-flipped'), util.prefersReducedMotion() ? 0 : 180); }));
    if (swipe) attachSwipe(card);
    return card;
  };
  const flip = (on = true) => current?.classList.toggle('is-flipped', on);
  const attachSwipe = (card) => {
    let x0 = null; let dx = 0;
    card.addEventListener('pointerdown', (e) => { if (e.target.closest('button,input,a')) return; x0 = e.clientX; dx = 0; card.setPointerCapture?.(e.pointerId); card.classList.add('is-dragging'); });
    card.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; });
    const up = () => {
      if (x0 == null) return; x0 = null; card.classList.remove('is-dragging');
      if (Math.abs(dx) > 90) { card.style.transform = `translateX(${dx > 0 ? 140 : -140}%) rotate(${dx > 0 ? 24 : -24}deg)`; card.classList.add('is-flung'); onSwipe?.(dx > 0 ? 'right' : 'left'); } else card.style.transform = '';
    };
    card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
  };
  stage.addEventListener('keydown', (e) => { if (!swipe) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onSwipe?.(e.key === 'ArrowRight' ? 'right' : 'left'); } });
  return { node: stage, show, flip };
}

// ---------- hold to see (for the one who acts) ----------
/** Covers `content` until held down (or toggled with Enter/Space). */
export function secret(content, { hint = 'Mantén presionado para ver' } = {}) {
  const shown = el('div', { class: 'secret-content' }, content);
  const btn = el('button', { class: 'secret', type: 'button', 'aria-pressed': 'false' }, shown,
    el('span', { class: 'secret-cover' }, icon('eye', { size: 22 }), el('span', {}, hint)));
  const set = (on) => { btn.classList.toggle('is-shown', on); btn.setAttribute('aria-pressed', String(on)); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => set(false));
  btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!btn.classList.contains('is-shown')); } });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return btn;
}

// ---------- inertial wheel ----------
/** Wheel with labels. spin() -> Promise<index>. */
export function wheel(labels, { size = 300 } = {}) {
  const n = Math.max(2, labels.length);
  const g = svg('g', { class: 'wheel-rot' });
  const root = svg('svg', { viewBox: '-110 -110 220 220', class: 'wheel-svg', width: size, height: size, 'aria-hidden': 'true' });
  const seg = (2 * Math.PI) / n;
  labels.forEach((label, i) => {
    const a0 = i * seg - Math.PI / 2; const a1 = a0 + seg;
    const p = (a) => `${(100 * Math.cos(a)).toFixed(2)} ${(100 * Math.sin(a)).toFixed(2)}`;
    const tone = n % 4 === 1 && i === n - 1 ? 1 : i % 4; // never two equal neighbours
    g.append(svg('path', { d: `M0 0 L${p(a0)} A100 100 0 ${seg > Math.PI ? 1 : 0} 1 ${p(a1)} Z`, class: `wheel-seg seg-${tone}`, 'data-i': i }));
    const mid = a0 + seg / 2; const deg = (mid * 180) / Math.PI;
    const flipText = Math.cos(mid) < 0; // left half: keep the text upright
    const t = svg('text', { x: flipText ? -58 : 58, y: 0, transform: `rotate(${flipText ? deg + 180 : deg})`, class: 'wheel-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    t.textContent = label.length > 16 ? `${label.slice(0, 15)}…` : label;
    g.append(t);
  });
  g.append(svg('circle', { r: 14, class: 'wheel-hub' }));
  root.append(g);
  const pointer = el('span', { class: 'wheel-pointer', 'aria-hidden': 'true' });
  const node = el('div', { class: 'wheel' }, root, pointer);
  let rot = 0; let spinning = false;
  const setRot = (r) => { rot = r; g.style.transform = `rotate(${r}deg)`; };
  const spin = (index = Math.floor(Math.random() * n)) => new Promise((resolve) => {
    if (spinning) return;
    spinning = true; node.classList.remove('has-result');
    const from = rot; const to = wheelTarget(n, index, rot, util.prefersReducedMotion() ? 1 : 5 + Math.floor(Math.random() * 2), 0.2 + Math.random() * 0.6);
    const dur = util.prefersReducedMotion() ? 300 : 3800 + Math.random() * 600;
    const t0 = performance.now(); let lastIdx = wheelIndexAt(n, from);
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      setRot(from + (to - from) * easeOutCubic(k));
      const idx = wheelIndexAt(n, rot);
      if (idx !== lastIdx) { lastIdx = idx; tick(); util.haptic(3); pointer.classList.remove('is-tick'); void pointer.offsetWidth; pointer.classList.add('is-tick'); }
      if (k < 1) requestAnimationFrame(frame);
      else { spinning = false; node.classList.add('has-result'); g.querySelectorAll('.wheel-seg').forEach((s) => s.classList.toggle('is-win', Number(s.dataset.i) === index)); ding(); util.haptic([15, 30, 15]); resolve(index); }
    };
    requestAnimationFrame(frame);
  });
  return { node, spin, get spinning() { return spinning; } };
}

// ---------- intro, shell and result ----------
/** Intro with the rules and the start button; the start plays an ink burst. */
export function intro({ game, rules = [], options = null, startLabel = 'Empezar', onStart }) {
  const start = ui.button({ label: startLabel, iconName: 'play', variant: 'primary', onClick: async () => {
    if (!util.prefersReducedMotion()) { const ink = overlayLayer('ink-layer'); ink.append(el('span', { class: 'ink-burst' })); setTimeout(() => ink.remove(), 700); await util.sleep(260); }
    onStart();
  } });
  return el('div', { class: 'game-intro stack' },
    el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon(game.icon, { size: 44 })),
    el('p', { class: 'game-intro-blurb' }, game.blurb),
    rules.length ? el('ul', { class: 'game-rules' }, rules.map((r) => el('li', {}, r))) : null,
    options,
    el('div', { class: 'btn-row center-row' }, start));
}

/** Who starts. */
export function firstPicker(value, onChange) {
  return ui.field({ label: 'Empieza', control: ui.segmented({ label: 'Quién empieza', value, onChange, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })) }) });
}

/** "Pasar" button that shows the free passes left of whoever has the turn. */
export function passButton(s, onDone, { who = () => s.turn(), before } = {}) {
  const b = ui.button({ label: 'Pasar', iconName: 'skip-forward', variant: 'ghost', onClick: async () => { b.disabled = true; before?.(); const r = await s.pass(who()); b.disabled = false; onDone?.(r); } });
  const paint = () => { const left = s.freeLeft(who()); b.querySelector('span:last-child').textContent = left ? `Pasar (${left} libre)` : 'Pasar (con castigo)'; };
  paint(); s.onChange(paint);
  return b;
}

export function resultView(s, { lines = [], onRematch, extra = null, scored = true } = {}) {
  const w = winnerOf(s.score);
  const pens = s.penalties.filter((x) => x.outcome === 'done' || x.outcome === 'alt').length;
  const node = el('div', { class: 'game-result stack' },
    scored ? el('div', { class: 'result-crown', 'aria-hidden': 'true' }, icon(w ? 'crown' : 'heart-handshake', { size: 48 })) : null,
    scored ? el('h2', { class: 'result-title' }, w ? `¡Ganó ${profile.name(w)}!` : 'Empate: ganan los dos') : null,
    scored ? el('p', { class: 'result-score' }, profile.PEOPLE.map((p) => `${profile.name(p)} ${s.score[p]}`).join(' · ')) : null,
    lines.length ? el('ul', { class: 'result-lines' }, lines.map((l) => el('li', {}, l))) : null,
    el('p', { class: 'muted small' }, [
      `Pases: ${profile.PEOPLE.map((p) => `${profile.name(p)} ${s.passesUsed[p]}`).join(', ')}`,
      pens ? `castigos cumplidos: ${pens}` : 'sin castigos',
      s.drink ? `bebidas: ${profile.PEOPLE.map((p) => `${profile.name(p)} ${s.drinks[p]}`).join(', ')}` : '',
    ].filter(Boolean).join(' · ')),
    extra,
    el('div', { class: 'btn-row center-row' },
      onRematch ? ui.button({ label: 'Revancha', iconName: 'swords', variant: 'primary', onClick: onRematch }) : null,
      ui.button({ label: 'Volver a la sala', iconName: 'arrow-left', href: '#/juegos' })));
  if (scored) ui.confetti({ count: 30 });
  return node;
}

/** Prompt before leaving a game in progress. */
export const confirmQuit = () => ui.confirmDialog({ title: '¿Terminar la partida?', message: 'Se guarda el marcador hasta aquí.', confirmLabel: 'Terminar' });
