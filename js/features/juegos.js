// Juegos en pareja (docs/05 §34): the game room ("¿Qué jugamos?" by mood, length and level, and
// every game in cards of 2 per row), the runner (intro with options, session, result and rematch),
// the history, the settings (passes, penalties, drink mode limits) and the editable banks.
// Routes: /juegos, /juegos/<game>, /juegos/historial, /juegos/ajustes, /juegos/bancos, /juegos/dibujos.
import { ui, util, db, profile, CONFIG, seed } from '../core.js';
import * as K from './juegos-kit.js';
import { draw } from '../core/art.js';
import { wire as wirePet } from '../core/pets.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const LAST = 'aishiteru.games.choice';
const recallChoice = () => { try { return JSON.parse(sessionStorage.getItem(LAST)) || {}; } catch { return {}; } };
const rememberChoice = (v) => { try { sessionStorage.setItem(LAST, JSON.stringify(v)); } catch { /* private mode */ } };

const loaders = {
  mimica: () => import('./juegos-cartas.js'), probable: () => import('./juegos-cartas.js'), estooaquello: () => import('./juegos-cartas.js'),
  yonunca: () => import('./juegos-cartas.js'), cancion: () => import('./juegos-cartas.js'), cuentos: () => import('./juegos-cartas.js'),
  ruleta: () => import('./juegos-mesa.js'), dibujo: () => import('./juegos-mesa.js'), memoria: () => import('./juegos-mesa.js'),
  trivia: () => import('./juegos-mesa.js'), liga: () => import('./juegos-mesa.js'), juntos: () => import('./juegos-mesa.js'),
  recuerdo: () => import('./juegos-casa.js'), cata: () => import('./juegos-casa.js'), cocina: () => import('./juegos-casa.js'),
  tesoro: () => import('./juegos-casa.js'), misteriosa: () => import('./juegos-casa.js'),
  bingo: () => import('./juegos-planes.js'), reto30: () => import('./juegos-planes.js'), cine: () => import('./juegos-planes.js'),
  origami: () => import('./juegos-japon.js'), tanabata: () => import('./juegos-japon.js'), kotoba: () => import('./juegos-japon.js'),
  manga: () => import('./juegos-japon.js'), postales: () => import('./juegos-japon.js'),
};

// Banks shown in the editor: [bank, title, fields]
export const BANKS = [
  ['castigos-suave', 'Castigos · suave', [['text', 'Castigo']]],
  ['castigos-divertido', 'Castigos · divertido', [['text', 'Castigo']]],
  ['castigos-intenso', 'Castigos · intenso', [['text', 'Castigo']]],
  ['castigos-bebida', 'Castigos con bebida', [['text', 'Con bebida'], ['alt', 'Alternativa sin alcohol']]],
  ['ruleta', 'Ruleta de la noche', [['text', 'Opción'], ['cat', 'Grupo (cena, plan, pelicula o postre)']]],
  ['mimica', 'Mímica', [['text', 'Palabra'], ['cat', 'Categoría']]],
  ['probable', '¿Quién es más probable…?', [['text', 'Pregunta']]],
  ['estooaquello', 'Esto o aquello', [['a', 'Esto'], ['b', 'Aquello']]],
  ['yonunca', 'Yo nunca', [['text', 'Frase']]],
  ['dibujo', 'Dibuja y adivina', [['text', 'Palabra']]],
  ['canciones', 'Adivina la canción', [['text', 'Canción'], ['artist', 'Artista o pista']]],
  ['cuentos', 'Cuentos: palabras', [['text', 'Palabra']]],
  ['cuentos-inicio', 'Cuentos: comienzos', [['text', 'Comienzo']]],
  ['liga', 'Liga: juegos', [['text', 'Juego']]],
  ['cocina', 'Reto de cocina: recetas', [['text', 'Receta'], ['cat', 'Etiquetas (rapido; japones; dulce; salado)'], ['mins', 'Minutos'], ['ing', 'Ingredientes (separados por ;)'], ['steps', 'Pasos (separados por ;)']]],
  ['bingo', 'Bingo de citas', [['text', 'Plan']]],
  ['reto30', 'Desafío de 30 días', [['text', 'Reto']]],
  ['manga-sfx', 'Manga: onomatopeyas', [['text', 'En letras latinas'], ['jp', 'En japonés (opcional)']]],
  ['__words', 'Palabra del día', [['jp', 'En japonés'], ['romaji', 'Romaji'], ['es', 'Significado'], ['cat', 'Tema']]],
];

/** Content kind of a bank (the daily words have their own kind, shared with CONFIG.japaneseWords). */
const kindOf = (bank) => (bank === '__words' ? 'japaneseWord' : `game:${bank}`);

// ---------- room ("Arcade de papel", chosen 2026-11-22) ----------
// An origami fox on top, colored tiles with washi tape for "Para ahora" and every game on shelves
// by kind (they scroll sideways on a phone). The choice of mood, time and level stays as before.
// Liga and Modo juntos have their own tabs; 30 días lives in Retos and Noche de cine in Planes (2026-11-22).
const ELSEWHERE = new Set(['liga', 'juntos', 'reto30', 'cine']);
const PLAYABLE = () => K.GAME_LIST.filter((g) => !ELSEWHERE.has(g.id));
const SHELVES = [
  ['Para reír', ['mimica', 'probable', 'estooaquello', 'yonunca', 'cancion', 'cata']],
  ['Para competir', ['dibujo', 'memoria', 'trivia', 'recuerdo', 'cocina']],
  ['Tranquilos y juntos', ['ruleta', 'cuentos', 'tanabata']],
  ['Salidas y sorpresas', ['tesoro', 'misteriosa', 'bingo']],
  ['Japón y manualidades', ['origami', 'kotoba', 'manga', 'postales']],
];
const toneOf = (id) => (K.GAME_LIST.findIndex((g) => g.id === id) % 6) + 1;
function gameTile(g, query = '', { mini = false } = {}) {
  const soon = !g.ready;
  const inner = [
    mini ? null : el('span', { class: 'game-tape', 'aria-hidden': 'true' }),
    el('span', { class: 'game-stamp' }, icon(g.icon, { size: mini ? 20 : 22 })),
    el('span', { class: 'game-tile-text' }, el('span', { class: 'game-tile-title' }, g.title), mini ? null : el('span', { class: 'small clamp-2 game-tile-blurb' }, g.blurb)),
    mini ? null : el('span', { class: 'game-ghost', 'aria-hidden': 'true' }, icon(g.icon, { size: 72 })),
    soon ? el('span', { class: 'badge soon-pill' }, 'Pronto') : null];
  const cls = `game-tile tone-${toneOf(g.id)}${mini ? ' is-mini' : ''}`;
  return el('li', {}, soon
    ? el('div', { class: `${cls} is-soon`, 'aria-disabled': 'true' }, inner.filter(Boolean))
    : el('a', { class: cls, href: `#/juegos/${g.id}${query}` }, inner.filter(Boolean)));
}

async function monthChampion() {
  const ym = util.localDay().slice(0, 7);
  const recs = (await db.query('games').catch(() => [])).filter((r) => !r.deleted && (r.endedAt || r.date || '').slice(0, 7) === ym);
  const wins = Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  for (const r of recs) if (r.winner && wins[r.winner] != null) wins[r.winner]++;
  const best = K.winnerOf(wins);
  return { best, wins, played: recs.length };
}

async function room(page) {
  const c = { mood: 'risas', mins: 15, level: (await K.settings()).level || 'divertido', ...recallChoice() };
  const picks = el('ul', { class: 'game-grid' });
  const q = () => `?min=${c.mins}&nivel=${c.level}`;
  const summary = el('p', { class: 'game-hero-sub' });
  const shelves = el('div', { class: 'game-shelves' });
  // Options only change the picks and the links' query: the shelves are built once and the picks are
  // rebuilt only when the list really changes, so the screen doesn't flash (Rowler, 2026-11-22).
  let pickIds = '';
  const seen = new Set(SHELVES.flatMap(([, ids]) => ids));
  const extra = PLAYABLE().filter((g) => !seen.has(g.id)).map((g) => g.id);
  put(shelves, ...[...SHELVES, ...(extra.length ? [['Más juegos', extra]] : [])].map(([title, ids]) => el('section', { class: 'game-shelf' },
    el('h3', { class: 'game-shelf-title' }, title, el('span', { class: 'muted small' }, ` · ${ids.length}`)),
    el('ul', { class: 'game-row' }, ids.map((id) => K.gameById(id)).filter(Boolean).map((g) => gameTile(g, q(), { mini: true }))))));
  const paintPicks = () => {
    rememberChoice(c);
    const list = PLAYABLE().filter((g) => g.ready && g.moods.includes(c.mood) && g.mins.includes(c.mins));
    const fallback = list.length ? list : PLAYABLE().filter((g) => g.ready && g.moods.includes(c.mood));
    const ids = fallback.map((g) => g.id).join();
    if (ids !== pickIds) { pickIds = ids; put(picks, ...fallback.map((g) => gameTile(g, q()))); }
    const query = q();
    for (const a of page.querySelectorAll('a.game-tile')) a.setAttribute('href', a.getAttribute('href').replace(/\?.*$/, '') + query);
    const label = (arr, v) => arr.find((o) => String(o.value) === String(v))?.label || v;
    summary.textContent = `${label(K.MOODS, c.mood)} · ${c.mins} min · castigos ${String(label(K.LEVELS, c.level)).toLowerCase()}`;
  };
  const surprise = ui.button({ label: 'Sorpréndannos', iconName: 'dices', variant: 'primary', onClick: () => {
    const list = PLAYABLE().filter((g) => g.ready && g.moods.includes(c.mood));
    const g = list[Math.floor(Math.random() * list.length)];
    if (g) location.hash = `#/juegos/${g.id}${q()}`;
  } });
  const champ = await monthChampion();
  const hero = el('section', { class: 'game-hero', 'aria-labelledby': 'game-hero-title' },
    wirePet(el('span', { class: 'game-hero-fox' }, draw('fox')), 'fox'),
    el('span', { class: 'game-hero-dice', 'aria-hidden': 'true' }, draw('dice')),
    el('div', { class: 'game-hero-text' },
      el('h2', { class: 'game-hero-title', id: 'game-hero-title' }, '¿Qué jugamos?'), summary, surprise));
  add(page,
    hero,
    champ.played ? el('a', { class: 'game-champ', href: '#/liga' }, icon('crown', { size: 18 }), champ.best ? `Va ganando el mes: ${profile.name(champ.best)} (${champ.wins[champ.best]} a ${champ.wins[profile.partnerOf(champ.best)]})` : `Este mes van empatados (${champ.wins[profile.PEOPLE[0]]} a ${champ.wins[profile.PEOPLE[1]]})`) : null,
    el('details', { class: 'card game-picker' },
      el('summary', { class: 'game-picker-summary' }, icon('sliders-horizontal', { size: 18 }), el('span', {}, 'Cómo están, tiempo y castigos')),
      el('div', { class: 'stack game-picker-body' },
        ui.field({ label: 'Cómo están', control: ui.segmented({ label: 'Cómo están', value: c.mood, options: K.MOODS, onChange: (v) => { c.mood = v; paintPicks(); } }) }),
        el('div', { class: 'game-picker-row' },
          ui.field({ label: 'Cuánto tiempo', control: ui.segmented({ label: 'Cuánto tiempo', value: String(c.mins), options: K.DURATIONS.map((m) => ({ value: String(m), label: `${m} min` })), onChange: (v) => { c.mins = Number(v); paintPicks(); } }) }),
          ui.field({ label: 'Nivel de los castigos', control: ui.segmented({ label: 'Nivel de los castigos', value: c.level, options: K.LEVELS, onChange: (v) => { c.level = v; paintPicks(); } }) })))),
    el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Para ahora'), picks),
    el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Todos los juegos'), shelves));
  paintPicks();
}

// ---------- runner ----------
async function runner(page, game, query, back = '/juegos') {
  const st = await K.settings();
  const mins = K.DURATIONS.includes(Number(query.min)) ? Number(query.min) : (game.mins.includes(15) ? 15 : game.mins[0]);
  const opts = { first: profile.active(), level: K.LEVELS.some((l) => l.value === query.nivel) ? query.nivel : st.level, drink: false, mins };
  const body = el('div', { class: 'game-body' });
  let cleanup = null;
  const quit = el('button', { class: 'btn btn-ghost btn-small', type: 'button', hidden: true, onClick: async () => { if (await K.confirmQuit()) endNow?.(); } }, icon('flag', { size: 18 }), el('span', {}, 'Terminar'));
  add(page, ui.pageHeader({ title: game.title, back, actions: [quit] }), body);
  const mod = await loaders[game.id]();
  let endNow = null;

  const start = async () => {
    cleanup?.(); quit.hidden = false;
    const s = K.createSession({ gameId: game.id, ...opts, passes: st.passes, drinkCap: st.drinkCap, waterEvery: st.waterEvery, refusePoints: st.refusePoints });
    if (s.drink) ui.toast('Modo con bebida: tomen con calma y nadie maneja después.', { tone: 'info', timeout: 6000 });
    const ctx = {
      game, s, mins, opts,
      mount: (...nodes) => { put(body, ...nodes.filter(Boolean)); body.querySelector('h2, .gcard-stage, button')?.focus?.({ preventScroll: true }); },
      finish: async ({ lines = [], record = {}, scored = true, extra = null } = {}) => {
        cleanup?.(); cleanup = null; quit.hidden = true; endNow = null;
        await s.save(record).catch((e) => console.error(e));
        put(body, K.resultView(s, { lines, scored, extra, onRematch: () => { opts.first = profile.partnerOf(opts.first); start(); } }));
        window.scrollTo({ top: 0, behavior: util.prefersReducedMotion() ? 'auto' : 'smooth' });
      },
    };
    cleanup = await mod.play(ctx);
    endNow = () => (cleanup?.end ? cleanup.end() : ctx.finish());
  };

  const optionsNode = async () => {
    if (mod.noIntro?.includes(game.id)) return null;
    const box = el('div', { class: 'stack game-options' });
    if (game.mins.length > 1) add(box, ui.field({ label: 'Duración', control: ui.segmented({ label: 'Duración', value: String(mins), options: game.mins.map((m) => ({ value: String(m), label: `${m} min` })), onChange: (v) => { opts.mins = Number(v); } }) }));
    const extra = mod.options?.[game.id]?.(opts);
    if (extra) add(box, extra);
    if (mod.scoredGames?.includes(game.id)) {
      add(box, K.firstPicker(opts.first, (v) => { opts.first = v; }));
      add(box, ui.field({ label: 'Nivel de los castigos', control: ui.segmented({ label: 'Nivel de los castigos', value: opts.level, options: K.LEVELS, onChange: (v) => { opts.level = v; } }) }));
      const adults = await K.adults();
      if (adults !== 'no') {
        const tg = ui.toggle({ label: 'Modo con bebida', hint: `Solo mayores de 18. Tope de ${st.drinkCap} por persona, siempre con alternativa sin alcohol.`, checked: false, onChange: async (v) => {
          if (v && !(await ui.confirmDialog({ title: '¿Activar el modo con bebida?', message: `Solo si los dos son mayores de 18 y nadie va a manejar después. Hay tope de ${st.drinkCap} bebidas por persona, pausas de agua y cada castigo tiene su alternativa sin alcohol.`, confirmLabel: 'Activar' }))) {
            tg.querySelector('.switch-input').checked = false; opts.drink = false; return;
          }
          opts.drink = v;
        } });
        add(box, tg);
      }
      add(box, el('p', { class: 'muted small' }, st.passes ? `Cada uno tiene ${st.passes} ${st.passes === 1 ? 'pase libre' : 'pases libres'}; desde ahí, pasar trae un castigo.` : 'Sin pases libres: pasar siempre trae un castigo.'));
    }
    return box;
  };

  const showIntro = async () => {
    cleanup?.(); cleanup = null; quit.hidden = true;
    if (mod.direct?.includes(game.id)) { cleanup = await mod.play({ game, mount: (...n) => put(body, ...n.filter(Boolean)) }); return; }
    put(body, K.intro({ game, rules: mod.rules?.[game.id] || [], options: await optionsNode(), onStart: () => { opts.mins = opts.mins || mins; start(); } }));
  };
  await showIntro();
  return () => cleanup?.();
}

// ---------- history ----------
async function history(page) {
  add(page, ui.pageHeader({ title: 'Historial de juegos', back: '/juegos' }));
  const recs = (await db.query('games').catch(() => [])).filter((r) => !r.deleted).sort((a, b) => (b.endedAt || b.date || '').localeCompare(a.endedAt || a.date || ''));
  if (!recs.length) { add(page, ui.emptyState({ title: 'Todavía no han jugado', text: 'Cada partida queda aquí con su marcador, los pases y los castigos.', art: 'fan' })); return; }
  const wins = Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  for (const r of recs) if (r.winner && wins[r.winner] != null) wins[r.winner]++;
  const juntos = recs.filter((r) => r.gameId === 'juntos').reduce((n, r) => n + (r.minutes || 0), 0);
  add(page, 
    el('section', { class: 'card game-stats' },
      el('div', {}, el('strong', {}, String(recs.length)), el('span', { class: 'muted small' }, 'partidas')),
      ...profile.PEOPLE.map((p) => el('div', {}, el('strong', {}, String(wins[p])), el('span', { class: 'muted small' }, `ganadas por ${profile.name(p)}`))),
      el('div', {}, el('strong', {}, `${juntos}`), el('span', { class: 'muted small' }, 'minutos juntos de verdad'))),
    el('ul', { class: 'card pet-list game-history' }, recs.slice(0, 80).map((r) => {
      const g = K.gameById(r.gameId);
      const when = (r.endedAt || r.date || '').slice(0, 10);
      const detail = r.gameId === 'liga' ? `${r.ligaType || 'Juego'} · ${r.winner ? `ganó ${profile.name(r.winner)}` : 'empate'}`
        : r.gameId === 'juntos' ? `${r.minutes || 0} min sin teléfonos`
          : r.gameId === 'ruleta' ? (r.result ? `Salió: ${r.result}` : 'Ruleta')
            : r.score ? `${profile.PEOPLE.map((p) => `${profile.name(p)} ${r.score[p] ?? 0}`).join(' · ')}${r.winner ? ` · ganó ${profile.name(r.winner)}` : ''}${r.result ? ` · ${r.result}` : ''}`
              : r.result || '';
      const pens = (r.penalties || []).filter((x) => x.outcome === 'done' || x.outcome === 'alt').length;
      return el('li', { class: 'pet-row' }, el('span', { class: 'section-icon' }, icon(g?.icon || 'gamepad-2', { size: 18 })),
        el('div', { class: 'grow' }, el('strong', {}, g?.title || r.gameId), el('p', { class: 'muted small' }, [detail, pens ? `${pens} ${pens === 1 ? 'castigo' : 'castigos'}` : '', when ? util.formatDay(when) : ''].filter(Boolean).join(' · '))),
        g?.ready && r.score && r.gameId !== 'liga' ? el('a', { class: 'btn btn-ghost btn-small', href: `#/juegos/${r.gameId}`, 'aria-label': `Revancha de ${g.title}` }, icon('swords', { size: 18 }), el('span', {}, 'Revancha')) : null);
    })));
}

// ---------- Liga (tab, 2026-11-22): the monthly winner, bars and champions ----------
const MONTHS = new Intl.DateTimeFormat('es-CO', { month: 'short' });
const ym = (r) => (r.date || r.endedAt || '').slice(0, 7);
/** Wins per person per month for every game with a winner (Liga entries and scored games). */
export function monthlyWins(recs) {
  const by = new Map();
  for (const r of recs) {
    if (r.deleted || !r.winner || !profile.PEOPLE.includes(r.winner)) continue;
    const k = ym(r); if (!k) continue;
    if (!by.has(k)) by.set(k, Object.fromEntries(profile.PEOPLE.map((p) => [p, 0])));
    by.get(k)[r.winner]++;
  }
  return by;
}

async function ligaPage(page) {
  add(page, ui.pageHeader({ title: 'Liga', jp: 'リーグ', romaji: 'rīgu', back: '/mas', actions: [
    ui.button({ label: 'Historial', iconName: 'history', small: true, variant: 'ghost', href: '#/juegos/historial' })] }));
  const recs = (await db.query('games').catch(() => [])).filter((r) => !r.deleted);
  const by = monthlyWins(recs);
  const now = util.localDay().slice(0, 7);
  const cur = by.get(now) || Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  const best = K.winnerOf(cur);
  const top = Math.max(1, ...profile.PEOPLE.map((p) => cur[p]));
  const [a, b] = profile.PEOPLE;
  const titles = Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  for (const [k, w] of by) { if (k >= now) continue; const who = K.winnerOf(w); if (who) titles[who]++; }
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const maxM = Math.max(1, ...months.flatMap((k) => profile.PEOPLE.map((p) => by.get(k)?.[p] || 0)));
  const bar = (p, n, max) => el('span', { class: `liga-bar who-${profile.PEOPLE.indexOf(p) + 1}` }, el('span', { class: 'liga-bar-fill', 'data-pct': String(Math.round((n / max) * 100)) }));
  add(page,
    el('section', { class: 'card liga-hero', 'aria-labelledby': 'liga-hero-title' },
      el('span', { class: 'liga-hero-crown', 'aria-hidden': 'true' }, icon('crown', { size: 34 })),
      el('p', { class: 'card-kicker' }, `Campeón de ${MONTHS.format(new Date()).replace('.', '')}`),
      el('h2', { class: 'liga-hero-title', id: 'liga-hero-title' }, best ? `Va ganando ${profile.name(best)}` : (cur[a] ? 'Van empatados' : 'Nadie ha ganado aún')),
      el('ul', { class: 'liga-race' }, profile.PEOPLE.map((p) => el('li', { class: `liga-race-row${best === p ? ' is-best' : ''}` },
        el('span', { class: 'score-avatar', 'aria-hidden': 'true' }, profile.name(p).slice(0, 1)),
        el('span', { class: 'liga-race-name' }, profile.name(p)),
        bar(p, cur[p], top),
        el('strong', { class: 'liga-race-n' }, String(cur[p]))))),
      el('p', { class: 'muted small' }, 'Cuenta las partidas de la Liga y cada juego con ganador. El 1 de cada mes empieza de cero.')),
    el('div', { class: 'btn-row' },
      ui.button({ label: 'Anotar una partida', iconName: 'plus', variant: 'primary', href: '#/juegos/liga' }),
      ui.button({ label: 'Jugar algo', iconName: 'gamepad-2', variant: 'ghost', href: '#/juegos' })),
    el('section', { class: 'card liga-months', 'aria-labelledby': 'liga-months-title' },
      el('h2', { class: 'section-title', id: 'liga-months-title' }, 'Últimos 6 meses'),
      el('div', { class: 'liga-legend small' }, profile.PEOPLE.map((p, i) => el('span', {}, el('span', { class: `liga-dot who-${i + 1}`, 'aria-hidden': 'true' }), profile.name(p)))),
      el('ol', { class: 'liga-cols' }, months.map((k) => {
        const w = by.get(k) || {};
        const label = MONTHS.format(new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1)).replace('.', '');
        return el('li', { class: 'liga-col', 'aria-label': `${label}: ${profile.PEOPLE.map((p) => `${profile.name(p)} ${w[p] || 0}`).join(', ')}` },
          el('span', { class: 'liga-col-bars', 'aria-hidden': 'true' }, profile.PEOPLE.map((p, i) => el('span', { class: `liga-col-bar who-${i + 1}`, 'data-pct': String(Math.round(((w[p] || 0) / maxM) * 100)) }))),
          el('span', { class: 'liga-col-label small' }, label), K.winnerOf(w) ? el('span', { class: 'liga-col-crown', 'aria-hidden': 'true' }, icon('crown', { size: 12 })) : null);
      }))),
    el('section', { class: 'card game-stats' },
      ...profile.PEOPLE.map((p) => el('div', {}, el('strong', {}, String(titles[p])), el('span', { class: 'muted small' }, `${titles[p] === 1 ? 'mes ganado' : 'meses ganados'} por ${profile.name(p)}`))),
      el('div', {}, el('strong', {}, String(recs.filter((r) => r.winner).length)), el('span', { class: 'muted small' }, 'partidas con ganador'))));
  // Bar widths go through the CSSOM (the CSP blocks inline style attributes).
  for (const f of page.querySelectorAll('[data-pct]')) {
    const pct = `${Math.max(Number(f.dataset.pct), 0)}%`;
    if (f.classList.contains('liga-col-bar')) f.style.height = pct; else f.style.width = pct;
  }
  void b;
}

// ---------- Modos (tab, 2026-11-22): the two "be together" modes, explained ----------
async function modosPage(page) {
  add(page, ui.pageHeader({ title: 'Modos', jp: '時間', romaji: 'jikan', back: '/mas' }));
  const mode = (href, art, title, what, how, cta) => el('a', { class: 'card card-link mode-card', href },
    el('span', { class: 'mode-art', 'aria-hidden': 'true' }, draw(art)),
    el('span', { class: 'mode-text' },
      el('span', { class: 'mode-title' }, title),
      el('span', { class: 'mode-what' }, what),
      el('span', { class: 'muted small' }, how),
      el('span', { class: 'mode-cta' }, cta, icon('chevron-right', { size: 18 }))));
  add(page, el('div', { class: 'mode-list' },
    mode('#/juegos/juntos', 'tanuki', 'Modo juntos', 'Teléfonos boca abajo y tiempo de verdad.',
      'Eligen cuántos minutos, ponen el teléfono boca abajo y la app cuenta el tiempo. Si alguno lo levanta antes, se nota. Suma minutos a su historial.', 'Empezar'),
    mode('#/modo-cita', 'crane', 'Modo cita', 'Para usar mientras están en una salida.',
      'Les da una pregunta para conversar, un botón de foto rápida y una nota para no olvidar. Al terminar, la app arma sola el recuerdo en la Cápsula.', 'Empezar una cita')));
}

// ---------- settings ----------
async function settingsPage(page) {
  add(page, ui.pageHeader({ title: 'Ajustes de juegos', back: '/juegos' }));
  const st = await K.settings();
  const save = async (patch) => { await K.saveSettings(patch); ui.toast('Guardado.', { tone: 'success' }); };
  const num = (label, key, opts, hint) => ui.field({ label, hint, control: ui.segmented({ label, value: String(st[key]), options: opts.map((v) => ({ value: String(v), label: String(v) })), onChange: (v) => save({ [key]: Number(v) }) }) });
  add(page, el('section', { class: 'card stack' },
    num('Pases libres por persona', 'passes', [0, 1, 2, 3], 'En cada partida. Desde el siguiente, pasar trae un castigo.'),
    ui.field({ label: 'Nivel de castigos por defecto', control: ui.segmented({ label: 'Nivel de castigos por defecto', value: st.level, options: K.LEVELS, onChange: (v) => save({ level: v }) }) }),
    num('Puntos que cuesta "Cambiar" o "Parar"', 'refusePoints', [1, 2, 3], 'Rechazar un castigo solo cuesta puntos, nunca más.'),
    el('h2', { class: 'section-title' }, 'Modo con bebida'),
    el('p', { class: 'muted small' }, 'Siempre está apagado al empezar y se activa por partida. Solo para mayores de 18. Cada castigo con bebida tiene su alternativa sin alcohol.'),
    num('Tope de bebidas por persona', 'drinkCap', [1, 2, 3, 4, 5], 'Al llegar al tope, los castigos con bebida se cambian solos por su alternativa.'),
    num('Pausa de agua cada', 'waterEvery', [3, 4, 5, 6], 'Rondas.')),
  el('div', { class: 'btn-row' }, ui.button({ label: 'Editar bancos de palabras y castigos', iconName: 'pencil', href: '#/juegos/bancos' })));
}

// ---------- banks editor ----------
async function banksPage(page) {
  add(page, ui.pageHeader({ title: 'Bancos de los juegos', back: '/juegos/ajustes' }));
  const select = el('select', { class: 'input', id: 'bank-select' }, BANKS.map(([id, title]) => el('option', { value: id }, title)));
  const box = el('div', { class: 'stack' });
  add(page, el('section', { class: 'card stack' }, el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'bank-select' }, 'Banco'), select),
    el('p', { class: 'muted small' }, 'Lo que agreguen o cambien aquí sale en los juegos. Ocultar saca un elemento sin borrarlo.'), box));
  const draw = async () => {
    const [bank, title, fields] = BANKS.find((b) => b[0] === select.value);
    const kind = kindOf(bank);
    const all = (await db.query('content', { index: 'kind', range: IDBKeyRange.only(kind), includeHidden: true })).filter((r) => !r.deleted)
      .sort((a, b) => (a.origin === 'user') - (b.origin === 'user') || String(a.id).localeCompare(String(b.id)));
    let showAll = all.length <= 15;
    const ul = el('ul', { class: 'edit-list' });
    const rows = () => put(ul, ...(showAll ? all : all.slice(0, 15)).map((r) => el('li', { class: `edit-row${r.hidden ? ' is-hidden' : ''}` },
      el('div', { class: 'edit-text' }, el('p', { class: 'edit-title clamp-2' }, fields[0][0] === 'a' ? `${r.a} · ${r.b}` : bank === '__words' ? `${r.jp || ''} · ${r.romaji || ''}` : r[fields[0][0]] || ''),
        fields[1] && fields[0][0] !== 'a' && r[fields[1][0]] ? el('p', { class: 'muted small clamp-2' }, r[fields[1][0]]) : null,
        r.hidden ? el('span', { class: 'badge' }, 'Oculto') : r.origin === 'user' ? el('span', { class: 'badge badge-ok' }, 'Agregado') : r.userEdited ? el('span', { class: 'badge' }, 'Editado') : null),
      el('div', { class: 'edit-actions' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar: ${String(r.text || r.a || '').slice(0, 40)}`, onClick: () => editor(bank, fields, r, draw) }, icon('pencil', { size: 18 })),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': r.hidden ? 'Mostrar' : 'Ocultar', onClick: async () => { await db.put('content', { ...r, hidden: !r.hidden }, { userEdit: false }); draw(); } }, icon(r.hidden ? 'eye' : 'eye-off', { size: 18 })),
        r.origin === 'user' ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar?', message: 'No se puede deshacer.', confirmLabel: 'Borrar', danger: true })) { await db.purge('content', r.id); draw(); } } }, icon('trash-2', { size: 18 })) : null))));
    rows();
    const more = showAll ? null : ui.button({ label: `Ver todos (${all.length})`, variant: 'ghost', small: true, onClick: () => { showAll = true; rows(); more.remove(); } });
    put(box, 
      el('div', { class: 'list-head' }, el('h2', { class: 'card-title' }, title, el('span', { class: 'count-pill' }, String(all.filter((r) => !r.hidden).length))),
        ui.button({ label: 'Agregar', iconName: 'plus', small: true, onClick: () => editor(bank, fields, null, draw) })),
      all.length ? ul : el('p', { class: 'muted' }, 'Este banco está vacío.'), more,
      el('div', { class: 'btn-row' }, ui.button({ label: 'Restablecer los textos originales', iconName: 'rotate-ccw', variant: 'ghost', onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Restablecer este banco?', message: 'Los textos con los que vino la app vuelven a su versión original. Los que agregaron ustedes se quedan.', confirmLabel: 'Restablecer' }))) return;
        await seed.resetKind(CONFIG, kind); ui.toast('Banco restablecido.'); draw();
      } })));
  };
  select.addEventListener('change', draw);
  await draw();
}

function editor(bank, fields, rec, done) {
  const controls = fields.map(([key, label]) => { const c = ui.input({ maxlength: key === 'ing' || key === 'steps' ? '1200' : '200' }); c.value = rec?.[key] || ''; return { key, c, f: ui.field({ label, control: c }) }; });
  ui.openModal({
    title: rec ? 'Editar' : 'Agregar', kind: 'sheet', body: el('div', { class: 'stack' }, controls.map((x) => x.f)),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!controls[0].c.value.trim()) { controls[0].f.setError('Escribe el texto.'); return false; }
      const patch = Object.fromEntries(controls.map(({ key, c }) => [key, c.value.trim()]));
      if (bank === 'estooaquello') patch.text = `${patch.a} o ${patch.b}`;
      await db.put('content', rec ? { ...rec, ...patch } : { id: `user:${kindOf(bank)}:${util.uuid().slice(0, 8)}`, kind: kindOf(bank), ...patch });
      ui.toast('Guardado.', { tone: 'success' }); done(); return true;
    } }],
  });
  requestAnimationFrame(() => controls[0].c.focus());
}

// ---------- drawings ----------
async function drawings(page) {
  add(page, ui.pageHeader({ title: 'Dibujos guardados', back: '/juegos/dibujo' }));
  const arts = (await db.query('gameArtifacts', { index: 'gameId', range: IDBKeyRange.only('dibujo') }).catch(() => [])).filter((a) => !a.deleted && a.mediaId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!arts.length) { add(page, ui.emptyState({ title: 'Aún no hay dibujos', text: 'Al terminar un turno de Dibuja y adivina pueden guardar el dibujo.', art: 'fan' })); return () => {}; }
  const urls = [];
  const grid = el('ul', { class: 'drawing-grid' });
  for (const a of arts) {
    const b = await db.getMedia(a.mediaId).catch(() => null);
    if (!b) continue;
    const u = URL.createObjectURL(b); urls.push(u);
    add(grid, el('li', { class: 'drawing-tile' }, el('img', { src: u, alt: `Dibujo de ${profile.name(a.data?.by) || 'ustedes'}: ${a.data?.word || ''}` }),
      el('p', { class: 'small' }, el('strong', {}, a.data?.word || ''), ` · ${profile.name(a.data?.by) || ''}`),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar el dibujo', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar el dibujo?', confirmLabel: 'Borrar', danger: true })) { await db.purge('gameArtifacts', a.id); location.reload(); } } }, icon('trash-2', { size: 18 }))));
  }
  add(page, grid);
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}

// ---------- page ----------
export async function render({ params = {}, query = {}, def = {} } = {}) {
  const page = el('section', { class: 'page page-wide juegos' });
  let cleanup = null;
  const sub = params.a;
  try {
    if (def.id === 'liga') await ligaPage(page);
    else if (def.id === 'modos') await modosPage(page);
    else if (def.id === 'cine' || def.id === 'reto30') cleanup = await runner(page, K.gameById(def.id), query, '/mas');
    else if (!sub) {
      add(page, ui.pageHeader({ title: 'Juegos', jp: '遊び', romaji: 'asobi', back: '/mas', actions: [
        ui.button({ label: 'Historial', iconName: 'history', small: true, variant: 'ghost', href: '#/juegos/historial' }),
        el('a', { class: 'icon-btn', href: '#/juegos/ajustes', 'aria-label': 'Ajustes de juegos' }, icon('sliders-horizontal'))] }));
      await room(page);
    } else if (sub === 'historial') await history(page);
    else if (sub === 'ajustes') await settingsPage(page);
    else if (sub === 'bancos') await banksPage(page);
    else if (sub === 'dibujos') cleanup = await drawings(page);
    else {
      const g = K.gameById(sub);
      if (!g || !g.ready) { add(page, ui.pageHeader({ title: g?.title || 'Juego', back: '/juegos' }), ui.emptyState({ title: 'Pronto', text: 'Este juego llega en la próxima entrega.', art: 'fan' })); }
      else cleanup = await runner(page, g, query);
    }
  } catch (e) {
    console.error(e);
    add(page, ui.emptyState({ title: 'No pudimos abrir los juegos', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
  }
  return { node: page, cleanup: () => cleanup?.() };
}
