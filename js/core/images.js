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
