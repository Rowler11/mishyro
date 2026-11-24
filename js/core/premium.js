// Premium touches (v0.23.0): pull to refresh on Inicio, a soft rubber band at the end of a screen,
// swipe from the left edge to go back, and a calm "no internet" pill. Everything here is optional
// polish: if a gesture is not recognized, the normal controls keep working.
import { el, icon, haptic, prefersReducedMotion } from './util.js';
import * as router from './router.js';
import * as sync from './sync.js';
import { hasOpenModal } from './ui.js';

const ROOTS = ['/inicio', '/capsula', '/cupones', '/cartas', '/mas'];
const path = () => (location.hash.replace(/^#/, '').split('?')[0] || '/inicio');
const busy = () => hasOpenModal() || document.documentElement.dataset.layer === 'full' || document.querySelector('.splash, .latido-layer, .tour-layer');
const atTop = () => (window.scrollY || document.documentElement.scrollTop) <= 1;
const atBottom = () => window.innerHeight + (window.scrollY || 0) >= document.documentElement.scrollHeight - 2;

let ptr = null;
function ensurePtr() {
  if (ptr) return ptr;
  ptr = el('div', { class: 'ptr', 'aria-hidden': 'true' }, icon('brand-sakura', { size: 26 }));
  document.body.append(ptr);
  return ptr;
}

function installTouch() {
  let sx = 0; let sy = 0; let mode = ''; let dy = 0; let startedAtTop = false; let startedAtBottom = false;
  const main = () => document.querySelector('main');
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || busy()) { mode = ''; return; }
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dy = 0; mode = '';
    startedAtTop = atTop(); startedAtBottom = atBottom();
    if (sx < 18 && !ROOTS.includes(path())) mode = 'edge';
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1 || busy()) return;
    const t = e.touches[0]; const mx = t.clientX - sx; dy = t.clientY - sy;
    if (mode === 'edge') return;
    if (!mode) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(mx)) return;
      if (dy > 0 && startedAtTop && path() === '/inicio') mode = 'pull';
      else if (dy < 0 && startedAtBottom) mode = 'band';
      else return;
    }
    if (prefersReducedMotion()) return;
    if (mode === 'pull') {
      const d = Math.min(110, dy * 0.5);
      const p = ensurePtr(); p.style.setProperty('--ptr', `${d}px`); p.classList.add('is-on'); p.classList.toggle('is-ready', d >= 60);
    } else if (mode === 'band') {
      const m = main(); if (m) { m.style.transition = 'none'; m.style.transform = `translateY(${Math.max(-36, dy * 0.22)}px)`; }
    }
  }, { passive: true });
  const finish = (e) => {
    const m = main();
    if (m && m.style.transform) { m.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)'; m.style.transform = ''; setTimeout(() => { m.style.transition = ''; }, 380); }
    if (mode === 'edge') {
      const t = e.changedTouches?.[0]; const mx = t ? t.clientX - sx : 0; const my = t ? Math.abs(t.clientY - sy) : 99;
      if (mx > 80 && my < 70) { haptic('tap'); history.back(); }
    } else if (mode === 'pull' && ptr) {
      const ready = ptr.classList.contains('is-ready');
      ptr.classList.remove('is-on', 'is-ready'); ptr.style.removeProperty('--ptr');
      if (ready) refresh();
    }
    mode = '';
  };
  addEventListener('touchend', finish, { passive: true });
  addEventListener('touchcancel', () => { finish({}); }, { passive: true });
}

async function refresh() {
  haptic('select');
  const p = ensurePtr(); p.classList.add('is-busy');
  try { if (sync.isLinked()) await Promise.race([sync.syncNow(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* offline */ }
  router.refresh();
  setTimeout(() => p.classList.remove('is-busy'), 500);
}

// ---------- calm offline pill ----------
let pill = null; let hideT = 0;
function showPill(text, tone) {
  clearTimeout(hideT);
  if (!pill) { pill = el('div', { class: 'net-pill', role: 'status', 'aria-live': 'polite' }); document.body.append(pill); }
  pill.textContent = text; pill.dataset.tone = tone; pill.classList.add('is-on');
}
function installNet() {
  const off = () => showPill('Sin internet. Todo se guarda en este teléfono y se envía al volver.', 'off');
  const on = () => { showPill('Volvió la conexión.', 'on'); hideT = setTimeout(() => pill?.classList.remove('is-on'), 2200); if (sync.isLinked()) sync.syncNow().catch(() => {}); };
  addEventListener('offline', off); addEventListener('online', on);
  if (!navigator.onLine) off();
}

// ---------- drag and drop photos from the PC onto Galería (hands the files to the new-memory form) ----------
let dropped = [];
export function takeDropped() { const f = dropped; dropped = []; return f; }
function installDrop() {
  const media = (f) => f.type.startsWith('image/') || f.type.startsWith('video/');
  const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragover', (e) => { if (path() !== '/galeria' || busy() || !has(e)) return; e.preventDefault(); document.body.classList.add('is-dropping'); });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('is-dropping'); });
  addEventListener('drop', (e) => {
    document.body.classList.remove('is-dropping');
    if (path() !== '/galeria' || busy() || !has(e)) return;
    e.preventDefault();
    dropped = [...e.dataTransfer.files].filter(media);
    if (dropped.length) router.go('/capsula/nuevo');
  });
}

export function install() { installTouch(); installNet(); installDrop(); }
