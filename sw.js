// Service worker: cache-first app shell so Aishiteru works offline.
// It only caches public files of the app, never user data (that lives in IndexedDB).
// Bump CACHE_VERSION on every release so devices pick up the update.
const CACHE_VERSION = 'aishiteru-v0.1.18';
const SHELL = [
  './',
  './styles.css',
  './theme-boot.js',
  './manifest.webmanifest',
  './js/app.js',
  './js/config.js',
  './js/core.js',
  './js/routes.js',
  './js/core/backup.js',
  './js/core/crypto.js',
  './js/core/db.js',
  './js/core/images.js',
  './js/core/profile.js',
  './js/core/router.js',
  './js/core/security.js',
  './js/core/seed.js',
  './js/core/theme.js',
  './js/core/time.js',
  './js/core/ui.js',
  './js/core/util.js',
  './js/features/capsula.js',
  './js/features/cartas.js',
  './js/features/ajustes.js',
  './js/features/perfil.js',
  './js/features/privacidad.js',
  './js/features/buscar.js',
  './js/features/cupones.js',
  './js/features/home.js',
  './js/features/more.js',
  './js/features/placeholder.js',
  './js/features/settings.js',
  './js/features/setup.js',
  './js/features/styleguide.js',
  './fonts/fonts.css',
  './fonts/shippori-mincho-400.woff2',
  './fonts/shippori-mincho-700.woff2',
  './fonts/zen-maru-gothic-400.woff2',
  './fonts/zen-maru-gothic-500.woff2',
  './fonts/zen-maru-gothic-700.woff2',
  './fonts/atkinson-hyperlegible-400.woff2',
  './fonts/atkinson-hyperlegible-700.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/sprite.svg',
  './icons/patterns/seigaiha.svg',
  './icons/patterns/asanoha.svg',
  './icons/patterns/kumiko.svg',
  './icons/patterns/brush.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('aishiteru-') && k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Hosts like Cloudflare redirect /index.html to /. A redirected response can't answer a
// navigation (Chrome shows ERR_FAILED), so cached copies are re-wrapped without the flag.
const clean = (res) => (res && res.redirected
  ? res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }))
  : res);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // external resources are never cached
  if (req.mode === 'navigate') {
    // Navigations (including share_target ?title=&text=&url=) get the cached shell.
    event.respondWith(caches.match('./').then((r) => (r ? clean(r) : fetch(req))));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => (hit ? clean(hit) : fetch(req).then((res) => {
    if (res.ok && res.type === 'basic' && /\.(js|css|svg|png|woff2|json|webmanifest)$/.test(url.pathname)) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
    }
    return res;
  }))));
});
