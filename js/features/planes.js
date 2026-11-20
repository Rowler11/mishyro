// Planes juntos (docs/05 Más §2): small, quick plans shown as ema plaques (light wood with the plan
// written on it). Seeded from CONFIG.bucketList; add, mark as done with its date, delete, and turn a
// plan into a dream (Sueños y viajes) when it grows. "X de Y cumplidos" with a progress bar.
import { ui, util, db, profile } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

export const sortPlans = (list) => [...list].sort((a, b) => (a.done - b.done) || (a.done ? (b.doneAt || '').localeCompare(a.doneAt || '') : (a.order ?? 999) - (b.order ?? 999) || (a.createdAt || '').localeCompare(b.createdAt || '')));

function planEditor(existing, { onSaved }) {
  const title = ui.input({ value: existing?.title || '', maxlength: 90, placeholder: 'Ej.: Ver las luces de Navidad' });
  const f = ui.field({ label: 'Plan', control: title });
  return ui.openModal({
    title: existing ? 'Editar plan' : 'Nuevo plan', size: 'sm',
    body: el('form', { onSubmit: (e) => e.preventDefault() }, f),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!title.value.trim()) { f.setError('Escribe el plan.'); title.focus(); return false; }
      const rec = existing ? { ...existing, title: title.value.trim() } : { id: util.uuid(), title: title.value.trim(), done: false, doneAt: '', order: 1000 + Date.now() / 1e10, by: profile.active(), visibility: 'shared', owner: 'both' };
      await db.put('bucketList', rec); onSaved(rec); return true;
    } }],
  });
}

function doneDialog(plan, { onSaved }) {
  const date = ui.input({ type: 'date', value: util.localDay(), max: util.localDay() });
  const f = ui.field({ label: '¿Cuándo lo cumplieron?', control: date });
  return ui.openModal({
    title: '¡Cumplido!', size: 'sm', body: el('div', { class: 'stack' }, el('p', { class: 'ema-dialog-title' }, plan.title), f),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Marcar cumplido', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(date.value) || date.value > util.localDay()) { f.setError('Elige una fecha de hoy o de antes.'); return false; }
      await db.put('bucketList', { ...plan, done: true, doneAt: date.value }); util.haptic([10, 30, 10]); ui.confetti({ count: 28 }); onSaved(); return true;
    } }],
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide planes' });
  const add = () => planEditor(null, { onSaved: () => { ui.toast('Plan agregado.', { tone: 'success' }); load(); } });
  page.append(ui.pageHeader({ title: 'Planes juntos', jp: '願い', romaji: 'negai', back: '/mas', actions: [ui.newButton('Plan', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);

  const toDream = async (p) => {
    if (!(await ui.confirmDialog({ title: '¿Convertirlo en sueño?', message: `"${p.title}" pasa a Sueños y viajes, donde puede tener pasos, fecha soñada y foto.`, confirmLabel: 'Convertir' }))) return;
    await db.put('dreams', { id: util.uuid(), name: p.title, kind: 'experience', priority: 2, note: '', checklist: [], status: 'open', doneAt: '', visibility: 'shared', owner: 'both', fromPlan: p.id });
    await db.purge('bucketList', p.id);
    ui.toast('Ahora está en Sueños y viajes.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/suenos'; } } });
    load();
  };
  const ema = (p) => el('li', { class: `ema${p.done ? ' is-done' : ''}` },
    el('span', { class: 'ema-cord', 'aria-hidden': 'true' }),
    el('label', { class: 'ema-check' },
      el('input', { type: 'checkbox', checked: p.done, onChange: async (e) => {
        if (e.target.checked) { e.target.checked = false; doneDialog(p, { onSaved: load }); }
        else { await db.put('bucketList', { ...p, done: false, doneAt: '' }); load(); }
      } }),
      el('span', { class: 'ema-title' }, p.title)),
    p.done && p.doneAt ? el('p', { class: 'ema-date' }, `Cumplido el ${fmtDay.format(util.parseDay(p.doneAt))}`) : null,
    el('div', { class: 'ema-actions' },
      p.done ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Convertir "${p.title}" en sueño`, onClick: () => toDream(p) }, icon('moon-star', { size: 16 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar "${p.title}"`, onClick: () => planEditor(p, { onSaved: load }) }, icon('pencil', { size: 16 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar "${p.title}"`, onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Borrar este plan?', message: `"${p.title}" se borra en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
        await db.purge('bucketList', p.id); load();
      } }, icon('trash-2', { size: 16 }))));

  const load = async () => {
    const list = sortPlans((await db.query('bucketList')).filter((p) => !p.deleted));
    const done = list.filter((p) => p.done).length;
    if (!list.length) { body.replaceChildren(ui.emptyState({ title: 'Su primer plan', text: 'Cosas pequeñas que quieren vivir juntos. Escriban la primera.', art: 'omamori', action: { label: 'Agregar un plan', onClick: add } })); return; }
    body.replaceChildren(
      el('div', { class: 'card paper-card first-progress' },
        el('p', {}, el('strong', {}, `${done} de ${list.length}`), ' cumplidos'),
        el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Planes cumplidos', 'aria-valuemin': '0', 'aria-valuemax': String(list.length), 'aria-valuenow': String(done) },
          el('span', { class: 'progress-fill', style: { width: `${Math.round((done / list.length) * 100)}%` } }))),
      el('ul', { class: 'ema-board' }, list.map(ema)));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los planes', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'bucketList') load().catch(() => {}); });
  return { node: page, cleanup: off };
}
