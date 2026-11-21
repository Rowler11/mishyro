// Small shared helpers: DOM building (safe by default), dates, money, ids.
// Never use innerHTML with user data: el() only sets textContent.

export const uuid = () => crypto.randomUUID();
export const nowISO = () => toLocalISO(new Date());

/** ISO 8601 with the device's local offset, e.g. 2025-03-14T00:00:00-05:00 */
export function toLocalISO(d) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** Local calendar day as YYYY-MM-DD */
export function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date (no UTC shift). */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

export function isValidDay(s) { return parseDay(s) !== null; }

/** Whole calendar days between two local dates (b - a). */
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Age in whole years on a given date. */
export function ageOn(birth, on = new Date()) {
  let age = on.getFullYear() - birth.getFullYear();
  const m = on.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < birth.getDate())) age--;
  return age;
}

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatCOP = (n) => fmtCOP.format(Math.round(Number(n) || 0));

const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
export const formatDay = (s) => { const d = parseDay(s); return d ? fmtDate.format(d) : ''; };

/**
 * Tiny hyperscript. Text children become text nodes; attributes starting
 * with "on" become listeners; "class", "dataset", "aria-*" handled.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) node.style.setProperty(p, val); else node.style[p] = val; }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') node.textContent = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Reference an icon from the local sprite. */
export function icon(name, { label, size = 24, cls = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); }
  else svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `./icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}

/** Japanese decorative label (hidden when the user turns Japanese off). */
export function ja(text, romaji) {
  return el('span', { class: 'ja', lang: 'ja', title: romaji || undefined }, text);
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let audioCtx = null;
/** Soft furin-like chime generated with Web Audio (no audio files). */
export function chime() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    [1318.5, 1975.5, 2637].forEach((f, i) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + i * 0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 1.6);
      o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.05); o.stop(t + 1.8);
    });
  } catch { /* audio not available */ }
}

/**
 * Optional soft sounds for key moments (Fase 7). Silent unless Ajustes > Sonidos suaves is on, and never
 * the only way to tell something: each sound goes with something on screen.
 *   chime: furin bell (badges, goals, redeemed coupons, finished challenges)
 *   paper: a short rustle (opening or sealing a letter)
 *   stamp: a soft thump (a hanko seal pressed)
 *   pop:   a faint, far firework (hanabi)
 */
export function sound(kind = 'chime', { force = false } = {}) {
  if (!force && document.documentElement.dataset.sound !== 'on') return;
  if (kind === 'chime') { chime(); return; }
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    if (kind === 'paper') {
      // filtered noise that swells and fades, like a sheet of washi
      const len = Math.floor(audioCtx.sampleRate * 0.42);
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 900));
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
      const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      src.connect(bp).connect(g).connect(audioCtx.destination); src.start(t); src.stop(t + 0.45);
      return;
    }
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    if (kind === 'stamp') {
      o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    } else { // pop
      o.type = 'triangle'; o.frequency.setValueAtTime(320 + Math.random() * 120, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    }
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.4);
  } catch { /* audio not available */ }
}

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'off'
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Base64 helpers for ArrayBuffer / Uint8Array. */
export function bufToB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBuf(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function blobToB64(blob) { return bufToB64(await blob.arrayBuffer()); }
export function b64ToBlob(b64, type) { return new Blob([b64ToBuf(b64)], { type }); }

/** Light haptic feedback, only if enabled. */
export function haptic(pattern = 10) {
  if (document.documentElement.dataset.haptics !== 'on' || !navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers block it before a tap
  navigator.vibrate(pattern);
}
