// Medidor de ánimo (docs/05 §23, Detalles: Medidor de ánimo). One quick mark per person and day
// with CONFIG.moodScale and an optional note (the Diario also feeds it). Week and month charts in
// inline SVG with both people on one axis, a legend, direct labels, a hover tooltip and a table for
// screen readers. Only to get to know each other: no judgements, no diagnoses.
// Low mood hint: if someone marks a low mood AND allows it, the other one sees a kind suggestion
// on Inicio. Off by default.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;
export const MOODS = CONFIG.moodScale || [];
const fmtShort = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const moodOf = (level) => MOODS.find((m) => m.level === level) || null;
export const moodId = (day, who) => `mood:${day}:${who}`;
const PEOPLE = ['sofia', 'david'];

export async function getMood(day, who) { return db.get('moods', moodId(day, who)); }

/**
 * Save the mood of a day. A manual mark wins over one that came from the Diario, so writing in
 * the diary never overwrites what someone marked by hand.
 */
export async function saveMood(day, level, { note, source = 'manual', allowHint } = {}) {
  const me = profile.active();
  const prev = await getMood(day, me);
  if (source === 'diary' && prev && prev.source === 'manual') return prev;
  const rec = { ...(prev || {}), id: moodId(day, me), date: day, by: me, level, source,
    note: note !== undefined ? note : prev?.note || '', allowHint: allowHint !== undefined ? allowHint : !!prev?.allowHint };
  await db.put('moods', rec);
  return rec;
}

/** For Inicio: the partner marked a low mood today and allowed the hint. */
export async function partnerLowHint() {
  const partner = profile.partnerOf(profile.active());
  const m = await getMood(util.localDay(), partner);
  return m && m.level <= 2 && m.allowHint ? { name: profile.name(partner) } : null;
}

/** The 5 faces as a radio group. */
export function moodPicker({ value = null, onChange, label = '¿Cómo te sientes?' } = {}) {
  const name = `mood-${util.uuid().slice(0, 6)}`;
  const group = el('div', { class: 'mood-picker', role: 'radiogroup', 'aria-label': label });
  for (const m of MOODS) {
    const id = `${name}-${m.level}`;
    const r = el('input', { type: 'radio', name, id, value: String(m.level), class: 'segmented-input', checked: value === m.level });
    r.addEventListener('change', () => { if (r.checked) { util.haptic(8); onChange?.(m.level); } });
    group.append(r, el('label', { for: id, class: 'mood-option', style: { '--mood': m.color } },
      el('span', { class: 'mood-emoji', 'aria-hidden': 'true' }, m.emoji), el('span', { class: 'mood-name' }, m.name)));
  }
  return group;
}

// ---------- chart ----------
function daysBack(n, end = new Date()) {
  return Array.from({ length: n }, (_, i) => new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1 - i)));
}

function chart(moods, days) {
  const NS = 'http://www.w3.org/2000/svg';
  // The viewBox follows the screen width so the 12px labels stay 12px on a phone.
  const W = Math.round(Math.max(300, Math.min(640, (document.querySelector('.main')?.clientWidth || 640) - 64))); const H = 220; const L = 30; const R = 52; const T = 14; const B = 30;
  const x = (i) => L + (days.length === 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (lvl) => T + ((5 - lvl) * (H - T - B)) / 4;
  const mk = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const keys = days.map((d) => util.localDay(d));
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mood-chart', role: 'img', 'aria-label': 'Gráfico del ánimo de los dos' });
  for (let lvl = 1; lvl <= 5; lvl++) {
    svg.append(mk('line', { x1: L, x2: W - R, y1: y(lvl), y2: y(lvl), class: 'mood-grid' }));
    svg.append(mk('text', { x: L - 8, y: y(lvl), class: 'mood-axis', 'text-anchor': 'end', 'dominant-baseline': 'central' }, moodOf(lvl)?.emoji || String(lvl)));
  }
  const step = days.length > 10 ? Math.ceil(days.length / 6) : 1;
  days.forEach((d, i) => { if (i % step === 0 || i === days.length - 1) svg.append(mk('text', { x: x(i), y: H - 8, class: 'mood-axis', 'text-anchor': 'middle' }, days.length > 10 ? String(d.getDate()) : fmtShort.format(d))); });
  for (const who of PEOPLE) {
    const pts = keys.map((k, i) => { const m = moods.get(`${k}:${who}`); return m ? [x(i), y(m.level), m.level] : null; });
    // Line segments only between consecutive days that both have a mark.
    let d = '';
    pts.forEach((p, i) => { if (!p) return; d += `${pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`; });
    if (d) svg.append(mk('path', { d, class: `mood-line s-${who}` }));
    pts.forEach((p) => { if (p) svg.append(mk('circle', { cx: p[0], cy: p[1], r: 4.5, class: `mood-dot s-${who}` })); });
    const last = [...pts].reverse().find(Boolean);
    if (last) svg.append(mk('text', { x: Math.min(last[0] + 10, W - 4), y: last[1], class: `mood-label s-${who}`, 'dominant-baseline': 'central' }, profile.name(who)));
  }
  // Hover / touch: a crosshair and a tooltip with the day and both marks.
  const cross = mk('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'mood-cross' });
  cross.style.display = 'none';
  svg.append(cross);
  const tip = el('div', { class: 'mood-tip', role: 'status', hidden: true });
  const wrap = el('div', { class: 'mood-chart-wrap' }, svg, tip);
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let i = Math.round(((px - L) / (W - L - R)) * (days.length - 1));
    i = Math.max(0, Math.min(days.length - 1, i));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    const lines = PEOPLE.map((who) => { const m = moods.get(`${keys[i]}:${who}`); return `${profile.name(who)}: ${m ? `${moodOf(m.level)?.emoji} ${moodOf(m.level)?.name}` : 'sin marcar'}`; });
    tip.replaceChildren(el('strong', {}, fmtDay.format(days[i])), ...lines.map((t) => el('span', {}, t)));
    tip.hidden = false;
    tip.style.left = `${Math.min(r.width - 170, Math.max(0, (x(i) / W) * r.width - 85))}px`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.style.display = 'none'; });
  return wrap;
}

function stats(moods, days, who) {
  const list = days.map((d) => moods.get(`${util.localDay(d)}:${who}`)).filter(Boolean);
  if (!list.length) return null;
  const avg = list.reduce((n, m) => n + m.level, 0) / list.length;
  const best = list.reduce((a, b) => (b.level > a.level ? b : a));
  return { avg, best, count: list.length };
}

function table(moods, days) {
  return el('table', { class: 'sr-only' },
    el('caption', {}, 'Ánimo por día'),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Día'), PEOPLE.map((w) => el('th', { scope: 'col' }, profile.name(w))))),
    el('tbody', {}, days.map((d) => el('tr', {}, el('th', { scope: 'row' }, fmtDay.format(d)),
      PEOPLE.map((w) => { const m = moods.get(`${util.localDay(d)}:${w}`); return el('td', {}, m ? moodOf(m.level)?.name || String(m.level) : 'Sin marcar'); })))));
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page animo' });
  page.append(ui.pageHeader({ title: 'Ánimo', jp: '気分', romaji: 'kibun', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let range = 'week';

  const draw = async () => {
    const me = profile.active(); const partner = profile.partnerOf(me);
    const today = util.localDay();
    const all = await db.query('moods');
    const moods = new Map(all.map((m) => [`${m.date}:${m.by}`, m]));
    const mine = moods.get(`${today}:${me}`);
    const theirs = moods.get(`${today}:${partner}`);
    let level = mine?.level || null;
    const note = ui.input({ maxlength: 140, value: mine?.note || '', placeholder: 'Una nota corta (opcional)' });
    const hint = ui.toggle({ label: `Si marco un ánimo bajo, ${profile.name(partner)} ve una sugerencia amable en Inicio`, checked: !!mine?.allowHint, hint: 'No le muestra tu nota.' });
    const save = async () => {
      if (!level) { ui.toast('Elige cómo te sientes.'); return; }
      await saveMood(today, level, { note: note.value.trim(), source: 'manual', allowHint: hint.querySelector('input').checked });
      ui.toast('Listo, quedó guardado.', { tone: 'success' });
      draw();
    };
    const days = daysBack(range === 'week' ? 7 : 30);
    const summary = PEOPLE.map((w) => {
      const s = stats(moods, days, w);
      return el('div', { class: 'card paper-card mood-stat' },
        el('span', { class: `mood-key s-${w}`, 'aria-hidden': 'true' }),
        el('span', { class: 'mood-stat-name' }, profile.name(w)),
        s ? [el('span', { class: 'small' }, `Promedio: ${moodOf(Math.round(s.avg))?.emoji || ''} ${s.avg.toFixed(1)}`),
          el('span', { class: 'muted small' }, `Día más alto: ${fmtShort.format(util.parseDay(s.best.date))}`)]
          : el('span', { class: 'muted small' }, 'Sin marcas en este periodo'));
    });
    const notes = all.filter((m) => m.note && days.some((d) => util.localDay(d) === m.date)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    body.replaceChildren(...[
      el('section', { class: 'card paper-card stack' },
        el('span', { class: 'card-kicker' }, mine ? 'Hoy marcaste' : `¿Cómo amaneces, ${profile.name(me)}?`),
        moodPicker({ value: level, onChange: (v) => { level = v; } }),
        note, hint,
        el('div', { class: 'btn-row' }, ui.button({ label: mine ? 'Actualizar' : 'Guardar', iconName: 'check', variant: 'primary', onClick: save })),
        theirs ? el('p', { class: 'muted small' }, `${profile.name(partner)} hoy: ${moodOf(theirs.level)?.emoji} ${moodOf(theirs.level)?.name}`) : el('p', { class: 'muted small' }, `${profile.name(partner)} todavía no marca su ánimo de hoy.`)),
      el('section', { class: 'card paper-card stack' },
        el('div', { class: 'mood-chart-head' },
          el('span', { class: 'card-kicker' }, range === 'week' ? 'Esta semana' : 'Últimos 30 días'),
          ui.segmented({ label: 'Periodo', value: range, options: [{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }], onChange: (v) => { range = v; draw(); } })),
        el('div', { class: 'mood-legend', 'aria-hidden': 'true' }, PEOPLE.map((w) => el('span', {}, el('span', { class: `mood-key s-${w}` }), profile.name(w)))),
        chart(moods, days), table(moods, days),
        el('div', { class: 'mood-stats' }, summary)),
      notes.length ? el('section', { class: 'card paper-card stack-tight' },
        el('span', { class: 'card-kicker' }, 'Notas'),
        el('ul', { class: 'mood-notes' }, notes.map((m) => el('li', {}, el('span', { 'aria-hidden': 'true' }, moodOf(m.level)?.emoji || ''), el('span', {}, el('strong', {}, `${profile.name(m.by)} · ${fmtShort.format(util.parseDay(m.date))}: `), m.note))))) : null,
      el('p', { class: 'muted small' }, icon('heart', { size: 14 }), ' Es solo para conocerse mejor. No mide ni juzga a nadie.'),
    ].filter(Boolean));
  };
  await draw();
  const off = profile.onProfileChange(() => draw());
  return { node: page, cleanup: off };
}
