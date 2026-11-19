// Active profile ("Quién usa la app") and display names. Names always come
// from the store (seed or typed in the app), never from the repository.
import * as db from './db.js';

export const PEOPLE = ['sofia', 'david'];
let storageKey = 'aishiteru';
let defaults = { sofia: { shortName: '' }, david: { shortName: '' } };
let people = {};
let relationship = {};
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
    const pets = (await db.rawAll('pets')).filter((x) => !x.deleted);
    petName = pets[0]?.name || '';
  } catch { people = {}; relationship = {}; }
  emit();
}

export function person(id) { return { ...(defaults[id] || {}), ...(people[id] || {}) }; }
/** Short name shown in the interface (falls back to the generic default). */
export const name = (id) => person(id).shortName || defaults[id]?.shortName || '';
/** Nickname if set, else short name. Used for {apodo}. */
export const nick = (id) => person(id).nickname || name(id);
export const startDate = () => relationship.startDate || '';

/** Replace {apodo} with the nickname of who receives the message. */
let petName = '';
/** Name of the first pet, for "{mascota}" in texts. Texts that use it carry requires: 'pets'. */
export const setPetName = (name) => { petName = name || ''; };
/**
 * Fill a text for who receives it: {apodo} (receiver's nickname), {mascota} (first pet) and
 * gendered endings like "enamorad{o/a}", which follow who SENDS it (decision 6a, Fase 2):
 * David's messages use the first form and Sofía's the second.
 */
export const fill = (text, receiver = partnerOf(active())) => String(text || '')
  .replaceAll('{apodo}', nick(receiver)).replaceAll('{mascota}', petName || 'nuestra mascota')
  .replace(/\{([a-záéíóúñ]*)\/([a-záéíóúñ]*)\}/gi, (_, masc, fem) => (partnerOf(receiver) === 'sofia' ? fem : masc));
