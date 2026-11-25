// Foto del día (v0.28.0, idea 16): each one may share one photo a day. They show side by side on
// Inicio; the other's photo stays face down until you share yours, so it is an exchange, never a
// way to check on anyone. One shared 'streaks' record per person and day (type 'dayphoto').
import { ui, util, db, profile } from '../core.js';
import { compressImage } from '../core/images.js';

const { el, icon } = util;
const idOf = (day, who) => `dayphoto:${day}:${who}`;

async function save(file, onDone) {
  const day = util.localDay(); const me = profile.active(); const id = idOf(day, me);
  try {
    const p = await compressImage(file);
    const old = await db.get('streaks', id).catch(() => null);
    const mediaId = await db.putMedia(p.blob, { ownerStore: 'streaks', ownerId: id, width: p.width, height: p.height });
    await db.put('streaks', { id, type: 'dayphoto', by: me, day, mediaId, at: util.nowISO(), visibility: 'shared', owner: 'both' });
    if (old?.mediaId && old.mediaId !== mediaId) await db.rawDelete('media', old.mediaId).catch(() => {});
    util.haptic('success'); ui.toast('Tu foto del día quedó lista.', { tone: 'success' });
    onDone?.();
  } catch (e) { console.error(e); ui.toast('No se pudo guardar esa foto.', { tone: 'error' }); }
}

async function img(rec, alt, bag) {
  const b = rec?.mediaId ? await db.getMedia(rec.mediaId).catch(() => null) : null;
  if (!b) return null;
  const u = URL.createObjectURL(b); bag.add(u);
  return el('img', { class: 'dayphoto-img', src: u, alt, loading: 'lazy', decoding: 'async' });
}

/** Card for Inicio: your photo and theirs, side by side. */
export async function homeCard({ onChange } = {}) {
  const day = util.localDay(); const me = profile.active(); const other = profile.partnerOf(me);
  const [mine, theirs] = await Promise.all([db.get('streaks', idOf(day, me)).catch(() => null), db.get('streaks', idOf(day, other)).catch(() => null)]);
  const bag = new Set();
  const input = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `dayphoto-${day}` });
  input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; if (f) save(f, onChange); });
  const pick = (label) => el('label', { class: 'dayphoto-slot dayphoto-add', for: input.id }, icon('image-plus', { size: 26 }), el('span', {}, label));
  const mineNode = mine ? el('label', { class: 'dayphoto-slot', for: input.id, title: 'Cambiar tu foto' }, await img(mine, 'Tu foto del día', bag), el('span', { class: 'dayphoto-who' }, 'Tú')) : pick('Comparte tu foto de hoy');
  const theirName = profile.nick(other) || profile.name(other) || 'Tu pareja';
  const theirsNode = theirs
    ? (mine ? el('figure', { class: 'dayphoto-slot' }, await img(theirs, `Foto del día de ${theirName}`, bag), el('figcaption', { class: 'dayphoto-who' }, theirName))
      : el('div', { class: 'dayphoto-slot dayphoto-hidden' }, icon('lock', { size: 22 }), el('span', {}, `${theirName} ya compartió la suya. Comparte la tuya para verla.`)))
    : el('div', { class: 'dayphoto-slot dayphoto-wait' }, el('span', {}, `La de ${theirName} aparece aquí cuando la comparta.`));
  const card = el('section', { class: 'home-card dayphoto-card', 'aria-labelledby': 'dayphoto-title' },
    el('h2', { class: 'card-kicker', id: 'dayphoto-title' }, 'Foto del día'),
    el('div', { class: 'dayphoto-row' }, mineNode, theirsNode), input);
  // free the object URLs when the card leaves the page
  const mo = new MutationObserver(() => { if (!card.isConnected) { bag.forEach((u) => URL.revokeObjectURL(u)); mo.disconnect(); } });
  setTimeout(() => card.isConnected && mo.observe(document.body, { childList: true, subtree: true }), 0);
  return card;
}
