// Galería (docs/05 Más §1): every photo of the app that is not private, in one grid by month,
// with filters by origin and the full-screen viewer. "Solo yo" items never show here, not even
// for their owner (docs/05 §36 exclusions); the private corner and the cycle never have photos here.
import { ui, util, db } from '../core.js';
import { openViewer } from '../core/viewer.js';

const { el, icon } = util;
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const KEY = 'aishiteru.galeria.filter';

/** Where photos come from. ids(record) -> mediaIds; only shared, visible records count. */
export const SOURCES = [
  { id: 'capsula', label: 'Cápsula', store: 'memories', ids: (r) => r.mediaIds || [], title: (r) => r.title, href: (r) => `#/capsula/${r.id}`, hrefLabel: 'Ver el recuerdo' },
  { id: 'diario', label: 'Diario', store: 'diary', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.text?.split('\n')[0]?.slice(0, 60), href: () => '#/diario', hrefLabel: 'Ir al diario' },
  { id: 'mapa', label: 'Mapa', store: 'places', ids: (r) => r.mediaIds || [], title: (r) => r.name, href: (r) => `#/mapa/${r.id}`, hrefLabel: 'Ver el lugar' },
  { id: 'primeras', label: 'Primeras veces', store: 'firsts', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.title, href: () => '#/primeras-veces', hrefLabel: 'Ver en el álbum' },
  { id: 'mascotas', label: 'Mascotas', store: 'petRecords', where: (r) => r.type === 'moment', ids: (r) => r.mediaIds || [], title: (r) => r.data?.title || 'Momento', href: () => '#/mascotas', hrefLabel: 'Ir a Mascotas' },
  { id: 'mascotas', label: 'Mascotas', store: 'pets', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.name, href: () => '#/mascotas', hrefLabel: 'Ir a Mascotas' },
  { id: 'recetas', label: 'Recetas', store: 'recipes', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.name, href: () => '#/recetas', hrefLabel: 'Ir a Recetas' },
  // Added 2026-11-21 so Galería shows everything: opened letters only (a sealed one keeps its surprise),
  // dreams, time capsules already opened and the games' pictures (manga pages, drawings, postcards).
  { id: 'cartas', label: 'Cartas', store: 'letters', where: (r) => r.status === 'opened' && !r.letterId, ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.condition ? `Ábreme cuando ${String(r.condition).replace(/^ábreme cuando\s*/i, '')}` : 'Carta', href: () => '#/cartas', hrefLabel: 'Ir a Cartas' },
  { id: 'suenos', label: 'Sueños', store: 'dreams', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.name, href: () => '#/suenos', hrefLabel: 'Ver los sueños' },
  { id: 'capsula-tiempo', label: 'Cápsula del tiempo', store: 'timeCapsules', where: (r) => util.isValidDay(r.openAt) && r.openAt <= util.localDay(), ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.title, href: () => '#/capsula-tiempo', hrefLabel: 'Ver la cápsula' },
  { id: 'juegos', label: 'Juegos', store: 'gameArtifacts', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: (r) => r.data?.title || r.data?.word || 'De un juego', href: () => '#/juegos', hrefLabel: 'Ir a Juegos' },
  { id: 'photobooth', label: 'Photobooth', store: 'content', where: (r) => r.kind === 'purikura', ids: (r) => (r.mediaId ? [r.mediaId] : []), title: () => 'Photobooth', href: () => '#/photobooth', hrefLabel: 'Abrir Photobooth' },
];

/** All shared photos as flat items, newest first. Used by Galería and the Álbum. */
export async function collectPhotos({ only, exclude = [] } = {}) {
  const out = [];
  for (const s of SOURCES) {
    if ((only && !only.includes(s.id)) || exclude.includes(s.id)) continue;
    let recs = [];
    try { recs = await db.query(s.store); } catch { recs = []; }
    for (const r of recs) {
      if (r.visibility === 'self' || r.private || r.hidden || r.deleted || r.draft) continue;
      if (s.where && !s.where(r)) continue;
      const day = util.isValidDay(r.date) ? r.date : (r.createdAt || '').slice(0, 10);
      if (!util.isValidDay(day)) continue;
      s.ids(r).forEach((mediaId, i) => out.push({
        mediaId, source: s.id, sourceLabel: s.label, recordId: r.id, date: day, order: i,
        title: s.title(r) || '', favorite: !!r.favorite, href: s.href(r), hrefLabel: s.hrefLabel,
      }));
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order);
}

export const viewerItems = (list) => list.map((p) => ({
  mediaId: p.mediaId, alt: p.title ? `${p.title}, ${fmtDay.format(util.parseDay(p.date))}` : `Foto del ${fmtDay.format(util.parseDay(p.date))}`,
  caption: p.title || p.sourceLabel, sub: `${p.sourceLabel} · ${fmtDay.format(util.parseDay(p.date))}`, href: p.href, hrefLabel: p.hrefLabel,
}));

export async function render() {
  const page = el('section', { class: 'page page-wide galeria' });
  page.append(ui.pageHeader({ title: 'Galería', jp: '写真', romaji: 'shashin', back: '/mas', actions: [
    // Subir: new photos and videos become a memory in the Cápsula (so they keep a date and a story).
    ui.button({ label: 'Subir', iconName: 'image-plus', variant: 'primary', small: true, href: `#/capsula/nuevo?fotos=1&fecha=${util.localDay()}` })] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const urls = new Set();
  let filter = 'todas';
  try { filter = localStorage.getItem(KEY) || 'todas'; } catch { /* private mode */ }
  let all = [];

  const tile = (p, i, list) => {
    const btn = el('button', { class: 'photo-tile gallery-tile', type: 'button', 'aria-label': `Abrir ${p.title || 'foto'} (${p.sourceLabel}, ${fmtDay.format(util.parseDay(p.date))})`, onClick: () => openViewer(viewerItems(list), i) });
    db.getMedia(p.mediaId).then((b) => {
      if (!b) { btn.append(el('span', { class: 'photo-missing' }, icon('image-off', { size: 20 }))); return; }
      const u = URL.createObjectURL(b); urls.add(u);
      btn.prepend(b.type.startsWith('video/')
        ? el('video', { src: `${u}#t=0.1`, muted: true, playsinline: true, preload: 'metadata', tabindex: '-1', 'aria-hidden': 'true' })
        : el('img', { src: u, alt: '', decoding: 'async', loading: 'lazy' }));
      if (b.type.startsWith('video/')) btn.append(el('span', { class: 'media-play', 'aria-hidden': 'true' }, icon('play', { size: 16 })));
    }).catch(() => {});
    return el('li', {}, btn);
  };

  const draw = () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const present = SOURCES.filter((s, i) => SOURCES.findIndex((x) => x.id === s.id) === i && all.some((p) => p.source === s.id));
    if (filter !== 'todas' && !present.some((s) => s.id === filter)) filter = 'todas';
    const list = filter === 'todas' ? all : all.filter((p) => p.source === filter);
    if (!all.length) {
      body.replaceChildren(ui.emptyState({ title: 'Todavía no hay fotos', text: 'Todo lo que suban en la app (Cápsula, Diario, Mapa, Cartas, Sueños, Juegos, Mascotas, Recetas y más) aparece aquí solo. También pueden subir fotos desde aquí.', art: 'crane', action: { label: 'Guardar un recuerdo', onClick: () => { location.hash = '#/capsula/nuevo'; } } }));
      return;
    }
    const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtrar por origen' },
      [{ id: 'todas', label: 'Todas' }, ...present].map((s) => el('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(filter === s.id),
        onClick: () => { filter = s.id; try { localStorage.setItem(KEY, filter); } catch { /* private mode */ } draw(); },
      }, s.label, el('span', { class: 'chip-count' }, String(s.id === 'todas' ? all.length : all.filter((p) => p.source === s.id).length)))));
    const months = new Map();
    list.forEach((p, i) => { const k = p.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push([p, i]); });
    body.replaceChildren(chips,
      el('p', { class: 'muted small' }, `${list.length} ${list.length === 1 ? 'foto o video' : 'fotos y videos'}. Lo marcado "Solo yo" no aparece aquí.`),
      ...[...months].map(([k, items]) => el('section', { class: 'gallery-month' },
        el('h2', { class: 'tl-month' }, capital(fmtMonth.format(util.parseDay(`${k}-01`)))),
        el('ul', { class: 'photo-grid gallery-grid' }, items.map(([p, i]) => tile(p, i, list))))));
  };

  const load = async () => { all = await collectPhotos(); draw(); };
  try { await load(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir la galería', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
  }
  const off = db.onChange((store) => { if (SOURCES.some((s) => s.store === store)) load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
