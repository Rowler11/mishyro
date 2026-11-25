// Gastos compartidos (docs/05 Más §31): what the couple spends (date, amount in COP, category, who
// paid, note, how it splits: 50/50 by default, editable per expense), a guilt-free balance ("Para
// quedar parejos: A → B $20.000"), a monthly summary with an SVG chart, CSV export and the link with
// the Alcancía (an expense can also be a deposit to a goal). Records only: no real payments.
import { ui, util, db, profile } from '../core.js';
import { moneyField, barChart, lastMonths, monthLabel, monthOf } from './hogar-kit.js';

const { el, icon } = util;
const [A, B] = profile.PEOPLE;
export const CATEGORIES = [
  { value: 'mercado', label: 'Mercado', icon: 'list-todo' }, { value: 'citas', label: 'Citas y salidas', icon: 'heart' },
  { value: 'hogar', label: 'Hogar', icon: 'house' }, { value: 'servicios', label: 'Servicios', icon: 'zap' },
  { value: 'transporte', label: 'Transporte', icon: 'bus' }, { value: 'mascotas', label: 'Mascotas', icon: 'paw-print' },
  { value: 'regalos', label: 'Regalos', icon: 'gift' }, { value: 'viajes', label: 'Viajes', icon: 'plane' },
  { value: 'otros', label: 'Otros', icon: 'wallet' },
];
const SETTLE = 'saldo';

// ---------- pure helpers (unit-tested) ----------

/** Share each person owes for an expense: { sofia: n, david: n } (whole pesos, adds up to the amount). */
export function shares(e) {
  const amt = Number(e.amountCOP) || 0;
  const pa = Math.max(0, Math.min(100, Number(e.split?.[A] ?? 50)));
  const a = Math.round((amt * pa) / 100);
  return { [A]: a, [B]: amt - a };
}

/** Net balance per person: paid minus share. Positive means the other owes them. */
export function balance(expenses) {
  const net = { [A]: 0, [B]: 0 };
  for (const e of expenses) {
    if (e.deleted || !profile.PEOPLE.includes(e.paidBy)) continue;
    const s = shares(e);
    net[e.paidBy] += Number(e.amountCOP) || 0;
    net[A] -= s[A]; net[B] -= s[B];
  }
  return net;
}

/** { from, to, amount } to be even, or null when they already are. */
export function settlement(expenses) {
  const net = balance(expenses);
  if (Math.abs(net[A]) < 1) return null;
  return net[A] > 0 ? { from: B, to: A, amount: net[A] } : { from: A, to: B, amount: -net[A] };
}

/** Totals per month for real spending (settlements excluded). */
export const monthly = (expenses, months) => months.map((m) => expenses.filter((e) => !e.deleted && e.category !== SETTLE && monthOf(e.date) === m).reduce((n, e) => n + (Number(e.amountCOP) || 0), 0));

/** CSV (Excel-friendly in Spanish: ";" separator, BOM, quoted text). */
export function toCSV(expenses, goalName = () => '') {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Fecha', 'Monto', 'Categoría', 'Pagó', `Parte ${profile.name(A)}`, `Parte ${profile.name(B)}`, 'Nota', 'Meta de la Alcancía'];
  const rows = [...expenses].filter((e) => !e.deleted).sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const s = shares(e);
    return [e.date, e.amountCOP, e.category === SETTLE ? 'Saldo' : (CATEGORIES.find((c) => c.value === e.category)?.label || e.category), profile.name(e.paidBy), s[A], s[B], e.note || '', goalName(e.goalId)].map(q).join(';');
  });
  return `﻿${[head.map(q).join(';'), ...rows].join('\r\n')}\r\n`;
}

// ---------- editor ----------
function editor(existing, goals, { onSaved }) {
  const e = existing || {};
  const amount = moneyField({ label: 'Monto', value: e.amountCOP || '' });
  const date = ui.input({ type: 'date', value: e.date || util.localDay(), max: util.localDay() });
  const cat = el('select', { class: 'input' }, CATEGORIES.map((c) => el('option', { value: c.value, selected: c.value === (e.category || 'mercado') }, c.label)));
  let paidBy = e.paidBy || profile.active();
  const pctA = ui.input({ type: 'range', min: '0', max: '100', step: '5', value: String(e.split?.[A] ?? 50), 'aria-label': `Parte de ${profile.name(A)} en porcentaje` });
  const splitOut = el('p', { class: 'split-out', 'aria-live': 'polite' });
  const paintSplit = () => {
    const p = Number(pctA.value);
    const n = amount.amount();
    const money = Number.isFinite(n) ? shares({ amountCOP: n, split: { [A]: p } }) : null;
    splitOut.textContent = `${profile.name(A)} ${p} %${money ? ` (${util.formatCOP(money[A])})` : ''} · ${profile.name(B)} ${100 - p} %${money ? ` (${util.formatCOP(money[B])})` : ''}`;
  };
  pctA.addEventListener('input', paintSplit); amount.input.addEventListener('input', paintSplit);
  const quick = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Repartos rápidos' },
    [['Mitad y mitad', 50], [`Todo de ${profile.name(A)}`, 100], [`Todo de ${profile.name(B)}`, 0]].map(([l, v]) => el('button', { class: 'chip', type: 'button', onClick: () => { pctA.value = String(v); paintSplit(); } }, l)));
  paintSplit();
  const note = ui.input({ value: e.note || '', maxlength: 120 });
  const active = goals.filter((g) => g.status === 'active' || g.id === e.goalId);
  const goal = el('select', { class: 'input' }, el('option', { value: '' }, 'No'), active.map((g) => el('option', { value: g.id, selected: g.id === e.goalId }, g.name)));
  const fDate = ui.field({ label: 'Fecha', control: date });
  return ui.openModal({
    title: existing ? 'Editar gasto' : 'Nuevo gasto', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (ev) => ev.preventDefault() }, amount.node,
      ui.field({ label: 'Categoría', control: cat }),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, '¿Quién pagó?'), ui.segmented({ label: '¿Quién pagó?', value: paidBy, onChange: (v) => { paidBy = v; }, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })) })),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, '¿Cómo se reparte?'), quick, pctA, splitOut),
      fDate, ui.field({ label: 'Nota (opcional)', control: note }),
      ui.field({ label: 'También es un aporte a una meta', control: goal, hint: 'Suma el mismo monto a esa meta de la Alcancía.' })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const n = amount.amount();
      if (!Number.isFinite(n) || n <= 0) { amount.setError('Escribe un monto mayor que cero.'); return false; }
      if (!util.isValidDay(date.value) || date.value > util.localDay()) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
      const id = e.id || util.uuid();
      const p = Number(pctA.value);
      const rec = { ...e, id, date: date.value, amountCOP: n, category: cat.value, paidBy, split: { [A]: p, [B]: 100 - p }, note: note.value.trim(), goalId: goal.value || null, visibility: 'shared', owner: 'both' };
      // The linked deposit follows the expense (created, updated or removed).
      const entries = (await db.query('savingsEntries')).filter((x) => x.expenseId === id && !x.deleted);
      if (rec.goalId) {
        const dep = { ...(entries[0] || { id: util.uuid() }), goalId: rec.goalId, type: 'deposit', amount: n, date: rec.date, by: paidBy, note: rec.note || 'Desde Gastos', expenseId: id, visibility: 'shared', owner: 'both' };
        await db.put('savingsEntries', dep);
      } else for (const x of entries) await db.purge('savingsEntries', x.id);
      await db.put('expenses', rec); util.haptic(10); onSaved(rec); return true;
    } }],
  });
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide gastos' });
  let data = { expenses: [], goals: [] };
  let month = monthOf(util.localDay());
  const add = () => editor(null, data.goals, { onSaved: () => { ui.toast('Gasto anotado.', { tone: 'success' }); load(); } });
  const extra = import('./gastos-extra.js');
  page.append(ui.pageHeader({ title: 'Gastos compartidos', jp: '家計', romaji: 'kakei', back: '/mas', actions: [
    ui.button({ label: 'Dividir cuenta', iconName: 'scale', small: true, variant: 'ghost', onClick: () => extra.then((m) => m.splitCalculator({ onSaved: () => load() })) }), ui.newButton('Gasto', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(body);

  const settle = async (s) => {
    if (!(await ui.confirmDialog({ title: '¿Quedaron parejos?', message: `Se anota que ${profile.name(s.from)} le dio ${util.formatCOP(s.amount)} a ${profile.name(s.to)}. Es solo un registro.`, confirmLabel: 'Anotar' }))) return;
    await db.put('expenses', { id: util.uuid(), date: util.localDay(), amountCOP: s.amount, category: SETTLE, paidBy: s.from, split: { [s.to]: 100, [s.from]: 0 }, note: 'Para quedar parejos', goalId: null, visibility: 'shared', owner: 'both' });
    ui.toast('Listo: quedaron parejos.', { tone: 'success' }); load();
  };
  const exportCSV = () => {
    const names = new Map(data.goals.map((g) => [g.id, g.name]));
    const blob = new Blob([toCSV(data.expenses, (id) => names.get(id) || '')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `gastos-${util.localDay()}.csv` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    ui.toast('Archivo CSV listo.', { tone: 'success' });
  };

  const paint = () => {
    const ex = data.expenses;
    if (!ex.length) { body.replaceChildren(ui.emptyState({ title: 'Cuentas claras', text: 'Anoten lo que gastan juntos y la app les dice cómo quedar parejos, sin culpas.', art: 'omamori', action: { label: 'Anotar un gasto', onClick: add } }), note()); return; }
    const s = settlement(ex);
    const balanceCard = el('section', { class: 'card paper-card balance' },
      el('p', { class: 'muted small' }, 'Balance'),
      s ? el('p', { class: 'balance-line' }, 'Para quedar parejos: ', el('strong', {}, `${profile.name(s.from)} → ${profile.name(s.to)} ${util.formatCOP(s.amount)}`)) : el('p', { class: 'balance-line' }, el('strong', {}, 'Están parejos.')),
      s ? ui.button({ label: 'Ya quedamos parejos', iconName: 'circle-check', small: true, variant: 'ghost', onClick: () => settle(s) }) : null);
    const months = lastMonths(6);
    const totals = monthly(ex, months);
    const inMonth = ex.filter((e) => monthOf(e.date) === month).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const real = inMonth.filter((e) => e.category !== SETTLE);
    const byCat = CATEGORIES.map((c) => ({ ...c, total: real.filter((e) => e.category === c.value).reduce((n, e) => n + e.amountCOP, 0) })).filter((c) => c.total).sort((a, b) => b.total - a.total);
    const paid = Object.fromEntries(profile.PEOPLE.map((p) => [p, real.filter((e) => e.paidBy === p).reduce((n, e) => n + e.amountCOP, 0)]));
    const [y, m] = month.split('-').map(Number);
    const shift = (d) => { const t = new Date(y, m - 1 + d, 1); month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; paint(); };
    const goalName = new Map(data.goals.map((g) => [g.id, g.name]));
    const capSlot = el('div', { class: 'cap-slot' });
    extra.then((m) => m.capCard(real, { onChange: paint })).then((c) => capSlot.replaceChildren(c)).catch(() => {});
    body.replaceChildren(balanceCard, capSlot,
      el('section', { class: 'card paper-card pet-block' },
        el('header', { class: 'pet-block-head month-nav' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onClick: () => shift(-1) }, icon('chevron-left', { size: 20 })),
          el('h2', {}, ((t) => t.charAt(0).toUpperCase() + t.slice(1))(new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)))),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', disabled: month >= monthOf(util.localDay()), onClick: () => shift(1) }, icon('chevron-right', { size: 20 }))),
        el('p', { class: 'pet-weight-now' }, el('strong', {}, util.formatCOP(real.reduce((n, e) => n + e.amountCOP, 0))), el('span', { class: 'muted' }, ` · ${profile.PEOPLE.map((p) => `${profile.name(p)} pagó ${util.formatCOP(paid[p])}`).join(' · ')}`)),
        byCat.length ? el('ul', { class: 'tag-row' }, byCat.map((c) => el('li', { class: 'tag' }, `${c.label}: ${util.formatCOP(c.total)}`))) : null,
        barChart({ labels: months.map(monthLabel), values: totals, title: 'Gastos de los últimos 6 meses', format: util.formatCOP })),
      el('section', { class: 'card paper-card pet-block' },
        el('header', { class: 'pet-block-head' }, el('h2', {}, 'Registros'), ui.button({ label: 'Exportar CSV', iconName: 'download', small: true, variant: 'ghost', onClick: exportCSV })),
        inMonth.length ? el('ul', { class: 'pet-list' }, inMonth.map((e) => {
          const c = CATEGORIES.find((x) => x.value === e.category);
          const sh = shares(e);
          const splitText = e.category === SETTLE ? `${profile.name(e.paidBy)} → ${profile.name(profile.partnerOf(e.paidBy))}` : e.split?.[A] === 50 ? 'Mitad y mitad' : `${profile.name(A)} ${util.formatCOP(sh[A])} · ${profile.name(B)} ${util.formatCOP(sh[B])}`;
          return el('li', { class: 'pet-row' }, icon(e.category === SETTLE ? 'circle-check' : c?.icon || 'wallet', { size: 20 }),
            el('div', { class: 'grow' }, el('strong', {}, util.formatCOP(e.amountCOP)),
              el('p', { class: 'muted small' }, [e.category === SETTLE ? 'Saldo' : c?.label, `pagó ${profile.name(e.paidBy)}`, splitText, util.formatDay(e.date)].filter(Boolean).join(' · ')),
              e.note || e.goalId ? el('p', { class: 'small' }, [e.note, e.goalId ? `Aporte a "${goalName.get(e.goalId) || 'meta'}"` : ''].filter(Boolean).join(' · ')) : null),
            el('div', { class: 'list-item-actions' },
              e.category === SETTLE ? null : el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar gasto de ${util.formatCOP(e.amountCOP)}`, onClick: () => editor(e, data.goals, { onSaved: load }) }, icon('pencil', { size: 16 })),
              el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar gasto de ${util.formatCOP(e.amountCOP)}`, onClick: async () => {
                if (!(await ui.confirmDialog({ title: '¿Borrar este registro?', message: `${util.formatCOP(e.amountCOP)} · ${util.formatDay(e.date)}${e.goalId ? '. También se quita su aporte de la Alcancía.' : ''}`, confirmLabel: 'Borrar', danger: true }))) return;
                for (const x of (await db.query('savingsEntries')).filter((x) => x.expenseId === e.id)) await db.purge('savingsEntries', x.id);
                await db.purge('expenses', e.id); load();
              } }, icon('trash-2', { size: 16 }))));
        })) : el('p', { class: 'muted' }, 'Nada anotado este mes.')),
      note());
  };
  const note = () => el('p', { class: 'muted small center' }, icon('info', { size: 14 }), ' Solo es un registro: la app no hace pagos reales.');

  const load = async () => {
    const [ex, goals] = await Promise.all([db.query('expenses'), db.query('savingsGoals')]);
    data = { expenses: ex.filter((e) => !e.deleted), goals: goals.filter((g) => !g.deleted) };
    paint();
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los gastos', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (['expenses', 'savingsGoals'].includes(s) && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
