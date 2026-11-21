// Permisos (decided 2026-11-21): ask once, at setup, for what the app uses — notices, location, camera
// and microphone — each with one line on what it is for, plus "Permitir todo". The same panel lives in
// Ajustes > Privacidad > Permisos to see and change them later. Sections still ask on their own if one
// was skipped, so nothing breaks when a permission is missing.
import { ui, util } from '../core.js';

const { el, icon } = util;

export const PERMS = [
  { id: 'notifications', label: 'Avisos', icon: 'bell', why: 'Avisos cariñosos: una carta, un cupón, "Pensando en ti". Nunca muestran el contenido.' },
  { id: 'geolocation', label: 'Ubicación', icon: 'map-pin', why: 'Para guardar lugares en el Mapa y mandar una instantánea de dónde estás. Nunca hay seguimiento.' },
  { id: 'camera', label: 'Cámara', icon: 'camera', why: 'Para escanear el código que une los teléfonos y grabar en el Rincón.' },
  { id: 'microphone', label: 'Micrófono', icon: 'mic', why: 'Para las notas de voz y las cartas con voz.' },
];

const supported = (id) => (id === 'notifications' ? 'Notification' in window
  : id === 'geolocation' ? 'geolocation' in navigator : !!navigator.mediaDevices?.getUserMedia);

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function state(id) {
  if (!supported(id)) return 'unsupported';
  if (id === 'notifications') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  try { return (await navigator.permissions.query({ name: id })).state; } catch { return 'prompt'; }
}

/** Ask the browser for one permission. Resolves to the new state; never throws. */
export async function request(id) {
  try {
    if (id === 'notifications') await Notification.requestPermission();
    else if (id === 'geolocation') {
      await new Promise((res) => navigator.geolocation.getCurrentPosition(res, res, { timeout: 15000, maximumAge: 600000 }));
    } else {
      const stream = await navigator.mediaDevices.getUserMedia(id === 'camera' ? { video: true } : { audio: true });
      stream.getTracks().forEach((t) => t.stop());
    }
  } catch { /* denied or dismissed */ }
  return state(id);
}

const LABEL = { granted: 'Permitido', denied: 'Bloqueado', prompt: 'Sin pedir', unsupported: 'No disponible' };

/** The list with a button per permission and "Permitir todo". */
export function panel() {
  const rows = new Map();
  const status = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const paint = async (id) => {
    const s = await state(id);
    const r = rows.get(id);
    r.badge.textContent = LABEL[s];
    r.badge.className = `badge perm-badge perm-${s}`;
    r.btn.hidden = s !== 'prompt';
    r.hint.hidden = s !== 'denied';
    return s;
  };
  const list = el('ul', { class: 'list card perm-list' }, PERMS.map((p) => {
    const badge = el('span', { class: 'badge perm-badge' }, '…');
    const btn = ui.button({ label: 'Permitir', small: true, onClick: async () => { btn.disabled = true; await request(p.id); await paint(p.id); btn.disabled = false; } });
    const hint = el('p', { class: 'muted small perm-hint', hidden: true }, 'Está bloqueado: se activa en el candado junto a la dirección o en los ajustes de la app del teléfono.');
    rows.set(p.id, { badge, btn, hint });
    return el('li', { class: 'list-row perm-row' },
      el('span', { class: 'list-icon' }, icon(p.icon)),
      el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, p.label, ' ', badge), el('span', { class: 'list-sub' }, p.why), hint),
      btn);
  }));
  const all = ui.button({ label: 'Permitir todo', iconName: 'check', variant: 'primary', onClick: async () => {
    all.disabled = true;
    // One after the other: each browser prompt waits for the previous answer.
    for (const p of PERMS) { if ((await state(p.id)) === 'prompt') await request(p.id); await paint(p.id); }
    const states = await Promise.all(PERMS.map((p) => state(p.id)));
    status.textContent = states.every((s) => s !== 'prompt') ? 'Listo. Puedes cambiarlos cuando quieras en Ajustes > Privacidad > Permisos.' : '';
    all.disabled = false;
  } });
  Promise.all(PERMS.map((p) => paint(p.id))).catch(() => {});
  return { node: el('div', { class: 'stack' }, list, all, status), allButton: all };
}

/** Ajustes > Privacidad > Permisos */
export function render() {
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Permisos', back: '/ajustes' }),
    el('p', { class: 'muted' }, 'Lo que la app puede usar en este dispositivo. Si saltaste alguno, cada sección lo vuelve a pedir cuando lo necesita.'),
    panel().node);
}
