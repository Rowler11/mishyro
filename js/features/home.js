// Inicio (docs/05 Pestaña 1, Mejoras en Inicio, §13, §24 and "Orden de las tarjetas de Inicio").
// Cards in this order, skipping the ones that do not apply:
// 1 counter · 2 good morning / night · 3 today's celebration · 4 Pensando en ti · 5 omikuji ·
// 6 next special date · 6b next milestone · 10 backup reminder.
// Layout "Carrusel del día" (decided 2026-11-19): counter on top, the day's cards (greeting,
// Pensando en ti, reason) in a swipeable carousel, then dates, milestone and backup.
// From 900 px the carousel turns into a row of three cards.
// Revised the same day (option B "anillo"): the counter sits inside a ring that fills up toward the
// next anniversary; special dates and the next milestone share one "Lo que viene" list (the
// anniversary is not repeated there) and the backup reminder is a slim note.
import { ui, util, db, profile, seed, CONFIG } from '../core.js';
import * as time from '../core/time.js';

const { el, icon } = util;
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
    reasons: ofKind('reason'), phrases: ofKind('phrase'), morning: ofKind('goodMorning'), night: ofKind('goodNight'),
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
      el('span', { class: 'counter-seal' }, icon('heart', { size: 16 }))),
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
    if (ms.today) out.push({ kind: 'milestone', title: `¡${ms.today.days.toLocaleString('es-CO')} días juntos!`, text: profile.fill(ms.today.message || '', receiver), confetti: true });
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
  const btn = el('button', { class: 'btn btn-primary thinking-btn', type: 'button' }, icon('heart'), 'Pensando en ti');
  btn.addEventListener('click', async () => {
    const phrase = time.randomOther(data.phrases, recall('lastPhrase'));
    remember('lastPhrase', phrase.id);
    const result = await ui.share({ text: profile.fill(phrase.text, receiver) });
    if (result !== 'shared' && result !== 'copied') return;
    await db.put('thinkingOfYou', { at: util.nowISO(), by: profile.active(), phraseId: phrase.id });
    todayCount++; monthCount++; paintCount();
    plane.classList.remove('fly'); void plane.offsetWidth; plane.classList.add('fly');
    util.haptic(15);
  });
  return el('article', { class: 'card home-card thinking-card', 'aria-labelledby': 'thinking-title' },
    plane,
    el('h2', { class: 'card-kicker', id: 'thinking-title' }, 'Pensando en ti'),
    el('p', {}, `Mándale a ${profile.nick(receiver)} una frase bonita por donde quieras.`),
    btn, count);
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

// ---------- the day's carousel ----------
function carousel(slides, cleanups) {
  const track = el('div', { class: 'home-carousel-track', tabindex: '0', 'aria-label': 'Tarjetas del día. Desliza de lado para ver las demás.' });
  slides.forEach((s, i) => { s.classList.add('home-slide'); s.setAttribute('aria-roledescription', 'tarjeta'); s.dataset.index = String(i); track.append(s); });
  const dots = slides.map((s, i) => el('button', {
    class: 'home-dot', type: 'button',
    'aria-label': `Tarjeta ${i + 1} de ${slides.length}: ${s.querySelector('.card-kicker')?.textContent || ''}`,
    onClick: () => track.scrollTo({ left: s.offsetLeft - track.firstElementChild.offsetLeft, behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' }),
  }));
  const mark = () => {
    const x = track.scrollLeft;
    let best = 0;
    slides.forEach((s, i) => { if (Math.abs(s.offsetLeft - track.firstElementChild.offsetLeft - x) < Math.abs(slides[best].offsetLeft - track.firstElementChild.offsetLeft - x)) best = i; });
    dots.forEach((d, i) => (i === best ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  };
  let frame = 0;
  const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(mark); };
  track.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => cancelAnimationFrame(frame));
  mark();
  return el('section', { class: 'home-carousel', 'aria-roledescription': 'carrusel', 'aria-label': 'Lo de hoy' },
    track, slides.length > 1 ? el('div', { class: 'home-dots' }, dots) : null);
}

// ---------- 6. next special date ----------
function upcomingDates(data, start) {
  const today = new Date();
  const list = [];
  const hasAnniversary = data.specialDates.some((d) => d.kind === 'anniversary');
  if (start && !hasAnniversary) list.push({ id: 'start', name: 'Nuestro aniversario', kind: 'anniversary', date: util.localDay(start), recurring: 'yearly' });
  for (const who of profile.PEOPLE) {
    const birth = profile.person(who).birth;
    const listed = data.specialDates.some((d) => d.kind === 'birthday' && d.personOrPetId === who);
    if (birth && !listed) list.push({ id: `birth:${who}`, name: `Cumpleaños de ${profile.name(who)}`, kind: 'birthday', date: birth, recurring: 'yearly' });
  }
  list.push(...data.specialDates);
  return list.map((d) => ({ ...d, next: time.nextOccurrence(d.date, { recurring: d.recurring || 'yearly', today }) }))
    .filter((d) => d.next && d.next.days > 0)
    .sort((a, b) => a.next.days - b.next.days);
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
    body.replaceChildren(...[
      counter ? counter.card : noStartCard(),
      celebrationCard(events),
      slides.length ? carousel(slides, cleanups) : null,
      comingCard(data, start),
      backupCard(data.meta),
    ].filter(Boolean));
    ui.stagger(body);

    // First visit of a new day: petals over the counter; on a milestone day, confetti once.
    if (counter && recall('petalDay') !== util.localDay()) { remember('petalDay', util.localDay()); playPetals(counter.petals); }
    if (events.some((e) => e.confetti || e.kind === 'anniversary' || e.kind === 'birthday') && celebrateOnce('confetti')) ui.confetti();

    // Lucky cat: a little hello after a few days away (per device).
    const lastOpen = recall('lastOpen');
    remember('lastOpen', util.localDay());
    if (lastOpen && util.daysBetween(util.parseDay(lastOpen), new Date()) >= 3) ui.toast('El gatito de la suerte te saluda: ¡qué bueno verte de nuevo!', { tone: 'success' });
  };

  await build();
  const offProfile = profile.onProfileChange(() => build());
  return { node: page, cleanup: () => { cleanupAll(); offProfile(); } };
}
