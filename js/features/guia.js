// Guía (v0.14.0, option A chosen 2026-11-22): a "Primeros pasos" card on Inicio that says what is
// left to do, and a short hint the first time each section opens (since v0.20.0 the hint text is said
// by the section's friend in its little tour; the plain hint stays only where no tour runs). Both can be dismissed, and
// Ajustes > Acerca de > Legal y ayuda can show the hints again. Hints are per device (localStorage).
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import * as sync from '../core/sync.js';

const { el, icon } = util;
const SEEN_KEY = `${CONFIG.storageKey}.hints.seen`;
const HIDE = 'guideHidden';


// v0.20.0 (Rowler, 2026-11-24): "Primeros pasos" is only for setting the app up and goes with the tour;
// it leaves Inicio by itself once every step is done. Content (letters, coupons…) is not a "step" anymore:
// each section's friend explains it the first time it opens (features/tour.js).
const tourState = () => { try { return JSON.parse(localStorage.getItem(`${CONFIG.storageKey}.tour`) || '{}') || {}; } catch { return {}; } };
const startTour = async (e) => { e.preventDefault(); (await import('./tour.js')).start('main'); };
/** The setup steps, in order. `done` is checked against what they really did. */
export const STEPS = [
  { id: 'recorrido', title: 'Ver el recorrido', text: 'Los animalitos te muestran la app en un ratito.', href: '#/inicio', onClick: startTour, icon: 'sparkles', done: async () => !!tourState().main },
  { id: 'instalar', title: 'Instalar la app', text: 'Con su ícono en el teléfono, abre más rápido y sin barra.', href: '#/inicio', onClick: (e) => { e.preventDefault(); document.dispatchEvent(new CustomEvent('aishiteru:install')); }, icon: 'download',
    done: async () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.webdriver === true },
  { id: 'unir', title: 'Unir sus teléfonos', text: 'Así todo llega al otro al instante.', href: '#/ajustes/sincronizar', icon: 'qr-code', done: async () => sync.isLinked() },
  { id: 'pin', title: 'Ponerle PIN a la app', text: 'Para que nadie más la abra.', href: '#/ajustes/seguridad', icon: 'lock', done: async () => security.hasKey('app') },
  { id: 'avisos', title: 'Activar los avisos cariñosos', text: 'Un aviso tierno cuando el otro te piensa.', href: '#/ajustes/sincronizar', icon: 'bell',
    done: async () => !sync.notificationsSupported() || (typeof Notification !== 'undefined' && Notification.permission !== 'default') },
];

/** The "Primeros pasos" card for Inicio, or null when everything is done or it was hidden. */
export async function homeCard({ onChange } = {}) {
  if ((await db.getSettings(HIDE, { hidden: false })).hidden) return null;
  const state = await Promise.all(STEPS.map(async (s) => ({ ...s, ok: await s.done().catch(() => false) })));
  const done = state.filter((s) => s.ok).length;
  if (done === state.length) return null;
  const next = state.filter((s) => !s.ok);
  const bar = el('span', { class: 'guide-bar-fill' });
  bar.style.width = `${Math.round((done / state.length) * 100)}%`;
  const card = el('section', { class: 'card paper-card guide-card', 'aria-labelledby': 'guide-title' },
    el('div', { class: 'guide-head' },
      el('div', {}, el('p', { class: 'card-kicker' }, 'Para dejar la app lista'), el('h2', { class: 'card-title', id: 'guide-title' }, 'Primeros pasos')),
      el('span', { class: 'guide-count' }, `${done} de ${state.length}`)),
    el('span', { class: 'guide-bar', role: 'progressbar', 'aria-label': 'Primeros pasos hechos', 'aria-valuemin': '0', 'aria-valuemax': String(state.length), 'aria-valuenow': String(done) }, bar),
    el('ul', { class: 'guide-list' }, next.map((s) => el('li', {}, el('a', { class: 'guide-step', href: s.href, onClick: s.onClick },
      el('span', { class: 'guide-step-icon', 'aria-hidden': 'true' }, icon(s.icon, { size: 18 })),
      el('span', { class: 'guide-step-text' }, el('strong', {}, s.title), el('span', { class: 'muted small' }, s.text)),
      icon('chevron-right', { size: 18 }))))),
    el('div', { class: 'card-actions' }, ui.button({ label: 'Ocultar', small: true, variant: 'ghost', onClick: async () => {
      await db.setSettings(HIDE, { hidden: true });
      ui.toast('Listo. Se va sola cuando terminas, pero ya la ocultaste.');
      onChange?.();
    } })));
  // When the tour ends (or is skipped), its step is done: refresh the card.
  const refresh = () => { if (card.isConnected) onChange?.(); };
  document.addEventListener('tour:done', refresh, { once: true });
  return card;
}

// ---------- first-visit hints ----------
// One or two lines per section: what it is for and the first thing to do there.
export const HINTS = {
  capsula: 'Aquí viven sus recuerdos. Toca "Nuevo recuerdo" para guardar fotos, un título y lo que sintieron.',
  cupones: 'Vales que se regalan: un abrazo, un desayuno, elegir la película. Quien lo recibe lo canjea cuando quiera.',
  cartas: 'Cartas para abrir hoy o en una fecha. Las selladas no se pueden leer antes de tiempo.',
  calendario: 'Sus citas y fechas en un mes. Los sábados ya vienen marcados como Día de novios.',
  galeria: 'Todas sus fotos juntas, de la Cápsula, las cartas y los juegos.',
  mapa: 'Los lugares donde han estado. Agrega uno con "Lugar" y aparece su pin con la foto.',
  diario: 'Unas líneas de cómo les fue hoy. Se ven por día y por foto.',
  preguntas: 'Una pregunta al día para conocerse más. Cada uno responde y luego ven las dos respuestas.',
  retos: 'Un reto pequeño cada semana y, si quieren, un desafío de 30 días.',
  planes: 'Lo que quieren vivir juntos. En "Ideas de citas" la app les sugiere planes.',
  citas: 'Gira la máquina y sale una idea. Si ya la hicieron hace poco, tócalo y descansa un mes.',
  canciones: 'Dedícale una canción de Spotify con unas palabras. Aquí queda su playlist.',
  juegos: 'Juegos en persona con un solo teléfono. Lo que ganen suma a la Liga del mes.',
  liga: 'El ganador del mes sale de todas sus partidas. Anoten también sus juegos reales.',
  modos: 'Modo juntos: teléfonos boca abajo. Modo cita: para usar mientras están en una salida.',
  insignias: 'Lo que van logrando juntos. En "Premios" pueden raspar lo que ganaron.',
  mascotas: 'El perfil de su mascota: vacunas, citas y fotos.',
  alcancia: 'Metas de ahorro para sus planes y las cuentas de lo que comparten.',
  jibun: 'Tu espacio: lo que guardes aquí solo lo ves tú.',
  gratitud: 'Un frasco de gracias y una revisión de la semana, para cuidarse.',
  regalos: 'Ideas de regalo para el otro. Lo que marques como comprado no lo ve.',
};

const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };
const markSeen = (id) => { try { const s = seen(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* private mode */ } };
export const resetHints = () => { try { localStorage.removeItem(SEEN_KEY); } catch { /* private mode */ } };

/** A dismissible hint the first time a section opens. Returns the node to place, or null. */
export function hintFor(id) {
  const text = HINTS[id];
  if (!text || seen().has(id)) return null;
  const box = el('aside', { class: 'guide-hint', role: 'note', 'aria-label': 'Cómo funciona' },
    el('span', { class: 'guide-hint-icon', 'aria-hidden': 'true' }, icon('lightbulb', { size: 18 })),
    el('p', {}, text),
    el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { markSeen(id); box.remove(); } }, 'Entendido'));
  return box;
}

void profile;
