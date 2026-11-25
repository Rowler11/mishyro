// Latido (v0.22.0, chosen 2026-11-24; redesigned v0.30.0, Rowler 2026-11-25).
// Hold the days ring on Inicio: the screen goes dark and a big heart beats with you, once per heartbeat.
// At 5 beats it sparkles, at 10 little hearts rise around it, and at 15 (the most) it bursts in an
// explosion of love and is sent right away. Let go before and the beats you held are sent.
// On the other phone the same heart beats the same number of times (and vibrates), with the same
// moments at 5, 10 and 15. It says nothing about being online or where anyone is: only the heartbeat
// travels, as a shared 'streaks' record of type 'beat' (plus a caring notice when the app is closed).
import { ui, util, db, profile, sync } from '../core.js';

const { el, icon } = util;
const BEAT_MS = 820;           // one lub-dub, a calm heart
const HOLD_START = 300;        // a quick tap explains how it works
export const MAX_BEATS = 15;
export const MILESTONES = { 5: 'spark', 10: 'rise', 15: 'burst' };
const FRESH_MS = 15 * 60000;   // a heartbeat older than this is not played anymore
const PLAYED_KEY = 'aishiteru.latido.played';
const LUB_DUB = [55, 110, 85]; // vibrate, pause, vibrate

const HEART = (id) => `<svg viewBox="0 0 64 58" aria-hidden="true" focusable="false"><defs>
  <radialGradient id="${id}g" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#FFC2CF"/><stop offset=".45" stop-color="#F0607F"/><stop offset="1" stop-color="#B8264A"/></radialGradient>
  <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <path d="M32 56 C29 53 4 37 4 19 C4 9 11 3 19 3 C25 3 29.5 6.5 32 11 C34.5 6.5 39 3 45 3 C53 3 60 9 60 19 C60 37 35 53 32 56Z" fill="url(#${id}g)"/>
  <path d="M14 10c-4 2-6 6-6 10 2-4 6-7 11-8z" fill="url(#${id}s)"/><ellipse cx="44" cy="14" rx="5" ry="3" fill="#fff" opacity=".28" transform="rotate(20 44 14)"/></svg>`;
const MINI = '<svg viewBox="0 0 64 58" aria-hidden="true"><path d="M32 56 C29 53 4 37 4 19 C4 9 11 3 19 3 C25 3 29.5 6.5 32 11 C34.5 6.5 39 3 45 3 C53 3 60 9 60 19 C60 37 35 53 32 56Z"/></svg>';

const played = () => { try { return new Set(JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]')); } catch { return new Set(); } };
function markPlayed(id) {
  const s = [...played(), id].slice(-40);
  try { localStorage.setItem(PLAYED_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
export const pattern = (beats) => Array.from({ length: beats }, (_, i) => (i ? [BEAT_MS - 250, ...LUB_DUB] : LUB_DUB)).flat();
const buzz = (p) => { if (document.documentElement.dataset.haptics === 'on' && navigator.vibrate) navigator.vibrate(p); };
const reduced = () => util.prefersReducedMotion();

/** What the screen says at each moment (pure, unit-tested). */
export function stageText(n, { to = '', from = '' } = {}) {
  if (n >= 15) return from ? `¡Explosión de amor de ${from}!` : '¡Explosión de amor!';
  if (n >= 10) return from ? `A ${from} el corazón le va a mil` : 'Tu corazón va a mil';
  if (n >= 5) return from ? `${from} late fuerte por ti` : `Late fuerte por ${to}`;
  return from ? `El latido de ${from}` : `Tu latido para ${to}`;
}

// ---------- the stage shared by sending and receiving ----------
function stage({ title, sub }) {
  const uid = `lt${util.uuid().slice(0, 6)}`;
  const heart = el('div', { class: 'latido-heart' }); heart.innerHTML = HEART(uid);
  const ring = el('span', { class: 'latido-ring', 'aria-hidden': 'true' });
  const count = el('p', { class: 'latido-num', 'aria-live': 'polite' });
  const t = el('p', { class: 'latido-title' }, title);
  const s = el('p', { class: 'latido-sub' }, sub);
  const fx = el('div', { class: 'latido-fx', 'aria-hidden': 'true' });
  const dots = el('div', { class: 'latido-dots', 'aria-hidden': 'true' }, Array.from({ length: MAX_BEATS }, (_, i) => el('i', { class: [5, 10, 15].includes(i + 1) ? 'is-mark' : '' })));
  const core = el('div', { class: 'latido-core' }, ring, heart);
  const layer = el('div', { class: 'latido-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, fx, core, count, dots, t, s);
  return {
    layer, heart, count, title: t, sub: s,
    beat(n) {
      count.textContent = n ? String(n) : '';
      ring.style.setProperty('--p', String(Math.min(1, n / MAX_BEATS)));
      dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i < n));
      layer.style.setProperty('--glow', String(0.25 + Math.min(1, n / MAX_BEATS) * 0.75));
      layer.dataset.level = n >= 10 ? '3' : n >= 5 ? '2' : '1';
      if (reduced()) return;
      heart.classList.remove('is-beat'); void heart.offsetWidth; heart.classList.add('is-beat');
      ring.classList.remove('is-beat'); void ring.offsetWidth; ring.classList.add('is-beat');
    },
    milestone(n) {
      const kind = MILESTONES[n]; if (!kind) return;
      layer.classList.add(`is-${kind}`);
      if (reduced()) return;
      if (kind === 'spark') sparks(fx, 14);
      if (kind === 'rise') rise(fx, 16);
      if (kind === 'burst') burst(fx, 46);
    },
  };
}
function sparks(fx, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; const d = 90 + Math.random() * 40;
    const p = el('i', { class: 'lt-spark', style: { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--d': `${Math.random() * 120}ms` } });
    fx.append(p); setTimeout(() => p.remove(), 1200);
  }
}
function rise(fx, n) {
  for (let i = 0; i < n; i++) {
    const p = el('i', { class: 'lt-float', style: { '--x': `${8 + Math.random() * 84}%`, '--s': `${0.5 + Math.random() * 0.8}`, '--d': `${Math.random() * 1600}ms`, '--t': `${2600 + Math.random() * 1800}ms` } });
    p.innerHTML = MINI; fx.append(p); setTimeout(() => p.remove(), 5000);
  }
}
function burst(fx, n) {
  const flash = el('i', { class: 'lt-flash' }); fx.append(flash); setTimeout(() => flash.remove(), 900);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2; const d = 140 + Math.random() * Math.max(innerWidth, innerHeight) * 0.55;
    const p = el('i', { class: 'lt-burst', style: { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--r': `${Math.round(Math.random() * 360 - 180)}deg`, '--s': `${0.5 + Math.random() * 1.1}`, '--d': `${Math.random() * 180}ms` } });
    p.innerHTML = MINI; fx.append(p); setTimeout(() => p.remove(), 2200);
  }
}

/** Make the days ring a press-and-hold heart. */
export function attachHold(target) {
  const me = profile.active(); const to = profile.partnerOf(me);
  target.classList.add('latido-target');
  target.setAttribute('role', 'button'); target.tabIndex = 0;
  target.setAttribute('aria-label', `Mantén presionado para mandarle tus latidos a ${profile.nick(to)}. Toca para saber cómo funciona.`);
  target.removeAttribute('aria-hidden');
  let timer = 0; let beatTimer = 0; let beats = 0; let holding = false; let st = null;
  const beat = () => {
    beats = Math.min(MAX_BEATS, beats + 1);
    st?.beat(beats);
    st && (st.title.textContent = stageText(beats, { to: profile.nick(to) }));
    if (MILESTONES[beats]) { st?.milestone(beats); buzz(beats === 15 ? [60, 40, 60, 40, 220] : [40, 60, 90]); } else buzz(LUB_DUB);
    if (beats >= MAX_BEATS) { clearInterval(beatTimer); setTimeout(release, reduced() ? 300 : 1300); }
  };
  const open = () => {
    st = stage({ title: stageText(0, { to: profile.nick(to) }), sub: 'Sigue presionando… suelta para enviarlos' });
    st.layer.classList.add('is-holding');
    document.body.append(st.layer);
  };
  const press = (e) => {
    if (e.button > 0 || holding) return;
    if (e.pointerId != null) target.setPointerCapture?.(e.pointerId);
    beats = 0;
    timer = setTimeout(() => { holding = true; target.classList.add('is-holding'); open(); beat(); beatTimer = setInterval(beat, BEAT_MS); }, HOLD_START);
  };
  const release = async () => {
    clearTimeout(timer); clearInterval(beatTimer);
    target.classList.remove('is-holding');
    if (!holding) return;
    holding = false; const n = beats; beats = 0;
    const s = st; st = null;
    if (!s) return;
    s.layer.classList.remove('is-holding');
    const ok = n ? await send(n, to, { quiet: true }) : false;
    s.title.textContent = ok ? (n === 1 ? '1 latido va en camino' : `${n} latidos van en camino`) : n ? 'Para enviarlos, unan sus teléfonos' : 'Sin latidos esta vez';
    s.sub.textContent = ok ? `${profile.nick(to)} los sentirá en su teléfono 💗` : n ? 'Ajustes › Sincronización' : '';
    setTimeout(() => { s.layer.classList.add('leaving'); setTimeout(() => s.layer.remove(), reduced() ? 0 : 320); }, n >= MAX_BEATS ? 2200 : 1500);
  };
  const cancel = () => { clearTimeout(timer); clearInterval(beatTimer); target.classList.remove('is-holding'); if (st) { st.layer.remove(); st = null; } holding = false; beats = 0; };
  target.addEventListener('pointerdown', press);
  target.addEventListener('pointerup', (e) => { if (!holding && !beats && e.button === 0) { clearTimeout(timer); explain(to); return; } release(); });
  target.addEventListener('pointercancel', cancel);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
  target.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); press({ button: 0 }); } });
  target.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!holding) { clearTimeout(timer); explain(to); } else release(); } });
  // Once, when their phones are joined: tell them it exists.
  let told = false; try { told = localStorage.getItem(TOLD_KEY) === '1'; } catch { told = true; }
  if (!told && sync.isLinked()) setTimeout(() => {
    if (!target.isConnected) return;
    try { localStorage.setItem(TOLD_KEY, '1'); } catch { /* private mode */ }
    ui.toast(`Nuevo: mantén presionado el círculo de los días y tus latidos le llegan a ${profile.nick(to)} 💓`, { timeout: 9000, action: { label: '¿Cómo?', onClick: () => explain(to) } });
  }, 2500);
}
const TOLD_KEY = 'aishiteru.latido.told';

/** A short tap on the ring: how Latidos work, for both of them. */
let explaining = false;
export function explain(to = profile.partnerOf(profile.active())) {
  if (explaining) return; explaining = true;
  const name = profile.nick(to);
  const step = (n, title, text) => el('li', { class: 'latido-step' }, el('span', { class: 'latido-step-n', 'aria-hidden': 'true' }, String(n)), el('div', {}, el('strong', {}, title), el('p', {}, text)));
  const m = ui.openModal({
    title: 'Cómo funcionan los latidos', size: 'sm', className: 'latido-help',
    body: el('div', { class: 'stack' },
      el('ol', { class: 'latido-steps' },
        step(1, 'Mantén presionado el círculo de los días', 'La pantalla se oscurece y aparece un corazón que late contigo, uno por segundo.'),
        step(2, 'Cada latido cuenta', 'A los 5 brilla, a los 10 suben corazoncitos y a los 15 (el máximo) hay una explosión de amor.'),
        step(3, 'Suelta para enviarlos', `Se envían los latidos que juntaste. A los 15 se envían solos.`),
        step(4, `Así lo siente ${name}`, `Si tiene la app abierta, su pantalla se oscurece y el mismo corazón late las mismas veces, con vibración y los mismos momentos. Si la tiene cerrada, le llega un aviso "Te llegó un latido" que vibra como un corazón; al tocarlo, lo siente igual (durante 15 minutos).`)),
      el('p', { class: 'muted small' }, 'Solo viaja el latido: nada de dónde están ni si están conectados. Necesita que sus teléfonos estén unidos.')),
    actions: [{ label: 'Probar ahora', variant: 'ghost', onClick: () => { demo(); return true; } }, { label: 'Entendido', variant: 'primary' }],
  });
  m.result.finally(() => { explaining = false; });
}
/** A preview of what the other one sees, on this phone only (nothing is sent). */
function demo() { setTimeout(() => play({ by: profile.active(), beats: MAX_BEATS, demo: true }), 260); }

export async function send(beats, to = profile.partnerOf(profile.active()), { quiet = false } = {}) {
  if (!sync.isLinked()) { if (quiet) return false; ui.toast('Los latidos viajan cuando sus teléfonos están unidos (Ajustes › Sincronización).'); return false; }
  await db.put('streaks', { id: `beat:${util.uuid()}`, type: 'beat', by: profile.active(), to, beats, at: util.nowISO(), visibility: 'shared', owner: 'both' }, { userEdit: false });
  util.haptic('success');
  if (!quiet) ui.toast(`Tu latido va en camino a ${profile.nick(to)} 💓`, { tone: 'info' });
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

/** Their heartbeat arrives: the screen goes dark and the heart beats as many times as they held it. */
export function play(r) {
  return new Promise((resolve) => {
    const beats = Math.max(1, Math.min(MAX_BEATS, Number(r.beats) || 1));
    const from = r.demo ? 'tu pareja' : profile.nick(r.by);
    const s = stage({ title: stageText(0, { from }), sub: r.demo ? 'Así lo vería tu pareja (vista previa)' : beats === 1 ? 'Un latido, solo para ti.' : `${beats} latidos, solo para ti.` });
    const close = el('button', { class: 'btn btn-ghost btn-small latido-close', type: 'button' }, 'Cerrar');
    s.layer.append(close);
    let n = 0; let t = 0;
    const done = () => { clearTimeout(t); navigator.vibrate?.(0); s.layer.classList.add('leaving'); setTimeout(() => { s.layer.remove(); resolve(); }, reduced() ? 0 : 320); };
    const tick = () => {
      if (n >= beats) {
        if (!r.demo) { const back = el('button', { class: 'btn btn-primary btn-small latido-back', type: 'button', onClick: (e) => { e.stopPropagation(); done(); setTimeout(() => location.assign('#/inicio'), 50); } }, icon('heart', { size: 16 }), 'Devolverle latidos'); s.layer.insertBefore(back, close); }
        t = setTimeout(done, beats >= MAX_BEATS ? 6000 : 4200); return;
      }
      n++; s.beat(n); s.title.textContent = stageText(n, { from });
      if (MILESTONES[n]) s.milestone(n);
      t = setTimeout(tick, BEAT_MS);
    };
    s.layer.addEventListener('click', (e) => { if (!e.target.closest('.latido-back')) done(); });
    document.body.append(s.layer);
    close.focus({ preventScroll: true });
    if (!r.demo) buzz(pattern(beats));
    t = setTimeout(tick, 450);
  });
}

/** Called once at start: feel heartbeats that arrive while the app is open, or that brought it to the front. */
export function watch() {
  sync.onApplied((stores) => { if (stores.includes('streaks')) check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 400); });
  setTimeout(check, 1200);
}
