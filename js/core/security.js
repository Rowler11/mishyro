// Security framework: PIN keys per scope, app lock at open, section lock on
// leave, privacy curtain, panic screen and inactivity lock (docs/04).
import * as db from './db.js';
import * as cryptoBox from './crypto.js';
import { el, icon, nowISO } from './util.js';
import { hanko, logo, pinPad, closeAllModals, toast, openModal } from './ui.js';

export const SECURITY_DEFAULTS = {
  appLock: false, lockOnLeave: true, autoLockSeconds: 0, curtain: true,
  wipeAfterFailures: false, wipeThreshold: 10, attempts: {},
};
export const SENSITIVE = ['cycle', 'vault', 'person:sofia', 'person:david'];
const NEVER_ENCRYPT = ['meta', 'settings', 'errors', 'profile', 'content'];

let scopesWithKeys = new Set();
let uiUnlocked = false; // app interface unlocked (PIN, or fingerprint without PRF)
let onWipe = async () => {};
let afterUnlock = () => {};

export async function getSettings() { return db.getSettings('security', SECURITY_DEFAULTS); }
export async function setSettings(patch) { return db.setSettings('security', patch); }

export async function keyRecords(scope) {
  return (await db.rawAll('settings')).filter((r) => r.id.startsWith(`key:${scope}:`) && !r.deleted);
}
export async function refreshKeys() {
  scopesWithKeys = new Set((await db.rawAll('settings')).filter((r) => r.id.startsWith('key:') && !r.deleted).map((r) => r.scope));
}
export const hasKey = (scope) => scopesWithKeys.has(scope);
export const isUnlocked = (scope) => cryptoBox.isUnlocked(scope);

/** Which key encrypts a record (docs/08 §2-3). */
export function policy(store, rec) {
  if (NEVER_ENCRYPT.includes(store) || !rec) return null;
  if (store === 'vault') return 'vault';
  const pick = (...scopes) => scopes.find((s) => scopesWithKeys.has(s)) || null;
  if (rec.visibility === 'self') return pick(`person:${rec.owner}`, 'app');
  if ((store === 'cycleDays' || store === 'intimateLog') && rec.private) return pick('cycle', 'app');
  if (rec.private) return pick('app');
  return null;
}

export function init({ wipe, unlocked } = {}) {
  if (wipe) onWipe = wipe;
  if (unlocked) afterUnlock = unlocked;
  db.setEncryptionPolicy(policy);
  return refreshKeys();
}

/** Create the PIN of a scope. Re-seals existing records so they get encrypted. Returns rawDek for the fingerprint offer. */
export async function createPin(scope, pin) {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('El PIN debe tener solo números.');
  const { record, rawDek } = await cryptoBox.createKey(scope, pin);
  await db.rawPut('settings', db.withDefaults(record, 'user'));
  await refreshKeys();
  await db.reseal(null);
  if (scope === 'app') { await setSettings({ appLock: true }); uiUnlocked = true; }
  return rawDek;
}

/** Forget the fingerprint of a scope on this device (the PIN keeps working). */
export async function removeBiometric(scope) {
  for (const r of await keyRecords(scope)) if (r.bio) await db.rawPut('settings', { ...r, bio: null, updatedAt: nowISO() });
}

export async function enrollBiometric(scope, rawDek) {
  const bio = await cryptoBox.registerBiometric(rawDek);
  const recs = await keyRecords(scope);
  const newest = recs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newest) await db.rawPut('settings', { ...newest, bio, updatedAt: nowISO() });
  return bio;
}

async function attempts(scope) {
  const s = await getSettings();
  return { s, a: s.attempts?.[scope] || { failures: 0, nextTryAt: 0 } };
}
async function saveAttempts(s, scope, a) {
  await setSettings({ attempts: { ...(s.attempts || {}), [scope]: a } });
}

/** Wait time (ms) before the next PIN attempt for a scope. */
export async function waitMs(scope) {
  const { a } = await attempts(scope);
  return Math.max(0, (a.nextTryAt || 0) - Date.now());
}

/**
 * Check a PIN with the growing delay and the optional wipe. Returns
 * { error } with a text for the user, or { keys: [{ record, rawDek }] } on success.
 */
export async function verifyPin(scope, pin) {
  const { s, a } = await attempts(scope);
  const wait = (a.nextTryAt || 0) - Date.now();
  if (wait > 0) return { error: `Espera ${formatWait(wait)} para volver a intentar.` };
  try {
    const keys = await cryptoBox.unlockWithPin(scope, pin, await keyRecords(scope));
    await saveAttempts(s, scope, { failures: 0, nextTryAt: 0 });
    if (scope === 'app') uiUnlocked = true;
    return { keys };
  } catch {
    const failures = (a.failures || 0) + 1;
    const delay = cryptoBox.nextDelayMs(failures);
    await saveAttempts(s, scope, { failures, nextTryAt: delay ? Date.now() + delay : 0 });
    if (scope === 'app' && s.wipeAfterFailures && failures >= (s.wipeThreshold || 10)) { await onWipe(); return { error: 'Se borraron los datos por demasiados intentos.' }; }
    return { error: delay ? `PIN incorrecto. Espera ${formatWait(delay)} para volver a intentar.` : 'PIN incorrecto. Inténtalo de nuevo.' };
  }
}

/** Unlock with PIN. Returns null on success or an error text for the user. */
export async function unlock(scope, pin) {
  return (await verifyPin(scope, pin)).error || null;
}

/** Fingerprint unlock. Returns 'key' | 'interface' | error text. */
export async function unlockBiometric(scope) {
  const rec = (await keyRecords(scope)).find((r) => r.bio?.credId);
  if (!rec) return 'La huella no está configurada en este dispositivo.';
  try {
    const how = await cryptoBox.unlockWithBiometric(rec);
    if (scope === 'app') uiUnlocked = true;
    return how;
  } catch { return 'No se pudo verificar la huella. Usa el PIN.'; }
}

/** keys: the result of verifyPin, so the old PIN is not derived twice. */
export async function changePin(scope, oldPin, newPin, keys = null) {
  const unlocked = keys || await cryptoBox.unlockWithPin(scope, oldPin, await keyRecords(scope));
  for (const { record, rawDek } of unlocked) {
    await db.rawPut('settings', { ...(await cryptoBox.wrapForPin(record, rawDek, newPin)), bio: record.bio, updatedAt: nowISO() });
  }
}

/** Remove a PIN: decrypt what that key protects, then drop the keys this device could open. */
export async function removePin(scope, pin, keys = null) {
  const unlocked = keys || await cryptoBox.unlockWithPin(scope, pin, await keyRecords(scope));
  scopesWithKeys.delete(scope);
  await db.reseal(scope);
  for (const { record } of unlocked) await db.rawDelete('settings', record.id);
  cryptoBox.lock(scope);
  await refreshKeys();
  if (scope === 'app') await setSettings({ appLock: false });
}

export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  return `${m} min`;
}

// ---------- lock screens ----------

/**
 * Full-screen lock (app) or in-page lock (section). Resolves when unlocked.
 * neutralName keeps sensitive sections discreet ("Rincón", "Calendario").
 */
export async function lockScreen({ scope, neutralName = 'Aishiteru', inline = false, mount } = {}) {
  // Keys made before PIN length was stored (or of different lengths) get a 4-6 pad without auto-submit.
  const digits = [...new Set((await keyRecords(scope)).map((r) => r.digits))];
  const lens = digits.length === 1 && digits[0] ? { min: digits[0], max: digits[0] } : { min: 4, max: 6, autoSubmit: false };
  return new Promise((resolve) => {
    let bioBtn = null;
    const pad = pinPad({
      label: `PIN de ${neutralName}`,
      ...lens,
      onSubmit: async (pin) => {
        const err = await unlock(scope, pin);
        if (err) { refreshWait(); return err; }
        done(); return null;
      },
    });
    const waitNote = el('p', { class: 'lock-wait', 'aria-live': 'polite' });
    let tick = null;
    const refreshWait = async () => {
      clearInterval(tick);
      const update = async () => {
        const ms = await waitMs(scope);
        pad.setDisabled(ms > 0);
        waitNote.textContent = ms > 0 ? `Por seguridad, espera ${formatWait(ms)}.` : '';
        if (ms <= 0) { clearInterval(tick); pad.focusInput(); }
      };
      await update();
      tick = setInterval(update, 1000);
    };
    const box = el('section', { class: `lock ${inline ? 'lock-inline' : 'lock-full'}`, 'aria-label': `${neutralName} bloqueado` },
      el('div', { class: 'lock-card' },
        logo({ size: 72 }),
        el('h1', { class: 'lock-title', tabindex: '-1' }, neutralName),
        el('p', { class: 'lock-sub' }, 'Escribe tu PIN para entrar.'),
        pad, waitNote));
    keyRecords(scope).then((recs) => {
      if (recs.some((r) => r.bio?.credId) && window.PublicKeyCredential) {
        bioBtn = el('button', { class: 'btn btn-secondary lock-bio', type: 'button', onClick: async () => {
          const r = await unlockBiometric(scope);
          if (r === 'key') done();
          else if (r === 'interface') {
            if (scope === 'app') { toast('Huella verificada. Para ver lo privado, usa el PIN.'); done(); }
            else pad.setMessage('En este teléfono la huella no abre los datos cifrados. Usa el PIN.');
          } else pad.setMessage(r);
        } }, icon('fingerprint'), el('span', {}, 'Usar huella'));
        box.querySelector('.lock-card').append(bioBtn);
      }
    });
    const done = () => { clearInterval(tick); box.remove(); if (!inline) document.getElementById('app')?.removeAttribute('inert'); afterUnlock(scope); resolve(true); };
    if (inline && mount) { mount.replaceChildren(box); } else { document.getElementById('app')?.setAttribute('inert', ''); document.body.append(box); }
    refreshWait();
    requestAnimationFrame(() => pad.focusInput());
  });
}

/** Is the app lock required right now (fresh open or after panic/inactivity)? */
export async function appLockNeeded() {
  const s = await getSettings();
  return s.appLock && hasKey('app') && !uiUnlocked;
}

// ---------- curtain, panic, leave-locks, inactivity ----------
let curtain = null;
export function showCurtain() {
  if (curtain) return;
  curtain = el('div', { class: 'curtain', 'aria-hidden': 'true' }, hanko({ size: 88 }));
  document.body.append(curtain);
}
export function hideCurtain() { curtain?.remove(); curtain = null; }

/** Lock every sensitive scope (leaving a section, app hidden). */
export function lockSensitive() { for (const s of SENSITIVE) cryptoBox.lock(s); }

let panicLayer = null;
/** Cover everything at once, lock all keys and require unlock to come back. */
export async function panic({ goHome } = {}) {
  closeAllModals();
  cryptoBox.lockAll();
  uiUnlocked = false;
  goHome?.();
  if (panicLayer) return;
  const needsPin = (await getSettings()).appLock && hasKey('app');
  panicLayer = el('div', { class: 'panic', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pantalla en blanco' },
    el('button', { class: 'panic-back', type: 'button', 'aria-label': 'Volver a la app', onClick: async () => {
      panicLayer.remove(); panicLayer = null;
      if (needsPin) await lockScreen({ scope: 'app' });
      else { uiUnlocked = true; document.getElementById('app')?.removeAttribute('inert'); afterUnlock('panic'); }
    } }, hanko({ size: 40 })));
  document.getElementById('app')?.setAttribute('inert', '');
  document.body.append(panicLayer);
  panicLayer.querySelector('button').focus();
}

let idleTimer = null;
let idleSeconds = 0;
let idleHandler = null;
const resetIdle = () => {
  clearTimeout(idleTimer);
  if (idleSeconds > 0 && idleHandler) idleTimer = setTimeout(idleHandler, idleSeconds * 1000);
};
export async function startInactivity(onIdle) {
  idleHandler = onIdle;
  idleSeconds = (await getSettings()).autoLockSeconds || 0;
  ['pointerdown', 'keydown', 'scroll'].forEach((ev) => addEventListener(ev, resetIdle, { passive: true }));
  resetIdle();
}
/** Change the inactivity lock right away (0 = off). */
export async function setAutoLock(seconds) {
  await setSettings({ autoLockSeconds: seconds });
  idleSeconds = seconds;
  resetIdle();
}

export function markUiLocked() { uiUnlocked = false; }

// ---------- PIN creation dialog and the "Solo yo" offer ----------

/** Modal that asks for a new PIN twice and creates the key. Resolves rawDek or null. */
export function createPinDialog({ scope, title = 'Crear PIN', intro = '' } = {}) {
  return new Promise((resolve) => {
    let first = null; let result = null;
    const body = el('div', { class: 'stack center' });
    const m = openModal({ title, size: 'sm', body, onClose: () => resolve(result) });
    const ask = () => {
      const pad = pinPad({
        label: first ? 'Repite el PIN' : 'Nuevo PIN de 4 números', submitLabel: first ? 'Confirmar' : 'Seguir',
        onSubmit: async (value) => {
          if (!first) { first = value; ask(); return null; }
          if (value !== first) { first = null; setTimeout(ask, 900); return 'No coinciden. Empecemos otra vez.'; }
          pad.setDisabled(true); pad.setMessage('Creando la llave…');
          result = await createPin(scope, value);
          m.close();
          return null;
        },
      });
      body.replaceChildren(...(intro && !first ? [el('p', { class: 'muted' }, intro)] : []), pad);
      requestAnimationFrame(() => pad.focusInput());
    };
    ask();
  });
}

/**
 * Called when someone picks "Solo yo" and has no personal PIN yet (docs/04):
 * offers to create it. Resolves true when the record will be encrypted.
 */
export async function offerPersonalPin(person, partnerName = 'la otra persona') {
  const scope = `person:${person}`;
  if (hasKey(scope)) return true;
  return new Promise((resolve) => {
    let chosen = false;
    const m = openModal({
      title: '¿Crear tu PIN personal?', size: 'sm',
      body: el('div', { class: 'stack' },
        el('p', {}, `Lo que marques como "Solo yo" no se le muestra a ${partnerName}. Con un PIN personal, además, queda cifrado en este dispositivo y en las copias.`),
        el('p', { class: 'muted small' }, 'Si lo olvidas, lo "Solo yo" no se puede recuperar.')),
      actions: [
        { label: 'Ahora no', variant: 'ghost', value: false },
        { label: 'Crear PIN', variant: 'primary', value: true },
      ],
      onClose: async (v) => {
        if (chosen) return; chosen = true;
        if (v === true) {
          const raw = await createPinDialog({ scope, title: 'Tu PIN personal' });
          resolve(!!raw);
        } else {
          toast(`Listo. ${partnerName} no lo verá, pero sin PIN no queda cifrado.`);
          resolve(false);
        }
      },
    });
    void m;
  });
}
