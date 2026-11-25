// Recortar y encuadrar (v0.30.0, Rowler 2026-11-25): before a photo is saved, and later on any photo
// already saved, the person can move it with a finger, zoom with two fingers or the slider, turn it and
// pick the frame (the profile photo is always a circle). Everything happens on the device, on a canvas.
import { el, icon, haptic, prefersReducedMotion } from './util.js';
import { openModal } from './ui.js';

export const ASPECTS = [
  { id: 'free', label: 'Original', value: null },
  { id: '1:1', label: 'Cuadrada', value: 1 },
  { id: '3:4', label: '3:4', value: 3 / 4 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
  { id: '9:16', label: 'Vertical', value: 9 / 16 },
];

async function decode(src) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(src, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(src);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
const dims = (img) => ({ w: img.width || img.naturalWidth, h: img.height || img.naturalHeight });

/** Pure math (unit-tested): the smallest zoom that still covers the frame, and offsets kept inside it. */
export function coverScale(iw, ih, fw, fh) { return Math.max(fw / iw, fh / ih); }
export function clampOffset(x, y, iw, ih, scale, fw, fh) {
  const mx = Math.max(0, (iw * scale - fw) / 2); const my = Math.max(0, (ih * scale - fh) / 2);
  return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
}

/**
 * Opens the cropper. source: File or Blob. Resolves { blob, width, height } or null when cancelled.
 * aspect: a number (fixed), or null to let the person choose (starts on "Original").
 */
export async function cropImage(source, { aspect = null, round = false, maxSide = 1280, quality = 0.82, title = 'Encuadra la foto', type = 'image/jpeg' } = {}) {
  let img;
  try { img = await decode(source); } catch { const e = new Error('decode'); e.code = 'DECODE'; throw e; }
  const { w: iw0, h: ih0 } = dims(img);
  let rot = 0; // quarter turns
  const iw = () => (rot % 2 ? ih0 : iw0); const ih = () => (rot % 2 ? iw0 : ih0);
  let ratio = aspect ?? iw0 / ih0; let choice = aspect ? null : 'free';
  let scale = 1; let min = 1; let x = 0; let y = 0;

  const canvas = el('canvas', { class: 'crop-canvas', 'aria-hidden': 'true' });
  const frame = el('div', { class: `crop-frame${round ? ' is-round' : ''}` }, canvas, el('span', { class: 'crop-grid', 'aria-hidden': 'true' }));
  const stage = el('div', { class: 'crop-stage', tabindex: '0', role: 'application', 'aria-label': 'Foto para encuadrar. Arrastra para mover; usa + y − o pellizca para acercar; las flechas también la mueven.' }, frame);
  const zoom = el('input', { type: 'range', class: 'crop-zoom', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Acercar o alejar' });
  let fw = 0; let fh = 0;

  const draw = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(fw * dpr)) { canvas.width = Math.round(fw * dpr); canvas.height = Math.round(fh * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fw, fh);
    ctx.save();
    ctx.translate(fw / 2 + x, fh / 2 + y);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.scale(scale, scale);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -iw0 / 2, -ih0 / 2);
    ctx.restore();
  };
  const layout = (keep = false) => {
    const box = stage.getBoundingClientRect();
    const availW = Math.max(160, Math.min(box.width || 320, 520) - 8); const availH = Math.max(160, Math.min(window.innerHeight * 0.52, 520));
    fw = availW; fh = fw / ratio;
    if (fh > availH) { fh = availH; fw = fh * ratio; }
    fw = Math.round(fw); fh = Math.round(fh);
    frame.style.width = `${fw}px`; frame.style.height = `${fh}px`;
    canvas.style.width = `${fw}px`; canvas.style.height = `${fh}px`;
    const rel = keep && min ? scale / min : 1;
    min = coverScale(iw(), ih(), fw, fh);
    scale = min * rel; zoom.value = String(rel);
    if (!keep) { x = 0; y = 0; }
    ({ x, y } = clampOffset(x, y, iw(), ih(), scale, fw, fh));
    draw();
  };
  const setZoom = (rel, cx = 0, cy = 0) => {
    rel = Math.min(4, Math.max(1, rel));
    const next = min * rel; const k = next / scale;
    x = cx + (x - cx) * k; y = cy + (y - cy) * k; scale = next; zoom.value = String(rel);
    ({ x, y } = clampOffset(x, y, iw(), ih(), scale, fw, fh)); draw();
  };
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));

  // One finger moves, two fingers zoom (pointer events, so mouse and pen work too).
  const pts = new Map(); let pinch = null;
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.classList.add('is-dragging'); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), rel: scale / min }; } });
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x; const dy = e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = frame.getBoundingClientRect(); const cx = (a.x + b.x) / 2 - r.left - fw / 2; const cy = (a.y + b.y) / 2 - r.top - fh / 2;
      setZoom(pinch.rel * (d / pinch.d), cx, cy);
    } else if (pts.size === 1) { ({ x, y } = clampOffset(x + dx, y + dy, iw(), ih(), scale, fw, fh)); draw(); }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(scale / min * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 12;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); ({ x, y } = clampOffset(x + moves[e.key][0], y + moves[e.key][1], iw(), ih(), scale, fw, fh)); draw(); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(scale / min + 0.15); }
    if (e.key === '-') { e.preventDefault(); setZoom(scale / min - 0.15); }
  });

  const turn = el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { rot = (rot + 1) % 4; if (choice === 'free') ratio = iw() / ih(); haptic(8); layout(); } }, icon('rotate-cw', { size: 18 }), el('span', {}, 'Girar'));
  const reset = el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { layout(); haptic(8); } }, icon('rotate-ccw', { size: 18 }), el('span', {}, 'Centrar'));
  const chips = aspect || round ? null : el('div', { class: 'crop-aspects', role: 'radiogroup', 'aria-label': 'Forma del recorte' },
    ASPECTS.map((a) => el('button', { class: 'crop-aspect', type: 'button', role: 'radio', 'aria-checked': String(a.id === choice), 'data-a': a.id, onClick: () => {
      choice = a.id; ratio = a.value ?? iw() / ih();
      chips.querySelectorAll('.crop-aspect').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.a === choice)));
      haptic(8); layout();
    } }, a.label)));
  const body = el('div', { class: 'crop-box' }, stage,
    el('div', { class: 'crop-zoom-row' }, icon('zoom-out', { size: 18 }), zoom, icon('zoom-in', { size: 18 })),
    chips, el('div', { class: 'crop-tools' }, turn, reset),
    el('p', { class: 'muted small crop-help' }, 'Arrastra para mover y pellizca o usa la barra para acercar.'));

  let result = null;
  const m = openModal({
    title, size: 'md', className: 'crop-modal', body,
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Listo', variant: 'primary', onClick: async () => { result = await render(); return true; } }],
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout(true)) : null;
  requestAnimationFrame(() => { layout(); ro?.observe(stage); if (!prefersReducedMotion()) frame.classList.add('is-in'); });

  async function render() {
    // Real pixels of the frame on the original photo, capped at maxSide.
    const srcW = fw / scale; const srcH = fh / scale;
    const k = Math.min(1, maxSide / Math.max(srcW, srcH));
    const outW = Math.max(1, Math.round(srcW * k)); const outH = Math.max(1, Math.round(srcH * k));
    const c = document.createElement('canvas'); c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH); }
    const f = outW / fw;
    ctx.translate(outW / 2 + x * f, outH / 2 + y * f); ctx.rotate((rot * Math.PI) / 2); ctx.scale(scale * f, scale * f);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -iw0 / 2, -ih0 / 2);
    const blob = await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality));
    c.width = c.height = 0;
    return { blob, width: outW, height: outH };
  }
  await m.result;
  ro?.disconnect();
  img.close?.();
  return result;
}

/** Same as compressImage(file) but framed by the person first. Throws { code: 'CANCEL' } when they cancel. */
export async function framePhoto(file, opts = {}) {
  const c = await cropImage(file, { title: 'Encuadra la foto', ...opts });
  if (!c) throw Object.assign(new Error('cancel'), { code: 'CANCEL' });
  return c;
}
