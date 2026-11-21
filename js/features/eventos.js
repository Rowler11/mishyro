// Eventos de temporada (docs/05 §35). A "moment": not listed in Más; it shows up as a notice on
// Inicio while an event is on, with its decoration, message and activities. Each mesiversario
// (day 2) brings its own card and a monthly challenge. From the page you can go back to past ones.
import { ui, util, db, profile, CONFIG } from '../core.js';

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
    else if (r.type === 'profile' && r.field === 'startDate' && isAnniversary) out.push({ event: ev, period: String(y), name: ev.name });
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
async function eventsList() {
  const fromStore = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('seasonalEvent') }).catch(() => [])).filter((e) => !e.deleted && !e.hidden);
  return fromStore.length ? fromStore : (CONFIG.seasonalEvents || []);
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

export function decoLayer(kind, count = 12) {
  const layer = el('div', { class: `season-deco deco-${kind}`, 'aria-hidden': 'true' });
  const still = util.prefersReducedMotion();
  const n = kind === 'lights' ? 14 : kind === 'lanterns' ? 5 : kind === 'candles' ? 7 : count;
  for (let i = 0; i < n; i++) {
    const s = el('span', { class: 'deco-bit', style: { '--x': `${Math.round(((i + 0.5) / n) * 100)}%`, '--d': `${(i * 377) % 2400}ms`, '--s': `${0.7 + ((i * 7) % 5) / 10}` } });
    if (kind === 'lanterns') s.append(icon('jp-chochin', { size: 28 }));
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
    decoLayer(a.event.decoration || 'petals', 8),
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
