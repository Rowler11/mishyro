// Mascotas de papel (v0.14.0, option A chosen 2026-11-22): each origami creature has a name and its
// own personality. Tap one and it moves and says something; when two share a scene, the other one
// answers. Names can be changed in Ajustes > Apariencia (stored in settings 'paperPets', synced).
// Lines are short, kind and never about the phone or controlling the other ("conectar, no desconectar").
import * as db from './db.js';
import * as profile from './profile.js';
import { el, haptic, prefersReducedMotion } from './util.js';
import * as sounds from './sounds.js';

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

// v0.30.0 (Rowler): the bubble floats ABOVE the creature, like a speech balloon, with its tail
// pointing down at it. It lives on a fixed layer (never clipped by a card), never takes touches, and
// follows the creature while the page scrolls. Without room above, it goes below.
let layer = null;
const sayLayer = () => {
  if (layer?.isConnected) return layer;
  layer = el('div', { class: 'pet-say-layer', 'aria-live': 'polite' });
  document.body.append(layer);
  return layer;
};
const live = new Set();
function place(b) {
  const h = b._host;
  if (!h.isConnected) { b.remove(); live.delete(b); return; }
  const r = h.getBoundingClientRect();
  const w = b.offsetWidth; const bh = b.offsetHeight;
  const cx = r.left + r.width / 2;
  const x = Math.min(Math.max(cx - w / 2, 8), Math.max(8, innerWidth - w - 8));
  const below = r.top - bh - 12 < 56; // no room under the header: talk from below
  const y = below ? r.bottom + 10 : r.top - bh - 10;
  b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  b.style.setProperty('--tail-x', `${Math.round(Math.min(Math.max(cx - x, 16), w - 16))}px`);
  b.classList.toggle('is-below', below);
  const off = r.bottom < 0 || r.top > innerHeight;
  b.style.visibility = off ? 'hidden' : '';
}
let raf = 0;
const follow = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => live.forEach(place)); };
addEventListener('scroll', follow, { passive: true, capture: true });
addEventListener('resize', follow, { passive: true });

export function bubble(host, who, text, { ms = 4200, tone = '' } = {}) {
  // one voice per creature; in a dialogue the other one may still be talking
  live.forEach((x) => { if (x._host === host) { live.delete(x); x.remove(); } });
  const b = el('div', { class: `pet-bubble${tone ? ` is-${tone}` : ''}`, role: 'status' }, who ? el('strong', {}, `${who}: `) : null, text);
  b._host = host;
  sayLayer().append(b); live.add(b);
  place(b);
  clearTimeout(host._bubbleT);
  host._bubbleT = setTimeout(() => { b.classList.add('is-leaving'); setTimeout(() => { b.remove(); live.delete(b); }, 300); }, ms);
  return b;
}
/** Clears every bubble (route changes). */
export function hush() { live.forEach((b) => b.remove()); live.clear(); }

// ---------- long press (v0.30.0): a ring fills while holding, then the creature's card opens ----------
export const LONG_MS = 520;
export function longPress(host, onLong) {
  let t = 0; let fired = false; let start = null;
  const cancel = () => { clearTimeout(t); host.classList.remove('is-holding'); start = null; };
  host.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    fired = false; start = { x: e.clientX, y: e.clientY };
    host.classList.add('is-holding');
    t = setTimeout(() => { fired = true; host.classList.remove('is-holding'); haptic([14, 30, 22]); onLong(); }, LONG_MS);
  });
  host.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => host.addEventListener(ev, cancel));
  host.addEventListener('contextmenu', (e) => e.preventDefault());
  // the click that ends a long press does not also count as a tap
  host.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  host.addEventListener('keydown', (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); onLong(); } });
}

// ---------- two friends together (v0.30.0): short dialogues ----------
// {a} is who starts, {b} the other one, {p} the person using the app, {o} their partner.
const DIALOGUES = [
  ['Psst, {b}… ¿viste quién llegó?', '¡{p}! Disimula, que nos mira.', 'Hola, {p} 👋'],
  ['{b}, ¿hoy le toca abrazo a {o}?', 'Hoy y todos los días.', 'Bien dicho.'],
  ['Tengo hambre, {b}.', 'Tú siempre tienes hambre.', 'Es que pensar en el amor da hambre.'],
  ['¿Jugamos a las escondidas, {b}?', 'Cuenta hasta diez…', '…ocho, nueve, ¡diez! Te vi.'],
  ['{b}, ¿qué es lo más bonito de esta casa?', 'Fácil: {p} y {o} juntos.', 'Empate con la siesta.'],
  ['¿Le dejamos un mensaje a {o}?', 'Uno corto: "te quiere mucho".', '¿De parte de quién?', ],
  ['Hoy amanecí con ganas de bailar.', 'Yo con ganas de dormir.', 'Bailemos dormidos, {b}.'],
  ['{b}, ¿me guardas un secreto?', 'Claro.', '{p} sonríe cuando piensa en {o}.'],
  ['¿Cuántos días llevan juntos, {b}?', 'No sé contar tan alto.', 'Yo tampoco. ¡Son muchísimos!'],
  ['Shh… {b}, ¿escuchas?', '¿Qué cosa?', 'Dos corazones latiendo.'],
  ['Te reto a una carrera, {b}.', '¿Hasta dónde?', 'Hasta el abrazo de {o}.'],
  ['¿Sabes qué me gusta de ti, {b}?', '¿Qué?', 'Que siempre estás cuando te busco.'],
];
export function dialogue(a, b) {
  const d = DIALOGUES[Math.floor(Math.random() * DIALOGUES.length)];
  return d.map((line, i) => ({ who: i % 2 ? b : a, text: line.replace(/\{a\}/g, a.name).replace(/\{b\}/g, (i % 2 ? a : b).name) }));
}
/**
 * Two creatures on the same screen talk to each other: they lean in, their bubbles take turns and the
 * one listening blinks. `x` and `y` are { host, name, speak?(text) }. Resolves when it ends.
 */
export async function chat(x, y) {
  if (!x.host.isConnected || !y.host.isConnected) return;
  const lines = dialogue(x, y);
  const lean = (h, other) => { const a = h.getBoundingClientRect(); const c = other.getBoundingClientRect(); h.style.setProperty('--lean', a.left < c.left ? '6deg' : '-6deg'); h.classList.add('is-leaning'); };
  lean(x.host, y.host); lean(y.host, x.host);
  for (const [i, l] of lines.entries()) {
    if (!x.host.isConnected || !y.host.isConnected || document.hidden) break;
    const other = l.who === x ? y : x;
    l.who.host.classList.add('is-talking'); other.host.classList.remove('is-talking'); other.host.classList.add('is-listening');
    move(l.who.host, 'nod');
    bubble(l.who.host, l.who.name, fill(l.text), { ms: 3000, tone: i % 2 ? 'reply' : 'chat' });
    await new Promise((r) => setTimeout(r, 2600));
  }
  [x.host, y.host].forEach((h) => h.classList.remove('is-leaning', 'is-talking', 'is-listening'));
}

export function move(host, kind = 'poked') {
  if (prefersReducedMotion()) return;
  const cls = `is-${kind}`;
  host.classList.remove(cls); void host.offsetWidth; host.classList.add(cls);
  clearTimeout(host[`_${kind}T`]); host[`_${kind}T`] = setTimeout(() => host.classList.remove(cls), 1100);
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
    sounds.play(id);
    last[id] = pick(LINES[id], last[id]);
    bubble(host, nameOf(id), fill(last[id]));
    // A friend on the same screen answers after a moment.
    const other = partners.map((p) => p()).find(Boolean);
    if (other && other.host !== host) setTimeout(() => { if (!other.host.isConnected) return; move(other.host, 'nod'); sounds.play(other.id); bubble(other.host, nameOf(other.id), fill(pick(REPLIES[other.id])), { tone: 'reply' }); }, 2400);
  };
  host.addEventListener('click', poke);
  longPress(host, () => paperCard(id, host));
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });
  return host;
}

// ---------- the creature's card (long press) ----------
const PAPER_ACTS = {
  panda: ['Abrazo de oso', '¡Abrazo! Ahora dale uno a {o}.'], fox: ['Choca esos cinco', '¡Choca! Eres de mi equipo.'],
  cat: ['Rascar la barbilla', 'Prrr… vale, eres de mis favoritos.'], rabbit: ['Darle una zanahoria', '¡Ñam! Gracias, gracias.'],
  tanuki: ['Tocar su tambor', '¡Pon-pon-pon! Qué ritmo.'], crane: ['Pedir un deseo', 'Lo llevo volando. Que se cumpla.'],
};
export async function paperCard(id, host) {
  const { openModal } = await import('./ui.js');
  const { draw } = await import('./art.js');
  const [act, reply] = PAPER_ACTS[id] || ['Saludar', '¡Hola!'];
  const art = el('span', { class: 'pet-card-art' }, draw(id));
  let m;
  const doAct = () => { m.close(); setTimeout(() => { move(host, 'happy'); sounds.play(id); bubble(host, nameOf(id), fill(reply), { tone: 'chat' }); }, 220); };
  const talk = () => { m.close(); setTimeout(() => host.click(), 220); };
  m = openModal({
    title: nameOf(id), size: 'sm', className: 'pet-card-modal',
    body: el('div', { class: 'pet-card' }, art,
      el('p', { class: 'pet-card-kind' }, PETS[id].kind.replace(/^(el|la) /, '').replace(/^./, (c) => c.toUpperCase())),
      el('p', { class: 'pet-card-trait' }, PETS[id].trait),
      el('div', { class: 'pet-card-acts' },
        el('button', { class: 'btn btn-primary', type: 'button', onClick: doAct }, act),
        el('button', { class: 'btn btn-secondary', type: 'button', onClick: talk }, 'Que me hable')),
      el('p', { class: 'muted small' }, 'Su nombre se cambia en Ajustes › Apariencia. Mantén presionado a cualquier animalito para ver su ficha.')),
  });
}
