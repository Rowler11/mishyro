// Listas compartidas (docs/05 Más §32): shopping and home to-do lists with checkboxes, reorder,
// optional due dates and templates (CONFIG.listTemplates); completed lists go to a history and can be
// reopened. Recipes and date menus send their ingredients here through addItems(), without duplicates.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const sorting = new Set(); // lists in "Ordenar" mode (arrows shown)
const KINDS = [{ value: 'shopping', label: 'Mercado', icon: 'list-todo' }, { value: 'todo', label: 'Pendientes', icon: 'list-checks' }];

/** Normalized text used to avoid duplicates ("Arroz" == "arroz " == "Árroz"). */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Items sorted: pending first by order, then done. */
export const sortItems = (items = []) => [...items].sort((a, b) => (a.done - b.done) || ((a.order ?? 0) - (b.order ?? 0)));

/** Merge new texts into a list's items, skipping the ones it already has (done or not). Pure. */
export function mergeItems(items = [], texts = []) {
  const have = new Set(items.map((i) => norm(i.text)));
  let order = items.reduce((m, i) => Math.max(m, i.order ?? 0), 0);
  const added = [];
  for (const t of texts) {
    const text = String(t || '').trim();
    if (!text || have.has(norm(text))) continue;
    have.add(norm(text));
    added.push({ id: util.uuid(), text, done: false, order: ++order, dueDate: '' });
  }
  return { items: [...items, ...added], added: added.length };
}

/** Add items to an open list (by id) or to a new one; used by Recetas and the date menu. */
export async function addItems({ listId, name, kind = 'shopping', texts = [] }) {
  let list = listId ? await db.get('lists', listId) : null;
  if (!list || list.deleted || list.completedAt) list = { id: util.uuid(), name: name || 'Mercado', kind, items: [], completedAt: '', by: profile.active(), visibility: 'shared', owner: 'both' };
  const { items, added } = mergeItems(list.items, texts);
  await db.put('lists', { ...list, items });
  return { list: { ...list, items }, added };
}

export async function openLists(kind) {
  return (await db.query('lists')).filter((l) => !l.deleted && !l.completedAt && (!kind || l.kind === kind));
}

function listEditor(existing, { onSaved }) {
  const name = ui.input({ value: existing?.name || '', maxlength: 60, placeholder: 'Ej.: Mercado del sábado' });
  let kind = existing?.kind || 'shopping';
  let template = '';
  const f = ui.field({ label: 'Nombre', control: name });
  const templates = (CONFIG.listTemplates || []);
  const tplSel = el('select', { class: 'input' }, el('option', { value: '' }, 'Empezar vacía'), templates.map((t) => el('option', { value: t.id }, `${t.name} (${t.items.length})`)));
  tplSel.addEventListener('change', () => {
    template = tplSel.value;
    const t = templates.find((x) => x.id === template);
    if (t) { kind = t.kind; seg.querySelectorAll('input').forEach((r) => { r.checked = r.value === kind; }); if (!name.value.trim()) name.value = t.name; }
  });
  const seg = ui.segmented({ label: 'Tipo', value: kind, options: KINDS, onChange: (v) => { kind = v; } });
  return ui.openModal({
    title: existing ? 'Editar lista' : 'Nueva lista', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, f, seg,
      existing ? null : ui.field({ label: 'Plantilla', control: tplSel, hint: 'Trae los elementos de una lista típica; luego los editan.' })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!name.value.trim()) { f.setError('Ponle un nombre.'); name.focus(); return false; }
      let rec;
      if (existing) rec = { ...existing, name: name.value.trim(), kind };
      else {
        const t = templates.find((x) => x.id === template);
        rec = { id: util.uuid(), name: name.value.trim(), kind, items: mergeItems([], t?.items || []).items, completedAt: '', by: profile.active(), visibility: 'shared', owner: 'both', fromTemplate: t?.id || '' };
      }
      await db.put('lists', rec); onSaved(rec); return true;
    } }],
  });
}

function itemEditor(list, item, { onSaved }) {
  const text = ui.input({ value: item.text, maxlength: 120 });
  const due = ui.input({ type: 'date', value: item.dueDate || '' });
  const f = ui.field({ label: 'Elemento', control: text });
  return ui.openModal({
    title: 'Editar elemento', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, f, ui.field({ label: 'Para cuándo (opcional)', control: due })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!text.value.trim()) { f.setError('Escribe el elemento.'); return false; }
      if (due.value && !util.isValidDay(due.value)) return false;
      const items = list.items.map((i) => (i.id === item.id ? { ...i, text: text.value.trim(), dueDate: due.value } : i));
      await db.put('lists', { ...list, items }); onSaved(); return true;
    } }],
  });
}

function listView(list, { reload }) {
  const save = (items, extra = {}) => db.put('lists', { ...list, items, ...extra }).then(reload);
  const items = sortItems(list.items);
  const pending = items.filter((i) => !i.done);
  const done = items.length - pending.length;
  const today = util.localDay();
  const input = ui.input({ placeholder: list.kind === 'shopping' ? 'Agregar: leche, pan…' : 'Agregar un pendiente', maxlength: 120, 'aria-label': `Agregar a ${list.name}` });
  const addForm = el('form', { class: 'list-add', onSubmit: async (e) => {
    e.preventDefault();
    // Several at once: "leche, pan, huevos".
    const texts = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!texts.length) return;
    const r = mergeItems(list.items, texts);
    if (!r.added) { ui.toast('Ya está en la lista.'); return; }
    input.value = '';
    await save(r.items);
    document.querySelector(`[data-list="${list.id}"] .list-add input`)?.focus();
  } }, input, el('button', { class: 'icon-btn', type: 'submit', 'aria-label': 'Agregar' }, icon('plus', { size: 20 })));

  const move = (item, dir) => {
    const idx = pending.findIndex((i) => i.id === item.id);
    const other = pending[idx + dir];
    if (!other) return;
    save(list.items.map((i) => (i.id === item.id ? { ...i, order: other.order } : i.id === other.id ? { ...i, order: item.order } : i)));
  };
  const row = (item, idx) => el('li', { class: `list-item${item.done ? ' is-done' : ''}` },
    el('label', { class: 'list-check' },
      el('input', { type: 'checkbox', checked: item.done, onChange: (e) => {
        if (e.target.checked) util.haptic(8);
        save(list.items.map((i) => (i.id === item.id ? { ...i, done: e.target.checked, doneBy: e.target.checked ? profile.active() : '' } : i)));
      } }),
      el('span', { class: 'list-text' }, item.text,
        item.dueDate ? el('small', { class: `list-due${!item.done && item.dueDate < today ? ' is-late' : ''}` }, ` · ${fmtDay.format(util.parseDay(item.dueDate))}`) : null)),
    el('div', { class: 'list-item-actions' },
      item.done || !isSorting ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', disabled: idx === 0, 'aria-label': `Subir "${item.text}"`, onClick: () => move(item, -1) }, icon('arrow-up', { size: 16 })),
      item.done || !isSorting ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', disabled: idx === pending.length - 1, 'aria-label': `Bajar "${item.text}"`, onClick: () => move(item, 1) }, icon('arrow-down', { size: 16 })),
      isSorting ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar "${item.text}"`, onClick: () => itemEditor(list, item, { onSaved: reload }) }, icon('pencil', { size: 16 })),
      isSorting ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Quitar "${item.text}"`, onClick: () => save(list.items.filter((i) => i.id !== item.id)) }, icon('x', { size: 16 }))));

  const complete = async () => {
    const left = pending.length;
    if (left && !(await ui.confirmDialog({ title: '¿Terminar la lista?', message: `Quedan ${left} sin marcar. La lista pasa al historial y se puede reabrir.`, confirmLabel: 'Terminar' }))) return;
    await save(list.items, { completedAt: util.localDay(), completedBy: profile.active() });
    util.haptic([10, 30, 10]);
    ui.toast('Lista terminada.', { tone: 'success' });
  };
  const isSorting = sorting.has(list.id);
  return el('article', { class: `card paper-card list-card${isSorting ? ' is-sorting' : ''}`, 'data-list': list.id },
    el('header', { class: 'list-card-head' },
      el('div', {}, el('h2', { class: 'list-name' }, list.name),
        el('p', { class: 'muted small' }, `${KINDS.find((k) => k.value === list.kind)?.label || ''} · ${done} de ${items.length}`)),
      el('div', { class: 'list-item-actions' },
        pending.length > 1 ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-pressed': String(isSorting), 'aria-label': `Ordenar "${list.name}"`, title: 'Ordenar', onClick: () => { if (isSorting) sorting.delete(list.id); else sorting.add(list.id); reload(); } }, icon('arrow-up-down', { size: 16 })) : null,
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar la lista "${list.name}"`, onClick: () => listEditor(list, { onSaved: reload }) }, icon('pencil', { size: 16 })),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar la lista "${list.name}"`, onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar esta lista?', message: `"${list.name}" se borra en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
          await db.purge('lists', list.id); reload();
        } }, icon('trash-2', { size: 16 })))),
    items.length ? el('div', { class: 'progress', role: 'progressbar', 'aria-label': `Avance de ${list.name}`, 'aria-valuemin': '0', 'aria-valuemax': String(items.length), 'aria-valuenow': String(done) },
      el('span', { class: 'progress-fill', style: { width: `${Math.round((done / items.length) * 100)}%` } })) : null,
    el('ul', { class: 'list-items' }, items.map((i) => row(i, pending.indexOf(i)))),
    addForm,
    el('div', { class: 'list-card-foot' },
      done ? ui.button({ label: 'Quitar marcados', variant: 'ghost', small: true, onClick: () => save(list.items.filter((i) => !i.done)) }) : null,
      items.length ? ui.button({ label: 'Terminar lista', iconName: 'circle-check', small: true, onClick: complete }) : null));
}

export async function render() {
  const page = el('section', { class: 'page page-wide listas' });
  let tab = 'open';
  let kind = '';
  const add = () => listEditor(null, { onSaved: () => { ui.toast('Lista creada.', { tone: 'success' }); load(); } });
  page.append(ui.pageHeader({ title: 'Listas', jp: 'リスト', romaji: 'risuto', back: '/mas', actions: [ui.newButton('Lista', add)] }));
  const tabs = ui.segmented({ label: 'Ver', value: tab, options: [{ value: 'open', label: 'Abiertas' }, { value: 'history', label: 'Historial' }], onChange: (v) => { tab = v; load(); } });
  const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtrar por tipo' });
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(el('div', { class: 'stack' }, tabs, chips, body));

  const load = async () => {
    const all = (await db.query('lists')).filter((l) => !l.deleted);
    chips.replaceChildren(...[{ value: '', label: 'Todas' }, ...KINDS].map((k) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(kind === k.value), onClick: () => { kind = k.value; load(); } }, k.label)));
    const shown = all.filter((l) => (!kind || l.kind === kind) && (tab === 'open' ? !l.completedAt : !!l.completedAt));
    if (tab === 'history') {
      shown.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
      if (!shown.length) { body.replaceChildren(ui.emptyState({ title: 'Aún no terminan ninguna', text: 'Las listas terminadas quedan aquí y se pueden reabrir.', art: 'omamori' })); return; }
      body.replaceChildren(el('ul', { class: 'card list-history' }, shown.map((l) => el('li', { class: 'list-row' },
        icon(l.kind === 'shopping' ? 'list-todo' : 'list-checks', { size: 20 }),
        el('div', { class: 'grow' }, el('strong', {}, l.name), el('p', { class: 'muted small' }, `Terminada el ${util.formatDay(l.completedAt)} · ${l.items.filter((i) => i.done).length} de ${l.items.length}`)),
        ui.button({ label: 'Reabrir', small: true, variant: 'ghost', onClick: async () => { await db.put('lists', { ...l, completedAt: '', completedBy: '' }); tab = 'open'; tabs.querySelector('input[value="open"]').checked = true; load(); } }),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Usar "${l.name}" otra vez`, title: 'Usar otra vez', onClick: async () => {
          await db.put('lists', { id: util.uuid(), name: l.name, kind: l.kind, items: l.items.map((i) => ({ ...i, id: util.uuid(), done: false, dueDate: '' })), completedAt: '', by: profile.active(), visibility: 'shared', owner: 'both' });
          ui.toast('Lista nueva creada con los mismos elementos.', { tone: 'success' }); tab = 'open'; tabs.querySelector('input[value="open"]').checked = true; load();
        } }, icon('copy', { size: 16 }))))));
      return;
    }
    shown.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (!shown.length) { body.replaceChildren(ui.emptyState({ title: 'Su primera lista', text: 'El mercado, los pendientes de la casa o lo que necesiten para una cita.', art: 'omamori', action: { label: 'Crear una lista', onClick: add } })); return; }
    body.replaceChildren(el('div', { class: 'list-grid' }, shown.map((l) => listView(l, { reload: load }))));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las listas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'lists' && !page.contains(document.activeElement?.closest?.('.list-add') || null)) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
