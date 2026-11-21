// Plan games of the Juegos en pareja (docs/05 §34, Fase 5B): Bingo de citas (a monthly card of
// in-person activities with a Rasca y gana prize per line and per full card), Desafío de 30 días
// (one mini challenge a day with a progress calendar) and Noche de cine (what to watch together,
// a wheel to choose, episodes and a review with stars from each one).
import { ui, util, db, profile } from '../core.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

export const direct = ['bingo', 'reto30', 'cine'];
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const monthLabel = (ym) => fmtMonth.format(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1));
const rasca = () => import('./rasca.js');

// ---------- Bingo de citas ----------
export const BINGO_SIZE = 4;

/** Complete lines (rows, columns and both diagonals) of a done[] grid, and whether it is full. */
export function bingoLines(done, n = BINGO_SIZE) {
  const at = (r, c) => !!done[r * n + c];
  const lines = [];
  for (let r = 0; r < n; r++) if (Array.from({ length: n }, (_, c) => at(r, c)).every(Boolean)) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) if (Array.from({ length: n }, (_, r) => at(r, c)).every(Boolean)) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  if (Array.from({ length: n }, (_, i) => at(i, i)).every(Boolean)) lines.push(Array.from({ length: n }, (_, i) => i * n + i));
  if (Array.from({ length: n }, (_, i) => at(i, n - 1 - i)).every(Boolean)) lines.push(Array.from({ length: n }, (_, i) => i * n + n - 1 - i));
  return { lines, count: lines.length, full: done.length >= n * n && done.slice(0, n * n).every(Boolean) };
}

async function bingoCard(ym) {
  const id = `bingo:${ym}`;
  const found = await db.get('gameArtifacts', id).catch(() => null);
  if (found && !found.deleted) return found;
  const items = await K.bankItems('bingo');
  const cells = [];
  for (let i = 0; i < BINGO_SIZE * BINGO_SIZE && items.length; i++) {
    const it = await K.draw('bingo', items.filter((x) => !cells.some((c) => c.itemId === x.id)).length ? items.filter((x) => !cells.some((c) => c.itemId === x.id)) : items);
    cells.push({ itemId: it.id, text: it.text, doneAt: '', by: '' });
  }
  const rec = { id, gameId: 'bingo', type: 'bingoCard', data: { month: ym, cells, prizes: {} } };
  await K.putArtifact(rec);
  return db.get('gameArtifacts', id);
}

async function bingo(ctx) {
  const box = el('div', { class: 'stack' });
  const ym = util.localDay().slice(0, 7);
  let viewing = ym;
  const load = async () => {
    const card = viewing === ym ? await bingoCard(ym) : await db.get('gameArtifacts', `bingo:${viewing}`);
    const cells = card?.data?.cells || [];
    const st = bingoLines(cells.map((c) => !!c.doneAt));
    const inLine = new Set(st.lines.flat());
    const past = viewing !== ym;
    const doneN = cells.filter((c) => c.doneAt).length;
    const grid = el('div', { class: 'bingo-grid', role: 'group', 'aria-label': `Cartón de ${monthLabel(viewing)}` },
      cells.map((c, i) => el('button', { class: `bingo-cell${c.doneAt ? ' is-done' : ''}${inLine.has(i) ? ' in-line' : ''}`, type: 'button', 'aria-pressed': String(!!c.doneAt), disabled: past,
        'aria-label': `${c.text}${c.doneAt ? ', hecho' : ''}`, onClick: () => cellSheet(card, i) },
      el('span', { class: 'bingo-text' }, c.text), c.doneAt ? el('span', { class: 'bingo-stamp', 'aria-hidden': 'true' }, icon('heart', { size: 26 })) : null)));
    const others = (await K.artifacts('bingo', 'bingoCard')).filter((a) => a.data?.month && a.data.month !== viewing).sort((a, b) => b.data.month.localeCompare(a.data.month));
    put(box,
      el('section', { class: 'card stack bingo-head' },
        el('h2', { class: 'card-title', tabindex: '-1' }, `Cartón de ${monthLabel(viewing)}`),
        el('p', { class: 'muted small' }, past ? `Hicieron ${doneN} de ${cells.length}.` : 'Hagan cada plan juntos y márquenlo. Una línea completa les da una tarjeta de Rasca y gana a cada uno; el cartón completo, otra.'),
        el('p', { class: 'bingo-progress' }, el('strong', {}, `${doneN} de ${cells.length}`), st.count ? ` · ${st.count} ${st.count === 1 ? 'línea' : 'líneas'}` : '', st.full ? ' · ¡cartón lleno!' : '')),
      grid,
      others.length || past ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Otros meses'),
        el('div', { class: 'chip-row chip-wrap' },
          past ? el('button', { class: 'chip', type: 'button', onClick: () => { viewing = ym; load(); } }, 'Este mes') : null,
          others.slice(0, 12).map((a) => el('button', { class: 'chip', type: 'button', onClick: () => { viewing = a.data.month; load(); } }, `${monthLabel(a.data.month)} · ${a.data.cells.filter((c) => c.doneAt).length}/${a.data.cells.length}`)))) : null);
  };
  const cellSheet = (card, i) => {
    const c = card.data.cells[i];
    const date = ui.input({ type: 'date', value: c.doneAt || util.localDay(), max: util.localDay() });
    const save = async (patch) => {
      const fresh = await db.get('gameArtifacts', card.id);
      const cells = fresh.data.cells.slice(); cells[i] = { ...cells[i], ...patch };
      const before = bingoLines(fresh.data.cells.map((x) => !!x.doneAt));
      const after = bingoLines(cells.map((x) => !!x.doneAt));
      const prizes = { ...(fresh.data.prizes || {}) };
      await K.putArtifact({ ...fresh, data: { ...fresh.data, cells, prizes } });
      if (patch.doneAt) { util.haptic([10, 30, 10]); K.ding(); }
      if (after.count > before.count && !prizes.line) {
        prizes.line = util.nowISO(); await K.putArtifact({ ...(await db.get('gameArtifacts', card.id)), data: { ...fresh.data, cells, prizes } });
        ui.confetti({ count: 36 }); (await rasca()).earnForBoth(`bingo-${fresh.data.month}-linea`, 'bingo');
      }
      if (after.full && !prizes.full) {
        prizes.full = util.nowISO(); await K.putArtifact({ ...(await db.get('gameArtifacts', card.id)), data: { ...fresh.data, cells, prizes } });
        ui.confetti({ count: 60 }); (await rasca()).earnForBoth(`bingo-${fresh.data.month}-carton`, 'bingo');
        K.logGame('bingo', { result: 'Cartón completo', month: fresh.data.month }, `game:bingo:${fresh.data.month}`);
      }
      load();
    };
    ui.openModal({
      title: c.doneAt ? 'Plan hecho' : '¿Lo hicieron?', kind: 'sheet',
      body: el('div', { class: 'stack' }, el('p', { class: 'ema-dialog-title' }, c.text),
        c.doneAt ? el('p', { class: 'muted small' }, `Marcado el ${util.formatDay(c.doneAt)}${c.by ? ` por ${profile.name(c.by)}` : ''}.`) : ui.field({ label: '¿Cuándo?', control: date })),
      actions: c.doneAt
        ? [{ label: 'Desmarcar', variant: 'ghost', onClick: async () => { await save({ doneAt: '', by: '' }); return true; } }, { label: 'Listo', variant: 'primary' }]
        : [{ label: 'Cambiar plan', variant: 'ghost', onClick: async () => {
          const items = await K.bankItems('bingo'); const used = new Set(card.data.cells.map((x) => x.itemId));
          const it = await K.draw('bingo', items.filter((x) => !used.has(x.id)));
          if (it) await save({ itemId: it.id, text: it.text });
          return true;
        } }, { label: 'Lo hicimos', variant: 'primary', onClick: async () => { if (!util.isValidDay(date.value)) return false; await save({ doneAt: date.value, by: profile.active() }); return true; } }],
    });
  };
  ctx.mount(box);
  await load();
  return db.onChange((store) => { if (store === 'gameArtifacts' && !document.querySelector('.overlay')) load().catch(() => {}); });
}

// ---------- Desafío de 30 días ----------
export const RETO_DAYS = 30;
/** Day of the challenge (1 = start day). Can be < 1 (not started) or > 30 (over). */
export const challengeDay = (start, today = util.localDay()) => util.daysBetween(util.parseDay(start), util.parseDay(today)) + 1;
/** State of each day: 'done' | 'missed' | 'today' | 'future'. */
export function challengeStates(start, done = {}, today = util.localDay(), n = RETO_DAYS) {
  const d = challengeDay(start, today);
  return Array.from({ length: n }, (_, i) => (done[i + 1] ? 'done' : i + 1 < d ? 'missed' : i + 1 === d ? 'today' : 'future'));
}

async function reto30(ctx) {
  const box = el('div', { class: 'stack' });
  const current = async () => (await K.artifacts('reto30', 'challenge30')).find((a) => a.data?.status === 'active');
  const begin = async (start) => {
    const items = await K.bankItems('reto30');
    const list = [];
    for (let i = 0; i < RETO_DAYS && items.length; i++) {
      const pool = items.filter((x) => !list.some((l) => l.id === x.id));
      const it = await K.draw('reto30', pool.length ? pool : items);
      list.push({ id: it.id, text: it.text });
    }
    await K.putArtifact({ id: `reto30:${start}`, gameId: 'reto30', type: 'challenge30', data: { start, items: list, done: {}, status: 'active' } });
    load();
  };
  const mark = async (rec, n, on = true) => {
    const fresh = await db.get('gameArtifacts', rec.id);
    const done = { ...(fresh.data.done || {}) };
    if (on) done[n] = { at: util.localDay(), by: profile.active() }; else delete done[n];
    const all = Object.keys(done).length >= RETO_DAYS;
    await K.putArtifact({ ...fresh, data: { ...fresh.data, done, ...(all ? { status: 'done', finishedAt: util.nowISO() } : {}) } });
    if (on) { K.ding(); util.haptic([10, 30, 10]); }
    if (all) {
      ui.confetti({ count: 70 });
      (await rasca()).earnForBoth(`reto30-${fresh.data.start}`, 'reto30');
      K.logGame('reto30', { result: '30 de 30 retos', start: fresh.data.start }, `game:reto30:${fresh.data.start}`);
    }
    load();
  };
  const swapToday = async (rec, n) => {
    const fresh = await db.get('gameArtifacts', rec.id);
    const items = await K.bankItems('reto30'); const used = new Set(fresh.data.items.map((x) => x.id));
    const it = await K.draw('reto30', items.filter((x) => !used.has(x.id)));
    if (!it) return;
    const list = fresh.data.items.slice(); list[n - 1] = { id: it.id, text: it.text };
    await K.putArtifact({ ...fresh, data: { ...fresh.data, items: list } });
    load();
  };
  const load = async () => {
    const rec = await current();
    const past = (await K.artifacts('reto30', 'challenge30')).filter((a) => a.data?.status !== 'active');
    const pastList = past.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Desafíos anteriores'),
      el('ul', { class: 'card pet-list' }, past.slice(0, 10).map((a) => el('li', { class: 'pet-row' }, icon(a.data.status === 'done' ? 'trophy' : 'calendar', { size: 18 }),
        el('div', { class: 'grow' }, el('strong', {}, `Desde el ${util.formatDay(a.data.start)}`), el('p', { class: 'muted small' }, `${Object.keys(a.data.done || {}).length} de ${RETO_DAYS} retos${a.data.status === 'done' ? ' · ¡completo!' : ''}`)))))) : null;
    if (!rec) {
      const date = ui.input({ type: 'date', value: util.localDay(), min: util.localDay() });
      put(box, el('section', { class: 'card stack center-col' },
        el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('calendar', { size: 44 })),
        el('h2', { class: 'card-title', tabindex: '-1' }, 'Un mini reto de pareja al día'),
        el('p', { class: 'muted' }, 'Durante 30 días la app les da un reto corto para hacer juntos, en persona. Si un día se les pasa, lo pueden hacer después.'),
        ui.field({ label: 'Empezamos el', control: date }),
        ui.button({ label: 'Empezar el desafío', iconName: 'play', variant: 'primary', onClick: () => { if (util.isValidDay(date.value)) begin(date.value); } })), pastList);
      return;
    }
    const { start, items, done = {} } = rec.data;
    const d = challengeDay(start);
    const states = challengeStates(start, done);
    const todayN = d >= 1 && d <= RETO_DAYS ? d : 0;
    const count = Object.keys(done).length;
    const pending = states.map((s, i) => (s === 'missed' ? i + 1 : 0)).filter(Boolean);
    const todayCard = d < 1
      ? el('section', { class: 'card stack center-col' }, el('h2', { class: 'card-title', tabindex: '-1' }, `Empieza el ${util.formatDay(start)}`), el('p', { class: 'muted' }, 'El primer reto se abre ese día.'))
      : todayN ? el('section', { class: `card stack center-col reto-today${done[todayN] ? ' is-done' : ''}` },
        el('span', { class: 'card-cat' }, `Día ${todayN} de ${RETO_DAYS}`),
        el('h2', { class: 'reto-text', tabindex: '-1' }, items[todayN - 1]?.text || ''),
        done[todayN]
          ? el('p', { class: 'reto-done' }, icon('circle-check', { size: 20 }), ' ¡Hecho hoy!')
          : el('div', { class: 'btn-row center-row' },
            ui.button({ label: 'Cambiar reto', iconName: 'rotate-cw', variant: 'ghost', small: true, onClick: () => swapToday(rec, todayN) }),
            ui.button({ label: 'Lo hicimos', iconName: 'check', variant: 'primary', onClick: () => mark(rec, todayN) })))
        : el('section', { class: 'card stack center-col' }, el('h2', { class: 'card-title', tabindex: '-1' }, 'Terminaron los 30 días'), el('p', { class: 'muted' }, `Hicieron ${count} de ${RETO_DAYS} retos.`),
          ui.button({ label: 'Guardar y empezar otro', iconName: 'rotate-cw', variant: 'primary', onClick: async () => { await K.putArtifact({ ...rec, data: { ...rec.data, status: count >= RETO_DAYS ? 'done' : 'ended', finishedAt: util.nowISO() } }); load(); } }));
    const cal = el('ol', { class: 'reto-grid', 'aria-label': 'Calendario del desafío' }, states.map((s, i) => el('li', {},
      el('button', { class: `reto-day is-${s}`, type: 'button', disabled: s === 'future' || s === 'today',
        'aria-label': `Día ${i + 1}: ${s === 'done' ? 'hecho' : s === 'missed' ? 'pendiente' : s === 'today' ? 'hoy' : 'todavía no'}`,
        onClick: () => ui.openModal({ title: `Día ${i + 1}`, kind: 'sheet', body: el('p', { class: 'ema-dialog-title' }, items[i]?.text || ''),
          actions: s === 'done' ? [{ label: 'Desmarcar', variant: 'ghost', onClick: async () => { await mark(rec, i + 1, false); return true; } }, { label: 'Listo', variant: 'primary' }]
            : [{ label: 'Cerrar', variant: 'ghost' }, { label: 'Lo hicimos tarde', variant: 'primary', onClick: async () => { await mark(rec, i + 1); return true; } }] }) },
      el('span', {}, String(i + 1)), s === 'done' ? icon('check', { size: 14 }) : null))));
    put(box,
      el('div', { class: 'reto-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(RETO_DAYS), 'aria-valuenow': String(count), 'aria-label': 'Retos hechos' },
        el('span', { style: { width: `${(count / RETO_DAYS) * 100}%` } })),
      el('p', { class: 'muted small game-progress' }, `${count} de ${RETO_DAYS} retos${pending.length ? ` · ${pending.length} ${pending.length === 1 ? 'pendiente' : 'pendientes'} de días anteriores` : ''}`),
      todayCard, cal,
      el('div', { class: 'btn-row' }, ui.button({ label: 'Dejar el desafío aquí', iconName: 'flag', variant: 'ghost', small: true, onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Dejar el desafío aquí?', message: 'Queda guardado con lo que llevan y pueden empezar otro.', confirmLabel: 'Dejarlo' }))) return;
        await K.putArtifact({ ...rec, data: { ...rec.data, status: 'ended', finishedAt: util.nowISO() } }); load();
      } })), pastList);
  };
  ctx.mount(box);
  await load();
  return db.onChange((store) => { if (store === 'gameArtifacts' && !document.querySelector('.overlay')) load().catch(() => {}); });
}

// ---------- Noche de cine ----------
export const CINE_KINDS = [{ value: 'pelicula', label: 'Película' }, { value: 'serie', label: 'Serie' }, { value: 'anime', label: 'Anime' }, { value: 'dorama', label: 'Dorama' }];
const CINE_STATUS = [{ value: 'porver', label: 'Por ver' }, { value: 'viendo', label: 'Viendo' }, { value: 'vista', label: 'Vistas' }];
const kindLabel = (k) => CINE_KINDS.find((x) => x.value === k)?.label || 'Película';
const hasEpisodes = (k) => k !== 'pelicula';
/** Average of the reviews' stars (0 when nobody reviewed). */
export const avgStars = (reviews = {}) => { const v = Object.values(reviews).map((r) => r?.stars || 0).filter(Boolean); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0; };

async function cine(ctx) {
  let tab = 'porver'; let kind = 'todo';
  const box = el('div', { class: 'stack' });
  const list = el('ul', { class: 'cine-list' });
  const all = async () => (await K.artifacts('cine', 'movie'));
  const save = (rec, patch) => K.putArtifact({ ...rec, data: { ...rec.data, ...patch } });
  const form = (rec = null) => {
    const d = rec?.data || {};
    const title = ui.input({ maxlength: '80', value: d.title || '' });
    let k = d.kind || 'pelicula';
    const eps = ui.input({ type: 'number', min: '1', max: '2000', inputmode: 'numeric', value: d.epsTotal || '' });
    const epsF = ui.field({ label: 'Episodios en total (opcional)', control: eps }); epsF.hidden = !hasEpisodes(k);
    const where = ui.input({ maxlength: '40', value: d.platform || '', placeholder: 'Ej.: en la tele, en el cine…' });
    const fT = ui.field({ label: 'Título', control: title });
    ui.openModal({
      title: rec ? 'Editar' : 'Agregar a la lista', kind: 'sheet',
      body: el('div', { class: 'stack' }, fT,
        ui.field({ label: 'Qué es', control: ui.segmented({ label: 'Qué es', value: k, options: CINE_KINDS, onChange: (v) => { k = v; epsF.hidden = !hasEpisodes(v); } }) }),
        epsF, ui.field({ label: 'Dónde verla (opcional)', control: where })),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        if (!title.value.trim()) { fT.setError('Escribe el título.'); return false; }
        const patch = { title: title.value.trim(), kind: k, epsTotal: hasEpisodes(k) ? Number(eps.value) || 0 : 0, platform: where.value.trim() };
        if (rec) await save(rec, patch);
        else await K.putArtifact({ id: util.uuid(), gameId: 'cine', type: 'movie', data: { ...patch, status: 'porver', epsSeen: 0, suggestedBy: profile.active(), reviews: {} } });
        ui.toast('Guardado.', { tone: 'success' }); load(); return true;
      } }],
    });
    requestAnimationFrame(() => title.focus());
  };
  const review = (rec) => {
    let who = profile.active();
    const prev = () => rec.data.reviews?.[who] || {};
    const text = ui.textarea({ rows: 3, maxlength: '400', placeholder: '¿Qué te pareció?' });
    let st = K.stars({ value: prev().stars || 0, label: 'Estrellas' });
    const starsBox = el('div', {}, st.node);
    const sync = () => { text.value = prev().text || ''; st = K.stars({ value: prev().stars || 0, label: 'Estrellas' }); put(starsBox, st.node); };
    sync();
    ui.openModal({
      title: 'Reseña', kind: 'sheet',
      body: el('div', { class: 'stack' }, el('p', { class: 'ema-dialog-title' }, rec.data.title),
        ui.field({ label: 'Quién reseña', control: ui.segmented({ label: 'Quién reseña', value: who, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), onChange: (v) => { who = v; sync(); } }) }),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Estrellas'), starsBox), ui.field({ label: 'Reseña (opcional)', control: text })),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        if (!st.value) { ui.toast('Elige de 1 a 5 estrellas.'); return false; }
        const fresh = await db.get('gameArtifacts', rec.id);
        await save(fresh, { status: 'vista', watchedAt: fresh.data.watchedAt || util.localDay(), reviews: { ...(fresh.data.reviews || {}), [who]: { stars: st.value, text: text.value.trim(), at: util.nowISO() } } });
        ui.toast('Reseña guardada.', { tone: 'success' }); load(); return true;
      } }],
    });
  };
  const row = (rec) => {
    const d = rec.data;
    const avg = avgStars(d.reviews);
    const epsLine = hasEpisodes(d.kind) && (d.epsSeen || d.epsTotal) ? `Episodio ${d.epsSeen || 0}${d.epsTotal ? ` de ${d.epsTotal}` : ''}` : '';
    return el('li', { class: 'card cine-item' },
      el('div', { class: 'cine-main' },
        el('span', { class: 'section-icon' }, icon(d.kind === 'anime' ? 'sparkles' : d.kind === 'pelicula' ? 'film' : 'tv', { size: 20 })),
        el('div', { class: 'grow' }, el('strong', { class: 'cine-title' }, d.title),
          el('p', { class: 'muted small' }, [kindLabel(d.kind), d.platform, epsLine, d.suggestedBy ? `idea de ${profile.name(d.suggestedBy)}` : ''].filter(Boolean).join(' · ')),
          d.epsTotal && hasEpisodes(d.kind) ? el('div', { class: 'cine-eps', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(d.epsTotal), 'aria-valuenow': String(d.epsSeen || 0), 'aria-label': 'Episodios vistos' }, el('span', { style: { width: `${Math.min(100, ((d.epsSeen || 0) / d.epsTotal) * 100)}%` } })) : null,
          d.status === 'vista' && Object.keys(d.reviews || {}).length ? el('ul', { class: 'cine-reviews' }, profile.PEOPLE.filter((p) => d.reviews?.[p]).map((p) => el('li', {},
            el('span', { class: 'cine-stars', 'aria-label': `${profile.name(p)}: ${d.reviews[p].stars} de 5` }, K.starsText(d.reviews[p].stars)), ` ${profile.name(p)}`, d.reviews[p].text ? el('span', { class: 'muted' }, ` · ${d.reviews[p].text}`) : null))) : null),
        avg ? el('span', { class: 'cine-avg', 'aria-label': `Promedio ${avg} de 5` }, icon('star', { size: 16 }), String(avg)) : null),
      el('div', { class: 'btn-row cine-actions' },
        d.status === 'porver' && hasEpisodes(d.kind) ? ui.button({ label: 'Empezar', iconName: 'play', small: true, onClick: async () => { await save(rec, { status: 'viendo', epsSeen: Math.max(1, d.epsSeen || 0) }); load(); } }) : null,
        d.status === 'viendo' ? ui.button({ label: '+1 episodio', iconName: 'plus', small: true, onClick: async () => {
          const n = (d.epsSeen || 0) + 1; await save(rec, { epsSeen: n });
          if (d.epsTotal && n >= d.epsTotal) { ui.toast('¡Terminaron! ¿La reseñan?', { action: { label: 'Reseñar', onClick: () => review(rec) } }); }
          load();
        } }) : null,
        d.status !== 'vista' ? ui.button({ label: 'Ya la vimos', iconName: 'check', small: true, variant: d.status === 'viendo' ? 'ghost' : 'secondary', onClick: () => review(rec) }) : ui.button({ label: 'Reseñar', iconName: 'star', small: true, variant: 'ghost', onClick: () => review(rec) }),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${d.title}`, onClick: () => form(rec) }, icon('pencil', { size: 16 })),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${d.title}`, onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrarla de la lista?', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('gameArtifacts', rec.id); load(); } } }, icon('trash-2', { size: 16 }))));
  };
  const spin = async () => {
    const pool = (await all()).filter((r) => (r.data.status === 'porver' || r.data.status === 'viendo') && (kind === 'todo' || r.data.kind === kind));
    if (pool.length < 2) { ui.toast('Agreguen al menos dos títulos por ver para girar.'); return; }
    const pick = K.shuffle(pool).slice(0, 10);
    const w = K.wheel(pick.map((r) => r.data.title), { size: Math.min(300, window.innerWidth - 64) });
    const res = el('div', { class: 'wheel-result', 'aria-live': 'polite' });
    let chosen = null;
    const go = ui.button({ label: 'Girar', iconName: 'loader-pinwheel', variant: 'primary', onClick: async () => {
      go.disabled = true; const i = await w.spin(); chosen = pick[i];
      put(res, el('span', { class: 'muted small' }, 'Esta noche ven'), el('strong', { class: 'wheel-result-text' }, chosen.data.title)); ui.announce(`Esta noche ven: ${chosen.data.title}`);
      go.disabled = false; go.querySelector(':scope > span:not(.ripple-dot)').textContent = 'Otra vez';
    } });
    ui.openModal({ title: '¿Qué vemos hoy?', body: el('div', { class: 'stack center-col' }, w.node, res, go),
      actions: [{ label: 'Cerrar', variant: 'ghost' }, { label: '¡Esa!', variant: 'primary', onClick: async () => {
        if (!chosen) return false;
        if (chosen.data.status === 'porver') await save(chosen, { status: hasEpisodes(chosen.data.kind) ? 'viendo' : 'porver', epsSeen: hasEpisodes(chosen.data.kind) ? Math.max(1, chosen.data.epsSeen || 0) : 0, pickedAt: util.localDay() });
        K.logGame('cine', { result: chosen.data.title });
        load(); return true;
      } }] });
  };
  const load = async () => {
    const recs = await all();
    const shown = recs.filter((r) => r.data.status === tab && (kind === 'todo' || r.data.kind === kind))
      .sort((a, b) => (tab === 'vista' ? (b.data.watchedAt || '').localeCompare(a.data.watchedAt || '') : (a.createdAt || '').localeCompare(b.createdAt || '')));
    const counts = Object.fromEntries(CINE_STATUS.map((s) => [s.value, recs.filter((r) => r.data.status === s.value).length]));
    put(list, ...(shown.length ? shown.map(row) : [el('li', {}, ui.emptyState({ title: tab === 'vista' ? 'Aún no han visto nada' : 'La lista está vacía', text: tab === 'vista' ? 'Al terminar una película o serie, déjenle su reseña.' : 'Agreguen películas, series, anime o doramas para ver juntos.', art: 'moon' }))]));
    meta.textContent = `${counts.porver} por ver · ${counts.viendo} viendo · ${counts.vista} vistas`;
  };
  const meta = el('p', { class: 'muted small' });
  const tabs = ui.segmented({ label: 'Lista', value: tab, options: CINE_STATUS, onChange: (v) => { tab = v; load(); } });
  const kinds = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Tipo' }, [{ value: 'todo', label: 'Todo' }, ...CINE_KINDS].map((k) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(k.value === kind), dataset: { k: k.value }, onClick: () => {
    kind = k.value; kinds.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.k === kind))); load();
  } }, k.label)));
  add(box,
    el('div', { class: 'btn-row' }, ui.button({ label: '¿Qué vemos hoy?', iconName: 'loader-pinwheel', variant: 'primary', onClick: spin }), ui.button({ label: 'Agregar', iconName: 'plus', onClick: () => form() })),
    tabs, kinds, meta, list);
  ctx.mount(box);
  await load();
  return db.onChange((store) => { if (store === 'gameArtifacts' && !document.querySelector('.overlay')) load().catch(() => {}); });
}

const GAMES = { bingo, reto30, cine };
export const play = (ctx) => GAMES[ctx.game.id](ctx);
