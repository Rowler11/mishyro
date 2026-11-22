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
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0; let H = 0;
  const size = () => { W = innerWidth; H = innerHeight; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); };
  size();
  let kind = ambientKind(); let night = kind === 'night'; let pal = COLORS(night ? 'hotaru' : kind, night, tokens().gold);
  const n = innerWidth > 1100 ? 8 : 7; // few, decided with the user
  const make = (k, { top = true, at = null, extra = false } = {}) => {
    const now = performance.now();
    if (k === 'lantern') return { k, x: R(0.1, 0.9) * W, y: top ? H + R(40, 320) : R(0.35, 1) * H, s: R(26, 38) * (W > 1100 ? 1.15 : 1), v: R(-0.011, -0.007), ph: R(0, 6.28), born: now };
    return {
      k, extra, born: now,
      x: at ? at.x + R(-24, 24) : R(-0.05, 1.05) * W,
      y: at ? at.y + R(-12, 12) : k === 'hotaru' ? R(0.1, 0.95) * H : top ? R(-70, -10) : R(0, H),
      s: k === 'snow' ? R(2, 4.5) : k === 'hotaru' ? R(2, 3.2) : k === 'momiji' ? R(7, 11) : R(5, 8.5),
      v: k === 'hotaru' ? R(-0.006, 0.006) : k === 'snow' ? R(0.022, 0.04) : R(0.03, 0.055),
      drift: k === 'hotaru' ? R(-0.006, 0.006) : R(-0.018, 0.004),
      ph: R(0, 6.28), spin: R(-0.002, 0.002), flip: R(400, 900), pulse: R(1600, 2800),
      life: k === 'hotaru' ? R(7000, 12000) : 0, color: pal[Math.floor(Math.random() * pal.length)],
    };
  };
  const particle = () => (night ? 'hotaru' : kind);
  let bits = [];
  const reset = () => {
    kind = ambientKind(); night = kind === 'night'; pal = COLORS(night ? 'hotaru' : kind, night, tokens().gold);
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
    wind *= 0.9;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; const t = now - b.born;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (b.k === 'lantern') {
        b.y += b.v * dt;
        if (b.y < -70) { bits[i] = make('lantern'); continue; }
        const x = b.x + Math.sin(t / 2600 + b.ph) * 10 + wind * 6;
        ctx.translate(x, b.y); ctx.rotate(Math.sin(t / 2600 + b.ph) * 0.06);
        ctx.globalAlpha = Math.min(1, t / 1500) * Math.min(1, (b.y + 70) / 170) * 0.85;
        lantern(ctx, b.s, t, b.ph); continue;
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
      ctx.globalAlpha = fadeIn * (b.k === 'snow' ? 0.85 : 0.75);
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
      c.remove();
    },
    burst(x, y) {
      if (stopped) return;
      const extras = bits.filter((b) => b.extra).length;
      for (let i = 0; i < Math.min(5, 10 - extras); i++) bits.push(make(night ? 'hotaru' : kind, { at: { x: x + R(-50, 50), y: y + R(-20, 30) }, extra: true }));
    },
  };
  return api;
}

/** The branch (by day, it changes with the season) or two hanging chōchin (at night) for Inicio's corner. */
export function cornerArt(kind = ambientKind()) {
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
  // v0.12.1: a fuller branch that comes in from the screen's top right edge, with limbs and twigs
  // (seeded, so it looks the same every time) and the season's blossoms in clusters at their tips.
  const pal = COLORS(kind, false, '#C9A46A') || COLORS('sakura', false);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const wood = '#6B4A3E';
  const f = (n) => n.toFixed(1);
  let wood_ = ''; const spots = [];
  const limb = (x, y, ang, len, w, depth) => {
    const bend = (rnd() - 0.5) * 0.5;
    const mx = x + Math.cos(ang) * len * 0.5 + Math.cos(ang + Math.PI / 2) * len * bend * 0.3;
    const my = y + Math.sin(ang) * len * 0.5 + Math.sin(ang + Math.PI / 2) * len * bend * 0.3;
    const ex = x + Math.cos(ang + bend) * len; const ey = y + Math.sin(ang + bend) * len;
    wood_ += `<path d="M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}" stroke-width="${f(w)}"/>`;
    spots.push([ex, ey, depth + 1]); // blossoms at the tip
    if (depth < 3) {
      const kids = depth === 1 ? 2 : 1 + (rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < kids; i++) {
        const u = 0.45 + rnd() * 0.45; const side = i % 2 ? -1 : 1;
        const kx = x + (ex - x) * u; const ky = y + (ey - y) * u;
        limb(kx, ky, ang + side * (0.5 + rnd() * 0.5), len * (0.45 + rnd() * 0.2), Math.max(1, w * 0.55), depth + 1);
      }
    }
  };
  // the main limb: from beyond the top right corner down and to the left
  const trunk = [[176, -6], [140, 14], [104, 34], [66, 56], [30, 82]];
  wood_ += `<path d="M176 -6C150 6 122 22 104 34S56 64 28 84" stroke-width="5.5"/><path d="M176 -6C150 6 122 22 104 34S56 64 28 84" stroke-width="1.4" stroke="#9A7A6C" transform="translate(-.8 -1.4)"/>`;
  // side limbs: some droop down and to the left, others reach up-left, so it reads as a real branch
  [[150, 9, 1.75, 42], [128, 20, 3.55, 36], [106, 33, 2.05, 40], [90, 42, 3.75, 32], [70, 53, 1.9, 30], [50, 66, 3.6, 24]].forEach(([x, y, a, l], i) => limb(x, y, a, l, i < 2 ? 3.2 : 2.6, 1));
  for (const [x, y] of [trunk[4]]) spots.push([x, y, 2]);
  const bloom = (x, y, i, sc) => {
    const col = pal[i % pal.length];
    if (kind === 'momiji') return `<path transform="translate(${f(x)} ${f(y)}) rotate(${(i * 47) % 360}) scale(${sc})" fill="${col}" d="M0-9 2-3 8-5 4 0 7 6 1 3 0 9-1 3-7 6-4 0-8-5-2-3Z"/>`;
    if (kind === 'snow') return `<circle cx="${f(x)}" cy="${f(y - 2)}" r="${f(2.4 + sc * 2)}" fill="#FFFFFF" stroke="${pal[0]}" stroke-width=".7"/>`;
    if (kind === 'hotaru') return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(4 + sc * 2)}" ry="2.4" transform="rotate(${-20 - (i * 23) % 70} ${f(x)} ${f(y)})" fill="${i % 3 ? '#7C9461' : '#93AA74'}"/>`;
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(sc * 0.6)})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-6" rx="4.4" ry="6.4" fill="${col}" transform="rotate(${r + i * 11})"/>`).join('')}<circle r="2" fill="#C9A46A"/></g>`;
  };
  let tips = '';
  spots.forEach(([x, y, d], i) => {
    const n = d >= 3 ? 3 : 2; // clusters at the tips, so the wood still shows between them
    for (let k = 0; k < n; k++) tips += bloom(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 8, i * 3 + k, (kind === 'momiji' ? 0.5 : 0.55) + rnd() * 0.3);
  });
  svg.innerHTML = `<g class="corner-swing"><g fill="none" stroke="${wood}" stroke-linecap="round">${wood_}</g>${tips}</g>`;
  return svg;
}
