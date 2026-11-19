// Unit tests that need a real browser (IndexedDB, WebCrypto). Fictitious data only.
// Run with: BASE=http://127.0.0.1:8765/mishyro/ node tests/unit.cjs
import * as util from '../js/core/util.js';
import * as db from '../js/core/db.js';
import * as cryptoBox from '../js/core/crypto.js';
import * as backup from '../js/core/backup.js';
import * as seed from '../js/core/seed.js';

const KEY = 'unittest';
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e?.stack || String(e) }); }
};
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const rejects = async (p, code) => { try { await p; } catch (e) { if (code && e.code !== code) throw new Error(`expected ${code}, got ${e.code || e.message}`); return; } throw new Error('expected rejection'); };
const fresh = async () => { db.close(); await db.open(KEY); await db.deleteDatabase(); await db.open(KEY); };
const rec = (over) => db.withDefaults({ title: 'Ejemplo', ...over }, over.origin || 'user');

// ---------- dates ----------
await test('parseDay accepts valid days and rejects impossible ones', () => {
  eq(util.parseDay('2025-03-14').getMonth(), 2);
  eq(util.parseDay('2026-02-30'), null);
  eq(util.parseDay('2026-5-2'), null);
  ok(util.isValidDay('2024-02-29'), 'leap day 2024');
  ok(!util.isValidDay('2025-02-29'), 'no leap day 2025');
});
await test('daysBetween counts calendar days', () => {
  eq(util.daysBetween(util.parseDay('2025-03-14'), util.parseDay('2026-03-14')), 365);
  eq(util.daysBetween(util.parseDay('2027-03-14'), util.parseDay('2028-03-14')), 366);
  eq(util.daysBetween(util.parseDay('2025-03-14'), util.parseDay('2025-03-13')), -1);
});
await test('ageOn respects the birthday', () => {
  const b = util.parseDay('2000-06-15');
  eq(util.ageOn(b, util.parseDay('2026-06-14')), 25);
  eq(util.ageOn(b, util.parseDay('2026-06-15')), 26);
});
await test('toLocalISO and localDay keep the local day', () => {
  const d = new Date(2025, 2, 14, 23, 30, 0);
  ok(/^2025-03-14T23:30:00[+-]\d{2}:\d{2}$/.test(util.toLocalISO(d)), util.toLocalISO(d));
  eq(util.localDay(d), '2025-03-14');
});

// ---------- crypto ----------
await test('PIN key: right PIN unlocks, wrong PIN fails, JSON round trip', async () => {
  const { record } = await cryptoBox.createKey('app', '4826');
  const box = await cryptoBox.encryptJSON('app', { secreto: 'texto ficticio' });
  ok(!JSON.stringify(box).includes('ficticio'), 'ciphertext leaks plaintext');
  cryptoBox.lock('app');
  ok(!cryptoBox.canOpen(box), 'locked box should not open');
  await rejects(cryptoBox.unlockWithPin('app', '0000', [record]), 'WRONG_PIN');
  await cryptoBox.unlockWithPin('app', '4826', [record]);
  eq(await cryptoBox.decryptJSON(box), { secreto: 'texto ficticio' });
  cryptoBox.lockAll();
});
await test('backup password round trip and wrong password', async () => {
  const box = await cryptoBox.encryptWithPassword('frase de prueba', { a: 1 });
  eq(await cryptoBox.decryptWithPassword('frase de prueba', box), { a: 1 });
  await rejects(cryptoBox.decryptWithPassword('otra', box));
});
await test('failed PIN delay grows and caps at 15 min', () => {
  eq([0, 1, 2].map(cryptoBox.nextDelayMs), [0, 0, 0]);
  eq(cryptoBox.nextDelayMs(3), 30000);
  eq(cryptoBox.nextDelayMs(4), 60000);
  eq(cryptoBox.nextDelayMs(30), 900000);
});

// ---------- backup ----------
const valid = (stores = {}) => ({ format: backup.FORMAT, schemaVersion: db.SCHEMA_VERSION, stores, media: [] });
await test('validateBackup rejects corrupt and foreign files', () => {
  ok(!backup.validateBackup(null).ok);
  ok(!backup.validateBackup([]).ok);
  ok(!backup.validateBackup({ format: 'otra-cosa' }).ok);
  ok(!backup.validateBackup({ ...valid(), stores: undefined }).ok, 'missing stores');
  ok(!backup.validateBackup(valid({ inventada: [] })).ok, 'unknown store');
  ok(!backup.validateBackup(valid({ memories: [{ title: 'sin id' }] })).ok, 'record without id');
  ok(!backup.validateBackup(valid({ memories: 'no es lista' })).ok, 'store not a list');
  ok(!backup.validateBackup(valid({ vault: [] })).ok, 'vault never in a normal backup');
  ok(backup.validateBackup(valid({ memories: [] })).ok, 'valid file');
});
await test('validateBackup rejects a file from a newer version', () => {
  const r = backup.validateBackup({ ...valid(), schemaVersion: db.SCHEMA_VERSION + 1 });
  ok(!r.ok); ok(/más nueva/.test(r.error), r.error);
});
await test('validateBackup rejects version 0 and never mutates the input', () => {
  // backupMigrations is empty while SCHEMA_VERSION is 1; the first real step (v2) gets its own test then.
  const file = valid({ memories: [{ id: 'm1', updatedAt: '2026-01-01T00:00:00-05:00', title: 'Ficticio' }] });
  ok(!backup.validateBackup({ ...file, schemaVersion: 0 }).ok, 'v0 rejected');
  const r = backup.validateBackup(file);
  ok(r.ok); ok(r.backup !== file && r.backup.stores !== file.stores, 'works on a copy');
});
await test('IndexedDB upgrade to a new version keeps the data (v1 -> v2)', async () => {
  await fresh();
  await db.rawPut('memories', rec({ id: 'm-upg', title: 'Recuerdo ficticio' }));
  db.close();
  await new Promise((res, rej) => {
    const r = indexedDB.open(`${KEY}-db`, db.SCHEMA_VERSION + 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('futureStore', { keyPath: 'id' }); };
    r.onsuccess = () => { r.result.close(); res(); };
    r.onerror = () => rej(r.error);
  });
  await db.open(KEY, db.SCHEMA_VERSION + 1);
  eq((await db.rawGet('memories', 'm-upg')).title, 'Recuerdo ficticio');
  db.close();
  await new Promise((res) => { const r = indexedDB.deleteDatabase(`${KEY}-db`); r.onsuccess = r.onerror = res; });
  await db.open(KEY);
});
await test('merge: newer wins, older is ignored, tombstones block resurrection', async () => {
  await fresh();
  await db.rawPut('memories', rec({ id: 'a', title: 'local nuevo', updatedAt: '2026-03-01T00:00:00-05:00' }));
  await db.rawPut('memories', rec({ id: 'b', title: 'local viejo', updatedAt: '2026-01-01T00:00:00-05:00' }));
  await db.setMeta({ tombstones: { 'memories:c': '2026-02-01T00:00:00-05:00' } });
  const incoming = valid({ memories: [
    rec({ id: 'a', title: 'copia vieja', updatedAt: '2026-02-01T00:00:00-05:00' }),
    rec({ id: 'b', title: 'copia nueva', updatedAt: '2026-02-01T00:00:00-05:00' }),
    rec({ id: 'c', title: 'borrado', updatedAt: '2026-01-15T00:00:00-05:00' }),
    rec({ id: 'd', title: 'nuevo', updatedAt: '2026-01-15T00:00:00-05:00' }),
  ] });
  const v = backup.validateBackup(incoming); ok(v.ok, v.error);
  const s = await backup.summarize(v.backup, 'merge');
  eq(s.stores.memories, { added: 1, updated: 1, deleted: 0, skipped: 1, removed: 0 });
  await backup.applyBackup(v.backup, 'merge');
  eq((await db.rawGet('memories', 'a')).title, 'local nuevo');
  eq((await db.rawGet('memories', 'b')).title, 'copia nueva');
  eq(await db.rawGet('memories', 'c'), undefined);
  eq((await db.rawGet('memories', 'd')).title, 'nuevo');
});
await test('replace: clears local data and keeps this device meta', async () => {
  await fresh();
  await db.setMeta({ installId: 'device-1', setupDone: true });
  await db.rawPut('memories', rec({ id: 'local', title: 'solo local' }));
  const v = backup.validateBackup(valid({ memories: [rec({ id: 'x', title: 'de la copia' })], meta: [{ id: 'meta', installId: 'device-2' }] }));
  await backup.applyBackup(v.backup, 'replace');
  eq((await db.rawAll('memories')).map((r) => r.id), ['x']);
  eq((await db.getMeta()).installId, 'device-1');
});
await test('export -> import round trip, private part encrypted', async () => {
  await fresh();
  await db.rawPut('memories', rec({ id: 'pub', title: 'público' }));
  await db.rawPut('memories', rec({ id: 'priv', title: 'privado ficticio', private: true }));
  await rejects(backup.exportBackup({ includePrivate: true }), 'NEED_PASSWORD');
  const { files } = await backup.exportBackup({ includePrivate: true, password: 'clave de prueba' });
  const file = JSON.parse(JSON.stringify(files[0].data));
  ok(!JSON.stringify(file).includes('privado ficticio'), 'private text in clear');
  await fresh();
  const v = backup.validateBackup(file); ok(v.ok, v.error);
  await backup.applyBackup(await backup.openPrivate(v.backup, 'clave de prueba'), 'merge');
  eq((await db.rawGet('memories', 'priv')).title, 'privado ficticio');
  eq((await db.rawGet('memories', 'pub')).title, 'público');
});

// ---------- seed / CONFIG ----------
const CONFIG = { thinkingOfYouPhrases: [{ id: 'cfg:p1', text: 'Frase A' }, { id: 'cfg:p2', text: 'Frase B' }], milestones: [] };
await test('syncConfig inserts, updates untouched, never overwrites user edits', async () => {
  await fresh();
  await seed.syncConfig(CONFIG);
  eq((await db.rawGet('content', 'cfg:p1')).text, 'Frase A');
  await db.put('content', { ...(await db.rawGet('content', 'cfg:p1')), text: 'Editada por ella' });
  ok((await db.rawGet('content', 'cfg:p1')).userEdited, 'marked as edited');
  const next = { ...CONFIG, thinkingOfYouPhrases: [{ id: 'cfg:p1', text: 'Frase A v2' }, { id: 'cfg:p2', text: 'Frase B v2' }] };
  const r = await seed.syncConfig(next);
  eq((await db.rawGet('content', 'cfg:p1')).text, 'Editada por ella');
  eq((await db.rawGet('content', 'cfg:p2')).text, 'Frase B v2');
  eq(r.content.skipped, 1);
  await seed.syncConfig(next);
  eq((await db.rawAll('content')).filter((x) => x.id.startsWith('cfg:')).length, 2, 'no duplicates');
});
await test('syncConfig does not bring back deleted or purged items', async () => {
  await fresh();
  await seed.syncConfig(CONFIG);
  await db.softDelete('content', 'cfg:p1');
  await db.purge('content', 'cfg:p2');
  await seed.syncConfig(CONFIG);
  ok((await db.rawGet('content', 'cfg:p1')).deleted, 'still deleted');
  eq(await db.rawGet('content', 'cfg:p2'), undefined);
});
await test('validateSeed catches the usual mistakes', () => {
  const good = { schemaVersion: 1, partnerShortName: 'Ana', authorShortName: 'Leo', startDate: '2024-01-10',
    reasons: [{ id: 'seed:r1', text: 'Razón ficticia' }], specialDates: [{ id: 'seed:d1', title: 'Día', date: '2024-03-05' }] };
  ok(seed.validateSeed(good).ok, JSON.stringify(seed.validateSeed(good).errors));
  ok(!seed.validateSeed(null).ok);
  ok(!seed.validateSeed({ ...good, schemaVersion: 2 }).ok, 'version');
  ok(!seed.validateSeed({ ...good, partnerShortName: 'POR COMPLETAR' }).ok, 'placeholder name');
  ok(!seed.validateSeed({ ...good, startDate: '2999-01-01' }).ok, 'future start');
  ok(!seed.validateSeed({ ...good, reasons: [{ id: 'r1', text: 'x' }] }).ok, 'id prefix');
  ok(!seed.validateSeed({ ...good, reasons: [{ id: 'seed:r1', text: 'x' }, { id: 'seed:r1', text: 'y' }] }).ok, 'duplicate id');
  ok(!seed.validateSeed({ ...good, specialDates: [{ id: 'seed:d1', title: 'Día', date: '2024-02-30' }] }).ok, 'bad date');
  ok(seed.validateSeed({ ...good, specialDates: [{ id: 'seed:d1', title: 'Día', date: 'POR COMPLETAR' }] }).ok, 'pending date allowed');
});
await test('needsCompletion detects placeholders', () => {
  ok(seed.needsCompletion('Hola [completa: algo]'));
  ok(seed.needsCompletion('[POR COMPLETAR]'));
  ok(!seed.needsCompletion('Texto listo'));
});

db.close();
await new Promise((res) => { const r = indexedDB.deleteDatabase(`${KEY}-db`); r.onsuccess = r.onerror = res; });
window.__results = results;
document.getElementById('out').textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n  ${r.error}`}`).join('\n');
