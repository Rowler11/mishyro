// Preguntas (docs/05 §3, Detalles: Preguntas). Three tabs: Hoy, Historial y Quiz.
// Synced between the two phones (Fase A), so each person answers on their own phone; the other
// answer stays face down until you write yours, then both turn over at once.
// Data (docs/08): questionsDaily holds one record per question of a day ("q:bank:<day>" from the
// bank, "q:asker:<day>" written by the asker) and one record per answer ("a:<question>:<person>"),
// so two answers written at the same time on two phones never overwrite each other.
// questionsState "bank" keeps the shuffle seed. Quiz (decided 2026-11-20): each person builds
// their own "¿Cuánto me conoces?" from templates (content kind "quizItem") and the other plays it.
import { ui, util, db, profile, seed, CONFIG } from '../core.js';
import * as time from '../core/time.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const TAB_KEY = `${CONFIG.storageKey}.preguntas.tab`;
const TABS = ['hoy', 'historial', 'quiz'];
const readTab = () => { try { const v = localStorage.getItem(TAB_KEY); return TABS.includes(v) ? v : 'hoy'; } catch { return 'hoy'; } };
const saveTab = (v) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } };
const ASKER = CONFIG.askerSettings?.asker || 'sofia';
const MAX_ASK = CONFIG.askerSettings?.maxChars || 200;
const MAX_ANSWER = 1000;
const dayOf = (d) => util.parseDay(d) || new Date();
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CATEGORY = { recuerdos: 'Recuerdos', suenos: 'Sueños', 'sueños': 'Sueños', gustos: 'Gustos', miedos: 'Miedos', japon: 'Japón y viajes', 'japón': 'Japón y viajes', vida: 'Vida diaria', futuro: 'Futuro' };

// ---------- data ----------
export const answerId = (qid, who) => `a:${qid}:${who}`;

async function bankItems() {
  const [content, pets, goals] = await Promise.all([
    db.query('content', { index: 'kind', range: IDBKeyRange.only('question') }), db.query('pets'), db.query('savingsGoals')]);
  const has = { pets: pets.some((p) => !p.deleted), savings: goals.some((g) => !g.deleted) };
  return content.filter((q) => !q.deleted && !q.hidden && !seed.needsCompletion(q.text) && (!q.requires || has[q.requires]));
}

async function bankState() {
  let st = await db.get('questionsState', 'bank');
  if (!st) { st = { id: 'bank', seed: util.uuid() }; await db.put('questionsState', st); }
  return st;
}

/** All questions and answers, as { questions: [...], answers: Map(qid -> { sofia, david }) }. */
export async function loadAll() {
  const all = await db.query('questionsDaily');
  const questions = all.filter((r) => r.kind === 'bank' || r.kind === 'asker');
  const answers = new Map();
  for (const a of all.filter((r) => r.kind === 'answer' && r.text)) {
    const slot = answers.get(a.qref) || {};
    slot[a.by] = a; answers.set(a.qref, slot);
  }
  return { questions, answers };
}

/** Today's bank question: the one already stored (maybe by the other phone) or the next of the shuffle. */
export async function ensureToday(data) {
  const today = util.localDay();
  const id = `q:bank:${today}`;
  const existing = data.questions.find((q) => q.id === id);
  if (existing) return { question: existing, restarted: false };
  const items = await bankItems();
  if (!items.length) return { question: null, restarted: false };
  const st = await bankState();
  const past = data.questions.filter((q) => q.kind === 'bank' && q.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const round = past.length ? Math.max(...past.map((q) => q.round || 0)) : 0;
  const pick = time.nextFromBank(items.map((q) => q.id), {
    seed: st.seed, round, used: past.filter((q) => (q.round || 0) === round).map((q) => q.questionId), lastShown: past.map((q) => q.questionId), keepOut: 30,
  });
  const q = items.find((x) => x.id === pick.id);
  const rec = { id, kind: 'bank', date: today, questionId: q.id, text: q.text, category: q.category || '', round: pick.round };
  await db.put('questionsDaily', rec, { userEdit: false });
  data.questions.push(rec);
  return { question: rec, restarted: pick.restarted && past.length > 0 };
}

const textOf = (q) => profile.fill(q.text, profile.active());
const answered = (data, q, who) => !!data.answers.get(q.id)?.[who]?.text;
export const bothAnswered = (data, q) => answered(data, q, 'sofia') && answered(data, q, 'david');

/** For Inicio: does the active person still have to answer something today? */
export async function pendingToday() {
  const data = await loadAll();
  const { question } = await ensureToday(data);
  const me = profile.active();
  const asker = data.questions.find((q) => q.id === `q:asker:${util.localDay()}`);
  const open = [question, asker].filter((q) => q && !answered(data, q, me));
  const partnerDone = open.some((q) => answered(data, q, profile.partnerOf(me)));
  return { count: open.length, partnerDone, first: open[0] ? textOf(open[0]) : '' };
}

async function saveAnswer(q, text) {
  const me = profile.active();
  const prev = await db.get('questionsDaily', answerId(q.id, me));
  await db.put('questionsDaily', { ...(prev || {}), id: answerId(q.id, me), kind: 'answer', qref: q.id, date: q.date, by: me, text, at: prev?.at || util.nowISO(), editedAt: prev ? util.nowISO() : null });
}

// Words that say nothing about a match.
const STOP = new Set('para pero como cuando donde porque sobre entre desde hasta tambien todo toda todos todas este esta esto estos estas tengo tiene tienes hacer hago creo seria sería algo nada mucho mucha muy mas más menos siempre nunca cosa cosas solo sólo bien tanto otra otro otros nuestra nuestro mismo misma'.split(' '));
const fold = (w) => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
/** Meaningful words of a text: folded form -> the word as written. */
const words = (s) => new Map((String(s || '').match(/\p{L}{4,}/gu) || []).map((w) => [fold(w), w.toLowerCase()]).filter(([f]) => !STOP.has(f)));
/** "Coincidencia": the two answers share at least one meaningful word (shown as the other one wrote it). */
export function matchWords(a, b) { const A = words(a); return [...words(b)].filter(([f]) => A.has(f)).map(([, w]) => w); }

/** Days in a row (ending today, or yesterday if today is still open) where every question was answered by both. */
export function streak(data, today = util.localDay()) {
  const byDay = new Map();
  for (const q of data.questions) { const l = byDay.get(q.date) || []; l.push(q); byDay.set(q.date, l); }
  const full = (day) => (byDay.get(day) || []).length > 0 && byDay.get(day).every((q) => bothAnswered(data, q));
  let d = dayOf(today); let n = 0;
  if (!full(today)) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  while (full(util.localDay(d))) { n++; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); }
  return n;
}

// ---------- pieces ----------
function statusPill(data, q) {
  const n = ['sofia', 'david'].filter((w) => answered(data, q, w)).length;
  const [cls, text] = n === 2 ? ['badge-ok', 'Respondida por los dos'] : n === 1 ? ['', 'Respondida por uno'] : ['', 'Pendiente'];
  return el('span', { class: `badge ${cls}` }, text);
}

/** One face of the answer pair. Face down when its author answered and you have not yet. */
function answerFace(who, a, { reveal, mine, onEdit, flip }) {
  const name = profile.name(who);
  if (!a?.text) {
    return el('div', { class: 'qa-face is-empty' }, el('span', { class: 'qa-who' }, name),
      el('p', { class: 'muted small' }, mine ? 'Todavía no respondes.' : `${name} todavía no responde.`));
  }
  if (!reveal) {
    return el('div', { class: 'qa-face is-down', 'aria-label': `${name} ya respondió. Responde para ver su respuesta.` },
      el('span', { class: 'qa-back', 'aria-hidden': 'true' }, ui.hanko({ text: (name[0] || '?').toUpperCase(), size: 44 })),
      el('p', { class: 'small' }, `${name} ya respondió. Responde para verla.`));
  }
  return el('div', { class: `qa-face is-up${flip ? ' is-flip' : ''}` },
    el('span', { class: 'qa-who' }, mine ? `${name} (tú)` : name),
    el('p', { class: 'qa-text' }, a.text),
    el('span', { class: 'qa-at muted small' }, a.editedAt ? 'Editada' : ''),
    mine ? el('button', { class: 'btn btn-ghost btn-small qa-edit', type: 'button', onClick: onEdit }, icon('pencil', { size: 16 }), el('span', {}, 'Editar')) : null);
}

function answerSheet(q, current, onSaved) {
  const box = ui.textarea({ maxlength: MAX_ANSWER, rows: 5, autofocus: true });
  box.value = current || '';
  const f = ui.field({ label: 'Tu respuesta', control: box, hint: 'Se guarda con la fecha y la hora. Puedes editarla después.' });
  return ui.openModal({
    title: current ? 'Editar tu respuesta' : 'Tu respuesta', kind: 'sheet',
    body: el('div', { class: 'stack' }, el('p', { class: 'qa-question small' }, textOf(q)), f),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const t = box.value.trim();
      if (!t) { f.setError('Escribe algo antes de guardar.'); box.focus(); return false; }
      await saveAnswer(q, t); onSaved(); return true;
    } }],
  });
}

/** A question with both answers: the inline form when you have not answered, the pair once you have. */
function questionBlock(data, q, { kicker, redraw, flipNow, extra }) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const ans = data.answers.get(q.id) || {};
  const mineDone = !!ans[me]?.text;
  const both = mineDone && !!ans[partner]?.text;
  const matched = both ? matchWords(ans[me].text, ans[partner].text) : [];
  const head = el('div', { class: 'qa-head' },
    el('span', { class: 'card-kicker' }, kicker),
    q.category ? el('span', { class: 'badge' }, CATEGORY[q.category] || capital(q.category)) : null,
    statusPill(data, q));
  let form = null;
  if (!mineDone) {
    const box = ui.textarea({ maxlength: MAX_ANSWER, rows: 3, placeholder: 'Escribe tu respuesta…' });
    const f = ui.field({ label: `Tu respuesta, ${profile.name(me)}`, control: box });
    form = el('form', { class: 'qa-form', novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      const t = box.value.trim();
      if (!t) { f.setError('Escribe algo antes de guardar.'); box.focus(); return; }
      try { await saveAnswer(q, t); util.haptic(12); redraw({ flip: q.id }); } catch (err) { console.error(err); f.setError('No se pudo guardar. Inténtalo de nuevo.'); }
    } }, f, el('div', { class: 'btn-row' }, ui.button({ label: 'Guardar respuesta', variant: 'primary', type: 'submit', iconName: 'check' })));
  }
  const edit = () => answerSheet(q, ans[me]?.text, () => redraw());
  const pair = el('div', { class: 'qa-pair' },
    answerFace(me, ans[me], { reveal: true, mine: true, onEdit: edit, flip: flipNow === q.id }),
    answerFace(partner, ans[partner], { reveal: mineDone, mine: false, flip: flipNow === q.id }));
  const seal = both ? el('div', { class: `qa-seal${flipNow === q.id ? ' is-new' : ''}` }, ui.hanko({ text: '♥', size: 46, stamp: flipNow === q.id, label: 'Respondida por los dos' }),
    matched.length ? el('span', { class: 'qa-match' }, icon('sparkles', { size: 16 }), `Coincidencia: ${matched.slice(0, 3).join(', ')}`) : el('span', { class: 'muted small' }, 'Respondida por los dos')) : null;
  return el('article', { class: 'card paper-card qa-card', dataset: { q: q.id } },
    head, el('p', { class: 'qa-question' }, textOf(q)), extra || null, form, pair, seal);
}

// ---------- Hoy ----------
async function todayView(data, { redraw, flipNow }) {
  const me = profile.active();
  const { question, restarted } = await ensureToday(data);
  const today = util.localDay();
  const asker = data.questions.find((q) => q.id === `q:asker:${today}`);
  const askerName = profile.name(ASKER);
  const out = [el('p', { class: 'muted small pq-date' }, capital(fmtDay.format(new Date())))];
  if (restarted) out.push(el('p', { class: 'card note-card small' }, 'Ya vieron todas las preguntas del banco. Empezamos otra vuelta, sin las 30 más recientes.'));
  out.push(question ? questionBlock(data, question, { kicker: 'Para conocernos', redraw, flipNow })
    : el('div', { class: 'card paper-card' }, el('p', { class: 'muted' }, 'No hay preguntas en el banco. Agrégalas en Ajustes > Perfil y datos.')));

  // The asker's own question for the other one.
  if (asker) {
    const partnerAnswered = answered(data, asker, profile.partnerOf(ASKER));
    const extra = me === ASKER ? el('div', { class: 'btn-row' },
      !partnerAnswered ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => askSheet(asker, redraw) }, icon('pencil', { size: 16 }), el('span', {}, 'Editar pregunta')) : null,
      ui.shareButton({ text: `Pregunta del día: ${asker.text}` }, { label: 'Enviar', variant: 'ghost' })) : null;
    out.push(questionBlock(data, asker, { kicker: `Pregunta de ${askerName}`, redraw, flipNow, extra }));
  } else if (me === ASKER) {
    out.push(el('article', { class: 'card paper-card qa-card qa-invite' },
      el('span', { class: 'card-kicker' }, 'Tu pregunta de hoy'),
      el('p', {}, `Escríbele a ${profile.name(profile.partnerOf(me))} una pregunta tuya. Puedes editarla hasta que te responda.`),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Escribir mi pregunta', iconName: 'pencil', variant: 'primary', onClick: () => askSheet(null, redraw) }))));
  } else {
    out.push(el('p', { class: 'muted small qa-wait' }, icon('pencil', { size: 16 }), `${askerName} todavía no escribe su pregunta de hoy.`));
  }
  return out;
}

function askSheet(existing, redraw) {
  const box = ui.textarea({ maxlength: MAX_ASK, rows: 3, autofocus: true, placeholder: '¿Qué te gustaría saber hoy?' });
  box.value = existing?.text || '';
  const counter = el('span', { class: 'muted small' }, `${box.value.length}/${MAX_ASK}`);
  box.addEventListener('input', () => { counter.textContent = `${box.value.length}/${MAX_ASK}`; });
  const f = ui.field({ label: `Pregunta para ${profile.name(profile.partnerOf(ASKER))}`, control: box });
  ui.openModal({
    title: existing ? 'Editar tu pregunta' : 'Tu pregunta de hoy', kind: 'sheet',
    body: el('div', { class: 'stack' }, f, counter),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const t = box.value.trim();
      if (!t) { f.setError('Escribe la pregunta.'); box.focus(); return false; }
      const today = util.localDay();
      await db.put('questionsDaily', { ...(existing || {}), id: `q:asker:${today}`, kind: 'asker', date: today, text: t, askedBy: ASKER, category: '' });
      ui.toast('Pregunta guardada. Le llega en su app.', { tone: 'success' });
      redraw(); return true;
    } }],
  });
}

// ---------- Historial ----------
const FILTERS = [
  { id: 'all', label: 'Todas' }, { id: 'bank', label: 'Para conocernos' }, { id: 'asker', label: `De ${profile.name(ASKER) || 'ella'}` },
  { id: 'open', label: 'Sin responder' }, { id: 'fav', label: 'Favoritas' },
];
function historyView(data, { state, redraw }) {
  const me = profile.active();
  const total = data.questions.filter((q) => answered(data, q, me)).length;
  const run = streak(data);
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const search = el('input', { class: 'input search-input', type: 'search', placeholder: 'Buscar en preguntas y respuestas', 'aria-label': 'Buscar en preguntas y respuestas', value: state.q || '' });
  const list = el('div', { class: 'pq-history' });
  const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtrar' }, FILTERS.map((f) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(state.filter === f.id),
    onClick: () => { state.filter = f.id; chips.querySelectorAll('.chip').forEach((c, i) => c.setAttribute('aria-pressed', String(FILTERS[i].id === f.id))); paint(); },
  }, f.label)));
  const toggleFav = async (q) => {
    const favBy = { ...(q.favBy || {}) };
    if (favBy[me]) delete favBy[me]; else favBy[me] = true;
    await db.put('questionsDaily', { ...q, favBy }, { userEdit: false });
    q.favBy = favBy; paint();
  };
  const remove = async (q) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar esta pregunta?', message: 'Se borra con sus respuestas.', confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    await db.purge('questionsDaily', q.id);
    for (const who of ['sofia', 'david']) await db.purge('questionsDaily', answerId(q.id, who)).catch(() => {});
    redraw();
  };
  function paint() {
    const needle = fold(state.q);
    const rows = data.questions.filter((q) => {
      if (state.filter === 'bank' && q.kind !== 'bank') return false;
      if (state.filter === 'asker' && q.kind !== 'asker') return false;
      if (state.filter === 'open' && bothAnswered(data, q)) return false;
      if (state.filter === 'fav' && !q.favBy?.[me]) return false;
      if (!needle) return true;
      const ans = data.answers.get(q.id) || {};
      const hay = [textOf(q), ans[me]?.text, answered(data, q, me) ? ans[profile.partnerOf(me)]?.text : ''].map(fold).join(' ');
      return hay.includes(needle);
    }).sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind));
    if (!rows.length) {
      list.replaceChildren(ui.emptyState({ title: data.questions.length ? 'Nada por aquí' : 'Todavía no hay historial', text: data.questions.length ? 'Prueba con otro filtro o busca otra palabra.' : 'Cada día queda aquí la pregunta con sus respuestas.', art: 'fan' }));
      return;
    }
    const groups = new Map();
    for (const q of rows) { const k = q.date.slice(0, 7); groups.set(k, [...(groups.get(k) || []), q]); }
    list.replaceChildren(...[...groups].map(([k, qs]) => el('section', { class: 'pq-month' },
      el('h2', { class: 'tl-month' }, capital(fmtMonth.format(dayOf(`${k}-01`)))),
      el('ul', { class: 'pq-list' }, qs.map((q) => {
        const ans = data.answers.get(q.id) || {};
        const mineDone = answered(data, q, me);
        const fav = !!q.favBy?.[me];
        return el('li', { class: 'card paper-card pq-item' },
          el('div', { class: 'qa-head' },
            el('span', { class: 'muted small' }, capital(fmtDay.format(dayOf(q.date)))),
            el('span', { class: 'badge' }, q.kind === 'asker' ? `De ${profile.name(q.askedBy || ASKER)}` : (CATEGORY[q.category] || 'Para conocernos')),
            el('button', { class: 'icon-btn icon-btn-small pq-fav', type: 'button', 'aria-pressed': String(fav), 'aria-label': fav ? 'Quitar de favoritas' : 'Marcar como favorita', onClick: () => toggleFav(q) }, icon('star', { size: 18 }))),
          el('p', { class: 'qa-question small' }, textOf(q)),
          el('dl', { class: 'pq-answers' }, ['sofia', 'david'].map((who) => [
            el('dt', {}, profile.name(who)),
            el('dd', {}, !ans[who]?.text ? el('span', { class: 'muted' }, 'Sin responder')
              : who === me || mineDone ? ans[who].text : el('span', { class: 'muted' }, 'Respondió. Responde para verla.')),
          ])),
          el('div', { class: 'btn-row' },
            el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => answerSheet(q, ans[me]?.text, redraw) }, icon('pencil', { size: 16 }), el('span', {}, mineDone ? 'Editar mi respuesta' : 'Responder')),
            q.kind === 'asker' && q.askedBy === me ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => remove(q) }, icon('trash-2', { size: 16 }), el('span', {}, 'Borrar')) : null));
      })))));
  }
  search.addEventListener('input', util.debounce(() => { state.q = search.value; paint(); }, 150));
  paint();
  return [
    el('div', { class: 'pq-stats' },
      el('div', { class: 'card paper-card pq-stat' }, el('span', { class: 'pq-stat-num' }, String(run)), el('span', { class: 'muted small' }, run === 1 ? 'día seguido respondiendo los dos' : 'días seguidos respondiendo los dos')),
      el('div', { class: 'card paper-card pq-stat' }, el('span', { class: 'pq-stat-num' }, String(total)), el('span', { class: 'muted small' }, total === 1 ? 'pregunta respondida por ti' : 'preguntas respondidas por ti'))),
    el('div', { class: 'search-box' }, icon('search', { size: 20, cls: 'search-icon' }), search),
    chips, list,
  ];
}

// ---------- Quiz ----------
async function quizData() {
  const [items, templates, results] = await Promise.all([
    db.query('content', { index: 'kind', range: IDBKeyRange.only('quizItem') }),
    db.query('content', { index: 'kind', range: IDBKeyRange.only('quiz') }),
    db.query('quizResults'),
  ]);
  return { items: items.filter((i) => !i.deleted), templates: templates.filter((t) => !t.deleted && !t.hidden), results };
}

function quizEditor(existing, templates, onSaved) {
  const me = profile.active();
  const used = new Set();
  const pick = el('select', { class: 'input' },
    el('option', { value: '' }, 'Escribir mi propia pregunta'),
    templates.map((t) => el('option', { value: t.id, selected: existing?.templateId === t.id }, t.text)));
  const q = ui.input({ maxlength: 140, value: existing?.question || '', placeholder: '¿Cuál es mi…?' });
  pick.addEventListener('change', () => { const t = templates.find((x) => x.id === pick.value); if (t) q.value = t.text; });
  const name = `qz-${util.uuid().slice(0, 6)}`;
  const opts = [0, 1, 2, 3].map((i) => {
    const inp = ui.input({ maxlength: 80, value: existing?.options?.[i] || '', 'aria-label': `Opción ${i + 1}` });
    const radio = el('input', { type: 'radio', name, value: String(i), class: 'qz-radio', checked: (existing?.correct ?? 0) === i, 'aria-label': `La opción ${i + 1} es la correcta` });
    return { inp, radio, row: el('div', { class: 'qz-opt' }, radio, inp) };
  });
  void used;
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  ui.openModal({
    title: existing ? 'Editar pregunta' : 'Nueva pregunta de tu quiz', kind: 'sheet',
    body: el('div', { class: 'stack' },
      ui.field({ label: 'Plantilla', control: pick, hint: 'Elige una o escribe la tuya.' }),
      ui.field({ label: 'Pregunta', control: q }),
      el('fieldset', { class: 'qz-fieldset' }, el('legend', { class: 'field-label' }, 'Opciones (marca la correcta)'), opts.map((o) => o.row)),
      el('p', { class: 'muted small' }, `${profile.name(profile.partnerOf(me))} juega tu quiz y ve si acierta. La respuesta correcta no se le muestra antes.`), err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const options = opts.map((o) => o.inp.value.trim());
      const correct = opts.findIndex((o) => o.radio.checked);
      if (!q.value.trim()) { err.textContent = 'Escribe la pregunta.'; return false; }
      if (options.some((o) => !o)) { err.textContent = 'Llena las 4 opciones.'; return false; }
      if (new Set(options.map((o) => o.toLowerCase())).size < 4) { err.textContent = 'Las opciones deben ser distintas.'; return false; }
      await db.put('content', { ...(existing || {}), kind: 'quizItem', by: me, templateId: pick.value || null, question: q.value.trim(), options, correct: Math.max(0, correct) });
      onSaved(); return true;
    } }],
  });
}

const resultText = (score, total) => (CONFIG.quizMessages || []).find((m) => score / total >= m.min)?.text || '';

function play(items, author, onDone) {
  const me = profile.active();
  const order = [...items].sort(() => Math.random() - 0.5);
  let i = 0; let score = 0;
  const body = el('div', { class: 'qz-play' });
  const m = ui.openModal({ title: `El quiz de ${profile.name(author)}`, kind: 'sheet', size: 'lg', body });
  const step = () => {
    if (i >= order.length) {
      const total = order.length;
      body.replaceChildren(el('div', { class: 'qz-end center stack' },
        ui.hanko({ text: `${score}`, size: 72, stamp: true, label: `${score} de ${total}` }),
        el('p', { class: 'qz-score' }, `${score} de ${total}`),
        el('p', {}, resultText(score, total)),
        ui.button({ label: 'Listo', variant: 'primary', onClick: () => m.close() })));
      db.put('quizResults', { quiz: author, by: me, score, total, at: util.nowISO() }).then(onDone);
      if (score === total) ui.confetti();
      return;
    }
    const it = order[i];
    const shuffled = it.options.map((t, idx) => ({ t, idx })).sort(() => Math.random() - 0.5);
    const feedback = el('p', { class: 'qz-feedback', role: 'status' });
    const next = ui.button({ label: i === order.length - 1 ? 'Ver resultado' : 'Siguiente', variant: 'primary', onClick: () => { i++; step(); } });
    next.hidden = true;
    const buttons = shuffled.map((o) => el('button', { class: 'btn btn-secondary qz-choice', type: 'button', onClick: () => {
      const right = o.idx === it.correct;
      if (right) score++;
      buttons.forEach((b, k) => { b.disabled = true; if (shuffled[k].idx === it.correct) b.classList.add('is-right'); });
      if (!right) buttons[shuffled.indexOf(o)].classList.add('is-wrong');
      feedback.textContent = right ? '¡Acertaste!' : `Casi. Era: ${it.options[it.correct]}.`;
      util.haptic(right ? 15 : [20, 30, 20]);
      next.hidden = false; next.focus();
    } }, o.t));
    body.replaceChildren(
      el('p', { class: 'muted small' }, `Pregunta ${i + 1} de ${order.length}`),
      el('p', { class: 'qa-question' }, it.question),
      el('div', { class: 'qz-choices' }, buttons), feedback, el('div', { class: 'btn-row' }, next));
  };
  step();
}

async function quizView({ redraw }) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const { items, templates, results } = await quizData();
  const mine = items.filter((i) => i.by === me);
  const theirs = items.filter((i) => i.by === partner);
  const best = results.filter((r) => r.by === me && r.quiz === partner).sort((a, b) => b.score / b.total - a.score / a.total)[0];
  const theirBest = results.filter((r) => r.by === partner && r.quiz === me).sort((a, b) => b.score / b.total - a.score / a.total)[0];
  const remove = async (it) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar esta pregunta?', message: it.question, confirmLabel: 'Borrar', danger: true }))) return;
    await db.purge('content', it.id); redraw();
  };
  return [
    el('section', { class: 'card paper-card stack' },
      el('span', { class: 'card-kicker' }, `¿Cuánto conoces a ${profile.name(partner)}?`),
      theirs.length
        ? [el('p', {}, `${profile.name(partner)} armó ${theirs.length === 1 ? 'una pregunta' : `${theirs.length} preguntas`} sobre sí.`),
          best ? el('p', { class: 'muted small' }, `Tu mejor puntaje: ${best.score} de ${best.total}.`) : null,
          el('div', { class: 'btn-row' }, ui.button({ label: 'Jugar', iconName: 'play', variant: 'primary', onClick: () => play(theirs, partner, redraw) }))]
        : el('p', { class: 'muted' }, `${profile.name(partner)} todavía no arma su quiz. Cuando lo haga, aparece aquí.`)),
    el('section', { class: 'card paper-card stack' },
      el('span', { class: 'card-kicker' }, 'Tu quiz'),
      el('p', { class: 'muted small' }, `Preguntas sobre ti para que ${profile.name(partner)} adivine.${theirBest ? ` Su mejor puntaje: ${theirBest.score} de ${theirBest.total}.` : ''}`),
      mine.length ? el('ul', { class: 'qz-list' }, mine.map((it) => el('li', { class: 'qz-row' },
        el('span', { class: 'qz-row-text' }, el('span', {}, it.question), el('span', { class: 'muted small' }, `Correcta: ${it.options[it.correct]}`)),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar: ${it.question}`, onClick: () => quizEditor(it, templates, redraw) }, icon('pencil', { size: 18 })),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar: ${it.question}`, onClick: () => remove(it) }, icon('trash-2', { size: 18 }))))) : null,
      el('div', { class: 'btn-row' }, ui.button({ label: mine.length ? 'Agregar pregunta' : 'Armar mi quiz', iconName: 'plus', variant: mine.length ? 'secondary' : 'primary', onClick: () => quizEditor(null, templates, redraw) }))),
  ];
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page preguntas' });
  page.append(ui.pageHeader({ title: 'Preguntas', jp: 'クイズ', romaji: 'kuizu', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = readTab();
  const hist = { filter: 'all', q: '' };
  const draw = async ({ flip = null } = {}) => {
    const tabs = ui.segmented({ label: 'Preguntas', value: tab, options: [{ value: 'hoy', label: 'Hoy' }, { value: 'historial', label: 'Historial' }, { value: 'quiz', label: 'Quiz' }], onChange: (v) => { tab = v; saveTab(v); draw(); } });
    tabs.classList.add('cupones-tabs', 'section-tabs');
    let content;
    try {
      const data = await loadAll();
      if (tab === 'hoy') content = await todayView(data, { redraw: draw, flipNow: flip });
      else if (tab === 'historial') content = historyView(data, { state: hist, redraw: draw });
      else content = await quizView({ redraw: draw });
    } catch (e) {
      console.error(e);
      content = [ui.emptyState({ title: 'No pudimos abrir las preguntas', text: 'Cierra y vuelve a abrir la app; sus datos siguen guardados.', art: 'wave' })];
    }
    body.replaceChildren(tabs, ...[content].flat(2).filter(Boolean));
    if (flip) { ui.announce('Las dos respuestas están a la vista.'); }
  };
  await draw();
  const off = profile.onProfileChange(() => draw());
  return { node: page, cleanup: off };
}
