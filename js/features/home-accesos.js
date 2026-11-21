// Inicio: "Accesos, favoritos y descubre" (decided 2026-11-21). With so many sections, Inicio shows
// what can be done: a row of quick actions, six favorite sections each person picks (per device) and a
// daily "Prueben hoy" card that suggests a section not opened yet on this device.
import { ui, util, db, CONFIG } from '../core.js';
import { GROUPS } from '../routes.js';

const { el, icon } = util;
const FAV_ID = 'homeFavorites';
const FAV_MAX = 6;
const DEFAULT_FAVS = ['calendario', 'galeria', 'juegos', 'planes', 'diario', 'mapa'];
const VISITED = `${CONFIG.storageKey}.visited`;

export const QUICK = [
  { label: 'Escribir carta', icon: 'pencil', href: '#/cartas?escribir=1' },
  { label: 'Nuevo recuerdo', icon: 'hourglass', href: '#/capsula/nuevo' },
  { label: 'Subir foto', icon: 'image-plus', href: '#/galeria?subir=1' },
  { label: 'Idea de cita', icon: 'dices', href: '#/citas' },
];

/** Sections a person can pin or be suggested: listed in Más, not "moments", not Ajustes. */
export function pickable() {
  return GROUPS.filter((g) => g.id !== 'sistema').flatMap((g) => g.sections.filter((s) => !s.moment && s.module && !s.lock));
}
const byId = (id) => pickable().find((s) => s.id === id);

// ---------- visited sections (this device only, safe to lose) ----------
export function markVisited(id) {
  if (!id) return;
  try {
    const set = new Set(JSON.parse(localStorage.getItem(VISITED) || '[]'));
    if (set.has(id)) return;
    set.add(id); localStorage.setItem(VISITED, JSON.stringify([...set]));
  } catch { /* private mode */ }
}
function visited() { try { return new Set(JSON.parse(localStorage.getItem(VISITED) || '[]')); } catch { return new Set(); } }

/** The section of the day: one not opened yet here, the same all day; `skip` moves to the next one. */
export function suggestion(day = util.localDay(), skip = 0, seen = visited()) {
  const all = pickable();
  const fresh = all.filter((s) => !seen.has(s.id));
  const pool = fresh.length ? fresh : all;
  const seed = [...day].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { section: pool[(seed + skip) % pool.length], fresh: fresh.length > 0 };
}

// ---------- cards ----------
export function quickActions() {
  return el('nav', { class: 'quick-actions', 'aria-label': 'Accesos rápidos' },
    QUICK.map((q) => el('a', { class: 'quick-action', href: q.href },
      el('span', { class: 'quick-icon', 'aria-hidden': 'true' }, icon(q.icon, { size: 22 })),
      el('span', { class: 'quick-label' }, q.label))));
}

async function loadFavs() {
  const s = await db.getSettings(FAV_ID, { ids: DEFAULT_FAVS }).catch(() => ({ ids: DEFAULT_FAVS }));
  return (s.ids || DEFAULT_FAVS).filter(byId).slice(0, FAV_MAX);
}

export async function favoritesCard() {
  const grid = el('div', { class: 'fav-grid' });
  const paint = async () => {
    const ids = await loadFavs();
    grid.replaceChildren(...[...ids.map((id) => {
      const s = byId(id);
      return el('a', { class: 'fav-tile', href: `#/${s.id}`, title: s.title },
        el('span', { class: 'section-icon', 'aria-hidden': 'true' }, icon(s.icon)),
        el('span', { class: 'fav-name' }, s.short || s.title));
    }), ids.length < FAV_MAX ? el('button', { class: 'fav-tile fav-add', type: 'button', onClick: () => edit() },
      el('span', { class: 'section-icon', 'aria-hidden': 'true' }, icon('plus')), el('span', { class: 'fav-name' }, 'Agregar')) : null].filter(Boolean));
  };
  const edit = async () => {
    const chosen = new Set(await loadFavs());
    const note = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const boxes = [];
    const paintNote = () => { note.textContent = `${chosen.size} de ${FAV_MAX} elegidos.`; boxes.forEach((b) => { b.disabled = !b.checked && chosen.size >= FAV_MAX; }); };
    const groups = GROUPS.filter((g) => g.id !== 'sistema').map((g) => {
      const items = g.sections.filter((s) => pickable().includes(s));
      if (!items.length) return null;
      return el('fieldset', { class: 'fav-group' }, el('legend', { class: 'card-kicker' }, g.title),
        items.map((s) => {
          const box = el('input', { type: 'checkbox', checked: chosen.has(s.id) || null, value: s.id });
          box.addEventListener('change', () => { if (box.checked) chosen.add(s.id); else chosen.delete(s.id); paintNote(); });
          boxes.push(box);
          return el('label', { class: 'fav-option' }, box, icon(s.icon, { size: 18 }), el('span', {}, s.title));
        }));
    }).filter(Boolean);
    paintNote();
    ui.openModal({
      title: 'Sus favoritos', kind: 'sheet', body: el('div', { class: 'stack' }, el('p', { class: 'muted' }, `Elige hasta ${FAV_MAX} secciones para tenerlas a un toque. Se recuerda en este dispositivo.`), note, ...groups),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        // Keep the order they had, new ones at the end.
        const before = await loadFavs();
        const ids = [...before.filter((id) => chosen.has(id)), ...[...chosen].filter((id) => !before.includes(id))];
        await db.setSettings(FAV_ID, { ids });
        await paint();
        ui.toast('Favoritos guardados.', { tone: 'success' });
        return true;
      } }],
    });
  };
  await paint();
  return el('article', { class: 'card home-card fav-card', 'aria-labelledby': 'fav-title' },
    el('div', { class: 'fav-head' },
      el('h2', { class: 'card-kicker', id: 'fav-title' }, 'Sus favoritos'),
      ui.button({ label: 'Editar', iconName: 'pencil', small: true, variant: 'ghost', onClick: () => edit() })),
    grid);
}

export function discoverCard() {
  let skip = 0;
  const box = el('div', { class: 'discover-body' });
  const paint = () => {
    const { section: s, fresh } = suggestion(util.localDay(), skip);
    if (!s) return;
    box.replaceChildren(
      el('span', { class: 'section-icon discover-icon', 'aria-hidden': 'true' }, icon(s.icon, { size: 26 })),
      el('div', { class: 'discover-text' },
        el('p', { class: 'discover-name' }, s.title),
        el('p', { class: 'muted small' }, s.blurb || ''),
        fresh ? null : el('p', { class: 'muted small' }, 'Ya pasaron por todas las secciones. ¡Qué viaje!')),
      el('div', { class: 'card-actions' },
        ui.button({ label: 'Abrir', iconName: 'arrow-right', small: true, variant: 'primary', href: `#/${s.id}` }),
        ui.button({ label: 'Otra idea', iconName: 'refresh-cw', small: true, variant: 'ghost', onClick: () => { skip++; paint(); } })));
  };
  paint();
  return el('article', { class: 'card home-card discover-card', 'aria-labelledby': 'discover-title' },
    el('h2', { class: 'card-kicker', id: 'discover-title' }, 'Prueben hoy'), box);
}
