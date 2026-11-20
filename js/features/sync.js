// Ajustes > Sincronización (Fase A) and the #/unir layer used from the first-open setup.
// Pairing is with a QR, without accounts; the keys travel only inside the QR or encrypted with
// a secret that only the QR carries, so the server never sees them.
import { ui, util, db, sync, profile, router, security } from '../core.js';

const { el, icon } = util;
const put = (box, ...kids) => box.replaceChildren(...kids.flat().filter(Boolean));
const page = (title, ...kids) => el('section', { class: 'page settings-page' }, ui.pageHeader({ title, back: '/ajustes' }), ...kids);
const card = (title, ...kids) => el('section', { class: 'card stack' }, title ? el('h2', { class: 'card-title' }, title) : null, ...kids);
const muted = (text, small = false) => el('p', { class: `muted${small ? ' small' : ''}` }, text);
const btnRow = (...kids) => el('div', { class: 'btn-row' }, ...kids.filter(Boolean));
const canScan = () => !!navigator.mediaDevices?.getUserMedia;

export function render(ctx) {
  if (ctx.def.id === 'unir') return joinLayer(ctx);
  return syncPage(ctx);
}

function ago(t) {
  if (!t) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function busy(btn, label) {
  const span = btn.querySelector('span');
  const prev = span?.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  if (span && label) span.textContent = label;
  return () => { btn.disabled = false; btn.removeAttribute('aria-busy'); if (span && prev != null) span.textContent = prev; };
}

// ---------- QR ----------
async function qrNode(text, label) {
  const { default: qrcode } = await import('../../vendor/qrcode/qrcode.mjs');
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const pad = 3;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + pad} ${y + pad}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + pad * 2} ${n + pad * 2}`);
  svg.setAttribute('class', 'qr-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#ffffff');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#161214');
  svg.append(bg, p);
  return el('div', { class: 'qr-box' }, svg);
}

/** Camera scanner. Resolves the text of the first QR found, or null if closed. */
function scanQR({ title = 'Escanear el código', hint = '' } = {}) {
  return new Promise((resolve) => {
    let stream = null; let raf = 0; let done = false; let detector = null; let jsQR = null;
    const video = el('video', { class: 'qr-video', playsinline: '', muted: '', autoplay: '', 'aria-label': 'Vista de la cámara' });
    const msg = el('p', { class: 'muted small center', 'aria-live': 'polite' }, 'Abriendo la cámara…');
    const canvas = document.createElement('canvas');
    const stop = () => { done = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
    const finish = (text) => { if (done) return; stop(); m.close(); resolve(text); };
    const m = ui.openModal({
      title, size: 'sm', className: 'qr-modal',
      body: el('div', { class: 'stack center' }, el('div', { class: 'qr-frame' }, video, el('span', { class: 'qr-aim', 'aria-hidden': 'true' })), msg, hint ? muted(hint, true) : null),
      onClose: () => { if (!done) { stop(); resolve(null); } },
    });
    let last = 0;
    const tick = async (t) => {
      if (done) return;
      raf = requestAnimationFrame(tick);
      if (t - last < 220 || video.readyState < 2) return;
      last = t;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) finish(codes[0].rawValue);
        } else if (jsQR) {
          const w = video.videoWidth; const h = video.videoHeight;
          const scale = Math.min(1, 640 / Math.max(w, h));
          canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
          const g = canvas.getContext('2d', { willReadFrequently: true });
          g.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = g.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) finish(code.data);
        }
      } catch { /* next frame */ }
    };
    (async () => {
      try {
        if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.() || []).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        else jsQR = await loadJsQR();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done) { stop(); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        msg.textContent = 'Apunta al código de la otra pantalla.';
        raf = requestAnimationFrame(tick);
      } catch (e) {
        msg.textContent = e?.name === 'NotAllowedError' ? 'La cámara está bloqueada para la app. Permítela en el navegador y vuelve a intentarlo.' : 'No se pudo abrir la cámara de este equipo.';
      }
    })();
  });
}
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('vendor/jsqr/jsQR.js', document.baseURI).href;
    s.onload = () => res(window.jsQR); s.onerror = () => rej(new Error('scanner'));
    document.head.append(s);
  });
}

// ---------- pairing flows ----------
/** A device that is not linked joins: scan the code of a linked one, or show its own code. */
function joinFlow({ onJoined } = {}) {
  let pairing = null;
  const body = el('div', { class: 'stack' });
  const m = ui.openModal({ title: 'Unir este equipo', size: 'sm', body, onClose: () => pairing?.cancel() });
  const ok = async (result) => {
    m.close();
    ui.toast(result === 'keys' ? 'Listo: ahora lo tuyo de "Solo yo" también llega aquí.' : 'Equipo unido. Estamos trayendo todo…', { tone: 'success' });
    util.haptic([10, 40, 10]);
    onJoined?.(result);
  };
  const showCode = async () => {
    pairing = sync.requestPairing();
    put(body, ui.skeleton(2));
    const qr = await qrNode(pairing.code, 'Código para unir este equipo');
    put(body,
      muted('En un equipo que ya está unido, abre Ajustes > Sincronización > Unir otro equipo y escanea este código.'),
      qr,
      el('p', { class: 'muted small center', 'aria-live': 'polite' }, 'Esperando al otro equipo… El código vence en 10 minutos.'));
    try { const r = await pairing.wait; if (r) ok(r); } catch (e) {
      put(body, el('p', { class: 'error-text', role: 'alert' }, e.message), btnRow(ui.button({ label: 'Generar otro código', iconName: 'repeat', onClick: showCode })));
    }
  };
  const scan = async () => {
    const text = await scanQR({ hint: 'Es el código que muestra el otro equipo en "Unir otro equipo".' });
    if (!text) return;
    const code = sync.parseCode(text);
    if (!code || code.type !== 'space') { ui.toast(code?.type === 'pair' ? 'Ese código es para escanearlo desde un equipo ya unido.' : 'Ese código no es de Aishiteru.', { tone: 'error' }); return; }
    put(body, ui.skeleton(2), muted('Uniendo…', true));
    try { ok(await sync.joinWithCode(code)); } catch (e) { put(body, el('p', { class: 'error-text', role: 'alert' }, e.message)); }
  };
  put(body,
    muted('Necesitas otro equipo que ya tenga la app unida. Elige cómo:'),
    el('div', { class: 'stack' },
      canScan() ? ui.button({ label: 'Escanear el código del otro equipo', iconName: 'camera', variant: 'primary', onClick: scan }) : null,
      ui.button({ label: 'Mostrar un código aquí', iconName: 'smartphone', variant: canScan() ? 'secondary' : 'primary', onClick: showCode })),
    muted('En el PC lo más fácil es "Mostrar un código aquí" y escanearlo con el celular.', true));
}

/** A linked device adds another one (mine or my partner's). */
function addFlow({ onDone } = {}) {
  const me = sync.status().me || profile.active();
  const partner = profile.partnerOf(me);
  const body = el('div', { class: 'stack' });
  const m = ui.openModal({ title: 'Unir otro equipo', size: 'sm', body });
  let forPerson = me;
  const step2 = () => {
    put(body,
      muted(forPerson === me
        ? 'Será tuyo: también le llega lo tuyo de "Solo yo".'
        : `Será de ${profile.name(partner)}: le llega todo lo compartido y el Rincón, nunca lo tuyo de "Solo yo".`, true),
      el('div', { class: 'stack' },
        ui.button({ label: 'Mostrar un código aquí', iconName: 'smartphone', variant: 'primary', onClick: show }),
        canScan() ? ui.button({ label: 'Escanear el código del equipo nuevo', iconName: 'camera', onClick: scan }) : null),
      muted('Si el equipo nuevo es un PC, que muestre su código y escanéalo desde aquí.', true));
  };
  const show = async () => {
    put(body, ui.skeleton(2));
    try {
      const code = await sync.makeInvite(forPerson);
      put(body,
        muted('En el equipo nuevo: Ajustes > Sincronización > Unir este equipo > Escanear el código. Durante la configuración inicial, en "Sus datos", toca "Traerlos de otro equipo".'),
        await qrNode(code, 'Código para unir el equipo nuevo'),
        el('p', { class: 'muted small center' }, 'Sirve una sola vez y vence en 10 minutos. No le saques foto ni lo compartas: abre todo lo de los dos.'),
        btnRow(ui.button({ label: 'Listo', variant: 'primary', onClick: () => { m.close(); onDone?.(); } })));
    } catch (e) { put(body, el('p', { class: 'error-text', role: 'alert' }, e.code === 'REMOVED' ? 'Este equipo ya no está unido.' : 'No se pudo crear el código. Revisa la conexión.')); }
  };
  const scan = async () => {
    const text = await scanQR({ hint: 'Es el código que muestra el equipo nuevo en "Mostrar un código aquí".' });
    if (!text) return;
    const code = sync.parseCode(text);
    if (!code || code.type !== 'pair') { ui.toast('Ese código no sirve aquí. Escanea el que muestra el equipo nuevo.', { tone: 'error' }); return; }
    put(body, ui.skeleton(2));
    try {
      await sync.answerPairing(code, forPerson);
      put(body, el('p', { class: 'lead center' }, 'Listo. El otro equipo se está uniendo.'), btnRow(ui.button({ label: 'Cerrar', variant: 'primary', onClick: () => { m.close(); onDone?.(); } })));
      setTimeout(() => sync.refreshDevices().then(() => onDone?.()).catch(() => {}), 4000);
    } catch { put(body, el('p', { class: 'error-text', role: 'alert' }, 'No se pudo enviar. El código pudo vencer: genera otro en el equipo nuevo.')); }
  };
  put(body,
    el('p', {}, '¿De quién es el equipo nuevo?'),
    el('div', { class: 'stack' },
      ui.button({ label: 'Mío', iconName: 'user-round', variant: 'primary', onClick: () => { forPerson = me; step2(); } }),
      ui.button({ label: `De ${profile.name(partner)}`, iconName: 'heart', onClick: () => { forPerson = partner; step2(); } })));
}

// ---------- page ----------
function syncPage() {
  const root = page('Sincronización');
  const box = el('div', { class: 'stack' });
  root.append(box);
  const mode = () => (sync.isLinked() ? 'linked' : sync.status().removed ? 'removed' : 'unlinked');
  let drawn = '';
  const draw = () => { drawn = mode(); return ({ linked, removed, unlinked })[drawn](box, draw); };
  draw();
  const off = sync.onStatus(() => {
    if (mode() !== drawn) { draw(); return; } // linked elsewhere, removed from another device…
    box.querySelector('[data-live-status]')?.replaceWith(statusCard());
  });
  return { node: root, cleanup: off };
}

function unlinked(box, redraw) {
  const create = ui.button({ label: 'Crear nuestro espacio', iconName: 'sparkles', variant: 'primary', onClick: async () => {
    const ok = await ui.confirmDialog({
      title: 'Crear el espacio',
      message: 'Hazlo en un solo equipo, el primero. Los demás se unen a este con un código. Lo que ya tienes aquí se sube cifrado.',
      confirmLabel: 'Crear',
    });
    if (!ok) return;
    const done = busy(create, 'Creando…');
    try { await sync.createSpace(); ui.toast('Espacio creado. Ahora une los otros equipos.', { tone: 'success' }); redraw(); } catch (e) {
      done(); ui.toast(e.code ? 'No se pudo crear. Revisa la conexión e intenta otra vez.' : e.message, { tone: 'error' });
    }
  } });
  put(box,
    card('Todo en los cuatro equipos',
      muted('Une sus celulares y sus PC para tener lo mismo en todos, al instante. Sin cuentas ni contraseñas: se unen con un código QR.'),
      el('ul', { class: 'bullets' },
        el('li', {}, 'Todo viaja cifrado de extremo a extremo: el servidor guarda datos que no puede leer.'),
        el('li', {}, 'Lo tuyo de "Solo yo" llega solo a tus equipos. El Rincón llega a los cuatro y sigue con su PIN.'),
        el('li', {}, 'Si pierden un equipo, lo sacan desde otro y deja de recibir al momento.')),
      btnRow(create, ui.button({ label: 'Unir este equipo', iconName: 'smartphone', onClick: () => joinFlow({ onJoined: redraw }) }))),
    muted('¿Ya crearon el espacio en otro equipo? Entonces toca "Unir este equipo".', true));
}

function removed(box, redraw) {
  put(box, card('Este equipo ya no está unido',
    muted('Lo sacaron desde otro equipo o se borró el espacio. Lo que hay aquí sigue guardado, pero ya no se sincroniza.'),
    btnRow(ui.button({ label: 'Volver a unirlo', iconName: 'smartphone', variant: 'primary', onClick: async () => { await sync.leave({ server: false }); redraw(); joinFlow({ onJoined: redraw }); } }))));
}

function statusCard() {
  const s = sync.status();
  const tone = s.online ? (s.pending ? 'warn' : 'ok') : 'neutral';
  const value = !navigator.onLine ? 'Sin internet: se guarda aquí y se envía al volver'
    : s.online ? (s.pending ? `Enviando ${s.pending} ${s.pending === 1 ? 'cambio' : 'cambios'}…` : 'Al día, en vivo') : 'Conectando…';
  const now = ui.button({ label: 'Sincronizar ahora', iconName: 'repeat', small: true, onClick: async () => {
    const done = busy(now, 'Sincronizando…');
    await sync.syncNow(); done();
  } });
  return el('section', { class: 'card stack', dataset: { liveStatus: '1' } },
    el('ul', { class: 'status-list' },
      el('li', { class: `status-row tone-${tone}` }, el('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon(s.online ? 'circle-check' : 'clock', { size: 20 })),
        el('span', { class: 'status-text' }, el('span', { class: 'status-title' }, 'Estado'), el('span', { class: 'status-value', 'aria-live': 'polite' }, value))),
      el('li', { class: 'status-row tone-neutral' }, el('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon('clock', { size: 20 })),
        el('span', { class: 'status-text' }, el('span', { class: 'status-title' }, 'Última vez'), el('span', { class: 'status-value' }, ago(s.lastSyncAt))))),
    s.pending && s.online ? muted('Lo que está tras un PIN se envía cuando entras con ese PIN.', true) : null,
    btnRow(now));
}

const fmtBytes = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

/** "Espacio en la nube": how full the free server space is, with a kind warning from 80 %. */
function usageCard() {
  const body = el('div', { class: 'stack' }, muted('Midiendo…', true));
  const draw = (u) => {
    const full = sync.status().full || u?.pct >= 100;
    put(body,
      u ? el('div', { class: 'stack' },
        el('p', {}, el('strong', {}, fmtBytes(u.used)), ` de ${fmtBytes(u.accountLimit)} gratis`),
        el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Espacio usado en la nube', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, u.pct)) },
          el('span', { class: `progress-fill${u.pct >= sync.USAGE_WARN ? ' is-warn' : ''}`, style: { width: `${Math.min(100, u.pct)}%` } })),
        full ? el('p', { class: 'field-error', role: 'alert' }, 'Se llenó el espacio. Lo nuevo se guarda en cada teléfono, pero no se envía hasta liberar espacio.')
          : u.pct >= sync.USAGE_WARN ? muted('Se está llenando. Los videos cortos y las fotos pesan menos; borrar lo que ya no quieren libera espacio.', true)
            : muted('Todo va cifrado. Las fotos pesan poco; los videos son lo que más espacio usa.', true))
        : muted('No se pudo medir. Revisa la conexión.', true));
  };
  sync.lastUsage().then((u) => u && draw(u));
  sync.refreshUsage({ force: true }).then((u) => u && draw(u)).catch(() => sync.lastUsage().then((u) => { if (!u) draw(null); }));
  return card('Espacio en la nube', body, muted('El plan gratis de Cloudflare da hasta 5 GB. Los teléfonos guardan todo aparte, así que nada se pierde si se llena.', true));
}

function linked(box, redraw) {
  const s = sync.status();
  const me = s.me;
  const list = el('ul', { class: 'device-list' }, el('li', {}, ui.skeleton(2)));
  const drawDevices = (devs) => {
    const mineElsewhere = devs.some((d) => !d.me && d.person === me);
    put(list, devs.map((d) => el('li', { class: 'device-row' },
      el('span', { class: 'list-icon' }, icon(d.kind === 'pc' ? 'monitor' : 'smartphone')),
      el('span', { class: 'list-text' },
        el('span', { class: 'list-title' }, d.name),
        el('span', { class: 'muted small' }, d.me ? 'Este equipo' : `Visto ${ago(d.seen)}`)),
      d.me
        ? ui.button({ label: 'Cambiar nombre', iconName: 'pencil', small: true, variant: 'ghost', onClick: () => renameDialog(d.name, () => sync.devices().length && drawDevices(sync.devices())) })
        : ui.button({ label: 'Sacar', iconName: 'x', small: true, variant: 'ghost', ariaLabel: `Sacar ${d.name}`, onClick: async () => {
          const ok = await ui.confirmDialog({ title: `¿Sacar ${d.name}?`, message: 'Deja de recibir al momento. Lo que ya tenía guardado se queda en ese equipo; si lo perdieron, bórrenlo desde allí cuando lo recuperen.', confirmLabel: 'Sacar', danger: true });
          if (!ok) return;
          try { drawDevices(await sync.removeDevice(d.id)); ui.toast('Equipo sacado.', { tone: 'success' }); } catch { ui.toast('No se pudo. Revisa la conexión.', { tone: 'error' }); }
        } }))));
    personal.replaceChildren(...[
      muted('Lo tuyo de "Solo yo" viaja solo entre tus equipos, con una llave que el otro no tiene. El Rincón llega a los cuatro y en cada uno pide su PIN de 6.'),
      !s.hasPersonal && mineElsewhere ? el('p', { class: 'note-card card' }, 'Lo tuyo de "Solo yo" todavía no llega aquí. En tu otro equipo toca "Unir otro equipo" > "Mío" y escanea su código desde aquí, o muestra el código allí y escanéalo con este.') : null,
    ].filter(Boolean));
  };
  const personal = el('div', { class: 'stack' });
  sync.refreshDevices().then(drawDevices).catch(() => put(list, el('li', {}, muted('No se pudo cargar la lista. Revisa la conexión.'))));

  const notifyToggle = ui.toggle({
    label: 'Avisos cariñosos', checked: s.notify,
    hint: 'Te avisa cuando te llega un Pensando en ti, una carta, un cupón o un recuerdo nuevo. El aviso nunca muestra el contenido.',
    disabled: !sync.notificationsSupported(),
    onChange: async (on) => {
      try {
        if (on && !(await security.thirdPartyAllowed())) throw new Error('Está activo el Modo sin terceros. Los avisos usan el servicio del navegador; apágalo en Ajustes > Modo sin terceros para activarlos.');
        if (on) await sync.enableNotifications(); else await sync.disableNotifications(); ui.toast(on ? 'Avisos activados en este equipo.' : 'Avisos apagados en este equipo.', { tone: 'success' }); } catch (e) {
        ui.toast(e.message || 'No se pudo.', { tone: 'error' });
        const input = notifyToggle.querySelector('input'); if (input) input.checked = !on;
      }
    },
  });

  put(box,
    statusCard(),
    usageCard(),
    card('Equipos unidos', list, btnRow(ui.button({ label: 'Unir otro equipo', iconName: 'plus', variant: 'primary', onClick: () => addFlow({ onDone: () => sync.refreshDevices().then(drawDevices).catch(() => {}) }) }))),
    card('Avisos', notifyToggle, muted('Se activan por equipo. Si los bloqueaste, permítelos en los ajustes del navegador.', true)),
    card('Lo privado', personal),
    card('Qué sale de este equipo',
      el('ul', { class: 'bullets' },
        el('li', {}, 'Todo lo que guardan, con fotos y videos, cifrado aquí antes de salir.'),
        el('li', {}, 'El servidor (Cloudflare, plan gratis) solo ve datos ilegibles, cuándo cambió algo y cuántos equipos hay.'),
        el('li', {}, 'Si borran algo, se borra en todos. Si los dos cambian lo mismo a la vez, queda el último cambio.')),
      muted('Las llaves viven solo en sus equipos. Si sacan todos los equipos o borran el espacio, el servidor queda vacío.', true)),
    card('Salir',
      btnRow(
        ui.button({ label: 'Sacar este equipo', iconName: 'x', onClick: async () => {
          const ok = await ui.confirmDialog({ title: '¿Sacar este equipo?', message: 'Deja de sincronizar. Lo que hay aquí se queda guardado aquí.', confirmLabel: 'Sacar', danger: true });
          if (!ok) return;
          await sync.leave(); ui.toast('Este equipo ya no sincroniza.'); redraw();
        } }),
        ui.button({ label: 'Borrar todo del servidor', iconName: 'trash-2', variant: 'danger', onClick: async () => {
          const ok = await ui.confirmDialog({ title: '¿Borrar todo del servidor?', message: 'Se borra la copia cifrada y se separan todos los equipos. Lo que cada equipo tiene guardado se queda en él.', confirmLabel: 'Borrar del servidor', danger: true });
          if (!ok) return;
          try { await sync.destroySpace(); ui.toast('Se borró todo del servidor.'); redraw(); } catch { ui.toast('No se pudo. Revisa la conexión.', { tone: 'error' }); }
        } }))));
}

function renameDialog(current, onDone) {
  const input = ui.input({ value: current, maxlength: '40', autocomplete: 'off' });
  ui.openModal({
    title: 'Nombre de este equipo', size: 'sm',
    body: el('div', { class: 'stack' }, ui.field({ label: 'Nombre', control: input })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!input.value.trim()) return false;
      try { await sync.renameDevice(input.value); onDone?.(); } catch { ui.toast('No se pudo. Revisa la conexión.', { tone: 'error' }); }
      return true;
    } }],
  });
}

// ---------- #/unir (from the first-open setup) ----------
function joinLayer() {
  const root = el('section', { class: 'layer setup' });
  const back = () => router.go('/setup', { replace: true });
  const finish = async () => {
    await db.setMeta({ setupStep: 4 });
    router.go('/setup', { replace: true });
  };
  root.append(el('div', { class: 'layer-card' },
    el('div', { class: 'layer-top' }, el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Volver', onClick: back }, icon('arrow-left'))),
    el('div', { class: 'layer-body view-enter' },
      el('h1', { class: 'layer-title', tabindex: '-1' }, 'Traerlos de otro equipo'),
      el('p', { class: 'muted' }, 'Si ya usan la app en otro celular o PC, une este y llega todo: nombres, fechas, recuerdos, fotos y cartas.'),
      btnRow(ui.button({ label: 'Unir este equipo', iconName: 'smartphone', variant: 'primary', onClick: () => joinFlow({ onJoined: finish }) })))));
  return root;
}
