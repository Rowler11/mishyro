// Calendario del ciclo (docs/05 §20) with its private layer. Sofía decides everything (decided
// 2026-11-20): every record lives only on her devices ("Solo yo", her personal sync key) unless she
// marks it "Visible para David"; only those travel to him, end-to-end encrypted with the cycle key,
// and he sees them read-only. Turning the mark off removes his copy (the record changes id, so the
// shared one is purged). Predictions are estimates, never medical or contraceptive advice, and are
// shown only to her. Nothing here goes to the Resumen, insignias, rachas, .ics, Galería, search or Diario.
// cycleDays:   { id: 'cycle:<date>[:v]', date, period, flow, symptoms[], mood, note, owner, visibility, visibleToPartner, private }
// intimateLog: { id, date, mood, protection: 'si'|'no'|'na', note (≤140), owner, visibility, visibleToPartner, private }
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import { MOODS } from './animo.js';
import { barChart, lineChart } from './hogar-kit.js';

const { el, icon } = util;
const C = CONFIG.cycle || {};
const OWNER = C.owner || 'sofia';
const PRIV = CONFIG.privacy || {};
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const addDay = (day, n) => { const d = util.parseDay(day); d.setDate(d.getDate() + n); return util.localDay(d); };
const diff = (a, b) => util.daysBetween(util.parseDay(a), util.parseDay(b));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const DEFAULTS = {
  hidePrivate: !!PRIV.hidePrivateByDefault,
  shareCycleByDefault: !PRIV.cycleRecordsPrivateByDefault && !!PRIV.visibleToPartnerByDefault,
  shareIntimateByDefault: false,
  cycleLength: C.cycleLength || 28,
  periodLength: C.periodLength || 5,
  selfCare: true,
};
export const PROTECTION = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }, { value: 'na', label: 'No aplica' }];
export const PHASES = { menstrual: 'Menstruación', folicular: 'Folicular', fertil: 'Ventana fértil', lutea: 'Lútea' };
const SELF_CARE = {
  menstrual: ['Hoy toca ir con calma. Agua, algo caliente y descanso sin culpa.', 'Pide lo que necesites: una manta, un té o un abrazo largo.'],
  folicular: ['La energía suele subir estos días. Buen momento para planear algo juntos.'],
  fertil: ['Escucha a tu cuerpo y date un rato para ti.'],
  lutea: ['Si te sientes más sensible, está bien. Sé amable contigo.', 'Un antojo rico y una película pueden ser un gran plan.'],
};

// ---------- pure helpers (tested) ----------
const isPeriodDay = (r) => !!r.period && r.flow !== 'none';

/** Groups period days into periods. Days up to 2 apart belong to the same period. */
export function periods(days) {
  const list = [...new Set(days.filter(isPeriodDay).map((r) => r.date))].sort();
  const out = [];
  for (const d of list) {
    const cur = out[out.length - 1];
    if (cur && diff(cur.end, d) <= 2) cur.end = d;
    else out.push({ start: d, end: d });
  }
  return out.map((p) => ({ ...p, length: diff(p.start, p.end) + 1 }));
}

/** Lengths from one start to the next, keeping only believable cycles (15 to 60 days). */
export function cycleLengths(ps) {
  const out = [];
  for (let i = 1; i < ps.length; i++) {
    const n = diff(ps[i - 1].start, ps[i].start);
    if (n >= 15 && n <= 60) out.push({ start: ps[i - 1].start, length: n });
  }
  return out;
}

/** Average of the last 3 to 6 cycles (or the defaults), the variation and whether it is reliable. */
export function stats(ps, { cycleLength = 28, periodLength = 5 } = {}) {
  const lengths = cycleLengths(ps).slice(-6).map((c) => c.length);
  const durs = ps.slice(-6).map((p) => p.length).filter((n) => n <= 10);
  const avg = (a) => Math.round(a.reduce((s, n) => s + n, 0) / a.length);
  const variation = lengths.length ? Math.max(...lengths) - Math.min(...lengths) : 0;
  return {
    cycle: lengths.length ? avg(lengths) : cycleLength,
    period: durs.length ? avg(durs) : periodLength,
    variation, count: lengths.length,
    reliable: lengths.length >= 3 && variation <= 7,
  };
}

/** Next start (± margin), ovulation (start − 14) and fertile window (−5..+1), plus 3 cycles ahead. */
export function predict(ps, settings, today = util.localDay()) {
  if (!ps.length) return null;
  const st = stats(ps, settings);
  const last = ps[ps.length - 1];
  const margin = st.reliable ? Math.max(1, Math.ceil(st.variation / 2)) : 3;
  const next = addDay(last.start, st.cycle);
  const late = Math.max(0, diff(next, today));
  const ahead = [];
  for (let i = 0; i < 3; i++) {
    const start = addDay(last.start, st.cycle * (i + 1));
    const ov = addDay(start, -14);
    ahead.push({ start, end: addDay(start, st.period - 1), ovulation: ov, fertileStart: addDay(ov, -5), fertileEnd: addDay(ov, 1) });
  }
  return { ...st, margin, next, late, inDays: diff(today, next), dayOfCycle: diff(last.start, today) + 1, lastStart: last.start, ahead };
}

/** Phase of a day, from the real periods (and the average for the days after the last one). */
export function phaseOf(day, ps, avgCycle = 28) {
  const prev = [...ps].reverse().find((p) => p.start <= day);
  if (!prev) return null;
  if (day <= prev.end) return 'menstrual';
  const nextReal = ps.find((p) => p.start > day);
  const len = nextReal ? diff(prev.start, nextReal.start) : avgCycle;
  if (len < 15 || len > 60 || diff(prev.start, day) >= len) return null;
  const n = diff(prev.start, day); // 0-based
  const ov = len - 14;
  if (n >= ov - 5 && n <= ov + 1) return 'fertil';
  return n < ov - 5 ? 'folicular' : 'lutea';
}

/** What a calendar cell shows for the cycle layer: period, predicted, fertile, ovulation or null. */
export function dayKind(day, { days, pred }) {
  if (days.some((r) => r.date === day && isPeriodDay(r))) return 'period';
  if (!pred) return null;
  for (const a of pred.ahead) {
    if (day >= addDay(a.start, -pred.margin) && day <= a.end && day >= util.localDay()) return 'predicted';
    if (day === a.ovulation) return 'ovulation';
    if (day >= a.fertileStart && day <= a.fertileEnd) return 'fertile';
  }
  return null;
}

/** Symptoms and mood per phase, for the summary table. */
export function phaseTable(days, ps, st) {
  const rows = Object.fromEntries(Object.keys(PHASES).map((k) => [k, { days: 0, moods: [], symptoms: new Map() }]));
  for (const r of days) {
    const ph = phaseOf(r.date, ps, st.cycle, st.period);
    if (!ph) continue;
    const row = rows[ph]; row.days++;
    if (r.mood) row.moods.push(r.mood);
    for (const s of r.symptoms || []) row.symptoms.set(s, (row.symptoms.get(s) || 0) + 1);
  }
  return Object.entries(rows).map(([id, r]) => ({
    id, name: PHASES[id], days: r.days,
    mood: r.moods.length ? Math.round((r.moods.reduce((a, b) => a + b, 0) / r.moods.length) * 10) / 10 : null,
    top: [...r.symptoms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s),
  }));
}

/** Record id: the shared copy has its own id so un-sharing can purge it from the other phone. */
export const dayId = (date, shared) => `cycle:${date}${shared ? ':v' : ''}`;
export function privacyFields(shared) {
  return { owner: OWNER, visibility: shared ? 'shared' : 'self', visibleToPartner: !!shared, private: true };
}

// ---------- data ----------
export const isOwner = () => profile.active() === OWNER;
export async function getSettings() { return { ...DEFAULTS, ...(await db.getSettings('cycle', DEFAULTS)) }; }

/** Everything the active profile may see (David: only what Sofía marked visible). */
export async function loadCycle() {
  const [days, intimate, settings] = await Promise.all([db.query('cycleDays', { includeLocked: true }), db.query('intimateLog', { includeLocked: true }), getSettings()]);
  const mine = isOwner();
  const keep = (r) => !r.deleted && !r.locked && util.isValidDay(r.date) && (mine || r.visibleToPartner);
  const d = days.filter(keep).sort((a, b) => a.date.localeCompare(b.date));
  const ps = periods(d);
  return {
    days: d, periods: ps, settings, mine,
    intimate: intimate.filter(keep).sort((a, b) => b.date.localeCompare(a.date)),
    locked: days.some((r) => r.locked) || intimate.some((r) => r.locked),
    pred: mine ? predict(ps, settings) : null,
  };
}

async function saveWithPrivacy(store, existing, rec, shared) {
  const id = store === 'cycleDays' ? dayId(rec.date, shared) : (existing && existing.visibleToPartner === !!shared ? existing.id : util.uuid());
  if (existing && existing.id !== id) await db.purge(store, existing.id);
  if (store === 'cycleDays') { // one record per day and visibility
    const other = await db.get(store, dayId(rec.date, !shared));
    if (other && other.id !== existing?.id) await db.purge(store, other.id);
  }
  const base = existing && existing.id === id ? existing : { createdAt: util.nowISO() };
  await db.put(store, { ...base, ...rec, id, ...privacyFields(shared) });
}

// ---------- owner check ----------
/** Settings and bulk deletes are Sofía's: her PIN when she has one, otherwise a clear confirmation. */
export async function confirmOwner(action = 'cambiar esto') {
  if (!isOwner()) { ui.toast(`Solo ${profile.name(OWNER)} puede ${action}.`); return false; }
  await security.refreshKeys();
  const scope = ['cycle', `person:${OWNER}`].find((s) => security.hasKey(s));
  if (!scope) {
    return ui.confirmDialog({ title: `¿Eres ${profile.name(OWNER)}?`, message: `Estos ajustes solo los cambia ${profile.name(OWNER)}.`, confirmLabel: `Sí, soy ${profile.name(OWNER)}` });
  }
  return new Promise((resolve) => {
    let ok = false;
    const pad = ui.pinPad({ label: 'Tu PIN', submitLabel: 'Confirmar', onSubmit: async (pin) => {
      const r = await security.verifyPin(scope, pin);
      if (r.error) return r.error;
      ok = true; m.close(); return null;
    } });
    const m = ui.openModal({ title: 'Confirma con tu PIN', size: 'sm', body: el('div', { class: 'stack center' }, pad), onClose: () => resolve(ok) });
    requestAnimationFrame(() => pad.focusInput());
  });
}

// ---------- editors ----------
function moodPicker(value, onChange) {
  // Wrapping chips (one choice, tap again to clear): a segmented row of 5 moods is too wide for a phone.
  let cur = value || null;
  const row = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Ánimo' });
  const sync_ = () => row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === cur)));
  for (const m of MOODS) {
    row.append(el('button', { class: 'chip', type: 'button', 'data-level': String(m.level), 'aria-pressed': String(m.level === cur),
      onClick: () => { cur = cur === m.level ? null : m.level; sync_(); onChange(cur); } }, `${m.emoji} ${m.name}`));
  }
  return row;
}
function shareToggle(checked, onChange) {
  return ui.toggle({ label: `Visible para ${profile.name(profile.partnerOf(OWNER))}`, checked, onChange,
    hint: checked ? 'Le llega cifrado y solo puede verlo.' : 'Se queda solo en tus equipos.' });
}

export async function dayEditor(date, { onSaved } = {}) {
  if (!isOwner()) return;
  const settings = await getSettings();
  const existing = (await db.get('cycleDays', dayId(date, true))) || (await db.get('cycleDays', dayId(date, false)));
  const day = ui.input({ type: 'date', value: date, max: util.localDay() });
  let period = existing ? !!existing.period : true;
  let flow = existing?.flow || 'medium';
  let mood = existing?.mood || null;
  let shared = existing ? !!existing.visibleToPartner : settings.shareCycleByDefault;
  const symptoms = new Set(existing?.symptoms || []);
  const note = ui.textarea({ rows: 2, maxlength: 200, placeholder: 'Opcional' }); note.value = existing?.note || '';
  const flowRow = el('div', { class: 'stack-tight', hidden: !period }, el('span', { class: 'field-label' }, 'Flujo'),
    ui.segmented({ label: 'Flujo', value: flow, onChange: (v) => { flow = v; }, options: (C.flowLevels || []).filter((f) => f.id !== 'none').map((f) => ({ value: f.id, label: f.name })) }));
  const chips = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Síntomas' }, (C.symptoms || []).map((s) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(symptoms.has(s)),
    onClick: (e) => { if (symptoms.has(s)) symptoms.delete(s); else symptoms.add(s); e.currentTarget.setAttribute('aria-pressed', String(symptoms.has(s))); },
  }, s)));
  const fDay = ui.field({ label: 'Día', control: day });
  ui.openModal({
    title: existing ? 'Editar registro' : 'Registrar el día', kind: 'sheet',
    body: el('div', { class: 'stack' }, fDay,
      ui.toggle({ label: 'Tengo el período', checked: period, onChange: (v) => { period = v; flowRow.hidden = !v; } }),
      flowRow,
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Síntomas (opcional)'), chips),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Ánimo (opcional)'), moodPicker(mood, (v) => { mood = v; })),
      ui.field({ label: 'Nota (opcional)', control: note }),
      shareToggle(shared, (v) => { shared = v; }),
      el('p', { class: 'muted small' }, C.notice || '')),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(day.value) || day.value > util.localDay()) { fDay.setError('Elige un día de hoy o antes.'); return false; }
      if (!period && !symptoms.size && !mood && !note.value.trim()) { fDay.setError('Marca el período, un síntoma, el ánimo o una nota.'); return false; }
      const moved = existing && existing.date !== day.value;
      if (moved) await db.purge('cycleDays', existing.id);
      await saveWithPrivacy('cycleDays', moved ? null : existing, { date: day.value, period, flow: period ? flow : 'none', symptoms: [...symptoms], mood, note: note.value.trim() }, shared);
      ui.toast('Guardado.', { tone: 'success' });
      onSaved?.(); return true;
    } }],
  });
}

export async function intimateEditor(existing, { date = util.localDay(), onSaved } = {}) {
  if (!isOwner()) return;
  const settings = await getSettings();
  const day = ui.input({ type: 'date', value: existing?.date || date, max: util.localDay() });
  let mood = existing?.mood || null;
  let protection = existing?.protection || 'na';
  let shared = existing ? !!existing.visibleToPartner : settings.shareIntimateByDefault;
  const note = ui.textarea({ rows: 2, maxlength: 140, placeholder: 'Opcional, hasta 140 letras' }); note.value = existing?.note || '';
  const fDay = ui.field({ label: 'Día', control: day });
  ui.openModal({
    title: existing ? 'Editar registro privado' : 'Registro privado', kind: 'sheet',
    body: el('div', { class: 'stack' }, fDay,
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Cómo te sentiste (opcional)'), moodPicker(mood, (v) => { mood = v; })),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Protección'),
        ui.segmented({ label: 'Protección', value: protection, onChange: (v) => { protection = v; }, options: PROTECTION })),
      ui.field({ label: 'Nota (opcional)', control: note }),
      shareToggle(shared, (v) => { shared = v; })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(day.value) || day.value > util.localDay()) { fDay.setError('Elige un día de hoy o antes.'); return false; }
      await saveWithPrivacy('intimateLog', existing, { date: day.value, mood, protection, note: note.value.trim().slice(0, 140) }, shared);
      ui.toast('Guardado.', { tone: 'success' });
      onSaved?.(); return true;
    } }],
  });
}

async function removeOne(store, rec, refresh) {
  if (!(await ui.confirmDialog({ title: '¿Borrar este registro?', message: 'Se borra de tus equipos y, si era visible, también del otro teléfono.', confirmLabel: 'Borrar', danger: true }))) return;
  await db.purge(store, rec.id); ui.toast('Borrado.'); refresh();
}
async function removeAll(store, label, refresh) {
  if (!(await confirmOwner('borrar esto'))) return;
  if (!(await ui.confirmDialog({ title: `¿Borrar ${label}?`, message: 'Se borra de todos sus equipos y no se puede recuperar.', confirmLabel: 'Borrar todo', danger: true }))) return;
  const all = await db.rawAll(store);
  for (const r of all) await db.purge(store, r.id);
  ui.toast(`Listo: ${plural(all.length, 'registro borrado', 'registros borrados')}.`); refresh();
}

// ---------- calendar integration ----------
/** Data for the Calendario layers. `canSee` false hides the chips for David until something is shared. */
export async function calendarData() {
  const data = await loadCycle();
  return { ...data, canSeeCycle: data.mine || data.days.length > 0, canSeePrivate: (data.mine && !data.settings.hidePrivate) || (!data.mine && data.intimate.length > 0) };
}
const KIND_LABEL = { period: 'período', predicted: 'período estimado', fertile: 'ventana fértil estimada', ovulation: 'ovulación estimada' };
export const kindLabel = (k) => KIND_LABEL[k] || '';

/** Day panel block for the Calendario. */
export function dayBlock(day, data, { cycle, priv, refresh }) {
  const rec = cycle ? data.days.find((r) => r.date === day) : null;
  const kind = cycle ? dayKind(day, data) : null;
  const intim = priv ? data.intimate.filter((r) => r.date === day) : [];
  const owner = data.mine;
  if (!rec && !kind && !intim.length && !(owner && (cycle || priv))) return null;
  const lines = [];
  if (kind && !rec) lines.push(el('span', { class: 'muted small' }, cap(kindLabel(kind))));
  if (rec) lines.push(recordSummary(rec));
  for (const r of intim) lines.push(el('span', { class: 'small cyc-priv-line' }, icon('heart', { size: 14 }), ` Registro privado${r.note ? `: ${r.note}` : ''}`));
  return el('div', { class: 'card paper-card cyc-day stack-tight' },
    el('span', { class: 'card-kicker' }, owner ? 'Tu ciclo' : `Lo que ${profile.name(OWNER)} compartió`),
    ...lines,
    owner ? el('div', { class: 'btn-row' },
      cycle ? ui.button({ label: rec ? 'Editar' : 'Registrar', iconName: rec ? 'pencil' : 'plus', small: true, onClick: () => dayEditor(day, { onSaved: refresh }) }) : null,
      priv ? ui.button({ label: 'Privado', iconName: 'lock', small: true, variant: 'ghost', onClick: () => intimateEditor(null, { date: day, onSaved: refresh }) }) : null,
      ui.button({ label: 'Ver resumen', iconName: 'chart-line', small: true, variant: 'ghost', href: '#/ciclo' })) : null);
}

function recordSummary(r) {
  const flow = (C.flowLevels || []).find((f) => f.id === r.flow)?.name;
  const md = MOODS.find((m) => m.level === r.mood);
  const bits = [r.period ? `Período${flow ? ` (${flow.toLowerCase()})` : ''}` : '', (r.symptoms || []).join(', '), md ? `${md.emoji} ${md.name.toLowerCase()}` : ''].filter(Boolean);
  return el('div', { class: 'cyc-rec' },
    el('span', {}, bits.join(' · ') || 'Nota'),
    r.note ? el('span', { class: 'muted small' }, r.note) : null,
    isOwner() && r.visibleToPartner ? el('span', { class: 'badge' }, `Visible para ${profile.name(profile.partnerOf(OWNER))}`) : null);
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page ciclo' });
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(ui.pageHeader({ title: 'Mi calendario', back: '/calendario' }), body);
  let data;

  const refresh = async () => { data = await loadCycle(); draw(); };

  function todayCard() {
    const p = data.pred;
    const today = util.localDay();
    const ph = p ? phaseOf(today, data.periods, p.cycle, p.period) : null;
    const care = ph && data.settings.selfCare ? SELF_CARE[ph] : null;
    return el('section', { class: 'card paper-card cyc-today stack-tight' },
      el('span', { class: 'card-kicker' }, cap(fmtDay.format(new Date()))),
      p ? el('p', { class: 'cyc-big' }, `Día ${p.dayOfCycle} del ciclo`) : el('p', { class: 'cyc-big' }, 'Aún no hay períodos registrados'),
      ph ? el('span', { class: 'muted' }, `Fase: ${PHASES[ph].toLowerCase()}`) : null,
      p ? el('p', {}, p.late > 0 ? `El período estimado era hace ${plural(p.late, 'día', 'días')}.`
        : p.inDays === 0 ? `El período podría llegar hoy (± ${plural(p.margin, 'día', 'días')}).`
          : `Próximo período: ${fmtShort.format(util.parseDay(p.next))}, en unos ${plural(p.inDays, 'día', 'días')} (± ${p.margin}).`) : null,
      p && !p.reliable ? el('span', { class: 'badge badge-warn' }, 'Predicción poco fiable: faltan datos o los ciclos varían mucho') : null,
      care ? el('p', { class: 'note-inline' }, icon('heart', { size: 18 }), el('span', {}, care[new Date().getDate() % care.length])) : null,
      el('p', { class: 'muted small' }, C.notice || ''),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Registrar hoy', iconName: 'plus', variant: 'primary', onClick: () => dayEditor(today, { onSaved: refresh }) }),
        ui.button({ label: 'Otro día', iconName: 'calendar', onClick: () => dayEditor(addDay(today, -1), { onSaved: refresh }) }),
        data.settings.hidePrivate ? null : ui.button({ label: 'Registro privado', iconName: 'lock', variant: 'ghost', onClick: () => intimateEditor(null, { onSaved: refresh }) })));
  }

  function statsCard() {
    const lens = cycleLengths(data.periods);
    if (!data.periods.length) return null;
    const st = stats(data.periods, data.settings);
    const table = phaseTable(data.days, data.periods, st);
    return el('section', { class: 'card paper-card stack' },
      el('h2', { class: 'card-title' }, 'Resumen'),
      el('dl', { class: 'cyc-stats' },
        el('div', {}, el('dt', {}, 'Ciclo promedio'), el('dd', {}, st.count ? plural(st.cycle, 'día', 'días') : `${st.cycle} días (de partida)`)),
        el('div', {}, el('dt', {}, 'Período promedio'), el('dd', {}, plural(st.period, 'día', 'días'))),
        el('div', {}, el('dt', {}, 'Variación'), el('dd', {}, st.count > 1 ? plural(st.variation, 'día', 'días') : 'Sin datos aún'))),
      lens.length >= 2 ? lineChart({ points: lens.map((c) => ({ day: c.start, value: c.length })), title: 'Duración de cada ciclo (días)', format: (v) => String(Math.round(v)) }) : null,
      data.periods.length >= 2 ? barChart({ labels: data.periods.slice(-6).map((p) => fmtShort.format(util.parseDay(p.start)).replace('.', '')), values: data.periods.slice(-6).map((p) => p.length), title: 'Días de período', format: (v) => String(v) }) : null,
      el('div', { class: 'table-wrap' }, el('table', { class: 'summary-table' },
        el('caption', { class: 'visually-hidden' }, 'Ánimo y síntomas por fase'),
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Fase'), el('th', { scope: 'col' }, 'Ánimo'), el('th', { scope: 'col' }, 'Lo más común'))),
        el('tbody', {}, table.map((r) => el('tr', {},
          el('th', { scope: 'row' }, r.name),
          el('td', {}, r.mood ? `${MOODS.find((m) => m.level === Math.round(r.mood))?.emoji || ''} ${r.mood}` : '·'),
          el('td', {}, r.top.join(', ') || '·')))))));
  }

  function recordsCard() {
    const recent = [...data.days].reverse().slice(0, 30);
    if (!recent.length) return null;
    return el('details', { class: 'card paper-card cyc-history' },
      el('summary', {}, `Registros (${data.days.length})`),
      el('ul', { class: 'cal-list' }, recent.map((r) => el('li', { class: 'cyc-row' },
        el('span', { class: 'cyc-date' }, cap(fmtShort.format(util.parseDay(r.date)))),
        recordSummary(r),
        data.mine ? el('span', { class: 'cyc-actions' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar ${util.formatDay(r.date)}`, onClick: () => dayEditor(r.date, { onSaved: refresh }) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Borrar ${util.formatDay(r.date)}`, onClick: () => removeOne('cycleDays', r, refresh) }, icon('trash-2', { size: 18 }))) : null))));
  }

  function privateCard() {
    if (data.mine && data.settings.hidePrivate) return null;
    if (!data.intimate.length) return null;
    return el('details', { class: 'card paper-card cyc-history' },
      el('summary', {}, `Privado (${data.intimate.length})`),
      el('ul', { class: 'cal-list' }, data.intimate.map((r) => el('li', { class: 'cyc-row' },
        el('span', { class: 'cyc-date' }, cap(fmtShort.format(util.parseDay(r.date)))),
        el('div', { class: 'cyc-rec' },
          el('span', {}, [MOODS.find((m) => m.level === r.mood)?.emoji, `Protección: ${PROTECTION.find((x) => x.value === r.protection)?.label.toLowerCase() || 'no aplica'}`].filter(Boolean).join(' ')),
          r.note ? el('span', { class: 'muted small' }, r.note) : null,
          data.mine && r.visibleToPartner ? el('span', { class: 'badge' }, `Visible para ${profile.name(profile.partnerOf(OWNER))}`) : null),
        data.mine ? el('span', { class: 'cyc-actions' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar registro del ${util.formatDay(r.date)}`, onClick: () => intimateEditor(r, { onSaved: refresh }) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Borrar registro del ${util.formatDay(r.date)}`, onClick: () => removeOne('intimateLog', r, refresh) }, icon('trash-2', { size: 18 }))) : null))));
  }

  function settingsCard() {
    const s = data.settings;
    const partner = profile.name(profile.partnerOf(OWNER));
    const set = async (patch, el_) => {
      if (!(await confirmOwner())) { if (el_) el_.checked = !el_.checked; return; }
      await db.setSettings('cycle', patch); ui.toast('Ajuste guardado.'); refresh();
    };
    const tg = (label, key, hint) => { const t = ui.toggle({ label, checked: !!s[key], hint, onChange: (v) => set({ [key]: v }, t.querySelector('input')) }); return t; };
    const num = (label, key, min, max) => {
      const inp = ui.input({ type: 'number', inputmode: 'numeric', min, max, value: s[key] });
      inp.addEventListener('change', async () => {
        const v = Math.round(Number(inp.value));
        if (!(v >= min && v <= max)) { inp.value = s[key]; ui.toast(`Usa un número entre ${min} y ${max}.`); return; }
        await set({ [key]: v });
      });
      return ui.field({ label, control: inp, hint: 'Se usa mientras no haya 2 ciclos registrados.' });
    };
    return el('details', { class: 'card paper-card stack cyc-settings' },
      el('summary', {}, 'Ajustes y privacidad'),
      el('p', { class: 'note-inline' }, icon('shield-check', { size: 18 }), el('span', {}, `Todo se queda en tus equipos. Solo lo que marques "Visible para ${partner}" le llega, cifrado, y solo puede verlo.`)),
      tg(`Nuevos registros visibles para ${partner}`, 'shareCycleByDefault', 'Puedes cambiarlo en cada registro.'),
      tg(`Registros privados visibles para ${partner}`, 'shareIntimateByDefault'),
      tg('Ocultar la capa privada', 'hidePrivate', 'No aparece en el calendario ni aquí. Lo guardado no se borra.'),
      tg('Mensajes de autocuidado', 'selfCare'),
      el('div', { class: 'cal-form-row' }, num('Ciclo de partida (días)', 'cycleLength', 20, 45), num('Período de partida (días)', 'periodLength', 2, 10)),
      el('div', { class: 'btn-row' },
        security.hasKey('cycle') ? el('span', { class: 'badge badge-ok' }, 'Con PIN propio') : ui.button({ label: 'Ponerle PIN a esta sección', iconName: 'key-round', small: true, onClick: async () => {
          if (!(await confirmOwner())) return;
          if (await security.createPinDialog({ scope: 'cycle', title: 'PIN de tu calendario' })) { ui.toast('PIN creado.', { tone: 'success' }); refresh(); }
        } })),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Borrar todo el ciclo', iconName: 'trash-2', small: true, variant: 'ghost', onClick: () => removeAll('cycleDays', 'todo el ciclo', refresh) }),
        ui.button({ label: 'Borrar la capa privada', iconName: 'trash-2', small: true, variant: 'ghost', onClick: () => removeAll('intimateLog', 'toda la capa privada', refresh) })));
  }

  function draw() {
    if (!data.mine) {
      const partner = profile.name(OWNER);
      body.replaceChildren(
        el('p', { class: 'note-inline' }, icon('eye', { size: 18 }), el('span', {}, `Aquí ves solo lo que ${partner} decidió compartir contigo.`)),
        ...(data.days.length || data.intimate.length ? [recordsCard(), privateCard()].filter(Boolean)
          : [ui.emptyState({ title: 'Nada compartido todavía', text: `Cuando ${partner} comparta algo, aparece aquí y en el calendario.`, art: 'sakura' })]));
      body.querySelectorAll('details').forEach((d) => { d.open = true; });
      return;
    }
    body.replaceChildren(...[
      data.locked ? el('p', { class: 'note-inline' }, icon('lock', { size: 18 }), el('span', {}, 'Algunos registros están bloqueados. Ábrelos con tu PIN.')) : null,
      todayCard(), statsCard(), recordsCard(), privateCard(), settingsCard(),
    ].filter(Boolean));
  }

  try { await refresh(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir tu calendario', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
  }
  const offP = profile.onProfileChange(refresh);
  const offD = db.onChange((store) => { if (store === 'cycleDays' || store === 'intimateLog') refresh(); });
  return { node: page, cleanup: () => { offP(); offD(); } };
}
