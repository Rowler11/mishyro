// Sueños y viajes (docs/05 Más §38): big dreams to live together, each with its own checklist of
// steps, type, priority, a dreamed date, an inspiration photo, an optional point on the map and,
// when the Alcancía exists (Fase 4B), the saved percentage of its linked goal. Seeded with
// "Viaje a Japón" (CONFIG.dreams). When a dream comes true: celebration, date, and the option to
// keep it as a memory in the Cápsula and to mark the place as visited in the Mapa.
// Different from Planes juntos (small, quick); a plan can become a dream and back.
import { ui, util, db, profile, security } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';
import { loadLeaflet, pinIcon, tiles } from './mapa.js';
import { toTrash, TRASH_NOTE } from './papelera.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
export const KINDS = [{ value: 'trip', label: 'Viaje' }, { value: 'experience', label: 'Experiencia' }, { value: 'goal', label: 'Meta' }];
export const PRIORITIES = [{ value: 1, label: 'Muy pronto' }, { value: 2, label: 'Algún día' }, { value: 3, label: 'Sin afán' }];
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || 'Sueño';

export function progressOf(d) {
  const list = d.checklist || [];
  const done = list.filter((s) => s.done).length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}
/** Saved percentage of the linked savings goal (Alcancía, Fase 4B), or null. */
export function savedPct(goal, entries) {
  if (!goal || !(goal.targetCOP > 0)) return null;
  const total = entries.filter((e) => e.goalId === goal.id && !e.deleted).reduce((n, e) => n + (e.type === 'withdraw' ? -e.amount : e.amount), 0);
  return Math.max(0, Math.min(100, Math.round((total / goal.targetCOP) * 100)));
}

async function pickOnMap(start) {
  if (!(await security.thirdPartyAllowed()) || !navigator.onLine) { ui.toast('El mapa necesita conexión y que el Modo sin terceros esté apagado.'); return null; }
  const L = await loadLeaflet().catch(() => null);
  if (!L) return null;
  const box = el('div', { class: 'map-box map-pick' });
  let pos = start || null; let marker = null;
  const m = ui.openModal({ title: 'Toca el lugar en el mapa', size: 'lg', body: el('div', { class: 'stack' }, box, el('p', { class: 'muted small' }, 'Puedes acercarte con dos dedos.')),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Usar este punto', variant: 'primary', value: 'ok', onClick: () => (pos ? true : (ui.toast('Toca primero un punto.'), false)) }] });
  requestAnimationFrame(() => {
    const map = L.map(box).setView(pos ? [pos.lat, pos.lng] : [20, 0], pos ? 10 : 2);
    tiles(L).addTo(map);
    if (pos) marker = L.marker([pos.lat, pos.lng], { icon: pinIcon(L, 'map-pin-dream') }).addTo(map);
    map.on('click', (e) => { pos = { lat: +e.latlng.lat.toFixed(4), lng: +e.latlng.lng.toFixed(4) }; marker?.remove(); marker = L.marker([pos.lat, pos.lng], { icon: pinIcon(L, 'map-pin-dream') }).addTo(map); });
    m.result.then(() => map.remove());
  });
  return (await m.result) === 'ok' ? pos : null;
}

function editor(existing, { onSaved }) {
  const isNew = !existing;
  const d = existing ? structuredClone(existing) : { id: util.uuid(), kind: 'trip', priority: 2, checklist: [], status: 'open', visibility: 'shared', owner: 'both' };
  const name = ui.input({ value: d.name || '', maxlength: 80, placeholder: 'Ej.: Ver la nieve' });
  const placeName = ui.input({ value: d.placeName || '', maxlength: 80, placeholder: 'Opcional' });
  const date = ui.input({ type: 'date', value: d.dreamDate || '' });
  const note = ui.textarea({ rows: 3, maxlength: 1500 }); note.value = d.note || '';
  let kind = d.kind; let priority = d.priority || 2; let pos = Number.isFinite(d.lat) ? { lat: d.lat, lng: d.lng } : null;
  const posText = el('span', { class: 'muted small' });
  const paintPos = () => { posText.textContent = pos ? 'Con punto en el mapa.' : 'Sin punto en el mapa.'; };
  paintPos();
  let photo = null; let keep = d.mediaId || null; let url = null; let busy = false;
  const box = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `dr-${d.id.slice(0, 8)}` });
  const paint = async () => {
    if (!url && keep) { const b = await db.getMedia(keep).catch(() => null); if (b) url = URL.createObjectURL(b); }
    box.replaceChildren(url
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src: url, alt: 'Imagen de inspiración' }),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la imagen', onClick: () => { photo = null; keep = null; if (url) URL.revokeObjectURL(url); url = null; paint(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Imagen de inspiración')), file);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    busy = true;
    try { photo = await compressImage(f); keep = null; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa imagen.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  // checklist
  const steps = (d.checklist || []).map((s) => ({ ...s }));
  const stepList = el('ul', { class: 'dream-steps-edit' });
  const newStep = ui.input({ maxlength: 80, placeholder: 'Ej.: Sacar el pasaporte', 'aria-label': 'Nuevo paso' });
  const paintSteps = () => stepList.replaceChildren(...steps.map((s, i) => el('li', {},
    el('span', { class: 'dream-step-text' }, s.text),
    el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Subir "${s.text}"`, disabled: i === 0, onClick: () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; paintSteps(); } }, icon('arrow-up', { size: 16 })),
    el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Quitar "${s.text}"`, onClick: () => { steps.splice(i, 1); paintSteps(); } }, icon('x', { size: 16 })))));
  const addStep = () => { const t = newStep.value.trim(); if (!t) return; steps.push({ id: util.uuid().slice(0, 8), text: t, done: false }); newStep.value = ''; paintSteps(); newStep.focus(); };
  newStep.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } });
  paintSteps();
  const fName = ui.field({ label: 'Sueño', control: name });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que la imagen esté lista.'; return false; }
    if (!name.value.trim()) { fName.setError('Ponle un nombre al sueño.'); name.focus(); return false; }
    let created = null;
    try {
      const rec = { ...d, name: name.value.trim(), kind, priority, placeName: placeName.value.trim(), dreamDate: date.value || '', note: note.value.trim(), checklist: steps.map((s, i) => ({ ...s, order: i + 1 })), lat: pos?.lat ?? null, lng: pos?.lng ?? null };
      if (photo) { created = await db.putMedia(photo.blob, { ownerStore: 'dreams', ownerId: d.id, width: photo.width, height: photo.height }); rec.mediaId = created; } else rec.mediaId = keep;
      await db.put('dreams', rec);
      if (existing?.mediaId && existing.mediaId !== rec.mediaId) await db.rawDelete('media', existing.mediaId).catch(() => {});
      onSaved(rec, isNew); return true;
    } catch (x) {
      if (created) await db.rawDelete('media', created).catch(() => {});
      console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la imagen.' : 'No se pudo guardar. Lo que escribiste sigue aquí.'; return false;
    }
  };
  return ui.openModal({
    title: isNew ? 'Nuevo sueño' : 'Editar sueño', kind: 'sheet', size: 'lg',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fName,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Tipo'), ui.segmented({ label: 'Tipo', value: kind, options: KINDS, onChange: (v) => { kind = v; } })),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Prioridad'), ui.segmented({ label: 'Prioridad', value: priority, options: PRIORITIES, onChange: (v) => { priority = Number(v); } })),
      ui.field({ label: 'Lugar', control: placeName }),
      el('div', { class: 'field' }, posText, ui.button({ label: pos ? 'Cambiar el punto' : 'Marcar en el mapa', iconName: 'map', small: true, onClick: async () => { const p = await pickOnMap(pos); if (p) { pos = p; paintPos(); } } })),
      ui.field({ label: 'Fecha soñada (opcional)', control: date }),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Pasos'), stepList, el('div', { class: 'row-input' }, newStep, ui.button({ label: 'Agregar', iconName: 'plus', small: true, onClick: addStep }))),
      box,
      ui.field({ label: 'Nota', control: note }),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
    onClose: () => { if (url) URL.revokeObjectURL(url); },
  });
}

async function fulfill(d, reload) {
  const date = ui.input({ type: 'date', value: util.localDay(), max: util.localDay() });
  let toCapsule = true; let toMap = Number.isFinite(d.lat);
  const m = ui.openModal({
    title: '¡Se cumplió!', size: 'sm',
    body: el('div', { class: 'stack' }, el('p', { class: 'ema-dialog-title' }, d.name), ui.field({ label: '¿Cuándo?', control: date }),
      ui.toggle({ label: 'Guardarlo como recuerdo en la Cápsula', checked: toCapsule, onChange: (v) => { toCapsule = v; } }),
      Number.isFinite(d.lat) ? ui.toggle({ label: 'Marcar el lugar como visitado en el Mapa', checked: toMap, onChange: (v) => { toMap = v; } }) : null),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Celebrar', variant: 'primary', value: 'ok', onClick: () => util.isValidDay(date.value) && date.value <= util.localDay() }],
  });
  if ((await m.result) !== 'ok') return;
  const day = date.value;
  await db.put('dreams', { ...d, status: 'done', doneAt: day });
  let memId = null;
  if (toCapsule) {
    memId = util.uuid(); const mediaIds = [];
    if (d.mediaId) { const b = await db.getMedia(d.mediaId).catch(() => null); if (b) mediaIds.push(await db.putMedia(b, { ownerStore: 'memories', ownerId: memId })); }
    await db.put('memories', { id: memId, title: d.name, date: day, note: d.note || '', mediaIds, visibility: 'shared', owner: 'both', by: profile.active() });
  }
  if (toMap) await db.put('places', { id: util.uuid(), name: d.placeName || d.name, date: day, kind: d.kind === 'trip' ? 'viaje' : 'otro', lat: d.lat, lng: d.lng, note: '', mediaIds: [], by: profile.active(), visibility: 'shared', owner: 'both' });
  ui.confetti(); util.haptic([10, 40, 10, 40, 10]);
  ui.toast('¡Un sueño cumplido!', { tone: 'success', action: memId ? { label: 'Ver recuerdo', onClick: () => { location.hash = `#/capsula/${memId}`; } } : undefined });
  reload();
}

export async function render() {
  const page = el('section', { class: 'page page-wide suenos' });
  const urls = new Set();
  const add = () => editor(null, { onSaved: () => { ui.toast('Sueño guardado.', { tone: 'success' }); load(); } });
  page.append(ui.pageHeader({ title: 'Sueños y viajes', jp: '夢', romaji: 'yume', back: '/mas', actions: [ui.newButton('Sueño', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let goals = []; let entries = [];

  const toggleStep = async (d, sid) => { const checklist = d.checklist.map((s) => (s.id === sid ? { ...s, done: !s.done } : s)); await db.put('dreams', { ...d, checklist }); };
  const toPlan = async (d) => {
    if (!(await ui.confirmDialog({ title: '¿Volverlo un plan?', message: `"${d.name}" pasa a Planes juntos como un plan sencillo. Sus pasos y foto se quitan.`, confirmLabel: 'Convertir' }))) return;
    await db.put('bucketList', { id: util.uuid(), title: d.name, done: false, doneAt: '', order: 1000, visibility: 'shared', owner: 'both', by: profile.active() });
    if (d.mediaId) await db.rawDelete('media', d.mediaId).catch(() => {});
    await db.purge('dreams', d.id); load();
  };
  const card = (d) => {
    const pr = progressOf(d);
    const goal = goals.find((g) => g.id === d.savingsGoalId && !g.deleted);
    const pct = savedPct(goal, entries);
    const pic = el('div', { class: 'dream-pic', 'aria-hidden': 'true' }, icon(d.kind === 'trip' ? 'plane' : 'moon-star', { size: 28 }));
    if (d.mediaId) db.getMedia(d.mediaId).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.add(u); pic.replaceChildren(el('img', { src: u, alt: '' })); } }).catch(() => {});
    const done = d.status === 'done';
    return el('li', { class: `card paper-card dream${done ? ' is-done' : ''}` },
      pic,
      el('div', { class: 'dream-main' },
        el('p', { class: 'card-kicker' }, [kindLabel(d.kind), PRIORITIES.find((p) => p.value === d.priority)?.label].filter(Boolean).join(' · ')),
        el('h3', { class: 'dream-name' }, d.name),
        d.placeName ? el('p', { class: 'muted small' }, icon('map-pin', { size: 14 }), ` ${d.placeName}`) : null,
        d.places?.length ? el('p', { class: 'muted small' }, d.places.join(' · ')) : null,
        done ? el('p', { class: 'dream-done' }, `Cumplido el ${fmtDay.format(util.parseDay(d.doneAt))}`) : d.dreamDate ? el('p', { class: 'muted small' }, `Soñado para el ${fmtDay.format(util.parseDay(d.dreamDate))}`) : null,
        pr.total ? el('div', { class: 'dream-progress' },
          el('div', { class: 'progress', role: 'progressbar', 'aria-label': `Pasos de ${d.name}`, 'aria-valuemin': '0', 'aria-valuemax': String(pr.total), 'aria-valuenow': String(pr.done) }, el('span', { class: 'progress-fill', style: { width: `${pr.pct}%` } })),
          el('span', { class: 'small muted' }, `${pr.done} de ${pr.total} pasos`)) : null,
        pct !== null ? el('p', { class: 'small' }, icon('piggy-bank', { size: 14 }), ` Ahorrado: ${pct}%`) : null,
        pr.total && !done ? el('details', { class: 'dream-steps' }, el('summary', {}, 'Pasos'),
          el('ul', {}, (d.checklist || []).map((s) => el('li', {}, el('label', { class: 'check-row' }, el('input', { type: 'checkbox', checked: s.done, onChange: () => toggleStep(d, s.id) }), el('span', {}, s.text)))))) : null,
        el('div', { class: 'card-actions' },
          done ? null : ui.button({ label: '¡Se cumplió!', iconName: 'sparkles', small: true, onClick: () => fulfill(d, load) }),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${d.name}`, onClick: () => editor(d, { onSaved: () => load() }) }, icon('pencil', { size: 18 })),
          done ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Volver plan "${d.name}"`, onClick: () => toPlan(d) }, icon('list-checks', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${d.name}`, onClick: async () => {
            if (!(await ui.confirmDialog({ title: '¿Borrar este sueño?', message: `"${d.name}". ${TRASH_NOTE}`, confirmLabel: 'Borrar', danger: true }))) return;
            await toTrash('dreams', d.id, { label: d.name, what: 'Sueño borrado', extraMedia: [d.mediaId], onRestored: load }); load();
          } }, icon('trash-2', { size: 18 })))));
  };
  const load = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const [dreams, g, e] = await Promise.all([db.query('dreams'), db.query('savingsGoals').catch(() => []), db.query('savingsEntries').catch(() => [])]);
    goals = g; entries = e;
    const list = dreams.filter((d) => !d.deleted);
    const open = list.filter((d) => d.status !== 'done').sort((a, b) => (a.priority || 2) - (b.priority || 2) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const done = list.filter((d) => d.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    if (!list.length) { body.replaceChildren(ui.emptyState({ title: 'Su primer sueño', text: 'Un viaje, una experiencia o una meta grande, con sus pasos.', art: 'moon', action: { label: 'Escribir un sueño', onClick: add } })); return; }
    body.replaceChildren(...[
      open.length ? el('section', { class: 'stack' }, el('h2', { class: done.length ? 'tl-month' : 'sr-only' }, 'Por cumplir'), el('ul', { class: 'dream-list' }, open.map(card))) : null,
      done.length ? el('section', { class: 'stack' }, el('h2', { class: 'tl-month' }, 'Cumplidos'), el('ul', { class: 'dream-list' }, done.map(card))) : null,
    ].filter(Boolean));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los sueños', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'dreams') load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
