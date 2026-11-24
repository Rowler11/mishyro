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

// ---------- Inicio's living background (v0.12.0, decided 2026-11-21) ----------
// A few of the season's particles fall all the time while Inicio is open, BEHIND the cards (never over text).
// At night (Sakura suave) they turn into fireflies with two paper chōchin rising slowly. Scrolling blows a little
// wind through them, and the branch (or the hanging chōchin at night) in the corner shakes and lets go of a few
// more when tapped. ~30 fps, paused while the app is hidden, off with reduced motion or the Apariencia switch.

function lantern(ctx, s, t, ph) { // a red paper chōchin with its warm light that breathes (never a flash)
  const breath = 0.86 + 0.14 * Math.sin(t / 900 + ph) * Math.sin(t / 2300 + ph * 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.5);
  g.addColorStop(0, `rgba(255,176,96,${0.3 * breath})`); g.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 1.5, 0, 6.29); ctx.fill();
  const b = ctx.createRadialGradient(-s * 0.1, -s * 0.08, s * 0.05, 0, 0, s * 0.55);
  b.addColorStop(0, '#FFD9A0'); b.addColorStop(0.45, '#F08A4B'); b.addColorStop(1, '#B8322A');
  ctx.globalAlpha *= breath; ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.36, s * 0.46, 0, 0, 6.29); ctx.fill();
  ctx.strokeStyle = 'rgba(90,24,16,.35)'; ctx.lineWidth = 0.8;
  for (const k of [-0.27, -0.09, 0.09, 0.27]) {
    const hw = s * 0.36 * Math.sqrt(1 - (k / 0.46) ** 2);
    ctx.beginPath(); ctx.moveTo(-hw, k * s); ctx.quadraticCurveTo(0, k * s + s * 0.04, hw, k * s); ctx.stroke();
  }
  ctx.fillStyle = '#2A1E22'; ctx.fillRect(-s * 0.17, -s * 0.52, s * 0.34, s * 0.09); ctx.fillRect(-s * 0.17, s * 0.43, s * 0.34, s * 0.09);
  ctx.strokeStyle = '#B8322A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, s * 0.52); ctx.lineTo(0, s * 0.7); ctx.stroke();
}

const COLORS = (kind, night, gold) => ({
  sakura: night ? ['#F2B8C9', '#E893AE', '#F7D3DE'] : ['#F4B6C6', '#EFA0B6', '#F9D2DC'],
  momiji: night ? ['#E0705A', '#D9923F', '#C95049'] : ['#C9462F', '#D9772B', '#B23A3A'],
  snow: night ? ['#F4F1F2', '#E3DEE4'] : ['#B9C6D6', '#CBD5E1', '#A9B8CB'],
  hotaru: night ? ['#E8F59A', '#D6EF7E'] : [gold, '#B9A24C'],
}[kind]);

/** What Inicio shows right now: the season by day, 'night' (fireflies and chōchin) with the night theme. */
export function ambientKind() { return document.documentElement.dataset.theme === 'night' ? 'night' : seasonOf(); }

const ambientOn = () => !prefersReducedMotion() && CONFIG.seasonalEffects && document.documentElement.dataset.seasonal !== 'off';

/**
 * Starts Inicio's background inside `host` (a canvas placed behind the cards). Returns { stop, burst(x, y) }:
 * burst lets a few more particles go from a point of the screen (the branch being shaken). Never throws.
 */
export function ambient(host) {
  const none = { stop() {}, burst() {} };
  if (!host || !ambientOn()) return none;
  const c = document.createElement('canvas');
  c.className = 'ambient-canvas'; c.setAttribute('aria-hidden', 'true');
  host.prepend(c);
  const ctx = c.getContext('2d');
  if (!ctx) { c.remove(); return none; }
  // v0.15.1: leaves fall over the cards; the night's big paper lanterns stay behind them.
  const back = document.createElement('canvas');
  back.className = 'ambient-canvas is-back'; back.setAttribute('aria-hidden', 'true');
  host.prepend(back);
  const bctx = back.getContext('2d') || ctx;
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0; let H = 0;
  const size = () => { W = innerWidth; H = innerHeight; for (const k of [c, back]) { k.width = Math.round(W * dpr); k.height = Math.round(H * dpr); } };
  size();
  const palette = (k) => (k === 'night' ? COLORS('hotaru', true, tokens().gold) : MAPLE[k] || COLORS('snow', false));
  let kind = ambientKind(); let night = kind === 'night'; let pal = palette(kind);
  const n = innerWidth > 1100 ? 8 : 7; // few, decided with the user
  const make = (k, { top = true, at = null, extra = false } = {}) => {
    const now = performance.now();
    if (k === 'lantern') return { k, x: R(0.1, 0.9) * W, y: top ? H + R(40, 320) : R(0.35, 1) * H, s: R(26, 38) * (W > 1100 ? 1.15 : 1), v: R(-0.011, -0.007), ph: R(0, 6.28), born: now };
    return {
      k, extra, born: now,
      x: at ? at.x + R(-24, 24) : R(-0.05, 1.05) * W,
      y: at ? at.y + R(-12, 12) : k === 'hotaru' ? R(0.1, 0.95) * H : top ? R(-70, -10) : R(0, H),
      s: k === 'snow' ? R(3, 6) : k === 'hotaru' ? R(2.4, 3.6) : k === 'momiji' ? R(13, 19) : R(10, 15), // v0.15.1: bigger, they fall over the cards
      v: k === 'hotaru' ? R(-0.006, 0.006) : k === 'snow' ? R(0.022, 0.04) : R(0.03, 0.055),
      drift: k === 'hotaru' ? R(-0.006, 0.006) : R(-0.018, 0.004),
      ph: R(0, 6.28), spin: R(-0.002, 0.002), flip: R(400, 900), pulse: R(1600, 2800),
      life: k === 'hotaru' ? R(7000, 12000) : 0, color: pal[Math.floor(Math.random() * pal.length)],
    };
  };
  // v0.15.1: by day the corner maple drops its own leaves (green, then red); snow in winter.
  const particle = () => (night ? 'hotaru' : kind === 'snow' ? 'snow' : 'momiji');
  let bits = [];
  const reset = () => {
    kind = ambientKind(); night = kind === 'night'; pal = palette(kind);
    bits = Array.from({ length: n }, () => make(particle(), { top: false }));
    if (night) bits.push(make('lantern', { top: false }), make('lantern'));
  };
  reset();
  let wind = 0; let lastY = null;
  const onScroll = (e) => {
    const t = e.target === document ? document.scrollingElement : e.target;
    const y = t?.scrollTop ?? scrollY;
    if (lastY !== null) wind = Math.max(-1.5, Math.min(1.5, wind + (y - lastY) * 0.03));
    lastY = y;
  };
  let raf = 0; let stopped = false; let prev = 0;
  const frame = (now) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (now - prev < 32) return; // ~30 fps is plenty for slow leaves and saves battery
    const dt = Math.min(64, now - (prev || now)); prev = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0); bctx.clearRect(0, 0, W, H);
    wind *= 0.9;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; const t = now - b.born;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (b.k === 'lantern') {
        b.y += b.v * dt;
        if (b.y < -70) { bits[i] = make('lantern'); continue; }
        const x = b.x + Math.sin(t / 2600 + b.ph) * 10 + wind * 6;
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bctx.translate(x, b.y); bctx.rotate(Math.sin(t / 2600 + b.ph) * 0.06);
        bctx.globalAlpha = Math.min(1, t / 1500) * Math.min(1, (b.y + 70) / 170) * 0.85;
        lantern(bctx, b.s, t, b.ph); continue;
      }
      if (b.k === 'hotaru') { b.x += (b.drift + wind * 0.02) * dt + Math.sin(t / 1200 + b.ph) * 0.15; b.y += b.v * dt + Math.cos(t / 1500 + b.ph) * 0.12; }
      else { b.x += (b.drift + wind * 0.04) * dt + Math.sin(t / 900 + b.ph) * 0.25; b.y += b.v * dt; }
      const gone = b.k === 'hotaru' ? t > b.life : b.y > H + 24 || b.x < -48 || b.x > W + 48;
      if (gone) { if (b.extra) bits.splice(i, 1); else bits[i] = make(b.k); continue; }
      const fadeIn = Math.min(1, t / 900); const fadeOut = b.k === 'hotaru' ? Math.min(1, (b.life - t) / 1200) : 1;
      ctx.translate(b.x, b.y);
      if (b.k === 'hotaru') { // slow glow, about one breath every two seconds
        const glow = 0.35 + 0.65 * (0.5 - Math.cos((t / b.pulse) * Math.PI * 2 + b.ph) / 2);
        ctx.globalAlpha = fadeIn * fadeOut * glow * (night ? 0.9 : 0.7);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.s * 4); g.addColorStop(0, b.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.s * 4, 0, 6.29); ctx.fill(); continue;
      }
      ctx.globalAlpha = fadeIn * (b.k === 'snow' ? 0.9 : 0.88);
      if (b.k === 'snow') { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.s, 0, 6.29); ctx.fill(); continue; }
      ctx.rotate(b.ph + b.spin * t + wind * 0.3); ctx.scale(Math.max(0.15, Math.abs(Math.cos(t / b.flip + b.ph))), 1);
      if (b.k === 'momiji') leaf(ctx, b.s, b.color); else petal(ctx, b.s, b.color);
    }
  };
  const play = () => { if (!stopped && !raf) { prev = 0; raf = requestAnimationFrame(frame); } };
  const pause = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => (document.visibilityState === 'hidden' ? pause() : play());
  const mo = new MutationObserver(() => {
    if (!ambientOn()) { api.stop(); return; }
    if (ambientKind() !== kind) reset();
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-seasonal', 'data-motion'] });
  addEventListener('resize', size);
  addEventListener('scroll', onScroll, { passive: true, capture: true });
  document.addEventListener('visibilitychange', onVis);
  play();
  const api = {
    stop() {
      if (stopped) return; stopped = true; pause(); mo.disconnect();
      removeEventListener('resize', size); removeEventListener('scroll', onScroll, { capture: true }); document.removeEventListener('visibilitychange', onVis);
      c.remove(); back.remove();
    },
    burst(x, y) {
      if (stopped) return;
      const extras = bits.filter((b) => b.extra).length;
      for (let i = 0; i < Math.min(5, 10 - extras); i++) bits.push(make(particle(), { at: { x: x + R(-50, 50), y: y + R(-20, 30) }, extra: true }));
    },
  };
  return api;
}

/** The branch (by day, it changes with the season) or two hanging chōchin (at night) for Inicio's corner. */
export function cornerArt(kind = ambientKind(), { xmas = false } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 170 120'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const night = kind === 'night';
  if (night) {
    const lantern = (x, y, s, id) => {
      const ribs = [-0.27, -0.09, 0.09, 0.27].map((k) => { const hw = s * 0.36 * Math.sqrt(1 - (k / 0.46) ** 2); return `<path d="M${-hw} ${k * s} Q0 ${k * s + s * 0.04} ${hw} ${k * s}" stroke="rgba(90,24,16,.35)" stroke-width=".8" fill="none"/>`; }).join('');
      return `<g class="corner-swing${id === 2 ? ' is-second' : ''}"><line x1="${x}" y1="0" x2="${x}" y2="${y - s * 0.5}" stroke="#8A6F66" stroke-width="1.2"/><g transform="translate(${x} ${y})"><circle r="${s * 1.2}" fill="url(#cl-g${id})"/><ellipse rx="${s * 0.36}" ry="${s * 0.46}" fill="url(#cl-b${id})"/>${ribs}<rect x="${-s * 0.17}" y="${-s * 0.52}" width="${s * 0.34}" height="${s * 0.09}" fill="#2A1E22"/><rect x="${-s * 0.17}" y="${s * 0.43}" width="${s * 0.34}" height="${s * 0.09}" fill="#2A1E22"/><line x1="0" y1="${s * 0.52}" x2="0" y2="${s * 0.72}" stroke="#B8322A" stroke-width="1.4"/></g></g>`;
    };
    const defs = [1, 2].map((id) => `<radialGradient id="cl-g${id}"><stop offset="0" stop-color="#FFB060" stop-opacity=".4"/><stop offset="1" stop-color="#FF9650" stop-opacity="0"/></radialGradient><radialGradient id="cl-b${id}" cx=".42" cy=".42" r=".6"><stop offset="0" stop-color="#FFD9A0"/><stop offset=".45" stop-color="#F08A4B"/><stop offset="1" stop-color="#B8322A"/></radialGradient>`).join('');
    svg.innerHTML = `<defs>${defs}</defs>${lantern(78, 64, 44, 1)}${lantern(128, 46, 34, 2)}`;
    return svg;
  }
  // v0.15.1 (chosen 2026-11-24, option H): by day a leafy Japanese maple branch (never the welcome
  // splash's sakura) with a glass furin hanging from it. Its own leaves are what falls over the cards.
  return mapleArt(svg, kind, xmas);
}

/** Leaves of Inicio's maple by season (also the colors of the leaves that fall). null = bare in winter. */
export const MAPLE = {
  sakura: ['#8FC95A', '#A9D86E', '#6FAE45', '#C9694A'],
  hotaru: ['#3F8A3A', '#57A046', '#2F6F2C', '#4A9A40'],
  momiji: ['#D8462F', '#EF8A2C', '#B8321F', '#F2B23C'],
  snow: null,
};
const TANZAKU = { sakura: ['#F7C3D1', '#FDE4EA'], hotaru: ['#A9D8EE', '#E1F2FA'], momiji: ['#F2A86C', '#FDE1C6'], snow: ['#D6CFE9', '#F0ECF8'] };
let mseed = 1;
const mr = (a, b) => { mseed = (mseed * 16807) % 2147483647; return a + ((mseed - 1) / 2147483646) * (b - a); };
const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
function mapleLeaf(x, y, r, a, c) {
  let d = ''; let v = '';
  for (let i = 0; i < 14; i++) { const g = -Math.PI / 2 + (i * Math.PI) / 7; const rr = i % 2 ? r * 0.4 : r * (i === 0 ? 1 : i === 2 || i === 12 ? 0.92 : 0.74); d += (i ? 'L' : 'M') + (x + Math.cos(g) * rr).toFixed(1) + ' ' + (y + Math.sin(g) * rr).toFixed(1); }
  for (const k of [0, 2, 4, 10, 12]) { const g = -Math.PI / 2 + (k * Math.PI) / 7; v += `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + Math.cos(g) * r * 0.8).toFixed(1)} ${(y + Math.sin(g) * r * 0.8).toFixed(1)}`; }
  return `<g transform="rotate(${a.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"><path d="${d}Z" fill="${c}"/><path d="${v}" stroke="#FFFFFF" stroke-width=".45" opacity=".35"/></g>`;
}
function furinArt(kind, x, y) {
  const flower = (cx, cy, r, c) => [0, 1, 2, 3, 4].map((i) => `<ellipse cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.42}" ry="${r * 0.6}" fill="${c}" transform="rotate(${i * 72} ${cx} ${cy})"/>`).join('') + `<circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="#E7B04A"/>`;
  const fish = (fx, fy, k, a) => `<g transform="translate(${fx} ${fy}) rotate(${a}) scale(${k})"><path d="M0 0C4-4 10-3.5 12 0C10 3.5 4 4 0 0Z" fill="#E2483A"/><path d="M11.5 0L17-4.5L15.5 0L17 4.5Z" fill="#F06B4F"/><circle cx="3" cy="-.6" r=".7" fill="#3A1A14"/></g>`;
  const flake = (fx, fy, r, c = '#7AA6C8') => [0, 60, 120].map((a) => `<line x1="${fx - r}" y1="${fy}" x2="${fx + r}" y2="${fy}" stroke="${c}" stroke-width=".9" stroke-linecap="round" transform="rotate(${a} ${fx} ${fy})"/>`).join('');
  const paint = kind === 'hotaru' ? fish(-9, 15, 0.75, -10) + fish(2, 22, 0.65, 15) + '<path d="M-15 27q4-3 8 0t8 0t8 0t8 0" fill="none" stroke="#4A8FC0" stroke-width="1.1"/>'
    : kind === 'sakura' ? flower(-6, 14, 5, '#F2A0B8') + flower(6, 21, 4.2, '#F7BCCD') + flower(-3, 25, 3.4, '#EC8FAA')
      : kind === 'momiji' ? mapleLeaf(-6, 14, 6, -15, '#D8462F') + mapleLeaf(6, 21, 5, 20, '#EF8A2C') + mapleLeaf(-4, 25, 3.8, 5, '#C23A28')
        : flake(-6, 13, 5) + flake(6, 20, 4) + flake(-3, 25, 3);
  const tag = kind === 'sakura' ? flower(0, 20, 4, '#FFFFFF') : kind === 'momiji' ? mapleLeaf(0, 20, 5, 10, '#C23A28') : kind === 'hotaru' ? fish(-5, 20, 0.65, 0) : flake(0, 20, 4, '#8B80B4');
  const dome = 'M-15 30C-15 10-9 1 0 1C9 1 15 10 15 30Z';
  return `<g transform="translate(${x} ${y})"><g class="corner-furin">
    <line x1="0" y1="0" x2="0" y2="4" stroke="#6A4A3A" stroke-width="1"/>
    <g transform="translate(0 4) scale(.78)">
      <ellipse cx="0" cy="1.5" rx="3.4" ry="2.2" fill="#9CC3D6"/>
      <path d="${dome}" fill="url(#ca-glass)" stroke="#6F9FB8" stroke-width=".8"/>
      <g clip-path="url(#ca-dome)">${paint}</g>
      ${kind === 'snow' ? '<path d="M-7 5C-4 1 4 1 7 5C4 6-4 6-7 5Z" fill="#FFFFFF" stroke="#C4D4E2" stroke-width=".5"/>' : ''}
      <ellipse cx="0" cy="30" rx="15" ry="3" fill="#CFE8F3" stroke="#6F9FB8" stroke-width=".8"/>
      <ellipse cx="0" cy="30" rx="12.5" ry="1.8" fill="#7FB0C8" opacity=".45"/>
      <path d="M-10.5 26C-11.5 15-7.5 6-2 3.8" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
      <path d="M9 12C10.5 16 11 20 11 24" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" opacity=".6"/>
      <line x1="0" y1="3" x2="0" y2="40" stroke="#7A5A4A" stroke-width=".8"/>
      <rect x="-2.4" y="27" width="4.8" height="6" rx="1.6" fill="#E4685A"/>
      <g transform="translate(0 40)"><g class="corner-tanzaku">
        <rect x="-7.5" y="0" width="15" height="40" rx="1.2" fill="url(#ca-tz)" filter="url(#ca-tex)"/>
        <rect x="-7.5" y="0" width="15" height="40" rx="1.2" fill="none" stroke="rgba(90,50,40,.18)" stroke-width=".6"/>
        <line x1="-5" y1="5" x2="5" y2="5" stroke="#C9A14A" stroke-width=".9"/><line x1="-5" y1="35" x2="5" y2="35" stroke="#C9A14A" stroke-width=".9"/>
        ${tag}<circle cx="0" cy="2.2" r=".9" fill="#7A5A4A"/>
      </g></g>
    </g></g></g>`;
}
/** Novenas and Navidad: a gold bell with a red bow hangs from the maple instead of the furin. */
function xmasBell(x, y) {
  return `<g transform="translate(${x} ${y})"><g class="corner-furin">
    <line x1="0" y1="0" x2="0" y2="8" stroke="#A8301F" stroke-width="1.2"/>
    <g transform="translate(0 6)"><path d="M0 0l-6 14M0 0l6 14" stroke="#C9302C" stroke-width="2.4" stroke-linecap="round"/><path d="M0 0c-8-8-18-6-14 2 3 5 10 2 14-2zM0 0c8-8 18-6 14 2-3 5-10 2-14-2z" fill="#C9302C" stroke="#8A1E1A" stroke-width=".6"/><path d="M-12-2q6 4 12 2q6 2 12-2" stroke="#D4A943" stroke-width="1" fill="none"/><circle r="2.6" fill="#A8301F"/></g>
    <g transform="translate(0 10)"><path d="M-11 30C-11 18-7 11 0 11C7 11 11 18 11 30Z" fill="url(#ca-goldb)"/><rect x="-12.5" y="28.5" width="25" height="3.4" rx="1.6" fill="#B8862C"/><circle cx="0" cy="34" r="2.6" fill="#8A5F1A"/><path d="M-6 26C-7 20-5 15-1.5 13" stroke="#FFF4C8" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></g>
  </g></g>`;
}
function mapleArt(svg, kind, xmas = false) {
  svg.setAttribute('viewBox', '0 0 270 156');
  const pal = MAPLE[kind] === undefined ? MAPLE.momiji : MAPLE[kind];
  const tz = TANZAKU[kind] || TANZAKU.momiji;
  mseed = 7;
  const limbs = [
    ['M274 18C252 17 236 24 218 29', 10], ['M218 29C200 34 184 36 166 44', 7.5], ['M166 44C150 51 134 54 118 62', 5], ['M118 62C108 67 100 72 94 80', 3],
    ['M226 27C220 18 212 12 202 8', 3.2], ['M190 37C188 48 182 58 172 70', 3.6], ['M172 70C166 78 160 82 152 86', 2], ['M150 50C146 40 140 32 130 26', 2.6],
    ['M126 58C124 68 120 78 112 88', 2], ['M244 21C246 30 250 38 258 44', 2.6], ['M204 33C210 40 216 46 226 50', 2.2], ['M140 52C134 46 124 42 112 42', 1.8],
    ['M94 80C90 84 86 86 79 87', 1.2], ['M112 88C110 92 106 95 100 96', 1.1], ['M202 8C198 6 194 6 189 7', 1.2], ['M152 86C148 88 144 88 139 87', 1.1], ['M258 44C260 48 261 51 261 55', 1.2],
  ];
  const bark = limbs.map(([d, w]) => `<path d="${d}" fill="none" stroke="#3B261C" stroke-width="${w + 1.4}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="url(#ca-bark)" stroke-width="${w}" stroke-linecap="round"/>`).join('')
    + limbs.slice(0, 4).map(([d, w]) => `<path d="${d}" fill="none" stroke="#A07A60" stroke-width="${(w * 0.22).toFixed(2)}" stroke-linecap="round" opacity=".55" transform="translate(0 -${(w * 0.22).toFixed(2)})"/>`).join('');
  const clusters = [[238, 30, 15], [204, 14, 13], [180, 62, 14], [156, 84, 11], [132, 30, 12], [112, 86, 11], [96, 76, 10], [160, 50, 12], [222, 50, 12], [258, 46, 11], [112, 44, 11], [196, 36, 10], [142, 64, 10]];
  let back = ''; let front = '';
  if (pal) {
    clusters.forEach(([cx, cy, r], ci) => {
      for (let i = 0; i < 11; i++) {
        const ang = mr(0, 6.28); const rr = r * Math.sqrt(mr(0, 1));
        const x = cx + Math.cos(ang) * rr; const y = cy + Math.sin(ang) * rr * 0.8;
        const col = pal[(i + ci) % pal.length];
        if (i < 5) back += mapleLeaf(x, y, mr(5.5, 8.5), mr(-50, 50), shade(col, 0.78)); else front += mapleLeaf(x, y, mr(5.5, 8.5), mr(-50, 50), col);
      }
    });
  } else {
    front = '<g fill="#FFFFFF" stroke="#C4D4E2" stroke-width=".5"><path d="M274 13C252 12 236 19 218 24C200 29 184 31 166 39C150 46 134 49 118 57L119 60C135 52 151 49 167 42C185 34 201 32 219 27C237 22 253 15 274 16Z"/><path d="M188 33c2 4 0 8-3 12l1 1c3-4 5-8 3-13z"/></g>'
      + [[250, 22], [230, 27], [208, 33], [186, 37], [160, 46], [136, 54], [112, 64]].map(([x, y]) => { const h = mr(4, 8).toFixed(1); return `<path d="M${x} ${y + 3}l1.4 ${h}l1.4-${h}z" fill="#DBEAF5" stroke="#B9CFE2" stroke-width=".4"/>`; }).join('')
      + mapleLeaf(172, 72, 5, 20, '#A0522D') + mapleLeaf(120, 64, 4.5, -30, '#B0643A');
  }
  svg.innerHTML = `<defs>
    <linearGradient id="ca-bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A634C"/><stop offset=".5" stop-color="#5E3F2F"/><stop offset="1" stop-color="#40291E"/></linearGradient>
    <radialGradient id="ca-glass" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".97"/><stop offset=".55" stop-color="#DCF0F9" stop-opacity=".8"/><stop offset="1" stop-color="#8DBFD8" stop-opacity=".9"/></radialGradient>
    <linearGradient id="ca-tz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tz[1]}"/><stop offset="1" stop-color="${tz[0]}"/></linearGradient>
    <linearGradient id="ca-goldb" x1="0" x2="1"><stop offset="0" stop-color="#A87A22"/><stop offset=".4" stop-color="#F3D27A"/><stop offset="1" stop-color="#B8862C"/></linearGradient>
    <clipPath id="ca-dome"><path d="M-15 30C-15 10-9 1 0 1C9 1 15 10 15 30Z"/></clipPath>
    <filter id="ca-tex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="saturate" values="0" result="g"/><feComponentTransfer in="g" result="g2"><feFuncR type="linear" slope=".42" intercept=".7"/><feFuncG type="linear" slope=".42" intercept=".7"/><feFuncB type="linear" slope=".42" intercept=".7"/></feComponentTransfer><feBlend in="SourceGraphic" in2="g2" mode="multiply" result="m"/><feComposite in="m" in2="SourceGraphic" operator="in"/></filter>
    <filter id="ca-soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#3A2018" flood-opacity=".22"/></filter>
  </defs><g class="corner-swing"><g class="corner-maple" filter="url(#ca-soft)">${back}<g filter="url(#ca-tex)">${bark}</g>${front}</g>${xmas ? xmasBell(150, 51) : furinArt(kind, 150, 51)}</g>`;
  return svg;
}
