// Cartas (docs/05 Pestaña 4, §18 "Cartas nuestras", docs/06, docs/09 #/cartas).
// "Para ti": fūtō envelopes sealed with a hanko; opening one breaks the seal and shows the
// letter on washi paper, then it stays marked "Abierta el {fecha} a las {hora}".
// "Escribimos": each person writes their own "Ábreme cuando..." letters (loose sheet -> envelope
// "En camino" -> "Leídas"). A sealed letter can still be edited until it is opened (2026-11-21): it stays
// sealed and the partner reads the new version. The seal is symbolic, not encryption.
// On the author's phone the seed letters show with their own, by status (decision 5).
import { ui, util, db, profile, seed, security, CONFIG } from '../core.js';
import { framePhoto } from '../core/cropper.js';
import { layer as stickerLayer, decorate, loadAlbum, albumView } from './stickers.js';
import { voiceAttach, saveAttached, player as voicePlayer } from './voz.js';
import { toTrash, TRASH_NOTE } from './papelera.js';

const { el, icon } = util;
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const KEY = `${CONFIG.storageKey}.cartas.tab`;
const TABS = ['mine', 'write', 'stickers'];
// Screens open on their first tab every time instead of the last one used (2026-11-22).
const readTab = () => 'mine';
const saveTab = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
const AUTHOR = Object.entries(CONFIG.people || {}).find(([, p]) => p.role === 'author')?.[0] || 'david';
const pending = (t) => !t || seed.needsCompletion(t);
const PREFIX = 'Ábreme cuando';

export const openedText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `Abierta el ${fmtDate.format(d)} a las ${fmtTime.format(d)}` : 'Abierta';
};
const fmtShort = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const shortOpened = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? `Abierta el ${fmtShort.format(d)}` : 'Abierta'; };
/** "me extrañes" -> "Ábreme cuando me extrañes"; a full label stays as it is. */
export const labelOf = (condition) => {
  const c = String(condition || '').trim();
  return /^ábreme cuando/i.test(c) ? c : `${PREFIX} ${c}`;
};

/** Letters for this profile still sealed (the dot on the Cartas tab, Fase 7). */
export async function unopenedCount(me = profile.active()) {
  const [content, stored] = await Promise.all([db.query('content', { index: 'kind', range: IDBKeyRange.only('letter') }), db.query('letters')]);
  const states = new Map(stored.filter((s) => s.letterId).map((s) => [s.letterId, s]));
  const all = [...content.filter((c) => !c.deleted).map((c) => fromSeed(c, states.get(c.id))), ...stored.filter((s) => !s.letterId && !s.deleted).map(fromOwn)];
  return all.filter((l) => l.to === me && l.status === 'sealed' && !l.incomplete && l.body).length;
}

// One shape for both kinds of letters.
const fromSeed = (c, state) => ({
  id: c.id, kind: 'seed', from: c.from || AUTHOR, to: c.to || profile.partnerOf(c.from || AUTHOR),
  label: pending(c.label) ? 'Carta' : c.label, body: c.text, signature: '', mediaId: null,
  status: state?.openedAt ? 'opened' : 'sealed', openedAt: state?.openedAt || null, incomplete: pending(c.label) || pending(c.text),
});
const fromOwn = (l) => ({
  id: l.id, kind: 'own', from: l.author, to: l.to || profile.partnerOf(l.author), label: labelOf(l.condition), condition: l.condition,
  body: l.body, signature: l.signature, mediaId: l.mediaId || null, voiceMediaId: l.voiceMediaId || null, voiceDuration: l.voiceDuration || 0, status: l.status, openedAt: l.openedAt || null, sealedAt: l.sealedAt || null, stickers: l.stickers || [], vanishDays: l.vanishDays || 0, raw: l,
});

function seal(letter, { size = 56 } = {}) {
  const initial = (profile.name(letter.from) || '♥').charAt(0).toUpperCase();
  const box = el('span', { class: `futo-seal${letter.status === 'opened' ? ' broken' : ''}`, 'aria-hidden': 'true' });
  // Two copies of the hanko, each showing one half: when the letter is opened they drift apart.
  box.append(el('span', { class: 'seal-half seal-left' }, ui.hanko({ text: initial, size })), el('span', { class: 'seal-half seal-right' }, ui.hanko({ text: initial, size })));
  return box;
}

// Classic envelope, one per row (decided 2026-11-19): V flap with the sender's hanko at its tip,
// "Ábreme cuando…" written on the front. Kept low so several fit on a phone screen.
function envelopeFace(letter, { tag = 'span' } = {}) {
  const opened = letter.status === 'opened';
  const cond = letter.label.replace(/^ábreme cuando\s+/i, '');
  const hasPre = /^ábreme cuando\s+/i.test(letter.label);
  return [
    el(tag, { class: 'futo-flap', 'aria-hidden': 'true' }),
    el(tag, { class: 'futo-from', 'aria-hidden': 'true' }, `De ${profile.name(letter.from)}`),
    opened ? el(tag, { class: 'futo-status', 'aria-hidden': 'true' }, icon('check', { size: 14 }), shortOpened(letter.openedAt)) : null,
    seal(letter, { size: 44 }),
    el(tag, { class: 'futo-label' }, hasPre ? el(tag, { class: 'futo-pre' }, 'Ábreme cuando') : null, hasPre ? cond : letter.label),
    stickerLayer(letter.stickers, { tag }),
  ];
}

function envelope(letter, onOpen) {
  const opened = letter.status === 'opened';
  const status = opened ? openedText(letter.openedAt) : 'Sin abrir';
  return el('button', {
    class: `futo${opened ? ' is-opened' : ''}`, type: 'button', dataset: { id: letter.id },
    'aria-label': `${letter.label}. De ${profile.name(letter.from)}. ${status}.`,
    onClick: (e) => onOpen(letter, e.currentTarget),
  }, envelopeFace(letter));
}

/**
 * The opening the couple asked for: the envelope rises to the center, the seal breaks, the flap
 * opens, the letter slides out and grows to fill the screen. Resolves when the paper covers the
 * screen; call the returned function once the letter is showing to clear the stage.
 */
async function flyOpen(node, letter) {
  if (!node || !node.animate || util.prefersReducedMotion()) return null;
  const r = node.getBoundingClientRect();
  const paper = el('div', { class: 'fly-paper' }, el('span'), el('span'), el('span'));
  const env = el('div', { class: `futo fly-env${letter.status === 'opened' ? ' is-opened' : ''}` },
    el('div', { class: 'fly-back' }), paper, el('div', { class: 'fly-pocket' }), envelopeFace(letter, { tag: 'div' }));
  const stage = el('div', { class: 'letter-fly', 'aria-hidden': 'true' }, el('div', { class: 'letter-fly-dim' }), env);
  Object.assign(env.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(stage);
  node.style.visibility = 'hidden';
  const scale = Math.min(innerWidth - 32, 440) / r.width;
  const dx = innerWidth / 2 - (r.left + r.width / 2);
  const dy = innerHeight * 0.55 - (r.top + r.height / 2);
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  await env.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], { duration: 420, easing: ease, fill: 'forwards' }).finished;
  env.classList.add('is-breaking'); util.haptic(12); util.sound('stamp');
  await util.sleep(320);
  env.classList.add('is-flap-open'); util.sound('paper');
  await util.sleep(300);
  env.classList.add('is-paper-out');
  await util.sleep(380);
  const pr = paper.getBoundingClientRect();
  const sheet = el('div', { class: 'fly-sheet' });
  stage.append(sheet);
  const from = { left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px`, borderRadius: '6px' };
  Object.assign(sheet.style, from);
  // Phones: the letter takes the whole screen. Larger screens: it lands where the letter dialog sits.
  const phone = innerWidth < 768;
  const w = phone ? innerWidth : Math.min(820, innerWidth - 32);
  const h = phone ? innerHeight : Math.min(innerHeight * 0.88, 900);
  const to = { left: `${(innerWidth - w) / 2}px`, top: `${(innerHeight - h) / 2}px`, width: `${w}px`, height: `${h}px`, borderRadius: phone ? '0px' : '16px' };
  await sheet.animate([from, to], { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished;
  return () => {
    node.style.visibility = '';
    stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.then(() => stage.remove(), () => stage.remove());
  };
}

/** Prints a letter on its own page (PC): the app is hidden by CSS while body.printing-letter is set. */
function printLetter(letter, paras) {
  const sheet = el('article', { class: 'print-letter' },
    el('h1', {}, letter.label),
    paras.map((p) => el('p', {}, p)),
    el('p', { class: 'print-letter-sign' }, letter.signature || profile.name(letter.from)));
  document.body.append(sheet); document.body.classList.add('printing-letter');
  const clean = () => { sheet.remove(); document.body.classList.remove('printing-letter'); removeEventListener('afterprint', clean); };
  addEventListener('afterprint', clean);
  setTimeout(() => window.print(), 50);
}

async function letterModal(letter, { onShareable = true, flown = false, onDelete = null, onEdit = null } = {}) {
  const paras = String(letter.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let photo = null; let url = null;
  if (letter.mediaId) {
    const blob = await db.getMedia(letter.mediaId).catch(() => null);
    if (blob) { url = URL.createObjectURL(blob); photo = el('img', { class: 'washi-photo', src: url, alt: `Foto de la carta ${letter.label}` }); }
  }
  const bag = new Set();
  const voice = letter.voiceMediaId ? el('div', { class: 'washi-voice' }, el('p', { class: 'muted small' }, 'Con una nota de voz'), voicePlayer({ mediaId: letter.voiceMediaId, duration: letter.voiceDuration, title: 'la nota de voz de la carta' }, bag)) : null;
  const body = el('div', { class: 'washi' },
    photo,
    paras.map((p) => el('p', {}, p)),
    voice,
    el('p', { class: 'washi-sign' }, letter.signature || profile.name(letter.from)),
    letter.openedAt ? el('p', { class: 'washi-meta' }, openedText(letter.openedAt)) : null,
    letter.vanishDays ? el('p', { class: 'washi-meta washi-vanish' }, `Esta carta se borra sola ${letter.vanishDays === 1 ? '1 día' : `${letter.vanishDays} días`} después de abrirla.`) : null);
  const actions = [{ label: 'Cerrar', variant: 'ghost' }];
  actions.unshift({ label: 'Imprimir', onClick: () => { printLetter(letter, paras); return false; } });
  if (onShareable) actions.unshift({ label: 'Compartir el texto', onClick: () => { ui.share({ title: letter.label, text: `${letter.label}\n\n${paras.join('\n\n')}\n\n${letter.signature || profile.name(letter.from)}` }); return false; } });
  if (onDelete) actions.unshift({ label: 'Borrar', variant: 'ghost', onClick: () => { onDelete(); return true; } });
  if (onEdit) actions.unshift({ label: 'Editar', onClick: () => { setTimeout(onEdit, 0); return true; } });
  return ui.openModal({ title: letter.label, size: 'lg', className: `washi-modal${flown ? ' is-flown' : ''}`, body, actions, onClose: () => { if (url) URL.revokeObjectURL(url); bag.forEach((u) => URL.revokeObjectURL(u)); } });
}

/** A preloaded letter (content store): only its "Ábreme cuando…" and its text. */
function seedEditor(rec, { onSaved }) {
  const cond = ui.input({ maxlength: 80, autocomplete: 'off', value: String(rec.label || '').replace(/^ábreme cuando\s*/i, '') });
  const body = ui.textarea({ rows: 10, maxlength: 6000 });
  body.value = rec.text || '';
  const fCond = ui.field({ label: `${PREFIX}…`, control: cond });
  const fBody = ui.field({ label: 'La carta', control: body, hint: 'Deja una línea en blanco para separar párrafos.' });
  const formError = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    const c = cond.value.trim(); const b = body.value.trim();
    fCond.setError(c ? '' : '¿Cuándo debe abrirla? Escríbelo aquí.');
    fBody.setError(b ? '' : 'Escribe la carta.');
    if (!c) { cond.focus(); return false; }
    if (!b) { body.focus(); return false; }
    try { await db.put('content', { ...rec, label: labelOf(c), text: b }); onSaved(); return true; } catch (e) {
      console.error(e); formError.textContent = 'No se pudo guardar la carta. Inténtalo de nuevo; lo que escribiste sigue aquí.'; return false;
    }
  };
  return ui.openModal({
    title: 'Editar carta', kind: 'sheet', size: 'lg', className: 'letter-editor',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fCond, fBody, el('p', { class: 'muted small' }, `Sigue sellada y en camino: ${profile.name(rec.to || profile.partnerOf(rec.from || AUTHOR))} leerá esta versión cuando la abra.`), formError),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar cambios', variant: 'primary', onClick: save }],
  });
}

function editor(existing, { onSaved }) {
  const isNew = !existing;
  const l = existing || { id: util.uuid(), author: profile.active(), to: profile.partnerOf(profile.active()), status: 'draft' };
  const sealed = l.status === 'sealed'; // editing a letter "En camino": it stays sealed and shared
  const cond = ui.input({ maxlength: 80, autocomplete: 'off', placeholder: 'me extrañes', value: String(l.condition || '').replace(/^ábreme cuando\s*/i, '') });
  const body = ui.textarea({ rows: 10, maxlength: 8000 });
  body.value = l.body || '';
  const sign = ui.input({ maxlength: 60, value: l.signature || profile.name(l.author) });
  const fCond = ui.field({ label: `${PREFIX}…`, control: cond, hint: 'Por ejemplo: me extrañes, tengas un día pesado, necesites reír.' });
  const fBody = ui.field({ label: 'La carta', control: body, hint: 'Deja una línea en blanco para separar párrafos.' });
  cond.addEventListener('input', () => { if (cond.value.trim()) fCond.setError(''); });
  body.addEventListener('input', () => { if (body.value.trim()) fBody.setError(''); });
  let photo = null; let photoUrl = null; let keepMedia = l.mediaId || null; let busy = false;
  const photoBox = el('div', { class: 'letter-photo' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `lp-${l.id.slice(0, 8)}` });
  const paintPhoto = async () => {
    let src = photoUrl;
    if (!src && keepMedia) { const b = await db.getMedia(keepMedia).catch(() => null); if (b) src = photoUrl = URL.createObjectURL(b); }
    photoBox.replaceChildren(src
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src, alt: 'Foto de la carta' }),
        el('button', { class: 'btn btn-secondary btn-small photo-crop', type: 'button', 'aria-label': 'Recortar o encuadrar la foto', onClick: async () => { const b = photo?.blob || (keepMedia ? await db.getMedia(keepMedia).catch(() => null) : null); if (!b) return; try { photo = await framePhoto(b); keepMedia = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(photo.blob); paintPhoto(); } catch (x) { if (x?.code !== 'CANCEL') ui.toast('No pudimos recortar esa foto.', { tone: 'error' }); } } }, icon('crop', { size: 16 }), el('span', {}, 'Recortar')),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keepMedia = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; paintPhoto(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: fileInput.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Agregar una foto (opcional)')),
    fileInput);
  };
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    busy = true;
    try { photo = await framePhoto(f); keepMedia = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(photo.blob); } catch (x) { if (x?.code !== 'CANCEL') ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paintPhoto();
  });
  paintPhoto();
  const voice = voiceAttach({ mediaId: l.voiceMediaId || null, duration: l.voiceDuration || 0 });
  // v0.27.0 (idea 57): optional, for what is sensitive. Counted from when it is opened.
  const vanish = el('select', { class: 'input' }, [['0', 'No, se queda'], ['1', 'Sí, 1 día después de abrirla'], ['7', 'Sí, 7 días después de abrirla'], ['30', 'Sí, 30 días después de abrirla']]
    .map(([v, t]) => el('option', { value: v, selected: String(l.vanishDays || 0) === v }, t)));
  const formError = el('p', { class: 'field-error form-error', role: 'alert' });

  const save = async () => {
    formError.textContent = '';
    if (busy) { formError.textContent = 'Espera a que la foto esté lista.'; return false; }
    if (voice.recording()) { formError.textContent = 'Detén la grabación primero.'; return false; }
    const c = cond.value.trim(); const b = body.value.trim();
    fCond.setError(c ? '' : '¿Cuándo debe abrirla? Escríbelo aquí.');
    fBody.setError(b ? '' : 'Escribe la carta.');
    if (!c) { cond.focus(); return false; }
    if (!b) { body.focus(); return false; }
    // Drafts are "Solo yo": the other profile does not see them until they are sealed.
    // A sealed letter keeps its seal and stays shared, so the partner opens the new version.
    const access = sealed ? { status: 'sealed', visibility: 'shared', private: false, owner: 'both' } : { status: 'draft', visibility: 'self', private: true, owner: l.author };
    const rec = { ...l, condition: c, body: b, signature: sign.value.trim() || profile.name(l.author), vanishDays: Number(vanish.value) || 0, ...access };
    const created = [];
    try {
      const scope = security.policy('letters', rec) || undefined;
      if (photo) { const id = await db.putMedia(photo.blob, { ownerStore: 'letters', ownerId: l.id, width: photo.width, height: photo.height, encryptScope: scope }); created.push(id); rec.mediaId = id; } else rec.mediaId = keepMedia;
      const v = await saveAttached(voice.value(), { ownerStore: 'letters', ownerId: l.id, encryptScope: scope });
      if (v.created) created.push(v.created);
      rec.voiceMediaId = v.voiceMediaId; rec.voiceDuration = v.voiceDuration;
      await db.put('letters', rec);
      if (l.mediaId && l.mediaId !== rec.mediaId) await db.rawDelete('media', l.mediaId).catch(() => {});
      if (l.voiceMediaId && l.voiceMediaId !== rec.voiceMediaId) await db.rawDelete('media', l.voiceMediaId).catch(() => {});
      onSaved(rec, isNew);
      return true;
    } catch (e) {
      for (const id of created) await db.rawDelete('media', id).catch(() => {});
      console.error(e);
      formError.textContent = `No se pudo guardar ${sealed ? 'la carta' : 'el borrador'}. Inténtalo de nuevo; lo que escribiste sigue aquí.`;
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? `Carta para ${profile.name(l.to)}` : sealed ? 'Editar carta' : 'Editar borrador', kind: 'sheet', size: 'lg', className: 'letter-editor',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fCond, fBody, ui.field({ label: 'Firma', control: sign }), photoBox, voice.node,
      ui.field({ label: '¿Se borra sola?', control: vanish, hint: 'Desaparece de los dos teléfonos, sin Papelera. Útil para lo más íntimo.' }),
      el('p', { class: 'muted small' }, sealed ? `Sigue sellada y en camino: ${profile.name(l.to)} leerá esta versión cuando la abra.` : 'Se guarda como borrador: solo tú la ves. Cuando esté lista, séllala.'), formError),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: sealed ? 'Guardar cambios' : 'Guardar borrador', variant: 'primary', onClick: save }],
    onClose: () => { if (photoUrl) URL.revokeObjectURL(photoUrl); voice.cleanup(); },
  });
}

export async function render(ctx) {
  const page = el('section', { class: 'page page-wide cartas' });
  const header = ui.pageHeader({ title: 'Cartas', jp: '手紙', romaji: 'tegami', actions: [ui.newButton('Escribir carta', () => openEditor(), 'pencil')] });
  const body = el('div', { class: 'cartas-body' }, ui.skeleton(3, { kind: 'cards' }));
  page.append(header, body);
  let tab = readTab();
  let letters = [];
  let justOpened = null;

  const load = async () => {
    const [content, stored] = await Promise.all([db.query('content', { index: 'kind', range: IDBKeyRange.only('letter') }), db.query('letters'), loadAlbum().catch(() => [])]);
    const states = new Map(stored.filter((s) => s.letterId).map((s) => [s.letterId, s]));
    letters = [
      ...content.filter((c) => !c.deleted).map((c) => fromSeed(c, states.get(c.id))),
      ...stored.filter((s) => !s.letterId).map(fromOwn),
    ];
    // v0.27.0: letters that vanish after being read leave both phones for good.
    const gone = letters.filter((l) => l.kind === 'own' && l.vanishDays && l.openedAt && Date.now() - Date.parse(l.openedAt) > l.vanishDays * 86400000);
    for (const l of gone) await db.purge('letters', l.id).catch(() => {});
    if (gone.length) letters = letters.filter((l) => !gone.includes(l));
  };

  const openEditor = (raw = null) => editor(raw, {
    onSaved: async (rec, isNew) => { ui.toast(isNew ? 'Borrador guardado.' : 'Cambios guardados.', { tone: 'success' }); tab = 'write'; saveTab(tab); await load(); draw(); },
  });

  // Letters "En camino" open for editing too. A preloaded letter is edited in place (as in Perfil y datos).
  const editSealed = async (l) => {
    if (l.kind === 'own') { openEditor(l.raw); return; }
    const rec = await db.get('content', l.id).catch(() => null);
    if (rec) seedEditor(rec, { onSaved: async () => { ui.toast('Cambios guardados.', { tone: 'success' }); await load(); draw(); } });
  };

  const openLetter = async (letter, node) => {
    let openedAt = letter.openedAt;
    if (letter.status !== 'opened') {
      const at = util.nowISO();
      openedAt = at;
      try {
        if (letter.kind === 'seed') await db.put('letters', { id: `open:${letter.id}`, letterId: letter.id, openedAt: at, openedBy: profile.active(), status: 'opened' });
        else await db.put('letters', { ...letter.raw, status: 'opened', openedAt: at, openedBy: profile.active() });
      } catch (e) { console.error(e); }
      justOpened = letter.id;
    }
    const clear = await flyOpen(node, letter).catch(() => { document.querySelector('.letter-fly')?.remove(); if (node) node.style.visibility = ''; return null; });
    letter = { ...letter, status: 'opened', openedAt: openedAt || util.nowISO() };
    const m = await letterModal(letter, { flown: !!clear, onDelete: () => removeLetter(letter) });
    clear?.();
    m.result.then(async () => { await load(); draw(); body.querySelector(`.futo[data-id="${CSS.escape(letter.id)}"]`)?.focus({ preventScroll: true }); });
  };

  const sealLetter = async (l) => {
    const yes = await ui.confirmDialog({ title: '¿Sellar esta carta?', message: `${profile.name(l.to)} la verá en "Para ti". Podrás editarla mientras no la abra. El sello es simbólico: guarda la sorpresa, pero no es un candado.`, confirmLabel: 'Sellar' });
    if (!yes) return;
    try {
      const rec = { ...l.raw, status: 'sealed', sealedAt: util.nowISO(), visibility: 'shared', private: false, owner: 'both' };
      // The photo and the voice note follow the letter out of "Solo yo": saved again without the personal key.
      for (const key of ['mediaId', 'voiceMediaId']) {
        if (!rec[key]) continue;
        const raw = await db.rawGet('media', rec[key]);
        if (raw?.enc) {
          const blob = await db.getMedia(rec[key]);
          const old = rec[key];
          rec[key] = blob ? await db.putMedia(blob, { ownerStore: 'letters', ownerId: rec.id, width: raw.width, height: raw.height, duration: raw.duration }) : null;
          await db.rawDelete('media', old).catch(() => {});
        }
      }
      await db.put('letters', rec);
      util.haptic([12, 50, 24]); util.sound('stamp');
      ui.toast('Carta sellada.', { tone: 'success' });
      await load(); draw();
      body.querySelector(`.futo-sent[data-id="${CSS.escape(rec.id)}"] .hanko`)?.classList.add('hanko-stamp');
    } catch (e) { console.error(e); ui.toast('No se pudo sellar. Inténtalo de nuevo.', { tone: 'error' }); }
  };

  // Stickers go on while the letter is a draft; sealing keeps them as they are.
  const decorateLetter = async (l) => {
    const list = await decorate({ letter: l, face: () => envelopeFace({ ...l, stickers: [], status: 'sealed' }, { tag: 'div' }) });
    if (!list) return;
    try {
      await db.put('letters', { ...l.raw, stickers: list });
      ui.toast(list.length ? 'Sobre decorado.' : 'Sobre sin estampillas.', { tone: 'success' });
      await load(); draw();
      [...body.querySelectorAll(`.own-letter[data-id="${CSS.escape(l.id)}"] button`)].find((n) => n.textContent.includes('Decorar'))?.focus({ preventScroll: true });
    } catch (e) { console.error(e); ui.toast('No se pudo guardar el sobre. Inténtalo de nuevo.', { tone: 'error' }); }
  };

  const removeLetter = async (l) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar esta carta?', message: `“${l.label}”. ${TRASH_NOTE}`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    if (l.kind === 'seed') await toTrash('content', l.id, { label: l.label, what: 'Carta borrada', onRestored: () => load().then(draw) });
    else await toTrash('letters', l.id, { label: l.label, what: 'Carta borrada', extraMedia: [l.raw?.mediaId], onRestored: () => load().then(draw) });
    await load(); draw();
  };

  function forMe() {
    const me = profile.active();
    const list = letters.filter((l) => l.to === me && l.status !== 'draft' && !l.incomplete && l.body);
    const closed = list.filter((l) => l.status !== 'opened');
    const opened = list.filter((l) => l.status === 'opened').sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
    const wrap = el('div', { class: 'cartas-section' });
    if (!list.length) {
      wrap.append(ui.emptyState({ title: 'Aún no hay cartas para ti', text: `Cuando ${profile.name(profile.partnerOf(me))} te escriba una, llega aquí en un sobre sellado.`, art: 'envelope' }));
      return wrap;
    }
    if (closed.length) {
      wrap.append(el('p', { class: 'ribbon' }, el('span', {}, closed.length === 1 ? 'Te queda 1 carta por abrir' : `Te quedan ${closed.length} cartas por abrir`)));
      wrap.append(el('div', { class: 'futo-grid' }, closed.map((l) => envelope(l, openLetter))));
    } else wrap.append(el('p', { class: 'ribbon ribbon-done' }, el('span', {}, 'Ya abriste todas tus cartas')));
    if (opened.length) {
      wrap.append(el('h2', { class: 'card-kicker cartas-subtitle' }, 'Abiertas'),
        el('div', { class: 'futo-grid' }, opened.map((l) => envelope(l, openLetter))));
    }
    return wrap;
  }

  // "Escribimos" (decided 2026-11-19, option C): drafts are loose sheets of lined paper "on the table";
  // sealing puts them in an envelope that moves to "En camino" and then to "Leídas".
  function writing() {
    const me = profile.active();
    const partner = profile.name(profile.partnerOf(me));
    const mine = letters.filter((l) => l.from === me).sort((a, b) => ((b.raw?.sealedAt || b.raw?.updatedAt || '').localeCompare(a.raw?.sealedAt || a.raw?.updatedAt || '')));
    const drafts = mine.filter((l) => l.status === 'draft');
    const onTheWay = mine.filter((l) => l.status === 'sealed');
    const read = mine.filter((l) => l.status === 'opened').sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''));
    const stickerNote = (l) => (l.stickers?.length ? (l.stickers.length === 1 ? '1 estampilla en el sobre' : `${l.stickers.length} estampillas en el sobre`) : '');
    const excerpt = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 150 ? `${x.slice(0, 150).trimEnd()}…` : x; };
    const sheet = (l) => el('article', { class: 'draft-sheet own-letter status-draft', dataset: { id: l.id }, 'aria-labelledby': `ol-${l.id.slice(0, 12)}` },
      el('h3', { class: 'draft-title', id: `ol-${l.id.slice(0, 12)}` }, l.label),
      el('p', { class: 'draft-lines' }, excerpt(l.body)),
      el('p', { class: 'draft-meta' }, el('span', {}, 'Borrador · solo tú la ves'), stickerNote(l) ? el('span', {}, stickerNote(l)) : null),
      el('div', { class: 'card-actions' },
        ui.button({ label: 'Meter al sobre', iconName: 'mail', variant: 'primary', small: true, onClick: () => sealLetter(l) }),
        ui.button({ label: 'Seguir', iconName: 'pencil', small: true, onClick: () => openEditor(l.raw) }),
        ui.button({ label: 'Decorar sobre', iconName: 'sticker', small: true, onClick: () => decorateLetter(l) }),
        ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => removeLetter(l) })));
    // A small envelope, two per row. Tapping it shows the letter as it was sent.
    // v0.30.0 (Rowler): the letters "En camino" carry their own actions right under the envelope, so
    // reading, editing, decorating and deleting are one tap away (no hidden buttons in a dialog).
    const sent = (l) => {
      const opened = l.status === 'opened';
      const status = l.incomplete ? 'Por completar' : opened ? shortOpened(l.openedAt) : 'Sin abrir';
      const cond = l.label.replace(/^ábreme cuando\s+/i, '');
      const hasPre = /^ábreme cuando\s+/i.test(l.label);
      const read = () => (l.incomplete || !l.body ? editSealed(l) : letterModal(l, { onDelete: () => removeLetter(l), onEdit: l.status === 'sealed' ? () => editSealed(l) : null }));
      const env = el('button', {
        class: `futo futo-sent own-letter status-${l.status}${opened ? ' is-opened' : ''}`, type: 'button', dataset: { id: l.id },
        'aria-label': `${l.label}. Para ${partner}. ${opened ? openedText(l.openedAt) : status}. Toca para leerla.`,
        onClick: read,
      },
      el('span', { class: 'futo-flap', 'aria-hidden': 'true' }),
      seal(l, { size: 36 }),
      el('span', { class: 'futo-label' }, hasPre ? el('span', { class: 'futo-pre' }, 'Ábreme cuando') : null, hasPre ? cond : l.label),
      el('span', { class: `futo-sent-status${opened ? ' is-read' : ''}`, 'aria-hidden': 'true' }, opened ? icon('check', { size: 14 }) : null, status),
      stickerLayer(l.stickers));
      const chip = (label, iconName, onClick, extra = '') => el('button', { class: `sent-act${extra}`, type: 'button', 'aria-label': `${label}: ${l.label}`, onClick }, icon(iconName, { size: 16 }), el('span', {}, label));
      return el('div', { class: 'sent-item', dataset: { id: l.id } }, env,
        el('div', { class: 'sent-acts', role: 'group', 'aria-label': `Acciones de ${l.label}` },
          l.status === 'sealed' ? chip('Editar', 'pencil', () => editSealed(l)) : chip('Leer', 'mail-open', read),
          l.status === 'sealed' && l.kind === 'own' ? chip('Estampillas', 'sticker', () => decorateLetter(l)) : null,
          chip('Borrar', 'trash-2', () => removeLetter(l), ' is-danger')));
    };
    const empty = !mine.length;
    return el('div', { class: 'cartas-section' },
      el('div', { class: 'cartas-group' },
        el('h2', { class: 'card-kicker cartas-subtitle' }, 'Sobre la mesa'),
        el('p', { class: 'muted small' }, drafts.length
          ? 'Lo que aún escribes: hojas sueltas que solo tú ves. Puedes editarlas hasta que las abran.'
          : empty ? `Aquí quedan las cartas "Ábreme cuando…" que le escribas a ${partner}. Empieza con "Escribir carta".` : 'No hay hojas sueltas. Para otra carta, usa "Escribir carta".'),
        drafts.length ? el('div', { class: 'draft-grid' }, drafts.map(sheet)) : null),
      onTheWay.length ? el('div', { class: 'cartas-group' },
        el('h2', { class: 'card-kicker cartas-subtitle' }, 'En camino'),
        el('p', { class: 'muted small' }, onTheWay.length === 1 ? `Sellada, esperando a que ${partner} la abra. Tócala para leerla o editarla.` : `Selladas, esperando a que ${partner} las abra. Toca una para leerla o editarla.`),
        el('div', { class: 'sent-grid' }, onTheWay.map(sent))) : null,
      read.length ? el('div', { class: 'cartas-group' },
        el('h2', { class: 'card-kicker cartas-subtitle' }, 'Leídas'),
        el('div', { class: 'sent-grid' }, read.map(sent))) : null);
  }

  // "Decorar un sobre" from the album: the newest draft, or a new letter when there is none.
  async function useStickers() {
    const me = profile.active();
    const draft = letters.filter((l) => l.from === me && l.status === 'draft').sort((a, b) => (b.raw?.updatedAt || '').localeCompare(a.raw?.updatedAt || ''))[0];
    tab = 'write'; saveTab(tab); draw();
    if (draft) await decorateLetter(draft);
    else { ui.toast('Primero escribe la carta; luego "Decorar sobre" en su hoja.'); openEditor(); }
  }

  function draw() {
    const me = profile.active();
    const toOpen = letters.filter((l) => l.to === me && l.status === 'sealed' && !l.incomplete && l.body).length;
    const tabs = ui.segmented({
      label: 'Cartas', value: tab,
      options: [{ value: 'mine', label: toOpen ? `Para ti (${toOpen})` : 'Para ti' }, { value: 'write', label: 'Escribimos' }, { value: 'stickers', label: 'Estampillas' }],
      onChange: (v) => { tab = v; saveTab(v); draw(); },
    });
    if (tab === 'stickers') {
      // Third section (decided 2026-11-20): the sticker album, always in view.
      const slot = el('div', { class: 'cartas-section' });
      body.replaceChildren(tabs, slot);
      albumView({ onUse: useStickers }).then((view) => { if (tab === 'stickers' && slot.isConnected) slot.replaceWith(view); }).catch((e) => console.error(e));
    } else body.replaceChildren(tabs, tab === 'mine' ? forMe() : writing());
    if (justOpened) { body.querySelector(`.futo[data-id="${CSS.escape(justOpened)}"]`)?.classList.add('just-opened'); justOpened = null; }
  }

  try { await load(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las cartas', text: 'Cierra y vuelve a abrir la app; tus datos siguen en el teléfono.', art: 'wave' }));
    return page;
  }
  // Inicio's quick action "Escribir carta" opens the editor right away.
  const write = !!ctx.query?.escribir;
  if (write) history.replaceState(history.state, '', '#/cartas');
  // A link to one letter (#/cartas/:id) opens it on top of the list.
  const linked = ctx.params?.a ? letters.find((l) => l.id === ctx.params.a && l.to === profile.active() && l.status !== 'draft') : null;
  if (linked) { tab = 'mine'; }
  draw();
  if (write) requestAnimationFrame(() => openEditor());
  if (linked) {
    history.replaceState(history.state, '', '#/cartas');
    requestAnimationFrame(() => openLetter(linked, body.querySelector(`.futo[data-id="${CSS.escape(linked.id)}"]`)));
  }
  // An image shared from another app ("Compartir > Aishiteru") becomes a sticker for the album.
  if (ctx.app?.sharedSticker) {
    ctx.app.sharedSticker = false;
    requestAnimationFrame(async () => {
      try {
        const cache = await caches.open('compartido');
        const key = new URL('./__estampilla-compartida', location.href).href;
        const res = await cache.match(key);
        await cache.delete(key);
        if (!res) return;
        const blob = await res.blob();
        const { makeSticker } = await import('./sticker-maker.js');
        const rec = await makeSticker(new File([blob], 'compartida', { type: blob.type || 'image/png' }));
        if (rec) { tab = 'stickers'; saveTab(tab); await load(); draw(); ui.toast('Quedó en el álbum. Úsala con "Decorar un sobre".'); }
      } catch (e) { console.error(e); ui.toast('No pudimos abrir la imagen compartida.', { tone: 'error' }); }
    });
  }
  const offProfile = profile.onProfileChange(async () => { await load(); draw(); });
  return { node: page, cleanup: offProfile };
}
