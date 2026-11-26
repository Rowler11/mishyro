// Unit tests that need a real browser (IndexedDB, WebCrypto). Fictitious data only.
// Run with: BASE=http://127.0.0.1:8765/mishyro/ node tests/unit.cjs
import * as util from '../js/core/util.js';
import * as NEAR from '../js/features/cerca.js';
import * as db from '../js/core/db.js';
import * as cryptoBox from '../js/core/crypto.js';
import * as backup from '../js/core/backup.js';
import * as seed from '../js/core/seed.js';
import * as V from '../js/core/vault.js';
import * as T from '../js/core/temporadas.js';
import { titleLetters } from '../js/core/letters.js';
import { activeEvents, forStyle } from '../js/features/eventos.js';
import { coverScale, clampOffset } from '../js/core/cropper.js';
import { streakOf, rescueOf } from '../js/features/amor.js';
import * as LL from '../js/features/lenguajes.js';
import { ageText } from '../js/features/mascotas.js';
import { stageText, gap } from '../js/features/latido.js';
import { validState } from '../js/features/cupones.js';
import * as NOW from '../js/features/ahora.js';
import * as SLEEP from '../js/features/dormir.js';
import * as TC from '../js/features/capsula-tiempo.js';

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

// ---------- Rincón privado (Fase 6), fictitious texts ----------
await test('vault: active level is the lower one both accepted', () => {
  eq(V.activeLevel({ sofia: 3, david: 1 }), 1);
  eq(V.activeLevel({ sofia: 4, david: 4 }), 4);
  eq(V.activeLevel({ sofia: 2 }), 0, 'missing person counts as 0');
  eq(V.maxLevel({ levels: { sofia: 4, david: 4 }, own: { sofia: true, david: false } }), 4, 'level 5 needs both');
  eq(V.maxLevel({ levels: { sofia: 4, david: 4 }, own: { sofia: true, david: true } }), 5);
});
await test('vault: hard limits of either person filter by tag and word', () => {
  const m = V.mergeLimits({ sofia: { tags: ['t1'], words: [] }, david: { tags: [], words: ['Pálabra'] } });
  const items = [{ id: 'a', kind: 'reto', level: 1, text: 'Uno', tags: ['t1'] }, { id: 'b', kind: 'reto', level: 1, text: 'Con palabra', tags: [] }, { id: 'c', kind: 'reto', level: 1, text: 'Libre', tags: [] }];
  eq(V.pool(items, { kind: 'reto', merged: m }).map((i) => i.id), ['c']);
  eq(V.pool(items, { kind: 'reto', merged: m, band: [2, 3] }).length, 0, 'band');
  eq(V.pool(items, { kind: 'reto', never: ['c'] }).map((i) => i.id), ['a', 'b'], 'never again');
});
await test('vault: draws do not repeat until the pool is exhausted', () => {
  const list = [1, 2, 3, 4].map((n) => ({ id: `x${n}` }));
  let used = []; const seen = new Set();
  for (let i = 0; i < 4; i++) { const r = V.pickUnused(list, used); ok(!r.reset); seen.add(r.item.id); used = r.used; }
  eq(seen.size, 4);
  const r = V.pickUnused(list, used); ok(r.reset, 'reset after exhausting'); eq(r.used.length, 1);
});
await test('vault: parser accepts txt, csv and json and reports bad lines', () => {
  const t = V.parseContent('# c\nreto | 2 | Texto ficticio A | t1 | 30\nmalo | 1 | x\npregunta | 9 | x', 'a.txt');
  eq(t.count, 1); eq(t.pack.items[0].secs, 30); eq(t.pack.items[0].tags, ['t1']); eq(t.errorCount, 2);
  const c = V.parseContent('modo,nivel,texto\npreguntas,1,"Texto, ficticio B"', 'b.csv');
  eq(c.pack.items[0].kind, 'pregunta'); eq(c.pack.items[0].text, 'Texto, ficticio B');
  const j = V.parseContent(JSON.stringify([{ modo: 'idea', nivel: 0, texto: 'Ficticio C' }]), 'c.json');
  eq(j.pack.items[0].kind, 'idea');
  ok(!V.parseContent('{ roto', 'd.json').pack, 'broken json');
  ok(V.parseContent(JSON.stringify({ format: 'aishiteru-rincon-enc' }), 'e.json').encrypted, 'encrypted file detected');
});
await test('vault: generator makes many combinations and respects level and limits', () => {
  const gen = { templates: [{ id: 't', text: '{accion} {lugar} durante {duracion}' }], parts: {
    accion: [{ id: 'a1', text: 'a1', level: 0, tags: [] }, { id: 'a2', text: 'a2', level: 3, tags: ['t1'] }],
    lugar: [{ id: 'l1', text: 'l1', level: 0, tags: [] }, { id: 'l2', text: 'l2', level: 1, tags: [] }],
    duracion: [{ id: 'd1', text: 'd1', level: 0, tags: [], secs: 30 }] } };
  eq(V.generatorSize(gen, [0, 4]), 4); eq(V.generatorSize(gen, [0, 1]), 2);
  eq(V.generatorSize(gen, [0, 4], V.mergeLimits({ sofia: { tags: ['t1'] } })), 2);
  const g = V.generate(gen, { band: [0, 0] }); eq(g.item.text, 'A1 l1 durante d1'); eq(g.item.secs, 30);
});
await test('vault: only matches in yes or maybe are revealed', () => {
  eq(V.matches({ a: 'si', b: 'no', c: 'quiza', d: 'si' }, { a: 'si', b: 'si', c: 'si', d: 'no' }), [{ id: 'a', both: 'si' }, { id: 'c', both: 'quiza' }]);
});

// ---------- v0.16.0: pets come alive ----------
const K = await import('../js/core/kitty.js');
const G = await import('../js/features/gatitos.js');
await test('kitty: coat guessed from breed or color', () => {
  eq(K.guessCoat({ breed: 'Siamés' }), 'siames'); eq(K.guessCoat({ color: 'negro con manchas blancas' }), 'bicolor');
  eq(K.guessCoat({ color: 'Naranja' }), 'naranja'); eq(K.guessCoat({ color: 'tricolor' }), 'calico'); eq(K.guessCoat({}), 'atigrado');
  eq(K.coatId({ coat: 'gris', breed: 'Siamés' }), 'gris'); eq(K.coatId({ coat: 'inventado', color: 'blanco' }), 'blanco');
});
await test('gatitos: lines follow personality, favorites and special days', () => {
  const noon = new Date(2026, 10, 24, 13);
  const l = G.linesFor({ traits: ['Dormilona'], favorites: 'ratón de tela, cajas' }, noon);
  ok(l.includes('Zzz… cinco minutitos más.'), 'trait line'); ok(l.includes('¿Jugamos con ratón de tela?'), 'favorite line');
  ok(!l.some((x) => /Desayunamos/.test(x)), 'no morning line at noon');
  eq(G.linesFor({ birth: { y: 2026, m: 11, d: 24 } }, noon), ['¡Hoy es mi cumpleaños! ¿Me cantan?']);
  eq(G.favoriteOf({ favorites: 'cajas; sol' }), 'cajas');
});
await test('gatitos: care asks for due doses, medicines and refills, most urgent first', () => {
  const pet = { id: 'p' };
  const recs = [
    { id: 'a', petId: 'p', type: 'vaccine', date: '2026-01-01', data: { product: 'V1', next: '2026-11-20' } },
    { id: 'b', petId: 'p', type: 'deworm', date: '2026-10-01', data: { product: 'D1', next: '2026-11-27' } },
    { id: 'c', petId: 'p', type: 'deworm', date: '2026-10-01', data: { product: 'D2', next: '2027-01-27' } },
    { id: 'd', petId: 'p', type: 'medication', date: '2026-11-20', data: { name: 'M1', checks: {} } },
    { id: 'e', petId: 'p', type: 'supply', date: '2026-11-01', data: { item: 'Arena', lastsDays: 24 } },
    { id: 'f', petId: 'otra', type: 'vaccine', date: '2026-01-01', data: { product: 'X', next: '2026-01-02' } },
  ];
  const c = G.careFor(pet, recs, { today: '2026-11-24', hour: 10 });
  eq(c.map((x) => x.key.split(':')[0] + ':' + x.level), ['dose:0', 'med:1', 'dose:2', 'supply:2']);
  eq(G.careFor(pet, recs, { today: '2026-11-24', hour: 6 }).some((x) => x.key.startsWith('med')), false);
  eq(G.careFor({ id: 'p', memorial: {} }, recs, { today: '2026-11-24' }), []);
});
await test('gatitos: mimos add up per pet and person, only today', () => {
  const r = [
    { type: 'mimos', petId: 'p', date: '2026-11-24', by: 'david', data: { pet: 2, treat: 1, play: 0 } },
    { type: 'mimos', petId: 'p', date: '2026-11-24', by: 'sofia', data: { pet: 1, treat: 0, play: 1 } },
    { type: 'mimos', petId: 'p', date: '2026-11-23', by: 'sofia', data: { pet: 9 } },
  ];
  const m = G.mimosOf(r, '2026-11-24').p;
  eq([m.pet, m.treat, m.play, m.by.size], [3, 1, 1, 2]);
});

db.close();
await new Promise((res) => { const r = indexedDB.deleteDatabase(`${KEY}-db`); r.onsuccess = r.onerror = res; });
// ---------- v0.16.0: seasons, lunar festivals and styles ----------
await test('sekkiOn finds the solar term, across the new year and in the south', () => {
  eq(T.sekkiOn(new Date(2026, 10, 24)).name, 'Nieve menor');
  eq(T.sekkiOn(new Date(2026, 0, 3)).name, 'Solsticio de invierno');
  eq(T.sekkiOn(new Date(2026, 0, 3)).from.getFullYear(), 2025);
  eq(T.sekkiOn(new Date(2026, 0, 5)).name, 'Frío menor');
  eq(T.sekkiOn(new Date(2026, 11, 31)).to.getDate(), 4);
  eq(T.sekkiOn(new Date(2026, 10, 24), 'sur').name, 'Los granos se llenan');
  eq(T.SEKKI.length, 24);
  ok(T.SEKKI.every((s) => s[4].length === 2 && s[3]), 'every term has a line and two plans');
});
await test('festivalDate uses checked dates (Intl is a day off in 2027)', () => {
  eq(util.localDay(T.festivalDate('cny', 2027)), '2027-02-06');
  eq(util.localDay(T.festivalDate('faroles', 2027)), '2027-02-20');
  eq(util.localDay(T.festivalDate('qixi', 2026)), '2026-08-19');
  eq(util.localDay(T.festivalDate('luna', 2026)), '2026-09-25');
  ok(T.festivalDate('luna', 2040), 'falls back to Intl after the table');
});
await test('lunar events: Año Nuevo chino lasts its days, styles filter the list', () => {
  const evs = [{ id: 'a', name: 'Año Nuevo chino', rule: { type: 'lunar', key: 'cny', days: 7 }, style: 'cn' }, { id: 'b', name: 'Tsukimi', rule: { type: 'lunar', key: 'luna' }, style: 'jp' }, { id: 'c', name: 'X', rule: { type: 'fixed', month: 1, day: 1 } }];
  eq(activeEvents(evs, new Date(2027, 1, 12)).map((x) => x.event.id), ['a']);
  eq(activeEvents(evs, new Date(2027, 1, 13)).length, 0);
  eq(activeEvents(evs, new Date(2026, 8, 25)).map((x) => x.event.id), ['b']);
  eq(forStyle(evs, 'rojo').map((e) => e.id), ['a', 'c']);
  eq(forStyle(evs, 'jp').map((e) => e.id), ['b', 'c']);
});
await test('title letters follow the style', () => {
  eq(titleLetters('今', 'jp'), { text: '今', lang: 'ja' });
  eq(titleLetters('今', 'azul'), { text: '今天', lang: 'zh-Hans' });
  eq(titleLetters('手紙', 'rojo').text, '情书');
  eq(titleLetters('?', 'rojo').text, '?');
});

// ---------- v0.30.0 ----------
await test('cropper: cover zoom and offsets stay inside the frame', () => {
  eq(coverScale(1000, 500, 300, 300), 0.6);
  eq(clampOffset(500, -500, 1000, 500, 0.6, 300, 300), { x: 150, y: 0 });
  eq(clampOffset(10, 0, 1000, 500, 0.6, 300, 300), { x: 10, y: 0 });
});
await test('pets: only the year gives an approximate age', () => {
  const now = new Date(2026, 10, 25);
  eq(ageText({ y: 2023 }, now), 'Unos 3 años');
  eq(ageText({ y: 2025 }, now), 'Unos 1 año');
  eq(ageText({ y: 2026 }, now), 'Menos de 1 año');
  eq(ageText(null, now), null);
});
await test('latido: words grow at 5, 10 and 15', () => {
  eq(stageText(1, { to: 'Ana' }), 'Tu latido para Ana');
  eq(stageText(5, { to: 'Ana' }), 'Late fuerte por Ana');
  eq(stageText(10, {}), 'Tu corazón va a mil');
  eq(stageText(15, { from: 'Leo' }), '¡Explosión de amor de Leo!');
});
await test('latido: starts slow and speeds up', () => {
  eq(gap(1), 1200); eq(gap(14), 420);
  for (let n = 2; n <= 14; n++) ok(gap(n) <= gap(n - 1));
});
await test('racha: se pierde a las 24 h y se recupera hasta 3 días si los dos confirman', () => {
  const both = (day) => [{ day, by: 'sofia' }, { day, by: 'david' }];
  const list = [...both('2026-11-10'), ...both('2026-11-11')];
  eq(streakOf(list, '2026-11-12').current, 2);
  eq(streakOf(list, '2026-11-13').current, 0);
  const rc = rescueOf(list, [], '2026-11-13', 'sofia');
  ok(rc.possible && rc.missed === 1 && !rc.mine && !rc.theirs);
  ok(!rescueOf(list, [], '2026-11-16', 'sofia').possible);
  const one = [{ day: '2026-11-11', cday: '2026-11-13', by: 'sofia' }];
  eq(streakOf(list, '2026-11-13', one).current, 0);
  const two = [...one, { day: '2026-11-11', cday: '2026-11-13', by: 'david' }];
  eq(streakOf(list, '2026-11-13', two).current, 3);
  ok(rescueOf(list, one, '2026-11-13', 'sofia').mine);
});
await test('coupons: a stamp older than the coupon does not count', () => {
  const c = { createdAt: '2026-11-20T10:00:00.000Z' };
  ok(validState(c, { redeemedAt: '2026-11-21T10:00:00' }));
  ok(!validState(c, { redeemedAt: '2026-11-01T10:00:00' }));
  ok(!validState(c, {}));
});
await test('love languages: order, shares, fit and idea of the week', () => {
  const a = { palabras: 3, tiempo: 4, regalos: 0, actos: 1, contacto: 2 };
  const b = { palabras: 1, tiempo: 2, regalos: 1, actos: 2, contacto: 4 };
  eq(LL.order(a), ['tiempo', 'palabras', 'contacto', 'actos', 'regalos']);
  eq(LL.order(b).slice(0, 3), ['contacto', 'tiempo', 'actos']);
  eq(LL.shares(a).tiempo, 40);
  eq(LL.fit(a, a).kind, 'same');
  eq(LL.fit(a, b).kind, 'different');
  eq(LL.fit({ ...a, contacto: 3.5 }, { ...b, tiempo: 3 }).kind, 'close');
  const list = ['x', 'y', 'z'];
  eq(LL.weekPick(list, new Date(2026, 10, 23)), LL.weekPick(list, new Date(2026, 10, 29)));
  eq(LL.weekPick([], new Date()), null);
});

// ---------- v0.31.0 ----------
await test('ahora mismo: "hace X" and 24 hours', () => {
  const t = Date.parse('2026-11-25T12:00:00Z');
  eq(NOW.ago('2026-11-25T11:59:40Z', t), 'ahora');
  eq(NOW.ago('2026-11-25T11:48:00Z', t), 'hace 12 min');
  eq(NOW.ago('2026-11-25T09:00:00Z', t), 'hace 3 h');
  eq(NOW.ago('2026-11-23T12:00:00Z', t), 'hace 2 días');
  ok(NOW.fresh({ at: '2026-11-25T01:00:00Z' }, t));
  ok(!NOW.fresh({ at: '2026-11-24T11:00:00Z' }, t));
  ok(!NOW.fresh({ at: '2026-11-25T11:00:00Z', cleared: true }, t));
});
await test('dormir: hours across midnight and averages', () => {
  eq(SLEEP.minutesBetween('23:30', '07:00'), 450);
  eq(SLEEP.minutesBetween('01:00', '09:15'), 495);
  eq(SLEEP.minutesBetween('x', '07:00'), null);
  eq(SLEEP.fmtHours(450), '7 h 30 min');
  eq(SLEEP.fmtHours(480), '8 h');
  const s = SLEEP.summary([{ bed: '23:30', minutes: 450, quality: 4 }, { bed: '00:30', minutes: 390, quality: 3 }]);
  eq(s, { minutes: 420, quality: 3.5, bed: '00:00', nights: 2 });
  eq(SLEEP.summary([]), null);
});

await test('cápsula: "hace" text for the opening moment', () => {
  eq(TC.sinceText('2026-11-25T08:00:00Z', '2026-11-25'), 'hoy');
  eq(TC.sinceText('2026-11-24T08:00:00Z', '2026-11-25'), 'ayer');
  eq(TC.sinceText('2026-11-01T08:00:00Z', '2026-11-25'), 'hace 24 días');
  eq(TC.sinceText('2026-05-02T08:00:00Z', '2026-11-25'), 'hace 6 meses');
  eq(TC.sinceText('2025-05-02T08:00:00Z', '2026-11-25'), 'hace 1 año');
  eq(TC.sinceText('2023-01-02', '2026-11-25'), 'hace 3 años');
  eq(TC.sinceText(null, '2026-11-25'), '');
});

await test('distancia (v0.37.0): ~1 km grid, km between both, only when both are on', () => {
  eq(NEAR.roundNear(4.6534, -74.0612), { lat: 4.65, lng: -74.06 });
  eq(NEAR.roundNear(4.6551, -74.0649), { lat: 4.66, lng: -74.06 });
  const km = NEAR.kmBetween({ lat: 4.65, lng: -74.06 }, { lat: 4.71, lng: -74.03 });
  ok(km > 7 && km < 7.7, String(km));
  eq(NEAR.kmLabel(7.4), { big: '7 km', small: 'de distancia' });
  eq(NEAR.kmLabel(0.6).big, 'Juntitos');
  const on = (lat, lng) => ({ on: true, lat, lng });
  eq(NEAR.nearState(on(4.65, -74.06), on(4.65, -74.06), { phone: true }).kind, 'km');
  eq(NEAR.nearState(on(4.65, -74.06), { on: false }, { phone: true }).kind, 'waiting');
  eq(NEAR.nearState(null, on(1, 1), { phone: true }), { kind: 'invite', partnerOn: true });
  eq(NEAR.nearState(null, on(1, 1), { phone: false }), null);
  eq(NEAR.nearState({ on: false, lat: 1, lng: 1 }, on(1, 1), { phone: false }), null);
});

window.__results = results;
document.getElementById('out').textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n  ${r.error}`}`).join('\n');
