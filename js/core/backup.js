// Backup export/import (docs/08 §5-6). Format "aniversario-backup".
import * as db from './db.js';
import { nowISO, bufToB64, b64ToBuf } from './util.js';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';

export const FORMAT = 'aniversario-backup';
export const VAULT_FORMAT = 'aniversario-vault-backup';
const EXCLUDED = ['vault', 'errors', 'media', 'syncState', 'syncInbox', 'trash'];
const SPLIT_BYTES = 50 * 1024 * 1024;
// Sync keys and this device's pairing never go into a file (docs: Fase A).
const DEVICE_SETTINGS = ['sync', 'syncNotify'];
const portable = (name, r) => !(name === 'settings' && DEVICE_SETTINGS.includes(r.id));

/** Upgrades an older backup in memory. One function per schema version step. */
export const backupMigrations = {
  // 2: (b) => { ...transform b.stores from v1 to v2...; return b; }
};

const isPrivateRecord = (r) => r.private === true && r.visibility !== 'self';

/**
 * Build the backup object(s).
 * opts: { includePrivate, encryptPrivate, password, appVersion, split }
 * Returns { files: [{ name, data }], bytes }.
 */
export async function exportBackup({ includePrivate = false, encryptPrivate = true, password = '', appVersion = '0.0.0', split = 'auto' } = {}) {
  const exportedAt = nowISO();
  const stores = {}; const privateStores = {};
  const liveOwners = new Set();
  for (const name of db.STORE_NAMES) {
    if (EXCLUDED.includes(name)) continue;
    const all = (await db.rawAll(name)).filter((r) => portable(name, r));
    const pub = []; const priv = [];
    for (const r of all) {
      if (isPrivateRecord(r) && !r.enc) {
        if (!includePrivate) continue;
        (encryptPrivate ? priv : pub).push(r);
      } else if (isPrivateRecord(r) && r.enc && !includePrivate) {
        continue;
      } else pub.push(r);
      if (!r.deleted) liveOwners.add(`${name}:${r.id}`);
    }
    stores[name] = pub;
    if (priv.length) privateStores[name] = priv;
  }
  const media = [];
  for (const m of await db.rawAll('media')) {
    if (m.ownerStore === 'vault' || m.deleted) continue;
    if (m.ownerStore && !liveOwners.has(`${m.ownerStore}:${m.ownerId}`)) continue;
    const item = { ...m };
    if (m.blob) { item.data = bufToB64(await m.blob.arrayBuffer()); delete item.blob; }
    media.push(item);
  }
  const base = {
    format: FORMAT, schemaVersion: db.SCHEMA_VERSION, appVersion, exportedAt,
    device: /Android|Mobi/i.test(navigator.userAgent) ? 'android' : 'desktop',
    includesPrivate: includePrivate, privateEncrypted: includePrivate && encryptPrivate,
    stores, media: [], privateBlob: null,
  };
  if (Object.keys(privateStores).length) {
    if (!password) throw Object.assign(new Error('Backup password required'), { code: 'NEED_PASSWORD' });
    base.privateBlob = await encryptWithPassword(password, privateStores);
  }
  const mediaBytes = media.reduce((n, m) => n + (m.data?.length || 0), 0);
  const stamp = exportedAt.slice(0, 10);
  if (split === true || (split === 'auto' && mediaBytes > SPLIT_BYTES)) {
    const photos = { ...base, stores: {}, privateBlob: null, media, part: 'media' };
    return { bytes: mediaBytes, files: [
      { name: `aishiteru-copia-${stamp}-datos.json`, data: { ...base, part: 'data' } },
      { name: `aishiteru-copia-${stamp}-fotos.json`, data: photos },
    ] };
  }
  return { bytes: mediaBytes, files: [{ name: `aishiteru-copia-${stamp}.json`, data: { ...base, media } }] };
}

/** Validate structure and version. Returns { ok, error, backup } (backup migrated in memory). */
export function validateBackup(obj) {
  const fail = (error) => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('El archivo no es una copia de Aishiteru.');
  if (obj.format === VAULT_FORMAT) return fail('Esta es la copia del espacio privado; se restaura desde su propia sección.');
  if (obj.format !== FORMAT) return fail('El archivo no es una copia de Aishiteru.');
  if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) return fail('La copia no indica una versión válida.');
  if (obj.schemaVersion > db.SCHEMA_VERSION) return fail('La copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo.');
  if (!obj.stores || typeof obj.stores !== 'object') return fail('La copia está incompleta (faltan los datos).');
  if (obj.media && !Array.isArray(obj.media)) return fail('La copia tiene fotos con un formato inválido.');
  for (const [name, recs] of Object.entries(obj.stores)) {
    if (!db.STORE_NAMES.includes(name) || EXCLUDED.includes(name)) return fail(`La copia trae una sección desconocida: ${name}.`);
    if (!Array.isArray(recs)) return fail(`La sección ${name} de la copia está dañada.`);
    for (const r of recs) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return fail(`Un registro de ${name} no tiene identificador.`);
      if (name !== 'meta' && typeof r.updatedAt !== 'string') return fail(`Un registro de ${name} no tiene fecha de cambio.`);
    }
  }
  for (const m of obj.media || []) {
    if (!m || typeof m.id !== 'string' || (m.data != null && typeof m.data !== 'string')) return fail('Una foto de la copia está dañada.');
  }
  let backup = structuredClone(obj);
  for (let v = obj.schemaVersion + 1; v <= db.SCHEMA_VERSION; v++) {
    if (backupMigrations[v]) backup = backupMigrations[v](backup);
    backup.schemaVersion = v;
  }
  return { ok: true, backup };
}

/** Decrypt the private part into the stores (needs the backup password). */
export async function openPrivate(backup, password) {
  if (!backup.privateBlob) return backup;
  const priv = await decryptWithPassword(password, backup.privateBlob);
  const out = { ...backup, stores: { ...backup.stores }, privateBlob: null };
  for (const [name, recs] of Object.entries(priv)) out.stores[name] = [...(out.stores[name] || []), ...recs];
  return out;
}

const newer = (a, b) => String(a.updatedAt || '') > String(b.updatedAt || '');

/** Per-store summary of what an import would change. */
export async function summarize(backup, mode = 'merge') {
  const meta = await db.getMeta();
  const tomb = meta.tombstones || {};
  const res = {}; const total = { added: 0, updated: 0, deleted: 0, skipped: 0, removed: 0 };
  for (const name of db.STORE_NAMES) {
    if (EXCLUDED.includes(name) || name === 'meta') continue;
    const incoming = backup.stores[name] || [];
    const local = new Map((await db.rawAll(name)).map((r) => [r.id, r]));
    const s = { added: 0, updated: 0, deleted: 0, skipped: 0, removed: 0 };
    if (mode === 'replace') {
      s.removed = local.size;
      s.added = incoming.filter((r) => !r.deleted).length;
    } else {
      for (const r of incoming) {
        const l = local.get(r.id);
        if (!l) {
          if (tomb[`${name}:${r.id}`]) s.skipped++;
          else if (!r.deleted) s.added++;
        } else if (newer(r, l)) {
          if (r.deleted && !l.deleted) s.deleted++; else s.updated++;
        }
      }
    }
    if (s.added || s.updated || s.deleted || s.skipped || s.removed) res[name] = s;
    for (const k of Object.keys(total)) total[k] += s[k];
  }
  return { stores: res, total, media: (backup.media || []).length };
}

/** Apply a validated (and, if needed, opened) backup. mode: 'merge' | 'replace'. */
export async function applyBackup(backup, mode = 'merge') {
  const localMeta = await db.getMeta();
  const incomingMeta = (backup.stores.meta || []).find((m) => m.id === 'meta') || {};
  const tomb = { ...(incomingMeta.tombstones || {}), ...(localMeta.tombstones || {}) };
  const alive = new Set();

  for (const name of db.STORE_NAMES) {
    if (EXCLUDED.includes(name) || name === 'meta') continue;
    const incoming = (backup.stores[name] || []).filter((r) => portable(name, r));
    if (mode === 'replace') {
      if (name === 'settings') for (const r of await db.rawAll('settings')) if (!portable(name, r)) incoming.push(r);
      await db.rawPutMany(name, incoming, { clear: true });
      for (const r of incoming) if (!r.deleted) alive.add(`${name}:${r.id}`);
      continue;
    }
    const local = new Map((await db.rawAll(name)).map((r) => [r.id, r]));
    const write = [];
    for (const r of incoming) {
      const l = local.get(r.id);
      if (!l) { if (!tomb[`${name}:${r.id}`]) write.push(r); } else if (newer(r, l)) write.push(r);
    }
    if (write.length) await db.rawPutMany(name, write);
    for (const r of [...local.values(), ...write]) if (!r.deleted) alive.add(`${name}:${r.id}`);
  }

  if (mode === 'replace') {
    // Media of the vault is kept: the vault is only replaced by its own backup.
    for (const m of await db.rawAll('media')) if (m.ownerStore !== 'vault') await db.rawDelete('media', m.id);
  }
  const existing = new Set((await db.rawAll('media')).map((m) => m.id));
  const media = [];
  for (const m of backup.media || []) {
    if (existing.has(m.id)) continue;
    if (m.ownerStore && !alive.has(`${m.ownerStore}:${m.ownerId}`)) continue;
    const rec = { ...m };
    if (typeof m.data === 'string') { rec.blob = new Blob([b64ToBuf(m.data)], { type: m.mime || 'application/octet-stream' }); }
    delete rec.data;
    media.push(rec);
  }
  if (media.length) await db.rawPutMany('media', media);

  // Keep this device's own meta (install id, setup state, persistence); merge tombstones.
  await db.setMeta({ tombstones: tomb, lastImportAt: nowISO() });
  return { media: media.length };
}

/** Read a File into a parsed object (rejects non-JSON clearly). */
export async function readFile(file, maxBytes = 1024 * 1024 * 1024) {
  if (!file) throw new Error('No se eligió ningún archivo.');
  if (file.size > maxBytes) throw new Error('El archivo es demasiado grande.');
  try { return JSON.parse(await file.text()); } catch { throw new Error('El archivo no es un JSON válido o está dañado.'); }
}

/** Save an object as a .json file (File System Access API on desktop when available). */
export async function saveJSON(name, data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (window.showSaveFilePicker && !/Android|Mobi/i.test(navigator.userAgent)) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Copia de Aishiteru', accept: { 'application/json': ['.json'] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      return 'saved';
    } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
