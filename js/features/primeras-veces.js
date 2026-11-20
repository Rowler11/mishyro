// Primeras veces (docs/05 Más §22): an album of "the first time we…". Suggestions come from
// CONFIG.firsts (content kind 'first') and show as blank pages that invite them to fill them in;
// each page gets a date, a photo, a note and who remembered it. They can add their own, and hide
// a suggestion that doesn't fit. Shared with both; pages feed the Galería and the Álbum.
import { ui, util, db, profile, CONFIG } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';
import { openViewer } from '../core/viewer.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const recId = (promptId) => `first:${promptId}`;

/** Pages = suggestions (filled or blank) + own pages. Hidden suggestions drop out. */
export function buildPages(prompts, records, fill = (t) => t) {
  const byPrompt = new Map(records.filter((r) => r.promptId).map((r) => [r.promptId, r]));
  const pages = [];
  for (const p of prompts) {
    const r = byPrompt.get(p.id);
    if (r?.skipped) continue;
    pages.push(r ? { ...r, title: r.title || fill(p.title) } : { id: recId(p.id), promptId: p.id, title: fill(p.title), blank: true });
  }
  for (const r of records) if (!r.promptId && !r.skipped) pages.push(r);
  return pages.map((x) => ({ ...x, blank: x.blank || !(x.date || x.mediaId || x.note) }));
}

function editor(page, { onSaved }) {
  const me = profile.active();
  const isOwn = !page.promptId;
  const title = ui.input({ value: page.title || '', maxlength: 80, placeholder: 'La primera vez que…' });
  const date = ui.input({ type: 'date', value: page.date || '', max: util.localDay() });
  const note = ui.textarea({ rows: 4, maxlength: 1500, placeholder: '¿Cómo fue?' });
  note.value = page.note || '';
  let photo = null; let keep = page.mediaId || null; let url = null; let busy = false;
  const box = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `fp-${util.uuid().slice(0, 8)}` });
  const paint = async () => {
    if (!url && keep) { const b = await db.getMedia(keep).catch(() => null); if (b) url = URL.createObjectURL(b); }
    box.replaceChildren(url
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src: url, alt: 'Foto de esta primera vez' }),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keep = null; if (url) URL.revokeObjectURL(url); url = null; paint(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Foto (opcional)')), file);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    busy = true;
    try { photo = await compressImage(f); keep = null; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  const fTitle = ui.field({ label: 'Primera vez', control: title });
  const fDate = ui.field({ label: 'Fecha', control: date, hint: 'Si no la recuerdan exacta, una aproximada sirve.' });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
    if (!title.value.trim()) { fTitle.setError('Escribe cuál primera vez es.'); title.focus(); return false; }
    if (date.value && (!util.isValidDay(date.value) || date.value > util.localDay())) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
    if (!date.value && !photo && !keep && !note.value.trim()) { err.textContent = 'Agrega al menos la fecha, una foto o unas líneas.'; return false; }
    const id = page.blank && page.promptId ? recId(page.promptId) : (page.id || util.uuid());
    const prev = await db.get('firsts', id).catch(() => null);
    const created = [];
    try {
      const rec = { ...(prev || {}), id, promptId: page.promptId || null, title: title.value.trim(), date: date.value || '', note: note.value.trim(), by: prev?.by || me, visibility: 'shared', owner: 'both', skipped: false };
      if (photo) { rec.mediaId = await db.putMedia(photo.blob, { ownerStore: 'firsts', ownerId: id, width: photo.width, height: photo.height }); created.push(rec.mediaId); }
      else rec.mediaId = keep;
      await db.put('firsts', rec);
      if (prev?.mediaId && prev.mediaId !== rec.mediaId) await db.rawDelete('media', prev.mediaId).catch(() => {});
      util.haptic(12);
      onSaved(rec, page.blank);
      return true;
    } catch (x) {
      for (const m of created) await db.rawDelete('media', m).catch(() => {});
      console.error(x);
      err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar. Lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: page.blank ? 'Completar la página' : 'Editar la página', kind: 'sheet', size: 'lg',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (ev) => ev.preventDefault() },
      isOwn || !page.blank ? fTitle : el('p', { class: 'first-prompt' }, page.title),
      fDate, ui.field({ label: 'Cómo fue', control: note }), box, err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
    onClose: () => { if (url) URL.revokeObjectURL(url); },
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide primeras' });
  const urls = new Set();
  let pages = [];
  const openEditor = (p) => editor(p, { onSaved: (rec, wasBlank) => { ui.toast(wasBlank ? 'Página completada.' : 'Cambios guardados.', { tone: 'success' }); if (wasBlank) ui.confetti({ count: 24 }); load(); } });
  page.append(ui.pageHeader({ title: 'Primeras veces', jp: '初めて', romaji: 'hajimete', back: '/mas', actions: [ui.newButton('Agregar', () => openEditor({ title: '', blank: true }))] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);

  const hideSuggestion = async (p) => {
    if (!(await ui.confirmDialog({ title: '¿Quitar esta página?', message: `"${p.title}" deja de aparecer en el álbum de los dos. Pueden volver a mostrarla abajo.`, confirmLabel: 'Quitar' }))) return;
    await db.put('firsts', { id: recId(p.promptId), promptId: p.promptId, skipped: true, visibility: 'shared', owner: 'both' });
    load();
  };
  const removeOwn = async (p) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar esta página?', message: 'Se borra con su foto en los dos teléfonos.', confirmLabel: 'Borrar', danger: true }))) return;
    if (p.mediaId) await db.rawDelete('media', p.mediaId).catch(() => {});
    await db.purge('firsts', p.id); load();
  };
  const clearPage = async (p) => {
    if (!(await ui.confirmDialog({ title: '¿Dejar la página en blanco?', message: 'Se borran la fecha, la foto y la nota de esta página.', confirmLabel: 'Dejar en blanco', danger: true }))) return;
    if (p.mediaId) await db.rawDelete('media', p.mediaId).catch(() => {});
    await db.purge('firsts', p.id); load();
  };

  const card = (p, i) => {
    const pic = el('div', { class: 'first-photo', 'aria-hidden': 'true' });
    if (p.mediaId) db.getMedia(p.mediaId).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.add(u); pic.append(el('img', { src: u, alt: '' })); } }).catch(() => {});
    if (p.blank) {
      return el('li', { class: 'first-page first-blank' },
        el('button', { class: 'first-blank-btn', type: 'button', onClick: () => openEditor(p) },
          el('span', { class: 'first-num', 'aria-hidden': 'true' }, String(i + 1)),
          el('span', { class: 'first-title' }, p.title),
          el('span', { class: 'first-cta' }, icon('pencil', { size: 16 }), ' Completar')),
        p.promptId ? el('button', { class: 'icon-btn icon-btn-small first-hide', type: 'button', 'aria-label': `Quitar "${p.title}"`, onClick: () => hideSuggestion(p) }, icon('x', { size: 16 })) : null);
    }
    return el('li', { class: 'card paper-card first-page' },
      p.mediaId ? el('button', { class: 'first-photo-btn', type: 'button', 'aria-label': `Ver la foto de ${p.title}`, onClick: () => openViewer([{ mediaId: p.mediaId, alt: p.title, caption: p.title, sub: p.date ? fmtDay.format(util.parseDay(p.date)) : '' }]) }, pic) : null,
      el('h3', { class: 'first-title' }, p.title),
      p.date ? el('p', { class: 'first-date' }, fmtDay.format(util.parseDay(p.date))) : null,
      p.note ? el('p', { class: 'first-note' }, p.note) : null,
      el('footer', { class: 'first-foot' },
        el('span', { class: 'muted small' }, `La recordó ${profile.name(p.by)}`),
        el('span', {},
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${p.title}`, onClick: () => openEditor(p) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': p.promptId ? `Dejar en blanco ${p.title}` : `Borrar ${p.title}`, onClick: () => (p.promptId ? clearPage(p) : removeOwn(p)) }, icon('trash-2', { size: 18 })))));
  };

  const load = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const [content, records, pets] = await Promise.all([db.query('content', { index: 'kind', range: IDBKeyRange.only('first') }), db.query('firsts'), db.query('pets')]);
    const hasPets = pets.some((x) => !x.deleted);
    const order = new Map((CONFIG.firsts || []).map((f, i) => [f.id, i]));
    const prompts = content.filter((c) => !c.deleted && (c.requires !== 'pets' || hasPets)).sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    pages = buildPages(prompts, records, (t) => profile.fill(t));
    const filled = pages.filter((p) => !p.blank);
    filled.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const blank = pages.filter((p) => p.blank);
    const skipped = records.filter((r) => r.skipped && r.promptId);
    const total = pages.length; const done = filled.length;
    body.replaceChildren(...[
      el('div', { class: 'card paper-card first-progress' },
        el('p', {}, el('strong', {}, `${done} de ${total}`), ' páginas completas'),
        el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Páginas completas', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
          el('span', { class: 'progress-fill', style: { width: `${total ? Math.round((done / total) * 100) : 0}%` } }))),
      filled.length ? el('section', { class: 'stack' }, el('h2', { class: 'tl-month' }, 'Nuestras primeras veces'), el('ul', { class: 'first-grid' }, filled.map(card))) : null,
      blank.length ? el('section', { class: 'stack' }, el('h2', { class: 'tl-month' }, 'Páginas en blanco'), el('ul', { class: 'first-grid first-grid-blank' }, blank.map(card))) : null,
      skipped.length ? el('p', { class: 'muted small' }, `${skipped.length} ${skipped.length === 1 ? 'página quitada' : 'páginas quitadas'}. `,
        el('button', { class: 'link-btn', type: 'button', onClick: async () => { for (const r of skipped) await db.purge('firsts', r.id); load(); } }, 'Volver a mostrarlas')) : null].filter(Boolean));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el álbum', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'firsts') load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
