// Gatitos con vida (v0.16.0, all options A chosen 2026-11-24): the real pets of Mascotas come alive.
// - Inicio shows all of them together (not only the first) in a little tatami room. Tap one and it
//   talks; Acariciar, Premio and Jugar make it react, and the day's mimos sync between both phones.
// - What they say comes from the personality and favorites written in their profile.
// - When a dose, a refill or a medicine is due, the pet asks for it in a soft bubble (no guilt) that
//   leads to its page in Mascotas.
// - "Travesura": a quick diary entry with a photo, saved as a moment of the pet (Momentos, Galería).
// - Now and then one of them strolls through Juegos, Mi espacio and the garden.
// Names and data live only in the couple's synced data, never in the code.
import * as sounds from '../core/sounds.js';
import { ui, util, db, profile } from '../core.js';
import * as time from '../core/time.js';
import { kittyArt, COATS, coatId } from '../core/kitty.js';
const coatOf = (pet) => COATS.find((c) => c.id === coatId(pet)) || COATS[5];
import { bubble, move } from '../core/pets.js';
import { latestByProduct, doseStatus, daysHome, addDays } from './mascotas.js';
import { photoField, isQuotaError } from './hogar-kit.js';

const { el, icon } = util;
const fmtDM = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const TREATS_PER_DAY = 3;
const DISMISS_KEY = 'aishiteru.kittyCare';
export const PET_KEY = 'aishiteru.pet';
export const PET_TAB_KEY = 'aishiteru.pet.tab';

// ---------- what they say (pure, unit-tested) ----------
const SOUND = { gato: 'Miau', perro: 'Guau', otro: '¡Hola!' };
export const speciesKey = (s) => (/perr|dog/i.test(s || '') ? 'perro' : /gat|cat/i.test(s || 'gato') ? 'gato' : 'otro');

// {s} = its sound, {p} = the person using the app, {o} = their partner, {fav} = a favorite thing.
const GENERIC = ['{s}. ¿Me das un mimito?', '{s}. Te estaba esperando, {p}.', 'Me gusta cuando {p} y {o} están en casa.', '¿Le cuentas a {o} lo que hice hoy?',
  'Si me rascas detrás de la oreja, te quiero más.', 'Estoy cuidando la casa. Bueno… la cama.', 'Un abrazo para {o} de mi parte, por favor.'];
const TRAITS = [
  [/dormil|perez|siest|flojo|floja/, ['Zzz… cinco minutitos más.', 'Encontré el rayito de sol perfecto para dormir.', 'Dormir junto a ustedes es mi deporte favorito.']],
  [/curios|explor|chism|investig/, ['¿Qué hay en esa caja? Necesito saberlo.', 'Revisé toda la casa: todo en orden.', 'Escuché un ruido… voy a investigar.']],
  [/juguet|activ|energ|loc[oa]|inquiet/, ['¡Juguemos! ¿Dónde está la pluma?', 'Corrí por toda la casa a las 3 a. m. De nada.', 'Te reto a atraparme.']],
  [/glot|comel|comid|golos|tragon/, ['¿Eso que huele rico es para mí?', 'Mi plato está medio vacío. Es una emergencia.', 'Un premio más y prometo portarme bien.']],
  [/cariñ|carin|mimos|tiern|melos|dulce|amoros/, ['Ven, que te tengo un ronroneo guardado.', 'Me acomodo en tus piernas y no me muevo.', 'Te sigo a todas partes porque te quiero.']],
  [/convers|maull|habl|charl|ladr|bulliciu/, ['{s}, {s}. Traducción: te quiero.', 'Te estaba contando algo importante. Escucha.', 'Tengo opiniones sobre todo.']],
  [/tímid|timid|miedos|asust|nervios/, ['Me escondí un ratito, pero ya salí.', 'Contigo me siento valiente.', 'Háblame despacito, que hoy estoy de buenas.']],
  [/travies|pícar|picar|rebeld|terremot/, ['No fui yo. Bueno, quizás un poquito.', 'Lo que estaba en la mesa se cayó solo.', 'Tengo cara de inocente, ¿verdad?']],
  [/independ|diva|elegant|seri[oa]|orgullos/, ['Hoy acepto un mimo. Solo uno.', 'Vengo cuando quiero, pero hoy quiero.', 'Me dejo acariciar porque eres tú.']],
  [/valient|guardi|protect/, ['Yo cuido la casa mientras no están.', 'Ningún insecto pasa por aquí.']],
];
const REACT = {
  pet: { gato: ['Prrr… prrr…', 'Justo ahí, sí, justo ahí.', 'Me derrito.', 'Ronroneo de nivel máximo.'], perro: ['¡Me encanta! Mira cómo muevo la cola.', 'Justo ahí, sí, justo ahí.', 'Más, más, más.'], otro: ['¡Qué rico!', 'Justo ahí, sí, justo ahí.', 'Me derrito.'] },
  treat: ['Ñam. Delicioso.', '¡Gracias! Te quiero un premio más.', 'Ñam, ñam… ¿hay otro?'],
  full: ['Ya comí muchos premios hoy. ¿Mejor un mimo?', 'Mi pancita dice que ya fue suficiente por hoy.'],
  play: ['¡La atrapé!', 'Otra vez, otra vez.', 'Soy un tigre feroz.', 'Casi, casi… ¡ya!'],
};

/** First favorite thing ("ratón de tela, cajas" -> "ratón de tela"). */
export const favoriteOf = (pet) => String(pet?.favorites || '').split(/[,;y\n]+/).map((x) => x.trim()).filter((x) => x.length > 1)[0] || '';

/** Every line this pet may say right now, by its personality, favorites, the hour and its special days. */
export function linesFor(pet, now = new Date()) {
  const traits = (pet?.traits || []).join(' ').toLowerCase();
  const out = [...GENERIC];
  for (const [re, lines] of TRAITS) if (re.test(traits)) out.push(...lines, ...lines); // its own personality weighs double
  const fav = favoriteOf(pet);
  if (fav) out.push(`¿Jugamos con ${fav}?`, `Pensé en ${fav} toda la mañana.`);
  const h = now.getHours();
  if (h >= 5 && h < 11) out.push('Buenos días, {p}. ¿Desayunamos?');
  if (h >= 21 || h < 4) out.push('Ya es tarde. ¿Me hacen un campito en la cama?');
  const special = specialLine(pet, now);
  return special ? [special] : out;
}
function specialLine(pet, now) {
  const b = time.nextOccurrence(pet?.birth, { today: now }); const a = time.nextOccurrence(pet?.arrival, { today: now });
  if (b && b.days === 0) return '¡Hoy es mi cumpleaños! ¿Me cantan?';
  if (a && a.days === 0) return '¡Hoy se cumple un año más desde que llegué a casa!';
  const home = daysHome(pet?.arrival, now);
  if (home && (home % 100 === 0)) return `¡Hoy cumplo ${home.toLocaleString('es-CO')} días con ustedes!`;
  return '';
}
export const fill = (t, pet) => t.replace(/\{s\}/g, SOUND[speciesKey(pet?.species)])
  .replace(/\{p\}/g, profile.nick(profile.active()) || 'tú').replace(/\{o\}/g, profile.nick(profile.partnerOf(profile.active())) || 'tu amor');
const pick = (arr, avoid) => { const list = arr.filter((x) => x !== avoid); return list[Math.floor(Math.random() * list.length)] || arr[0]; };

// ---------- care the pet asks for (pure, unit-tested) ----------
/**
 * What this pet needs soon, most urgent first: { key, text, tab, level }. Doses come from the latest
 * vaccine/deworming, refills from "Dura más o menos", medicines from today's box.
 */
export function careFor(pet, records, { today = util.localDay(), hour = new Date().getHours() } = {}) {
  if (!pet || pet.memorial) return [];
  const recs = records.filter((r) => !r.deleted && r.petId === pet.id);
  const out = [];
  for (const r of latestByProduct(recs.filter((x) => x.type === 'vaccine' || x.type === 'deworm'))) {
    const st = doseStatus(r.data?.next, today);
    const days = r.data?.next ? util.daysBetween(util.parseDay(today), util.parseDay(r.data.next)) : null;
    if (st === 'overdue') out.push({ key: `dose:${r.id}`, level: 0, tab: 'salud', text: `Psst… creo que ya me tocaba ${r.data.product}. ¿Le preguntan al veterinario?` });
    else if (st === 'soon' && days <= 7) out.push({ key: `dose:${r.id}`, level: 2, tab: 'salud', text: days === 0 ? `Psst… hoy me toca ${r.data.product}.` : `Psst… el ${fmtDM.format(util.parseDay(r.data.next))} me toca ${r.data.product}.` });
  }
  for (const r of recs.filter((x) => x.type === 'medication' && x.date <= today && (!x.data?.end || x.data.end >= today))) {
    if (!r.data?.checks?.[today] && hour >= 8) out.push({ key: `med:${r.id}:${today}`, level: 1, tab: 'cuidados', text: `¿Ya me dieron ${r.data.name} hoy?` });
  }
  const supplies = latestByProduct(recs.filter((x) => x.type === 'supply').map((x) => ({ ...x, data: { ...x.data, product: x.data?.item } })));
  for (const r of supplies) {
    if (!r.data?.lastsDays) continue;
    const when = addDays(r.date, r.data.lastsDays);
    const d = util.daysBetween(util.parseDay(today), util.parseDay(when));
    if (d < 0) out.push({ key: `supply:${r.id}`, level: 1, tab: 'cuidados', text: `Se me está acabando ${r.data.item}… ¿lo compramos pronto?` });
    else if (d <= 2) out.push({ key: `supply:${r.id}`, level: 2, tab: 'cuidados', text: d === 0 ? `Hoy se acaba ${r.data.item}.` : `En ${d} ${d === 1 ? 'día' : 'días'} se acaba ${r.data.item}.` });
  }
  return out.sort((a, b) => a.level - b.level);
}

const recall = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const sessionSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } };

/** Open a pet's page in Mascotas on a given tab. */
export function openPet(pet, tab = 'perfil') { sessionSet(PET_KEY, pet.id); sessionSet(PET_TAB_KEY, tab); location.hash = '#/mascotas'; }

// ---------- data ----------
export async function livePets() {
  const pets = (await db.query('pets')).filter((p) => !p.deleted && !p.memorial && p.name);
  return pets.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
const mimoId = (petId, day, who) => `mimos:${petId}:${day}:${who}`;
/** Today's mimos per pet: { [petId]: { pet, treat, play, by: Set } } from both people. */
export function mimosOf(records, day = util.localDay()) {
  const out = {};
  for (const r of records) {
    if (r.deleted || r.type !== 'mimos' || r.date !== day) continue;
    const m = (out[r.petId] ||= { pet: 0, treat: 0, play: 0, by: new Set() });
    for (const k of ['pet', 'treat', 'play']) m[k] += Number(r.data?.[k]) || 0;
    if ((r.data?.pet || 0) + (r.data?.treat || 0) + (r.data?.play || 0)) m.by.add(r.by);
  }
  return out;
}
async function addMimo(pet, kind) {
  const day = util.localDay(); const me = profile.active();
  const id = mimoId(pet.id, day, me);
  const rec = (await db.get('petRecords', id).catch(() => null)) || { id, petId: pet.id, type: 'mimos', date: day, data: { pet: 0, treat: 0, play: 0 }, by: me, mediaIds: [], visibility: 'shared', owner: 'both' };
  rec.data = { ...rec.data, [kind]: (Number(rec.data?.[kind]) || 0) + 1 };
  await db.put('petRecords', rec, { userEdit: false });
}

// ---------- little effects ----------
/** A soft purr (v0.20.0: lives in core/sounds.js with the other voices). */
const purr = () => sounds.play('purr');
/** Its own voice when it talks: meow, or wuf for a dog. */
const voiceOf = (pet) => (/perr|dog/i.test(pet.species || '') ? 'dog' : /gat|cat/i.test(pet.species || 'gato') ? 'kitty' : null);
function floaters(host, kind) {
  if (util.prefersReducedMotion()) return;
  const n = kind === 'pet' ? 4 : 1;
  for (let i = 0; i < n; i++) {
    const f = el('span', { class: `kitty-fx kitty-fx-${kind}`, 'aria-hidden': 'true', style: { '--dx': `${Math.round((i - (n - 1) / 2) * 16 + (Math.random() * 8 - 4))}px`, '--d': `${i * 120}ms` } },
      kind === 'pet' ? icon('heart', { size: 14 }) : kind === 'treat' ? fishTreat() : feather());
    host.append(f);
    setTimeout(() => f.remove(), 1700 + i * 120);
  }
}
function fishTreat() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 32 16'); s.setAttribute('width', '26'); s.setAttribute('height', '13');
  s.innerHTML = '<path d="M3 8 C8 1 18 1 24 8 C18 15 8 15 3 8 Z" fill="#F0A562" stroke="#C06A33" stroke-width="1.2"/><path d="M23 8 L30 3 L29 8 L30 13 Z" fill="#E58B5B"/><circle cx="8" cy="7" r="1.2" fill="#3B2A2A"/>';
  return s;
}
function feather() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('width', '34'); s.setAttribute('height', '34');
  s.innerHTML = '<path d="M4 36 L22 18" stroke="#8A6550" stroke-width="1.6" stroke-linecap="round"/><path d="M20 20 C18 10 26 3 36 4 C37 14 30 22 20 20 Z" fill="#E58FAE" stroke="#C2405F" stroke-width="1" stroke-opacity=".6"/><path d="M21 19 L33 7" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1"/>';
  return s;
}
function react(host, kind) {
  const cls = { pet: 'is-petted', treat: 'is-eating', play: 'is-playing' }[kind];
  host.classList.remove('is-petted', 'is-eating', 'is-playing'); void host.offsetWidth; host.classList.add(cls);
  clearTimeout(host._reactT); host._reactT = setTimeout(() => host.classList.remove(cls), kind === 'pet' ? 2200 : 1600);
  floaters(host, kind);
  if (kind === 'pet') { purr(); util.haptic([12, 40, 12, 40, 12]); } else util.haptic(10);
}

/** A tappable kitty: a button with its drawing (and its name under it when `label`). Tap = it talks. */
export function kittyButton(pet, { index = 0, label = true, onTap } = {}) {
  const host = el('button', { class: 'kitty', type: 'button', 'data-pet': pet.id, 'aria-label': `${pet.name}. ${pet.sex === 'hembra' ? 'Tócala' : 'Tócalo'} para que te hable` },
    el('span', { class: 'kitty-body' }, kittyArt(pet, { index })),
    label ? el('span', { class: 'kitty-name', 'aria-hidden': 'true' }, pet.name) : null);
  let last = '';
  host.talk = (text) => bubble(host, pet.name, text, { ms: 4600 });
  host.addEventListener('click', () => {
    util.haptic(8); move(host);
    const v = voiceOf(pet); if (v) sounds.play(v);
    last = pick(linesFor(pet), last); host.talk(fill(last, pet));
    onTap?.(pet, host);
  });
  // Ear twitch now and then, so they feel alive even when nobody touches them.
  if (!util.prefersReducedMotion()) {
    const twitch = () => { if (!host.isConnected) return; host.classList.add('is-twitch'); setTimeout(() => host.classList.remove('is-twitch'), 500); host._tw = setTimeout(twitch, 5000 + Math.random() * 9000); };
    host._tw = setTimeout(twitch, 2500 + Math.random() * 6000);
  }
  return host;
}

// ---------- Travesura: quick diary entry ----------
export function mischiefEditor(pet, { onSaved } = {}) {
  const title = ui.input({ maxlength: 80, placeholder: 'Ej.: Se metió en la caja de los zapatos' });
  const note = ui.textarea({ rows: 2, maxlength: 400 });
  const photo = photoField({ mediaId: null, label: 'Foto (opcional)', alt: `Travesura de ${pet.name}` });
  const f = ui.field({ label: '¿Qué hizo?', control: title });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  return ui.openModal({
    title: `Travesura de ${pet.name}`, size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, f, photo.node, ui.field({ label: 'Unas líneas (opcional)', control: note }),
      el('p', { class: 'muted small' }, 'Queda en Momentos de su página y en la Galería.'), err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (photo.busy()) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
      if (!title.value.trim()) { f.setError('Cuéntanos qué travesura hizo.'); title.focus(); return false; }
      const id = util.uuid();
      try {
        const mediaId = await photo.commit('petRecords', id);
        await db.put('petRecords', { id, petId: pet.id, type: 'moment', date: util.localDay(), data: { title: title.value.trim(), note: note.value.trim(), mischief: true }, amountCOP: null, mediaIds: mediaId ? [mediaId] : [], by: profile.active(), visibility: 'shared', owner: 'both' });
        photo.revoke(); util.haptic(10); ui.toast('Travesura guardada.', { tone: 'success' }); onSaved?.(); return true;
      } catch (x) { console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar. Inténtalo otra vez.'; return false; }
    } }],
  });
}

// ---------- around the app (v0.18.0, options C + menu chosen 2026-11-24) ----------
// No section of their own: on Inicio each pet peeks over the top edge of a different card, and on every
// other screen one of them shows up, a different one per screen and day: peeking over a card or asleep
// on a cushion at the end. Tap it and it talks and opens a little menu of mimos.
const SKIP = new Set(['inicio', 'mascotas', 'juegos', 'jibun', 'yoru', 'ciclo', 'buscar', 'modo-cita']);
const hash = (str) => { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Today's mimos of one pet from both people (fresh from the DB, so both phones count). */
async function mimosToday(pet) {
  const recs = await db.query('petRecords').catch(() => []);
  return mimosOf(recs)[pet.id] || { pet: 0, treat: 0, play: 0, by: new Set() };
}
let writes = Promise.resolve();
/** Give a mimo: the pet reacts, says something and it is saved (treats up to 3 a day). */
export async function giveMimo(pet, host, kind) {
  const m = await mimosToday(pet);
  if (kind === 'treat' && m.treat >= TREATS_PER_DAY) { move(host); host.talk(pick(REACT.full)); return false; }
  react(host, kind);
  host.talk(fill(pick(kind === 'pet' ? REACT.pet[speciesKey(pet.species)] : REACT[kind]), pet));
  writes = writes.then(() => addMimo(pet, kind)).catch((e) => console.error(e));
  await writes;
  return true;
}

/** The little menu that opens next to a pet when it is tapped: Mimo, Premio, Jugar, Foto. */
function openMenu(pet, host, root, { flow = false } = {}) {
  root.querySelectorAll('.kitty-menu').forEach((x) => x.remove());
  const close = () => { menu.remove(); document.removeEventListener('pointerdown', outside, true); clearTimeout(menu._t); };
  const outside = (e) => { if (!menu.contains(e.target) && !host.contains(e.target)) close(); };
  const stay = () => { clearTimeout(menu._t); menu._t = setTimeout(close, 9000); };
  const btn = (kind, label, iconName, aria) => el('button', { class: 'kitty-menu-btn', type: 'button', 'data-act': kind, 'aria-label': `${aria} ${pet.name}`,
    onClick: async () => { stay(); if (kind === 'photo') { close(); mischiefEditor(pet); return; } await giveMimo(pet, host, kind); } },
  icon(iconName, { size: 18 }), el('span', {}, label));
  const menu = el('div', { class: 'kitty-menu', role: 'group', 'aria-label': `Mimos para ${pet.name}` },
    btn('pet', 'Mimo', 'hand-heart', 'Acariciar a'), btn('treat', 'Premio', 'fish', 'Darle un premio a'),
    btn('play', 'Jugar', 'feather', 'Jugar con'), btn('photo', 'Travesura', 'camera', 'Anotar una travesura de'));
  root.append(menu);
  if (flow) {
    menu.classList.add('is-flow');
    menu.scrollIntoView?.({ block: 'nearest', behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' });
  } else {
    // Hangs from the top edge of the card, under the pet, without leaving the card's width.
    const r = root.getBoundingClientRect(); const h = host.getBoundingClientRect();
    const w = Math.min(menu.offsetWidth || 260, r.width);
    menu.style.left = `${Math.round(Math.min(Math.max(h.left - r.left + h.width / 2 - w / 2, 4), Math.max(4, r.width - w - 4)))}px`;
  }
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  stay();
}

/** A pet that talks and opens its menu when tapped. */
function companionKitty(pet, index, root, { flow = false } = {}) {
  const k = kittyButton(pet, { index, label: false, onTap: (p, host) => openMenu(p, host, root, { flow }) });
  k.setAttribute('aria-label', `${pet.name}. ${pet.sex === 'hembra' ? 'Tócala' : 'Tócalo'} para que te hable y darle mimos`);
  k.setAttribute('aria-haspopup', 'true');
  return k;
}

/** Wrap a card so a pet can peek over its top edge (head and paws out, body hidden behind the card). */
export function perch(card, pet, index, { side = 0.75 } = {}) {
  const wrap = el('div', { class: 'kitty-perch', 'data-bubble-root': '', style: { '--kx': `${Math.round(side * 100)}%` } });
  card.replaceWith(wrap);
  const k = companionKitty(pet, index, wrap);
  k.classList.add('kitty-peek');
  const coat = coatOf(pet);
  const paw = coat.pattern === 'points' ? coat.point : coat.pattern === 'tuxedo' ? coat.belly : coat.base;
  const paws = el('span', { class: 'kitty-paws', 'aria-hidden': 'true', style: { '--paw': paw, '--paw-edge': coat.shade } }, el('i'), el('i'));
  if (!card.classList.contains('card')) wrap.classList.add('is-inline');
  wrap.append(k, card, paws);
  card.classList.add('is-perched');
  return k;
}

/** A pet asleep on a zabuton at the end of a screen. Tap: it wakes up a moment, talks and opens its menu. */
export function nap(pet, index) {
  const box = el('div', { class: 'kitty-nap', 'data-bubble-root': '' });
  const k = companionKitty(pet, index, box, { flow: true });
  k.classList.add('is-asleep');
  k.addEventListener('click', () => { k.classList.remove('is-asleep'); clearTimeout(k._sleepT); k._sleepT = setTimeout(() => k.classList.add('is-asleep'), 12000); });
  box.append(el('span', { class: 'kitty-cushion', 'aria-hidden': 'true' }), k, el('span', { class: 'kitty-zzz', 'aria-hidden': 'true' }, 'z', el('span', {}, 'z'), el('span', {}, 'z')));
  return box;
}

const solidCard = (c) => {
  if (!c.isConnected || c.offsetHeight < (c.classList.contains('segmented') ? 36 : 72) || c.closest('.kitty-perch, .modal, li, .hub-tabs, [role="tablist"], .carousel, .day-switcher, .card .segmented')) return false;
  const bg = getComputedStyle(c).backgroundColor;
  return bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg);
};
const showPets = async () => !(await db.getSettings('home', { petHidden: false }).catch(() => ({}))).petHidden;

/** The care bubble: the most urgent thing among all pets, said by the pet who needs it. */
function careBubble(pets, records, today) {
  const dismissed = recall(DISMISS_KEY, {});
  const care = pets.flatMap((p) => careFor(p, records, { today }).map((c) => ({ ...c, pet: p }))).filter((c) => dismissed[c.key] !== today).sort((a, b) => a.level - b.level)[0];
  if (!care) return null;
  const node = el('div', { class: 'kitty-care', role: 'status', 'data-pet': care.pet.id },
    el('p', {}, el('strong', {}, `${care.pet.name}: `), care.text),
    el('div', { class: 'kitty-care-actions' },
      el('button', { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openPet(care.pet, care.tab) }, `Ver la página de ${care.pet.name}`),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Ya lo vi, ocultar por hoy', onClick: () => { const d = recall(DISMISS_KEY, {}); for (const k of Object.keys(d)) if (d[k] !== today) delete d[k]; d[care.key] = today; keep(DISMISS_KEY, d); node.remove(); } }, icon('x', { size: 16 }))));
  return { node, pet: care.pet };
}

/** Inicio: every pet peeks over a different card (the one who needs care, with its bubble). */
export async function decorateHome(body) {
  if (!body) return;
  if (!(await showPets())) return;
  const pets = await livePets();
  if (!pets.length || !body.isConnected) return;
  const cards = [...body.children].filter((c) => c.classList?.contains('card') && !c.classList.contains('counter-card') && solidCard(c));
  // Inicio "Sereno" (v0.19.0) has fewer cards: when there are more pets than cards, the counter takes one too.
  const counter = body.querySelector(':scope > .counter-card');
  if (cards.length < pets.length && counter && solidCard(counter)) cards.unshift(counter);
  if (!cards.length) return;
  const records = await db.query('petRecords').catch(() => []);
  const care = careBubble(pets, records, util.localDay());
  // Spread them down the screen: one every other card, starting on a different card each day.
  const day = Number(util.localDay().replace(/-/g, ''));
  const step = Math.max(1, Math.floor(cards.length / pets.length));
  const order = care ? [care.pet, ...pets.filter((p) => p !== care.pet)] : pets;
  order.forEach((pet, n) => {
    const card = cards[(n * step + (care && n === 0 ? 0 : day % 2)) % cards.length];
    if (!card || card.closest('.kitty-perch')) return;
    const k = perch(card, pet, pets.indexOf(pet), { side: [0.78, 0.2, 0.55, 0.36, 0.66][n % 5] });
    if (care && n === 0) { k.closest('.kitty-perch').before(care.node); setTimeout(() => { if (k.isConnected) move(k); }, 600); }
  });
}

/** Any other screen: one pet, different per screen and day, peeking over a card or asleep at the end. */
export async function companion(node, id) {
  if (!node || !id || SKIP.has(id) || node.querySelector('.kitty-perch, .kitty-nap')) return;
  if (!(await showPets())) return;
  const pets = await livePets();
  if (!pets.length || !node.isConnected) return;
  const h = hash(`${id}|${util.localDay()}`);
  const index = h % pets.length; const pet = pets[index];
  // Cards, and the pill switch on top of a screen (Para ti · Escribimos…), are good places to peek from.
  const cards = [...node.querySelectorAll('.card, .segmented')].filter((c) => solidCard(c) && /flex|grid|block/.test(getComputedStyle(c.parentElement).display) && c.parentElement.children.length > 1).slice(0, 6);
  if (cards.length && (h >>> 4) % 3 !== 0) {
    perch(cards[(h >>> 8) % cards.length], pet, index, { side: [0.78, 0.22, 0.6][(h >>> 12) % 3] });
  } else {
    node.append(nap(pet, index));
  }
}

// ---------- strolls ----------
const seen = new Set();
/**
 * Now and then a pet walks into a scene (Juegos, Mi espacio, the garden), sits a moment and leaves.
 * `scope` names the place (one stroll per place per session). Tap it and it talks and purrs.
 */
export async function stroll(scene, scope, { chance = 0.6, delay = 1800, flow = false } = {}) {
  if (!scene || seen.has(scope)) return;
  seen.add(scope);
  if (Math.random() > chance) return;
  await new Promise((r) => setTimeout(r, delay)); // let the page settle first
  const pets = await livePets().catch(() => []);
  if (!pets.length || !scene.isConnected) return;
  const i = Math.floor(Math.random() * pets.length); const pet = pets[i];
  // flow: a little path opens under the card's content, so the pet never covers text or buttons.
  const lane = el('div', { class: `kitty-lane${flow ? ' is-flow' : ''}`, 'data-bubble-root': '' });
  let stay = false;
  const k = kittyButton(pet, { index: i, label: false, onTap: (_, h) => { stay = true; react(h, 'pet'); } });
  k.classList.add('kitty-walker');
  lane.append(k); scene.append(lane);
  if (flow) { void lane.offsetHeight; lane.classList.add('is-open'); }
  const w = lane.clientWidth || 300;
  const size = k.offsetWidth || 52;
  const stop = Math.round(w * (0.35 + Math.random() * 0.3));
  if (util.prefersReducedMotion() || !k.animate) {
    k.style.transform = `translateX(${stop}px)`;
    setTimeout(() => lane.remove(), 15000); // it sits a while and then it is gone, no walking
    return;
  }
  const walk = (from, to, ms) => { k.classList.add('is-walking'); if (to < from) k.classList.add('is-left'); else k.classList.remove('is-left'); const a = k.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }); return a.finished.then(() => k.classList.remove('is-walking')); };
  const fromLeft = Math.random() < 0.5;
  const start = fromLeft ? -size - 8 : w + 8;
  try {
    await walk(start, stop, 4200);
    await new Promise((r) => setTimeout(r, 7000));
    while (stay && lane.isConnected) { stay = false; await new Promise((r) => setTimeout(r, 6000)); }
    if (!lane.isConnected) return;
    await walk(stop, fromLeft ? w + 8 : -size - 8, 3800);
  } catch { /* the page changed */ }
  if (flow && lane.isConnected) { lane.classList.remove('is-open'); await new Promise((r) => setTimeout(r, 320)); }
  lane.remove();
}
