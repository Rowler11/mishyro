// Shared pieces of the Fase 4B sections (Mascotas, Alcancía, Gastos, Hábitos, Recetas): one optional
// photo field, money input in COP, small SVG charts with a hidden table, and original pet silhouettes.
import { ui, util, db } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';

const { el, icon } = util;
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const fmtShort = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

export { isQuotaError };

/** "2026-11" for a "YYYY-MM-DD" day. */
export const monthOf = (day) => String(day || '').slice(0, 7);

/** The last n months as "YYYY-MM", oldest first, ending with the month of `end`. */
export function lastMonths(n, end = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return fmtMonth.format(new Date(y, m - 1, 1)).replace('.', ''); };

/** "$ 20.000" or "20000" or "20.000,50" -> 20000 (whole pesos). NaN when empty or not a number. */
export function parseCOP(text) {
  const s = String(text ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  // es-CO: "." groups thousands and "," is the decimal mark; pesos are whole.
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/** Money input that shows thousands separators while typing. */
export function moneyInput({ value = '', placeholder = '0', ...attrs } = {}) {
  const inp = ui.input({ inputmode: 'numeric', autocomplete: 'off', placeholder, ...attrs, value: value === '' || value == null ? '' : new Intl.NumberFormat('es-CO').format(value) });
  inp.addEventListener('input', () => {
    const n = parseCOP(inp.value);
    inp.value = Number.isFinite(n) ? new Intl.NumberFormat('es-CO').format(Math.abs(n)) : '';
  });
  inp.amount = () => parseCOP(inp.value);
  return el('div', { class: 'money-input' }, el('span', { class: 'money-prefix', 'aria-hidden': 'true' }, '$'), inp);
}

/**
 * One optional photo. Returns { node, busy(), commit(ownerStore, ownerId) -> mediaId|null, removed(), revoke() }.
 * commit() writes the new photo (if any) and tells which old media can be deleted after saving.
 */
export function photoField({ mediaId = null, label = 'Foto (opcional)', alt = 'Foto' } = {}) {
  let photo = null; let keep = mediaId; let url = null; let busy = false;
  const box = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `ph-${util.uuid().slice(0, 8)}` });
  const paint = async () => {
    if (!url && keep) { const b = await db.getMedia(keep).catch(() => null); if (b) url = URL.createObjectURL(b); }
    box.replaceChildren(url
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src: url, alt }),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keep = null; if (url) URL.revokeObjectURL(url); url = null; paint(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, label)), file);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    busy = true;
    try { photo = await compressImage(f); keep = null; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  return {
    node: box,
    busy: () => busy,
    async commit(ownerStore, ownerId) {
      if (photo) return db.putMedia(photo.blob, { ownerStore, ownerId, width: photo.width, height: photo.height });
      return keep;
    },
    revoke() { if (url) URL.revokeObjectURL(url); },
  };
}

/** After saving a record: delete the media the record no longer points to. */
export async function dropOldMedia(prevIds = [], nextIds = []) {
  for (const id of prevIds) if (id && !nextIds.includes(id)) await db.rawDelete('media', id).catch(() => {});
}

/** Image element filled from a media id (object URL kept in `urls` to revoke on cleanup). */
export function mediaImg(mediaId, { alt = '', cls = '', urls } = {}) {
  const img = el('img', { alt, class: cls, loading: 'lazy' });
  if (mediaId) db.getMedia(mediaId).then((b) => { if (b) { const u = URL.createObjectURL(b); urls?.add(u); img.src = u; } }).catch(() => {});
  return img;
}

/** Accessible bar chart (one series). values in the same order as labels. */
export function barChart({ labels, values, title, format = (v) => String(v), highlightLast = true }) {
  const W = 320; const H = 160; const L = 6; const R = 6; const T = 18; const B = 24;
  const max = Math.max(1, ...values);
  const bw = (W - L - R) / labels.length;
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kit-chart', role: 'img', 'aria-label': title });
  svg.append(mk('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'kit-axis-line' }));
  labels.forEach((lab, i) => {
    const v = values[i] || 0;
    const h = Math.round(((H - T - B) * v) / max);
    const x = L + i * bw + bw * 0.18;
    const last = highlightLast && i === labels.length - 1;
    if (v > 0) svg.append(mk('rect', { x, y: H - B - h, width: bw * 0.64, height: Math.max(h, 2), rx: 3, class: `kit-bar${last ? ' is-last' : ''}` }));
    svg.append(mk('text', { x: x + bw * 0.32, y: H - 8, class: 'kit-axis', 'text-anchor': 'middle' }, lab));
    if (last && v > 0) svg.append(mk('text', { x: x + bw * 0.32, y: Math.max(12, H - B - h - 6), class: 'kit-value', 'text-anchor': 'middle' }, format(v)));
  });
  const table = el('table', { class: 'sr-only' }, el('caption', {}, title),
    el('tbody', {}, labels.map((lab, i) => el('tr', {}, el('th', { scope: 'row' }, lab), el('td', {}, format(values[i] || 0))))));
  return el('figure', { class: 'kit-chart-wrap' }, svg, table);
}

/** Accessible line chart of dated values (weight curve, savings over time). points: [{ day, value }] sorted. */
export function lineChart({ points, title, format = (v) => String(v) }) {
  const W = 320; const H = 170; const L = 40; const R = 12; const T = 14; const B = 26;
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kit-chart', role: 'img', 'aria-label': title });
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
  const t0 = util.parseDay(points[0].day).getTime(); const t1 = util.parseDay(points[points.length - 1].day).getTime();
  const x = (p) => (t1 === t0 ? (L + W - R) / 2 : L + ((util.parseDay(p.day).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  for (const v of [lo, (lo + hi) / 2, hi]) {
    svg.append(mk('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'kit-grid' }));
    svg.append(mk('text', { x: L - 6, y: y(v), class: 'kit-axis', 'text-anchor': 'end', 'dominant-baseline': 'central' }, format(v)));
  }
  svg.append(mk('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)} ${y(p.value).toFixed(1)}`).join(''), class: 'kit-line' }));
  points.forEach((p) => svg.append(mk('circle', { cx: x(p), cy: y(p.value), r: 4, class: 'kit-dot' })));
  const ends = points.length > 1 ? [points[0], points[points.length - 1]] : [points[0]];
  ends.forEach((p, i) => svg.append(mk('text', { x: x(p), y: H - 8, class: 'kit-axis', 'text-anchor': points.length > 1 ? (i ? 'end' : 'start') : 'middle' }, fmtShort.format(util.parseDay(p.day)))));
  const table = el('table', { class: 'sr-only' }, el('caption', {}, title),
    el('tbody', {}, points.map((p) => el('tr', {}, el('th', { scope: 'row' }, util.formatDay(p.day)), el('td', {}, format(p.value))))));
  return el('figure', { class: 'kit-chart-wrap' }, svg, table);
}

/** Comma-separated tags input: value() -> string[]. */
export function tagsInput({ value = [], placeholder = 'Separadas por comas' } = {}) {
  const inp = ui.input({ value: (value || []).join(', '), placeholder, maxlength: 200 });
  inp.tags = () => [...new Set(inp.value.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 12);
  return inp;
}

/** Original line silhouettes (drawn for Aishiteru) by species: gato, perro, otro. */
const PET_ART = {
  gato: '<path d="M14 46c0-12 8-20 18-20s18 8 18 20v6H14Z"/><path d="M20 30 18 14l9 9M44 30l2-16-9 9"/><circle cx="26" cy="36" r="1.6"/><circle cx="38" cy="36" r="1.6"/><path d="M30 41h4l-2 2Z"/><path d="M50 50c6 0 8-4 6-8"/>',
  perro: '<path d="M16 48c0-12 7-20 16-20s16 8 16 20v4H16Z"/><path d="M20 30c-5 2-7 9-4 14M44 30c5 2 7 9 4 14"/><circle cx="27" cy="38" r="1.6"/><circle cx="37" cy="38" r="1.6"/><ellipse cx="32" cy="44" rx="3" ry="2"/>',
  otro: '<ellipse cx="32" cy="40" rx="16" ry="12"/><circle cx="26" cy="38" r="1.6"/><circle cx="38" cy="38" r="1.6"/><path d="M29 44c2 2 4 2 6 0"/><path d="M22 30c0-6 4-10 10-10s10 4 10 10"/>',
};
export function petArt(species = 'otro', { size = 64, label } = {}) {
  const key = /gat|cat/i.test(species) ? 'gato' : /perr|dog/i.test(species) ? 'perro' : 'otro';
  const svg = mk('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'pet-art', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PET_ART[key];
  return svg;
}

let audio = null;
/** Short coin clinks (Web Audio, no files); only when "Sonidos suaves" is on. */
export function coins(n = 3) {
  if (document.documentElement.dataset.sound !== 'on') return;
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime;
    for (let i = 0; i < n; i++) {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = 2200 + i * 340;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.25);
      o.connect(g).connect(audio.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.3);
    }
  } catch { /* audio not available */ }
}

/** Hanabi: a few CSS firework bursts over the page (skipped with reduced motion). */
export function hanabi({ bursts = 4 } = {}) {
  if (util.prefersReducedMotion()) return;
  const layer = el('div', { class: 'hanabi', 'aria-hidden': 'true' });
  for (let b = 0; b < bursts; b++) {
    const burst = el('span', { class: 'hanabi-burst', style: { left: `${15 + Math.random() * 70}%`, top: `${12 + Math.random() * 40}%`, animationDelay: `${b * 260}ms` } });
    for (let i = 0; i < 14; i++) burst.append(el('i', { style: { '--a': `${(360 / 14) * i}deg`, animationDelay: `${b * 260}ms` } }));
    layer.append(burst);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2600);
}

/** Labelled money field: { node, input, amount(), setError(msg) }. */
export function moneyField({ label, value = '', hint } = {}) {
  const wrap = moneyInput({ value });
  const input = wrap.querySelector('input');
  const f = ui.field({ label, control: input, hint });
  f.insertBefore(wrap, f.querySelector('.field-label').nextSibling);
  wrap.append(input);
  return { node: f, input, amount: () => input.amount(), setError: (m) => f.setError(m) };
}
