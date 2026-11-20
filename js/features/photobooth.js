// Photobooth (docs/05 Más §16): pick or take photos (file input with capture, no getUserMedia),
// put them in a frame (purikura strip, polaroid or washi), add stickers and a short line,
// and save the result as a PNG. Everything is drawn on a canvas inside the phone, at a
// controlled size. Saved pictures are shared (content kind 'purikura') and show in the Galería;
// each can be downloaded or added to the Cápsula as a memory.
import { ui, util, db, profile } from '../core.js';
import { isQuotaError } from '../core/images.js';
import { openViewer } from '../core/viewer.js';
import * as stickers from './stickers.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const MAX_PHOTO = 1600; // longest side read from a photo before it is drawn
export const LAYOUTS = [
  { value: 'tira3', label: 'Tira de 3', n: 3 },
  { value: 'tira4', label: 'Tira de 4', n: 4 },
  { value: 'polaroid', label: 'Polaroid', n: 1 },
  { value: 'washi', label: 'Washi', n: 1 },
];
export const FRAMES = [
  { value: 'sakura', label: 'Sakura', bg: '#F9D3DD', ink: '#8E2D46', accent: '#C2405F' },
  { value: 'washi', label: 'Papel', bg: '#FFFDF9', ink: '#4A3A3E', accent: '#C9A46A' },
  { value: 'noche', label: 'Noche', bg: '#201B1E', ink: '#F5EEF1', accent: '#E893AE' },
];
// Extra stickers only for the photobooth (docs/05: faroles y el kanji 愛 como sello).
const EXTRA = [
  { k: 'farol', name: 'Farol', svg: '<path d="M32 4v6" stroke="#2E2A2B" stroke-width="2"/><rect x="24" y="9" width="16" height="5" rx="1.5" fill="#2E2A2B"/><rect x="24" y="50" width="16" height="5" rx="1.5" fill="#2E2A2B"/><ellipse cx="32" cy="32" rx="17" ry="20" fill="#E0483E" stroke="#B5332B" stroke-width="1.2"/><path d="M15.5 26h33M15 32h34M15.5 38h33" stroke="#B5332B" stroke-width="1.2"/><ellipse cx="26" cy="27" rx="4" ry="7" fill="#fff" opacity=".18"/><path d="M32 55v5M29 60h6" stroke="#2E2A2B" stroke-width="2" stroke-linecap="round"/>' },
  { k: 'sello', name: 'Sello de amor', svg: '<rect x="8" y="8" width="48" height="48" rx="8" fill="#C2405F"/><rect x="12" y="12" width="40" height="40" rx="5" fill="none" stroke="#FFF4F6" stroke-width="2"/><text x="32" y="43" text-anchor="middle" font-family="Shippori Mincho, serif" font-size="30" font-weight="700" fill="#FFF4F6">愛</text>' },
];
const extraSrc = (d) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256">${d.svg}</svg>`)}`;
const srcOf = (k) => { const x = EXTRA.find((e) => e.k === k); return x ? extraSrc(x) : stickers.imageSrc(k); };

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function readPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => loadImg(URL.createObjectURL(file)));
  const k = Math.min(1, MAX_PHOTO / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/** Cells (photo boxes) and canvas size for a layout. All sizes in output pixels. */
export function geometry(layout, caption = false) {
  if (layout === 'polaroid') return { w: 800, h: 980, cells: [{ x: 50, y: 50, w: 700, h: 700 }], text: { x: 400, y: 860 } };
  if (layout === 'washi') return { w: 960, h: 960 + (caption ? 90 : 0), cells: [{ x: 90, y: 90, w: 780, h: 780 }], text: { x: 480, y: 960 } };
  const n = layout === 'tira4' ? 4 : 3;
  const cw = 560; const ch = 420; const pad = 30; const foot = 120;
  return { w: cw + pad * 2, h: pad + n * (ch + pad) + foot, cells: Array.from({ length: n }, (_, i) => ({ x: pad, y: pad + i * (ch + pad), w: cw, h: ch })), text: { x: (cw + pad * 2) / 2, y: pad + n * (ch + pad) + 60 } };
}

function cover(ctx, img, c) {
  const k = Math.max(c.w / img.width, c.h / img.height);
  const w = img.width * k; const h = img.height * k;
  ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
  ctx.drawImage(img, c.x + (c.w - w) / 2, c.y + (c.h - h) / 2, w, h);
  ctx.restore();
}

/** Draw the whole picture. state: { layout, frame, photos[], items[{k,x,y,s,r}], caption }. */
export async function draw(canvas, state, imgCache = new Map()) {
  const g = geometry(state.layout, !!state.caption);
  const f = FRAMES.find((x) => x.value === state.frame) || FRAMES[0];
  canvas.width = g.w; canvas.height = g.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = f.bg; ctx.fillRect(0, 0, g.w, g.h);
  if (state.layout === 'washi') {
    // Washi tape corners and a thin inner line.
    ctx.strokeStyle = f.accent; ctx.lineWidth = 3; ctx.strokeRect(60, 60, g.w - 120, 840);
    ctx.fillStyle = f.accent; ctx.globalAlpha = 0.55;
    for (const [x, y, r] of [[90, 90, -0.6], [g.w - 90, 90, 0.6], [90, 870, 0.6], [g.w - 90, 870, -0.6]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.fillRect(-70, -18, 140, 36); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
  g.cells.forEach((c, i) => {
    const p = state.photos[i];
    if (p) cover(ctx, p, c);
    else { ctx.fillStyle = f.value === 'noche' ? '#2A2327' : '#F1E4E6'; ctx.fillRect(c.x, c.y, c.w, c.h); ctx.fillStyle = f.ink; ctx.globalAlpha = 0.5; ctx.font = '600 34px "Zen Maru Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`Foto ${i + 1}`, c.x + c.w / 2, c.y + c.h / 2 + 12); ctx.globalAlpha = 1; }
  });
  if (state.layout.startsWith('tira')) {
    ctx.fillStyle = f.accent; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(g.w / 2 - 80 + i * 40, g.h - 22, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  if (state.caption) {
    ctx.fillStyle = f.ink; ctx.textAlign = 'center';
    ctx.font = `700 ${state.layout === 'polaroid' ? 46 : 40}px "Shippori Mincho", serif`;
    ctx.fillText(state.caption, g.text.x, g.text.y, g.w - 80);
  }
  for (const it of state.items) {
    let img = imgCache.get(it.k);
    if (!img) { try { img = await loadImg(srcOf(it.k)); imgCache.set(it.k, img); } catch { continue; } }
    const size = 150 * it.s;
    ctx.save(); ctx.translate(it.x * g.w, it.y * g.h); ctx.rotate((it.r * Math.PI) / 180);
    ctx.drawImage(img, -size / 2, -size / 2, size, size); ctx.restore();
  }
  return g;
}

const toBlob = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));

async function addToCapsule(rec) {
  const blob = await db.getMedia(rec.mediaId);
  if (!blob) throw new Error('missing');
  const id = util.uuid();
  const mediaId = await db.putMedia(blob, { ownerStore: 'memories', ownerId: id, width: rec.width, height: rec.height });
  await db.put('memories', { id, title: rec.caption || 'Photobooth', date: rec.date, note: '', mediaIds: [mediaId], visibility: 'shared', owner: 'both', by: profile.active() });
  return id;
}

function studio({ onSaved }) {
  const state = { layout: 'tira3', frame: 'sakura', photos: [], items: [], caption: '' };
  let sel = -1; let busy = false;
  const cache = new Map();
  const canvas = el('canvas', { class: 'booth-canvas', role: 'img', 'aria-label': 'Vista previa de la foto' });
  const slots = el('div', { class: 'booth-slots' });
  const pickId = `bp-${util.uuid().slice(0, 8)}`;
  let target = 0;
  const pick = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: pickId });
  const cam = el('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'sr-only', id: `${pickId}-c` });
  const selBar = el('div', { class: 'booth-selbar', hidden: true });
  const repaint = util.debounce(() => draw(canvas, state, cache), 30);
  const n = () => LAYOUTS.find((l) => l.value === state.layout).n;
  const paintSlots = () => {
    slots.replaceChildren(...Array.from({ length: n() }, (_, i) => el('div', { class: 'booth-slot' },
      el('span', { class: 'small' }, `Foto ${i + 1}${state.photos[i] ? ' ✓' : ''}`),
      el('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => { target = i; pick.click(); } }, icon('image', { size: 18 }), 'Elegir'),
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { target = i; cam.click(); } }, icon('camera', { size: 18 }), 'Tomar'))));
  };
  const onFile = async (inp) => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    busy = true;
    try { state.photos[target] = await readPhoto(f); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paintSlots(); repaint();
  };
  pick.addEventListener('change', () => onFile(pick));
  cam.addEventListener('change', () => onFile(cam));
  const paintSel = () => {
    selBar.hidden = sel < 0;
    if (sel < 0) return;
    const it = state.items[sel];
    const nm = [...stickers.builtIn(), ...EXTRA].find((s) => s.k === it.k)?.name || 'Estampilla';
    selBar.replaceChildren(el('span', { class: 'small' }, nm),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Más pequeña', onClick: () => { it.s = Math.max(0.5, +(it.s - 0.15).toFixed(2)); repaint(); } }, icon('minus', { size: 18 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Más grande', onClick: () => { it.s = Math.min(2.5, +(it.s + 0.15).toFixed(2)); repaint(); } }, icon('plus', { size: 18 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Girar', onClick: () => { it.r = (it.r + 15) % 360; repaint(); } }, icon('rotate-cw', { size: 18 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Quitar la estampilla', onClick: () => { state.items.splice(sel, 1); sel = -1; paintSel(); repaint(); } }, icon('trash-2', { size: 18 })));
  };
  // Drag stickers on the preview (pointer) or move the selected one with the arrow keys.
  const toLocal = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r }; };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = toLocal(e);
    const g = geometry(state.layout, !!state.caption);
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i]; const half = (75 * it.s) / g.w;
      if (Math.abs(p.x - it.x) < half && Math.abs(p.y - it.y) < half * (g.w / g.h)) { sel = i; drag = { dx: p.x - it.x, dy: p.y - it.y }; canvas.setPointerCapture(e.pointerId); paintSel(); e.preventDefault(); return; }
    }
    sel = -1; paintSel();
  });
  canvas.addEventListener('pointermove', (e) => { if (!drag || sel < 0) return; const p = toLocal(e); const it = state.items[sel]; it.x = util.clamp(p.x - drag.dx, 0, 1); it.y = util.clamp(p.y - drag.dy, 0, 1); repaint(); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (sel < 0) return;
    const step = e.shiftKey ? 0.05 : 0.01; const it = state.items[sel];
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); it.x = util.clamp(it.x + mv[0], 0, 1); it.y = util.clamp(it.y + mv[1], 0, 1); repaint(); }
  });
  const tray = el('div', { class: 'booth-tray', role: 'group', 'aria-label': 'Estampillas' });
  const paintTray = async () => {
    await stickers.loadAlbum().catch(() => []);
    const all = [...EXTRA, ...stickers.builtIn()];
    tray.replaceChildren(...all.map((s) => el('button', { class: 'booth-sticker', type: 'button', 'aria-label': `Agregar ${s.name}`, onClick: () => {
      if (state.items.length >= 12) { ui.toast('Máximo 12 estampillas.'); return; }
      state.items.push({ k: s.k, x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.5 + (Math.random() - 0.5) * 0.3, s: 1, r: Math.round((Math.random() - 0.5) * 30) });
      sel = state.items.length - 1; paintSel(); repaint();
    } }, el('img', { src: srcOf(s.k), alt: '', width: 40, height: 40 }))));
  };
  paintTray(); paintSlots(); repaint();
  const caption = ui.input({ maxlength: 40, placeholder: 'Ej.: Domingo de lluvia' });
  caption.addEventListener('input', () => { state.caption = caption.value.trim(); repaint(); });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
    if (state.photos.slice(0, n()).filter(Boolean).length < n()) { err.textContent = n() === 1 ? 'Falta la foto.' : `Faltan fotos: la tira lleva ${n()}.`; return false; }
    try {
      const out = document.createElement('canvas');
      const g = await draw(out, state, cache);
      const blob = await toBlob(out);
      const id = util.uuid();
      const mediaId = await db.putMedia(blob, { ownerStore: 'content', ownerId: id, width: g.w, height: g.h });
      const rec = { id, kind: 'purikura', mediaId, width: g.w, height: g.h, caption: state.caption, layout: state.layout, date: util.localDay(), by: profile.active(), visibility: 'shared', owner: 'both' };
      await db.put('content', rec);
      util.haptic(12);
      onSaved(rec);
      return true;
    } catch (x) { console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para guardarla.' : 'No se pudo guardar. Inténtalo de nuevo.'; return false; }
  };
  return ui.openModal({
    title: 'Nueva foto', kind: 'sheet', size: 'lg', className: 'booth-studio',
    body: el('div', { class: 'booth' },
      el('div', { class: 'booth-preview' }, canvas, selBar, el('p', { class: 'muted small' }, 'Toca una estampilla para moverla. Con teclado, usa las flechas.')),
      el('div', { class: 'booth-controls stack' },
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Marco'), ui.segmented({ label: 'Marco', value: state.layout, options: LAYOUTS.map(({ value, label }) => ({ value, label })), onChange: (v) => { state.layout = v; paintSlots(); repaint(); } })),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Color'), ui.segmented({ label: 'Color del marco', value: state.frame, options: FRAMES.map(({ value, label }) => ({ value, label })), onChange: (v) => { state.frame = v; repaint(); } })),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Fotos'), slots, pick, cam),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Estampillas'), tray),
        ui.field({ label: 'Una línea (opcional)', control: caption }),
        err)),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide photobooth' });
  const urls = new Set();
  page.append(ui.pageHeader({ title: 'Photobooth', jp: 'プリクラ', romaji: 'purikura', back: '/mas', actions: [ui.newButton('Nueva foto', () => studio({ onSaved: () => { ui.toast('Guardada. También está en la Galería.', { tone: 'success' }); load(); } }))] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(2));
  page.append(body);
  const load = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const list = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('purikura') })).filter((r) => !r.deleted).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (!list.length) { body.replaceChildren(ui.emptyState({ title: 'Su primera tira', text: 'Elijan o tomen fotos, pónganles marco y estampillas, y guárdenlas.', art: 'sakura', action: { label: 'Hacer una', onClick: () => page.querySelector('.page-new')?.click() } })); return; }
    body.replaceChildren(el('ul', { class: 'booth-list' }, list.map((r, i) => {
      const img = el('img', { alt: r.caption ? `Photobooth: ${r.caption}` : `Photobooth del ${fmtDay.format(util.parseDay(r.date))}`, decoding: 'async', loading: 'lazy', width: r.width, height: r.height });
      db.getMedia(r.mediaId).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.add(u); img.src = u; } }).catch(() => {});
      return el('li', { class: 'card paper-card booth-item' },
        el('button', { class: 'booth-open', type: 'button', 'aria-label': 'Ver en grande', onClick: () => openViewer(list.map((x) => ({ mediaId: x.mediaId, alt: x.caption || 'Photobooth', caption: x.caption || 'Photobooth', sub: fmtDay.format(util.parseDay(x.date)) })), i) }, img),
        el('p', { class: 'muted small' }, `${fmtDay.format(util.parseDay(r.date))} · ${profile.name(r.by)}`),
        el('div', { class: 'card-actions' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Descargar como PNG', onClick: async () => { const b = await db.getMedia(r.mediaId); if (!b) return; const u = URL.createObjectURL(b); const a = el('a', { href: u, download: `photobooth-${r.date}.png` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); } }, icon('download', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Agregar a la Cápsula', onClick: async () => { try { const id = await addToCapsule(r); ui.toast('Agregada a la Cápsula.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = `#/capsula/${id}`; } } }); } catch { ui.toast('No se pudo agregar.', { tone: 'error' }); } } }, icon('hourglass', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar', onClick: async () => { if (!(await ui.confirmDialog({ title: '¿Borrar esta foto?', message: 'Se borra del Photobooth y de la Galería en los dos teléfonos. Si la agregaron a la Cápsula, allá se queda.', confirmLabel: 'Borrar', danger: true }))) return; await db.rawDelete('media', r.mediaId).catch(() => {}); await db.purge('content', r.id); load(); } }, icon('trash-2', { size: 18 }))));
    })));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el Photobooth', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'content') load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
