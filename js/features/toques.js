// Toques (v0.24.0): small one-tap gestures between the two phones. "Buenos días" / "buenas noches"
// (a different character each time) and "Abrazo a distancia" (a long, soft vibration). Both travel as a
// shared 'streaks' record (type 'greet' | 'hug'); nothing says who is online or where anyone is.
// The character rotates among the real pets and the six paper animals (Rowler's rule, 2026-11-24).
import { ui, util, db, profile, sync } from '../core.js';
import { PETS, nameOf } from '../core/pets.js';
import { draw } from '../core/art.js';
import { kittyArt } from '../core/kitty.js';
import { livePets } from './gatitos.js';

const { el, icon } = util;
const FRESH_MS = 6 * 3600000;
const PLAYED_KEY = 'aishiteru.toques.played';
const HUG = [180, 90, 420, 90, 650, 120, 420, 90, 180]; // swell and fade, like a slow hug

const played = () => { try { return new Set(JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]')); } catch { return new Set(); } };
const markPlayed = (id) => { try { localStorage.setItem(PLAYED_KEY, JSON.stringify([...played(), id].slice(-40))); } catch { /* private mode */ } };
const buzz = (p) => { if (document.documentElement.dataset.haptics === 'on' && navigator.vibrate) navigator.vibrate(p); };
const isMorning = () => new Date().getHours() < 15;

/** The character of the day for a gesture: a paper animal or one of their real pets, in turns. */
async function pickWho(kind) {
  const pets = await livePets().catch(() => []);
  const cast = [...Object.keys(PETS), ...pets.map((p) => `pet:${p.id}`)];
  let h = 0; for (const c of `${util.localDay()}|${kind}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return cast[h % cast.length];
}
async function art(who) {
  if (who?.startsWith('pet:')) {
    const pets = await livePets().catch(() => []); const i = pets.findIndex((p) => p.id === who.slice(4));
    if (i >= 0) return { node: kittyArt(pets[i], { index: i }), name: pets[i].name };
  }
  const id = PETS[who] ? who : 'cat';
  return { node: draw(id), name: nameOf(id) };
}

async function send(type, extra = {}) {
  const me = profile.active(); const to = profile.partnerOf(me);
  if (!sync.isLinked()) { ui.toast('Esto viaja cuando sus teléfonos están unidos (Ajustes > Sincronización).'); return false; }
  const who = await pickWho(type + (extra.kind || ''));
  await db.put('streaks', { id: `${type}:${util.uuid()}`, type, by: me, to, who, ...extra, at: util.nowISO(), visibility: 'shared', owner: 'both' }, { userEdit: false });
  util.haptic('success');
  return to;
}
export async function sendGreeting() {
  const kind = isMorning() ? 'am' : 'pm'; const to = await send('greet', { kind });
  if (to) ui.toast(kind === 'am' ? `Tus buenos días van en camino a ${profile.nick(to)} ☀️` : `Tus buenas noches van en camino a ${profile.nick(to)} 🌙`, { tone: 'info' });
}
export async function sendHug() {
  const to = await send('hug');
  if (to) ui.toast(`Tu abrazo va en camino a ${profile.nick(to)} 🤗`, { tone: 'info' });
}

/** Card for Inicio with the one-tap buttons. */
export function homeCard() {
  const me = profile.active(); const to = profile.partnerOf(me);
  const am = isMorning();
  const b = (iconName, label, onClick) => el('button', { class: 'toque-btn', type: 'button', onClick }, icon(iconName, { size: 22 }), el('span', {}, label));
  return el('section', { class: 'home-card toques-card', 'aria-labelledby': 'toques-title' },
    el('h2', { class: 'card-kicker', id: 'toques-title' }, `Para ${profile.nick(to)}`),
    el('div', { class: 'toques-row' },
      b(am ? 'sun' : 'moon', am ? 'Buenos días' : 'Buenas noches', sendGreeting),
      b('hand-heart', 'Abrazo', sendHug),
      b('leaf', 'Respirar juntos', () => import('./calma.js').then((m) => m.openCalma()))));
}

async function pending() {
  const me = profile.active(); const seen = played();
  const list = [...await db.query('streaks', { index: 'type', range: IDBKeyRange.only('greet') }).catch(() => []),
    ...await db.query('streaks', { index: 'type', range: IDBKeyRange.only('hug') }).catch(() => [])];
  return list.filter((r) => r.by !== me && (!r.to || r.to === me) && !seen.has(r.id) && Date.now() - Date.parse(r.at) < FRESH_MS)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))[0] || null;
}

let showing = false;
export async function check() {
  if (showing || document.hidden || document.querySelector('.latido-layer')) return;
  const r = await pending(); if (!r) return;
  showing = true; markPlayed(r.id);
  play(r).finally(() => { showing = false; setTimeout(check, 300); });
}

function play(r) {
  return new Promise(async (resolve) => {
    const a = await art(r.who); const from = profile.nick(r.by);
    const hug = r.type === 'hug';
    const title = hug ? `Un abrazo de ${from}` : (r.kind === 'pm' ? `Buenas noches de ${from}` : `Buenos días de ${from}`);
    const sub = hug ? `${a.name} te lo trae. Respira hondo y recíbelo.` : `${a.name} te trae el saludo de ${from}.`;
    const layer = el('div', { class: `latido-layer toque-layer${hug ? ' is-hug' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'toque-art', 'aria-hidden': 'true' }, a.node),
      el('p', { class: 'latido-title' }, title), el('p', { class: 'latido-sub' }, sub),
      el('button', { class: 'btn btn-ghost btn-small latido-close', type: 'button' }, 'Cerrar'));
    let t = 0;
    const done = () => { clearTimeout(t); navigator.vibrate?.(0); layer.classList.add('leaving'); setTimeout(() => { layer.remove(); resolve(); }, util.prefersReducedMotion() ? 0 : 260); };
    layer.addEventListener('click', done);
    document.body.append(layer); layer.querySelector('.latido-close').focus({ preventScroll: true });
    if (hug) buzz(HUG); else buzz([60, 80, 60]);
    t = setTimeout(done, hug ? 6500 : 5000);
  });
}

export function watch() {
  sync.onApplied((stores) => { if (stores.includes('streaks')) check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 700); });
  setTimeout(check, 1800);
}
