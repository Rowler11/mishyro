// Distancia entre los dos (v0.37.0, Rowler 2026-11-26): the kilometres between the two main phones, between
// the two halves of "Ahora mismo". Chosen "Al abrir la app (aprox.)": each one turns it on once from their
// phone; from then on, opening the app on that phone sends a position rounded to about 1 km (encrypted, like
// everything that syncs). Only the kilometres are ever shown, never the point or a map. Both must turn it on;
// pausing deletes the position right away. PCs never send it (they can still see the kilometres).
// Not tracking: no history (one record per person, replaced), no background updates, no hours.
import { ui, util, db, profile, sync, CONFIG } from '../core.js';
import * as fx from '../core/fx.js';
import { momentScene, words, DURATION } from './cerca-escena.js';

const { el } = util;
const idOf = (who) => `near:${who}`;
const STEP = 0.01; // ≈ 1.1 km
const MIN_GAP = 10 * 60 * 1000; // a phone sends again at most every 10 minutes
let lastTry = 0;
let counted = false; // the km count-up plays once per session

export const isPhone = () => /Android|Mobi/i.test(navigator.userAgent);

/** Rounds to a ~1 km grid so the exact place can't be read back. */
export function roundNear(lat, lng) {
  const r = (v) => +(Math.round(v / STEP) * STEP).toFixed(2);
  return { lat: r(lat), lng: r(lng) };
}

/** Great-circle distance in km. */
export function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const hasPos = (r) => !!(r && r.on && Number.isFinite(r.lat) && Number.isFinite(r.lng));

/** What the middle of "Ahora mismo" shows: 'km' (both on), 'waiting' (only me), 'invite' (me off, on a phone) or null. */
export function nearState(mine, theirs, { phone = isPhone() } = {}) {
  if (hasPos(mine) && hasPos(theirs)) return { kind: 'km', km: kmBetween(mine, theirs) };
  if (mine?.on) return { kind: 'waiting', partnerOn: !!theirs?.on };
  if (phone) return { kind: 'invite', partnerOn: !!theirs?.on };
  return null;
}

/** "8 km", "1 km", "a menos de 1 km". The grid is ~1 km, so no decimals. */
export function kmLabel(km) {
  if (km < 1) return { big: 'Juntitos', small: 'a menos de 1 km' };
  const n = Math.round(km);
  return { big: `${n.toLocaleString('es-CO')} km`, small: 'de distancia' };
}

export const getNear = (who) => db.get('streaks', idOf(who)).catch(() => null);

function locate() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve({ error: 'unsupported' }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => resolve({ error: e.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 });
  });
}

async function put(patch) {
  const me = profile.active();
  const prev = await getNear(me);
  const rec = { ...(prev || {}), ...patch, id: idOf(me), type: 'near', by: me, visibility: 'shared', owner: 'both' };
  await db.put('streaks', rec);
  return rec;
}

/** On a phone where it is on and the permission was already given: send the rounded position again. */
export async function refresh({ force = false } = {}) {
  if (!isPhone() || !sync.isLinked()) return null;
  const mine = await getNear(profile.active());
  if (!mine?.on) return null;
  if (!force && Date.now() - lastTry < MIN_GAP) return null;
  const st = await navigator.permissions?.query({ name: 'geolocation' }).then((s) => s.state).catch(() => null);
  if (!force && st !== 'granted') return null; // never asks by itself: only from the button
  lastTry = Date.now();
  const g = await locate();
  if (g.error) return null;
  const p = roundNear(g.lat, g.lng);
  // the same square and recent: nothing to send
  if (!force && mine.lat === p.lat && mine.lng === p.lng && mine.at && Date.now() - new Date(mine.at).getTime() < 3 * 3600 * 1000) return mine;
  return put({ on: true, ...p, at: util.nowISO(), ...(await noticeFor(p, mine)) });
}

const FRESH = 3 * 3600 * 1000; // a position older than this is not a reason to notify
/** v0.38.0: when this phone's new position is within the chosen radius of a recent partner position, today's first
 * time marks the record with the day: that is what sends the soft "están cerca" notice to the other phone (once a day
 * between the two: if the other one already sent it today, this one does not). */
async function noticeFor(p, mine) {
  const theirs = await getNear(profile.partnerOf(profile.active()));
  const day = util.localDay();
  if (!hasPos(theirs) || !theirs.at || Date.now() - new Date(theirs.at).getTime() > FRESH) return {};
  if (theirs.noticeDay === day || mine?.noticeDay === day) return {};
  return kmBetween(p, theirs) <= await getRadius() ? { noticeDay: day } : {};
}

/** "Estoy por aquí": one tap sends this phone's position now and a soft notice to the other one. No tracking. */
export async function hereNow() {
  const g = await locate();
  if (g.error) { ui.toast('No pudimos leer tu ubicación ahora.', { tone: 'error' }); return false; }
  lastTry = Date.now();
  await put({ on: true, ...roundNear(g.lat, g.lng), at: util.nowISO(), hereAt: util.nowISO() });
  util.haptic?.('success');
  ui.toast('Listo, le avisé que estás por aquí.', { tone: 'success' });
  return true;
}

export async function turnOn() {
  const other = profile.partnerOf(profile.active());
  const nick = profile.nick(other) || 'tu pareja';
  const ok = await ui.confirmDialog({
    title: 'La distancia entre los dos',
    message: `Cada vez que abras la app en este celular se manda dónde estás, redondeado a más o menos 1 km y cifrado, solo para ${nick}. La app muestra únicamente los kilómetros: nunca el punto ni un mapa. Aparece cuando los dos la activen, y puedes pausarla cuando quieras.`,
    confirmLabel: 'Activar',
  });
  if (!ok) return false;
  lastTry = Date.now();
  const g = await locate();
  if (g.error) {
    ui.toast(g.error === 'denied' ? 'Sin permiso de ubicación. Puedes darlo en los ajustes de Chrome para esta app.' : 'No pudimos leer tu ubicación. Inténtalo de nuevo.', { tone: 'error' });
    return false;
  }
  await put({ on: true, ...roundNear(g.lat, g.lng), at: util.nowISO(), since: util.nowISO() });
  util.haptic?.('success');
  ui.toast('Listo. Cuando los dos la tengan, aparece en Inicio.', { tone: 'success' });
  return true;
}

export async function pause() {
  const me = profile.active();
  // a new record with no position: the rounded point is gone from both phones and from the server
  await db.put('streaks', { id: idOf(me), type: 'near', by: me, on: false, at: util.nowISO(), visibility: 'shared', owner: 'both' });
  ui.toast('Distancia en pausa. Tu ubicación ya no se comparte.', { tone: 'success' });
}

const agoText = (iso) => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
};

// v0.38.0 (Rowler 2026-11-27): the distance is no longer a card; Inicio shows a notice only when they are close.
// "Que elijan en Ajustes": each phone picks how close counts as close (2, 5 or 10 km; starts at 5).
export const RADII = [2, 5, 10];
export async function getRadius() {
  const s = await db.getSettings('near', {}).catch(() => ({}));
  return RADII.includes(s.radius) ? s.radius : 5;
}
export const setRadius = (radius) => db.setSettings('near', { radius });

/** { km, radius } when both phones share their position and the distance is within the chosen radius; else null. */
export async function nearby() {
  if (!sync.isLinked()) return null;
  const me = profile.active(); const other = profile.partnerOf(me);
  const [mine, theirs] = await Promise.all([getNear(me), getNear(other)]);
  if (!hasPos(mine) || !hasPos(theirs)) return null;
  const km = kmBetween(mine, theirs); const radius = await getRadius();
  return km <= radius ? { km, radius } : null;
}

async function sheet(mine, theirs, onChange) {
  const radius = await getRadius();
  const pick = el('div', { class: 'near-radius', role: 'group', 'aria-label': 'A qué distancia sale el aviso' });
  const drawPick = (r) => pick.replaceChildren(...RADII.map((k) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === r),
    onClick: async () => { await setRadius(k); drawPick(k); onChange?.(); } }, `${k} km`)));
  drawPick(radius);
  const other = profile.partnerOf(profile.active());
  const nick = profile.nick(other) || 'Tu pareja';
  const st = nearState(mine, theirs);
  const lines = [
    st?.kind === 'km' ? el('p', { class: 'near-sheet-km' }, el('strong', {}, kmLabel(st.km).big), el('span', { class: 'muted' }, kmLabel(st.km).small)) : null,
    el('p', { class: 'muted small' }, mine?.on ? `Tu celular la actualizó ${agoText(mine.at)}.` : 'La tienes en pausa.'),
    el('p', { class: 'muted small' }, theirs?.on ? `El de ${nick}, ${agoText(theirs.at)}.` : `${nick} todavía no la activa desde su celular.`),
    el('p', { class: 'muted small' }, 'Es aproximada (más o menos 1 km), viaja cifrada y solo se ven los kilómetros. Se actualiza cuando cada uno abre la app.'),
    el('div', { class: 'near-radius-box' }, el('p', { class: 'small' }, el('strong', {}, 'Avisar en Inicio cuando estén a menos de:')), pick),
  ];
  const canUpdate = isPhone() && mine?.on;
  ui.openModal({
    title: 'La distancia entre los dos', kind: 'sheet', size: 'sm', className: 'near-modal',
    body: el('div', { class: 'stack' }, ...lines),
    actions: [
      ...(st?.kind === 'km' && st.km <= radius ? [{ label: 'Ver la animación', variant: 'ghost', onClick: () => { setTimeout(() => maybeMoment({ force: true }), 250); return true; } }] : []),
      ...(mine?.on ? [{ label: 'Pausar', variant: 'ghost', onClick: async () => { await pause(); onChange?.(); return true; } }] : []),
      ...(canUpdate ? [{ label: 'Estoy por aquí', variant: 'ghost', onClick: async () => { await hereNow(); onChange?.(); return true; } },
        { label: 'Actualizar ahora', variant: 'primary', onClick: async () => { const r = await refresh({ force: true }); if (!r) ui.toast('No pudimos leer tu ubicación ahora.', { tone: 'error' }); onChange?.(); return true; } }]
        : !mine?.on && isPhone() ? [{ label: 'Activar', variant: 'primary', onClick: async () => { await turnOn(); onChange?.(); return true; } }] : [{ label: 'Listo', variant: 'primary' }]),
    ],
  });
}

/** The middle column of "Ahora mismo", or null when there is nothing to show (no sync, or a PC without both on). */
export async function middle({ onChange } = {}) {
  if (!sync.isLinked()) return null;
  const me = profile.active(); const other = profile.partnerOf(me);
  const [mine, theirs] = await Promise.all([getNear(me), getNear(other)]);
  const st = nearState(mine, theirs);
  if (!st) return null;
  const nick = profile.nick(other) || 'tu pareja';
  const open = () => sheet(mine, theirs, onChange);
  // v0.37.0 "Estación de tren" (Rowler's pick): the middle is the station sign; the train runs along the rail in ahora.js
  const sign = (cls, label, body) => el('button', { class: `now-near ${cls}`, type: 'button', onClick: cls === 'is-invite' ? async () => { if (await turnOn()) onChange?.(); } : open, 'aria-label': label },
    el('span', { class: 'ns-ends', 'aria-hidden': 'true' }, el('span', {}, `← ${nick}`), el('span', {}, 'Tú →')), el('span', { class: 'ns-bar', 'aria-hidden': 'true' }), body);
  if (st.kind === 'km') {
    const k = kmLabel(st.km);
    const big = el('strong', { class: 'near-km' }, k.big);
    // the kilometres count up the first time they show in this session
    const n = Math.round(st.km);
    if (n >= 2 && !counted && !util.prefersReducedMotion()) {
      counted = true; const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 1100); big.textContent = `${Math.round(n * (1 - (1 - p) ** 3)).toLocaleString('es-CO')} km`; if (p < 1) requestAnimationFrame(step); };
      big.textContent = '0 km'; requestAnimationFrame(step);
    }
    return sign('is-km', `${k.big} ${k.small}. Ver detalles`, el('span', { class: 'near-text' }, big, el('span', { class: 'near-sub' }, k.small)));
  }
  if (st.kind === 'waiting') return sign('is-wait', `Esperando a que ${nick} active la distancia. Ver detalles`, el('span', { class: 'near-text' }, el('span', { class: 'near-sub' }, `Esperando a ${nick}`)));
  return sign('is-invite', st.partnerOn ? `${nick} ya activó la distancia. Activarla tú también` : 'Ver la distancia entre los dos', el('span', { class: 'near-text' }, el('span', { class: 'near-sub' }, st.partnerOn ? `${nick} ya la activó. Toca para ver` : 'Toca para ver la distancia')));
}

/** Ajustes: opens the sheet to turn the distance on or off and to choose how close counts as close. */
export async function openSettings({ onChange } = {}) {
  const me = profile.active(); const other = profile.partnerOf(me);
  const [mine, theirs] = await Promise.all([getNear(me), getNear(other)]);
  return sheet(mine, theirs, onChange);
}

// ---------- the "Ondas" moment when the app opens and they are close ----------
const mem = (k) => `${CONFIG.storageKey}.near.${k}`;
const recall = (k) => { try { return localStorage.getItem(mem(k)); } catch { return null; } };
const remember = (k, v) => { try { localStorage.setItem(mem(k), v); } catch { /* private mode */ } };

/** The first letter of each one's nickname for the two seals (you on the left). */
const initials = () => {
  const me = profile.active(); const other = profile.partnerOf(me);
  const first = (w) => Array.from(String(w || '').trim())[0]?.toUpperCase() || '';
  return { a: first(profile.nick(me) || 'Tú'), b: first(profile.nick(other) || 'Tu pareja') };
};

/** The moment: when they are close and it has not played today, the scroll unrolls over Inicio and the two seals meet at
 * the torii while the kilometres count down; then it fades away and nothing stays (Rowler 2026-11-27: "sin tarjeta, solo
 * la animación"). Tap to close earlier. Once a day, off with reduced motion. */
export async function maybeMoment({ force = false } = {}) {
  const day = util.localDay();
  if (!force && recall('moment') === day) return false;
  refresh().catch(() => {}); // a phone with the distance on sends its rounded position when Inicio opens (at most every 10 min)
  const n = await nearby().catch(() => null);
  if (!n || (!force && recall('moment') === day)) return false;
  remember('moment', day);
  if (util.prefersReducedMotion()) return false;
  const w = words(n.km);
  const art = momentScene({ km: n.km, ...initials() });
  const layer = el('div', { class: 'near-moment', role: 'dialog', 'aria-label': w.title },
    el('div', { class: 'near-scene' }, art.node, el('span', { class: 'near-moment-hint' }, 'Toca para cerrar')));
  document.body.append(layer);
  util.haptic?.('success');
  const stop = art.run();
  const fade = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
  await new Promise((resolve) => {
    let done = false;
    const end = () => { if (done) return; done = true; clearTimeout(t); layer.removeEventListener('click', end); resolve(); };
    const t = setTimeout(end, DURATION);
    layer.addEventListener('click', end);
  });
  await fade.finished.catch(() => {});
  await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' }).finished.catch(() => {});
  stop(); layer.remove();
  return true;
}

/** Waits for the welcome screen to leave, then plays the moment if Inicio is still showing. */
export function scheduleMoment() {
  fx.whenClear(8000).then((ok) => { if (ok && /^#\/inicio\b/.test(location.hash)) maybeMoment(); });
}
