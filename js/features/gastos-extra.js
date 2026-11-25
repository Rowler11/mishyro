// Gastos, parte premium (v0.29.0, ideas 40 y 43): a monthly cap for dates and outings with a bar,
// and a quick calculator to split the bill of an outing (tip included) that can be saved as an expense.
import { ui, util, db, profile } from '../core.js';
import { moneyField } from './hogar-kit.js';

const { el, icon } = util;
const PLAN_CAT = 'citas';

/** { total, tip, each: { [person]: n } } with whole pesos that add up exactly. */
export function splitBill(amount, tipPct = 0, pctA = 50) {
  const [A, B] = profile.PEOPLE;
  const total = Math.round((Number(amount) || 0) * (1 + (Number(tipPct) || 0) / 100));
  const a = Math.round((total * Math.max(0, Math.min(100, pctA))) / 100);
  return { total, tip: total - Math.round(Number(amount) || 0), each: { [A]: a, [B]: total - a } };
}

export function splitCalculator({ onSaved } = {}) {
  const [A, B] = profile.PEOPLE; const me = profile.active();
  const amount = moneyField({ label: 'Total de la cuenta' });
  let tip = 10; let pct = 50;
  const out = el('div', { class: 'split-out', role: 'status', 'aria-live': 'polite' });
  const tipRow = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Propina' }, [0, 10, 15].map((t) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(t === tip), dataset: { t },
    onClick: (e) => { tip = t; tipRow.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.t) === t))); paint(); } }, t ? `Propina ${t}%` : 'Sin propina')));
  const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value: '50', class: 'split-range', 'aria-label': `Parte de ${profile.name(A)} en porcentaje` });
  const rangeLabel = el('p', { class: 'muted small' });
  range.addEventListener('input', () => { pct = Number(range.value); paint(); });
  const paint = () => {
    const n = amount.amount(); const r = splitBill(Number.isFinite(n) ? n : 0, tip, pct);
    rangeLabel.textContent = pct === 50 ? 'Mitad y mitad' : `${profile.name(A)} ${pct}% · ${profile.name(B)} ${100 - pct}%`;
    out.replaceChildren(
      el('p', {}, 'Total con propina: ', el('strong', {}, util.formatCOP(r.total))),
      el('ul', { class: 'split-each' }, profile.PEOPLE.map((p) => el('li', {}, el('span', {}, profile.name(p)), el('strong', {}, util.formatCOP(r.each[p]))))));
  };
  amount.input.addEventListener('input', paint); paint();
  ui.openModal({ title: 'Dividir la cuenta', size: 'sm',
    body: el('div', { class: 'stack' }, amount.node, tipRow, el('div', { class: 'stack-tight' }, range, rangeLabel), out),
    actions: [
      { label: 'Cerrar', variant: 'ghost' },
      { label: 'Anotarlo como gasto', variant: 'primary', onClick: async () => {
        const n = amount.amount(); if (!Number.isFinite(n) || n <= 0) { amount.setError('Escribe el total.'); return false; }
        const r = splitBill(n, tip, pct);
        await db.put('expenses', { id: util.uuid(), date: util.localDay(), amountCOP: r.total, category: PLAN_CAT, paidBy: me, split: { [A]: pct, [B]: 100 - pct }, note: tip ? `Salida (propina ${tip}%)` : 'Salida', goalId: null, visibility: 'shared', owner: 'both' });
        ui.toast(`Anotado: pagaste ${util.formatCOP(r.total)}.`, { tone: 'success' }); onSaved?.(); return true;
      } }],
  });
}

/** Monthly cap for "Citas y salidas" with a bar. real: the month's expenses without settlements. */
export async function capCard(real, { onChange } = {}) {
  const s = await db.getSettings('gastos', {}).catch(() => ({}));
  const cap = Number(s.planCap) || 0;
  const spent = real.filter((e) => e.category === PLAN_CAT).reduce((n, e) => n + (Number(e.amountCOP) || 0), 0);
  const edit = () => {
    const f = moneyField({ label: 'Tope al mes para citas y salidas', value: cap || '', hint: 'Déjenlo vacío para quitarlo.' });
    ui.openModal({ title: 'Tope de citas y salidas', size: 'sm', body: el('div', { class: 'stack' }, f.node),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => { const n = f.amount(); await db.setSettings('gastos', { planCap: Number.isFinite(n) && n > 0 ? n : 0 }); onChange?.(); return true; } }] });
  };
  if (!cap) return el('section', { class: 'card paper-card cap-card is-empty' }, el('p', { class: 'muted small' }, '¿Quieren un tope al mes para citas y salidas?'), ui.button({ label: 'Poner un tope', iconName: 'flag', small: true, variant: 'ghost', onClick: edit }));
  const pct = Math.min(100, Math.round((spent / cap) * 100));
  const over = spent > cap;
  return el('section', { class: `card paper-card cap-card${over ? ' is-over' : pct >= 80 ? ' is-near' : ''}` },
    el('header', { class: 'pet-block-head' }, el('h2', {}, 'Tope de citas y salidas'), el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Cambiar el tope', onClick: edit }, icon('pencil', { size: 16 }))),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Gastado del tope', 'aria-valuemin': '0', 'aria-valuemax': String(cap), 'aria-valuenow': String(Math.min(spent, cap)) },
      el('span', { class: 'progress-fill', style: { width: `${pct}%` } })),
    el('p', { class: 'small' }, over ? `Se pasaron por ${util.formatCOP(spent - cap)}. El próximo plan puede ser gratis: un picnic o una caminata.` : `${util.formatCOP(spent)} de ${util.formatCOP(cap)} · quedan ${util.formatCOP(cap - spent)}`));
}
