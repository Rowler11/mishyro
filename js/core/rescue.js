// Recovery without files or QR (decided 2026-11-21): "Huella + frase de respaldo".
// - Phrase: 12 Spanish words (BIP-0039 list: 128 random bits + a 4-bit checksum). The words never
//   leave the phone; a slow hash of them gives the 32-byte secret that finds and opens the recovery slot.
// - Passkey: a discoverable credential saved with the fingerprint in the phone's password manager
//   (Google, synced to the person's account). Its PRF output, for a fixed salt, is a second secret
//   for a second slot. Both slots hold the same join code (see sync.js "recovery").
// Costs nothing, needs no account or email, and stays end to end: the server only keeps encrypted blobs.
import * as sync from './sync.js';

const te = new TextEncoder();
const PRF_SALT = te.encode('aishiteru-rescue-prf-v1').slice(0, 32);
const KDF_SALT = te.encode('aishiteru-rescue-phrase-v1');
let words = null;
async function wordlist() { if (!words) words = (await import('../../vendor/bip39/spanish.js')).default; return words; }

/** Lowercase and without accents, so "ábaco" and "abaco" are the same word. */
export const fold = (w) => String(w || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }

/** 12 new words. */
export async function newPhrase() {
  const list = await wordlist();
  const ent = crypto.getRandomValues(new Uint8Array(16));
  const cs = (await sha256(ent))[0] >> 4; // first 4 bits
  let bits = '';
  ent.forEach((b) => { bits += b.toString(2).padStart(8, '0'); });
  bits += cs.toString(2).padStart(4, '0');
  return Array.from({ length: 12 }, (_, i) => list[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
}

/** Check typed words: { ok, words (canonical), bad: [index of unknown words], checksum: bool }. */
export async function checkPhrase(text) {
  const list = await wordlist();
  const folded = list.map(fold);
  const typed = String(text || '').split(/[\s,.;]+/).map(fold).filter(Boolean);
  const idx = typed.map((w) => folded.indexOf(w));
  const bad = idx.map((n, i) => (n < 0 ? i : -1)).filter((i) => i >= 0);
  if (typed.length !== 12 || bad.length) return { ok: false, count: typed.length, bad, checksum: false };
  const bits = idx.map((n) => n.toString(2).padStart(11, '0')).join('');
  const ent = new Uint8Array(16);
  for (let i = 0; i < 16; i++) ent[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const checksum = ((await sha256(ent))[0] >> 4) === parseInt(bits.slice(128), 2);
  return { ok: checksum, count: 12, bad: [], checksum, words: idx.map((n) => list[n]) };
}

/** The 32-byte secret of a phrase (slow on purpose). */
export async function phraseSecret(wordsList) {
  const base = await crypto.subtle.importKey('raw', te.encode(wordsList.map(fold).join(' ')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: KDF_SALT, iterations: 210000 }, base, 256));
}

export const passkeySupported = () => typeof window.PublicKeyCredential === 'function' && !!navigator.credentials?.create;

/** Create the passkey (fingerprint) and return its PRF secret, or null when the phone cannot give one. */
export async function createPasskey(personName) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Aishiteru' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: `Aishiteru · ${personName}`, displayName: `Aishiteru · ${personName}` },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    timeout: 120000,
    extensions: { prf: { eval: { first: PRF_SALT } } },
  } });
  const ext = cred.getClientExtensionResults?.() || {};
  let out = ext.prf?.results?.first;
  if (!out && ext.prf?.enabled !== false) out = await passkeySecret([cred.rawId]).catch(() => null);
  return out ? new Uint8Array(out) : null;
}

/** Ask for the fingerprint and return the PRF secret (any Aishiteru passkey saved on the phone or account). */
export async function passkeySecret(allow = null) {
  const res = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    ...(allow ? { allowCredentials: allow.map((id) => ({ type: 'public-key', id })) } : {}),
    userVerification: 'required',
    timeout: 120000,
    extensions: { prf: { eval: { first: PRF_SALT } } },
  } });
  const out = res.getClientExtensionResults?.().prf?.results?.first;
  return out ? new Uint8Array(out) : null;
}

/** Leave the recovery slot for a phrase (and the passkey secret, when there is one). */
export async function protect({ phrase = null, passkey = null }) {
  const code = await sync.rescueCode();
  if (phrase) await sync.saveRescueSlot(await phraseSecret(phrase), code);
  if (passkey) await sync.saveRescueSlot(passkey, code);
  await sync.markRescue({ ...(phrase ? { phrase: true } : {}), ...(passkey ? { passkey: true } : {}) });
}

/** Come back on a new or reinstalled phone. Returns 'joined', or throws with a message for the person. */
export async function restore({ phrase = null, passkey = null }) {
  const secret = passkey || (phrase ? await phraseSecret(phrase) : null);
  if (!secret) throw new Error('Falta la huella o la frase.');
  let code;
  try { code = await sync.readRescueSlot(secret); } catch { throw new Error('No se pudo conectar. Revisa el internet e intenta otra vez.'); }
  if (!code) throw new Error(passkey ? 'Esa huella no tiene un respaldo guardado. Prueba con tus 12 palabras.' : 'No encontramos un respaldo con esas palabras. Revisa que estén en orden.');
  return sync.joinWithCode(code);
}
