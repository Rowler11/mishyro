// Racha e insignias (docs/05 Más §10). Decided 2026-11-20: the day counts when EITHER of the two
// does something shared (answers the question, writes in the diary, saves a memory, marks the mood,
// sends a song…), and each ISO week forgives one empty day ("día de gracia") so one bad day does not
// break it. Badges come from CONFIG.badges and are stamped like hanko seals when they unlock; the
// locked ones show their progress. Nothing "Solo yo", private, from the cycle, the Rincón or the
// personal space counts (docs/05 §14, §33).
import { ui, util, db, profile, CONFIG } from '../core.js';
import { isoWeek } from './gratitud.js';

const { el, icon } = util;
const SEEN_KEY = 'badgesSeen';

/** Where a shared action leaves a trace, and which day it belongs to. */
export const ACTIVITY = [
  { store: 'questionsDaily', where: (r) => r.kind === 'answer', day: (r) => r.at || r.date },
  { store: 'diary', day: (r) => r.date },
  { store: 'memories', day: (r) => r.createdAt },
  { store: 'moods', day: (r) => r.date },
  { store: 'songs', day: (r) => r.at || r.createdAt },
  { store: 'letters', where: (r) => r.status !== 'draft', day: (r) => r.createdAt },
  { store: 'gratitude', day: (r) => r.at },
  { store: 'weeklyReviews', day: (r) => r.updatedAt },
  { store: 'places', day: (r) => r.createdAt },
  { store: 'firsts', where: (r) => !r.skipped, day: (r) => r.createdAt },
  { store: 'voiceNotes', day: (r) => r.at },
  { store: 'thinkingOfYou', day: (r) => r.at },
  { store: 'couponState', day: (r) => r.redeemedAt },
  { store: 'dateIdeasState', day: (r) => r.updatedAt },
  { store: 'loveLanguages', day: (r) => r.at },
  { store: 'weeklyChallenges', where: (r) => r.doneAt, day: (r) => r.doneAt },
  { store: 'habitChecks', day: (r) => r.date },
  { store: 'savingsEntries', day: (r) => r.date },
  { store: 'bucketList', where: (r) => r.done, day: (r) => r.updatedAt },
  { store: 'dreams', day: (r) => r.updatedAt },
  { store: 'gifts', where: (r) => r.kind === 'wish', day: (r) => r.updatedAt },
  { store: 'timeCapsules', day: (r) => r.createdAt },
  { store: 'petRecords', day: (r) => r.date },
  { store: 'dateMenus', day: (r) => r.createdAt },
  { store: 'expenses', day: (r) => r.date },
  { store: 'scratchCards', where: (r) => r.scratchedAt, day: (r) => r.scratchedAt },
  { store: 'albums', day: (r) => r.updatedAt },
];

/** Shared and visible to both: the only records that count for streaks, badges and the summary. */
export const countable = (r) => r && !r.deleted && !r.hidden && !r.locked && r.visibility !== 'self' && !r.private;

async function safeQuery(store) { try { return (await db.query(store)).filter(countable); } catch { return []; } }

/** Set of days (YYYY-MM-DD) with at least one shared action. Seed and config records do not count. */
export async function activityDays() {
  const days = new Set();
  for (const a of ACTIVITY) {
    for (const r of await safeQuery(a.store)) {
      const seeded = r.origin && r.origin !== 'user';
      if (seeded && !r.userEdited) continue;
      if (a.where && !a.where(r)) continue;
      const d = String((seeded ? r.updatedAt : a.day(r)) || '').slice(0, 10);
      if (util.isValidDay(d)) days.add(d);
    }
  }
  return days;
}

const addDay = (day, n) => { const d = util.parseDay(day); d.setDate(d.getDate() + n); return util.localDay(d); };

/**
 * Streak with one grace day per ISO week (never two empty days in a row). Today without activity
 * yet does not break it. Returns { current, best, graceDays, activeToday }.
 */
export function computeStreak(days, today = util.localDay()) {
  const list = [...days].filter((d) => d <= today).sort();
  if (!list.length) return { current: 0, best: 0, graceDays: [], activeToday: false };
  let run = 0; let best = 0; let grace = []; let usedWeeks = new Set(); let prevGrace = false;
  for (let d = list[0]; d <= today; d = addDay(d, 1)) {
    if (days.has(d)) { run++; prevGrace = false; } else if (d === today) {
      // the day is not over yet
    } else if (run > 0 && !prevGrace && !usedWeeks.has(isoWeek(util.parseDay(d)))) {
      usedWeeks.add(isoWeek(util.parseDay(d))); grace.push(d); prevGrace = true;
    } else { run = 0; grace = []; usedWeeks = new Set(); prevGrace = false; }
    best = Math.max(best, run);
  }
  return { current: run, best, graceDays: grace, activeToday: days.has(today) };
}

/** Week strip for the screen: the last 7 days as active, grace or empty. */
export function lastWeek(days, graceDays, today = util.localDay()) {
  const g = new Set(graceDays);
  return Array.from({ length: 7 }, (_, i) => { const d = addDay(today, i - 6); return { day: d, state: days.has(d) ? 'on' : g.has(d) ? 'grace' : d === today ? 'today' : 'off' }; });
}

const matchesWhere = (r, where) => !where || Object.entries(where).every(([k, v]) => r[k] === v);

/** Progress of one badge: { value, min, done }. */
export async function progressOf(badge, ctx) {
  const c = badge.condition || {};
  const min = Number(c.min) || 1;
  let value = 0;
  if (c.type === 'count') {
    const recs = ctx.cache[c.store] ||= await safeQuery(c.store);
    value = recs.filter((r) => matchesWhere(r, c.where) && (c.has || []).every((k) => r[k]) && !r.skipped).length;
  } else if (c.type === 'cooked') { // Fase 4B: dishes cooked together, summed over the recipes
    const recs = ctx.cache.recipes ||= await safeQuery('recipes');
    value = recs.reduce((n, r) => n + (r.cooked?.length || 0), 0);
  } else if (c.type === 'sum') { // Fase 5: e.g. minutes in Modo juntos
    const recs = ctx.cache[c.store] ||= await safeQuery(c.store);
    value = recs.filter((r) => matchesWhere(r, c.where)).reduce((n, r) => n + (Number(r[c.field]) || 0), 0);
  } else if (c.type === 'streak') value = ctx.streak.best;
  else if (c.type === 'daysTogether') {
    const s = util.parseDay(profile.startDay());
    value = s ? Math.max(0, util.daysBetween(s, new Date())) : 0;
  }
  return { value: Math.min(value, min), min, done: value >= min };
}

/** Evaluate every badge, record the newly unlocked ones (shared, so both phones stamp them). */
export async function evaluate() {
  const days = await activityDays();
  const streak = computeStreak(days);
  const ctx = { cache: {}, streak };
  const unlocked = new Map((await safeQuery('badges')).map((b) => [b.badgeId, b]));
  const out = [];
  for (const b of CONFIG.badges || []) {
    const p = await progressOf(b, ctx);
    let rec = unlocked.get(b.id);
    if (p.done && !rec) {
      rec = { id: `badge:${b.id}`, badgeId: b.id, unlockedAt: util.nowISO(), visibility: 'shared', owner: 'both' };
      try { await db.put('badges', rec, { userEdit: false }); } catch (e) { console.error(e); }
    }
    out.push({ badge: b, progress: p, unlockedAt: rec?.unlockedAt || null });
  }
  try {
    const prev = await db.get('streaks', 'streak:daily');
    if (!prev || prev.current !== streak.current || prev.best !== streak.best) await db.put('streaks', { id: 'streak:daily', type: 'daily', current: streak.current, best: streak.best, visibility: 'shared', owner: 'both' }, { userEdit: false });
  } catch { /* not critical */ }
  return { days, streak, badges: out };
}

/** Unlocked badges this device has not shown yet. */
export async function unseen(result) {
  const seen = new Set((await db.getSettings(SEEN_KEY, { ids: [] })).ids || []);
  return result.badges.filter((b) => b.unlockedAt && !seen.has(b.badge.id));
}
async function markSeen(ids) {
  const cur = (await db.getSettings(SEEN_KEY, { ids: [] })).ids || [];
  await db.setSettings(SEEN_KEY, { ids: [...new Set([...cur, ...ids])] });
}

/** Inicio row when a badge was just unlocked (it stays until the screen is opened). */
export async function homeRow() {
  const r = await evaluate();
  const fresh = await unseen(r);
  if (!fresh.length) return null;
  return { href: '#/insignias', icon: 'award', title: fresh.length === 1 ? `Nueva insignia: ${fresh[0].badge.name}` : `${fresh.length} insignias nuevas`, sub: fresh[0].badge.description };
}

const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat('es-CO', { weekday: 'narrow' });

function seal(item, { fresh = false } = {}) {
  const { badge, progress, unlockedAt } = item;
  const on = !!unlockedAt;
  const tilt = ((badge.id.length * 7) % 11) - 5;
  return el('li', { class: `ins-badge${on ? ' is-on' : ''}${fresh ? ' is-fresh' : ''}` },
    el('span', { class: 'ins-badge-seal', style: { '--tilt': `${tilt}deg` }, 'aria-hidden': 'true' }, icon(on ? badge.icon || 'award' : 'lock', { size: on ? 30 : 22 })),
    el('span', { class: 'ins-badge-name' }, badge.name),
    el('span', { class: 'muted small' }, badge.description),
    on ? el('span', { class: 'small ins-badge-date' }, `Desde el ${fmtDay.format(new Date(unlockedAt))}`)
      : el('span', { class: 'ins-badge-progress' },
        el('span', { class: 'progress', role: 'progressbar', 'aria-label': `Progreso de ${badge.name}`, 'aria-valuemin': '0', 'aria-valuemax': String(progress.min), 'aria-valuenow': String(progress.value) },
          el('span', { class: 'progress-fill', style: { width: `${Math.round((progress.value / progress.min) * 100)}%` } })),
        el('span', { class: 'small muted' }, `${progress.value} de ${progress.min}`)));
}

export async function render() {
  const page = el('section', { class: 'page page-wide insignias' });
  page.append(ui.pageHeader({ title: 'Racha e insignias', jp: 'バッジ', romaji: 'bajji', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let busy = false;

  const draw = async () => {
    if (busy) return; busy = true;
    try {
      const r = await evaluate();
      const fresh = new Set((await unseen(r)).map((b) => b.badge.id));
      const { streak } = r;
      const week = lastWeek(r.days, streak.graceDays);
      const on = r.badges.filter((b) => b.unlockedAt).sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
      const off = r.badges.filter((b) => !b.unlockedAt).sort((a, b) => b.progress.value / b.progress.min - a.progress.value / a.progress.min);
      const partner = profile.name(profile.partnerOf(profile.active()));
      body.replaceChildren(
        el('section', { class: 'card paper-card streak-card' },
          el('div', { class: 'streak-head' },
            el('span', { class: `streak-flame${streak.current ? ' is-lit' : ''}`, 'aria-hidden': 'true' }, icon('flame', { size: 34 })),
            el('div', {},
              el('p', { class: 'streak-num' }, el('strong', {}, String(streak.current)), streak.current === 1 ? ' día de racha' : ' días de racha'),
              el('p', { class: 'muted small' }, `La mejor: ${streak.best} ${streak.best === 1 ? 'día' : 'días'}`))),
          el('ol', { class: 'streak-week', 'aria-label': 'Últimos 7 días' }, week.map((d) => el('li', { class: `streak-day is-${d.state}`, title: d.day },
            el('span', { class: 'streak-dot', 'aria-hidden': 'true' }, d.state === 'on' ? icon('check', { size: 14 }) : d.state === 'grace' ? icon('shield', { size: 14 }) : null),
            el('span', { class: 'small muted' }, fmtWeekday.format(util.parseDay(d.day))),
            el('span', { class: 'sr-only' }, `${d.day}: ${{ on: 'con algo juntos', grace: 'día de gracia', today: 'hoy, todavía no', off: 'sin actividad' }[d.state]}`)))),
          el('p', { class: 'small' }, streak.activeToday ? 'Hoy ya cuenta. ¡Bien ahí!'
            : streak.current ? `Hoy todavía no cuenta. Basta con que tú o ${partner} hagan algo juntos en la app: responder la pregunta, escribir en el diario, guardar un recuerdo…`
              : `Empieza hoy: basta con que tú o ${partner} hagan algo en la app.`),
          el('p', { class: 'muted small' }, icon('shield', { size: 14 }), ' Cada semana hay un día de gracia: si un día no pudieron, la racha no se pierde.')),
        el('section', { class: 'card paper-card' },
          el('p', { class: 'card-kicker' }, `Vitrina · ${on.length} de ${r.badges.length}`),
          on.length ? el('ul', { class: 'ins-badge-grid' }, on.map((b) => seal(b, { fresh: fresh.has(b.badge.id) && !util.prefersReducedMotion() })))
            : el('p', { class: 'muted small' }, 'Todavía no hay sellos. El primero llega pronto.')),
        off.length ? el('section', { class: 'card paper-card' },
          el('p', { class: 'card-kicker' }, 'Por desbloquear'),
          el('ul', { class: 'ins-badge-grid' }, off.map((b) => seal(b)))) : null,
        el('div', { class: 'card-actions' }, ui.button({ label: 'Ver sus resúmenes', iconName: 'sparkles', small: true, href: '#/resumen' })),
        el('p', { class: 'note-inline' }, icon('lock', { size: 18 }), el('span', {}, 'Lo que es "Solo yo", el ciclo y el Rincón nunca cuentan aquí.')));
      if (fresh.size) {
        ui.announce(fresh.size === 1 ? 'Nueva insignia desbloqueada' : `${fresh.size} insignias nuevas`);
        if (!util.prefersReducedMotion()) ui.confetti({ count: 28 });
        await markSeen([...fresh]);
      }
    } finally { busy = false; }
  };
  const tracked = new Set(['badges', ...ACTIVITY.map((a) => a.store)]);
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir esta sección', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const later = util.debounce(() => draw().catch(() => {}), 400);
  const off = db.onChange((s) => { if (tracked.has(s)) later(); });
  return { node: page, cleanup: () => { off(); } };
}
