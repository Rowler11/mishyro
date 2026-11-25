// Contador de amor (v0.15.0, option A chosen 2026-11-24): its own card on Inicio. Each one can send
// love once a day with the big heart; the streak counts the days in a row when both sent it, and the
// love points add up everything they do together. One record per person per day in "streaks"
// ({ id: "love:<day>:<who>", type: "love", by, day }), so two phones sending at once never collide.
import { ui, util, db, profile } from '../core.js';

const { el, icon } = util;

/** Points per thing they do together (shown in "¿Cómo se ganan?"). */
export const POINTS = [
  { store: 'content', kind: 'letter', pts: 10, label: 'Cada carta' },
  { store: 'memories', pts: 8, label: 'Cada recuerdo' },
  { store: 'events', pts: 8, label: 'Cada cita o plan' },
  { store: 'content', kind: 'coupon', pts: 5, label: 'Cada cupón' },
  { store: 'songs', pts: 4, label: 'Cada canción dedicada' },
  { store: 'games', pts: 3, label: 'Cada juego' },
  { store: 'diary', pts: 3, label: 'Cada página del diario' },
  { store: 'love', pts: 2, label: 'Cada amor enviado' },
  { store: 'thinkingOfYou', pts: 1, label: 'Cada Pensando en ti' },
];
export const LEVELS = [
  { at: 0, name: 'Chispa' }, { at: 50, name: 'Latido' }, { at: 150, name: 'Cariño' }, { at: 300, name: 'Ternura' },
  { at: 600, name: 'Complicidad' }, { at: 1000, name: 'Devoción' }, { at: 2000, name: 'Alma gemela' }, { at: 4000, name: 'Para siempre' },
];
export const levelOf = (pts) => LEVELS.reduce((k, l, i) => (pts >= l.at ? i : k), 0);

const own = (r) => r && !r.deleted && r.origin !== 'config' && r.origin !== 'seed';
const shift = (day, n) => { const d = util.parseDay(day); d.setDate(d.getDate() + n); return util.localDay(d); };

/** All love sends: [{ day, by }]. */
export async function sends() {
  return (await db.query('streaks', { index: 'type', range: IDBKeyRange.only('love') }).catch(() => []))
    .filter((r) => !r.deleted && r.day && profile.PEOPLE.includes(r.by));
}

/** Missed days a streak can still be won back after (24 h lose it, 72 h to recover it). */
export const RESCUE_MAX = 3;
const gapDays = (a, b) => Math.round((util.parseDay(b) - util.parseDay(a)) / 864e5);

/** Days a confirmed rescue fills in: from the last shared day to the day before both confirmed. */
function filledDays(rescues) {
  const out = new Set(); const by = new Map();
  for (const r of rescues || []) { if (!by.has(r.day)) by.set(r.day, new Map()); by.get(r.day).set(r.by, r.cday || r.day); }
  for (const [from, who] of by) {
    if (!profile.PEOPLE.every((p) => who.has(p))) continue;
    const upto = [...who.values()].sort().pop();
    for (let i = 1; i <= RESCUE_MAX && shift(from, i) < upto; i++) out.add(shift(from, i));
  }
  return out;
}

/** Streak of days in a row when both sent love. Today still counts as "in time" until it ends. */
export function streakOf(list, today = util.localDay(), rescues = []) {
  const by = new Map();
  for (const s of list) { if (!by.has(s.day)) by.set(s.day, new Set()); by.get(s.day).add(s.by); }
  const filled = filledDays(rescues);
  const both = (d) => filled.has(d) || profile.PEOPLE.every((p) => by.get(d)?.has(p));
  let day = both(today) ? today : shift(today, -1);
  let current = 0;
  while (both(day)) { current++; day = shift(day, -1); }
  let best = 0; let run = 0; let prev = null;
  for (const d of [...new Set([...by.keys(), ...filled])].filter(both).sort()) { run = prev && shift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { current, best, today: by.get(today) || new Set() };
}

/** Can a lost streak still be recovered? It takes up to 3 missed days and both must confirm. */
export function rescueOf(list, rescues, today = util.localDay(), me = profile.active()) {
  const days = new Set();
  const by = new Map();
  for (const s of list) { if (!by.has(s.day)) by.set(s.day, new Set()); by.get(s.day).add(s.by); }
  for (const [d, w] of by) if (d < today && profile.PEOPLE.every((p) => w.has(p))) days.add(d);
  for (const d of filledDays(rescues)) days.add(d);
  const last = [...days].sort().pop();
  if (!last) return { possible: false };
  const missed = gapDays(last, today) - 1;
  if (missed < 1 || missed > RESCUE_MAX) return { possible: false };
  const mark = (who) => (rescues || []).some((r) => r.day === last && r.by === who);
  return { possible: true, from: last, missed, left: RESCUE_MAX - missed + 1, mine: mark(me), theirs: mark(profile.partnerOf(me)) };
}

export async function rescues() {
  return (await db.query('streaks', { index: 'type', range: IDBKeyRange.only('love-rescue') }).catch(() => []))
    .filter((r) => !r.deleted && r.day && r.cday && profile.PEOPLE.includes(r.by));
}

export async function confirmRescue(from, who = profile.active()) {
  const id = `love-rescue:${from}:${who}`;
  if (await db.get('streaks', id).catch(() => null)) return false;
  await db.put('streaks', { id, type: 'love-rescue', by: who, day: from, cday: util.localDay(), at: util.nowISO(), visibility: 'shared', owner: 'both' }, { userEdit: false });
  return true;
}

/** Love points from everything they did together. */
export async function score(list) {
  const cache = {};
  const rows = async (store) => { cache[store] ??= (await db.query(store).catch(() => [])).filter(own); return cache[store]; };
  let total = 0;
  for (const p of POINTS) {
    const n = p.store === 'love' ? list.length : (await rows(p.store)).filter((r) => !p.kind || r.kind === p.kind).length;
    total += n * p.pts;
  }
  return total;
}

export async function sentToday(who = profile.active()) {
  return !!(await db.get('streaks', `love:${util.localDay()}:${who}`).catch(() => null));
}

export async function send(who = profile.active()) {
  const day = util.localDay();
  const id = `love:${day}:${who}`;
  if (await db.get('streaks', id).catch(() => null)) return false;
  await db.put('streaks', { id, type: 'love', by: who, day, at: util.nowISO(), visibility: 'shared', owner: 'both' }, { userEdit: false });
  import('./avisos.js').then((m) => m.refresh()).catch(() => {}); // today's reminder is no longer needed
  return true;
}

const HEART = '<svg viewBox="0 0 64 58" aria-hidden="true" focusable="false"><path class="love-heart-shape" d="M32 56 C29 53 4 37 4 19 C4 9 11 3 19 3 C25 3 29.5 6.5 32 11 C34.5 6.5 39 3 45 3 C53 3 60 9 60 19 C60 37 35 53 32 56Z"/><path class="love-heart-shine" d="M14 14 C16 10 20 9 23 10" fill="none" stroke-width="3" stroke-linecap="round"/></svg>';

function burst(host) {
  if (util.prefersReducedMotion()) return;
  const layer = el('span', { class: 'love-burst', 'aria-hidden': 'true' });
  for (let i = 0; i < 10; i++) {
    const h = el('span', { class: 'love-mini' }, '♥');
    h.style.setProperty('--a', `${Math.round((360 / 10) * i + Math.random() * 20)}deg`);
    h.style.setProperty('--d', `${i * 30}ms`);
    layer.append(h);
  }
  host.append(layer);
  setTimeout(() => layer.remove(), 1400);
}

export async function homeCard({ onChange } = {}) {
  const me = profile.active();
  const other = profile.partnerOf(me);
  const list = await sends();
  const rs = await rescues();
  const st = streakOf(list, util.localDay(), rs);
  const pts = await score(list);
  const lv = levelOf(pts); const cur = LEVELS[lv]; const next = LEVELS[lv + 1];
  const mine = st.today.has(me); const theirs = st.today.has(other);
  const nick = profile.nick(other) || 'tu amor';

  const heart = el('button', {
    class: `love-heart${mine ? ' is-sent' : ''}`, type: 'button',
    'aria-label': mine ? 'Ya enviaste amor hoy' : `Enviar amor a ${nick}`, 'aria-pressed': mine ? 'true' : 'false',
  });
  heart.innerHTML = HEART;
  const label = el('span', { class: 'love-heart-label' }, mine ? 'Amor enviado hoy' : 'Enviar amor');
  heart.append(label);
  heart.addEventListener('click', async () => {
    if (heart.classList.contains('is-sent')) { ui.toast(theirs ? 'Hoy ya se enviaron amor los dos 💗' : `Ya le enviaste amor hoy. Mañana puedes enviar otro.`); return; }
    heart.disabled = true;
    try {
      if (await send(me)) {
        util.haptic('love');
        heart.classList.add('is-sent', 'is-pop'); heart.setAttribute('aria-pressed', 'true'); label.textContent = 'Amor enviado hoy';
        burst(heart);
        ui.toast(theirs ? `¡Los dos enviaron amor hoy! Racha de ${st.current + 1} ${st.current + 1 === 1 ? 'día' : 'días'} 🔥` : `Le enviaste amor a ${nick} 💗`, { tone: 'success' });
        setTimeout(() => onChange?.(), util.prefersReducedMotion() ? 0 : 1300);
      }
    } catch (e) { console.error(e); ui.toast('No se pudo enviar. Intenta otra vez.', { tone: 'error' }); }
    heart.disabled = false;
  });

  const who = (p, sent) => el('span', { class: `love-who${sent ? ' is-on' : ''}` }, icon(sent ? 'heart' : 'clock', { size: 14 }), ` ${p === me ? 'Tú' : profile.nick(p) || 'Tu amor'}`);
  const stat = (value, name, sub) => el('div', { class: 'love-stat' }, el('strong', {}, value), el('span', { class: 'small' }, name), sub ? el('span', { class: 'muted small' }, sub) : null);

  const fill = el('span', { class: 'guide-bar-fill' });
  const pct = next ? Math.round(((pts - cur.at) / (next.at - cur.at)) * 100) : 100;
  fill.style.width = `${pct}%`;

  const hint = mine && theirs ? `Hoy se enviaron amor los dos. ${st.current === 1 ? 'Empezó su racha.' : `Llevan ${st.current} días seguidos.`}`
    : theirs ? `${nick} te envió amor hoy 💗 Devuélveselo y su racha sigue.`
      : mine ? `Ya enviaste el tuyo. Cuando ${nick} envíe el suyo, la racha sube a ${st.current + 1}.`
        : st.current ? `Envíense amor hoy y la racha sube a ${st.current + 1}.` : 'Envíense amor los dos, todos los días, y empieza su racha.';

  const how = el('details', { class: 'garden-legend love-how' }, el('summary', { class: 'small' }, '¿Cómo se ganan puntos de amor?'),
    el('ul', {}, POINTS.map((p) => el('li', { class: 'small' }, el('strong', {}, `+${p.pts}`), el('span', {}, p.label)))));

  const card = el('section', { class: 'card paper-card love-card', 'aria-labelledby': 'love-title' },
    el('div', { class: 'garden-head' },
      el('div', {}, el('p', { class: 'card-kicker' }, 'Todos los días'),
        el('h2', { class: 'card-title', id: 'love-title' }, 'Contador de amor')),
      el('span', { class: 'guide-count love-streak' }, icon('flame', { size: 16 }), ` ${st.current} ${st.current === 1 ? 'día' : 'días'}`)),
    el('div', { class: 'love-main' },
      heart,
      el('div', { class: 'love-today' }, el('p', { class: 'small love-today-title' }, 'Hoy'), who(me, mine), who(other, theirs))),
    el('p', { class: 'small love-hint', 'aria-live': 'polite' }, hint),
    el('div', { class: 'love-stats' },
      stat(String(st.current), 'Racha', st.best > st.current ? `Mejor: ${st.best}` : 'días seguidos'),
      stat(String(list.length), 'Amor enviado', 'entre los dos'),
      stat(String(pts), 'Puntos', cur.name)),
    el('span', { class: 'guide-bar', role: 'progressbar', 'aria-label': next ? `Camino a ${next.name}` : 'Nivel máximo', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, fill),
    el('p', { class: 'muted small' }, next ? `Nivel ${cur.name}. ${next.at - pts === 1 ? 'Falta 1 punto' : `Faltan ${next.at - pts} puntos`} para "${next.name}".` : `Nivel ${cur.name}. Llegaron al nivel más alto.`),
    how);

  // App shortcut "Enviar amor" (long-press on the icon) opens Inicio with ?amor=1.
  if (/[?&]amor=1/.test(location.hash)) {
    setTimeout(() => { card.scrollIntoView({ block: 'center', behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' }); heart.focus({ preventScroll: true }); }, 400);
  }
  return card;
}

// ---------- Inicio "Sereno" (chosen 2026-11-24): the love counter as a slim strip ----------
// It lives at the bottom of the days-together card: the send button, who sent today and the streak.
// "Ver más" (the streak) opens the full card in a sheet: stats, level and how points are earned.
export async function homeStrip({ onChange } = {}) {
  const me = profile.active();
  const other = profile.partnerOf(me);
  const list = await sends();
  const rs = await rescues();
  const st = streakOf(list, util.localDay(), rs);
  const rc = rescueOf(list, rs);
  const mine = st.today.has(me); const theirs = st.today.has(other);
  const nick = profile.nick(other) || 'tu amor';
  const label = el('span', {}, mine ? 'Amor enviado' : 'Enviar amor');
  const btn = el('button', { class: `love-send${mine ? ' is-sent' : ''}`, type: 'button', 'aria-pressed': mine ? 'true' : 'false',
    'aria-label': mine ? 'Ya enviaste amor hoy' : `Enviar amor a ${nick}` }, icon('heart', { size: 16 }), label);
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('is-sent')) { ui.toast(theirs ? 'Hoy ya se enviaron amor los dos 💗' : 'Ya le enviaste amor hoy. Mañana puedes enviar otro.'); return; }
    btn.disabled = true;
    try {
      if (await send(me)) {
        util.haptic('love');
        btn.classList.add('is-sent', 'is-pop'); btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Amor enviado';
        burst(btn);
        ui.toast(theirs ? `¡Los dos enviaron amor hoy! Racha de ${st.current + 1} ${st.current + 1 === 1 ? 'día' : 'días'} 🔥` : `Le enviaste amor a ${nick} 💗`, { tone: 'success' });
        setTimeout(() => onChange?.(), util.prefersReducedMotion() ? 0 : 1300);
      }
    } catch (e) { console.error(e); ui.toast('No se pudo enviar. Intenta otra vez.', { tone: 'error' }); }
    btn.disabled = false;
  });
  const check = (p, on) => {
    const name = p === me ? 'Tú' : profile.nick(p) || 'Tu amor';
    return el('span', { class: `love-check${on ? ' is-on' : ''}`, title: name, role: 'img', 'aria-label': `${name}: ${on ? 'envió amor hoy' : 'aún no envía amor hoy'}` },
      on ? icon('check', { size: 14 }) : el('span', { 'aria-hidden': 'true' }, name.slice(0, 1).toUpperCase()));
  };
  const days = `${st.current} ${st.current === 1 ? 'día' : 'días'}`;
  const streak = rc.possible
    ? el('button', { class: 'love-streak-btn is-rescue', type: 'button', 'aria-label': 'Recuperar la racha. Los dos tienen que confirmar' }, icon('rotate-ccw', { size: 15 }), ' Recuperar')
    : el('button', { class: 'love-streak-btn', type: 'button', 'aria-label': `Racha de amor: ${days}. Ver más` }, icon('flame', { size: 15 }), ` ${days}`);
  streak.addEventListener('click', async () => {
    if (rc.possible) { rescueSheet(rc, nick, onChange); return; }
    const card = await homeCard({ onChange });
    ui.openModal({ title: 'Contador de amor', kind: 'sheet', body: card, actions: [{ label: 'Cerrar', variant: 'ghost' }] });
  });
  const strip = el('div', { class: 'love-strip', role: 'group', 'aria-label': 'Contador de amor' },
    streak, btn, el('span', { class: 'love-checks' }, check(me, mine), check(other, theirs)));
  if (/[?&]amor=1/.test(location.hash)) setTimeout(() => { strip.scrollIntoView({ block: 'center' }); btn.focus({ preventScroll: true }); }, 400);
  return strip;
}

/** Both have to confirm; the second one to confirm wins the streak back. */
function rescueSheet(rc, nick, onChange) {
  const sentence = rc.missed === 1 ? 'Se les pasó 1 día' : `Se les pasaron ${rc.missed} días`;
  const status = rc.mine && !rc.theirs ? `Ya confirmaste. Falta que ${nick} confirme.` : rc.theirs && !rc.mine ? `${nick} ya confirmó. Falta tu confirmación.` : 'Los dos tienen que confirmar.';
  const body = el('div', { class: 'stack' },
    el('p', {}, `${sentence} sin enviarse amor y la racha se pausó. Pueden recuperarla si los dos confirman, hasta 3 días después de perderla.`),
    el('p', { class: 'muted small', 'aria-live': 'polite' }, status));
  ui.openModal({ title: 'Recuperar la racha', kind: 'sheet', body, actions: [
    { label: 'Ahora no', variant: 'ghost' },
    ...(rc.mine ? [] : [{ label: 'Confirmar', variant: 'primary', onClick: async () => {
      if (await confirmRescue(rc.from)) { util.haptic('love'); ui.toast(rc.theirs ? 'Racha recuperada 🔥' : `Listo. Falta que ${nick} confirme.`, { tone: 'success' }); onChange?.(); }
    } }]),
  ] });
}

// v0.29.0 (idea 35): when they reach a new level, a screen celebrates it with a rain of petals.
const LEVEL_KEY = 'aishiteru.amor.level';
export async function checkLevelUp() {
  const lv = levelOf(await score(await sends()));
  let last = null; try { last = localStorage.getItem(LEVEL_KEY); } catch { return; }
  try { localStorage.setItem(LEVEL_KEY, String(lv)); } catch { /* private mode */ }
  if (last === null || lv <= Number(last) || document.querySelector('.ocasion-layer, .levelup-layer')) return;
  const [{ pickWho, art }, fx] = await Promise.all([import('./toques.js'), import('../core/fx.js')]);
  const a = await art(await pickWho(`nivel-${lv}`));
  const go = el('button', { class: 'btn btn-primary ocasion-go', type: 'button' }, '¡Seguimos!');
  const layer = el('div', { class: 'ocasion-layer levelup-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Nuevo nivel: ${LEVELS[lv].name}` },
    el('div', { class: 'ocasion-card' },
      el('div', { class: 'ocasion-art', 'aria-hidden': 'true' }, a.node),
      el('p', { class: 'card-kicker' }, 'Subieron de nivel'),
      el('h2', { class: 'ocasion-title' }, LEVELS[lv].name),
      el('p', { class: 'ocasion-sub' }, `${a.name}: todo lo que se dan, juntos, los trajo hasta aquí.`), go));
  go.addEventListener('click', () => { layer.classList.add('leaving'); setTimeout(() => layer.remove(), 320); });
  document.body.append(layer); go.focus({ preventScroll: true });
  util.haptic('love'); util.sound('chime');
  fx.seasonal({ kind: 'sakura', count: 40, force: true, duration: 5000 });
}
