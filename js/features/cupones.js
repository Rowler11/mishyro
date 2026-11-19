// Cuponera (docs/05 Pestaña 3, docs/06, docs/09 #/cupones).
// Kippu tickets with notches, a dotted cut and a stub for the hanko. "Para ti" are the coupons
// the active person received; "Los que regalaste" are theirs to give (decision 4, 2026-11-19:
// the seed ones plus coupons each person creates for the other, with dedication and optional expiry).
// Redeem state lives in `couponState` keyed by coupon id (docs/08).
import { ui, util, db, profile, seed, CONFIG } from '../core.js';

const { el, icon } = util;
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const KEY = `${CONFIG.storageKey}.cupones.tab`;
const readTab = () => { try { return localStorage.getItem(KEY) === 'given' ? 'given' : 'mine'; } catch { return 'mine'; } };
const saveTab = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

const pending = (t) => !t || seed.needsCompletion(t);
/** Seed and config coupons are written by the author (David) for the partner. */
const AUTHOR = Object.entries(CONFIG.people || {}).find(([, p]) => p.role === 'author')?.[0] || 'david';
const fromOf = (c) => c.from || AUTHOR;
const toOf = (c) => c.to || profile.partnerOf(fromOf(c));

export const redeemedText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `Canjeado el ${fmtDate.format(d)} a las ${fmtTime.format(d)}` : 'Canjeado';
};
/** Expired when the expiry day is before today (it can be used all of that day). */
export const isExpired = (c, today = util.localDay()) => !!c.expiresOn && c.expiresOn < today;

// Compact train ticket (decided 2026-11-19): number, giver and title on the ticket, the tear-off
// stub is the "Canjear" button or holds the hanko. Tapping the ticket opens its full detail.
function ticket(c, state, { tab, number, onRedeem, onOpen }) {
  const redeemed = !!state?.redeemedAt;
  const expired = !redeemed && isExpired(c);
  const no = `Nº ${String(number).padStart(3, '0')}`;
  const who = tab === 'mine' ? `De ${profile.name(fromOf(c))}` : `Para ${profile.name(toOf(c))}`;
  const meta = redeemed ? redeemedText(state.redeemedAt) : expired ? `Venció el ${util.formatDay(c.expiresOn)}`
    : c.expiresOn ? `Vale hasta el ${util.formatDay(c.expiresOn)}` : 'Sin vencimiento';
  const titleText = pending(c.title) ? 'Cupón sin título' : c.title;
  const titleId = `kp-${c.id.replace(/[^a-z0-9]/gi, '')}`;
  let stub;
  if (tab === 'mine' && !redeemed && !expired) {
    stub = el('button', { class: 'kippu-stub kippu-redeem', type: 'button', 'aria-label': `Canjear: ${titleText}`, onClick: () => onRedeem(c) },
      icon('ticket', { size: 22 }), el('span', {}, 'Canjear'));
  } else {
    stub = el('div', { class: 'kippu-stub' },
      redeemed ? ui.hanko({ text: (profile.name(state.redeemedBy || toOf(c)) || '♥').charAt(0).toUpperCase(), size: 52, label: 'Sello de cupón canjeado' })
        : el('span', { class: expired ? 'kippu-stub-note' : 'kippu-seal-empty', 'aria-hidden': expired ? null : 'true' }, expired ? 'Vencido' : ''));
  }
  return el('article', { class: `kippu${redeemed ? ' is-redeemed' : ''}${expired ? ' is-expired' : ''}`, 'aria-labelledby': titleId, dataset: { id: c.id } },
    el('button', { class: 'kippu-main', type: 'button', 'aria-describedby': `${titleId}-m`, onClick: () => onOpen(c) },
      el('span', { class: 'kippu-row' }, el('span', { class: 'kippu-kicker' }, who), el('span', { class: 'kippu-no' }, no)),
      el('span', { class: 'kippu-title', id: titleId }, titleText),
      el('span', { class: `kippu-meta${redeemed ? ' is-ok' : ''}`, id: `${titleId}-m` }, redeemed ? icon('check', { size: 14 }) : null, meta, el('span', { class: 'kippu-admit', 'aria-hidden': 'true' }, 'Admite 1')),
      pending(c.title) || (c.description && pending(c.description)) ? el('span', { class: 'pending' }, 'Por completar') : null),
    stub);
}

/** Full coupon with its description, dedication and the actions that do not fit on the ticket. */
function detail(c, state, { tab, number, onRedeem, onEdit, onDelete, onShare }) {
  const redeemed = !!state?.redeemedAt;
  const expired = !redeemed && isExpired(c);
  const actions = [];
  if (tab === 'mine' && !redeemed && !expired) actions.push({ label: 'Canjear', variant: 'primary', value: 'redeem' });
  if (tab === 'given') {
    if (c.origin === 'user') actions.push({ label: 'Borrar', variant: 'ghost', value: 'delete' });
    actions.push({ label: 'Editar', variant: 'ghost', value: 'edit' });
    if (!pending(c.title)) actions.push({ label: 'Enviar', variant: 'primary', value: 'share' });
  }
  const m = ui.openModal({
    title: pending(c.title) ? 'Cupón sin título' : c.title, kind: 'sheet', className: 'coupon-detail', actions,
    body: el('div', { class: 'stack' },
      el('p', { class: 'kippu-kicker' }, `${tab === 'mine' ? `Vale por · de ${profile.name(fromOf(c))}` : `Vale por · para ${profile.name(toOf(c))}`} · Nº ${String(number).padStart(3, '0')}`),
      !pending(c.description) && c.description ? el('p', {}, c.description) : null,
      c.dedication ? el('p', { class: 'kippu-dedication' }, `“${c.dedication}”`) : null,
      el('p', { class: 'muted small' }, redeemed ? redeemedText(state.redeemedAt) : expired ? `Venció el ${util.formatDay(c.expiresOn)}` : c.expiresOn ? `Vale hasta el ${util.formatDay(c.expiresOn)}` : 'No vence.')),
  });
  m.result.then((v) => ({ redeem: onRedeem, edit: onEdit, delete: onDelete, share: onShare })[v]?.(c));
}

function editor(existing, { onSaved }) {
  const isNew = !existing;
  const c = existing || { id: util.uuid(), kind: 'coupon', from: profile.active(), to: profile.partnerOf(profile.active()) };
  const to = toOf(c);
  const title = ui.input({ maxlength: 60, autocomplete: 'off', value: pending(c.title) ? '' : c.title || '', placeholder: 'Ej.: Una tarde de juegos de mesa' });
  const desc = ui.textarea({ maxlength: 200, rows: 3 });
  desc.value = pending(c.description) ? '' : c.description || '';
  const ded = ui.textarea({ maxlength: 200, rows: 2 });
  ded.value = c.dedication || '';
  const exp = ui.input({ type: 'date', value: c.expiresOn || '', min: util.localDay() });
  const fTitle = ui.field({ label: 'Vale por', control: title });
  const fExp = ui.field({ label: 'Vence (opcional)', control: exp, hint: 'Si lo dejas vacío, no vence.' });
  title.addEventListener('input', () => { if (title.value.trim()) fTitle.setError(''); });
  const formError = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    formError.textContent = '';
    const t = title.value.trim();
    fTitle.setError(t ? '' : 'Escribe qué regalas con este cupón.');
    const e = exp.value;
    const expErr = e && !util.isValidDay(e) ? 'Esa fecha no es válida.' : e && e < util.localDay() && e !== c.expiresOn ? 'La fecha ya pasó.' : '';
    fExp.setError(expErr);
    if (!t) { title.focus(); return false; }
    if (expErr) { exp.focus(); return false; }
    try {
      const rec = { ...c, kind: 'coupon', title: t, description: desc.value.trim(), dedication: ded.value.trim(), expiresOn: e || null, from: fromOf(c), to };
      await db.put('content', rec);
      onSaved(rec, isNew);
      return true;
    } catch (err) {
      console.error(err);
      formError.textContent = 'No se pudo guardar. Inténtalo de nuevo.';
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? `Cupón para ${profile.name(to)}` : 'Editar cupón', kind: 'sheet', className: 'coupon-editor',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (ev) => ev.preventDefault() },
      fTitle,
      ui.field({ label: 'Detalle (opcional)', control: desc, hint: 'Las condiciones o cómo se usa.' }),
      ui.field({ label: 'Dedicatoria (opcional)', control: ded }),
      fExp, formError),
    actions: [
      { label: 'Cancelar', variant: 'ghost' },
      { label: isNew ? 'Crear cupón' : 'Guardar cambios', variant: 'primary', onClick: save },
    ],
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide cupones' });
  const header = ui.pageHeader({ title: 'Cuponera', jp: '券', romaji: 'ken', actions: [ui.newButton('Nuevo cupón', () => openEditor())] });
  const body = el('div', { class: 'cupones-body' }, ui.skeleton(3));
  page.append(header, body);
  let tab = readTab();
  let coupons = [];
  let states = new Map();
  let justRedeemed = null;

  const load = async () => {
    const [content, st] = await Promise.all([db.query('content', { index: 'kind', range: IDBKeyRange.only('coupon') }), db.query('couponState')]);
    coupons = content.filter((c) => !c.deleted);
    states = new Map(st.map((s) => [s.couponId, s]));
  };

  const openEditor = (c = null) => editor(c, {
    onSaved: async (rec, isNew) => {
      ui.toast(isNew ? `Cupón creado. Con "Enviar" se lo cuentas a ${profile.name(toOf(rec))}.` : 'Cupón guardado.', { tone: 'success' });
      tab = 'given'; saveTab(tab);
      await load(); draw();
    },
  });

  const redeem = async (c) => {
    const yes = await ui.confirmDialog({ title: '¿Canjear este cupón?', message: `“${c.title}”. Queda marcado con la fecha y la hora de hoy.`, confirmLabel: 'Canjear' });
    if (!yes) return;
    try {
      await db.put('couponState', { id: c.id, couponId: c.id, redeemedAt: util.nowISO(), redeemedBy: profile.active() });
      justRedeemed = c.id;
      await load(); draw();
      ui.confetti(); util.haptic([10, 40, 20]);
      ui.announce(`Cupón canjeado: ${c.title}.`);
    } catch (e) { console.error(e); ui.toast('No se pudo canjear. Inténtalo de nuevo.', { tone: 'error' }); }
  };

  const remove = async (c) => {
    const yes = await ui.confirmDialog({ title: '¿Borrar este cupón?', message: `“${c.title}” desaparece de la cuponera.`, confirmLabel: 'Borrar', danger: true });
    if (!yes) return;
    await db.purge('content', c.id);
    await db.purge('couponState', c.id).catch(() => {});
    ui.toast('Cupón borrado.');
    await load(); draw();
  };

  const share = (c) => ui.share({ text: [`Te regalé un cupón en Aishiteru: ${c.title}.`, c.description, c.dedication ? `“${c.dedication}”` : '', c.expiresOn ? `Vale hasta el ${util.formatDay(c.expiresOn)}.` : ''].filter(Boolean).join(' ') });

  const reset = async () => {
    const mine = coupons.filter((c) => toOf(c) === profile.active() && states.has(c.id));
    const yes = await ui.confirmDialog({ title: '¿Reiniciar los cupones?', message: 'Todos tus cupones vuelven a estar sin canjear. Se borran las fechas de canje.', confirmLabel: 'Reiniciar', danger: true });
    if (!yes) return;
    for (const c of mine) await db.purge('couponState', c.id);
    ui.toast('Cupones reiniciados.', { tone: 'success' });
    await load(); draw();
  };

  function draw() {
    const me = profile.active();
    const mine = coupons.filter((c) => toOf(c) === me && !pending(c.title));
    const given = coupons.filter((c) => fromOf(c) === me);
    const list = tab === 'mine' ? mine : given;
    const rank = (c) => (states.has(c.id) ? 2 : isExpired(c) ? 3 : 1);
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const number = new Map([...list].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map((c, i) => [c.id, i + 1]));
    const free = mine.filter((c) => !states.has(c.id) && !isExpired(c)).length;

    const tabs = ui.segmented({
      label: 'Cupones', value: tab,
      options: [{ value: 'mine', label: `Para ti (${mine.length})` }, { value: 'given', label: `Los que regalaste (${given.length})` }],
      onChange: (v) => { tab = v; saveTab(v); draw(); },
    });
    const summary = el('p', { class: 'muted small cupones-summary' }, tab === 'mine'
      ? (mine.length ? `${free === 1 ? 'Te queda 1 cupón' : `Te quedan ${free} cupones`} por canjear.` : '')
      : `Cupones que le regalaste a ${profile.name(profile.partnerOf(me))}.${given.some((c) => states.has(c.id)) ? ' Los canjeados llevan su sello.' : ''}`);

    let content;
    if (!list.length) {
      content = tab === 'mine'
        ? ui.emptyState({ title: 'Aún no tienes cupones', text: `Cuando ${profile.name(profile.partnerOf(me))} te regale uno, aparece aquí.`, art: 'ticket' })
        : ui.emptyState({ title: 'Todavía no regalas cupones', text: `Crea uno para ${profile.name(profile.partnerOf(me))}: una cena, un masaje, una tarde de lo que quiera.`, art: 'ticket', action: { label: 'Crear un cupón', onClick: () => openEditor() } });
    } else {
      const handlers = { onRedeem: redeem, onEdit: openEditor, onDelete: remove, onShare: share };
      content = el('div', { class: 'kippu-grid' }, sorted.map((c) => ticket(c, states.get(c.id), {
        tab, number: number.get(c.id), onRedeem: redeem,
        onOpen: (x) => detail(x, states.get(x.id), { tab, number: number.get(x.id), ...handlers }),
      })));
    }
    const resetBtn = tab === 'mine' && mine.some((c) => states.has(c.id))
      ? el('div', { class: 'cupones-foot' }, el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: reset }, icon('repeat', { size: 18 }), 'Reiniciar cupones'))
      : null;
    body.replaceChildren(tabs, summary, content, resetBtn || '');
    if (justRedeemed) {
      body.querySelector(`.kippu[data-id="${CSS.escape(justRedeemed)}"] .hanko`)?.classList.add('hanko-stamp');
      justRedeemed = null;
    }
  }

  try { await load(); } catch (e) {
    console.error(e);
    body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir la cuponera', text: 'Cierra y vuelve a abrir la app; tus datos siguen en el teléfono.', art: 'wave' }));
    return page;
  }
  draw();
  const offProfile = profile.onProfileChange(async () => { await load(); draw(); });
  return { node: page, cleanup: offProfile };
}
