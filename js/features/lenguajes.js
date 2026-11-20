// Lenguajes del amor (docs/05 Más §27): each one answers the 10 forced-choice questions of
// CONFIG.loveLanguageQuestions on their own phone; the result of both shows as a 5-axis SVG chart,
// with concrete ideas for the other (CONFIG.loveLanguageIdeas) and a history of results.
// A kind guide, not a diagnosis.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el } = util;
const SVG_NS = 'http://www.w3.org/2000/svg';
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
export const LANGS = ['palabras', 'tiempo', 'regalos', 'actos', 'contacto'];
const nameOf = (k) => CONFIG.loveLanguageNames?.[k] || k;

/** answers: { questionId: lang } -> { lang: count }. */
export function score(answers) {
  const s = Object.fromEntries(LANGS.map((k) => [k, 0]));
  for (const v of Object.values(answers || {})) if (v in s) s[v]++;
  return s;
}
export const top = (s) => LANGS.slice().sort((a, b) => s[b] - s[a])[0];

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
    const [x, y] = pt(i, 1.22); const t = ns('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'radar-label' }); t.textContent = nameOf(k).split(' ')[0]; svg.append(t);
  });
  results.forEach((r, j) => svg.append(ns('polygon', { points: LANGS.map((k, i) => pt(i, r.score[k] / max).join(',')).join(' '), class: `radar-shape radar-${j}` })));
  return svg;
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
      } }, o.text)));
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
    const all = (await db.query('loveLanguages')).filter((r) => !r.deleted).sort((a, b) => b.at.localeCompare(a.at));
    const last = (p) => all.find((r) => r.by === p);
    const mine = last(me); const theirs = last(partner);
    const results = [mine, theirs].filter(Boolean).map((r) => ({ name: profile.name(r.by), score: r.score }));
    const ideasFor = theirs ? (CONFIG.loveLanguageIdeas || []).filter((x) => x.lang === theirs.top) : [];
    body.replaceChildren(...[
      el('p', { class: 'note-inline' }, 'Es una guía para conocerse mejor, no un examen ni un diagnóstico. Todos tenemos un poco de cada uno.'),
      results.length ? el('section', { class: 'card paper-card ll-result' },
        radar(results),
        el('ul', { class: 'll-legend' }, results.map((r, j) => el('li', {}, el('span', { class: `ll-dot radar-${j}`, 'aria-hidden': 'true' }), `${r.name}: ${nameOf(top(r.score))}`)))) : null,
      el('div', { class: 'card-actions' }, ui.button({ label: mine ? 'Responder otra vez' : 'Responder el cuestionario', iconName: 'heart-handshake', variant: mine ? 'secondary' : 'primary', onClick: () => quiz({ onDone: () => { ui.toast('Listo. Aquí está tu resultado.', { tone: 'success' }); draw(); } }) })),
      !theirs ? el('p', { class: 'muted small' }, `Cuando ${profile.name(partner)} responda en su teléfono, aparecen sus resultados y las ideas para ti.`) : null,
      ideasFor.length ? el('section', { class: 'card paper-card' },
        el('p', { class: 'card-kicker' }, `Ideas para ${profile.name(partner)}`),
        el('p', { class: 'small muted' }, `Su lenguaje más fuerte hoy: ${nameOf(theirs.top)}.`),
        el('ul', { class: 'll-ideas' }, ideasFor.map((x) => el('li', {}, x.text)))) : null,
      all.length > 1 ? el('details', { class: 'card paper-card' }, el('summary', {}, 'Historial'),
        el('ul', { class: 'll-history' }, all.map((r) => el('li', {}, `${fmtDay.format(new Date(r.at))} · ${profile.name(r.by)}: ${nameOf(r.top)}`)))) : null,
    ].filter(Boolean));
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir esta sección', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'loveLanguages') draw().catch(() => {}); });
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); offP(); } };
}
