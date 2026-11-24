// Eventos de temporada (docs/05 §35). A "moment": not listed in Más; it shows up as a notice on
// Inicio while an event is on, with its decoration, message and activities. Each mesiversario
// (day 2) brings its own card and a monthly challenge. From the page you can go back to past ones.
import { ui, util, db, profile, CONFIG } from '../core.js';
import { festivalDate } from '../core/temporadas.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

// ---------- pure helpers (unit-tested) ----------
/** Day of the n-th `weekday` (0 = Sunday) of a month (1-12). */
export function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month - 1, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return 1 + shift + (n - 1) * 7;
}

const md = (m, d) => m * 100 + d;

/**
 * Events on `day` (Date). ctx: { startDay: 'YYYY-MM-DD', birthdays: [{ who, date }] }.
 * Returns [{ event, period, name, who? }]: period is the year ("2026") or the month ("2026-11").
 */
export function activeEvents(events, day, ctx = {}) {
  const y = day.getFullYear(); const m = day.getMonth() + 1; const d = day.getDate();
  const out = [];
  const start = ctx.startDay ? util.parseDay(ctx.startDay) : null;
  const isAnniversary = !!start && start.getMonth() + 1 === m && start.getDate() === d && start.getFullYear() < y;
  for (const ev of events) {
    const r = ev.rule || {};
    if (r.type === 'fixed' && r.month === m && r.day === d) out.push({ event: ev, period: String(y), name: ev.name });
    else if (r.type === 'range' && md(m, d) >= md(r.from.month, r.from.day) && md(m, d) <= md(r.to.month, r.to.day)) out.push({ event: ev, period: String(y), name: ev.name });
    else if (r.type === 'nth' && r.month === m && nthWeekday(y, m, r.weekday, r.n) === d) out.push({ event: ev, period: String(y), name: ev.name });
    else if (r.type === 'monthly' && r.day === d && !isAnniversary && start && day > start) out.push({ event: ev, period: `${y}-${String(m).padStart(2, '0')}`, name: ev.name });
    else if (r.type === 'lunar') { // v0.16.0: festivals of the lunar calendar (Año Nuevo chino, Qixi, Medio Otoño, Tsukimi)
      const f0 = festivalDate(r.key, y);
      const off = f0 ? Math.round((new Date(y, m - 1, d) - f0) / 864e5) : -1;
      if (off >= 0 && off < (r.days || 1)) out.push({ event: ev, period: String(y), name: ev.name });
    } else if (r.type === 'profile' && r.field === 'startDate' && isAnniversary) out.push({ event: ev, period: String(y), name: ev.name });
    else if (r.type === 'profile' && r.field === 'birth') {
      for (const b of ctx.birthdays || []) {
        const bd = util.parseDay(b.date);
        if (bd && bd.getMonth() + 1 === m && bd.getDate() === d) out.push({ event: ev, period: `${y}:${b.whoId || b.who}`, name: `Cumpleaños de ${b.who}`, who: b.who });
      }
    }
  }
  return out;
}

/** Next date (within a year) each event starts, soonest first. */
export function upcoming(events, from, ctx = {}, limit = 5) {
  const seen = new Set(); const out = [];
  for (let i = 1; i <= 370 && out.length < limit; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    for (const a of activeEvents(events, day, ctx)) {
      const key = `${a.event.id}:${a.who || ''}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push({ ...a, date: util.localDay(day), days: i });
    }
  }
  return out;
}

/** The mesiversario challenge of a month: rotates through the list. */
export function monthlyChallenge(ev, period) {
  const list = ev.retos || [];
  if (!list.length) return '';
  const [y, m] = period.split('-').map(Number);
  return list[(y * 12 + m) % list.length];
}

// ---------- data ----------
/** v0.16.0: events marked style 'jp' or 'cn' only show with that family of styles; the rest always. */
export const forStyle = (events, style = document.documentElement.dataset.style) => {
  const fam = style === 'rojo' || style === 'azul' ? 'cn' : 'jp';
  return events.filter((e) => !e.style || e.style === fam);
};
async function eventsList() {
  const fromStore = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('seasonalEvent') }).catch(() => [])).filter((e) => !e.deleted && !e.hidden);
  return forStyle(fromStore.length ? fromStore : (CONFIG.seasonalEvents || []));
}
async function ctxData() {
  const dates = (await db.query('specialDates').catch(() => [])).filter((d) => !d.deleted && d.kind === 'birthday' && profile.PEOPLE.includes(d.personOrPetId));
  const day = (v) => (typeof v === 'string' ? v.slice(0, 10) : v?.y ? `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}` : '');
  return { startDay: profile.startDay(), birthdays: dates.map((d) => ({ who: profile.name(d.personOrPetId), whoId: d.personOrPetId, date: day(d.date) })).filter((b) => util.isValidDay(b.date)) };
}
const recId = (a) => `seasonal:${a.event.id}:${a.period}`;

export async function today(on = new Date()) {
  return activeEvents(await eventsList(), on, await ctxData());
}

/** Row for "Para hoy" on Inicio while an event is on (null otherwise). */
export async function homeRow() {
  const list = await today();
  if (!list.length) return null;
  const a = list.find((x) => x.event.rule?.type !== 'range') || list[0];
  return { href: '#/eventos', icon: a.event.icon || 'party-popper', title: a.who ? `Hoy cumple ${a.who}` : a.name, sub: profile.fill(a.event.message || '') };
}

/** Decoration layer for Inicio (empty when nothing is on or motion is off). */
export async function decoration() {
  const list = await today();
  const deco = list.find((x) => x.event.rule?.type !== 'range')?.event.decoration || list[0]?.event.decoration;
  if (!deco) return null;
  return decoLayer(deco);
}

// v0.15.1 (chosen 2026-11-24, "Navidad a la japonesa"): novenas and Navidad hang red and white chōchin
// from a gold rope over Inicio, and the event card is wrapped with a red ribbon and its bow, like a gift.
const XMAS_DEFS = '<defs><radialGradient id="xl-r" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#FFD9A0"/><stop offset=".5" stop-color="#F06A4B"/><stop offset="1" stop-color="#B8322A"/></radialGradient><radialGradient id="xl-w" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#FFFAF0"/><stop offset=".6" stop-color="#FBE9D6"/><stop offset="1" stop-color="#E3C9B0"/></radialGradient><radialGradient id="xl-h"><stop offset="0" stop-color="#FFB060" stop-opacity=".45"/><stop offset="1" stop-color="#FFB060" stop-opacity="0"/></radialGradient><linearGradient id="xl-rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D84A3A"/><stop offset="1" stop-color="#A8301F"/></linearGradient></defs>';
function xmasLantern(white) {
  const ribs = [5, 9, 13, 17, 21].map((k) => { const hw = Math.sqrt(Math.max(0, 81 - ((k - 13) ** 2 * 81) / 121)).toFixed(1); return `<path d="M-${hw} ${k}Q0 ${k + 1} ${hw} ${k}" stroke="rgba(90,24,16,.3)" stroke-width=".6" fill="none"/>`; }).join('');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-16 -2 32 46'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = `${XMAS_DEFS}<line x1="0" y1="-2" x2="0" y2="6" stroke="#6A4A3A" stroke-width=".8"/><g transform="translate(0 6)"><circle cx="0" cy="13" r="16" fill="url(#xl-h)"/><rect x="-5" y="0" width="10" height="2.6" fill="#2A1E22"/><ellipse cx="0" cy="13" rx="9" ry="11" fill="url(#xl-${white ? 'w' : 'r'})"/>${ribs}<rect x="-5" y="23.4" width="10" height="2.6" fill="#2A1E22"/><line x1="0" y1="26" x2="0" y2="32" stroke="#D4A943" stroke-width="1.4"/><circle cx="0" cy="33" r="1.4" fill="#D4A943"/></g>`;
  return svg;
}
function xmasLayer(onCard) {
  const layer = el('div', { class: `season-deco deco-lights${onCard ? ' is-band' : ''}`, 'aria-hidden': 'true' });
  const rope = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  rope.setAttribute('class', 'xmas-rope'); rope.setAttribute('viewBox', '0 0 100 20'); rope.setAttribute('preserveAspectRatio', 'none'); rope.setAttribute('aria-hidden', 'true');
  rope.innerHTML = onCard
    ? `${XMAS_DEFS}<rect x="0" y="9" width="100" height="7" fill="url(#xl-rb)"/><rect x="0" y="10.4" width="100" height=".5" fill="#F3C54A"/><rect x="0" y="14" width="100" height=".5" fill="#F3C54A"/>`
    : '<path d="M0 4Q25 14 50 6T100 7" fill="none" stroke="#C9A35E" stroke-width="1.6" vector-effect="non-scaling-stroke"/>';
  add(layer, rope);
  const n = onCard ? 3 : 5;
  for (let i = 0; i < n; i++) add(layer, el('span', { class: 'xmas-lantern' }, xmasLantern(i % 2 === 1)));
  if (onCard) {
    const bow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bow.setAttribute('class', 'xmas-bow'); bow.setAttribute('viewBox', '-34 -16 68 46'); bow.setAttribute('aria-hidden', 'true');
    bow.innerHTML = `${XMAS_DEFS}<path d="M0 0l-10 26M0 0l10 26" stroke="#C9302C" stroke-width="5" stroke-linecap="round"/><path d="M0 0c-14-14-32-10-25 4 5 9 18 3 25-4zM0 0c14-14 32-10 25 4-5 9-18 3-25-4z" fill="url(#xl-rb)"/><circle r="5" fill="#A8301F"/><path d="M-20-4q10 8 20 4q10 4 20-4" stroke="#F3C54A" stroke-width="1.2" fill="none"/>`;
    add(layer, bow);
  }
  if (util.prefersReducedMotion()) layer.classList.add('is-still');
  return layer;
}

export function decoLayer(kind, count = 12, { onCard = false } = {}) {
  if (kind === 'lights') return xmasLayer(onCard);
  const layer = el('div', { class: `season-deco deco-${kind}`, 'aria-hidden': 'true' });
  const still = util.prefersReducedMotion();
  const n = kind === 'lights' ? 14 : kind === 'lanterns' ? 5 : kind === 'candles' ? 7 : count;
  for (let i = 0; i < n; i++) {
    const s = el('span', { class: 'deco-bit', style: { '--x': `${Math.round(((i + 0.5) / n) * 100)}%`, '--d': `${(i * 377) % 2400}ms`, '--s': `${0.7 + ((i * 7) % 5) / 10}` } });
    if (kind === 'lanterns') s.append(icon(/^(rojo|azul)$/.test(document.documentElement.dataset.style || '') ? 'cn-lantern' : 'jp-chochin', { size: 28 }));
    add(layer, s);
  }
  if (still) layer.classList.add('is-still');
  return layer;
}

// ---------- page ----------
function eventCard(a, rec, { readOnly = false, onToggle } = {}) {
  const done = new Set(rec?.activityDone || []);
  const reto = a.event.rule?.type === 'monthly' ? monthlyChallenge(a.event, a.period) : '';
  const acts = [...(a.event.activities || []), ...(reto ? [`Reto del mes: ${reto}`] : [])];
  return el('article', { class: 'card event-card stack' },
    decoLayer(a.event.decoration || 'petals', 8, { onCard: true }),
    el('div', { class: 'event-head' }, el('span', { class: 'section-icon' }, icon(a.event.icon || 'party-popper', { size: 22 })),
      el('div', {}, el('h2', { class: 'card-title' }, a.name), el('p', { class: 'muted small' }, a.period.length === 7 ? new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(Number(a.period.slice(0, 4)), Number(a.period.slice(5, 7)) - 1, 1)) : a.period.slice(0, 4)))),
    a.event.message ? el('p', { class: 'event-message' }, profile.fill(a.event.message)) : null,
    acts.length ? el('ul', { class: 'event-acts' }, acts.map((t, i) => {
      const id = `act-${a.event.id.replace(/\W/g, '')}-${i}`;
      const cb = el('input', { type: 'checkbox', id, class: 'check-input', checked: done.has(i), disabled: readOnly });
      cb.addEventListener('change', () => onToggle?.(i, cb.checked));
      return el('li', { class: `event-act${i === acts.length - 1 && reto ? ' is-reto' : ''}` }, cb, el('label', { for: id }, t));
    })) : null);
}

export async function render({ query = {} } = {}) {
  const page = el('section', { class: 'page eventos' });
  add(page, ui.pageHeader({ title: 'Eventos de temporada', jp: '季節', romaji: 'kisetsu', back: '/inicio' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  add(page, body);
  const load = async () => {
    const [events, ctx] = await Promise.all([eventsList(), ctxData()]);
    const now = activeEvents(events, new Date(), ctx);
    const recs = (await db.query('seasonal').catch(() => [])).filter((r) => !r.deleted);
    const byId = new Map(recs.map((r) => [r.id, r]));
    for (const a of now) if (!byId.has(recId(a))) {
      const r = { id: recId(a), eventId: a.event.id, year: Number(a.period.slice(0, 4)), period: a.period, name: a.name, seenAt: util.nowISO(), activityDone: [], visibility: 'shared', owner: 'both' };
      await db.put('seasonal', r, { userEdit: false }); byId.set(r.id, r);
    }
    const toggle = (a) => async (i, on) => {
      const r = byId.get(recId(a));
      const set = new Set(r.activityDone || []); if (on) set.add(i); else set.delete(i);
      const next = { ...r, activityDone: [...set].sort() };
      await db.put('seasonal', next); byId.set(next.id, next);
      if (on) { util.haptic(8); if (set.size === 1) ui.confetti({ count: 18 }); }
    };
    // A past one opened from the list.
    const pastKey = query.k;
    const past = pastKey ? byId.get(pastKey) : null;
    const pastEvent = past ? events.find((e) => e.id === past.eventId) : null;
    const prev = [...byId.values()].filter((r) => !now.some((a) => recId(a) === r.id)).sort((a, b) => (b.seenAt || '').localeCompare(a.seenAt || ''));
    const next = upcoming(events, new Date(), ctx, 5);
    put(body, 
      past && pastEvent ? eventCard({ event: pastEvent, period: past.period, name: past.name || pastEvent.name }, past, { onToggle: async (i, on) => {
        const set = new Set(past.activityDone || []); if (on) set.add(i); else set.delete(i);
        past.activityDone = [...set].sort(); await db.put('seasonal', { ...past });
      } }) : null,
      ...(!past ? (now.length ? now.map((a) => eventCard(a, byId.get(recId(a)), { onToggle: toggle(a) })) : [ui.emptyState({ title: 'Hoy no hay evento', text: 'Cuando llegue una fecha especial, aparece un aviso en Inicio.', art: 'lantern' })]) : []),
      next.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Lo que viene'),
        el('ul', { class: 'card pet-list' }, next.map((a) => el('li', { class: 'pet-row' }, icon(a.event.icon || 'party-popper', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, a.name), el('p', { class: 'muted small' }, `${util.formatDay(a.date)} · ${a.days === 1 ? 'mañana' : `en ${a.days} días`}`)))))) : null,
      prev.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Anteriores'),
        el('ul', { class: 'card pet-list' }, prev.slice(0, 24).map((r) => el('li', {}, el('a', { class: 'pet-row', href: `#/eventos?k=${encodeURIComponent(r.id)}` },
          icon((events.find((e) => e.id === r.eventId) || {}).icon || 'party-popper', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, r.name || r.eventId), el('p', { class: 'muted small' }, [r.seenAt ? util.formatDay(r.seenAt.slice(0, 10)) : '', (r.activityDone || []).length ? `${r.activityDone.length} ${r.activityDone.length === 1 ? 'actividad hecha' : 'actividades hechas'}` : ''].filter(Boolean).join(' · '))),
          icon('chevron-right', { size: 18, cls: 'list-chevron' })))))) : null,
      past ? el('div', { class: 'btn-row' }, ui.button({ label: 'Ver los de hoy', iconName: 'arrow-left', variant: 'ghost', href: '#/eventos' })) : null);
  };
  try { await load(); } catch (e) { console.error(e); put(body, ui.emptyState({ title: 'No pudimos abrir los eventos', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  return { node: page };
}
