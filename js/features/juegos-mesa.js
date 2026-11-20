// Table games of the Juegos en pareja (docs/05 §34): Ruleta de la noche, Dibuja y adivina, Memoria de
// nosotros, Trivia de nosotros, Liga de pareja and Modo juntos. One phone, in person.
import { ui, util, db, profile } from '../core.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

export const scoredGames = ['ruleta', 'dibujo', 'memoria', 'trivia'];
export const direct = ['liga', 'juntos'];
export const rules = {
  ruleta: ['Elijan qué decidir y giren.', 'Volver a girar usa el pase libre de quien lo pide; después, trae castigo.'],
  dibujo: ['Quien dibuja ve la palabra manteniendo presionado.', 'Nada de letras ni números. 60 segundos.', 'Si te adivinan, ganas 1 punto. Pueden guardar los dibujos.'],
  memoria: ['Volteen dos cartas por turno.', 'Si son pareja, suman 1 punto y siguen.', 'Las fotos salen de su Cápsula (nunca lo privado).'],
  trivia: ['Preguntas armadas con sus propios datos.', 'Por turnos; 1 punto por acierto.', 'Pasar usa el pase libre.'],
};

const pub = (r) => r && !r.deleted && r.visibility !== 'self' && !r.private;
const turnsFor = (mins, map) => map[mins] || map[15];

// ---------- Ruleta de la noche ----------
const RULETA_CATS = [['cena', 'Cena'], ['plan', 'Plan'], ['pelicula', 'Película'], ['postre', 'Postre'], ['quien', '¿Quién elige?'], ['propia', 'Propia']];

async function ruleta(ctx) {
  const { s } = ctx;
  const bank = await K.bankItems('ruleta');
  let cat = 'cena'; let w = null; let custom = '';
  const resultBox = el('div', { class: 'wheel-result', 'aria-live': 'polite' });
  const wheelBox = el('div', { class: 'wheel-box' });
  const customBox = el('div', { class: 'stack', hidden: true });
  const customInput = ui.textarea({ rows: 3, maxlength: '400', placeholder: 'Una opción por línea, por ejemplo:\nParque\nCine\nCasa' });
  customInput.addEventListener('input', util.debounce(() => { custom = customInput.value; build(); }, 400));
  customBox.append(ui.field({ label: 'Sus opciones', control: customInput }));
  let last = null; let labels = [];
  const labelsFor = () => {
    if (cat === 'quien') return [...profile.PEOPLE.map((p) => profile.name(p)), ...profile.PEOPLE.map((p) => profile.name(p)), 'Quien perdió el último juego', 'Piedra, papel o tijera'];
    if (cat === 'propia') return custom.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
    return K.shuffle(bank.filter((b) => (b.cat || 'plan') === cat)).slice(0, 10).map((b) => b.text);
  };
  const build = () => {
    labels = labelsFor();
    customBox.hidden = cat !== 'propia';
    if (labels.length < 2) { put(wheelBox, el('p', { class: 'muted' }, cat === 'propia' ? 'Escriban al menos dos opciones.' : 'Este grupo no tiene opciones: agréguenlas en los bancos.')); w = null; spinBtn.disabled = true; return; }
    w = K.wheel(labels, { size: Math.min(320, window.innerWidth - 48) });
    put(wheelBox, w.node); spinBtn.disabled = false; put(resultBox, ); again.hidden = true; accept.hidden = true;
  };
  const spin = async () => {
    if (!w || w.spinning) return;
    spinBtn.disabled = true;
    const i = await w.spin();
    last = labels[i];
    put(resultBox, el('span', { class: 'muted small' }, 'Salió'), el('strong', { class: 'wheel-result-text' }, last));
    ui.announce(`Salió: ${last}`);
    spinBtn.disabled = false; spinBtn.hidden = true; again.hidden = false; accept.hidden = false;
  };
  const spinBtn = ui.button({ label: 'Girar', iconName: 'loader-pinwheel', variant: 'primary', onClick: spin });
  const again = el('div', { class: 'btn-row center-row', hidden: true }, ...profile.PEOPLE.map((p) => ui.button({ label: `${profile.name(p)} quiere otra`, iconName: 'rotate-cw', variant: 'ghost', small: true, onClick: async () => { await s.pass(p); s.round(); spin(); } })));
  const accept = el('div', { class: 'btn-row center-row', hidden: true }, ui.button({ label: '¡Eso hacemos!', iconName: 'check', variant: 'primary', onClick: () => ctx.finish({ scored: false, lines: [`La ruleta decidió: ${last}.`], record: { result: last, cat } }) }));
  const tabs = el('div', { class: 'chip-row chip-wrap ruleta-cats', role: 'group', 'aria-label': 'Qué decidir' }, RULETA_CATS.map(([value, label]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(value === cat), dataset: { cat: value }, onClick: () => {
    cat = value; tabs.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === cat))); spinBtn.hidden = false; build();
  } }, label)));
  ctx.mount(el('div', { class: 'stack center-col ruleta' }, tabs, customBox, wheelBox, resultBox, spinBtn, again, accept));
  build();
  const cleanup = () => {};
  cleanup.end = () => ctx.finish({ scored: false, lines: last ? [`Lo último que salió: ${last}.`] : [], record: { result: last, cat } });
  return cleanup;
}

// ---------- Dibuja y adivina ----------
const INKS = [['#1F1B1A', 'Tinta'], ['#C2405F', 'Sakura'], ['#2F6FA8', 'Índigo'], ['#3E8E5A', 'Bambú'], ['#C9A46A', 'Oro']];
function drawPad() {
  const canvas = el('canvas', { class: 'draw-canvas', role: 'img', 'aria-label': 'Lienzo para dibujar con el dedo o el mouse' });
  const strokes = []; let cur = null; let color = INKS[0][0]; let width = 6; let erasing = false;
  const ctx2 = () => canvas.getContext('2d');
  const size = () => {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr)); canvas._dpr = dpr; redraw();
  };
  const redraw = () => {
    const c = ctx2(); const d = canvas._dpr || 1;
    c.fillStyle = '#FFFDF8'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const st of strokes) {
      c.strokeStyle = st.erase ? '#FFFDF8' : st.color; c.lineWidth = st.width * d;
      c.beginPath(); st.pts.forEach(([x, y], i) => (i ? c.lineTo(x * canvas.width, y * canvas.height) : c.moveTo(x * canvas.width, y * canvas.height)));
      if (st.pts.length === 1) c.lineTo(st.pts[0][0] * canvas.width + 0.1, st.pts[0][1] * canvas.height);
      c.stroke();
    }
  };
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); cur = { color, width: erasing ? width * 3 : width, erase: erasing, pts: [pt(e)] }; strokes.push(cur); canvas.setPointerCapture?.(e.pointerId); redraw(); });
  canvas.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(pt(e)); redraw(); });
  const up = () => { cur = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const inks = el('div', { class: 'ink-row', role: 'radiogroup', 'aria-label': 'Color' }, INKS.map(([c, label], i) => {
    const b = el('button', { class: `ink-dot${i === 0 ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(i === 0), 'aria-label': label, style: { '--ink': c }, onClick: () => {
      color = c; erasing = false; inks.querySelectorAll('.ink-dot').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', String(x === b)); }); eraser.setAttribute('aria-pressed', 'false');
    } });
    return b;
  }));
  const sizes = ui.segmented({ label: 'Grosor', value: '6', options: [{ value: '3', label: 'Fino' }, { value: '6', label: 'Medio' }, { value: '12', label: 'Grueso' }], onChange: (v) => { width = Number(v); } });
  const eraser = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrador', 'aria-pressed': 'false', onClick: () => { erasing = !erasing; eraser.setAttribute('aria-pressed', String(erasing)); } }, icon('eraser', { size: 20 }));
  const undo = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer', onClick: () => { strokes.pop(); redraw(); } }, icon('undo-2', { size: 20 }));
  const clear = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar todo', onClick: () => { strokes.length = 0; redraw(); } }, icon('trash-2', { size: 20 }));
  const node = el('div', { class: 'draw-pad stack' }, canvas, el('div', { class: 'draw-tools' }, inks, sizes, el('div', { class: 'btn-row' }, eraser, undo, clear)));
  const ro = new ResizeObserver(() => size());
  requestAnimationFrame(() => { size(); ro.observe(canvas); });
  return { node, empty: () => !strokes.length, blob: () => new Promise((r) => canvas.toBlob(r, 'image/png')), dims: () => [canvas.width, canvas.height], stop: () => ro.disconnect() };
}

async function dibujo(ctx) {
  const { s } = ctx;
  const words = await K.bankItems('dibujo');
  const total = turnsFor(ctx.opts.mins, { 5: 2, 15: 4, 30: 7 }) * 2;
  let done = 0; let t = null; let pad = null; let stopped = false;
  const saveDrawing = async (p, word, btn) => {
    const blob = await p.blob(); if (!blob) return;
    const id = util.uuid(); const [w, h] = p.dims();
    const mediaId = await db.putMedia(blob, { ownerStore: 'gameArtifacts', ownerId: id, width: w, height: h });
    await db.put('gameArtifacts', { id, gameId: 'dibujo', type: 'drawing', data: { word, by: s.turn() }, mediaId, visibility: 'shared', owner: 'both', by: s.turn() });
    btn.disabled = true; ui.toast('Dibujo guardado.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/juegos/dibujos'; } } });
  };
  const endTurn = (guessed, word) => {
    t?.stop();
    const p = pad; pad = null; p?.stop();
    done++; if (done % 2 === 0) s.round();
    const save = ui.button({ label: 'Guardar el dibujo', iconName: 'download', variant: 'ghost', onClick: () => saveDrawing(p, word, save).catch((e) => { console.error(e); ui.toast('No se pudo guardar el dibujo.', { tone: 'error' }); }) });
    const nextBtn = ui.button({ label: done >= total ? 'Ver resultado' : 'Siguiente turno', iconName: 'arrow-right', variant: 'primary', onClick: () => { if (done >= total) ctx.finish({ extra: el('p', {}, el('a', { href: '#/juegos/dibujos' }, 'Ver los dibujos guardados')) }); else { s.next(); turn(); } } });
    ctx.mount(K.scoreboard(s), el('div', { class: 'stack center-col game-between' }, el('p', {}, guessed ? '¡Adivinado! ' : 'Se acabó el tiempo. Era: ', el('strong', {}, word)), p ? p.node : null, el('div', { class: 'btn-row center-row' }, p && !p.empty() ? save : null, nextBtn)));
    if (p) p.node.querySelector('.draw-tools')?.remove();
  };
  const turn = () => {
    if (stopped) return;
    const drawer = s.turn();
    ctx.mount(K.scoreboard(s), el('div', { class: 'game-handoff stack center-col' },
      el('h2', { class: 'game-step-title', tabindex: '-1' }, `Dibuja ${profile.name(drawer)}`),
      el('p', { class: 'muted' }, `${profile.name(profile.partnerOf(drawer))}, no mires mientras ve su palabra.`),
      ui.button({ label: 'Ver mi palabra', iconName: 'eye', variant: 'primary', onClick: async () => {
        let item = await K.draw('dibujo', words);
        const face = el('strong', { class: 'act-word' }, item.text);
        const start = ui.button({ label: 'Empezar a dibujar', iconName: 'brush', variant: 'primary', onClick: () => {
          pad = drawPad();
          t = K.timer({ seconds: 60, onEnd: () => endTurn(false, item.text) });
          ctx.mount(K.scoreboard(s), el('div', { class: 'stack center-col' }, el('div', { class: 'draw-head' }, t.node, ui.button({ label: '¡Adivinó!', iconName: 'check', variant: 'primary', onClick: () => { s.add(drawer, 1); endTurn(true, item.text); } })), pad.node));
          t.start();
        } });
        const pass = K.passButton(s, async () => { item = await K.draw('dibujo', words); face.textContent = item.text; });
        ctx.mount(K.scoreboard(s), el('div', { class: 'stack center-col' }, K.secret(face), el('div', { class: 'btn-row center-row' }, start, pass)));
      } })));
  };
  turn();
  const cleanup = () => { stopped = true; t?.stop(); pad?.stop(); };
  cleanup.end = () => { cleanup(); ctx.finish(); };
  return cleanup;
}

// ---------- Memoria de nosotros ----------
const FALLBACK_ART = ['jp-sakura', 'jp-torii', 'jp-chochin', 'jp-sensu', 'jp-tsuru', 'jp-omamori', 'jp-moon', 'jp-wave', 'jp-futo', 'heart', 'star', 'music'];

/** Up to n photo blobs from the Cápsula (and Mapa), nothing private. */
async function photoPool(n) {
  const recs = [...(await db.query('memories').catch(() => [])), ...(await db.query('places').catch(() => []))].filter(pub);
  const ids = K.shuffle(recs.flatMap((r) => r.mediaIds || []));
  const out = [];
  for (const id of ids) {
    if (out.length >= n) break;
    const b = await db.getMedia(id).catch(() => null);
    if (b && /^image\//.test(b.type || '')) out.push({ id, url: URL.createObjectURL(b) });
  }
  return out;
}

async function memoria(ctx) {
  const { s } = ctx;
  const pairs = turnsFor(ctx.opts.mins, { 5: 6, 15: 8, 30: 10 });
  const photos = await photoPool(pairs);
  const faces = [...photos.map((p) => ({ key: p.id, url: p.url })), ...FALLBACK_ART.slice(0, pairs - photos.length).map((a) => ({ key: a, art: a }))];
  const deck = K.shuffle([...faces, ...faces].map((f, i) => ({ ...f, uid: i })));
  const t0 = Date.now(); let moves = 0; let open = []; let locked = false; let found = 0;
  const info = el('p', { class: 'muted small game-progress', 'aria-live': 'polite' });
  const paintInfo = () => { info.textContent = `Turno de ${profile.name(s.turn())} · ${moves} ${moves === 1 ? 'jugada' : 'jugadas'} · ${found} de ${pairs} pares`; };
  const grid = el('div', { class: `memo-grid memo-${deck.length}` });
  const cards = deck.map((c, i) => {
    const front = c.url ? el('img', { src: c.url, alt: '' }) : icon(c.art, { size: 36 });
    const b = el('button', { class: 'memo-card', type: 'button', 'aria-label': `Carta ${i + 1}, boca abajo` },
      el('span', { class: 'memo-inner' }, el('span', { class: 'memo-face memo-back', 'aria-hidden': 'true' }, icon('jp-sakura', { size: 30 })), el('span', { class: 'memo-face memo-front' }, front)));
    b.addEventListener('click', () => flip(i));
    return b;
  });
  add(grid, ...cards);
  const flip = async (i) => {
    const b = cards[i];
    if (locked || b.classList.contains('is-up')) return;
    b.classList.add('is-up'); b.setAttribute('aria-label', `Carta ${i + 1}: ${deck[i].url ? 'foto' : 'dibujo'} ${deck[i].key.length > 12 ? '' : deck[i].key.replace('jp-', '')}`.trim()); util.haptic(5);
    open.push(i);
    if (open.length < 2) return;
    moves++; locked = true;
    const [a, c] = open; open = [];
    if (deck[a].key === deck[c].key) {
      found++; s.add(s.turn(), 1); cards[a].classList.add('is-matched'); cards[c].classList.add('is-matched'); K.ding(); ui.announce('¡Pareja!');
      locked = false; paintInfo();
      if (found === pairs) { const secs = Math.round((Date.now() - t0) / 1000); ctx.finish({ lines: [`${moves} jugadas en ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}.`], record: { moves, seconds: secs, pairs } }); }
      return;
    }
    await util.sleep(util.prefersReducedMotion() ? 500 : 900);
    for (const k of [a, c]) { cards[k].classList.remove('is-up'); cards[k].setAttribute('aria-label', `Carta ${k + 1}, boca abajo`); }
    s.next(); locked = false; paintInfo();
  };
  paintInfo();
  ctx.mount(K.scoreboard(s), info, photos.length < pairs ? el('p', { class: 'muted small' }, photos.length ? 'Con más fotos en la Cápsula salen más pares suyos.' : 'Agreguen fotos en la Cápsula y las cartas serán sus recuerdos.') : null, grid);
  const cleanup = () => photos.forEach((p) => URL.revokeObjectURL(p.url));
  cleanup.end = () => { ctx.finish({ lines: [`${found} de ${pairs} pares.`], record: { moves, pairs } }); };
  return cleanup;
}

// ---------- Trivia de nosotros ----------
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const dayStr = (v) => (typeof v === 'string' ? v.slice(0, 10) : v?.y && v?.m && v?.d ? `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}` : '');
const shiftDay = (day, days) => { const d = util.parseDay(day); d.setDate(d.getDate() + days); return util.localDay(d); };
const monthName = (day) => fmtMonth.format(util.parseDay(day));

/** Options: the answer plus distinct distractors, shuffled. */
function opts(answer, distractors, rnd) {
  const set = [answer]; for (const d of distractors) if (d && !set.includes(d) && set.length < 4) set.push(d);
  return K.shuffle(set, rnd);
}

/**
 * Questions from their own (non-private) data. data: { start, people:{id:name}, birthdays:[{who,date}],
 * places:[{name,date}], songs:[{title,by}], memories:[{title,date}], firsts:[{title,date}], pets:[{name,arrival}] }.
 */
export function buildTrivia(data, rnd = Math.random) {
  const q = [];
  const names = Object.values(data.people || {});
  const dateQ = (text, day) => q.push({ q: text, answer: util.formatDay(day), options: opts(util.formatDay(day), [-31, 7, -7, 365, 30].map((n) => util.formatDay(shiftDay(day, n))), rnd) });
  if (data.start && util.isValidDay(data.start)) {
    dateQ('¿Qué día empezó lo nuestro?', data.start);
    const days = util.daysBetween(util.parseDay(data.start), new Date());
    if (days > 20) {
      const round = (n) => (n < 100 ? n : Math.round(n / 10) * 10);
      const a = `${round(days).toLocaleString('es-CO')} días`;
      q.push({ q: '¿Más o menos cuántos días llevan juntos?', answer: a, options: opts(a, [0.5, 0.75, 1.3, 1.6].map((f) => `${round(Math.round(days * f)).toLocaleString('es-CO')} días`), rnd) });
    }
  }
  for (const b of data.birthdays || []) if (util.isValidDay(b.date)) {
    const md = (d) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(util.parseDay(d));
    q.push({ q: `¿Cuándo cumple años ${b.who}?`, answer: md(b.date), options: opts(md(b.date), [-31, 14, -14, 61].map((n) => md(shiftDay(b.date, n))), rnd) });
  }
  const dated = (list) => list.filter((x) => util.isValidDay(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const places = dated(data.places || []);
  if (places.length >= 2) {
    const pick = K.shuffle(places, rnd).slice(0, 4).sort((a, b) => a.date.localeCompare(b.date));
    q.push({ q: '¿A cuál de estos lugares fueron primero?', answer: pick[0].name, options: K.shuffle(pick.map((p) => p.name), rnd) });
  }
  for (const p of places.slice(0, 3)) q.push({ q: `¿En qué mes fueron a ${p.name}?`, answer: monthName(p.date), options: opts(monthName(p.date), [-31, 31, -62, 62].map((n) => monthName(shiftDay(p.date, n))), rnd) });
  for (const s of (data.songs || []).slice(0, 4)) if (s.by && data.people?.[s.by] && names.length === 2) q.push({ q: `¿Quién dedicó «${s.title}»?`, answer: data.people[s.by], options: names.slice() });
  for (const m of dated(data.memories || []).slice(-6)) q.push({ q: `¿Cuándo fue «${m.title}»?`, answer: monthName(m.date), options: opts(monthName(m.date), [-31, 31, -92, 92].map((n) => monthName(shiftDay(m.date, n))), rnd) });
  const firsts = dated(data.firsts || []);
  if (firsts.length >= 2) {
    const [a, b] = K.shuffle(firsts, rnd).slice(0, 2).sort((x, y) => x.date.localeCompare(y.date));
    q.push({ q: '¿Qué pasó primero?', answer: a.title, options: K.shuffle([a.title, b.title], rnd) });
  }
  for (const p of data.pets || []) if (util.isValidDay(p.arrival)) dateQ(`¿Qué día llegó ${p.name} a casa?`, p.arrival);
  return K.shuffle(q.filter((x) => x.options.length >= 2 && x.options.includes(x.answer)), rnd);
}

async function triviaData() {
  const q = (s) => db.query(s).catch(() => []);
  const [dates, places, songs, memories, firsts, pets] = await Promise.all(['specialDates', 'places', 'songs', 'memories', 'firsts', 'pets'].map(q));
  const people = Object.fromEntries(profile.PEOPLE.map((p) => [p, profile.name(p)]));
  const clean = (t) => t && !/por completar|\[/i.test(t);
  return {
    start: profile.startDay(), people,
    birthdays: dates.filter((d) => pub(d) && d.kind === 'birthday' && profile.PEOPLE.includes(d.personOrPetId)).map((d) => ({ who: people[d.personOrPetId], date: dayStr(d.date) })),
    places: places.filter((p) => pub(p) && clean(p.name)).map((p) => ({ name: p.name, date: p.date })),
    songs: songs.filter((x) => pub(x) && clean(x.title)).map((x) => ({ title: x.title, by: x.by })),
    memories: memories.filter((m) => pub(m) && clean(m.title)).map((m) => ({ title: m.title, date: dayStr(m.date) })),
    firsts: firsts.filter((f) => pub(f) && !f.skipped && clean(f.title)).map((f) => ({ title: f.title, date: f.date })),
    pets: pets.filter((p) => pub(p) && !p.memorial && p.name).map((p) => ({ name: p.name, arrival: dayStr(p.arrival) })),
  };
}

async function trivia(ctx) {
  const { s } = ctx;
  const all = buildTrivia(await triviaData());
  const n = Math.min(all.length, turnsFor(ctx.opts.mins, { 5: 6, 15: 12, 30: 20 }));
  if (n < 2) {
    ctx.mount(ui.emptyState({ title: 'Faltan datos para la trivia', text: 'Llenen Fechas especiales, la Cápsula, el Mapa, Canciones o Primeras veces y vuelvan.', art: 'crane' }));
    const c = () => {}; c.end = () => { location.hash = '#/juegos'; }; return c;
  }
  let i = 0;
  const box = el('div', { class: 'stack center-col' });
  const progress = el('p', { class: 'muted small game-progress' });
  const ask = () => {
    if (i >= n) { ctx.finish({ lines: [`${n} preguntas sobre ustedes.`] }); return; }
    const item = all[i];
    progress.textContent = `Pregunta ${i + 1} de ${n} · responde ${profile.name(s.turn())}`;
    const nextBtn = ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: () => { i++; s.next(); if (i % 2 === 0) s.round(); ask(); } });
    nextBtn.hidden = true;
    const choices = el('div', { class: 'trivia-options' }, item.options.map((o) => el('button', { class: 'btn btn-secondary trivia-opt', type: 'button', onClick: (e) => {
      const right = o === item.answer;
      choices.querySelectorAll('button').forEach((b) => { b.disabled = true; if (b.textContent === item.answer) b.classList.add('is-right'); });
      if (!right) e.currentTarget.classList.add('is-wrong');
      if (right) { s.add(s.turn(), 1); K.ding(); }
      ui.announce(right ? '¡Correcto!' : `No. Era: ${item.answer}`);
      pass.hidden = true; nextBtn.hidden = false; nextBtn.focus();
    } }, o)));
    const pass = K.passButton(s, () => { i++; s.next(); ask(); });
    put(box, el('h2', { class: 'trivia-q', tabindex: '-1' }, item.q), choices, el('div', { class: 'btn-row center-row' }, pass, nextBtn));
  };
  ctx.mount(K.scoreboard(s), progress, box);
  ask();
  const cleanup = () => {};
  cleanup.end = () => ctx.finish({ lines: [`${i} de ${n} preguntas.`] });
  return cleanup;
}

// ---------- Liga de pareja ----------
export function ligaStats(recs, today = util.localDay()) {
  const list = recs.filter((r) => r.gameId === 'liga' && !r.deleted).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.endedAt || '').localeCompare(b.endedAt || ''));
  const zero = () => Object.fromEntries(profile.PEOPLE.map((p) => [p, 0]));
  const wins = zero(); const month = zero(); const byType = {};
  for (const r of list) {
    if (!r.winner) continue;
    wins[r.winner]++;
    if ((r.date || '').slice(0, 7) === today.slice(0, 7)) month[r.winner]++;
    (byType[r.ligaType] ||= zero())[r.winner]++;
  }
  let streak = { who: null, n: 0 };
  for (const r of list) { if (!r.winner) { streak = { who: null, n: 0 }; continue; } streak = streak.who === r.winner ? { who: r.winner, n: streak.n + 1 } : { who: r.winner, n: 1 }; }
  return { total: list.length, wins, month, crown: K.winnerOf(month), byType, streak };
}

async function liga(ctx) {
  const types = (await K.bankItems('liga')).map((t) => t.text);
  const box = el('div', { class: 'stack' });
  const form = (preset = '') => {
    const sel = el('select', { class: 'input', id: 'liga-type' }, [...types, 'Otro'].map((t) => el('option', { value: t, selected: t === preset }, t)));
    const other = ui.input({ maxlength: '40', placeholder: 'Nombre del juego' });
    const otherF = ui.field({ label: 'Cuál', control: other }); otherF.hidden = !(preset && !types.includes(preset));
    if (otherF.hidden === false) { sel.value = 'Otro'; other.value = preset; }
    sel.addEventListener('change', () => { otherF.hidden = sel.value !== 'Otro'; });
    let winner = profile.active();
    const date = ui.input({ type: 'date', value: util.localDay(), max: util.localDay() });
    const note = ui.input({ maxlength: '80', placeholder: 'Opcional, ej.: 3 a 2' });
    ui.openModal({
      title: 'Anotar una partida', kind: 'sheet',
      body: el('div', { class: 'stack' }, el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'liga-type' }, 'Juego'), sel), otherF,
        ui.field({ label: 'Ganó', control: ui.segmented({ label: 'Ganó', value: winner, options: [...profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), { value: 'empate', label: 'Empate' }], onChange: (v) => { winner = v; } }) }),
        ui.field({ label: 'Fecha', control: date }), ui.field({ label: 'Nota', control: note })),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Anotar', variant: 'primary', onClick: async () => {
        const type = sel.value === 'Otro' ? other.value.trim() : sel.value;
        if (!type) { otherF.setError('Escribe el nombre del juego.'); return false; }
        if (!util.isValidDay(date.value)) return false;
        await db.put('games', { id: util.uuid(), gameId: 'liga', ligaType: type, winner: winner === 'empate' ? null : winner, date: date.value, note: note.value.trim(), endedAt: util.nowISO(), players: [...profile.PEOPLE], visibility: 'shared', owner: 'both', by: profile.active() });
        import('./insignias.js').then((m) => m.evaluate?.()).catch(() => {});
        if (winner !== 'empate') ui.confetti({ count: 24 });
        ui.toast(winner === 'empate' ? 'Empate anotado.' : `¡Punto para ${profile.name(winner)}!`, { tone: 'success' });
        load(); return true;
      } }],
    });
  };
  const load = async () => {
    const recs = (await db.query('games').catch(() => [])).filter((r) => r.gameId === 'liga');
    const st = ligaStats(recs);
    const [a, b] = profile.PEOPLE;
    const trophies = Object.entries(st.byType).map(([type, w]) => [type, K.winnerOf(w), w]).filter(([, who]) => who);
    put(box, 
      el('section', { class: 'card liga-board' },
        ...profile.PEOPLE.map((p) => el('div', { class: `liga-side${st.crown === p ? ' has-crown' : ''}` },
          st.crown === p ? el('span', { class: 'liga-crown', 'aria-label': 'Ganador del mes' }, icon('crown', { size: 26 })) : null,
          el('span', { class: 'score-avatar', 'aria-hidden': 'true' }, profile.name(p).slice(0, 1)),
          el('strong', { class: 'liga-wins' }, String(st.wins[p])), el('span', { class: 'muted small' }, `${profile.name(p)} · ${st.month[p]} este mes`))),
        el('p', { class: 'liga-meta muted small' }, st.total ? [`${st.total} ${st.total === 1 ? 'partida' : 'partidas'}`, st.streak.n >= 2 ? `racha de ${profile.name(st.streak.who)}: ${st.streak.n} seguidas` : ''].filter(Boolean).join(' · ') : 'Anoten sus juegos reales: cartas, parqués, videojuegos…')),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Anotar una partida', iconName: 'plus', variant: 'primary', onClick: () => form() })),
      trophies.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Trofeos por juego'),
        el('ul', { class: 'trophy-list' }, trophies.map(([type, who, w]) => el('li', { class: 'trophy' }, icon('trophy', { size: 20 }), el('span', {}, el('strong', {}, type), ` · ${profile.name(who)} (${w[a]} a ${w[b]})`))))) : null,
      recs.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Últimas partidas'),
        el('ul', { class: 'card pet-list' }, recs.sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.endedAt || '').localeCompare(x.endedAt || '')).slice(0, 30).map((r) => el('li', { class: 'pet-row' },
          icon(r.winner ? 'medal' : 'heart-handshake', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, r.ligaType), el('p', { class: 'muted small' }, [r.winner ? `Ganó ${profile.name(r.winner)}` : 'Empate', r.note, util.formatDay(r.date)].filter(Boolean).join(' · '))),
          ui.button({ label: 'Revancha', iconName: 'swords', variant: 'ghost', small: true, onClick: () => form(r.ligaType) }),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Borrar ${r.ligaType}`, onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta partida?', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('games', r.id); load(); } } }, icon('trash-2', { size: 18 })))))) : null);
  };
  ctx.mount(box);
  await load();
  const off = db.onChange((store) => { if (store === 'games' && !document.querySelector('.overlay')) load().catch(() => {}); });
  return off;
}

// ---------- Modo juntos ----------
export const juntosMinutes = (recs) => recs.filter((r) => r.gameId === 'juntos' && !r.deleted).reduce((n, r) => n + (Number(r.minutes) || 0), 0);

async function juntos(ctx) {
  let mins = 30; let endAt = 0; let startAt = 0; let raf = 0; let stopped = false;
  const total = juntosMinutes(await db.query('games').catch(() => []));
  const finish = async (early) => {
    cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis);
    const minutes = Math.max(1, Math.round((Math.min(Date.now(), endAt) - startAt) / 60000));
    endAt = 0;
    await db.put('games', { id: util.uuid(), gameId: 'juntos', minutes, planned: mins, early: !!early, startedAt: util.toLocalISO(new Date(startAt)), endedAt: util.nowISO(), players: [...profile.PEOPLE], visibility: 'shared', owner: 'both', by: profile.active() });
    import('./insignias.js').then((m) => m.evaluate?.()).catch(() => {});
    util.chime?.(); ui.confetti({ count: 24 });
    ctx.mount(el('div', { class: 'game-result stack center-col' }, el('div', { class: 'result-crown', 'aria-hidden': 'true' }, icon('leaf', { size: 44 })),
      el('h2', { class: 'result-title' }, `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} juntos de verdad`),
      el('p', { class: 'muted' }, `En total llevan ${total + minutes} minutos sin teléfonos.`),
      el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Otra vez', iconName: 'rotate-cw', onClick: setup }), ui.button({ label: 'Volver a la sala', iconName: 'arrow-left', href: '#/juegos' }))));
  };
  const onVis = () => { if (document.visibilityState === 'visible' && endAt && Date.now() >= endAt) finish(false); };
  const calm = () => {
    startAt = Date.now(); endAt = startAt + mins * 60000;
    const left = el('p', { class: 'calm-left', 'aria-live': 'off' });
    const paint = () => {
      if (stopped || !endAt) return;
      const ms = endAt - Date.now();
      if (ms <= 0) { finish(false); return; }
      const m = Math.ceil(ms / 60000);
      left.textContent = m > 1 ? `Quedan ${m} minutos` : 'Queda menos de un minuto';
      raf = requestAnimationFrame(() => setTimeout(paint, 1000));
    };
    document.addEventListener('visibilitychange', onVis);
    ctx.mount(el('div', { class: 'calm stack center-col' },
      el('div', { class: 'calm-breath', 'aria-hidden': 'true' }, el('span'), el('span')),
      el('h2', { class: 'calm-title', tabindex: '-1' }, 'Teléfonos boca abajo'),
      el('p', { class: 'muted' }, 'Disfruten el momento. La app los espera aquí.'), left,
      ui.button({ label: 'Terminar antes', variant: 'ghost', onClick: () => finish(true) })));
    paint();
  };
  const setup = () => {
    ctx.mount(el('div', { class: 'stack' },
      el('section', { class: 'card stack center-col juntos-intro' }, el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('leaf', { size: 44 })),
        el('p', { class: 'game-intro-blurb' }, 'Para una cena, un paseo o una conversación: dejan los teléfonos boca abajo y la app cuenta el tiempo juntos.'),
        el('p', { class: 'juntos-total' }, el('strong', {}, String(total)), ' minutos juntos de verdad'),
        ui.field({ label: 'Cuánto tiempo', control: ui.segmented({ label: 'Cuánto tiempo', value: String(mins), options: [15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` })), onChange: (v) => { mins = Number(v); } }) }),
        ui.button({ label: 'Empezar', iconName: 'play', variant: 'primary', onClick: calm }))));
  };
  setup();
  return () => { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
}

const GAMES = { ruleta, dibujo, memoria, trivia, liga, juntos };
export const play = (ctx) => GAMES[ctx.game.id](ctx);
