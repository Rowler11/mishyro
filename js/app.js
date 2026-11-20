// App bootstrap: database, theme, profile, security layers, navigation shell,
// router, service worker and global shortcuts.
import { CONFIG, db, router, theme, ui, security, seed, profile, util, cryptoBox, sync } from './core.js';
import { TABS, GROUPS, HIDDEN, SETTINGS_PAGES } from './routes.js';

const { el, icon, ja } = util;

export const app = {
  CONFIG,
  deferredInstall: null,
  setupDone: false,
  shareTarget: null,
  sharedSticker: false,
  swRegistration: null,
  firstRender: true,
};

// ---------- route table ----------
const load = {
  placeholder: () => import('./features/placeholder.js'),
  listas: () => import('./features/listas.js'),
  mascotas: () => import('./features/mascotas.js'),
  recetas: () => import('./features/recetas.js'),
  alcancia: () => import('./features/alcancia.js'),
  gastos: () => import('./features/gastos.js'),
  habitos: () => import('./features/habitos.js'),
  rasca: () => import('./features/rasca.js'),
  ciclo: () => import('./features/ciclo.js'),
  home: () => import('./features/home.js'),
  capsula: () => import('./features/capsula.js'),
  cupones: () => import('./features/cupones.js'),
  cartas: () => import('./features/cartas.js'),
  more: () => import('./features/more.js'),
  settings: () => import('./features/settings.js'),
  ajustes: () => import('./features/ajustes.js'),
  perfil: () => import('./features/perfil.js'),
  privacidad: () => import('./features/privacidad.js'),
  buscar: () => import('./features/buscar.js'),
  styleguide: () => import('./features/styleguide.js'),
  setup: () => import('./features/setup.js'),
  sync: () => import('./features/sync.js'),
  preguntas: () => import('./features/preguntas.js'),
  canciones: () => import('./features/canciones.js'),
  diario: () => import('./features/diario.js'),
  animo: () => import('./features/animo.js'),
  calendario: () => import('./features/calendario.js'),
  fechas: () => import('./features/fechas.js'),
  recordatorios: () => import('./features/recordatorios.js'),
  jibun: () => import('./features/jibun.js'),
  retos: () => import('./features/retos.js'),
  galeria: () => import('./features/galeria.js'),
  mapa: () => import('./features/mapa.js'),
  album: () => import('./features/album.js'),
  'primeras-veces': () => import('./features/primeras-veces.js'),
  photobooth: () => import('./features/photobooth.js'),
  'capsula-tiempo': () => import('./features/capsula-tiempo.js'),
  planes: () => import('./features/planes.js'),
  suenos: () => import('./features/suenos.js'),
  citas: () => import('./features/citas.js'),
  regalos: () => import('./features/regalos.js'),
  encuentro: () => import('./features/encuentro.js'),
  voz: () => import('./features/voz.js'),
  insignias: () => import('./features/insignias.js'),
  resumen: () => import('./features/resumen.js'),
  lenguajes: () => import('./features/lenguajes.js'),
  gratitud: () => import('./features/gratitud.js'),
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
  router.register('/unir', { id: 'unir', title: 'Traerlos de otro equipo', layer: true, load: load.sync });
  router.register('/mas', { ...TABS[4], load: load.more, tab: 'mas' });
  router.register('/mas/:a', { ...TABS[4], load: load.more, tab: 'mas' });
  router.register('/ajustes/guia-estilo', { id: 'guia-estilo', title: 'Guía de estilo', tab: 'mas', load: load.styleguide });
  router.register('/ajustes', { ...GROUPS.at(-1).sections[0], tab: 'mas', load: load.settings });
  router.register('/ajustes/legal/:doc', { id: 'legal-doc', title: 'Legal y ayuda', tab: 'mas', load: load.settings });
  for (const p of SETTINGS_PAGES) router.register(`/ajustes/${p.id}`, { ...p, id: `ajustes/${p.id}`, settingsPage: p.id, tab: 'mas', load: load[p.module] || load.placeholder });
  for (const t of TABS.slice(0, 4)) registerSection(t.path, { ...t, tab: t.id, load: load[{ inicio: 'home', capsula: 'capsula', cupones: 'cupones', cartas: 'cartas' }[t.id]] });
  for (const g of GROUPS) for (const s of g.sections) if (!s.id.startsWith('ajustes')) registerSection(`/${s.id}`, { ...s, group: g.id, tab: 'mas', load: load[s.module] });
  for (const s of HIDDEN) registerSection(`/${s.id}`, { ...s, tab: s.id === 'buscar' ? 'buscar' : 'mas', neutral: s.id === 'yoru', load: load[s.module] });
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
    el('span', { class: 'profile-dot', 'aria-hidden': 'true' }), el('span', { class: 'profile-initial', 'aria-hidden': 'true' }), el('span', { class: 'profile-text' }));
  const searchBtn = el('a', { class: 'icon-btn search-btn', href: '#/buscar', 'aria-label': 'Buscar', title: 'Buscar · tecla /' }, icon('search'));
  const panicBtn = (cls) => el('button', { class: `icon-btn panic-btn ${cls}`, type: 'button', 'aria-label': 'Cubrir la app (pánico)', title: 'Cubrir la app · Esc dos veces', onClick: doPanic }, icon('eye-off'));

  const skip = el('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); document.getElementById('main').focus(); } }, 'Saltar al contenido');
  const appbar = el('header', { class: 'appbar' },
    el('a', { class: 'brand', href: '#/inicio', 'aria-label': 'Aishiteru, ir a Inicio' }, ui.flower({ size: 30 }), el('span', { class: 'brand-name' }, 'Aishiteru')),
    el('div', { class: 'appbar-actions' }, searchBtn, profileChip('chip-appbar'), panicBtn('panic-appbar')));
  const rail = el('nav', { class: 'rail', 'aria-label': 'Navegación principal' },
    el('a', { class: 'brand rail-brand', href: '#/inicio', 'aria-label': 'Aishiteru, ir a Inicio' }, ui.flower({ size: 36 }),
      el('span', { class: 'brand-text' }, el('span', { class: 'brand-name' }, 'Aishiteru'))),
    el('div', { class: 'rail-tabs' }, TABS.map((t) => tabLink(t, 'rail-link'))),
    el('div', { class: 'rail-foot' },
      tabLink({ id: 'buscar', path: '/buscar', title: 'Buscar', icon: 'search' }, 'rail-link'),
      tabLink({ id: 'ajustes', path: '/ajustes', title: 'Ajustes', jp: '設定', romaji: 'settei', icon: 'settings' }, 'rail-link'),
      profileChip('chip-rail'), panicBtn('panic-rail')));
  // The bubble mirrors the active tab's icon; the links underneath stay the real controls.
  const indicator = el('span', { class: 'tabbar-bubble', 'aria-hidden': 'true' });
  const tabbar = el('nav', { class: 'tabbar', 'aria-label': 'Navegación principal' },
    el('span', { class: 'tabbar-bg', 'aria-hidden': 'true' }), indicator, TABS.map((t) => tabLink(t, 'tabbar-link')));
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
  const idx = TABS.findIndex((t) => t.id === tab);
  if (shell) {
    shell.tabbar.classList.toggle('is-none', idx < 0); // Buscar and Ajustes have no bottom tab
    if (idx >= 0 && shell.tabbar.dataset.tab !== String(idx)) {
      shell.tabbar.dataset.tab = String(idx);
      shell.tabbar.style.setProperty('--tabx', String(idx));
      shell.indicator.replaceChildren(icon(TABS[idx].icon));
      shell.indicator.classList.remove('is-pop'); void shell.indicator.offsetWidth; shell.indicator.classList.add('is-pop');
    }
  }
  document.documentElement.dataset.layer = route.def.layer ? 'full' : 'shell';
}

function updateProfileChips() {
  const who = profile.active();
  document.documentElement.dataset.profile = who;
  document.querySelectorAll('.profile-chip').forEach((b) => {
    b.querySelector('.profile-text').textContent = profile.name(who);
    b.querySelector('.profile-initial').textContent = [...profile.name(who)][0] || '?';
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
  // Keep the current view until the next one is ready; show the skeleton only if it takes a while.
  const skeleton = setTimeout(() => { if (router.currentRoute() === route) main.replaceChildren(ui.skeleton(4)); }, 250);
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
  clearTimeout(skeleton);
  const swapped = swapView(main, node);
  // Focus the new view's search box or title once it is in place.
  if (!app.firstRender) swapped.then(() => requestAnimationFrame(() => (main.querySelector('[data-autofocus]') || main.querySelector('h1') || main).focus({ preventScroll: true })));
  if (app.firstRender) preloadSections();
  app.firstRender = false;
  if (app.keepScroll != null) { const y = app.keepScroll; app.keepScroll = null; requestAnimationFrame(() => window.scrollTo({ top: y })); } else window.scrollTo({ top: 0 });
}

function swapView(main, node) {
  // A plain CSS entrance instead of a view transition: it never blocks taps, so switching is instant.
  main.replaceChildren(node);
  if (!app.firstRender && !util.prefersReducedMotion()) node.classList?.add('view-enter');
  return Promise.resolve();
}

/** Warm up the main sections once the app is idle, so the first switch to them has nothing to fetch. */
function preloadSections() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => { for (const k of ['home', 'capsula', 'cupones', 'cartas', 'more', 'settings', 'buscar']) load[k]().catch(() => {}); });
}

// ---------- global layers ----------
// The full opening (petals into a heart, decided 2026-11-19) plays on the first open of each day; other opens keep the short welcome.
const INTRO_KEY = () => `${CONFIG.storageKey}.intro.day`;
function introDue(mode) {
  if (mode === 'always') return true;
  try { return localStorage.getItem(INTRO_KEY()) !== util.localDay(); } catch { return false; }
}

/** Welcome layer. `intro` forces the opening heart; otherwise it follows Ajustes > Movimiento. */
function splash({ ready = Promise.resolve(), intro = null, mode = 'daily' } = {}) {
  return new Promise((resolve) => {
    const who = profile.active();
    const reduced = util.prefersReducedMotion();
    const full = !reduced && (intro ?? introDue(mode));
    const layer = el('div', { class: `splash${full ? ' splash-intro' : ''}`, role: 'status', 'aria-label': 'Aishiteru' },
      el('div', { class: 'splash-heart', 'aria-hidden': 'true' }, icon('heart', { size: 64 })),
      el('p', { class: 'splash-for' }, `Para ${profile.nick(who)}`),
      ja('愛してる', 'aishiteru'),
      el('small', { class: 'splash-romaji', 'aria-hidden': 'true' }, 'aishiteru'),
      el('button', { class: 'btn btn-ghost btn-small splash-skip', type: 'button' }, 'Saltar'));
    let t = 0;
    let stop = () => {};
    let gone = false;
    const finish = () => {
      if (gone) return; gone = true;
      clearTimeout(t); stop();
      layer.classList.add('leaving');
      setTimeout(() => { layer.remove(); resolve(); }, reduced ? 0 : 300);
    };
    layer.addEventListener('click', finish);
    document.body.append(layer);
    if (!full) { t = setTimeout(finish, reduced ? 600 : 1500); return; }
    try { localStorage.setItem(INTRO_KEY(), util.localDay()); } catch { /* private mode */ }
    import('./features/intro.js')
      .then(({ playIntro }) => { if (!gone) stop = playIntro(layer, { ready, onWelcome: () => layer.classList.add('show'), onDone: finish }); })
      .catch(() => { layer.classList.add('show'); t = setTimeout(finish, 1500); });
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
    if (e.key === 'n') { document.querySelector('main .page-new:not([hidden])')?.click(); }
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
  if (q.get('estampilla')) { app.sharedSticker = true; history.replaceState(null, '', `${location.pathname}#/cartas`); return; }
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
  // A wiped device also leaves the sync space, so it stops receiving at once.
  await Promise.race([sync.leave().catch(() => {}), util.sleep(3000)]);
  await db.deleteDatabase();
  // Every per-device key of the app (theme, active person, remembered tabs and orders).
  try { Object.keys(localStorage).filter((k) => k.startsWith(`${CONFIG.storageKey}.`)).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
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
/** Plays the opening heart now (Ajustes > Movimiento > Ver la entrada). */
app.playIntro = () => splash({ intro: true });

function fatal(message) {
  document.getElementById('app').replaceChildren(el('section', { class: 'page fatal' },
    el('h1', {}, 'No se pudo abrir la app'), el('p', {}, message),
    el('p', {}, 'Si estás en modo incógnito o sin espacio, prueba en una ventana normal o libera espacio.')));
}

/** Live sync (Fase A): start it, and redraw the open view when changes arrive from the other devices. */
async function startSync() {
  sync.onApplied((stores) => {
    if (stores.includes('profile') || stores.includes('pets')) profile.load();
    const route = router.currentRoute();
    const t = document.activeElement;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (!route || route.def.layer || ui.hasOpenModal() || typing || route.def.settingsPage) return;
    app.keepScroll = window.scrollY;
    router.refresh();
  });
  await sync.start().catch((e) => db.logError(`sync: ${e?.message}`, e?.stack, CONFIG.appVersion));
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
  db.onChange((store) => { if (store === 'pets') profile.load(); });
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
  let appReady = () => {};
  const ready = new Promise((r) => { appReady = r; });
  let welcome = null;
  if (setupDone && meta.onboardingDone && !location.hash.startsWith('#/setup')) {
    // The short welcome waits as before; the opening heart plays while the app loads behind it.
    const { intro: mode } = await db.getSettings('motion', theme.MOTION_DEFAULTS);
    welcome = splash({ ready, mode });
    if (!document.querySelector('.splash-intro')) { await welcome; welcome = null; }
  }
  security.startInactivity(async () => {
    if (!(await security.getSettings()).appLock) return;
    security.markUiLocked(); cryptoBox.lockAll();
    await security.lockScreen({ scope: 'app' });
  });
  buildShell();
  await startSync(); // before the first view, so Sincronización knows this device is linked
  await router.start({ render, navigate: onNavigate });
  appReady();
  registerServiceWorker();
  document.documentElement.classList.add('ready');
}

start();
