// Recorrido con los animalitos (v0.19.0, options chosen 2026-11-24: C "camina y tocas tú", A "corto + uno
// por sección"). The screen dims, what is being explained lights up and one of the paper friends walks
// over to it and talks in a bubble. Tap anywhere to go on; on the key steps you tap the lit thing
// yourself (Más, a group) and the tour follows you into that screen. "Saltar tutorial" is always there.
//   main tour: once per device, the first time Inicio opens after setting up (about 8 steps)
//   section tours: the first time each section opens, its own friend explains it in 2 or 3 steps
// Ajustes > Acerca de > Legal y ayuda can show them again. Progress is per device (localStorage), like the
// old hints: each of them gets the tour on their own phone. Nothing here talks about the other's phone.
import { util, router, CONFIG } from '../core.js';
import { draw } from '../core/art.js';
import * as pets from '../core/pets.js';
import * as sounds from '../core/sounds.js';
import { HINTS } from './guia.js';

const { el, icon } = util;
const KEY = `${CONFIG.storageKey}.tour`;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* private mode */ } };

/** main: 'done' | 'skipped' | undefined; off: no tours at all; seen: { section: 1 }. */
export const state = () => ({ seen: {}, ...read() });
export const mainFinished = () => !!state().main;
/** Shows every tour again (Ajustes). */
export function reset() { try { localStorage.removeItem(KEY); } catch { /* private mode */ } }
// Automated browsers (the test suite) don't get tours on their own unless they ask for them.
const auto = () => !navigator.webdriver || localStorage.getItem(`${KEY}.auto`) === '1';

// ---------- what each tour says ----------
const visible = (sel) => [...document.querySelectorAll(sel)].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; }) || null;
const tab = (id) => () => visible(`.tabbar-link[data-tab="${id}"]`) || visible(`.rail-link[data-tab="${id}"]`);
const N = (id) => pets.nameOf(id);

export const MAIN = () => [
  { pet: 'panda', text: `¡Hola! Soy ${N('panda')}. Mis amigos y yo te mostramos la app en un ratito. Si prefieres explorar por tu cuenta, toca «Saltar tutorial».` },
  { pet: 'fox', route: '/inicio', target: '.counter-card', text: 'Esta es su tarjeta del día: cuántos días llevan juntos y lo que viene.' },
  { pet: 'cat', target: () => visible('.tabbar') || visible('.rail-tabs'), text: 'Aquí abajo están sus lugares de siempre: la Cápsula con sus recuerdos, la Cuponera y las Cartas.' },
  { pet: 'tanuki', target: tab('mas'), tap: 'Abrir Más', text: 'Y aquí vive todo lo demás: juegos, calendario, mapa… ¡Tócalo tú!' },
  { pet: 'rabbit', route: '/mas', target: '.doors .door', tap: 'Abrir el grupo', text: 'Todo va por grupos, como cajoncitos. Toca este para abrirlo.' },
  { pet: 'crane', target: '.more-cards', text: 'Cada tarjeta es una sección. La primera vez que entres a una, uno de nosotros te la explica.' },
  { pet: 'fox', target: () => visible('.search-btn') || visible('.rail-link[data-tab="buscar"]'), text: '¿Buscas algo y no sabes dónde está? La lupa lo encuentra.' },
  { pet: 'panda', route: '/inicio', target: '.guide-card', text: 'Por último, «Primeros pasos»: deja la app lista para los dos. Cuando lo termines, esta tarjeta se va sola.' },
  { pet: 'panda', route: '/inicio', last: true, text: '¡Eso es todo! Si quieres ver esto otra vez, está en Ajustes, en «Legal y ayuda». ¡A disfrutar juntos!' },
];

// Who explains each section, and what the button next to the title does there.
const SECTION = {
  capsula: ['rabbit', 'Con este botón guardas un recuerdo nuevo, con fotos y lo que sintieron.'],
  cupones: ['tanuki', 'Aquí creas un cupón nuevo. ¡Yo pediría uno de comida!'],
  cartas: ['crane', 'Con este botón escribes una carta. Si la sellas, se abre en la fecha que elijas.'],
  calendario: ['panda', 'Aquí agregas una cita o una fecha. Yo agendaría una siesta.'],
  galeria: ['rabbit'], mapa: ['crane', 'Toca aquí para agregar un lugar donde estuvieron.'], diario: ['cat'],
  preguntas: ['rabbit'], retos: ['fox'], planes: ['tanuki'], citas: ['tanuki'], canciones: ['cat'],
  juegos: ['fox', 'Elige un juego y a jugar. El que pierde invita el helado.'], liga: ['fox'], modos: ['fox'],
  insignias: ['crane'], mascotas: ['cat', 'Aquí agregas a sus mascotas para que vivan en la app.'], alcancia: ['tanuki'],
  jibun: ['cat'], gratitud: ['crane'], regalos: ['rabbit'],
};
export const sections = () => Object.keys(SECTION).filter((id) => HINTS[id]);
function sectionSteps(id) {
  const [pet, action] = SECTION[id];
  const steps = [{ pet, target: '.page-head', text: HINTS[id] }];
  const btn = visible('main .page-head .btn:not(.more-back)') || visible('main .page-head button:not(.icon-btn)');
  if (btn) steps.push({ pet, target: () => visible('main .page-head .btn:not(.more-back)') || visible('main .page-head button:not(.icon-btn)'), text: action || 'Y con este botón empiezas. ¡Pruébalo cuando quieras!' });
  if (visible('main .hub-tabs')) steps.push({ pet, target: 'main .hub-tabs', text: 'Arriba cambias entre las partes que van juntas.' });
  steps[steps.length - 1].last = true;
  return steps;
}

// ---------- starting ----------
let running = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The main tour, the first time Inicio is shown on this device. */
export async function maybeMain() {
  const s = state();
  if (running || s.main || s.off || !auto()) return;
  await sleep(700);
  if (running || location.hash.split('?')[0] !== '#/inicio' || document.querySelector('.modal, dialog[open], .lock-screen')) return;
  start('main');
}
/** A section's own little tour, the first time it opens. Returns true when it will run. */
export function maybeSection(id) {
  const s = state();
  if (running || !SECTION[id] || !HINTS[id] || s.off || s.seen?.[id] || !auto()) return false;
  setTimeout(() => { if (!running && router.currentRoute()?.path === `/${id}` && !document.querySelector('.modal, dialog[open]')) start(id); }, 650);
  return true;
}

/** Runs a tour now: 'main' or a section id. */
export async function start(which = 'main') {
  if (running) running.stop(false);
  await pets.load();
  if (which !== 'main') { // let the section finish drawing its header and buttons first
    for (let t = 0; t < 20 && !visible('main .page-head .page-actions, main .page-head + *'); t++) await sleep(100);
    await sleep(300);
    if (running || router.currentRoute()?.path !== `/${which}`) return;
  }
  const steps = which === 'main' ? MAIN() : (SECTION[which] ? sectionSteps(which) : []);
  if (!steps.length) return;
  running = new Tour(which, steps);
  running.go(0);
}
export const isRunning = () => !!running;

// ---------- the overlay ----------
const PAD = 8;
class Tour {
  constructor(which, steps) {
    this.which = which; this.steps = steps; this.i = -1; this.petNow = null;
    this.reduced = util.prefersReducedMotion();
    this.hole = el('div', { class: 'tour-hole', 'aria-hidden': 'true' });
    this.guide = el('div', { class: 'tour-guide', 'aria-hidden': 'true' });
    this.say = el('p', { class: 'tour-text', 'aria-live': 'polite' });
    this.who = el('strong', { class: 'tour-who' });
    this.count = el('span', { class: 'tour-count' });
    this.next = el('button', { class: 'btn btn-primary btn-small tour-next', type: 'button', onClick: (e) => { e.stopPropagation(); this.advance(true); } });
    this.bubble = el('div', { class: 'tour-bubble' }, this.who, this.say, el('div', { class: 'tour-row' }, this.count, this.next));
    this.dock = el('div', { class: 'tour-dock' }, this.guide, this.bubble);
    this.skip = el('button', { class: 'tour-skip', type: 'button', onClick: (e) => { e.stopPropagation(); this.stop(true); } },
      icon('x', { size: 16 }), which === 'main' ? 'Saltar tutorial' : 'Saltar');
    this.root = el('div', { class: `tour${this.reduced ? ' is-still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': which === 'main' ? 'Recorrido por la app' : 'Cómo funciona esta sección' },
      this.hole, this.dock, this.skip);
    this.root.addEventListener('click', (e) => this.onTap(e));
    this.onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.stop(true); }
      else if (e.key === 'Tab') { // keep the focus inside the tour
        const f = [this.skip, this.next]; const at = f.indexOf(document.activeElement);
        e.preventDefault(); f[(at + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    };
    this.onResize = () => this.place(false);
    document.addEventListener('keydown', this.onKey, true);
    addEventListener('resize', this.onResize);
    document.body.append(this.root);
    document.documentElement.classList.add('is-touring');
    requestAnimationFrame(() => this.root.classList.add('is-on'));
  }

  current() { return this.steps[this.i]; }
  find(step) {
    if (!step.target) return null;
    return typeof step.target === 'function' ? step.target() : visible(step.target);
  }

  async go(i) {
    this.i = i;
    const step = this.current();
    if (!step) { this.stop(false); return; }
    this.root.classList.add('is-moving');
    if (step.route && router.currentRoute()?.path !== step.route) { router.go(step.route); await sleep(120); }
    let target = null;
    if (step.target) {
      for (let t = 0; t < 30 && !(target = this.find(step)); t++) await sleep(100); // wait for the screen to draw
      if (!target) { this.go(i + 1); return; } // not on this screen (already done, or hidden): skip it
      target.scrollIntoView({ block: 'center', behavior: this.reduced ? 'auto' : 'smooth' });
      await sleep(this.reduced ? 30 : 380);
    }
    if (this.i !== i || !this.root.isConnected) return;
    this.target = target;
    // the friend for this step (and its voice, when it is a new one)
    if (step.pet !== this.petNow) {
      this.petNow = step.pet;
      this.guide.replaceChildren(draw(step.pet));
      this.guide.className = `tour-guide pet-${step.pet}`;
      sounds.play(step.pet);
    }
    this.who.textContent = pets.nameOf(step.pet);
    this.say.textContent = step.text;
    this.count.textContent = this.steps.length > 1 ? `${i + 1} de ${this.steps.length}` : '';
    this.next.textContent = step.tap || (step.last || i === this.steps.length - 1 ? '¡Listo!' : 'Siguiente');
    this.root.classList.toggle('is-tap', !!step.tap);
    this.place(true);
    this.root.classList.remove('is-moving');
    this.next.focus({ preventScroll: true });
  }

  /** Lights up the target and walks the friend next to it (above or below, wherever there is room). */
  place(walk) {
    const vw = innerWidth; const vh = innerHeight; const r = this.target?.getBoundingClientRect();
    if (r) {
      const top = Math.max(PAD, r.top - PAD); const left = Math.max(PAD, r.left - PAD);
      const w = Math.min(vw - PAD, r.right + PAD) - left; const h = Math.min(Math.min(vh - PAD, r.bottom + PAD) - top, vh * 0.55);
      Object.assign(this.hole.style, { transform: `translate(${left}px, ${top}px)`, width: `${w}px`, height: `${h}px`, opacity: '1' });
      this.hole.dataset.rect = JSON.stringify({ top, left, w, h });
    } else {
      Object.assign(this.hole.style, { transform: `translate(${vw / 2}px, ${vh / 2}px)`, width: '0px', height: '0px', opacity: '0' });
      this.hole.dataset.rect = '';
    }
    const dh = this.dock.offsetHeight || 170; const dw = Math.min(this.dock.offsetWidth || 360, vw - 24);
    let y; let x;
    if (!r) { y = (vh - dh) / 2; x = (vw - dw) / 2; }
    else {
      const hb = this.hole.dataset.rect ? JSON.parse(this.hole.dataset.rect) : { top: r.top, h: r.height };
      const below = vh - (hb.top + hb.h); const above = hb.top;
      y = below >= dh + 20 ? hb.top + hb.h + 14 : above >= dh + 20 ? hb.top - dh - 14 : vh - dh - 16;
      x = Math.min(Math.max(12, r.left + r.width / 2 - dw / 2), vw - dw - 12);
    }
    this.dock.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.dock.classList.toggle('is-above', !!r && y < (r.top || 0));
    if (walk && !this.reduced) { this.guide.classList.remove('is-walking'); void this.guide.offsetWidth; this.guide.classList.add('is-walking'); }
  }

  inHole(e) {
    const rc = this.hole.dataset.rect ? JSON.parse(this.hole.dataset.rect) : null;
    return rc && e.clientX >= rc.left && e.clientX <= rc.left + rc.w && e.clientY >= rc.top && e.clientY <= rc.top + rc.h;
  }
  onTap(e) {
    if (this.root.classList.contains('is-moving') || e.target.closest('.tour-skip, .tour-next')) return;
    const step = this.current(); if (!step) return;
    if (step.tap) {
      if (this.inHole(e)) this.advance(true);
      else { this.hole.classList.remove('is-nudge'); void this.hole.offsetWidth; this.hole.classList.add('is-nudge'); util.haptic(8); }
      return;
    }
    this.advance(false);
  }
  /** Next step; on a "tap it yourself" step it opens the lit thing first, and the tour follows. */
  advance() {
    const step = this.current(); if (!step) return;
    if (step.tap && this.target) this.target.click();
    if (step.last || this.i >= this.steps.length - 1) { this.stop(false); return; }
    this.go(this.i + 1);
  }

  stop(skipped) {
    if (!this.root.isConnected) return;
    document.removeEventListener('keydown', this.onKey, true);
    removeEventListener('resize', this.onResize);
    this.root.classList.remove('is-on');
    document.documentElement.classList.remove('is-touring');
    setTimeout(() => this.root.remove(), this.reduced ? 0 : 260);
    if (this.which === 'main') {
      write({ main: skipped ? 'skipped' : 'done', ...(skipped ? { off: true } : {}) });
      document.dispatchEvent(new CustomEvent('tour:done'));
      if (skipped) import('../core/ui.js').then((ui) => ui.toast('Listo, sin tutorial. Puedes verlo cuando quieras en Ajustes, en «Legal y ayuda».'));
    } else {
      const s = state(); write({ seen: { ...s.seen, [this.which]: 1 } });
    }
    if (running === this) running = null;
  }
}
