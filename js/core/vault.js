// Rincón privado (docs/05 §33): data layer of the private corner.
// - Everything lives in the "vault" store, which db.js always encrypts with the "vault" key
//   (AES-GCM, PBKDF2 600k from a 6-digit PIN). Nothing of it reaches the general backup, the
//   search, badges, the summary, the share sheet, .ics files or the service worker.
// - Content (questions, challenges, ideas) is never in the repository: it arrives as "packs"
//   the couple imports (.txt, .csv, .json or the encrypted file of tools/encrypt-content.html).
// - Records: v:settings (shared), v:state (draws without repetition), v:pack:<id> (content),
//   v:log:<id> (diary), v:ynm:<person> (yes/no/maybe answers), v:rec:<id> (recordings, local only).
import * as db from './db.js';
import * as cryptoBox from './crypto.js';
import * as security from './security.js';
import * as sync from './sync.js';
import { nowISO, uuid, bufToB64, b64ToBuf } from './util.js';

export const SCOPE = 'vault';
export const STORE = 'vault';
export const PIN_DIGITS = 6;
export const BACKUP_FORMAT = 'aniversario-vault-backup';
export const ENC_FORMAT = 'aishiteru-rincon-enc';
export const PACK_FORMAT = 'aishiteru-rincon';
export const MAX_TEXT = 600;
export const MAX_LEVEL = 5;

// Item kinds of a pack. Labels are interface words only; texts always come from the packs.
export const KINDS = {
  pregunta: 'Pregunta', reto: 'Reto', sintocar: 'Sin tocar', mimos: 'Mimos y masaje', hablemos: 'Hablemos',
  rol: 'Rol de cita', prenda: 'Prenda', idea: 'Idea (sí, no o quizá)', cita: 'Cita en casa',
};
const KIND_ALIAS = {
  pregunta: 'pregunta', preguntas: 'pregunta', verdad: 'pregunta', question: 'pregunta',
  reto: 'reto', retos: 'reto', challenge: 'reto',
  sintocar: 'sintocar', 'sin tocar': 'sintocar', 'sin-tocar': 'sintocar',
  mimos: 'mimos', masaje: 'mimos', masajes: 'mimos', 'masaje y mimos': 'mimos',
  hablemos: 'hablemos', comunicacion: 'hablemos', 'comunicación': 'hablemos',
  rol: 'rol', 'rol de citas': 'rol', roles: 'rol',
  prenda: 'prenda', prendas: 'prenda',
  idea: 'idea', ideas: 'idea', 'si-no-quiza': 'idea', 'sí, no o quizá': 'idea', sinoquiza: 'idea', 'si no quiza': 'idea',
  cita: 'cita', citas: 'cita', 'cita tematica': 'cita', 'cita temática': 'cita',
};
const DICE_FACES = ['accion', 'lugar', 'estilo'];
const GEN_PARTS = ['accion', 'ritmo', 'lugar', 'ambiente', 'duracion'];

// ---------- pure helpers (unit-tested) ----------
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
export const normKind = (k) => KIND_ALIAS[fold(k).replace(/_/g, ' ')] || KIND_ALIAS[String(k || '').trim().toLowerCase()] || null;

/** The highest level both accepted: the game only uses levels accepted by both (docs/05 §33 b). */
export function activeLevel(levels = {}, people = ['sofia', 'david']) {
  const vals = people.map((p) => Number.isInteger(levels[p]) ? levels[p] : 0);
  return Math.max(0, Math.min(MAX_LEVEL, ...vals));
}

/** Levels a deck draws from: with ramp it climbs one level per stretch; otherwise the top two. */
export function levelBand(max, { ramp = false, step = 0 } = {}) {
  if (max <= 0) return [0, 0];
  if (ramp) { const start = max >= 2 ? 1 : 0; const l = Math.min(max, start + step); return [l, l]; }
  return [Math.max(0, max - 1), max];
}

/** Hard limits of both people merged: tags and words (folded). */
export function mergeLimits(limits = {}) {
  const tags = new Set(); const words = new Set();
  for (const l of Object.values(limits || {})) {
    for (const t of l?.tags || []) tags.add(String(t));
    for (const w of l?.words || []) { const f = fold(w); if (f.length >= 3) words.add(f); }
  }
  return { tags, words };
}

/** Does an item (or a generator part) pass the hard limits? */
export function passesLimits(item, merged) {
  if (!merged) return true;
  if ((item.tags || []).some((t) => merged.tags.has(t))) return false;
  if (merged.words.size) { const t = fold(`${item.text || ''} ${item.title || ''} ${(item.steps || []).join(' ')}`); for (const w of merged.words) if (t.includes(w)) return false; }
  return true;
}

/** Items of a kind that fit a level band, the limits and the never-again list. */
export function pool(items, { kind, band = [0, MAX_LEVEL], merged, never = [], deck = '', favorites = null } = {}) {
  const nv = new Set(never);
  return items.filter((i) => (!kind || (Array.isArray(kind) ? kind.includes(i.kind) : i.kind === kind))
    && i.level >= band[0] && i.level <= band[1]
    && !nv.has(i.id) && passesLimits(i, merged)
    && (!deck || i.deck === deck)
    && (!favorites || favorites.includes(i.id)));
}

/** Pick an unused item; when the pool is exhausted, start it again. Returns { item, used, reset }. */
export function pickUnused(list, used = [], rnd = Math.random) {
  if (!list.length) return { item: null, used, reset: false };
  const u = new Set(used);
  let fresh = list.filter((i) => !u.has(i.id));
  let reset = false;
  let nextUsed = used.slice();
  if (!fresh.length) { reset = true; const ids = new Set(list.map((i) => i.id)); nextUsed = used.filter((x) => !ids.has(x)); fresh = list; }
  const item = fresh[Math.floor(rnd() * fresh.length)];
  nextUsed.push(item.id);
  return { item, used: nextUsed.slice(-4000), reset };
}

/** How many different results the generator can give for a level band. */
export function generatorSize(gen, band, merged) {
  if (!gen?.templates?.length) return 0;
  const parts = Object.fromEntries(GEN_PARTS.map((p) => [p, (gen.parts?.[p] || []).filter((x) => x.level >= 0 && x.level <= band[1] && passesLimits(x, merged)).length]));
  let total = 0;
  for (const t of gen.templates) {
    if (t.level != null && t.level > band[1]) continue;
    const need = GEN_PARTS.filter((p) => t.text.includes(`{${p}}`));
    total += need.reduce((n, p) => n * parts[p], 1);
  }
  return total;
}

/**
 * Combinatorial generator: a template with {accion} {ritmo} {lugar} {ambiente} {duracion},
 * filled with parts that fit the level and limits. Avoids combinations already used.
 * Returns { item, key } or null.
 */
export function generate(gen, { band = [0, MAX_LEVEL], merged, usedKeys = [], rnd = Math.random, tries = 40 } = {}) {
  if (!gen?.templates?.length) return null;
  const used = new Set(usedKeys);
  const parts = Object.fromEntries(GEN_PARTS.map((p) => [p, (gen.parts?.[p] || []).filter((x) => x.level <= band[1] && passesLimits(x, merged))]));
  const templates = gen.templates.filter((t) => (t.level == null || t.level <= band[1]) && GEN_PARTS.every((p) => !t.text.includes(`{${p}}`) || parts[p].length));
  if (!templates.length) return null;
  let best = null;
  for (let k = 0; k < tries; k++) {
    const t = templates[Math.floor(rnd() * templates.length)];
    const chosen = {};
    for (const p of GEN_PARTS) if (t.text.includes(`{${p}}`)) chosen[p] = parts[p][Math.floor(rnd() * parts[p].length)];
    const lv = Math.max(t.level || 0, ...Object.values(chosen).map((c) => c.level || 0));
    if (lv < band[0] && k < tries - 1) continue;
    const key = [t.id, ...GEN_PARTS.map((p) => chosen[p]?.id || '')].join('|');
    const text = t.text.replace(/\{(\w+)\}/g, (_, p) => chosen[p]?.text || '');
    best = { item: { id: `gen:${key}`, kind: 'reto', level: lv, text: text.charAt(0).toUpperCase() + text.slice(1), tags: [...new Set(Object.values(chosen).flatMap((c) => c.tags || []))], secs: chosen.duracion?.secs || t.secs || 0, generated: true }, key };
    if (!used.has(key)) return best;
  }
  return best;
}

// ---------- import: .txt, .csv, .json (docs/05 §33 h0) ----------
function parseCSVLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const toTags = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((t) => fold(t).replace(/\s+/g, '-')).filter(Boolean).slice(0, 12);

/** Normalize one raw item. Returns { item } or { error }. */
export function normItem(raw, n = 0) {
  const kind = normKind(raw.kind ?? raw.mode ?? raw.modo ?? raw.tipo);
  const level = Number(raw.level ?? raw.nivel);
  const text = String(raw.text ?? raw.texto ?? '').trim();
  const where = n ? `Línea ${n}: ` : '';
  if (!kind) return { error: `${where}el modo "${raw.kind ?? raw.mode ?? raw.modo ?? ''}" no existe. Usa: ${Object.keys(KINDS).join(', ')}.` };
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return { error: `${where}el nivel debe ser un número del 0 al 5.` };
  const steps = Array.isArray(raw.steps ?? raw.pasos) ? (raw.steps ?? raw.pasos).map((s) => String(s).trim()).filter(Boolean)
    : kind === 'cita' && text.includes(' / ') ? text.split(' / ').map((s) => s.trim()).filter(Boolean) : [];
  const title = String(raw.title ?? raw.titulo ?? raw['título'] ?? (kind === 'cita' && steps.length ? steps[0] : '')).trim().slice(0, 120);
  if (!text && !steps.length) return { error: `${where}falta el texto.` };
  if (text.length > MAX_TEXT) return { error: `${where}el texto es muy largo (máximo ${MAX_TEXT} letras).` };
  const secs = Math.max(0, Math.min(3600, Math.round(Number(raw.secs ?? raw.segundos ?? 0)) || 0));
  const item = { id: String(raw.id || '').slice(0, 64) || '', kind, level, text: kind === 'cita' && steps.length && text.includes(' / ') ? '' : text, tags: toTags(raw.tags ?? raw.etiquetas), secs };
  if (title) item.title = title;
  if (steps.length) item.steps = (kind === 'cita' && text.includes(' / ') ? steps.slice(1) : steps).slice(0, 20);
  if (raw.deck ?? raw.mazo) item.deck = fold(raw.deck ?? raw.mazo).replace(/\s+/g, '-').slice(0, 40);
  for (const k of ['setting', 'music', 'ambiente', 'musica', 'roles']) if (raw[k]) item[{ ambiente: 'setting', musica: 'music' }[k] || k] = String(raw[k]).slice(0, 300);
  return { item };
}

function normPart(raw, prefix, i) {
  const text = String(raw.text ?? raw.texto ?? raw ?? '').trim();
  const level = Number(raw.level ?? raw.nivel ?? 0);
  if (!text || text.length > 200 || !Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return null;
  return { id: String(raw.id || `${prefix}${i + 1}`).slice(0, 40), text, level, tags: toTags(raw.tags ?? raw.etiquetas), ...(raw.secs ? { secs: Math.max(0, Math.min(3600, Number(raw.secs) || 0)) } : {}) };
}

/** Stable short id for an item without one (same text, same id: importing twice does not duplicate). */
export function itemId(item) {
  let h = 2166136261;
  for (const ch of `${item.kind}|${item.level}|${item.text}|${item.title || ''}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return `i${(h >>> 0).toString(36)}`;
}

/**
 * Parse a file the couple prepared. Returns { pack, errors, count } where pack has
 * { items, dice?, gen?, decks?, tags?, name? }. Invalid lines are listed in errors.
 */
export function parseContent(text, filename = '') {
  const errors = []; const items = [];
  const name = filename.replace(/\.[^.]+$/, '');
  const src = String(text || '').replace(/^﻿/, '');
  const ext = (/\.([a-z]+)$/i.exec(filename)?.[1] || '').toLowerCase();
  const isJSON = ext === 'json' || /^\s*[[{]/.test(src);
  const pack = { name: name || 'Contenido propio', items };
  if (isJSON) {
    let obj;
    try { obj = JSON.parse(src); } catch { return { pack: null, errors: ['El archivo .json no se pudo leer: revisa comas y comillas.'], count: 0 }; }
    if (obj?.format === ENC_FORMAT) return { pack: null, errors: [], count: 0, encrypted: obj };
    const list = Array.isArray(obj) ? obj : obj.items || [];
    if (!Array.isArray(list)) return { pack: null, errors: ['No encontré la lista de "items".'], count: 0 };
    list.forEach((raw, i) => { const r = normItem(raw || {}, i + 1); if (r.error) errors.push(r.error.replace(/^Línea/, 'Elemento')); else items.push(r.item); });
    if (!Array.isArray(obj) && obj.name) pack.name = String(obj.name).slice(0, 60);
    if (obj.dice) {
      pack.dice = {};
      for (const f of DICE_FACES) pack.dice[f] = (obj.dice[f] || []).map((x, i) => normPart(x, `d${f[0]}`, i)).filter(Boolean);
      if (!DICE_FACES.every((f) => pack.dice[f].length >= 2)) { errors.push('Los dados necesitan al menos 2 caras de acción, lugar y estilo.'); delete pack.dice; }
    }
    if (obj.generator || obj.gen) {
      const g = obj.generator || obj.gen;
      const templates = (g.templates || []).map((t, i) => (typeof t === 'string' ? { id: `t${i + 1}`, text: t } : { id: String(t.id || `t${i + 1}`), text: String(t.text || ''), ...(Number.isInteger(t.level) ? { level: t.level } : {}) })).filter((t) => t.text && /\{\w+\}/.test(t.text));
      const parts = {};
      for (const p of GEN_PARTS) parts[p] = (g.parts?.[p] || g[p] || []).map((x, i) => normPart(x, `${p[0]}${p[1]}`, i)).filter(Boolean);
      if (templates.length) pack.gen = { templates, parts }; else errors.push('El generador no tiene plantillas válidas.');
    }
    if (Array.isArray(obj.decks)) pack.decks = obj.decks.map((d) => ({ id: fold(d.id || d.label).replace(/\s+/g, '-').slice(0, 40), label: String(d.label || d.id).slice(0, 40) })).filter((d) => d.id);
    if (Array.isArray(obj.tags)) pack.tags = obj.tags.map((t) => ({ id: fold(t.id || t.label).replace(/\s+/g, '-').slice(0, 40), label: String(t.label || t.id).slice(0, 40) })).filter((t) => t.id);
  } else {
    const lines = src.split(/\r?\n/);
    const isCSV = ext === 'csv' || (!src.includes('|') && /,|;/.test(lines.find((l) => l.trim()) || ''));
    const sep = isCSV ? ((lines.find((l) => l.trim()) || '').split(';').length > (lines.find((l) => l.trim()) || '').split(',').length ? ';' : ',') : '|';
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const cols = isCSV ? parseCSVLine(t, sep) : t.split('|').map((s) => s.trim());
      if (i === lines.findIndex((l) => l.trim()) && /^(modo|mode|tipo)$/i.test(fold(cols[0]))) return; // header
      if (cols.length < 3) { errors.push(`Línea ${i + 1}: usa el formato modo ${isCSV ? sep : '|'} nivel ${isCSV ? sep : '|'} texto.`); return; }
      const [modo, nivel, texto, etiquetas, segundos] = cols;
      const r = normItem({ modo, nivel: nivel === '' ? NaN : Number(nivel), texto, etiquetas, segundos }, i + 1);
      if (r.error) errors.push(r.error); else items.push(r.item);
    });
  }
  const seen = new Set();
  for (const it of items) { if (!it.id || seen.has(it.id)) it.id = itemId(it); seen.add(it.id); }
  const count = items.length + (pack.dice ? DICE_FACES.reduce((n, f) => n + pack.dice[f].length, 0) : 0)
    + (pack.gen ? pack.gen.templates.length + GEN_PARTS.reduce((n, p) => n + pack.gen.parts[p].length, 0) : 0);
  if (!count && !errors.length) errors.push('El archivo no tiene elementos.');
  return { pack: count ? pack : null, errors: errors.slice(0, 50), errorCount: errors.length, count };
}

/** Summary of a pack: items per kind and per level. */
export function summarize(pack) {
  const byKind = {}; const byLevel = [0, 0, 0, 0, 0, 0];
  for (const i of pack?.items || []) { byKind[i.kind] = (byKind[i.kind] || 0) + 1; byLevel[i.level]++; }
  return { byKind, byLevel, items: pack?.items?.length || 0, dice: !!pack?.dice, gen: !!pack?.gen };
}

/** Decrypt the file of tools/encrypt-content.html with its phrase (throws on a wrong phrase). */
export async function decryptFile(obj, phrase) {
  return cryptoBox.decryptWithPassword(phrase, obj);
}

// ---------- records ----------
export const ready = () => security.hasKey(SCOPE) && security.isUnlocked(SCOPE);
const rec = (id) => db.get(STORE, id).catch(() => null);
const save = (r) => db.put(STORE, { owner: 'both', visibility: 'shared', ...r }, { userEdit: false });

export const SETTINGS_DEFAULTS = {
  levels: { sofia: 0, david: 0 }, own: { sofia: false, david: false },
  limits: { sofia: { tags: [], words: [] }, david: { tags: [], words: [] } },
  restEvery: 6, ramp: true, chainLength: 5, prendasRounds: 8,
  recMaxAudioSec: 300, recMaxVideoSec: 60, recMaxMB: 80, consentDays: [],
};
export async function getSettings() {
  const s = await rec('v:settings');
  const out = { ...SETTINGS_DEFAULTS, ...(s || {}) };
  out.levels = { ...SETTINGS_DEFAULTS.levels, ...(s?.levels || {}) };
  out.own = { ...SETTINGS_DEFAULTS.own, ...(s?.own || {}) };
  out.limits = { sofia: { tags: [], words: [], ...(s?.limits?.sofia || {}) }, david: { tags: [], words: [], ...(s?.limits?.david || {}) } };
  return out;
}
export async function setSettings(patch) {
  const cur = await getSettings();
  await save({ ...cur, ...patch, id: 'v:settings' });
}
/** Accepted level of a person, counting "contenido propio" (5) only when they turned it on. */
export function personLevel(s, p) { return s.own?.[p] && s.levels?.[p] >= 4 ? 5 : Math.min(4, s.levels?.[p] ?? 0); }
export const maxLevel = (s) => activeLevel({ sofia: personLevel(s, 'sofia'), david: personLevel(s, 'david') });

export async function getState() {
  return (await rec('v:state')) || { id: 'v:state', used: {}, fav: [], never: [], combos: [] };
}
export const setState = (st) => save({ ...st, id: 'v:state' });

export async function packs() {
  return (await db.query(STORE).catch(() => [])).filter((r) => r.id.startsWith('v:pack:') && !r.deleted)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}
export async function addPack(pack, origin = 'import') {
  const id = `v:pack:${uuid()}`;
  await save({ ...pack, id, origin, importedAt: nowISO(), by: pack.by || '' });
  return id;
}
export const deletePack = (id) => db.purge(STORE, id);

/** One manual item goes to the "Escritas aquí" pack. */
export async function addManualItem(item) {
  const all = await packs();
  const p = all.find((x) => x.origin === 'manual') || { id: 'v:pack:manual', origin: 'manual', name: 'Escritas aquí', items: [] };
  const it = { ...item, id: '' }; it.id = itemId(it);
  if (!p.items.some((x) => x.id === it.id)) p.items = [...p.items, it];
  await save(p);
  return it.id;
}
export async function removeItem(packId, itemId_) {
  const p = await rec(packId);
  if (!p) return;
  await save({ ...p, items: (p.items || []).filter((i) => i.id !== itemId_) });
}

/** Everything the decks can draw from, merged (later packs win on the same id). */
export async function library() {
  const all = await packs();
  const items = new Map(); const dice = { accion: [], lugar: [], estilo: [] }; const gen = { templates: [], parts: Object.fromEntries(GEN_PARTS.map((p) => [p, []])) };
  const decks = new Map(); const tags = new Map();
  for (const p of all) {
    for (const i of p.items || []) items.set(i.id, { ...i, pack: p.id });
    if (p.dice) for (const f of DICE_FACES) dice[f].push(...(p.dice[f] || []).map((x) => ({ ...x, id: `${p.id}:${x.id}` })));
    if (p.gen) {
      gen.templates.push(...p.gen.templates.map((t) => ({ ...t, id: `${p.id.slice(-6)}${t.id}` })));
      for (const k of GEN_PARTS) gen.parts[k].push(...(p.gen.parts?.[k] || []).map((x) => ({ ...x, id: `${p.id.slice(-6)}${x.id}` })));
    }
    for (const d of p.decks || []) decks.set(d.id, d);
    for (const t of p.tags || []) tags.set(t.id, t);
  }
  return { items: [...items.values()], dice, gen, decks: [...decks.values()], tags: [...tags.values()], packs: all };
}

// ---------- diary ----------
export async function logs() {
  return (await db.query(STORE).catch(() => [])).filter((r) => r.id.startsWith('v:log:') && !r.deleted)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export const saveLog = (entry) => save({ ...entry, id: entry.id || `v:log:${uuid()}` });
export const deleteLog = (id) => db.purge(STORE, id);

// ---------- yes / no / maybe ----------
export async function ynm(person) { return (await rec(`v:ynm:${person}`)) || { id: `v:ynm:${person}`, person, answers: {}, done: false }; }
export const saveYnm = (r) => save({ ...r, id: `v:ynm:${r.person}` });
/** Only what both marked "sí" or "quizá" shows; a "no" is never revealed. */
export function matches(a = {}, b = {}) {
  const out = [];
  for (const [id, x] of Object.entries(a)) {
    const y = b[id];
    if ((x === 'si' || x === 'quiza') && (y === 'si' || y === 'quiza')) out.push({ id, both: x === 'si' && y === 'si' ? 'si' : 'quiza' });
  }
  return out;
}

// ---------- recordings (stay on the device that made them, decided 2026-11-21) ----------
export async function recordings() {
  return (await db.query(STORE).catch(() => [])).filter((r) => r.id.startsWith('v:rec:') && !r.deleted)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export async function saveRecording(blob, { type, duration, note = '' }) {
  const id = `v:rec:${uuid()}`;
  const mediaId = await db.putMedia(blob, { ownerStore: STORE, ownerId: id, duration, encryptScope: SCOPE });
  const m = await db.rawGet('media', mediaId);
  await db.rawPut('media', { ...m, localOnly: true });
  await save({ id, type, duration, size: blob.size, mime: blob.type, mediaId, note, localOnly: true, date: nowISO().slice(0, 10) });
  return id;
}
export async function deleteRecording(id) { await db.purge(STORE, id); }
export const recordingBlob = (r) => db.getMedia(r.mediaId);

// ---------- own encrypted backup (docs/05 §33 g) ----------
export async function exportBackup(phrase, { withRecordings = true } = {}) {
  const records = (await db.query(STORE, { includeHidden: true }).catch(() => []))
    .filter((r) => withRecordings || !r.id.startsWith('v:rec:'))
    .map(({ locked: _l, ...r }) => r);
  const media = [];
  if (withRecordings) {
    for (const m of await db.rawAll('media')) {
      if (m.ownerStore !== STORE || m.deleted) continue;
      const blob = await db.getMedia(m.id);
      if (blob) media.push({ id: m.id, mime: m.mime, size: m.size, duration: m.duration, ownerId: m.ownerId, data: bufToB64(await blob.arrayBuffer()) });
    }
  }
  const box = await cryptoBox.encryptWithPassword(phrase, { records, media });
  return { format: BACKUP_FORMAT, version: 1, createdAt: nowISO(), ...box };
}

/** Restore a backup into the open corner (newer record wins). Returns { records, media } counts. */
export async function importBackup(obj, phrase) {
  if (obj?.format !== BACKUP_FORMAT) { const e = new Error('Este archivo no es una copia del Rincón.'); e.code = 'FORMAT'; throw e; }
  let data;
  try { data = await cryptoBox.decryptWithPassword(phrase, obj); } catch { const e = new Error('La frase no es correcta.'); e.code = 'PHRASE'; throw e; }
  let nr = 0; let nm = 0;
  for (const m of data.media || []) {
    if (await db.rawGet('media', m.id)) continue;
    const box = await cryptoBox.encryptBytes(SCOPE, new Uint8Array(b64ToBuf(m.data)));
    await db.rawPut('media', db.withDefaults({ id: m.id, blob: null, mime: m.mime, size: m.size, duration: m.duration, ownerStore: STORE, ownerId: m.ownerId, enc: box, localOnly: true }));
    nm++;
  }
  for (const r of data.records || []) {
    if (!String(r.id || '').startsWith('v:')) continue;
    const prev = await db.get(STORE, r.id).catch(() => null);
    if (prev && (prev.updatedAt || '') >= (r.updatedAt || '')) continue;
    await db.rawPut(STORE, await db.seal(STORE, { ...db.withDefaults(r), id: r.id }));
    nr++;
  }
  return { records: nr, media: nm };
}

// ---------- wiping ----------
/** Delete the whole corner on this device: keys, records and recordings. Other devices keep theirs. */
export async function wipeLocal() {
  const keys = [];
  for (const r of await db.rawAll(STORE)) keys.push([STORE, r.id]);
  for (const m of await db.rawAll('media')) if (m.ownerStore === STORE) keys.push(['media', m.id]);
  await sync.withoutPush(keys.map(([s, id]) => `${s}:${id}`), async () => {
    for (const [s, id] of keys) await db.rawDelete(s, id);
  });
  for (const r of await security.keyRecords(SCOPE)) await db.rawDelete('settings', r.id);
  cryptoBox.lock(SCOPE);
  const sec = await security.getSettings();
  if (sec.attempts?.[SCOPE]) await security.setSettings({ attempts: { ...sec.attempts, [SCOPE]: { failures: 0, nextTryAt: 0 } } });
  await security.refreshKeys();
}

/** Delete the corner's content everywhere (synced deletion); the PIN stays. */
export async function wipeEverywhere() {
  for (const r of await db.rawAll(STORE)) await db.purge(STORE, r.id);
  for (const m of await db.rawAll('media')) if (m.ownerStore === STORE) await db.rawDelete('media', m.id);
}

// ---------- device-only options (never synced) ----------
export const LOCAL_DEFAULTS = { showInMore: false, idleMinutes: 0, wipeAfterFailures: false };
export const getLocal = () => db.getSettings('vaultLocal', LOCAL_DEFAULTS);
export const setLocal = (patch) => db.setSettings('vaultLocal', patch);
