// Lenguajes del amor (docs/05 Más §27): each one answers the 10 forced-choice questions of
// CONFIG.loveLanguageQuestions on their own phone; the result of both shows as a 5-axis SVG chart,
// with concrete ideas for the other (CONFIG.loveLanguageIdeas) and a history of results.
// v0.30.0 (Rowler: "más completo y que sirva para entendernos"): each person's full order with bars,
// how the two fit together, an idea of the week for the other, "Mi manual" (three short answers about
// how love reaches me, that the other can read) and a guide to the five. A kind guide, not a diagnosis.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;
const SVG_NS = 'http://www.w3.org/2000/svg';
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
export const LANGS = ['palabras', 'tiempo', 'regalos', 'actos', 'contacto'];
const nameOf = (k) => CONFIG.loveLanguageNames?.[k] || k;

// General, original guide text (no personal data): what each one is, what fills it, what hurts it,
// and small things to do today.
export const GUIDE = {
  palabras: { icon: 'message-circle-heart', short: 'Palabras', what: 'Sentirse querido al escuchar o leer lo que el otro siente y admira.', fills: 'Un "estoy orgulloso de ti", una nota, un mensaje sin motivo, que lo digas delante de otros.', hurts: 'Las críticas duras, el silencio largo, los apodos que hieren.', today: ['Escríbele tres cosas que admiras.', 'Dile "gracias por…" con algo concreto.', 'Déjale una nota donde la encuentre.'] },
  tiempo: { icon: 'clock', short: 'Tiempo', what: 'Sentirse querido con atención completa: estar de verdad, sin prisa.', fills: 'Conversar sin teléfonos, un plan solo de los dos, que recuerdes lo que te contó.', hurts: 'Estar juntos pero distraídos, cancelar planes, escuchar a medias.', today: ['Diez minutos sin teléfono, solo hablando.', 'Pregúntale por su día y escucha hasta el final.', 'Propón un paseo corto, los dos solos.'] },
  regalos: { icon: 'gift', short: 'Detalles', what: 'Sentirse querido por un detalle que dice "pensé en ti". No importa el precio.', fills: 'Algo pequeño que le recordó a ti, una flor, su dulce favorito, un recuerdo guardado.', hurts: 'Olvidar fechas importantes, regalos sin pensar, despreciar un detalle.', today: ['Tráele su snack favorito sin avisar.', 'Guárdale algo pequeño que te recordó a él o ella.', 'Envuélvele algo sencillo con una nota.'] },
  actos: { icon: 'hand-heart', short: 'Actos', what: 'Sentirse querido cuando el otro ayuda y aliviana la carga.', fills: 'Que te encargues de algo pendiente, que cocines, que resuelvas sin que lo pida.', hurts: 'Promesas que no se cumplen, sentir que todo lo hace solo, la pereza ante lo que pidió.', today: ['Haz una tarea que le toca a él o ella.', 'Prepárale algo de comer o de tomar.', 'Pregúntale: "¿qué te quito de encima hoy?"'] },
  contacto: { icon: 'heart-handshake', short: 'Contacto', what: 'Sentirse querido con la cercanía física: abrazos, caricias, ir de la mano.', fills: 'Un abrazo largo, tomarse de la mano, recostarse juntos, un beso al llegar.', hurts: 'La frialdad, el rechazo de un abrazo, la distancia cuando hay tensión.', today: ['Un abrazo de veinte segundos al verse.', 'Tómale la mano al caminar.', 'Un masaje corto en los hombros.'] },
};
const MANUAL = [
  { id: 'loved', q: 'Me siento amado o amada cuando…', ph: 'Por ejemplo: me escribes a mitad del día' },
  { id: 'hurts', q: 'Me duele o me aleja cuando…', ph: 'Por ejemplo: estamos juntos y miras el teléfono' },
  { id: 'small', q: 'Un detalle pequeño que me encanta…', ph: 'Por ejemplo: que me prepares café' },
];

/** answers: { questionId: lang } -> { lang: count }. */
export function score(answers) {
  const s = Object.fromEntries(LANGS.map((k) => [k, 0]));
  for (const v of Object.values(answers || {})) if (v in s) s[v]++;
  return s;
}
export const top = (s) => LANGS.slice().sort((a, b) => s[b] - s[a])[0];
/** Languages from strongest to weakest (ties keep the guide's order). */
export const order = (s) => LANGS.slice().sort((a, b) => s[b] - s[a] || LANGS.indexOf(a) - LANGS.indexOf(b));
/** Share of each language, 0–100, adding up to about 100. */
export function shares(s) {
  const sum = LANGS.reduce((n, k) => n + (s[k] || 0), 0) || 1;
  return Object.fromEntries(LANGS.map((k) => [k, Math.round(((s[k] || 0) / sum) * 100)]));
}
/** How the two fit: same top language, the other's top in my top two, or different. */
export function fit(a, b) {
  const oa = order(a); const ob = order(b);
  if (oa[0] === ob[0]) return { kind: 'same', lang: oa[0] };
  if (oa.slice(0, 2).includes(ob[0]) && ob.slice(0, 2).includes(oa[0])) return { kind: 'close', mine: oa[0], theirs: ob[0] };
  return { kind: 'different', mine: oa[0], theirs: ob[0] };
}
/** The same idea all week, a new one on Monday. */
export function weekPick(list, date = new Date()) {
  if (!list.length) return null;
  const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return list[Math.floor(d.getTime() / 604800000) % list.length];
}

function radar(results) {
  const size = 280; const c = size / 2; const R = 100; const max = Math.max(4, ...results.flatMap((r) => LANGS.map((k) => r.score[k])));
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('class', 'radar'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', results.map((r) => `${r.name}: ${LANGS.map((k) => `${nameOf(k)} ${r.score[k]}`).join(', ')}`).join('. '));
  const ns = (tag, attrs) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  for (const f of [0.25, 0.5, 0.75, 1]) svg.append(ns('polygon', { points: LANGS.map((_, i) => pt(i, f).join(',')).join(' '), class: 'radar-grid' }));
  LANGS.forEach((k, i) => {
    svg.append(ns('line', { x1: c, y1: c, x2: pt(i, 1)[0], y2: pt(i, 1)[1], class: 'radar-grid' }));
    const [x, y] = pt(i, 1.22); const t = ns('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'radar-label' }); t.textContent = GUIDE[k].short; svg.append(t);
  });
  results.forEach((r, j) => svg.append(ns('polygon', { points: LANGS.map((k, i) => pt(i, r.score[k] / max).join(',')).join(' '), class: `radar-shape radar-${j}` })));
  return svg;
}

function bars(r, j) {
  const pc = shares(r.score);
  return el('div', { class: 'll-bars' },
    el('p', { class: 'll-bars-name' }, el('span', { class: `ll-dot radar-${j}`, 'aria-hidden': 'true' }), r.name),
    el('ol', { class: 'll-rank' }, order(r.score).map((k, i) => el('li', { class: `ll-row${i === 0 ? ' is-top' : ''}` },
      icon(GUIDE[k].icon, { size: 16 }),
      el('span', { class: 'll-row-name' }, nameOf(k)),
      el('span', { class: 'll-track', 'aria-hidden': 'true' }, el('span', { class: `ll-fill radar-${j}`, style: { width: `${Math.max(4, pc[k])}%` } })),
      el('span', { class: 'll-pc' }, `${pc[k]} %`)))));
}

function fitCard(meName, partnerName, mine, theirs) {
  const f = fit(mine.score, theirs.score);
  const low = order(theirs.score)[4];
  const lines = f.kind === 'same'
    ? [`Hablan el mismo idioma: a los dos les llega más el amor en ${nameOf(f.lang).toLowerCase()}.`, 'Ojo: cuando los dos necesitan lo mismo a la vez, túrnense para darlo primero.']
    : f.kind === 'close'
      ? [`Se parecen mucho: tú vibras con ${nameOf(f.mine).toLowerCase()} y ${partnerName} con ${nameOf(f.theirs).toLowerCase()}, y los dos lo tienen entre sus primeros.`, 'Tienen una base fácil: solo falta darle a cada uno su primero un poco más.']
      : [`Tú sientes el amor sobre todo en ${nameOf(f.mine).toLowerCase()}; ${partnerName}, en ${nameOf(f.theirs).toLowerCase()}.`, `Es normal dar amor en el idioma propio. Para que a ${partnerName} le llegue, practica el suyo, aunque no te salga natural.`];
  return el('section', { class: 'card paper-card ll-fit' },
    el('p', { class: 'card-kicker' }, 'Cómo se complementan'),
    ...lines.map((t) => el('p', {}, t)),
    el('p', { class: 'small muted' }, `A ${partnerName} le pesa menos: ${nameOf(low).toLowerCase()}. No hace falta forzarlo.`));
}

function ideasCard(partnerName, theirs) {
  const two = order(theirs.score).slice(0, 2);
  const ideas = (CONFIG.loveLanguageIdeas || []).filter((x) => two.includes(x.lang));
  if (!ideas.length) return null;
  let shown = weekPick(ideas);
  const idea = el('p', { class: 'll-week-text' }, shown.text);
  const tag = el('span', { class: 'chip ll-week-tag' }, nameOf(shown.lang));
  const other = ui.button({ label: 'Otra idea', iconName: 'refresh-cw', variant: 'ghost', small: true, onClick: () => {
    const rest = ideas.filter((x) => x !== shown); shown = rest[Math.floor(Math.random() * rest.length)] || shown;
    idea.textContent = shown.text; tag.textContent = nameOf(shown.lang); util.haptic?.(8);
  } });
  return el('section', { class: 'card paper-card ll-ideas-card' },
    el('p', { class: 'card-kicker' }, `Idea de la semana para ${partnerName}`),
    el('div', { class: 'll-week' }, icon('sparkles', { size: 22 }), el('div', {}, idea, tag)),
    el('div', { class: 'card-actions' }, other),
    el('details', { class: 'll-more' }, el('summary', {}, 'Todas las ideas'),
      el('ul', { class: 'll-ideas' }, ideas.map((x) => el('li', {}, x.text)))));
}

function manualCard(me, partner, manuals) {
  const mine = manuals.find((r) => r.by === me); const theirs = manuals.find((r) => r.by === partner);
  const answers = (r) => MANUAL.filter((m) => r?.answers?.[m.id]).map((m) => el('div', { class: 'll-man-item' }, el('p', { class: 'll-man-q' }, m.q), el('p', { class: 'll-man-a' }, r.answers[m.id])));
  const edit = () => {
    const fields = MANUAL.map((m) => ({ m, input: el('textarea', { class: 'input', rows: '2', maxlength: '220', placeholder: m.ph, 'aria-label': m.q }, mine?.answers?.[m.id] || '') }));
    ui.openModal({
      title: 'Mi manual del amor', kind: 'sheet', size: 'md',
      body: el('div', { class: 'stack' }, el('p', { class: 'muted small' }, `Respuestas cortas y concretas. ${profile.name(partner)} las verá aquí.`),
        ...fields.map(({ m, input }) => el('label', { class: 'field' }, el('span', { class: 'field-label' }, m.q), input))),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
        const a = Object.fromEntries(fields.map(({ m, input }) => [m.id, input.value.trim()]).filter(([, v]) => v));
        await db.put('loveLanguages', { ...(mine || {}), id: `manual:${me}`, kind: 'manual', by: me, at: util.nowISO(), answers: a, visibility: 'shared', owner: 'both' });
        ui.toast('Guardado. Ahora sabe un poquito más de ti.', { tone: 'success' }); return true;
      } }],
    });
  };
  return el('section', { class: 'card paper-card ll-manual' },
    el('p', { class: 'card-kicker' }, 'Manual del amor'),
    el('p', { class: 'small muted' }, 'Lo que de verdad le llega a cada uno, dicho con sus palabras.'),
    el('div', { class: 'll-man-grid' },
      el('div', { class: 'll-man-col' }, el('p', { class: 'll-man-who' }, profile.name(partner)), ...(answers(theirs).length ? answers(theirs) : [el('p', { class: 'small muted' }, 'Todavía no lo llena. Cuando lo haga, aparece aquí.')])),
      el('div', { class: 'll-man-col' }, el('p', { class: 'll-man-who' }, 'Tú'), ...answers(mine),
        ui.button({ label: mine ? 'Editar el mío' : 'Llenar el mío', iconName: 'pencil', variant: mine ? 'ghost' : 'secondary', small: true, onClick: edit }))));
}

function guideCard() {
  return el('section', { class: 'card paper-card ll-guide' },
    el('p', { class: 'card-kicker' }, 'Conoce los cinco'),
    ...LANGS.map((k) => el('details', { class: 'll-g' },
      el('summary', {}, icon(GUIDE[k].icon, { size: 18 }), el('span', {}, nameOf(k))),
      el('p', {}, GUIDE[k].what),
      el('p', { class: 'small' }, el('strong', {}, 'Le llena: '), GUIDE[k].fills),
      el('p', { class: 'small' }, el('strong', {}, 'Le duele: '), GUIDE[k].hurts),
      el('p', { class: 'small' }, el('strong', {}, 'Para hoy:')),
      el('ul', { class: 'll-ideas' }, GUIDE[k].today.map((t) => el('li', {}, t))))));
}

function quiz({ onDone }) {
  const qs = CONFIG.loveLanguageQuestions || [];
  const answers = {}; let i = 0;
  const box = el('div', { class: 'stack ll-quiz' });
  const m = ui.openModal({ title: 'Cuestionario', kind: 'sheet', size: 'md', body: box });
  const step = () => {
    const q = qs[i];
    box.replaceChildren(
      el('p', { class: 'muted small' }, `Pregunta ${i + 1} de ${qs.length}. Elige la que más se parezca a ti, aunque las dos te gusten.`),
      el('div', { class: 'progress' }, el('span', { class: 'progress-fill', style: { width: `${Math.round((i / qs.length) * 100)}%` } })),
      el('h3', { class: 'll-q' }, q.text),
      ...q.options.map((o) => el('button', { class: 'btn btn-secondary ll-opt', type: 'button', onClick: async () => {
        answers[q.id] = o.lang; i++;
        if (i < qs.length) { step(); box.querySelector('.ll-opt')?.focus(); return; }
        const s = score(answers);
        await db.put('loveLanguages', { id: util.uuid(), by: profile.active(), at: util.nowISO(), answers, score: s, top: top(s), visibility: 'shared', owner: 'both' });
        m.close(); onDone();
      } }, o.text)),
      i > 0 ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => { i--; step(); } }, 'Volver a la anterior') : null);
  };
  step();
  return m;
}

export async function render() {
  const page = el('section', { class: 'page page-wide lenguajes' });
  page.append(ui.pageHeader({ title: 'Lenguajes del amor', jp: '愛', romaji: 'ai', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const draw = async () => {
    const me = profile.active(); const partner = profile.partnerOf(me);
    const every = (await db.query('loveLanguages')).filter((r) => !r.deleted).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const all = every.filter((r) => !r.kind && r.score);
    const manuals = every.filter((r) => r.kind === 'manual');
    const last = (p) => all.find((r) => r.by === p);
    const mine = last(me); const theirs = last(partner);
    const results = [mine, theirs].filter(Boolean).map((r) => ({ name: r.by === me ? 'Tú' : profile.name(r.by), score: r.score }));
    const pName = profile.name(partner);
    body.replaceChildren(...[
      el('p', { class: 'note-inline' }, 'Es una guía para conocerse mejor, no un examen ni un diagnóstico. Todos tenemos un poco de cada uno.'),
      results.length ? el('section', { class: 'card paper-card ll-result' },
        radar(results),
        el('div', { class: 'll-bars-wrap' }, results.map((r, j) => bars(r, j)))) : null,
      el('div', { class: 'card-actions' }, ui.button({ label: mine ? 'Responder otra vez' : 'Responder el cuestionario', iconName: 'heart-handshake', variant: mine ? 'secondary' : 'primary', onClick: () => quiz({ onDone: () => { ui.toast('Listo. Aquí está tu resultado.', { tone: 'success' }); draw(); } }) })),
      !theirs ? el('p', { class: 'muted small' }, `Cuando ${pName} responda en su teléfono, aparecen sus resultados, cómo se complementan y las ideas para ti.`) : null,
      mine && theirs ? fitCard('Tú', pName, mine, theirs) : null,
      theirs ? ideasCard(pName, theirs) : null,
      manualCard(me, partner, manuals),
      guideCard(),
      all.length > 1 ? el('details', { class: 'card paper-card' }, el('summary', {}, 'Historial'),
        el('ul', { class: 'll-history' }, all.map((r) => el('li', {}, `${fmtDay.format(new Date(r.at))} · ${profile.name(r.by)}: ${nameOf(r.top)}`)))) : null,
    ].filter(Boolean));
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir esta sección', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'loveLanguages') draw().catch(() => {}); });
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); offP(); } };
}
