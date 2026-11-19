// Cápsula (docs/05 Pestaña 2, "Un día como hoy", docs/09 #/capsula).
// Vertical timeline, most recent first with "Ver desde el inicio" (decision 2026-11-19),
// memories with up to 6 photos in a carousel, add/edit in a sheet (side panel on PC),
// delete own memories with confirmation. Photos live in the `media` store, never inline.
import { ui, util, db, profile, seed, security, CONFIG } from '../core.js';
import * as time from '../core/time.js';
import { compressImage, isQuotaError, MAX_PHOTOS } from '../core/images.js';

const { el, icon } = util;
const WIDE = '(min-width: 1100px)';
const fmtFull = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonthDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const KEY = `${CONFIG.storageKey}.capsula.order`;
const readOrder = () => { try { return localStorage.getItem(KEY) === 'oldest' ? 'oldest' : 'newest'; } catch { return 'newest'; } };
const saveOrder = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

const pending = (t) => !t || seed.needsCompletion(t);
const titleOf = (m) => (pending(m.title) ? 'Recuerdo sin título' : m.title);
const isDraft = (m) => m.draft || !util.isValidDay(m.date);
const canDelete = (m) => m.origin === 'user';

/** "Hace 1 año", "Hace 3 meses", "Hace 12 días", "Hoy". */
export function agoText(day, now = new Date()) {
  const d = util.parseDay(day);
  if (!d) return '';
  const e = time.elapsed(d, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  if (e.years) return `Hace ${plural(e.years, 'año', 'años')}`;
  if (e.months) return `Hace ${plural(e.months, 'mes', 'meses')}`;
  if (e.days) return e.days === 1 ? 'Ayer' : `Hace ${e.days} días`;
  return d > now ? '' : 'Hoy';
}

/** Memories from this same day in earlier years first, then earlier months. */
export function onThisDay(memories, now = new Date()) {
  const today = util.localDay(now);
  const [, mm, dd] = today.split('-');
  const past = memories.filter((m) => !isDraft(m) && m.date < today && m.date.slice(8) === dd);
  const years = past.filter((m) => m.date.slice(5, 7) === mm);
  const list = years.length ? years : past;
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- object URLs (revoked when the view goes away) ----------
function urlBag() {
  const urls = new Set();
  return {
    async of(mediaId) {
      const blob = await db.getMedia(mediaId).catch(() => null);
      if (!blob) return null;
      const u = URL.createObjectURL(blob); urls.add(u); return u;
    },
    track(u) { urls.add(u); return u; },
    revokeAll() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); },
  };
}

// ---------- carousel ----------
function carousel(mediaIds, bag, title) {
  if (!mediaIds?.length) return null;
  const track = el('div', { class: 'carousel-track', tabindex: '0', 'aria-label': `Fotos de ${title}` });
  const dots = el('div', { class: 'carousel-dots' });
  const n = mediaIds.length;
  const slides = mediaIds.map((id, i) => {
    const img = el('img', { alt: `${title}, foto ${i + 1} de ${n}`, decoding: 'async', class: 'purikura-img' });
    bag.of(id).then((u) => { if (u) img.src = u; else img.replaceWith(el('div', { class: 'photo-missing' }, icon('image-off'), 'Foto no disponible')); });
    return el('figure', { class: 'carousel-slide purikura', role: 'group', 'aria-roledescription': 'foto', 'aria-label': `${i + 1} de ${n}` }, img);
  });
  track.append(...slides);
  const go = (i) => { const s = slides[Math.max(0, Math.min(n - 1, i))]; track.scrollTo({ left: s.offsetLeft - track.offsetLeft, behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' }); };
  const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const dotBtns = slides.map((_, i) => el('button', { class: 'carousel-dot', type: 'button', 'aria-label': `Ver foto ${i + 1}`, onClick: () => go(i) }));
  dots.append(...dotBtns);
  const paint = () => { const c = current(); dotBtns.forEach((b, i) => b.setAttribute('aria-current', i === c ? 'true' : 'false')); prev.disabled = c === 0; next.disabled = c === n - 1; };
  const prev = el('button', { class: 'icon-btn carousel-nav carousel-prev', type: 'button', 'aria-label': 'Foto anterior', onClick: () => go(current() - 1) }, icon('chevron-left'));
  const next = el('button', { class: 'icon-btn carousel-nav carousel-next', type: 'button', 'aria-label': 'Foto siguiente', onClick: () => go(current() + 1) }, icon('chevron-right'));
  track.addEventListener('scroll', util.debounce(paint, 60), { passive: true });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });
  const box = el('div', { class: `carousel${n === 1 ? ' carousel-single' : ''}`, role: 'region', 'aria-roledescription': 'carrusel', 'aria-label': 'Fotos del recuerdo' },
    track, n > 1 ? [prev, next, dots] : null);
  requestAnimationFrame(paint);
  return box;
}

// ---------- detail ----------
function detailView(m, { bag, onEdit, onDelete, back }) {
  const noteText = pending(m.note) ? '' : m.note;
  return el('article', { class: 'memory-detail', 'aria-labelledby': `md-${m.id}` },
    back ? el('a', { class: 'btn btn-ghost btn-small memory-back', href: '#/capsula' }, icon('arrow-left', { size: 20 }), 'Volver a la línea') : null,
    carousel(m.mediaIds, bag, titleOf(m)),
    el('p', { class: 'memory-date' }, isDraft(m) ? 'Sin fecha' : fmtFull.format(util.parseDay(m.date)), !isDraft(m) ? el('span', { class: 'muted' }, ` · ${agoText(m.date)}`) : null),
    el('h2', { class: 'memory-title', id: `md-${m.id}` }, titleOf(m)),
    m.visibility === 'self' ? el('span', { class: 'badge' }, icon('lock', { size: 14 }), ' Solo yo') : null,
    noteText ? el('div', { class: 'memory-note' }, noteText.split(/\n{2,}/).map((p) => el('p', {}, p))) : null,
    (pending(m.title) || pending(m.note) || isDraft(m)) ? el('p', { class: 'pending' }, 'Le faltan datos: tócalo en Editar para completarlo.') : null,
    el('div', { class: 'card-actions' },
      ui.button({ label: 'Editar', iconName: 'pencil', small: true, onClick: () => onEdit(m) }),
      canDelete(m) ? ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => onDelete(m) }) : null));
}

// ---------- editor ----------
function editor(existing, { bag, onSaved }) {
  const isNew = !existing;
  const m = existing || { id: util.uuid(), mediaIds: [], visibility: 'shared' };
  // Photo slots: kept ones { mediaId, url } and new ones { blob, width, height, url }.
  const photos = [];
  const removed = [];
  let visibility = m.visibility || 'shared';
  let busy = 0;

  const title = ui.input({ maxlength: 80, autocomplete: 'off', value: pending(m.title) ? '' : m.title || '', autofocus: isNew ? undefined : true });
  const date = ui.input({ type: 'date', value: util.isValidDay(m.date) ? m.date : '', max: util.localDay() });
  const note = ui.textarea({ maxlength: 2000, rows: 5 });
  note.value = pending(m.note) ? '' : m.note || '';
  const fTitle = ui.field({ label: 'Título', control: title, hint: pending(m.title) && m.title ? 'Este recuerdo vino incompleto en los datos iniciales.' : '' });
  const fDate = ui.field({ label: 'Fecha', control: date });
  const fNote = ui.field({ label: 'Nota (opcional)', control: note, hint: 'Lo que no quieren olvidar de ese día.' });
  const formError = el('p', { class: 'field-error form-error', role: 'alert' });
  // An error goes away as soon as the field is fixed.
  title.addEventListener('input', () => { if (title.value.trim()) fTitle.setError(''); });
  date.addEventListener('change', () => { if (util.isValidDay(date.value)) fDate.setError(''); });

  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: `ph-${m.id.slice(0, 8)}` });
  const grid = el('div', { class: 'photo-grid' });
  const photoMsg = el('p', { class: 'field-hint photo-msg', 'aria-live': 'polite' });
  const drop = el('div', { class: 'photo-drop' },
    el('div', { class: 'photo-drop-head' },
      el('span', { class: 'field-label' }, 'Fotos'),
      el('span', { class: 'field-hint' }, `Hasta ${MAX_PHOTOS}. La primera es la portada.`)),
    grid, photoMsg, fileInput);

  const paintPhotos = () => {
    const tiles = photos.map((p, i) => el('div', { class: 'photo-tile' },
      el('img', { src: p.url || '', alt: `Foto ${i + 1}` }),
      i === 0 ? el('span', { class: 'photo-cover' }, 'Portada') : null,
      el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': `Quitar foto ${i + 1}`, onClick: () => {
        const [gone] = photos.splice(i, 1);
        if (gone.mediaId) removed.push(gone.mediaId);
        paintPhotos(); photoMsg.textContent = `Foto ${i + 1} quitada.`;
      } }, icon('x', { size: 18 })),
      i > 0 ? el('button', { class: 'icon-btn photo-first', type: 'button', 'aria-label': `Usar la foto ${i + 1} como portada`, onClick: () => {
        photos.unshift(...photos.splice(i, 1)); paintPhotos(); photoMsg.textContent = 'Portada cambiada.';
      } }, icon('star', { size: 16 })) : null));
    const add = photos.length < MAX_PHOTOS
      ? el('label', { class: 'photo-add', for: fileInput.id }, icon('image-plus', { size: 28 }), el('span', {}, photos.length ? 'Agregar' : 'Agregar fotos'))
      : null;
    grid.replaceChildren(...tiles, add || '');
  };

  const addFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name));
    const room = MAX_PHOTOS - photos.length;
    if (!list.length) { photoMsg.textContent = 'Eso no parece una foto.'; return; }
    const take = list.slice(0, room);
    busy++; photoMsg.textContent = take.length === 1 ? 'Preparando la foto…' : `Preparando ${take.length} fotos…`;
    let failed = 0;
    for (const f of take) {
      try {
        const out = await compressImage(f);
        photos.push({ ...out, url: bag.track(URL.createObjectURL(out.blob)) });
        paintPhotos();
      } catch { failed++; }
    }
    busy--;
    const extra = list.length - take.length;
    photoMsg.textContent = [
      failed ? `No pudimos leer ${failed === 1 ? 'una foto' : `${failed} fotos`}.` : '',
      extra > 0 ? `Caben ${MAX_PHOTOS} fotos por recuerdo: ${extra === 1 ? 'una quedó' : `${extra} quedaron`} fuera.` : '',
    ].filter(Boolean).join(' ') || (take.length === 1 ? 'Foto lista.' : 'Fotos listas.');
  };
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  // Drag and drop on PC (docs/09).
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragging'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  // Existing photos load their object URLs.
  (async () => {
    for (const id of m.mediaIds || []) photos.push({ mediaId: id, url: await bag.of(id) });
    paintPhotos();
  })();
  paintPhotos();

  const validate = () => {
    let first = null;
    const t = title.value.trim();
    fTitle.setError(t ? '' : 'Escribe un título.'); if (!t) first = first || title;
    const d = date.value;
    const dateErr = !d ? 'Elige la fecha del recuerdo.' : !util.isValidDay(d) ? 'Esa fecha no es válida.' : '';
    fDate.setError(dateErr); if (dateErr) first = first || date;
    if (first) first.focus();
    return !first;
  };

  const save = async () => {
    formError.textContent = '';
    if (busy) { formError.textContent = 'Espera a que terminen de prepararse las fotos.'; return false; }
    if (!validate()) return false;
    const saved = [];
    const replaced = [];
    try {
      const rec = {
        ...m, title: title.value.trim(), date: date.value, note: note.value.trim(), draft: false,
        visibility, private: visibility === 'self', owner: visibility === 'self' ? profile.active() : (m.owner || profile.active()),
      };
      // "Solo yo" photos are encrypted with the same key as their memory (docs/04).
      const scope = security.policy('memories', rec) || undefined;
      const opts = (p) => ({ ownerStore: 'memories', ownerId: m.id, width: p.width, height: p.height, encryptScope: scope });
      const mediaIds = [];
      for (const p of photos) {
        if (p.mediaId) {
          const raw = await db.rawGet('media', p.mediaId);
          if (raw && !!raw.enc === !!scope) { mediaIds.push(p.mediaId); continue; }
          // Visibility changed: re-save the photo with or without encryption.
          const blob = await db.getMedia(p.mediaId);
          if (!blob) continue;
          const id = await db.putMedia(blob, opts(raw || {}));
          saved.push(id); replaced.push(p.mediaId); mediaIds.push(id);
          continue;
        }
        const id = await db.putMedia(p.blob, opts(p));
        saved.push(id); mediaIds.push(id);
      }
      rec.mediaIds = mediaIds;
      await db.put('memories', rec);
      for (const id of [...removed, ...replaced]) await db.rawDelete('media', id).catch(() => {});
      util.haptic(15);
      onSaved(rec, isNew);
      return true;
    } catch (e) {
      for (const id of saved) await db.rawDelete('media', id).catch(() => {});
      formError.textContent = isQuotaError(e)
        ? 'No queda espacio en este teléfono para guardar estas fotos. Quita alguna o libera espacio y vuelve a intentarlo. Lo que escribiste sigue aquí.'
        : 'No se pudo guardar. Inténtalo de nuevo; lo que escribiste sigue aquí.';
      if (!isQuotaError(e)) console.error(e);
      return false;
    }
  };

  const body = el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); } },
    drop, fTitle, fDate, fNote,
    ui.visibilityPicker({ value: visibility, onChange: (v) => { visibility = v; } }),
    formError);
  const modal = ui.openModal({
    title: isNew ? 'Nuevo recuerdo' : 'Editar recuerdo', kind: 'sheet', size: 'lg', className: 'memory-editor', body,
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      { label: isNew ? 'Guardar recuerdo' : 'Guardar cambios', variant: 'primary', onClick: save },
    ],
  });
  if (isNew) requestAnimationFrame(() => title.focus({ preventScroll: true }));
  return modal;
}

// ---------- timeline ----------
function timelineItem(m, bag, { selected, fresh } = {}) {
  const thumb = el('span', { class: 'tl-thumb', 'aria-hidden': 'true' });
  if (m.mediaIds?.length) {
    bag.of(m.mediaIds[0]).then((u) => { if (u) thumb.append(el('img', { src: u, alt: '' })); });
    if (m.mediaIds.length > 1) thumb.append(el('span', { class: 'tl-more' }, `+${m.mediaIds.length - 1}`));
  } else thumb.append(icon('jp-tsuru', { size: 28 }));
  const note = pending(m.note) ? '' : m.note;
  const link = el('a', { class: 'card card-link tl-card', href: `#/capsula/${encodeURIComponent(m.id)}`, dataset: { id: m.id }, 'aria-current': selected ? 'true' : undefined },
    thumb,
    el('span', { class: 'tl-text' },
      el('span', { class: 'tl-date' }, isDraft(m) ? 'Sin fecha' : fmtFull.format(util.parseDay(m.date))),
      el('span', { class: 'tl-title' }, titleOf(m)),
      note ? el('span', { class: 'tl-note' }, note) : null,
      el('span', { class: 'tl-tags' },
        m.visibility === 'self' ? el('span', { class: 'badge' }, 'Solo yo') : null,
        (pending(m.title) || pending(m.note) || isDraft(m)) ? el('span', { class: 'pending' }, 'Por completar') : null)));
  return el('li', { class: `tl-item${fresh ? ' unroll' : ''}` }, el('span', { class: 'tl-dot', 'aria-hidden': 'true' }), link);
}

function timeline(list, bag, { selectedId, freshId }) {
  const ol = el('ol', { class: 'timeline', 'aria-label': 'Línea de tiempo de recuerdos' });
  let year = null;
  for (const m of list) {
    const y = m.date.slice(0, 4);
    if (y !== year) { year = y; ol.append(el('li', { class: 'tl-year', 'aria-hidden': 'true' }, y)); }
    ol.append(timelineItem(m, bag, { selected: m.id === selectedId, fresh: m.id === freshId }));
  }
  return ol;
}

function onThisDayCard(list, bag) {
  const [m] = list;
  if (!m) return null;
  const thumb = el('span', { class: 'otd-thumb', 'aria-hidden': 'true' });
  if (m.mediaIds?.length) bag.of(m.mediaIds[0]).then((u) => { if (u) thumb.append(el('img', { src: u, alt: '' })); });
  else thumb.append(icon('jp-sakura', { size: 36 }));
  return el('a', { class: 'card card-link otd-card', href: `#/capsula/${encodeURIComponent(m.id)}` },
    thumb,
    el('span', { class: 'otd-text' },
      el('span', { class: 'card-kicker' }, 'Un día como hoy'),
      el('span', { class: 'otd-title' }, titleOf(m)),
      el('span', { class: 'muted small' }, `${agoText(m.date)} · ${fmtFull.format(util.parseDay(m.date))}`),
      list.length > 1 ? el('span', { class: 'muted small' }, `Y ${plural(list.length - 1, 'recuerdo más', 'recuerdos más')} de un día como hoy.`) : null));
}

// ---------- view ----------
export async function render(ctx) {
  const bag = urlBag();
  const page = el('section', { class: 'page page-wide capsula' });
  const header = ui.pageHeader({ title: 'Cápsula', jp: '思い出', romaji: 'omoide' });
  const body = el('div', { class: 'capsula-body' }, ui.skeleton(4));
  const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Agregar recuerdo', title: 'Agregar recuerdo', onClick: () => openEditor() }, icon('plus', { size: 28 }));
  page.append(header, body, fab);
  const wide = window.matchMedia(WIDE);
  let order = readOrder();
  let memories = [];
  let selectedId = null;
  let freshId = null;

  const routeId = ctx.params?.a && ctx.params.a !== 'nuevo' ? ctx.params.a : null;

  const load = async () => {
    memories = await db.query('memories');
  };

  const findMemory = (id) => memories.find((x) => x.id === id);

  const openEditor = (m = null) => editor(m, {
    bag,
    onSaved: async (rec, isNew) => {
      ui.toast(isNew ? 'Recuerdo guardado.' : 'Cambios guardados.', { tone: 'success' });
      freshId = isNew ? rec.id : null;
      selectedId = rec.id;
      await load();
      if (!wide.matches && routeId) { draw(); return; }
      draw();
      const node = body.querySelector(`.tl-card[data-id="${CSS.escape(rec.id)}"]`);
      node?.scrollIntoView({ block: 'center', behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' });
    },
  });

  const remove = async (m) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar este recuerdo?', message: `"${titleOf(m)}" y sus fotos se borran de este teléfono. No se puede deshacer.`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    try {
      await db.purge('memories', m.id);
      ui.toast('Recuerdo borrado.');
      selectedId = null;
      await load();
      if (routeId) { location.hash = '#/capsula'; return; }
      draw();
    } catch (e) { console.error(e); ui.toast('No se pudo borrar. Inténtalo de nuevo.', { tone: 'error' }); }
  };

  const detailFor = (m, back) => detailView(m, { bag, back, onEdit: openEditor, onDelete: remove });

  function draw() {
    const dated = memories.filter((m) => !isDraft(m));
    const drafts = memories.filter(isDraft);
    dated.sort((a, b) => (order === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Phone: a memory route shows its own page.
    if (routeId && !wide.matches) {
      const m = findMemory(routeId);
      header.querySelector('.page-title').textContent = 'Cápsula';
      body.replaceChildren(m ? detailFor(m, true) : ui.emptyState({ title: 'No encontramos ese recuerdo', text: 'Puede que se haya borrado.', art: 'crane', action: { label: 'Ir a la línea de tiempo', onClick: () => { location.hash = '#/capsula'; } } }));
      fab.hidden = true;
      return;
    }
    fab.hidden = false;
    if (!memories.length) {
      body.replaceChildren(ui.emptyState({ title: 'Aún no hay recuerdos', text: 'Guarden aquí los momentos que no quieren olvidar, con fotos y una nota.', art: 'crane', action: { label: 'Agregar el primero', onClick: () => openEditor() } }));
      return;
    }
    const toggle = el('button', { class: 'btn btn-ghost btn-small', type: 'button', 'aria-pressed': String(order === 'oldest') },
      icon(order === 'newest' ? 'arrow-down' : 'arrow-up', { size: 18 }), order === 'newest' ? 'Ver desde el inicio' : 'Ver lo más reciente');
    toggle.addEventListener('click', () => { order = order === 'newest' ? 'oldest' : 'newest'; saveOrder(order); draw(); });
    const bar = el('div', { class: 'capsula-bar' },
      el('p', { class: 'muted small' }, `${plural(memories.length, 'recuerdo', 'recuerdos')}${order === 'newest' ? ' · lo más reciente arriba' : ' · desde el inicio'}`),
      dated.length > 1 ? toggle : null);

    if (wide.matches && !selectedId) selectedId = routeId && findMemory(routeId) ? routeId : (dated[0] || drafts[0])?.id;
    const list = el('div', { class: 'capsula-list' },
      onThisDayCard(onThisDay(memories), bag),
      bar,
      dated.length ? timeline(dated, bag, { selectedId: wide.matches ? selectedId : null, freshId }) : null,
      drafts.length ? el('section', { class: 'capsula-drafts', 'aria-labelledby': 'drafts-title' },
        el('h2', { class: 'card-kicker', id: 'drafts-title' }, 'Por completar'),
        el('p', { class: 'muted small' }, 'Recuerdos que llegaron sin fecha o sin título. Ábrelos y complétalos.'),
        el('ul', { class: 'timeline timeline-drafts' }, drafts.map((m) => timelineItem(m, bag, { selected: wide.matches && m.id === selectedId })))) : null);
    freshId = null;

    if (wide.matches) {
      const sel = findMemory(selectedId);
      const panel = el('aside', { class: 'capsula-detail card', 'aria-label': 'Detalle del recuerdo' }, sel ? detailFor(sel, false) : null);
      // On PC the list stays and the panel changes in place; the address follows without a new view.
      list.addEventListener('click', (e) => {
        const a = e.target.closest('.tl-card, .otd-card');
        if (!a || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        selectedId = decodeURIComponent(a.getAttribute('href').split('/').pop());
        history.replaceState(history.state, '', `#/capsula/${encodeURIComponent(selectedId)}`);
        list.querySelectorAll('.tl-card[aria-current]').forEach((n) => n.removeAttribute('aria-current'));
        list.querySelector(`.tl-card[data-id="${CSS.escape(selectedId)}"]`)?.setAttribute('aria-current', 'true');
        const m = findMemory(selectedId);
        panel.replaceChildren(m ? detailFor(m, false) : '');
        panel.querySelector('.memory-title')?.setAttribute('tabindex', '-1');
        panel.querySelector('.memory-title')?.focus({ preventScroll: true });
      });
      body.replaceChildren(el('div', { class: 'capsula-split' }, list, panel));
    } else {
      body.replaceChildren(list);
    }
  }

  try {
    await load();
  } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los recuerdos', text: 'El almacenamiento del navegador no respondió. Cierra y vuelve a abrir la app; tus datos siguen en el teléfono.', art: 'wave' }));
    return { node: page, cleanup: () => bag.revokeAll() };
  }
  draw();
  if (ctx.params?.a === 'nuevo') {
    history.replaceState(history.state, '', '#/capsula');
    requestAnimationFrame(() => openEditor());
  }
  const onWide = () => draw();
  wide.addEventListener('change', onWide);
  const offProfile = profile.onProfileChange(async () => { await load(); selectedId = null; draw(); });
  return { node: page, cleanup: () => { wide.removeEventListener('change', onWide); offProfile(); bag.revokeAll(); } };
}
