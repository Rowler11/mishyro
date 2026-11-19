// App bootstrap: database, theme, profile, security layers, navigation shell,
// router, service worker and global shortcuts.
import { CONFIG, db, router, theme, ui, security, seed, profile, util, cryptoBox } from './core.js';
import { TABS, GROUPS, HIDDEN, SETTINGS_PAGES } from './routes.js';

const { el, icon, ja } = util;

export const app = {
  CONFIG,
  deferredInstall: null,
  setupDone: false,
  shareTarget: null,
  swRegistration: null,
  firstRender: true,
};

// ---------- route table ----------
const load = {
  placeholder: () => import('./features/placeholder.js'),
  more: () => import('./features/more.js'),
  settings: () => import('./features/settings.js'),
  styleguide: () => import('./features/styleguide.js'),
  setup: () => import('./features/setup.js'),
};

function registerSection(base, def) {
  const d = { ...def, load: def.load || load.placeholder };
  router.register(base, d);
  router.register(`${base}/:a`, d);
  router.register(`${base}/:a/:b`, d);
  router.register(`${base}/:a/:b/:c`, d);
}

function registerRoutes() {
  router.register('/setup', { id: 'setup', title: 'Configuración inicial', layer: true, load: load.setup });
  router.register('/setup/historia', { id: 'historia', title: 'Bienvenida', layer: true, load: load.setup });
  router.register('/mas', { ...TABS[4], load: load.more, tab: 'mas' });
  router.register('/ajustes/guia-estilo', { id: 'guia-estilo', title: 'Guía de estilo', tab: 'mas', load: load.styleguide });
  router.register('/ajustes', { ...GROUPS.at(-1).sections[0], tab: 'mas', load: load.settings });
  router.register('/ajustes/legal/:doc', { id: 'legal-doc', title: 'Legal y ayuda', tab: 'mas', load: load.settings });
  for (const p of SETTINGS_PAGES) router.register(`/ajustes/${p.id}`, { ...p, id: `ajustes/${p.id}`, settingsPage: p.id, tab: 'mas', load: p.phase === '1' ? load.settings : load.placeholder });
  for (const t of TABS.slice(0, 4)) registerSection(t.path, { ...t, tab: t.id });
  for (const g of GROUPS) for (const s of g.sections) if (!s.id.startsWith('ajustes')) registerSection(`/${s.id}`, { ...s, group: g.id, tab: 'mas' });
  for (const s of HIDDEN) registerSection(`/${s.id}`, { ...s, tab: 'mas', neutral: s.id === 'yoru' });
  router.register('/no-encontrado', { id: 'no-encontrado', title: 'No encontrado', notFound: true, tab: 'mas', load: load.placeholder });
}

const lockScope = (def) => (def?.lock === 'person' ? `person:${profile.active()}` : def?.lock || null);

// ---------- shell ----------
let shell = null;
function buildShell() {
  const tabLink = (t, cls) => el('a', {
    class: `${cls} tab`, href: `#${t.path}`, dataset: { tab: t.id },
    'aria-label': `${t.title}${cls === 'rail-link' ? '' : ''}`,
  }, el('span', { class: 'tab-icon' }, icon(t.icon)), el('span', { class: 'tab-name' }, t.title));

  const profileChip = (cls) => el('button', { class: `profile-chip ${cls}`, type: 'button', onClick: switchProfile },
    el('span', { class: 'profile-dot', 'aria-hidden': 'true' }), el('span', { class: 'profile-text' }));
  const panicBtn = (cls) => el('button', { class: `icon-btn panic-btn ${cls}`, type: 'button', 'aria-label': 'Cubrir la app (pánico)', title: 'Cubrir la app · Esc dos veces', onClick: doPanic }, icon('eye-off'));

  const skip = el('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); document.getElementById('main').focus(); } }, 'Saltar al contenido');
  const appbar = el('header', { class: 'appbar' },
    el('a', { class: 'brand', href: '#/inicio', 'aria-label': 'Aishiteru, ir a Inicio' }, ui.logo({ size: 32 }), el('span', { class: 'brand-name' }, 'Aishiteru')),
    el('div', { class: 'appbar-actions' }, profileChip('chip-appbar'), panicBtn('panic-appbar')));
  const rail = el('nav', { class: 'rail', 'aria-label': 'Navegación principal' },
    el('a', { class: 'brand rail-brand', href: '#/inicio', 'aria-label': 'Aishiteru, ir a Inicio' }, ui.logo({ size: 40 }),
      el('span', { class: 'brand-text' }, el('span', { class: 'brand-name' }, 'Aishiteru'))),
    el('div', { class: 'rail-tabs' }, TABS.map((t) => tabLink(t, 'rail-link'))),
    el('div', { class: 'rail-foot' },
      tabLink({ id: 'ajustes', path: '/ajustes', title: 'Ajustes', jp: '設定', romaji: 'settei', icon: 'settings' }, 'rail-link'),
      profileChip('chip-rail'), panicBtn('panic-rail')));
  const indicator = el('span', { class: 'tabbar-indicator', 'aria-hidden': 'true' });
  const tabbar = el('nav', { class: 'tabbar', 'aria-label': 'Navegación principal' }, indicator, TABS.map((t) => tabLink(t, 'tabbar-link')));
  const main = el('main', { id: 'main', class: 'main', tabindex: '-1' });
  const root = document.getElementById('app');
  root.replaceChildren(skip, appbar, rail, main, tabbar);
  shell = { root, main, tabbar, indicator };
  updateProfileChips();
}

function updateNav(route) {
  const tab = route.def.tab || route.def.id;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    const on = a.dataset.tab === tab || (a.dataset.tab === 'ajustes' && route.path.startsWith('/ajustes'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const idx = Math.max(0, TABS.findIndex((t) => t.id === tab));
  shell?.indicator.style.setProperty('--tab', String(idx));
  document.documentElement.dataset.layer = route.def.layer ? 'full' : 'shell';
}

function updateProfileChips() {
  const who = profile.active();
  document.documentElement.dataset.profile = who;
  document.querySelectorAll('.profile-chip').forEach((b) => {
    b.querySelector('.profile-text').textContent = profile.name(who);
    b.setAttribute('aria-label', `Usa la app: ${profile.name(who)}. Tocar para cambiar a ${profile.name(profile.partnerOf(who))}`);
  });
}

async function switchProfile() {
  const next = profile.partnerOf(profile.active());
  security.lockSensitive();
  profile.setActive(next);
  updateProfileChips();
  ui.toast(`Ahora usa la app: ${profile.name(next)}`);
  util.haptic(10);
  router.refresh();
}

function doPanic() {
  security.panic({ goHome: () => router.go('/inicio', { replace: true }) });
}

// ---------- rendering ----------
let prevScope = null;
function onNavigate(route, prev) {
  ui.closeAllModals();
  const scope = lockScope(route.def);
  if (prevScope && prevScope !== scope && prevScope !== 'app') {
    security.getSettings().then((s) => { if (s.lockOnLeave) cryptoBox.lock(prevScope); });
  }
  prevScope = scope;
  if (prev) {
    const a = TABS.findIndex((t) => t.id === (prev.def.tab || prev.def.id));
    const b = TABS.findIndex((t) => t.id === (route.def.tab || route.def.id));
    document.documentElement.dataset.dir = b < a ? 'back' : 'forward';
  }
}

async function render(route) {
  if (!shell) buildShell();
  const { main } = shell;
  updateNav(route);
  const def = route.def;
  if (!app.setupDone && !def.layer) { router.go('/setup', { replace: true }); return; }
  document.title = def.neutral || !def.title ? 'Aishiteru' : `${def.title} · Aishiteru`;
  const scope = lockScope(def);
  if (scope && security.hasKey(scope) && !security.isUnlocked(scope)) {
    await security.lockScreen({ scope, neutralName: def.title, inline: true, mount: main });
    if (router.currentRoute() !== route) return;
  }
  main.replaceChildren(ui.skeleton(4));
  let node;
  try {
    const mod = await def.load();
    if (router.currentRoute() !== route) return;
    const out = await mod.render({ route, params: route.params, query: route.query, def, app });
    if (router.currentRoute() !== route) { out?.cleanup?.(); return; }
    node = out?.node || out;
    route.cleanup = out?.cleanup;
  } catch (e) {
    console.error(e);
    db.logError(e?.message, e?.stack, CONFIG.appVersion);
    node = el('section', { class: 'page' }, ui.pageHeader({ title: 'Algo salió mal' }),
      ui.emptyState({ title: 'No pudimos abrir esta parte', text: 'No se perdió nada. Intenta de nuevo.', art: 'omamori', action: { label: 'Reintentar', onClick: () => router.refresh() } }));
  }
  swapView(main, node);
  if (!app.firstRender) requestAnimationFrame(() => (main.querySelector('h1') || main).focus({ preventScroll: true }));
  app.firstRender = false;
  window.scrollTo({ top: 0 });
}

function swapView(main, node) {
  const motion = !util.prefersReducedMotion();
  if (motion && document.startViewTransition && !app.firstRender) {
    const vt = document.startViewTransition(() => main.replaceChildren(node));
    vt.ready.catch(() => {}); // a fast second navigation skips the first transition: not an error
  } else {
    main.replaceChildren(node);
    if (motion) node.classList?.add('view-enter');
  }
}

// ---------- global layers ----------
function splash() {
  return new Promise((resolve) => {
    const who = profile.active();
    const reduced = util.prefersReducedMotion();
    const layer = el('div', { class: 'splash', role: 'status', 'aria-label': 'Aishiteru' },
      el('div', { class: 'splash-heart', 'aria-hidden': 'true' }, icon('heart', { size: 64 })),
      el('p', { class: 'splash-for' }, `Para ${profile.nick(who)}`),
      ja('愛してる', 'aishiteru'),
      el('button', { class: 'btn btn-ghost btn-small splash-skip', type: 'button' }, 'Saltar'));
    const finish = () => { clearTimeout(t); layer.classList.add('leaving'); setTimeout(() => { layer.remove(); resolve(); }, reduced ? 0 : 300); };
    layer.addEventListener('click', finish);
    document.body.append(layer);
    const t = setTimeout(finish, reduced ? 600 : 1500);
  });
}

function showShortcuts() {
  const rows = [
    ['1 a 5', 'Inicio, Cápsula, Cuponera, Cartas y Más'],
    ['/', 'Buscar'],
    ['n', 'Crear algo nuevo en la sección abierta'],
    ['?', 'Ver esta lista'],
    ['Esc', 'Cerrar la ventana abierta'],
    ['Esc dos veces', 'Cubrir la app al instante (pánico)'],
  ];
  ui.openModal({ title: 'Atajos de teclado', size: 'sm', body: el('dl', { class: 'shortcuts' },
    rows.flatMap(([k, v]) => [el('dt', {}, el('kbd', {}, k)), el('dd', {}, v)])) });
}

function installShortcuts() {
  let lastEsc = 0;
  addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (e.key === 'Escape' && !ui.hasOpenModal()) {
      const now = Date.now();
      if (now - lastEsc < 500) { lastEsc = 0; doPanic(); } else lastEsc = now;
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || ui.hasOpenModal() || document.documentElement.dataset.layer === 'full') return;
    const tab = TABS.find((x) => x.key === e.key);
    if (tab) { e.preventDefault(); router.go(tab.path); return; }
    if (e.key === '/') { e.preventDefault(); router.go('/buscar'); return; }
    if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
    if (e.key === 'n') { document.dispatchEvent(new CustomEvent('app:new')); }
  });
}

function installVisibility() {
  const hide = async () => {
    const s = await security.getSettings();
    if (s.curtain) security.showCurtain();
    if (s.lockOnLeave) security.lockSensitive();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hide();
    else {
      security.hideCurtain();
      const scope = lockScope(router.currentRoute()?.def);
      if (scope && security.hasKey(scope) && !security.isUnlocked(scope)) router.refresh();
    }
  });
  addEventListener('pagehide', hide);
  if (matchMedia('(pointer: coarse)').matches) {
    addEventListener('blur', () => security.getSettings().then((s) => { if (s.curtain) security.showCurtain(); }));
    addEventListener('focus', () => security.hideCurtain());
  }
}

function installErrorHandler() {
  let shown = 0;
  const report = (msg, stack) => {
    db.logError(msg, stack, CONFIG.appVersion);
    if (Date.now() - shown > 8000) { shown = Date.now(); ui.toast('Algo no salió bien, pero tus datos están a salvo.', { tone: 'error' }); }
  };
  addEventListener('error', (e) => { if (e.error) report(e.message, e.error?.stack); });
  addEventListener('unhandledrejection', (e) => report(e.reason?.message || String(e.reason), e.reason?.stack));
}

function readShareTarget() {
  const q = new URLSearchParams(location.search);
  if (!['title', 'text', 'url'].some((k) => q.get(k))) return;
  app.shareTarget = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '' };
  history.replaceState(null, '', `${location.pathname}#/canciones/nueva`);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Reload only when a new version replaces an existing one, not on the first install (clients.claim).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    app.swRegistration = reg;
    const offer = (worker) => ui.toast('Hay una versión nueva de la app.', {
      timeout: 0, action: { label: 'Actualizar', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch((e) => db.logError(`sw: ${e.message}`, '', CONFIG.appVersion));
}

async function wipeEverything() {
  await db.deleteDatabase();
  try { localStorage.removeItem(`${CONFIG.storageKey}.theme`); localStorage.removeItem(`${CONFIG.storageKey}.activeProfile`); } catch { /* ignore */ }
  location.replace(`${location.pathname}#/setup`);
  location.reload();
}
app.wipeEverything = wipeEverything;

async function applySettings() {
  const [appearance, motion] = await Promise.all([
    db.getSettings('appearance', theme.APPEARANCE_DEFAULTS), db.getSettings('motion', theme.MOTION_DEFAULTS)]);
  theme.apply({ ...appearance, ...motion });
}
app.applySettings = applySettings;

function fatal(message) {
  document.getElementById('app').replaceChildren(el('section', { class: 'page fatal' },
    el('h1', {}, 'No se pudo abrir la app'), el('p', {}, message),
    el('p', {}, 'Si estás en modo incógnito o sin espacio, prueba en una ventana normal o libera espacio.')));
}

// ---------- start ----------
async function start() {
  theme.setStorageKey(CONFIG.storageKey);
  profile.init(CONFIG);
  installErrorHandler();
  readShareTarget();
  try { await db.open(CONFIG.storageKey); } catch (e) { fatal(e?.message || 'Error de almacenamiento.'); return; }
  await security.init({ wipe: wipeEverything, unlocked: () => router.refresh() });
  const meta = await db.getMeta();
  if (!meta.installId) await db.setMeta({ installId: util.uuid(), schemaVersion: db.SCHEMA_VERSION, createdAt: util.nowISO() });
  await seed.syncConfig(CONFIG);
  await profile.load();
  await applySettings();
  ui.installRipple();
  installShortcuts();
  installVisibility();
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.deferredInstall = e; });
  profile.onProfileChange(updateProfileChips);
  registerRoutes();

  const setupDone = !!meta.setupDone;
  app.setupDone = setupDone;
  if (!setupDone && !location.hash.startsWith('#/setup')) history.replaceState(null, '', `${location.pathname}#/setup`);
  if (setupDone && await security.appLockNeeded()) await security.lockScreen({ scope: 'app' });
  if (setupDone && meta.onboardingDone && !location.hash.startsWith('#/setup')) await splash();
  security.startInactivity(async () => {
    if (!(await security.getSettings()).appLock) return;
    security.markUiLocked(); cryptoBox.lockAll();
    await security.lockScreen({ scope: 'app' });
  });
  buildShell();
  await router.start({ render, navigate: onNavigate });
  registerServiceWorker();
  document.documentElement.classList.add('ready');
}

start();
