// Card games of the Juegos en pareja (docs/05 §34): Mímica, ¿Quién es más probable…?, Esto o aquello,
// Yo nunca, Adivina la canción and Cuentos a dos voces. One phone passed hand to hand: what only
// one may see sits behind "Mantén presionado para ver".
import { ui, util, db, profile } from '../core.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

export const scoredGames = ['mimica', 'probable', 'estooaquello', 'yonunca', 'cancion', 'cuentos'];
export const rules = {
  mimica: ['Quien actúa ve la palabra manteniendo presionado; el otro no mira.', 'Sin hablar ni hacer sonidos. 60 segundos por turno.', 'Si te adivinan, ganas 1 punto.'],
  probable: ['Uno lee la pregunta en voz alta.', 'A la de tres, los dos señalan a quien creen.', 'La app cuenta en cuántas coinciden.'],
  estooaquello: ['Salen dos opciones y 5 segundos.', 'Al acabar el tiempo, los dos dicen su respuesta a la vez.', 'Al final ven en qué coincidieron.'],
  yonunca: ['Uno lee la frase.', 'Quien sí lo ha hecho marca "Yo sí" y, si quiere, cuenta la historia.', 'Nada de exponer al otro: cada uno cuenta solo lo suyo.'],
  cancion: ['Quien canta ve la canción manteniendo presionado.', 'Tararea o descríbela sin decir el nombre. 30 segundos.', 'Si adivinan: 2 puntos para quien adivina, o 1 si pidió pista.'],
  cuentos: ['La app da un comienzo y una palabra por turno.', 'Continúa la historia usando la palabra antes de que acabe el tiempo.', '1 punto por cada palabra usada. Al final pueden guardar el cuento.'],
};

const turnsFor = (mins, map) => map[mins] || map[15];

// ---------- shared screens ----------
function handoff(ctx, who, text, onReady, label = 'Estoy lista o listo') {
  const other = profile.partnerOf(who);
  ctx.mount(K.scoreboard(ctx.s), el('div', { class: 'game-handoff stack center-col' },
    el('div', { class: 'handoff-avatar', 'aria-hidden': 'true' }, (profile.name(who) || '?').slice(0, 1)),
    el('h2', { class: 'game-step-title', tabindex: '-1' }, `Turno de ${profile.name(who)}`),
    el('p', { class: 'muted' }, text.replace('{otro}', profile.name(other))),
    ui.button({ label, iconName: 'play', variant: 'primary', onClick: onReady })));
}

function countdown(node) {
  return new Promise((resolve) => {
    const n = el('span', { class: 'countdown-num', 'aria-live': 'assertive' });
    put(node, n);
    const steps = ['3', '2', '1', '¡Ya!'];
    let i = 0;
    const step = () => {
      n.textContent = steps[i]; n.classList.remove('is-pop'); void n.offsetWidth; n.classList.add('is-pop'); K.tick(); util.haptic(8);
      if (++i < steps.length) setTimeout(step, util.prefersReducedMotion() ? 250 : 650); else setTimeout(resolve, 400);
    };
    step();
  });
}

/** Memories, firsts and places with a title, without anything private: the "nuestros recuerdos" deck. */
export async function ourMemoriesDeck() {
  const pub = (r) => !r.deleted && r.visibility !== 'self' && !r.private;
  const [m, f, p] = await Promise.all(['memories', 'firsts', 'places'].map((s) => db.query(s).catch(() => [])));
  return [...m.filter(pub).map((r) => ({ id: `mem:${r.id}`, text: r.title, cat: 'recuerdos' })),
    ...f.filter((r) => pub(r) && !r.skipped).map((r) => ({ id: `first:${r.id}`, text: r.title, cat: 'recuerdos' })),
    ...p.filter(pub).map((r) => ({ id: `place:${r.id}`, text: r.name, cat: 'recuerdos' }))].filter((x) => x.text && x.text.length <= 60 && !/por completar/i.test(x.text));
}

const MIMICA_CATS = [['acciones', 'Acciones'], ['peliculas', 'Películas'], ['anime', 'Anime'], ['animales', 'Animales'], ['oficios', 'Oficios'], ['cotidiano', 'Del día a día'], ['recuerdos', 'Nuestros recuerdos']];

export const options = {
  mimica: (opts) => {
    opts.cats = new Set(MIMICA_CATS.map(([c]) => c));
    return el('div', { class: 'stack' }, el('span', { class: 'field-label', id: 'mimica-cats' }, 'Categorías'),
      el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-labelledby': 'mimica-cats' }, MIMICA_CATS.map(([c, label]) => {
        const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', onClick: () => {
          if (opts.cats.has(c) && opts.cats.size > 1) opts.cats.delete(c); else opts.cats.add(c);
          b.setAttribute('aria-pressed', String(opts.cats.has(c)));
        } }, label);
        return b;
      })));
  },
  cancion: (opts) => {
    opts.songSource = 'banco';
    return ui.field({ label: 'Canciones', control: ui.segmented({ label: 'De dónde salen las canciones', value: 'banco', options: [{ value: 'banco', label: 'Conocidas' }, { value: 'nuestras', label: 'Las nuestras' }, { value: 'mezcla', label: 'Mezcla' }], onChange: (v) => { opts.songSource = v; } }) });
  },
};

// ---------- Mímica and Adivina la canción (same shape: one acts, the other guesses) ----------
async function actGame(ctx, { bank, seconds, turns, pickPool, cardFace, onGuess, hintable = false, actorText }) {
  const { s } = ctx;
  const total = turns * 2;
  const pool = await pickPool();
  if (!pool.length) { ctx.mount(ui.emptyState({ title: 'No hay contenido', text: 'Agreguen elementos en Juegos > Ajustes > Bancos.', art: 'fan' })); return () => {}; }
  let t = null; let done = 0; let stopped = false;
  const endTurn = (guessed, item) => {
    t?.stop();
    done++;
    if (done % 2 === 0) s.round();
    if (done >= total) { ctx.finish(); return; }
    const reveal = el('p', { class: 'muted' }, guessed ? '¡Adivinado!' : 'Era: ', guessed ? null : el('strong', {}, item.text));
    s.next();
    ctx.mount(K.scoreboard(s), el('div', { class: 'stack center-col game-between' }, reveal, ui.button({ label: 'Siguiente turno', iconName: 'arrow-right', variant: 'primary', onClick: turn })));
  };
  const turn = async () => {
    if (stopped) return;
    const actor = s.turn();
    handoff(ctx, actor, actorText, async () => {
      let item = await K.draw(ctx.game.id, pool);
      let hinted = false;
      const face = el('div', { class: 'act-face' });
      const paintFace = () => put(face, cardFace(item));
      paintFace();
      t = K.timer({ seconds, onEnd: () => endTurn(false, item) });
      const actions = el('div', { class: 'btn-row center-row game-actions' });
      let wasRunning = false;
      const pass = K.passButton(s, async () => { item = await K.draw(ctx.game.id, pool); hinted = false; paintFace(); if (wasRunning) t.start(); }, { before: () => { wasRunning = t.running; t.pause(); } });
      const startBtn = ui.button({ label: 'Empezar el tiempo', iconName: 'timer', variant: 'primary', onClick: () => { t.start(); startBtn.remove(); actions.prepend(got); if (hintable) add(actions, hint); } });
      const got = ui.button({ label: '¡Adivinó!', iconName: 'check', variant: 'primary', onClick: () => { onGuess(actor, hinted); endTurn(true, item); } });
      const hint = ui.button({ label: 'Pista (vale menos)', iconName: 'lightbulb', variant: 'ghost', onClick: () => { hinted = true; hint.disabled = true; ui.toast('Pista: di el artista o una palabra de la letra.'); } });
      add(actions, startBtn, pass);
      ctx.mount(K.scoreboard(s), el('div', { class: 'stack center-col' }, K.secret(face), t.node, actions));
    });
  };
  turn();
  const cleanup = () => { stopped = true; t?.stop(); };
  cleanup.end = () => { cleanup(); ctx.finish(); };
  return cleanup;
}

async function mimica(ctx) {
  const cats = ctx.opts.cats || new Set(MIMICA_CATS.map(([c]) => c));
  return actGame(ctx, {
    seconds: 60, turns: turnsFor(ctx.opts.mins, { 5: 3, 15: 6, 30: 10 }),
    actorText: 'Mira tu palabra sin que {otro} la vea y actúala sin hablar.',
    pickPool: async () => {
      const bank = (await K.bankItems('mimica')).filter((i) => cats.has(i.cat || 'acciones'));
      const ours = cats.has('recuerdos') ? await ourMemoriesDeck() : [];
      return [...bank, ...ours];
    },
    cardFace: (item) => el('div', { class: 'stack center-col' }, el('span', { class: 'card-cat' }, (MIMICA_CATS.find(([c]) => c === item.cat) || [0, ''])[1]), el('strong', { class: 'act-word' }, item.text)),
    onGuess: (actor) => ctx.s.add(actor, 1),
  });
}

async function cancion(ctx) {
  const src = ctx.opts.songSource || 'banco';
  return actGame(ctx, {
    seconds: 30, turns: turnsFor(ctx.opts.mins, { 5: 3, 15: 6, 30: 10 }), hintable: true,
    actorText: 'Mira la canción sin que {otro} la vea. Tarárala o descríbela sin decir el nombre.',
    pickPool: async () => {
      const bank = src === 'nuestras' ? [] : await K.bankItems('canciones');
      const ours = src === 'banco' ? [] : (await db.query('songs').catch(() => [])).filter((x) => !x.deleted && x.title && x.visibility !== 'self').map((x) => ({ id: `song:${x.id}`, text: x.title, artist: x.dedication ? 'De sus canciones' : '' }));
      const all = [...bank, ...ours];
      return all.length ? all : await K.bankItems('canciones');
    },
    cardFace: (item) => el('div', { class: 'stack center-col' }, icon('music', { size: 26 }), el('strong', { class: 'act-word' }, item.text), item.artist ? el('span', { class: 'muted' }, item.artist) : null),
    onGuess: (actor, hinted) => ctx.s.add(profile.partnerOf(actor), hinted ? 1 : 2),
  });
}

// ---------- ¿Quién es más probable…? ----------
async function probable(ctx) {
  const { s } = ctx;
  const items = await K.bankItems('probable');
  const n = turnsFor(ctx.opts.mins, { 5: 10, 15: 20, 30: 30 });
  const tally = { match: 0, total: 0, [profile.PEOPLE[0]]: 0, [profile.PEOPLE[1]]: 0 };
  let i = 0; let stopped = false;
  const stage = K.cardStage({ swipe: false, label: 'Pregunta' });
  const area = el('div', { class: 'stack center-col' });
  const progress = el('p', { class: 'muted small game-progress' });
  const card = async () => {
    if (stopped) return;
    if (i >= n) { done(); return; }
    progress.textContent = `Pregunta ${i + 1} de ${n} · lee ${profile.name(s.turn())}`;
    const item = await K.draw('probable', items);
    stage.show(el('p', { class: 'gcard-text' }, item.text));
    const answers = el('div', { class: 'btn-row center-row game-actions' });
    const answer = (who) => {
      tally.total++;
      if (who) { tally.match++; tally[who]++; s.add(who, 1); }
      i++; s.next(); if (i % 2 === 0) s.round(); card();
    };
    const go = ui.button({ label: 'A la de tres', iconName: 'pointer', variant: 'primary', onClick: async () => {
      put(area, el('div', { class: 'countdown' }));
      await countdown(area.firstChild);
      put(area, el('p', { class: 'muted' }, '¿A quién señalaron los dos?'), answers);
      put(answers, ...profile.PEOPLE.map((p) => ui.button({ label: `A ${profile.name(p)}`, variant: 'secondary', onClick: () => answer(p) })),
        ui.button({ label: 'No coincidimos', variant: 'ghost', onClick: () => answer(null) }));
    } });
    put(area, el('div', { class: 'btn-row center-row game-actions' }, go, K.passButton(s, () => card())));
  };
  const done = () => {
    const sorted = profile.PEOPLE.slice().sort((a, b) => tally[b] - tally[a]);
    ctx.finish({ scored: false, lines: [
      `Coincidieron en ${tally.match} de ${tally.total}.`,
      tally[sorted[0]] ? `${profile.name(sorted[0])} salió como "más probable" ${tally[sorted[0]]} ${tally[sorted[0]] === 1 ? 'vez' : 'veces'} y ${profile.name(sorted[1])}, ${tally[sorted[1]]}.` : 'Nadie quedó señalado: ¡qué misterio!',
    ], record: { matches: tally.match, asked: tally.total } });
  };
  ctx.mount(K.scoreboard(s, { label: 'Veces señalado' }), progress, stage.node, area);
  card();
  const cleanup = () => { stopped = true; };
  cleanup.end = () => { cleanup(); done(); };
  return cleanup;
}

// ---------- Esto o aquello relámpago ----------
async function estooaquello(ctx) {
  const { s } = ctx;
  const items = await K.bankItems('estooaquello');
  const n = turnsFor(ctx.opts.mins, { 5: 12, 15: 25, 30: 40 });
  const matched = []; let asked = 0; let i = 0; let t = null; let stopped = false;
  const box = el('div', { class: 'stack center-col' });
  const progress = el('p', { class: 'muted small game-progress' });
  const next = async () => {
    if (stopped) return;
    if (i >= n) { done(); return; }
    progress.textContent = `${i + 1} de ${n}`;
    const item = await K.draw('estooaquello', items);
    const pair = el('div', { class: 'eoa-pair' }, el('span', { class: 'eoa-opt' }, item.a), el('span', { class: 'eoa-or', 'aria-hidden': 'true' }, 'o'), el('span', { class: 'eoa-opt' }, item.b));
    const after = el('div', { class: 'btn-row center-row game-actions', hidden: true },
      ui.button({ label: `Los dos: ${item.a}`, variant: 'secondary', onClick: () => answer(item.a) }),
      ui.button({ label: `Los dos: ${item.b}`, variant: 'secondary', onClick: () => answer(item.b) }),
      ui.button({ label: 'No coincidimos', variant: 'ghost', onClick: () => answer(null) }));
    const answer = (v) => { asked++; if (v) { matched.push(v); profile.PEOPLE.forEach((p) => s.add(p, 1)); } i++; if (i % 3 === 0) s.round(); next(); };
    const reveal = () => { t?.stop(); now.hidden = true; pass.hidden = true; after.hidden = false; ui.announce('¡Digan su respuesta!'); after.querySelector('button')?.focus(); };
    t = K.timer({ seconds: 5, onEnd: reveal, label: 'Cinco segundos' });
    const now = ui.button({ label: 'Ya', variant: 'ghost', small: true, onClick: reveal });
    const pass = K.passButton(s, () => { i++; next(); }, { before: () => t.stop() });
    put(box, pair, t.node, el('div', { class: 'btn-row center-row' }, now, pass), after);
    t.start();
  };
  const done = () => ctx.finish({ scored: false, record: { matches: matched.length, asked },
    lines: [`Coincidieron en ${matched.length} de ${asked}.`],
    extra: matched.length ? el('div', { class: 'stack' }, el('h3', { class: 'section-title' }, 'Lo que eligieron los dos'), el('ul', { class: 'tag-list' }, matched.map((m) => el('li', { class: 'tag' }, m)))) : null });
  ctx.mount(K.scoreboard(s, { showTurn: false, label: 'Coincidencias' }), progress, box);
  next();
  const cleanup = () => { stopped = true; t?.stop(); };
  cleanup.end = () => { cleanup(); done(); };
  return cleanup;
}

// ---------- Yo nunca ----------
async function yonunca(ctx) {
  const { s } = ctx;
  const items = await K.bankItems('yonunca');
  const n = turnsFor(ctx.opts.mins, { 5: 10, 15: 20, 30: 35 });
  let i = 0; let stopped = false;
  const stage = K.cardStage({ label: 'Frase', onSwipe: () => commit() });
  const progress = el('p', { class: 'muted small game-progress' });
  const marks = el('div', { class: 'btn-row center-row yo-si' });
  const actions = el('div', { class: 'btn-row center-row game-actions' });
  let picked = new Set();
  const paintMarks = () => put(marks, ...profile.PEOPLE.map((p) => {
    const b = el('button', { class: `btn btn-secondary yo-si-btn${picked.has(p) ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(picked.has(p)), onClick: () => { if (picked.has(p)) picked.delete(p); else picked.add(p); util.haptic(8); paintMarks(); } },
      icon(picked.has(p) ? 'circle-check' : 'hand', { size: 18 }), el('span', {}, `${profile.name(p)}: yo sí`));
    return b;
  }));
  const card = async () => {
    if (stopped) return;
    if (i >= n) { done(); return; }
    picked = new Set(); paintMarks();
    progress.textContent = `${i + 1} de ${n} · lee ${profile.name(s.turn())}`;
    const item = await K.draw('yonunca', items);
    stage.show(el('p', { class: 'gcard-text' }, item.text));
  };
  const commit = () => { picked.forEach((p) => s.add(p, 1)); i++; s.next(); if (i % 2 === 0) s.round(); card(); };
  add(actions, ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: commit }), K.passButton(s, () => { i++; s.next(); card(); }));
  const done = () => {
    const w = K.winnerOf(s.score);
    ctx.finish({ scored: false, lines: [w ? `${profile.name(w)} ha vivido más de estas: ${s.score[w]} a ${s.score[profile.partnerOf(w)]}.` : `Empataron en experiencias: ${s.score[profile.PEOPLE[0]]} cada uno.`, 'Lo bonito es lo que se contaron.'] });
  };
  ctx.mount(K.scoreboard(s, { label: 'Veces "yo sí"' }), progress, stage.node, marks, actions);
  card();
  const cleanup = () => { stopped = true; };
  cleanup.end = () => { cleanup(); done(); };
  return cleanup;
}

// ---------- Cuentos a dos voces ----------
async function cuentos(ctx) {
  const { s } = ctx;
  const words = await K.bankItems('cuentos');
  const starts = await K.bankItems('cuentos-inicio');
  const n = turnsFor(ctx.opts.mins, { 5: 6, 15: 14, 30: 24 });
  const start = (await K.draw('cuentos-inicio', starts))?.text || 'Había una vez…';
  const used = []; let i = 0; let t = null; let stopped = false;
  const box = el('div', { class: 'stack center-col' });
  const progress = el('p', { class: 'muted small game-progress' });
  const turn = async () => {
    if (stopped) return;
    if (i >= n) { done(); return; }
    progress.textContent = `Turno ${i + 1} de ${n} · cuenta ${profile.name(s.turn())}`;
    let w = await K.draw('cuentos', words);
    const word = el('strong', { class: 'act-word' }, w.text);
    t = K.timer({ seconds: 30, onEnd: () => { i++; s.next(); if (i % 2 === 0) s.round(); turn(); } });
    const usedBtn = ui.button({ label: 'La usé', iconName: 'check', variant: 'primary', onClick: () => { t.stop(); used.push(w.text); s.add(s.turn(), 1); i++; s.next(); if (i % 2 === 0) s.round(); turn(); } });
    const pass = K.passButton(s, async () => { w = await K.draw('cuentos', words); word.textContent = w.text; t.start(); }, { before: () => t.pause() });
    put(box, i === 0 ? el('p', { class: 'story-start' }, start) : null, el('p', { class: 'muted small' }, 'Tu palabra'), word, t.node, el('div', { class: 'btn-row center-row game-actions' }, usedBtn, pass));
    t.start();
  };
  const done = () => {
    const title = ui.input({ maxlength: '80', placeholder: 'Ej.: El gato del tren' });
    const saveBtn = ui.button({ label: 'Guardar el cuento', iconName: 'book-text', onClick: async () => {
      await db.put('gameArtifacts', { id: util.uuid(), gameId: 'cuentos', type: 'story', data: { title: title.value.trim() || 'Nuestro cuento', start, words: used }, visibility: 'shared', owner: 'both', by: profile.active() });
      saveBtn.disabled = true; ui.toast('Cuento guardado en el historial.', { tone: 'success' });
    } });
    ctx.finish({ lines: [`Empezó: "${start}"`, used.length ? `Palabras usadas: ${used.join(', ')}.` : 'No alcanzaron a usar palabras: ¡la próxima!'], record: { words: used },
      extra: el('div', { class: 'stack' }, ui.field({ label: 'Título del cuento (opcional)', control: title }), el('div', { class: 'btn-row center-row' }, saveBtn)) });
  };
  ctx.mount(K.scoreboard(s), progress, box);
  turn();
  const cleanup = () => { stopped = true; t?.stop(); };
  cleanup.end = () => { cleanup(); done(); };
  return cleanup;
}

const GAMES = { mimica, cancion, probable, estooaquello, yonunca, cuentos };
export const play = (ctx) => GAMES[ctx.game.id](ctx);
