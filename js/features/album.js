// Álbum "Nuestro año" (docs/05 Más §37) with the "Nuestro mes" view (decided 2026-11-20).
// Collages: one album per year of relationship (from one start day to the next), a cover and one
// page per month with photos. The app picks the photos (titled memories and favorites first, one
// per day before repeating a day) and draws each page on a canvas in one of four original templates
// (washi grid, purikura strip, vertical scroll, polaroids with tape). Every page can change its
// photos, order, template, title and phrase; the cover can be fixed. Pages export as PNG (max
// 2048 px) and the whole album prints one page per sheet. "Nuestro mes": a calendar of the month
// with the mini photo of each day. "Solo yo", the cycle and the private corner never enter.
import { ui, util, db, profile } from '../core.js';
import { openViewer } from '../core/viewer.js';
import { collectPhotos, viewerItems } from './galeria.js';

const { el, icon } = util;
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const fmtMonthOnly = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TAB_KEY = 'aishiteru.album.tab';
const PAGE_W = 1400; const PAGE_H = 1800; // portrait page, under the 2048 px limit
export const TEMPLATES = [
  { value: 'washi', label: 'Washi', n: 4 },
  { value: 'purikura', label: 'Tira', n: 3 },
  { value: 'pergamino', label: 'Pergamino', n: 3 },
  { value: 'polaroid', label: 'Polaroids', n: 3 },
];
const capacity = (t) => TEMPLATES.find((x) => x.value === t)?.n || 4;
const PAPER = { bg: '#FFFDF9', ink: '#3A2C31', soft: '#7A6268', accent: '#C2405F', tape: '#F4A7B9', gold: '#C9A46A' };

// ---------- years and months ----------
const addYears = (day, n) => { const d = util.parseDay(day); return util.localDay(new Date(d.getFullYear() + n, d.getMonth(), d.getDate())); };
const dayBefore = (day) => { const d = util.parseDay(day); d.setDate(d.getDate() - 1); return util.localDay(d); };

/** Relationship years that have photos: [{ index, from, to, label }], newest first. */
export function relationshipYears(start, photos, today = util.localDay()) {
  if (!util.isValidDay(start)) {
    const ys = [...new Set(photos.map((p) => p.date.slice(0, 4)))].sort().reverse();
    return ys.map((y) => ({ index: +y, from: `${y}-01-01`, to: `${y}-12-31`, label: y }));
  }
  const out = [];
  for (let i = 0; addYears(start, i) <= today; i++) {
    const from = addYears(start, i); const to = dayBefore(addYears(start, i + 1));
    out.push({ index: i + 1, from, to, label: `Año ${i + 1} · ${from.slice(0, 4)}–${to.slice(0, 4)}` });
  }
  return out.reverse();
}

/** Months (YYYY-MM) between two days, oldest first. */
export function monthsBetween(from, to) {
  const out = []; let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/** Pick n photos: titled memories and favorites first, one per day before repeating a day. */
export function autoPick(photos, n) {
  const score = (p) => (p.favorite ? 3 : 0) + (p.source === 'capsula' && p.title ? 2 : 0) + (p.source === 'primeras' ? 2 : 0) + (p.order === 0 ? 1 : 0);
  const sorted = [...photos].sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date));
  const picked = []; const days = new Set();
  for (const p of sorted) { if (picked.length >= n) break; if (!days.has(p.date)) { picked.push(p); days.add(p.date); } }
  for (const p of sorted) { if (picked.length >= n) break; if (!picked.includes(p)) picked.push(p); }
  return picked.sort((a, b) => a.date.localeCompare(b.date)).map((p) => p.mediaId);
}

// ---------- drawing ----------
const imgCache = new Map();
async function bitmap(mediaId) {
  if (imgCache.has(mediaId)) return imgCache.get(mediaId);
  const b = await db.getMedia(mediaId).catch(() => null);
  if (!b || b.type.startsWith('video/')) return null;
  const bmp = await createImageBitmap(b).catch(() => null);
  if (bmp) { imgCache.set(mediaId, bmp); if (imgCache.size > 60) { const k = imgCache.keys().next().value; imgCache.get(k)?.close?.(); imgCache.delete(k); } }
  return bmp;
}
function cover(ctx, img, x, y, w, h) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (img) { const k = Math.max(w / img.width, h / img.height); ctx.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k); }
  else { ctx.fillStyle = '#F1E4E6'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
const tape = (ctx, x, y, r, w = 150) => { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.globalAlpha = 0.7; ctx.fillStyle = PAPER.tape; ctx.fillRect(-w / 2, -22, w, 44); ctx.restore(); };
function polaroid(ctx, img, cx, cy, size, rot) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(40,20,30,.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; ctx.fillRect(-size / 2 - 24, -size / 2 - 24, size + 48, size + 110);
  ctx.shadowColor = 'transparent';
  cover(ctx, img, -size / 2, -size / 2, size, size);
  ctx.restore();
  tape(ctx, cx + Math.sin(rot) * 20, cy - size / 2 - 20, rot - 0.1, 140);
}

/** Draws one page (or the cover) on a canvas. page: { template, mediaIds, title, phrase, dateText }. */
export async function drawPage(canvas, page, { isCover = false } = {}) {
  canvas.width = PAGE_W; canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  await document.fonts?.load?.('700 64px "Shippori Mincho"').catch(() => {});
  ctx.fillStyle = PAPER.bg; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  // a light washi border
  ctx.strokeStyle = PAPER.gold; ctx.globalAlpha = 0.5; ctx.lineWidth = 4; ctx.strokeRect(40, 40, PAGE_W - 80, PAGE_H - 80); ctx.globalAlpha = 1;
  const imgs = await Promise.all((page.mediaIds || []).map(bitmap));
  const title = (y, size = 72) => { if (!page.title) return; ctx.fillStyle = PAPER.ink; ctx.textAlign = 'center'; ctx.font = `700 ${size}px "Shippori Mincho", serif`; ctx.fillText(page.title, PAGE_W / 2, y, PAGE_W - 200); };
  const foot = () => {
    ctx.textAlign = 'center';
    if (page.phrase) { ctx.fillStyle = PAPER.soft; ctx.font = 'italic 500 40px "Shippori Mincho", serif'; ctx.fillText(page.phrase, PAGE_W / 2, PAGE_H - 150, PAGE_W - 220); }
    if (page.dateText) { ctx.fillStyle = PAPER.accent; ctx.font = '700 32px "Zen Maru Gothic", sans-serif'; ctx.fillText(page.dateText, PAGE_W / 2, PAGE_H - 90); }
  };
  if (isCover) {
    cover(ctx, imgs[0], 160, 300, PAGE_W - 320, PAGE_W - 320);
    tape(ctx, 230, 310, -0.5); tape(ctx, PAGE_W - 230, 310, 0.5);
    title(220, 88); foot();
    return canvas;
  }
  const t = page.template || 'washi';
  if (t === 'washi') {
    title(190);
    const g = 40; const w = (PAGE_W - 200 - g) / 2; const h = (PAGE_H - 560 - g) / 2;
    [[100, 260], [100 + w + g, 260], [100, 260 + h + g], [100 + w + g, 260 + h + g]].forEach(([x, y], i) => { cover(ctx, imgs[i], x, y, w, h); });
    tape(ctx, 140, 262, -0.6); tape(ctx, PAGE_W - 140, 262, 0.6); tape(ctx, 140, 260 + 2 * h + g, 0.6); tape(ctx, PAGE_W - 140, 260 + 2 * h + g, -0.6);
  } else if (t === 'purikura') {
    const x = 120; const w = 760; const h = 440; const g = 36;
    ctx.fillStyle = '#F9D3DD'; ctx.fillRect(x - 30, 150, w + 60, 3 * h + 2 * g + 60);
    [0, 1, 2].forEach((i) => cover(ctx, imgs[i], x, 180 + i * (h + g), w, h));
    ctx.save(); ctx.translate(1090, 260); ctx.fillStyle = PAPER.ink; ctx.textAlign = 'left'; ctx.font = '700 64px "Shippori Mincho", serif';
    const words = (page.title || '').split(' '); words.forEach((wd, i) => ctx.fillText(wd, 0, i * 80, 260)); ctx.restore();
  } else if (t === 'pergamino') {
    title(170);
    ctx.fillStyle = '#F4EBDD'; ctx.fillRect(250, 230, PAGE_W - 500, PAGE_H - 470);
    ctx.fillStyle = '#8C6A4A'; ctx.fillRect(220, 210, PAGE_W - 440, 26); ctx.fillRect(220, PAGE_H - 256, PAGE_W - 440, 26);
    const w = PAGE_W - 620; const h = (PAGE_H - 620) / 3 - 30;
    [0, 1, 2].forEach((i) => cover(ctx, imgs[i], 310, 280 + i * (h + 40), w, h));
  } else {
    title(180);
    polaroid(ctx, imgs[0], 470, 560, 520, -0.07);
    polaroid(ctx, imgs[1], 940, 900, 520, 0.06);
    polaroid(ctx, imgs[2], 480, 1270, 520, 0.03);
  }
  foot();
  return canvas;
}

const toPng = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/png'));
function download(blob, name) {
  const u = URL.createObjectURL(blob); const a = el('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}

// ---------- page editor ----------
function pageEditor({ page, photos, isCover, onSave }) {
  let template = page.template || 'washi';
  let chosen = [...(page.mediaIds || [])];
  const title = ui.input({ value: page.title || '', maxlength: 40 });
  const phrase = ui.input({ value: page.phrase || '', maxlength: 70, placeholder: 'Opcional' });
  const grid = el('ul', { class: 'photo-grid album-pick' });
  const count = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const urls = [];
  const cap = () => (isCover ? 1 : capacity(template));
  const paint = () => {
    chosen = chosen.slice(0, cap());
    count.textContent = `${chosen.length} de ${cap()} fotos elegidas. Se ponen en el orden en que las tocas.`;
    grid.querySelectorAll('button').forEach((b) => {
      const i = chosen.indexOf(b.dataset.id);
      b.setAttribute('aria-pressed', String(i >= 0));
      b.querySelector('.album-pick-n').textContent = i >= 0 ? String(i + 1) : '';
    });
  };
  grid.append(...photos.filter((p) => p.mediaId).map((p) => {
    const btn = el('button', { class: 'photo-tile album-pick-btn', type: 'button', dataset: { id: p.mediaId }, 'aria-label': `${p.title || p.sourceLabel}, ${fmtDay.format(util.parseDay(p.date))}`, onClick: () => {
      const i = chosen.indexOf(p.mediaId);
      if (i >= 0) chosen.splice(i, 1); else if (chosen.length < cap()) chosen.push(p.mediaId); else ui.toast(`Esta plantilla lleva ${cap()}. Quita una antes.`);
      paint();
    } }, el('span', { class: 'album-pick-n', 'aria-hidden': 'true' }));
    db.getMedia(p.mediaId).then((b) => { if (b && !b.type.startsWith('video/')) { const u = URL.createObjectURL(b); urls.push(u); btn.prepend(el('img', { src: u, alt: '' })); } else btn.disabled = true; }).catch(() => {});
    return el('li', {}, btn);
  }));
  paint();
  return ui.openModal({
    title: isCover ? 'Editar la portada' : 'Editar la página', kind: 'sheet', size: 'lg',
    body: el('div', { class: 'stack' },
      isCover ? null : el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Plantilla'), ui.segmented({ label: 'Plantilla', value: template, options: TEMPLATES.map(({ value, label }) => ({ value, label })), onChange: (v) => { template = v; paint(); } })),
      ui.field({ label: 'Título', control: title }),
      ui.field({ label: 'Frase', control: phrase }),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Fotos'), count, grid)),
    actions: [
      { label: 'Volver a lo automático', variant: 'ghost', onClick: () => { onSave(null); } },
      { label: 'Guardar', variant: 'primary', onClick: () => { onSave({ template, mediaIds: chosen, title: title.value.trim(), phrase: phrase.value.trim() }); } },
    ],
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
}

// ---------- "Nuestro mes" ----------
function monthView(photos, state, redraw) {
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const byDay = new Map();
  for (const p of photos) if (p.date.startsWith(state.month)) { if (!byDay.has(p.date)) byDay.set(p.date, []); byDay.get(p.date).push(p); }
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; redraw(); };
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(el('li', { class: 'mes-cell mes-empty', 'aria-hidden': 'true' }));
  const urls = [];
  for (let d = 1; d <= days; d++) {
    const key = `${state.month}-${String(d).padStart(2, '0')}`;
    const list = byDay.get(key) || [];
    const label = fmtDay.format(new Date(y, m - 1, d));
    if (!list.length) { cells.push(el('li', { class: 'mes-cell' }, el('span', { class: 'mes-num' }, String(d)))); continue; }
    const btn = el('button', { class: 'mes-cell-btn', type: 'button', 'aria-label': `${label}: ${list.length} ${list.length === 1 ? 'foto' : 'fotos'}`, onClick: () => openViewer(viewerItems(list)) },
      el('span', { class: 'mes-num' }, String(d)), list.length > 1 ? el('span', { class: 'mes-more' }, `+${list.length - 1}`) : null);
    db.getMedia(list[0].mediaId).then((b) => { if (!b) return; const u = URL.createObjectURL(b); urls.push(u); btn.prepend(b.type.startsWith('video/') ? el('video', { src: `${u}#t=0.1`, muted: true, preload: 'metadata', tabindex: '-1', 'aria-hidden': 'true' }) : el('img', { src: u, alt: '' })); }).catch(() => {});
    cells.push(el('li', { class: 'mes-cell has-photo' }, btn));
  }
  const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);
  const node = el('section', { class: 'card paper-card mes', 'aria-label': `Nuestro mes: ${fmtMonth.format(first)}` },
    el('header', { class: 'mes-head' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onClick: () => shift(-1) }, icon('chevron-left')),
      el('h2', { class: 'mes-title' }, capital(fmtMonth.format(first))),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', onClick: () => shift(1), disabled: state.month >= util.localDay().slice(0, 7) }, icon('chevron-right'))),
    el('ol', { class: 'mes-week', 'aria-hidden': 'true' }, ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => el('li', {}, d))),
    el('ol', { class: 'mes-grid' }, cells),
    el('p', { class: 'muted small' }, total ? `${total} ${total === 1 ? 'foto' : 'fotos'} en ${byDay.size} ${byDay.size === 1 ? 'día' : 'días'} de ${fmtMonthOnly.format(first)}.` : 'Este mes todavía no tiene fotos.'));
  node.cleanup = () => urls.forEach((u) => URL.revokeObjectURL(u));
  return node;
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide album' });
  page.append(ui.pageHeader({ title: 'Álbum "Nuestro año"', jp: 'アルバム', romaji: 'arubamu', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = 'mes';
  try { tab = localStorage.getItem(TAB_KEY) === 'collages' ? 'collages' : 'mes'; } catch { /* private mode */ }
  const state = { month: util.localDay().slice(0, 7), year: null };
  let photos = []; let years = []; let rec = null; let cleanups = []; let alive = true;
  const pageUrls = new Set();

  const pagesFor = (yr) => {
    const inYear = photos.filter((p) => p.date >= yr.from && p.date <= yr.to);
    const saved = rec?.pages || {};
    const months = monthsBetween(yr.from, yr.to > util.localDay() ? util.localDay() : yr.to).filter((k) => inYear.some((p) => p.date.startsWith(k)));
    const pages = months.map((k) => {
      const list = inYear.filter((p) => p.date.startsWith(k));
      const s = saved[k];
      const template = s?.template || TEMPLATES[months.indexOf(k) % TEMPLATES.length].value;
      const valid = (s?.mediaIds || []).filter((id) => list.some((p) => p.mediaId === id));
      return { key: k, list, template, mediaIds: valid.length ? valid : autoPick(list.filter((p) => !p.video), capacity(template)), title: s?.title ?? capital(fmtMonthOnly.format(util.parseDay(`${k}-01`))), phrase: s?.phrase || '', dateText: capital(fmtMonth.format(util.parseDay(`${k}-01`))), custom: !!s };
    });
    const c = saved.cover;
    const coverIds = (c?.mediaIds || []).filter((id) => inYear.some((p) => p.mediaId === id));
    const coverPage = { key: 'cover', list: inYear, mediaIds: coverIds.length ? coverIds : autoPick(inYear, 1), title: c?.title ?? 'Nuestro año', phrase: c?.phrase || '', dateText: yr.label, custom: !!c };
    return { cover: coverPage, pages };
  };

  const saveCustom = async (key, value) => {
    const id = `album:${state.year.index}`;
    const prev = (await db.get('albums', id).catch(() => null)) || { id, year: state.year.index, pages: {}, visibility: 'shared', owner: 'both' };
    const pages = { ...(prev.pages || {}) };
    if (value) pages[key] = value; else delete pages[key];
    await db.put('albums', { ...prev, pages });
    rec = { ...prev, pages };
    draw();
  };

  const collages = async () => {
    if (!years.length) return [ui.emptyState({ title: 'El álbum se arma solo', text: 'Cuando guarden fotos en la Cápsula, el Mapa, las Primeras veces o el Photobooth, aquí aparecen sus páginas.', art: 'crane' })];
    if (!state.year) state.year = years[0];
    rec = await db.get('albums', `album:${state.year.index}`).catch(() => null);
    const { cover, pages } = pagesFor(state.year);
    const all = [cover, ...pages];
    const progress = el('p', { class: 'muted small', role: 'status' }, `Armando ${all.length} páginas…`);
    const list = el('ol', { class: 'album-pages' });
    const yearSel = years.length > 1 ? el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Año' }, years.map((y) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(y.index === state.year.index), onClick: () => { state.year = y; draw(); } }, y.label))) : el('p', { class: 'album-year' }, state.year.label);
    const actions = el('div', { class: 'card-actions' },
      ui.button({ label: 'Imprimir el álbum', iconName: 'file-text', small: true, onClick: () => printAlbum(all) }));
    // Pages are drawn in small batches so the phone never freezes.
    (async () => {
      for (let i = 0; i < all.length; i++) {
        if (!alive) return;
        const pg = all[i];
        const canvas = document.createElement('canvas');
        await drawPage(canvas, pg, { isCover: pg.key === 'cover' });
        const blob = await toPng(canvas);
        const u = URL.createObjectURL(blob); pageUrls.add(u);
        const name = pg.key === 'cover' ? 'Portada' : pg.dateText;
        list.append(el('li', { class: 'album-page' },
          el('img', { src: u, alt: `${name}${pg.title && pg.key !== 'cover' ? `: ${pg.title}` : ''}`, width: PAGE_W, height: PAGE_H, decoding: 'async' }),
          el('div', { class: 'album-page-bar' },
            el('span', { class: 'small' }, name, pg.custom ? el('span', { class: 'badge' }, 'Editada') : null),
            el('span', {},
              el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${name}`, onClick: () => pageEditor({ page: pg, photos: pg.list, isCover: pg.key === 'cover', onSave: (v) => saveCustom(pg.key, v) }) }, icon('pencil', { size: 18 })),
              el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Descargar ${name} como PNG`, onClick: () => download(blob, `album-${pg.key}.png`) }, icon('download', { size: 18 }))))));
        progress.textContent = i + 1 < all.length ? `Armando páginas: ${i + 1} de ${all.length}…` : `${all.length} páginas. Toca el lápiz para cambiar fotos, plantilla o título.`;
        await util.sleep(16);
      }
    })().catch((e) => { console.error(e); progress.textContent = 'No pudimos armar todas las páginas.'; });
    return [yearSel, actions, progress, list];
  };

  const printAlbum = () => {
    const imgs = [...page.querySelectorAll('.album-page img')];
    if (!imgs.length) return;
    const sheet = el('div', { class: 'print-album', 'aria-hidden': 'true' }, imgs.map((i) => el('img', { src: i.src, alt: '' })));
    document.body.append(sheet); document.body.classList.add('printing-album');
    const done = () => { sheet.remove(); document.body.classList.remove('printing-album'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 100);
  };

  const draw = async () => {
    cleanups.forEach((f) => f()); cleanups = [];
    pageUrls.forEach((u) => URL.revokeObjectURL(u)); pageUrls.clear();
    const tabs = ui.segmented({ label: 'Vista del álbum', value: tab, options: [{ value: 'mes', label: 'Nuestro mes' }, { value: 'collages', label: 'Collages' }], onChange: (v) => { tab = v; try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } draw(); } });
    tabs.classList.add('section-tabs');
    if (tab === 'mes') {
      const mv = monthView(photos, state, draw); cleanups.push(mv.cleanup);
      body.replaceChildren(tabs, mv, el('p', { class: 'muted small' }, 'Lo marcado "Solo yo" no entra en el álbum.'));
    } else {
      body.replaceChildren(tabs, ...await collages());
    }
  };

  const load = async () => {
    photos = (await collectPhotos()).map((p) => ({ ...p }));
    years = relationshipYears(profile.startDay(), photos);
    if (state.year) state.year = years.find((y) => y.index === state.year.index) || null;
    await draw();
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el álbum', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  return { node: page, cleanup: () => { alive = false; cleanups.forEach((f) => f()); pageUrls.forEach((u) => URL.revokeObjectURL(u)); } };
}
