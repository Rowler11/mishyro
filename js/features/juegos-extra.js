// Juegos, parte premium (v0.29.0, ideas 31, 33 y 34): the weekly couple tournament with a paper
// trophy and an all-time tally, a cooperative challenge they only win if both do it, and "Noche de
// juegos" (3 games at random with a timer). Everything is computed from the shared 'games' history
// and 'streaks' records, so both phones agree without anything new on the server.
import { ui, util, db, profile } from '../core.js';
import * as K from './juegos-kit.js';
import { draw } from '../core/art.js';
import { PETS, nameOf } from '../core/pets.js';

const { el, icon } = util;
const COOP = [
  'Cocinar juntos una receta que nunca hayan hecho.', 'Caminar 30 minutos juntos sin el celular.', 'Escribirse una notita a mano y esconderla.',
  'Ver el atardecer juntos un día de esta semana.', 'Ordenar juntos un rincón de la casa.', 'Aprender juntos 5 palabras en japonés.',
  'Hacer una foto juntos en un lugar nuevo.', 'Desayunar juntos sin pantallas.', 'Bailar una canción completa en la sala.',
  'Contarse un recuerdo de infancia que el otro no sepa.', 'Darse un masaje de 10 minutos cada uno.', 'Planear juntos la próxima salida.',
];

/** Monday (yyyy-mm-dd) of the week of d, local time. */
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return util.localDay(x);
}
/** Wins per person in each week: Map(weekStart -> { [person]: n }). */
export function weeklyWins(games) {
  const out = new Map();
  for (const g of games) {
    if (g.deleted || !g.winner || !profile.PEOPLE.includes(g.winner)) continue;
    const day = String(g.date || g.endedAt || '').slice(0, 10); if (!util.isValidDay(day)) continue;
    const wk = weekStart(util.parseDay(day));
    const row = out.get(wk) || {}; row[g.winner] = (row[g.winner] || 0) + 1; out.set(wk, row);
  }
  return out;
}
/** Trophies: past weeks won outright by each person (ties give none). */
export function trophies(weeks, current = weekStart()) {
  const t = Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  for (const [wk, row] of weeks) {
    if (wk >= current) continue;
    const [a, b] = profile.PEOPLE; const na = row[a] || 0; const nb = row[b] || 0;
    if (na !== nb) t[na > nb ? a : b]++;
  }
  return t;
}
const weekIndex = (wk) => Math.floor(util.parseDay(wk).getTime() / (7 * 86400000));

async function tournamentCard() {
  const games = await db.query('games').catch(() => []);
  const weeks = weeklyWins(games); const wk = weekStart(); const row = weeks.get(wk) || {};
  const t = trophies(weeks, wk);
  const [a, b] = profile.PEOPLE;
  const lead = (row[a] || 0) === (row[b] || 0) ? '' : (row[a] || 0) > (row[b] || 0) ? a : b;
  const end = util.parseDay(wk); end.setDate(end.getDate() + 6);
  const daysLeft = Math.max(0, util.daysBetween(new Date(), end));
  return el('section', { class: 'card paper-card tourney-card', 'aria-labelledby': 'tourney-title' },
    el('h2', { class: 'card-kicker', id: 'tourney-title' }, 'Torneo de la semana'),
    el('div', { class: 'tourney-score' }, profile.PEOPLE.map((p) => el('div', { class: `tourney-player${lead === p ? ' is-lead' : ''}` },
      el('span', { class: 'tourney-name' }, profile.name(p)), el('strong', { class: 'tourney-wins' }, String(row[p] || 0)),
      el('span', { class: 'tourney-trophies', 'aria-label': `${t[p]} trofeos` }, icon('trophy', { size: 14 }), ` ${t[p]}`)))),
    el('p', { class: 'muted small' }, `${lead ? `Va ganando ${profile.name(lead)}.` : 'Van empatados.'} ${daysLeft ? `Quedan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}: quien gane más partidas se lleva el trofeo de papel.` : 'Hoy se define el trofeo de papel.'}`));
}

async function coopCard() {
  const wk = weekStart(); const me = profile.active(); const [a, b] = profile.PEOPLE;
  const text = COOP[weekIndex(wk) % COOP.length];
  const ids = { [a]: `coop:${wk}:${a}`, [b]: `coop:${wk}:${b}` };
  const [ra, rb] = await Promise.all([db.get('streaks', ids[a]).catch(() => null), db.get('streaks', ids[b]).catch(() => null)]);
  const done = { [a]: !!ra, [b]: !!rb };
  const both = done[a] && done[b];
  const card = el('section', { class: `card paper-card coop-card${both ? ' is-won' : ''}`, 'aria-labelledby': 'coop-title' },
    el('h2', { class: 'card-kicker', id: 'coop-title' }, 'Reto en equipo de la semana'),
    el('p', { class: 'coop-text' }, text),
    el('ul', { class: 'coop-marks' }, profile.PEOPLE.map((p) => el('li', { class: done[p] ? 'is-done' : '' }, icon(done[p] ? 'check' : 'hourglass', { size: 16 }), ` ${profile.name(p)}`))),
    both ? el('p', { class: 'coop-win' }, '¡Lo lograron juntos! Ganan los dos.')
      : done[me] ? el('p', { class: 'muted small' }, `Ya lo marcaste. Ganan cuando ${profile.name(profile.partnerOf(me))} también lo marque.`)
        : ui.button({ label: 'Lo cumplí', iconName: 'check', small: true, variant: 'primary', onClick: async () => {
          await db.put('streaks', { id: ids[me], type: 'coop', by: me, week: wk, at: util.nowISO(), visibility: 'shared', owner: 'both' });
          util.haptic('success'); const fresh = await coopCard(); card.replaceWith(fresh);
          if (fresh.classList.contains('is-won')) ui.confetti?.();
        } }));
  return card;
}

/** Noche de juegos: three games at random and a timer for each. */
export function gameNight() {
  const pool = K.GAME_LIST.filter((g) => g.ready);
  const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  let i = 0; let left = 20 * 60; let timer = 0;
  const clock = el('p', { class: 'night-clock', role: 'timer', 'aria-live': 'off' });
  const list = el('ol', { class: 'night-list' });
  const paint = () => {
    clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    list.replaceChildren(...pick.map((g, k) => el('li', { class: k === i ? 'is-now' : k < i ? 'is-done' : '' },
      el('a', { href: `#/juegos/${g.id}`, onClick: () => api?.close() }, icon(g.icon || 'gamepad-2', { size: 18 }), el('span', {}, g.title)))));
  };
  const tick = () => { left--; if (left <= 0) { util.haptic('success'); util.sound?.('chime'); i = Math.min(pick.length - 1, i + 1); left = 20 * 60; } paint(); };
  const start = ui.button({ label: 'Empezar el reloj', iconName: 'timer', variant: 'primary', small: true, onClick: () => { clearInterval(timer); timer = setInterval(tick, 1000); start.hidden = true; } });
  const next = ui.button({ label: 'Siguiente juego', iconName: 'skip-forward', variant: 'ghost', small: true, onClick: () => { i = Math.min(pick.length - 1, i + 1); left = 20 * 60; paint(); } });
  const host = Object.keys(PETS)[new Date().getDate() % Object.keys(PETS).length];
  paint();
  const api = ui.openModal({ title: 'Noche de juegos', size: 'sm', onClose: () => clearInterval(timer),
    body: el('div', { class: 'stack night' },
      el('div', { class: 'night-host', 'aria-hidden': 'true' }, draw(host)),
      el('p', { class: 'muted small' }, `${nameOf(host)} armó la noche: 3 juegos, 20 minutos cada uno.`),
      list, clock, el('div', { class: 'btn-row center-row' }, start, next)) });
}

/** Extras shown in the game room. */
export async function roomExtras() {
  const [t, c] = await Promise.all([tournamentCard(), coopCard()]);
  return el('div', { class: 'stack game-extras' },
    el('button', { class: 'btn btn-secondary night-btn', type: 'button', onClick: gameNight }, icon('dices', { size: 18 }), 'Noche de juegos: 3 al azar con reloj'),
    t, c);
}
