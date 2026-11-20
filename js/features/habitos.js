// Hábitos compartidos (docs/05 Más §30): couple habits from CONFIG.habitTemplates (editable) or their
// own, a daily box per person (each one marks their own), a shared streak that counts a day only when
// both marked it, with one grace day per week (decided 2026-11-20), a weekly view and a little plant
// that grows with the streak and droops gently (never dies) when they leave it. No notifications: an
// optional daily reminder goes to the phone's calendar as .ics.
import { ui, util, db, profile, CONFIG } from '../core.js';
import * as ics from '../core/ics.js';
import { computeStreak } from './insignias.js';

const { el, icon } = util;
const fmtDow = new Intl.DateTimeFormat('es-CO', { weekday: 'narrow' });
const addDay = (day, n) => { const d = util.parseDay(day); d.setDate(d.getDate() + n); return util.localDay(d); };

// ---------- pure helpers (unit-tested) ----------
export const checkId = (habitId, date, by) => `${habitId}:${date}:${by}`;

/** Days (Set of "YYYY-MM-DD") where BOTH marked the habit. */
export function bothDays(checks, habitId) {
  const by = new Map();
  for (const c of checks) {
    if (c.deleted || c.habitId !== habitId) continue;
    if (!by.has(c.date)) by.set(c.date, new Set());
    by.get(c.date).add(c.by);
  }
  return new Set([...by].filter(([, s]) => profile.PEOPLE.every((p) => s.has(p))).map(([d]) => d));
}

/** Plant stage 0-4 by streak; "droop" when the streak broke after having grown. */
export function plantStage(current, best) {
  const stage = current >= 30 ? 4 : current >= 14 ? 3 : current >= 7 ? 2 : current >= 3 ? 1 : 0;
  return { stage, droop: current === 0 && best >= 3 };
}

// ---------- art ----------
function plant({ stage, droop }, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('width', '72'); svg.setAttribute('height', '72');
  svg.setAttribute('class', `plant s${stage}${droop ? ' is-droop' : ''}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  const leaves = [
    '<path class="leaf" d="M32 44c-6-1-10-5-10-10 6 0 10 4 10 10Z"/>',
    '<path class="leaf" d="M32 40c6-1 10-5 10-10-6 0-10 4-10 10Z"/>',
    '<path class="leaf" d="M32 32c-5-1-8-5-8-9 5 0 8 4 8 9Z"/>',
    '<path class="leaf" d="M32 28c5-1 8-5 8-9-5 0-8 4-8 9Z"/>',
  ];
  const stem = [48, 40, 32, 26, 20][stage];
  svg.innerHTML = `<path class="pot" d="M20 50h24l-3 12H23Z"/><path class="pot-rim" d="M18 48h28v3H18Z"/><g class="stem-g"><path class="stem" d="M32 49V${stem}"/>${leaves.slice(0, Math.max(1, stage)).join('')}${stage >= 4 ? '<circle class="bloom" cx="32" cy="17" r="4.5"/>' : ''}</g>`;
  return svg;
}

// ---------- dialogs ----------
function habitEditor(existing, { onSaved }) {
  const h = existing || {};
  const templates = (CONFIG.habitTemplates || []);
  const name = ui.input({ value: h.name || '', maxlength: 60, placeholder: 'Ej.: Caminar 20 minutos' });
  const hint = ui.input({ value: h.hint || '', maxlength: 120 });
  const tpl = existing ? null : el('select', { class: 'input' }, el('option', { value: '' }, 'Escribir uno propio'), templates.map((t) => el('option', { value: t.id }, t.name)));
  tpl?.addEventListener('change', () => { const t = templates.find((x) => x.id === tpl.value); if (t) { name.value = t.name; hint.value = t.hint || ''; } });
  const fName = ui.field({ label: 'Hábito', control: name });
  return ui.openModal({
    title: existing ? 'Editar hábito' : 'Nuevo hábito', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, tpl ? ui.field({ label: 'Ideas', control: tpl }) : null, fName, ui.field({ label: 'Detalle (opcional)', control: hint })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!name.value.trim()) { fName.setError('Escribe el hábito.'); return false; }
      const rec = { ...h, id: h.id || util.uuid(), name: name.value.trim(), hint: hint.value.trim(), active: h.active ?? true, schedule: h.schedule || 'daily', fromTemplate: h.fromTemplate || tpl?.value || '', visibility: 'shared', owner: 'both' };
      await db.put('habits', rec); onSaved(rec); return true;
    } }],
  });
}

function reminderDialog(habits) {
  const time = ui.input({ type: 'time', value: '20:00' });
  return ui.openModal({
    title: 'Recordatorio diario', size: 'sm',
    body: el('div', { class: 'stack' }, el('p', {}, 'La app no envía notificaciones. Este archivo agrega un aviso diario al calendario del teléfono.'), ui.field({ label: 'Hora', control: time })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Descargar', variant: 'primary', onClick: () => {
      const [h, m] = (time.value || '20:00').split(':').map(Number);
      const start = new Date(); start.setHours(h || 20, m || 0, 0, 0);
      ics.download('habitos.ics', ics.calendar([{ uid: 'habitos-diario', title: 'Nuestros hábitos', start, durationMin: 10, description: habits.map((x) => x.name).join(', '), rrule: 'FREQ=DAILY', alarms: [0] }]));
      ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
    } }],
  });
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide habitos' });
  const add = () => habitEditor(null, { onSaved: () => { ui.toast('Hábito agregado.', { tone: 'success' }); load(); } });
  page.append(ui.pageHeader({ title: 'Hábitos', jp: '習慣', romaji: 'shūkan', back: '/mas', actions: [ui.newButton('Hábito', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(body);
  const me = profile.active();

  const load = async () => {
    const [habits, checks] = await Promise.all([db.query('habits'), db.query('habitChecks')]);
    const list = habits.filter((h) => !h.deleted).sort((a, b) => (b.active - a.active) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const live = checks.filter((c) => !c.deleted);
    const today = util.localDay();
    const week = Array.from({ length: 7 }, (_, i) => addDay(today, i - 6));
    if (!list.length) { body.replaceChildren(ui.emptyState({ title: 'Su primer hábito', text: 'Algo pequeño que hacen los dos cada día. La plantita crece con la racha.', art: 'omamori', action: { label: 'Agregar un hábito', onClick: add } })); return; }
    const has = (hid, d, by) => live.some((c) => c.habitId === hid && c.date === d && c.by === by);
    const toggle = async (h, on) => {
      const id = checkId(h.id, today, me);
      if (on) { await db.put('habitChecks', { id, habitId: h.id, date: today, by: me, visibility: 'shared', owner: 'both' }); util.haptic(10); }
      else await db.purge('habitChecks', id);
      await load();
      if (on) {
        // Every full week of the shared streak wins a Rasca y gana card for each (once per day and habit).
        const all = (await db.query('habitChecks')).filter((c) => !c.deleted);
        const days = bothDays(all, h.id);
        const st = computeStreak(days, today);
        if (days.has(today) && st.current > 0 && st.current % 7 === 0) (await import('./rasca.js')).earnForBoth(`habit-${h.id}-${today}`, 'habit');
      }
    };
    const card = (h) => {
      const days = bothDays(live, h.id);
      const st = computeStreak(days, today);
      const ps = plantStage(st.current, st.best);
      const partner = profile.partnerOf(me);
      const mine = has(h.id, today, me); const theirs = has(h.id, today, partner);
      const grace = new Set(st.graceDays);
      return el('li', { class: `card paper-card habit${h.active ? '' : ' is-paused'}` },
        el('div', { class: 'habit-plant' }, plant(ps, ps.droop ? 'La plantita espera que vuelvan' : `Plantita en etapa ${ps.stage + 1} de 5`)),
        el('div', { class: 'habit-main' },
          el('h3', { class: 'habit-name' }, h.name),
          h.hint ? el('p', { class: 'muted small' }, h.hint) : null,
          el('p', { class: 'habit-streak' }, icon('flame', { size: 16 }), ` ${st.current} ${st.current === 1 ? 'día' : 'días'} juntos`, st.best > st.current ? el('span', { class: 'muted' }, ` · mejor: ${st.best}`) : null),
          h.active ? el('div', { class: 'habit-today' },
            el('label', { class: 'check-inline habit-check' }, el('input', { type: 'checkbox', checked: mine, onChange: (e) => toggle(h, e.target.checked) }), el('span', {}, `Hoy, ${profile.name(me)}`)),
            el('span', { class: `habit-partner${theirs ? ' is-on' : ''}` }, icon(theirs ? 'circle-check' : 'clock', { size: 16 }), ` ${profile.name(partner)}: ${theirs ? 'listo' : 'pendiente'}`)) : el('p', { class: 'muted small' }, 'En pausa'),
          el('ol', { class: 'habit-week', 'aria-label': 'Últimos 7 días' }, week.map((d) => {
            const n = profile.PEOPLE.filter((p) => has(h.id, d, p)).length;
            const state = n === 2 ? 'both' : grace.has(d) ? 'grace' : n === 1 ? 'one' : 'none';
            const label = { both: 'los dos', one: 'uno de los dos', grace: 'día de gracia', none: 'nadie' }[state];
            return el('li', { class: `hw-${state}${d === today ? ' is-today' : ''}`, title: `${util.formatDay(d)}: ${label}` }, el('span', { class: 'hw-dow', 'aria-hidden': 'true' }, fmtDow.format(util.parseDay(d))), el('span', { class: 'hw-dot' }), el('span', { class: 'sr-only' }, `${util.formatDay(d)}: ${label}`));
          })),
          el('div', { class: 'list-item-actions' },
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${h.name}`, onClick: () => habitEditor(h, { onSaved: load }) }, icon('pencil', { size: 16 })),
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': h.active ? `Pausar ${h.name}` : `Retomar ${h.name}`, title: h.active ? 'Pausar' : 'Retomar', onClick: async () => { await db.put('habits', { ...h, active: !h.active }); load(); } }, icon(h.active ? 'pause' : 'play', { size: 16 })),
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${h.name}`, onClick: async () => {
              if (!(await ui.confirmDialog({ title: '¿Borrar este hábito?', message: `"${h.name}" y sus casillas se borran en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
              for (const c of live.filter((x) => x.habitId === h.id)) await db.purge('habitChecks', c.id);
              await db.purge('habits', h.id); load();
            } }, icon('trash-2', { size: 16 })))));
    };
    const active = list.filter((h) => h.active);
    body.replaceChildren(
      el('p', { class: 'muted small' }, 'Cada uno marca lo suyo. Un día cuenta en la racha cuando los dos lo marcan; si un día se les pasa, hay uno de gracia por semana.'),
      el('ul', { class: 'habit-list' }, list.map(card)),
      active.length ? ui.button({ label: 'Recordatorio en el teléfono', iconName: 'bell', small: true, variant: 'ghost', onClick: () => reminderDialog(active) }) : null);
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los hábitos', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (['habits', 'habitChecks'].includes(s) && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
