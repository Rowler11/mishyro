// Service worker: cache-first app shell so Aishiteru works offline.
// It only caches public files of the app, never user data (that lives in IndexedDB).
// Bump CACHE_VERSION on every release so devices pick up the update.
const CACHE_VERSION = 'aishiteru-v0.32.4';
const SHELL = [
  './',
  './styles.css',
  './styles-chino.css',
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
  './js/core/letters.js',
  './js/core/estilo.js',
  './js/core/temporadas.js',
  './js/core/art.js',
  './js/core/scene.js',
  './js/core/pets.js', './js/core/kitty.js',
  './js/features/guia.js', './js/features/tour.js', './js/core/sounds.js',
  './js/features/planta.js', './js/features/jardin.js',
  './js/features/kamishibai.js',
  './js/features/amor.js', './js/features/latido.js', './js/core/premium.js', './js/features/novedades.js', './js/features/toques.js', './js/features/calma.js', './js/features/compartir.js', './js/features/ocasion.js', './js/features/home-layout.js', './js/features/foto-dia.js', './js/features/ahora.js', './js/features/dormir.js', './js/features/juegos-extra.js', './js/features/gastos-extra.js',
  './js/features/avisos.js',
  './js/core/fx.js',
  './js/core/sync.js',
  './js/features/sync.js',
  './js/features/capsula.js',
  './js/features/intro.js',
  './js/features/preguntas.js', './js/features/canciones.js', './js/features/diario.js', './js/features/animo.js', './js/features/jibun.js', './js/features/retos.js',
  './js/features/calendario.js', './js/features/fechas.js', './js/features/recordatorios.js', './js/core/ics.js', './js/core/dates.js',
  './js/core/viewer.js', './js/core/cropper.js', './js/core/stage.js', './js/features/galeria.js', './js/features/mapa.js',
  './js/features/album.js', './js/features/primeras-veces.js', './js/features/photobooth.js', './js/features/capsula-tiempo.js',
  './js/features/planes.js', './js/features/suenos.js', './js/features/citas.js', './js/features/regalos.js', './js/features/encuentro.js', './js/features/voz.js', './js/features/lenguajes.js', './js/features/gratitud.js', './js/features/insignias.js', './js/features/resumen.js',
  './js/features/hogar-kit.js', './js/features/listas.js', './js/features/mascotas.js', './js/features/gatitos.js', './js/features/recetas.js', './js/features/alcancia.js', './js/features/gastos.js', './js/features/habitos.js', './js/features/rasca.js', './js/features/ciclo.js',
  './js/config-juegos.js', './js/features/juegos.js', './js/features/juegos-kit.js', './js/features/juegos-cartas.js', './js/features/juegos-mesa.js', './js/features/juegos-casa.js', './js/features/juegos-planes.js', './js/features/juegos-japon.js', './js/config-japones.js', './js/features/eventos.js',
  './js/core/vault.js', './js/features/yoru.js', './js/features/yoru-juegos.js',
  './js/features/cartas.js', './js/features/stickers.js', './js/features/sticker-maker.js', './js/features/bg-remove.js',
  './js/features/ajustes.js',
  './js/features/home-accesos.js', './js/features/permisos.js', './js/core/rescue.js', './vendor/bip39/spanish.js',
  './js/features/perfil.js', './js/features/avatar.js',
  './js/features/privacidad.js',
  './js/features/buscar.js', './js/features/papelera.js', './js/features/modo-cita.js',
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
  './fonts/ma-shan-zheng-400.woff2',
  './fonts/noto-serif-sc-700.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/badge-96.png', './icons/sc-amor-192.png', './icons/sc-pensando-192.png', './icons/sc-pregunta-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/sprite.svg',
  './icons/patterns/seigaiha.svg',
  './icons/patterns/asanoha.svg',
  './icons/patterns/kumiko.svg',
  './icons/patterns/brush.svg',
  './icons/patterns/xiangyun.svg',
  './icons/patterns/huiwen.svg',
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

// Shared from another app ("Compartir > Aishiteru"): an image becomes a new sticker, text and
// links keep going to the old GET flow. The image waits in its own cache until the app reads it.
const SHARE_CACHE = 'compartido';
async function receiveShare(req) {
  const scope = self.registration.scope;
  try {
    const form = await req.formData();
    const file = form.getAll('image').find((f) => f && typeof f !== 'string' && f.size);
    if (file) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(new URL('./__estampilla-compartida', scope).href, new Response(file, { headers: { 'content-type': file.type || 'image/png' } }));
      return Response.redirect(new URL('./?estampilla=1', scope).href, 303);
    }
    const q = new URLSearchParams();
    for (const k of ['title', 'text', 'url']) { const v = form.get(k); if (v) q.set(k, v); }
    return Response.redirect(new URL(`./?${q}`, scope).href, 303);
  } catch { return Response.redirect(scope, 303); }
}
// The sticker background remover (runtime + model, ~8 MB) is kept apart so app updates don't drop it.
const MODELS = 'modelos-v1';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/compartir')) { event.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // external resources are never cached
  if (url.pathname.includes('/api/')) return; // sync server: always live, never cached
  if (/vault-content|rincon/i.test(url.pathname)) return; // the private corner's files never go to a cache
  if (/\/vendor\/(ort|u2netp|leaflet)\//.test(url.pathname)) {
    event.respondWith(caches.open(MODELS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
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

// ---------- caring notices (Fase A) ----------
// The push carries only the kind of notice, encrypted by the sender with a key the server does not
// have. The notice never shows content; without the key it says something generic.
// v0.30.0 (Rowler): each kind has a few lovely ways to say it, picked at random, so the notices never
// feel like a system message. Still no names, no titles and nothing they wrote: only the kind.
// [link, icon, [title, body]...]
const NOTICES = {
  thinking: ['#/inicio', 'sc-pensando', ['Pensando en ti', 'Alguien te tiene en la cabeza ahora mismo 💭'], ['Te pensaron', 'Justo ahora alguien se acordó de ti 💗'], ['Un pensamiento para ti', 'Viajó hasta tu teléfono para decirte que te quieren 🌸']],
  letter: ['#/cartas', 'icon', ['Te llegó una carta 💌', 'Escrita con calma, solo para ti. Ábrela en Cartas'], ['Correo de amor', 'Hay un sobre esperando en Cartas 💌'], ['Una carta nueva', 'Prepárate un té y ábrela con calma 🍵']],
  coupon: ['#/cupones', 'icon', ['Te regalaron un cupón 🎟️', 'Míralo en la Cuponera y úsalo cuando quieras'], ['Un regalo para canjear', 'Hay un cupón nuevo con tu nombre 🎁']],
  couponSeen: ['#/cupones', 'icon', ['Abrieron tu cupón 🎟️', 'Ya lo vio. Ahora solo falta que lo canjee 😉'], ['Tu cupón ya fue visto', 'Le llegó tu regalo y lo abrió 💗']],
  couponAgain: ['#/cupones', 'icon', ['Volvieron a mirar tu cupón', 'Parece que lo está pensando… 😏'], ['Tu cupón otra vez', 'Lo volvió a leer. Alguien tiene ganas de usarlo 💗']],
  memory: ['#/capsula', 'icon', ['Un recuerdo nuevo 🌸', 'Guardaron algo bonito en la Cápsula'], ['La Cápsula creció', 'Hay un momento nuevo de los dos para ver 📷']],
  capsule: ['#/inicio', 'icon', ['Una cápsula del tiempo ⏳', 'Alguien guardó algo para el futuro de los dos'], ['Algo para mañana', 'Hay una cápsula nueva esperando su día 🌙']],
  song: ['#/canciones', 'icon', ['Te dedicaron una canción 🎵', 'Póntela con audífonos y piensa en quien te la mandó'], ['Una canción para ti', 'Alguien encontró una canción que le recordó a ti 🎶']],
  question: ['#/preguntas', 'sc-pregunta', ['Una pregunta para ti', 'Te espera en Preguntas. Respóndela con el corazón 💬'], ['Quieren saber algo de ti', 'Hay una pregunta nueva esperando tu respuesta ✨']],
  love: ['#/inicio', 'sc-amor', ['Te llegó amor 💗', 'Te mandaron amor hoy. ¿Le devuelves uno?'], ['Un poquito de amor', 'Alguien tocó su corazón pensando en ti 💗'], ['Amor recibido', 'Tu racha de amor sigue viva. Devuélvelo con un toque 💞']],
  beat: ['#/inicio', 'sc-amor', ['Te llegó un latido 💓', 'Ábrelo y siente cuánto late por ti'], ['Latidos para ti', 'Un corazón latió por ti. Ábrelo para sentirlo 💓']],
  greetAm: ['#/inicio', 'icon', ['Buenos días ☀️', 'Alguien te desea el día más bonito'], ['Despierta con amor', 'Te mandaron los buenos días con un beso ☀️']],
  greetPm: ['#/inicio', 'icon', ['Buenas noches 🌙', 'Que descanses. Alguien se va a dormir pensando en ti'], ['Dulces sueños', 'Te mandaron las buenas noches con un abrazo 🌙']],
  dayphoto: ['#/inicio', 'icon', ['Foto del día 📷', 'Compartieron su foto de hoy. Comparte la tuya para verla'], ['¿Qué tal tu día?', 'Ya llegó su foto de hoy. Manda la tuya y se ven las dos 📷']],
  hug: ['#/inicio', 'icon', ['Te llegó un abrazo 🤗', 'Ábrelo y recíbelo fuerte'], ['Un abrazo a distancia', 'Alguien te está abrazando desde lejos 🤗']],
  loveRemind: ['#/inicio', 'sc-amor', ['¿Ya enviaste amor hoy?', 'Un toque al corazón y su racha sigue 💗'], ['Su racha te espera', 'Un toque de amor antes de que acabe el día 💞']],
};
// a soft pattern for each kind (the latido beats like a heart)
const BUZZ = { beat: [55, 110, 85, 610, 55, 110, 85, 610, 55, 110, 85], love: [40, 80, 40], hug: [120, 60, 220], thinking: [30, 60, 30] };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// Scheduled notices (v0.15.0) come as "r:<kind>:<days before>". Their words are fixed here, so the
// notice never carries a name, a title or anything else they wrote.
const REMIND = {
  monthiversary: ['es su mesiversario', '🌸', '#/inicio'],
  anniversary: ['es su aniversario', '💞', '#/inicio'],
  birthday: ['es un cumpleaños especial', '🎂', '#/fechas'],
  pet: ['es un día especial de su mascota', '🐾', '#/mascotas'],
  weeklyDate: ['tienen su cita de la semana', '🗓️', '#/calendario'],
  custom: ['tienen un recordatorio', '🔔', '#/recordatorios'],
  event: ['tienen un plan juntos', '🗓️', '#/calendario'],
};
/** v0.31.0: "beat:7" -> the latido notice, beating 7 times like a heart (lub-dub, pause). */
function beatsOf(kind) { const m = /^beat:(\d+)$/.exec(String(kind || '')); return m ? Math.max(1, Math.min(15, Number(m[1]))) : 0; }
const heartPattern = (n) => Array.from({ length: n }, () => [60, 100, 80, 460]).flat().slice(0, -1);
function noticeText(kind) {
  if (beatsOf(kind)) { const n = beatsOf(kind); const t = noticeText('beat'); return [t[0], n > 1 ? `${n} latidos para ti. Ábrelo y siente cuánto late por ti 💓` : t[1], t[2], t[3]]; }
  const n = NOTICES[kind];
  if (n) { const [hash, icon, ...lines] = n; const [title, body] = pick(lines); return [title, body, hash, icon]; }
  const [tag, what, days] = String(kind || '').split(':');
  const r = tag === 'r' && REMIND[what];
  if (!r) return ['Aishiteru', 'Hay algo nuevo para ti 💗', '#/inicio', 'icon'];
  const d = Number(days) || 0;
  const when = d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`;
  return [`${when} ${r[0]} ${r[1]}`, d === 0 ? 'Que sea un día bonito para los dos 💗' : 'Un detalle para no olvidarlo y prepararlo con cariño', r[2], 'icon'];
}
function readNotifyKey() {
  return new Promise((resolve) => {
    const req = indexedDB.open('aishiteru-db');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const idb = req.result;
      try {
        const g = idb.transaction('settings').objectStore('settings').get('syncNotify');
        g.onsuccess = () => { resolve(g.result?.key || null); idb.close(); };
        g.onerror = () => { resolve(null); idb.close(); };
      } catch { resolve(null); idb.close(); }
    };
  });
}
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function noticeKind(text) {
  try {
    const key = await readNotifyKey();
    if (!key || !text) return null;
    const k = await crypto.subtle.importKey('raw', fromB64u(key), 'AES-GCM', false, ['decrypt']);
    const box = fromB64u(text);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.subarray(0, 12) }, k, box.subarray(12));
    return JSON.parse(new TextDecoder().decode(plain)).k || null;
  } catch { return null; }
}
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const kind = await noticeKind(event.data ? event.data.text() : '');
    const [title, body, hash, icon] = noticeText(kind);
    await self.registration.showNotification(title, {
      body, tag: kind || 'aishiteru', lang: 'es', timestamp: Date.now(),
      icon: `./icons/${icon}-192.png`, badge: './icons/badge-96.png', // v0.30.0: a sakura silhouette in the status bar
      ...(beatsOf(kind) ? { vibrate: heartPattern(beatsOf(kind)), tag: 'beat' } : BUZZ[kind] ? { vibrate: BUZZ[kind] } : {}),
      ...(beatsOf(kind) || kind === 'beat' || kind === 'love' ? { renotify: true } : {}), // v0.22.0: the latido notice itself beats
      actions: [{ action: 'open', title: beatsOf(kind) || kind === 'love' || kind === 'beat' || kind === 'hug' ? 'Devolver 💗' : 'Abrir' }],
      data: { url: new URL(`./${hash}`, self.registration.scope).href },
    });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); try { await open.navigate(url); } catch { /* cross-state */ } return; }
    await self.clients.openWindow(url);
  })());
});
