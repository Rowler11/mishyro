// Ajustes: Privacidad (who sees what, honestly) and Modo sin terceros (docs/04).
import { ui, util, db, security, profile, router, sync } from '../core.js';

const { el, icon } = util;
const put = (box, ...kids) => box.replaceChildren(...kids.flat().filter(Boolean));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const page = (title, ...kids) => el('section', { class: 'page settings-page' }, ui.pageHeader({ title, back: '/ajustes' }), ...kids);
const card = (title, ...kids) => el('section', { class: 'card stack' }, title ? el('h2', { class: 'card-title' }, title) : null, ...kids);

export function render(ctx) {
  return ctx.def.settingsPage === 'terceros' ? terceros() : privacidad();
}

// ---------- Privacidad ----------
async function ownSelfCount(me) {
  let n = 0;
  for (const name of db.STORE_NAMES) {
    if (['meta', 'settings', 'errors', 'vault', 'media', 'syncState', 'syncInbox'].includes(name)) continue;
    for (const r of await db.rawAll(name)) if (!r.deleted && r.visibility === 'self' && r.owner === me) n++;
  }
  return n;
}

function privacidad() {
  const me = profile.active();
  const meName = profile.name(me);
  const partner = profile.name(profile.partnerOf(me));
  const mine = el('div', { class: 'stack' }, ui.skeleton(2));
  (async () => {
    await security.refreshKeys();
    const n = await ownSelfCount(me);
    const hasPin = security.hasKey(`person:${me}`);
    put(mine,
      el('ul', { class: 'status-list' },
        el('li', { class: `status-row tone-${n ? 'ok' : 'neutral'}` }, el('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon('lock', { size: 20 })),
          el('span', { class: 'status-text' }, el('span', { class: 'status-title' }, 'Lo "Solo yo" de ' + meName), el('span', { class: 'status-value' }, n ? plural(n, 'elemento', 'elementos') : 'Nada todavía'))),
        el('li', { class: `status-row tone-${hasPin ? 'ok' : 'warn'}` }, el('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon('key-round', { size: 20 })),
          el('span', { class: 'status-text' }, el('span', { class: 'status-title' }, 'PIN personal'),
            el('span', { class: 'status-value' }, hasPin ? 'Activo: va cifrado y pide el PIN' : 'Sin PIN: se oculta, pero no va cifrado')))),
      el('div', { class: 'btn-row' }, ui.button({ label: hasPin ? 'Gestionar en Seguridad' : 'Crear mi PIN personal', iconName: 'shield-check', href: '#/ajustes/seguridad' })));
  })();

  const off = profile.onProfileChange(() => { if (profile.active() !== me) router.refresh(); });
  return { node: page('Privacidad',
    card('Quién ve qué',
      el('ul', { class: 'privacy-points' },
        el('li', {}, el('strong', {}, 'Los dos: '), 'lo ve quien use la app en este dispositivo.'),
        el('li', {}, el('strong', {}, 'Solo yo: '), `${partner} no lo ve ni sabe cuántos hay. Se elige al guardar un recuerdo o al escribir una carta.`),
        el('li', {}, el('strong', {}, 'Borradores de cartas: '), 'son "Solo yo" hasta que los sellas.')),
      el('p', { class: 'note-inline' }, icon('info', { size: 18 }), el('span', {}, 'Es un solo dispositivo sin cuentas. Con PIN es privado de verdad (cifrado); sin PIN es privacidad de cortesía.'))),
    card(`Tu espacio, ${meName}`, mine),
    card('Qué sale del dispositivo',
      el('ul', { class: 'privacy-points' },
        el('li', {}, 'Nada se sube a internet: no hay servidor, cuentas, analítica ni cookies.'),
        el('li', {}, 'Solo sale lo que ustedes envían a mano con "Enviar" o "Compartir".'),
        el('li', {}, 'La copia de seguridad lleva lo privado solo si lo marcan, y cifrado con contraseña si lo eligen.'),
        el('li', {}, 'Las fotos se guardan achicadas y sin pasar por ningún servicio.')),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Modo sin terceros', iconName: 'shield', href: '#/ajustes/terceros' }),
        ui.button({ label: 'Política de privacidad', iconName: 'file-text', variant: 'ghost', href: '#/ajustes/legal/privacidad' }))),
    card('Ciclo y capa privada',
      el('p', { class: 'muted' }, `Llegan pronto con el Calendario. Ahí ${profile.name('sofia')} decide qué es privado y qué ve ${profile.name('david')}, y sus ajustes se cambian solo desde su perfil.`),
      el('span', { class: 'badge soon-pill' }, 'Pronto'))), cleanup: off };
}

// ---------- Modo sin terceros ----------
const EXTERNAL = [
  { what: 'Fuentes de letra', who: 'Ninguno: vienen dentro de la app', when: 'Siempre', status: 'local' },
  { what: 'Actualizaciones de la app', who: 'El mismo sitio de la app', when: 'Al abrirla con internet', status: 'own' },
  { what: 'Sincronización entre sus equipos', who: 'El mismo sitio de la app (Cloudflare), todo cifrado de extremo a extremo', when: 'Solo si unen sus equipos en Ajustes > Sincronización', status: 'own' },
  { what: 'Avisos cariñosos', who: 'El servicio de avisos del navegador (Google en Android y Chrome), sin contenido', when: 'Solo si los activan en Sincronización', status: 'opt' },
  { what: 'Mapa de lugares y Sueños', who: 'OpenStreetMap (imágenes del mapa)', when: 'Al abrir el mapa', status: 'soon' },
  { what: 'Canciones', who: 'Spotify (reproductor y nombre de la canción)', when: 'Solo al tocar "Escuchar" o al pegar un enlace', status: 'opt' },
  { what: 'Ideas de citas', who: 'Google Maps (enlace)', when: 'Solo si tocan "Buscar en Google Maps"', status: 'soon' },
];
const STATUS = { local: 'Sin red', own: 'Propio', soon: 'Pronto', opt: 'Opcional' };

function terceros() {
  const box = el('div', { class: 'stack' }, ui.skeleton(2));
  (async () => {
    const s = await db.getSettings('thirdParty', { off: false });
    const tableRows = EXTERNAL.map((x) => el('tr', {},
      el('th', { scope: 'row' }, x.what), el('td', {}, x.who), el('td', {}, x.when),
      el('td', {}, el('span', { class: `badge${x.status === 'local' ? ' badge-ok' : ''}` }, STATUS[x.status]))));
    put(box,
      ui.toggle({ label: 'Modo sin terceros', checked: s.off,
        hint: 'Apaga el mapa, Spotify, los avisos y los enlaces externos opcionales. La app sigue funcionando completa sin ellos.',
        onChange: async (v) => { await db.setSettings('thirdParty', { off: v }); if (v && sync.status().notify) await sync.disableNotifications().catch(() => {}); ui.toast(v ? 'Modo sin terceros activo.' : 'Servicios externos opcionales permitidos.'); } }),
      el('p', { class: 'note-inline' }, icon('shield-check', { size: 18 }), el('span', {}, 'Hoy la app solo habla con su propio sitio. Lo que dice "Pronto" llega con su sección y respetará este interruptor.')),
      el('div', { class: 'table-wrap' }, el('table', { class: 'summary-table external-table' },
        el('caption', { class: 'visually-hidden' }, 'Solicitudes externas de la app'),
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Para qué'), el('th', { scope: 'col' }, 'A quién'), el('th', { scope: 'col' }, 'Cuándo'), el('th', { scope: 'col' }, 'Estado'))),
        el('tbody', {}, tableRows))));
  })();
  return page('Modo sin terceros', card(null, box));
}

