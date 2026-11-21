// Notas de voz de cariño (docs/05 Más §40): short voice messages (2 minutes max) recorded with the
// microphone (MediaRecorder, permission explained first), kept in IndexedDB as media. Each has a
// title, who it is for, an optional occasion and "Los dos" / "Solo yo" (encrypted with the personal
// PIN when there is one, and locked on leaving). Player with an animated wave, 1x / 1.5x and
// favorite. Nothing is recorded until "Grabar" is tapped and the indicator stays visible; no audio
// leaves the app unless "Exportar audio" is chosen (with sync, it travels encrypted to their phones).
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import { isQuotaError } from '../core/images.js';
import { toTrash, TRASH_NOTE } from './papelera.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const MAX = CONFIG.voiceNotes?.maxSeconds || 120;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const supported = () => typeof window.MediaRecorder === 'function' && !!navigator.mediaDevices?.getUserMedia;
const pickMime = () => (CONFIG.voiceNotes?.mimeTypes || []).find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';

/**
 * Recording panel shared by the Voz screen, the letters and the memories: explains nothing by
 * itself (callers explain the permission first), records up to MAX seconds and calls
 * onReady(blob, seconds) with a preview. Returns { node, recording(), stop(), cleanup() }.
 */
export function recPanel({ onReady }) {
  let stream = null; let rec = null; let chunks = []; let started = 0; let tick = 0; let url = null;
  const status = el('p', { class: 'rec-status', 'aria-live': 'polite' }, 'Listo para grabar.');
  const timer = el('span', { class: 'rec-timer' }, `0:00 / ${mmss(MAX)}`);
  const dot = el('span', { class: 'rec-dot', 'aria-hidden': 'true' });
  const preview = el('div', { class: 'rec-preview' });
  const stopAll = () => { clearInterval(tick); stream?.getTracks().forEach((t) => t.stop()); stream = null; dot.classList.remove('on'); };
  const recBtn = el('button', { class: 'btn btn-primary rec-btn', type: 'button', onClick: async () => {
    if (rec?.state === 'recording') { rec.stop(); return; }
    if (!supported()) { status.textContent = 'Este navegador no puede grabar audio.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { status.textContent = 'Sin permiso del micrófono. Puedes darlo en los ajustes del navegador.'; return; }
    const mime = pickMime();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = []; preview.replaceChildren();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stopAll(); const seconds = Math.min(MAX, (Date.now() - started) / 1000);
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
      preview.replaceChildren(el('audio', { src: url, controls: true, 'aria-label': 'Escuchar la grabación' }));
      status.textContent = `Grabación lista (${mmss(seconds)}). Escúchala y guárdala, o graba otra vez.`;
      recBtn.replaceChildren(icon('mic', { size: 20 }), 'Grabar otra vez');
      onReady(blob, seconds);
    };
    rec.start(250); started = Date.now(); dot.classList.add('on');
    status.textContent = 'Grabando. Toca "Detener" cuando termines.';
    recBtn.replaceChildren(icon('x', { size: 20 }), 'Detener');
    tick = setInterval(() => { const sec = (Date.now() - started) / 1000; timer.textContent = `${mmss(sec)} / ${mmss(MAX)}`; if (sec >= MAX) rec.stop(); }, 250);
  } }, icon('mic', { size: 20 }), 'Grabar');
  return {
    node: el('div', { class: 'rec-panel' }, el('div', { class: 'rec-row' }, dot, timer), recBtn, status, preview),
    recording: () => rec?.state === 'recording',
    cleanup: () => { if (rec?.state === 'recording') { rec.onstop = null; rec.stop(); } stopAll(); if (url) URL.revokeObjectURL(url); },
  };
}

function recorder({ onSaved }) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  let blob = null; let seconds = 0;
  const panel = recPanel({ onReady: (b, s) => { blob = b; seconds = s; } });
  const title = ui.input({ maxlength: 60, placeholder: 'Ej.: Para cuando no puedas dormir' });
  let to = partner; let occasion = ''; let visibility = 'shared';
  const occ = el('select', { class: 'input', 'aria-label': 'Ocasión' }, el('option', { value: '' }, 'Sin ocasión'), (CONFIG.voiceNotes?.occasions || []).map((o) => el('option', { value: o }, o)));
  occ.addEventListener('change', () => { occasion = occ.value; });
  const fTitle = ui.field({ label: 'Título', control: title });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  return ui.openModal({
    title: 'Nueva nota de voz', kind: 'sheet', size: 'md',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      panel.node,
      fTitle,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, '¿Para quién?'), ui.segmented({ label: '¿Para quién?', value: to, options: [{ value: partner, label: profile.name(partner) }, { value: 'both', label: 'Los dos' }, { value: me, label: 'Para mí' }], onChange: (v) => { to = v; } })),
      ui.field({ label: 'Ocasión', control: occ }),
      ui.visibilityPicker({ value: visibility, onChange: (v) => { visibility = v; if (v === 'self') security.offerPersonalPin(me, profile.name(partner)); } }),
      el('p', { class: 'muted small' }, '"Solo yo" se cifra con tu PIN personal si lo tienes y se bloquea al salir.'),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      err.textContent = '';
      if (panel.recording()) { err.textContent = 'Detén la grabación primero.'; return false; }
      if (!blob) { err.textContent = 'Graba la nota primero.'; return false; }
      if (!title.value.trim()) { fTitle.setError('Ponle un título.'); title.focus(); return false; }
      const id = util.uuid();
      const recd = { id, by: me, to, title: title.value.trim(), occasion, at: util.nowISO(), duration: Math.round(seconds), favorite: false, visibility, private: visibility === 'self', owner: visibility === 'self' ? me : 'both' };
      let mediaId = null;
      try {
        mediaId = await db.putMedia(blob, { ownerStore: 'voiceNotes', ownerId: id, duration: seconds, encryptScope: security.policy('voiceNotes', recd) || undefined });
        await db.put('voiceNotes', { ...recd, mediaId });
        onSaved(); return true;
      } catch (x) {
        if (mediaId) await db.rawDelete('media', mediaId).catch(() => {});
        console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la nota.' : x?.code === 'LOCKED' ? 'Desbloquea tu espacio personal para guardar algo "Solo yo".' : 'No se pudo guardar.'; return false;
      }
    } }],
    onClose: () => panel.cleanup(),
  });
}

/** Small player with wave, time and speed. n: { mediaId, duration, title }. bag: Set of object URLs to revoke. */
export function player(n, bag) {
  const audio = el('audio', { preload: 'none' });
  let loaded = false; let rate = 1;
  const wave = el('span', { class: 'wave', 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => el('span', { style: { '--i': String(i) } })));
  const time = el('span', { class: 'small muted' }, mmss(n.duration || 0));
  const play = el('button', { class: 'icon-btn voice-play', type: 'button', 'aria-label': `Reproducir ${n.title}`, onClick: async () => {
    if (!loaded) { const b = await db.getMedia(n.mediaId).catch(() => null); if (!b) { ui.toast('No se encontró el audio.', { tone: 'error' }); return; } const u = URL.createObjectURL(b); bag.add(u); audio.src = u; loaded = true; }
    if (audio.paused) { audio.playbackRate = rate; audio.play(); } else audio.pause();
  } }, icon('play', { size: 20 }));
  audio.addEventListener('play', () => { wave.classList.add('on'); play.setAttribute('aria-label', `Pausar ${n.title}`); });
  const off = () => { wave.classList.remove('on'); play.setAttribute('aria-label', `Reproducir ${n.title}`); };
  audio.addEventListener('pause', off); audio.addEventListener('ended', off);
  audio.addEventListener('timeupdate', () => { time.textContent = `${mmss(audio.currentTime)} / ${mmss(n.duration || audio.duration || 0)}`; });
  const speed = el('button', { class: 'chip voice-speed', type: 'button', 'aria-label': 'Velocidad', onClick: () => { rate = rate === 1 ? 1.5 : 1; audio.playbackRate = rate; speed.textContent = `${rate}x`; } }, '1x');
  return el('div', { class: 'voice-player' }, play, wave, time, speed, audio);
}

export async function render() {
  const page = el('section', { class: 'page page-wide voz' });
  const bag = new Set();
  const add = () => {
    if (!supported()) { ui.toast('Este navegador no puede grabar audio.', { tone: 'error' }); return; }
    ui.openModal({ title: 'Antes de grabar', size: 'sm', body: el('p', {}, 'El teléfono te va a pedir permiso para el micrófono. Solo se graba mientras ves el punto rojo, y el audio se queda en la app.'),
      actions: [{ label: 'Ahora no', variant: 'ghost' }, { label: 'Continuar', variant: 'primary', onClick: () => { setTimeout(() => recorder({ onSaved: () => { ui.toast('Nota guardada.', { tone: 'success' }); draw(); } }), 220); } }] });
  };
  page.append(ui.pageHeader({ title: 'Notas de voz', jp: '声', romaji: 'koe', back: '/mas', actions: [ui.newButton('Grabar', add, 'mic')] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let filter = 'todas';
  const draw = async () => {
    bag.forEach((u) => URL.revokeObjectURL(u)); bag.clear();
    const me = profile.active();
    const all = (await db.query('voiceNotes')).filter((n) => !n.deleted).sort((a, b) => b.at.localeCompare(a.at));
    const list = all.filter((n) => filter === 'todas' || (filter === 'favoritas' && n.favorite) || (filter === 'para-mi' && (n.to === me || n.to === 'both')));
    const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtrar' }, [['todas', 'Todas'], ['para-mi', 'Para mí'], ['favoritas', 'Favoritas']].map(([v, l]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === v), onClick: () => { filter = v; draw(); } }, l)));
    if (!all.length) { body.replaceChildren(ui.emptyState({ title: 'Su voz, guardada', text: 'Un "buenos días", algo para un día difícil o para dormir. Máximo 2 minutos.', art: 'moon', action: { label: 'Grabar la primera', onClick: add } })); return; }
    body.replaceChildren(...[chips, el('ul', { class: 'voice-list' }, list.map((n) => el('li', { class: 'card paper-card voice' },
      el('div', { class: 'voice-head' },
        el('div', {}, el('h3', { class: 'voice-title' }, n.title),
          el('p', { class: 'muted small' }, [`De ${profile.name(n.by)}`, n.to === 'both' ? 'para los dos' : n.to === n.by ? 'para sí' : `para ${profile.name(n.to)}`, n.occasion, fmtDay.format(new Date(n.at))].filter(Boolean).join(' · '))),
        n.visibility === 'self' ? el('span', { class: 'badge' }, icon('lock', { size: 12 }), ' Solo yo') : null),
      player(n, bag),
      el('div', { class: 'card-actions' },
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-pressed': String(!!n.favorite), 'aria-label': n.favorite ? 'Quitar de favoritas' : 'Marcar como favorita', onClick: async () => { await db.put('voiceNotes', { ...n, favorite: !n.favorite }); draw(); } }, icon(n.favorite ? 'heart' : 'star', { size: 18 })),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Exportar audio', onClick: async () => { const b = await db.getMedia(n.mediaId).catch(() => null); if (!b) return; const u = URL.createObjectURL(b); const a = el('a', { href: u, download: `nota-de-voz-${n.at.slice(0, 10)}.${b.type.includes('mp4') ? 'm4a' : 'webm'}` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); } }, icon('download', { size: 18 })),
        n.by === me ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar', onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar esta nota?', message: `Se borra el audio. ${TRASH_NOTE}`, confirmLabel: 'Borrar', danger: true }))) return;
          await toTrash('voiceNotes', n.id, { label: n.title || '', what: 'Nota borrada', extraMedia: [n.mediaId], onRestored: draw }); draw();
        } }, icon('trash-2', { size: 18 })) : null)))),
    list.length ? null : el('p', { class: 'muted' }, 'Nada con este filtro.')].filter(Boolean));
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las notas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'voiceNotes') draw().catch(() => {}); });
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); offP(); bag.forEach((u) => URL.revokeObjectURL(u)); } };
}

/**
 * "Nota de voz (opcional)" for letters and memories (docs/05 Más §40). The audio is saved as media
 * of that letter or memory, so it has the same privacy and encryption as it. Returns
 * { node, value() -> { blob, seconds, keep, keepDuration }, recording(), cleanup() }.
 */
export function voiceAttach({ mediaId = null, duration = 0 } = {}) {
  let keep = mediaId; const keepDuration = duration; let blob = null; let seconds = 0; let panel = null;
  const bag = new Set();
  const box = el('div', { class: 'voice-attach' });
  const label = () => el('span', { class: 'field-label' }, 'Nota de voz');
  const paint = () => {
    panel?.cleanup(); panel = null; blob = null; seconds = 0;
    if (keep) {
      box.replaceChildren(label(), el('div', { class: 'voice-attach-row' }, player({ mediaId: keep, duration: keepDuration, title: 'la nota de voz' }, bag),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Quitar la nota de voz', onClick: () => { keep = null; paint(); } }, icon('x', { size: 18 }))));
      return;
    }
    box.replaceChildren(el('button', { class: 'photo-add voice-add', type: 'button', onClick: () => start() }, icon('mic', { size: 22 }), el('span', {}, 'Agregar una nota de voz (opcional)')));
  };
  const start = () => {
    if (!supported()) { ui.toast('Este navegador no puede grabar audio.', { tone: 'error' }); return; }
    panel = recPanel({ onReady: (b, s) => { blob = b; seconds = s; } });
    box.replaceChildren(label(),
      el('p', { class: 'muted small' }, 'El teléfono te pide permiso para el micrófono. Solo se graba mientras ves el punto rojo, y el audio se queda en la app.'),
      panel.node,
      ui.button({ label: 'Quitar la nota de voz', small: true, variant: 'ghost', onClick: () => paint() }));
    panel.node.querySelector('.rec-btn')?.focus();
  };
  paint();
  return {
    node: box,
    value: () => ({ blob, seconds, keep, keepDuration }),
    recording: () => !!panel?.recording(),
    cleanup: () => { panel?.cleanup(); bag.forEach((u) => URL.revokeObjectURL(u)); },
  };
}

/** Save what voiceAttach holds as media of a record: { voiceMediaId, voiceDuration, created }. */
export async function saveAttached(v, { ownerStore, ownerId, encryptScope }) {
  if (v.blob) {
    const id = await db.putMedia(v.blob, { ownerStore, ownerId, duration: v.seconds, encryptScope });
    return { voiceMediaId: id, voiceDuration: Math.round(v.seconds), created: id };
  }
  return { voiceMediaId: v.keep || null, voiceDuration: v.keep ? v.keepDuration : 0, created: null };
}
