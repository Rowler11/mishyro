// Shared UI components used by every section: modal, sheet/panel, confirm,
// toast, page header, empty state, hanko seal, ripple, share, skeleton,
// toggles, segmented control, "Los dos / Solo yo" picker and PIN pad.
import { el, icon, ja, haptic, prefersReducedMotion, uuid } from './util.js';
import { previousPath, parseHash } from './router.js';
import { GROUPS } from '../routes.js';

// ---------- live announcements ----------
let live;
export function announce(text) {
  if (!live) {
    live = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 50);
}

// ---------- toasts ----------
let toastBox;
export function toast(message, { action, timeout = 4500, tone = 'info' } = {}) {
  if (!toastBox) {
    toastBox = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const close = () => { t.classList.add('leaving'); setTimeout(() => t.remove(), prefersReducedMotion() ? 0 : 220); };
  const t = el('div', { class: `toast toast-${tone}` },
    el('span', { class: 'toast-text' }, message),
    action ? el('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { close(); action.onClick(); } }, action.label) : null,
    el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Cerrar aviso', onClick: close }, icon('x', { size: 18 })));
  toastBox.append(t);
  if (timeout) setTimeout(close, action ? timeout * 2 : timeout);
  return { close };
}

// ---------- modals, sheets and panels (with history + focus management) ----------
const stack = [];
let suppressPop = 0;
const popWaiters = [];
let historyIdle = Promise.resolve(); // pushState waits for a pending history.back()
function backQuietly() {
  suppressPop++;
  historyIdle = new Promise((r) => {
    const done = () => { const i = popWaiters.indexOf(done); if (i >= 0) popWaiters.splice(i, 1); r(); };
    popWaiters.push(done);
    setTimeout(done, 400);
  });
  history.back();
}
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

addEventListener('popstate', () => {
  if (suppressPop > 0) { suppressPop--; popWaiters[0]?.(); return; }
  const top = stack[stack.length - 1];
  if (top && top.dismissible) top.close(undefined, { fromHistory: true });
  else if (top) history.pushState({ modal: top.id }, '', location.href); // not dismissible: stay
});

// Esc closes the top window even when focus has not moved into it yet (a key pressed right after it opens).
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top && top.dismissible && !top.el.contains(e.target)) { e.stopImmediatePropagation(); top.close(); }
});

function setInert(on) {
  const app = document.getElementById('app');
  if (app) app.inert = on;
}

export const hasOpenModal = () => stack.length > 0;

/**
 * Open a dialog. kind: "dialog" (centered) or "sheet" (bottom sheet on phones,
 * side panel on desktop). actions: [{ label, variant, onClick(close) }].
 * Returns { el, body, close(result), result: Promise }.
 */
export function openModal({ title, jp, romaji, body, actions = [], size = 'md', kind = 'dialog', dismissible = true, className = '', onClose } = {}) {
  const id = uuid();
  const titleId = `t-${id}`;
  const opener = document.activeElement;
  let resolveResult;
  const result = new Promise((r) => { resolveResult = r; });
  const head = el('header', { class: 'modal-head' },
    el('div', { class: 'modal-titles' },
      el('h2', { class: 'modal-title', id: titleId, tabindex: '-1' }, title || '')),
    dismissible ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onClick: () => api.close() }, icon('x')) : null);
  const bodyBox = el('div', { class: 'modal-body' }, body || null);
  const foot = actions.length ? el('footer', { class: 'modal-foot' }, actions.map((a) => el('button', {
    class: `btn ${a.variant ? `btn-${a.variant}` : 'btn-secondary'}`, type: 'button',
    onClick: async () => { const keep = await a.onClick?.(api); if (keep !== false) api.close(a.value); },
  }, a.label))) : null;
  const panel = el('div', {
    class: `modal modal-${kind} modal-${size} ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
  }, kind === 'sheet' ? el('div', { class: 'sheet-grip', 'aria-hidden': 'true' }) : null, head, bodyBox, foot);
  const overlay = el('div', { class: `overlay overlay-${kind}` }, panel);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && dismissible) api.close(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); api.close(); }
    if (e.key === 'Tab') trapTab(e, panel);
  });
  let closed = false;
  const api = {
    id, el: panel, body: bodyBox, dismissible, result,
    close(value, { fromHistory = false, silent = false } = {}) {
      if (closed) return; closed = true;
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (!fromHistory && !silent) backQuietly();
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), prefersReducedMotion() ? 0 : 200);
      if (!stack.length) setInert(false);
      try { onClose?.(value); } catch (e) { console.error(e); }
      resolveResult(value);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    },
  };
  stack.push(api);
  historyIdle.then(() => { if (!closed) history.pushState({ modal: id }, '', location.href); else if (suppressPop) suppressPop--; });
  document.body.append(overlay);
  setInert(true);
  requestAnimationFrame(() => {
    const first = bodyBox.querySelector('[autofocus]') || panel.querySelector('.modal-title');
    first?.focus({ preventScroll: true });
  });
  return api;
}

function trapTab(e, panel) {
  const items = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0]; const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Close every modal without touching history (used on route changes). */
export function closeAllModals() { [...stack].reverse().forEach((m) => m.close(undefined, { silent: true })); }

/** Own replacement for confirm(). Resolves true/false. */
export function confirmDialog({ title = '¿Seguro?', message = '', confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false } = {}) {
  const m = openModal({
    title, size: 'sm', body: el('p', {}, message),
    actions: [
      { label: cancelLabel, variant: 'ghost', value: false },
      { label: confirmLabel, variant: danger ? 'danger' : 'primary', value: true },
    ],
  });
  return m.result.then((v) => v === true);
}

// ---------- page anatomy ----------
/** Where "back to Más" lands: the group the current section lives in, so the arrow returns there. */
function masTarget() {
  const id = parseHash().path.split('/')[1];
  const g = GROUPS.find((x) => x.sections.some((s) => s.id === id));
  return g ? `/mas/${g.id}` : '/mas';
}
function backLink(back) {
  const toMas = typeof back !== 'string' || back === '/mas';
  const path = toMas ? masTarget() : back;
  return el('a', { class: 'icon-btn page-back', href: `#${path}`, 'aria-label': 'Volver', onClick: (e) => {
    // Coming straight from that page (or, for a section, from Inicio or Más): step back in history,
    // so the arrow returns where you were and the phone's back button does not loop.
    const prev = previousPath();
    const same = prev === path || (toMas && (prev === '/inicio' || prev?.startsWith('/mas')));
    if (same && history.length > 1) { e.preventDefault(); history.back(); }
  } }, icon('arrow-left'));
}

export function pageHeader({ title, jp, romaji, back, actions = [] } = {}) {
  return el('header', { class: 'page-head' },
    back ? backLink(back) : null,
    el('div', { class: 'page-titles' },
      el('h1', { class: 'page-title', tabindex: '-1' }, title),
      jp ? ja(jp, romaji) : null),
    actions.length ? el('div', { class: 'page-actions' }, actions) : null);
}

const ART = {
  sakura: 'jp-sakura', torii: 'jp-torii', lantern: 'jp-chochin', fan: 'jp-sensu', crane: 'jp-tsuru',
  omamori: 'jp-omamori', moon: 'jp-moon', wave: 'jp-wave', envelope: 'jp-futo', ticket: 'jp-ticket',
};
/** The red thread (akai ito) that ties two little knots, drawn once (empty Cápsula, Fase 7). */
function redThread() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 96'); svg.setAttribute('class', 'empty-thread'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('pathLength', '1');
  path.setAttribute('d', 'M14 70C34 70 40 30 62 34C82 38 70 66 84 62C100 58 92 26 112 28C130 30 128 66 146 64');
  svg.append(path);
  for (const [cx, cy] of [[14, 70], [146, 64]]) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', '4.5'); svg.append(c); }
  return svg;
}
export function emptyState({ title, text, art = 'sakura', action } = {}) {
  return el('div', { class: 'empty' },
    art === 'thread' ? el('div', { class: 'empty-art', 'aria-hidden': 'true' }, redThread())
      : el('div', { class: 'empty-art', 'aria-hidden': 'true' }, icon(ART[art] || art, { size: 96, cls: 'empty-icon' }), el('span', { class: 'empty-ring' })),
    el('h2', { class: 'empty-title' }, title),
    text ? el('p', { class: 'empty-text' }, text) : null,
    action ? el('button', { class: 'btn btn-primary', type: 'button', onClick: action.onClick }, action.label) : null);
}

export function skeleton(lines = 3) {
  return el('div', { class: 'skeleton', role: 'status', 'aria-busy': 'true', 'aria-label': 'Cargando' },
    Array.from({ length: lines }, (_, i) => el('span', { class: 'skeleton-line', dataset: { i: String(i) } })));
}

/** The app logo (sakura with a heart), same file as the installed icon. */
/** Sakura mark without the app-icon tile: takes the theme accent (used in the app bar and rail). */
export function flower({ size = 30 } = {}) {
  return icon('brand-sakura', { size, cls: 'flower' });
}

export function logo({ size = 40, label = '', bloom = false } = {}) {
  return el('img', {
    class: `logo${bloom ? ' logo-bloom' : ''}`, src: './icons/icon.svg', width: String(size), height: String(size),
    alt: label, 'aria-hidden': label ? undefined : 'true', decoding: 'async',
  });
}

/** Round vermilion hanko seal with a kanji (default 愛). */
export function hanko({ text = '愛', size = 64, stamp = false, label } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', `hanko${stamp ? ' hanko-stamp' : ''}`);
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  svg.append(
    mk('circle', { cx: 50, cy: 50, r: 46, class: 'hanko-ring' }),
    mk('circle', { cx: 50, cy: 50, r: 39, class: 'hanko-inner' }));
  const t = mk('text', { x: 50, y: 52, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'hanko-text' });
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) t.setAttribute('lang', 'ja');
  t.textContent = text;
  svg.append(t);
  return svg;
}

// ---------- form controls ----------
/** The section's "add" button, next to the page title (decided 2026-11-19, no floating button). The "n" key presses it. */
export function newButton(label, onClick, iconName = 'plus') {
  const b = button({ label, iconName, variant: 'primary', small: true, onClick });
  b.classList.add('page-new');
  return b;
}

export function button({ label, iconName, variant = 'secondary', onClick, type = 'button', ariaLabel, small = false, href } = {}) {
  const cls = `btn btn-${variant}${small ? ' btn-small' : ''}`;
  const kids = [iconName ? icon(iconName, { size: 20 }) : null, label ? el('span', {}, label) : null];
  if (href) return el('a', { class: cls, href, 'aria-label': ariaLabel }, kids);
  return el('button', { class: cls, type, onClick, 'aria-label': ariaLabel }, kids);
}

export function field({ label, control, hint, error, id = `f-${uuid().slice(0, 8)}` } = {}) {
  control.id = control.id || id;
  const hintId = `${control.id}-hint`; const errId = `${control.id}-err`;
  const describedBy = [hint ? hintId : null, `${errId}`].filter(Boolean).join(' ');
  control.setAttribute('aria-describedby', describedBy);
  const err = el('p', { class: 'field-error', id: errId, role: 'alert' }, error || '');
  const wrap = el('div', { class: 'field' },
    el('label', { class: 'field-label', for: control.id }, label),
    control,
    hint ? el('p', { class: 'field-hint', id: hintId }, hint) : null,
    err);
  wrap.setError = (msg) => { err.textContent = msg || ''; control.setAttribute('aria-invalid', msg ? 'true' : 'false'); wrap.classList.toggle('has-error', !!msg); };
  return wrap;
}

export function input(attrs = {}) { return el('input', { class: 'input', type: 'text', ...attrs }); }
/** A textarea takes its text from .value (a "value" attribute does nothing), so it is set here. */
export function textarea({ value, ...attrs } = {}) {
  const t = el('textarea', { class: 'input textarea', rows: 4, ...attrs });
  if (value != null) t.value = String(value);
  return t;
}

/** Accessible switch (checkbox with role="switch"). */
export function toggle({ label, checked = false, onChange, hint, disabled = false } = {}) {
  const id = `sw-${uuid().slice(0, 8)}`;
  const inputEl = el('input', { type: 'checkbox', role: 'switch', id, class: 'switch-input', checked: !!checked, disabled });
  inputEl.addEventListener('change', () => { haptic(8); onChange?.(inputEl.checked); });
  return el('div', { class: 'switch-row' },
    el('label', { class: 'switch-label', for: id }, el('span', {}, label), hint ? el('span', { class: 'switch-hint' }, hint) : null),
    el('span', { class: 'switch' }, inputEl, el('span', { class: 'switch-track', 'aria-hidden': 'true' }, el('span', { class: 'switch-thumb' }))));
}

/** Radio-group segmented control. */
export function segmented({ label, options, value, onChange, name = `seg-${uuid().slice(0, 8)}` } = {}) {
  const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    const id = `${name}-${o.value}`;
    const r = el('input', { type: 'radio', name, id, value: o.value, class: 'segmented-input', checked: o.value === value });
    r.addEventListener('change', () => { if (r.checked) { haptic(8); onChange?.(o.value); } });
    group.append(r, el('label', { for: id, class: 'segmented-option' }, o.icon ? icon(o.icon, { size: 18 }) : null, el('span', {}, o.label)));
  }
  return group;
}

/**
 * "Los dos / Solo yo" picker. onChange("shared" | "self").
 * The caller handles the personal-PIN offer the first time "self" is chosen.
 */
export function visibilityPicker({ value = 'shared', onChange } = {}) {
  return el('div', { class: 'visibility-picker' },
    el('span', { class: 'field-label', id: 'vis-label' }, '¿Quién lo ve?'),
    segmented({ label: '¿Quién lo ve?', value, onChange, options: [
      { value: 'shared', label: 'Los dos', icon: 'users' },
      { value: 'self', label: 'Solo yo', icon: 'lock' },
    ] }));
}

/**
 * Numeric PIN pad. A real password input keeps it usable with a screen reader
 * and a physical keyboard; the on-screen keys write into it.
 * onSubmit(pin) -> Promise<string|void>: return an error text to show it.
 */
export const PIN_DIGITS = 4; // app and personal PINs (the private corner uses its own length)

export function pinPad({ label = 'PIN', min = PIN_DIGITS, max = PIN_DIGITS, onSubmit, submitLabel = 'Entrar', autoSubmit = min === max } = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const id = `pin-${uuid().slice(0, 8)}`;
  const inp = el('input', {
    id, class: 'pin-input', type: 'password', inputmode: coarse ? 'none' : 'numeric', autocomplete: 'off',
    maxlength: String(max), pattern: '[0-9]*', 'aria-describedby': `${id}-msg`,
  });
  const dots = el('div', { class: 'pin-dots', 'aria-hidden': 'true' }, Array.from({ length: max }, () => el('span', { class: 'pin-dot' })));
  const msg = el('p', { class: 'pin-msg', id: `${id}-msg`, role: 'alert' });
  let busy = false;
  const sync = () => {
    inp.value = inp.value.replace(/\D/g, '').slice(0, max);
    [...dots.children].forEach((d, i) => { d.classList.toggle('on', i < inp.value.length); d.classList.toggle('extra', i >= min); });
    ok.disabled = inp.value.length < min || busy;
  };
  const submit = async () => {
    if (inp.value.length < min || busy) return;
    busy = true; sync();
    const err = await onSubmit?.(inp.value);
    busy = false;
    if (err) {
      msg.textContent = err; inp.value = ''; sync();
      root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); haptic([30, 40, 30]);
    } else msg.textContent = '';
    sync();
  };
  const press = (d) => { if (inp.value.length < max) { inp.value += d; haptic(6); sync(); if (autoSubmit && inp.value.length === max) submit(); } };
  inp.addEventListener('input', () => { sync(); if (autoSubmit && inp.value.length === max) submit(); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  const key = (d) => el('button', { type: 'button', class: 'pin-key', onClick: () => press(d) }, d);
  const ok = el('button', { type: 'button', class: 'pin-key pin-ok', onClick: submit, 'aria-label': submitLabel, disabled: true }, icon('check'));
  const del = el('button', { type: 'button', class: 'pin-key pin-del', 'aria-label': 'Borrar un dígito', onClick: () => { inp.value = inp.value.slice(0, -1); sync(); } }, icon('delete'));
  const root = el('div', { class: 'pin-pad' },
    el('label', { class: 'pin-label', for: id }, label), inp, dots, msg,
    el('div', { class: 'pin-keys' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key), del, key('0'), ok));
  root.focusInput = () => inp.focus({ preventScroll: true });
  root.setMessage = (t) => { msg.textContent = t || ''; };
  root.setDisabled = (on) => { busy = on; inp.disabled = on; root.querySelectorAll('.pin-key').forEach((b) => { b.disabled = on; }); if (!on) sync(); };
  sync();
  return root;
}

// ---------- motion helpers ----------
/** Staggered entrance for a container's children (CSS reads --i). */
export function stagger(container) {
  [...container.children].forEach((c, i) => { c.style.setProperty('--i', String(Math.min(i, 6))); c.classList.add('stagger'); });
  return container;
}

/** Water-ripple feedback on buttons and cards. Installed once. */
export function installRipple() {
  // Fires on click, not pointerdown: a finger that starts a scroll never clicks, so nothing flashes while scrolling.
  document.addEventListener('click', (e) => {
    const host = e.target.closest('.btn, .card-link, .tab, .pin-key, .ripple');
    if (!host || prefersReducedMotion() || host.disabled) return;
    const r = host.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 2;
    // Keyboard clicks carry no coordinates: start from the center.
    const fromPointer = e.detail > 0 && (e.clientX || e.clientY);
    const x = fromPointer ? e.clientX - r.left : r.width / 2;
    const y = fromPointer ? e.clientY - r.top : r.height / 2;
    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.width = dot.style.height = `${s}px`;
    dot.style.left = `${x - s / 2}px`;
    dot.style.top = `${y - s / 2}px`;
    host.append(dot);
    setTimeout(() => dot.remove(), 650);
  }, { passive: true, capture: true });
}

/** Short burst of paper confetti for celebrations. Skipped when motion is reduced. */
export function confetti({ count = 42 } = {}) {
  if (prefersReducedMotion()) return;
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => el('span', {
      class: `confetti-bit c${i % 4}`,
      style: { '--x': `${Math.round(Math.random() * 100)}vw`, '--d': `${Math.round(Math.random() * 500)}ms`, '--r': `${Math.round(Math.random() * 720 - 360)}deg`, '--s': (0.7 + Math.random() * 0.6).toFixed(2) },
    })));
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

// ---------- share ----------
/** Share with the system sheet, falling back to copying the text. */
export async function share({ title, text, url } = {}) {
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  try {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
    toast('Copiado. Ya lo puedes pegar donde quieras.', { tone: 'success' });
    return 'copied';
  } catch { toast('No se pudo compartir en este dispositivo.', { tone: 'error' }); return 'failed'; }
}
export function shareButton(data, { label = 'Compartir', variant = 'secondary' } = {}) {
  return button({ label, iconName: 'share-2', variant, onClick: () => share(typeof data === 'function' ? data() : data) });
}
