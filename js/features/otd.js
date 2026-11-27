// Un día como hoy en Inicio (v0.39.0, Rowler chose "Hoja de calendario" on 2026-11-27).
// A himekuri page: today's date in big brush numerals, and one past moment from this same day of the
// month (a shared memory of the Cápsula, a letter they opened, a photo of the day). Chips switch between
// them and the page turns like a tear-off calendar. Only shows when there is something; "Solo yo" and
// private memories stay out, and a letter only shows to the two people it belongs to.
import { util, db, profile } from '../core.js';

const { el, icon } = util;
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const fmtWeekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' });
const fmtMon = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const fmtShort = { format: (d) => `${d.getDate()} ${fmtMon.format(d).replace('.', '')} ${d.getFullYear()}` };
const MAX = 4;
const KINDS = {
  memory: { icon: 'image', name: 'Recuerdo de la Cápsula' },
  letter: { icon: 'mail', name: 'Carta' },
  photo: { icon: 'camera', name: 'Foto del día' },
};

/** "1 año", "6 meses", "3 días" for a past day. */
export function agoShort(day, now = new Date()) {
  const d = util.parseDay(day);
  if (!d) return '';
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let months = (base.getFullYear() - d.getFullYear()) * 12 + base.getMonth() - d.getMonth();
  if (base.getDate() < d.getDate()) months -= 1;
  const years = Math.floor(months / 12);
  if (years && months % 12 === 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  if (months >= 1) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const days = util.daysBetween(d, base);
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}

/**
 * Picks what to show: newest first, at most one per past day and MAX in all, earlier years before
 * earlier months (like the Cápsula does). Pure, for the tests.
 */
export function pickMoments(items, now = new Date()) {
  const today = util.localDay(now);
  const mmdd = today.slice(5);
  const past = items.filter((i) => util.isValidDay(i.day) && i.day < today && i.day.slice(8) === today.slice(8));
  const rank = (i) => (i.day.slice(5) === mmdd ? 0 : 1) * 10 + (i.mediaId ? 0 : 1) + ({ memory: 0, letter: 0.2, photo: 0.4 }[i.kind] || 0);
  const byDay = new Map();
  for (const i of past.sort((a, b) => rank(a) - rank(b))) if (!byDay.has(i.day)) byDay.set(i.day, i);
  const yearly = (i) => (i.day.slice(5) === mmdd ? 0 : 1);
  // the same date in earlier years and the newest go in first; they show oldest to newest, like calendar pages
  return [...byDay.values()].sort((a, b) => yearly(a) - yearly(b) || b.day.localeCompare(a.day)).slice(0, MAX)
    .sort((a, b) => a.day.localeCompare(b.day));
}

async function gather(now) {
  const me = profile.active();
  const [cartas, memories, streaks] = await Promise.all([
    import('./cartas.js'),
    db.query('memories').catch(() => []), db.query('streaks').catch(() => []),
  ]);
  const out = [];
  for (const m of memories.filter((x) => !x.deleted && !x.draft && x.visibility !== 'self' && !x.private && util.isValidDay(x.date))) {
    out.push({ kind: 'memory', day: m.date, title: m.title && !/^\s*$/.test(m.title) ? m.title : 'Un recuerdo', note: m.note || '', mediaId: m.mediaIds?.[0] || null, href: `#/capsula/${encodeURIComponent(m.id)}` });
  }
  for (const l of await cartas.onThisDayLetters(me, now).catch(() => [])) {
    const mine = l.to === me;
    out.push({ kind: 'letter', day: l.day, title: `«${l.label}»`, note: mine ? `Abriste esta carta de ${profile.nick(l.from)}.` : `${profile.nick(l.to)} abrió tu carta.`, mediaId: null, href: '#/cartas' });
  }
  for (const s of streaks.filter((x) => x.type === 'dayphoto' && !x.deleted && x.mediaId)) {
    out.push({ kind: 'photo', day: s.day, title: s.by === me ? 'Tu foto del día' : `La foto de ${profile.nick(s.by)}`, note: '', mediaId: s.mediaId, href: '#/inicio' });
  }
  return pickMoments(out, now);
}

/** The card for Inicio, or null when nothing happened on a day like today. */
export async function homeCard({ now = new Date() } = {}) {
  const moments = await gather(now);
  if (!moments.length) return null;
  const urls = new Set();
  const mediaUrl = async (id) => {
    const b = id ? await db.getMedia(id).catch(() => null) : null;
    if (!b || !b.type?.startsWith('image/')) return null;
    const u = URL.createObjectURL(b); urls.add(u); return u;
  };
  const day = now.getDate();
  const tz = el('span', { class: 'himekuri-tz', 'aria-hidden': 'true' });
  const page = el('a', { class: 'himekuri-page' });
  const sheet = el('div', { class: 'himekuri-sheet' },
    el('div', { class: 'himekuri-bind', 'aria-hidden': 'true' }, el('i'), el('i')),
    el('div', { class: 'himekuri-head' },
      el('div', {},
        el('h2', { class: 'card-kicker', id: 'himekuri-title' }, 'Un día como hoy'),
        el('p', { class: 'himekuri-date', 'aria-hidden': 'true' },
          el('span', { class: 'himekuri-num' }, String(day)),
          el('span', { class: 'himekuri-mon' }, el('b', {}, fmtWeekday.format(now)), `de ${fmtMonth.format(now)}`))),
      tz),
    page);
  let current = -1;
  const paint = async (i) => {
    const m = moments[i];
    const k = KINDS[m.kind];
    const src = await mediaUrl(m.mediaId);
    const d = util.parseDay(m.day);
    tz.textContent = `hace ${agoShort(m.day, now)}`;
    page.href = m.href;
    page.setAttribute('aria-label', `Hace ${agoShort(m.day, now)}: ${m.title}. ${k.name}.`);
    page.replaceChildren(
      el('figure', { class: `himekuri-photo${src ? '' : ' is-empty'}`, 'aria-hidden': 'true' },
        el('span', { class: 'himekuri-tape' }),
        src ? el('img', { src, alt: '', decoding: 'async' })
          : el('span', { class: 'himekuri-blank' }, el('span', { class: 'himekuri-seal' }, icon(m.kind === 'letter' ? 'jp-futo' : 'jp-sakura', { size: 30 })))),
      el('p', { class: 'himekuri-src' }, icon(k.icon, { size: 14 }), `${k.name} · ${fmtShort.format(d)}`),
      el('p', { class: 'himekuri-t' }, m.title),
      m.note ? el('p', { class: 'himekuri-n clamp-2' }, m.note) : null);
  };
  const chips = moments.length > 1 ? el('div', { class: 'himekuri-chips', role: 'group', 'aria-label': 'Otros días como hoy' },
    moments.map((m, i) => {
      const b = el('button', { class: 'himekuri-chip', type: 'button', 'aria-pressed': 'false', 'aria-label': `Hace ${agoShort(m.day, now)}, ${KINDS[m.kind].name}` },
        icon(KINDS[m.kind].icon, { size: 15 }), agoShort(m.day, now));
      b.addEventListener('click', () => go(i));
      return b;
    })) : null;
  const go = async (i, { quiet = false } = {}) => {
    if (i === current) return;
    const forward = i > current;
    current = i;
    chips?.querySelectorAll('.himekuri-chip').forEach((c, j) => { c.setAttribute('aria-pressed', String(j === i)); c.classList.toggle('is-on', j === i); });
    if (quiet || util.prefersReducedMotion()) { await paint(i); return; }
    util.haptic?.('tap');
    sheet.classList.remove('is-turning', 'is-back'); void sheet.offsetWidth;
    sheet.classList.add('is-turning'); if (!forward) sheet.classList.add('is-back');
    await new Promise((r) => setTimeout(r, 180));
    await paint(i);
    setTimeout(() => sheet.classList.remove('is-turning', 'is-back'), 260);
  };
  await go(0, { quiet: true });
  const card = el('article', { class: 'card home-card himekuri', 'aria-labelledby': 'himekuri-title' },
    el('span', { class: 'himekuri-under', 'aria-hidden': 'true' }), sheet, chips, el('span', { class: 'himekuri-tear', 'aria-hidden': 'true' }));
  card.cleanup = () => urls.forEach((u) => URL.revokeObjectURL(u));
  return card;
}
