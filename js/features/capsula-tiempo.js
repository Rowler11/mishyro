// Cápsula del tiempo (docs/05 Más §9). Decided 2026-11-20: written from the Cápsula tab
// ("Para el futuro"), not listed in Más; on its opening day it shows up in Inicio ("Para hoy").
// A message for the future with an opening date, for both, for the other or for oneself, with an
// optional photo. Until the day it is a sealed envelope with a countdown and no content; on the day
// it opens with an animation. The lock depends on the phone's clock: symbolic, not security.
import { ui, util, db, profile } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';
import { openViewer } from '../core/viewer.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const forMe = (c, me) => !c.to || c.to === 'both' || c.to === me;
export const canOpen = (c, me, today = util.localDay()) => forMe(c, me) && c.openAt <= today;
export const toLabel = (c, me) => (c.to === 'both' ? 'Para los dos' : c.to === me ? (c.by === me ? 'Para mí' : 'Para ti') : `Para ${profile.name(c.to)}`);

/** Days left until the opening day, 0 on the day. */
export function daysLeft(openAt, today = util.localDay()) {
  return Math.max(0, util.daysBetween(util.parseDay(today), util.parseDay(openAt)));
}
export function countdownText(openAt, today = util.localDay()) {
  const d = daysLeft(openAt, today);
  if (d === 0) return 'Se abre hoy';
  if (d === 1) return 'Se abre mañana';
  if (d < 60) return `Faltan ${d} días`;
  const m = Math.round(d / 30.4);
  if (m < 24) return `Faltan unos ${m} meses`;
  return `Faltan unos ${Math.round(d / 365)} años`;
}

/** Capsules this person can open today and hasn't opened yet (for the notice in Inicio). */
export async function readyToOpen(me = profile.active()) {
  const list = await db.query('timeCapsules');
  return list.filter((c) => !c.deleted && canOpen(c, me) && !(c.openedBy || []).includes(me));
}

function writer({ onSaved }) {
  const me = profile.active();
  const partner = profile.partnerOf(me);
  let to = 'both';
  const title = ui.input({ maxlength: 60, placeholder: 'Ej.: Para nuestro segundo aniversario' });
  const text = ui.textarea({ rows: 7, maxlength: 5000, placeholder: 'Lo que quieres que lean ese día…' });
  const min = util.localDay(new Date(Date.now() + 86400000));
  const date = ui.input({ type: 'date', min });
  let photo = null; let url = null; let busy = false;
  const box = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `tc-${util.uuid().slice(0, 8)}` });
  const paint = () => box.replaceChildren(url
    ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src: url, alt: 'Foto de la cápsula' }),
      el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; URL.revokeObjectURL(url); url = null; paint(); } }, icon('x', { size: 18 })))
    : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Foto (opcional)')), file);
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    busy = true;
    try { photo = await compressImage(f); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  const quick = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); date.value = util.localDay(d); };
  const fTitle = ui.field({ label: 'Título', control: title });
  const fText = ui.field({ label: 'Mensaje', control: text });
  const fDate = ui.field({ label: 'Se abre el', control: date, hint: 'Antes de ese día solo se ve el sobre cerrado.' });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
    if (!title.value.trim()) { fTitle.setError('Ponle un título al sobre.'); title.focus(); return false; }
    if (!text.value.trim() && !photo) { fText.setError('Escribe el mensaje.'); text.focus(); return false; }
    if (!util.isValidDay(date.value) || date.value < min) { fDate.setError('Elige un día a partir de mañana.'); return false; }
    const id = util.uuid(); let mediaId = null;
    try {
      if (photo) mediaId = await db.putMedia(photo.blob, { ownerStore: 'timeCapsules', ownerId: id, width: photo.width, height: photo.height });
      const rec = { id, by: me, to, title: title.value.trim(), text: text.value.trim(), mediaId, openAt: date.value, openedBy: [], visibility: 'shared', owner: 'both' };
      await db.put('timeCapsules', rec);
      util.haptic([10, 40, 10]);
      onSaved(rec);
      return true;
    } catch (x) {
      if (mediaId) await db.rawDelete('media', mediaId).catch(() => {});
      console.error(x);
      err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar. Lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: 'Para el futuro', kind: 'sheet', size: 'lg',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, '¿Para quién?'),
        ui.segmented({ label: '¿Para quién?', value: to, options: [{ value: 'both', label: 'Los dos' }, { value: partner, label: profile.name(partner) }, { value: me, label: 'Para mí' }], onChange: (v) => { to = v; } })),
      fTitle, fText, box, fDate,
      el('div', { class: 'card-actions' }, [['En 6 meses', 6], ['En un año', 12], ['En 5 años', 60]].map(([l, m]) => ui.button({ label: l, small: true, variant: 'ghost', onClick: () => quick(m) }))),
      el('p', { class: 'note-inline' }, icon('info', { size: 18 }), el('span', {}, 'El sello es simbólico: depende de la fecha del teléfono. Una vez sellada, no se puede editar.')),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Sellar', variant: 'primary', onClick: save }],
    onClose: () => { if (url) URL.revokeObjectURL(url); },
  });
}

async function openCapsule(c, me) {
  const first = !(c.openedBy || []).includes(me);
  if (first) await db.put('timeCapsules', { ...c, openedBy: [...(c.openedBy || []), me], opened: true, openedAt: c.openedAt || util.nowISO() });
  let url = null;
  const pic = c.mediaId ? el('button', { class: 'tc-photo', type: 'button', 'aria-label': 'Ver la foto en grande', onClick: () => openViewer([{ mediaId: c.mediaId, alt: c.title, caption: c.title }]) }) : null;
  if (pic) db.getMedia(c.mediaId).then((b) => { if (b) { url = URL.createObjectURL(b); pic.append(el('img', { src: url, alt: '' })); } }).catch(() => {});
  ui.openModal({
    title: c.title, size: 'md', className: `tc-letter${first && !util.prefersReducedMotion() ? ' tc-opening' : ''}`,
    body: el('article', { class: 'tc-paper' },
      el('p', { class: 'muted small' }, `${toLabel(c, me)} · escrita el ${fmtDay.format(new Date(c.createdAt))} por ${profile.name(c.by)}`),
      pic,
      c.text ? el('div', { class: 'tc-text' }, c.text.split(/\n{2,}/).map((p) => el('p', {}, p))) : null,
      el('p', { class: 'tc-sign' }, profile.name(c.by))),
    actions: [{ label: 'Cerrar', variant: 'primary' }],
    onClose: () => { if (url) URL.revokeObjectURL(url); },
  });
  if (first) { ui.confetti({ count: 30 }); util.haptic([10, 30, 10]); util.sound('chime'); }
}

export async function render() {
  const page = el('section', { class: 'page page-wide capsula-tiempo' });
  page.append(ui.pageHeader({ title: 'Cápsula del tiempo', jp: 'タイムカプセル', romaji: 'taimu kapuseru', back: '/capsula', actions: [ui.newButton('Escribir', () => writer({ onSaved: () => { ui.toast('Sellada. Se abre el día que elegiste.', { tone: 'success' }); load(); } }))] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const load = async () => {
    const me = profile.active();
    const all = (await db.query('timeCapsules')).filter((c) => !c.deleted).sort((a, b) => a.openAt.localeCompare(b.openAt));
    const today = util.localDay();
    const ready = all.filter((c) => canOpen(c, me, today));
    const sealed = all.filter((c) => !canOpen(c, me, today));
    const envelope = (c) => {
      const open = canOpen(c, me, today); const isNew = open && !(c.openedBy || []).includes(me);
      const mine = c.by === me;
      return el('li', { class: `tc-env${open ? ' is-open' : ''}${isNew ? ' is-new' : ''}` },
        el('button', { class: 'tc-env-btn', type: 'button', disabled: !open, 'aria-label': open ? `Abrir "${c.title}"` : `"${c.title}", sellada. ${countdownText(c.openAt, today)}` , onClick: () => openCapsule(c, me).then(load) },
          el('span', { class: 'tc-seal', 'aria-hidden': 'true' }, icon(open ? 'lock-open' : 'lock', { size: 18 })),
          el('span', { class: 'tc-env-title' }, c.title),
          el('span', { class: 'tc-env-to small' }, toLabel(c, me)),
          el('span', { class: 'tc-env-when' }, !forMe(c, me) && c.openAt <= today ? `Ya es de ${profile.name(c.to)}` : open ? (isNew ? 'Ábrela' : `Se abrió el ${fmtDay.format(util.parseDay(c.openAt))}`) : `${countdownText(c.openAt, today)} · ${fmtDay.format(util.parseDay(c.openAt))}`)),
        mine && !open ? el('button', { class: 'icon-btn icon-btn-small tc-del', type: 'button', 'aria-label': `Borrar "${c.title}"`, onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar esta cápsula?', message: 'Se borra sin abrirse, en los dos teléfonos.', confirmLabel: 'Borrar', danger: true }))) return;
          if (c.mediaId) await db.rawDelete('media', c.mediaId).catch(() => {});
          await db.purge('timeCapsules', c.id); load();
        } }, icon('trash-2', { size: 16 })) : null);
    };
    if (!all.length) {
      body.replaceChildren(ui.emptyState({ title: 'Un mensaje para el futuro', text: 'Escriban algo para leer dentro de unos meses o años. Hasta ese día queda sellado.', art: 'envelope', action: { label: 'Escribir la primera', onClick: () => page.querySelector('.page-new')?.click() } }));
      return;
    }
    body.replaceChildren(...[
      ready.length ? el('section', { class: 'stack' }, el('h2', { class: 'tl-month' }, 'Ya se pueden abrir'), el('ul', { class: 'tc-list' }, [...ready].reverse().map(envelope))) : null,
      sealed.length ? el('section', { class: 'stack' }, el('h2', { class: 'tl-month' }, 'Selladas'), el('ul', { class: 'tc-list' }, sealed.map(envelope))) : null,
      el('p', { class: 'note-inline' }, icon('info', { size: 18 }), el('span', {}, 'El sello es simbólico: depende de la fecha del teléfono, no es un candado de seguridad.')),
    ].filter(Boolean));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las cápsulas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'timeCapsules') load().catch(() => {}); });
  const offP = profile.onProfileChange(() => load());
  return { node: page, cleanup: () => { off(); offP(); } };
}
