// Home games of the Juegos en pareja (docs/05 §34, Fase 5B): Adivina el recuerdo (one of their
// photos revealed little by little), Cata a ciegas (score sheet with stars and guesses), Reto de
// cocina (a wheel of simple recipes, timer and a vote), Búsqueda del tesoro (one writes clues and
// the other gets them one by one) and Cita misteriosa (envelopes that open at a time or at each step).
// Treasure hunts and mystery dates are made by one for the other: they reach the other's phone
// sealed through sync, and can also be played handing over the same phone.
import { ui, util, db, profile } from '../core.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

export const scoredGames = ['recuerdo', 'cocina'];
export const direct = ['cata', 'tesoro', 'misteriosa'];
export const rules = {
  recuerdo: ['Una foto suya aparece poco a poco.', 'Quien adivine primero el momento lo dice en voz alta y toca su nombre.', 'Más temprano, más puntos: 3, 2 o 1.', 'Saltar una foto usa el pase libre.'],
  cocina: ['Giren la ruleta de recetas sencillas.', 'Otra receta usa el pase libre de quien la pide.', 'En duelo cada uno cocina y califica el plato del otro.'],
};
export const options = {
  recuerdo: (opts) => { opts.reveal ||= 'pixel'; return ui.field({ label: 'Cómo se revela', control: ui.segmented({ label: 'Cómo se revela', value: opts.reveal, options: [{ value: 'pixel', label: 'Pixelada' }, { value: 'piezas', label: 'Por piezas' }], onChange: (v) => { opts.reveal = v; } }) }); },
  cocina: (opts) => {
    opts.mode ||= 'duelo'; opts.filter ||= 'todas';
    return el('div', { class: 'stack' },
      ui.field({ label: 'Cómo cocinan', control: ui.segmented({ label: 'Cómo cocinan', value: opts.mode, options: [{ value: 'duelo', label: 'Duelo' }, { value: 'juntos', label: 'Juntos' }], onChange: (v) => { opts.mode = v; } }) }),
      ui.field({ label: 'Qué recetas', control: ui.segmented({ label: 'Qué recetas', value: opts.filter, options: COCINA_FILTERS, onChange: (v) => { opts.filter = v; } }) }));
  },
};

const pub = (r) => r && !r.deleted && r.visibility !== 'self' && !r.private;
const turnsFor = (mins, map) => map[mins] || map[15];

// ---------- Adivina el recuerdo ----------
/** Pixel block size for reveal step `i` of `steps` (big blocks first, sharp at the end). */
export function pixelSize(i, steps = 7) { const sizes = [56, 36, 24, 16, 10, 6, 1]; return sizes[Math.min(sizes.length - 1, Math.round((i / Math.max(1, steps - 1)) * (sizes.length - 1)))]; }
/** Points for guessing at reveal step i (of 7). */
export const recuerdoPoints = (i) => (i <= 2 ? 3 : i <= 4 ? 2 : 1);

async function memoryPhotos(n) {
  const recs = (await db.query('memories').catch(() => [])).filter((m) => pub(m) && (m.mediaIds || []).length && m.title && !/por completar|\[/i.test(m.title));
  const out = [];
  for (const m of K.shuffle(recs)) {
    if (out.length >= n) break;
    for (const id of K.shuffle(m.mediaIds)) {
      const b = await db.getMedia(id).catch(() => null);
      if (b && /^image\//.test(b.type || '')) { out.push({ url: URL.createObjectURL(b), title: m.title, date: typeof m.date === 'string' ? m.date.slice(0, 10) : '' }); break; }
    }
  }
  return out;
}

function revealCanvas(url, mode) {
  const canvas = el('canvas', { class: 'reveal-canvas', role: 'img', 'aria-label': 'Foto que se va revelando' });
  const img = new Image(); let step = 0; const steps = 7;
  const W = 640; const H = 480; canvas.width = W; canvas.height = H;
  const tiles = K.shuffle(Array.from({ length: 20 }, (_, i) => i));
  const draw = () => {
    const c = canvas.getContext('2d');
    if (!img.complete || !img.naturalWidth) return;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s; const h = img.naturalHeight * s;
    c.imageSmoothingEnabled = true;
    if (mode === 'piezas') {
      c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      const open = new Set(tiles.slice(0, step >= steps - 1 ? 20 : 2 + step * 3));
      const cs = getComputedStyle(document.documentElement);
      c.fillStyle = cs.getPropertyValue('--accent').trim() || '#C2405F';
      for (let i = 0; i < 20; i++) if (!open.has(i)) { const x = (i % 5) * (W / 5); const y = Math.floor(i / 5) * (H / 4); c.fillRect(x, y, W / 5 + 1, H / 4 + 1); c.strokeStyle = 'rgba(255,255,255,.35)'; c.strokeRect(x + 0.5, y + 0.5, W / 5 - 1, H / 4 - 1); }
      return;
    }
    const px = pixelSize(step, steps);
    if (px <= 1) { c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); return; }
    const sw = Math.max(1, Math.round(W / px)); const sh = Math.max(1, Math.round(H / px));
    const off = document.createElement('canvas'); off.width = sw; off.height = sh;
    const o = off.getContext('2d'); o.drawImage(img, ((W - w) / 2) / px, ((H - h) / 2) / px, w / px, h / px);
    c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H); c.drawImage(off, 0, 0, sw, sh, 0, 0, W, H);
  };
  img.onload = draw; img.src = url;
  return { node: canvas, get step() { return step; }, more() { if (step < steps - 1) { step++; draw(); } return step; }, all() { step = steps - 1; draw(); }, steps };
}

async function recuerdo(ctx) {
  const { s } = ctx;
  const n = turnsFor(ctx.opts.mins, { 5: 4, 15: 8, 30: 12 });
  const photos = await memoryPhotos(n);
  if (photos.length < 2) {
    ctx.mount(ui.emptyState({ title: 'Faltan fotos', text: 'Agreguen recuerdos con foto y título en la Cápsula, y vuelvan a jugar.', art: 'crane' }));
    const c = () => {}; c.end = () => { location.hash = '#/juegos'; }; return c;
  }
  let i = 0; let auto = 0; let stopped = false;
  const progress = el('p', { class: 'muted small game-progress' });
  const box = el('div', { class: 'stack center-col' });
  const stopAuto = () => { clearInterval(auto); auto = 0; };
  const round = () => {
    stopAuto();
    if (stopped) return;
    if (i >= photos.length) { ctx.finish({ lines: [`${photos.length} recuerdos adivinados entre los dos.`] }); return; }
    const ph = photos[i];
    const rc = revealCanvas(ph.url, ctx.opts.reveal || 'pixel');
    progress.textContent = `Foto ${i + 1} de ${photos.length} · más temprano, más puntos`;
    const answer = el('div', { class: 'reveal-answer', 'aria-live': 'polite' });
    const after = (who) => {
      stopAuto();
      const pts = recuerdoPoints(rc.step);
      rc.all();
      if (who) { s.add(who, pts); K.ding(); ui.announce(`${profile.name(who)} suma ${pts}.`); }
      put(answer, el('strong', { class: 'reveal-title' }, ph.title), ph.date ? el('span', { class: 'muted small' }, util.formatDay(ph.date)) : null);
      put(actions, ui.button({ label: i + 1 >= photos.length ? 'Ver resultado' : 'Siguiente foto', iconName: 'arrow-right', variant: 'primary', onClick: () => { i++; s.next(); s.round(); round(); } }));
    };
    const actions = el('div', { class: 'btn-row center-row' },
      ...profile.PEOPLE.map((p) => ui.button({ label: `¡Adivinó ${profile.name(p)}!`, iconName: 'hand', variant: 'primary', onClick: () => after(p) })),
      ui.button({ label: 'Revelar más', iconName: 'eye', variant: 'ghost', onClick: () => { rc.more(); } }),
      ui.button({ label: 'Nadie', variant: 'ghost', onClick: () => after(null) }),
      K.passButton(s, () => { i++; s.next(); round(); }, { before: stopAuto }));
    put(box, rc.node, answer, actions);
    auto = setInterval(() => { if (rc.more() >= rc.steps - 1) stopAuto(); }, util.prefersReducedMotion() ? 4000 : 2600);
  };
  ctx.mount(K.scoreboard(s, { showTurn: false }), progress, box);
  round();
  const cleanup = () => { stopped = true; stopAuto(); photos.forEach((p) => URL.revokeObjectURL(p.url)); };
  cleanup.end = () => { stopAuto(); ctx.finish({ lines: [`${i} de ${photos.length} fotos.`] }); };
  return cleanup;
}

// ---------- Cata a ciegas ----------
export const CATA_CATS = [{ value: 'snacks', label: 'Snacks' }, { value: 'chocolates', label: 'Chocolates' }, { value: 'bebidas', label: 'Bebidas' }, { value: 'frutas', label: 'Frutas' }, { value: 'otro', label: 'Otro' }];
const CRITERIA = [['sabor', 'Sabor'], ['textura', 'Textura'], ['aroma', 'Aroma']];
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
/** A guess counts when one text contains the other (ignoring case and accents). */
export const guessMatches = (guess, name) => { const g = norm(guess); const n = norm(name); return !!g && !!n && (g.includes(n) || n.includes(g)); };
/** Ranking of samples by the average of all stars. samples: [{name, ratings:{who:{sabor,textura,aroma}}}] */
export function cataRanking(samples) {
  return samples.map((sm, i) => {
    const v = Object.values(sm.ratings || {}).flatMap((r) => CRITERIA.map(([k]) => r?.[k] || 0)).filter(Boolean);
    return { i, name: sm.name, avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0 };
  }).sort((a, b) => b.avg - a.avg || a.i - b.i);
}
const letter = (i) => String.fromCharCode(65 + i);

async function cata(ctx) {
  let cat = 'snacks'; let tasters = [profile.partnerOf(profile.active())]; let count = 4;
  const samples = [];
  const setup = () => {
    const whoSeg = ui.segmented({ label: 'Quién prueba', value: tasters.length === 2 ? 'both' : tasters[0], options: [...profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), { value: 'both', label: 'Los dos' }], onChange: (v) => { tasters = v === 'both' ? [...profile.PEOPLE] : [v]; } });
    ctx.mount(el('div', { class: 'stack' }, el('section', { class: 'card stack center-col' },
      el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('candy', { size: 44 })),
      el('p', { class: 'game-intro-blurb' }, 'Uno prepara muestras sin que el otro vea; quien prueba lo hace con los ojos cerrados y califica cada una.'),
      el('div', { class: 'stack game-options' },
        ui.field({ label: 'Qué van a probar', control: ui.segmented({ label: 'Qué van a probar', value: cat, options: CATA_CATS, onChange: (v) => { cat = v; } }) }),
        ui.field({ label: 'Quién prueba', control: whoSeg, hint: 'Si prueban los dos, prepara alguien más o se turnan.' }),
        ui.field({ label: 'Cuántas muestras', control: ui.segmented({ label: 'Cuántas muestras', value: String(count), options: [2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) })), onChange: (v) => { count = Number(v); } }) })),
      ui.button({ label: 'Preparar las muestras', iconName: 'play', variant: 'primary', onClick: prepare }))));
  };
  const prepare = () => {
    const inputs = Array.from({ length: count }, (_, i) => { const c = ui.input({ maxlength: '50', placeholder: `Qué es la muestra ${letter(i)}` }); return { c, f: ui.field({ label: `Muestra ${letter(i)}`, control: c }) }; });
    ctx.mount(el('div', { class: 'stack' },
      el('h2', { class: 'game-step-title', tabindex: '-1' }, 'Prepara las muestras'),
      el('p', { class: 'muted' }, `${tasters.map((p) => profile.name(p)).join(' y ')}, no mires. Escribe qué es cada una y ponle su letra a cada vaso o plato.`),
      el('div', { class: 'stack' }, inputs.map((x) => x.f)),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Listo, a probar', iconName: 'arrow-right', variant: 'primary', onClick: () => {
        const empty = inputs.find((x) => !x.c.value.trim());
        if (empty) { empty.f.setError('Escribe qué es.'); empty.c.focus(); return; }
        samples.length = 0; inputs.forEach((x) => samples.push({ name: x.c.value.trim(), ratings: {}, guesses: {} }));
        taste(0, 0);
      } }))));
  };
  const taste = (si, ti) => {
    if (si >= samples.length) { results(); return; }
    const who = tasters[ti];
    const st = Object.fromEntries(CRITERIA.map(([k, label]) => [k, K.stars({ label })]));
    const guess = ui.input({ maxlength: '50', placeholder: 'Opcional' });
    const next = () => { samples[si].ratings[who] = Object.fromEntries(CRITERIA.map(([k]) => [k, st[k].value])); samples[si].guesses[who] = guess.value.trim(); ti + 1 < tasters.length ? taste(si, ti + 1) : taste(si + 1, 0); };
    ctx.mount(el('div', { class: 'stack center-col cata-step' },
      el('span', { class: 'card-cat' }, `Muestra ${si + 1} de ${samples.length}`),
      el('div', { class: 'cata-letter', 'aria-hidden': 'true' }, letter(si)),
      el('h2', { class: 'game-step-title', tabindex: '-1' }, `Prueba ${profile.name(who)} la muestra ${letter(si)}`),
      el('div', { class: 'cata-criteria' }, CRITERIA.map(([k, label]) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), st[k].node))),
      ui.field({ label: '¿Qué crees que es?', control: guess }),
      ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: () => { if (!CRITERIA.some(([k]) => st[k].value)) { ui.toast('Califica al menos una cosa.'); return; } next(); } })));
  };
  const results = async () => {
    const rank = cataRanking(samples);
    const hits = Object.fromEntries(tasters.map((p) => [p, samples.filter((sm) => guessMatches(sm.guesses[p], sm.name)).length]));
    const winner = tasters.length === 2 ? K.winnerOf(hits) : null;
    await K.logGame('cata', { cat, result: rank[0]?.name || '', ranking: rank.map((r) => ({ name: r.name, avg: r.avg })), score: tasters.length === 2 ? hits : undefined, guesses: hits, winner });
    ui.confetti({ count: 30 });
    ctx.mount(el('div', { class: 'game-result stack' },
      el('div', { class: 'result-crown', 'aria-hidden': 'true' }, icon('trophy', { size: 44 })),
      el('h2', { class: 'result-title' }, `Ganó la muestra ${letter(rank[0].i)}: ${rank[0].name}`),
      el('ol', { class: 'cata-rank' }, rank.map((r) => el('li', {}, el('span', { class: 'cata-badge' }, letter(r.i)), el('strong', {}, r.name), el('span', { class: 'cine-stars', 'aria-label': `${r.avg} de 5` }, ` ${K.starsText(Math.round(r.avg))} `), el('span', { class: 'muted small' }, r.avg ? String(r.avg) : '—'),
        el('span', { class: 'muted small cata-guesses' }, tasters.map((p) => samples[r.i].guesses[p] ? `${profile.name(p)} dijo «${samples[r.i].guesses[p]}»${guessMatches(samples[r.i].guesses[p], r.name) ? ' ✓' : ''}` : '').filter(Boolean).join(' · '))))),
      el('p', {}, tasters.map((p) => `${profile.name(p)} adivinó ${hits[p]} de ${samples.length}`).join(' · '), winner ? `. ¡Mejor paladar: ${profile.name(winner)}!` : ''),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Otra cata', iconName: 'rotate-cw', variant: 'primary', onClick: setup }), ui.button({ label: 'Volver a la sala', iconName: 'arrow-left', href: '#/juegos' }))));
  };
  setup();
  return () => {};
}

// ---------- Reto de cocina ----------
const COCINA_FILTERS = [{ value: 'todas', label: 'Todas' }, { value: 'rapido', label: 'Rápidas' }, { value: 'japones', label: 'Japonesas' }, { value: 'dulce', label: 'Dulces' }, { value: 'salado', label: 'Saladas' }];
const VOTE = [['sabor', 'Sabor'], ['presentacion', 'Presentación'], ['creatividad', 'Creatividad']];
const splitList = (t) => String(t || '').split(';').map((x) => x.trim()).filter(Boolean);

async function cocinaRecipes(filter) {
  const bank = (await K.bankItems('cocina')).map((r) => ({ key: r.id, name: r.text, tags: splitList(r.cat), mins: Number(r.mins) || 30, ingredients: splitList(r.ing), steps: splitList(r.steps) }));
  const own = (await db.query('recipes').catch(() => [])).filter((r) => pub(r) && r.name).map((r) => ({
    key: r.id, name: r.name, own: true, mins: Number(r.minutes) || 30,
    tags: [...(r.tags || []).map((t) => (t === 'japonés' ? 'japones' : t === 'rápido' ? 'rapido' : t))],
    ingredients: (r.ingredients || []).map((i) => [i.qty, i.unit, i.text].filter(Boolean).join(' ')), steps: (r.steps || []).map((s) => s.text),
  }));
  const all = [...bank, ...own];
  return filter === 'todas' ? all : all.filter((r) => r.tags.includes(filter) || (filter === 'rapido' && r.mins <= 20));
}

async function cocina(ctx) {
  const { s } = ctx;
  const duel = (ctx.opts.mode || 'duelo') === 'duelo';
  let recipes = await cocinaRecipes(ctx.opts.filter || 'todas');
  if (recipes.length < 2) recipes = await cocinaRecipes('todas');
  let t = null; let chosen = null;
  const spinView = () => {
    const pick = K.shuffle(recipes).slice(0, 8);
    const w = K.wheel(pick.map((r) => r.name), { size: Math.min(320, window.innerWidth - 48) });
    const res = el('div', { class: 'wheel-result', 'aria-live': 'polite' });
    const go = ui.button({ label: 'Girar', iconName: 'loader-pinwheel', variant: 'primary', onClick: async () => {
      go.disabled = true; const i = await w.spin(); chosen = pick[i];
      put(res, el('span', { class: 'muted small' }, 'Van a cocinar'), el('strong', { class: 'wheel-result-text' }, chosen.name));
      put(after, ui.button({ label: 'Ver la receta', iconName: 'chef-hat', variant: 'primary', onClick: recipeView }), K.passButton(s, () => spinView(), { who: () => s.turn() }));
      go.hidden = true;
    } });
    const after = el('div', { class: 'btn-row center-row' });
    ctx.mount(duel ? K.scoreboard(s, { showTurn: false }) : null, el('div', { class: 'stack center-col ruleta' }, w.node, res, go, after));
  };
  const recipeView = () => {
    const r = chosen;
    ctx.mount(el('div', { class: 'stack' },
      el('section', { class: 'card stack cocina-recipe' },
        el('span', { class: 'card-cat' }, [r.own ? 'De sus recetas' : 'Receta sencilla', `${r.mins} min`].join(' · ')),
        el('h2', { class: 'card-title', tabindex: '-1' }, r.name),
        r.ingredients.length ? el('div', {}, el('h3', { class: 'section-title' }, 'Ingredientes'), el('ul', { class: 'cocina-list' }, r.ingredients.map((x) => el('li', {}, x)))) : null,
        r.steps.length ? el('div', {}, el('h3', { class: 'section-title' }, 'Pasos'), el('ol', { class: 'cocina-list' }, r.steps.map((x) => el('li', {}, x)))) : null,
        duel ? el('p', { class: 'muted small' }, 'Cada uno hace su versión: pueden cambiarle algo para hacerla suya.') : null),
      el('div', { class: 'btn-row' },
        r.ingredients.length ? ui.button({ label: 'A la lista de compras', iconName: 'list-todo', variant: 'ghost', onClick: async () => {
          const m = await import('./listas.js'); const { added } = await m.addItems({ name: `Reto de cocina: ${r.name}`, texts: r.ingredients });
          ui.toast(`${added} ${added === 1 ? 'ingrediente' : 'ingredientes'} en Listas.`, { tone: 'success' });
        } }) : null,
        ui.button({ label: 'Empezar a cocinar', iconName: 'timer', variant: 'primary', onClick: cookView }))));
  };
  const cookView = () => {
    t = K.timer({ seconds: Math.max(5, chosen.mins) * 60, label: 'Tiempo de cocina', onEnd: () => ui.toast('¡Tiempo! A servir.', { tone: 'info' }) });
    const pause = ui.button({ label: 'Pausar', iconName: 'pause', variant: 'ghost', onClick: () => { if (t.running) { t.pause(); pause.querySelector(':scope > span:not(.ripple-dot)').textContent = 'Seguir'; } else { t.start(); pause.querySelector(':scope > span:not(.ripple-dot)').textContent = 'Pausar'; } } });
    ctx.mount(el('div', { class: 'stack center-col' },
      el('h2', { class: 'game-step-title', tabindex: '-1' }, chosen.name), t.node,
      el('p', { class: 'muted' }, duel ? 'Cada uno en lo suyo. Nada de espiar el plato del otro.' : 'Cocinen juntos y disfruten el rato.'),
      el('div', { class: 'btn-row center-row' }, pause, ui.button({ label: 'Terminamos', iconName: 'check', variant: 'primary', onClick: () => { t.stop(); vote(0); } }))));
    t.start();
  };
  const vote = (k) => {
    const judges = duel ? profile.PEOPLE : ['both'];
    if (k >= judges.length) {
      if (!duel) { ctx.finish({ scored: false, lines: [`Cocinaron juntos: ${chosen.name}.`, `Calificación: ${K.starsText(Math.round(s.score[profile.PEOPLE[0]] / 3))}`], record: { result: chosen.name, mode: 'juntos' } }); return; }
      ctx.finish({ lines: [`Receta: ${chosen.name}.`], record: { result: chosen.name, mode: 'duelo' } });
      return;
    }
    const judge = judges[k];
    const cook = duel ? profile.partnerOf(judge) : null;
    const st = Object.fromEntries(VOTE.map(([key, label]) => [key, K.stars({ label })]));
    ctx.mount(el('div', { class: 'stack center-col' },
      el('h2', { class: 'game-step-title', tabindex: '-1' }, duel ? `${profile.name(judge)} califica el plato de ${profile.name(cook)}` : '¿Qué tal les quedó?'),
      el('div', { class: 'cata-criteria' }, VOTE.map(([key, label]) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, label), st[key].node))),
      ui.button({ label: 'Listo', iconName: 'check', variant: 'primary', onClick: () => {
        const total = VOTE.reduce((n, [key]) => n + st[key].value, 0);
        if (!total) { ui.toast('Califica con estrellas.'); return; }
        if (duel) s.add(cook, total); else { s.score[profile.PEOPLE[0]] = total; s.score[profile.PEOPLE[1]] = total; }
        vote(k + 1);
      } })));
  };
  spinView();
  const cleanup = () => { t?.stop(); };
  cleanup.end = () => { t?.stop(); ctx.finish({ scored: duel, lines: chosen ? [`Receta: ${chosen.name}.`] : [], record: { result: chosen?.name || '' } }); };
  return cleanup;
}

// ---------- shared: things made by one for the other ----------
const forMe = (a) => a.data?.for === profile.active();
const mine = (a) => a.by === profile.active();
function handOver(to, onGo) {
  ui.openModal({ title: `Pásale el teléfono a ${profile.name(to)}`, size: 'sm', body: el('p', {}, 'Cuando lo tenga en la mano, toca Empezar.'),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Empezar', variant: 'primary', onClick: () => { onGo(); return true; } }] });
}
function sealedCard({ iconName, title, sub, action }) {
  return el('li', { class: 'card sealed-card' }, el('span', { class: 'sealed-seal', 'aria-hidden': 'true' }, icon(iconName, { size: 26 })),
    el('div', { class: 'grow' }, el('strong', {}, title), el('p', { class: 'muted small' }, sub)), action);
}

// ---------- Búsqueda del tesoro ----------
async function tesoro(ctx) {
  const box = el('div', { class: 'stack' });
  let timer = null;
  const load = async () => {
    timer?.stop();
    const hunts = await K.artifacts('tesoro', 'treasureClues');
    const forYou = hunts.filter((h) => forMe(h) && h.data.status !== 'done');
    const yours = hunts.filter(mine);
    put(box,
      forYou.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Para ti'),
        el('ul', { class: 'sealed-list' }, forYou.map((h) => sealedCard({ iconName: 'map', title: `Una búsqueda de ${profile.name(h.by)}`, sub: `${h.data.clues.length} pistas${h.data.progress ? ` · vas en la ${h.data.progress + 1}` : ''}`,
          action: ui.button({ label: h.data.progress ? 'Seguir' : 'Empezar', iconName: 'play', variant: 'primary', small: true, onClick: () => playHunt(h) }) })))) : null,
      el('section', { class: 'card stack center-col' },
        el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('map', { size: 44 })),
        el('p', { class: 'game-intro-blurb' }, 'Escondan pistas en casa: la app se las entrega al otro una por una, con tiempo para cada una y un premio al final.'),
        ui.button({ label: 'Armar una búsqueda', iconName: 'plus', variant: 'primary', onClick: () => build() })),
      yours.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Las que armaste'),
        el('ul', { class: 'card pet-list' }, yours.map((h) => el('li', { class: 'pet-row' }, icon(h.data.status === 'done' ? 'trophy' : 'map', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, `Para ${profile.name(h.data.for)} · ${h.data.clues.length} pistas`),
            el('p', { class: 'muted small' }, h.data.status === 'done' ? `¡Encontró el tesoro!${h.data.minutes ? ` en ${h.data.minutes} min` : ''}` : h.data.progress ? `Va en la pista ${h.data.progress + 1}` : 'Todavía no empieza')),
          h.data.status !== 'done' ? ui.button({ label: 'Jugar aquí', iconName: 'smartphone', variant: 'ghost', small: true, onClick: () => handOver(h.data.for, () => playHunt(h)) }) : null,
          h.data.status !== 'done' && !h.data.progress ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar la búsqueda', onClick: () => build(h) }, icon('pencil', { size: 16 })) : null,
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar la búsqueda', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta búsqueda?', message: 'Se borra en los dos teléfonos.', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('gameArtifacts', h.id); load(); } } }, icon('trash-2', { size: 16 })))))) : null);
    ctx.mount(box);
  };
  const build = (rec = null) => {
    const d = rec?.data || {};
    const rows = el('ol', { class: 'stack tesoro-rows' });
    const addRow = (c = {}) => {
      const clue = ui.textarea({ rows: 2, maxlength: '240', placeholder: 'Ej.: Donde duermen los calcetines…' }); clue.value = c.clue || '';
      const place = ui.input({ maxlength: '80', placeholder: 'Solo lo ves tú: en el cajón de la ropa', value: c.place || '' });
      const hint = ui.input({ maxlength: '120', placeholder: 'Opcional: una ayudita', value: c.hint || '' });
      const li = el('li', { class: 'card stack tesoro-row' },
        el('div', { class: 'list-head' }, el('strong', { class: 'tesoro-n' }), el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Quitar pista', onClick: () => { li.remove(); renum(); } }, icon('x', { size: 16 }))),
        ui.field({ label: 'Pista', control: clue }), ui.field({ label: 'Dónde está la siguiente (tu nota)', control: place }), ui.field({ label: 'Pista extra', control: hint }));
      li._get = () => ({ clue: clue.value.trim(), place: place.value.trim(), hint: hint.value.trim() });
      rows.append(li); renum();
    };
    const renum = () => rows.querySelectorAll('.tesoro-n').forEach((n, i) => { n.textContent = `Pista ${i + 1}`; });
    (d.clues?.length ? d.clues : [{}, {}, {}]).forEach(addRow);
    let mins = d.mins ?? 5; let to = d.for || profile.partnerOf(profile.active());
    const prize = ui.input({ maxlength: '120', placeholder: 'Ej.: un beso y tu postre favorito', value: d.prize || '' });
    const fPrize = ui.field({ label: 'Premio al final', control: prize });
    ui.openModal({
      title: rec ? 'Editar la búsqueda' : 'Armar una búsqueda', size: 'md',
      body: el('div', { class: 'stack' },
        ui.field({ label: 'Para', control: ui.segmented({ label: 'Para', value: to, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), onChange: (v) => { to = v; } }) }),
        el('p', { class: 'muted small' }, 'Esconde cada pista física (o deja la idea) en el lugar que dice la anterior. La primera la entrega la app.'),
        rows, ui.button({ label: 'Otra pista', iconName: 'plus', small: true, variant: 'ghost', onClick: () => addRow() }),
        ui.field({ label: 'Tiempo para cada pista', control: ui.segmented({ label: 'Tiempo para cada pista', value: String(mins), options: [0, 3, 5, 10].map((m) => ({ value: String(m), label: m ? `${m} min` : 'Sin tiempo' })), onChange: (v) => { mins = Number(v); } }) }),
        fPrize),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        const clues = [...rows.children].map((li) => li._get()).filter((c) => c.clue);
        if (clues.length < 2) { ui.toast('Escribe al menos dos pistas.'); return false; }
        if (!prize.value.trim()) { fPrize.setError('Escribe el premio.'); return false; }
        await K.putArtifact({ ...(rec || { id: util.uuid(), gameId: 'tesoro', type: 'treasureClues' }), data: { for: to, clues, mins, prize: prize.value.trim(), status: 'ready', progress: 0, hintsUsed: 0, startedAt: '' } });
        ui.toast(to === profile.active() ? 'Guardada.' : `Lista. A ${profile.name(to)} le aparece en su teléfono.`, { tone: 'success' }); load(); return true;
      } }],
    });
  };
  const playHunt = async (h) => {
    const fresh = await db.get('gameArtifacts', h.id);
    const d = fresh.data;
    if (!d.startedAt) await K.putArtifact({ ...fresh, data: { ...d, startedAt: util.nowISO() } });
    step(fresh.id, d.progress || 0);
  };
  const step = async (id, i) => {
    timer?.stop();
    const rec = await db.get('gameArtifacts', id);
    const d = rec.data;
    if (i >= d.clues.length) { finishHunt(rec); return; }
    const c = d.clues[i];
    const hintBox = el('p', { class: 'tesoro-hint', hidden: true }, icon('lightbulb', { size: 18 }), ` ${c.hint || ''}`);
    const showHint = async () => { if (!hintBox.hidden) return; hintBox.hidden = false; const r = await db.get('gameArtifacts', id); await K.putArtifact({ ...r, data: { ...r.data, hintsUsed: (r.data.hintsUsed || 0) + 1 } }); };
    timer = d.mins ? K.timer({ seconds: d.mins * 60, label: 'Tiempo para esta pista', onEnd: () => { ui.toast('Se acabó el tiempo… pero sigue buscando.'); if (c.hint) showHint(); } }) : null;
    ctx.mount(el('div', { class: 'stack center-col' },
      el('p', { class: 'muted small game-progress' }, `Pista ${i + 1} de ${d.clues.length}`),
      el('div', { class: 'tesoro-paper is-in' }, el('span', { class: 'card-cat' }, `De ${profile.name(rec.by)}`), el('p', { class: 'tesoro-clue', tabindex: '-1' }, c.clue)),
      timer?.node, hintBox,
      el('div', { class: 'btn-row center-row' },
        c.hint ? ui.button({ label: 'Pista extra', iconName: 'lightbulb', variant: 'ghost', onClick: showHint }) : null,
        ui.button({ label: '¡La encontré!', iconName: 'check', variant: 'primary', onClick: async () => {
          const r = await db.get('gameArtifacts', id); await K.putArtifact({ ...r, data: { ...r.data, progress: i + 1 } }); K.ding(); util.haptic([10, 30, 10]); step(id, i + 1);
        } }))));
    timer?.start();
  };
  const finishHunt = async (rec) => {
    const minutes = rec.data.startedAt ? Math.max(1, Math.round((Date.now() - Date.parse(rec.data.startedAt)) / 60000)) : 0;
    await K.putArtifact({ ...rec, data: { ...rec.data, status: 'done', finishedAt: util.nowISO(), minutes } });
    await K.logGame('tesoro', { result: 'Tesoro encontrado', minutes, clues: rec.data.clues.length, hints: rec.data.hintsUsed || 0 });
    ui.confetti({ count: 60 }); K.ding();
    ctx.mount(el('div', { class: 'game-result stack center-col' },
      el('div', { class: 'tesoro-chest', 'aria-hidden': 'true' }, icon('gift', { size: 54 })),
      el('h2', { class: 'result-title', tabindex: '-1' }, '¡Encontraste el tesoro!'),
      el('p', { class: 'tesoro-prize' }, rec.data.prize),
      el('p', { class: 'muted' }, [`${rec.data.clues.length} pistas`, minutes ? `${minutes} min` : '', rec.data.hintsUsed ? `${rec.data.hintsUsed} ${rec.data.hintsUsed === 1 ? 'ayudita' : 'ayuditas'}` : 'sin ayuditas'].filter(Boolean).join(' · ')),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Volver', iconName: 'arrow-left', onClick: load }))));
  };
  await load();
  const off = db.onChange((store) => { if (store === 'gameArtifacts' && box.isConnected && !document.querySelector('.overlay')) load().catch(() => {}); });
  return () => { off(); timer?.stop(); };
}

// ---------- Cita misteriosa ----------
/**
 * State of each envelope: 'open' (already opened), 'ready' (can be opened now) or 'locked'.
 * An envelope unlocks by time (date + "HH:MM") or by step (after the previous one is done).
 */
export function envelopeStates(envs, { opened = {}, done = {}, date = '', now = new Date() } = {}) {
  return envs.map((e, i) => {
    if (opened[i]) return 'open';
    const prevOk = i === 0 || (opened[i - 1] && (e.unlock === 'time' || done[i - 1]));
    if (!prevOk && e.unlock !== 'time') return 'locked';
    if (e.unlock === 'time') {
      const at = util.parseDay(date); if (!at) return 'locked';
      const [h, m] = String(e.at || '00:00').split(':').map(Number); at.setHours(h || 0, m || 0, 0, 0);
      return now >= at ? 'ready' : 'locked';
    }
    return 'ready';
  });
}
const fmtTime = (hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(d); };

async function misteriosa(ctx) {
  const box = el('div', { class: 'stack' });
  let tick = 0;
  const load = async () => {
    clearInterval(tick);
    const dates = await K.artifacts('misteriosa', 'mysteryDate');
    const forYou = dates.filter((x) => forMe(x) && x.data.status !== 'done');
    const yours = dates.filter(mine);
    put(box,
      forYou.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Para ti'),
        el('ul', { class: 'sealed-list' }, forYou.map((x) => sealedCard({ iconName: 'mail', title: x.data.title || 'Una cita misteriosa', sub: `De ${profile.name(x.by)} · ${util.formatDay(x.data.date)} · ${x.data.envelopes.length} sobres`,
          action: ui.button({ label: 'Abrir', iconName: 'mail-open', variant: 'primary', small: true, onClick: () => openDate(x.id) }) })))) : null,
      el('section', { class: 'card stack center-col' },
        el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('mail', { size: 44 })),
        el('p', { class: 'game-intro-blurb' }, 'Arma una cita en sobres: cada uno trae una instrucción y se abre a su hora o al terminar el anterior.'),
        ui.button({ label: 'Armar una cita', iconName: 'plus', variant: 'primary', onClick: () => build() })),
      yours.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Las que armaste'),
        el('ul', { class: 'card pet-list' }, yours.map((x) => {
          const n = Object.keys(x.data.opened || {}).length;
          return el('li', { class: 'pet-row' }, icon(x.data.status === 'done' ? 'heart' : 'mail', { size: 18 }),
            el('div', { class: 'grow' }, el('strong', {}, x.data.title || 'Cita misteriosa'), el('p', { class: 'muted small' }, `Para ${profile.name(x.data.for)} · ${util.formatDay(x.data.date)} · ${x.data.status === 'done' ? '¡terminada!' : `${n} de ${x.data.envelopes.length} sobres abiertos`}`)),
            x.data.status !== 'done' ? ui.button({ label: 'Abrir aquí', iconName: 'smartphone', variant: 'ghost', small: true, onClick: () => handOver(x.data.for, () => openDate(x.id)) }) : null,
            !n ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar la cita', onClick: () => build(x) }, icon('pencil', { size: 16 })) : null,
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar la cita', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta cita?', message: 'Se borra en los dos teléfonos.', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('gameArtifacts', x.id); load(); } } }, icon('trash-2', { size: 16 })));
        }))) : null);
    ctx.mount(box);
  };
  const build = (rec = null) => {
    const d = rec?.data || {};
    const title = ui.input({ maxlength: '60', placeholder: 'Ej.: Nuestra noche misteriosa', value: d.title || '' });
    const date = ui.input({ type: 'date', value: d.date || util.localDay(), min: util.localDay() });
    let to = d.for || profile.partnerOf(profile.active());
    const rows = el('ol', { class: 'stack tesoro-rows' });
    const addRow = (e = {}) => {
      const text = ui.textarea({ rows: 2, maxlength: '300', placeholder: 'Ej.: Ponte algo cómodo y espérame en la puerta.' }); text.value = e.text || '';
      let unlock = e.unlock || (rows.children.length ? 'step' : 'time');
      const at = ui.input({ type: 'time', value: e.at || '19:00' });
      const atF = ui.field({ label: 'Hora', control: at }); atF.hidden = unlock !== 'time';
      const li = el('li', { class: 'card stack tesoro-row' },
        el('div', { class: 'list-head' }, el('strong', { class: 'tesoro-n' }), el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Quitar sobre', onClick: () => { li.remove(); renum(); } }, icon('x', { size: 16 }))),
        ui.field({ label: 'Instrucción', control: text }),
        ui.field({ label: 'Se abre', control: ui.segmented({ label: 'Se abre', value: unlock, options: [{ value: 'time', label: 'A una hora' }, { value: 'step', label: 'Al terminar el anterior' }], onChange: (v) => { unlock = v; atF.hidden = v !== 'time'; } }) }), atF);
      li._get = () => ({ text: text.value.trim(), unlock, at: unlock === 'time' ? at.value : '' });
      rows.append(li); renum();
    };
    const renum = () => rows.querySelectorAll('.tesoro-n').forEach((n, i) => { n.textContent = `Sobre ${i + 1}`; });
    (d.envelopes?.length ? d.envelopes : [{}, {}, {}]).forEach(addRow);
    ui.openModal({
      title: rec ? 'Editar la cita' : 'Armar una cita misteriosa', size: 'md',
      body: el('div', { class: 'stack' }, ui.field({ label: 'Nombre (lo ve al abrir)', control: title }),
        ui.field({ label: 'Para', control: ui.segmented({ label: 'Para', value: to, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), onChange: (v) => { to = v; } }) }),
        ui.field({ label: 'Día', control: date }), rows,
        ui.button({ label: 'Otro sobre', iconName: 'plus', small: true, variant: 'ghost', onClick: () => addRow() })),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        const envelopes = [...rows.children].map((li) => li._get()).filter((e) => e.text);
        if (envelopes.length < 2) { ui.toast('Escribe al menos dos sobres.'); return false; }
        if (!util.isValidDay(date.value)) return false;
        await K.putArtifact({ ...(rec || { id: util.uuid(), gameId: 'misteriosa', type: 'mysteryDate' }), data: { for: to, title: title.value.trim(), date: date.value, envelopes, opened: {}, done: {}, status: 'ready' } });
        ui.toast(to === profile.active() ? 'Guardada.' : `Lista. A ${profile.name(to)} le aparece en su teléfono, sellada.`, { tone: 'success' }); load(); return true;
      } }],
    });
  };
  const openDate = async (id) => {
    clearInterval(tick);
    const rec = await db.get('gameArtifacts', id);
    if (!rec || rec.deleted) { load(); return; }
    const d = rec.data;
    const states = envelopeStates(d.envelopes, { opened: d.opened, done: d.done, date: d.date });
    const update = async (patch) => { const r = await db.get('gameArtifacts', id); await K.putArtifact({ ...r, data: { ...r.data, ...patch(r.data) } }); };
    const allDone = d.envelopes.every((_, i) => d.opened?.[i]) && d.done?.[d.envelopes.length - 1];
    if (allDone && d.status !== 'done') {
      await update(() => ({ status: 'done', finishedAt: util.nowISO() }));
      await K.logGame('misteriosa', { result: d.title || 'Cita misteriosa', envelopes: d.envelopes.length });
      ui.confetti({ count: 50 });
    }
    ctx.mount(el('div', { class: 'stack' },
      el('h2', { class: 'game-step-title center', tabindex: '-1' }, d.title || 'Cita misteriosa'),
      el('p', { class: 'muted center' }, `De ${profile.name(rec.by)} · ${util.formatDay(d.date)}`),
      el('ol', { class: 'envelopes' }, d.envelopes.map((e, i) => {
        const s = states[i];
        const isDone = !!d.done?.[i];
        return el('li', { class: `envelope is-${s}${isDone ? ' is-done' : ''}` },
          el('div', { class: 'envelope-flap', 'aria-hidden': 'true' }),
          el('div', { class: 'envelope-body' },
            el('span', { class: 'card-cat' }, `Sobre ${i + 1}`),
            s === 'open' ? el('p', { class: 'envelope-text' }, e.text)
              : s === 'ready' ? ui.button({ label: 'Abrir el sobre', iconName: 'mail-open', variant: 'primary', small: true, onClick: async () => { K.ding(); util.haptic([10, 30, 10]); await update((x) => ({ opened: { ...(x.opened || {}), [i]: util.nowISO() } })); openDate(id); } })
                : el('p', { class: 'muted small' }, icon('lock', { size: 16 }), e.unlock === 'time' ? ` Se abre a las ${fmtTime(e.at)}${util.localDay() !== d.date ? ` del ${util.formatDay(d.date)}` : ''}` : ' Se abre al terminar el anterior'),
            s === 'open' && !isDone ? ui.button({ label: i + 1 < d.envelopes.length ? 'Hecho, el siguiente' : '¡Terminamos!', iconName: 'check', small: true, onClick: async () => { await update((x) => ({ done: { ...(x.done || {}), [i]: util.nowISO() } })); openDate(id); } }) : null,
            isDone ? el('span', { class: 'envelope-check', 'aria-label': 'Hecho' }, icon('circle-check', { size: 18 })) : null));
      })),
      allDone ? el('p', { class: 'center result-title' }, '¡Fin de la cita! Ojalá la hayan disfrutado.') : null,
      el('div', { class: 'btn-row' }, ui.button({ label: 'Volver', iconName: 'arrow-left', variant: 'ghost', onClick: load }))));
    if (states.includes('locked')) tick = setInterval(async () => {
      const r = await db.get('gameArtifacts', id).catch(() => null);
      if (r && envelopeStates(r.data.envelopes, { opened: r.data.opened, done: r.data.done, date: r.data.date }).join() !== states.join()) openDate(id);
    }, 20000);
  };
  await load();
  return () => clearInterval(tick);
}

const GAMES = { recuerdo, cata, cocina, tesoro, misteriosa };
export const play = (ctx) => GAMES[ctx.game.id](ctx);
