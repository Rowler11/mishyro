// Próximo encuentro (docs/05 Más §17): the editable date (and optional time and note) of the next
// time they see each other, with a countdown here and in Inicio. Empty by default. Shared record
// ('profile' store, id 'nextMeeting'), so both phones count down to the same moment.
import { ui, util, db } from '../core.js';

const { el, icon } = util;
const ID = 'nextMeeting';
const fmtLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

export async function getMeeting() {
  const r = await db.get('profile', ID).catch(() => null);
  return r && util.isValidDay(r.date) ? r : null;
}

/** { days, hours, minutes, past, today } until the meeting. */
export function countdown(m, now = new Date()) {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [hh, mm] = (m.time || '00:00').split(':').map(Number);
  const at = new Date(y, mo - 1, d, hh || 0, mm || 0);
  const diff = at - now;
  const today = util.localDay(now) === m.date;
  if (diff <= 0) return { past: !today, today, days: 0, hours: 0, minutes: 0 };
  const minutes = Math.floor(diff / 60000);
  return { past: false, today, days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}
export function countdownLine(m, now = new Date()) {
  const c = countdown(m, now);
  if (c.today) return m.time && !c.past && (c.hours || c.minutes) ? `Hoy se ven, en ${c.hours ? `${c.hours} h ` : ''}${c.minutes} min` : '¡Hoy se ven!';
  if (c.past) return '';
  if (c.days === 0) return `Se ven en ${c.hours} h ${c.minutes} min`;
  if (c.days === 1) return '¡Mañana se ven!';
  if (c.days <= 3) return `Faltan ${c.days} sueños`;
  if (c.days <= 7) return `Ya casi: faltan ${c.days} días`;
  return `Faltan ${c.days} días para verse`;
}

/** Small card for Inicio, or null when there is no upcoming meeting. */
export async function homeCard() {
  const m = await getMeeting();
  if (!m) return null;
  const line = countdownLine(m);
  if (!line) return null;
  return el('a', { class: 'card home-card meeting-card', href: '#/encuentro' },
    el('span', { class: 'section-icon' }, icon('plane', { size: 20 })),
    el('span', { class: 'today-text' }, el('span', { class: 'today-title' }, line), el('span', { class: 'muted small' }, `${fmtLong.format(util.parseDay(m.date))}${m.note ? ` · ${m.note}` : ''}`)),
    icon('chevron-right', { size: 18, cls: 'list-chevron' }));
}

function editor(m, onSaved) {
  const date = ui.input({ type: 'date', value: m?.date || '', min: util.localDay() });
  const time = ui.input({ type: 'time', value: m?.time || '' });
  const note = ui.input({ value: m?.note || '', maxlength: 60, placeholder: 'Ej.: En el aeropuerto' });
  const fDate = ui.field({ label: 'Fecha', control: date });
  return ui.openModal({
    title: m ? 'Cambiar el encuentro' : 'Próximo encuentro', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, fDate, ui.field({ label: 'Hora (opcional)', control: time }), ui.field({ label: 'Nota (opcional)', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(date.value) || date.value < util.localDay()) { fDate.setError('Elige hoy o un día que venga.'); return false; }
      await db.put('profile', { ...(m || {}), id: ID, date: date.value, time: time.value || '', note: note.value.trim() });
      onSaved(); return true;
    } }],
  });
}

export async function render() {
  const page = el('section', { class: 'page encuentro' });
  page.append(ui.pageHeader({ title: 'Próximo encuentro', jp: '次回', romaji: 'jikai', back: '/calendario' }));
  const body = el('div', { class: 'stack' });
  page.append(body);
  let timer = 0;
  const draw = async () => {
    clearInterval(timer);
    const m = await getMeeting();
    const c = m ? countdown(m) : null;
    if (!m || c.past) {
      body.replaceChildren(ui.emptyState({ title: '¿Cuándo se ven?', text: 'Pongan la fecha del próximo encuentro y los dos verán la cuenta regresiva, también en Inicio.', art: 'lantern', action: { label: 'Poner la fecha', onClick: () => editor(null, draw) } }));
      return;
    }
    const num = (n, l) => el('div', { class: 'meet-unit' }, el('span', { class: 'meet-num' }, String(n)), el('span', { class: 'meet-label' }, l));
    const units = el('div', { class: 'meet-units', 'aria-hidden': 'true' });
    const live = el('p', { class: 'sr-only', 'aria-live': 'off' });
    const tick = () => {
      const k = countdown(m);
      units.replaceChildren(...(k.today && !(k.hours || k.minutes) ? [el('span', { class: 'meet-today' }, '¡Hoy!')] : [num(k.days, k.days === 1 ? 'día' : 'días'), num(k.hours, 'horas'), num(k.minutes, 'min')]));
      live.textContent = countdownLine(m);
    };
    tick(); timer = setInterval(tick, 30000);
    body.replaceChildren(el('section', { class: 'card paper-card meet-card' },
      el('p', { class: 'card-kicker' }, 'Cuenta regresiva'),
      el('p', { class: 'meet-line' }, countdownLine(m)), units, live,
      el('p', { class: 'meet-date' }, `${fmtLong.format(util.parseDay(m.date))}${m.time ? `, ${m.time}` : ''}`),
      m.note ? el('p', { class: 'muted' }, m.note) : null,
      el('div', { class: 'card-actions' },
        ui.button({ label: 'Cambiar', iconName: 'pencil', small: true, onClick: () => editor(m, draw) }),
        ui.button({ label: 'Quitar', iconName: 'trash-2', small: true, variant: 'ghost', onClick: async () => { await db.purge('profile', ID); draw(); } }))));
  };
  await draw();
  const off = db.onChange((s, id) => { if (s === 'profile' && (id === ID || id == null)) draw(); });
  return { node: page, cleanup: () => { off(); clearInterval(timer); } };
}
