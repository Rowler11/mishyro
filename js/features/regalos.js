// Regalos secretos (docs/05 Más §19). Decided 2026-11-20 with sync: each one keeps a wish list
// the other can see (name, link, estimated price in COP, category, note, photo). When you buy
// something from the other's list, that mark is a "Solo yo" record of yours: it only reaches your
// own devices (encrypted with your personal PIN if you have one), so the owner of the list never
// sees it and the surprise holds. When you give it, the wish shows as "Regalado" for both.
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import { compressImage, isQuotaError } from '../core/images.js';

const { el, icon } = util;
const TAB_KEY = 'aishiteru.regalos.tab';
const buyId = (giftId) => `buy:${giftId}`;
const safeLink = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };

function wishEditor(existing, { onSaved }) {
  const me = profile.active();
  const w = existing || { id: util.uuid(), kind: 'wish', wishOf: me, status: 'wished', visibility: 'shared', owner: 'both' };
  const name = ui.input({ value: w.name || '', maxlength: 80, placeholder: 'Ej.: Un libro de cocina japonesa' });
  const link = ui.input({ type: 'url', value: w.link || '', maxlength: 400, placeholder: 'https://… (opcional)', inputmode: 'url' });
  const price = ui.input({ type: 'number', min: '0', step: '1000', value: w.priceCOP || '', inputmode: 'numeric', placeholder: 'Opcional' });
  const note = ui.textarea({ rows: 2, maxlength: 400, placeholder: 'Talla, color, cualquier pista' }); note.value = w.note || '';
  const cats = CONFIG.giftCategories || [];
  let cat = w.categoryId || cats[0]?.id || '';
  const catSel = el('select', { class: 'input', 'aria-label': 'Categoría' }, cats.map((c) => el('option', { value: c.id, selected: c.id === cat }, c.name)));
  catSel.addEventListener('change', () => { cat = catSel.value; });
  let photo = null; let keep = w.mediaId || null; let url = null; let busy = false;
  const box = el('div', { class: 'letter-photo' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: `gf-${w.id.slice(0, 8)}` });
  const paint = async () => {
    if (!url && keep) { const b = await db.getMedia(keep).catch(() => null); if (b) url = URL.createObjectURL(b); }
    box.replaceChildren(url
      ? el('div', { class: 'photo-tile letter-photo-tile' }, el('img', { src: url, alt: 'Foto del regalo' }),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': 'Quitar la foto', onClick: () => { photo = null; keep = null; if (url) URL.revokeObjectURL(url); url = null; paint(); } }, icon('x', { size: 18 })))
      : el('label', { class: 'photo-add letter-photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', {}, 'Foto (opcional)')), file);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    busy = true; try { photo = await compressImage(f); keep = null; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(photo.blob); } catch { ui.toast('No pudimos leer esa foto.', { tone: 'error' }); }
    busy = false; paint();
  });
  paint();
  const fName = ui.field({ label: '¿Qué te gustaría?', control: name });
  const fLink = ui.field({ label: 'Enlace', control: link });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  return ui.openModal({
    title: existing ? 'Editar deseo' : 'Nuevo deseo', kind: 'sheet', size: 'md',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fName, ui.field({ label: 'Categoría', control: catSel }), ui.field({ label: 'Precio aproximado (COP)', control: price }), fLink, ui.field({ label: 'Nota', control: note }), box, err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      err.textContent = '';
      if (busy) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
      if (!name.value.trim()) { fName.setError('Escribe qué te gustaría.'); name.focus(); return false; }
      if (link.value.trim() && !safeLink(link.value.trim())) { fLink.setError('Pega un enlace que empiece por https://'); return false; }
      let created = null;
      try {
        const rec = { ...w, name: name.value.trim(), link: safeLink(link.value.trim()), priceCOP: Math.max(0, Math.round(Number(price.value) || 0)), categoryId: cat, note: note.value.trim() };
        if (photo) { created = await db.putMedia(photo.blob, { ownerStore: 'gifts', ownerId: w.id, width: photo.width, height: photo.height }); rec.mediaId = created; } else rec.mediaId = keep;
        await db.put('gifts', rec);
        if (existing?.mediaId && existing.mediaId !== rec.mediaId) await db.rawDelete('media', existing.mediaId).catch(() => {});
        onSaved(); return true;
      } catch (x) { if (created) await db.rawDelete('media', created).catch(() => {}); console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar.'; return false; }
    } }],
    onClose: () => { if (url) URL.revokeObjectURL(url); },
  });
}

export async function render() {
  const page = el('section', { class: 'page page-wide regalos' });
  const urls = new Set();
  const add = () => wishEditor(null, { onSaved: () => { ui.toast('Deseo agregado.', { tone: 'success' }); draw(); } });
  page.append(ui.pageHeader({ title: 'Regalos secretos', jp: '贈り物', romaji: 'okurimono', back: '/mas', actions: [ui.newButton('Deseo', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = 'suya';
  try { tab = localStorage.getItem(TAB_KEY) === 'mia' ? 'mia' : 'suya'; } catch { /* private mode */ }
  const catName = (id) => (CONFIG.giftCategories || []).find((c) => c.id === id)?.name || '';

  const mark = async (w, state) => {
    const me = profile.active();
    try {
      if (state === null) { await db.purge('gifts', buyId(w.id)); }
      else {
        await db.put('gifts', { id: buyId(w.id), kind: 'purchase', giftId: w.id, state, at: util.nowISO(), visibility: 'self', private: true, owner: me });
        if (state === 'given') { await db.put('gifts', { ...w, status: 'given', givenAt: util.localDay(), givenBy: me }); ui.confetti({ count: 24 }); }
        else security.offerPersonalPin(me, profile.name(profile.partnerOf(me)));
      }
      util.haptic(10); draw();
    } catch (x) { console.error(x); ui.toast(x?.code === 'LOCKED' ? 'Desbloquea tu espacio personal para guardar esta marca secreta.' : 'No se pudo guardar.', { tone: 'error' }); }
  };

  const card = (w, { own, purchase }) => {
    const pic = el('div', { class: 'gift-pic', 'aria-hidden': 'true' }, icon('gift', { size: 22 }));
    if (w.mediaId) db.getMedia(w.mediaId).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.add(u); pic.replaceChildren(el('img', { src: u, alt: '' })); } }).catch(() => {});
    const given = w.status === 'given';
    const state = given ? 'given' : purchase?.state || null;
    return el('li', { class: `card paper-card gift${given ? ' is-given' : ''}` },
      pic,
      el('div', { class: 'gift-main' },
        el('h3', { class: 'gift-name' }, w.name),
        el('p', { class: 'muted small' }, [catName(w.categoryId), w.priceCOP ? `~${util.formatCOP(w.priceCOP)}` : null].filter(Boolean).join(' · ')),
        w.note ? el('p', { class: 'small' }, w.note) : null,
        w.link ? el('a', { class: 'small gift-link', href: w.link, target: '_blank', rel: 'noopener noreferrer' }, icon('arrow-up-right', { size: 14 }), ' Ver enlace') : null,
        given ? el('p', { class: 'gift-state' }, icon('check', { size: 14 }), ' Regalado') : null,
        !own && !given ? el('div', { class: 'gift-buy' },
          el('span', { class: 'small' }, state === 'bought' ? 'Ya lo compraste. Solo tú lo ves.' : 'Nadie lo ha marcado desde tu teléfono.'),
          el('div', { class: 'card-actions' },
            state === 'bought'
              ? [ui.button({ label: 'Ya se lo di', iconName: 'gift', small: true, onClick: () => mark(w, 'given') }), ui.button({ label: 'Desmarcar', small: true, variant: 'ghost', onClick: () => mark(w, null) })]
              : ui.button({ label: 'Lo compré', iconName: 'check', small: true, onClick: () => mark(w, 'bought') }))) : null,
        own ? el('div', { class: 'card-actions' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${w.name}`, onClick: () => wishEditor(w, { onSaved: draw }) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${w.name}`, onClick: async () => {
            if (!(await ui.confirmDialog({ title: '¿Borrar este deseo?', message: `"${w.name}" sale de tu lista en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
            if (w.mediaId) await db.rawDelete('media', w.mediaId).catch(() => {});
            await db.purge('gifts', w.id); draw();
          } }, icon('trash-2', { size: 18 }))) : null));
  };

  const draw = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const me = profile.active(); const partner = profile.partnerOf(me);
    const all = (await db.query('gifts')).filter((g) => !g.deleted);
    const wishes = all.filter((g) => g.kind === 'wish');
    const purchases = new Map(all.filter((g) => g.kind === 'purchase' && g.owner === me).map((p) => [p.giftId, p]));
    const tabs = ui.segmented({ label: 'Lista', value: tab, options: [{ value: 'suya', label: `Lista de ${profile.name(partner)}` }, { value: 'mia', label: 'Mi lista' }], onChange: (v) => { tab = v; try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } draw(); } });
    tabs.classList.add('section-tabs');
    const own = tab === 'mia';
    const list = wishes.filter((w) => w.wishOf === (own ? me : partner)).sort((a, b) => (a.status === 'given') - (b.status === 'given') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    body.replaceChildren(tabs,
      el('p', { class: 'note-inline' }, icon('lock', { size: 18 }), el('span', {}, own
        ? `${profile.name(partner)} ve tu lista para darte ideas. Si compra algo, tú no te enteras hasta que te lo dé.`
        : `Lo que marques como comprado se queda solo en tus equipos: ${profile.name(partner)} no lo ve.`)),
      list.length ? el('ul', { class: 'gift-list' }, list.map((w) => card(w, { own, purchase: purchases.get(w.id) })))
        : ui.emptyState(own ? { title: 'Tu lista está vacía', text: 'Anota cosas que te gustarían, grandes o pequeñas.', art: 'omamori', action: { label: 'Agregar un deseo', onClick: add } }
          : { title: `${profile.name(partner)} aún no tiene deseos`, text: 'Cuando agregue algo en su teléfono, aparece aquí.', art: 'omamori' }));
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir los regalos', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (s === 'gifts') draw().catch(() => {}); });
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { off(); offP(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
