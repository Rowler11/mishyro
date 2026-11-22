// Mapa de lugares (docs/05 Más §8): their shared places on a Leaflet map with OpenStreetMap tiles,
// and the same places as a list that works offline and in "Modo sin terceros".
// A place is added by tapping the map, with "Mi ubicación" (explicit permission) or by hand.
// "Dónde estoy" (decided with Fase A, 2026-11-20): a one-off snapshot that reaches the other phone
// through the app's encrypted sync. The sender picks the precision; the receiver picks how to see
// it (point, distance only, or nothing). It is never continuous tracking and can be deleted anytime.
import { ui, util, db, profile, security, sync } from '../core.js';
import { compressImage, isQuotaError, MAX_PHOTOS } from '../core/images.js';
import { openViewer } from '../core/viewer.js';
import { toTrash, TRASH_NOTE } from './papelera.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const BOGOTA = [4.6533, -74.0836];
const TAB_KEY = 'aishiteru.mapa.tab';
export const KINDS = [
  { value: 'cita', label: 'Cita' }, { value: 'comida', label: 'Comida' }, { value: 'viaje', label: 'Viaje' },
  { value: 'paseo', label: 'Paseo' }, { value: 'casa', label: 'Casa' }, { value: 'otro', label: 'Otro' },
];
export const PRECISIONS = [
  { value: 'exact', label: 'Exacta', hint: 'El punto donde estás.' },
  { value: 'approx', label: 'Aproximada', hint: 'Redondeada a unos 5 km.' },
  { value: 'city', label: 'Solo la ciudad', hint: 'Escribes la ciudad; el punto se redondea a unos 25 km.' },
];
export const VIEW_MODES = [
  { value: 'map', label: 'Ver el punto' },
  { value: 'distance', label: 'Solo la distancia' },
  { value: 'none', label: 'Nada' },
];

/** Rounds a position so the exact place can't be read back. approx ≈ 5 km, city ≈ 25 km. */
export function roundPosition(lat, lng, precision) {
  const step = precision === 'city' ? 0.25 : precision === 'approx' ? 0.05 : 0;
  if (!step) return { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
  const r = (v) => +(Math.round(v / step) * step).toFixed(3);
  return { lat: r(lat), lng: r(lng) };
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 20 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`);

export function agoMinutes(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

export const mapsLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// ---------- Leaflet, loaded only when the map is shown ----------
let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) document.head.append(el('link', { rel: 'stylesheet', href: 'vendor/leaflet/leaflet.css', dataset: { leaflet: '1' } }));
    const s = el('script', { src: 'vendor/leaflet/leaflet.js' });
    s.onload = () => resolve(window.L); s.onerror = () => { leafletP = null; reject(new Error('leaflet')); };
    document.head.append(s);
  });
  return leafletP;
}

export const pinIcon = (L, cls = '') => L.divIcon({ className: `map-pin ${cls}`.trim(), html: '<span class="map-pin-dot"></span>', iconSize: [30, 30], iconAnchor: [15, 28] });

// ---------- geolocation with explanation first ----------
export async function explainAndLocate({ title = 'Usar tu ubicación', text } = {}) {
  const ok = await ui.confirmDialog({ title, message: text || 'El teléfono te va a pedir permiso. La app lee tu posición una sola vez, aquí mismo, y no la manda a ningún lado.', confirmLabel: 'Continuar' });
  if (!ok) return null;
  if (!('geolocation' in navigator)) { ui.toast('Este navegador no puede leer la ubicación.', { tone: 'error' }); return null; }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => { ui.toast(e.code === 1 ? 'Sin permiso de ubicación. Puedes darlo en los ajustes del navegador.' : 'No pudimos leer tu ubicación. Inténtalo de nuevo.', { tone: 'error' }); resolve(null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

// ---------- place editor ----------
function placeEditor(existing, { at, onSaved }) {
  const isNew = !existing;
  const me = profile.active();
  const p = existing || { id: util.uuid(), by: me, date: util.localDay(), kind: 'cita', mediaIds: [], ...(at || {}) };
  const name = ui.input({ value: p.name || '', maxlength: 80, placeholder: 'Ej.: El café de la primera cita', autocomplete: 'off' });
  const date = ui.input({ type: 'date', value: p.date || '', max: util.localDay() });
  const note = ui.textarea({ rows: 3, maxlength: 1000, placeholder: '¿Qué pasó aquí?' });
  note.value = p.note || '';
  let kind = p.kind || 'cita';
  let pos = Number.isFinite(p.lat) ? { lat: p.lat, lng: p.lng } : null;
  const posText = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const paintPos = () => { posText.textContent = pos ? `Punto: ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : 'Sin punto en el mapa todavía.'; };
  paintPos();
  const slots = (p.mediaIds || []).map((id) => ({ mediaId: id }));
  let busy = false;
  const grid = el('ul', { class: 'photo-grid' });
  const file = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: `pp-${p.id.slice(0, 8)}` });
  const urls = [];
  const paint = async () => {
    const items = [];
    for (const [i, s] of slots.entries()) {
      if (!s.url) { const b = s.blob || await db.getMedia(s.mediaId).catch(() => null); if (b) { s.url = URL.createObjectURL(b); urls.push(s.url); } }
      items.push(el('li', { class: 'photo-tile' }, s.url ? el('img', { src: s.url, alt: `Foto ${i + 1}` }) : el('span', { class: 'photo-missing' }, icon('image-off')),
        el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': `Quitar la foto ${i + 1}`, onClick: () => { slots.splice(i, 1); paint(); } }, icon('x', { size: 18 }))));
    }
    if (slots.length < MAX_PHOTOS) items.push(el('li', {}, el('label', { class: 'photo-add', for: file.id }, icon('image-plus', { size: 24 }), el('span', { class: 'sr-only' }, 'Agregar fotos'))));
    grid.replaceChildren(...items);
  };
  file.addEventListener('change', async () => {
    const files = [...file.files].slice(0, MAX_PHOTOS - slots.length); file.value = '';
    busy = true;
    for (const f of files) { try { const c = await compressImage(f); slots.push({ blob: c.blob, width: c.width, height: c.height }); } catch { ui.toast('No pudimos leer una de las fotos.', { tone: 'error' }); } }
    busy = false; paint();
  });
  paint();
  const fName = ui.field({ label: 'Nombre del lugar', control: name });
  const fDate = ui.field({ label: 'Fecha', control: date, hint: 'Cuándo estuvieron ahí.' });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const save = async () => {
    err.textContent = '';
    if (busy) { err.textContent = 'Espera a que las fotos estén listas.'; return false; }
    if (!name.value.trim()) { fName.setError('Ponle un nombre.'); name.focus(); return false; }
    if (date.value && (!util.isValidDay(date.value) || date.value > util.localDay())) { fDate.setError('Elige una fecha de hoy o de antes.'); return false; }
    const created = [];
    try {
      const mediaIds = [];
      for (const s of slots) {
        if (s.mediaId) { mediaIds.push(s.mediaId); continue; }
        const id = await db.putMedia(s.blob, { ownerStore: 'places', ownerId: p.id, width: s.width, height: s.height, encryptScope: security.policy('places', p) || undefined });
        created.push(id); mediaIds.push(id);
      }
      const rec = { ...p, name: name.value.trim(), date: date.value || '', note: note.value.trim(), kind, mediaIds, lat: pos?.lat ?? null, lng: pos?.lng ?? null, visibility: 'shared', owner: 'both' };
      await db.put('places', rec);
      for (const old of p.mediaIds || []) if (!mediaIds.includes(old)) await db.rawDelete('media', old).catch(() => {});
      util.haptic(12);
      onSaved(rec, isNew);
      return true;
    } catch (x) {
      for (const id of created) await db.rawDelete('media', id).catch(() => {});
      console.error(x);
      err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para las fotos.' : 'No se pudo guardar. Lo que escribiste sigue aquí.';
      return false;
    }
  };
  return ui.openModal({
    title: isNew ? 'Nuevo lugar' : 'Editar lugar', kind: 'sheet', size: 'lg',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (ev) => ev.preventDefault() },
      fName,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Tipo'), ui.segmented({ label: 'Tipo de lugar', value: kind, options: KINDS, onChange: (v) => { kind = v; } })),
      fDate,
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Punto'), posText,
        ui.button({ label: pos ? 'Usar mi ubicación actual' : 'Usar mi ubicación', iconName: 'map-pin', small: true, onClick: async () => { const g = await explainAndLocate(); if (g) { pos = roundPosition(g.lat, g.lng, 'exact'); paintPos(); } } })),
      ui.field({ label: 'Nota', control: note }),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, `Fotos (hasta ${MAX_PHOTOS})`), grid, file),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: save }],
    onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  });
}

// ---------- "Dónde estoy" ----------
async function shareWhereIAm(onDone) {
  const me = profile.active();
  const partner = profile.name(profile.partnerOf(me));
  if (!sync.isLinked()) {
    ui.openModal({ title: 'Primero, unan los teléfonos', size: 'sm', body: el('p', {}, `"Dónde estoy" llega al teléfono de ${partner} por la sincronización cifrada. Únanlos en Ajustes > Sincronización y vuelve aquí.`),
      actions: [{ label: 'Ahora no', variant: 'ghost' }, { label: 'Ir a Sincronización', variant: 'primary', onClick: () => { location.hash = '#/ajustes/sincronizar'; } }] });
    return;
  }
  let precision = 'approx';
  const city = ui.input({ maxlength: 60, placeholder: 'Ej.: Bogotá', autocomplete: 'address-level2' });
  const fCity = ui.field({ label: 'Ciudad', control: city });
  fCity.hidden = true;
  const m = ui.openModal({
    title: 'Compartir dónde estoy', size: 'md',
    body: el('div', { class: 'stack' },
      el('p', {}, `Le llega a ${partner} una sola vez, con la hora. No es un seguimiento: si te mueves, no se actualiza. Puedes borrarlo cuando quieras.`),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, '¿Con cuánta precisión?'),
        ui.segmented({ label: 'Precisión', value: precision, options: PRECISIONS.map(({ value, label }) => ({ value, label })), onChange: (v) => { precision = v; fCity.hidden = v !== 'city'; hint.textContent = PRECISIONS.find((x) => x.value === v).hint; } })),
      el('p', { class: 'muted small', id: 'prec-hint' }, PRECISIONS[1].hint),
      fCity,
      el('p', { class: 'muted small' }, `${partner} elige cómo verlo: el punto, solo la distancia o nada. Si elige "solo la distancia", el dato aproximado igual llega a su teléfono, aunque la pantalla no lo muestre.`)),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Compartir', variant: 'primary', onClick: async () => {
      if (precision === 'city' && !city.value.trim()) { fCity.setError('Escribe la ciudad.'); return false; }
      return true;
    }, value: 'ok' }],
  });
  const hint = m.el.querySelector('#prec-hint');
  if ((await m.result) !== 'ok') return;
  const g = await explainAndLocate({ title: 'Permiso de ubicación', text: 'El teléfono te va a pedir permiso. La posición se redondea aquí mismo, antes de salir cifrada hacia el otro teléfono.' });
  if (!g) return;
  const r = roundPosition(g.lat, g.lng, precision);
  try {
    for (const old of await db.query('locationSnapshots')) if (old.by === me) await db.purge('locationSnapshots', old.id);
    await db.put('locationSnapshots', { id: util.uuid(), by: me, at: util.nowISO(), precision, city: precision === 'city' ? city.value.trim() : '', ...r, visibility: 'shared', owner: 'both' });
    ui.toast(`Listo. ${partner} lo verá en su Mapa.`, { tone: 'success' });
    onDone();
  } catch (e) { console.error(e); ui.toast('No se pudo compartir. Inténtalo de nuevo.', { tone: 'error' }); }
}

async function getViewMode() { return (await db.getSettings('locationView', { mode: '' })).mode; }

// ---------- page ----------
export async function render(ctx) {
  const page = el('section', { class: 'page page-wide mapa' });
  page.append(ui.pageHeader({ title: 'Mapa de lugares', jp: '地図', romaji: 'chizu', back: '/mas', actions: [ui.newButton('Lugar', () => openEditor(null, null))] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = 'mapa';
  // Always opens on the map tab (2026-11-22).
  let places = []; let snaps = []; let map = null; let markers = null; let myPos = null;
  const urls = new Set();
  const me = () => profile.active();

  const openEditor = (p, at) => placeEditor(p, { at, onSaved: (rec, isNew) => { ui.toast(isNew ? 'Lugar guardado.' : 'Cambios guardados.', { tone: 'success' }); load(); } });

  const remove = async (p) => {
    if (!(await ui.confirmDialog({ title: '¿Borrar este lugar?', message: `"${p.name}" y sus fotos. ${TRASH_NOTE}`, confirmLabel: 'Borrar', danger: true }))) return;
    await toTrash('places', p.id, { label: p.name, what: 'Lugar borrado', extraMedia: p.mediaIds || [], onRestored: load }); load();
  };

  const photosOf = (p) => (p.mediaIds || []).map((mediaId, i) => ({ mediaId, alt: `${p.name}, foto ${i + 1}`, caption: p.name, sub: p.date ? fmtDay.format(util.parseDay(p.date)) : '' }));

  const placeCard = (p) => {
    const thumb = el('span', { class: 'place-thumb', 'aria-hidden': 'true' }, icon('map-pin', { size: 22 }));
    if (p.mediaIds?.[0]) db.getMedia(p.mediaIds[0]).then((b) => { if (b) { const u = URL.createObjectURL(b); urls.add(u); thumb.replaceChildren(el('img', { src: u, alt: '' })); } }).catch(() => {});
    return el('li', { class: 'card paper-card place-card', dataset: { id: p.id } },
      thumb,
      el('div', { class: 'place-main' },
        el('h3', { class: 'place-name' }, p.name),
        el('p', { class: 'muted small' }, [KINDS.find((k) => k.value === p.kind)?.label, p.date ? fmtDay.format(util.parseDay(p.date)) : null].filter(Boolean).join(' · ')),
        p.note ? el('p', { class: 'place-note clamp-2' }, p.note) : null,
        el('div', { class: 'card-actions' },
          p.mediaIds?.length ? ui.button({ label: `Fotos (${p.mediaIds.length})`, iconName: 'image', small: true, onClick: () => openViewer(photosOf(p)) }) : null,
          Number.isFinite(p.lat) ? ui.button({ label: 'Abrir en Google Maps', iconName: 'arrow-up-right', small: true, variant: 'ghost', href: mapsLink(p) }) : null,
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${p.name}`, onClick: () => openEditor(p) }, icon('pencil', { size: 18 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${p.name}`, onClick: () => remove(p) }, icon('trash-2', { size: 18 })))));
  };

  const snapshotCard = async () => {
    const partner = profile.partnerOf(me());
    const mine = snaps.find((s) => s.by === me());
    const theirs = snaps.find((s) => s.by === partner);
    const pName = profile.name(partner);
    const mode = await getViewMode();
    const rows = [];
    if (theirs) {
      const where = theirs.precision === 'city' && theirs.city ? ` en ${theirs.city}` : '';
      rows.push(el('p', { class: 'snap-title' }, `Ubicación de ${pName}${where} (${agoMinutes(theirs.at)})`));
      if (!mode) {
        rows.push(el('p', { class: 'muted small' }, '¿Cómo quieres verla? Puedes cambiarlo después.'),
          el('div', { class: 'card-actions' }, VIEW_MODES.map((v) => ui.button({ label: v.label, small: true, onClick: async () => { await db.setSettings('locationView', { mode: v.value }); load(); } }))));
      } else if (mode === 'distance') {
        const from = myPos || (mine ? { lat: mine.lat, lng: mine.lng } : null);
        rows.push(from
          ? el('p', { class: 'snap-distance' }, `Están a unos ${formatKm(distanceKm(from, theirs))}`)
          : ui.button({ label: 'Calcular la distancia', iconName: 'map-pin', small: true, onClick: async () => { const g = await explainAndLocate({ text: 'Para medir la distancia, la app lee tu posición una vez. No se guarda ni se comparte.' }); if (g) { myPos = g; load(); } } }),
        el('p', { class: 'muted small' }, 'Ves solo la distancia. El dato aproximado está en tu teléfono aunque no se muestre.'));
      } else if (mode === 'none') {
        rows.push(el('p', { class: 'muted small' }, 'Elegiste no verla.'));
      } else {
        rows.push(el('p', { class: 'muted small' }, theirs.precision === 'exact' ? 'Es el punto exacto que compartió.' : 'Es un punto aproximado.'));
      }
      if (mode) rows.push(el('label', { class: 'snap-mode' }, el('span', { class: 'small muted' }, 'Ver: '),
        ui.segmented({ label: 'Cómo ver la ubicación', value: mode, options: VIEW_MODES, onChange: async (v) => { await db.setSettings('locationView', { mode: v }); load(); } })));
    }
    rows.push(mine
      ? el('div', { class: 'snap-mine' }, el('p', { class: 'small' }, `Compartiste dónde estabas ${agoMinutes(mine.at)} (${PRECISIONS.find((x) => x.value === mine.precision)?.label.toLowerCase()}).`),
        el('div', { class: 'card-actions' },
          ui.button({ label: 'Compartir de nuevo', iconName: 'map-pin', small: true, onClick: () => shareWhereIAm(load) }),
          ui.button({ label: 'Borrar', iconName: 'trash-2', small: true, variant: 'ghost', onClick: async () => { await db.purge('locationSnapshots', mine.id); ui.toast('Borrado en los dos teléfonos.'); load(); } })))
      : ui.button({ label: 'Compartir dónde estoy', iconName: 'map-pin', onClick: () => shareWhereIAm(load) }));
    return el('section', { class: 'card paper-card snap-card', 'aria-label': 'Dónde estamos' }, el('p', { class: 'card-kicker' }, 'Dónde estamos'), ...rows);
  };

  const mapBox = el('div', { class: 'map-box', role: 'region', 'aria-label': 'Mapa de sus lugares' });
  const drawMap = async () => {
    const allowed = await security.thirdPartyAllowed();
    if (!allowed || !navigator.onLine) {
      return el('div', { class: 'card paper-card map-off' }, icon('map', { size: 28 }),
        el('p', {}, !allowed ? 'El mapa usa OpenStreetMap, un servicio externo, y está activo el Modo sin terceros. Aquí tienen la lista.' : 'Sin conexión no se puede cargar el mapa. Aquí tienen la lista.'));
    }
    let L;
    try { L = await loadLeaflet(); } catch { return el('div', { class: 'card paper-card map-off' }, el('p', {}, 'No pudimos cargar el mapa. Aquí tienen la lista.')); }
    requestAnimationFrame(() => {
      if (!map) {
        map = L.map(mapBox, { zoomControl: true, attributionControl: true, tap: true }).setView(BOGOTA, 11);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© <a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">OpenStreetMap</a>' }).addTo(map);
        map.on('click', (e) => openEditor(null, { lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }));
        markers = L.layerGroup().addTo(map);
      }
      markers.clearLayers();
      const pts = [];
      for (const p of places.filter((x) => Number.isFinite(x.lat))) {
        pts.push([p.lat, p.lng]);
        L.marker([p.lat, p.lng], { icon: pinIcon(L), title: p.name, alt: p.name, keyboard: true }).addTo(markers)
          .on('click', () => { tab = 'lista'; saveTab(); draw().then(() => body.querySelector(`.place-card[data-id="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'center' })); });
      }
      getViewMode().then((mode) => {
        const theirs = snaps.find((s) => s.by === profile.partnerOf(me()));
        if (theirs && mode === 'map') {
          L.marker([theirs.lat, theirs.lng], { icon: pinIcon(L, 'map-pin-partner'), title: `${profile.name(theirs.by)} (${agoMinutes(theirs.at)})`, alt: profile.name(theirs.by) }).addTo(markers);
          if (theirs.precision !== 'exact') L.circle([theirs.lat, theirs.lng], { radius: theirs.precision === 'city' ? 15000 : 3500, className: 'map-snap-area' }).addTo(markers);
          pts.push([theirs.lat, theirs.lng]);
        }
        if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
        else if (pts.length) map.setView(pts[0], 14);
        map.invalidateSize();
      });
    });
    // "Diario de viaje" (chosen 2026-11-22): the map is a photo taped into their travel diary.
    return el('figure', { class: 'map-wrap map-polaroid' },
      el('span', { class: 'map-tape map-tape-l', 'aria-hidden': 'true' }), el('span', { class: 'map-tape map-tape-r', 'aria-hidden': 'true' }),
      mapBox,
      el('figcaption', { class: 'map-caption' }, el('span', {}, `Nuestros lugares · ${new Date().getFullYear()}`), el('span', { class: 'muted small' }, 'Toca el mapa para guardar un lugar.')));
  };
  const saveTab = () => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* private mode */ } };

  const draw = async () => {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear();
    const visited = places.length;
    const tabs = ui.segmented({ label: 'Vista', value: tab, options: [{ value: 'mapa', label: 'Mapa' }, { value: 'lista', label: 'Lista' }], onChange: (v) => { tab = v; saveTab(); draw(); } });
    tabs.classList.add('section-tabs');
    const list = places.length
      ? el('ul', { class: 'place-list' }, places.map(placeCard))
      : ui.emptyState({ title: 'Su primer lugar', text: 'La primera cita, el restaurante favorito, un viaje. Tóquenlo en el mapa o agréguenlo aquí.', art: 'torii', action: { label: 'Agregar un lugar', onClick: () => openEditor(null, null) } });
    const counter = el('p', { class: 'place-count' }, el('strong', {}, String(visited)), ` ${visited === 1 ? 'lugar guardado' : 'lugares guardados'}`);
    const stamp = (n, one, many) => el('li', { class: 'map-stamp' }, el('strong', {}, String(n)), el('span', {}, n === 1 ? one : many));
    const stamps = el('ul', { class: 'map-stamps', 'aria-label': 'Sus lugares en números' },
      stamp(visited, 'lugar', 'lugares'),
      stamp(places.filter((p) => p.mediaIds?.length).length, 'con fotos', 'con fotos'),
      stamp(places.filter((p) => p.kind === 'viaje').length, 'viaje', 'viajes'));
    if (tab === 'mapa') {
      const m = await drawMap();
      const off = m.classList.contains('map-off');
      util.fill(body, tabs, off ? counter : null, m, stamps, await snapshotCard(), places.length ? el('h2', { class: 'section-title' }, 'Su diario de lugares') : null, list);
      if (m.classList.contains('map-off')) { map?.remove(); map = null; }
    } else {
      map?.remove(); map = null;
      body.replaceChildren(tabs, await snapshotCard(), counter, list);
    }
  };

  const load = async () => {
    places = (await db.query('places')).filter((p) => !p.dream).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    snaps = (await db.query('locationSnapshots')).sort((a, b) => b.at.localeCompare(a.at));
    await draw();
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir el mapa', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const routeId = ctx?.params?.a;
  if (routeId) { tab = 'lista'; await draw(); body.querySelector(`.place-card[data-id="${CSS.escape(routeId)}"]`)?.scrollIntoView({ block: 'center' }); }
  const off = db.onChange((store) => { if (store === 'places' || store === 'locationSnapshots') load().catch(() => {}); });
  const offP = profile.onProfileChange(() => load());
  return { node: page, cleanup: () => { off(); offP(); map?.remove(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
