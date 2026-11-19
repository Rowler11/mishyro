// Photo intake (docs/05 Pestaña 2): decode with the EXIF orientation applied, scale the
// longest side down to 1280 px and re-encode as JPEG ~0.7. Everything stays on the device.
export const MAX_SIDE = 1280;
export const QUALITY = 0.7;
export const MAX_PHOTOS = 6;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* some formats only decode through <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally { URL.revokeObjectURL(url); }
}

/** File -> { blob, width, height }. Throws an Error with code "DECODE" when the file is not a readable image. */
export async function compressImage(file, { max = MAX_SIDE, quality = QUALITY } = {}) {
  let src;
  try { src = await decode(file); } catch { const e = new Error('decode'); e.code = 'DECODE'; throw e; }
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs become white instead of black in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.image, 0, 0, width, height);
  src.close();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
  canvas.width = canvas.height = 0; // free the bitmap memory right away on phones
  return { blob, width, height };
}

/** True for the errors IndexedDB raises when the device storage is full. */
export const isQuotaError = (e) => e?.name === 'QuotaExceededError' || e?.inner?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '');

// Short videos for Cápsula (decided 2026-11-19): up to 30 s and 50 MB, stored as they come.
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const isVideoFile = (f) => (f?.type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(f?.name || '');

/** File -> { blob, width, height, duration }. Throws an Error with code "TOO_BIG", "TOO_LONG" or "DECODE". */
export async function readVideo(file) {
  const fail = (code) => Object.assign(new Error(code), { code });
  if (file.size > MAX_VIDEO_BYTES) throw fail('TOO_BIG');
  const url = URL.createObjectURL(file);
  try {
    const meta = await new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      const done = (fn) => { clearTimeout(t); v.removeAttribute('src'); v.load(); fn(); };
      const t = setTimeout(() => done(() => reject(fail('DECODE'))), 15000);
      v.onloadedmetadata = () => { const r = { width: v.videoWidth, height: v.videoHeight, duration: v.duration }; done(() => resolve(r)); };
      v.onerror = () => done(() => reject(fail('DECODE')));
      v.src = url;
    });
    if (!Number.isFinite(meta.duration)) throw fail('DECODE');
    if (meta.duration > MAX_VIDEO_SECONDS + 0.5) throw fail('TOO_LONG');
    const blob = file.type ? file : new Blob([file], { type: 'video/mp4' });
    return { blob, width: meta.width || undefined, height: meta.height || undefined, duration: Math.round(meta.duration * 10) / 10 };
  } finally { URL.revokeObjectURL(url); }
}
