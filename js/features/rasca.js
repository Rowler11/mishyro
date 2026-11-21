// Rasca y gana (docs/05 Más §29): cards scratched with a finger or the mouse (Canvas) that reveal a
// prize from CONFIG.scratchPrizes. A card is given to the other one (optionally for a day, which shows
// in the Calendario) or won at milestones (a goal reached in the Alcancía, a week of a shared habit).
// The prize stays in a history and can become a coupon. Sparkles and a soft vibration when scratching.
import { ui, util, db, profile, CONFIG } from '../core.js';

const { el, icon } = util;

// ---------- pure helpers (unit-tested) ----------

/** Prize for a new card: one not used recently (the last `keep` prizes are avoided while possible). */
export function pickPrize(prizes, used = [], rnd = Math.random, keep = 8) {
  if (!prizes.length) return null;
  const recent = new Set(used.slice(-keep));
  const pool = prizes.filter((p) => !recent.has(p.id));
  const from = pool.length ? pool : prizes;
  return from[Math.floor(rnd() * from.length) % from.length];
}

/** Fraction (0-1) of transparent pixels in an RGBA buffer, sampling every `step` pixels. */
export function clearedRatio(data, step = 8) {
  let clear = 0; let n = 0;
  for (let i = 3; i < data.length; i += 4 * step) { n++; if (data[i] < 40) clear++; }
  return n ? clear / n : 0;
}

const prizesList = async () => {
  const fromStore = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('scratchPrize') }).catch(() => [])).filter((p) => !p.deleted && !p.hidden);
  return fromStore.length ? fromStore : (CONFIG.scratchPrizes || []);
};

/**
 * Create a card for `to`. origin: 'gift' | 'goal' | 'habit' | 'badge' | 'bingo' | 'reto30'. originKey avoids giving the
 * same milestone card twice (also across the two phones, since the id is deterministic).
 */
export async function createCard({ to, from = null, origin = 'gift', originKey = '', openOn = '', note = '' }) {
  const cards = (await db.query('scratchCards')).filter((c) => !c.deleted);
  const id = originKey ? `scratch:${originKey}:${to}` : util.uuid();
  if (originKey && cards.some((c) => c.id === id)) return null;
  const prize = pickPrize(await prizesList(), cards.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map((c) => c.prizeId));
  if (!prize) return null;
  const rec = { id, prizeId: prize.id, prizeText: prize.text, to, from, origin, originKey, openOn, note, scratchedAt: '', convertedCouponId: null, visibility: 'shared', owner: 'both' };
  await db.put('scratchCards', rec);
  return rec;
}

/** Milestone card for both (used by the Alcancía and Hábitos). Quiet if it already exists. */
export async function earnForBoth(originKey, origin) {
  const made = [];
  for (const p of profile.PEOPLE) { const c = await createCard({ to: p, origin, originKey }); if (c) made.push(c); }
  if (made.length) ui.toast('¡Ganaron una tarjeta de Rasca y gana cada uno!', { tone: 'success', action: { label: 'Raspar', onClick: () => { location.hash = '#/rasca'; } } });
  return made;
}

// ---------- scratch surface ----------
function scratchSurface(card, { onReveal }) {
  const wrap = el('div', { class: 'scratch' });
  const prize = el('div', { class: 'scratch-prize', 'aria-hidden': 'true' }, el('span', { class: 'scratch-kicker' }, 'Premio'), el('p', {}, card.prizeText));
  const canvas = el('canvas', { class: 'scratch-cover', role: 'img', 'aria-label': 'Tarjeta por raspar. Pasa el dedo o el mouse, o usa el botón Revelar.' });
  const sparkles = el('div', { class: 'scratch-sparkles', 'aria-hidden': 'true' });
  wrap.append(prize, canvas, sparkles);
  let done = false; let drawing = false; let last = null; let buzz = 0;
  const paint = () => {
    const r = wrap.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, '#C9A24A'); g.addColorStop(.5, '#EAD08A'); g.addColorStop(1, '#B98E36');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (let x = 0; x < canvas.width; x += 26 * dpr) for (let y = (x / (26 * dpr)) % 2 ? 13 * dpr : 0; y < canvas.height; y += 26 * dpr) { ctx.beginPath(); ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(80,50,10,.75)'; ctx.font = `600 ${16 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Raspa aquí', canvas.width / 2, canvas.height / 2);
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 34 * dpr;
    canvas._dpr = dpr;
  };
  const reveal = () => {
    if (done) return; done = true;
    canvas.classList.add('is-gone'); prize.removeAttribute('aria-hidden');
    util.haptic([15, 40, 15]); ui.confetti({ count: 20 });
    onReveal();
  };
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas._dpr, (e.clientY - r.top) * canvas._dpr]; };
  const sparkle = (e) => {
    if (util.prefersReducedMotion()) return;
    const r = wrap.getBoundingClientRect();
    const s = el('i', { style: { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` } });
    sparkles.append(s); setTimeout(() => s.remove(), 600);
  };
  const check = util.debounce(() => {
    if (done) return;
    const ctx = canvas.getContext('2d');
    if (clearedRatio(ctx.getImageData(0, 0, canvas.width, canvas.height).data) > 0.55) reveal();
  }, 120);
  canvas.addEventListener('pointerdown', (e) => { if (done) return; drawing = true; last = pt(e); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || done) return;
    const ctx = canvas.getContext('2d'); const p = pt(e);
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p;
    if (Math.random() < 0.35) sparkle(e);
    if (++buzz % 12 === 0) util.haptic(5);
    check();
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  requestAnimationFrame(paint);
  wrap.reveal = reveal;
  return wrap;
}

function scratchDialog(card, { onDone }) {
  let surface;
  const save = async () => { await db.put('scratchCards', { ...card, scratchedAt: util.nowISO() }); };
  const toCoupon = ui.button({ label: 'Convertir en cupón', iconName: 'ticket', onClick: async () => { await convert(card); m.close(); onDone(); } });
  toCoupon.hidden = true;
  surface = scratchSurface(card, { onReveal: async () => { await save(); toCoupon.hidden = false; revealBtn.hidden = true; ui.announce(`Premio: ${card.prizeText}`); } });
  const revealBtn = ui.button({ label: 'Revelar sin raspar', variant: 'ghost', small: true, onClick: () => surface.reveal() });
  const m = ui.openModal({
    title: 'Rasca y gana', size: 'sm', className: 'scratch-modal',
    body: el('div', { class: 'stack scratch-body' }, card.note ? el('p', { class: 'muted' }, card.note) : null, surface, el('div', { class: 'btn-row center-row' }, revealBtn, toCoupon)),
    onClose: () => onDone(),
  });
  return m;
}

async function convert(card) {
  const giver = card.from || profile.partnerOf(card.to);
  const coupon = { id: util.uuid(), kind: 'coupon', title: card.prizeText, description: 'Ganado en Rasca y gana.', dedication: '', expiresOn: null, from: giver, to: card.to, sentAt: util.nowISO(), fromScratch: card.id, visibility: 'shared', owner: 'both' };
  await db.put('content', coupon);
  await db.put('scratchCards', { ...card, scratchedAt: card.scratchedAt || util.nowISO(), convertedCouponId: coupon.id });
  ui.toast('Ya está en la Cuponera.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/cupones'; } } });
}

function giftDialog({ onSaved }) {
  const me = profile.active(); const to = profile.partnerOf(me);
  const date = ui.input({ type: 'date', min: util.localDay() });
  const note = ui.input({ maxlength: 100, placeholder: 'Ej.: Por aguantarme esta semana' });
  return ui.openModal({
    title: `Regalarle una tarjeta a ${profile.name(to)}`, size: 'sm',
    body: el('div', { class: 'stack' }, el('p', {}, 'El premio sale al azar. Ni tú lo sabes.'),
      ui.field({ label: 'Para un día (opcional)', control: date, hint: 'Se puede raspar desde ese día y aparece en el Calendario.' }),
      ui.field({ label: 'Mensaje (opcional)', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Regalar', variant: 'primary', onClick: async () => {
      if (date.value && !util.isValidDay(date.value)) return false;
      const c = await createCard({ to, from: me, origin: 'gift', openOn: date.value, note: note.value.trim() });
      if (!c) { ui.toast('No hay premios: agrégalos en la lista de premios.'); return false; }
      if (date.value) await db.put('events', { id: `ev:${c.id}`, by: me, title: `Rasca y gana para ${profile.name(to)}`, start: date.value, place: '', note: '', remind: 'none', fromScratch: c.id });
      ui.toast(`Tarjeta lista para ${profile.name(to)}.`, { tone: 'success' }); onSaved(); return true;
    } }],
  });
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide rasca' });
  const me = profile.active();
  page.append(ui.pageHeader({ title: 'Rasca y gana', jp: '当たり', romaji: 'atari', back: '/mas', actions: [ui.newButton('Regalar', () => giftDialog({ onSaved: load }), 'gift')] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const ORIGIN = { gift: 'Regalo', goal: 'Meta cumplida', habit: 'Racha de un hábito', badge: 'Insignia', bingo: 'Bingo de citas', reto30: 'Desafío de 30 días' };

  const load = async () => {
    const cards = (await db.query('scratchCards')).filter((c) => !c.deleted);
    const today = util.localDay();
    const mine = cards.filter((c) => c.to === me);
    const toScratch = mine.filter((c) => !c.scratchedAt).sort((a, b) => (a.openOn || '').localeCompare(b.openOn || ''));
    const history = mine.filter((c) => c.scratchedAt).sort((a, b) => b.scratchedAt.localeCompare(a.scratchedAt));
    const sent = cards.filter((c) => c.from === me && c.to !== me && !c.scratchedAt);
    body.replaceChildren(
      el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Para raspar'),
        toScratch.length ? el('ul', { class: 'scratch-grid' }, toScratch.map((c) => {
          const locked = !!(c.openOn && c.openOn > today);
          return el('li', {}, el('button', { class: `scratch-ticket${locked ? ' is-locked' : ''}`, type: 'button', disabled: locked, onClick: () => scratchDialog(c, { onDone: load }) },
            icon(locked ? 'lock' : 'wand-sparkles', { size: 26 }),
            el('strong', {}, locked ? `Desde el ${util.formatDay(c.openOn)}` : 'Raspar'),
            el('span', { class: 'small' }, c.from ? `De ${profile.name(c.from)}` : ORIGIN[c.origin] || ''),
            c.note ? el('span', { class: 'small muted' }, c.note) : null));
        })) : ui.emptyState({ title: 'Nada por raspar', text: 'Se ganan al cumplir una meta de la Alcancía o una semana de un hábito, o te las regala tu pareja.', art: 'omamori' })),
      sent.length ? el('p', { class: 'muted small' }, `${sent.length} ${sent.length === 1 ? 'tarjeta regalada espera' : 'tarjetas regaladas esperan'} a que ${profile.name(profile.partnerOf(me))} las raspe.`) : null,
      el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Premios ganados'),
        history.length ? el('ul', { class: 'card pet-list scratch-history' }, history.map((c) => el('li', { class: 'pet-row' }, icon('sparkles', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, c.prizeText), el('p', { class: 'muted small' }, [ORIGIN[c.origin], c.from ? `de ${profile.name(c.from)}` : '', util.formatDay(c.scratchedAt.slice(0, 10))].filter(Boolean).join(' · '))),
          c.convertedCouponId ? el('span', { class: 'badge badge-ok' }, 'Cupón') : ui.button({ label: 'A cupón', iconName: 'ticket', small: true, variant: 'ghost', onClick: async () => { await convert(c); load(); } })))) : el('p', { class: 'muted' }, 'Lo que raspen queda aquí y se puede volver cupón.')));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir Rasca y gana', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'scratchCards' && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
