// Cartas (docs/05 Pestaña 4, §18 "Cartas nuestras", docs/06, docs/09 #/cartas).
// "Para ti": fūtō envelopes sealed with a hanko; opening one breaks the seal and shows the
// letter on washi paper, then it stays marked "Abierta el {fecha} a las {hora}".
// "Escribimos": each person writes their own "Ábreme cuando..." letters (draft -> sealed ->
// opened). A sealed letter can no longer be edited; the seal is symbolic, not encryption.
// On the author's phone the seed letters show as "Las que le escribiste" with their status (decision 5).
import { ui, util, db, profile, seed, security, CONFIG } from '../core.js';
import { compressImage } from '../core/images.js';
import { layer as stickerLayer, decorate, loadAlbum } from './stickers.js';

const { el, icon } = util;
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const KEY = `${CONFIG.storageKey}.cartas.tab`;
const readTab = () => { try { return localStorage.getItem(KEY) === 'write' ? 'write' : 'mine'; } catch { return 'mine'; } };
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

// One shape for both kinds of letters.
const fromSeed = (c, state) => ({
  id: c.id, kind: 'seed', from: c.from || AUTHOR, to: c.to || profile.partnerOf(c.from || AUTHOR),
  label: pending(c.label) ? 'Carta' : c.label, body: c.text, signature: '', mediaId: null,
  status: state?.openedAt ? 'opened' : 'sealed', openedAt: state?.openedAt || null, incomplete: pending(c.label) || pending(c.text),
});
const fromOwn = (l) => ({
  id: l.id, kind: 'own', from: l.author, to: l.to || profile.partnerOf(l.author), label: labelOf(l.condition), condition: l.condition,
  body: l.body, signature: l.signature, mediaId: l.mediaId || null, status: l.status, openedAt: l.openedAt || null, sealedAt: l.sealedAt || null, stickers: l.stickers || [], raw: l,
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
  env.classList.add('is-breaking'); util.haptic(12);
  await util.sleep(320);
  env.classList.add('is-flap-open');
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

async function letterModal(letter, { onShareable = true, flown = false } = {}) {
  const paras = String(letter.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let photo = null; let url = null;
  if (letter.mediaId) {
    const blob = await db.getMedia(letter.mediaId).catch(() => null);
    if (blob) { url = URL.createObjectURL(blob); photo = el('img', { class: 'washi-photo', src: url, alt: `Foto de la carta ${letter.label}` }); }
  }
  const body = el('div', { class: 'washi' },
    photo,
    paras.map((p) => el('p', {}, p)),
    el('p', { class: 'washi-sign' }, letter.signature || profile.name(letter.from)),
    letter.openedAt ? el('p', { class: 'washi-meta' }, openedText(letter.openedAt)) : null);
  const actions = [{ label: 'Cerrar', variant: 'ghost' }];
  if (onShareable) actions.unshift({ label: 'Compartir el texto', onClick: () => { ui.share({ title: letter.label, text: `${letter.label}\n\n${paras.join('\n\n')}\n\n${letter.signature || profile.name(letter.from)}` }); return false; } });
  return ui.openModal({ title: letter.label, size: 'lg', className: `washi-modal${flown ? ' is-flown' : ''}`, body, actions, onClose: () => { if (url) URL.revokeObjectURL(url); } });
}

function editor(existing, { onSaved }) {
  const isNew = !existing;
  const l = existing || { id: util.uuid(), author: profile.active(), to: profile.partnerOf(profile.active()), status: 'draft' };
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
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keepMedia = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; paintPhoto(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: fileInput.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Agregar una foto (opcional)')),
    fileInput);
  };
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; fileInput.value = '';
    if (!f) return;
    busy = true;
    try { photo = await compressImage(f); keepMedia = null; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paintPhoto();
  });
  paintPhoto();
  const formError = el('p', { class: 'field-error form-error', role: 'alert' });

  const save = async () => {
    formError.textContent = '';
    if (busy) { formError.textContent = 'Espera a que la foto esté lista.'; return false; }
    const c = cond.value.trim(); const b = body.value.trim();
    fCond.setError(c ? '' : '¿Cuándo debe abrirla? Escríbelo aquí.');
    fBody.setError(b ? '' : 'Escribe la carta.');
    if (!c) { cond.focus(); return false; }
    if (!b) { body.focus(); return false; }
    // Drafts are "Solo yo": the other profile does not see them until they are sealed.
    const rec = { ...l, condition: c, body: b, signature: sign.value.trim() || profile.name(l.author), status: 'draft', visibility: 'self', private: true, owner: l.author };
    const created = [];
    try {
      const scope = security.policy('letters', rec) || undefined;
      if (photo) { const id = await db.putMedia(photo.blob, { ownerStore: 'letters', ownerId: l.id, width: photo.width, height: photo.height, encryptScope: scope }); created.push(id); rec.mediaId = id; } else rec.mediaId = keepMedia;
      await db.put('letters', rec);
      if (l.mediaId && l.mediaId !== rec.mediaId) await db.rawDelete('media', l.mediaId).catch(() => {});
      onSaved(rec, isNew);
      return true;
    } catch (e) {
      for (const id of created) await db.rawDelete('media', id).catch(() => {});
      console.error(e);
      formError.textContent = 'No se pudo guardar el borrador. Inténtalo de nuevo; lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? `Carta para ${profile.name(l.to)}` : 'Editar borrador', kind: 'sheet', size: 'lg', className: 'letter-editor',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fCond, fBody, ui.field({ label: 'Firma', control: sign }), photoBox,
      el('p', { class: 'muted small' }, 'Se guarda como borrador: solo tú la ves. Cuando esté lista, séllala.'), formError),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar borrador', variant: 'primary', onClick: save }],
    onClose: () => { if (photoUrl) URL.revokeObjectURL(photoUrl); },
  });
}

export async function render(ctx) {
  const page = el('section', { class: 'page page-wide cartas' });
  const header = ui.pageHeader({ title: 'Cartas', jp: '手紙', romaji: 'tegami', actions: [ui.newButton('Escribir carta', () => openEditor(), 'pencil')] });
  const body = el('div', { class: 'cartas-body' }, ui.skeleton(3));
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
  };

  const openEditor = (raw = null) => editor(raw, {
    onSaved: async (rec, isNew) => { ui.toast(isNew ? 'Borrador guardado.' : 'Cambios guardados.', { tone: 'success' }); tab = 'write'; saveTab(tab); await load(); draw(); },
  });

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
    const m = await letterModal(letter, { flown: !!clear });
    clear?.();
    m.result.then(async () => { await load(); draw(); body.querySelector(`.futo[data-id="${CSS.escape(letter.id)}"]`)?.focus({ preventScroll: true }); });
  };

  const sealLetter = async (l) => {
    const yes = await ui.confirmDialog({ title: '¿Sellar esta carta?', message: `Ya no la podrás editar y ${profile.name(l.to)} la verá en "Para ti". El sello es simbólico: guarda la sorpresa, pero no es un candado.`, confirmLabel: 'Sellar' });
    if (!yes) return;
    try {
      const rec = { ...l.raw, status: 'sealed', sealedAt: util.nowISO(), visibility: 'shared', private: false, owner: 'both' };
      // The photo follows the letter out of "Solo yo": saved again without the personal key.
      if (rec.mediaId) {
        const raw = await db.rawGet('media', rec.mediaId);
        if (raw?.enc) {
          const blob = await db.getMedia(rec.mediaId);
          const old = rec.mediaId;
          rec.mediaId = blob ? await db.putMedia(blob, { ownerStore: 'letters', ownerId: rec.id, width: raw.width, height: raw.height }) : null;
          await db.rawDelete('media', old).catch(() => {});
        }
      }
      await db.put('letters', rec);
      ui.toast('Carta sellada.', { tone: 'success' });
      await load(); draw();
      body.querySelector(`.own-letter[data-id="${CSS.escape(rec.id)}"] .hanko`)?.classList.add('hanko-stamp');
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
    const yes = await ui.confirmDialog({ title: '¿Borrar esta carta?', message: `“${l.label}” se borra de este teléfono. No se puede deshacer.`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    await db.purge('letters', l.id);
    ui.toast('Carta borrada.');
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

  function writing() {
    const me = profile.active();
    const partner = profile.name(profile.partnerOf(me));
    const own = letters.filter((l) => l.kind === 'own' && l.from === me).sort((a, b) => (b.raw.updatedAt || '').localeCompare(a.raw.updatedAt || ''));
    const seeded = letters.filter((l) => l.kind === 'seed' && l.from === me);
    const stickerNote = (l) => (l.stickers?.length ? ` · ${l.stickers.length === 1 ? '1 estampilla' : `${l.stickers.length} estampillas`}` : '');
    const statusOf = (l) => (l.status === 'draft' ? `Borrador${stickerNote(l)}` : l.status === 'sealed' ? 'Sellada, sin abrir' : openedText(l.openedAt));
    const row = (l) => el('article', { class: `card own-letter status-${l.status}`, dataset: { id: l.id }, 'aria-labelledby': `ol-${l.id.slice(0, 12)}` },
      el('div', { class: 'own-letter-head' },
        l.status === 'draft' ? el('span', { class: 'own-letter-icon', 'aria-hidden': 'true' }, icon('notebook-pen', { size: 28 })) : seal(l, { size: 44 }),
        el('div', { class: 'own-letter-text' },
          el('h3', { class: 'own-letter-title', id: `ol-${l.id.slice(0, 12)}` }, l.label),
          el('p', { class: 'muted small' }, statusOf(l)))),
      l.kind === 'own' ? el('div', { class: 'card-actions' },
        l.status === 'draft' ? [
          ui.button({ label: 'Sellar', iconName: 'mail', variant: 'primary', small: true, onClick: () => sealLetter(l) }),
          ui.button({ label: 'Editar', iconName: 'pencil', small: true, onClick: () => openEditor(l.raw) }),
          ui.button({ label: 'Decorar sobre', iconName: 'sticker', small: true, onClick: () => decorateLetter(l) }),
          ui.button({ label: 'Leer', iconName: 'book-open', variant: 'ghost', small: true, onClick: () => letterModal(l, { onShareable: false }) }),
        ] : ui.button({ label: 'Leer', iconName: 'book-open', variant: 'ghost', small: true, onClick: () => letterModal(l) }),
        ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => removeLetter(l) })) : null,
      l.kind === 'seed' && l.incomplete ? el('span', { class: 'pending' }, 'Por completar en los datos iniciales') : null);
    return el('div', { class: 'cartas-section' },
      el('div', { class: 'card note-card' },
        el('p', {}, `Escribe una carta "Ábreme cuando…" para ${partner}. Mientras es borrador solo tú la ves. Al sellarla ya no se puede editar.`),
        el('p', { class: 'muted small' }, 'El sello es simbólico: guarda la sorpresa, pero la carta no queda cifrada.'),
        ui.button({ label: 'Escribir una carta', iconName: 'pencil', variant: 'primary', small: true, onClick: () => openEditor() })),
      own.length ? [el('h2', { class: 'card-kicker cartas-subtitle' }, 'Tus cartas'), el('div', { class: 'own-grid' }, own.map(row))] : null,
      seeded.length ? [el('h2', { class: 'card-kicker cartas-subtitle' }, 'Las que le escribiste'),
        el('p', { class: 'muted small' }, `Vinieron en los datos iniciales. Aquí ves si ${partner} ya las abrió en este teléfono.`),
        el('div', { class: 'own-grid' }, seeded.map(row))] : null);
  }

  function draw() {
    const me = profile.active();
    const toOpen = letters.filter((l) => l.to === me && l.status === 'sealed' && !l.incomplete && l.body).length;
    const tabs = ui.segmented({
      label: 'Cartas', value: tab,
      options: [{ value: 'mine', label: toOpen ? `Para ti (${toOpen})` : 'Para ti' }, { value: 'write', label: 'Escribimos' }],
      onChange: (v) => { tab = v; saveTab(v); draw(); },
    });
    body.replaceChildren(tabs, tab === 'mine' ? forMe() : writing());
    if (justOpened) { body.querySelector(`.futo[data-id="${CSS.escape(justOpened)}"]`)?.classList.add('just-opened'); justOpened = null; }
  }

  try { await load(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las cartas', text: 'Cierra y vuelve a abrir la app; tus datos siguen en el teléfono.', art: 'wave' }));
    return page;
  }
  // A link to one letter (#/cartas/:id) opens it on top of the list.
  const linked = ctx.params?.a ? letters.find((l) => l.id === ctx.params.a && l.to === profile.active() && l.status !== 'draft') : null;
  if (linked) { tab = 'mine'; }
  draw();
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
        if (rec) { tab = 'write'; saveTab(tab); await load(); draw(); ui.toast('Úsala con "Decorar sobre" en un borrador.'); }
      } catch (e) { console.error(e); ui.toast('No pudimos abrir la imagen compartida.', { tone: 'error' }); }
    });
  }
  const offProfile = profile.onProfileChange(async () => { await load(); draw(); });
  return { node: page, cleanup: offProfile };
}
