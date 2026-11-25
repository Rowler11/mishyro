// Live sync between the couple's devices (Fase A, decided 2026-11-19/20).
// - End to end: every record and photo leaves the device encrypted with keys that only the
//   paired devices have. The server (worker/) stores opaque blobs and cannot read them.
// - Keys of a space: "space" (shared things), "vault" (Rincón), "cycle" and one personal key per
//   person ("person:sofia", "person:david") for "Solo yo", which only that person's devices get.
// - Devices join with a code shown as a QR, without accounts. A lost device is removed from
//   another one and loses access at once.
// - Last write wins per record (by updatedAt); deletions travel as tombstones.
import * as db from './db.js';
import * as cryptoBox from './crypto.js';
import * as security from './security.js';
import * as profile from './profile.js';
import { nowISO } from './util.js';

const CFG_ID = 'sync';
export const NOTIFY_ID = 'syncNotify';
const CHUNK = 1024 * 1024;
const CODE_SPACE = 'AISHI1:';
const CODE_PAIR = 'AISHIP:';
const te = new TextEncoder();
const td = new TextDecoder();
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export const b64u = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64u = (s) => {
  const t = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : 0; };
async function hmac(raw, text) {
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof text === 'string' ? te.encode(text) : text));
}
async function sha256hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(text)));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(key, bytes, aad) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: te.encode(aad) } : {}) }, key, bytes));
  return concat(iv, ct);
}
async function unseal(key, box, aad) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.subarray(0, 12), ...(aad ? { additionalData: te.encode(aad) } : {}) }, key, box.subarray(12)));
}

// ---------- state ----------
let cfg = null; // settings record "sync"
const keys = new Map(); // name -> { raw, aes, kid }
let indexKey = null;
const state = new Map(); // "store:id" -> { ts, n, gone }
const dirty = new Set();
const blocked = new Set(); // records whose key this device does not have (yet)
const applying = new Set();
let scanNeeded = false;
let ws = null; let wsTimer = 0; let backoff = 2000; let pingTimer = 0; let tickTimer = 0;
let online = false; let started = false; let pushTimer = 0;
let running = Promise.resolve();
let lastSyncAt = 0; let lastError = '';
let devicesCache = [];
let unlockedSeen = '';
const listeners = new Set();
const appliedListeners = new Set();

export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onApplied = (fn) => { appliedListeners.add(fn); return () => appliedListeners.delete(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(status()); } catch (e) { console.error(e); } });

export function status() {
  return {
    linked: !!cfg?.spaceId, online, pending: [...dirty].filter((k) => !blocked.has(k)).length, lastSyncAt, error: lastError,
    me: cfg?.me || null, deviceId: cfg?.deviceId || null, notify: !!cfg?.notify,
    removed: !!cfg?.removed, full: lastError === 'storage_full', hasPersonal: !!cfg?.keys?.[`person:${cfg?.me}`],
  };
}
export const isLinked = () => !!cfg?.spaceId && !cfg?.removed;

async function saveCfg() { await db.rawPut('settings', { ...cfg, id: CFG_ID, updatedAt: nowISO() }); }

const PREFERRED = { space: 'app', vault: 'vault', cycle: 'cycle' };
const preferredScope = (name) => PREFERRED[name] || name; // person:x -> person:x

/** Keep a sync key at rest under the strongest local PIN that is unlocked right now. */
async function storeKey(name, raw) {
  const kid = b64u(await hmac(raw, 'kid')).slice(0, 11);
  const order = [preferredScope(name), 'app'].filter((s, i, a) => a.indexOf(s) === i);
  let entry = { kid, s: null, v: b64u(raw) };
  for (const s of order) {
    if (security.hasKey(s) && cryptoBox.isUnlocked(s)) {
      const box = await cryptoBox.encryptBytes(s, raw);
      entry = { kid, s, v: box };
      break;
    }
  }
  cfg.keys = { ...(cfg.keys || {}), [name]: entry };
  blocked.clear();
  keys.set(name, { raw, aes: await aesKey(raw), kid });
  if (name === 'space') indexKey = await hmac(raw, 'index');
}

/** Open every sync key whose local PIN is unlocked; re-seal keys that can now be stored better. */
async function loadKeys() {
  let upgraded = false;
  for (const [name, entry] of Object.entries(cfg?.keys || {})) {
    let raw = keys.get(name)?.raw || null;
    if (!raw) {
      if (!entry.s) raw = fromB64u(entry.v);
      else if (cryptoBox.isUnlocked(entry.s) && cryptoBox.canOpen(entry.v)) {
        try { raw = await cryptoBox.decryptBytes(entry.v); } catch { raw = null; }
      }
      if (!raw) continue;
      keys.set(name, { raw, aes: await aesKey(raw), kid: entry.kid });
      blocked.clear();
      if (name === 'space') indexKey = await hmac(raw, 'index');
    }
    const want = preferredScope(name);
    const better = entry.s !== want && security.hasKey(want) && cryptoBox.isUnlocked(want);
    const fromPlain = !entry.s && security.hasKey('app') && cryptoBox.isUnlocked('app');
    if (better || fromPlain) { await storeKey(name, raw); upgraded = true; }
  }
  if (upgraded) await saveCfg();
}
const nameByKid = (kid) => Object.entries(cfg?.keys || {}).find(([, e]) => e.kid === kid)?.[0] || null;

// ---------- which key protects a record ----------
function scopeOf(store, rec) {
  if (store === 'vault') return 'vault';
  if (rec.visibility === 'self') return `person:${rec.owner}`;
  // Cycle records reach the partner only when Sofía marks them visible; those travel with the cycle key.
  if (store === 'cycleDays' || store === 'intimateLog') return 'cycle';
  return 'space';
}
async function mediaScope(m) {
  // The owner record decides first: a "Solo yo" photo must travel with its owner's personal key,
  // even when it is sealed here with the app PIN (local "app" scope).
  if (m.ownerStore === 'vault') return 'vault';
  if (m.ownerStore && m.ownerId) {
    const owner = await db.rawGet(m.ownerStore, m.ownerId).catch(() => null);
    if (owner) return scopeOf(m.ownerStore, owner);
    return null; // owner not here (yet): wait instead of guessing
  }
  if (m.enc?.keyRef && m.enc.keyRef !== 'app') return m.enc.keyRef;
  return 'space';
}

async function ensurePersonalKey(name) {
  if (keys.has(name) || cfg.keys?.[name]) return keys.has(name);
  // Only the person's own first device creates it; another device of theirs gets it by pairing.
  if (name !== `person:${cfg.me}`) return false;
  if (devicesCache.some((d) => !d.me && d.person === cfg.me)) return false;
  await storeKey(name, rand(32));
  await saveCfg();
  return true;
}

/** Encrypt for the server. `aad` binds a record to its slot, so the server cannot swap envelopes. */
async function envelope(name, obj, aad) {
  const k = keys.get(name);
  return `${k.kid}.${b64u(await seal(k.aes, te.encode(JSON.stringify(obj)), aad))}`;
}
async function opKey(store, id) { return b64u(await hmac(indexKey, `${store}:${id}`)).slice(0, 43); }

// ---------- server ----------
const apiBase = () => new URL('api/', document.baseURI);
async function api(path, { method = 'GET', body, raw = false, auth = true, space = cfg?.spaceId } = {}) {
  const url = new URL(path.startsWith('pair/') || path.startsWith('rescue/') ? path : `s/${space}/${path}`, apiBase());
  const headers = {};
  if (auth) headers.authorization = `Bearer ${cfg.deviceId}.${cfg.token}`;
  let payload = body;
  if (body && !(body instanceof Uint8Array)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(url, { method, headers, body: payload, cache: 'no-store' });
  if (res.status === 401 && auth && cfg) { await markRemoved(); throw Object.assign(new Error('removed'), { code: 'REMOVED' }); }
  if (!res.ok) {
    let err = 'server';
    try { err = (await res.json()).error || err; } catch { /* not json */ }
    throw Object.assign(new Error(err), { code: err, status: res.status });
  }
  return raw ? new Uint8Array(await res.arrayBuffer()) : res.json();
}

// ---------- persistent bookkeeping ----------
async function loadState() {
  state.clear();
  for (const r of await db.rawAll('syncState')) state.set(r.id, r);
}
async function setState(key, patch) {
  const next = { ...(state.get(key) || {}), ...patch, id: key };
  state.set(key, next);
  await db.rawPut('syncState', next);
}

// ---------- push (this device -> server) ----------
function schedulePush(delay = 400) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => queue(flushPush), delay);
}
const queue = (fn) => { running = running.then(fn).catch((e) => { lastError = e?.message || String(e); console.warn('sync', e); if (lastError === 'storage_full') refreshUsage({ force: true }).catch(() => {}); emit(); }); return running; };

/** Run fn (local deletions) without sending those keys to the other devices (Rincón wiped on one device only). */
export async function withoutPush(keyList, fn) {
  for (const k of keyList) applying.add(k);
  try { await fn(); } finally {
    for (const k of keyList) { applying.delete(k); dirty.delete(k); if (state.has(k)) await setState(k, { gone: true }); }
  }
}

function onLocalChange(store, id) {
  if (!isLinked() || db.LOCAL_ONLY.includes(store)) return;
  if (id == null) scanNeeded = true;
  else { const key = `${store}:${id}`; if (applying.has(key)) return; dirty.add(key); }
  schedulePush();
}

async function scan() {
  scanNeeded = false;
  for (const name of db.STORE_NAMES) {
    if (db.LOCAL_ONLY.includes(name)) continue;
    for (const r of await db.rawAll(name)) {
      const key = `${name}:${r.id}`;
      if (!blocked.has(key) && ms(r.updatedAt) > (state.get(key)?.ts || 0)) dirty.add(key);
    }
  }
}

const NOTIFY_WINDOW = 15 * 60000;
function notifyKind(store, r, prev) {
  if (!cfg.initialDone || Date.now() - ms(r.updatedAt) > NOTIFY_WINDOW || r.deleted) return null;
  const me = profile.active();
  if (store === 'thinkingOfYou' && !prev && r.by === me) return 'thinking';
  if (store === 'letters' && r.status === 'sealed' && prev?.n !== 'sealed' && r.author === me) return 'letter';
  if (store === 'content' && r.kind === 'coupon' && r.sentAt && !String(prev?.n || '').startsWith('sent') && (r.from || 'david') === me) return 'coupon';
  if (store === 'content' && r.kind === 'coupon' && r.seenCount && r.seenBy === me && prev?.n !== marker(store, r)) return r.seenCount > 1 ? 'couponAgain' : 'couponSeen'; // v0.30.0
  if (store === 'memories' && !prev) return 'memory';
  if (store === 'timeCapsules' && !prev) return 'capsule';
  if (store === 'songs' && !prev && r.by === me) return 'song';
  if (store === 'questionsDaily' && r.kind === 'asker' && !prev && r.askedBy === me) return 'question';
  if (store === 'streaks' && r.type === 'love' && !prev && r.by === me) return 'love';
  if (store === 'streaks' && r.type === 'beat' && !prev && r.by === me) return 'beat'; // v0.22.0 Latido
  if (store === 'streaks' && r.type === 'greet' && !prev && r.by === me) return r.kind === 'pm' ? 'greetPm' : 'greetAm';
  if (store === 'streaks' && r.type === 'hug' && !prev && r.by === me) return 'hug';
  if (store === 'streaks' && r.type === 'dayphoto' && !prev && r.by === me) return 'dayphoto'; // v0.28.0
  return null;
}
const marker = (store, r) => (store === 'letters' ? r.status : store === 'content' && r.kind === 'coupon' ? (r.sentAt ? `sent${r.seenCount ? `:${r.seenCount}` : ''}` : '') : undefined);

async function flushPush() {
  if (!isLinked() || !keys.has('space') || !navigator.onLine) return;
  if (scanNeeded) await scan();
  if (!dirty.size) { emit(); return; }
  if (!devicesCache.length) await refreshDevices().catch(() => {}); // needed before creating a personal key
  const ops = []; const media = []; const kinds = new Set();
  for (const key of [...dirty]) {
    const cut = key.indexOf(':');
    const store = key.slice(0, cut); const id = key.slice(cut + 1);
    const prev = state.get(key);
    const rec = await db.rawGet(store, id);
    // Rincón recordings stay on the device that made them (decided 2026-11-21).
    if (rec?.localOnly) { dirty.delete(key); continue; }
    let r; let ts;
    if (!rec) {
      if (!prev || prev.gone) { dirty.delete(key); continue; }
      r = { id, deleted: true, purged: true, updatedAt: nowISO() }; ts = Date.now();
    } else {
      ts = ms(rec.updatedAt);
      if (prev && prev.ts >= ts) { dirty.delete(key); continue; }
      const open = await db.openRecord(rec);
      if (open.locked) continue; // pushed when its PIN is entered
      r = { ...open, enc: null }; delete r.locked; delete r.payload;
    }
    const name = rec ? (store === 'media' ? await mediaScope(rec) : scopeOf(store, rec)) : (prev?.scope || 'space');
    if (!name) continue; // a photo whose record has not arrived: retried on the next scan
    if (!keys.has(name) && !(name.startsWith('person:') && await ensurePersonalKey(name))) {
      if (!cfg.keys?.[name]) { blocked.add(key); dirty.delete(key); }
      continue;
    }
    if (store === 'media' && rec) { media.push({ key, rec, r, name, ts }); continue; }
    const kind = rec ? notifyKind(store, r, prev) : null;
    if (kind) kinds.add(kind);
    const slot = await opKey(store, id);
    ops.push({ key, name, ts, n: rec ? marker(store, r) : undefined, gone: !rec, op: { k: slot, ts, e: await envelope(name, { s: store, r }, slot) } });
  }
  for (let i = 0; i < ops.length;) {
    const batch = []; let size = 0;
    while (i < ops.length && batch.length < 100 && size + ops[i].op.e.length < 3 * 1024 * 1024) { size += ops[i].op.e.length; batch.push(ops[i++]); }
    if (!batch.length) { dirty.delete(ops[i++].key); continue; } // a single record over the limit is skipped
    const notify = i >= ops.length && kinds.size ? await notifyPayload([...kinds][0]) : null;
    await api('ops', { method: 'POST', body: { ops: batch.map((x) => x.op), ...(notify ? { notify } : {}) } });
    for (const x of batch) {
      await setState(x.key, { ts: x.ts, n: x.n, gone: x.gone, scope: x.name });
      dirty.delete(x.key);
      // A deleted photo or video also frees its space on the server (best effort).
      if (x.gone && x.key.startsWith('media:')) api(`blob/${x.key.slice(6)}`, { method: 'DELETE' }).catch(() => {});
    }
  }
  for (const m of media) {
    await pushMedia(m);
    dirty.delete(m.key);
  }
  lastSyncAt = Date.now(); lastError = '';
  emit();
  refreshUsage().catch(() => {});
}

// ---------- space used on the server (Fase 4A, v0.4.1) ----------
// Cloudflare's free plan keeps up to 1 GB per storage object and 5 GB per account, and the media
// is split in 5 objects. The fullest object is the one that fills first, so that sets the percentage.
const USAGE_GROUP = 'syncUsage';
export const USAGE_WARN = 80;
let usageAt = 0;
/** Ask the server how full it is (at most once an hour unless force). Saves the answer on this device. */
export async function refreshUsage({ force = false } = {}) {
  if (!isLinked() || !navigator.onLine) return null;
  if (!force && Date.now() - usageAt < 3600000) return null;
  usageAt = Date.now();
  const u = await api('usage');
  const rec = { pct: u.pct, used: u.used, accountLimit: u.accountLimit, shardLimit: u.shardLimit, at: nowISO() };
  await db.setSettings(USAGE_GROUP, rec);
  emit();
  return rec;
}
/** The last answer saved on this device, or null. */
export async function lastUsage() {
  const r = await db.getSettings(USAGE_GROUP, {});
  return Number.isFinite(r.pct) ? r : null;
}

async function pushMedia({ key, rec, r, name, ts }) {
  let bytes;
  if (rec.enc) {
    if (!cryptoBox.canOpen(rec.enc)) return;
    bytes = await cryptoBox.decryptBytes(rec.enc);
  } else if (rec.blob) bytes = new Uint8Array(await rec.blob.arrayBuffer());
  const k = keys.get(name);
  const parts = bytes ? Math.ceil(bytes.length / CHUNK) || 1 : 0;
  for (let n = 0; n < parts; n++) {
    const box = await seal(k.aes, bytes.subarray(n * CHUNK, (n + 1) * CHUNK), `${rec.id}:${n}`);
    await api(`blob/${rec.id}/${n}`, { method: 'PUT', body: box });
  }
  const meta = { ...r, blob: null, enc: null, parts, size: bytes?.length || 0, wasEnc: rec.enc?.keyRef || null };
  const slot = await opKey('media', rec.id);
  await api('ops', { method: 'POST', body: { ops: [{ k: slot, ts, e: await envelope(name, { s: 'media', r: meta }, slot) }] } });
  await setState(key, { ts, scope: name });
}

// ---------- pull (server -> this device) ----------
async function pull() {
  if (!isLinked() || !keys.has('space')) return;
  let changed = new Set();
  for (;;) {
    const res = await api(`ops?since=${cfg.cursor || 0}`);
    for (const op of res.ops) {
      const store = await applyOp(op);
      if (store) changed.add(store);
      cfg.cursor = op.seq;
    }
    await saveCfg();
    if (!res.more) break;
  }
  lastSyncAt = Date.now(); lastError = '';
  if (changed.size) appliedListeners.forEach((fn) => { try { fn([...changed]); } catch (e) { console.error(e); } });
  changed = null;
  emit();
}

/** Apply one change from the server. Returns the store name when something changed here. */
async function applyOp(op) {
  const dot = op.e.indexOf('.');
  const name = nameByKid(op.e.slice(0, dot));
  if (!name) return null; // a key this device must not have (the other person's "Solo yo")
  const k = keys.get(name);
  if (!k) { await db.rawPut('syncInbox', { id: op.k, seq: op.seq, ts: op.ts, e: op.e }); return null; }
  let obj;
  try { obj = JSON.parse(td.decode(await unseal(k.aes, fromB64u(op.e.slice(dot + 1)), op.k))); } catch { return null; }
  const { s: store, r } = obj || {};
  if (!r?.id || !db.STORE_NAMES.includes(store) || db.LOCAL_ONLY.includes(store)) return null;
  const key = `${store}:${r.id}`;
  const local = await db.rawGet(store, r.id);
  const incoming = r.purged ? op.ts : ms(r.updatedAt);
  if (local && ms(local.updatedAt) >= incoming) {
    if (ms(local.updatedAt) === incoming && !state.get(key)) await setState(key, { ts: incoming, scope: name });
    return null;
  }
  applying.add(key);
  try {
    if (r.purged) {
      if (local) await db.purge(store, r.id);
      await setState(key, { ts: incoming, gone: true, scope: name });
      return store;
    }
    if (store === 'media') {
      const ok = await applyMedia(r, name);
      if (!ok) { await db.rawPut('syncInbox', { id: op.k, seq: op.seq, ts: op.ts, e: op.e }); return null; }
    } else {
      let sealed;
      try { sealed = await db.seal(store, { ...r, enc: null }); } catch (e) {
        if (e.code === 'LOCKED') { await db.rawPut('syncInbox', { id: op.k, seq: op.seq, ts: op.ts, e: op.e }); return null; }
        throw e;
      }
      await db.rawPut(store, sealed);
    }
    await setState(key, { ts: incoming, n: marker(store, r), scope: name });
    dirty.delete(key);
    return store;
  } finally { applying.delete(key); }
}

async function applyMedia(m, name) {
  const target = m.wasEnc ? (security.hasKey(m.wasEnc) ? m.wasEnc : security.hasKey('app') ? 'app' : null) : null;
  if (target && !cryptoBox.isUnlocked(target)) return false;
  const k = keys.get(name);
  const pieces = [];
  for (let n = 0; n < (m.parts || 0); n++) pieces.push(await unseal(k.aes, await api(`blob/${m.id}/${n}`, { raw: true }), `${m.id}:${n}`));
  const bytes = concat(...pieces);
  const { parts: _p, size: _s, wasEnc: _w, ...rest } = m;
  const rec = { ...rest, blob: null, enc: null };
  if (target) rec.enc = await cryptoBox.encryptBytes(target, bytes);
  else rec.blob = new Blob([bytes], { type: m.mime || 'application/octet-stream' });
  await db.rawPut('media', rec);
  return true;
}

async function processInbox() {
  const items = (await db.rawAll('syncInbox')).sort((a, b) => a.seq - b.seq);
  if (!items.length) return;
  const changed = new Set();
  for (const it of items) {
    await db.rawDelete('syncInbox', it.id);
    const store = await applyOp(it);
    if (store) changed.add(store);
  }
  if (changed.size) appliedListeners.forEach((fn) => { try { fn([...changed]); } catch (e) { console.error(e); } });
}

/** Called often: when a PIN was entered, open the keys it protects and catch up. */
async function checkUnlocks() {
  const now = cryptoBox.unlockedScopes().sort().join(',');
  if (now === unlockedSeen) return;
  unlockedSeen = now;
  await loadKeys();
  await processInbox();
  scanNeeded = true;
  await flushPush();
}

// ---------- live channel ----------
function connect() {
  if (!isLinked() || ws || !navigator.onLine) return;
  const url = new URL(`api/s/${cfg.spaceId}/ws`, document.baseURI);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let sock;
  try { sock = new WebSocket(url); } catch { scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', d: cfg.deviceId, tok: cfg.token }));
  sock.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'ready') {
      online = true; backoff = 2000; emit();
      clearInterval(pingTimer); pingTimer = setInterval(() => { try { sock.send('ping'); } catch { /* closed */ } }, 25000);
      queue(async () => { await pull(); scanNeeded = true; await flushPush(); });
    } else if (msg.t === 'ops') queue(pull);
    else if (msg.t === 'devices') refreshDevices().catch(() => {});
  };
  sock.onclose = (ev) => {
    clearInterval(pingTimer);
    if (ws === sock) ws = null;
    online = false; emit();
    if (ev.code === 4001 || ev.code === 4002) { markRemoved(); return; }
    scheduleReconnect();
  };
  sock.onerror = () => { /* onclose follows */ };
}
function scheduleReconnect() {
  clearTimeout(wsTimer);
  if (!isLinked()) return;
  wsTimer = setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 60000);
}
function disconnect() {
  clearTimeout(wsTimer); clearInterval(pingTimer);
  const s = ws; ws = null; online = false;
  try { s?.close(1000, 'bye'); } catch { /* closed */ }
}

async function markRemoved() {
  if (!cfg || cfg.removed) return;
  cfg.removed = true;
  disconnect();
  await saveCfg();
  emit();
}

// ---------- start ----------
/** Start the engine (after the app is unlocked). Safe to call more than once. */
export async function start() {
  cfg = await db.rawGet('settings', CFG_ID);
  if (!started) {
    started = true;
    db.onChange(onLocalChange);
    addEventListener('online', () => { connect(); schedulePush(100); });
    addEventListener('offline', () => { disconnect(); emit(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isLinked()) { if (!ws) { backoff = 2000; connect(); } else queue(pull); }
    });
  }
  if (!cfg?.spaceId) { emit(); return; }
  await loadState();
  await loadKeys();
  unlockedSeen = cryptoBox.unlockedScopes().sort().join(',');
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (isLinked()) queue(checkUnlocks); }, 3000);
  if (cfg.removed) { emit(); return; }
  refreshDevices().catch(() => {});
  queue(processInbox);
  connect();
  emit();
}
/** Push and pull now (the "Sincronizar ahora" button). */
export const syncNow = () => queue(async () => { await loadKeys(); await pull(); scanNeeded = true; await flushPush(); });

// ---------- devices ----------
const deviceKind = () => (/Android|Mobi/i.test(navigator.userAgent) ? 'phone' : 'pc');
async function labelFor(person, name) {
  return envelope('space', { name: name || `${deviceKind() === 'phone' ? 'Celular' : 'PC'} de ${profile.name(person) || 'alguien'}`, person, kind: deviceKind() });
}
export async function refreshDevices() {
  const res = await api('devices');
  const k = keys.get('space');
  const out = [];
  for (const d of res.devices) {
    let info = {};
    try { const dot = d.label.indexOf('.'); info = JSON.parse(td.decode(await unseal(k.aes, fromB64u(d.label.slice(dot + 1))))); } catch { /* unreadable */ }
    out.push({ id: d.id, name: info.name || 'Equipo', person: info.person || null, kind: info.kind || 'phone', seen: d.seen, created: d.created, me: d.id === cfg.deviceId });
  }
  devicesCache = out;
  noticeNewDevices(out);
  emit();
  return out;
}
// v0.27.0 (idea 56): tell the person once when a device they have not seen joins the space.
const KNOWN_KEY = 'aishiteru.devices.known';
function noticeNewDevices(list) {
  let known = null;
  try { known = JSON.parse(localStorage.getItem(KNOWN_KEY) || 'null'); } catch { return; }
  const ids = list.map((d) => d.id);
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(ids)); } catch { return; }
  if (!Array.isArray(known)) return; // first look on this device: everything already there is known
  const fresh = list.filter((d) => !d.me && !known.includes(d.id));
  if (fresh.length) dispatchEvent(new CustomEvent('aishiteru:new-device', { detail: fresh.map((d) => ({ name: d.name, kind: d.kind })) }));
}
export const devices = () => devicesCache;
export async function renameDevice(name) {
  await api(`devices/${cfg.deviceId}`, { method: 'PATCH', body: { label: await labelFor(cfg.me, String(name).trim().slice(0, 40)) } });
  return refreshDevices();
}
export async function removeDevice(id) {
  await api(`devices/${id}`, { method: 'DELETE' });
  return refreshDevices();
}

/** This device leaves the space. Its data stays here; the others keep theirs. */
export async function leave({ server = true } = {}) {
  if (cfg?.spaceId && server && !cfg.removed) { try { await api(`devices/${cfg.deviceId}`, { method: 'DELETE' }); } catch { /* offline: the others can remove it */ } }
  await forget();
}
/** Delete everything of the space on the server; every device is unlinked (their data stays on them). */
export async function destroySpace() {
  await api('space', { method: 'DELETE' });
  await forget();
}
async function forget() {
  disconnect();
  clearInterval(tickTimer);
  cfg = null; keys.clear(); indexKey = null; state.clear(); dirty.clear(); blocked.clear(); devicesCache = [];
  await db.rawDelete('settings', CFG_ID).catch(() => {});
  await db.rawDelete('settings', NOTIFY_ID).catch(() => {});
  await db.rawClear('syncState').catch(() => {});
  await db.rawClear('syncInbox').catch(() => {});
  emit();
}

// ---------- creating and joining ----------
function freshCfg(spaceId, me) {
  return { id: CFG_ID, spaceId, deviceId: b64u(rand(16)), token: b64u(rand(32)), me, cursor: 0, keys: {}, initialDone: false, notify: false };
}

/** First device: create the space with fresh keys. */
export async function createSpace() {
  if (isLinked()) throw new Error('Este equipo ya está unido.');
  const me = profile.active();
  cfg = freshCfg(b64u(rand(16)), me);
  for (const name of ['space', 'vault', 'cycle', `person:${me}`]) await storeKey(name, rand(32));
  await api('create', { method: 'POST', auth: false, body: { device: cfg.deviceId, token: cfg.token, label: await labelFor(me) } });
  await saveCfg();
  await afterJoin();
}

/** Code for a new device (shown as a QR here). For "mine" it also carries my personal key. */
export async function makeInvite(forPerson) {
  const invite = rand(16);
  await api('invite', { method: 'POST', body: { h: await sha256hex(b64u(invite)) } });
  return inviteCode(invite, forPerson);
}
function inviteCode(invite, forPerson) {
  const personal = forPerson === cfg.me ? keys.get(`person:${cfg.me}`)?.raw : null;
  const flags = (personal ? 1 : 0) | (forPerson === 'david' ? 2 : 0);
  const k = (n) => keys.get(n)?.raw || new Uint8Array(32);
  const bytes = concat(new Uint8Array([1, flags]), fromB64u(cfg.spaceId), invite, k('space'), k('vault'), k('cycle'), personal || new Uint8Array(0));
  return CODE_SPACE + b64u(bytes);
}

export function parseCode(text) {
  const t = String(text || '').trim();
  try {
    if (t.startsWith(CODE_SPACE)) {
      const b = fromB64u(t.slice(CODE_SPACE.length));
      if (b[0] !== 1 || b.length < 2 + 16 + 16 + 96) return null;
      const at = (o) => b.slice(o, o + 32);
      return {
        type: 'space', person: b[1] & 2 ? 'david' : 'sofia', spaceId: b64u(b.slice(2, 18)), invite: b64u(b.slice(18, 34)),
        keys: { space: at(34), vault: at(66), cycle: at(98), ...(b[1] & 1 && b.length >= 162 ? { personal: at(130) } : {}) },
      };
    }
    if (t.startsWith(CODE_PAIR)) {
      const b = fromB64u(t.slice(CODE_PAIR.length));
      if (b.length !== 48) return null;
      return { type: 'pair', pairId: b64u(b.slice(0, 16)), secret: b.slice(16) };
    }
  } catch { /* not ours */ }
  return null;
}

/** Join with a space code (scanned here, or received through the pairing mailbox). */
export async function joinWithCode(code) {
  const c = typeof code === 'string' ? parseCode(code) : code;
  if (!c || c.type !== 'space') throw new Error('Ese código no es de Aishiteru.');
  if (cfg?.spaceId && !cfg.removed) {
    if (cfg.spaceId !== c.spaceId) throw new Error('Este equipo ya está unido a otro espacio. Sácalo primero desde Sincronización.');
    // Already in this space: only bring the personal key (another device of the same person).
    if (c.keys.personal && c.person === cfg.me) { await storeKey(`person:${cfg.me}`, c.keys.personal); await saveCfg(); scanNeeded = true; queue(async () => { await processInbox(); await pull(); await flushPush(); }); }
    return 'keys';
  }
  if (cfg?.removed) await forget();
  cfg = freshCfg(c.spaceId, c.person);
  profile.setActive(c.person);
  for (const name of ['space', 'vault', 'cycle']) await storeKey(name, c.keys[name]);
  if (c.keys.personal) await storeKey(`person:${c.person}`, c.keys.personal);
  try {
    await api('join', { method: 'POST', auth: false, body: { invite: c.invite, device: cfg.deviceId, token: cfg.token, label: await labelFor(c.person) } });
  } catch (e) {
    cfg = null; keys.clear(); indexKey = null;
    throw new Error(e.code === 'invite' ? 'El código ya se usó o venció. Pide uno nuevo.' : 'No se pudo unir. Revisa la conexión e intenta otra vez.');
  }
  await saveCfg();
  await afterJoin();
  return 'joined';
}

async function afterJoin() {
  await loadState();
  scanNeeded = true;
  await start();
  await queue(async () => {
    await pull();
    await flushPush();
    cfg.initialDone = true;
    await saveCfg();
  });
}

/**
 * A new device that cannot scan (a PC) shows its own code; an already linked device scans it
 * and answers through a one-time mailbox, encrypted with the secret that only the QR carries.
 */
// Short code (2026-11-22): besides the QR, the new device shows 10 letters and numbers that can be typed
// on a linked device (a PC without a camera, a QR that does not scan). Both the mailbox id and its key
// come from those letters with PBKDF2, so the server only ever sees an id and a sealed box, once.
const SHORT_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L: easy to read aloud
export const normShort = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isShortCode = (t) => { const n = normShort(t); return n.length === 10 && [...n].every((c) => SHORT_ALPHA.includes(c)); };
export const formatShort = (t) => { const n = normShort(t); return `${n.slice(0, 5)}-${n.slice(5)}`; };
function newShort() {
  let out = '';
  while (out.length < 10) { for (const b of rand(16)) { if (b < 248 && out.length < 10) out += SHORT_ALPHA[b % 31]; } }
  return out;
}
async function shortPair(code) {
  const base = await crypto.subtle.importKey('raw', te.encode(normShort(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode('aishiteru-pair-v1'), iterations: 300000 }, base, 384));
  return { type: 'pair', pairId: b64u(bits.slice(0, 16)), secret: bits.slice(16, 48) };
}
/** A typed short code -> the same pairing request the QR carries. */
export const parseShort = (text) => (isShortCode(text) ? shortPair(text) : Promise.resolve(null));

export async function requestPairing() {
  const short = newShort();
  const req = await shortPair(short);
  const pairId = fromB64u(req.pairId); const { secret } = req;
  const code = CODE_PAIR + b64u(concat(pairId, secret));
  let stop = false;
  const wait = (async () => {
    const id = b64u(pairId);
    const until = Date.now() + 10 * 60000;
    while (!stop && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2000));
      if (stop) break;
      let res = null;
      try { res = await api(`pair/${id}`, { auth: false }); } catch { /* not yet */ }
      if (!res?.c) continue;
      const text = td.decode(await unseal(await aesKey(secret), fromB64u(res.c), 'pair'));
      api(`pair/${id}`, { method: 'DELETE', auth: false }).catch(() => {});
      return joinWithCode(text);
    }
    if (!stop) throw new Error('El código venció. Genera uno nuevo.');
    return null;
  })();
  return { code, short: formatShort(short), wait, cancel: () => { stop = true; } };
}
export async function answerPairing(req, forPerson) {
  const text = await makeInvite(forPerson);
  const box = await seal(await aesKey(req.secret), te.encode(text), 'pair');
  await api(`pair/${req.pairId}`, { method: 'POST', auth: false, body: { c: b64u(box) } });
}

// ---------- recovery: passkey + 12-word phrase (decided 2026-11-21) ----------
// Each person can leave a recovery slot on the server: a join code (like the QR one, with their personal key)
// encrypted with a secret that only their phrase or their passkey gives back. The code carries a recovery
// invite that does not expire, so a reinstalled phone joins again as a new device of the same person.
// The server sees an opaque blob under a random-looking id; without the phrase or the passkey it opens nothing.
async function slotKeys(secret) {
  return { id: b64u(await hmac(secret, 'rescue-id')).slice(0, 43), auth: b64u(await hmac(secret, 'rescue-auth')), key: await aesKey(await hmac(secret, 'rescue-key')) };
}
/** The join code a recovery slot holds. Registers (or replaces) this person's recovery invite. */
export async function rescueCode() {
  if (!isLinked()) throw new Error('Primero une este equipo en Sincronización.');
  await ensurePersonalKey(`person:${cfg.me}`);
  const invite = rand(16);
  await api('rescue', { method: 'PUT', body: { person: cfg.me, h: await sha256hex(b64u(invite)) } });
  return inviteCode(invite, cfg.me);
}
/** Save the code in the slot that `secret` (32 bytes from the phrase or the passkey) opens. */
export async function saveRescueSlot(secret, code) {
  const s = await slotKeys(secret);
  const box = await seal(s.key, te.encode(code), 'rescue');
  await api(`rescue/${s.id}`, { method: 'PUT', auth: false, body: { c: b64u(box), a: s.auth } });
}
/** Read the code back, or null when there is no slot for that secret. */
export async function readRescueSlot(secret) {
  const s = await slotKeys(secret);
  let res;
  try { res = await api(`rescue/${s.id}`, { method: 'POST', auth: false, body: { a: s.auth } }); } catch (e) { if (e.status === 404) return null; throw e; }
  return td.decode(await unseal(s.key, fromB64u(res.c), 'rescue'));
}
export async function markRescue(patch) { cfg.rescue = { ...(cfg.rescue || {}), ...patch, at: nowISO() }; await saveCfg(); emit(); }
export const rescueState = () => cfg?.rescue || {};

// ---------- caring notifications ----------
async function notifyKey() { return (await hmac(keys.get('space').raw, 'notify')); }
async function notifyPayload(kind) {
  if (!devicesCache.length) await refreshDevices().catch(() => {});
  const to = devicesCache.filter((d) => !d.me && d.person && d.person !== cfg.me).map((d) => d.id);
  if (!to.length) return null;
  const box = await seal(await aesKey(await notifyKey()), te.encode(JSON.stringify({ k: kind })));
  return { to, p: b64u(box) };
}
export const notificationsSupported = () => 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
export async function enableNotifications() {
  if (!notificationsSupported()) throw new Error('Este navegador no permite avisos.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Los avisos están bloqueados para la app. Actívalos en los permisos del navegador.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('vapid');
  let sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe().catch(() => {});
  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  await api('sub', { method: 'PUT', body: { sub: sub.toJSON() } });
  // The service worker reads only this key, which opens nothing but the kind of notice.
  await db.rawPut('settings', { id: NOTIFY_ID, key: b64u(await notifyKey()), updatedAt: nowISO() });
  cfg.notify = true; await saveCfg(); emit();
}
export async function disableNotifications() {
  try { await api('sub', { method: 'DELETE' }); } catch { /* offline */ }
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* none */ }
  await db.rawDelete('settings', NOTIFY_ID).catch(() => {});
  cfg.notify = false; lastSched = ''; await saveCfg(); emit();
}

// Scheduled notices (v0.15.0): this device hands the server its own list of { at, p } for the next
// weeks. Each p is sealed like any notice, so the server learns only when to knock.
export const noticePrefs = () => ({ reminders: true, love: true, loveAt: '20:00', ...(cfg?.sched || {}) });
export async function setNoticePrefs(patch) { cfg.sched = { ...noticePrefs(), ...patch }; await saveCfg(); emit(); }
let lastSched = '';
/** items: [{ at: epoch ms, k: kind }]. Returns how many went, or null when this device has no notices. */
export async function scheduleNotices(items) {
  if (!isLinked() || !cfg.notify || !keys.has('space') || !navigator.onLine) return null;
  const now = Date.now();
  const list = items.filter((it) => it.at > now && it.at < now + 390 * 86400000).sort((a, b) => a.at - b.at).slice(0, 80);
  const sig = JSON.stringify(list);
  if (sig === lastSched) return list.length;
  const aes = await aesKey(await notifyKey());
  const out = [];
  for (const it of list) out.push({ at: it.at, p: b64u(await seal(aes, te.encode(JSON.stringify({ k: it.k })))) });
  await api('sched', { method: 'PUT', body: { items: out } });
  lastSched = sig;
  return out.length;
}

/** Ids of settings records that belong to sync and must never go into a backup file. */
export const PRIVATE_SETTINGS = [CFG_ID, NOTIFY_ID];
