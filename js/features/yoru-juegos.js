// Games of the Rincón privado (docs/05 §33 c-d and the end of §34). Every game:
// - starts with the consent of both (one tap each) and shows the level of today (the lower one);
// - keeps "Pausa", "Cambiar" and "Parar" always visible ("Parar" closes everything at once and
//   goes to the rest screen); any card can be skipped without a reason;
// - draws without repeating until a deck is exhausted (one history for all the corner), with
//   favorites and "no repetir nunca", themed decks and the combinatorial generator;
// - has rests between intensities (breathing, water, cuddles and care questions) and ends with
//   an optional 1 to 5 rating and a diary note.
// Texts come only from the packs the couple imported (never from the repository).
import { ui, util, db, profile, router } from '../core.js';
import * as V from '../core/vault.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const CARD_KINDS = ['pregunta', 'reto', 'sintocar', 'mimos'];

export const GAMES = [
  { id: 'preguntas', title: 'Preguntas', icon: 'message-circle-question', blurb: 'Conocerse, deseos y recuerdos.', kinds: ['pregunta'] },
  { id: 'retos', title: 'Retos con tiempo', icon: 'timer', blurb: 'Con anillo de tiempo y generador.', kinds: ['reto'], gen: true },
  { id: 'verdad', title: 'Verdad o reto', icon: 'arrow-left-right', blurb: 'Cada uno elige en su turno.', kinds: ['pregunta', 'reto'], needAll: true },
  { id: 'cartas', title: 'Cartas', icon: 'layers', blurb: 'Boca abajo; tócala para voltear.', kinds: CARD_KINDS },
  { id: 'sintocar', title: 'Sin tocar', icon: 'eye', blurb: 'Miradas, susurros y cartas.', kinds: ['sintocar'] },
  { id: 'mimos', title: 'Masajes y mimos', icon: 'hand-heart', blurb: 'Guiados, por turnos y con tiempo.', kinds: ['mimos'] },
  { id: 'hablemos', title: 'Hablemos', icon: 'message-square', blurb: 'Lo que les gusta, dicho con calma.', kinds: ['hablemos'] },
  { id: 'rol', title: 'Rol de citas', icon: 'drama', blurb: 'Personajes y escenas románticas.', kinds: ['rol'] },
  { id: 'cita', title: 'Cita en casa', icon: 'moon-star', blurb: 'Guion, ambiente y música.', kinds: ['cita'] },
  { id: 'dados', title: 'Dados', icon: 'dices', blurb: 'Acción, lugar y estilo.', dice: true },
  { id: 'dadoscastigo', title: 'Dados con castigo', icon: 'dices', blurb: 'Quien saca menos, cumple.', dice: true },
  { id: 'ruleta', title: 'Ruleta', icon: 'loader-pinwheel', blurb: 'Que decida la ruleta.', kinds: ['reto', 'mimos', 'sintocar'], min: 3 },
  { id: 'oculta', title: 'Carta oculta', icon: 'eye-off', blurb: 'Cada uno elige en secreto.', kinds: ['reto', 'mimos', 'sintocar'], min: 3 },
  { id: 'cadena', title: 'Retos encadenados', icon: 'flame', blurb: 'Uno tras otro, subiendo.', kinds: ['reto'], gen: true },
  { id: 'prendas', title: 'Juego de prendas', icon: 'sparkles', blurb: 'Responde o paga prenda.', kinds: ['pregunta', 'prenda'], needAll: true },
];
export const gameTitle = (id) => GAMES.find((g) => g.id === id)?.title || id;

/** Does the imported content feed this game? */
export function hasContent(g, lib) {
  if (g.dice) return DICE.every((f) => (lib.dice[f] || []).length >= 2);
  const counts = (g.kinds || []).map((k) => lib.items.filter((i) => i.kind === k).length);
  if (g.gen && lib.gen.templates.length) return true;
  if (g.needAll) return counts.every((n) => n > 0);
  return counts.reduce((a, b) => a + b, 0) >= (g.min || 1);
}
const DICE = ['accion', 'lugar', 'estilo'];

// ---------- play ----------
export async function play(page, id, ctx) {
  const game = GAMES.find((g) => g.id === id);
  if (!game) { router.go('/yoru', { replace: true }); return null; }
  const [s, lib, st] = await Promise.all([V.getSettings(), V.library(), V.getState()]);
  const S = {
    game, s, lib, st, max: V.maxLevel(s), merged: V.mergeLimits(s.limits), deck: '', favOnly: false, ramp: !!s.ramp,
    cards: 0, step: 0, levels: new Set(), timer: null, paused: false, ended: false, ctx,
    onChange: null, cleanups: [],
  };
  S.band = () => V.levelBand(S.max, { ramp: S.ramp, step: S.step });
  const body = el('div', { class: 'game-body yoru-game' });
  add(page, ui.pageHeader({ title: game.title, back: '/yoru' }), body);
  S.body = body;
  if (!hasContent(game, lib)) {
    add(body, ui.emptyState({ title: 'Este juego no tiene cartas todavía', text: 'Carguen contenido para este modo en Contenido.', art: 'moon', action: { label: 'Ir a Contenido', onClick: () => router.go('/yoru/contenido') } }));
    return null;
  }
  setup(S);
  return () => { S.ended = true; S.timer?.stop?.(); S.cleanups.forEach((f) => f()); };
}

/** Consent of both before every game, level of today and the deck. */
function setup(S) {
  const c = { sofia: false, david: false };
  const go = el('div', { class: 'btn-row center-row' });
  const btn = (p) => {
    const b = el('button', { class: 'consent-btn', type: 'button', 'aria-pressed': 'false', onClick: () => { c[p] = !c[p]; b.setAttribute('aria-pressed', String(c[p])); util.haptic(8); paint(); } },
      el('span', { class: 'consent-avatar', 'aria-hidden': 'true' }, (profile.name(p) || '?').slice(0, 1)),
      el('span', { class: 'consent-text' }, el('strong', {}, profile.name(p)), el('span', {}, 'Quiero jugar')),
      el('span', { class: 'consent-check', 'aria-hidden': 'true' }, icon('check', { size: 20 })));
    return b;
  };
  const paint = () => put(go, c.sofia && c.david
    ? ui.button({ label: 'Empezar', iconName: 'play', variant: 'primary', onClick: () => start(S) })
    : el('p', { class: 'muted small' }, 'Los dos tocan su nombre para empezar.'));
  const decks = S.lib.decks.filter((d) => S.lib.items.some((i) => i.deck === d.id && (S.game.kinds || []).includes(i.kind)));
  const deckOptions = [{ value: '', label: 'Todo' }, ...decks.map((d) => ({ value: d.id, label: d.label })), ...(S.st.fav.length && !S.game.dice ? [{ value: '__fav', label: 'Favoritas' }] : [])];
  const usesDeck = !S.game.dice && !['cita', 'cadena'].includes(S.game.id);
  put(S.body,
    el('div', { class: 'game-intro stack' },
      el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon(S.game.icon, { size: 44 })),
      el('p', { class: 'game-intro-blurb' }, S.game.blurb),
      el('p', { class: 'yoru-today' }, `Nivel de hoy: hasta ${S.max} · ${S.ctx.levelName(S.max)}`),
      usesDeck && deckOptions.length > 1 ? ui.field({ label: 'Mazo', control: ui.segmented({ label: 'Mazo', value: '', options: deckOptions, onChange: (v) => { S.favOnly = v === '__fav'; S.deck = v === '__fav' ? '' : v; } }) }) : null,
      usesDeck ? ui.toggle({ label: 'Subir poco a poco', hint: 'Un nivel por tramo, con descanso antes.', checked: S.ramp, onChange: (v) => { S.ramp = v; } }) : null,
      el('div', { class: 'consent-row' }, profile.PEOPLE.map(btn)),
      go,
      el('p', { class: 'muted small center' }, 'Cualquier carta se puede saltar sin explicar nada.')));
  paint();
}

// ---------- the always-visible bar ----------
function controlBar(S) {
  const bar = el('div', { class: 'yoru-bar', role: 'toolbar', 'aria-label': 'Control del juego' },
    el('button', { class: 'yoru-bar-btn', type: 'button', onClick: () => pause(S) }, icon('pause', { size: 20 }), el('span', {}, 'Pausa')),
    el('button', { class: 'yoru-bar-btn', type: 'button', onClick: () => { S.timer?.stop?.(); S.onChange?.(); } }, icon('refresh-cw', { size: 20 }), el('span', {}, 'Cambiar')),
    el('button', { class: 'yoru-bar-btn is-stop', type: 'button', onClick: () => stop(S) }, icon('x', { size: 20 }), el('span', {}, 'Parar')));
  return bar;
}

function pause(S) {
  if (S.paused || S.ended) return;
  S.paused = true;
  S.timer?.pause?.();
  const layer = el('div', { class: 'yoru-pause', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'En pausa' },
    el('div', { class: 'stack center-col' },
      breathing(),
      el('h2', { class: 'card-title' }, 'En pausa'),
      el('p', { class: 'muted center' }, 'Tómense el tiempo que quieran.'),
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Seguir', iconName: 'play', variant: 'primary', onClick: () => { layer.remove(); S.paused = false; } }),
        ui.button({ label: 'Parar', iconName: 'x', variant: 'ghost', onClick: () => { layer.remove(); S.paused = false; stop(S); } }))));
  S.body.append(layer);
  layer.querySelector('button')?.focus();
}

function stop(S) {
  if (S.ended) return;
  S.ended = true;
  S.timer?.stop?.();
  endScreen(S, { stopped: true });
}

const breathing = () => el('div', { class: 'yoru-breath', 'aria-hidden': 'true' }, el('span', { class: 'yoru-breath-ring' }), el('span', { class: 'yoru-breath-text' }));

/** Rest between intensities: breathing, water, cuddles and care questions. */
function rest(S, { nextLevel = null } = {}) {
  return new Promise((resolve) => {
    S.onChange = null;
    put(S.area,
      el('div', { class: 'card stack center-col yoru-rest' },
        breathing(),
        el('h2', { class: 'card-title', tabindex: '-1' }, 'Un descanso'),
        el('p', { class: 'muted center' }, 'Respiren juntos: inhalen mientras el círculo crece y suelten el aire mientras baja.'),
        el('ul', { class: 'plain-list yoru-care' },
          el('li', {}, icon('droplet', { size: 18 }), el('span', {}, 'Un vaso de agua para cada uno.')),
          el('li', {}, icon('heart', { size: 18 }), el('span', {}, 'Un abrazo largo, sin prisa.')),
          el('li', {}, icon('message-circle-question', { size: 18 }), el('span', {}, '¿Cómo se sienten? ¿Qué les está gustando? ¿Quieren cambiar algo?'))),
        nextLevel != null ? el('p', { class: 'yoru-today' }, `Si siguen: nivel ${nextLevel} · ${S.ctx.levelName(nextLevel)}`) : null,
        el('div', { class: 'btn-row center-row' },
          ui.button({ label: 'Seguir', iconName: 'play', variant: 'primary', onClick: () => resolve(true) }),
          ui.button({ label: 'Terminar aquí', variant: 'ghost', onClick: () => { resolve(false); stop(S); } }))));
    S.area.querySelector('h2')?.focus();
  });
}

/** End: care questions, optional rating and diary note. */
function endScreen(S, { stopped = false } = {}) {
  S.cleanups.forEach((f) => f()); S.cleanups = [];
  let rating = 0; let mood = '';
  const st = K.stars({ value: 0, label: 'Cómo les fue, de 1 a 5', onChange: (n) => { rating = n; } });
  const note = ui.textarea({ rows: 2, maxlength: 400, placeholder: 'Una nota corta (opcional)' });
  const level = S.levels.size ? Math.max(...S.levels) : S.max;
  put(S.body,
    el('div', { class: 'card stack center-col yoru-end' },
      breathing(),
      el('h2', { class: 'card-title', tabindex: '-1' }, stopped ? 'Paramos aquí' : '¡Terminaron!'),
      el('p', { class: 'muted center' }, stopped ? 'Está bien parar. Un abrazo, agua y un rato tranquilos.' : 'Un abrazo, agua y un rato tranquilos.'),
      el('ul', { class: 'plain-list yoru-care' },
        el('li', {}, '¿Cómo se sintieron?'), el('li', {}, '¿Qué les gustó?'), el('li', {}, '¿Qué cambiarían para la próxima?')),
      ui.field({ label: 'Cómo les fue (opcional)', control: st.node }),
      ui.field({ label: 'Ánimo (opcional)', control: ui.segmented({ label: 'Ánimo', value: '', options: [{ value: 'felices', label: 'Felices' }, { value: 'tranquilos', label: 'Tranquilos' }, { value: 'con-ganas', label: 'Con ganas de más' }, { value: 'cansados', label: 'Cansados' }], onChange: (v) => { mood = v; } }) }),
      ui.field({ label: 'Nota (opcional)', control: note }),
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Guardar en el diario', iconName: 'notebook-pen', variant: 'primary', onClick: async () => {
          await V.saveLog({ date: util.localDay(), level, game: S.game.id, rating, mood, note: note.value.trim(), by: profile.active() });
          ui.toast('Guardado en el diario.', { tone: 'success' }); router.go('/yoru');
        } }),
        ui.button({ label: 'Salir sin guardar', variant: 'ghost', href: '#/yoru' }))));
  S.body.querySelector('h2')?.focus();
}

// ---------- drawing ----------
async function draw(S, kinds, { gen = false, band = null } = {}) {
  const kindsArr = [].concat(kinds);
  const b = band || S.band();
  const opts = { kind: kindsArr, merged: S.merged, never: S.st.never, deck: S.deck, favorites: S.favOnly ? S.st.fav : null };
  let list = V.pool(S.lib.items, { ...opts, band: b });
  if (!list.length && !band) list = V.pool(S.lib.items, { ...opts, band: [0, S.max] });
  const canGen = gen && S.lib.gen.templates.length && !S.favOnly && !S.deck;
  if (canGen && (!list.length || Math.random() < 0.34)) {
    const g = V.generate(S.lib.gen, { band: b, merged: S.merged, usedKeys: S.st.combos });
    if (g) { S.st.combos = [...(S.st.combos || []), g.key].slice(-2000); await V.setState(S.st); S.levels.add(g.item.level); return g.item; }
  }
  if (!list.length) return null;
  const r = V.pickUnused(list, S.st.used?.all || []);
  if (r.reset) ui.toast('Ya salieron todas las de este mazo: empezamos otra vez.');
  S.st.used = { ...(S.st.used || {}), all: r.used };
  await V.setState(S.st);
  S.levels.add(r.item.level);
  return r.item;
}

/** n different items without marking them used (wheel, hidden card). */
function sample(S, kinds, n) {
  const list = V.pool(S.lib.items, { kind: kinds, band: [0, S.max], merged: S.merged, never: S.st.never, deck: S.deck, favorites: S.favOnly ? S.st.fav : null });
  const used = new Set(S.st.used?.all || []);
  const fresh = K.shuffle(list.filter((i) => !used.has(i.id)));
  const old = K.shuffle(list.filter((i) => used.has(i.id)));
  return [...fresh, ...old].slice(0, n);
}
async function markUsed(S, item) {
  if (!item || item.generated) return;
  S.st.used = { ...(S.st.used || {}), all: [...(S.st.used?.all || []), item.id].slice(-4000) };
  S.levels.add(item.level);
  await V.setState(S.st);
}

/** Count a shown card; returns false if they chose to end at a rest. */
async function counted(S) {
  S.cards++;
  const every = Math.max(3, S.s.restEvery || 6);
  if (S.cards % every !== 0) return true;
  const before = S.band()[1];
  S.step++;
  const after = S.band()[1];
  return rest(S, { nextLevel: S.ramp && after !== before ? after : null });
}

// ---------- shared pieces ----------
const kindLabel = (k) => V.KINDS[k] || '';
function face(S, item, { who = null } = {}) {
  return el('div', { class: 'yoru-face' },
    el('span', { class: 'yoru-face-kicker' }, [who ? `Para ${profile.name(who)}` : kindLabel(item.kind), `Nivel ${item.level}`].join(' · ')),
    item.title ? el('strong', { class: 'yoru-face-title' }, item.title) : null,
    item.text ? el('p', { class: 'yoru-face-text' }, item.text) : null);
}

function itemActions(S, item) {
  if (!item || item.generated) return null;
  const fav = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.st.fav.includes(item.id)), onClick: async () => {
    const on = !S.st.fav.includes(item.id);
    S.st.fav = on ? [...S.st.fav, item.id] : S.st.fav.filter((x) => x !== item.id);
    fav.setAttribute('aria-pressed', String(on)); await V.setState(S.st);
  } }, icon('heart', { size: 16 }), ' Favorita');
  const never = el('button', { class: 'chip', type: 'button', onClick: async () => {
    S.st.never = [...new Set([...S.st.never, item.id])]; await V.setState(S.st);
    ui.toast('No vuelve a salir.'); S.onChange?.();
  } }, icon('eye-off', { size: 16 }), ' No repetir nunca');
  return el('div', { class: 'chip-row chip-wrap center-row' }, fav, never);
}

function timerFor(S, secs, label = 'Tiempo') {
  if (!secs) { S.timer = null; return null; }
  const t = K.timer({ seconds: secs, label });
  S.timer = t;
  const startBtn = ui.button({ label: 'Empezar tiempo', iconName: 'timer', variant: 'secondary', small: true, onClick: () => { if (S.paused) return; t.start(); startBtn.hidden = true; } });
  return el('div', { class: 'stack center-col' }, t.node, startBtn);
}

function shell(S) {
  S.area = el('div', { class: 'stack yoru-area' });
  const progress = el('p', { class: 'muted small center yoru-progress', 'aria-live': 'polite' });
  S.setProgress = (t) => { progress.textContent = t; };
  put(S.body, progress, S.area, controlBar(S));
}

function start(S) {
  shell(S);
  S.turn = profile.active();
  S.nextTurn = () => { S.turn = profile.partnerOf(S.turn); };
  const run = {
    preguntas: deckGame, retos: deckGame, sintocar: deckGame, mimos: deckGame, hablemos: deckGame, rol: deckGame, cartas: deckGame,
    verdad: truthGame, cita: dateGame, dados: diceGame, dadoscastigo: diceGame, ruleta: wheelGame, oculta: hiddenGame, cadena: chainGame, prendas: forfeitGame,
  }[S.game.id];
  run(S);
}

// ---------- deck games (preguntas, retos, sin tocar, mimos, hablemos, rol, cartas) ----------
function deckGame(S) {
  const g = S.game;
  const faceDown = g.id === 'cartas';
  const turnBased = ['retos', 'mimos', 'rol', 'sintocar'].includes(g.id);
  const next = async () => {
    if (S.ended) return;
    const item = await draw(S, g.kinds, { gen: !!g.gen });
    if (!item) { put(S.area, ui.emptyState({ title: 'No hay cartas para hoy', text: 'Con el nivel y los límites de hoy no queda ninguna en este mazo.', art: 'moon' })); return; }
    S.onChange = () => next();
    const stage = K.cardStage({ label: 'Carta', onSwipe: () => advance() });
    const secs = item.secs || (g.id === 'mimos' ? 120 : 0);
    put(S.area,
      turnBased ? el('p', { class: 'yoru-turn' }, `Le toca a ${profile.name(S.turn)}`) : null,
      stage.node,
      faceDown ? el('p', { class: 'muted small center' }, 'Tóquenla para voltearla.') : null,
      timerFor(S, secs, g.id === 'mimos' ? 'Tiempo de mimos' : 'Tiempo del reto'),
      itemActions(S, item),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: () => advance() })));
    const card = stage.show(face(S, item), { faceDown });
    if (faceDown) card.addEventListener('click', () => stage.flip(true), { once: true });
    S.setProgress(`Carta ${S.cards + 1}`);
  };
  const advance = async () => {
    S.timer?.stop?.();
    if (turnBased) S.nextTurn();
    if (await counted(S)) next();
  };
  next();
}

// ---------- verdad o reto ----------
function truthGame(S) {
  const choose = () => {
    if (S.ended) return;
    S.onChange = null;
    put(S.area, el('div', { class: 'stack center-col' },
      el('p', { class: 'yoru-turn' }, `${profile.name(S.turn)}, ¿verdad o reto?`),
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Verdad', iconName: 'message-circle-question', variant: 'secondary', onClick: () => show('pregunta') }),
        ui.button({ label: 'Reto', iconName: 'timer', variant: 'primary', onClick: () => show('reto') }))));
    S.setProgress(`Ronda ${S.cards + 1}`);
  };
  const show = async (kind) => {
    const item = await draw(S, kind, { gen: kind === 'reto' });
    if (!item) { ui.toast('No quedan de ese tipo hoy.'); return; }
    S.onChange = () => show(kind);
    const stage = K.cardStage({ label: kind === 'pregunta' ? 'Verdad' : 'Reto', swipe: false });
    put(S.area, stage.node, timerFor(S, kind === 'reto' ? item.secs : 0), itemActions(S, item),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Listo', iconName: 'check', variant: 'primary', onClick: async () => { S.timer?.stop?.(); S.nextTurn(); if (await counted(S)) choose(); } })));
    stage.show(face(S, item, { who: S.turn }));
  };
  choose();
}

// ---------- cita en casa ----------
async function dateGame(S) {
  const songs = (await db.query('songs').catch(() => [])).filter((x) => !x.deleted && x.url).slice(0, 40);
  const pick = () => {
    S.onChange = null;
    const list = V.pool(S.lib.items, { kind: 'cita', band: [0, S.max], merged: S.merged, never: S.st.never });
    if (!list.length) { put(S.area, ui.emptyState({ title: 'No hay citas para hoy', text: 'Con el nivel y los límites de hoy no queda ninguna.', art: 'moon' })); return; }
    put(S.area, el('p', { class: 'yoru-turn' }, '¿Qué cita arman hoy?'),
      el('ul', { class: 'stack' }, list.map((c) => el('li', {}, el('button', { class: 'card card-link yoru-date-pick', type: 'button', onClick: () => runDate(c) },
        el('strong', {}, c.title || 'Cita'), el('span', { class: 'muted small' }, `Nivel ${c.level}${c.steps?.length ? ` · ${c.steps.length} pasos` : ''}`))))),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Al azar', iconName: 'dices', variant: 'secondary', onClick: () => runDate(list[Math.floor(Math.random() * list.length)]) })));
    S.setProgress('');
  };
  const runDate = async (c) => {
    await markUsed(S, c);
    const steps = c.steps?.length ? c.steps : [c.text].filter(Boolean);
    let i = 0;
    S.onChange = () => pick();
    const tracks = K.shuffle(songs).slice(0, 4);
    const paint = () => {
      put(S.area,
        el('div', { class: 'card stack' },
          el('strong', { class: 'yoru-face-title' }, c.title || 'Cita'),
          c.setting ? el('p', { class: 'muted' }, icon('sparkles', { size: 16 }), ' ', c.setting) : null,
          c.music || tracks.length ? el('div', { class: 'stack-tight' },
            el('span', { class: 'field-label' }, 'Música'),
            c.music ? el('p', { class: 'muted small' }, c.music) : null,
            tracks.length ? el('ul', { class: 'plain-list small' }, tracks.map((t) => el('li', {}, el('a', { href: t.url, target: '_blank', rel: 'noopener noreferrer' }, icon('music', { size: 14 }), ' ', t.title || 'Una de sus canciones')))) : null,
            el('a', { class: 'small', href: '#/canciones' }, 'Ver todas sus canciones')) : null),
        el('div', { class: 'card stack yoru-step' },
          el('span', { class: 'yoru-face-kicker' }, `Paso ${i + 1} de ${steps.length}`),
          el('p', { class: 'yoru-face-text' }, steps[i])),
        el('div', { class: 'btn-row center-row' },
          i > 0 ? ui.button({ label: 'Atrás', iconName: 'arrow-left', variant: 'ghost', onClick: () => { i--; paint(); } }) : null,
          i < steps.length - 1 ? ui.button({ label: 'Siguiente paso', iconName: 'arrow-right', variant: 'primary', onClick: () => { i++; paint(); } })
            : ui.button({ label: 'Terminar la cita', iconName: 'check', variant: 'primary', onClick: () => { S.ended = true; endScreen(S); } })));
      S.setProgress('');
    };
    paint();
  };
  pick();
}

// ---------- dados ----------
function rollFace(S, face) {
  const list = (S.lib.dice[face] || []).filter((x) => x.level <= S.max && V.passesLimits(x, S.merged));
  return list[Math.floor(Math.random() * list.length)] || null;
}
function dieBox(label) {
  const v = el('span', { class: 'yoru-die-value' });
  const box = el('div', { class: 'yoru-die', role: 'group', 'aria-label': label }, el('span', { class: 'yoru-die-label' }, label), v);
  return { box, set: (t) => { v.textContent = t; } };
}
async function rollAnim(dice, finals) {
  const reduced = util.prefersReducedMotion();
  dice.forEach((d) => d.box.classList.add('is-rolling'));
  if (!reduced) for (let k = 0; k < 8; k++) { dice.forEach((d, i) => d.set(finals[i].spin())); K.tick(); await util.sleep(90 + k * 12); }
  dice.forEach((d, i) => { d.set(finals[i].text); d.box.classList.remove('is-rolling'); });
  util.haptic([15, 30, 15]); K.ding();
}

function diceGame(S) {
  const castigo = S.game.id === 'dadoscastigo';
  const labels = { accion: 'Acción', lugar: 'Lugar', estilo: 'Estilo' };
  const roll = async () => {
    if (S.ended) return;
    S.onChange = () => roll();
    const picks = DICE.map((f) => rollFace(S, f));
    if (picks.some((p) => !p)) { put(S.area, ui.emptyState({ title: 'No hay caras para hoy', text: 'Con el nivel y los límites de hoy faltan caras en los dados.', art: 'moon' })); return; }
    picks.forEach((p) => S.levels.add(p.level));
    const dice = DICE.map((f) => dieBox(labels[f]));
    const who = el('p', { class: 'yoru-turn', 'aria-live': 'polite' });
    const numbers = castigo ? profile.PEOPLE.map((p) => dieBox(profile.name(p))) : [];
    put(S.area, who,
      castigo ? el('div', { class: 'yoru-dice yoru-dice-2' }, numbers.map((d) => d.box)) : null,
      el('div', { class: 'yoru-dice' }, dice.map((d) => d.box)),
      timerFor(S, 60, 'Tiempo'),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Otra tirada', iconName: 'dices', variant: 'primary', onClick: async () => { S.timer?.stop?.(); S.nextTurn(); if (await counted(S)) roll(); } })));
    if (castigo) {
      const n = profile.PEOPLE.map(() => 1 + Math.floor(Math.random() * 6));
      await rollAnim(numbers, n.map((x) => ({ text: String(x), spin: () => String(1 + Math.floor(Math.random() * 6)) })));
      const loser = n[0] === n[1] ? null : profile.PEOPLE[n[0] < n[1] ? 0 : 1];
      who.textContent = loser ? `Sacó menos ${profile.name(loser)}: le toca cumplir.` : 'Empate: lo hacen los dos.';
    } else who.textContent = `Le toca a ${profile.name(S.turn)}`;
    await rollAnim(dice, picks.map((p, i) => ({ text: p.text, spin: () => (rollFace(S, DICE[i])?.text || p.text) })));
    S.setProgress(`Tirada ${S.cards + 1}`);
  };
  roll();
}

// ---------- ruleta ----------
function wheelGame(S) {
  const spinRound = () => {
    if (S.ended) return;
    const items = sample(S, S.game.kinds, 8);
    if (items.length < 3) { put(S.area, ui.emptyState({ title: 'No hay suficientes cartas', text: 'La ruleta necesita al menos 3 para hoy.', art: 'moon' })); return; }
    S.onChange = () => spinRound();
    const short = (t) => (t.split(/\s+/).slice(0, 3).join(' '));
    const w = K.wheel(items.map((i, n) => `${n + 1}. ${short(i.title || i.text)}`), { size: Math.min(320, innerWidth - 48) });
    const result = el('div', { class: 'stack center-col', 'aria-live': 'polite' });
    const spin = ui.button({ label: 'Girar', iconName: 'loader-pinwheel', variant: 'primary', onClick: async () => {
      spin.disabled = true;
      const idx = await w.spin();
      const item = items[idx];
      await markUsed(S, item);
      put(result, el('div', { class: 'card yoru-result' }, face(S, item, { who: S.turn })), timerFor(S, item.secs || (item.kind === 'mimos' ? 120 : 0)), itemActions(S, item),
        ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: async () => { S.timer?.stop?.(); S.nextTurn(); if (await counted(S)) spinRound(); } }));
    } });
    put(S.area, el('p', { class: 'yoru-turn' }, `Gira ${profile.name(S.turn)}`), w.node, el('div', { class: 'btn-row center-row' }, spin), result);
    S.setProgress(`Giro ${S.cards + 1}`);
  };
  spinRound();
}

// ---------- carta oculta ----------
function hiddenGame(S) {
  const round = () => {
    if (S.ended) return;
    const items = sample(S, S.game.kinds, 3);
    if (items.length < 3) { put(S.area, ui.emptyState({ title: 'No hay suficientes cartas', text: 'Hacen falta 3 para hoy.', art: 'moon' })); return; }
    S.onChange = () => round();
    const choice = {};
    const order = [S.turn, profile.partnerOf(S.turn)];
    const pickFor = (k) => {
      const p = order[k];
      const opts = el('div', { class: 'stack' });
      const reveal = K.secret(el('ol', { class: 'yoru-options' }, items.map((i) => el('li', {}, i.title || i.text))), { hint: 'Mantén presionado para ver las 3' });
      put(opts, ...items.map((_, n) => ui.button({ label: `Elijo la ${n + 1}`, variant: 'secondary', onClick: () => { choice[p] = n; util.haptic(8); k === 0 ? handoff(1) : revealBoth(); } })));
      put(S.area, el('div', { class: 'stack center-col' },
        el('p', { class: 'yoru-turn' }, `${profile.name(p)} elige en secreto`),
        el('p', { class: 'muted small center' }, `${profile.name(profile.partnerOf(p))}, no mires.`),
        reveal, opts));
    };
    const handoff = (k) => put(S.area, el('div', { class: 'stack center-col' },
      el('div', { class: 'handoff-avatar', 'aria-hidden': 'true' }, (profile.name(order[k]) || '?').slice(0, 1)),
      el('p', { class: 'yoru-turn' }, `Pasa el teléfono a ${profile.name(order[k])}`),
      ui.button({ label: 'Listo, ya lo tengo', iconName: 'play', variant: 'primary', onClick: () => pickFor(k) })));
    const revealBoth = async () => {
      const same = choice[order[0]] === choice[order[1]];
      const chosen = same ? [items[choice[order[0]]]] : order.map((p) => items[choice[p]]);
      for (const c of chosen) await markUsed(S, c);
      const stage = el('div', { class: 'yoru-reveal' }, order.map((p) => el('div', { class: 'yoru-reveal-card' },
        el('span', { class: 'yoru-face-kicker' }, profile.name(p)), el('p', {}, `La ${choice[p] + 1}`))));
      put(S.area,
        el('p', { class: 'yoru-turn' }, '¡A la vez!'), stage,
        el('div', { class: 'card stack' }, el('strong', {}, same ? '¡Coinciden! Hacen esta:' : 'Eligieron distinto: hacen las dos, por turnos.'), ...chosen.map((c) => face(S, c))),
        el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Otra ronda', iconName: 'arrow-right', variant: 'primary', onClick: async () => { S.nextTurn(); if (await counted(S)) round(); } })));
      requestAnimationFrame(() => stage.classList.add('is-in')); K.ding();
    };
    handoff(0);
    S.setProgress(`Ronda ${S.cards + 1}`);
  };
  round();
}

// ---------- retos encadenados ----------
function chainGame(S) {
  const len = Math.max(3, S.s.chainLength || 5);
  const lo = Math.max(0, S.max - 2);
  let link = 0;
  const levelAt = (i) => Math.min(S.max, lo + Math.floor((i * (S.max - lo + 1)) / len));
  const next = async () => {
    if (S.ended) return;
    const lv = levelAt(link);
    const item = await draw(S, 'reto', { gen: true, band: [lv, lv] }) || await draw(S, 'reto', { gen: true, band: [0, S.max] });
    if (!item) { put(S.area, ui.emptyState({ title: 'No hay retos para hoy', text: 'Con el nivel y los límites de hoy no queda ninguno.', art: 'moon' })); return; }
    S.onChange = () => next();
    const dots = el('div', { class: 'yoru-chain', 'aria-label': `Reto ${link + 1} de ${len}` }, Array.from({ length: len }, (_, i) => el('span', { class: `yoru-chain-dot${i < link ? ' done' : i === link ? ' now' : ''}` })));
    const stage = K.cardStage({ label: 'Reto', swipe: false });
    put(S.area, dots, el('p', { class: 'yoru-turn' }, `Le toca a ${profile.name(S.turn)}`), stage.node, timerFor(S, item.secs || 60), itemActions(S, item),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: link < len - 1 ? 'Siguiente eslabón' : 'Cerrar la cadena', iconName: 'arrow-right', variant: 'primary', onClick: async () => {
        S.timer?.stop?.(); S.nextTurn(); link++;
        if (link >= len) { link = 0; if (await rest(S)) next(); return; }
        next();
      } })));
    stage.show(face(S, item));
    S.setProgress(`Eslabón ${link + 1} de ${len}`);
  };
  next();
}

// ---------- juego de prendas ----------
function forfeitGame(S) {
  const rounds = Math.max(4, S.s.prendasRounds || 8);
  let r = 0;
  const round = async () => {
    if (S.ended) return;
    if (r >= rounds) { S.ended = true; endScreen(S); return; }
    const q = await draw(S, 'pregunta');
    if (!q) { put(S.area, ui.emptyState({ title: 'No hay preguntas para hoy', text: 'Carguen preguntas o suban el nivel.', art: 'moon' })); return; }
    S.onChange = () => round();
    const stage = K.cardStage({ label: 'Pregunta', swipe: false });
    put(S.area, el('p', { class: 'yoru-turn' }, `${profile.name(S.turn)}: responde o paga prenda`), stage.node,
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Respondo', iconName: 'check', variant: 'primary', onClick: () => done() }),
        ui.button({ label: 'Pago prenda', iconName: 'sparkles', variant: 'secondary', onClick: () => forfeit() })));
    stage.show(face(S, q, { who: S.turn }));
    S.setProgress(`Ronda ${r + 1} de ${rounds}`);
  };
  const forfeit = async () => {
    const p = await draw(S, 'prenda');
    if (!p) { ui.toast('No hay prendas para hoy: cuenta como respondida.'); done(); return; }
    S.onChange = () => forfeit();
    const stage = K.cardStage({ label: 'Prenda', swipe: false });
    put(S.area, el('p', { class: 'yoru-turn' }, `Prenda para ${profile.name(S.turn)}`), stage.node, timerFor(S, p.secs), itemActions(S, p),
      el('p', { class: 'muted small center' }, 'Si no te gusta, "Cambiar" trae otra. También puedes decir que no.'),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Cumplida', iconName: 'check', variant: 'primary', onClick: () => done() })));
    stage.show(face(S, p, { who: S.turn }));
  };
  const done = async () => { S.timer?.stop?.(); S.nextTurn(); r++; if (await counted(S)) round(); };
  round();
}
