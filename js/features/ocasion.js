// Bienvenida por ocasión y modo aniversario (v0.27.0, ideas 59 y 60). On the anniversary, a birthday
// or a mesiversario the whole app changes for the day (data-occasion on the root: gold sky, petals),
// and the first time Inicio opens that day a welcome greets them with a character and a surprise
// letter: one of their own reasons, face down until it is tapped. Nothing is sent anywhere.
import { ui, util, profile } from '../core.js';
import { pickWho, art } from './toques.js';

const { el } = util;
const KEY = 'aishiteru.ocasion.seen';
const ORDER = ['anniversary', 'birthday', 'monthly'];

export function occasionOf(events) { return ORDER.find((k) => events.some((e) => e.kind === k)) || ''; }

/** Mark the root for the day's occasion (or clear it). */
export function mark(events) {
  const k = occasionOf(events);
  if (k) document.documentElement.dataset.occasion = k; else delete document.documentElement.dataset.occasion;
  return k;
}

const seen = () => { try { return localStorage.getItem(KEY) || ''; } catch { return util.localDay(); } };

/** The welcome layer, once per day and occasion. */
export async function welcome(events, { reasons = [], receiver } = {}) {
  const k = occasionOf(events);
  const key = `${k}:${util.localDay()}`;
  if (!k || seen() === key || document.querySelector('.ocasion-layer')) return false;
  try { localStorage.setItem(KEY, key); } catch { /* private mode */ }
  const ev = events.find((e) => e.kind === k);
  // v0.39.0 (Rowler: "Rama que florece"): the mesiversario opens with its own scene, ritual and surprise letter included
  if (k === 'monthly') { await import('./mesiversario.js').then((m) => m.play(ev, { reasons, receiver })); return true; }
  const a = await art(await pickWho(`ocasion-${k}`));
  const reason = reasons.length ? profile.fill(String(reasons[Math.floor(Math.random() * reasons.length)].text || ''), receiver) : '';
  const letter = reason ? el('button', { class: 'ocasion-letter', type: 'button', 'aria-label': 'Abrir la carta sorpresa' },
    el('span', { class: 'ocasion-seal', 'aria-hidden': 'true' }, '♥'), el('span', { class: 'ocasion-letter-text' }, 'Una carta sorpresa: tócala')) : null;
  letter?.addEventListener('click', (e) => {
    e.stopPropagation();
    letter.classList.add('is-open'); letter.replaceChildren(el('span', { class: 'ocasion-letter-text' }, reason));
    letter.setAttribute('aria-label', reason); util.haptic('love');
  }, { once: true });
  const close = el('button', { class: 'btn btn-primary ocasion-go', type: 'button' }, 'Entrar');
  const layer = el('div', { class: 'ocasion-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': ev.title, dataset: { occasion: k } },
    el('div', { class: 'ocasion-card' },
      el('div', { class: 'ocasion-art', 'aria-hidden': 'true' }, a.node),
      el('h2', { class: 'ocasion-title' }, ev.title),
      ev.text ? el('p', { class: 'ocasion-sub' }, `${a.name}: ${ev.text}`) : null,
      letter, close));
  const done = () => { layer.classList.add('leaving'); setTimeout(() => layer.remove(), util.prefersReducedMotion() ? 0 : 320); };
  close.addEventListener('click', done);
  layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(); });
  document.body.append(layer);
  close.focus({ preventScroll: true });
  util.haptic('love');
  return true;
}
