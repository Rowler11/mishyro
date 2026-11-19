// Quitar el fondo de una foto para hacer una estampilla (decidido 2026-11-19, opción B).
// Runs U^2-Net (small, Apache-2.0) with ONNX Runtime Web (MIT) entirely on the device: the photo
// never leaves the phone. The model and runtime (~8 MB over the network) are only fetched the
// first time "Quitar fondo" is used; the service worker keeps them in a cache that survives updates.
const ORT_DIR = new URL('../../vendor/ort/', import.meta.url).href;
const MODEL_URL = new URL('../../vendor/u2netp/u2netp.onnx', import.meta.url).href;
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let ready = null;

async function fetchBytes(url, onProgress, share = [0, 1]) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(share[0] + (share[1] - share[0]) * Math.min(1, got / total));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Loads runtime and model once. onProgress(0..1) while downloading. */
export function prepare(onProgress) {
  if (!ready) {
    ready = (async () => {
      const ort = await import('../../vendor/ort/ort.wasm.min.mjs');
      ort.env.wasm.numThreads = 1; // no cross-origin isolation needed
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = ORT_DIR;
      ort.env.wasm.wasmBinary = (await fetchBytes(`${ORT_DIR}ort-wasm-simd-threaded.wasm`, onProgress, [0, 0.6])).buffer;
      const model = await fetchBytes(MODEL_URL, onProgress, [0.6, 1]);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { ort, session };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

/**
 * source: a drawable (ImageBitmap/canvas/img) with width/height. Returns a canvas of the same
 * size whose alpha is the subject mask.
 */
export async function removeBackground(source, { width, height, onProgress } = {}) {
  const { ort, session } = await prepare(onProgress);
  const small = document.createElement('canvas');
  small.width = SIZE; small.height = SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let p = 0, i = 0; p < plane; p++, i += 4) {
    for (let c = 0; c < 3; c++) input[c * plane + p] = (px[i + c] / max - MEAN[c]) / STD[c];
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) };
  const out = await session.run(feeds);
  const pred = out[session.outputNames[0]].data;
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < plane; i++) { lo = Math.min(lo, pred[i]); hi = Math.max(hi, pred[i]); }
  const span = hi - lo || 1;
  const mask = sctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < plane; i++) {
    // Soft edge: the faint halo goes away, the subject stays solid.
    const m = Math.min(1, Math.max(0, ((pred[i] - lo) / span - 0.12) / 0.7));
    mask.data[i * 4 + 3] = Math.round(m * 255);
  }
  sctx.putImageData(mask, 0, 0);
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  const rctx = result.getContext('2d');
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(small, 0, 0, width, height); // mask, scaled up smoothly
  rctx.globalCompositeOperation = 'source-in';
  rctx.drawImage(source, 0, 0, width, height);
  rctx.globalCompositeOperation = 'source-over';
  small.width = small.height = 0;
  return result;
}
