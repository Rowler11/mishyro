// Distancia entre los dos (v0.37.0, Rowler 2026-11-26): the kilometres between the two main phones, between
// the two halves of "Ahora mismo". Chosen "Al abrir la app (aprox.)": each one turns it on once from their
// phone; from then on, opening the app on that phone sends a position rounded to about 1 km (encrypted, like
// everything that syncs). Only the kilometres are ever shown, never the point or a map. Both must turn it on;
// pausing deletes the position right away. PCs never send it (they can still see the kilometres).
// Not tracking: no history (one record per person, replaced), no background updates, no hours.
import { ui, util, db, profile, sync } from '../core.js';

const { el, icon } = util;
const idOf = (who) => `near:${who}`;
const STEP = 0.01; // ≈ 1.1 km
const MIN_GAP = 10 * 60 * 1000; // a phone sends again at most every 10 minutes
let lastTry = 0;

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
  return put({ on: true, ...p, at: util.nowISO() });
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

/** The paper route between the two badges: a dotted curve, a paper plane that flies in once, and the kilometres. */
function route() {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 200 40'); s.setAttribute('class', 'near-route'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M2 30 Q100 -12 198 30'); path.setAttribute('class', 'near-path');
  const plane = document.createElementNS(NS, 'path');
  plane.setAttribute('d', 'm-6 3 13-6-5 13-2-5.5z'); plane.setAttribute('class', 'near-plane');
  s.append(path, plane);
  return s;
}
const hearts = route; // the detail sheet uses the same drawing

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

function sheet(mine, theirs, onChange) {
  const other = profile.partnerOf(profile.active());
  const nick = profile.nick(other) || 'Tu pareja';
  const st = nearState(mine, theirs);
  const lines = [
    st?.kind === 'km' ? el('p', { class: 'near-sheet-km' }, el('strong', {}, kmLabel(st.km).big), el('span', { class: 'muted' }, kmLabel(st.km).small)) : null,
    el('p', { class: 'muted small' }, mine?.on ? `Tu celular la actualizó ${agoText(mine.at)}.` : 'La tienes en pausa.'),
    el('p', { class: 'muted small' }, theirs?.on ? `El de ${nick}, ${agoText(theirs.at)}.` : `${nick} todavía no la activa desde su celular.`),
    el('p', { class: 'muted small' }, 'Es aproximada (más o menos 1 km), viaja cifrada y solo se ven los kilómetros. Se actualiza cuando cada uno abre la app.'),
  ];
  const canUpdate = isPhone() && mine?.on;
  ui.openModal({
    title: 'La distancia entre los dos', kind: 'sheet', size: 'sm', className: 'near-modal',
    body: el('div', { class: 'stack' }, ...lines),
    actions: [
      ...(mine?.on ? [{ label: 'Pausar', variant: 'ghost', onClick: async () => { await pause(); onChange?.(); return true; } }] : []),
      ...(canUpdate ? [{ label: 'Actualizar ahora', variant: 'primary', onClick: async () => { const r = await refresh({ force: true }); if (!r) ui.toast('No pudimos leer tu ubicación ahora.', { tone: 'error' }); onChange?.(); return true; } }]
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
  const wrap = (cls, label, kids) => el('button', { class: `now-near ${cls}`, type: 'button', onClick: cls === 'is-invite' ? async () => { if (await turnOn()) onChange?.(); } : open, 'aria-label': label }, route(), kids);
  if (st.kind === 'km') {
    const k = kmLabel(st.km);
    return wrap('is-km', `${k.big} ${k.small}. Ver detalles`, el('span', { class: 'near-text' }, el('strong', { class: 'near-km' }, k.big), el('span', { class: 'near-sub' }, k.small)));
  }
  if (st.kind === 'waiting') return wrap('is-wait', `Esperando a que ${nick} active la distancia. Ver detalles`, el('span', { class: 'near-text' }, el('span', { class: 'near-sub' }, `Esperando a ${nick}`)));
  return wrap('is-invite', st.partnerOn ? `${nick} ya activó la distancia. Activarla tú también` : 'Ver la distancia entre los dos', el('span', { class: 'near-text' }, el('span', { class: 'near-sub' }, st.partnerOn ? `${nick} ya la activó. Toca para ver` : 'Toca para ver la distancia')));
}
