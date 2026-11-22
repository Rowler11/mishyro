// Inicio (docs/05 Pestaña 1, Mejoras en Inicio, §13, §24 and "Orden de las tarjetas de Inicio").
// Cards in this order, skipping the ones that do not apply:
// 1 counter · 2 good morning / night · 3 today's celebration · 4 Pensando en ti · 5 omikuji ·
// 6 next special date · 6b next milestone · 7 + 8 "Para hoy" (question, challenge, mood) · 10 backup reminder.
// Layout "Carrusel del día" (decided 2026-11-19): counter on top, the day's cards (greeting,
// Pensando en ti, reason) in a swipeable carousel, then dates, milestone and backup.
// From 900 px the carousel turns into a row of three cards.
// Revised the same day (option B "anillo"): the counter sits inside a ring that fills up toward the
// next anniversary; special dates and the next milestone share one "Lo que viene" list (the
// anniversary is not repeated there) and the backup reminder is a slim note.
import { ui, util, db, profile, seed, sync, CONFIG } from '../core.js';
import * as time from '../core/time.js';
import * as dates from '../core/dates.js';
import * as fx from '../core/fx.js';

const { el, icon } = util;
let seasonShown = false; // the season effect plays the first time Inicio opens in each session
const fmtLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Small per-device memory (safe to lose): last omikuji, last phrase, petals and confetti shown today.
const KEY = (k) => `${CONFIG.storageKey}.home.${k}`;
const recall = (k) => { try { return localStorage.getItem(KEY(k)); } catch { return null; } };
const remember = (k, v) => { try { localStorage.setItem(KEY(k), v); } catch { /* private mode */ } };

const ready = (items) => items.filter((x) => !x.deleted && !x.hidden && !seed.needsCompletion(x.text));

async function loadData() {
  const [content, specialDates, milestonesRec, thinking, pets, meta] = await Promise.all([
    db.query('content'), db.query('specialDates'), db.rawGet('profile', 'milestones'),
    db.query('thinkingOfYou', { index: 'at' }), db.query('pets'), db.getMeta(),
  ]);
  const hasPets = pets.some((p) => !p.deleted);
  const ofKind = (k) => ready(content.filter((c) => c.kind === k && (c.requires !== 'pets' || hasPets)));
  return {
    reasons: ofKind('reason'), phrases: ofKind('phrase'), allPhrases: content.filter((c) => c.kind === 'phrase'), morning: ofKind('goodMorning'), night: ofKind('goodNight'),
    specialDates: specialDates.filter((d) => !d.deleted && !d.hidden),
    milestones: milestonesRec?.items?.length ? milestonesRec.items : CONFIG.milestones,
    thinking, meta,
  };
}

// ---------- 1. counter, inside a ring toward the next anniversary ----------
// Ensō (decided 2026-11-19, Inicio A): a brush circle painted from -60° that closes on the anniversary.
const ENSO_FROM = -60;
const ENSO_SWEEP = 330;
const ensoArc = (r) => {
  const p = (a) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)].map((n) => n.toFixed(1)).join(' ');
  return `M${p(ENSO_FROM)} A${r} ${r} 0 1 1 ${p(ENSO_FROM + ENSO_SWEEP)}`;
};

/** Where the couple is in the current year together: last and next anniversary, 0..1 between them. */
export function anniversaryRing(start, now = new Date()) {
  const years = time.elapsed(start, now).years;
  const last = time.addMonths(start, years * 12);
  const next = time.addMonths(start, (years + 1) * 12);
  const progress = Math.min(1, Math.max(0, (now - last) / (next - last)));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = util.daysBetween(today, new Date(next.getFullYear(), next.getMonth(), next.getDate()));
  const isToday = years > 0 && last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth() && last.getDate() === now.getDate();
  return { years, nextYears: years + 1, progress, daysLeft, isToday, next };
}

function counterCard(start, onNewDay) {
  const big = el('span', { class: 'counter-days' });
  const bigLabel = el('span', { class: 'counter-days-label' });
  const goal = el('p', { class: 'counter-goal' });
  const detail = el('span', {});
  const clock = el('span', { class: 'counter-clock' });
  const sr = el('p', { class: 'sr-only' });
  const petals = el('div', { class: 'petals', 'aria-hidden': 'true' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const ring = svg('svg', { class: 'counter-ring-svg', viewBox: '0 0 200 200', 'aria-hidden': 'true' });
  // Rough brush edges: a little noise displaces the stroke.
  const ink = svg('filter', { id: 'enso-ink', x: '-10%', y: '-10%', width: '120%', height: '120%' });
  ink.append(svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '.06', numOctaves: '3', seed: '4' }), svg('feDisplacementMap', { in: 'SourceGraphic', scale: '7' }));
  const defs = svg('defs', {}); defs.append(ink);
  const dash = { pathLength: '100', 'stroke-dasharray': '100', 'stroke-dashoffset': '100' };
  const arc = svg('path', { class: 'counter-ring-arc', d: ensoArc(82), ...dash });
  const echo = svg('path', { class: 'counter-ring-echo', d: ensoArc(74), ...dash });
  ring.append(defs, svg('path', { class: 'counter-ring-track', d: ensoArc(82) }), arc, echo);
  const arcs = [arc, echo];
  let lastTotal = null;
  const paint = () => {
    const now = new Date();
    const e = time.elapsed(start, now);
    const r = anniversaryRing(start, now);
    big.textContent = e.totalDays.toLocaleString('es-CO');
    bigLabel.textContent = e.totalDays === 1 ? 'día juntos' : 'días juntos';
    clock.textContent = [e.hours, e.minutes, e.seconds].map((n) => String(n).padStart(2, '0')).join(':');
    if (lastTotal !== e.totalDays) {
      const off = (100 * (1 - (r.isToday ? 1 : r.progress))).toFixed(2);
      arc.setAttribute('stroke-dashoffset', off); echo.setAttribute('stroke-dashoffset', (100 - (100 - off) * 0.82).toFixed(2));
      goal.textContent = r.isToday ? `¡Hoy cumplen ${plural(r.years, 'año', 'años')}!`
        : r.daysLeft === 1 ? `Mañana cumplen ${plural(r.nextYears, 'año', 'años')}` : `Faltan ${r.daysLeft} días para ${r.nextYears === 1 ? 'el primer año' : `los ${r.nextYears} años`}`;
      const parts = [e.years ? plural(e.years, 'año', 'años') : '', e.months ? plural(e.months, 'mes', 'meses') : '', plural(e.days, 'día', 'días')].filter(Boolean);
      detail.textContent = `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0]} · `;
      sr.textContent = `Llevan ${plural(e.years, 'año', 'años')}, ${plural(e.months, 'mes', 'meses')} y ${plural(e.days, 'día', 'días')} juntos: ${plural(e.totalDays, 'día', 'días')} en total. ${goal.textContent}.`;
      if (lastTotal !== null) onNewDay(petals);
      lastTotal = e.totalDays;
    }
  };
  paint();
  const card = el('article', { class: 'card home-card counter-card', 'aria-labelledby': 'counter-title' },
    petals,
    el('h2', { class: 'sr-only', id: 'counter-title' }, 'Nuestro tiempo'),
    el('div', { class: 'counter-ring', 'aria-hidden': 'true' }, ring, el('p', { class: 'counter-big' }, big, bigLabel),
      el('span', { class: 'counter-seal' }, icon('heart', { size: 11 }))),
    el('div', { 'aria-hidden': 'true' }, goal, el('p', { class: 'counter-detail' }, detail, clock)),
    sr);
  // Ticks every second while visible; stops when the tab is hidden and recalculates on return.
  let timer = null;
  const startTimer = () => { if (!timer) { paint(); timer = setInterval(paint, 1000); } };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const onVis = () => (document.hidden ? stopTimer() : startTimer());
  document.addEventListener('visibilitychange', onVis);
  if (!document.hidden) startTimer();
  // The brush paints the circle once, from empty, when Inicio opens.
  if (!util.prefersReducedMotion()) {
    const targets = arcs.map((a) => a.getAttribute('stroke-dashoffset'));
    arcs.forEach((a) => a.setAttribute('stroke-dashoffset', '100'));
    requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach((a, i) => { a.classList.add('is-filling'); a.setAttribute('stroke-dashoffset', targets[i]); })));
  }
  return { card, petals, cleanup: () => { stopTimer(); document.removeEventListener('visibilitychange', onVis); } };
}

function noStartCard() {
  return el('article', { class: 'card home-card' },
    el('h2', { class: 'card-kicker' }, 'Nuestro tiempo'),
    el('p', {}, 'Falta la fecha en que empezaron. Con ella aparece el contador.'),
    ui.button({ label: 'Poner la fecha', iconName: 'calendar', href: '#/ajustes/perfil' }));
}

// ---------- 2. good morning / good night ----------
function greetingCard(data, receiver) {
  const part = time.dayPart();
  const pick = (list, salt) => time.dailyPick(list, { salt });
  const morning = pick(data.morning, 'morning');
  const night = pick(data.night, 'night');
  if (!morning && !night) return null;
  let showing = part === 'night' ? 'night' : 'morning';
  const text = el('p', { class: 'greet-text' });
  const kicker = el('h2', { class: 'card-kicker', id: 'greet-title' });
  const swap = el('button', { class: 'btn btn-ghost btn-small', type: 'button' });
  const card = el('article', { class: `card home-card greet-card greet-${part}`, 'aria-labelledby': 'greet-title' });
  const paint = () => {
    const item = showing === 'night' ? night || morning : morning || night;
    kicker.textContent = showing === 'night' ? 'Buenas noches' : 'Buenos días';
    text.textContent = profile.fill(item.text, receiver);
    // Between 12:00 and 19:00 the morning message stays, softened, with access to tonight's.
    card.classList.toggle('greet-soft', part === 'afternoon' && showing === 'morning');
    swap.hidden = part !== 'afternoon' || !night || !morning;
    swap.textContent = showing === 'morning' ? 'Ver el de la noche' : 'Ver el de la mañana';
  };
  swap.addEventListener('click', () => { showing = showing === 'morning' ? 'night' : 'morning'; paint(); });
  paint();
  card.append(
    el('span', { class: 'greet-sky', 'aria-hidden': 'true' }),
    kicker, text,
    el('div', { class: 'card-actions' },
      ui.button({ label: 'Enviar', iconName: 'share-2', small: true, onClick: () => ui.share({ text: text.textContent }) }),
      swap));
  return card;
}

// ---------- 3. today's celebration ----------
function todayEvents(data, start, receiver) {
  const out = [];
  const today = new Date();
  if (start) {
    const e = time.elapsed(start, today);
    const sameDay = start.getDate() === today.getDate();
    if (e.totalDays > 0 && sameDay && start.getMonth() === today.getMonth()) {
      out.push({ kind: 'anniversary', title: `¡Feliz aniversario! ${plural(e.years, 'año', 'años')} juntos`, text: 'Hoy se celebra todo lo que han construido.' });
    } else if (e.totalDays > 0 && e.months + e.years * 12 > 0 && e.days === 0) {
      const m = e.years * 12 + e.months;
      out.push({ kind: 'monthly', title: `¡Feliz mesiversario! ${plural(m, 'mes', 'meses')}`, text: 'Un mes más eligiéndose.' });
    }
    const ms = time.milestoneProgress(data.milestones, e.totalDays);
    const hit = ms.today || time.roundMilestone(e.totalDays);
    if (hit) out.push({ kind: 'milestone', title: `¡${hit.days.toLocaleString('es-CO')} días juntos!`, text: profile.fill(hit.message || '', receiver), confetti: true });
  }
  for (const d of data.specialDates) {
    if (d.kind === 'anniversary') continue; // already covered by the start date
    const next = time.nextOccurrence(d.date, { recurring: d.recurring || 'yearly', today });
    if (next?.days !== 0) continue;
    const who = d.kind === 'birthday' && d.personOrPetId && profile.PEOPLE.includes(d.personOrPetId) ? profile.name(d.personOrPetId) : '';
    out.push({ kind: d.kind, title: d.kind === 'birthday' ? `¡Feliz cumpleaños${who ? `, ${who}` : ''}!` : d.name, text: next.years ? `${d.kind === 'birthday' ? 'Cumple' : 'Cumple'} ${plural(next.years, 'año', 'años')}.` : 'Es hoy.' });
  }
  return out;
}

function celebrationCard(events) {
  if (!events.length) return null;
  return el('article', { class: 'card home-card celebrate-card', 'aria-labelledby': 'celebrate-title' },
    el('h2', { class: 'card-kicker', id: 'celebrate-title' }, 'Hoy'),
    events.map((ev) => el('div', { class: 'celebrate-item' },
      icon(ev.kind === 'birthday' ? 'cake' : ev.kind === 'milestone' ? 'party-popper' : 'heart', { size: 28, cls: 'celebrate-icon' }),
      el('div', {}, el('p', { class: 'celebrate-title' }, ev.title), ev.text ? el('p', { class: 'muted' }, ev.text) : null))));
}

// ---------- 4. Pensando en ti ----------
function thinkingCard(data, receiver) {
  if (!data.phrases.length) return null;
  const today = util.localDay();
  const month = today.slice(0, 7);
  const mine = data.thinking.filter((t) => t.by === profile.active());
  let todayCount = mine.filter((t) => (t.at || '').slice(0, 10) === today).length;
  let monthCount = mine.filter((t) => (t.at || '').slice(0, 7) === month).length;
  const count = el('p', { class: 'muted small thinking-count', 'aria-live': 'polite' });
  const paintCount = () => {
    count.textContent = todayCount
      ? `Hoy pensaste en ${profile.nick(receiver)} ${todayCount === 1 ? '1 vez' : `${todayCount} veces`} · este mes, ${monthCount}.`
      : monthCount ? `Este mes pensaste en ${profile.nick(receiver)} ${monthCount === 1 ? '1 vez' : `${monthCount} veces`}.` : 'Manda una frase cuando te acuerdes de quien quieres.';
  };
  paintCount();
  const plane = el('span', { class: 'paper-plane', 'aria-hidden': 'true' }, icon('plane', { size: 28 }));
  const fly = () => { plane.classList.remove('fly'); void plane.offsetWidth; plane.classList.add('fly'); util.haptic(15); };
  const status = el('p', { class: 'muted small thinking-status', 'aria-live': 'polite' });
  // Fixed 2026-11-22: with the devices linked it is sent inside the app (the other phone gets a caring
  // notice and sees the phrase on Inicio); sharing by WhatsApp is a separate, optional button. Without
  // sync it still goes through the share sheet, and only counts when something was shared.
  const linked = sync.isLinked();
  const pick = () => { const phrase = time.randomOther(data.phrases, recall('lastPhrase')); remember('lastPhrase', phrase.id); return phrase; };
  const record = async (phrase, via) => {
    await db.put('thinkingOfYou', { at: util.nowISO(), by: profile.active(), phraseId: phrase.id, via });
    todayCount++; monthCount++; paintCount(); fly();
  };
  const btn = el('button', { class: 'btn btn-primary thinking-btn', type: 'button' }, icon('heart'), linked ? `Mandarle a ${profile.nick(receiver)}` : 'Pensando en ti');
  btn.addEventListener('click', async () => {
    const phrase = pick();
    if (linked) {
      btn.disabled = true;
      await record(phrase, 'app');
      status.textContent = `Enviado: «${profile.fill(phrase.text, receiver)}». A ${profile.nick(receiver)} le llega un aviso cariñoso.`;
      util.sound('chime');
      setTimeout(() => { btn.disabled = false; }, 1500);
      return;
    }
    const result = await ui.share({ text: profile.fill(phrase.text, receiver) });
    if (result !== 'shared' && result !== 'copied') { status.textContent = 'No se envió. Toca otra vez y elige por dónde mandarla.'; return; }
    status.textContent = '';
    await record(phrase, 'share');
  });
  const shareAlso = linked ? ui.button({ label: 'Mandar también por otra app', iconName: 'share-2', small: true, variant: 'ghost', onClick: async () => {
    const phrase = pick();
    const result = await ui.share({ text: profile.fill(phrase.text, receiver) });
    if (result === 'shared' || result === 'copied') await record(phrase, 'share');
  } }) : el('p', { class: 'muted small' }, 'Si unen sus teléfonos en ', el('a', { href: '#/ajustes/sincronizar' }, 'Sincronización'), ', le llega dentro de la app.');
  // "Yo también": when the other one thought of you today (it arrives with the sync), one tap answers
  // with a caring notice. The phrase they picked is shown, never anything else.
  const theirs = data.thinking.filter((t) => t.by === receiver && (t.at || '').slice(0, 10) === today).sort((x, y) => (x.at || '').localeCompare(y.at || ''));
  const lastTheirs = theirs[theirs.length - 1];
  const theirPhrase = lastTheirs?.phraseId ? data.allPhrases.find((p) => p.id === lastTheirs.phraseId) : null;
  const answered = lastTheirs && mine.some((t) => t.reply && (t.at || '') > (lastTheirs.at || ''));
  const reply = lastTheirs ? el('div', { class: 'thinking-reply' },
    el('p', { class: 'small' }, icon('heart', { size: 16 }), ` ${profile.nick(receiver)} pensó en ti hoy${theirs.length > 1 ? ` (${theirs.length} veces)` : ''}.`),
    theirPhrase ? el('blockquote', { class: 'thinking-quote' }, profile.fill(theirPhrase.text, profile.active())) : null,
    answered ? el('p', { class: 'muted small' }, 'Le respondiste: yo también.')
      : ui.button({ label: 'Yo también', iconName: 'heart', small: true, variant: 'ghost', onClick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        await db.put('thinkingOfYou', { at: util.nowISO(), by: profile.active(), phraseId: null, reply: true });
        todayCount++; monthCount++; paintCount(); fly();
        util.sound('chime');
        b.replaceWith(el('p', { class: 'muted small' }, sync.isLinked() ? `Listo: a ${profile.nick(receiver)} le llega un aviso cariñoso.` : 'Le respondiste: yo también.'));
      } })) : null;
  return el('article', { class: 'card home-card thinking-card', 'aria-labelledby': 'thinking-title' },
    plane,
    el('h2', { class: 'card-kicker', id: 'thinking-title' }, 'Pensando en ti'),
    reply,
    el('p', {}, linked ? `Un toque y a ${profile.nick(receiver)} le llega una frase bonita.` : `Mándale a ${profile.nick(receiver)} una frase bonita por donde quieras.`),
    btn, status, count, shareAlso);
}

// ---------- 1b. "Hoy los dos pasaron por aquí" ----------
// With the sync on, a device of the other person that talked to the server today means they opened
// the app. Only today and only when it happened: no hour, no "last seen", nothing to check on anyone.
export function bothToday(devices, partner, now = new Date()) {
  const today = util.localDay(now);
  return devices.some((d) => d.person === partner && !d.me && d.seen && util.localDay(new Date(d.seen)) === today);
}
function bothLine(partner) {
  const line = el('p', { class: 'both-today', hidden: true }, icon('heart', { size: 16 }), el('span', {}, 'Hoy los dos pasaron por aquí.'));
  const paint = () => { line.hidden = !(sync.isLinked() && bothToday(sync.devices(), partner)); };
  paint();
  return { node: line, cleanup: sync.onStatus(paint) };
}

// ---------- 5. omikuji ----------
function omikujiCard(data) {
  if (!data.reasons.length) return null;
  const strip = el('div', { class: 'omikuji-strip' });
  const text = el('p', { class: 'omikuji-text', 'aria-live': 'polite' });
  // Paper fortune: a folded band on top, no Japanese text (titles only).
  strip.append(el('span', { class: 'omikuji-top', 'aria-hidden': 'true' }), text);
  const draw = (animate) => {
    const r = time.randomOther(data.reasons, recall('lastReason'));
    remember('lastReason', r.id);
    text.textContent = r.text;
    if (animate) { strip.classList.remove('unroll'); void strip.offsetWidth; strip.classList.add('unroll'); }
  };
  draw(false);
  return el('article', { class: 'card home-card omikuji-card', 'aria-labelledby': 'omikuji-title' },
    el('h2', { class: 'card-kicker', id: 'omikuji-title' }, 'Razón por la que te amo hoy'),
    strip,
    data.reasons.length > 1 ? ui.button({ label: 'Sacar otra', iconName: 'repeat', variant: 'ghost', small: true, onClick: () => draw(true) }) : null);
}

// ---------- the day's cards: one at a time, chosen with buttons (Inicio B, decided 2026-11-19) ----------
// No sideways swipe. "Pensando en ti" shows first. From 900 px the three share one row and the buttons hide.
const SLIDE_LABEL = { 'thinking-card': 'Pensando en ti', 'omikuji-card': 'Razón' };
function daySwitcher(slides) {
  const label = (s) => SLIDE_LABEL[[...s.classList].find((c) => SLIDE_LABEL[c])] || s.querySelector('.card-kicker')?.textContent || 'Saludo';
  const first = Math.max(0, slides.findIndex((s) => s.classList.contains('thinking-card')));
  const buttons = slides.map((s, i) => {
    s.classList.add('home-slide');
    s.id = `day-card-${i}`;
    return el('button', { class: 'day-pick', type: 'button', 'aria-controls': s.id, onClick: () => show(i, true) }, label(s));
  });
  const bar = el('div', { class: 'day-picks', role: 'group', 'aria-label': 'Tarjetas del día' }, buttons);
  bar.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    buttons[(next + buttons.length) % buttons.length].focus();
  });
  function show(i, animate) {
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    if (animate && !util.prefersReducedMotion()) { const s = slides[i]; s.classList.remove('day-in'); void s.offsetWidth; s.classList.add('day-in'); }
  }
  show(first, false);
  return el('section', { class: 'home-day', 'aria-label': 'Lo de hoy' },
    slides.length > 1 ? bar : null,
    el('div', { class: 'home-day-cards' }, slides));
}

// ---------- 6. next special date ----------
function upcomingDates(data, start) {
  return dates.upcoming(dates.withProfile(data.specialDates, start)).filter((d) => d.next.days > 0);
}

// ---------- 6 + 6b. "Lo que viene": special dates and the next milestone in one list ----------
function comingCard(data, start) {
  const ring = start ? anniversaryRing(start) : null;
  const rows = upcomingDates(data, start)
    // The anniversary already shows in the ring; do not repeat it here.
    .filter((d) => !(ring && d.kind === 'anniversary' && d.next.days === ring.daysLeft))
    .map((d) => ({ icon: d.kind === 'birthday' ? 'cake' : d.kind === 'anniversary' ? 'heart' : 'calendar', name: d.name, days: d.next.days, when: fmtLong.format(d.next.date) }));
  if (start) {
    const total = time.elapsed(start).totalDays;
    const ms = time.milestoneProgress(data.milestones, total);
    if (ms.next && !(ring && ms.daysLeft === ring.daysLeft)) rows.push({ icon: 'flag', name: `${ms.next.days.toLocaleString('es-CO')} días juntos`, days: ms.daysLeft, progress: ms.progress });
  }
  const list = rows.sort((a, b) => a.days - b.days).slice(0, 3);
  if (!list.length) return null;
  // A tear-off calendar page per date (Inicio A): the big number is what is left.
  const left = (n) => (n < 60 ? [String(n), n === 1 ? 'día · mañana' : 'días'] : n < 365 ? [String(Math.round(n / 30.4)), 'meses'] : [String(Math.round(n / 365)), Math.round(n / 365) === 1 ? 'año' : 'años']);
  return el('section', { class: 'home-card coming-card', 'aria-labelledby': 'coming-title' },
    el('h2', { class: 'card-kicker', id: 'coming-title' }, 'Lo que viene'),
    el('ul', { class: 'mekuri-row' }, list.map((r) => {
      const [num, unit] = left(r.days);
      return el('li', { class: 'mekuri' },
        el('span', { class: 'mekuri-num' }, num),
        el('span', { class: 'mekuri-unit' }, unit),
        el('span', { class: 'mekuri-name' }, r.name),
        r.when ? el('span', { class: 'mekuri-when' }, r.when) : null);
    })));
}

// ---------- 7 + 8. "Para hoy": the question of the day, the week's challenge and the mood (Fase 3) ----------
// A kind hint first when the other one marked a low mood and allowed it (docs/05 Detalles: Ánimo).
async function todayCard() {
  const [qa, retos, animo, rem, tc] = await Promise.all([import('./preguntas.js'), import('./retos.js'), import('./animo.js'), import('./recordatorios.js'), import('./capsula-tiempo.js')]);
  const spaceRow = await import('../core/sync.js').then(async (m) => {
    const u = m.isLinked() ? await m.lastUsage() : null;
    return u && u.pct >= m.USAGE_WARN ? { href: '#/ajustes/sincronizar', icon: 'hard-drive', title: u.pct >= 100 ? 'Se llenó el espacio en la nube' : 'La nube se está llenando', sub: 'Mira cuánto queda y qué hacer.' } : null;
  }).catch(() => null);
  const [badgeRow, summaryRow, eventRow] = await Promise.all([
    import('./insignias.js').then((m) => m.homeRow()).catch(() => null), import('./resumen.js').then((m) => m.homeRow()).catch(() => null),
    import('./eventos.js').then((m) => m.homeRow()).catch(() => null)]);
  const otdRow = await import('./capsula.js').then((m) => m.homeRow()).catch(() => null);
  const me = profile.active();
  const [pending, week, hint, mine, soon, capsules] = await Promise.all([
    qa.pendingToday().catch(() => null), retos.ensureWeek().catch(() => null), animo.partnerLowHint().catch(() => null), animo.getMood(util.localDay(), me).catch(() => null),
    rem.dueSoon().catch(() => []), tc.readyToOpen(me).catch(() => [])]);
  const rows = [];
  // Cápsula del tiempo (decided 2026-11-20): a notice only on (or after) its opening day.
  // Resumen y Wrapped (a "moment"): only at the end of a month or year and on the anniversary.
  // Eventos de temporada (a "moment", Fase 5): a notice only while an event is on.
  if (eventRow) rows.push(eventRow);
  if (summaryRow) rows.push(summaryRow);
  if (capsules.length) rows.push({ href: '#/capsula-tiempo', icon: 'lock-open', title: capsules.length === 1 ? 'Hoy se abre una cápsula del tiempo' : `Hay ${capsules.length} cápsulas del tiempo para abrir`, sub: capsules[0].title });
  // Recordatorios suaves (§41): mesiversario, the weekly date and their own, when they are close.
  for (const r of soon.slice(0, 2)) rows.push(r);
  // Un día como hoy (Fase 7): a quiet row when a shared memory has this same day in an earlier month or year.
  if (otdRow) rows.push(otdRow);
  if (badgeRow) rows.push(badgeRow);
  if (spaceRow) rows.push(spaceRow);
  if (hint) rows.push({ href: '#/animo', icon: 'heart', title: `Hoy a ${hint.name} podría venirle bien un abrazo`, sub: 'Un detalle pequeño hace la diferencia.' });
  if (pending?.count) rows.push({ href: '#/preguntas', icon: 'message-circle-question', title: pending.partnerDone ? 'Ya te respondieron: te toca' : 'La pregunta del día', sub: pending.first });
  if (week?.rec && !week.rec.doneAt && week.challenge) rows.push({ href: '#/retos', icon: 'flag', title: `Reto de la semana: ${week.challenge.title}`, sub: week.challenge.text });
  if (!mine) rows.push({ href: '#/animo', icon: 'smile', title: '¿Cómo amaneces?', sub: 'Marca tu ánimo en un toque.' });
  if (!rows.length) return null;
  return el('section', { class: 'home-card today-card', 'aria-labelledby': 'today-title' },
    el('h2', { class: 'card-kicker', id: 'today-title' }, 'Para hoy'),
    el('ul', { class: 'today-list' }, rows.map((r) => el('li', {},
      el('a', { class: 'today-row', href: r.href },
        el('span', { class: 'section-icon' }, icon(r.icon, { size: 20 })),
        el('span', { class: 'today-text' }, el('span', { class: 'today-title' }, r.title), r.sub ? el('span', { class: 'muted small clamp-2' }, r.sub) : null),
        icon('chevron-right', { size: 18, cls: 'list-chevron' }))))));
}

// ---------- 10. backup reminder ----------
function backupCard(meta) {
  const last = meta.lastBackupAt ? time.parseStart(meta.lastBackupAt) : null;
  const days = last ? util.daysBetween(last, new Date()) : null;
  if (days !== null && days < 14) return null; // docs/03: remind after 14 days
  return el('aside', { class: 'home-card backup-card', 'aria-labelledby': 'backup-title' },
    icon('hard-drive', { size: 20 }),
    el('p', { class: 'backup-text', id: 'backup-title' }, days === null ? 'Hagan una copia de sus datos.' : `Su última copia fue hace ${days} días.`),
    el('a', { class: 'backup-link', href: '#/ajustes/copia' }, 'Hacer copia'));
}

function celebrateOnce(kind) {
  const key = `${kind}:${util.localDay()}`;
  if (recall('celebrated') === key) return false;
  remember('celebrated', key);
  return true;
}

export async function render() {
  const page = el('section', { class: 'page page-wide home' });
  // Same as the welcome splash: the screen is for whoever holds the phone.
  const header = ui.pageHeader({ title: `Para ${profile.nick(profile.active()) || 'ti'}`, jp: '今', romaji: 'ima' });
  const body = el('div', { class: 'home-cards' }, ui.skeleton(4));
  page.append(header, body);
  // v0.12.0: the season's leaves (fireflies and chōchin at night) fall behind the cards all the time, and a
  // branch (two hanging chōchin at night) in the corner shakes and lets a few more go when tapped.
  let amb = fx.ambient(page);
  const corner = el('div', { class: 'home-corner', 'aria-hidden': 'true' });
  const drawCorner = () => { corner.dataset.kind = fx.ambientKind(); corner.replaceChildren(fx.cornerArt(corner.dataset.kind)); };
  drawCorner();
  corner.addEventListener('click', () => {
    if (util.prefersReducedMotion()) return;
    corner.classList.remove('is-shaking'); void corner.offsetWidth; corner.classList.add('is-shaking');
    util.haptic?.(12);
    const r = corner.getBoundingClientRect(); amb.burst(r.left + r.width * 0.55, r.top + r.height * 0.55);
  });
  corner.addEventListener('animationend', (e) => { if (e.animationName === 'corner-shake') corner.classList.remove('is-shaking'); });
  page.prepend(corner);
  const cornerWatch = new MutationObserver(() => {
    if (corner.dataset.kind !== fx.ambientKind()) drawCorner();
    if (document.documentElement.dataset.seasonal !== 'off' && !page.querySelector('.ambient-canvas')) amb = fx.ambient(page); // switched back on
  });
  cornerWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-seasonal'] });
  let cleanups = [];
  const cleanupAll = () => { cleanups.forEach((fn) => fn()); cleanups = []; };

  const build = async () => {
    cleanupAll();
    let data;
    try { data = await loadData(); } catch (e) {
      body.replaceChildren(ui.emptyState({ title: 'No pudimos leer sus datos', text: 'Cierra y vuelve a abrir la app. Si sigue pasando, revisa el almacenamiento del navegador.', art: 'wave' }));
      console.error(e); return;
    }
    const recv = profile.partnerOf(profile.active());
    header.querySelector('.page-title').textContent = `Para ${profile.nick(profile.active()) || 'ti'}`;
    const start = time.parseStart(profile.startDate());
    const playPetals = (layer) => {
      if (util.prefersReducedMotion()) return;
      layer.replaceChildren(...Array.from({ length: 14 }, (_, i) => el('span', { class: 'petal', style: { '--x': `${Math.round(Math.random() * 100)}%`, '--d': `${(i % 7) * 90}ms`, '--r': `${Math.round(Math.random() * 360)}deg` } })));
      setTimeout(() => layer.replaceChildren(), 2600);
    };
    const counter = start ? counterCard(start, playPetals) : null;
    if (counter) cleanups.push(counter.cleanup);
    const events = todayEvents(data, start, recv);
    const slides = [greetingCard(data, recv), thinkingCard(data, recv), omikujiCard(data)].filter(Boolean);
    const today = await todayCard().catch((e) => { console.error(e); return null; });
    const meeting = await import('./encuentro.js').then((m) => m.homeCard()).catch(() => null);
    const weekend = await import('./citas.js').then((m) => m.weekendCard()).catch(() => null);
    const pet = await import('./mascotas.js').then((m) => m.homeCard({ onChange: build })).catch(() => null);
    const acc = await import('./home-accesos.js');
    const favs = await acc.favoritesCard().catch((e) => { console.error(e); return null; });
    const plant = await import('./planta.js').then((m) => m.homeCard({ onChange: build })).catch((e) => { console.error(e); return null; });
    const guide = await import('./guia.js').then((m) => m.homeCard({ onChange: build })).catch(() => null);
    const both = bothLine(recv);
    cleanups.push(both.cleanup);
    body.replaceChildren(...[
      counter ? counter.card : noStartCard(),
      both.node,
      acc.quickActions(),
      guide,
      celebrationCard(events),
      meeting,
      slides.length ? daySwitcher(slides) : null,
      plant,
      favs,
      comingCard(data, start),
      today,
      acc.discoverCard(),
      weekend,
      pet,
      backupCard(data.meta),
    ].filter(Boolean));
    ui.stagger(body);
    // Seasonal decoration while an event is on (San Valentín hearts, Tanabata lanterns…).
    page.querySelector('.season-deco')?.remove();
    import('./eventos.js').then((m) => m.decoration()).then((d) => { if (d) page.prepend(d); }).catch(() => {});

    // First visit of a new day: petals over the counter; on a milestone day, confetti once.
    if (counter && recall('petalDay') !== util.localDay()) { remember('petalDay', util.localDay()); playPetals(counter.petals); }
    // Fase 7: hanabi once on the anniversary and the birthdays, sakura petals over Inicio on the mesiversario,
    // otherwise the season's particles for a few seconds the first time Inicio opens in this session.
    const big = events.some((e) => e.kind === 'anniversary' || e.kind === 'birthday');
    if (events.some((e) => e.confetti) && !big && celebrateOnce('confetti')) ui.confetti();
    if (!seasonShown) {
      const monthly = events.some((e) => e.kind === 'monthly');
      const play = big && recall('hanabiDay') !== util.localDay() ? () => { remember('hanabiDay', util.localDay()); fx.hanabi(); }
        : monthly && recall('mesDay') !== util.localDay() ? () => { remember('mesDay', util.localDay()); fx.seasonal({ kind: 'sakura', count: 22, force: true }); }
        : () => {}; // the everyday season effect now lives behind the cards (fx.ambient)
      // Inicio can be drawn twice while the app starts: whichever is on screen when the welcome goes plays it once.
      fx.whenClear().then((ok) => { if (ok && !seasonShown && /^#\/inicio\b/.test(location.hash)) { seasonShown = true; play(); } });
    }

    // Lucky cat: a little hello after a few days away (per device).
    const lastOpen = recall('lastOpen');
    remember('lastOpen', util.localDay());
    if (lastOpen && util.daysBetween(util.parseDay(lastOpen), new Date()) >= 3) ui.toast('El gatito de la suerte te saluda: ¡qué bueno verte de nuevo!', { tone: 'success' });
  };

  await build();
  const offProfile = profile.onProfileChange(() => build());
  return { node: page, cleanup: () => { cleanupAll(); offProfile(); fx.stopAll(); amb.stop(); cornerWatch.disconnect(); } };
}
