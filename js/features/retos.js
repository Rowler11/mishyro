// Reto semanal (docs/05 §20): one couple challenge per ISO week from CONFIG.weeklyChallenges,
// never repeated until the whole list has been done. Progress with checkboxes and a note,
// status (pendiente, en curso, cumplido) with a hanko when it is done, the history and the
// weeks in a row. The week's record ("w:<YYYY-Www>") is shared, so both phones see the same one.
import { ui, util, db, profile, CONFIG } from '../core.js';
import * as time from '../core/time.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const STATUS = { pending: 'Pendiente', doing: 'En curso', done: 'Cumplido' };
const CAT = { detalle: 'Detalle', juego: 'Juego', salida: 'Salida', 'reflexión': 'Reflexión', aventura: 'Aventura' };
export const weekId = (k) => `w:${k}`;
const statusOf = (rec, steps) => (rec.doneAt ? 'done' : (rec.steps || []).some(Boolean) || rec.note ? 'doing' : 'pending');

async function bank() {
  const items = await db.query('content', { index: 'kind', range: IDBKeyRange.only('weeklyChallenge') });
  return items.filter((c) => !c.deleted && !c.hidden);
}

/** This week's challenge: the stored one (maybe made by the other phone) or the next of the shuffle. */
export async function ensureWeek(key = time.isoWeek()) {
  const all = (await db.query('weeklyChallenges')).filter((r) => r.isoWeek);
  const existing = all.find((r) => r.id === weekId(key));
  const items = await bank();
  if (existing) return { rec: existing, challenge: items.find((c) => c.id === existing.challengeId) || existing.snapshot, all };
  if (!items.length) return { rec: null, challenge: null, all };
  let st = await db.get('questionsState', 'challenges');
  if (!st) { st = { id: 'challenges', seed: util.uuid() }; await db.put('questionsState', st); }
  const past = all.filter((r) => r.isoWeek < key).sort((a, b) => a.isoWeek.localeCompare(b.isoWeek));
  const round = past.length ? Math.max(...past.map((r) => r.round || 0)) : 0;
  const pick = time.nextFromBank(items.map((c) => c.id), { seed: st.seed, round, used: past.filter((r) => (r.round || 0) === round).map((r) => r.challengeId), lastShown: past.map((r) => r.challengeId), keepOut: 4 });
  const c = items.find((x) => x.id === pick.id);
  const rec = { id: weekId(key), isoWeek: key, challengeId: c.id, round: pick.round, steps: [], note: '', doneAt: null, snapshot: { title: c.title, text: c.text, category: c.category } };
  await db.put('weeklyChallenges', rec, { userEdit: false });
  all.push(rec);
  return { rec, challenge: c, all };
}

/** Weeks in a row with the challenge done, ending this week (or last week while this one is open). */
export function weeksInRow(all, key = time.isoWeek()) {
  const done = new Set(all.filter((r) => r.doneAt).map((r) => r.isoWeek));
  let k = done.has(key) ? key : time.prevIsoWeek(key); let n = 0;
  while (k && done.has(k)) { n++; k = time.prevIsoWeek(k); }
  return n;
}

export async function render() {
  const page = el('section', { class: 'page retos' });
  page.append(ui.pageHeader({ title: 'Reto semanal', jp: '挑戦', romaji: 'chōsen', back: '/mas' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const steps = CONFIG.challengeSteps || ['Lo hicimos'];

  const draw = async ({ stamp = false } = {}) => {
    let data;
    try { data = await ensureWeek(); } catch (e) {
      console.error(e);
      body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el reto', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
      return;
    }
    const { rec, challenge, all } = data;
    if (!rec || !challenge) { body.replaceChildren(ui.emptyState({ title: 'No hay retos', text: 'Agrega retos en Ajustes > Perfil y datos.', art: 'fan' })); return; }
    const st = statusOf(rec, steps);
    const start = time.isoWeekStart(rec.isoWeek);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const save = async (patch) => { const next = { ...rec, ...patch }; await db.put('weeklyChallenges', next, { userEdit: false }); Object.assign(rec, next); };
    const checks = steps.map((label, i) => {
      const id = `st-${i}`;
      const box = el('input', { type: 'checkbox', id, class: 'check-input', checked: !!rec.steps?.[i], disabled: !!rec.doneAt });
      box.addEventListener('change', async () => { const s = [...(rec.steps || [])]; s[i] = box.checked; await save({ steps: s }); util.haptic(8); draw(); });
      return el('li', {}, box, el('label', { for: id }, label));
    });
    const note = ui.textarea({ rows: 3, maxlength: 500, placeholder: '¿Cómo les fue?' });
    note.value = rec.note || '';
    note.addEventListener('change', () => save({ note: note.value.trim() }));
    const complete = async () => {
      await save({ note: note.value.trim(), doneAt: util.nowISO(), doneBy: profile.active(), steps: steps.map(() => true) });
      ui.confetti(); util.haptic([10, 40, 20]); ui.announce('Reto cumplido.');
      draw({ stamp: true });
    };
    const undo = async () => { await save({ doneAt: null, doneBy: null }); draw(); };
    const history = all.filter((r) => r.doneAt && r.id !== rec.id).sort((a, b) => b.isoWeek.localeCompare(a.isoWeek));
    const row = weeksInRow(all);
    body.replaceChildren(...[
      el('article', { class: `card paper-card reto-card is-${st}` },
        el('div', { class: 'qa-head' },
          el('span', { class: 'card-kicker' }, `Semana del ${fmtDay.format(start)} al ${fmtDay.format(end)}`),
          el('span', { class: `badge${st === 'done' ? ' badge-ok' : ''}` }, STATUS[st]),
          challenge.category ? el('span', { class: 'badge' }, CAT[challenge.category] || challenge.category) : null),
        el('h2', { class: 'reto-title' }, challenge.title),
        el('p', {}, challenge.text),
        el('ul', { class: 'check-list' }, checks),
        ui.field({ label: 'Nota', control: note }),
        st === 'done'
          ? el('div', { class: 'reto-seal' }, ui.hanko({ text: '✓', size: 64, stamp, label: 'Reto cumplido' }),
            el('div', { class: 'stack-tight' }, el('p', {}, '¡Lo lograron!'), el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: undo }, icon('rotate-ccw', { size: 16 }), el('span', {}, 'Deshacer'))))
          : el('div', { class: 'btn-row' }, ui.button({ label: 'Marcar como cumplido', iconName: 'check', variant: 'primary', onClick: complete }))),
      el('div', { class: 'pq-stats' },
        el('div', { class: 'card paper-card pq-stat' }, el('span', { class: 'pq-stat-num' }, String(row)), el('span', { class: 'muted small' }, row === 1 ? 'semana seguida' : 'semanas seguidas')),
        el('div', { class: 'card paper-card pq-stat' }, el('span', { class: 'pq-stat-num' }, String(all.filter((r) => r.doneAt).length)), el('span', { class: 'muted small' }, 'retos cumplidos'))),
      history.length ? el('section', { class: 'stack-tight' },
        el('h2', { class: 'card-kicker' }, 'Retos cumplidos'),
        el('ul', { class: 'reto-history' }, history.map((r) => el('li', { class: 'card paper-card reto-done' },
          ui.hanko({ text: '✓', size: 32 }),
          el('span', { class: 'song-text' }, el('span', { class: 'song-title' }, r.snapshot?.title || 'Reto'), el('span', { class: 'muted small' }, `Semana del ${fmtDay.format(time.isoWeekStart(r.isoWeek))}`), r.note ? el('span', { class: 'small clamp-2' }, r.note) : null))))) : null,
      el('p', { class: 'muted small' }, 'Cada lunes llega un reto nuevo. No se repiten hasta terminar la lista.'),
    ].filter(Boolean));
  };
  await draw();
  return { node: page };
}
