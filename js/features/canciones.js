// Canciones y Playlist (docs/05 §5, §11, Detalles: Canciones, Playlist).
// Songs are picked in Spotify and dedicated here: paste a link (or share it from Spotify to the
// app) and it reaches the other phone through sync (Fase A); sharing by WhatsApp stays as an option.
// The app never searches Spotify nor extracts audio: it only uses Spotify's official embed player,
// loaded when someone taps "Escuchar" and never in "Modo sin terceros". The public oEmbed fills
// the title when there is network; without it, they type it.
import { ui, util, db, profile, security, CONFIG } from '../core.js';
import * as time from '../core/time.js';

const { el, icon } = util;
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const TAB_KEY = `${CONFIG.storageKey}.canciones.tab`;
const readTab = () => { try { return localStorage.getItem(TAB_KEY) === 'playlist' ? 'playlist' : 'songs'; } catch { return 'songs'; } };
const saveTab = (v) => { try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } };
const TYPES = { track: 'Canción', album: 'Álbum', playlist: 'Playlist', episode: 'Episodio', show: 'Podcast', artist: 'Artista' };
const MAX_DEDICATION = 200;

/**
 * Validate a Spotify link and pull out its type and id. Accepts open.spotify.com links with
 * ?si= and a language prefix (/intl-es/), and spotify:track:… URIs. Anything else is refused.
 */
export function parseSpotify(input) {
  const s = String(input || '').trim();
  const uri = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/.exec(s);
  if (uri) return { type: uri[1], id: uri[2], url: `https://open.spotify.com/${uri[1]}/${uri[2]}` };
  const found = s.match(/https?:\/\/[^\s]+/);
  let u;
  try { u = new URL(found ? found[0] : s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname !== 'open.spotify.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] && /^intl-[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])) parts.shift();
  if (parts[0] === 'embed') parts.shift();
  const [type, id] = parts;
  if (!TYPES[type] || !/^[A-Za-z0-9]{10,40}$/.test(id || '')) return null;
  return { type, id, url: `https://open.spotify.com/${type}/${id}` };
}

/** Title from Spotify's public oEmbed. Null when offline, blocked or in "Modo sin terceros". */
async function oembedTitle(url) {
  if (!(await security.thirdPartyAllowed())) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.title === 'string' ? j.title.slice(0, 120) : null;
  } catch { return null; }
}

const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
// Tape colors come from the palette tokens --tape-0..5 (styles.css).
const tint = (s) => `var(--tape-${hash(s) % 6})`;
const songName = (s) => s.title || `${TYPES[s.type] || 'Canción'} de Spotify`;

/** A small cassette drawn in CSS; it spins while its player is open. */
function cassette(s, { big = false } = {}) {
  return el('span', { class: `cassette${big ? ' is-big' : ''}`, style: { '--tape': tint(s.spotifyId || s.id) }, 'aria-hidden': 'true' },
    el('span', { class: 'cassette-label' }), el('span', { class: 'cassette-reel l' }), el('span', { class: 'cassette-reel r' }));
}

/** Official Spotify player, created only when asked for. */
async function playerInto(box, s, host) {
  if (!(await security.thirdPartyAllowed())) {
    box.replaceChildren(el('p', { class: 'muted small' }, 'El reproductor está apagado por el Modo sin terceros. Puedes abrir la canción en Spotify.'));
    return;
  }
  const h = s.type === 'track' || s.type === 'episode' ? 152 : 352;
  box.replaceChildren(el('iframe', {
    class: 'spotify-frame', src: `https://open.spotify.com/embed/${s.type}/${s.spotifyId}`, title: `Reproductor de Spotify: ${songName(s)}`,
    width: '100%', height: String(h), loading: 'lazy', allow: 'encrypted-media; clipboard-write', referrerpolicy: 'no-referrer',
  }));
  host?.classList.add('is-playing');
}

const shareText = (s) => `${s.dedication ? `${s.dedication} ` : ''}🎵 ${s.url}`;

function editor({ prefill = '', onSaved }) {
  const me = profile.active(); const to = profile.partnerOf(me);
  const link = ui.input({ type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://open.spotify.com/track/…', value: prefill });
  const title = ui.input({ maxlength: 120, placeholder: 'Nombre de la canción y artista' });
  const ded = ui.textarea({ maxlength: MAX_DEDICATION, rows: 3, placeholder: `Unas palabras para ${profile.name(to)}` });
  const count = el('span', { class: 'muted small' }, `0/${MAX_DEDICATION}`);
  ded.addEventListener('input', () => { count.textContent = `${ded.value.length}/${MAX_DEDICATION}`; });
  const fLink = ui.field({ label: 'Enlace de Spotify', control: link, hint: 'En Spotify: Compartir > Copiar enlace. También puedes compartir la canción desde Spotify directo a esta app.' });
  const fTitle = ui.field({ label: 'Nombre (opcional)', control: title, hint: 'Si hay internet, lo llenamos solos.' });
  let parsed = null; let lastAsk = '';
  const check = async () => {
    parsed = parseSpotify(link.value);
    fLink.setError(link.value.trim() && !parsed ? 'Ese enlace no es de Spotify. Copia el enlace de open.spotify.com.' : '');
    if (parsed && parsed.url !== lastAsk && !title.value.trim()) {
      lastAsk = parsed.url;
      const t = await oembedTitle(parsed.url);
      if (t && !title.value.trim()) title.value = t;
    }
  };
  link.addEventListener('input', util.debounce(check, 300));
  if (prefill) check();
  return ui.openModal({
    title: `Dedicarle una canción a ${profile.name(to)}`, kind: 'sheet',
    body: el('form', { class: 'memory-form', novalidate: true, onSubmit: (e) => e.preventDefault() },
      fLink, fTitle, ui.field({ label: 'Dedicatoria', control: ded }), count,
      el('p', { class: 'muted small' }, `Le llega a ${profile.name(to)} en su app. Si no tienen la sincronización activa, usa "Enviar" para mandarle el enlace.`)),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Dedicar', variant: 'primary', onClick: async () => {
      await check();
      if (!parsed) { fLink.setError(link.value.trim() ? 'Ese enlace no es de Spotify. Copia el enlace de open.spotify.com.' : 'Pega el enlace de la canción.'); link.focus(); return false; }
      const rec = { url: parsed.url, type: parsed.type, spotifyId: parsed.id, title: title.value.trim(), dedication: ded.value.trim(), by: me, to, at: util.nowISO() };
      await db.put('songs', rec);
      util.haptic(12);
      onSaved(rec); return true;
    } }],
  });
}

/** Detail: the dedication types itself out, then the player and the actions. */
function detail(s, { onChange }) {
  const me = profile.active();
  const fav = !!s.favBy?.[me];
  const week = time.isoWeek();
  const isWeek = s.weekOf === week;
  const typed = el('p', { class: 'song-dedication', 'aria-live': 'off' });
  const host = el('div', { class: 'song-detail-art' }, cassette(s, { big: true }));
  const player = el('div', { class: 'song-player' }, ui.button({ label: 'Escuchar aquí', iconName: 'play', variant: 'primary', onClick: () => playerInto(player, s, host) }));
  const actions = [
    { label: fav ? 'Quitar favorita' : 'Favorita', variant: 'ghost', value: 'fav' },
    { label: s.pinned ? 'Dejar de fijar' : 'Nuestra canción', variant: 'ghost', value: 'pin' },
  ];
  if (s.by === me) actions.push({ label: isWeek ? 'Quitar de la semana' : 'De la semana', variant: 'ghost', value: 'week' });
  actions.push({ label: 'Enviar', variant: 'secondary', value: 'share' });
  const m = ui.openModal({
    title: songName(s), kind: 'sheet', className: 'song-detail', actions,
    body: el('div', { class: 'stack' },
      host,
      el('p', { class: 'muted small' }, `${TYPES[s.type] || 'Canción'} · de ${profile.name(s.by)} para ${profile.name(s.to || profile.partnerOf(s.by))} · ${fmtDate.format(new Date(s.at))}`),
      s.dedication ? typed : null,
      player,
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn btn-ghost btn-small', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, icon('music', { size: 16 }), el('span', {}, 'Abrir en Spotify')),
        s.by === me ? el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar esta canción?', message: songName(s), confirmLabel: 'Borrar', danger: true }))) return;
          await db.purge('songs', s.id); m.close(); onChange();
        } }, icon('trash-2', { size: 16 }), el('span', {}, 'Borrar')) : null)),
  });
  // Letter by letter (instant with reduced motion); the full text is there for screen readers.
  if (s.dedication) {
    typed.setAttribute('aria-label', s.dedication);
    if (util.prefersReducedMotion()) typed.textContent = `“${s.dedication}”`;
    else {
      const full = `“${s.dedication}”`; let i = 0;
      const tick = setInterval(() => { i++; typed.textContent = full.slice(0, i); if (i >= full.length || !typed.isConnected) clearInterval(tick); }, 35);
    }
  }
  m.result.then(async (v) => {
    if (!v) return;
    if (v === 'share') { ui.share({ text: shareText(s) }); return; }
    if (v === 'fav') { const favBy = { ...(s.favBy || {}) }; if (favBy[me]) delete favBy[me]; else favBy[me] = true; await db.put('songs', { ...s, favBy }, { userEdit: false }); }
    if (v === 'pin') {
      // Only one "Nuestra canción".
      if (!s.pinned) for (const o of await db.query('songs')) if (o.pinned && o.id !== s.id) await db.put('songs', { ...o, pinned: false }, { userEdit: false });
      await db.put('songs', { ...s, pinned: !s.pinned }, { userEdit: false });
    }
    if (v === 'week') {
      if (!isWeek) for (const o of await db.query('songs')) if (o.weekOf === week && o.by === me && o.id !== s.id) await db.put('songs', { ...o, weekOf: null }, { userEdit: false });
      await db.put('songs', { ...s, weekOf: isWeek ? null : week }, { userEdit: false });
    }
    onChange();
  });
}

function songRow(s, { onOpen }) {
  const me = profile.active();
  return el('li', {},
    el('button', { class: 'card paper-card song-row', type: 'button', onClick: () => onOpen(s) },
      cassette(s),
      el('span', { class: 'song-text' },
        el('span', { class: 'song-title' }, songName(s)),
        el('span', { class: 'muted small' }, `De ${profile.name(s.by)} · ${fmtDate.format(new Date(s.at))}`),
        s.dedication ? el('span', { class: 'song-ded clamp-2' }, `“${s.dedication}”`) : null),
      s.favBy?.[me] ? icon('star', { size: 18, cls: 'song-star', label: 'Favorita' }) : null));
}

/** Playlist cover drawn from the songs' colors (no images from outside). */
function cover(songs) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'playlist-cover'); svg.setAttribute('aria-hidden', 'true');
  const list = songs.slice(0, 8);
  const n = Math.max(1, list.length);
  list.forEach((s, i) => {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', '0'); r.setAttribute('y', String((i * 100) / n)); r.setAttribute('width', '100'); r.setAttribute('height', String(100 / n + 0.5));
    r.setAttribute('fill', tint(s.spotifyId || s.id));
    svg.append(r);
  });
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '18'); c.setAttribute('class', 'playlist-hole');
  svg.append(c);
  return svg;
}

async function linkSheet(current, onSaved) {
  const inp = ui.input({ type: 'url', value: current || '', placeholder: 'https://open.spotify.com/playlist/…' });
  const f = ui.field({ label: 'Enlace de su playlist colaborativa', control: inp, hint: 'Créenla en Spotify y peguen aquí el enlace. Vacío = sin botón.' });
  ui.openModal({
    title: 'Playlist en Spotify', kind: 'sheet', body: f,
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const v = inp.value.trim();
      const p = v ? parseSpotify(v) : null;
      if (v && (!p || p.type !== 'playlist')) { f.setError('Pega el enlace de una playlist de Spotify.'); return false; }
      await db.put('profile', { id: 'playlist', url: p ? p.url : '' });
      onSaved(); return true;
    } }],
  });
}

export async function render({ app, route }) {
  const page = el('section', { class: 'page canciones' });
  const prefill = route.path === '/canciones/nueva' && app.shareTarget ? [app.shareTarget.url, app.shareTarget.text, app.shareTarget.title].find((x) => parseSpotify(x)) || app.shareTarget.url || app.shareTarget.text || '' : '';
  if (prefill) app.shareTarget = null;
  let draw = () => {};
  const openEditor = (pre = '') => editor({ prefill: pre, onSaved: (rec) => {
    ui.toast(`Le dedicaste “${songName(rec)}” a ${profile.name(rec.to)}.`, { tone: 'success', action: { label: 'Enviar', onClick: () => ui.share({ text: shareText(rec) }) } });
    tab = 'songs'; saveTab(tab); draw();
  } });
  page.append(ui.pageHeader({ title: 'Canciones', jp: '歌', romaji: 'uta', back: '/mas', actions: [ui.newButton('Dedicar', () => openEditor())] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  let tab = readTab();
  let who = 'all'; let q = '';

  draw = async () => {
    let songs; let link;
    try {
      [songs, link] = await Promise.all([db.query('songs'), db.get('profile', 'playlist')]);
    } catch (e) {
      console.error(e);
      body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las canciones', text: 'Cierra y vuelve a abrir la app.', art: 'wave' }));
      return;
    }
    songs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    const playlistUrl = link?.url || CONFIG.sharedPlaylistUrl || '';
    const tabs = ui.segmented({ label: 'Canciones', value: tab, options: [{ value: 'songs', label: 'Dedicadas' }, { value: 'playlist', label: 'Playlist' }], onChange: (v) => { tab = v; saveTab(v); draw(); } });
    tabs.classList.add('cupones-tabs', 'section-tabs');
    const open = (s) => detail(s, { onChange: draw });
    let content;
    if (!songs.length) {
      content = [ui.emptyState({ title: 'Su primera canción', text: `Dedícale a ${profile.name(profile.partnerOf(profile.active()))} una canción de Spotify con unas palabras.`, art: 'fan', action: { label: 'Dedicar una canción', onClick: () => openEditor() } })];
    } else if (tab === 'songs') {
      const pinned = songs.find((s) => s.pinned);
      const week = songs.filter((s) => s.weekOf === time.isoWeek());
      const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const search = el('input', { class: 'input search-input', type: 'search', placeholder: 'Buscar por nombre o dedicatoria', 'aria-label': 'Buscar canciones', value: q });
      const list = el('ul', { class: 'song-list' });
      const paint = () => {
        const n = fold(q);
        const rows = songs.filter((s) => !n || fold(`${s.title} ${s.dedication}`).includes(n));
        list.replaceChildren(...(rows.length ? rows.map((s) => songRow(s, { onOpen: open })) : [el('li', { class: 'muted small' }, 'Ninguna canción coincide.')]));
      };
      search.addEventListener('input', util.debounce(() => { q = search.value; paint(); }, 150));
      paint();
      content = [
        pinned ? el('button', { class: 'card paper-card our-song', type: 'button', onClick: () => open(pinned) },
          cassette(pinned, { big: true }),
          el('span', { class: 'song-text' }, el('span', { class: 'card-kicker' }, 'Nuestra canción'), el('span', { class: 'song-title' }, songName(pinned)))) : null,
        week.map((s) => el('button', { class: 'card paper-card week-song', type: 'button', onClick: () => open(s) },
          icon('sparkles', { size: 18 }), el('span', { class: 'song-text' }, el('span', { class: 'card-kicker' }, `De la semana · de ${profile.name(s.by)}`), el('span', { class: 'song-title' }, songName(s))))),
        el('div', { class: 'search-box' }, icon('search', { size: 20, cls: 'search-icon' }), search),
        list,
      ];
    } else {
      const rows = songs.filter((s) => who === 'all' || s.by === who);
      const filter = ui.segmented({ label: 'Quién la envió', value: who, options: [{ value: 'all', label: 'Todas' }, { value: 'sofia', label: `De ${profile.name('sofia')}` }, { value: 'david', label: `De ${profile.name('david')}` }], onChange: (v) => { who = v; draw(); } });
      const random = () => { const s = rows[Math.floor(Math.random() * rows.length)]; if (s) open(s); };
      content = [
        el('section', { class: 'card paper-card playlist-head' },
          cover(rows.length ? rows : songs),
          el('div', { class: 'stack-tight' },
            el('span', { class: 'card-kicker' }, 'Su playlist'),
            el('p', { class: 'song-title' }, `${rows.length} ${rows.length === 1 ? 'canción' : 'canciones'}`),
            el('div', { class: 'btn-row' },
              ui.button({ label: 'Aleatoria para el camino', iconName: 'dices', variant: 'primary', small: true, onClick: random }),
              playlistUrl ? el('a', { class: 'btn btn-secondary btn-small', href: playlistUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('music', { size: 18 }), el('span', {}, 'Abrir en Spotify')) : null,
              el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => linkSheet(link?.url || '', draw) }, icon('pencil', { size: 16 }), el('span', {}, playlistUrl ? 'Cambiar enlace' : 'Enlazar playlist'))))),
        filter,
        el('ol', { class: 'song-list playlist-list' }, rows.map((s) => {
          const box = el('div', { class: 'song-player' });
          return el('li', { class: 'card paper-card playlist-row' },
            el('div', { class: 'playlist-row-top' },
              cassette(s),
              el('span', { class: 'song-text' }, el('span', { class: 'song-title' }, songName(s)), el('span', { class: 'muted small' }, `De ${profile.name(s.by)}`)),
              el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Escuchar ${songName(s)}`, onClick: (e) => { playerInto(box, s, e.currentTarget.closest('.playlist-row')); e.currentTarget.remove(); } }, icon('play'))),
            box);
        })),
      ];
    }
    body.replaceChildren(...[songs.length ? tabs : null, content].flat(3).filter(Boolean));
  };
  await draw();
  if (prefill) openEditor(prefill);
  const off = profile.onProfileChange(() => draw());
  return { node: page, cleanup: off };
}
