// Fechas especiales (docs/05 §4): the anniversary, both birthdays, the pets' and any date they add,
// soonest first, with the countdown and the age turned. In the last 7 days the countdown becomes a
// flip clock (days, hours, minutes). A birthday wears that person's favorite color (Perfil y datos).
// "Al calendario" downloads a yearly .ics (RRULE:FREQ=YEARLY) made on the device.
import { ui, util, db, profile } from '../core.js';
import * as dates from '../core/dates.js';
import * as ics from '../core/ics.js';
import { dateIcs } from './calendario.js';

const { el, icon } = util;
const fmtLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const TONES = ['sakura', 'fuji', 'matcha', 'kohaku'];
const pad = (n) => String(n).padStart(2, '0');

function ageText(d) {
  const y = d.next.years;
  if (!y || y < 1) return '';
  if (d.kind === 'anniversary') return `${y} ${y === 1 ? 'año' : 'años'} juntos`;
  if (d.kind === 'birthday' || d.kind === 'pet') return `Cumple ${y} ${y === 1 ? 'año' : 'años'}`;
  return `${y} ${y === 1 ? 'año' : 'años'}`;
}

/** Days, hours and minutes left until 00:00 of the date. */
function left(date, now = new Date()) {
  const ms = Math.max(0, date - now);
  const min = Math.floor(ms / 60000);
  return { d: Math.floor(min / 1440), h: Math.floor((min % 1440) / 60), m: min % 60 };
}

function flipClock(date) {
  const tiles = { d: el('span', { class: 'flip-num' }), h: el('span', { class: 'flip-num' }), m: el('span', { class: 'flip-num' }) };
  const label = el('span', { class: 'sr-only' });
  const set = () => {
    const l = left(date);
    for (const k of ['d', 'h', 'm']) {
      const v = pad(l[k]);
      if (tiles[k].textContent !== v) { tiles[k].textContent = v; tiles[k].classList.remove('flip'); void tiles[k].offsetWidth; tiles[k].classList.add('flip'); }
    }
    label.textContent = `Faltan ${l.d} días, ${l.h} horas y ${l.m} minutos.`;
  };
  set();
  const box = el('div', { class: 'flip-clock' }, label,
    ...[['d', 'días'], ['h', 'horas'], ['m', 'min']].map(([k, u]) => el('span', { class: 'flip-unit', 'aria-hidden': 'true' }, tiles[k], el('span', { class: 'flip-label' }, u))));
  return { box, set };
}

export async function render() {
  const page = el('section', { class: 'page fechas' });
  page.append(ui.pageHeader({ title: 'Fechas especiales', jp: '記念日', romaji: 'kinenbi', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const clocks = [];
  let timer = null;

  const [list, peopleRec, remPrefs] = await Promise.all([dates.all(), db.get('profile', 'people'), db.get('reminders', 'prefs')]);
  const discreet = !!remPrefs?.discreet;
  const toneOf = (d) => { const who = dates.personOf(d); const c = who && peopleRec?.[who]?.color; return TONES.includes(c) ? c : ''; };
  const exportOne = (d) => { const e = dateIcs(d, { discreet }); if (!e) return; ics.download(`${ics.fileName(d.name)}.ics`, ics.calendar([e])); ui.toast('Archivo listo. Se repite cada año.', { tone: 'success' }); };
  const exportAll = () => {
    const evs = list.map((d) => dateIcs(d, { discreet })).filter(Boolean);
    if (!evs.length) return;
    ics.download('aishiteru-fechas.ics', ics.calendar(evs, { name: discreet ? 'Fechas' : 'Aishiteru · fechas' }));
    ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
  };

  if (!list.length) {
    body.replaceChildren(ui.emptyState({ title: 'Aún no hay fechas', text: 'Agrega el día en que empezaron y los cumpleaños en Perfil y datos.', art: 'fan',
      action: { label: 'Ir a Perfil y datos', onClick: () => { location.hash = '#/ajustes/perfil'; } } }));
    return { node: page };
  }
  const cards = list.map((d, i) => {
    const tone = toneOf(d);
    const days = d.next.days;
    let count;
    if (days === 0) count = el('p', { class: 'fecha-today' }, icon('party-popper', { size: 20 }), el('span', {}, '¡Es hoy!'));
    else if (days <= 7) { const c = flipClock(d.next.date); clocks.push(c); count = c.box; }
    else count = el('p', { class: 'fecha-count' }, el('span', { class: 'fecha-days' }, days.toLocaleString('es-CO')), el('span', { class: 'muted' }, days === 1 ? 'día' : 'días'));
    const age = ageText(d);
    return el('li', { class: `card paper-card fecha-card${i === 0 ? ' is-next' : ''}${tone ? ` tone-${tone}` : ''}` },
      el('div', { class: 'fecha-head' },
        el('span', { class: 'fecha-icon', 'aria-hidden': 'true' }, icon(dates.KIND_ICON[d.kind] || 'calendar', { size: 22 })),
        el('div', { class: 'fecha-text' },
          el('h2', { class: 'fecha-name' }, d.name),
          el('span', { class: 'muted small' }, fmtLong.format(d.next.date)),
          age ? el('span', { class: 'badge fecha-age' }, age) : null)),
      count,
      el('div', { class: 'btn-row' }, ui.button({ label: 'Al calendario', iconName: 'download', small: true, variant: 'ghost', ariaLabel: `Agregar ${d.name} al calendario del teléfono`, onClick: () => exportOne(d) })));
  });
  body.replaceChildren(
    el('ul', { class: 'fecha-list' }, cards),
    el('section', { class: 'card paper-card stack-tight' },
      el('p', { class: 'small' }, 'Cada fecha se repite sola cada año en el calendario del teléfono, con un aviso el día antes.'),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Agregar todas al teléfono', iconName: 'calendar', variant: 'primary', onClick: exportAll }),
        ui.button({ label: 'Editar fechas', iconName: 'pencil', variant: 'ghost', href: '#/ajustes/perfil' }))),
  );
  if (clocks.length) timer = setInterval(() => clocks.forEach((c) => c.set()), 20000);
  return { node: page, cleanup: () => clearInterval(timer) };
}
