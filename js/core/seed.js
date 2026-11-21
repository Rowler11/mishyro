// Seeding from CONFIG (every start) and importing seed-privado.json (docs/08 §4, docs/13).
import * as db from './db.js';
import { isValidDay, parseDay, nowISO } from './util.js';

/** CONFIG list -> `content` kind. */
export const CONTENT_KINDS = {
  thinkingOfYouPhrases: 'phrase', goodMorning: 'goodMorning', goodNight: 'goodNight',
  questionBank: 'question', quiz: 'quiz', dateIdeas: 'dateIdea', dateMenuIdeas: 'dateMenuIdea',
  badges: 'badge', seasonalEvents: 'seasonalEvent', giftCategories: 'giftCategory',
  weeklyChallenges: 'weeklyChallenge', firsts: 'first', gratitudePrompts: 'gratitudePrompt',
  weeklyReviewQuestions: 'reviewQuestion', scratchPrizes: 'scratchPrize', habitTemplates: 'habitTemplate',
  loveLanguageQuestions: 'loveLanguageQuestion', loveLanguageIdeas: 'loveLanguageIdea',
  japaneseWords: 'japaneseWord', albumTemplates: 'albumTemplate', legalTexts: 'legal',
};
/** CONFIG list -> its own store (records the couple then owns and edits). */
export const STORE_SEEDS = {
  savingsGoals: 'savingsGoals', dreams: 'dreams', reminders: 'reminders', bucketList: 'bucketList', recipes: 'recipes',
};

const PENDING = 'POR COMPLETAR';
const clean = (v) => (typeof v === 'string' && v.trim().toUpperCase() === PENDING ? '' : v ?? '');
/** True when a text still has a "[completa..." or "[POR COMPLETAR..." placeholder (shown only in edit mode). */
export const needsCompletion = (text) => /\[(completa|por completar)/i.test(String(text || ''));

function sameFields(a, b, keys) {
  return keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * Upsert seeded records by id: new -> insert; existing and not edited -> update fields;
 * edited, deleted or purged (tombstone) -> untouched.
 */
export async function upsertSeeded(store, items, origin, tombstones = {}) {
  const res = { inserted: 0, updated: 0, skipped: 0 };
  const local = new Map((await db.rawAll(store)).map((r) => [r.id, r]));
  const write = [];
  for (const item of items) {
    const prev = local.get(item.id);
    if (!prev) {
      if (tombstones[`${store}:${item.id}`]) { res.skipped++; continue; }
      write.push(db.withDefaults({ ...item }, origin)); res.inserted++;
    } else if (prev.userEdited || prev.deleted || prev.enc) {
      res.skipped++;
    } else {
      const keys = Object.keys(item);
      if (sameFields(prev, item, keys) && prev.origin === origin) continue;
      write.push({ ...prev, ...item, origin, updatedAt: nowISO() }); res.updated++;
    }
  }
  if (write.length) await db.rawPutMany(store, write);
  return res;
}

/** Apply CONFIG to the store (runs on every start once setup is done). */
export async function syncConfig(CONFIG) {
  const { tombstones = {} } = await db.getMeta();
  const content = [];
  for (const [key, kind] of Object.entries(CONTENT_KINDS)) {
    for (const item of CONFIG[key] || []) content.push({ ...item, kind });
  }
  // Fase 5: the game banks live under CONFIG.games.banks; each bank is the kind "game:<bank>".
  for (const [bank, items] of Object.entries(CONFIG.games?.banks || {})) {
    for (const item of items) content.push({ ...item, kind: `game:${bank}` });
  }
  const out = { content: await upsertSeeded('content', content, 'config', tombstones) };
  for (const [key, store] of Object.entries(STORE_SEEDS)) {
    if ((CONFIG[key] || []).length) out[store] = await upsertSeeded(store, CONFIG[key], 'config', tombstones);
  }
  out.milestones = await upsertSeeded('profile', [{ id: 'milestones', items: CONFIG.milestones || [] }], 'config', tombstones);
  return out;
}

/** "Restablecer desde CONFIG" for one content kind: undo edits, hiding and deletion. */
export async function resetKind(CONFIG, kind) {
  const key = Object.keys(CONTENT_KINDS).find((k) => CONTENT_KINDS[k] === kind);
  const gameBank = kind.startsWith('game:') ? CONFIG.games?.banks?.[kind.slice(5)] : null;
  if (!key && !gameBank) throw new Error(`Unknown kind ${kind}`);
  const ids = new Set((gameBank || CONFIG[key] || []).map((i) => i.id));
  const recs = (await db.rawAll('content')).filter((r) => ids.has(r.id));
  await db.rawPutMany('content', recs.map((r) => ({ ...r, userEdited: false, deleted: false, hidden: false })));
  return syncConfig(CONFIG);
}

// ---------- seed-privado.json ----------

const partial = (day) => {
  const d = parseDay(day);
  return d ? { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } : { y: null, m: null, d: null };
};

/** Validate the private seed (docs/13). Returns { ok, errors[], counts }. Never throws. */
export function validateSeed(seed) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) return { ok: false, errors: ['El archivo no tiene el formato de datos iniciales.'], counts: {} };
  if (seed.schemaVersion !== 1) err(`Versión de formato no compatible (${seed.schemaVersion ?? 'sin versión'}). Se espera la 1.`);
  for (const k of ['partnerShortName', 'authorShortName']) {
    if (typeof seed[k] !== 'string' || !clean(seed[k])) err(`Falta el nombre corto (${k}).`);
  }
  if (seed.startDate && clean(seed.startDate)) {
    const t = Date.parse(seed.startDate);
    if (Number.isNaN(t)) err('La fecha de inicio no es válida.');
    else if (t > Date.now()) err('La fecha de inicio está en el futuro.');
  }
  const ids = new Set();
  const lists = { specialDates: ['id', 'title', 'date'], reasons: ['id', 'text'], memories: ['id'], coupons: ['id', 'title'], letters: ['id', 'label', 'text'], pets: ['id', 'name'] };
  const counts = {};
  for (const [list, required] of Object.entries(lists)) {
    const arr = seed[list];
    if (arr === undefined) { counts[list] = 0; continue; }
    if (!Array.isArray(arr)) { err(`"${list}" debe ser una lista.`); continue; }
    counts[list] = arr.length;
    arr.forEach((item, i) => {
      if (!item || typeof item !== 'object') { err(`${list} #${i + 1} está vacío.`); return; }
      for (const f of required) if (typeof item[f] !== 'string' || !item[f]) err(`${list} #${i + 1}: falta "${f}".`);
      if (typeof item.id === 'string') {
        if (!item.id.startsWith('seed:')) err(`${list} #${i + 1}: el id debe empezar por "seed:".`);
        if (ids.has(item.id)) err(`Id repetido: ${item.id}.`);
        ids.add(item.id);
      }
      for (const f of ['date', 'birthDate', 'arrivalDate']) {
        const v = clean(item[f]);
        if (v && !isValidDay(v)) err(`${list} #${i + 1}: la fecha "${f}" no es válida (usa AAAA-MM-DD).`);
      }
    });
  }
  return { ok: errors.length === 0, errors, counts };
}

/** Write a validated seed into the store. Same upsert rules as CONFIG (origin "seed"). */
export async function applySeed(seed) {
  const { tombstones = {} } = await db.getMeta();
  const res = {};
  const sname = clean(seed.partnerShortName); const dname = clean(seed.authorShortName);
  const birthOf = (who) => {
    const name = who === 'sofia' ? sname : dname;
    const sd = (seed.specialDates || []).find((d) => d.kind === 'birthday' && name && d.title?.includes(name));
    return sd ? clean(sd.date) : '';
  };
  const people = {
    sofia: { fullName: clean(seed.partnerName), shortName: sname, nickname: clean(seed.partnerNickname), birth: birthOf('sofia'), favoriteColor: '' },
    david: { fullName: clean(seed.authorName), shortName: dname, nickname: clean(seed.authorNickname), birth: birthOf('david'), favoriteColor: '' },
  };
  const profile = [
    { id: 'people', ...people },
    { id: 'relationship', startDate: clean(seed.startDate) },
    { id: 'extras', favoriteSong: { title: clean(seed.favoriteSong?.title), artist: clean(seed.favoriteSong?.artist), spotifyUrl: clean(seed.favoriteSong?.spotifyUrl) }, secretMessage: clean(seed.secretMessage) },
  ];
  res.profile = await upsertSeeded('profile', profile, 'seed', tombstones);

  const content = [
    ...(seed.reasons || []).map((r) => ({ id: r.id, kind: 'reason', text: clean(r.text) })),
    ...(seed.coupons || []).map((c) => ({ id: c.id, kind: 'coupon', title: clean(c.title), description: clean(c.description) })),
    ...(seed.letters || []).map((l) => ({ id: l.id, kind: 'letter', label: clean(l.label), text: clean(l.text) })),
  ];
  res.content = await upsertSeeded('content', content, 'seed', tombstones);

  res.memories = await upsertSeeded('memories', (seed.memories || []).map((m) => {
    const date = clean(m.date);
    return { id: m.id, date: isValidDay(date) ? date : '', title: clean(m.title), note: clean(m.note), mediaIds: [], draft: !isValidDay(date) };
  }), 'seed', tombstones);

  const petIdByName = {};
  res.pets = await upsertSeeded('pets', (seed.pets || []).map((p) => {
    petIdByName[clean(p.name)] = p.id;
    return {
      id: p.id, name: clean(p.name), species: clean(p.species), breed: clean(p.breed), sex: clean(p.sex),
      birth: partial(clean(p.birthDate)), arrival: partial(clean(p.arrivalDate)), color: clean(p.color),
      microchip: clean(p.microchip), mediaId: null, traits: [], favorites: '', notes: clean(p.notes), memorial: null,
    };
  }), 'seed', tombstones);

  const personFor = (d) => {
    if (d.kind === 'birthday') return d.title?.includes(sname) ? 'sofia' : d.title?.includes(dname) ? 'david' : null;
    if (d.kind === 'pet') return Object.entries(petIdByName).find(([n]) => n && d.title?.includes(n))?.[1] || (seed.pets?.[0]?.id ?? null);
    return null;
  };
  res.specialDates = await upsertSeeded('specialDates', (seed.specialDates || []).map((d) => ({
    id: d.id, name: clean(d.title), date: partial(clean(d.date)), kind: d.kind || 'other',
    recurring: d.recurring || 'yearly', personOrPetId: personFor(d),
  })), 'seed', tombstones);

  await db.setMeta({ seedImportedAt: nowISO() });
  return res;
}

/** Profile written by hand in the setup wizard (origin "user"). */
export async function applyManual({ people, startDate, pet }) {
  const prev = (await db.rawGet('profile', 'people')) || {};
  await db.put('profile', { ...prev, id: 'people', sofia: { ...(prev.sofia || {}), ...people.sofia }, david: { ...(prev.david || {}), ...people.david } });
  const rel = (await db.rawGet('profile', 'relationship')) || {};
  await db.put('profile', { ...rel, id: 'relationship', startDate });
  if (pet?.name) {
    await db.put('pets', {
      id: 'user:pet:first', name: pet.name, species: pet.species || '', breed: pet.breed || '', sex: '',
      birth: partial(pet.birth), arrival: partial(pet.arrival), color: '', microchip: '', mediaId: null,
      traits: [], favorites: '', notes: '', memorial: null,
    });
  }
}
