// Escenario (v0.32.0, Rowler 2026-11-25: "la calidad del corazón del Latido en más cosas").
// The Latido look, shared: the screen dims to a deep, soft night, a glow breathes behind one
// illustrated object, and particles (sparks, hearts, sakura petals, gold dust) mark each moment.
// Pure presentation: callers decide what is shown and when. With reduced motion only the fade stays.
import { el, prefersReducedMotion } from './util.js';

const reduced = () => prefersReducedMotion();
const HEART = '<svg viewBox="0 0 64 58" aria-hidden="true"><path d="M32 56 C29 53 4 37 4 19 C4 9 11 3 19 3 C25 3 29.5 6.5 32 11 C34.5 6.5 39 3 45 3 C53 3 60 9 60 19 C60 37 35 53 32 56Z"/></svg>';
const PETAL = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29C5 24 1 17 2 10 3 4 8 1 12 4c4-3 9 0 10 6 1 7-3 14-10 19z"/><path d="M12 4l-1.2 3h2.4z" fill="rgb(0 0 0 / .14)"/></svg>';
const SHAPES = { heart: HEART, petal: PETAL };

/**
 * Opens the stage. tone: 'rose' (love), 'gold' (time, treasures), 'ink' (night, calm).
 * Returns handles to fill it and to play its moments.
 */
export function open({ label, title = '', sub = '', art = null, tone = 'rose', dismissable = true, restoreFocus = true, onClose } = {}) {
  const fx = el('div', { class: 'stage-fx', 'aria-hidden': 'true' });
  const core = el('div', { class: 'stage-core' }, art);
  const t = el('p', { class: 'stage-title', 'aria-live': 'polite' }, title);
  const s = el('p', { class: 'stage-sub' }, sub);
  const actions = el('div', { class: 'stage-actions' });
  const layer = el('div', { class: 'stage-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title, dataset: { tone } }, fx, core, t, s, actions);
  let closed = false;
  const prevFocus = document.activeElement;
  const close = () => {
    if (closed) return Promise.resolve(); closed = true;
    document.removeEventListener('keydown', onKey);
    return new Promise((res) => {
      layer.classList.add('leaving');
      setTimeout(() => { layer.remove(); if (restoreFocus) prevFocus?.focus?.({ preventScroll: true }); onClose?.(); res(); }, reduced() ? 0 : 340);
    });
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', onKey);
  if (dismissable) layer.addEventListener('click', (e) => { if (e.target === layer || e.target === fx) close(); });
  document.body.append(layer);
  return {
    layer, core, fx, close,
    set(title2, sub2) { if (title2 != null) t.textContent = title2; if (sub2 != null) s.textContent = sub2; },
    /** 0..1: how strongly the light behind the object shines. */
    glow(v) { layer.style.setProperty('--glow', String(Math.max(0, Math.min(1, v)))); },
    /** Buttons under the text; the first one takes focus. */
    actions(...btns) { actions.replaceChildren(...btns.filter(Boolean)); actions.querySelector('button')?.focus({ preventScroll: true }); },
    ...particles(fx),
  };
}

/** The particle moments, on any layer (it needs the .stage-fx class and the --st-* colors around it). */
export function particles(fx) {
  return {
    sparks: (n = 14) => sparks(fx, n),
    rise: (n = 14, shape = 'heart') => rise(fx, n, shape),
    burst: (n = 40, shape = 'heart') => burst(fx, n, shape),
    petals: (n = 18) => petals(fx, n),
    dust: (n = 26) => dust(fx, n),
    flash: () => flash(fx),
  };
}
/** Waits, but not when motion is reduced. */
export const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

function bit(cls, shape, style, ttl) {
  const p = el('i', { class: cls, style });
  if (shape && SHAPES[shape]) p.innerHTML = SHAPES[shape];
  setTimeout(() => p.remove(), ttl);
  return p;
}
function sparks(fx, n) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; const d = 90 + Math.random() * 50;
    fx.append(bit('st-spark', null, { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--d': `${Math.random() * 140}ms` }, 1300));
  }
}
function rise(fx, n, shape) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    fx.append(bit(`st-float st-${shape}`, shape, { '--x': `${6 + Math.random() * 88}%`, '--s': `${0.5 + Math.random() * 0.8}`, '--d': `${Math.random() * 1600}ms`, '--t': `${2600 + Math.random() * 1800}ms` }, 5200));
  }
}
function burst(fx, n, shape) {
  if (reduced()) return;
  flash(fx);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2; const d = 120 + Math.random() * Math.max(innerWidth, innerHeight) * 0.5;
    fx.append(bit(`st-burst st-${shape}`, shape, { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--r': `${Math.round(Math.random() * 360 - 180)}deg`, '--s': `${0.5 + Math.random() * 1.1}`, '--d': `${Math.random() * 180}ms` }, 2300));
  }
}
function petals(fx, n) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    fx.append(bit('st-petal-fall', 'petal', { '--x': `${Math.random() * 100}%`, '--s': `${0.55 + Math.random() * 0.7}`, '--d': `${Math.random() * 2200}ms`, '--t': `${4200 + Math.random() * 2600}ms`, '--sway': `${Math.round(Math.random() * 80 - 40)}px`, '--r': `${Math.round(Math.random() * 540 - 270)}deg` }, 9500));
  }
}
function dust(fx, n) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    fx.append(bit('st-dust', null, { '--x': `${30 + Math.random() * 40}%`, '--y': `${30 + Math.random() * 25}%`, '--dx': `${Math.round(Math.random() * 160 - 80)}px`, '--dy': `${Math.round(-60 - Math.random() * 160)}px`, '--d': `${Math.random() * 900}ms`, '--t': `${1600 + Math.random() * 1400}ms` }, 4200));
  }
}
function flash(fx) {
  if (reduced()) return;
  fx.append(bit('st-flash', null, {}, 1000));
}
