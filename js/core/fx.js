// Full-screen decorative effects drawn on one canvas (Fase 7): the season's particles on Inicio and the
// hanabi on the anniversary and the birthdays. Decisions (2026-11-21): the season effect falls for a few
// seconds when Inicio opens and goes away, with few particles, so it never feels like a filter on top;
// hanabi plays once that day. Both are aria-hidden, skip with reduced motion or the Ajustes switch, never
// block taps, and never flash: every light fades in and out over hundreds of ms (photosensitivity, docs/04).
import { CONFIG } from '../config.js';
import { sound, prefersReducedMotion } from './util.js';

const SEASONS = ['snow', 'snow', 'sakura', 'sakura', 'sakura', 'hotaru', 'hotaru', 'hotaru', 'momiji', 'momiji', 'momiji', 'snow']; // by month, Japan's calendar
const LABEL = { sakura: 'pétalos de sakura', hotaru: 'luciérnagas', momiji: 'hojas de momiji', snow: 'copos de nieve' };

/** The season for a date: Japan's calendar in the north, shifted six months in the south. */
export function seasonOf(date = new Date(), hemisphere = CONFIG.seasonalHemisphere) {
  const m = (date.getMonth() + (hemisphere === 'sur' ? 6 : 0)) % 12;
  return SEASONS[m];
}
export const seasonLabel = (kind) => LABEL[kind] || '';

let current = null; // the running effect, so a new one replaces it

function canvasLayer() {
  current?.stop();
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  c.setAttribute('aria-hidden', 'true');
  document.body.append(c);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
  size();
  addEventListener('resize', size);
  const ctx = c.getContext('2d');
  let raf = 0; let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    cancelAnimationFrame(raf); removeEventListener('resize', size); document.removeEventListener('visibilitychange', onHide);
    c.remove(); if (current?.c === c) current = null;
  };
  const onHide = () => { if (document.visibilityState === 'hidden') stop(); };
  document.addEventListener('visibilitychange', onHide);
  const run = (frame) => {
    const t0 = performance.now();
    const loop = (now) => { if (stopped) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); if (frame(now - t0, ctx) === false) { stop(); return; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  };
  current = { c, stop };
  return { ctx, run, stop };
}

function tokens() {
  const st = getComputedStyle(document.documentElement);
  const tok = (v, d) => st.getPropertyValue(v).trim() || d;
  return { night: document.documentElement.dataset.theme === 'night', accent: tok('--accent', '#C2405F'), gold: tok('--gold', '#C9A46A') };
}

const R = (a, b) => a + Math.random() * (b - a);

// ---------- shapes ----------
function petal(ctx, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(s, s * 0.45, s * 0.82, -s * 0.8, s * 0.24, -s);
  ctx.quadraticCurveTo(s * 0.08, -s * 0.9, 0, -s * 0.7); ctx.quadraticCurveTo(-s * 0.08, -s * 0.9, -s * 0.24, -s);
  ctx.bezierCurveTo(-s * 0.82, -s * 0.8, -s, s * 0.45, 0, s); ctx.fill();
}
function leaf(ctx, s, color) { // a five-lobed momiji leaf with its stem
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.62;
    const tip = [Math.cos(a) * s, Math.sin(a) * s]; const a1 = a - 0.32; const a2 = a + 0.32;
    if (i === 0) ctx.moveTo(Math.cos(a1) * s * 0.5, Math.sin(a1) * s * 0.5);
    ctx.lineTo(...tip); ctx.lineTo(Math.cos(a2) * s * 0.5, Math.sin(a2) * s * 0.5);
  }
  ctx.lineTo(0, s * 0.25); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, s * 0.08); ctx.beginPath(); ctx.moveTo(0, s * 0.2); ctx.lineTo(s * 0.1, s * 0.7); ctx.stroke();
}

/**
 * The season's particles over the screen for ~6 s (fade in, fall, fade out). `kind` defaults to today's season;
 * 'sakura' is also used for the mesiversario. Returns false when it did not play.
 */
export function seasonal({ kind = seasonOf(), duration = 6000, count, force = false } = {}) {
  if (prefersReducedMotion() || (!force && (!CONFIG.seasonalEffects || document.documentElement.dataset.seasonal === 'off'))) return false;
  const { night, accent, gold } = tokens();
  const n = Math.min(24, count || (innerWidth > 1100 ? 22 : 16)); // cap
  const colors = {
    sakura: night ? ['#F2B8C9', '#E893AE', '#F7D3DE'] : ['#F4B6C6', '#EFA0B6', '#F9D2DC'],
    momiji: night ? ['#E0705A', '#D9923F', '#C95049'] : ['#C9462F', '#D9772B', '#B23A3A'],
    snow: night ? ['#F4F1F2', '#E3DEE4'] : ['#B9C6D6', '#CBD5E1', '#A9B8CB'],
    hotaru: night ? ['#E8F59A', '#D6EF7E'] : [gold, '#B9A24C'],
  }[kind] || [accent];
  const W = innerWidth; const H = innerHeight;
  const bits = Array.from({ length: n }, (_, i) => ({
    x: R(-0.1, 1.05) * W, y: kind === 'hotaru' ? R(0.25, 0.95) * H : R(-0.6, -0.02) * H,
    s: kind === 'snow' ? R(2, 4.5) : kind === 'hotaru' ? R(2, 3.2) : kind === 'momiji' ? R(7, 11) : R(5, 8.5),
    v: kind === 'hotaru' ? R(-0.012, -0.004) : kind === 'snow' ? R(0.03, 0.06) : R(0.05, 0.09),
    drift: kind === 'hotaru' ? R(-0.01, 0.01) : R(-0.025, 0.01), ph: R(0, 6.28), spin: R(-0.0025, 0.0025),
    flip: R(300, 700), color: colors[i % colors.length], pulse: R(1400, 2600),
  }));
  const { run } = canvasLayer();
  run((t, ctx) => {
    if (t > duration) return false;
    const fade = Math.min(1, t / 700, (duration - t) / 1200);
    for (const b of bits) {
      const x = b.x + b.drift * t + Math.sin(t / 900 + b.ph) * (kind === 'hotaru' ? 14 : 22);
      const y = b.y + b.v * t + (kind === 'hotaru' ? Math.sin(t / 1300 + b.ph) * 10 : 0);
      ctx.setTransform(Math.min(2, devicePixelRatio || 1), 0, 0, Math.min(2, devicePixelRatio || 1), 0, 0);
      ctx.translate(x, y);
      if (kind === 'hotaru') {
        // slow glow (about one breath every two seconds, never a flash)
        const glow = 0.35 + 0.65 * (0.5 - Math.cos((t / b.pulse) * Math.PI * 2 + b.ph) / 2);
        ctx.globalAlpha = fade * glow * (night ? 0.9 : 0.7);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.s * 4);
        g.addColorStop(0, b.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.s * 4, 0, 6.29); ctx.fill();
        continue;
      }
      ctx.globalAlpha = fade * (kind === 'snow' ? 0.85 : 0.8);
      if (kind === 'snow') { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.s, 0, 6.29); ctx.fill(); continue; }
      ctx.rotate(b.ph + b.spin * t); ctx.scale(Math.max(0.15, Math.abs(Math.cos(t / b.flip + b.ph))), 1);
      if (kind === 'momiji') leaf(ctx, b.s, b.color); else petal(ctx, b.s, b.color);
    }
    return true;
  });
  return true;
}

/**
 * Light hanabi over the screen: a few bursts that rise, open and fade (~4.5 s). Never more than one new
 * burst every 650 ms and no full-screen light, so nothing flickers.
 */
export function hanabi({ bursts = 5 } = {}) {
  if (prefersReducedMotion()) return false;
  const { night, accent, gold } = tokens();
  const palette = night ? [accent, gold, '#F2B8C9', '#E8F59A', '#B7D3F2'] : [accent, gold, '#D77A92', '#6E8FB8', '#C58A2E'];
  const W = innerWidth; const H = innerHeight;
  const shells = Array.from({ length: bursts }, (_, i) => {
    const at = 250 + i * R(650, 850);
    const x = W * R(0.18, 0.82); const top = H * R(0.14, 0.4);
    const color = palette[i % palette.length]; const n = Math.round(R(26, 38));
    return { at, x, top, color, sparks: Array.from({ length: n }, (_, k) => ({ a: (k / n) * Math.PI * 2 + R(-0.05, 0.05), sp: R(0.09, 0.14) })), popped: false };
  });
  const end = shells[shells.length - 1].at + 2400;
  const RISE = 650; const LIFE = 1700;
  const { run } = canvasLayer();
  run((t, ctx) => {
    if (t > end) return false;
    for (const s of shells) {
      const lt = t - s.at; if (lt < 0) continue;
      ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
      if (lt < RISE) { // the trail going up
        const p = lt / RISE; const y = H + (s.top - H) * (1 - (1 - p) ** 2);
        ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(s.x, y, 2, 0, 6.29); ctx.fill();
        ctx.globalAlpha = 0.25; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y + 26); ctx.stroke();
        continue;
      }
      if (!s.popped) { s.popped = true; sound('pop'); }
      const bt = lt - RISE; if (bt > LIFE) continue;
      const p = bt / LIFE; const fade = (1 - p) ** 1.6 * Math.min(1, bt / 160);
      for (const k of s.sparks) {
        const r = k.sp * bt * (1 - p * 0.45); const x = s.x + Math.cos(k.a) * r; const y = s.top + Math.sin(k.a) * r + 0.00004 * bt * bt; // gentle gravity
        ctx.globalAlpha = fade; ctx.beginPath(); ctx.arc(x, y, 1.9 * (1 - p * 0.5), 0, 6.29); ctx.fill();
        ctx.globalAlpha = fade * 0.35; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(s.x + Math.cos(k.a) * r * 0.82, s.top + Math.sin(k.a) * r * 0.82); ctx.stroke();
      }
    }
    return true;
  });
  return true;
}

/** Stops whatever effect is on screen (leaving Inicio, panic, etc.). */
export function stopAll() { current?.stop(); }

/** Resolves once the welcome, a lock or the curtain is gone, so an effect is not wasted behind them. */
export function whenClear(maxMs = 30000) {
  const busy = () => document.querySelector('.splash, .lock-full, .curtain, .panic');
  return new Promise((resolve) => {
    if (!busy()) { resolve(true); return; }
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (!busy()) { clearInterval(iv); setTimeout(() => resolve(true), 250); } else if (Date.now() - t0 > maxMs) { clearInterval(iv); resolve(false); }
    }, 250);
  });
}
