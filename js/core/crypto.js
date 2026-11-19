// Client-side encryption (Web Crypto). Design:
// - Each protected scope ("app", "person:sofia", "person:david", "cycle", "vault")
//   has one or more random 256-bit data keys (DEK, identified by kid) that
//   encrypt records with AES-GCM. A scope can hold several keys because a
//   backup from another device may bring the key that device created.
// - A DEK is stored only wrapped: with a key derived from the PIN
//   (PBKDF2-SHA-256, 600k iterations, unique salt) and, optionally, with a
//   key derived from a WebAuthn PRF output (fingerprint/face).
// - Unwrapped keys live only in memory while the scope is unlocked.
// - PINs are never stored, not even hashed: a wrong PIN simply fails to unwrap.
import { bufToB64, b64ToBuf } from './util.js';

export const PBKDF2_ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const keys = new Map(); // scope -> { primary: kid, map: Map(kid -> CryptoKey) }

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const newKid = () => bufToB64(rand(9)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));

async function deriveKek(secret, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function kekFromBytes(bytes) {
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('aishiteru-prf-kek') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key, bytes) {
  const iv = rand(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: bufToB64(iv), data: bufToB64(data) };
}
async function aesDecrypt(key, box) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(box.iv) }, key, b64ToBuf(box.data)));
}

const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

function remember(scope, kid, cryptoKey, makePrimary) {
  const entry = keys.get(scope) || { primary: kid, map: new Map() };
  entry.map.set(kid, cryptoKey);
  if (makePrimary || !entry.primary) entry.primary = kid;
  keys.set(scope, entry);
}

/** Id of the stored key record for a scope/kid (kept in the settings store). */
export const keyRecordId = (scope, kid) => `key:${scope}:${kid}`;

/**
 * Create a new data key for a scope, wrapped with a PIN, and unlock it.
 * Returns { record, rawDek }. The record is what gets stored; rawDek is
 * returned only so the caller can also wrap it for biometrics. Never persist it.
 */
export async function createKey(scope, pin) {
  const raw = rand(32);
  const kid = newKid();
  const record = await wrapForPin({ id: keyRecordId(scope, kid), scope, kid, bio: null }, raw, pin);
  remember(scope, kid, await importDek(raw), true);
  return { record, rawDek: raw };
}

/** Wrap a raw DEK with a (new) PIN. Used to create a key and to change the PIN. */
export async function wrapForPin(record, rawDek, pin) {
  const salt = rand(16);
  const kek = await deriveKek(pin, salt);
  return { ...record, v: 1, digits: String(pin).length, salt: bufToB64(salt), iter: PBKDF2_ITERATIONS, wrappedPin: await aesEncrypt(kek, rawDek) };
}

/**
 * Try a PIN against every key record of a scope. Unlocks the ones that match.
 * Returns [{ record, rawDek }] for the unlocked keys; throws if none matched.
 * The newest matching record becomes the primary key for new encryptions.
 */
export async function unlockWithPin(scope, pin, records) {
  const out = [];
  const sorted = [...records].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  for (const rec of sorted) {
    try {
      const kek = await deriveKek(pin, b64ToBuf(rec.salt), rec.iter || PBKDF2_ITERATIONS);
      const raw = await aesDecrypt(kek, rec.wrappedPin);
      remember(scope, rec.kid, await importDek(raw), true);
      out.push({ record: rec, rawDek: raw });
    } catch { /* wrong PIN for this key */ }
  }
  if (!out.length) { const e = new Error('wrong pin'); e.code = 'WRONG_PIN'; throw e; }
  return out;
}

/** Delay after failed attempts: 0,0,0, then 30 s doubling up to 15 min. */
export function nextDelayMs(failures) {
  if (failures < 3) return 0;
  return Math.min(30000 * 2 ** (failures - 3), 15 * 60000);
}

export const isUnlocked = (scope) => (keys.get(scope)?.map.size || 0) > 0;
export const canOpen = (box) => !!(box && keys.get(box.keyRef)?.map.has(box.kid || keys.get(box.keyRef)?.primary));
export const lock = (scope) => keys.delete(scope);
export const lockAll = (except = []) => { for (const k of [...keys.keys()]) if (!except.includes(k)) keys.delete(k); };
export const unlockedScopes = () => [...keys.keys()];

function keyFor(scope) {
  const entry = keys.get(scope);
  if (!entry || !entry.map.size) { const e = new Error(`Scope ${scope} is locked`); e.code = 'LOCKED'; e.scope = scope; throw e; }
  return { kid: entry.primary, key: entry.map.get(entry.primary) };
}
function keyForBox(box) {
  const entry = keys.get(box.keyRef);
  const key = entry?.map.get(box.kid || entry.primary);
  if (!key) { const e = new Error(`Scope ${box.keyRef} is locked`); e.code = 'LOCKED'; e.scope = box.keyRef; throw e; }
  return key;
}

export async function encryptJSON(scope, obj) {
  const { kid, key } = keyFor(scope);
  return { ...(await aesEncrypt(key, enc.encode(JSON.stringify(obj)))), keyRef: scope, kid };
}
export async function decryptJSON(box) {
  return JSON.parse(dec.decode(await aesDecrypt(keyForBox(box), box)));
}
export async function encryptBytes(scope, bytes) {
  const { kid, key } = keyFor(scope);
  return { ...(await aesEncrypt(key, bytes)), keyRef: scope, kid };
}
export async function decryptBytes(box) {
  return aesDecrypt(keyForBox(box), box);
}

/** Password-based encryption for backup files (independent of app scopes). */
export async function encryptWithPassword(password, obj) {
  const salt = rand(16);
  const kek = await deriveKek(password, salt);
  const box = await aesEncrypt(kek, enc.encode(JSON.stringify(obj)));
  return { salt: bufToB64(salt), iter: PBKDF2_ITERATIONS, ...box };
}
export async function decryptWithPassword(password, box) {
  const kek = await deriveKek(password, b64ToBuf(box.salt), box.iter || PBKDF2_ITERATIONS);
  return JSON.parse(dec.decode(await aesDecrypt(kek, box)));
}

// ---------- WebAuthn (fingerprint / face) ----------

export async function biometricAvailable() {
  try {
    return !!(window.PublicKeyCredential && window.isSecureContext
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

/**
 * Register a platform credential for a key record. If the PRF extension works,
 * the DEK is wrapped with a PRF-derived key so the fingerprint really unlocks
 * encrypted data. Otherwise the credential only unlocks the interface and the
 * PIN is still needed for encrypted data (the UI says so).
 */
export async function registerBiometric(rawDek) {
  const prfSalt = rand(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Aishiteru' },
      user: { id: rand(16), name: 'aishiteru', displayName: 'Aishiteru' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const credId = bufToB64(cred.rawId);
  const ext = cred.getClientExtensionResults?.() || {};
  let prfOut = ext.prf?.results?.first;
  if (!prfOut && ext.prf?.enabled) prfOut = await prfAssert(credId, prfSalt);
  const out = { credId, prfSalt: bufToB64(prfSalt), prf: false, wrapped: null };
  if (prfOut && rawDek) {
    out.wrapped = await aesEncrypt(await kekFromBytes(new Uint8Array(prfOut)), rawDek);
    out.prf = true;
  }
  return out;
}

async function prfAssert(credId, prfSalt) {
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id: b64ToBuf(credId) }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  return res.getClientExtensionResults?.().prf?.results?.first || null;
}

/**
 * Ask for the fingerprint for one key record. Returns 'key' when the data key
 * was unlocked (PRF) or 'interface' when only the interface may be unlocked.
 */
export async function unlockWithBiometric(record) {
  const bio = record.bio;
  const out = await prfAssert(bio.credId, b64ToBuf(bio.prfSalt));
  if (bio.prf && bio.wrapped && out) {
    const raw = await aesDecrypt(await kekFromBytes(new Uint8Array(out)), bio.wrapped);
    remember(record.scope, record.kid, await importDek(raw), true);
    return 'key';
  }
  return 'interface';
}
