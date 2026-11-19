// Crear estampillas propias desde una foto o un sticker (decidido 2026-11-19, opción B).
// - An image that already has no background (a Samsung sticker, a cut-out saved from the Gallery)
//   keeps its own shape, optionally with a white die-cut border.
// - A normal photo goes in a frame (circle, heart, stamp, rounded) or loses its background with
//   the on-device model in bg-remove.js.
// The result is a 256 px WebP/PNG with transparency, saved in the shared sticker album.
import { ui, util, db, profile } from '../core.js';

const { el, icon } = util;
const S = 512; // working size
const OUT = 256; // stored size
const PAD = 22;
const HEART = 'M32 54C10 40 6 24 16 16C23 10 30 14 32 20C34 14 41 10 48 16C58 24 54 40 32 54Z';

async function decode(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bmp, width: bmp.width, height: bmp.height };
  } catch { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

/** Draws the source on a canvas no bigger than `max`, returns it with the bounding box of opaque pixels. */
function analyse(src, max = 640) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src.image || src, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let clear = 0; let x0 = c.width; let y0 = c.height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const a = data[(y * c.width + x) * 4 + 3];
      if (a < 200) clear++;
      if (a > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const box = x1 < 0 ? { x: 0, y: 0, w: c.width, h: c.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  return { canvas: c, transparent: clear / (c.width * c.height) > 0.03, box };
}

const shapePath = (shape, ctx) => {
  ctx.beginPath();
  if (shape === 'circulo') ctx.arc(S / 2, S / 2, S / 2 - PAD, 0, Math.PI * 2);
  else if (shape === 'redondeada') ctx.roundRect(PAD, PAD, S - PAD * 2, S - PAD * 2, 70);
  else if (shape === 'corazon') { const p = new Path2D(); p.addPath(new Path2D(HEART), new DOMMatrix().translate(-12, -46).scale(8.75)); return p; }
  return null;
};

/** Renders the sticker on a S×S canvas. state: { shape, border, zoom, ox, oy }. */
function render(target, { cut, photo }, st) {
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.imageSmoothingQuality = 'high';
  if (st.shape === 'forma') {
    const { canvas, box } = cut;
    const b = st.border ? 16 : 0;
    const room = S - PAD * 2 - b * 2;
    const k = Math.min(room / box.w, room / box.h);
    const w = box.w * k; const h = box.h * k;
    const dx = (S - w) / 2; const dy = (S - h) / 2;
    if (b) {
      const t = document.createElement('canvas'); t.width = S; t.height = S;
      const tc = t.getContext('2d');
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; tc.drawImage(canvas, box.x, box.y, box.w, box.h, dx + Math.cos(a) * b, dy + Math.sin(a) * b, w, h); }
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = '#fff'; tc.fillRect(0, 0, S, S);
      ctx.drawImage(t, 0, 0); t.width = 0;
    }
    ctx.drawImage(canvas, box.x, box.y, box.w, box.h, dx, dy, w, h);
    return;
  }
  // Framed photo: cover the frame, then zoom and pan.
  const inner = st.shape === 'estampilla' ? { x: PAD + 30, y: PAD + 30, w: S - (PAD + 30) * 2, h: S - (PAD + 30) * 2 } : { x: PAD, y: PAD, w: S - PAD * 2, h: S - PAD * 2 };
  const k = Math.max(inner.w / photo.width, inner.h / photo.height) * st.zoom;
  const w = photo.width * k; const h = photo.height * k;
  const dx = inner.x + (inner.w - w) / 2 + st.ox; const dy = inner.y + (inner.h - h) / 2 + st.oy;
  ctx.save();
  if (st.shape === 'estampilla') {
    ctx.fillStyle = '#fff'; ctx.fillRect(PAD, PAD, S - PAD * 2, S - PAD * 2);
    ctx.globalCompositeOperation = 'destination-out';
    const r = 10; const step = 30;
    for (let p = PAD + 15; p <= S - PAD; p += step) {
      for (const [x, y] of [[p, PAD], [p, S - PAD], [PAD, p], [S - PAD, p]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
    ctx.drawImage(photo.image, dx, dy, w, h);
    ctx.restore();
    return;
  }
  const heart = shapePath(st.shape, ctx);
  if (heart) ctx.clip(heart); else ctx.clip();
  ctx.drawImage(photo.image, dx, dy, w, h);
  ctx.restore();
  ctx.lineWidth = 16; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
  if (heart) ctx.stroke(heart); else { shapePath(st.shape, ctx); ctx.stroke(); }
}

async function toBlob(canvas) {
  const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
  const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, OUT, OUT);
  const blob = await new Promise((r) => out.toBlob(r, 'image/webp', 0.9));
  out.width = 0;
  return blob;
}

/** Opens "Nueva estampilla" for a file. Resolves with the saved album record, or null. */
export async function makeSticker(file) {
  let photo;
  try { photo = await decode(file); } catch { ui.toast('No pudimos leer esa imagen. Prueba con una foto o un PNG.', { tone: 'error' }); return null; }
  const first = analyse(photo);
  let cut = first.transparent ? { canvas: first.canvas, box: first.box } : null;
  const st = { shape: first.transparent ? 'forma' : 'circulo', border: false, zoom: 1, ox: 0, oy: 0 };
  const view = el('canvas', { class: 'maker-canvas', width: S, height: S, role: 'img', 'aria-label': 'Vista previa de la estampilla' });
  const status = el('p', { class: 'muted small maker-status', 'aria-live': 'polite' });
  const bar = el('div', { class: 'maker-progress', hidden: true }, el('span'));
  const paint = () => render(view, { cut, photo }, st);
  let busy = false;

  const zoom = el('input', { type: 'range', min: '1', max: '3', step: '0.05', value: '1', class: 'maker-zoom', 'aria-label': 'Acercar' });
  zoom.addEventListener('input', () => { st.zoom = +zoom.value; paint(); });
  const zoomRow = el('label', { class: 'maker-zoom-row' }, icon('minus', { size: 16 }), zoom, icon('plus', { size: 16 }));
  const border = ui.toggle({ label: 'Borde blanco', hint: 'Como los stickers de verdad.', checked: st.border, onChange: (v) => { st.border = v; paint(); } });

  const cutOut = async () => {
    if (cut) return true;
    busy = true; bar.hidden = false; status.textContent = 'Preparando el recortador. La primera vez descarga unos 8 MB; después queda guardado.';
    try {
      const { removeBackground } = await import('./bg-remove.js');
      const big = analyse(photo, 900).canvas;
      const canvas = await removeBackground(big, {
        width: big.width, height: big.height,
        onProgress: (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; if (p >= 1) status.textContent = 'Quitando el fondo…'; },
      });
      const a = analyse(canvas, 900);
      cut = { canvas: a.canvas, box: a.box };
      status.textContent = 'Listo. Si se comió algo, prueba con un marco.';
      return true;
    } catch (e) {
      console.error(e);
      status.textContent = 'No pudimos quitar el fondo en este teléfono. Prueba con un marco o recorta la foto en la Galería y vuelve a elegirla.';
      return false;
    } finally { busy = false; bar.hidden = true; }
  };

  const sync = () => {
    zoomRow.hidden = st.shape === 'forma';
    border.hidden = st.shape !== 'forma';
    view.classList.toggle('is-pannable', st.shape !== 'forma');
  };
  const shapes = ui.segmented({
    label: 'Forma', value: st.shape,
    options: [
      { value: 'forma', label: first.transparent ? 'Su forma' : 'Sin fondo' },
      { value: 'circulo', label: 'Círculo' }, { value: 'corazon', label: 'Corazón' },
      { value: 'estampilla', label: 'Estampilla' }, { value: 'redondeada', label: 'Redondeada' },
    ],
    onChange: async (v) => {
      if (v === 'forma' && !cut) { if (!(await cutOut())) { shapes.querySelector('input[value="circulo"]').click(); return; } }
      st.shape = v; sync(); paint();
    },
  });

  // Drag to move the photo inside the frame.
  let drag = null;
  view.addEventListener('pointerdown', (e) => { if (st.shape === 'forma') return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy, k: S / view.getBoundingClientRect().width }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; st.ox = drag.ox + (e.clientX - drag.x) * drag.k; st.oy = drag.oy + (e.clientY - drag.y) * drag.k; paint(); });
  const stop = () => { drag = null; };
  view.addEventListener('pointerup', stop); view.addEventListener('pointercancel', stop);

  const name = ui.input({ maxlength: 40, placeholder: 'Por ejemplo: Milu dormida', autocomplete: 'off' });
  sync(); paint();
  status.textContent = first.transparent ? 'Esta imagen ya no tiene fondo: queda con su forma.' : 'Elige un marco o quita el fondo. Arrastra la foto para acomodarla.';

  const m = ui.openModal({
    title: 'Nueva estampilla', kind: 'sheet', size: 'lg', className: 'sticker-maker',
    body: el('div', { class: 'maker-body' },
      el('div', { class: 'maker-stage' }, view), bar, status, shapes, zoomRow, border,
      ui.field({ label: 'Nombre (opcional)', control: name, hint: 'Se lee en voz alta para quien usa lector de pantalla.' })),
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: null },
      {
        label: 'Guardar estampilla', variant: 'primary', value: 'save',
        onClick: () => { if (busy) { ui.toast('Espera a que termine de quitar el fondo.'); return false; } return true; },
      },
    ],
  });
  const v = await m.result;
  if (v !== 'save') { photo.image.close?.(); return null; }
  try {
    const blob = await toBlob(view);
    const id = util.uuid();
    const mediaId = await db.putMedia(blob, { ownerStore: 'lists', ownerId: id, width: OUT, height: OUT });
    const rec = { id, kind: 'sticker', name: name.value.trim() || 'Estampilla propia', mediaId, by: profile.active() };
    await db.put('lists', rec);
    ui.toast('Estampilla guardada en su álbum.', { tone: 'success' });
    return rec;
  } catch (e) {
    console.error(e);
    ui.toast('No se pudo guardar la estampilla. Inténtalo de nuevo.', { tone: 'error' });
    return null;
  } finally { photo.image.close?.(); }
}
