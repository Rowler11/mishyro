// Calendario de citas (docs/05 §21): month grid with dots per layer (Citas, Fechas, Ánimo), the
// selected day's list, dates with time, place, note and an optional reminder, and .ics export
// (one date or everything) with VALARM so the phone's calendar rings. Past dates go to a history
// with "Crear recuerdo". The cycle and private layers arrive with Fase 4B.
// Record in "events": { id, title, start: "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM", place, note, remind, by, createdAt }.
import { ui, util, db, profile } from '../core.js';
import * as dates from '../core/dates.js';
import * as ics from '../core/ics.js';
import { MOODS } from './animo.js';

const { el, icon } = util;
const fmtMonthName = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const fmtMonth = { format: (d) => `${fmtMonthName.format(d)} ${d.getFullYear()}` };
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const WEEK = [['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];
const LAYERS = [{ id: 'citas', label: 'Citas' }, { id: 'fechas', label: 'Fechas' }, { id: 'animo', label: 'Ánimo' }];
const REMIND = [{ value: 'none', label: 'Sin aviso' }, { value: '1d', label: '1 día antes' }, { value: '1h', label: '1 hora antes' }];
const KEY = 'aishiteru.calendar.layers';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const readLayers = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return new Set(v); } catch { /* none */ } return new Set(LAYERS.map((l) => l.id)); };
const saveLayers = (s) => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* private mode */ } };

const dayOf = (ev) => String(ev.start || '').slice(0, 10);
const timeOf = (ev) => String(ev.start || '').slice(11, 16);
const startDate = (ev) => { const d = util.parseDay(dayOf(ev)); if (!d) return null; const t = timeOf(ev); if (t) { const [h, m] = t.split(':').map(Number); d.setHours(h, m); } return d; };

async function loadAll() {
  const [events, moods, special, remPrefs] = await Promise.all([
    db.query('events'), db.query('moods'), dates.listed(), db.get('reminders', 'prefs'),
  ]);
  return {
    events: events.filter((e) => !e.deleted && dayOf(e)).sort((a, b) => String(a.start).localeCompare(String(b.start))),
    moods: moods.filter((m) => !m.deleted),
    special: dates.withProfile(special),
    discreet: !!remPrefs?.discreet,
  };
}

/** .ics event for one date. Timed: alarms 1 day or 1 hour before; all-day: 9:00 the day before or 8:00 that day. */
export function eventIcs(ev, { discreet = false } = {}) {
  const start = startDate(ev);
  const timed = !!timeOf(ev);
  const alarms = ev.remind === '1d' ? [timed ? -1440 : ics.dayAlarm(1, '09:00')] : ev.remind === '1h' ? [timed ? -60 : ics.dayAlarm(0, '08:00')] : [];
  return { uid: `cita-${ev.id}`.replace(/[^a-zA-Z0-9-]/g, '-'), title: discreet ? 'Plan' : ev.title, start, allDay: !timed, durationMin: 120,
    location: discreet ? '' : ev.place || '', description: discreet ? '' : ev.note || '', alarms };
}

export function dateIcs(d, { discreet = false } = {}) {
  const next = d.next || dates.upcoming([d])[0]?.next;
  if (!next) return null;
  const rec = d.recurring || 'yearly';
  return { uid: `fecha-${d.id}`.replace(/[^a-zA-Z0-9-]/g, '-'), title: discreet ? 'Día especial' : d.name, start: next.date, allDay: true,
    rrule: rec === 'monthly' ? `FREQ=MONTHLY;BYMONTHDAY=${next.date.getDate()}` : rec === 'none' ? '' : 'FREQ=YEARLY', alarms: [ics.dayAlarm(1, '09:00')] };
}

function editor(existing, { day, onSaved }) {
  const title = ui.input({ maxlength: 80, autocomplete: 'off', value: existing?.title || '', autofocus: true });
  const date = ui.input({ type: 'date', value: existing ? dayOf(existing) : day });
  const timeIn = ui.input({ type: 'time', value: existing ? timeOf(existing) : '' });
  const place = ui.input({ maxlength: 80, autocomplete: 'off', value: existing?.place || '' });
  const note = ui.textarea({ rows: 3, maxlength: 500 }); note.value = existing?.note || '';
  let remind = existing?.remind || 'none';
  const fTitle = ui.field({ label: 'Qué van a hacer', control: title });
  const fDate = ui.field({ label: 'Fecha', control: date });
  ui.openModal({
    title: existing ? 'Editar cita' : 'Nueva cita', kind: 'sheet',
    body: el('div', { class: 'stack' }, fTitle,
      el('div', { class: 'cal-form-row' }, fDate, ui.field({ label: 'Hora (opcional)', control: timeIn })),
      ui.field({ label: 'Lugar (opcional)', control: place }),
      ui.field({ label: 'Nota (opcional)', control: note }),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Recordatorio en el teléfono'),
        ui.segmented({ label: 'Recordatorio en el teléfono', value: remind, onChange: (v) => { remind = v; }, options: REMIND }))),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!title.value.trim()) { fTitle.setError('Escribe qué van a hacer.'); title.focus(); return false; }
      if (!util.isValidDay(date.value)) { fDate.setError('Elige una fecha.'); date.focus(); return false; }
      const rec = { ...(existing || { id: util.uuid(), by: profile.active(), createdAt: util.nowISO() }),
        title: title.value.trim(), start: timeIn.value ? `${date.value}T${timeIn.value}` : date.value,
        place: place.value.trim(), note: note.value.trim(), remind };
      await db.put('events', rec);
      ui.toast(existing ? 'Cita actualizada.' : 'Cita guardada.', { tone: 'success' });
      onSaved(rec); return true;
    } }],
  });
}

export async function render(ctx = {}) {
  const page = el('section', { class: 'page calendario' });
  const today = util.localDay();
  let selected = util.isValidDay(ctx.query?.dia) ? ctx.query.dia : today;
  let view = util.parseDay(selected); view = new Date(view.getFullYear(), view.getMonth(), 1);
  const layers = readLayers();
  let data;

  const add = (day = selected) => editor(null, { day, onSaved: async (rec) => { selected = dayOf(rec); view = new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, 1); await refresh(); } });
  page.append(ui.pageHeader({ title: 'Calendario', jp: 'カレンダー', romaji: 'karendā', back: '/mas', actions: [ui.newButton('Nueva cita', () => add())] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(body);

  const exportOne = (ev) => { ics.download(`cita-${ics.fileName(ev.title)}.ics`, ics.calendar([eventIcs(ev, data)])); ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' }); };
  const exportDate = (d) => { const e = dateIcs(d, data); if (!e) return; ics.download(`${ics.fileName(d.name)}.ics`, ics.calendar([e])); ui.toast('Archivo listo. Se repite cada año.', { tone: 'success' }); };
  const exportAll = () => {
    const events = data.events.filter((e) => dayOf(e) >= today).map((e) => eventIcs(e, data));
    const fechas = dates.upcoming(data.special).map((d) => dateIcs(d, data)).filter(Boolean);
    if (!events.length && !fechas.length) { ui.toast('No hay nada próximo para exportar.'); return; }
    ics.download('aishiteru-calendario.ics', ics.calendar([...events, ...fechas], { name: data.discreet ? 'Calendario' : 'Aishiteru' }));
    ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
  };
  const remove = async (ev) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar esta cita?', message: 'Si la agregaste al calendario del teléfono, bórrala también allá.', confirmLabel: 'Borrar', danger: true }))) return;
    await db.purge('events', ev.id); ui.toast('Cita borrada.'); await refresh();
  };
  const memoryHref = (ev) => `#/capsula/nuevo?${new URLSearchParams({ titulo: ev.title, fecha: dayOf(ev), nota: ev.place ? `En ${ev.place}.` : '' })}`;

  function eventItem(ev, { showDay = false } = {}) {
    const past = dayOf(ev) < today;
    const meta = [showDay ? fmtShort.format(util.parseDay(dayOf(ev))) : '', timeOf(ev), ev.place].filter(Boolean).join(' · ');
    return el('li', { class: 'card paper-card cal-event' },
      el('span', { class: 'cal-event-mark', 'aria-hidden': 'true' }),
      el('div', { class: 'cal-event-text' },
        el('span', { class: 'cal-event-title' }, ev.title),
        meta ? el('span', { class: 'muted small' }, meta) : null,
        ev.note ? el('span', { class: 'small clamp-2' }, ev.note) : null,
        el('div', { class: 'cal-event-actions' },
          past ? ui.button({ label: 'Crear recuerdo', iconName: 'image-plus', small: true, href: memoryHref(ev) })
            : ui.button({ label: 'Al teléfono', iconName: 'download', small: true, variant: 'ghost', onClick: () => exportOne(ev) }),
          ui.button({ label: 'Editar', iconName: 'pencil', small: true, variant: 'ghost', onClick: () => editor(ev, { onSaved: refresh }) }),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Borrar ${ev.title}`, onClick: () => remove(ev) }, icon('trash-2', { size: 18 })))));
  }

  function dayItems(day) {
    const d = util.parseDay(day);
    const out = { events: [], fechas: [], moods: [] };
    if (layers.has('citas')) out.events = data.events.filter((e) => dayOf(e) === day);
    if (layers.has('fechas')) out.fechas = dates.inMonth(data.special, d.getFullYear(), d.getMonth()).filter((x) => x.day === d.getDate());
    if (layers.has('animo')) out.moods = data.moods.filter((m) => m.date === day && m.level);
    return out;
  }

  function grid() {
    const y = view.getFullYear(); const m = view.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const last = new Date(y, m + 1, 0).getDate();
    const monthEvents = new Map();
    if (layers.has('citas')) for (const e of data.events) { const k = dayOf(e); if (k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)) monthEvents.set(k, (monthEvents.get(k) || 0) + 1); }
    const fechas = layers.has('fechas') ? dates.inMonth(data.special, y, m) : [];
    const moods = layers.has('animo') ? new Set(data.moods.filter((x) => x.level).map((x) => x.date)) : new Set();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(el('span', { class: 'cal-cell is-empty', 'aria-hidden': 'true' }));
    for (let day = 1; day <= last; day++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const n = monthEvents.get(key) || 0;
      const f = fechas.filter((x) => x.day === day);
      const mood = moods.has(key);
      const parts = [n ? `${n} ${n === 1 ? 'cita' : 'citas'}` : '', ...f.map((x) => x.name), mood ? 'ánimo registrado' : ''].filter(Boolean);
      const date = new Date(y, m, day);
      cells.push(el('button', {
        class: `cal-cell${key === today ? ' is-today' : ''}${key === selected ? ' is-selected' : ''}${f.length ? ' has-date' : ''}`, type: 'button',
        'aria-pressed': String(key === selected), 'aria-label': `${fmtDay.format(date)}${parts.length ? `: ${parts.join(', ')}` : ''}`,
        onClick: () => { selected = key; draw(); body.querySelector('.cal-day-title')?.focus({ preventScroll: false }); },
      }, el('span', { class: 'cal-num' }, String(day)),
      el('span', { class: 'cal-dots', 'aria-hidden': 'true' },
        n ? el('span', { class: 'cal-dot dot-cita' }) : null,
        f.length ? el('span', { class: 'cal-dot dot-fecha' }) : null,
        mood ? el('span', { class: 'cal-dot dot-animo' }) : null)));
    }
    return el('div', { class: 'cal-grid', role: 'group', 'aria-label': cap(fmtMonth.format(view)) },
      WEEK.map(([s, full]) => el('abbr', { class: 'cal-wd', title: full }, s)), cells);
  }

  function draw() {
    const it = dayItems(selected);
    const sel = util.parseDay(selected);
    const nav = el('div', { class: 'cal-nav' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onClick: () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); } }, icon('chevron-left')),
      el('h2', { class: 'cal-month', 'aria-live': 'polite' }, cap(fmtMonth.format(view))),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', onClick: () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); } }, icon('chevron-right')),
      el('button', { class: 'btn btn-ghost btn-small cal-today', type: 'button', onClick: () => { selected = today; const t = util.parseDay(today); view = new Date(t.getFullYear(), t.getMonth(), 1); draw(); } }, 'Hoy'));
    const chips = el('div', { class: 'chip-row cal-layers', role: 'group', 'aria-label': 'Capas' },
      LAYERS.map((l) => el('button', { class: `chip chip-${l.id}`, type: 'button', 'aria-pressed': String(layers.has(l.id)), onClick: () => {
        if (layers.has(l.id)) layers.delete(l.id); else layers.add(l.id); saveLayers(layers); draw();
      } }, el('span', { class: `cal-dot dot-${l.id === 'citas' ? 'cita' : l.id === 'fechas' ? 'fecha' : 'animo'}`, 'aria-hidden': 'true' }), l.label)));
    const empty = !it.events.length && !it.fechas.length && !it.moods.length;
    const dayPanel = el('section', { class: 'cal-day stack-tight', 'aria-labelledby': 'cal-day-title' },
      el('h2', { class: 'card-kicker cal-day-title', id: 'cal-day-title', tabindex: '-1' }, selected === today ? `Hoy, ${fmtDay.format(sel)}` : cap(fmtDay.format(sel))),
      empty ? el('p', { class: 'muted' }, 'Nada este día.') : null,
      it.fechas.length ? el('ul', { class: 'cal-list' }, it.fechas.map((d) => el('li', { class: 'card paper-card cal-fecha' },
        el('span', { class: 'cal-fecha-icon', 'aria-hidden': 'true' }, icon(dates.KIND_ICON[d.kind] || 'calendar', { size: 20 })),
        el('div', { class: 'cal-event-text' }, el('span', { class: 'cal-event-title' }, d.name),
          d.years > 0 ? el('span', { class: 'muted small' }, d.kind === 'anniversary' ? `${d.years} ${d.years === 1 ? 'año' : 'años'} juntos` : `Cumple ${d.years}`) : null),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Agregar ${d.name} al calendario del teléfono`, onClick: () => exportDate(d) }, icon('download', { size: 18 }))))) : null,
      it.events.length ? el('ul', { class: 'cal-list' }, it.events.map((e) => eventItem(e))) : null,
      it.moods.length ? el('ul', { class: 'cal-list cal-moods' }, it.moods.map((mo) => {
        const md = MOODS.find((x) => x.level === mo.level);
        return el('li', { class: 'cal-mood' }, el('span', { 'aria-hidden': 'true' }, md?.emoji || ''), el('span', {}, `${profile.name(mo.by)}: ${(md?.name || '').toLowerCase()}`));
      })) : null,
      el('div', { class: 'btn-row' }, ui.button({ label: 'Agregar una cita este día', iconName: 'plus', small: true, onClick: () => add(selected) })));
    const upcoming = data.events.filter((e) => dayOf(e) >= today).slice(0, 5);
    const past = data.events.filter((e) => dayOf(e) < today).reverse();
    body.replaceChildren(...[
      el('section', { class: 'card paper-card cal-card' }, nav, chips, grid()),
      dayPanel,
      upcoming.length ? el('section', { class: 'stack-tight' }, el('h2', { class: 'card-kicker' }, 'Próximas citas'),
        el('ul', { class: 'cal-list' }, upcoming.map((e) => eventItem(e, { showDay: true })))) : null,
      past.length ? el('details', { class: 'card paper-card cal-history' },
        el('summary', {}, `Citas pasadas (${past.length})`),
        el('ul', { class: 'cal-list' }, past.map((e) => eventItem(e, { showDay: true })))) : null,
      el('section', { class: 'card paper-card stack-tight' },
        el('p', { class: 'small' }, 'Lleva sus próximas citas y fechas especiales al calendario del teléfono. Así los avisos suenan aunque la app esté cerrada.'),
        el('div', { class: 'btn-row' }, ui.button({ label: 'Exportar todo al teléfono', iconName: 'calendar', onClick: exportAll }))),
    ].filter(Boolean));
  }

  async function refresh() { data = await loadAll(); draw(); }
  try { await refresh(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el calendario', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
  }
  const off = profile.onProfileChange(refresh);
  return { node: page, cleanup: off };
}
