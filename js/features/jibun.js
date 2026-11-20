// Mi espacio (docs/05 §36, Detalles: Mi espacio): what each person keeps only for themselves.
// Everything here is "Solo yo" of the active profile: the other profile never sees it nor how many
// items there are. With a personal PIN it is encrypted with that person's key and the section
// locks on leaving (the router asks for the PIN); without one it is hidden but not encrypted, and
// the page says so. With sync it only travels to the owner's own devices (Fase A).
// Kinds (docs/08 personal): diary, note, draft (surprises for the other), gift, reminder, photo and
// "future" (a note for me in the future, sealed until its day).
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const MAX_PHOTOS = 4;
export const KINDS = [
  { id: 'diary', label: 'Diario secreto', short: 'Diario', icon: 'notebook-pen' },
  { id: 'note', label: 'Nota', short: 'Notas', icon: 'pencil' },
  { id: 'draft', label: 'Sorpresa para el otro', short: 'Sorpresas', icon: 'gift' },
  { id: 'gift', label: 'Idea de regalo', short: 'Regalos', icon: 'heart' },
  { id: 'reminder', label: 'Recordatorio', short: 'Recordatorios', icon: 'bell' },
  { id: 'photo', label: 'Fotos', short: 'Fotos', icon: 'image' },
  { id: 'future', label: 'Para mí del futuro', short: 'Futuro', icon: 'hourglass' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[1];
// Own color per person (Detalles: Mi espacio). Tokens in styles.css, readable on paper by day and night.
const COLORS = [
  { id: 'sakura', name: 'Sakura', value: 'var(--own-sakura)' }, { id: 'fuji', name: 'Glicina', value: 'var(--own-fuji)' },
  { id: 'matcha', name: 'Matcha', value: 'var(--own-matcha)' }, { id: 'kohaku', name: 'Ámbar', value: 'var(--own-kohaku)' },
];
const FILTER_KEY = `${CONFIG.storageKey}.jibun.filter`;
const readFilter = () => { try { return localStorage.getItem(FILTER_KEY) || 'all'; } catch { return 'all'; } };
const saveFilter = (v) => { try { localStorage.setItem(FILTER_KEY, v); } catch { /* private mode */ } };
const sealed = (x, today = util.localDay()) => x.kind === 'future' && x.openOn && x.openOn > today;

function editor(existing, { onSaved, kind: startKind = 'note' }) {
  const me = profile.active();
  const isNew = !existing;
  const x = existing || { id: util.uuid(), kind: startKind };
  let kind = x.kind;
  const pick = el('select', { class: 'input' }, KINDS.map((k) => el('option', { value: k.id, selected: k.id === kind }, k.label)));
  const title = ui.input({ maxlength: 80, value: x.title || '', placeholder: 'Un título corto (opcional)' });
  const text = ui.textarea({ rows: 6, maxlength: 4000 });
  text.value = x.body || '';
  const date = ui.input({ type: 'date', value: x.date || util.localDay() });
  const openOn = ui.input({ type: 'date', value: x.openOn || '', min: util.localDay() });
  const fDate = ui.field({ label: 'Fecha', control: date });
  const fOpen = ui.field({ label: 'Se abre el', control: openOn, hint: 'Hasta ese día la verás sellada. Es simbólico: depende del reloj del teléfono.' });
  const photos = []; // { blob?, url, mediaId? }
  const urls = new Set();
  const grid = el('div', { class: 'photo-grid' });
  const file = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: `jp-${x.id.slice(0, 8)}` });
  const paintPhotos = () => {
    grid.replaceChildren(...photos.map((p, i) => el('div', { class: 'photo-tile' }, el('img', { src: p.url, alt: `Foto ${i + 1}` }),
      el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': `Quitar la foto ${i + 1}`, onClick: () => { photos.splice(i, 1); paintPhotos(); } }, icon('x', { size: 18 })))),
    photos.length < MAX_PHOTOS ? el('label', { class: 'photo-add', for: file.id, 'aria-label': 'Agregar fotos' }, icon('image-plus', { size: 24 })) : null, file);
  };
  (async () => {
    for (const id of x.mediaIds || []) { const b = await db.getMedia(id).catch(() => null); if (b) { const u = URL.createObjectURL(b); urls.add(u); photos.push({ mediaId: id, url: u }); } }
    paintPhotos();
  })();
  let busy = false;
  file.addEventListener('change', async () => {
    const files = [...file.files].slice(0, MAX_PHOTOS - photos.length); file.value = '';
    busy = true;
    for (const f of files) { try { const out = await compressImage(f); const u = URL.createObjectURL(out.blob); urls.add(u); photos.push({ ...out, url: u }); } catch { ui.toast('No pudimos leer una de las fotos.', { tone: 'error' }); } }
    busy = false; paintPhotos();
  });
  const showFor = () => { fDate.hidden = !['diary', 'reminder'].includes(kind); fOpen.hidden = kind !== 'future'; };
  pick.addEventListener('change', () => { kind = pick.value; showFor(); });
  showFor();
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que las fotos estén listas.'; return false; }
    if (!title.value.trim() && !text.value.trim() && !photos.length) { err.textContent = 'Escribe algo o agrega una foto.'; return false; }
    if (kind === 'future' && !util.isValidDay(openOn.value)) { fOpen.setError('Elige el día en que se abre.'); return false; }
    // First "Solo yo" of this person without a PIN: offer it (docs/04). Saving goes on either way.
    if (!security.hasKey(`person:${me}`)) {
      const any = (await db.query('personal')).some((r) => r.owner === me && r.kind !== 'prefs');
      if (!any) await security.offerPersonalPin(me, profile.name(profile.partnerOf(me)));
    }
    const rec = { ...x, kind, title: title.value.trim(), body: text.value.trim(), date: ['diary', 'reminder'].includes(kind) ? date.value : x.date || util.localDay(),
      openOn: kind === 'future' ? openOn.value : null, owner: me, visibility: 'self', private: true };
    const created = [];
    try {
      const scope = security.policy('personal', rec) || undefined;
      const ids = [];
      for (const p of photos) {
        if (p.mediaId) {
          const raw = await db.rawGet('media', p.mediaId);
          if (raw && !!raw.enc === !!scope) { ids.push(p.mediaId); continue; }
          const b = await db.getMedia(p.mediaId); if (!b) continue;
          const id = await db.putMedia(b, { ownerStore: 'personal', ownerId: x.id, encryptScope: scope }); created.push(id); ids.push(id); continue;
        }
        const id = await db.putMedia(p.blob, { ownerStore: 'personal', ownerId: x.id, width: p.width, height: p.height, encryptScope: scope });
        created.push(id); ids.push(id);
      }
      rec.mediaIds = ids;
      await db.put('personal', rec);
      for (const id of (x.mediaIds || []).filter((i) => !ids.includes(i))) await db.rawDelete('media', id).catch(() => {});
      onSaved(rec, isNew); return true;
    } catch (e) {
      for (const id of created) await db.rawDelete('media', id).catch(() => {});
      console.error(e);
      err.textContent = isQuotaError(e) ? 'El teléfono no tiene espacio para las fotos.' : e?.code === 'LOCKED' ? 'Tu espacio está bloqueado. Sal y vuelve a entrar con tu PIN.' : 'No se pudo guardar. Lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? 'Agregar a mi espacio' : 'Editar', kind: 'sheet', size: 'lg',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      ui.field({ label: 'Qué es', control: pick }), ui.field({ label: 'Título', control: title }),
      ui.field({ label: 'Texto', control: text }), fDate, fOpen,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, `Fotos (hasta ${MAX_PHOTOS})`), grid),
      el('p', { class: 'muted small' }, icon('lock', { size: 14 }), ` Solo tú lo ves. ${profile.name(profile.partnerOf(me))} no ve ni cuántas cosas guardas.`), err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
}

export async function render() {
  const page = el('section', { class: 'page jibun' });
  const urls = new Set();
  let draw = () => {};
  let filter = readFilter();
  const openEditor = (x = null) => editor(x, { kind: filter !== 'all' ? filter : 'note', onSaved: (rec, isNew) => { ui.toast(isNew ? 'Guardado en tu espacio.' : 'Cambios guardados.', { tone: 'success' }); draw(); } });
  page.append(ui.pageHeader({ title: 'Mi espacio', jp: '自分', romaji: 'jibun', back: '/mas', actions: [ui.newButton('Agregar', () => openEditor())] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);

  const remove = async (x) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar esto?', message: x.title || kindOf(x.kind).label, confirmLabel: 'Borrar', danger: true }))) return;
    await db.purge('personal', x.id); draw();
  };

  draw = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const me = profile.active();
    await security.refreshKeys();
    const hasPin = security.hasKey(`person:${me}`);
    const all = (await db.query('personal')).filter((r) => r.owner === me && r.visibility === 'self');
    const prefs = all.find((r) => r.kind === 'prefs');
    const items = all.filter((r) => r.kind !== 'prefs');
    const color = COLORS.find((c) => c.id === prefs?.color) || COLORS[me === 'david' ? 1 : 0];
    page.style.setProperty('--own', color.value);
    const today = util.localDay();
    const shown = items.filter((x) => filter === 'all' || x.kind === filter).sort((a, b) => {
      if (filter === 'reminder') return (a.date || '').localeCompare(b.date || '');
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Mostrar' },
      [{ id: 'all', short: 'Todo' }, ...KINDS].map((k) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === k.id), onClick: () => { filter = k.id; saveFilter(k.id); draw(); } }, k.short)));
    const setColor = async (c) => { await db.put('personal', { ...(prefs || { id: `prefs:${me}` }), kind: 'prefs', color: c.id, owner: me, visibility: 'self', private: true }); draw(); };
    const cards = await Promise.all(shown.map(async (x) => {
      const k = kindOf(x.kind);
      if (sealed(x, today)) {
        return el('li', { class: 'card paper-card own-item is-sealed' },
          el('div', { class: 'own-head' }, icon(k.icon, { size: 18 }), el('span', { class: 'card-kicker' }, k.label)),
          el('p', {}, `Sellada hasta el ${fmtDay.format(util.parseDay(x.openOn))}.`),
          el('div', { class: 'btn-row' }, el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => remove(x) }, icon('trash-2', { size: 16 }), el('span', {}, 'Borrar'))));
      }
      const imgs = [];
      for (const id of (x.mediaIds || []).slice(0, 4)) { const b = await db.getMedia(id).catch(() => null); if (b) { const u = URL.createObjectURL(b); urls.add(u); imgs.push(el('img', { src: u, alt: '', loading: 'lazy' })); } }
      const due = x.kind === 'reminder' && x.date ? (x.date < today ? 'Ya pasó' : x.date === today ? 'Hoy' : fmtDay.format(util.parseDay(x.date))) : '';
      return el('li', { class: 'card paper-card own-item' },
        el('div', { class: 'own-head' }, icon(k.icon, { size: 18 }), el('span', { class: 'card-kicker' }, k.label),
          due ? el('span', { class: 'badge' }, due) : x.kind === 'diary' && x.date ? el('span', { class: 'muted small' }, fmtDay.format(util.parseDay(x.date))) : null),
        x.title ? el('p', { class: 'own-title' }, x.title) : null,
        x.body ? el('p', { class: 'own-body' }, x.body) : null,
        imgs.length ? el('div', { class: 'own-photos' }, imgs) : null,
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openEditor(x) }, icon('pencil', { size: 16 }), el('span', {}, 'Editar')),
          el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => remove(x) }, icon('trash-2', { size: 16 }), el('span', {}, 'Borrar'))));
    }));
    body.replaceChildren(...[
      el('section', { class: `card paper-card own-status ${hasPin ? 'is-safe' : ''}` },
        icon(hasPin ? 'shield-check' : 'eye-off', { size: 22 }),
        el('div', { class: 'stack-tight' },
          el('p', { class: 'own-status-title' }, hasPin ? 'Cifrado con tu PIN personal' : 'Oculto, pero sin cifrar'),
          el('p', { class: 'muted small' }, hasPin ? `Se bloquea al salir. Ni con una copia ${profile.name(profile.partnerOf(me))} puede leerlo.` : `${profile.name(profile.partnerOf(me))} no lo ve en la app, pero sin PIN no queda cifrado en el teléfono.`),
          hasPin ? null : el('div', { class: 'btn-row' }, ui.button({ label: 'Crear mi PIN personal', iconName: 'key-round', small: true, onClick: async () => { await security.createPinDialog({ scope: `person:${me}`, title: 'Tu PIN personal' }); draw(); } })))),
      chips,
      shown.length ? el('ul', { class: 'own-list' }, cards)
        : ui.emptyState({ title: items.length ? 'Nada de este tipo' : 'Tu rincón propio', text: items.length ? 'Prueba con otro filtro.' : 'Un diario secreto, notas, ideas de regalo o una nota para ti del futuro.', art: 'omamori', action: { label: 'Agregar algo', onClick: () => openEditor() } }),
      el('section', { class: 'own-colors' },
        el('span', { class: 'muted small', id: 'own-color-label' }, 'Tu color'),
        el('div', { class: 'own-swatches', role: 'radiogroup', 'aria-labelledby': 'own-color-label' }, COLORS.map((c) => el('button', {
          class: 'own-swatch', type: 'button', role: 'radio', 'aria-checked': String(c.id === color.id), 'aria-label': c.name, style: { '--c': c.value }, onClick: () => setColor(c),
        })))),
    ].filter(Boolean));
  };
  await draw();
  const off = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
