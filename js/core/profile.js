// Active profile ("Quién usa la app") and display names. Names always come
// from the store (seed or typed in the app), never from the repository.
import * as db from './db.js';

export const PEOPLE = ['sofia', 'david'];
let storageKey = 'aishiteru';
let defaults = { sofia: { shortName: '' }, david: { shortName: '' } };
let people = {};
let relationship = {};
let photos = {};

// Roles a elegir en el formulario (v0.26.0). `g` decides the gendered endings ({o/a}) of who sends.
export const ROLES = [
  { id: 'novia', label: 'Novia', g: 'f' }, { id: 'novio', label: 'Novio', g: 'm' },
  { id: 'esposa', label: 'Esposa', g: 'f' }, { id: 'esposo', label: 'Esposo', g: 'm' },
  { id: 'senora', label: 'Mi señora', g: 'f' }, { id: 'senor', label: 'Mi señor', g: 'm' },
  { id: 'ella', label: 'Ella', g: 'f' }, { id: 'el', label: 'Él', g: 'm' },
];
/** Slot defaults when nothing was chosen, so data from before v0.26.0 keeps its forms. */
const SLOT_ROLE = { sofia: 'novia', david: 'novio' };
/** The person the app is for ("Para …" on the loading screen and in Inicio). */
export const RECIPIENT = 'sofia';
/** Who prepares the app ("Tú" in the first-time form). */
export const AUTHOR = 'david';
const listeners = new Set();

export function init(CONFIG) {
  storageKey = CONFIG.storageKey;
  defaults = CONFIG.people;
  db.setActiveProfileGetter(active);
  db.onChange((store) => { if (store === 'profile') load(); });
}

export function active() {
  try {
    const v = localStorage.getItem(`${storageKey}.activeProfile`);
    return PEOPLE.includes(v) ? v : 'sofia';
  } catch { return 'sofia'; }
}
export const hasChosen = () => { try { return PEOPLE.includes(localStorage.getItem(`${storageKey}.activeProfile`)); } catch { return false; } };

export function setActive(id) {
  if (!PEOPLE.includes(id)) return;
  try { localStorage.setItem(`${storageKey}.activeProfile`, id); } catch { /* ignore */ }
  document.documentElement.dataset.profile = id;
  emit();
}

export const partnerOf = (id) => (id === 'sofia' ? 'david' : 'sofia');
export const onProfileChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

export async function load() {
  try {
    people = (await db.rawGet('profile', 'people')) || {};
    relationship = (await db.rawGet('profile', 'relationship')) || {};
    photos = {};
    for (const id of PEOPLE) {
      const r = await db.get('profile', `avatar:${id}`).catch(() => null);
      if (r?.data && !r.deleted && /^data:image\/(jpeg|png|webp);base64,/.test(r.data)) photos[id] = r.data;
    }
    const pets = (await db.rawAll('pets')).filter((x) => !x.deleted);
    petName = (pets.find((x) => !x.memorial) || pets[0])?.name || '';
    lastPets = pets; petsListener?.(pets);
  } catch { people = {}; relationship = {}; }
  emit();
}

export function person(id) { return { ...(defaults[id] || {}), ...(people[id] || {}) }; }
export const roleOf = (id) => ROLES.find((r) => r.id === people[id]?.rel) || ROLES.find((r) => r.id === SLOT_ROLE[id]);
export const roleLabel = (id) => (ROLES.find((r) => r.id === people[id]?.rel) || {}).label || '';
export const genderOf = (id) => roleOf(id)?.g || 'm';
/** Short name shown in the interface; before any name is written, a generic word. */
export const name = (id) => person(id).shortName || defaults[id]?.shortName || (id === active() ? 'Tú' : 'Tu pareja');
/** Profile photo as a data URL, or '' (then the initial is shown). */
export const photo = (id) => photos[id] || '';
/** Save or remove (data = '') a person's photo. Its own record, so both can change theirs at once. */
export async function setPhoto(id, data) {
  if (!PEOPLE.includes(id)) return;
  if (data) await db.put('profile', { id: `avatar:${id}`, person: id, data });
  else if (await db.rawGet('profile', `avatar:${id}`)) await db.purge('profile', `avatar:${id}`);
  await load();
}
/** Name after "Para" (loading screen and Inicio): who the app is for, or '' before any name exists. */
export const paraName = () => { const p = person(RECIPIENT); return p.nickname || p.shortName || ''; };
/** Nickname if set, else short name. Used for {apodo}. */
export const nick = (id) => person(id).nickname || name(id);
export const startDate = () => relationship.startDate || '';
/** The start as a local day (YYYY-MM-DD), or ''. startDate() may carry a time and offset. */
export const startDay = () => (/^\d{4}-\d{2}-\d{2}/.exec(startDate()) || [''])[0];

/** Replace {apodo} with the nickname of who receives the message. */
let petName = '';
let petsListener = null;
let lastPets = [];
/** dates.js registers here so pet birthdays follow the pets list without an import cycle. */
export const onPets = (fn) => { petsListener = fn; fn(lastPets); };
/** Name of the first pet, for "{mascota}" in texts. Texts that use it carry requires: 'pets'. */
export const setPetName = (name) => { petName = name || ''; };
/**
 * Fill a text for who receives it: {apodo} (receiver's nickname), {mascota} (first pet) and
 * gendered endings like "enamorad{o/a}", which follow who SENDS it (decision 6a, Fase 2):
 * a sender with a masculine role uses the first form and a feminine one the second.
 */
export const fill = (text, receiver = partnerOf(active())) => String(text || '')
  .replaceAll('{apodo}', nick(receiver)).replaceAll('{mascota}', petName || 'nuestra mascota')
  .replace(/\{([a-záéíóúñ]*)\/([a-záéíóúñ]*)\}/gi, (_, masc, fem) => (genderOf(partnerOf(receiver)) === 'f' ? fem : masc));
