// Estampillas para el sobre de las cartas (decidido 2026-11-19, opción A): un set propio dibujado
// que quien escribe pone donde quiera en su borrador; se mueven, giran y cambian de tamaño.
// Each sticker on a letter is stored as { k, x, y, r, s }: kind, center as a fraction of the
// envelope (0..1), rotation in degrees and scale. Plain data, so it syncs and backs up with the letter.
// Own stickers (opción B, 2026-11-19) live in the shared album ("lists" records of kind "sticker",
// each with its image in "media") and are referenced as k = "c:<record id>".
import { ui, util, db } from '../core.js';

const { el, icon } = util;
const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_STICKERS = 8;
const MIN_S = 0.6;
const MAX_S = 1.8;

// 64×64 drawings. No ids inside (several copies live in the page at once).
const SET = [
  { k: 'sakura', name: 'Flor de sakura', svg: `${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a} 32 32)" d="M32 32 C24 24 21 13 26 6 L32 10 L38 6 C43 13 40 24 32 32Z" fill="#F4A7B9" stroke="#D9708D" stroke-width="1.5" stroke-linejoin="round"/>`).join('')}<circle cx="32" cy="32" r="4.5" fill="#F7D57A"/>` },
  { k: 'corazon', name: 'Corazón', svg: '<path d="M32 54C10 40 6 24 16 16C23 10 30 14 32 20C34 14 41 10 48 16C58 24 54 40 32 54Z" fill="#E05A7A" stroke="#B8395A" stroke-width="1.5"/><ellipse cx="22" cy="22" rx="4" ry="2.6" transform="rotate(-35 22 22)" fill="#fff" opacity=".55"/>' },
  { k: 'milu', name: 'Gatito siamés', svg: '<path d="M14 32L15 9L29 21Z" fill="#5A4034"/><path d="M50 32L49 9L35 21Z" fill="#5A4034"/><path d="M17 27L18 15L25 21Z" fill="#E8A0A8"/><path d="M47 27L46 15L39 21Z" fill="#E8A0A8"/><ellipse cx="32" cy="36" rx="20" ry="17" fill="#F3E6D3" stroke="#C9B49A" stroke-width="1"/><ellipse cx="32" cy="43" rx="10" ry="8.5" fill="#6B4A3A" opacity=".85"/><circle cx="24.5" cy="33" r="3.4" fill="#5DA9E9"/><circle cx="39.5" cy="33" r="3.4" fill="#5DA9E9"/><ellipse cx="24.5" cy="33" rx="1.1" ry="2.5" fill="#1F2A44"/><ellipse cx="39.5" cy="33" rx="1.1" ry="2.5" fill="#1F2A44"/><path d="M29.5 40.5H34.5L32 43Z" fill="#E8A0A8"/><path d="M32 43V45M32 45Q30 47 28.5 46M32 45Q34 47 35.5 46" stroke="#F3E6D3" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M10 40L20 41M10 45L20 43M54 40L44 41M54 45L44 43" stroke="#C9B49A" stroke-width="1" stroke-linecap="round"/>' },
  { k: 'fuji', name: 'Estampilla del monte Fuji', svg: '<rect x="8" y="6" width="48" height="52" fill="#fff" stroke="#fff" stroke-width="5" stroke-dasharray="0 6" stroke-linecap="round"/><rect x="8" y="6" width="48" height="52" fill="#fff" stroke="#E2D6D6" stroke-width=".8"/><rect x="12" y="10" width="40" height="44" fill="#CFE7F5"/><circle cx="43" cy="18" r="4" fill="#E05A7A"/><path d="M12 48L27 27Q32 24 37 27L52 48Z" fill="#5B7FB0"/><path d="M27 27Q32 24 37 27L41 33L37.5 31L34.5 34L31.5 31L28 34L23 33Z" fill="#fff"/><rect x="12" y="47" width="40" height="7" fill="#F4A7B9"/>' },
  { k: 'matcha', name: 'Té matcha', svg: '<path d="M26 22C23 18 29 15 26 10M37 22C34 18 40 15 37 10" stroke="#C9B8B8" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M11 30H53C53 44 45 52 32 52C19 52 11 44 11 30Z" fill="#7A9A5B" stroke="#5E7A45" stroke-width="1.2"/><ellipse cx="32" cy="30" rx="21" ry="4.5" fill="#A9C77E" stroke="#5E7A45" stroke-width="1.2"/><rect x="24" y="51" width="16" height="4" rx="1.5" fill="#5E7A45"/><path d="M20 40Q32 46 44 40" stroke="#C7DBA6" stroke-width="1.5" fill="none" stroke-linecap="round"/>' },
  { k: 'onigiri', name: 'Onigiri', svg: '<path d="M32 8C36 8 56 40 54 46C52 52 12 52 10 46C8 40 28 8 32 8Z" fill="#fff" stroke="#D9CBCB" stroke-width="1.5"/><rect x="22" y="37" width="20" height="16" rx="2" fill="#2F3B33"/><circle cx="27" cy="30" r="1.6" fill="#2F3B33"/><circle cx="37" cy="30" r="1.6" fill="#2F3B33"/><path d="M30 33Q32 35 34 33" stroke="#2F3B33" stroke-width="1.3" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="33" rx="2.4" ry="1.4" fill="#F4A7B9"/><ellipse cx="40" cy="33" rx="2.4" ry="1.4" fill="#F4A7B9"/>' },
  { k: 'daruma', name: 'Daruma', svg: '<ellipse cx="32" cy="36" rx="19" ry="21" fill="#D7263D" stroke="#A81B2E" stroke-width="1.2"/><ellipse cx="32" cy="30" rx="11.5" ry="10" fill="#FCEBD8"/><circle cx="27" cy="30" r="3" fill="#fff" stroke="#222" stroke-width=".8"/><circle cx="37" cy="30" r="3" fill="#fff" stroke="#222" stroke-width=".8"/><circle cx="27" cy="30" r="1.4" fill="#222"/><path d="M22.5 25Q26.5 21.5 30 24.5M34 24.5Q37.5 21.5 41.5 25" stroke="#222" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M29 36Q32 37.5 35 36" stroke="#222" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M23 47Q32 53 41 47" stroke="#F2C14E" stroke-width="2.6" fill="none" stroke-linecap="round"/>' },
  { k: 'luna', name: 'Luna y estrellas', svg: '<path d="M27.95 14.11A20 20 0 1 0 49.09 39.95A17 17 0 0 1 27.95 14.11Z" fill="#F7D57A" stroke="#D9A93E" stroke-width="1.2" stroke-linejoin="round"/><path d="M48 8L49.4 12.6L54 14L49.4 15.4L48 20L46.6 15.4L42 14L46.6 12.6Z" fill="#F2B8C2"/><path d="M55 26L55.8 28.2L58 29L55.8 29.8L55 32L54.2 29.8L52 29L54.2 28.2Z" fill="#F2B8C2"/>' },
  { k: 'torii', name: 'Torii', svg: '<rect x="17" y="18" width="5" height="38" fill="#D7263D"/><rect x="42" y="18" width="5" height="38" fill="#D7263D"/><path d="M6 13Q32 20 58 13L57 18.5Q32 24.5 7 18.5Z" fill="#2E2A2B"/><rect x="10" y="20" width="44" height="4" fill="#D7263D"/><rect x="11" y="29" width="42" height="4" fill="#D7263D"/><rect x="30" y="24" width="4" height="5" fill="#D7263D"/><rect x="15" y="54" width="9" height="3" fill="#2E2A2B"/><rect x="40" y="54" width="9" height="3" fill="#2E2A2B"/>' },
  { k: 'koi', name: 'Pez koi', svg: '<path d="M44 32L57 21Q52 32 57 43Z" fill="#F08A3C" stroke="#C9672A" stroke-width="1"/><path d="M26 23L32 16L35 24Z" fill="#F08A3C"/><path d="M8 32C16 20 38 20 46 32C38 44 16 44 8 32Z" fill="#fff" stroke="#D9CBCB" stroke-width="1.2"/><ellipse cx="22" cy="28.5" rx="6" ry="3.6" fill="#F08A3C"/><ellipse cx="35" cy="35" rx="5" ry="3" fill="#F08A3C"/><ellipse cx="38" cy="27" rx="2.6" ry="1.8" fill="#2F3B33"/><circle cx="13.5" cy="30.5" r="1.5" fill="#333"/><path d="M24 40L28 46L30 40Z" fill="#F08A3C" opacity=".85"/>' },
  { k: 'grulla', name: 'Grulla de papel', svg: '<path d="M32 34L7 13L26 41Z" fill="#F4A7B9" stroke="#D9708D" stroke-width=".8" stroke-linejoin="round"/><path d="M32 34L53 7L38 41Z" fill="#E58AA3" stroke="#C9637F" stroke-width=".8" stroke-linejoin="round"/><path d="M13 41L32 33L51 41L32 47Z" fill="#F7C6D2" stroke="#D9708D" stroke-width=".8" stroke-linejoin="round"/><path d="M13 41L8 27L11 26.5L18 39Z" fill="#F4A7B9" stroke="#D9708D" stroke-width=".8" stroke-linejoin="round"/><path d="M8 27L4 31L11 28.5Z" fill="#E58AA3"/><path d="M51 41L59 29L55 42Z" fill="#E58AA3" stroke="#C9637F" stroke-width=".8" stroke-linejoin="round"/>' },
  { k: 'matasellos', name: 'Matasellos con corazón', svg: '<path d="M2 24Q6 21 10 24T18 24M2 32Q6 29 10 32T18 32M2 40Q6 37 10 40T18 40" stroke="#8C5A7A" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".8"/><circle cx="38" cy="32" r="20" fill="none" stroke="#8C5A7A" stroke-width="2.2" opacity=".85"/><circle cx="38" cy="32" r="15" fill="none" stroke="#8C5A7A" stroke-width="1" opacity=".85" stroke-dasharray="2 2.5"/><path d="M38 41C30 36 29 30 32.5 27.5C35 25.8 37.3 27 38 29C38.7 27 41 25.8 43.5 27.5C47 30 46 36 38 41Z" fill="#8C5A7A" opacity=".9"/>' },
];
const byKind = new Map(SET.map((s) => [s.k, s]));

const SLOTS = [[0.88, 0.34], [0.12, 0.7], [0.88, 0.72], [0.72, 0.26], [0.28, 0.74], [0.14, 0.38], [0.7, 0.76], [0.3, 0.3]];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

const CUSTOM = /^c:[0-9a-f-]{8,40}$/;
const isCustom = (k) => CUSTOM.test(k);

// Own stickers: record id -> { id, name, url }. Object URLs stay alive while the app runs (few, small).
const album = new Map();
const urls = new Map(); // mediaId -> object URL
/** Loads the shared album (newest last). Call before drawing envelopes that may use own stickers. */
export async function loadAlbum() {
  const recs = (await db.query('lists', { index: 'kind', range: IDBKeyRange.only('sticker') })).filter((r) => !r.deleted && r.mediaId)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  album.clear();
  for (const r of recs) {
    let url = urls.get(r.mediaId);
    if (!url) { const blob = await db.getMedia(r.mediaId).catch(() => null); if (!blob) continue; url = URL.createObjectURL(blob); urls.set(r.mediaId, url); }
    album.set(`c:${r.id}`, { id: r.id, k: `c:${r.id}`, name: r.name || 'Estampilla propia', url });
  }
  return [...album.values()];
}
const known = (k) => byKind.has(k) || album.has(k);

/** The drawn set (k, name), for other screens that use the same stickers (Photobooth). */
export const builtIn = () => SET.map(({ k, name }) => ({ k, name }));
/** Source string of a drawn sticker as a standalone SVG (for <img> and canvas), or the own sticker URL. */
export function imageSrc(k) {
  if (isCustom(k)) return album.get(k)?.url || '';
  const d = byKind.get(k);
  return d ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${d.svg}</svg>`)}` : '';
}

/** Keep only well-formed stickers of known kinds (data may come from a backup or another phone). */
export function clean(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => s && (byKind.has(s.k) || isCustom(s.k))).slice(0, MAX_STICKERS).map((s) => ({
    k: s.k, x: round(clamp(+s.x || 0.5, 0, 1)), y: round(clamp(+s.y || 0.5, 0, 1)), r: Math.round(clamp(+s.r || 0, -180, 180)), s: round(clamp(+s.s || 1, MIN_S, MAX_S), 2),
  }));
}

export function art(kind, size = 46) {
  if (isCustom(kind)) return el('img', { src: album.get(kind)?.url || '', alt: '', width: size, height: size, draggable: 'false', decoding: 'async' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = byKind.get(kind)?.svg || '';
  return svg;
}

const place = (node, s) => {
  node.style.left = `${s.x * 100}%`;
  node.style.top = `${s.y * 100}%`;
  node.style.setProperty('--r', `${s.r}deg`);
  node.style.setProperty('--s', s.s);
};

/** The decoration layer drawn on an envelope (list, opening animation and editor preview). */
export function layer(list, { tag = 'span' } = {}) {
  const items = clean(list);
  if (!items.length) return null;
  const wrap = el(tag, { class: 'futo-stickers', 'aria-hidden': 'true' });
  for (const s of items) { if (!known(s.k)) continue; const n = el(tag, { class: 'sticker' }, art(s.k)); place(n, s); wrap.append(n); }
  return wrap;
}

/**
 * Decorate the envelope of a draft. `face` builds the envelope front (from cartas.js) so the preview
 * looks exactly like the envelope in the list. Resolves with the new list, or null when cancelled.
 */
export async function decorate({ letter, face }) {
  let list = clean(letter.stickers);
  let sel = list.length ? list.length - 1 : -1;
  const board = el('div', { class: 'futo sticker-board' }, face());
  const pieces = el('div', { class: 'futo-stickers is-editing' });
  board.append(pieces);
  const live = el('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const count = el('p', { class: 'muted small sticker-count' });
  const tools = el('div', { class: 'sticker-tools', role: 'toolbar', 'aria-label': 'Estampilla elegida' });

  const nameOf = (s) => byKind.get(s.k)?.name || album.get(s.k)?.name || 'Estampilla';
  await loadAlbum().catch((e) => console.error(e));
  list = list.filter((s) => known(s.k));
  sel = list.length - 1;
  const update = (fn, msg) => { if (sel < 0) return; fn(list[sel]); list[sel] = clean([list[sel]])[0]; paint(); if (msg) live.textContent = msg; };
  const toolBtn = (label, iconName, fn) => el('button', { class: 'icon-btn sticker-tool', type: 'button', 'aria-label': label, title: label, onClick: fn }, icon(iconName, { size: 20 }));
  tools.append(
    toolBtn('Girar a la izquierda', 'rotate-ccw', () => update((s) => { s.r -= 15; })),
    toolBtn('Girar a la derecha', 'rotate-cw', () => update((s) => { s.r += 15; })),
    toolBtn('Más pequeña', 'minus', () => update((s) => { s.s -= 0.15; })),
    toolBtn('Más grande', 'plus', () => update((s) => { s.s += 0.15; })),
    toolBtn('Quitar', 'trash-2', () => { if (sel < 0) return; const gone = nameOf(list[sel]); list.splice(sel, 1); sel = list.length - 1; paint(); live.textContent = `${gone} quitada.`; }),
  );

  function paint() {
    pieces.replaceChildren(...list.map((s, i) => {
      const n = el('button', {
        class: `sticker${i === sel ? ' is-selected' : ''}`, type: 'button',
        'aria-label': `${nameOf(s)}. Muévela con las flechas`, 'aria-pressed': String(i === sel),
      }, art(s.k));
      place(n, s);
      bindDrag(n, i);
      n.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.08 : 0.02;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) { e.preventDefault(); sel = i; update((s2) => { s2.x += d[0]; s2.y += d[1]; }); pieces.children[i]?.focus(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); sel = i; tools.lastChild.click(); }
      });
      return n;
    }));
    tools.hidden = sel < 0;
    count.textContent = list.length ? `${list.length} de ${MAX_STICKERS} estampillas. Arrástralas a donde quieras.` : 'Toca una estampilla para ponerla en el sobre.';
  }

  function bindDrag(n, i) {
    let start = null;
    n.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      sel = i;
      const r = board.getBoundingClientRect();
      start = { id: e.pointerId, px: e.clientX, py: e.clientY, x: list[i].x, y: list[i].y, w: r.width, h: r.height, moved: false };
      n.setPointerCapture(e.pointerId);
      for (const c of pieces.children) { c.classList.toggle('is-selected', c === n); c.setAttribute('aria-pressed', String(c === n)); }
      tools.hidden = false;
    });
    n.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = (e.clientX - start.px) / start.w; const dy = (e.clientY - start.py) / start.h;
      if (Math.abs(e.clientX - start.px) + Math.abs(e.clientY - start.py) > 3) start.moved = true;
      list[i].x = clamp(start.x + dx, 0, 1); list[i].y = clamp(start.y + dy, 0, 1);
      place(n, list[i]);
    });
    const end = (e) => { if (!start || e.pointerId !== start.id) return; start = null; list = clean(list); paint(); pieces.children[i]?.focus({ preventScroll: true }); };
    n.addEventListener('pointerup', end);
    n.addEventListener('pointercancel', end);
  }

  const put = (k, name) => {
    if (list.length >= MAX_STICKERS) { ui.toast(`Caben hasta ${MAX_STICKERS} estampillas por sobre.`); return; }
    // New stickers land around the edges, away from the seal and the label; then they move freely.
    const n = list.length;
    const [x, y] = SLOTS[n % SLOTS.length];
    list.push({ k, x, y, r: ((n * 37) % 30) - 15, s: 1 });
    sel = list.length - 1; paint(); live.textContent = `${name} puesta en el sobre.`;
  };
  const pick = (s) => el('button', { class: 'sticker-pick', type: 'button', 'aria-label': `Poner: ${s.name}`, title: s.name, onClick: () => put(s.k, s.name) }, art(s.k, 40));

  // ---- Own stickers: create from a photo or a sticker, paste, delete ----
  let removing = false;
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `sk-${util.uuid().slice(0, 8)}` });
  const create = async (file) => {
    if (!file || !/^image\//.test(file.type || 'image/')) return;
    const { makeSticker } = await import('./sticker-maker.js');
    const rec = await makeSticker(file);
    if (!rec) return;
    await loadAlbum(); drawOwn();
    put(`c:${rec.id}`, rec.name);
  };
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; create(f); });
  const removeOwn = async (s) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar esta estampilla?', message: `“${s.name}” sale del álbum de los dos y de los sobres donde esté puesta. No se puede deshacer.`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    await db.purge('lists', s.id);
    list = list.filter((x) => x.k !== s.k); sel = list.length - 1;
    await loadAlbum(); drawOwn(); paint();
    ui.toast('Estampilla borrada.');
  };
  const ownGrid = el('div', { class: 'sticker-tray', role: 'group', 'aria-label': 'Tus estampillas' });
  const editBtn = el('button', { class: 'btn btn-ghost btn-small sticker-edit', type: 'button', 'aria-pressed': 'false', onClick: () => { removing = !removing; drawOwn(); } }, 'Editar');
  function drawOwn() {
    const own = [...album.values()];
    if (!own.length) removing = false;
    editBtn.hidden = !own.length;
    editBtn.textContent = removing ? 'Listo' : 'Editar';
    editBtn.setAttribute('aria-pressed', String(removing));
    ownGrid.replaceChildren(...[
      removing ? null : el('label', { class: 'sticker-pick sticker-new', for: fileInput.id, title: 'Crear una estampilla' }, icon('image-plus', { size: 24 }), el('span', {}, 'Crear')),
      ...own.map((s) => (removing
        ? el('button', { class: 'sticker-pick is-removing', type: 'button', 'aria-label': `Borrar del álbum: ${s.name}`, onClick: () => removeOwn(s) }, art(s.k, 40), el('span', { class: 'sticker-x', 'aria-hidden': 'true' }, icon('x', { size: 14 })))
        : pick(s))),
      fileInput].filter(Boolean));
  }
  drawOwn();
  // Paste an image (PC) or insert a sticker from the phone keyboard into this box.
  const pasteBox = el('div', {
    class: 'sticker-paste', contenteditable: 'true', role: 'textbox', 'aria-label': 'Pega aquí una imagen o un sticker del teclado', 'data-placeholder': 'Pega aquí una imagen o un sticker del teclado',
  });
  const fromTransfer = (dt) => [...(dt?.files || [])].find((f) => /^image\//.test(f.type)) || [...(dt?.items || [])].find((i) => i.kind === 'file' && /^image\//.test(i.type))?.getAsFile();
  const onPaste = (e) => { if (document.querySelector('.sticker-maker')) return; const f = fromTransfer(e.clipboardData); if (f) { e.preventDefault(); pasteBox.textContent = ''; create(f); } };
  pasteBox.addEventListener('beforeinput', (e) => { const f = fromTransfer(e.dataTransfer); if (f) { e.preventDefault(); create(f); } else if (e.inputType !== 'insertFromPaste') e.preventDefault(); });
  pasteBox.addEventListener('input', async () => {
    // Some keyboards insert the sticker as an <img>; take its picture and empty the box.
    const img = pasteBox.querySelector('img'); pasteBox.textContent = '';
    if (img?.src) { try { const b = await (await fetch(img.src)).blob(); create(new File([b], 'sticker', { type: b.type || 'image/png' })); } catch { ui.toast('No pudimos leer ese sticker. Guárdalo como imagen y elígelo con "Crear".'); } }
  });
  document.addEventListener('paste', onPaste);

  const tray = el('div', { class: 'sticker-trays' },
    el('div', { class: 'sticker-tray-head' }, el('h3', { class: 'card-kicker' }, 'Tus estampillas'), editBtn),
    ownGrid,
    pasteBox,
    el('h3', { class: 'card-kicker' }, 'Del set'),
    el('div', { class: 'sticker-tray', role: 'group', 'aria-label': 'Estampillas del set' }, SET.map(pick)));

  paint();
  const m = ui.openModal({
    title: 'Decorar el sobre', kind: 'sheet', size: 'lg', className: 'sticker-editor',
    body: el('div', { class: 'sticker-body' },
      el('p', { class: 'muted small' }, 'Pon estampillas por fuera de la carta. Solo se ven en el sobre; la carta no cambia.'),
      board, tools, count, tray, live),
    actions: [{ label: 'Cancelar', variant: 'ghost', value: null }, { label: 'Guardar el sobre', variant: 'primary', value: 'save' }],
  });
  const v = await m.result;
  document.removeEventListener('paste', onPaste);
  return v === 'save' ? clean(list) : null;
}

/**
 * "Estampillas" tab of Cartas (decided 2026-11-20): the shared album always in view.
 * Create own stickers (photo, sticker or paste), delete them, and see the drawn set.
 * `onUse` takes the person to "Escribimos" to decorate an envelope.
 */
export async function albumView({ onUse } = {}) {
  await loadAlbum().catch((e) => console.error(e));
  let removing = false;
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `ska-${util.uuid().slice(0, 8)}` });
  const ownGrid = el('div', { class: 'sticker-tray', role: 'group', 'aria-label': 'Sus estampillas' });
  const editBtn = el('button', { class: 'btn btn-ghost btn-small sticker-edit', type: 'button', 'aria-pressed': 'false', onClick: () => { removing = !removing; drawOwn(); } }, 'Editar');
  const shown = (s) => el('span', { class: 'sticker-pick is-static', role: 'img', 'aria-label': s.name, title: s.name }, art(s.k, 40));
  const create = async (file) => {
    if (!file || !/^image\//.test(file.type || 'image/')) return;
    const { makeSticker } = await import('./sticker-maker.js');
    const rec = await makeSticker(file);
    if (rec) { await loadAlbum(); drawOwn(); }
  };
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; create(f); });
  const removeOwn = async (s) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar esta estampilla?', message: `“${s.name}” sale del álbum de los dos y de los sobres donde esté puesta. No se puede deshacer.`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    await db.purge('lists', s.id);
    await loadAlbum(); drawOwn();
    ui.toast('Estampilla borrada.');
  };
  function drawOwn() {
    const own = [...album.values()];
    if (!own.length) removing = false;
    editBtn.hidden = !own.length;
    editBtn.textContent = removing ? 'Listo' : 'Editar';
    editBtn.setAttribute('aria-pressed', String(removing));
    ownGrid.replaceChildren(...[
      removing ? null : el('label', { class: 'sticker-pick sticker-new', for: fileInput.id, title: 'Crear una estampilla' }, icon('image-plus', { size: 24 }), el('span', {}, 'Crear')),
      ...own.map((s) => (removing
        ? el('button', { class: 'sticker-pick is-removing', type: 'button', 'aria-label': `Borrar del álbum: ${s.name}`, onClick: () => removeOwn(s) }, art(s.k, 40), el('span', { class: 'sticker-x', 'aria-hidden': 'true' }, icon('x', { size: 14 })))
        : shown(s))),
      fileInput].filter(Boolean));
  }
  drawOwn();
  // Paste an image (PC) or a sticker from the phone keyboard.
  const pasteBox = el('div', {
    class: 'sticker-paste', contenteditable: 'true', role: 'textbox', 'aria-label': 'Pega aquí una imagen o un sticker del teclado', 'data-placeholder': 'Pega aquí una imagen o un sticker del teclado',
  });
  const fromTransfer = (dt) => [...(dt?.files || [])].find((f) => /^image\//.test(f.type)) || [...(dt?.items || [])].find((i) => i.kind === 'file' && /^image\//.test(i.type))?.getAsFile();
  pasteBox.addEventListener('paste', (e) => { const f = fromTransfer(e.clipboardData); if (f) { e.preventDefault(); pasteBox.textContent = ''; create(f); } });
  pasteBox.addEventListener('beforeinput', (e) => { const f = fromTransfer(e.dataTransfer); if (f) { e.preventDefault(); create(f); } else if (e.inputType !== 'insertFromPaste') e.preventDefault(); });
  pasteBox.addEventListener('input', async () => {
    const img = pasteBox.querySelector('img'); pasteBox.textContent = '';
    if (img?.src) { try { const b = await (await fetch(img.src)).blob(); create(new File([b], 'sticker', { type: b.type || 'image/png' })); } catch { ui.toast('No pudimos leer ese sticker. Guárdalo como imagen y elígelo con "Crear".'); } }
  });
  return el('div', { class: 'cartas-section sticker-album' },
    el('div', { class: 'card sticker-howto' },
      el('p', { class: 'sticker-howto-text' }, 'Decoren el sobre de sus cartas. Las que crean aquí quedan en el álbum de los dos.'),
      onUse ? ui.button({ label: 'Decorar un sobre', iconName: 'sticker', small: true, onClick: onUse }) : null),
    el('div', { class: 'card sticker-trays' },
      el('div', { class: 'sticker-tray-head' }, el('h2', { class: 'card-kicker' }, 'Sus estampillas'), editBtn),
      ownGrid, pasteBox),
    el('div', { class: 'card sticker-trays' },
      el('h2', { class: 'card-kicker' }, 'Del set'),
      el('div', { class: 'sticker-tray', role: 'group', 'aria-label': 'Estampillas del set' }, SET.map(shown))));
}
