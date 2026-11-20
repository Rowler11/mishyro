// Alcancía (docs/05 Más §15): shared savings GOALS, one per date or plan they want to pay together.
// An original maneki-neko keeps the total of the active goals; each goal fills a Mount Fuji from the
// bottom (style chosen once and reused). Deposits and withdrawals per person, what is missing and how
// much per week or month to arrive on time, 25/50/75 % messages, a celebration with hanabi and the
// 愛 hanko when a goal is reached ("Agendar la cita" opens the Calendario prefilled), a history with
// filters, search and a monthly chart. The app only records: it never moves real money.
import { ui, util, db, profile } from '../core.js';
import { moneyField, barChart, lastMonths, monthLabel, monthOf, coins, hanabi } from './hogar-kit.js';

const { el, icon } = util;
const NS = 'http://www.w3.org/2000/svg';
const ICONS = ['piggy-bank', 'heart', 'plane', 'chef-hat', 'gift', 'house', 'paw-print', 'music', 'camera', 'jp-torii', 'star', 'party-popper'];
const KEY = 'aishiteru.alcancia.tab';

// ---------- pure helpers (unit-tested) ----------
export const signed = (e) => (e.type === 'withdraw' ? -1 : 1) * (Number(e.amount) || 0);

/** Saved in a goal (never below zero). */
export const savedIn = (goalId, entries) => Math.max(0, entries.filter((e) => e.goalId === goalId && !e.deleted).reduce((n, e) => n + signed(e), 0));

/** Percent 0-100 of a goal (null without a target). */
export const pctOf = (goal, saved) => (goal?.targetCOP > 0 ? Math.max(0, Math.min(100, Math.floor((saved / goal.targetCOP) * 100))) : null);

/** How much per week and per month to reach the target by its date (null without date or already there). */
export function pace(goal, saved, today = util.localDay()) {
  if (!(goal?.targetCOP > 0) || !goal.targetDate || !util.isValidDay(goal.targetDate)) return null;
  const missing = goal.targetCOP - saved;
  if (missing <= 0) return null;
  const days = util.daysBetween(util.parseDay(today), util.parseDay(goal.targetDate));
  if (days <= 0) return { late: true, missing };
  const weeks = Math.max(1, Math.ceil(days / 7)); const months = Math.max(1, Math.ceil(days / 30.44));
  return { late: false, missing, perWeek: Math.ceil(missing / weeks), perMonth: Math.ceil(missing / months), days };
}

/** The 25/50/75 % mark crossed going from `before` to `after` (highest one), or 0. */
export function crossedMark(before, after) {
  return [75, 50, 25].find((m) => before < m && after >= m) || 0;
}

/** Totals per person for a list of entries. */
export const byPerson = (entries) => Object.fromEntries(profile.PEOPLE.map((p) => [p, entries.filter((e) => e.by === p && !e.deleted).reduce((n, e) => n + signed(e), 0)]));

// ---------- art ----------
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/** Mount Fuji that fills from the bottom with the percent; snow cap shines at 100 %. */
export function fuji(pct = 0, { size = 72, label } = {}) {
  const id = `fj-${util.uuid().slice(0, 8)}`;
  const svg = svgEl('svg', { viewBox: '0 0 100 64', width: size, height: Math.round(size * 0.64), class: `fuji${pct >= 100 ? ' is-full' : ''}` });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const shape = 'M2 62 L38 10 Q50 2 62 10 L98 62 Z';
  const clip = svgEl('clipPath', { id }); clip.append(svgEl('path', { d: shape }));
  const h = Math.round((Math.max(0, Math.min(100, pct || 0)) / 100) * 60);
  svg.append(clip,
    svgEl('path', { d: shape, class: 'fuji-empty' }),
    svgEl('rect', { x: 0, y: 62 - h, width: 100, height: h, class: 'fuji-fill', 'clip-path': `url(#${id})` }),
    svgEl('path', { d: 'M38 10 Q50 2 62 10 L68 19 L61 16 L56 21 L50 15 L44 21 L39 16 L32 19 Z', class: 'fuji-snow' }),
    svgEl('path', { d: shape, class: 'fuji-line' }));
  return svg;
}

/** Original maneki-neko holding a koban coin. */
function manekiBank() {
  const svg = svgEl('svg', { viewBox: '0 0 120 120', width: 112, height: 112, class: 'bank-neko', 'aria-hidden': 'true' });
  svg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path class="bank-body" d="M30 112V70c0-18 13-30 30-30s30 12 30 30v42Z"/><path d="M34 48 30 22l17 13M86 48l4-26-17 13"/><path d="M90 66c8-4 12-16 8-28"/><circle cx="98" cy="34" r="6"/><circle cx="50" cy="60" r="2.2" fill="currentColor"/><circle cx="70" cy="60" r="2.2" fill="currentColor"/><path d="M56 68c2 2 6 2 8 0"/><path d="M42 80h36"/><circle cx="60" cy="86" r="5"/></g><ellipse class="bank-koban" cx="60" cy="100" rx="17" ry="11"/><path class="bank-koban-line" d="M50 100h20M52 96h16M52 104h16"/>';
  return svg;
}

// ---------- dialogs ----------
function goalEditor(existing, { onSaved }) {
  const g = existing || {};
  const name = ui.input({ value: g.name || '', maxlength: 60, placeholder: 'Ej.: Cena en el restaurante japonés' });
  const target = moneyField({ label: 'Monto objetivo', value: g.targetCOP || '' });
  const date = ui.input({ type: 'date', value: g.targetDate || '', min: util.localDay() });
  const note = ui.input({ value: g.note || '', maxlength: 160 });
  let iconName = g.icon || 'piggy-bank';
  const picker = el('div', { class: 'icon-pick', role: 'radiogroup', 'aria-label': 'Ícono' }, ICONS.map((n) => {
    const b = el('button', { class: 'icon-pick-btn', type: 'button', role: 'radio', 'aria-checked': String(n === iconName), 'aria-label': n, onClick: () => { iconName = n; picker.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); } }, icon(n, { size: 22 }));
    return b;
  }));
  const fName = ui.field({ label: 'Nombre de la meta', control: name });
  const fTarget = target;
  return ui.openModal({
    title: existing ? 'Editar meta' : 'Nueva meta', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, fName, fTarget.node,
      ui.field({ label: 'Fecha objetivo (opcional)', control: date, hint: 'Con fecha calculamos cuánto ahorrar por semana o por mes.' }),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Ícono'), picker),
      ui.field({ label: 'Nota (opcional)', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const amount = target.amount();
      if (!name.value.trim()) { fName.setError('Ponle nombre.'); name.focus(); return false; }
      if (!Number.isFinite(amount) || amount <= 0) { fTarget.setError('Escribe un monto mayor que cero.'); return false; }
      if (date.value && !util.isValidDay(date.value)) return false;
      const rec = { ...g, id: g.id || util.uuid(), name: name.value.trim(), targetCOP: amount, targetDate: date.value, icon: iconName, note: note.value.trim(), status: g.status || 'active', doneAt: g.doneAt || '', visibility: 'shared', owner: 'both' };
      await db.put('savingsGoals', rec); onSaved(rec); return true;
    } }],
  });
}

function entryEditor(goal, existing, { saved, onSaved, entries }) {
  const e = existing || {};
  let type = e.type || 'deposit';
  let by = e.by || profile.active();
  const amount = moneyField({ label: 'Monto', value: e.amount || '' });
  const date = ui.input({ type: 'date', value: e.date || util.localDay(), max: util.localDay() });
  const note = ui.input({ value: e.note || '', maxlength: 120 });
  const fAmount = amount;
  const fDate = ui.field({ label: 'Fecha', control: date });
  return ui.openModal({
    title: existing ? 'Editar movimiento' : goal.name, size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (ev) => ev.preventDefault() },
      ui.segmented({ label: 'Tipo', value: type, onChange: (v) => { type = v; }, options: [{ value: 'deposit', label: 'Aporte', icon: 'plus' }, { value: 'withdraw', label: 'Retiro', icon: 'minus' }] }),
      fAmount.node,
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, '¿Quién?'), ui.segmented({ label: '¿Quién?', value: by, onChange: (v) => { by = v; }, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })) })),
      fDate, ui.field({ label: 'Nota (opcional)', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const n = amount.amount();
      if (!Number.isFinite(n) || n <= 0) { fAmount.setError('Escribe un monto mayor que cero.'); return false; }
      if (!util.isValidDay(date.value) || date.value > util.localDay()) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
      // A withdrawal can never leave the goal below zero.
      const others = entries.filter((x) => x.goalId === goal.id && x.id !== e.id && !x.deleted).reduce((s, x) => s + signed(x), 0);
      if (others + (type === 'withdraw' ? -n : n) < 0) { fAmount.setError(`Solo hay ${util.formatCOP(Math.max(0, others))} en esta meta.`); return false; }
      const rec = { ...e, id: e.id || util.uuid(), goalId: goal.id, type, amount: n, date: date.value, by, note: note.value.trim(), visibility: 'shared', owner: 'both' };
      await db.put('savingsEntries', rec);
      onSaved(rec, saved, others + signed(rec)); return true;
    } }],
  });
}

async function celebrate(goal) {
  hanabi({ bursts: 5 }); util.haptic([20, 60, 20, 60, 40]); coins(5);
  await db.put('savingsGoals', { ...goal, status: 'done', doneAt: util.localDay() });
  const m = ui.openModal({
    title: '¡Meta cumplida!', size: 'sm', className: 'goal-done',
    body: el('div', { class: 'stack goal-done-body' }, ui.hanko({ text: '愛', size: 96, stamp: true, label: 'Sello' }),
      el('p', { class: 'goal-done-name' }, goal.name),
      el('p', {}, 'Lo lograron juntos. Ahora, a vivirlo.')),
    actions: [{ label: 'Después', variant: 'ghost' }, { label: 'Agendar la cita', variant: 'primary', onClick: async () => {
      const cal = await import('./calendario.js');
      cal.editor(null, { day: util.localDay(), prefill: { title: goal.name }, onSaved: () => { location.hash = '#/calendario'; } });
    } }],
  });
  return m;
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide alcancia' });
  let tab = 'activas'; try { tab = sessionStorage.getItem(KEY) || 'activas'; } catch { /* ignore */ }
  let fGoal = ''; let fWho = ''; let q = '';
  let data = { goals: [], entries: [] };
  const add = () => goalEditor(null, { onSaved: () => { ui.toast('Meta creada.', { tone: 'success' }); load(); } });
  page.append(ui.pageHeader({ title: 'Alcancía', jp: '貯金', romaji: 'chokin', back: '/mas', actions: [ui.newButton('Meta', add)] }));
  const tabs = ui.segmented({ label: 'Ver', value: tab, options: [{ value: 'activas', label: 'Metas' }, { value: 'cumplidas', label: 'Cumplidas' }, { value: 'historial', label: 'Historial' }], onChange: (v) => { tab = v; try { sessionStorage.setItem(KEY, v); } catch { /* ignore */ } paint(); } });
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(el('div', { class: 'stack' }, tabs, body));

  const afterEntry = async (goal) => async (rec, _before, afterTotal) => {
    const beforePct = pctOf(goal, savedIn(goal.id, data.entries)) || 0;
    const afterPct = pctOf(goal, afterTotal) || 0;
    if (rec.type === 'deposit') { coins(3); util.haptic(12); }
    await load();
    if (goal.status === 'active' && goal.targetCOP > 0 && afterTotal >= goal.targetCOP) { celebrate(goal).then(() => load()); return; }
    const mark = crossedMark(beforePct, afterPct);
    ui.toast(mark ? `¡Ya van en el ${mark} %! Sigan así.` : rec.type === 'deposit' ? 'Aporte guardado.' : 'Retiro guardado.', { tone: 'success' });
  };

  const goalCard = (g) => {
    const saved = savedIn(g.id, data.entries);
    const pct = pctOf(g, saved);
    const p = pace(g, saved);
    const per = byPerson(data.entries.filter((e) => e.goalId === g.id));
    const done = g.status !== 'active';
    return el('li', { class: `card paper-card goal${done ? ' is-done' : ''}` },
      el('div', { class: 'goal-art' }, fuji(pct ?? 0, { size: 84, label: pct != null ? `${pct} % ahorrado` : 'Sin monto objetivo' }), el('span', { class: 'goal-icon' }, icon(g.icon || 'piggy-bank', { size: 18 }))),
      el('div', { class: 'goal-main' },
        el('h3', { class: 'goal-name' }, g.name),
        el('p', { class: 'goal-amount' }, el('strong', {}, util.formatCOP(saved)), g.targetCOP > 0 ? el('span', { class: 'muted' }, ` de ${util.formatCOP(g.targetCOP)}`) : el('span', { class: 'muted' }, ' · sin monto objetivo')),
        done ? el('p', { class: 'muted small' }, g.status === 'done' ? `Cumplida el ${util.formatDay(g.doneAt)}` : 'Archivada')
          : el('p', { class: 'muted small' }, g.targetCOP > 0 ? (saved >= g.targetCOP ? '¡Ya está completa!' : `Faltan ${util.formatCOP(g.targetCOP - saved)}`) : 'Ponle un monto para ver cuánto falta.',
            p ? (p.late ? ' · la fecha ya pasó' : ` · ${util.formatCOP(p.perWeek)} por semana o ${util.formatCOP(p.perMonth)} al mes`) : ''),
        saved ? el('p', { class: 'muted small' }, profile.PEOPLE.map((x) => `${profile.name(x)}: ${util.formatCOP(per[x])}`).join(' · ')) : null,
        g.note ? el('p', { class: 'small' }, g.note) : null,
        el('div', { class: 'btn-row' },
          done ? null : ui.button({ label: 'Aportar', iconName: 'plus', small: true, variant: 'primary', onClick: async () => entryEditor(g, null, { saved, entries: data.entries, onSaved: await afterEntry(g) }) }),
          el('div', { class: 'list-item-actions' }, el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${g.name}`, onClick: () => goalEditor(g, { onSaved: load }) }, icon('pencil', { size: 16 })),
          done ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Volver a activar ${g.name}`, title: 'Volver a activar', onClick: async () => { await db.put('savingsGoals', { ...g, status: 'active', doneAt: '' }); load(); } }, icon('rotate-ccw', { size: 16 }))
            : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Archivar ${g.name}`, title: 'Archivar', onClick: async () => { await db.put('savingsGoals', { ...g, status: 'archived' }); ui.toast('Meta archivada.'); load(); } }, icon('archive', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${g.name}`, onClick: async () => {
            const n = data.entries.filter((e) => e.goalId === g.id).length;
            if (!(await ui.confirmDialog({ title: '¿Borrar esta meta?', message: `"${g.name}"${n ? ` y sus ${n} movimientos` : ''} se borran en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
            for (const e of data.entries.filter((x) => x.goalId === g.id)) await db.purge('savingsEntries', e.id);
            await db.purge('savingsGoals', g.id); load();
          } }, icon('trash-2', { size: 16 }))))));
  };

  const paint = () => {
    const active = data.goals.filter((g) => g.status === 'active');
    if (tab === 'activas') {
      const total = active.reduce((n, g) => n + savedIn(g.id, data.entries), 0);
      const targets = active.reduce((n, g) => n + (g.targetCOP || 0), 0);
      const fill = targets ? Math.min(1, total / targets) : 0;
      const bank = el('div', { class: 'card paper-card bank', style: { '--fill': String(fill) } },
        manekiBank(),
        el('div', { class: 'bank-text' }, el('p', { class: 'muted small' }, 'Ahorrado entre todas las metas'), el('p', { class: 'bank-total' }, util.formatCOP(total)),
          el('p', { class: 'muted small' }, `${active.length} ${active.length === 1 ? 'meta activa' : 'metas activas'}`)));
      body.replaceChildren(bank,
        active.length ? el('ul', { class: 'goal-list' }, active.map(goalCard)) : ui.emptyState({ title: 'Su primera meta', text: 'Una cita, un viaje, un regalo: cada plan con su propia meta.', art: 'omamori', action: { label: 'Crear una meta', onClick: add } }),
        el('p', { class: 'muted small center' }, icon('info', { size: 14 }), ' La app solo anota lo que ahorran: no mueve dinero ni se conecta a bancos.'));
      return;
    }
    if (tab === 'cumplidas') {
      const done = data.goals.filter((g) => g.status !== 'active').sort((a, b) => (b.doneAt || b.updatedAt || '').localeCompare(a.doneAt || a.updatedAt || ''));
      body.replaceChildren(done.length ? el('ul', { class: 'goal-list' }, done.map(goalCard)) : ui.emptyState({ title: 'Aún ninguna', text: 'Las metas cumplidas y archivadas quedan aquí, con su fecha y monto final.', art: 'omamori' }));
      return;
    }
    // historial
    const goalName = new Map(data.goals.map((g) => [g.id, g.name]));
    const search = ui.input({ type: 'search', value: q, placeholder: 'Buscar en notas o metas', 'aria-label': 'Buscar movimientos' });
    const selGoal = el('select', { class: 'input', 'aria-label': 'Filtrar por meta' }, el('option', { value: '' }, 'Todas las metas'), data.goals.map((g) => el('option', { value: g.id, selected: g.id === fGoal }, g.name)));
    const selWho = el('select', { class: 'input', 'aria-label': 'Filtrar por persona' }, el('option', { value: '' }, 'Los dos'), profile.PEOPLE.map((p) => el('option', { value: p, selected: p === fWho }, profile.name(p))));
    const listBox = el('div');
    const months = lastMonths(6);
    const deposits = months.map((m) => data.entries.filter((e) => monthOf(e.date) === m).reduce((n, e) => n + signed(e), 0));
    let run = data.entries.filter((e) => monthOf(e.date) < months[0]).reduce((n, e) => n + signed(e), 0);
    const cumulative = deposits.map((d) => (run += d));
    const draw = () => {
      const k = q.trim().toLowerCase();
      const shown = data.entries.filter((e) => (!fGoal || e.goalId === fGoal) && (!fWho || e.by === fWho) && (!k || `${e.note} ${goalName.get(e.goalId) || ''}`.toLowerCase().includes(k))).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
      listBox.replaceChildren(shown.length ? el('ol', { class: 'card entry-list' }, shown.map((e) => el('li', { class: 'pet-row' },
        icon(e.type === 'withdraw' ? 'minus' : 'plus', { size: 18 }),
        el('div', { class: 'grow' }, el('strong', { class: e.type === 'withdraw' ? 'text-danger' : '' }, `${e.type === 'withdraw' ? '−' : '+'}${util.formatCOP(e.amount)}`),
          el('p', { class: 'muted small' }, [goalName.get(e.goalId) || 'Meta borrada', profile.name(e.by), util.formatDay(e.date), e.note].filter(Boolean).join(' · '))),
        el('div', { class: 'list-item-actions' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar movimiento', onClick: () => { const g = data.goals.find((x) => x.id === e.goalId); if (g) entryEditor(g, e, { saved: 0, entries: data.entries, onSaved: () => load() }); } }, icon('pencil', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar movimiento', onClick: async () => {
            const after = savedIn(e.goalId, data.entries.filter((x) => x.id !== e.id));
            if (data.entries.filter((x) => x.goalId === e.goalId && x.id !== e.id).reduce((n, x) => n + signed(x), 0) < 0) { ui.toast('No se puede: la meta quedaría en negativo.'); return; }
            if (!(await ui.confirmDialog({ title: '¿Borrar este movimiento?', message: `${util.formatCOP(e.amount)} · ${util.formatDay(e.date)}. La meta queda en ${util.formatCOP(after)}.`, confirmLabel: 'Borrar', danger: true }))) return;
            await db.purge('savingsEntries', e.id); load();
          } }, icon('trash-2', { size: 16 })))))) : el('p', { class: 'muted' }, data.entries.length ? 'Nada coincide con el filtro.' : 'Aún no hay aportes.'));
    };
    search.addEventListener('input', util.debounce(() => { q = search.value; draw(); }, 200));
    selGoal.addEventListener('change', () => { fGoal = selGoal.value; draw(); });
    selWho.addEventListener('change', () => { fWho = selWho.value; draw(); });
    const per = byPerson(data.entries);
    body.replaceChildren(
      el('section', { class: 'card paper-card pet-block' }, el('header', { class: 'pet-block-head' }, el('h2', {}, 'Ahorro acumulado')),
        el('p', { class: 'muted small' }, profile.PEOPLE.map((x) => `${profile.name(x)}: ${util.formatCOP(per[x])}`).join(' · ')),
        barChart({ labels: months.map(monthLabel), values: cumulative.map((v) => Math.max(0, v)), title: 'Ahorro acumulado por mes', format: util.formatCOP })),
      el('div', { class: 'filter-row' }, search, selGoal, selWho), listBox);
    draw();
  };

  const load = async () => {
    const [goals, entries] = await Promise.all([db.query('savingsGoals'), db.query('savingsEntries')]);
    data = { goals: goals.filter((g) => !g.deleted), entries: entries.filter((e) => !e.deleted) };
    paint();
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir la Alcancía', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (['savingsGoals', 'savingsEntries'].includes(s) && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
