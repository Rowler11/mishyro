// App bootstrap: database, theme, profile, security layers, navigation shell,
// router, service worker and global shortcuts.
import { CONFIG, db, router, theme, ui, security, seed, profile, util, cryptoBox, sync } from './core.js';
import { TABS, GROUPS, HIDDEN, SETTINGS_PAGES, HUBS } from './routes.js';
import { scene as sceneFor } from './core/scene.js';
import { bouquet } from './core/art.js';
import { cornerArt } from './core/fx.js';
import * as guia from './features/guia.js';
import * as tour from './features/tour.js';

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
  permisos: () => import('./features/permisos.js'),
  listas: () => import('./features/listas.js'),
  mascotas: () => import('./features/mascotas.js'),
  jardin: () => import('./features/jardin.js'),
  recetas: () => import('./features/recetas.js'),
  alcancia: () => import('./features/alcancia.js'),
  gastos: () => import('./features/gastos.js'),
  habitos: () => import('./features/habitos.js'),
  rasca: () => import('./features/rasca.js'),
  juegos: () => import('./features/juegos.js'),
  eventos: () => import('./features/eventos.js'),
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
  papelera: () => import('./features/papelera.js'),
  'modo-cita': () => import('./features/modo-cita.js'),
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
  dormir: () => import('./features/dormir.js'),
  gratitud: () => import('./features/gratitud.js'),
  yoru: () => import('./features/yoru.js'),
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
    class: `${cls} tab`, href: `#${t.path}`, dataset: { tab: t.id }, onClick: () => util.haptic('tap'),
    'aria-label': `${t.title}${cls === 'rail-link' ? '' : ''}`,
  }, el('span', { class: 'tab-icon' }, icon(t.icon)), el('span', { class: 'tab-name' }, t.title));

  // v0.34.0: the top bar no longer shows the avatar (Perfil is in Ajustes). v0.26.0: no switching between the two any more. The avatar (photo, or the initial) opens Perfil,
  // where the photo is changed. Who uses this device is chosen once, in the setup or by the join code.
  const profileChip = (cls) => el('a', { class: `profile-chip ${cls}`, href: '#/ajustes/perfil', onClick: () => util.haptic('tap') },
    el('span', { class: 'profile-avatar', 'aria-hidden': 'true' }), el('span', { class: 'profile-text' }));
  const searchBtn = el('a', { class: 'icon-btn search-btn', href: '#/buscar', 'aria-label': 'Buscar', title: 'Buscar · tecla /' }, icon('search'));
  const panicBtn = (cls) => el('button', { class: `icon-btn panic-btn ${cls}`, type: 'button', 'aria-label': 'Cubrir la app (pánico)', title: 'Cubrir la app · Esc dos veces', onClick: doPanic }, icon('eye-off'));

  const skip = el('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); document.getElementById('main').focus(); } }, 'Saltar al contenido');
  const appbar = el('header', { class: 'appbar' },
    el('a', { class: 'brand', href: '#/inicio', 'aria-label': 'Aishiteru, ir a Inicio' }, ui.flower({ size: 30 }), el('span', { class: 'brand-name' }, 'Aishiteru')),
    el('div', { class: 'appbar-actions' }, searchBtn, panicBtn('panic-appbar')));
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

/** A small dot on the Cartas tab while letters wait to be opened (Fase 7). The label says it too. */
let letterTimer = 0;
function updateLetterDot() {
  clearTimeout(letterTimer);
  letterTimer = setTimeout(async () => {
    const n = await load.cartas().then((m) => m.unopenedCount()).catch(() => 0);
    document.querySelectorAll('[data-tab="cartas"]').forEach((a) => {
      a.classList.toggle('has-dot', n > 0);
      a.setAttribute('aria-label', n > 0 ? `Cartas, ${n === 1 ? '1 por abrir' : `${n} por abrir`}` : 'Cartas');
    });
  }, 400);
}

function updateProfileChips() {
  const who = profile.active();
  document.documentElement.dataset.profile = who;
  const pic = profile.photo(who);
  document.querySelectorAll('.profile-chip').forEach((b) => {
    b.querySelector('.profile-text').textContent = profile.name(who);
    const av = b.querySelector('.profile-avatar');
    av.classList.toggle('has-photo', !!pic);
    if (pic) {
      const img = av.querySelector('img') || el('img', { alt: '', decoding: 'async' });
      if (img.getAttribute('src') !== pic) img.setAttribute('src', pic);
      if (!img.isConnected) av.replaceChildren(img);
    } else av.textContent = [...profile.name(who)][0] || '?';
    b.setAttribute('aria-label', `Tu perfil: ${profile.name(who)}. Cambiar tu foto y tus datos`);
  });
}

function doPanic() {
  security.panic({ goHome: () => router.go('/inicio', { replace: true }) });
}

// ---------- rendering ----------
let prevScope = null;
function onNavigate(route, prev) {
  ui.closeAllModals();
  import('./core/pets.js').then((m) => m.hush()).catch(() => {});
  const scope = lockScope(route.def);
  if (prevScope && prevScope !== scope && prevScope !== 'app') {
    if (security.ALWAYS_LOCK.includes(prevScope)) cryptoBox.lock(prevScope);
    else security.getSettings().then((s) => { if (s.lockOnLeave) cryptoBox.lock(prevScope); });
  }
  prevScope = scope;
  if (!route.def.layer && app.setupDone) import('./features/home-accesos.js').then((m) => m.markVisited(route.def.id)).catch(() => {});
  if (prev) {
    const a = TABS.findIndex((t) => t.id === (prev.def.tab || prev.def.id));
    const b = TABS.findIndex((t) => t.id === (route.def.tab || route.def.id));
    document.documentElement.dataset.dir = b < a ? 'back' : 'forward';
  }
}

async function render(route) {
  if (!shell) buildShell();
  const { main } = shell;
  // v0.26.0: a redraw because something arrived from the other phone is quiet: no entrance, and the
  // pet that was already there stays put instead of popping in again.
  const quiet = app.quietRender; app.quietRender = false;
  updateNav(route);
  updateLetterDot();
  if (!/^#?\/?inicio/.test(location.hash.replace(/^#\/?/, ''))) theme.setBarColor(null); // Inicio paints its own sky color
  const def = route.def;
  if (!app.setupDone && !def.layer) { router.go('/setup', { replace: true }); return; }
  document.title = def.neutral || !def.title ? 'Aishiteru' : `${def.title} · Aishiteru`;
  const scope = lockScope(def);
  if (scope && security.hasKey(scope) && !security.isUnlocked(scope)) {
    await security.lockScreen({ scope, neutralName: def.title, inline: true, mount: main });
    if (router.currentRoute() !== route) return;
  }
  // Keep the current view until the next one is ready; show the skeleton only if it takes a while.
  // v0.32.2: a longer wait before the skeleton (it blinked for a moment on phones); the current view stays until then.
  const skeleton = setTimeout(() => { if (!quiet && router.currentRoute() === route) main.replaceChildren(ui.skeleton(3, { kind: 'cards' })); }, 1400);
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
      ui.emptyState({ title: 'No pudimos abrir esta parte', text: 'Algo se enredó, pero no se perdió nada. Intenta de nuevo.', art: 'omamori', action: { label: 'Reintentar', onClick: () => router.refresh() } }));
  }
  clearTimeout(skeleton);
  addHubTabs(node, route);
  addScene(node, route);
  addHint(node, route);
  const swapped = swapView(main, node, { quiet });
  addCompanion(node, route, { quiet });
  // Focus the new view's search box or title once it is in place.
  if (!app.firstRender) swapped.then(() => requestAnimationFrame(() => (main.querySelector('[data-autofocus]') || main.querySelector('h1') || main).focus({ preventScroll: true })));
  if (app.firstRender) preloadSections();
  app.firstRender = false;
  if (app.keepScroll != null) { const y = app.keepScroll; app.keepScroll = null; requestAnimationFrame(() => window.scrollTo({ top: y })); } else window.scrollTo({ top: 0 });
}

/** v0.18.0: one of their pets shows up on the screen (peeking over a card or asleep at the end). */
function addCompanion(node, route, { quiet = false } = {}) {
  const def = route.def;
  if (def.layer || def.lock || route.path.startsWith('/ajustes') || !node?.querySelector) return;
  // v0.26.0: it peeks out from behind its card (or walks in from the edge) once the screen has settled.
  // v0.32.0: its place is taken in the same frame as the screen (nothing moves afterwards); only the
  // friend's own entrance waits, in CSS.
  if (router.currentRoute() !== route || !node.isConnected) return;
  const put = (m) => { petsMod = m; return m.companion(node, def.id, { enter: !quiet }); };
  if (petsMod) Promise.resolve(put(petsMod)).catch((e) => console.error(e)); // same frame: no task in between
  else import('./features/gatitos.js').then(put).catch((e) => console.error(e));
}
let petsMod = null; // v0.32.0: gatitos.js once loaded

/** Paper scene under the title of the sections of Más (v0.13.0). */
function addScene(node, route) {
  // v0.30.0 (Rowler): no more band with a background; the friends now live on the screen's own cards
  // (gatitos.companion). The scene stays only where a page asks for it explicitly.
  if (!route?.def?.scene) return;
  const head = node?.querySelector?.(':scope > .page-head');
  if (!head || node.querySelector('.paper-scene')) return;
  const band = sceneFor?.(route.path.slice(1));
  if (band) (node.querySelector(':scope > .hub-tabs') || head).after(band);
}

/** First visit (v0.14.0 hint, v0.20.0 tour): the section's friend explains it with a little tour; the
 * plain hint stays where there is no tour. Inicio starts the main tour the first time. */
function addHint(node, route) {
  const id = route.path.slice(1);
  if (id === 'inicio') { tour.maybeMain(); return; }
  if (tour.maybeSection(id) || tour.state().off) return; // skipped the tutorial: no hints either
  const head = node?.querySelector?.(':scope > .page-head');
  const hint = head && !tour.state().seen?.[id] && guia?.hintFor(id);
  if (hint) (node.querySelector(':scope > .paper-scene') || node.querySelector(':scope > .hub-tabs') || head).after(hint);
}

/** Joined sections (2026-11-21): the same tab strip on top of every tab of a hub. Tabs replace each other in history. */
function addHubTabs(node, route) {
  const here = route.path.slice(1);
  const hub = HUBS.find((h) => h.tabs.some(([t]) => t === here));
  const head = node?.querySelector?.(':scope > .page-head');
  if (!hub || !head) return;
  const nav = el('nav', { class: 'hub-tabs', 'aria-label': hub.title },
    hub.tabs.map(([t, label]) => el('a', { class: `hub-tab${t === here ? ' is-on' : ''}`, href: `#/${t}`, 'aria-current': t === here ? 'page' : null,
      onClick: (e) => { e.preventDefault(); if (t !== here) router.go(`/${t}`, { replace: true }); } }, label)));
  head.after(nav);
  requestAnimationFrame(() => nav.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
}

function swapView(main, node, { quiet = false } = {}) {
  // A plain CSS entrance instead of a view transition: it never blocks taps, so switching is instant.
  main.replaceChildren(node);
  if (!quiet && !app.firstRender && !util.prefersReducedMotion() && node.classList) {
    // v0.32.7: the entrance class goes away once it has played. While it stayed, the next tap changed
    // html[data-dir] (forward/back) before the new view was ready, which swapped the animation's name on
    // the view still on screen and replayed its entrance: the old screen vanished and faded back in, then
    // the new one came in. That was the flicker when coming back to Inicio.
    node.classList.add('view-enter');
    // Wait for the page and its cards (they rise a little later) before taking it off, so nothing jumps.
    requestAnimationFrame(() => {
      const all = node.getAnimations?.({ subtree: true }).filter((a) => /^(shoji-in|shoji-in-back|home-in|rise)$/.test(a.animationName || '')) || [];
      Promise.allSettled(all.map((a) => a.finished)).then(() => node.classList.remove('view-enter'));
    });
  }
  return Promise.resolve();
}

/** Warm up the main sections once the app is idle, so the first switch to them has nothing to fetch. */
function preloadSections() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  // Wait a moment past the first paint so the warm-up never competes with what is on screen.
  setTimeout(() => idle(() => { for (const k of ['home', 'capsula', 'cupones', 'cartas', 'more', 'settings', 'buscar']) load[k]().catch(() => {}); }), 3000);
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
    // The app is a gift: the loading screen says "Para <who it is for>" on every phone (Rowler, 2026-11-21).
    const reduced = util.prefersReducedMotion();
    const full = !reduced && (intro ?? introDue(mode));
    const cnStyle = ['rojo', 'azul'].includes(document.documentElement.dataset.style); // v0.22.0: 我爱你 in the Chinese styles
    // v0.33.0: the loading screen and the opening follow the real hour (dawn, day, dusk, night)
    const phase = theme.dayPhase();
    const greet = { dawn: 'Buenos días', day: 'Buenos días', dusk: 'Buenas tardes', night: 'Buenas noches' }[phase];
    const layer = el('div', { class: `splash${full ? ' splash-intro' : ''}`, dataset: { phase }, role: 'status', 'aria-label': 'Aishiteru' },
      // A bouquet of lilies opens as the name appears (chosen 2026-11-22).
      cnStyle ? el('div', { class: 'splash-corner', 'aria-hidden': 'true' }, cornerArt()) : null,
      el('div', { class: 'splash-heart splash-bouquet', 'aria-hidden': 'true' }, bouquet()),
      el('p', { class: 'splash-greet' }, greet),
      el('p', { class: 'splash-for' }, `Para ${profile.paraName() || 'ti'}`),
      ...(cnStyle
        ? [el('span', { class: 'ja', lang: 'zh-Hans', 'data-jp-ok': '' }, '我爱你'), el('small', { class: 'splash-romaji', 'aria-hidden': 'true' }, 'wǒ ài nǐ')]
        : [ja('愛してる', 'aishiteru'), el('small', { class: 'splash-romaji', 'aria-hidden': 'true' }, 'aishiteru')]),
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
    if (!full) { t = setTimeout(finish, reduced ? 600 : 2300); return; }
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
    ['g y luego i, c, u, a, m', 'Ir a Inicio, Cápsula, Cuponera, Cartas o Más'],
    ['n', 'Crear algo nuevo en la sección abierta'],
    ['← →', 'Pasar fotos, recuerdos y cartas de juego'],
    ['?', 'Ver esta lista'],
    ['Esc', 'Cerrar la ventana abierta'],
    ['Esc dos veces', 'Cubrir la app al instante (pánico)'],
  ];
  ui.openModal({ title: 'Atajos de teclado', size: 'sm', body: el('dl', { class: 'shortcuts' },
    rows.flatMap(([k, v]) => [el('dt', {}, el('kbd', {}, k)), el('dd', {}, v)])) });
}

function installShortcuts() {
  let lastEsc = 0; let gAt = 0;
  const GO = { i: '/inicio', c: '/capsula', u: '/cupones', a: '/cartas', m: '/mas', g: '/galeria' };
  addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (e.key === 'Escape' && !ui.hasOpenModal()) {
      const now = Date.now();
      if (now - lastEsc < 500) { lastEsc = 0; doPanic(); } else lastEsc = now;
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || ui.hasOpenModal() || document.documentElement.dataset.layer === 'full') return;
    if (gAt && Date.now() - gAt < 1200 && GO[e.key]) { e.preventDefault(); gAt = 0; router.go(GO[e.key]); return; }
    gAt = e.key === 'g' ? Date.now() : 0;
    const tab = TABS.find((x) => x.key === e.key);
    if (tab) { e.preventDefault(); router.go(tab.path); return; }
    if (e.key === '/') { e.preventDefault(); router.go('/buscar'); return; }
    if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
    if (e.key === 'n') { document.querySelector('main .page-new:not([hidden])')?.click(); }
  });
}

function installVisibility() {
  const hide = async () => {
    security.lockAlways();
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
  // v0.26.0: "Sonidos suaves" is on for new installs. Who already used the app keeps it as it was (off
  // unless they turned it on), so the old default is written once for them.
  const raw = await db.rawGet('settings', 'motion').catch(() => null);
  if (!raw || !('sound' in raw)) {
    const m = await db.getMeta();
    if (m.setupDone && !m.soundDefaultKept) await db.setSettings('motion', { sound: false });
    if (!m.soundDefaultKept) await db.setMeta({ soundDefaultKept: true });
  }
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

/**
 * v0.26.1: photos fade in once they are decoded instead of painting line by line or popping in.
 * An image is marked ready when it loads (or fails), or right away if it was already loaded when it
 * reached the screen, so nothing can stay hidden.
 */
function installImageFade() {
  const ready = (img) => img.classList.add('img-ready');
  const onDone = (e) => { if (e.target instanceof HTMLImageElement) ready(e.target); };
  document.addEventListener('load', onDone, true);
  document.addEventListener('error', onDone, true);
  const check = (n) => {
    if (n.nodeType !== 1) return;
    const imgs = n.tagName === 'IMG' ? [n] : n.querySelectorAll ? n.querySelectorAll('img:not(.img-ready)') : [];
    for (const img of imgs) if (img.complete) ready(img);
  };
  new MutationObserver((ms) => { for (const m of ms) m.addedNodes.forEach(check); }).observe(document.body, { childList: true, subtree: true });
  // Safety net: whatever is still waiting after 4 s shows anyway.
  setInterval(() => document.querySelectorAll('#main img:not(.img-ready)').forEach((img) => { if (img.complete || !img.getAttribute('src')) ready(img); }), 4000);
}

let syncRedraw = 0;
/** Live sync (Fase A): start it, and redraw the open view when changes arrive from the other devices. */
async function startSync() {
  sync.onApplied((stores) => {
    if (stores.includes('profile') || stores.includes('pets')) profile.load();
    const route = router.currentRoute();
    const t = document.activeElement;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if (!route || route.def.layer || ui.hasOpenModal() || typing || route.def.settingsPage) return;
    // v0.26.0: changes arrive in a few batches when the app opens; redraw once, quietly. Ajustes itself
    // only shows your profile card from what comes from the other phone.
    if (route.path === '/ajustes' && !stores.includes('profile')) return;
    clearTimeout(syncRedraw);
    syncRedraw = setTimeout(() => {
      if (router.currentRoute() !== route || ui.hasOpenModal()) return;
      app.keepScroll = window.scrollY;
      app.quietRender = true;
      router.refresh();
    }, 350);
  });
  await sync.start().catch((e) => db.logError(`sync: ${e?.message}`, e?.stack, CONFIG.appVersion));
  import('./features/avisos.js').then((m) => m.start()).catch(() => {}); // scheduled caring notices (v0.15.0)
  import('./features/toques.js').then((m) => m.watch()).catch(() => {}); // v0.24.0: greetings and hugs
  import('./features/latido.js').then((m) => m.watch()).catch(() => {}); // v0.22.0: their heartbeat, felt here
  import('./features/cupones.js').then((m) => m.watch()).catch(() => {}); // v0.30.0: "opened your coupon"
}

// ---------- start ----------
async function start() {
  theme.setStorageKey(CONFIG.storageKey);
  profile.init(CONFIG);
  installErrorHandler();
  security.setLockPhrases(CONFIG.lockPhrases);
  readShareTarget();
  try { await db.open(CONFIG.storageKey); } catch (e) { fatal(e?.message || 'Error de almacenamiento.'); return; }
  await security.init({ wipe: wipeEverything, unlocked: () => router.refresh(), vaultWipe: async () => (await import('./core/vault.js')).wipeLocal() });
  const meta = await db.getMeta();
  if (!meta.installId) await db.setMeta({ installId: util.uuid(), schemaVersion: db.SCHEMA_VERSION, createdAt: util.nowISO() });
  await seed.syncConfig(CONFIG);
  db.emptyExpiredTrash().catch(() => {}); // Papelera: what is older than 30 days goes for good
  await profile.load();
  await import('./core/pets.js').then((m) => m.load()).catch(() => {});
  const emptyPets = import('./features/gatitos.js').then((m) => m.primeEmptyStates()).catch(() => {}); // v0.22.0: a pet waits on empty screens
  db.onChange((store) => { if (store === 'pets') profile.load(); if (store === 'letters' || store === 'content') updateLetterDot(); });
  await applySettings();
  ui.installRipple();
  installImageFade();
  installShortcuts();
  installVisibility();
  import('./core/premium.js').then((m) => m.install()).catch(() => {}); // v0.23.0: pull to refresh, edge swipe, offline pill
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.deferredInstall = e; });
  // v0.23.0: guided install. The browser's own prompt when it offers one; otherwise the two taps, said clearly.
  document.addEventListener('aishiteru:install', async () => {
    if (app.deferredInstall) {
      app.deferredInstall.prompt();
      const { outcome } = await app.deferredInstall.userChoice; app.deferredInstall = null;
      if (outcome === 'accepted') ui.toast('Instalada. Búscala en tu pantalla de inicio 🌸');
      return;
    }
    ui.openModal({ title: 'Instalar la app', size: 'sm', body: el('div', { class: 'stack' },
      el('p', {}, 'Así queda con su ícono, a pantalla completa y abre más rápido:'),
      el('ol', { class: 'steps-list' },
        el('li', {}, 'Toca los tres puntitos (⋮) de Chrome, arriba a la derecha.'),
        el('li', {}, 'Elige "Instalar aplicación" o "Agregar a la pantalla de inicio".'),
        el('li', {}, 'Confirma. Ya puedes cerrar esta pestaña y abrirla desde el ícono.')),
      el('p', { class: 'muted small' }, 'En el computador, busca el ícono de instalar al final de la barra de direcciones.')) });
  });
  profile.onProfileChange(updateProfileChips);
  profile.onProfileChange(updateLetterDot);
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
  await Promise.race([emptyPets, new Promise((r) => setTimeout(r, 400))]);
  await router.start({ render, navigate: onNavigate });
  appReady();
  if (setupDone && meta.onboardingDone) setTimeout(() => import('./features/novedades.js').then((m) => m.maybeShow()).catch(() => {}), 2500); // v0.23.0: what is new, once per version
  registerServiceWorker();
  document.documentElement.classList.add('ready');
}

start();
