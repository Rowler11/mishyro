// Data layer over IndexedDB (docs/08). The ONLY place that opens IndexedDB.
import { nowISO, uuid } from './util.js';
import * as cryptoBox from './crypto.js';

export const SCHEMA_VERSION = 2;

// [store, indexes] — indexes: name -> keyPath (string or array)
export const STORES = [
  ['meta', {}], ['settings', {}], ['profile', {}],
  ['content', { kind: 'kind' }],
  ['media', { owner: ['ownerStore', 'ownerId'] }],
  ['memories', { date: 'date' }],
  ['couponState', { couponId: 'couponId' }],
  ['letters', { status: 'status' }],
  ['questionsDaily', { date: 'date', kind: 'kind' }],
  ['questionsState', {}],
  ['quizResults', { by: 'by' }],
  ['songs', { at: 'at' }],
  ['diary', { date: 'date', by: 'by' }],
  ['moods', { dateBy: ['date', 'by'] }],
  ['places', { date: 'date' }],
  ['locationSnapshots', { at: 'at' }],
  ['timeCapsules', { openAt: 'openAt' }],
  ['badges', { badgeId: 'badgeId' }],
  ['streaks', { type: 'type' }],
  ['thinkingOfYou', { at: 'at' }],
  ['dateIdeas', { place: 'place', mood: 'mood' }],
  ['dateIdeasState', { status: 'status', repeat: 'repeat' }],
  ['deciderLog', { topic: 'topic', at: 'at' }],
  ['dateDeck', {}],
  ['surpriseDates', { date: 'date' }],
  ['savingsGoals', { status: 'status' }],
  ['savingsEntries', { goalId: 'goalId', date: 'date' }],
  ['bucketList', { done: 'done' }],
  ['gifts', { owner: 'owner' }],
  ['weeklyChallenges', { isoWeek: 'isoWeek' }],
  ['events', { start: 'start' }],
  ['specialDates', {}],
  ['firsts', { date: 'date' }],
  ['cycleDays', { date: 'date' }],
  ['intimateLog', { date: 'date' }],
  ['pets', {}],
  ['petRecords', { petType: ['petId', 'type'], date: 'date' }],
  ['petContacts', { kind: 'kind' }],
  ['loveLanguages', { by: 'by' }],
  ['gratitude', { at: 'at' }],
  ['weeklyReviews', { isoWeek: 'isoWeek' }],
  ['scratchCards', { scratchedAt: 'scratchedAt' }],
  ['habits', {}],
  ['habitChecks', { habitDate: ['habitId', 'date'] }],
  ['expenses', { date: 'date' }],
  ['lists', { kind: 'kind' }],
  ['games', { gameId: 'gameId' }],
  ['gameState', { gameId: 'gameId' }],
  ['gameArtifacts', { gameId: 'gameId' }],
  ['seasonal', { eventYear: ['eventId', 'year'] }],
  ['vault', {}],
  ['personal', { owner: 'owner', kind: 'kind' }],
  ['albums', { year: 'year' }],
  ['dreams', { status: 'status' }],
  ['recipes', { tags: 'tags' }],
  ['dateMenus', { date: 'date' }],
  ['voiceNotes', { at: 'at', by: 'by' }],
  ['reminders', { kind: 'kind' }],
  ['errors', { at: 'at' }],
  // Fase A (schema 2): what this device already sent, and received changes waiting for a key.
  ['syncState', {}],
  ['syncInbox', {}],
];
/** Stores that only ever describe this device: never synced nor backed up. */
export const LOCAL_ONLY = ['meta', 'settings', 'errors', 'syncState', 'syncInbox'];
export const STORE_NAMES = STORES.map(([n]) => n);

// Fields every record has (docs/08 §2). They stay in clear text even when encrypted.
export const COMMON = ['id', 'createdAt', 'updatedAt', 'deleted', 'origin', 'userEdited', 'hidden',
  'owner', 'visibility', 'private', 'visibleToPartner', 'enc'];

// Migrations: structure changes run in onupgradeneeded; data changes after open.
const migrations = {
  1: { structure(idb) {
    for (const [name, indexes] of STORES) {
      if (idb.objectStoreNames.contains(name)) continue;
      const os = idb.createObjectStore(name, { keyPath: 'id' });
      for (const [iname, path] of Object.entries(indexes)) os.createIndex(iname, path, { unique: false });
    }
  } },
  // 2 (Fase A): new stores only; `1` already creates any store that is missing.
  2: { structure(idb) { migrations[1].structure(idb); } },
};

let idb = null;
let dbName = 'aishiteru-db';
let activeProfile = () => 'sofia';
let encryptionPolicy = () => null; // (store, record) => scope | null
const listeners = new Set();

export const setActiveProfileGetter = (fn) => { activeProfile = fn; };
export const setEncryptionPolicy = (fn) => { encryptionPolicy = fn; };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (store, id) => listeners.forEach((fn) => { try { fn(store, id); } catch (e) { console.error(e); } });

export function open(storageKey, version = SCHEMA_VERSION) {
  dbName = `${storageKey}-db`;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (let v = ev.oldVersion + 1; v <= version; v++) migrations[v]?.structure?.(db, req.transaction);
    };
    req.onsuccess = () => {
      idb = req.result;
      idb.onversionchange = () => { idb.close(); location.reload(); };
      resolve(idb);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked: close other tabs of the app'));
  });
}

export function close() { idb?.close(); idb = null; }
export const deleteDatabase = () => new Promise((res, rej) => {
  close();
  const r = indexedDB.deleteDatabase(dbName);
  r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
});

function tx(stores, mode = 'readonly') {
  if (!idb) throw new Error('Database not open');
  return idb.transaction(stores, mode);
}
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); });
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---------- raw access (no visibility/encryption logic) ----------
export async function rawGet(store, id) { return reqP(tx(store).objectStore(store).get(id)); }
export async function rawAll(store) { return reqP(tx(store).objectStore(store).getAll()); }
export async function rawPut(store, rec) { const t = tx(store, 'readwrite'); t.objectStore(store).put(rec); await done(t); emit(store, rec.id); }
export async function rawPutMany(store, recs, { clear = false } = {}) {
  const t = tx(store, 'readwrite'); const os = t.objectStore(store);
  if (clear) os.clear();
  for (const r of recs) os.put(r);
  await done(t); emit(store, null);
}
export async function rawDelete(store, id) { const t = tx(store, 'readwrite'); t.objectStore(store).delete(id); await done(t); emit(store, id); }
export async function rawClear(store) { const t = tx(store, 'readwrite'); t.objectStore(store).clear(); await done(t); emit(store, null); }

// ---------- records ----------
export function withDefaults(rec, origin = 'user') {
  const now = nowISO();
  const r = {
    id: uuid(), createdAt: now, updatedAt: now, deleted: false, origin, userEdited: false, hidden: false,
    owner: 'both', visibility: 'shared', private: false, visibleToPartner: false, enc: null, ...rec,
  };
  if (r.visibility === 'self') r.private = true;
  return r;
}

/** Can the active profile see this record at all? ("Solo yo" of the other person: never, not even counted.) */
export function visibleToActive(rec) {
  if (!rec || rec.deleted) return false;
  if (rec.visibility === 'self' && rec.owner !== activeProfile()) return false;
  return true;
}

/** Encrypt a record per the local policy (used by sync to store what arrives). */
export const seal = (store, rec) => sealIfNeeded(store, rec);
async function sealIfNeeded(store, rec) {
  const scope = encryptionPolicy(store, rec);
  if (!scope) return { ...rec, enc: null };
  if (!cryptoBox.isUnlocked(scope)) { const e = new Error('locked'); e.code = 'LOCKED'; e.scope = scope; throw e; }
  const payload = {}; const out = {};
  for (const [k, v] of Object.entries(rec)) (COMMON.includes(k) ? out : payload)[k] = v;
  out.payload = await cryptoBox.encryptJSON(scope, payload);
  out.enc = { keyRef: scope, kid: out.payload.kid };
  return out;
}

/** Open a stored record (decrypting it when its key is unlocked). */
export const openRecord = (rec) => open_(rec);
async function open_(rec) {
  if (!rec?.enc) return rec;
  if (!cryptoBox.canOpen(rec.payload)) { const { payload: _p, ...common } = rec; return { ...common, locked: true }; }
  const payload = await cryptoBox.decryptJSON(rec.payload);
  const { payload: _p, ...common } = rec;
  return { ...payload, ...common, locked: false };
}

export async function get(store, id) {
  const rec = await rawGet(store, id);
  if (!visibleToActive(rec)) return null;
  return open_(rec);
}

/**
 * Save a record. Fills common fields, bumps updatedAt, marks userEdited when
 * a config/seed record is edited by the user, and encrypts per policy.
 */
export async function put(store, rec, { userEdit = true } = {}) {
  const prev = rec.id ? await rawGet(store, rec.id) : null;
  let r = withDefaults({ ...rec }, rec.origin || prev?.origin || 'user');
  if (prev) r.createdAt = prev.createdAt;
  r.updatedAt = nowISO();
  if (userEdit && (r.origin === 'config' || r.origin === 'seed') && prev) r.userEdited = true;
  delete r.locked;
  r = await sealIfNeeded(store, r);
  await rawPut(store, r);
  return r.id;
}

export async function query(store, { index, range, includeHidden = false, includeLocked = false, filter } = {}) {
  const t = tx(store); const os = t.objectStore(store);
  const src = index ? os.index(index) : os;
  const all = await reqP(src.getAll(range ?? null));
  const out = [];
  for (const rec of all) {
    if (!visibleToActive(rec)) continue;
    if (!includeHidden && rec.hidden) continue;
    const r = await open_(rec);
    if (r.locked && !includeLocked) continue;
    if (filter && !filter(r)) continue;
    out.push(r);
  }
  return out;
}

export async function softDelete(store, id) {
  const rec = await rawGet(store, id);
  if (!rec) return;
  await rawPut(store, { ...rec, deleted: true, updatedAt: nowISO() });
}

/** Physical delete + media cascade + tombstone so an old backup cannot resurrect it. */
export async function purge(store, id) {
  const media = await reqP(tx('media').objectStore('media').index('owner').getAll([store, id]));
  for (const m of media) await rawDelete('media', m.id);
  await rawDelete(store, id);
  const meta = (await rawGet('meta', 'meta')) || { id: 'meta' };
  meta.tombstones = { ...(meta.tombstones || {}), [`${store}:${id}`]: nowISO() };
  await rawPut('meta', meta);
}

// ---------- media ----------
export async function putMedia(blob, { ownerStore, ownerId, width, height, duration, encryptScope } = {}) {
  const id = uuid();
  let data = blob; let enc = null;
  if (encryptScope) {
    const box = await cryptoBox.encryptBytes(encryptScope, new Uint8Array(await blob.arrayBuffer()));
    data = null; enc = box;
  }
  await rawPut('media', withDefaults({ id, blob: data, mime: blob.type, size: blob.size, width, height, duration, ownerStore, ownerId, enc }));
  return id;
}
export async function getMedia(id) {
  const m = await rawGet('media', id);
  if (!m || m.deleted) return null;
  if (m.enc) {
    if (!cryptoBox.canOpen(m.enc)) return null;
    return new Blob([await cryptoBox.decryptBytes(m.enc)], { type: m.mime });
  }
  return m.blob;
}

// ---------- meta & settings ----------
export async function getMeta() { return (await rawGet('meta', 'meta')) || { id: 'meta' }; }
export async function setMeta(patch) {
  const m = await getMeta();
  await rawPut('meta', { ...m, ...patch, id: 'meta', updatedAt: nowISO() });
}
export async function getSettings(group, defaults = {}) {
  const s = await rawGet('settings', group);
  return { ...defaults, ...(s || {}), id: group };
}
export async function setSettings(group, patch) {
  const s = (await rawGet('settings', group)) || withDefaults({ id: group }, 'user');
  await rawPut('settings', { ...s, ...patch, id: group, updatedAt: nowISO() });
}

// ---------- errors (local log, no personal data, max 200) ----------
export async function logError(message, stack = '', version = '') {
  try {
    if (!idb) return;
    const rec = withDefaults({ at: nowISO(), message: String(message).slice(0, 300), stack: String(stack || '').slice(0, 800), version });
    await rawPut('errors', rec);
    const all = await rawAll('errors');
    if (all.length > 200) {
      all.sort((a, b) => a.at.localeCompare(b.at));
      for (const r of all.slice(0, all.length - 200)) await rawDelete('errors', r.id);
    }
  } catch { /* never throw from the error logger */ }
}

/** Re-encrypt all records sealed with fromScope using the current policy (used when a PIN is removed or added). */
export async function reseal(fromScope) {
  for (const name of STORE_NAMES) {
    if (LOCAL_ONLY.includes(name)) continue;
    const all = await rawAll(name);
    for (const rec of all) {
      if (fromScope && rec.enc?.keyRef !== fromScope) continue;
      const open = await open_(rec);
      if (open.locked) continue;
      delete open.locked;
      await rawPut(name, await sealIfNeeded(name, open));
    }
  }
}
