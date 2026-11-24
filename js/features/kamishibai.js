// Presentación kamishibai (docs/05 Detalles: Galería): the photos play one by one inside a small
// wooden paper-theatre, each new picture sliding in from the side like a card pulled out of the
// frame. Auto-advances every 5 s; pause, previous and next; Esc or "Cerrar" ends it. Videos are
// skipped. With "Reducir movimiento" the pictures just change, without sliding.
import { ui, util, db } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const STEP_MS = 5000;

/** items: [{ mediaId, title, date, sourceLabel }] (Galería's flat list). */
export function openShow(items) {
  const list = items.slice(0, 200);
  const urls = [];
  let i = 0; let playing = true; let timer = null; let alive = true;
  const frame = el('div', { class: 'kami-window' });
  const caption = el('p', { class: 'kami-caption', 'aria-live': 'polite' });
  const playBtn = el('button', { class: 'btn btn-secondary btn-small', type: 'button' });
  const paint = () => { util.fill(playBtn, icon(playing ? 'pause' : 'play', { size: 18 }), el('span', {}, playing ? 'Pausa' : 'Seguir')); };

  const show = async (n, dir = 1) => {
    let tries = 0;
    while (tries < list.length && alive) {
      i = (n + list.length) % list.length;
      const p = list[i];
      const blob = await db.getMedia(p.mediaId).catch(() => null);
      if (blob && blob.type.startsWith('image/')) {
        const u = URL.createObjectURL(blob); urls.push(u);
        const card = el('figure', { class: `kami-card${util.prefersReducedMotion() ? '' : dir > 0 ? ' from-right' : ' from-left'}` },
          el('img', { src: u, alt: p.title ? `${p.title}, ${fmtDay.format(util.parseDay(p.date))}` : `Foto del ${fmtDay.format(util.parseDay(p.date))}` }));
        const old = [...frame.children];
        frame.append(card);
        old.forEach((c) => { c.classList.add(dir > 0 ? 'to-left' : 'to-right'); setTimeout(() => c.remove(), 700); });
        caption.textContent = `${p.title || p.sourceLabel} · ${fmtDay.format(util.parseDay(p.date))}`;
        return;
      }
      n += dir; tries++;
    }
    if (!frame.children.length) caption.textContent = 'No hay fotos para mostrar (los videos no entran en la presentación).';
  };
  const schedule = () => { clearTimeout(timer); if (playing && list.length > 1) timer = setTimeout(async () => { await show(i + 1, 1); schedule(); }, STEP_MS); };
  const step = async (d) => { await show(i + d, d); schedule(); };
  playBtn.addEventListener('click', () => { playing = !playing; paint(); schedule(); });
  paint();

  const stage = el('div', { class: 'kami-stage' },
    el('div', { class: 'kami-theatre' },
      el('span', { class: 'kami-roof', 'aria-hidden': 'true' }),
      el('div', { class: 'kami-frame' }, frame, el('span', { class: 'kami-curtain kami-curtain-l', 'aria-hidden': 'true' }), el('span', { class: 'kami-curtain kami-curtain-r', 'aria-hidden': 'true' })),
      el('span', { class: 'kami-base', 'aria-hidden': 'true' })),
    caption,
    el('div', { class: 'kami-controls' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Foto anterior', onClick: () => step(-1) }, icon('chevron-left')),
      playBtn,
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Foto siguiente', onClick: () => step(1) }, icon('chevron-right'))));
  stage.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });

  const api = ui.openModal({
    title: 'Presentación', kind: 'viewer', size: 'full', className: 'kami',
    body: stage,
    onClose: () => { alive = false; clearTimeout(timer); urls.forEach((u) => URL.revokeObjectURL(u)); },
  });
  show(0, 1).then(schedule);
  return api;
}
