// Recordatorios suaves (docs/05 §41). No server, so two levels, said plainly on screen:
// a) a quiet row in Inicio ("Para hoy") when something is close, while the app is open;
// b) "Agregar al calendario del teléfono": one .ics with every active reminder (RRULE + VALARM),
//    so the phone's calendar rings even with the app closed. No push, no background promises.
// Records live in the "reminders" store (seeded from CONFIG.reminders); "prefs" holds discreet mode.
import { ui, util, db, profile, CONFIG } from '../core.js';
import * as time from '../core/time.js';
import * as dates from '../core/dates.js';
import * as ics from '../core/ics.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const LEADS = [{ v: 0, label: 'El mismo día' }, { v: 1, label: '1 día antes' }, { v: 3, label: '3 días antes' }, { v: 7, label: '1 semana antes' }];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const KIND_LABEL = { monthiversary: 'Mesiversario', anniversary: 'Aniversario', birthday: 'Cumpleaños de los dos', pet: 'Cumpleaños de las mascotas', weeklyDate: 'Cita de la semana', custom: 'Propio' };
const KIND_ICON = { monthiversary: 'heart', anniversary: 'heart-handshake', birthday: 'cake', pet: 'paw-print', weeklyDate: 'calendar', custom: 'bell' };
const ORDER = ['monthiversary', 'anniversary', 'birthday', 'pet', 'weeklyDate', 'custom'];
const NEUTRAL = 'Día especial';
const PREFS = 'prefs';

export async function load() {
  const all = await db.query('reminders');
  const prefs = all.find((r) => r.id === PREFS) || { id: PREFS, kind: 'prefs', discreet: !!CONFIG.discreetReminders };
  const list = all.filter((r) => r.id !== PREFS && !r.deleted)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || String(a.title || '').localeCompare(String(b.title || '')));
  return { list, prefs };
}

const startOf = () => time.parseStart(profile.startDate());

/**
 * The concrete dates a reminder points at, each with its next occurrence:
 * [{ key, title, next: { date, days, years }, rrule, start }]. `start` is the first date to put in the .ics.
 */
export function occurrences(r, { special = [], today = new Date() } = {}) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const s = startOf();
  const out = [];
  const add = (key, title, value, recurring, rrule) => {
    const next = time.nextOccurrence(value, { recurring, today: t });
    if (next) out.push({ key, title, next, rrule, start: next.date });
  };
  if (r.kind === 'monthiversary') {
    const day = s ? s.getDate() : r.rule?.day || 2;
    const next = time.nextOccurrence({ m: t.getMonth() + 1, d: day }, { recurring: 'monthly', today: t });
    if (next) {
      const months = s ? (next.date.getFullYear() - s.getFullYear()) * 12 + next.date.getMonth() - s.getMonth() : 0;
      // A whole year is the anniversary, which has its own reminder.
      out.push({ key: 'm', title: months > 0 ? `Mesiversario: ${months} ${months === 1 ? 'mes' : 'meses'}` : 'Mesiversario', next, rrule: `FREQ=MONTHLY;BYMONTHDAY=${day}`, start: next.date });
    }
  } else if (r.kind === 'anniversary') {
    if (s) add('a', 'Nuestro aniversario', util.localDay(s), 'yearly', 'FREQ=YEARLY');
  } else if (r.kind === 'birthday') {
    for (const d of special.filter((x) => x.kind === 'birthday')) add(d.id, d.name, d.date, 'yearly', 'FREQ=YEARLY');
  } else if (r.kind === 'pet') {
    for (const d of special.filter((x) => x.kind === 'pet')) add(d.id, d.name, d.date, 'yearly', 'FREQ=YEARLY');
  } else if (r.kind === 'weeklyDate') {
    const wd = Number(r.rule?.weekday ?? 6);
    const date = new Date(t); date.setDate(t.getDate() + ((wd - t.getDay() + 7) % 7));
    out.push({ key: 'w', title: 'Cita de la semana', next: { date, days: util.daysBetween(t, date), years: null }, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[wd]}`, start: date });
  } else if (r.kind === 'custom' && r.rule?.date) {
    const freq = r.rule.freq || 'none';
    if (freq === 'weekly') {
      const first = util.parseDay(r.rule.date); if (!first) return out;
      const wd = first.getDay();
      const date = first > t ? first : new Date(t.getFullYear(), t.getMonth(), t.getDate() + ((wd - t.getDay() + 7) % 7));
      out.push({ key: 'c', title: r.title || 'Recordatorio', next: { date, days: util.daysBetween(t, date), years: null }, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[wd]}`, start: date });
    } else {
      add('c', r.title || 'Recordatorio', r.rule.date, freq, { yearly: 'FREQ=YEARLY', monthly: `FREQ=MONTHLY;BYMONTHDAY=${Number(r.rule.date.slice(8, 10))}` }[freq] || '');
    }
  }
  return out;
}

/** Rows for "Para hoy" in Inicio: what is inside its warning window. Dates already in "Lo que viene" are left out. */
export async function dueSoon(today = new Date()) {
  const { list } = await load();
  const special = dates.withProfile(await dates.listed());
  const rows = [];
  for (const r of list.filter((x) => x.enabled && ['monthiversary', 'weeklyDate', 'custom'].includes(x.kind))) {
    const window = Math.max(0, ...(r.leadDays || [0]));
    for (const o of occurrences(r, { special, today })) {
      if (o.next.days > window) continue;
      const when = o.next.days === 0 ? 'Hoy' : o.next.days === 1 ? 'Mañana' : `En ${o.next.days} días`;
      const idea = r.kind === 'monthiversary' ? { text: '¿Le escribes una carta?', href: '#/cartas' }
        : r.kind === 'weeklyDate' ? { text: 'Busquen un plan juntos.', href: '#/calendario' } : { text: '', href: '#/recordatorios' };
      rows.push({ days: o.next.days, icon: KIND_ICON[r.kind], title: `${when}: ${o.title.charAt(0).toLowerCase()}${o.title.slice(1)}`, sub: idea.text, href: idea.href });
    }
  }
  return rows.sort((a, b) => a.days - b.days);
}

/** The .ics with every active reminder. Discreet mode keeps the titles neutral. */
export function buildIcs(list, { special = [], discreet = false, today = new Date() } = {}) {
  const events = [];
  for (const r of list.filter((x) => x.enabled)) {
    const at = r.rule?.time || '09:00';
    const leads = (r.leadDays?.length ? r.leadDays : [0]).slice().sort((a, b) => b - a);
    for (const o of occurrences(r, { special, today })) {
      const title = discreet ? NEUTRAL : o.title;
      if (r.kind === 'weeklyDate') {
        const [h, m] = at.split(':').map(Number);
        const start = new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate(), h || 0, m || 0);
        events.push({ uid: `rem-${r.id}-${o.key}`.replace(/[^a-zA-Z0-9-]/g, '-'), title, start, durationMin: 120, rrule: o.rrule, alarms: leads.map((d) => -d * 1440) });
      } else {
        events.push({ uid: `rem-${r.id}-${o.key}`.replace(/[^a-zA-Z0-9-]/g, '-'), title, start: o.start, allDay: true, rrule: o.rrule, alarms: leads.map((d) => ics.dayAlarm(d, at)) });
      }
    }
  }
  return ics.calendar(events, { name: discreet ? 'Recordatorios' : 'Aishiteru · recordatorios' });
}

export async function exportAll() {
  const { list, prefs } = await load();
  const special = dates.withProfile(await dates.listed());
  const active = list.filter((r) => r.enabled);
  if (!active.length) { ui.toast('Activa al menos un recordatorio.'); return; }
  ics.download('aishiteru-recordatorios.ics', buildIcs(list, { special, discreet: prefs.discreet }));
  ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
}

function customEditor(existing, onSaved) {
  const title = ui.input({ maxlength: 60, value: existing?.title || '', autocomplete: 'off' });
  const date = ui.input({ type: 'date', value: existing?.rule?.date || util.localDay() });
  const timeIn = ui.input({ type: 'time', value: existing?.rule?.time || '09:00' });
  let freq = existing?.rule?.freq || 'none';
  const fTitle = ui.field({ label: 'Qué recordar', control: title });
  const fDate = ui.field({ label: 'Fecha', control: date });
  ui.openModal({
    title: existing ? 'Editar recordatorio' : 'Nuevo recordatorio', kind: 'sheet',
    body: el('div', { class: 'stack' }, fTitle, fDate,
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Se repite'),
        ui.segmented({ label: 'Se repite', value: freq, onChange: (v) => { freq = v; }, options: [
          { value: 'none', label: 'Una vez' }, { value: 'weekly', label: 'Semana' }, { value: 'monthly', label: 'Mes' }, { value: 'yearly', label: 'Año' }] })),
      ui.field({ label: 'Hora del aviso', control: timeIn })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!title.value.trim()) { fTitle.setError('Escribe qué quieren recordar.'); title.focus(); return false; }
      if (!util.isValidDay(date.value)) { fDate.setError('Elige una fecha.'); date.focus(); return false; }
      const rec = { ...(existing || { id: `rem:${util.uuid()}`, kind: 'custom', leadDays: [1], enabled: true, by: profile.active() }),
        title: title.value.trim(), rule: { freq, date: date.value, time: timeIn.value || '09:00' } };
      await db.put('reminders', rec);
      ui.toast('Recordatorio guardado.', { tone: 'success' }); onSaved(); return true;
    } }],
  });
}

function row(r, { special, save, redraw }) {
  const occ = occurrences(r, { special });
  const next = occ.slice().sort((a, b) => a.next.days - b.next.days)[0];
  const title = r.kind === 'custom' ? r.title : KIND_LABEL[r.kind] || r.title || 'Recordatorio';
  const nextText = !next ? (r.kind === 'birthday' || r.kind === 'pet' ? 'Agrega la fecha en Perfil y datos.' : r.kind === 'anniversary' || r.kind === 'monthiversary' ? 'Falta la fecha en que empezaron.' : 'Ya pasó.')
    : `Próximo: ${next.next.days === 0 ? 'hoy' : fmtDay.format(next.next.date)}${occ.length > 1 ? ` (y ${occ.length - 1} más)` : ''}`;
  const leads = new Set(r.leadDays?.length ? r.leadDays : [0]);
  const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': `Avisar: ${title}` },
    LEADS.map((l) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(leads.has(l.v)), disabled: !r.enabled, onClick: async () => {
      const set = new Set(leads); if (set.has(l.v)) set.delete(l.v); else set.add(l.v);
      if (!set.size) { ui.toast('Deja al menos un aviso.'); return; }
      await save({ ...r, leadDays: [...set].sort((a, b) => b - a) }); redraw();
    } }, l.label)));
  const timeIn = ui.input({ type: 'time', value: r.rule?.time || '09:00', disabled: !r.enabled, 'aria-label': `Hora del aviso: ${title}` });
  timeIn.addEventListener('change', async () => { if (timeIn.value) await save({ ...r, rule: { ...(r.rule || {}), time: timeIn.value } }); });
  const extra = [];
  if (r.kind === 'weeklyDate') {
    const sel = el('select', { class: 'input', disabled: !r.enabled, 'aria-label': 'Día de la cita' }, WEEKDAYS.map((d, i) => el('option', { value: String(i), selected: Number(r.rule?.weekday ?? 6) === i }, d)));
    sel.addEventListener('change', async () => { await save({ ...r, rule: { ...(r.rule || {}), weekday: Number(sel.value) } }); redraw(); });
    extra.push(el('label', { class: 'rem-inline' }, el('span', { class: 'muted small' }, 'Día'), sel));
  }
  return el('li', { class: `card paper-card rem-card${r.enabled ? '' : ' is-off'}` },
    el('div', { class: 'rem-head' },
      el('span', { class: 'rem-icon', 'aria-hidden': 'true' }, icon(KIND_ICON[r.kind] || 'bell', { size: 20 })),
      ui.toggle({ label: title, hint: nextText, checked: !!r.enabled, onChange: async (v) => { await save({ ...r, enabled: v }); redraw(); } })),
    r.enabled ? el('div', { class: 'rem-body' }, el('span', { class: 'muted small' }, 'Avisar'), chips,
      el('div', { class: 'rem-row' }, ...extra, el('label', { class: 'rem-inline' }, el('span', { class: 'muted small' }, 'Hora'), timeIn)),
      r.kind === 'custom' ? el('div', { class: 'btn-row' },
        ui.button({ label: 'Editar', iconName: 'pencil', small: true, variant: 'ghost', onClick: () => customEditor(r, redraw) }),
        ui.button({ label: 'Borrar', iconName: 'trash-2', small: true, variant: 'ghost', onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar este recordatorio?', confirmLabel: 'Borrar', danger: true }))) return;
          await db.purge('reminders', r.id); ui.toast('Recordatorio borrado.'); redraw();
        } })) : null) : null);
}

export async function render() {
  const page = el('section', { class: 'page recordatorios' });
  page.append(ui.pageHeader({ title: 'Recordatorios', jp: 'お知らせ', romaji: 'oshirase', back: '/mas',
    actions: [ui.newButton('Agregar', () => customEditor(null, draw))] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);

  async function draw() {
    const { list, prefs } = await load();
    const special = dates.withProfile(await dates.listed());
    const save = (rec) => db.put('reminders', rec);
    body.replaceChildren(
      el('section', { class: 'card paper-card rem-how' },
        el('h2', { class: 'card-kicker' }, 'Cómo llegan'),
        el('ul', { class: 'rem-how-list' },
          el('li', {}, icon('house', { size: 18 }), el('span', {}, el('strong', {}, 'En la app: '), 'cuando falta poco, aparece en Inicio, en "Para hoy".')),
          el('li', {}, icon('smartphone', { size: 18 }), el('span', {}, el('strong', {}, 'En el teléfono: '), 'agrégalos a tu calendario y suenan aunque la app esté cerrada.'))),
        el('div', { class: 'btn-row' }, ui.button({ label: 'Agregar al calendario del teléfono', iconName: 'calendar', variant: 'primary', onClick: exportAll })),
        el('p', { class: 'muted small' }, 'Si cambias algo, vuelve a agregarlos y borra los anteriores en tu calendario.')),
      el('ul', { class: 'rem-list' }, list.map((r) => row(r, { special, save, redraw: draw }))),
      el('section', { class: 'card paper-card' },
        ui.toggle({ label: 'Recordatorios discretos', hint: 'En el calendario del teléfono dicen solo "Día especial", sin nombres ni detalles.', checked: !!prefs.discreet,
          onChange: async (v) => { await db.put('reminders', { ...prefs, discreet: v }); ui.toast(v ? 'Listo: textos neutros.' : 'Listo: textos con nombre.'); } })),
    );
  }
  await draw();
  return { node: page };
}
