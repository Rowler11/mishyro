// Diario (docs/05 §6, Detalles: Diario) with the photo diary (decided 2026-11-20): each entry has a
// date, the mood of the day, a few lines and an optional photo. With sync, "Los dos" entries reach
// both phones and "Solo yo" ones only the author's devices (encrypted with the personal PIN if
// there is one). Two views: "Páginas" (washi pages by month) and "Fotos" (a grid by month).
// The mood of an entry also feeds the Medidor de ánimo, without overwriting a mark made by hand.
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';
import { MOODS, moodPicker, saveMood } from './animo.js';
import { toTrash, TRASH_NOTE } from './papelera.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const TAB_KEY = `${CONFIG.storageKey}.diario.tab`;
const readTab = () => { try { return localStorage.getItem(TAB_KEY) === 'fotos' ? 'fotos' : 'paginas'; } catch { return 'paginas'; } };
const saveTab = (v) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } };
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const moodOf = (level) => MOODS.find((m) => m.level === level) || null;

/** "Hace un año escribiste…": own or shared entries from this same day one year ago. Never the other's "Solo yo". */
export function yearAgo(entries, today = new Date()) {
  const key = util.localDay(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  return entries.filter((e) => e.date === key && (e.visibility !== 'self' || e.owner === profile.active()));
}

function editor(existing, { onSaved }) {
  const me = profile.active();
  const isNew = !existing;
  const e = existing || { id: util.uuid(), date: util.localDay(), by: me, visibility: 'shared' };
  const date = ui.input({ type: 'date', value: e.date, max: util.localDay() });
  let mood = e.mood || null;
  const text = ui.textarea({ rows: 6, maxlength: 3000, placeholder: '¿Qué pasó hoy?' });
  text.value = e.text || '';
  let visibility = e.visibility || 'shared';
  let photo = null; let photoUrl = null; let keep = e.mediaId || null; let busy = false;
  const photoBox = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `dp-${e.id.slice(0, 8)}` });
  const paint = async () => {
    let src = photoUrl;
    if (!src && keep) { const b = await db.getMedia(keep).catch(() => null); if (b) src = photoUrl = URL.createObjectURL(b); }
    photoBox.replaceChildren(src
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src, alt: 'Foto del día' }),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keep = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; paint(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Foto del día (opcional)')),
    file);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    busy = true;
    try { photo = await compressImage(f); keep = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  const fText = ui.field({ label: 'Lo de hoy', control: text, hint: 'Unas pocas líneas bastan.' });
  const fDate = ui.field({ label: 'Fecha', control: date });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
    const d = date.value;
    if (!util.isValidDay(d) || d > util.localDay()) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
    if (!text.value.trim() && !photo && !keep) { fText.setError('Escribe algo o agrega una foto.'); text.focus(); return false; }
    const rec = { ...e, date: d, by: e.by || me, mood, text: text.value.trim(), visibility, private: visibility === 'self', owner: visibility === 'self' ? (e.by || me) : 'both' };
    const created = [];
    try {
      const scope = security.policy('diary', rec) || undefined;
      if (photo) { const id = await db.putMedia(photo.blob, { ownerStore: 'diary', ownerId: e.id, width: photo.width, height: photo.height, encryptScope: scope }); created.push(id); rec.mediaId = id; }
      else if (keep) {
        // Visibility changed: store the photo again with or without encryption.
        const raw = await db.rawGet('media', keep);
        if (raw && !!raw.enc !== !!scope) { const b = await db.getMedia(keep); if (b) { const id = await db.putMedia(b, { ownerStore: 'diary', ownerId: e.id, width: raw.width, height: raw.height, encryptScope: scope }); created.push(id); rec.mediaId = id; } }
        else rec.mediaId = keep;
      } else rec.mediaId = null;
      await db.put('diary', rec);
      if (e.mediaId && e.mediaId !== rec.mediaId) await db.rawDelete('media', e.mediaId).catch(() => {});
      if (mood && rec.visibility !== 'self') await saveMood(d, mood, { source: 'diary' });
      util.haptic(12);
      onSaved(rec, isNew);
      return true;
    } catch (x) {
      for (const id of created) await db.rawDelete('media', id).catch(() => {});
      console.error(x);
      err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : x?.code === 'LOCKED' ? 'Desbloquea tu espacio personal para guardar algo "Solo yo".' : 'No se pudo guardar. Lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? 'Nueva página' : 'Editar página', kind: 'sheet', size: 'lg', className: 'diary-editor',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (ev) => ev.preventDefault() },
      fDate,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Ánimo del día'), moodPicker({ value: mood, onChange: (v) => { mood = v; } })),
      fText, photoBox,
      ui.visibilityPicker({ value: visibility, onChange: (v) => {
        visibility = v;
        if (v === 'self') security.offerPersonalPin(me, profile.name(profile.partnerOf(me)));
      } }),
      el('p', { class: 'muted small' }, `"Los dos": la ven ambos en sus teléfonos. "Solo yo": solo tú.`),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
    onClose: () => { if (photoUrl) URL.revokeObjectURL(photoUrl); },
  });
}

export async function render() {
  const page = el('section', { class: 'page diario' });
  const urls = new Set();
  const track = (u) => { urls.add(u); return u; };
  let draw = () => {};
  const openEditor = (x = null) => editor(x, { onSaved: (rec, isNew) => { ui.toast(isNew ? 'Página guardada.' : 'Cambios guardados.', { tone: 'success' }); draw(); } });
  page.append(ui.pageHeader({ title: 'Diario', jp: '日記', romaji: 'nikki', back: '/mas', actions: [ui.newButton('Escribir', () => openEditor())] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = readTab();

  const thumb = async (id, alt, cls = '') => {
    const b = id ? await db.getMedia(id).catch(() => null) : null;
    return b ? el('img', { class: cls, src: track(URL.createObjectURL(b)), alt, loading: 'lazy', decoding: 'async' }) : null;
  };

  const remove = async (x) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar esta página?', message: `Se borra con su foto. ${TRASH_NOTE}`, confirmLabel: 'Borrar', danger: true }))) return;
    await toTrash('diary', x.id, { label: (x.text || '').slice(0, 60), what: 'Página borrada', extraMedia: [x.mediaId], onRestored: draw }); draw();
  };

  const page1 = async (x) => {
    const me = profile.active();
    const m = moodOf(x.mood);
    const img = await thumb(x.mediaId, `Foto del ${fmtDay.format(util.parseDay(x.date))}`, 'diary-photo');
    return el('article', { class: 'card paper-card diary-page', style: m ? { '--mood': m.color } : {}, dataset: { id: x.id } },
      el('header', { class: 'diary-head' },
        el('span', { class: 'diary-date' }, capital(fmtDay.format(util.parseDay(x.date)))),
        m ? el('span', { class: 'diary-mood', title: m.name }, el('span', { 'aria-hidden': 'true' }, m.emoji), el('span', { class: 'sr-only' }, `Ánimo: ${m.name}`)) : null,
        x.visibility === 'self' ? el('span', { class: 'badge' }, icon('lock', { size: 12 }), ' Solo yo') : null),
      img,
      x.text ? el('p', { class: 'diary-text' }, x.text) : null,
      el('footer', { class: 'diary-foot' },
        el('span', { class: 'muted small' }, profile.name(x.by)),
        x.by === me ? el('span', { class: 'diary-actions' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar página', onClick: () => openEditor(x) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar página', onClick: () => remove(x) }, icon('trash-2', { size: 18 }))) : null));
  };

  draw = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    let entries;
    try { entries = await db.query('diary'); } catch (e) {
      console.error(e);
      body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el diario', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
      return;
    }
    entries.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const tabs = ui.segmented({ label: 'Diario', value: tab, options: [{ value: 'paginas', label: 'Páginas' }, { value: 'fotos', label: 'Fotos' }], onChange: (v) => { tab = v; saveTab(v); draw(); } });
    tabs.classList.add('cupones-tabs', 'section-tabs');
    const months = new Map();
    for (const x of entries) { const k = x.date.slice(0, 7); months.set(k, [...(months.get(k) || []), x]); }
    let content;
    if (!entries.length) {
      content = [ui.emptyState({ title: 'La primera página', text: 'Unas líneas y, si quieren, la foto del día.', art: 'crane', action: { label: 'Escribir hoy', onClick: () => openEditor() } })];
    } else if (tab === 'paginas') {
      const ago = yearAgo(entries);
      content = [
        ago.length ? el('aside', { class: 'card paper-card otd-card' }, icon('hourglass', { size: 22 }),
          el('div', {}, el('p', { class: 'card-kicker' }, 'Hace un año'), el('p', { class: 'otd-text clamp-2' }, ago[0].text || 'Guardaron una foto.'))) : null,
        ...await Promise.all([...months].map(async ([k, list]) => el('section', { class: 'diary-month' },
          el('h2', { class: 'tl-month' }, capital(fmtMonth.format(util.parseDay(`${k}-01`)))),
          el('div', { class: 'diary-pages' }, await Promise.all(list.map(page1)))))),
      ];
    } else {
      const withPhoto = entries.filter((x) => x.mediaId);
      content = withPhoto.length ? await Promise.all([...months].filter(([, l]) => l.some((x) => x.mediaId)).map(async ([k, list]) => el('section', { class: 'diary-month' },
        el('h2', { class: 'tl-month' }, capital(fmtMonth.format(util.parseDay(`${k}-01`)))),
        el('ul', { class: 'photo-grid diary-grid' }, await Promise.all(list.filter((x) => x.mediaId).map(async (x) => el('li', {},
          el('button', { class: 'photo-tile diary-tile', type: 'button', 'aria-label': `Abrir el ${fmtDay.format(util.parseDay(x.date))}`, onClick: () => { tab = 'paginas'; saveTab(tab); draw().then(() => body.querySelector(`[data-id="${CSS.escape(x.id)}"]`)?.scrollIntoView({ block: 'center' })); } },
            await thumb(x.mediaId, ''), el('span', { class: 'diary-tile-day' }, String(util.parseDay(x.date).getDate()))))))))))
        : [ui.emptyState({ title: 'Todavía no hay fotos', text: 'Agrega la foto del día al escribir una página.', art: 'crane' })];
    }
    body.replaceChildren(...[tabs, content].flat(3).filter(Boolean));
  };
  await draw();
  const off = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
