// Ajustes de la Fase 2: Centro de seguridad (docs/04) y Copia de seguridad (docs/03, docs/08 §5-6).
// Everything happens on this device: PINs are never stored, only the keys they wrap.
import { ui, util, db, security, cryptoBox, backup, profile, router, CONFIG } from '../core.js';

const { el, icon } = util;
const DAY = 86400000;
const BACKUP_REMIND_DAYS = 14;

export function render(ctx) {
  const page = ctx.def.settingsPage;
  if (page === 'copia') return copia(ctx.app);
  return seguridad(ctx);
}

// ---------- shared helpers ----------
const page = (title, ...kids) => el('section', { class: 'page settings-page' }, ui.pageHeader({ title, back: '/ajustes' }), ...kids);
const card = (title, ...kids) => el('section', { class: 'card stack' }, title ? el('h2', { class: 'card-title' }, title) : null, ...kids);
const muted = (text, small = false) => el('p', { class: `muted${small ? ' small' : ''}` }, text);
/** replaceChildren that skips empty slots (native replaceChildren would print "null"). */
const put = (box, ...kids) => box.replaceChildren(...kids.flat().filter(Boolean));
const btnRow = (...kids) => el('div', { class: 'btn-row' }, ...kids.filter(Boolean));

function busy(btn, label) {
  const span = btn.querySelector('span');
  const prev = span?.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  if (span && label) span.textContent = label;
  return () => { btn.disabled = false; btn.removeAttribute('aria-busy'); if (span && prev != null) span.textContent = prev; };
}

async function pinLength(scope) {
  const digits = [...new Set((await security.keyRecords(scope)).map((r) => r.digits))];
  return digits.length === 1 && digits[0] ? { min: digits[0], max: digits[0] } : { min: 4, max: 6, autoSubmit: false };
}

/**
 * Ask for the current PIN of a scope (with the growing delay). Resolves
 * { pin, keys } or null when cancelled.
 */
export async function askPin({ scope, title = 'Confirma con tu PIN', intro = '' } = {}) {
  const lens = await pinLength(scope);
  return new Promise((resolve) => {
    let out = null;
    const pad = ui.pinPad({
      label: 'PIN', submitLabel: 'Confirmar', ...lens,
      onSubmit: async (pin) => {
        const r = await security.verifyPin(scope, pin);
        if (r.error) return r.error;
        out = { pin, keys: r.keys }; m.close();
        return null;
      },
    });
    const m = ui.openModal({ title, size: 'sm', body: el('div', { class: 'stack center' }, intro ? muted(intro) : null, pad), onClose: () => resolve(out) });
    requestAnimationFrame(() => pad.focusInput());
  });
}

/** Ask for a new 4-digit PIN twice. Resolves the PIN or null. */
function askNewPin({ title = 'Nuevo PIN' } = {}) {
  return new Promise((resolve) => {
    let first = null; let out = null;
    const body = el('div', { class: 'stack center' });
    const m = ui.openModal({ title, size: 'sm', body, onClose: () => resolve(out) });
    const ask = () => {
      const pad = ui.pinPad({
        label: first ? 'Repite el PIN nuevo' : 'PIN nuevo de 4 números', submitLabel: first ? 'Confirmar' : 'Seguir',
        onSubmit: async (v) => {
          if (!first) { first = v; ask(); return null; }
          if (v !== first) { first = null; setTimeout(ask, 900); return 'No coinciden. Empecemos otra vez.'; }
          out = v; m.close(); return null;
        },
      });
      put(body, pad);
      requestAnimationFrame(() => pad.focusInput());
    };
    ask();
  });
}

/** When the app PIN exists, destructive actions ask for it. Resolves true when allowed. */
async function confirmWithAppPin(intro) {
  if (!security.hasKey('app')) return true;
  return !!(await askPin({ scope: 'app', title: 'Confirma con el PIN de la app', intro }));
}

function daysAgo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / DAY));
}
function backupAgo(iso) {
  if (!iso) return 'Ninguna todavía';
  const n = daysAgo(iso);
  const day = util.formatDay(iso.slice(0, 10));
  if (n == null) return day;
  return `${day} · ${n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`}`;
}

async function persistedState() {
  try {
    if (!navigator.storage?.persisted) return 'na';
    return (await navigator.storage.persisted()) ? 'on' : 'off';
  } catch { return 'na'; }
}

/** Counts encrypted and private-but-plain records (what the status card reports). */
async function encryptionCounts() {
  let enc = 0; let plain = 0;
  for (const name of db.STORE_NAMES) {
    if (['meta', 'settings', 'errors', 'vault', 'media'].includes(name)) continue;
    for (const r of await db.rawAll(name)) {
      if (r.deleted) continue;
      if (r.enc) enc++;
      else if (r.private) plain++;
    }
  }
  return { enc, plain };
}

function statusRow({ iconName, title, value, tone = 'neutral', action }) {
  return el('li', { class: `status-row tone-${tone}` },
    el('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 20 })),
    el('span', { class: 'status-text' }, el('span', { class: 'status-title' }, title), el('span', { class: 'status-value' }, value)),
    action || null);
}

// =====================================================================
// Centro de seguridad
// =====================================================================
function seguridad({ app }) {
  const me = profile.active();
  const meName = profile.name(me);
  const partnerName = profile.name(profile.partnerOf(me));
  const personal = `person:${me}`;

  const statusBox = el('ul', { class: 'status-list', 'aria-label': 'Estado de seguridad' }, ui.skeleton(3));
  const pinBox = el('div', { class: 'stack' });
  const personalBox = el('div', { class: 'stack' });
  const locksBox = el('div', { class: 'stack' });
  const attemptsBox = el('div', { class: 'stack' });
  const wipeBox = el('div', { class: 'stack' });

  const redraw = async () => {
    await security.refreshKeys();
    const [s, meta, persisted, counts, appKeys, bioOk] = await Promise.all([
      security.getSettings(), db.getMeta(), persistedState(), encryptionCounts(),
      security.keyRecords('app'), cryptoBox.biometricAvailable()]);
    const hasApp = security.hasKey('app');
    const hasMine = security.hasKey(personal);
    const bio = appKeys.find((r) => r.bio?.credId)?.bio || null;

    // --- status ---
    const ago = meta.lastBackupAt ? daysAgo(meta.lastBackupAt) : null;
    const persistBtn = persisted === 'off' ? ui.button({ label: 'Activar', small: true, onClick: async () => {
      let ok = false;
      try { ok = await navigator.storage.persist(); } catch { ok = false; }
      await db.setMeta({ persisted: !!ok });
      ui.toast(ok ? 'Almacenamiento persistente activo.' : 'El navegador no lo permitió. Instalar la app ayuda.', { tone: ok ? 'success' : 'info' });
      redraw();
    } }) : null;
    put(statusBox, 
      statusRow({ iconName: hasApp ? 'lock' : 'lock-open', title: 'Bloqueo de la app', tone: hasApp && s.appLock ? 'ok' : 'warn',
        value: hasApp ? (s.appLock ? 'Pide el PIN al abrir' : 'PIN creado, sin pedirlo al abrir') : 'Sin PIN: la app abre directo' }),
      statusRow({ iconName: 'fingerprint', title: 'Huella o rostro', tone: bio ? 'ok' : 'neutral',
        value: bio ? (bio.prf ? 'Abre la app y también lo privado' : 'Abre la pantalla; lo privado pide el PIN') : (bioOk ? 'No configurada' : 'Este navegador no la ofrece') }),
      statusRow({ iconName: 'shield-check', title: 'Datos privados', tone: counts.plain ? 'warn' : 'ok',
        value: counts.plain
          ? `${plural(counts.plain, 'elemento privado sin cifrar', 'elementos privados sin cifrar')}${hasApp ? '' : '. Crea un PIN para cifrarlos'}`
          : counts.enc ? `${plural(counts.enc, 'elemento cifrado', 'elementos cifrados')} en este dispositivo` : 'Todavía no hay nada privado' }),
      statusRow({ iconName: 'user-round', title: `PIN personal de ${meName}`, tone: hasMine ? 'ok' : 'neutral',
        value: hasMine ? 'Activo: lo "Solo yo" va cifrado' : 'No creado: lo "Solo yo" se oculta, pero sin cifrar' }),
      statusRow({ iconName: 'hard-drive', title: 'Última copia', tone: ago == null || ago >= BACKUP_REMIND_DAYS ? 'warn' : 'ok',
        value: backupAgo(meta.lastBackupAt), action: ago == null || ago >= BACKUP_REMIND_DAYS ? ui.button({ label: 'Hacer copia', small: true, href: '#/ajustes/copia' }) : null }),
      statusRow({ iconName: 'smartphone', title: 'Almacenamiento persistente', tone: persisted === 'on' ? 'ok' : 'warn',
        value: persisted === 'on' ? 'Activo: el navegador no borra los datos por su cuenta' : persisted === 'off' ? 'No activo' : 'Este navegador no lo informa',
        action: persistBtn }));

    // --- app PIN ---
    if (!hasApp) {
      put(pinBox, 
        muted('Con un PIN, la app pide los 4 números al abrirse y cifra lo que marquen como privado.'),
        btnRow(ui.button({ label: 'Crear PIN de la app', iconName: 'key-round', variant: 'primary', onClick: async () => {
          const raw = await security.createPinDialog({ scope: 'app', title: 'PIN de la app', intro: 'Si lo olvidan, lo privado no se puede recuperar. Elijan uno que ambos recuerden.' });
          if (!raw) return;
          ui.toast('PIN creado. La app lo pedirá al abrirse.', { tone: 'success' });
          if (bioOk) await offerBiometric(raw);
          redraw();
        } })));
    } else {
      const lockToggle = ui.toggle({ label: 'Pedir el PIN al abrir la app', hint: 'Si lo apagan, lo privado sigue cifrado y pide el PIN al entrar.', checked: s.appLock,
        onChange: async (v) => {
          if (!v && !(await confirmWithAppPin('Para dejar de pedir el PIN al abrir.'))) { lockToggle.querySelector('input').checked = true; return; }
          await security.setSettings({ appLock: v }); ui.toast(v ? 'La app pedirá el PIN al abrirse.' : 'La app ya no pide el PIN al abrirse.'); redraw();
        } });
      const bioBtn = bio
        ? ui.button({ label: 'Quitar la huella', iconName: 'fingerprint', variant: 'ghost', onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Quitar la huella?', message: 'Para abrir la app se usará solo el PIN.', confirmLabel: 'Quitar' }))) return;
          await security.removeBiometric('app'); ui.toast('Huella quitada.'); redraw();
        } })
        : bioOk ? ui.button({ label: 'Usar huella o rostro', iconName: 'fingerprint', onClick: async () => {
          const ok = await askPin({ scope: 'app', title: 'Confirma con el PIN', intro: 'Para registrar la huella en este teléfono.' });
          if (!ok) return;
          const newest = [...ok.keys].sort((a, b) => String(b.record.createdAt || '').localeCompare(String(a.record.createdAt || '')))[0];
          await offerBiometric(newest.rawDek, { ask: false });
          redraw();
        } }) : null;
      put(pinBox, lockToggle,
        bioOk || bio ? muted('La huella es más cómoda. Si el teléfono permite usarla para cifrar, también abre lo privado; si no, solo abre la pantalla y lo privado sigue pidiendo el PIN. Aquí arriba se ve cuál es el caso.', true) : null,
        btnRow(
          ui.button({ label: 'Cambiar PIN', iconName: 'key-round', onClick: () => changePinFlow('app', 'PIN de la app').then(redraw) }),
          bioBtn,
          ui.button({ label: 'Quitar PIN', iconName: 'lock-open', variant: 'ghost', onClick: () => removePinFlow('app', 'Lo privado dejará de estar cifrado y la app abrirá sin PIN.').then(redraw) })));
    }

    // --- personal PIN of the active person ---
    put(personalBox, 
      muted(`Protege lo que ${meName} marque como "Solo yo": queda cifrado y para verlo se pide este PIN. ${partnerName} no lo ve ni cuenta cuántos hay.`),
      hasMine
        ? btnRow(
          ui.button({ label: 'Cambiar PIN personal', iconName: 'key-round', onClick: () => changePinFlow(personal, 'tu PIN personal').then(redraw) }),
          ui.button({ label: 'Quitar PIN personal', iconName: 'lock-open', variant: 'ghost', onClick: () => removePinFlow(personal, 'Lo "Solo yo" seguirá oculto para la otra persona, pero sin cifrar.').then(redraw) }))
        : btnRow(ui.button({ label: 'Crear mi PIN personal', iconName: 'key-round', onClick: async () => {
          const raw = await security.createPinDialog({ scope: personal, title: 'Tu PIN personal', intro: 'Si lo olvidas, lo "Solo yo" no se puede recuperar.' });
          if (raw) { ui.toast('PIN personal creado.', { tone: 'success' }); redraw(); }
        } })),
      muted(`Para el PIN de ${partnerName}, cambia de persona arriba en Ajustes. Es un solo dispositivo sin cuentas: con PIN es privado de verdad; sin PIN es privacidad de cortesía.`, true));

    // --- locks ---
    const minutes = String(Math.round((s.autoLockSeconds || 0) / 60));
    put(locksBox, 
      ui.toggle({ label: 'Bloquear lo privado al salir', hint: 'Al cambiar de app o salir de una sección protegida, vuelve a pedir el PIN.', checked: s.lockOnLeave,
        onChange: async (v) => { await security.setSettings({ lockOnLeave: v }); ui.toast(v ? 'Lo privado se bloquea al salir.' : 'Lo privado queda abierto hasta cerrar la app.'); } }),
      ui.toggle({ label: 'Cortina de privacidad', hint: 'Cubre la app con una pantalla neutra en la vista de apps recientes.', checked: s.curtain,
        onChange: async (v) => { await security.setSettings({ curtain: v }); ui.toast(v ? 'Cortina activada.' : 'Cortina apagada.'); } }),
      el('div', { class: 'field' },
        el('span', { class: 'field-label', id: 'autolock-label' }, 'Bloquear por inactividad'),
        hasApp ? null : el('p', { class: 'field-hint' }, 'Necesita el PIN de la app.'),
        hasApp ? ui.segmented({ label: 'Bloquear por inactividad', value: ['0', '1', '5', '15'].includes(minutes) ? minutes : '0',
          options: [{ value: '0', label: 'Nunca' }, { value: '1', label: '1 min' }, { value: '5', label: '5 min' }, { value: '15', label: '15 min' }],
          onChange: async (v) => { await security.setAutoLock(Number(v) * 60); ui.toast(v === '0' ? 'Sin bloqueo por inactividad.' : `Se bloquea tras ${v} min sin usarla.`); } }) : null),
      el('div', { class: 'stack-tight' },
        btnRow(ui.button({ label: 'Probar el botón de pánico', iconName: 'eye-off', onClick: () => security.panic({}) })),
        muted('Cubre todo al instante. Está siempre arriba (el ojo tachado) y en el PC también con Esc dos veces. Para volver, toca el sello.', true)));

    // --- failed attempts ---
    const wipeToggle = ui.toggle({
      label: `Borrar todo tras ${s.wipeThreshold || 10} intentos fallidos`,
      hint: hasApp ? 'Apagado por defecto. Si alguien falla el PIN de la app tantas veces seguidas, se borra todo en este dispositivo.' : 'Necesita el PIN de la app.',
      checked: hasApp && s.wipeAfterFailures, disabled: !hasApp,
      onChange: async (v) => {
        if (v) {
          const ok = await ui.confirmDialog({ title: '¿Activar el borrado automático?', danger: true, confirmLabel: 'Activar',
            message: `Tras ${s.wipeThreshold || 10} intentos fallidos seguidos con el PIN de la app se borra todo lo de este dispositivo, sin vuelta atrás. Tengan siempre una copia reciente.` });
          if (!ok) { wipeToggle.querySelector('input').checked = false; return; }
        }
        await security.setSettings({ wipeAfterFailures: v });
        ui.toast(v ? 'Borrado automático activado.' : 'Borrado automático apagado.');
      } });
    put(attemptsBox, 
      muted('Tras 3 intentos fallidos, la app hace esperar 30 segundos, y el tiempo se duplica en cada fallo hasta 15 minutos.'),
      wipeToggle);

    // --- delete ---
    put(wipeBox, await sectionWipeList(redraw),
      el('div', { class: 'danger-zone stack' },
        el('h3', { class: 'danger-title' }, icon('triangle-alert', { size: 20 }), el('span', {}, 'Borrar todo')),
        muted('Deja la app como recién instalada en este dispositivo: recuerdos, fotos, cartas, cupones, ajustes y PIN. No toca la copia que hayan descargado ni el otro teléfono.'),
        btnRow(
          ui.button({ label: 'Descargar una copia antes', iconName: 'download', href: '#/ajustes/copia' }),
          ui.button({ label: 'Borrar todo', iconName: 'trash-2', variant: 'danger', onClick: () => wipeAllFlow(app) }))));
  };

  async function offerBiometric(rawDek, { ask = true } = {}) {
    if (ask && !(await ui.confirmDialog({ title: '¿Usar también la huella?', confirmLabel: 'Usar huella', cancelLabel: 'Solo PIN',
      message: 'Podrán abrir la app con la huella o el rostro de este teléfono.' }))) return;
    try {
      const bio = await security.enrollBiometric('app', rawDek);
      ui.toast(bio.prf ? 'Huella lista: abre la app y lo privado.' : 'Huella lista: abre la pantalla; lo privado pedirá el PIN.', { tone: 'success' });
    } catch { ui.toast('No se pudo registrar la huella. Pueden intentarlo de nuevo.', { tone: 'error' }); }
  }

  redraw();
  // Profile data reloads also emit; only a real switch of person redraws the page.
  const off = profile.onProfileChange(() => { if (profile.active() !== me) router.refresh(); });
  return { node: page('Centro de seguridad',
    card('Estado', statusBox),
    card('PIN de la app', pinBox),
    card('Mi PIN personal', personalBox),
    card('Bloqueos', locksBox),
    card('Intentos fallidos', attemptsBox),
    card('Borrar datos', wipeBox)), cleanup: off };
}

async function changePinFlow(scope, what) {
  const old = await askPin({ scope, title: `Cambiar ${what}`, intro: 'Primero, el PIN actual.' });
  if (!old) return;
  const neu = await askNewPin({ title: `Cambiar ${what}` });
  if (!neu) return;
  try {
    await security.changePin(scope, old.pin, neu, old.keys);
    ui.toast('PIN cambiado.', { tone: 'success' });
  } catch (e) {
    db.logError(`changePin: ${e?.message}`, e?.stack, CONFIG.appVersion);
    ui.toast('No se pudo cambiar el PIN. El anterior sigue funcionando.', { tone: 'error' });
  }
}

async function removePinFlow(scope, consequence) {
  if (!(await ui.confirmDialog({ title: '¿Quitar el PIN?', message: consequence, confirmLabel: 'Seguir', danger: true }))) return;
  const ok = await askPin({ scope, title: 'Confirma con el PIN' });
  if (!ok) return;
  try {
    await security.removePin(scope, ok.pin, ok.keys);
    ui.toast('PIN quitado.');
  } catch (e) {
    db.logError(`removePin: ${e?.message}`, e?.stack, CONFIG.appVersion);
    ui.toast('No se pudo quitar el PIN.', { tone: 'error' });
  }
}

// ---------- delete by section ----------
const SECTIONS = [
  { id: 'memories', title: 'Recuerdos de la Cápsula', hint: 'Con sus fotos.', icon: 'hourglass',
    list: async () => (await db.query('memories', { includeHidden: true, includeLocked: true })).map((r) => ['memories', r.id]) },
  { id: 'coupons', title: 'Cupones creados y canjes', hint: 'Los cupones iniciales vuelven a estar sin canjear.', icon: 'ticket',
    list: async () => [
      ...(await db.query('content', { index: 'kind', range: IDBKeyRange.only('coupon'), includeHidden: true, includeLocked: true })).filter((c) => c.origin === 'user').map((r) => ['content', r.id]),
      ...(await db.query('couponState', { includeHidden: true, includeLocked: true })).map((r) => ['couponState', r.id])] },
  { id: 'letters', title: 'Cartas escritas y abiertas', hint: 'Las cartas iniciales vuelven a estar cerradas.', icon: 'mail',
    list: async () => (await db.query('letters', { includeHidden: true, includeLocked: true })).map((r) => ['letters', r.id]) },
  { id: 'thinking', title: 'Pensando en ti', hint: 'El historial de avisos.', icon: 'heart',
    list: async () => (await db.query('thinkingOfYou', { includeHidden: true, includeLocked: true })).map((r) => ['thinkingOfYou', r.id]) },
];

async function sectionWipeList(onDone) {
  const partnerName = profile.name(profile.partnerOf(profile.active()));
  const rows = await Promise.all(SECTIONS.map(async (sec) => {
    const items = await sec.list();
    const n = items.length;
    return el('li', { class: 'list-row wipe-row' },
      el('span', { class: 'list-icon' }, icon(sec.icon)),
      el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, sec.title),
        el('span', { class: 'list-sub' }, n ? `${plural(n, 'elemento', 'elementos')}. ${sec.hint}` : 'Nada que borrar.')),
      n ? ui.button({ label: 'Borrar', small: true, variant: 'ghost', ariaLabel: `Borrar ${sec.title}`, onClick: async () => {
        const ok = await ui.confirmDialog({ title: `¿Borrar ${sec.title.toLowerCase()}?`, danger: true, confirmLabel: 'Borrar',
          message: `Se borran ${plural(n, 'elemento', 'elementos')} de este dispositivo. Lo "Solo yo" de ${partnerName} no se toca. Una copia vieja no los devuelve al combinar; para recuperarlos, usen "Reemplazar todo".` });
        if (!ok || !(await confirmWithAppPin(`Para borrar ${sec.title.toLowerCase()}.`))) return;
        for (const [store, id] of await sec.list()) await db.purge(store, id);
        ui.toast(`${sec.title}: borrado.`, { tone: 'success' });
        onDone();
      } }) : null);
  }));
  return el('div', { class: 'stack-tight' },
    el('h3', { class: 'subhead' }, 'Por sección'),
    el('ul', { class: 'list wipe-list', 'aria-label': 'Borrar por sección' }, rows));
}

function wipeAllFlow(app) {
  const word = 'BORRAR';
  const inp = ui.input({ autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const f = ui.field({ label: `Escribe ${word} para confirmar`, control: inp });
  const m = ui.openModal({
    title: '¿Borrar todo?', size: 'sm',
    body: el('div', { class: 'stack' },
      el('p', {}, 'Se borra todo lo de este dispositivo y la app vuelve al asistente inicial. No se puede deshacer.'),
      f),
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: false },
      { label: 'Borrar todo', variant: 'danger', onClick: async () => {
        if (inp.value.trim().toUpperCase() !== word) { f.setError(`Escribe ${word} tal cual.`); inp.focus(); return false; }
        return true;
      }, value: true },
    ],
  });
  inp.addEventListener('input', () => f.setError(''));
  m.result.then(async (v) => {
    if (v !== true) return;
    if (!(await confirmWithAppPin('Último paso para borrar todo.'))) return;
    await app.wipeEverything();
  });
}

// =====================================================================
// Copia de seguridad
// =====================================================================
const STORE_LABELS = {
  content: 'Textos de la app', profile: 'Perfil y datos', settings: 'Ajustes', memories: 'Recuerdos',
  couponState: 'Cupones canjeados', letters: 'Cartas', thinkingOfYou: 'Pensando en ti', specialDates: 'Fechas especiales', pets: 'Mascotas',
};
const storeLabel = (name) => STORE_LABELS[name] || 'Otros datos';

const isPrivate = (r) => r.private === true && r.visibility !== 'self' && !r.deleted;

async function privateCounts() {
  let plain = 0; let enc = 0;
  for (const name of db.STORE_NAMES) {
    if (['meta', 'errors', 'vault', 'media'].includes(name)) continue;
    for (const r of await db.rawAll(name)) if (isPrivate(r)) (r.enc ? enc++ : plain++);
  }
  return { plain, enc };
}

function copia(app) {
  const statusBox = el('ul', { class: 'status-list', 'aria-label': 'Estado de las copias' }, ui.skeleton(2));
  const exportBox = el('div', { class: 'stack' });
  const importBox = el('div', { class: 'stack' });

  const drawStatus = async () => {
    const meta = await db.getMeta();
    const ago = meta.lastBackupAt ? daysAgo(meta.lastBackupAt) : null;
    put(statusBox, 
      statusRow({ iconName: 'download', title: 'Última copia', tone: ago == null || ago >= BACKUP_REMIND_DAYS ? 'warn' : 'ok', value: backupAgo(meta.lastBackupAt) }),
      statusRow({ iconName: 'upload', title: 'Última importación', value: meta.lastImportAt ? backupAgo(meta.lastImportAt) : 'Ninguna todavía' }));
  };

  // ---- export ----
  const drawExport = async () => {
    const priv = await privateCounts();
    const total = priv.plain + priv.enc;
    let includePrivate = false; let encrypt = true;
    const pw1 = ui.input({ type: 'password', autocomplete: 'new-password', minlength: '8' });
    const pw2 = ui.input({ type: 'password', autocomplete: 'new-password', minlength: '8' });
    const f1 = ui.field({ label: 'Contraseña de la copia', control: pw1, hint: 'Mínimo 8 caracteres. No se guarda en ninguna parte: sin ella, lo privado de la copia no se puede abrir.' });
    const f2 = ui.field({ label: 'Repite la contraseña', control: pw2 });
    [pw1, pw2].forEach((i) => i.addEventListener('input', () => { f1.setError(''); f2.setError(''); }));
    const pwBox = el('div', { class: 'stack', hidden: true }, f1, f2);
    const encToggle = ui.toggle({ label: 'Cifrar lo privado con una contraseña', hint: 'Recomendado. Si lo apagan, lo privado viaja legible dentro del archivo.', checked: true,
      onChange: (v) => { encrypt = v; sync(); } });
    const encBox = el('div', { class: 'stack', hidden: true }, priv.plain ? encToggle : muted('Lo privado ya viaja cifrado con el PIN de la app.', true), pwBox);
    const sync = () => { encBox.hidden = !includePrivate; pwBox.hidden = !(includePrivate && encrypt && priv.plain > 0); };
    const privToggle = total ? ui.toggle({ label: 'Incluir lo privado', hint: `Hoy hay ${plural(total, 'elemento privado', 'elementos privados')}. Sin marcar, la copia no los lleva.`, checked: false,
      onChange: (v) => { includePrivate = v; sync(); } }) : null;

    const build = async () => {
      if (includePrivate && encrypt && priv.plain > 0) {
        if (pw1.value.length < 8) { f1.setError('Usa al menos 8 caracteres.'); pw1.focus(); return null; }
        if (pw1.value !== pw2.value) { f2.setError('No coinciden.'); pw2.focus(); return null; }
      }
      return backup.exportBackup({ includePrivate, encryptPrivate: encrypt, password: pw1.value, appVersion: CONFIG.appVersion });
    };
    const after = async (files) => {
      await db.setMeta({ lastBackupAt: util.nowISO() });
      pw1.value = ''; pw2.value = '';
      ui.toast(files.length > 1 ? 'Copia guardada en dos archivos (datos y fotos). Guárdenlos juntos.' : 'Copia guardada. Guárdenla en un lugar seguro.', { tone: 'success' });
      drawStatus();
    };
    const fail = (e) => {
      db.logError(`export: ${e?.message}`, e?.stack, CONFIG.appVersion);
      ui.toast('No se pudo crear la copia. Intenta de nuevo.', { tone: 'error' });
    };

    const download = ui.button({ label: 'Descargar copia', iconName: 'download', variant: 'primary', onClick: async () => {
      const done = busy(download, 'Preparando…');
      try {
        const out = await build(); if (!out) return;
        let saved = 0;
        for (const f of out.files) { const r = await backup.saveJSON(f.name, f.data); if (r !== 'cancelled') saved++; }
        if (saved) await after(out.files);
      } catch (e) { fail(e); } finally { done(); }
    } });
    const canShareFiles = (() => { try { return !!navigator.canShare?.({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] }); } catch { return false; } })();
    const send = canShareFiles ? ui.button({ label: 'Enviar al otro teléfono', iconName: 'share-2', onClick: async () => {
      const done = busy(send, 'Preparando…');
      try {
        const out = await build(); if (!out) return;
        const files = out.files.map((f) => new File([JSON.stringify(f.data)], f.name, { type: 'application/json' }));
        await navigator.share({ files, title: 'Copia de Aishiteru' });
        await after(out.files);
      } catch (e) { if (e?.name !== 'AbortError') fail(e); } finally { done(); }
    } }) : null;

    put(exportBox, 
      muted('Un archivo con todo: recuerdos con fotos, cartas, cupones, ajustes y perfil. Lo "Solo yo" viaja cifrado si su dueño tiene PIN personal.'),
      privToggle, encBox,
      btnRow(download, send),
      muted('Si las fotos pasan de unos 50 MB, la copia se divide en dos archivos: datos y fotos.', true));
  };

  // ---- import ----
  const drawImportStart = (message = null) => {
    const file = el('input', { type: 'file', accept: 'application/json,.json', multiple: true, class: 'visually-hidden', id: 'backup-file', tabindex: '-1', 'aria-label': 'Archivo de copia' });
    file.addEventListener('change', () => { if (file.files?.length) readFiles([...file.files]); });
    put(importBox, 
      message,
      muted('Elige el archivo de copia (si son dos, datos y fotos, elige ambos). Antes de cambiar nada verás un resumen.'),
      btnRow(ui.button({ label: 'Elegir archivo de copia', iconName: 'file-up', onClick: () => file.click() })),
      file);
  };

  const errorNote = (text) => el('div', { class: 'card note-card note-error', role: 'alert' }, el('p', {}, text), el('p', { class: 'muted small' }, 'No se cambió nada.'));

  async function readFiles(files) {
    put(importBox, ui.skeleton(3));
    const parts = [];
    for (const f of files) {
      let obj;
      try { obj = await backup.readFile(f); } catch (e) { drawImportStart(errorNote(e.message)); return; }
      const v = backup.validateBackup(obj);
      if (!v.ok) { drawImportStart(errorNote(v.error)); return; }
      parts.push(v.backup);
    }
    // Data part first, photos after: merging both lets them be chosen together in any order.
    parts.sort((a, b) => (a.part === 'media') - (b.part === 'media'));
    const merged = parts.reduce((acc, p) => (acc ? {
      ...acc, stores: { ...acc.stores, ...Object.fromEntries(Object.entries(p.stores || {}).filter(([, r]) => r.length)) },
      media: [...(acc.media || []), ...(p.media || [])], privateBlob: acc.privateBlob || p.privateBlob,
    } : p), null);
    if (merged.privateBlob) askBackupPassword(merged); else review(merged);
  }

  function askBackupPassword(bk) {
    const pw = ui.input({ type: 'password', autocomplete: 'current-password' });
    const f = ui.field({ label: 'Contraseña de esta copia', control: pw, hint: 'La que eligieron al descargarla.' });
    pw.addEventListener('input', () => f.setError(''));
    const openBtn = ui.button({ label: 'Abrir lo privado', iconName: 'lock-open', variant: 'primary', onClick: async () => {
      const done = busy(openBtn, 'Abriendo…');
      try { review(await backup.openPrivate(bk, pw.value)); } catch { f.setError('Esa contraseña no abre la copia.'); pw.focus(); } finally { done(); }
    } });
    put(importBox, 
      el('p', {}, 'Esta copia trae una parte privada cifrada.'), f,
      btnRow(openBtn, ui.button({ label: 'Seguir sin lo privado', variant: 'ghost', onClick: () => review({ ...bk, privateBlob: null }) })));
    requestAnimationFrame(() => pw.focus());
  }

  function review(bk) {
    let mode = 'merge';
    const summaryBox = el('div', { class: 'stack', 'aria-live': 'polite' });
    const info = el('p', { class: 'muted small' },
      `Copia del ${util.formatDay(String(bk.exportedAt).slice(0, 10))} · versión ${bk.appVersion || '?'} · desde ${bk.device === 'android' ? 'un teléfono' : 'un computador'}`);
    const apply = ui.button({ label: 'Combinar ahora', iconName: 'check', variant: 'primary', onClick: () => run() });
    const drawSummary = async () => {
      put(summaryBox, ui.skeleton(2));
      const s = await backup.summarize(bk, mode);
      const byLabel = new Map();
      for (const [name, c] of Object.entries(s.stores)) {
        const k = storeLabel(name); const acc = byLabel.get(k) || { added: 0, updated: 0, deleted: 0, removed: 0 };
        for (const f of Object.keys(acc)) acc[f] += c[f] || 0;
        byLabel.set(k, acc);
      }
      const rows = [...byLabel].sort(([a], [b]) => (a === 'Otros datos') - (b === 'Otros datos')).map(([label, c]) => el('tr', {},
        el('th', { scope: 'row' }, label),
        el('td', {}, String(c.added)), el('td', {}, String(mode === 'replace' ? c.removed : c.updated)), el('td', {}, String(c.deleted))));
      const nothing = !rows.length && !s.media;
      put(summaryBox, 
        nothing ? el('p', {}, 'Esta copia no trae nada nuevo para este dispositivo.') : el('div', { class: 'table-wrap' }, el('table', { class: 'summary-table' },
          el('caption', { class: 'visually-hidden' }, 'Resumen de lo que cambiará'),
          el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Sección'), el('th', { scope: 'col' }, 'Nuevos'),
            el('th', { scope: 'col' }, mode === 'replace' ? 'Se quitan' : 'Actualizados'), el('th', { scope: 'col' }, 'Borrados'))),
          el('tbody', {}, rows),
          el('tfoot', {}, el('tr', {}, el('th', { scope: 'row' }, 'Total'), el('td', {}, String(s.total.added)),
            el('td', {}, String(mode === 'replace' ? s.total.removed : s.total.updated)), el('td', {}, String(s.total.deleted)))))),
        s.media ? muted(`Trae ${plural(s.media, 'foto', 'fotos')}.`, true) : null,
        s.total.skipped ? muted(`${plural(s.total.skipped, 'elemento', 'elementos')} que borraron aquí no vuelven.`, true) : null);
      apply.disabled = nothing && mode === 'merge';
    };
    const modes = ui.segmented({ label: 'Cómo importar', value: mode, options: [
      { value: 'merge', label: 'Combinar', icon: 'repeat' }, { value: 'replace', label: 'Reemplazar todo', icon: 'rotate-ccw' }],
    onChange: (v) => {
      mode = v;
      hint.textContent = v === 'merge'
        ? 'Suma lo de la copia a lo de este dispositivo. Si algo está en los dos lados, queda la versión más reciente.'
        : 'Borra lo de este dispositivo y lo deja igual a la copia, también los ajustes y los PIN de la copia.';
      apply.className = `btn btn-${v === 'replace' ? 'danger' : 'primary'}`;
      apply.querySelector('span').textContent = v === 'replace' ? 'Reemplazar todo' : 'Combinar ahora';
      drawSummary();
    } });
    const hint = el('p', { class: 'field-hint' }, 'Suma lo de la copia a lo de este dispositivo. Si algo está en los dos lados, queda la versión más reciente.');

    async function run() {
      if (mode === 'replace' && !(await ui.confirmDialog({ title: '¿Reemplazar todo?', danger: true, confirmLabel: 'Reemplazar',
        message: 'Lo que hay en este dispositivo y no esté en la copia se pierde.' }))) return;
      if (mode === 'replace' && !(await confirmWithAppPin('Para reemplazar los datos de este dispositivo.'))) return;
      const done = busy(apply, 'Importando…');
      try {
        const res = await backup.applyBackup(bk, mode);
        if (mode === 'replace') {
          ui.openModal({ title: 'Listo', size: 'sm', dismissible: false,
            body: el('p', {}, 'Los datos quedaron igual a la copia. La app se recarga para usarlos.'),
            actions: [{ label: 'Recargar', variant: 'primary', onClick: () => { location.reload(); return false; } }] });
          return;
        }
        await Promise.all([profile.load(), security.refreshKeys()]);
        await app.applySettings?.();
        ui.toast(`Copia combinada${res.media ? `, con ${plural(res.media, 'foto', 'fotos')}` : ''}.`, { tone: 'success' });
        drawImportStart(el('div', { class: 'card note-card', role: 'status' }, el('p', {}, 'Listo: se combinó la copia con lo de este dispositivo.')));
        drawStatus();
      } catch (e) {
        db.logError(`import: ${e?.message}`, e?.stack, CONFIG.appVersion);
        ui.toast('No se pudo importar la copia.', { tone: 'error' });
      } finally { done(); }
    }

    put(importBox, info,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Cómo importar'), modes, hint),
      summaryBox,
      btnRow(apply, ui.button({ label: 'Cancelar', variant: 'ghost', onClick: () => drawImportStart() })));
    drawSummary();
  }

  drawStatus(); drawExport(); drawImportStart();
  return page('Copia de seguridad',
    card(null, statusBox,
      muted('Los datos viven solo en este dispositivo. La copia es la forma de no perderlos y de pasarlos al otro teléfono o al PC.', true)),
    card('Descargar copia', exportBox),
    card('Importar copia', importBox),
    card('Pasar los datos al otro teléfono',
      el('ol', { class: 'steps-list' },
        el('li', {}, 'Aquí: "Descargar copia" o "Enviar al otro teléfono" (por WhatsApp o como prefieran).'),
        el('li', {}, 'En el otro teléfono: Ajustes, Copia de seguridad, "Elegir archivo de copia".'),
        el('li', {}, 'Elijan "Combinar" para sumar lo de los dos sin perder nada.'))));
}

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
