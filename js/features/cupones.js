// Cuponera (docs/05 Pestaña 3, docs/06, docs/09 #/cupones).
// Kippu tickets with notches, a dotted cut and a stub for the hanko. Three sections (2026-11-19):
// "Para ti" are the coupons received and still to use; "Historial" holds the ones given to the
// other and the ones already used; "Guardados" are coupons created but not given yet (only their
// author sees them). A new coupon has `sentAt: null` until "Regalar"; older ones have no `sentAt`
// and count as given.
// Redeem state lives in `couponState` keyed by coupon id (docs/08).
import { ui, util, db, profile, seed, CONFIG } from '../core.js';

const { el, icon } = util;
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const KEY = `${CONFIG.storageKey}.cupones.tab`;
const TABS = ['mine', 'given', 'saved'];
const readTab = () => { try { const v = localStorage.getItem(KEY); return TABS.includes(v) ? v : 'mine'; } catch { return 'mine'; } };
const saveTab = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

const pending = (t) => !t || seed.needsCompletion(t);
/** Seed and config coupons are written by the author (David) for the partner. */
const AUTHOR = Object.entries(CONFIG.people || {}).find(([, p]) => p.role === 'author')?.[0] || 'david';
const fromOf = (c) => c.from || AUTHOR;
const toOf = (c) => c.to || profile.partnerOf(fromOf(c));
/** Created but not given yet: only its author sees it, in "Guardados". */
export const isSaved = (c) => c.sentAt === null;

export const redeemedText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `Canjeado el ${fmtDate.format(d)} a las ${fmtTime.format(d)}` : 'Canjeado';
};
/** Expired when the expiry day is before today (it can be used all of that day). */
export const isExpired = (c, today = util.localDay()) => !!c.expiresOn && c.expiresOn < today;
/** Still valid and expiring within 7 days (today included): gets the soft "¡Úsame pronto!" stamp. */
export const isExpiringSoon = (c, today = util.localDay()) => {
  if (!c.expiresOn || isExpired(c, today)) return false;
  const a = util.parseDay(today); const b = util.parseDay(c.expiresOn);
  return !!a && !!b && util.daysBetween(a, b) <= 7;
};

// Compact train ticket (decided 2026-11-19): number, giver and title on the ticket, the tear-off
// stub is the "Canjear" button or holds the hanko. Tapping the ticket opens its full detail.
function ticket(c, state, { tab, number, onRedeem, onOpen, onGive }) {
  const redeemed = !!state?.redeemedAt;
  const expired = !redeemed && isExpired(c);
  const no = `Nº ${String(number).padStart(3, '0')}`;
  const who = tab === 'mine' ? `De ${profile.name(fromOf(c))}` : `Para ${profile.name(toOf(c))}`;
  const meta = redeemed ? redeemedText(state.redeemedAt) : expired ? `Venció el ${util.formatDay(c.expiresOn)}`
    : c.expiresOn ? `Vale hasta el ${util.formatDay(c.expiresOn)}` : 'Sin vencimiento';
  const titleText = pending(c.title) ? 'Cupón sin título' : c.title;
  const soon = tab === 'mine' && !redeemed && isExpiringSoon(c);
  const titleId = `kp-${c.id.replace(/[^a-z0-9]/gi, '')}`;
  let stub;
  if (tab === 'mine' && !redeemed && !expired) {
    stub = el('button', { class: 'kippu-stub kippu-redeem', type: 'button', 'aria-label': `Canjear: ${titleText}`, onClick: () => onRedeem(c) },
      icon('ticket', { size: 22 }), el('span', {}, 'Canjear'));
  } else if (tab === 'saved' && !pending(c.title)) {
    stub = el('button', { class: 'kippu-stub kippu-redeem', type: 'button', 'aria-label': `Regalar: ${titleText}`, onClick: () => onGive(c) },
      icon('gift', { size: 22 }), el('span', {}, 'Regalar'));
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
      pending(c.title) || (c.description && pending(c.description)) ? el('span', { class: 'pending' }, 'Por completar') : null,
      soon ? el('span', { class: 'kippu-soon' }, '¡Úsame pronto!') : null),
    stub);
}

/** Full coupon with its description, dedication and the actions that do not fit on the ticket. */
function detail(c, state, { tab, number, onRedeem, onEdit, onDelete, onShare, onGive }) {
  const redeemed = !!state?.redeemedAt;
  const expired = !redeemed && isExpired(c);
  const actions = [];
  if (tab === 'mine' && !redeemed && !expired) actions.push({ label: 'Canjear', variant: 'primary', value: 'redeem' });
  if (tab === 'given' || tab === 'saved') {
    if (c.origin === 'user') actions.push({ label: 'Borrar', variant: 'ghost', value: 'delete' });
    actions.push({ label: 'Editar', variant: 'ghost', value: 'edit' });
    if (!pending(c.title)) actions.push(tab === 'saved' ? { label: 'Regalar', variant: 'primary', value: 'give' } : { label: 'Enviar', variant: 'primary', value: 'share' });
  }
  const m = ui.openModal({
    title: pending(c.title) ? 'Cupón sin título' : c.title, kind: 'sheet', className: 'coupon-detail', actions,
    body: el('div', { class: 'stack' },
      tab === 'saved' ? el('p', { class: 'muted small' }, `Guardado: solo tú lo ves hasta que lo regales.`) : null,
      el('p', { class: 'kippu-kicker' }, `${tab === 'mine' ? `Vale por · de ${profile.name(fromOf(c))}` : `Vale por · para ${profile.name(toOf(c))}`} · Nº ${String(number).padStart(3, '0')}`),
      !pending(c.description) && c.description ? el('p', {}, c.description) : null,
      c.dedication ? el('p', { class: 'kippu-dedication' }, `“${c.dedication}”`) : null,
      el('p', { class: 'muted small' }, redeemed ? redeemedText(state.redeemedAt) : expired ? `Venció el ${util.formatDay(c.expiresOn)}` : c.expiresOn ? `Vale hasta el ${util.formatDay(c.expiresOn)}` : 'No vence.')),
  });
  m.result.then((v) => ({ redeem: onRedeem, edit: onEdit, delete: onDelete, share: onShare, give: onGive })[v]?.(c));
}

function editor(existing, { onSaved }) {
  const isNew = !existing;
  const c = existing || { id: util.uuid(), kind: 'coupon', from: profile.active(), to: profile.partnerOf(profile.active()), sentAt: null };
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
  const save = async (give = false) => {
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
      if (give) rec.sentAt = util.nowISO();
      await db.put('content', rec);
      onSaved(rec, isNew, give);
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
    actions: isSaved(c) ? [
      { label: 'Cancelar', variant: 'ghost' },
      { label: 'Guardar', variant: 'secondary', onClick: () => save(false) },
      { label: 'Regalar', variant: 'primary', onClick: () => save(true) },
    ] : [
      { label: 'Cancelar', variant: 'ghost' },
      { label: 'Guardar cambios', variant: 'primary', onClick: () => save(false) },
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

  const gaveToast = (rec) => ui.toast(`Le regalaste “${rec.title}” a ${profile.name(toOf(rec))}.`, { tone: 'success', action: { label: 'Avisarle', onClick: () => share(rec) } });
  const openEditor = (c = null) => editor(c, {
    onSaved: async (rec, isNew, gave) => {
      if (gave) gaveToast(rec);
      else ui.toast(isSaved(rec) ? 'Cupón guardado. Lo regalas cuando quieras.' : 'Cupón guardado.', { tone: 'success' });
      if (isNew || gave) { tab = gave ? 'given' : 'saved'; saveTab(tab); }
      await load(); draw();
    },
  });

  const give = async (c) => {
    const yes = await ui.confirmDialog({ title: '¿Regalar este cupón?', message: `“${c.title}” le aparece a ${profile.name(toOf(c))} en "Para ti".`, confirmLabel: 'Regalar' });
    if (!yes) return;
    try {
      const rec = { ...c, sentAt: util.nowISO() };
      await db.put('content', rec);
      gaveToast(rec);
      tab = 'given'; saveTab(tab);
      await load(); draw();
    } catch (e) { console.error(e); ui.toast('No se pudo regalar. Inténtalo de nuevo.', { tone: 'error' }); }
  };

  const redeem = async (c) => {
    const yes = await ui.confirmDialog({ title: '¿Canjear este cupón?', message: `“${c.title}”. Queda marcado con la fecha y la hora de hoy.`, confirmLabel: 'Canjear' });
    if (!yes) return;
    try {
      await db.put('couponState', { id: c.id, couponId: c.id, redeemedAt: util.nowISO(), redeemedBy: profile.active() });
      justRedeemed = c.id;
      await load(); draw();
      ui.confetti(); util.haptic([10, 40, 20]); util.sound('chime');
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
    const partner = profile.name(profile.partnerOf(me));
    const received = coupons.filter((c) => toOf(c) === me && !isSaved(c) && !pending(c.title));
    // The ticket just redeemed stays in "Para ti" for this draw so its stamp can land.
    const mine = received.filter((c) => !states.has(c.id) || c.id === justRedeemed);
    const used = received.filter((c) => states.has(c.id));
    const given = coupons.filter((c) => fromOf(c) === me && !isSaved(c));
    const saved = coupons.filter((c) => fromOf(c) === me && isSaved(c));
    const rank = (c) => (states.has(c.id) ? 2 : isExpired(c) ? 3 : 1);
    const byDate = (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '');
    const numbering = (list) => new Map([...list].sort(byDate).map((c, i) => [c.id, i + 1]));
    const recvNo = numbering(received); const fromNo = numbering([...given, ...saved]);
    const free = mine.filter((c) => !states.has(c.id) && !isExpired(c)).length;
    const handlers = { onRedeem: redeem, onEdit: openEditor, onDelete: remove, onShare: share, onGive: give };
    const grid = (list, t, nos) => el('div', { class: 'kippu-grid' }, [...list].sort((a, b) => rank(a) - rank(b) || byDate(a, b)).map((c) => ticket(c, states.get(c.id), {
      tab: t, number: nos.get(c.id), onRedeem: redeem, onGive: give,
      onOpen: (x) => detail(x, states.get(x.id), { tab: t, number: nos.get(x.id), ...handlers }),
    })));

    const tabs = ui.segmented({
      label: 'Cupones', value: tab,
      options: [{ value: 'mine', label: free ? `Para ti (${free})` : 'Para ti' }, { value: 'given', label: 'Historial' }, { value: 'saved', label: saved.length ? `Guardados (${saved.length})` : 'Guardados' }],
      onChange: (v) => { tab = v; saveTab(v); draw(); },
    });
    tabs.classList.add('cupones-tabs');

    let content;
    if (tab === 'mine') {
      content = [
        el('p', { class: 'muted small cupones-summary' }, mine.length ? `${free === 1 ? 'Te queda 1 cupón' : `Te quedan ${free} cupones`} por canjear.` : ''),
        mine.length ? grid(mine, 'mine', recvNo)
          : ui.emptyState(used.length ? { title: 'Ya usaste todos tus cupones', text: `Están en "Historial". Cuando ${partner} te regale otro, aparece aquí.`, art: 'ticket' }
            : { title: 'Aún no tienes cupones', text: `Cuando ${partner} te regale uno, aparece aquí.`, art: 'ticket' }),
      ];
    } else if (tab === 'given') {
      const resetBtn = used.length
        ? el('div', { class: 'cupones-foot' }, el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: reset }, icon('repeat', { size: 18 }), 'Reiniciar cupones'))
        : null;
      content = !given.length && !used.length
        ? [ui.emptyState({ title: 'Todavía no hay historial', text: `Aquí quedan los cupones que le regalas a ${partner} y los que tú ya usaste.`, art: 'ticket', action: { label: 'Crear un cupón', onClick: () => openEditor() } })]
        : [
          el('h2', { class: 'card-kicker cartas-subtitle' }, 'Los que regalaste'),
          given.length ? [el('p', { class: 'muted small cupones-summary' }, `Para ${partner}.${given.some((c) => states.has(c.id)) ? ' Los canjeados llevan su sello.' : ''}`), grid(given, 'given', fromNo)]
            : el('p', { class: 'muted small cupones-summary' }, `Todavía no le regalas cupones a ${partner}.`),
          el('h2', { class: 'card-kicker cartas-subtitle' }, 'Los que usaste'),
          used.length ? grid(used, 'mine', recvNo) : el('p', { class: 'muted small cupones-summary' }, 'Cuando canjees un cupón, queda aquí con su sello.'),
          resetBtn,
        ];
    } else {
      content = saved.length
        ? [el('p', { class: 'muted small cupones-summary' }, `Solo tú los ves. Cuando quieras, tócale "Regalar" y le aparece a ${partner}.`), grid(saved, 'saved', fromNo)]
        : [ui.emptyState({ title: 'No tienes cupones guardados', text: `Crea un cupón y guárdalo para regalárselo a ${partner} en el momento justo.`, art: 'ticket', action: { label: 'Crear un cupón', onClick: () => openEditor() } })];
    }
    body.replaceChildren(tabs, ...[content].flat(2).filter(Boolean));
    if (justRedeemed) {
      const id = justRedeemed;
      justRedeemed = null;
      body.querySelector(`.kippu[data-id="${CSS.escape(id)}"] .hanko`)?.classList.add('hanko-stamp');
      // After the stamp, the coupon moves to "Historial".
      setTimeout(() => { if (tab === 'mine' && body.isConnected) draw(); }, util.prefersReducedMotion?.() ? 600 : 1600);
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
