// Aishiteru sync server (Fase A). Runs on Cloudflare Workers, free plan.
// The server never sees readable data: every record, photo and device name
// arrives encrypted from the devices (end-to-end, keys only on the devices).
// It keeps, per space, the latest encrypted version of each record, the
// encrypted media chunks, the paired devices and their push subscriptions.
import { DurableObject } from 'cloudflare:workers';
import { sendPush } from './push.js';

const ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BODY = 4 * 1024 * 1024; // ops batch
const MAX_CHUNK = 1.5 * 1024 * 1024; // one media chunk
const MAX_OP = 1024 * 1024; // one encrypted record
const INVITE_TTL = 10 * 60 * 1000;
// Photos and videos are split over SHARDS Durable Objects. On the free plan each Durable Object
// holds up to 1 GB and the account up to 5 GB in total, so 5 shards is the most the free plan gives.
const SHARDS = 5;
const SHARD_LIMIT = 1024 * 1024 * 1024;
const ACCOUNT_LIMIT = 5 * SHARD_LIMIT;
// Only real browser push services, so a device cannot make the server call any other address.
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const fail = (status, error) => json({ error }, status);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/\/api\/(.+)$/);
    if (!m) return env.ASSETS.fetch(request);
    const parts = m[1].split('/');
    try {
      if (parts[0] === 'pair' && ID.test(parts[1] || '') && parts.length === 2) {
        return env.MAILBOX.get(env.MAILBOX.idFromName(parts[1])).fetch(request);
      }
      // Recovery slot (2026-11-21): an encrypted join code found by an id that only the person's phrase or
      // passkey can derive. The server never learns the phrase, the space or the keys.
      if (parts[0] === 'rescue' && /^[A-Za-z0-9_-]{43}$/.test(parts[1] || '') && parts.length === 2) {
        return env.RESCUE.get(env.RESCUE.idFromName(parts[1])).fetch(request);
      }
      if (parts[0] === 's' && ID.test(parts[1] || '')) {
        const stub = env.SPACE.get(env.SPACE.idFromName(parts[1]));
        const inner = new URL(request.url);
        inner.pathname = `/${parts.slice(2).join('/')}`;
        const forward = new Request(inner, request);
        forward.headers.set('x-space', parts[1]); // set here, so a device cannot choose it
        return stub.fetch(forward);
      }
      return fail(404, 'not_found');
    } catch (e) {
      console.error(e?.stack || e);
      return fail(500, 'server');
    }
  },
};

const enc = new TextEncoder();
async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function readJSON(request, max = 64 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) throw Object.assign(new Error('too big'), { status: 413 });
  const text = await request.text();
  if (text.length > max) throw Object.assign(new Error('too big'), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export class Space extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, tok TEXT NOT NULL, label TEXT, created INTEGER, seen INTEGER);
      CREATE TABLE IF NOT EXISTS invites (h TEXT PRIMARY KEY, exp INTEGER);
      CREATE TABLE IF NOT EXISTS ops (seq INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT UNIQUE NOT NULL, ts INTEGER NOT NULL, e TEXT NOT NULL, dev TEXT);
      -- chunks: media saved before v0.4.1; new photos and videos go to the shards
      CREATE TABLE IF NOT EXISTS chunks (id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, n));
      CREATE TABLE IF NOT EXISTS subs (dev TEXT PRIMARY KEY, sub TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
    `);
    // Keep-alive pings never wake the object (and are not billed as requests).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [a, b, c] = url.pathname.slice(1).split('/');
    const method = request.method;
    try {
      if (a === 'ws') return this.socket(request);
      if (a === 'create' && method === 'POST') return this.create(request);
      if (a === 'join' && method === 'POST') return this.join(request);
      const dev = await this.auth(request);
      if (!dev) return fail(401, 'unauthorized');
      if (a === 'ops' && method === 'GET') return this.pull(url);
      if (a === 'ops' && method === 'POST') return this.push(request, dev, url);
      if (a === 'invite' && method === 'POST') return this.invite(request);
      if (a === 'rescue' && method === 'PUT') return this.setRescue(request);
      if (a === 'blob' && ID.test(b || '') && /^\d{1,4}$/.test(c || '')) {
        if (method === 'PUT') return this.putChunk(request, b, Number(c));
        if (method === 'GET') return this.getChunk(request, b, Number(c));
      }
      if (a === 'blob' && ID.test(b || '') && !c && method === 'DELETE') return this.dropMedia(request, b);
      if (a === 'usage' && method === 'GET') return this.usage(request);
      if (a === 'devices' && method === 'GET') return this.devices();
      if (a === 'devices' && b && method === 'PATCH') return this.relabel(request, dev, b);
      if (a === 'devices' && b && method === 'DELETE') return this.removeDevice(b);
      if (a === 'vapid' && method === 'GET') return json({ key: (await this.vapid()).publicKey });
      if (a === 'sub' && method === 'PUT') return this.subscribe(request, dev);
      if (a === 'sub' && method === 'DELETE') { this.sql.exec('DELETE FROM subs WHERE dev = ?', dev); return json({ ok: true }); }
      if (a === 'space' && method === 'DELETE') return this.destroy(request);
      return fail(404, 'not_found');
    } catch (e) {
      if (e.status) return fail(e.status, e.message);
      console.error(e?.stack || e);
      return fail(500, 'server');
    }
  }

  // ---------- devices and pairing ----------
  async auth(request) {
    const h = request.headers.get('authorization') || '';
    const m = h.match(/^Bearer ([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{32,128})$/);
    if (!m) return null;
    return this.check(m[1], m[2]);
  }
  async check(dev, token) {
    const row = this.sql.exec('SELECT tok, seen FROM devices WHERE id = ?', dev).toArray()[0];
    if (!row || row.tok !== await sha256(token)) return null;
    const now = Date.now();
    if (now - (row.seen || 0) > 60000) this.sql.exec('UPDATE devices SET seen = ? WHERE id = ?', now, dev);
    return dev;
  }
  async register(body) {
    if (!ID.test(body.device || '') || !str(body.token, 128) || (body.label && !str(body.label, 2048))) throw Object.assign(new Error('bad device'), { status: 400 });
    if (this.sql.exec('SELECT COUNT(*) FROM devices WHERE id = ?', body.device).one()['COUNT(*)']) throw Object.assign(new Error('device exists'), { status: 409 });
    if (this.sql.exec('SELECT COUNT(*) AS n FROM devices').one().n >= 12) throw Object.assign(new Error('too many devices'), { status: 409 });
    const now = Date.now();
    this.sql.exec('INSERT OR REPLACE INTO devices (id, tok, label, created, seen) VALUES (?, ?, ?, ?, ?)',
      body.device, await sha256(body.token), body.label || '', now, now);
  }
  async create(request) {
    const body = await readJSON(request);
    if (this.sql.exec('SELECT COUNT(*) AS n FROM devices').one().n > 0) return fail(409, 'exists');
    await this.register(body);
    return json({ ok: true });
  }
  async invite(request) {
    const body = await readJSON(request);
    if (!/^[0-9a-f]{64}$/.test(body.h || '')) return fail(400, 'bad invite');
    const now = Date.now();
    this.sql.exec('DELETE FROM invites WHERE exp < ?', now);
    if (this.sql.exec('SELECT COUNT(*) AS n FROM invites').one().n >= 5) return fail(429, 'too many invites');
    this.sql.exec('INSERT OR REPLACE INTO invites (h, exp) VALUES (?, ?)', body.h, now + INVITE_TTL);
    return json({ ok: true, exp: now + INVITE_TTL });
  }
  async setRescue(request) {
    const body = await readJSON(request);
    if (!['sofia', 'david'].includes(body.person) || !/^[0-9a-f]{64}$/.test(body.h || '')) return fail(400, 'bad rescue');
    this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', `rescue:${body.person}`, body.h);
    return json({ ok: true });
  }
  async join(request) {
    const body = await readJSON(request);
    if (!str(body.invite, 128)) return fail(400, 'bad invite');
    const h = await sha256(body.invite);
    const row = this.sql.exec('SELECT exp FROM invites WHERE h = ?', h).toArray()[0];
    // A recovery invite (one per person) does not expire and is not used up: it is what lets a
    // reinstalled phone come back with the phrase or the passkey.
    const rescue = !row && this.sql.exec("SELECT k FROM kv WHERE k LIKE 'rescue:%' AND v = ?", h).toArray()[0];
    if (!rescue && (!row || row.exp < Date.now())) return fail(403, 'invite');
    if (row) this.sql.exec('DELETE FROM invites WHERE h = ?', h);
    await this.register(body);
    this.broadcast({ t: 'devices' });
    return json({ ok: true });
  }
  devices() {
    return json({ devices: this.sql.exec('SELECT id, label, created, seen FROM devices ORDER BY created').toArray() });
  }
  async relabel(request, dev, id) {
    if (id !== dev) return fail(403, 'only self');
    const body = await readJSON(request);
    if (!str(body.label, 2048)) return fail(400, 'bad label');
    this.sql.exec('UPDATE devices SET label = ? WHERE id = ?', body.label, dev);
    this.broadcast({ t: 'devices' });
    return json({ ok: true });
  }
  removeDevice(id) {
    this.sql.exec('DELETE FROM devices WHERE id = ?', id);
    this.sql.exec('DELETE FROM invites'); // a code made just before the removal must not let it back in
    this.sql.exec('DELETE FROM subs WHERE dev = ?', id);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.dev === id) { try { ws.close(4001, 'removed'); } catch { /* gone */ } }
    }
    this.broadcast({ t: 'devices' });
    return json({ ok: true });
  }
  async destroy(request) {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(4002, 'deleted'); } catch { /* gone */ } }
    for (let i = 0; i < SHARDS; i++) await this.shard(request, '', i).fetch('https://shard/wipe', { method: 'POST' }).catch(() => {});
    await this.ctx.storage.deleteAll();
    return json({ ok: true });
  }

  // ---------- records ----------
  pull(url) {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const rows = this.sql.exec('SELECT seq, k, ts, e FROM ops WHERE seq > ? ORDER BY seq LIMIT 300', since).toArray();
    const last = this.sql.exec('SELECT COALESCE(MAX(seq), 0) AS m FROM ops').one().m;
    return json({ ops: rows, last, more: rows.length === 300 });
  }
  async push(request, dev, url) {
    const body = await readJSON(request, MAX_BODY);
    if (!Array.isArray(body.ops) || body.ops.length > 200) return fail(400, 'bad ops');
    let accepted = 0;
    for (const op of body.ops) {
      if (!str(op?.k, 64) || !Number.isFinite(op.ts) || !str(op.e, MAX_OP)) return fail(400, 'bad op');
      const prev = this.sql.exec('SELECT ts FROM ops WHERE k = ?', op.k).toArray()[0];
      if (prev && prev.ts > op.ts) continue; // last write wins: an older copy never replaces a newer one
      this.sql.exec('DELETE FROM ops WHERE k = ?', op.k);
      this.sql.exec('INSERT INTO ops (k, ts, e, dev) VALUES (?, ?, ?, ?)', op.k, op.ts, op.e, dev);
      accepted++;
    }
    const last = this.sql.exec('SELECT COALESCE(MAX(seq), 0) AS m FROM ops').one().m;
    if (accepted) this.broadcast({ t: 'ops', last }, dev);
    if (body.notify && Array.isArray(body.notify.to) && str(body.notify.p, 512)) {
      this.ctx.waitUntil(this.notify(body.notify.to.slice(0, 12), body.notify.p, url.origin));
    }
    return json({ ok: true, last, accepted });
  }

  // ---------- media chunks ----------
  space(request) {
    const id = request.headers.get('x-space') || '';
    if (!ID.test(id)) throw Object.assign(new Error('space'), { status: 400 });
    return id;
  }
  /** The shard that keeps (all the chunks of) one photo or video. */
  shard(request, mediaId, i = null) {
    let h = 2166136261;
    for (let k = 0; k < mediaId.length; k++) { h ^= mediaId.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
    const idx = i ?? h % SHARDS;
    return this.env.SHARD.get(this.env.SHARD.idFromName(`${this.space(request)}:${idx}`));
  }
  async putChunk(request, id, n) {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_CHUNK) return fail(413, 'too big');
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_CHUNK || !data.byteLength) return fail(413, 'too big');
    const res = await this.shard(request, id).fetch(`https://shard/put/${id}/${n}`, { method: 'PUT', body: data });
    if (res.status === 507) return fail(507, 'storage_full');
    if (!res.ok) return fail(500, 'server');
    this.sql.exec('DELETE FROM chunks WHERE id = ? AND n = ?', id, n); // an older copy kept here
    return json({ ok: true });
  }
  async getChunk(request, id, n) {
    const res = await this.shard(request, id).fetch(`https://shard/get/${id}/${n}`);
    if (res.ok) return new Response(res.body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
    const row = this.sql.exec('SELECT data FROM chunks WHERE id = ? AND n = ?', id, n).toArray()[0]; // saved before the shards existed
    if (!row) return fail(404, 'not_found');
    return new Response(row.data, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
  }
  /** A photo or video was deleted on a device: free its space. */
  async dropMedia(request, id) {
    this.sql.exec('DELETE FROM chunks WHERE id = ?', id);
    await this.shard(request, id).fetch(`https://shard/drop/${id}`, { method: 'DELETE' });
    return json({ ok: true });
  }
  /** Bytes used: this object (records, devices and older media) and each shard. */
  async usage(request) {
    const shards = await Promise.all(Array.from({ length: SHARDS }, async (_, i) => {
      try { return (await (await this.shard(request, '', i).fetch('https://shard/size')).json()).bytes || 0; } catch { return 0; }
    }));
    const own = this.sql.databaseSize || 0;
    // The fullest object is the one that fills first; the account total is what the plan allows.
    const fullest = Math.max(own, ...shards);
    return json({ own, shards, used: own + shards.reduce((a, b) => a + b, 0), shardLimit: SHARD_LIMIT, accountLimit: ACCOUNT_LIMIT, pct: Math.min(100, Math.round((fullest / SHARD_LIMIT) * 100)) });
  }

  // ---------- live channel ----------
  socket(request) {
    if (request.headers.get('upgrade') !== 'websocket') return fail(426, 'websocket');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ dev: null });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, message) {
    const state = ws.deserializeAttachment() || {};
    let msg;
    try { msg = JSON.parse(typeof message === 'string' ? message : ''); } catch { ws.close(4000, 'bad'); return; }
    if (!state.dev) {
      const dev = msg?.t === 'hello' && ID.test(msg.d || '') && str(msg.tok, 128) ? await this.check(msg.d, msg.tok) : null;
      if (!dev) { ws.close(4001, 'unauthorized'); return; }
      ws.serializeAttachment({ dev });
      const last = this.sql.exec('SELECT COALESCE(MAX(seq), 0) AS m FROM ops').one().m;
      ws.send(JSON.stringify({ t: 'ready', last }));
    }
  }
  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* closed */ } }
  webSocketError() { /* the client reconnects */ }
  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const dev = ws.deserializeAttachment()?.dev;
      if (!dev || dev === except) continue;
      try { ws.send(text); } catch { /* gone */ }
    }
  }

  // ---------- push notifications ----------
  async vapid() {
    const row = this.sql.exec("SELECT v FROM kv WHERE k = 'vapid'").toArray()[0];
    if (row) return JSON.parse(row.v);
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const v = { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    this.sql.exec("INSERT INTO kv (k, v) VALUES ('vapid', ?)", JSON.stringify(v));
    return v;
  }
  async subscribe(request, dev) {
    const body = await readJSON(request, 4096);
    const s = body.sub;
    if (!s || !str(s.endpoint, 1024) || !PUSH_HOSTS.test(s.endpoint) || !str(s.keys?.p256dh, 200) || !str(s.keys?.auth, 64)) return fail(400, 'bad sub');
    this.sql.exec('INSERT OR REPLACE INTO subs (dev, sub) VALUES (?, ?)', dev, JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }));
    return json({ ok: true });
  }
  async notify(to, payload, origin) {
    const v = await this.vapid();
    for (const dev of to) {
      const row = this.sql.exec('SELECT sub FROM subs WHERE dev = ?', String(dev)).toArray()[0];
      if (!row) continue;
      try {
        const status = await sendPush(JSON.parse(row.sub), payload, v, origin);
        if (status === 404 || status === 410) this.sql.exec('DELETE FROM subs WHERE dev = ?', String(dev));
      } catch (e) { console.error('push', e?.message); }
    }
  }
}

/**
 * Keeps the encrypted chunks of some of a space's photos and videos. Only the Space object talks
 * to it (it has no public route), and it never sees anything readable.
 */
export class MediaShard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS chunks (id TEXT NOT NULL, n INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, n))');
  }
  async fetch(request) {
    const [a, id, n] = new URL(request.url).pathname.slice(1).split('/');
    const m = request.method;
    try {
      if (a === 'put' && m === 'PUT') {
        const data = await request.arrayBuffer();
        // Leave a little room: SQLite needs space to finish a write.
        if ((this.sql.databaseSize || 0) + data.byteLength > SHARD_LIMIT - 8 * 1024 * 1024) return fail(507, 'storage_full');
        this.sql.exec('INSERT OR REPLACE INTO chunks (id, n, data) VALUES (?, ?, ?)', id, Number(n), data);
        return json({ ok: true });
      }
      if (a === 'get' && m === 'GET') {
        const row = this.sql.exec('SELECT data FROM chunks WHERE id = ? AND n = ?', id, Number(n)).toArray()[0];
        return row ? new Response(row.data, { headers: { 'content-type': 'application/octet-stream' } }) : fail(404, 'not_found');
      }
      if (a === 'drop' && m === 'DELETE') { this.sql.exec('DELETE FROM chunks WHERE id = ?', id); return json({ ok: true }); }
      if (a === 'size' && m === 'GET') return json({ bytes: this.sql.databaseSize || 0 });
      if (a === 'wipe' && m === 'POST') { await this.ctx.storage.deleteAll(); return json({ ok: true }); }
      return fail(404, 'not_found');
    } catch (e) {
      if (/SQLITE_FULL/.test(e?.message || '')) return fail(507, 'storage_full');
      console.error(e?.stack || e);
      return fail(500, 'server');
    }
  }
}

/**
 * Recovery slot: { c: encrypted join code, a: sha256 of the slot's auth }. Writing again needs the same
 * auth (only who knows the phrase or has the passkey); reading needs it too. Kept until replaced.
 */
export class Rescue extends DurableObject {
  async fetch(request) {
    const s = this.ctx.storage;
    const body = request.method === 'GET' ? null : await readJSON(request, 16384).catch(() => null);
    if (!body || !str(body.a, 128)) return fail(400, 'bad');
    const ah = await sha256(body.a);
    const saved = await s.get('slot');
    if (request.method === 'PUT') {
      if (!str(body.c, 8000)) return fail(400, 'bad');
      if (saved && saved.ah !== ah) return fail(403, 'taken');
      await s.put('slot', { c: body.c, ah, at: Date.now() });
      return json({ ok: true });
    }
    if (request.method === 'POST') { // read (POST so the auth never sits in a URL)
      return saved && saved.ah === ah ? json({ c: saved.c }) : fail(404, 'empty');
    }
    if (request.method === 'DELETE') {
      if (saved && saved.ah !== ah) return fail(403, 'taken');
      await s.deleteAll(); return json({ ok: true });
    }
    return fail(405, 'method');
  }
}

/** One-time mailbox used while pairing a new device that shows its own code (for example a PC). */
export class Mailbox extends DurableObject {
  async fetch(request) {
    const s = this.ctx.storage;
    if (request.method === 'POST') {
      const body = await readJSON(request, 8192).catch(() => null);
      if (!body || !str(body.c, 6000)) return fail(400, 'bad');
      if (await s.get('c')) return fail(409, 'used');
      await s.put('c', body.c);
      await s.setAlarm(Date.now() + INVITE_TTL);
      return json({ ok: true });
    }
    if (request.method === 'GET') {
      const c = await s.get('c');
      return c ? json({ c }) : fail(404, 'empty');
    }
    if (request.method === 'DELETE') { await s.deleteAll(); return json({ ok: true }); }
    return fail(405, 'method');
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
