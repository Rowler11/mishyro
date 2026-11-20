// Cápsula (docs/05 Pestaña 2, "Un día como hoy", docs/09 #/capsula).
// Vertical timeline by year and month (oldest first by default, decision 2026-11-19),
// memories with up to 6 photos or short videos in a carousel, add/edit in a sheet (side panel on PC),
// delete own memories with confirmation. Photos live in the `media` store, never inline.
import { ui, util, db, profile, seed, security, CONFIG } from '../core.js';
import * as time from '../core/time.js';
import { voiceAttach, saveAttached, player as voicePlayer } from './voz.js';
import { compressImage, isQuotaError, MAX_PHOTOS, readVideo, isVideoFile, MAX_VIDEO_SECONDS } from '../core/images.js';

const { el, icon } = util;
const WIDE = '(min-width: 1100px)';
const fmtFull = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonthDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const KEY = `${CONFIG.storageKey}.capsula.order`;
const readOrder = () => { try { return localStorage.getItem(KEY) === 'newest' ? 'newest' : 'oldest'; } catch { return 'oldest'; } }; // oldest first by default (decided 2026-11-19)
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
  const videos = new Set();
  return {
    async of(mediaId) {
      const blob = await db.getMedia(mediaId).catch(() => null);
      if (!blob) return null;
      const u = URL.createObjectURL(blob); urls.add(u);
      if (blob.type.startsWith('video/')) videos.add(u);
      return u;
    },
    isVideo(u) { return videos.has(u); },
    track(u, isVideo = false) { urls.add(u); if (isVideo) videos.add(u); return u; },
    revokeAll() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); videos.clear(); },
  };
}

/** A still of a photo or video (its first frame, with a play mark) for lists. */
function mediaThumb(mediaId, bag, cls) {
  const box = el('span', { class: cls, 'aria-hidden': 'true' });
  bag.of(mediaId).then((u) => {
    if (!u) return;
    if (bag.isVideo(u)) box.prepend(el('video', { src: `${u}#t=0.1`, muted: true, playsinline: true, preload: 'metadata', tabindex: '-1' }), el('span', { class: 'media-play' }, icon('play', { size: 16 })));
    else box.prepend(el('img', { src: u, alt: '', decoding: 'async' }));
  });
  return box;
}

// ---------- carousel ----------
function carousel(mediaIds, bag, title) {
  if (!mediaIds?.length) return null;
  const track = el('div', { class: 'carousel-track', tabindex: '0', 'aria-label': `Fotos y videos de ${title}` });
  const dots = el('div', { class: 'carousel-dots' });
  const n = mediaIds.length;
  const slides = mediaIds.map((id, i) => {
    const holder = el('div', { class: 'purikura-img' });
    bag.of(id).then((u) => {
      if (!u) { holder.replaceWith(el('div', { class: 'photo-missing' }, icon('image-off'), 'No disponible')); return; }
      holder.replaceWith(bag.isVideo(u)
        ? el('video', { class: 'purikura-img', src: u, controls: true, playsinline: true, preload: 'metadata', 'aria-label': `${title}, video ${i + 1} de ${n}` })
        : el('img', { class: 'purikura-img', src: u, alt: `${title}, foto ${i + 1} de ${n}`, decoding: 'async' }));
    });
    return el('figure', { class: 'carousel-slide purikura', role: 'group', 'aria-roledescription': 'foto o video', 'aria-label': `${i + 1} de ${n}` }, holder);
  });
  track.append(...slides);
  const go = (i) => { const s = slides[Math.max(0, Math.min(n - 1, i))]; track.scrollTo({ left: s.offsetLeft - track.offsetLeft, behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' }); };
  const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const dotBtns = slides.map((_, i) => el('button', { class: 'carousel-dot', type: 'button', 'aria-label': `Ver ${i + 1} de ${n}`, onClick: () => go(i) }));
  dots.append(...dotBtns);
  const paint = () => {
    const c = current();
    // A video that slides out of view stops playing.
    slides.forEach((s, i) => { if (i !== c) s.querySelector('video')?.pause(); });
    dotBtns.forEach((b, i) => b.setAttribute('aria-current', i === c ? 'true' : 'false')); prev.disabled = c === 0; next.disabled = c === n - 1;
  };
  const prev = el('button', { class: 'icon-btn carousel-nav carousel-prev', type: 'button', 'aria-label': 'Anterior', onClick: () => go(current() - 1) }, icon('chevron-left'));
  const next = el('button', { class: 'icon-btn carousel-nav carousel-next', type: 'button', 'aria-label': 'Siguiente', onClick: () => go(current() + 1) }, icon('chevron-right'));
  track.addEventListener('scroll', util.debounce(paint, 60), { passive: true });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(current() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(current() - 1); }
  });
  const box = el('div', { class: `carousel${n === 1 ? ' carousel-single' : ''}`, role: 'region', 'aria-roledescription': 'carrusel', 'aria-label': 'Fotos y videos del recuerdo' },
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
    m.voiceMediaId ? el('div', { class: 'memory-voice' }, voicePlayer({ mediaId: m.voiceMediaId, duration: m.voiceDuration, title: 'la nota de voz del recuerdo' }, { add: (u) => bag.track(u) })) : null,
    (pending(m.title) || pending(m.note) || isDraft(m)) ? el('p', { class: 'pending' }, 'Le faltan datos: tócalo en Editar para completarlo.') : null,
    el('div', { class: 'card-actions' },
      ui.button({ label: 'Editar', iconName: 'pencil', small: true, onClick: () => onEdit(m) }),
      canDelete(m) ? ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => onDelete(m) }) : null));
}

// ---------- editor ----------
function editor(existing, { bag, onSaved, prefill = {} }) {
  const isNew = !existing;
  const m = existing || { id: util.uuid(), mediaIds: [], visibility: 'shared', ...prefill };
  // Slots: kept ones { mediaId, url, video } and new ones { blob, width, height, duration, url, video }.
  const photos = [];
  const removed = [];
  const voice = voiceAttach({ mediaId: m.voiceMediaId || null, duration: m.voiceDuration || 0 });
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

  const fileInput = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, class: 'sr-only', id: `ph-${m.id.slice(0, 8)}` });
  const grid = el('div', { class: 'photo-grid' });
  const photoMsg = el('p', { class: 'field-hint photo-msg', 'aria-live': 'polite' });
  const drop = el('div', { class: 'photo-drop' },
    el('div', { class: 'photo-drop-head' },
      el('span', { class: 'field-label' }, 'Fotos y videos'),
      el('span', { class: 'field-hint' }, `Hasta ${MAX_PHOTOS}, videos de ${MAX_VIDEO_SECONDS} s. La primera es la portada.`)),
    grid, photoMsg, fileInput);

  const paintPhotos = () => {
    const tiles = photos.map((p, i) => el('div', { class: 'photo-tile' },
      p.video
        ? [el('video', { src: p.url ? `${p.url}#t=0.1` : '', muted: true, playsinline: true, preload: 'metadata', 'aria-label': `Video ${i + 1}` }),
          el('span', { class: 'media-play', 'aria-hidden': 'true' }, icon('play', { size: 16 }))]
        : el('img', { src: p.url || '', alt: `Foto ${i + 1}` }),
      i === 0 ? el('span', { class: 'photo-cover' }, 'Portada') : null,
      el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': `Quitar ${p.video ? 'video' : 'foto'} ${i + 1}`, onClick: () => {
        const [gone] = photos.splice(i, 1);
        if (gone.mediaId) removed.push(gone.mediaId);
        paintPhotos(); photoMsg.textContent = gone.video ? `Video ${i + 1} quitado.` : `Foto ${i + 1} quitada.`;
      } }, icon('x', { size: 18 })),
      i > 0 ? el('button', { class: 'icon-btn photo-first', type: 'button', 'aria-label': `Usar ${p.video ? 'el video' : 'la foto'} ${i + 1} como portada`, onClick: () => {
        photos.unshift(...photos.splice(i, 1)); paintPhotos(); photoMsg.textContent = 'Portada cambiada.';
      } }, icon('star', { size: 16 })) : null));
    const add = photos.length < MAX_PHOTOS
      ? el('label', { class: 'photo-add', for: fileInput.id }, icon('image-plus', { size: 28 }), el('span', {}, photos.length ? 'Agregar' : 'Agregar fotos o videos'))
      : null;
    grid.replaceChildren(...tiles, add || '');
  };

  const VIDEO_ERR = {
    TOO_LONG: `dura más de ${MAX_VIDEO_SECONDS} segundos; recórtalo en la galería del teléfono y vuelve a subirlo`,
    TOO_BIG: 'pesa más de 50 MB',
    DECODE: 'no se pudo leer',
  };
  const addFiles = async (files) => {
    const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name);
    const list = [...files].filter((f) => isImage(f) || isVideoFile(f));
    const room = MAX_PHOTOS - photos.length;
    if (!list.length) { photoMsg.textContent = 'Eso no parece una foto ni un video.'; return; }
    const take = list.slice(0, room);
    busy++; photoMsg.textContent = take.length === 1 ? 'Preparando…' : `Preparando ${take.length} archivos…`;
    let failed = 0;
    const videoErrors = [];
    for (const f of take) {
      try {
        if (isVideoFile(f) && !isImage(f)) {
          const out = await readVideo(f);
          photos.push({ ...out, video: true, url: bag.track(URL.createObjectURL(out.blob), true) });
        } else {
          const out = await compressImage(f);
          photos.push({ ...out, url: bag.track(URL.createObjectURL(out.blob)) });
        }
        paintPhotos();
      } catch (e) {
        if (VIDEO_ERR[e?.code] && isVideoFile(f)) videoErrors.push(`Ese video ${VIDEO_ERR[e.code]}.`);
        else failed++;
      }
    }
    busy--;
    const extra = list.length - take.length;
    photoMsg.textContent = [
      ...new Set(videoErrors),
      failed ? `No pudimos leer ${failed === 1 ? 'un archivo' : `${failed} archivos`}.` : '',
      extra > 0 ? `Caben ${MAX_PHOTOS} por recuerdo: ${extra === 1 ? 'uno quedó' : `${extra} quedaron`} fuera.` : '',
    ].filter(Boolean).join(' ') || 'Listo.';
  };
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  // Drag and drop on PC (docs/09).
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragging'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  // Existing photos load their object URLs.
  (async () => {
    for (const id of m.mediaIds || []) { const url = await bag.of(id); photos.push({ mediaId: id, url, video: bag.isVideo(url) }); }
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
    if (busy) { formError.textContent = 'Espera a que terminen de prepararse las fotos y videos.'; return false; }
    if (!validate()) return false;
    const saved = [];
    const replaced = [];
    try {
      const rec = {
        ...m, title: title.value.trim(), date: date.value, note: note.value.trim(), draft: false,
        visibility, private: visibility === 'self', owner: visibility === 'self' ? profile.active() : (m.owner || profile.active()),
      };
      // "Solo yo" photos and videos are encrypted with the same key as their memory (docs/04).
      const scope = security.policy('memories', rec) || undefined;
      const opts = (p) => ({ ownerStore: 'memories', ownerId: m.id, width: p.width, height: p.height, duration: p.duration, encryptScope: scope });
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
      // The voice note is media of the memory too, with its same privacy.
      if (voice.recording()) { formError.textContent = 'Detén la grabación primero.'; for (const id of saved) await db.rawDelete('media', id).catch(() => {}); return false; }
      const v = voice.value();
      if (v.keep && !v.blob) {
        const raw = await db.rawGet('media', v.keep);
        if (raw && !!raw.enc !== !!scope) {
          const blob = await db.getMedia(v.keep);
          if (blob) { v.blob = blob; v.seconds = raw.duration || v.keepDuration; replaced.push(v.keep); v.keep = null; }
        }
      }
      const sv = await saveAttached(v, { ownerStore: 'memories', ownerId: m.id, encryptScope: scope });
      if (sv.created) saved.push(sv.created);
      rec.voiceMediaId = sv.voiceMediaId; rec.voiceDuration = sv.voiceDuration;
      if (m.voiceMediaId && m.voiceMediaId !== rec.voiceMediaId && !replaced.includes(m.voiceMediaId)) removed.push(m.voiceMediaId);
      await db.put('memories', rec);
      for (const id of [...removed, ...replaced]) await db.rawDelete('media', id).catch(() => {});
      util.haptic(15);
      onSaved(rec, isNew);
      return true;
    } catch (e) {
      for (const id of saved) await db.rawDelete('media', id).catch(() => {});
      formError.textContent = isQuotaError(e)
        ? 'No queda espacio en este teléfono para guardar estas fotos o videos. Quita alguno o libera espacio y vuelve a intentarlo. Lo que escribiste sigue aquí.'
        : 'No se pudo guardar. Inténtalo de nuevo; lo que escribiste sigue aquí.';
      if (!isQuotaError(e)) console.error(e);
      return false;
    }
  };

  const body = el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => { e.preventDefault(); } },
    drop, fTitle, fDate, fNote, voice.node,
    ui.visibilityPicker({ value: visibility, onChange: (v) => {
      visibility = v;
      // First "Solo yo" of this person: offer the personal PIN (docs/04).
      if (v === 'self') security.offerPersonalPin(profile.active(), profile.name(profile.partnerOf(profile.active())));
    } }),
    formError);
  const modal = ui.openModal({
    title: isNew ? 'Nuevo recuerdo' : 'Editar recuerdo', kind: 'sheet', size: 'lg', className: 'memory-editor', body, onClose: () => voice.cleanup(),
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      { label: isNew ? 'Guardar recuerdo' : 'Guardar cambios', variant: 'primary', onClick: save },
    ],
  });
  if (isNew) requestAnimationFrame(() => title.focus({ preventScroll: true }));
  return modal;
}

// ---------- timeline (decided 2026-11-19: "Hilo rojo, shikishi y ema") ----------
// The line is the red thread of fate, the year is a hanko seal and months carry a sakura.
// Memories with photos or videos hang as shikishi boards (gold border, red seal) and the rest
// as ema plaques from a shrine, with an icon by kind.
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const KINDS = [
  [/\b(gat|milu|perr|mascota|michi)/, 'paw-print', 'gold'],
  [/cumple|torta|pastel|velas/, 'cake', 'accent'],
  [/viaje|vuelo|playa|paseo|excursi|mar\b|monta/, 'plane', 'violet'],
  [/cena|comida|cocin|almuerzo|desayuno|restaurante|caf/, 'chef-hat', 'gold'],
  [/m[uú]sica|concierto|canci|baile|bail/, 'music', 'violet'],
  [/aniversario|empez|inicio|primer|beso|novios/, 'heart', 'accent'],
  [/pel[ií]cula|cine|juego/, 'star', 'violet'],
];
const TONES = ['accent', 'violet', 'gold'];
/** Icon and tint for a memory without photos, from words in its title and note. */
export function kindOf(m) {
  const text = `${pending(m.title) ? '' : m.title || ''} ${pending(m.note) ? '' : m.note || ''}`.toLowerCase();
  for (const [re, iconName, tone] of KINDS) if (re.test(text)) return { icon: iconName, tone };
  let h = 0; for (const ch of String(m.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { icon: h % 2 ? 'jp-sakura' : 'jp-tsuru', tone: TONES[h % TONES.length] };
}

function tags(m) {
  return el('span', { class: 'tl-tags' },
    m.visibility === 'self' ? el('span', { class: 'badge' }, 'Solo yo') : null,
    (pending(m.title) || pending(m.note) || isDraft(m)) ? el('span', { class: 'pending' }, 'Por completar') : null);
}

function timelineItem(m, bag, { selected, fresh, index = 0 } = {}) {
  const note = pending(m.note) ? '' : m.note;
  const date = isDraft(m) ? 'Sin fecha' : fmtMonthDay.format(util.parseDay(m.date));
  const attrs = { href: `#/capsula/${encodeURIComponent(m.id)}`, dataset: { id: m.id }, 'aria-current': selected ? 'true' : undefined };
  let link;
  if (m.mediaIds?.length) {
    const photo = mediaThumb(m.mediaIds[0], bag, 'tl-photo');
    if (m.mediaIds.length > 1) photo.append(el('span', { class: 'tl-more' }, `+${m.mediaIds.length - 1}`));
    link = el('a', { class: 'tl-card tl-shikishi', ...attrs },
      photo,
      el('span', { class: 'tl-text' },
        el('span', { class: 'tl-title' }, titleOf(m)),
        el('span', { class: 'tl-date' }, date),
        tags(m)),
      el('span', { class: 'seal-sq tl-seal', 'aria-hidden': 'true' }, icon('heart', { size: 14 })));
  } else {
    const k = kindOf(m);
    link = el('a', { class: `tl-card tl-ema tone-${k.tone}`, ...attrs },
      el('span', { class: 'tl-ema-icon', 'aria-hidden': 'true' }, icon(k.icon, { size: 24 })),
      el('span', { class: 'tl-title' }, titleOf(m)),
      el('span', { class: 'tl-date' }, date),
      note ? el('span', { class: 'tl-note' }, note) : null,
      tags(m));
  }
  return el('li', { class: `tl-item${fresh ? ' unroll' : ''}` }, el('span', { class: 'tl-knot', 'aria-hidden': 'true' }), link);
}

function timeline(list, bag, { selectedId, freshId }) {
  const wrap = el('div', { class: 'timeline-wrap' });
  const perYear = new Map();
  for (const m of list) perYear.set(m.date.slice(0, 4), (perYear.get(m.date.slice(0, 4)) || 0) + 1);
  let ol = null; let year = null; let month = null; let i = 0;
  for (const m of list) {
    const y = m.date.slice(0, 4);
    if (y !== year) {
      year = y; month = null;
      wrap.append(el('div', { class: 'tl-year', 'aria-hidden': 'true' },
        el('span', { class: 'tl-hanko' }, y),
        el('span', { class: 'muted small' }, perYear.get(y) === 1 ? '1 recuerdo este año' : `${perYear.get(y)} recuerdos este año`)));
      ol = el('ol', { class: 'timeline', 'aria-label': `Recuerdos de ${y}` });
      wrap.append(ol);
    }
    const mo = m.date.slice(5, 7);
    if (mo !== month) {
      month = mo;
      const name = fmtMonth.format(util.parseDay(m.date));
      ol.append(el('li', { class: 'tl-month', 'aria-hidden': 'true' }, icon('jp-sakura', { size: 18, cls: 'tl-sakura' }), name.charAt(0).toUpperCase() + name.slice(1)));
    }
    ol.append(timelineItem(m, bag, { selected: m.id === selectedId, fresh: m.id === freshId, index: i++ }));
  }
  return wrap;
}

function onThisDayCard(list, bag) {
  const [m] = list;
  if (!m) return null;
  const thumb = m.mediaIds?.length
    ? mediaThumb(m.mediaIds[0], bag, 'otd-thumb has-photo')
    : el('span', { class: 'otd-thumb seal-sq', 'aria-hidden': 'true' }, icon('heart', { size: 20 }));
  return el('a', { class: 'card card-link otd-card', href: `#/capsula/${encodeURIComponent(m.id)}` },
    thumb,
    el('span', { class: 'otd-text' },
      el('span', { class: 'card-kicker' }, 'Un día como hoy'),
      el('span', { class: 'otd-title' }, `${agoText(m.date)}: ${titleOf(m)}`),
      el('span', { class: 'muted small' }, fmtFull.format(util.parseDay(m.date))),
      list.length > 1 ? el('span', { class: 'muted small' }, `Y ${plural(list.length - 1, 'recuerdo más', 'recuerdos más')} de un día como hoy.`) : null));
}

// ---------- view ----------
export async function render(ctx) {
  const bag = urlBag();
  const page = el('section', { class: 'page page-wide capsula' });
  const fab = ui.newButton('Nuevo recuerdo', () => openEditor());
  const future = ui.button({ label: 'Para el futuro', iconName: 'lock', small: true, variant: 'ghost', href: '#/capsula-tiempo' });
  future.classList.add('capsula-future');
  const header = ui.pageHeader({ title: 'Cápsula', jp: '思い出', romaji: 'omoide', actions: [future, fab] });
  const body = el('div', { class: 'capsula-body' }, ui.skeleton(4));
  page.append(header, body);
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

  const openEditor = (m = null, prefill = {}) => editor(m, {
    bag, prefill,
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
    const toggle = el('button', { class: 'btn btn-ghost btn-small', type: 'button' },
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
    // From a past date in the Calendario: title, day and a note come prefilled.
    const q = ctx.query || {};
    const prefill = { ...(q.titulo ? { title: String(q.titulo).slice(0, 80) } : {}), ...(util.isValidDay(q.fecha) ? { date: q.fecha } : {}), ...(q.nota ? { note: String(q.nota).slice(0, 2000) } : {}) };
    history.replaceState(history.state, '', '#/capsula');
    requestAnimationFrame(() => openEditor(null, prefill));
  }
  const onWide = () => draw();
  wide.addEventListener('change', onWide);
  const offProfile = profile.onProfileChange(async () => { await load(); selectedId = null; draw(); });
  return { node: page, cleanup: () => { wide.removeEventListener('change', onWide); offProfile(); bag.revokeAll(); } };
}
