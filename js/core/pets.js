// Mascotas de papel (v0.14.0, option A chosen 2026-11-22): each origami creature has a name and its
// own personality. Tap one and it moves and says something; when two share a scene, the other one
// answers. Names can be changed in Ajustes > Apariencia (stored in settings 'paperPets', synced).
// Lines are short, kind and never about the phone or controlling the other ("conectar, no desconectar").
import * as db from './db.js';
import * as profile from './profile.js';
import { el, haptic, prefersReducedMotion } from './util.js';

export const PETS = {
  panda: { name: 'Jorge', kind: 'el panda', trait: 'Tranquilo y dormilón, experto en abrazos y en bambú.' },
  fox: { name: 'Kitsu', kind: 'el zorro', trait: 'Pícaro y competitivo: siempre quiere la revancha.' },
  cat: { name: 'Mochi', kind: 'la gata', trait: 'Elegante y un poco diva; da consejos de amor sin que se los pidan.' },
  rabbit: { name: 'Dango', kind: 'el conejo', trait: 'Tímido y tierno; se emociona con todo.' },
  tanuki: { name: 'Ponpoko', kind: 'el tanuki', trait: 'Bromista y glotón; siempre está pensando en comida.' },
  crane: { name: 'Hana', kind: 'la grulla', trait: 'Sabia y poética; habla de deseos y de cuidar lo bonito.' },
};

// {p} = the person using the app, {o} = their partner.
const LINES = {
  panda: ['Zzz… ¡ah, hola! Estaba soñando con bambú.', 'Un abrazo largo arregla casi todo. Pruébalo con {o}.', 'Hoy es buen día para no hacer nada… juntos.', '¿Me compartes una galleta? Prometo no contarle a {o}.', 'Me gusta cuando están los dos aquí.', 'Respira hondo. Ahora dale un abrazo a {o}.'],
  fox: ['¿Revancha? Yo digo que {p} gana la próxima.', 'Psst… la Liga de este mes todavía está abierta.', '¡Te reto a que hoy hagas reír a {o}!', 'Jeje, me escondí en tu pantalla.', 'El que pierde invita el helado. Son las reglas.', 'Tengo un plan secreto para el sábado… pregúntame luego.'],
  cat: ['Miau. ¿Ya le escribiste algo bonito a {o} hoy?', 'Un mensaje bonito no cuesta nada.', 'Acaríciame suave, que hoy amanecí elegante.', 'El amor se riega como las plantas: un poquito cada día.', 'Yo no persigo a nadie. Bueno… a veces a {o}.', 'Los detalles pequeños son los que más ronronean.'],
  rabbit: ['¡Ay! Me asustaste… pero me gustó.', '¿Hoy pasó algo lindo? ¡Cuéntame, cuéntame!', '¿Guardamos un recuerdo nuevo? Me encantan las fotos.', 'Brinco de felicidad cuando {p} y {o} están juntos.', '¿Me das una zanahoria? Bueno, un abrazo también sirve.', 'Shh… creo que {o} está pensando en ti.'],
  tanuki: ['¿Hay comida? Huelo a plan de cena.', '¡Pon-pon! Toqué mi panza como tambor.', 'Idea: cocinen algo juntos y yo pruebo.', 'Me disfracé de hoja. ¿No me viste?', 'Un antojo compartido sabe el doble.', 'Si el sábado no hay plan, yo propongo arepas.'],
  crane: ['Mil grullas cumplen un deseo. ¿Cuál es el de ustedes?', 'Lo que se cuida, florece.', 'Escríbanse algo hoy; las palabras vuelan conmigo.', 'Un paseo lento también es una aventura.', 'Guarden este día: algún día será un bonito recuerdo.', 'El viento de hoy dice que {o} sonríe al pensarte.'],
};
// What the second creature answers when both are on screen.
const REPLIES = {
  panda: ['Mmm… sí, sí. Y luego una siesta.', 'Estoy de acuerdo, pero con abrazo incluido.'],
  fox: ['¡Eso suena a reto! Acepto.', 'Jeje, yo lo hubiera dicho mejor.'],
  cat: ['Obviamente. Yo lo dije primero.', 'Mmm, aprobado por la gata.'],
  rabbit: ['¡Sí, sí, sí! ¡Qué emoción!', 'Yo también quiero… ¿puedo?'],
  tanuki: ['¿Y eso viene con comida?', '¡Pon-pon! Me apunto.'],
  crane: ['Que así sea, como un deseo en el bambú.', 'Bonito. Lo llevaré en mis alas.'],
};

let names = {};
/** Loads the custom names once (Ajustes > Apariencia). Safe to call many times. */
export async function load() {
  try { names = (await db.getSettings('paperPets', { names: {} })).names || {}; } catch { names = {}; }
  return names;
}
export const nameOf = (id) => (names[id] || PETS[id]?.name || '').trim() || PETS[id]?.name || '';
export async function saveNames(next) { names = { ...names, ...next }; await db.setSettings('paperPets', { names }); }

const fill = (t) => t.replace(/\{p\}/g, profile.nick(profile.active()) || 'tú').replace(/\{o\}/g, profile.nick(profile.partnerOf(profile.active())) || 'tu amor');
const pick = (arr, avoid) => { const list = arr.filter((x) => x !== avoid); return list[Math.floor(Math.random() * list.length)] || arr[0]; };
const last = {};

// The bubble lives on the nearest [data-bubble-root] (the scene, which clips its drawings), above the creature.
export function bubble(host, who, text, { ms = 4200 } = {}) {
  const root = host.closest('[data-bubble-root]') || host;
  root.querySelectorAll('.pet-bubble').forEach((x) => x.remove()); // one voice at a time, like a dialogue
  const b = el('span', { class: 'pet-bubble', role: 'status', 'data-for': host.dataset.petId }, el('strong', {}, `${who}: `), text);
  if (root !== host) {
    const r = root.getBoundingClientRect(); const h = host.getBoundingClientRect();
    const x = Math.min(Math.max(h.left - r.left + h.width * 0.3, 8), Math.max(8, r.width - 236));
    b.style.left = `${x}px`; b.style.bottom = `${r.bottom - h.top - 8}px`;
  }
  root.append(b);
  clearTimeout(host._bubbleT);
  host._bubbleT = setTimeout(() => { b.classList.add('is-leaving'); setTimeout(() => b.remove(), 300); }, ms);
}
export function move(host) {
  if (prefersReducedMotion()) return;
  host.classList.remove('is-poked'); void host.offsetWidth; host.classList.add('is-poked');
  setTimeout(() => host.classList.remove('is-poked'), 1000);
}

/** Make a creature wrapper interactive: a button with its name that moves and talks when tapped. */
export function wire(host, id, { partners = [] } = {}) {
  if (!PETS[id]) return host;
  host.classList.add('pet', `pet-${id}`);
  host.dataset.petId = `${id}-${Math.random().toString(36).slice(2, 7)}`;
  host.setAttribute('role', 'button');
  host.setAttribute('tabindex', '0');
  host.setAttribute('aria-label', `${nameOf(id)}, ${PETS[id].kind}. Tócalo para hablar`);
  host.removeAttribute('aria-hidden');
  const poke = () => {
    haptic(10);
    move(host);
    last[id] = pick(LINES[id], last[id]);
    bubble(host, nameOf(id), fill(last[id]));
    // A friend on the same scene answers after a moment.
    const other = partners.map((p) => p()).find(Boolean);
    if (other && other.host !== host) setTimeout(() => { move(other.host); bubble(other.host, nameOf(other.id), fill(pick(REPLIES[other.id]))); }, 2600);
  };
  host.addEventListener('click', poke);
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });
  return host;
}
