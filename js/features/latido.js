// Latido (v0.22.0, chosen 2026-11-24): hold the days ring on Inicio and your heartbeat goes to the
// other phone, which beats with you (vibration + a pulsing heart). It says nothing about being online
// or where anyone is: only the heartbeat travels, as a shared 'streaks' record of type 'beat'.
import { ui, util, db, profile, sync } from '../core.js';

const { el } = util;
const BEAT_MS = 860;           // one lub-dub, a calm resting heart
const HOLD_START = 320;        // a quick tap only shows how it works
const MAX_BEATS = 10;
const FRESH_MS = 15 * 60000;   // a heartbeat older than this is not played anymore
const PLAYED_KEY = 'aishiteru.latido.played';
const LUB_DUB = [55, 110, 85]; // vibrate, pause, vibrate

const HEART = '<svg viewBox="0 0 64 58" aria-hidden="true" focusable="false"><path d="M32 56 C29 53 4 37 4 19 C4 9 11 3 19 3 C25 3 29.5 6.5 32 11 C34.5 6.5 39 3 45 3 C53 3 60 9 60 19 C60 37 35 53 32 56Z"/></svg>';

const played = () => { try { return new Set(JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]')); } catch { return new Set(); } };
function markPlayed(id) {
  const s = [...played(), id].slice(-40);
  try { localStorage.setItem(PLAYED_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
const pattern = (beats) => Array.from({ length: beats }, (_, i) => (i ? [BEAT_MS - 250, ...LUB_DUB] : LUB_DUB)).flat();
const buzz = (p) => { if (document.documentElement.dataset.haptics === 'on' && navigator.vibrate) navigator.vibrate(p); };

/** Make the days ring a press-and-hold heart. */
export function attachHold(target) {
  const me = profile.active(); const to = profile.partnerOf(me);
  target.classList.add('latido-target');
  target.setAttribute('role', 'button'); target.tabIndex = 0;
  target.setAttribute('aria-label', `Mantén presionado para mandarle tu latido a ${profile.nick(to)}`);
  target.removeAttribute('aria-hidden');
  let timer = 0; let beatTimer = 0; let beats = 0; let holding = false;
  const counter = el('span', { class: 'latido-count', 'aria-live': 'polite' });
  target.append(counter);
  const beat = () => {
    beats = Math.min(MAX_BEATS, beats + 1);
    counter.textContent = `${beats}`;
    target.classList.remove('is-beat'); void target.offsetWidth; target.classList.add('is-beat');
    buzz(LUB_DUB);
    if (beats >= MAX_BEATS) release();
  };
  const press = (e) => {
    if (e.button > 0) return;
    beats = 0; holding = false;
    timer = setTimeout(() => { holding = true; target.classList.add('is-holding'); beat(); beatTimer = setInterval(beat, BEAT_MS); }, HOLD_START);
  };
  const release = async () => {
    clearTimeout(timer); clearInterval(beatTimer);
    target.classList.remove('is-holding');
    if (!holding) return;
    holding = false; const n = beats; beats = 0;
    setTimeout(() => { counter.textContent = ''; }, 900);
    if (n) await send(n, to);
  };
  const cancel = () => { clearTimeout(timer); clearInterval(beatTimer); target.classList.remove('is-holding'); counter.textContent = ''; holding = false; beats = 0; };
  target.addEventListener('pointerdown', press);
  target.addEventListener('pointerup', release);
  target.addEventListener('pointerleave', release);
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  // A short tap explains it; keyboard users hold Enter or Space the same way.
  target.addEventListener('pointerup', () => { if (!holding && !beats) hint(to); }, { capture: true });
  target.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press({ button: 0 }); } });
  target.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); release(); } });
  // Once, when their phones are joined: tell them it exists.
  let told = false; try { told = localStorage.getItem(TOLD_KEY) === '1'; } catch { told = true; }
  if (!told && sync.isLinked()) setTimeout(() => {
    if (!target.isConnected) return;
    try { localStorage.setItem(TOLD_KEY, '1'); } catch { /* private mode */ }
    ui.toast(`Nuevo: mantén presionado el círculo de los días y tu latido le llega a ${profile.nick(to)} 💓`, { timeout: 9000 });
  }, 2500);
}
const TOLD_KEY = 'aishiteru.latido.told';

let hintAt = 0;
function hint(to) {
  if (Date.now() - hintAt < 4000) return; hintAt = Date.now();
  ui.toast(`Mantén presionado el círculo: cada latido tuyo le llega a ${profile.nick(to)}.`);
}

export async function send(beats, to = profile.partnerOf(profile.active())) {
  if (!sync.isLinked()) { ui.toast('El latido viaja cuando sus teléfonos están unidos (Ajustes > Sincronización).'); return false; }
  await db.put('streaks', { id: `beat:${util.uuid()}`, type: 'beat', by: profile.active(), to, beats, at: util.nowISO(), visibility: 'shared', owner: 'both' }, { userEdit: false });
  util.haptic('success');
  ui.toast(`Tu latido va en camino a ${profile.nick(to)} 💓`, { tone: 'info' });
  return true;
}

/** The newest heartbeat for this person that has not been felt yet. */
async function pending() {
  const me = profile.active(); const seen = played();
  const list = await db.query('streaks', { index: 'type', range: IDBKeyRange.only('beat') }).catch(() => []);
  return list.filter((r) => r.by !== me && (!r.to || r.to === me) && !seen.has(r.id) && Date.now() - Date.parse(r.at) < FRESH_MS)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
}

let showing = false;
export async function check() {
  if (showing || document.hidden) return;
  const r = await pending(); if (!r) return;
  showing = true; markPlayed(r.id);
  play(r).finally(() => { showing = false; });
}

/** Their heartbeat arrives: a heart beats on screen and the phone beats with it. */
export function play(r) {
  return new Promise((resolve) => {
    const beats = Math.max(1, Math.min(MAX_BEATS, Number(r.beats) || 1));
    const heart = el('div', { class: 'latido-heart' }); heart.innerHTML = HEART;
    const layer = el('div', { class: 'latido-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Latido de ${profile.nick(r.by)}` },
      heart,
      el('p', { class: 'latido-title' }, `El latido de ${profile.nick(r.by)}`),
      el('p', { class: 'latido-sub' }, beats === 1 ? 'Un latido, solo para ti.' : `${beats} latidos, solo para ti.`),
      el('button', { class: 'btn btn-ghost btn-small latido-close', type: 'button' }, 'Cerrar'));
    let n = 0; let t = 0;
    const done = () => { clearTimeout(t); navigator.vibrate?.(0); layer.classList.add('leaving'); setTimeout(() => { layer.remove(); resolve(); }, util.prefersReducedMotion() ? 0 : 260); };
    const tick = () => {
      if (n >= beats) { t = setTimeout(done, 1600); return; }
      n++; heart.classList.remove('is-beat'); void heart.offsetWidth; heart.classList.add('is-beat');
      t = setTimeout(tick, BEAT_MS);
    };
    layer.addEventListener('click', done);
    document.body.append(layer);
    layer.querySelector('.latido-close').focus({ preventScroll: true });
    buzz(pattern(beats));
    tick();
  });
}

/** Called once at start: feel heartbeats that arrive while the app is open, or that brought it to the front. */
export function watch() {
  sync.onApplied((stores) => { if (stores.includes('streaks')) check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 400); });
  setTimeout(check, 1200);
}
