// Full-screen photo and video viewer (docs/05 Más §1): swipe or arrows to move, Esc, the close
// button or a swipe down to close. Items load lazily from the media store and their object URLs
// are revoked when the viewer closes. Shared by Galería, Mapa, Primeras veces and Álbum.
import { el, icon, fill, prefersReducedMotion } from './util.js';
import * as db from './db.js';
import { openModal, enso } from './ui.js';

/**
 * items: [{ mediaId, alt, caption, sub, href, hrefLabel }]. start: index to open on.
 * Returns the modal api.
 */
export function openViewer(items, start = 0) {
  const urls = [];
  const n = items.length;
  let index = Math.max(0, Math.min(n - 1, start));
  const track = el('div', { class: 'viewer-track', tabindex: '0', 'aria-label': 'Fotos; usa las flechas para moverte' });
  const counter = el('p', { class: 'viewer-count', 'aria-live': 'polite' });
  const caption = el('div', { class: 'viewer-caption' });
  const slides = items.map((it, i) => {
    const fig = el('figure', { class: 'viewer-slide', role: 'group', 'aria-roledescription': 'foto', 'aria-label': `${i + 1} de ${n}` },
      el('div', { class: 'viewer-loading', 'aria-hidden': 'true' }, enso({ cls: 'enso-loader is-light' })));
    fig.dataset.i = String(i);
    return fig;
  });
  track.append(...slides);
  const loaded = new Set();
  const load = async (i) => {
    if (i < 0 || i >= n || loaded.has(i)) return;
    loaded.add(i);
    const it = items[i];
    const blob = it.blob || (it.mediaId ? await db.getMedia(it.mediaId).catch(() => null) : null);
    const fig = slides[i];
    if (!blob) { fig.replaceChildren(el('div', { class: 'photo-missing' }, icon('image-off'), 'No disponible')); return; }
    const u = URL.createObjectURL(blob); urls.push(u);
    fig.replaceChildren(blob.type.startsWith('video/')
      ? el('video', { class: 'viewer-media', src: u, controls: true, playsinline: true, preload: 'metadata', 'aria-label': it.alt || 'Video' })
      : el('img', { class: 'viewer-media', src: u, alt: it.alt || '', decoding: 'async', draggable: 'false' }));
  };
  const paint = () => {
    resetZoom();
    counter.textContent = n > 1 ? `${index + 1} de ${n}` : '';
    const it = items[index] || {};
    fill(caption,
      it.caption ? el('p', { class: 'viewer-title' }, it.caption) : null,
      it.sub ? el('p', { class: 'viewer-sub' }, it.sub) : null,
      it.href ? el('a', { class: 'btn btn-secondary btn-small viewer-link', href: it.href, onClick: () => api.close(undefined, { silent: true }) }, icon('arrow-up-right', { size: 18 }), it.hrefLabel || 'Ver dónde está') : null);
    prev.disabled = index === 0; next.disabled = index === n - 1;
    slides.forEach((s, i) => { if (i !== index) s.querySelector('video')?.pause(); });
    [index, index + 1, index - 1].forEach(load);
  };
  const go = (i, smooth = true) => {
    index = Math.max(0, Math.min(n - 1, i));
    track.scrollTo({ left: slides[index].offsetLeft, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    paint();
  };
  const prev = el('button', { class: 'icon-btn viewer-nav viewer-prev', type: 'button', 'aria-label': 'Foto anterior', onClick: () => go(index - 1) }, icon('chevron-left'));
  const next = el('button', { class: 'icon-btn viewer-nav viewer-next', type: 'button', 'aria-label': 'Foto siguiente', onClick: () => go(index + 1) }, icon('chevron-right'));
  let scrollT = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== index) { index = i; paint(); }
    }, 80);
  }, { passive: true });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
  });
  // Pinch or double tap to zoom, drag to look around (v0.23.0). Swiping between photos works at normal size.
  let scale = 1; let tx = 0; let ty = 0; let pinch = null; let pan = null; let lastTap = 0;
  const zoomed = () => scale > 1.02;
  const cur = () => slides[index]?.querySelector('img.viewer-media');
  const clampPan = () => {
    const m = cur(); if (!m) return;
    const mx = (m.clientWidth * (scale - 1)) / 2; const my = (m.clientHeight * (scale - 1)) / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  };
  const applyZoom = () => {
    const m = cur(); if (!m) return;
    clampPan();
    m.style.transform = scale === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${scale})`;
    track.style.overflowX = zoomed() ? 'hidden' : '';
  };
  const resetZoom = () => { scale = 1; tx = 0; ty = 0; slides.forEach((sl) => { const m = sl.querySelector('img.viewer-media'); if (m) m.style.transform = ''; }); track.style.overflowX = ''; };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  track.addEventListener('touchstart', (e) => {
    if (!cur()) return;
    if (e.touches.length === 2) { pinch = { d: dist(e.touches), s: scale }; pan = null; }
    else if (e.touches.length === 1) {
      const t = e.touches[0]; const now = Date.now();
      if (now - lastTap < 300) { scale = zoomed() ? 1 : 2.5; tx = 0; ty = 0; applyZoom(); lastTap = 0; }
      else lastTap = now;
      if (zoomed()) pan = { x: t.clientX, y: t.clientY, tx, ty };
    }
  }, { passive: true });
  track.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) { e.preventDefault(); scale = Math.max(1, Math.min(4, pinch.s * (dist(e.touches) / pinch.d))); applyZoom(); }
    else if (pan && zoomed() && e.touches.length === 1) { e.preventDefault(); const t = e.touches[0]; tx = pan.tx + (t.clientX - pan.x); ty = pan.ty + (t.clientY - pan.y); applyZoom(); }
  }, { passive: false });
  track.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; if (!e.touches.length) { pan = null; if (!zoomed()) resetZoom(); } }, { passive: true });
  track.addEventListener('dblclick', () => { scale = zoomed() ? 1 : 2.5; tx = 0; ty = 0; applyZoom(); }); // mouse on the computer
  track.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); scale = Math.max(1, Math.min(4, scale * (e.deltaY < 0 ? 1.12 : 0.89))); applyZoom(); }, { passive: false });
  // Swipe down to close (only when the gesture is clearly vertical).
  let sx = 0; let sy = 0; let dragging = false;
  track.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || zoomed()) return; sx = e.clientX; sy = e.clientY; dragging = true; });
  track.addEventListener('pointermove', (e) => {
    if (!dragging || zoomed()) return;
    const dy = e.clientY - sy; const dx = Math.abs(e.clientX - sx);
    if (dy > 0 && dy > dx * 1.4) { track.style.transform = `translateY(${dy * 0.6}px)`; track.style.opacity = String(Math.max(0.4, 1 - dy / 500)); }
  });
  const end = (e) => {
    if (!dragging || zoomed()) { dragging = false; return; } dragging = false;
    const dy = e.clientY - sy; const dx = Math.abs(e.clientX - sx);
    track.style.transform = ''; track.style.opacity = '';
    if (dy > 110 && dy > dx * 1.4) api.close();
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', () => { dragging = false; track.style.transform = ''; track.style.opacity = ''; });

  const api = openModal({
    title: 'Fotos', kind: 'viewer', size: 'full', className: 'viewer',
    body: el('div', { class: 'viewer-stage' }, track, n > 1 ? [prev, next] : null, el('div', { class: 'viewer-bar' }, counter, caption)),
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
  requestAnimationFrame(() => { go(index, false); track.focus({ preventScroll: true }); });
  return api;
}
