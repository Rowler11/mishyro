// Frasco de gratitud y revisión semanal (docs/05 Más §28). Short thank-you notes to the other
// (with prompts from CONFIG.gratitudePrompts) fall into an illustrated jar and can be re-read at
// random. The weekly review asks 3 to 5 questions of CONFIG.weeklyReviewQuestions (what went well,
// what I need, what I'm thankful for); each one answers on their own phone and the week keeps both.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const TAB_KEY = 'aishiteru.gratitud.tab';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** ISO week key, e.g. "2026-W47". */
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
/** The questions of a week: 4 of the bank, rotating so consecutive weeks differ. */
export function weekQuestions(bank, week) {
  if (!bank.length) return [];
  const n = Math.min(4, bank.length);
  const k = Number(week.slice(-2)) || 0;
  return Array.from({ length: n }, (_, i) => bank[(k * n + i) % bank.length]);
}

function jar(count) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 150'); svg.setAttribute('class', 'jar-art'); svg.setAttribute('aria-hidden', 'true');
  const notes = Array.from({ length: Math.min(count, 24) }, (_, i) => {
    const x = 28 + ((i * 37) % 62); const y = 128 - Math.floor(i / 4) * 12 - ((i * 13) % 6);
    const r = ((i * 47) % 50) - 25; const c = ['var(--accent-soft)', 'var(--gold)', 'var(--accent)', 'var(--surface-2)'][i % 4];
    return `<rect x="${x}" y="${y}" width="16" height="10" rx="2" fill="${c}" opacity=".9" transform="rotate(${r} ${x + 8} ${y + 5})"/>`;
  }).join('');
  svg.innerHTML = `<rect x="34" y="8" width="52" height="14" rx="4" fill="var(--gold)" opacity=".85"/><path d="M30 24h60c0 6 8 10 8 22v84c0 8-6 14-14 14H36c-8 0-14-6-14-14V46c0-12 8-16 8-22Z" fill="var(--surface)" fill-opacity=".55" stroke="var(--border-strong)" stroke-width="2"/>${notes}<path d="M34 40c-3 8-3 70 0 86" stroke="var(--surface)" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
  return svg;
}

function noteEditor({ onSaved }) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const prompts = (CONFIG.gratitudePrompts || []);
  let prompt = prompts[Math.floor(Math.random() * prompts.length)] || { text: '' };
  const text = ui.textarea({ rows: 3, maxlength: 280, placeholder: prompt.text });
  const promptEl = el('p', { class: 'muted small' }, 'Para empezar: ', el('em', {}, prompt.text));
  const f = ui.field({ label: `Gracias, ${profile.name(partner)}…`, control: text, hint: 'Corto y sincero.' });
  return ui.openModal({
    title: 'Al frasco', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, promptEl,
      ui.button({ label: 'Otra idea', iconName: 'refresh-cw', small: true, variant: 'ghost', onClick: () => { prompt = prompts[Math.floor(Math.random() * prompts.length)] || prompt; promptEl.lastChild.textContent = prompt.text; text.placeholder = prompt.text; } }), f),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Echar al frasco', variant: 'primary', onClick: async () => {
      if (!text.value.trim()) { f.setError('Escribe la nota.'); text.focus(); return false; }
      await db.put('gratitude', { id: util.uuid(), at: util.nowISO(), by: me, to: partner, text: text.value.trim(), promptId: prompt.id || null, visibility: 'shared', owner: 'both' });
      util.haptic(12); onSaved(); return true;
    } }],
  });
}

function reviewEditor(week, prev, { onSaved }) {
  const me = profile.active();
  const qs = weekQuestions(CONFIG.weeklyReviewQuestions || [], week);
  const mine = prev?.answers?.[me] || {};
  const areas = qs.map((q) => { const t = ui.textarea({ rows: 2, maxlength: 600 }); t.value = mine[q.id] || ''; return { q, t }; });
  return ui.openModal({
    title: 'Revisión de la semana', kind: 'sheet', size: 'md',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
      el('p', { class: 'muted small' }, 'Respondan cada uno en su teléfono. Mejor si después lo conversan en persona.'),
      ...areas.map(({ q, t }) => ui.field({ label: q.text, control: t }))),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const ans = Object.fromEntries(areas.filter(({ t }) => t.value.trim()).map(({ q, t }) => [q.id, t.value.trim()]));
      if (Object.keys(ans).length < Math.min(3, areas.length)) { ui.toast('Responde al menos 3.'); return false; }
      const cur = (await db.get('weeklyReviews', `review:${week}`).catch(() => null)) || { id: `review:${week}`, isoWeek: week, answers: {}, visibility: 'shared', owner: 'both' };
      await db.put('weeklyReviews', { ...cur, questions: qs.map((q) => q.id), answers: { ...(cur.answers || {}), [me]: ans } });
      onSaved(); return true;
    } }],
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide gratitud' });
  page.append(ui.pageHeader({ title: 'Gratitud y revisión', jp: '感謝', romaji: 'kansha', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = 'frasco';
  try { tab = localStorage.getItem(TAB_KEY) === 'revision' ? 'revision' : 'frasco'; } catch { /* private mode */ }
  const qText = (id) => (CONFIG.weeklyReviewQuestions || []).find((q) => q.id === id)?.text || 'Pregunta';

  const frasco = async () => {
    const notes = (await db.query('gratitude')).filter((n) => !n.deleted).sort((a, b) => b.at.localeCompare(a.at));
    const me = profile.active();
    const toMe = notes.filter((n) => n.to === me);
    const shown = el('div', { class: 'jar-note', 'aria-live': 'polite' });
    const pickOne = () => {
      if (!toMe.length) return;
      const n = toMe[Math.floor(Math.random() * toMe.length)];
      shown.replaceChildren(el('p', { class: 'jar-note-text' }, n.text), el('p', { class: 'muted small' }, `${profile.name(n.by)} · ${fmtDay.format(new Date(n.at))}`));
      shown.classList.remove('pop'); void shown.offsetWidth; shown.classList.add('pop');
    };
    return [
      el('section', { class: 'card paper-card jar-card' }, jar(notes.length),
        el('div', { class: 'stack' },
          el('p', {}, el('strong', {}, String(notes.length)), notes.length === 1 ? ' nota en el frasco' : ' notas en el frasco'),
          el('div', { class: 'card-actions' },
            ui.button({ label: 'Escribir una nota', iconName: 'pencil', small: true, variant: 'primary', onClick: () => noteEditor({ onSaved: () => { ui.toast('Cayó al frasco.', { tone: 'success' }); draw(); } }) }),
            toMe.length ? ui.button({ label: 'Leer una al azar', iconName: 'dices', small: true, onClick: pickOne }) : null),
          shown)),
      notes.length ? el('details', { class: 'card paper-card jar-all' }, el('summary', {}, 'Ver todas'),
        el('ul', { class: 'jar-list' }, notes.map((n) => el('li', {},
          el('p', {}, n.text), el('p', { class: 'muted small' }, `De ${profile.name(n.by)} para ${profile.name(n.to)} · ${fmtDay.format(new Date(n.at))}`),
          n.by === me ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar esta nota', onClick: async () => { if (await ui.confirmDialog({ title: '¿Sacar esta nota del frasco?', confirmLabel: 'Sacar', danger: true })) { await db.purge('gratitude', n.id); draw(); } } }, icon('trash-2', { size: 16 })) : null)))) : null,
    ];
  };

  const revision = async () => {
    const week = isoWeek();
    const all = (await db.query('weeklyReviews')).filter((r) => !r.deleted).sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
    const cur = all.find((r) => r.isoWeek === week);
    const me = profile.active(); const partner = profile.partnerOf(me);
    const doneMe = !!cur?.answers?.[me]; const donePartner = !!cur?.answers?.[partner];
    const block = (r) => el('article', { class: 'card paper-card review-week' },
      el('h3', { class: 'review-title' }, `Semana ${Number(r.isoWeek.slice(-2))} de ${r.isoWeek.slice(0, 4)}`),
      ...(r.questions || []).map((qid) => {
        const rows = [me, partner].filter((p) => r.answers?.[p]?.[qid]).map((p) => el('p', {}, el('strong', {}, `${profile.name(p)}: `), r.answers[p][qid]));
        return rows.length ? el('div', { class: 'review-q' }, el('p', { class: 'muted small' }, qText(qid)), ...rows) : null;
      }).filter(Boolean));
    return [
      el('section', { class: 'card paper-card review-now' },
        el('p', { class: 'card-kicker' }, 'Esta semana'),
        el('p', {}, doneMe ? (donePartner ? 'Los dos respondieron. Conversen sobre lo que salió.' : `Ya respondiste. Falta ${profile.name(partner)}.`) : `3 a 5 minutos para mirar cómo les fue.${donePartner ? ` ${profile.name(partner)} ya respondió.` : ''}`),
        el('div', { class: 'card-actions' }, ui.button({ label: doneMe ? 'Editar mis respuestas' : 'Responder', iconName: 'pencil', small: true, variant: doneMe ? 'secondary' : 'primary', onClick: () => reviewEditor(week, cur, { onSaved: () => { ui.toast('Guardado.', { tone: 'success' }); draw(); } }) }))),
      ...(all.length ? [el('h2', { class: 'tl-month' }, 'Historial'), ...all.map(block)] : []),
    ];
  };

  const draw = async () => {
    const tabs = ui.segmented({ label: 'Sección', value: tab, options: [{ value: 'frasco', label: 'Frasco' }, { value: 'revision', label: 'Revisión semanal' }], onChange: (v) => { tab = v; try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } draw(); } });
    tabs.classList.add('section-tabs');
    body.replaceChildren(tabs, ...(await (tab === 'frasco' ? frasco() : revision())).filter(Boolean));
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir esta sección', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'gratitude' || s === 'weeklyReviews') draw().catch(() => {}); });
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); offP(); } };
}
