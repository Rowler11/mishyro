// Sugerencias de citas (docs/05 Más §14, bank in docs/14 = CONFIG.dateIdeas). Views:
// - Sorpresa: a gashapon capsule hands one idea at random with one tap, with quick filters.
// - Con filtros: mood, budget, time, place and weather (picked by hand); 3 options and "Otra".
// - Pendientes: accepted ideas (schedule in the Calendario, mark as done, rate, "¿La repetirían?")
//   and surprise dates (the other only sees the date and the hints already released).
// - Historial: dates done with rating and simple stats. - Mis ideas: their own ideas.
// No repeats: the draw skips done, rejected and already-seen ideas until the deck runs out.
// Couple rhythm (CONFIG.dateSettings.weeklyRhythm): Mon-Thu favor instant ideas, weekends outings.
// ¿Quién decide?: fair turns (default) or random, with a kind balance per topic and a history.
import { ui, util, db, profile, security, CONFIG } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const TAB_KEY = 'aishiteru.citas.tab';
const S = CONFIG.dateSettings || {};
export const MOODS = [['romantico', 'Romántico'], ['tranquilos', 'Tranquilos'], ['risas', 'Risas'], ['aventura', 'Aventura']];
export const BUDGETS = [['gratis', 'Gratis'], ['bajo', 'Bajo'], ['medio', 'Medio'], ['especial', 'Especial']];
export const DURATIONS = [['1h', '1 hora'], ['tarde', 'Una tarde'], ['dia', 'Día completo'], ['finde', 'Fin de semana']];
export const PLACES = [['casa', 'En casa'], ['afuera', 'Afuera'], ['bogota', 'Bogotá'], ['cerca', 'Cerca de Bogotá'], ['colombia', 'Colombia']];
export const CLIMATES = [['sol', 'Hace sol'], ['lluvia', 'Llueve']];
const label = (list, v) => list.find(([k]) => k === v)?.[1] || v;
export const TOPICS = ['El lugar', 'La comida', 'La película', 'A qué jugar', 'La música', 'La hora'];

export function budgetText(b) {
  const B = S.budgets || { gratis: 0, bajo: 60000, medio: 250000 };
  const one = (k) => (k === 'gratis' ? 'Gratis' : k === 'bajo' ? `Hasta ${util.formatCOP(B.bajo)}` : k === 'medio' ? `${util.formatCOP(B.bajo)} a ${util.formatCOP(B.medio)}` : `Más de ${util.formatCOP(B.medio)}`);
  return [].concat(b || []).map(one).join(' o ');
}

/** Does an idea pass the filters? f: { mood, budget, duration, place, climate } (empty = any). */
export function matches(idea, f = {}) {
  if (f.mood && idea.mood !== f.mood) return false;
  if (f.budget && ![].concat(idea.budget).includes(f.budget)) return false;
  if (f.duration && idea.duration !== f.duration) return false;
  if (f.place && idea.place !== f.place) return false;
  if (f.climate === 'lluvia' && !['cualquiera', 'lluvia', 'interior'].includes(idea.climate)) return false;
  if (f.climate === 'sol' && !['cualquiera', 'sol'].includes(idea.climate)) return false;
  return true;
}

/** Ideas that can be drawn now: not hidden, not rejected, not resting, not pending, not seen this round. */
export function eligible(ideas, states, seen, today = util.localDay()) {
  return ideas.filter((i) => {
    const s = states.get(i.id);
    if (seen.has(i.id)) return false;
    if (!s) return true;
    if (s.status === 'accepted' || s.repeat === 'no') return false;
    if (s.status === 'done' && s.repeat !== 'yes' && s.repeat !== 'maybe') return false;
    if (s.restUntil && s.restUntil > today) return false;
    return true;
  });
}

/** Rhythm weight: Mon-Thu favor instant ideas, Sat/Sun favor outings (ordering only). */
export function rhythmScore(idea, weekday = new Date().getDay()) {
  const R = S.weeklyRhythm || {};
  if ((R.instantDays || []).includes(weekday)) return (idea.duration === '1h' ? 2 : 0) + (idea.place === 'casa' ? 1 : 0) + ([].concat(idea.budget).some((b) => b === 'gratis' || b === 'bajo') ? 1 : 0);
  if ((R.outingDays || []).includes(weekday)) return (['bogota', 'cerca', 'afuera'].includes(idea.place) ? 2 : 0) + (idea.day === 'domingo' && weekday === 0 ? 2 : 0) + (['tarde', 'dia'].includes(idea.duration) ? 1 : 0);
  return ['tarde', 'dia'].includes(idea.duration) ? 1 : 0;
}

/** Draw n ideas from the pool: weighted by rhythm, "maybe" ones last. */
export function draw(pool, states, n = 1, rnd = Math.random) {
  const weighted = pool.map((i) => ({ i, w: rhythmScore(i) + rnd() * 2.5 - (states.get(i.id)?.repeat === 'maybe' ? 3 : 0) }));
  return weighted.sort((a, b) => b.w - a.w).slice(0, n).map((x) => x.i);
}

/** Fair turns: who chose this topic fewer times in the last 60 days (ties: whoever chose longest ago). */
export function fairPick(topic, log, people, now = Date.now()) {
  const recent = log.filter((l) => l.topic === topic && now - new Date(l.at).getTime() < 60 * 86400000);
  const count = (p) => recent.filter((l) => l.who === p).length;
  const last = (p) => Math.max(0, ...recent.filter((l) => l.who === p).map((l) => new Date(l.at).getTime()));
  return [...people].sort((a, b) => count(a) - count(b) || last(a) - last(b))[0];
}

// ---------- data ----------
async function loadAll() {
  const [bank, own, st, deck, pets] = await Promise.all([
    db.query('content', { index: 'kind', range: IDBKeyRange.only('dateIdea') }), db.query('dateIdeas'), db.query('dateIdeasState'), db.get('dateDeck', 'deck').catch(() => null), db.query('pets')]);
  const hasPets = pets.some((p) => !p.deleted);
  const ideas = [...bank, ...own].filter((i) => !i.deleted && !i.hidden && (i.requires !== 'pets' || hasPets)).map((i) => ({ ...i, title: profile.fill(i.title), description: profile.fill(i.description || '') }));
  return { ideas, own: own.filter((i) => !i.deleted), states: new Map(st.map((s) => [s.id, s])), seen: new Set(deck?.seen || []) };
}
const markSeen = async (ids) => {
  const deck = (await db.get('dateDeck', 'deck').catch(() => null)) || { id: 'deck', seen: [], visibility: 'shared', owner: 'both' };
  await db.put('dateDeck', { ...deck, seen: [...new Set([...(deck.seen || []), ...ids])] });
};
const resetDeck = () => db.put('dateDeck', { id: 'deck', seen: [], visibility: 'shared', owner: 'both' });
const setState = async (id, patch) => {
  const prev = (await db.get('dateIdeasState', id).catch(() => null)) || { id, visibility: 'shared', owner: 'both' };
  await db.put('dateIdeasState', { ...prev, ...patch });
};

function ideaCard(idea, { actions = [], thirdParty = true } = {}) {
  const tags = [label(MOODS, idea.mood), label(DURATIONS, idea.duration), label(PLACES, idea.place), idea.zone && idea.zone !== 'Bogotá' ? idea.zone : null, idea.japan ? 'Inspirada en Japón' : null].filter(Boolean);
  return el('article', { class: 'card paper-card idea-card' },
    el('h3', { class: 'idea-title' }, idea.title),
    idea.description ? el('p', {}, idea.description) : null,
    el('ul', { class: 'idea-tags', 'aria-label': 'Etiquetas' }, tags.map((t) => el('li', { class: 'badge' }, t))),
    el('p', { class: 'small muted' }, icon('wallet', { size: 14 }), ` ${budgetText(idea.budget)}`),
    idea.verify ? el('p', { class: 'small idea-verify' }, icon('info', { size: 14 }), ' Verifica horario y precio antes de ir.') : null,
    thirdParty && idea.place !== 'casa' ? el('a', { class: 'small idea-maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${idea.title} ${idea.zone || 'Bogotá'}`)}`, target: '_blank', rel: 'noopener noreferrer' }, icon('map-pin', { size: 14 }), ' Buscar en Google Maps') : null,
    actions.length ? el('div', { class: 'card-actions' }, actions) : null);
}

// ---------- flows ----------
async function accept(idea, after) {
  await setState(idea.id, { status: 'accepted', acceptedAt: util.nowISO(), acceptedBy: profile.active(), title: idea.title });
  util.haptic(12);
  ui.toast('¡Aceptada! Está en Pendientes.', { tone: 'success', action: { label: 'Agendar', onClick: () => schedule(idea) } });
  after();
}
async function schedule(idea) {
  const cal = await import('./calendario.js');
  cal.editor(null, { day: util.localDay(), prefill: { title: idea.title, place: idea.zone || '' }, onSaved: () => {} });
}
function doneFlow(idea, state, after) {
  const date = ui.input({ type: 'date', value: util.localDay(), max: util.localDay() });
  let rating = state?.rating || 0; let repeat = 'yes'; let toMemory = false;
  const note = ui.textarea({ rows: 2, maxlength: 400, placeholder: 'Opcional' });
  const stars = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Calificación' });
  const paintStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', class: `star-btn${n <= rating ? ' on' : ''}`, role: 'radio', 'aria-checked': String(n === rating), 'aria-label': `${n} de 5`, onClick: () => { rating = n; paintStars(); } }, icon('star', { size: 26 }))));
  paintStars();
  const fDate = ui.field({ label: '¿Cuándo?', control: date });
  ui.openModal({
    title: '¿Qué tal estuvo?', kind: 'sheet', size: 'md',
    body: el('div', { class: 'stack' }, el('p', { class: 'ema-dialog-title' }, idea.title), fDate,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Calificación'), stars),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, '¿La repetirían?'), ui.segmented({ label: '¿La repetirían?', value: repeat, options: [{ value: 'yes', label: 'Sí' }, { value: 'maybe', label: 'Tal vez' }, { value: 'no', label: 'No' }], onChange: (v) => { repeat = v; } })),
      ui.field({ label: 'Nota', control: note }),
      ui.toggle({ label: 'Guardarla como recuerdo en la Cápsula', checked: false, onChange: (v) => { toMemory = v; } })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(date.value) || date.value > util.localDay()) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
      const rest = new Date(util.parseDay(date.value)); rest.setDate(rest.getDate() + (S.repeatRestDays || 60));
      const history = [...(state?.history || []), { doneAt: date.value, rating, note: note.value.trim() }];
      await setState(idea.id, { status: 'done', doneAt: date.value, rating, note: note.value.trim(), repeat, favorite: repeat === 'yes', restUntil: repeat === 'yes' ? util.localDay(rest) : '', history, title: idea.title, mood: idea.mood });
      if (toMemory) { const id = util.uuid(); await db.put('memories', { id, title: idea.title, date: date.value, note: note.value.trim(), mediaIds: [], visibility: 'shared', owner: 'both', by: profile.active() }); ui.toast('Guardada. Agrega fotos en la Cápsula.', { tone: 'success', action: { label: 'Abrir', onClick: () => { location.hash = `#/capsula/${id}`; } } }); }
      ui.confetti({ count: 24 }); after(); return true;
    } }],
  });
}

function ideaEditor(existing, after) {
  const i = existing || { id: util.uuid(), mood: 'romantico', budget: ['bajo'], duration: 'tarde', place: 'casa', climate: 'cualquiera', by: profile.active(), visibility: 'shared', owner: 'both' };
  const title = ui.input({ value: i.title || '', maxlength: 80 });
  const desc = ui.textarea({ rows: 2, maxlength: 300 }); desc.value = i.description || '';
  const zone = ui.input({ value: i.zone || '', maxlength: 60, placeholder: 'Opcional' });
  const v = { mood: i.mood, budget: [].concat(i.budget)[0], duration: i.duration, place: i.place };
  const seg = (lbl, key, list) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, lbl), ui.segmented({ label: lbl, value: v[key], options: list.map(([value, l]) => ({ value, label: l })), onChange: (x) => { v[key] = x; } }));
  const fTitle = ui.field({ label: 'Idea', control: title });
  ui.openModal({
    title: existing ? 'Editar idea' : 'Nueva idea', kind: 'sheet', size: 'md',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, fTitle, ui.field({ label: 'Descripción', control: desc }),
      seg('Ánimo', 'mood', MOODS), seg('Presupuesto', 'budget', BUDGETS), seg('Tiempo', 'duration', DURATIONS), seg('Lugar', 'place', PLACES), ui.field({ label: 'Zona o municipio', control: zone })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!title.value.trim()) { fTitle.setError('Escribe la idea.'); return false; }
      await db.put('dateIdeas', { ...i, title: title.value.trim(), description: desc.value.trim(), zone: zone.value.trim(), mood: v.mood, budget: [v.budget], duration: v.duration, place: v.place, verify: false, japan: false });
      after(); return true;
    } }],
  });
}

function surprisePlanner(ideas, after) {
  const me = profile.active();
  const date = ui.input({ type: 'date', min: util.localDay() });
  const sel = el('select', { class: 'input', 'aria-label': 'Idea' }, ideas.map((i) => el('option', { value: i.id }, i.title)));
  const custom = ui.input({ maxlength: 80, placeholder: 'O escribe tu propia idea' });
  const hints = [0, 1, 2].map(() => ui.input({ maxlength: 80, placeholder: 'Opcional' }));
  const fDate = ui.field({ label: 'Fecha de la cita', control: date });
  ui.openModal({
    title: 'Planear una cita sorpresa', kind: 'sheet', size: 'md',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
      el('p', { class: 'muted small' }, `${profile.name(profile.partnerOf(me))} solo verá la fecha y las pistas que se vayan liberando, una por día antes de la cita. La idea se queda en tus equipos hasta el día o hasta que la reveles.`),
      fDate, ui.field({ label: 'Idea', control: sel }), custom,
      ...hints.map((h, k) => ui.field({ label: `Pista ${k + 1}`, control: h }))),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(date.value) || date.value < util.localDay()) { fDate.setError('Elige hoy o un día que venga.'); return false; }
      const id = util.uuid();
      const ideaTitle = custom.value.trim() || ideas.find((i) => i.id === sel.value)?.title || 'Cita sorpresa';
      const list = hints.map((h) => h.value.trim()).filter(Boolean);
      const d0 = util.parseDay(date.value);
      const released = list.map((text, k) => { const r = new Date(d0); r.setDate(r.getDate() - (list.length - k)); return { text, from: util.localDay(r) }; });
      try {
        // Public part (both phones): date and hints with their release day. Private part: the idea.
        await db.put('surpriseDates', { id, date: date.value, by: me, hints: released, revealed: '', visibility: 'shared', owner: 'both' });
        await db.put('surpriseDates', { id: `idea:${id}`, surpriseId: id, idea: ideaTitle, visibility: 'self', private: true, owner: me });
      } catch (x) { console.error(x); ui.toast(x?.code === 'LOCKED' ? 'Desbloquea tu espacio personal para guardar la idea secreta.' : 'No se pudo guardar.', { tone: 'error' }); return false; }
      after(); return true;
    } }],
  });
}

function decider(log, after) {
  const people = ['sofia', 'david'];
  let mode = 'fair';
  const extra = ui.input({ maxlength: 40, placeholder: 'Otra cosa (opcional)' });
  const checks = TOPICS.map((t) => { const c = el('input', { type: 'checkbox', value: t }); return { t, c, row: el('label', { class: 'check-row' }, c, el('span', {}, t)) }; });
  const result = el('div', { class: 'decider-result', 'aria-live': 'polite' });
  const coin = el('div', { class: 'coin', 'aria-hidden': 'true' }, el('span', {}, '?'));
  const run = async () => {
    const topics = [...checks.filter((x) => x.c.checked).map((x) => x.t), extra.value.trim()].filter(Boolean);
    if (!topics.length) { result.textContent = 'Marca al menos una cosa.'; return; }
    coin.classList.remove('spin'); void coin.offsetWidth; coin.classList.add('spin');
    await util.sleep(util.prefersReducedMotion() ? 0 : 700);
    const picks = topics.map((t) => ({ topic: t, who: mode === 'fair' ? fairPick(t, log, people) : people[Math.floor(Math.random() * 2)] }));
    for (const p of picks) { const rec = { id: util.uuid(), topic: p.topic, who: p.who, at: util.nowISO(), mode, visibility: 'shared', owner: 'both' }; await db.put('deciderLog', rec); log.push(rec); }
    result.replaceChildren(el('p', { class: 'decider-line' }, picks.map((p) => `${profile.name(p.who)} elige ${p.topic.toLowerCase()}`).join(' · ')));
    util.haptic(12); after();
  };
  const month = util.localDay().slice(0, 7);
  const balance = TOPICS.map((t) => { const l = log.filter((x) => x.topic === t && x.at.startsWith(month)); return l.length ? `${t}: ${people.map((p) => `${profile.name(p)} ${l.filter((x) => x.who === p).length}`).join(' · ')}` : null; }).filter(Boolean);
  const manualWho = el('select', { class: 'input', 'aria-label': 'Quién eligió' }, people.map((p) => el('option', { value: p }, profile.name(p))));
  const manualTopic = el('select', { class: 'input', 'aria-label': 'Qué eligió' }, TOPICS.map((t) => el('option', { value: t }, t)));
  ui.openModal({
    title: '¿Quién decide?', kind: 'sheet', size: 'md',
    body: el('div', { class: 'stack' },
      ui.segmented({ label: 'Modo', value: mode, options: [{ value: 'fair', label: 'Por turnos justo' }, { value: 'random', label: 'Al azar' }], onChange: (v) => { mode = v; } }),
      el('p', { class: 'muted small' }, '"Por turnos justo" le da el turno a quien eligió menos veces esa cosa últimamente.'),
      el('div', { class: 'decider-topics' }, checks.map((x) => x.row)), extra,
      el('div', { class: 'decider-stage' }, coin, ui.button({ label: 'Sortear', iconName: 'dices', variant: 'primary', onClick: run })),
      result,
      balance.length ? el('div', {}, el('p', { class: 'card-kicker' }, 'Este mes'), el('ul', { class: 'small muted decider-balance' }, balance.map((b) => el('li', {}, b)))) : null,
      el('details', {}, el('summary', {}, 'Anotar algo que eligieron sin sortear'),
        el('div', { class: 'row-input' }, manualWho, manualTopic, ui.button({ label: 'Anotar', small: true, onClick: async () => { const rec = { id: util.uuid(), topic: manualTopic.value, who: manualWho.value, at: util.nowISO(), mode: 'manual', visibility: 'shared', owner: 'both' }; await db.put('deciderLog', rec); log.push(rec); ui.toast('Anotado.'); } })))),
    actions: [{ label: 'Listo', variant: 'ghost' }],
  });
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide citas' });
  let log = [];
  page.append(ui.pageHeader({ title: 'Sugerencias de citas', jp: 'デート', romaji: 'dēto', back: '/mas', actions: [ui.button({ label: '¿Quién decide?', iconName: 'dices', small: true, onClick: () => decider(log, () => {}) }), ui.button({ label: 'Modo cita', iconName: 'heart', small: true, href: '#/modo-cita' })] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = 'sorpresa';
  try { tab = localStorage.getItem(TAB_KEY) || 'sorpresa'; } catch { /* private mode */ }
  const f = { mood: '', budget: '', duration: '', place: '', climate: '' };
  let quick = ''; let shown = []; let gacha = null;
  const TABS = [['sorpresa', 'Sorpresa'], ['filtros', 'Con filtros'], ['pendientes', 'Pendientes'], ['historial', 'Historial'], ['mias', 'Mis ideas']];

  const draw_ = async () => {
    const data = await loadAll();
    log = (await db.query('deciderLog')).filter((l) => !l.deleted);
    const thirdParty = await security.thirdPartyAllowed();
    const tabs = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Vista' }, TABS.map(([v, l]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tab === v), onClick: () => { tab = v; try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } shown = []; gacha = null; draw_(); } }, l)));
    const acceptBtn = (i) => ui.button({ label: 'Aceptar', iconName: 'check', small: true, variant: 'primary', onClick: () => accept(i, draw_) });
    // "Ya lo hicimos hace poco": the idea rests 30 days without being marked as done (Rowler, 2026-11-22).
    const recentBtn = (i, onRest) => ui.button({ label: 'Ya lo hicimos hace poco', iconName: 'history', small: true, variant: 'ghost', onClick: async () => {
      const until = new Date(); until.setDate(until.getDate() + 30);
      await setState(i.id, { restUntil: util.localDay(until), title: i.title });
      ui.toast('Listo, vuelve a salir en un mes.'); onRest();
    } });
    const noBtn = (i, onNo) => ui.button({ label: 'No nos llama', small: true, variant: 'ghost', onClick: async () => { await setState(i.id, { repeat: 'no', title: i.title }); onNo(); } });
    const exhausted = (relax) => el('div', { class: 'card paper-card' }, el('p', {}, 'Ya vieron todas las ideas que cumplen con esto.'),
      el('div', { class: 'card-actions' }, ui.button({ label: 'Empezar el mazo de nuevo', iconName: 'rotate-ccw', small: true, onClick: async () => { await resetDeck(); draw_(); } }), relax ? ui.button({ label: 'Quitar filtros', small: true, variant: 'ghost', onClick: relax }) : null));
    let content = [];
    if (tab === 'sorpresa') {
      const quickF = { casa: { place: 'casa' }, hoy: { duration: '1h' }, gratis: { budget: 'gratis' } }[quick] || {};
      const pool = eligible(data.ideas.filter((i) => matches(i, quickF)), data.states, data.seen);
      const machine = el('div', { class: `gacha${gacha ? ' has-ball' : ''}`, 'aria-hidden': 'true' }, el('span', { class: 'gacha-dome' }), el('span', { class: 'gacha-body' }), el('span', { class: 'gacha-ball' }));
      const spin = async () => {
        if (!pool.length) { draw_(); return; }
        machine.classList.remove('turn'); void machine.offsetWidth; machine.classList.add('turn');
        await util.sleep(util.prefersReducedMotion() ? 0 : 900);
        gacha = draw(pool, data.states, 1)[0]; await markSeen([gacha.id]); util.haptic([8, 30, 8]); draw_();
      };
      content = [
        el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtro rápido' }, [['', 'Cualquiera'], ['casa', 'En casa'], ['hoy', 'Salir hoy (1 hora)'], ['gratis', 'Gratis']].map(([v, l]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(quick === v), onClick: () => { quick = v; gacha = null; draw_(); } }, l))),
        el('section', { class: 'card paper-card gacha-card' }, machine, pool.length || gacha ? ui.button({ label: gacha ? 'Otra cápsula' : 'Girar', iconName: 'dices', variant: 'primary', onClick: spin }) : null),
        gacha ? ideaCard(gacha, { thirdParty, actions: [acceptBtn(gacha), recentBtn(gacha, () => { gacha = null; draw_(); }), noBtn(gacha, () => { gacha = null; draw_(); })] }) : !pool.length ? exhausted(quick ? () => { quick = ''; draw_(); } : null) : null,
      ];
    } else if (tab === 'filtros') {
      const seg = (lbl, key, list) => el('div', { class: 'field' }, el('span', { class: 'field-label' }, lbl), el('div', { class: 'chip-row', role: 'group', 'aria-label': lbl },
        [['', 'Todo'], ...list].map(([v, l]) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(f[key] === v), onClick: () => { f[key] = v; shown = []; draw_(); } }, l))));
      const pool = eligible(data.ideas.filter((i) => matches(i, f)), data.states, data.seen);
      if (!shown.length && pool.length) { shown = draw(pool, data.states, S.filterOptions || 3); await markSeen(shown.map((i) => i.id)); }
      const swap = async (k) => { const rest = eligible(data.ideas.filter((i) => matches(i, f)), data.states, new Set([...data.seen, ...shown.map((i) => i.id)])); const n = draw(rest, data.states, 1)[0]; if (!n) { ui.toast('No quedan más con estos filtros.'); return; } shown[k] = n; await markSeen([n.id]); draw_(); };
      content = [
        el('details', { class: 'card paper-card filters', open: true }, el('summary', {}, 'Filtros'),
          seg('Ánimo', 'mood', MOODS), seg('Presupuesto', 'budget', BUDGETS), seg('Tiempo', 'duration', DURATIONS), seg('Lugar', 'place', PLACES), seg('Clima', 'climate', CLIMATES)),
        shown.length ? el('div', { class: 'idea-grid' }, shown.map((i, k) => ideaCard(i, { thirdParty, actions: [acceptBtn(i), ui.button({ label: 'Otra', iconName: 'refresh-cw', small: true, onClick: () => swap(k) }), recentBtn(i, () => swap(k))] }))) : exhausted(() => { Object.keys(f).forEach((k) => { f[k] = ''; }); draw_(); }),
      ];
    } else if (tab === 'pendientes') {
      const me = profile.active();
      const accepted = data.ideas.filter((i) => data.states.get(i.id)?.status === 'accepted');
      const surprises = (await db.query('surpriseDates')).filter((s) => !s.deleted);
      const pub = surprises.filter((s) => !s.surpriseId && s.date >= util.localDay()).sort((a, b) => a.date.localeCompare(b.date));
      const secret = new Map(surprises.filter((s) => s.surpriseId).map((s) => [s.surpriseId, s]));
      const sCard = (s) => {
        const mine = s.by === me; const today = util.localDay();
        const hints = (s.hints || []).filter((h) => mine || h.from <= today);
        const idea = mine ? secret.get(s.id)?.idea : (s.revealed || (s.date <= today ? 'Hoy se revela: pregúntale' : ''));
        return el('article', { class: 'card paper-card surprise' },
          el('p', { class: 'card-kicker' }, mine ? 'Tu cita sorpresa' : 'Tienes una cita sorpresa'),
          el('h3', {}, fmtDay.format(util.parseDay(s.date))),
          idea ? el('p', {}, mine ? `Idea: ${idea}` : idea) : null,
          hints.length ? el('ol', { class: 'surprise-hints' }, hints.map((h) => el('li', {}, h.text, mine && h.from > today ? el('span', { class: 'muted small' }, ` (se libera el ${fmtShort.format(util.parseDay(h.from))})`) : null))) : el('p', { class: 'muted small' }, 'Todavía no hay pistas.'),
          mine ? el('div', { class: 'card-actions' },
            !s.revealed ? ui.button({ label: 'Revelar ahora', small: true, onClick: async () => { await db.put('surpriseDates', { ...s, revealed: secret.get(s.id)?.idea || 'Cita sorpresa' }); draw_(); } }) : null,
            ui.button({ label: 'Borrar', iconName: 'trash-2', small: true, variant: 'ghost', onClick: async () => { if (!(await ui.confirmDialog({ title: '¿Borrar la cita sorpresa?', confirmLabel: 'Borrar', danger: true }))) return; await db.purge('surpriseDates', s.id); await db.purge('surpriseDates', `idea:${s.id}`).catch(() => {}); draw_(); } })) : null);
      };
      // On the day, the planner's phone reveals the idea to the other.
      for (const s of pub) if (s.by === me && !s.revealed && s.date <= util.localDay() && secret.get(s.id)) await db.put('surpriseDates', { ...s, revealed: secret.get(s.id).idea });
      content = [
        el('div', { class: 'card-actions' }, ui.button({ label: 'Planear una cita sorpresa', iconName: 'gift', small: true, onClick: () => surprisePlanner(data.ideas, draw_) })),
        ...pub.map(sCard),
        accepted.length ? el('div', { class: 'idea-grid' }, accepted.map((i) => ideaCard(i, { thirdParty, actions: [
          ui.button({ label: 'Agendar', iconName: 'calendar', small: true, onClick: () => schedule(i) }),
          ui.button({ label: 'Empezar', iconName: 'heart', small: true, href: `#/modo-cita?${new URLSearchParams({ titulo: i.title })}` }),
          ui.button({ label: 'La hicimos', iconName: 'check', small: true, variant: 'primary', onClick: () => doneFlow(i, data.states.get(i.id), draw_) }),
          ui.button({ label: 'Soltar', small: true, variant: 'ghost', onClick: async () => { await setState(i.id, { status: '' }); draw_(); } })] }))) : null,
        !accepted.length && !pub.length ? ui.emptyState({ title: 'Nada pendiente', text: 'Acepten una idea en Sorpresa o Con filtros y aparece aquí.', art: 'lantern' }) : null,
      ];
    } else if (tab === 'historial') {
      const done = [...data.states.values()].filter((s) => s.history?.length).flatMap((s) => s.history.map((h) => ({ ...h, title: s.title || data.ideas.find((i) => i.id === s.id)?.title || 'Cita', repeat: s.repeat, mood: s.mood }))).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
      const months = new Map(); done.forEach((d) => months.set(d.doneAt.slice(0, 7), (months.get(d.doneAt.slice(0, 7)) || 0) + 1));
      const moodCount = new Map(); done.forEach((d) => d.mood && moodCount.set(d.mood, (moodCount.get(d.mood) || 0) + 1));
      const favMood = [...moodCount].sort((a, b) => b[1] - a[1])[0]?.[0];
      content = done.length ? [
        el('div', { class: 'card paper-card first-progress' }, el('p', {}, el('strong', {}, String(done.length)), done.length === 1 ? ' cita hecha' : ' citas hechas', favMood ? ` · ánimo favorito: ${label(MOODS, favMood).toLowerCase()}` : '', ` · ${months.size} ${months.size === 1 ? 'mes' : 'meses'} con citas`)),
        el('ul', { class: 'date-history' }, done.map((d) => el('li', { class: 'card paper-card' },
          el('p', { class: 'idea-title' }, d.title), el('p', { class: 'small muted' }, `${fmtShort.format(util.parseDay(d.doneAt))} · ${'★'.repeat(d.rating || 0)}${'☆'.repeat(5 - (d.rating || 0))} · ${d.repeat === 'yes' ? 'La repetirían' : d.repeat === 'maybe' ? 'Tal vez' : 'Una vez basta'}`),
          d.note ? el('p', { class: 'small' }, d.note) : null))),
      ] : [ui.emptyState({ title: 'Su historial de citas', text: 'Cuando marquen una cita como hecha, queda aquí con su calificación.', art: 'lantern' })];
    } else {
      content = [
        el('div', { class: 'card-actions' }, ui.button({ label: 'Nueva idea', iconName: 'plus', small: true, variant: 'primary', onClick: () => ideaEditor(null, draw_) })),
        data.own.length ? el('div', { class: 'idea-grid' }, data.own.map((i) => ideaCard(i, { thirdParty, actions: [
          ui.button({ label: 'Editar', iconName: 'pencil', small: true, onClick: () => ideaEditor(i, draw_) }),
          ui.button({ label: i.hidden ? 'Mostrar' : 'Ocultar', iconName: i.hidden ? 'eye' : 'eye-off', small: true, variant: 'ghost', onClick: async () => { await db.put('dateIdeas', { ...i, hidden: !i.hidden }); draw_(); } }),
          i.place === 'colombia' ? ui.button({ label: 'A Sueños', iconName: 'moon-star', small: true, variant: 'ghost', onClick: async () => { await db.put('dreams', { id: util.uuid(), name: i.title, kind: 'trip', placeName: i.zone || '', priority: 2, checklist: [], status: 'open', note: i.description || '', visibility: 'shared', owner: 'both' }); ui.toast('Ahora está en Sueños y viajes.', { tone: 'success' }); } }) : null,
          ui.button({ label: 'Borrar', iconName: 'trash-2', small: true, variant: 'ghost', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta idea?', confirmLabel: 'Borrar', danger: true })) { await db.purge('dateIdeas', i.id); draw_(); } } })].filter(Boolean) }))) : ui.emptyState({ title: 'Sus propias ideas', text: 'Agreguen planes que se les ocurran; entran al sorteo con las demás.', art: 'lantern' }),
      ];
    }
    body.replaceChildren(tabs, ...content.flat().filter(Boolean));
  };
  try { await draw_(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las citas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = profile.onProfileChange(() => draw_());
  return { node: page, cleanup: off };
}

/** Inicio, Thursday and Friday: "Planeemos el finde" with 3 afternoon or full-day ideas. */
export async function weekendCard(now = new Date()) {
  if (!((S.weeklyRhythm?.planWeekendDays) || [4, 5]).includes(now.getDay())) return null;
  const data = await loadAll();
  const pool = eligible(data.ideas.filter((i) => ['tarde', 'dia'].includes(i.duration)), data.states, new Set());
  if (!pool.length) return null;
  const picks = draw(pool, data.states, 3);
  return el('section', { class: 'home-card weekend-card', 'aria-labelledby': 'weekend-title' },
    el('h2', { class: 'card-kicker', id: 'weekend-title' }, 'Planeemos el finde'),
    el('ul', { class: 'today-list' }, picks.map((i) => el('li', {}, el('a', { class: 'today-row', href: '#/citas' },
      el('span', { class: 'section-icon' }, icon('dices', { size: 20 })),
      el('span', { class: 'today-text' }, el('span', { class: 'today-title' }, i.title), el('span', { class: 'muted small' }, `${label(DURATIONS, i.duration)} · ${budgetText(i.budget)}`)),
      icon('chevron-right', { size: 18, cls: 'list-chevron' }))))));
}
