// Resumen del año y Wrapped (docs/05 Más §12). A "moment" (decided 2026-11-19): it is not listed in
// Más; Inicio shows a notice only when it applies (end of month, end of year and the anniversary
// for the Wrapped) and from there they can go back to earlier ones. Stories are full-screen cards
// drawn on a canvas, so what they see is exactly what they share: each card exports as PNG (Web
// Share when the phone allows it) and an optional short video is recorded on the device (Canvas +
// MediaRecorder, no outside service). Never counts the cycle, the Rincón, the personal space nor
// anything "Solo yo" or private (countable() in insignias.js).
import { ui, util, db, profile } from '../core.js';
import { countable, activityDays, computeStreak } from './insignias.js';
import { collectPhotos } from './galeria.js';
import { relationshipYears } from './album.js';

const { el, icon } = util;
const W = 1080; const H = 1920;
const SEEN_KEY = 'resumenSeen';
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const fmtMonthOnly = new Intl.DateTimeFormat('es-CO', { month: 'long' });
const fmtNum = new Intl.NumberFormat('es-CO');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

// ---------- periods ----------
export function monthPeriod(y, m) {
  return { kind: 'month', id: `m:${y}-${pad(m)}`, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOf(y, m))}`, label: cap(fmtMonth.format(new Date(y, m - 1, 1))), short: cap(fmtMonthOnly.format(new Date(y, m - 1, 1))) };
}
export const yearPeriod = (y) => ({ kind: 'year', id: `y:${y}`, from: `${y}-01-01`, to: `${y}-12-31`, label: `Año ${y}`, short: String(y) });
export function wrappedPeriods(start, today = util.localDay()) {
  if (!util.isValidDay(start)) return [];
  return relationshipYears(start, [], today).map((r) => ({ kind: 'wrapped', id: `w:${r.index}`, index: r.index, from: r.from, to: r.to, label: `Wrapped · año ${r.index} juntos`, short: `${r.from.slice(0, 4)}–${r.to.slice(0, 4)}` }));
}

/** Every period they can open, newest first: months and years since they started (or this year). */
export function allPeriods(start, today = util.localDay()) {
  const t = util.parseDay(today);
  const s = util.isValidDay(start) ? util.parseDay(start) : new Date(t.getFullYear(), 0, 1);
  const months = []; let y = t.getFullYear(); let m = t.getMonth() + 1;
  while ((y > s.getFullYear() || (y === s.getFullYear() && m >= s.getMonth() + 1)) && months.length < 60) { months.push(monthPeriod(y, m)); m--; if (!m) { m = 12; y--; } }
  const years = []; for (let yy = t.getFullYear(); yy >= s.getFullYear(); yy--) years.push(yearPeriod(yy));
  return { month: months, year: years, wrapped: wrappedPeriods(start, today) };
}

/**
 * The period Inicio should announce today, or null. End of month (last 2 days and first 3 of the
 * next), end of year (Dec 28 to Jan 7) and the Wrapped from the anniversary for 10 days.
 */
export function periodDueOn(today, start) {
  const t = util.parseDay(today); const y = t.getFullYear(); const m = t.getMonth() + 1; const d = t.getDate();
  if (util.isValidDay(start)) {
    const done = wrappedPeriods(start, today).filter((p) => p.to < today).sort((a, b) => b.index - a.index)[0];
    if (done && util.daysBetween(util.parseDay(done.to), t) <= 10) return done;
  }
  if ((m === 12 && d >= 28)) return yearPeriod(y);
  if (m === 1 && d <= 7) return yearPeriod(y - 1);
  if (d >= lastDayOf(y, m) - 1) return monthPeriod(y, m);
  if (d <= 3) return m === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, m - 1);
  return null;
}

export async function homeRow(today = util.localDay()) {
  const p = periodDueOn(today, profile.startDay());
  if (!p) return null;
  const seen = (await db.getSettings(SEEN_KEY, { ids: [] })).ids || [];
  if (seen.includes(p.id)) return null;
  const title = p.kind === 'wrapped' ? `Su Wrapped del año ${p.index} juntos` : p.kind === 'year' ? `Su resumen del ${p.short}` : `Su resumen de ${p.short.toLowerCase()}`;
  return { href: `#/resumen/${encodeURIComponent(p.id)}`, icon: 'sparkles', title, sub: 'Unas historias con lo que vivieron.' };
}
async function markSeen(id) {
  const cur = (await db.getSettings(SEEN_KEY, { ids: [] })).ids || [];
  if (!cur.includes(id)) await db.setSettings(SEEN_KEY, { ids: [...cur, id].slice(-80) });
}

// ---------- stats ----------
async function rows(store) { try { return (await db.query(store)).filter(countable); } catch { return []; } }
const dayOf = (v) => String(v || '').slice(0, 10);
const inRange = (p) => (v) => { const d = dayOf(v); return util.isValidDay(d) && d >= p.from && d <= p.to; };

/** Numbers of a period. Pure data, no DOM: also used by the tests. */
export async function stats(p, today = util.localDay()) {
  const inP = inRange(p);
  const end = p.to < today ? p.to : today;
  const start = profile.startDay();
  const s = {};
  s.days = util.isValidDay(start) && start <= end ? util.daysBetween(util.parseDay(start), util.parseDay(end)) : 0;
  s.memories = (await rows('memories')).filter((r) => inP(r.date)).length;
  const photos = (await collectPhotos().catch(() => [])).filter((x) => inP(x.date));
  s.photos = photos.length; s.photoIds = photos.slice(0, 3).map((x) => x.mediaId);
  const qd = await rows('questionsDaily');
  s.answers = qd.filter((r) => r.kind === 'answer' && inP(r.date)).length;
  s.favQuestion = {};
  for (const who of [profile.active(), profile.partnerOf(profile.active())]) {
    const f = qd.filter((r) => r.kind !== 'answer' && r.favBy?.[who] && r.text && inP(r.date)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (f) s.favQuestion[who] = f.text;
  }
  const days = new Set([...(await activityDays())].filter((d) => d >= p.from && d <= end));
  s.streak = computeStreak(days, end).best;
  s.coupons = (await rows('couponState')).filter((r) => inP(r.redeemedAt)).length;
  const songs = (await rows('songs')).filter((r) => inP(r.at));
  s.songs = songs.length;
  const byTitle = new Map();
  for (const x of songs) { const k = x.spotifyId || x.title; if (!k) continue; const e = byTitle.get(k) || { title: x.title || 'Una canción', n: 0, at: '' }; e.n++; e.at = x.at > e.at ? x.at : e.at; byTitle.set(k, e); }
  s.topSong = [...byTitle.values()].sort((a, b) => b.n - a.n || b.at.localeCompare(a.at))[0]?.title || '';
  s.places = (await rows('places')).filter((r) => inP(r.date || r.createdAt)).length;
  s.badges = (await rows('badges')).filter((r) => inP(r.unlockedAt)).length;
  const dateHistory = (await rows('dateIdeasState')).flatMap((r) => r.history || []).filter((h) => inP(h.doneAt)).length;
  const calendarDates = (await rows('events')).filter((r) => inP(r.start) && dayOf(r.start) <= today).length;
  const menus = (await rows('dateMenus')).filter((r) => inP(r.date)).length;
  s.dates = dateHistory + calendarDates + menus;
  s.dreams = (await rows('dreams')).filter((r) => r.status === 'done' && inP(r.doneAt)).length;
  s.plans = (await rows('bucketList')).filter((r) => r.done && inP(r.doneAt)).length;
  s.voice = (await rows('voiceNotes')).filter((r) => inP(r.at)).length;
  s.gratitude = (await rows('gratitude')).filter((r) => inP(r.at)).length;
  s.firsts = (await rows('firsts')).filter((r) => !r.skipped && inP(r.date)).length;
  s.saved = (await rows('savingsEntries')).filter((r) => inP(r.date)).reduce((t, r) => t + (r.type === 'withdraw' ? -1 : 1) * (Number(r.amount) || 0), 0);
  s.goals = (await rows('savingsGoals')).filter((r) => r.status === 'done' && inP(r.doneAt || r.updatedAt)).length;
  // Fase 4B: Hogar (never the cycle nor its private layer).
  s.cooked = (await rows('recipes')).flatMap((r) => r.cooked || []).filter((c) => inP(c.date)).length;
  s.homeMenus = menus;
  s.petMoments = (await rows('petRecords')).filter((r) => r.type === 'moment' && inP(r.date)).length;
  // Fase 5: games played (real ones in the Liga too) and minutes in Modo juntos.
  const games = (await rows('games')).filter((r) => inP(r.date || r.endedAt));
  s.games = games.filter((r) => r.gameId !== 'juntos').length;
  s.togetherMin = games.filter((r) => r.gameId === 'juntos').reduce((n, r) => n + (Number(r.minutes) || 0), 0);
  s.prizes = (await rows('scratchCards')).filter((r) => r.scratchedAt && inP(r.scratchedAt)).length;
  const reasons = (await rows('content')).filter((r) => r.kind === 'reason' && r.text);
  s.reason = reasons.length ? reasons[Math.floor(Math.random() * reasons.length)].text : '';
  return s;
}

const plural = (n, one, many) => `${fmtNum.format(n)} ${n === 1 ? one : many}`;

/** The story cards of a period: only the ones with something to say. */
export function cards(p, s) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const full = p.kind !== 'month';
  const out = [{ key: 'intro', kicker: p.kind === 'wrapped' ? `Año ${p.index} juntos` : p.label, value: p.kind === 'wrapped' ? 'Wrapped' : p.kind === 'year' ? `Su ${p.short}` : p.short, label: p.kind === 'month' ? 'en historias' : 'Lo que vivieron juntos', sub: s.days ? `${plural(s.days, 'día', 'días')} juntos` : '', big: false }];
  const add = (cond, c) => { if (cond) out.push(c); };
  add(s.memories, { key: 'memories', kicker: 'Recuerdos', value: fmtNum.format(s.memories), label: s.memories === 1 ? 'recuerdo guardado' : 'recuerdos guardados', sub: 'en la Cápsula' });
  add(s.photos, { key: 'photos', kicker: 'Fotos', value: fmtNum.format(s.photos), label: s.photos === 1 ? 'foto' : 'fotos', sub: 'de los dos', photos: s.photoIds });
  add(s.answers, { key: 'answers', kicker: 'Preguntas', value: fmtNum.format(s.answers), label: s.answers === 1 ? 'respuesta' : 'respuestas', sub: 'para conocerse un poco más' });
  if (full) for (const who of [me, partner]) add(s.favQuestion[who], { key: `fav-${who}`, kicker: `La pregunta favorita de ${profile.name(who)}`, value: '', label: '', quote: s.favQuestion[who] });
  add(s.streak > 1, { key: 'streak', kicker: 'Racha', value: fmtNum.format(s.streak), label: 'días seguidos', sub: 'su mejor racha' });
  add(s.dates, { key: 'dates', kicker: 'Citas', value: fmtNum.format(s.dates), label: s.dates === 1 ? 'cita juntos' : 'citas juntos', sub: 'del calendario y las sugerencias' });
  add(s.songs, { key: 'songs', kicker: 'Canciones', value: fmtNum.format(s.songs), label: s.songs === 1 ? 'canción dedicada' : 'canciones dedicadas', sub: full && s.topSong ? `La más dedicada: ${s.topSong}` : '' });
  add(s.places, { key: 'places', kicker: 'Lugares', value: fmtNum.format(s.places), label: s.places === 1 ? 'lugar nuevo' : 'lugares nuevos', sub: 'en su mapa' });
  add(s.firsts, { key: 'firsts', kicker: 'Primeras veces', value: fmtNum.format(s.firsts), label: s.firsts === 1 ? 'primera vez' : 'primeras veces', sub: 'para el álbum' });
  add(s.coupons, { key: 'coupons', kicker: 'Cuponera', value: fmtNum.format(s.coupons), label: s.coupons === 1 ? 'cupón canjeado' : 'cupones canjeados', sub: '' });
  add(s.gratitude, { key: 'gratitude', kicker: 'Gratitud', value: fmtNum.format(s.gratitude), label: s.gratitude === 1 ? 'nota de gracias' : 'notas de gracias', sub: 'en el frasco' });
  add(s.plans || s.dreams, { key: 'dreams', kicker: 'Planes y sueños', value: fmtNum.format(s.plans + s.dreams), label: 'cumplidos', sub: [s.plans ? plural(s.plans, 'plan', 'planes') : '', s.dreams ? plural(s.dreams, 'sueño', 'sueños') : ''].filter(Boolean).join(' y ') });
  add(s.saved || s.goals, { key: 'saved', kicker: 'Alcancía', value: s.saved ? util.formatCOP(s.saved) : fmtNum.format(s.goals), label: s.saved ? 'ahorrados juntos' : 'metas cumplidas', sub: s.saved && s.goals ? plural(s.goals, 'meta cumplida', 'metas cumplidas') : '', small: true });
  add(s.cooked, { key: 'cooked', kicker: 'En la cocina', value: fmtNum.format(s.cooked), label: s.cooked === 1 ? 'plato cocinado juntos' : 'platos cocinados juntos', sub: s.homeMenus ? plural(s.homeMenus, 'cena en casa', 'cenas en casa') : '' });
  add(s.games, { key: 'games', kicker: 'A jugar', value: fmtNum.format(s.games), label: s.games === 1 ? 'partida jugada juntos' : 'partidas jugadas juntos', sub: s.togetherMin ? `${fmtNum.format(s.togetherMin)} minutos sin teléfonos` : '' });
  add(s.petMoments, { key: 'pets', kicker: 'Familia peluda', value: fmtNum.format(s.petMoments), label: s.petMoments === 1 ? 'momento con su mascota' : 'momentos con su mascota', sub: '' });
  add(full && s.prizes, { key: 'prizes', kicker: 'Rasca y gana', value: fmtNum.format(s.prizes), label: s.prizes === 1 ? 'premio raspado' : 'premios raspados', sub: '' });
  add(full && s.voice, { key: 'voice', kicker: 'Notas de voz', value: fmtNum.format(s.voice), label: s.voice === 1 ? 'nota de voz' : 'notas de voz', sub: '' });
  add(s.badges, { key: 'badges', kicker: 'Insignias', value: fmtNum.format(s.badges), label: s.badges === 1 ? 'sello nuevo' : 'sellos nuevos', sub: 'en la vitrina' });
  out.push({ key: 'end', kicker: full && s.reason ? 'Una razón, entre muchas' : '', value: '', label: p.kind === 'month' ? 'Por otro mes juntos' : 'Por otro año juntos', quote: full ? s.reason : '', end: true });
  return out;
}

// ---------- canvas ----------
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (k, f) => cs.getPropertyValue(k).trim() || f;
  return { bg: v('--paper', '#FFFDF9'), soft: v('--accent-soft', '#F9D3DD'), accent: v('--accent', '#C2405F'), text: v('--text', '#2A1E22'), text2: v('--text-2', '#7A6268'), surface: v('--surface-2', '#F7E6E8'), gold: v('--gold', '#C9A46A') };
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

function petal(ctx, x, y, r, rot, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.bezierCurveTo(r * 0.9, -r * 0.6, r * 0.6, r * 0.7, 0, r); ctx.bezierCurveTo(-r * 0.6, r * 0.7, -r * 0.9, -r * 0.6, 0, -r);
  ctx.fill(); ctx.restore();
}

const loadBitmap = async (id) => { const b = await db.getMedia(id).catch(() => null); if (!b || !b.type.startsWith('image/')) return null; try { return await createImageBitmap(b); } catch { return null; } };

/** Draw one card on a 1080×1920 canvas. */
export async function drawCard(canvas, card, { i = 0, n = 1, footer = '', colors = palette(), images = new Map() } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colors.soft; ctx.beginPath(); ctx.arc(W - 120, 260, 420, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(80, H - 220, 300, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  for (let k = 0; k < 7; k++) petal(ctx, 120 + ((k * 173 + i * 61) % (W - 240)), 180 + ((k * 263 + i * 97) % (H - 520)), 18 + (k % 3) * 8, k + i, k % 2 ? colors.accent : colors.soft);
  // progress marks on top, like stories
  const gap = 12; const bw = (W - 120 - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) { ctx.fillStyle = k <= i ? colors.accent : colors.surface; ctx.fillRect(60 + k * (bw + gap), 70, bw, 8); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let y = card.photos?.length ? 560 : 720;
  if (card.kicker) { ctx.fillStyle = colors.text2; ctx.font = '600 46px "Zen Maru Gothic", sans-serif'; for (const l of wrap(ctx, card.kicker, W - 200)) { ctx.fillText(l, W / 2, y); y += 60; } y += 40; }
  if (card.photos?.length) {
    const size = 300; const total = card.photos.length * size + (card.photos.length - 1) * 30; let x = (W - total) / 2;
    for (const [k, id] of card.photos.entries()) {
      const bmp = images.get(id) || null;
      ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.rotate((k - 1) * 0.06);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-size / 2 - 14, -size / 2 - 14, size + 28, size + 60);
      if (bmp) { const sc = Math.max(size / bmp.width, size / bmp.height); const sw = size / sc; const sh = size / sc; ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, -size / 2, -size / 2, size, size); } else { ctx.fillStyle = colors.surface; ctx.fillRect(-size / 2, -size / 2, size, size); }
      ctx.restore(); x += size + 30;
    }
    y += size + 160;
  }
  if (card.value) {
    const fs = card.small || card.value.length > 6 ? 150 : card.value.length > 3 ? 220 : 300;
    ctx.fillStyle = colors.accent; ctx.font = `700 ${fs}px "Shippori Mincho", serif`; ctx.fillText(card.value, W / 2, y + fs * 0.8); y += fs + 40;
  }
  if (card.label) { ctx.fillStyle = colors.text; ctx.font = `700 ${card.end ? 92 : 72}px "Shippori Mincho", serif`; for (const l of wrap(ctx, card.label, W - 180)) { ctx.fillText(l, W / 2, y + 60); y += card.end ? 110 : 90; } y += 30; }
  if (card.quote) {
    ctx.fillStyle = colors.text; ctx.font = '500 58px "Shippori Mincho", serif';
    const lines = wrap(ctx, `“${card.quote}”`, W - 220).slice(0, 8);
    y += card.end ? 40 : 0;
    for (const l of lines) { ctx.fillText(l, W / 2, y + 60); y += 78; }
    y += 30;
  }
  if (card.sub) { ctx.fillStyle = colors.text2; ctx.font = '500 46px "Zen Maru Gothic", sans-serif'; for (const l of wrap(ctx, card.sub, W - 220).slice(0, 4)) { ctx.fillText(l, W / 2, y + 40); y += 62; } }
  if (card.end) { ctx.strokeStyle = colors.accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, H - 420, 70, 0, Math.PI * 2); ctx.stroke(); petal(ctx, W / 2, H - 420, 36, 0, colors.accent); }
  ctx.fillStyle = colors.text2; ctx.font = '600 36px "Zen Maru Gothic", sans-serif'; ctx.fillText(footer, W / 2, H - 110);
  return canvas;
}

const canvasBlob = (c, type = 'image/png') => new Promise((res) => c.toBlob(res, type));

async function deliver(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'cancel'; }
  const u = URL.createObjectURL(blob); const a = el('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  return 'downloaded';
}

export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].some((t) => MediaRecorder.isTypeSupported?.(t));

/** Short video of all the cards (≈2.5 s each with a soft fade). */
async function recordVideo(list, opts, onProgress) {
  const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const frames = [];
  for (const [i, c] of list.entries()) frames.push(await drawCard(document.createElement('canvas'), c, { ...opts, i, n: list.length }));
  const stream = out.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  ctx.drawImage(frames[0], 0, 0); rec.start(500);
  const HOLD = 2200; const FADE = 400;
  for (let i = 0; i < frames.length; i++) {
    onProgress?.(i + 1, frames.length);
    await new Promise((resolve) => {
      const t0 = performance.now();
      const tick = (t) => {
        const e = t - t0;
        if (i > 0 && e < FADE) { ctx.globalAlpha = 1; ctx.drawImage(frames[i - 1], 0, 0); ctx.globalAlpha = e / FADE; ctx.drawImage(frames[i], 0, 0); ctx.globalAlpha = 1; } else ctx.drawImage(frames[i], 0, 0);
        if (e < HOLD + FADE) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  rec.stop(); await stopped; stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: mime.split(';')[0] });
}

// ---------- stories ----------
export function openStories(p, list, { footer }) {
  let i = 0; let busy = false;
  const images = new Map();
  const canvas = el('canvas', { class: 'story-canvas', width: W, height: H, role: 'img' });
  const live = el('p', { class: 'sr-only', 'aria-live': 'polite' });
  const prev = el('button', { class: 'story-zone story-prev', type: 'button', 'aria-label': 'Anterior' });
  const next = el('button', { class: 'story-zone story-next', type: 'button', 'aria-label': 'Siguiente' });
  const status = el('span', { class: 'small story-status', 'aria-live': 'polite' });
  const shareBtn = ui.button({ label: 'Compartir', iconName: 'share-2', small: true, onClick: () => sharePng() });
  const videoBtn = canRecord() ? ui.button({ label: 'Video', iconName: 'film', small: true, onClick: () => makeVideo() }) : null;
  const stage = el('div', { class: 'story-stage' }, canvas, prev, next);
  const body = el('div', { class: 'stories' }, stage, live,
    el('div', { class: 'story-bar' }, shareBtn, videoBtn, status));
  const m = ui.openModal({ title: p.label, kind: 'viewer', className: 'stories-modal', body });
  const opts = () => ({ footer, images });
  const textOf = (c) => [c.kicker, c.value, c.label, c.quote, c.sub].filter(Boolean).join('. ');
  const paint = async () => {
    const c = list[i];
    if (c.photos) for (const id of c.photos) if (!images.has(id)) images.set(id, await loadBitmap(id));
    await drawCard(canvas, c, { ...opts(), i, n: list.length });
    canvas.setAttribute('aria-label', textOf(c));
    live.textContent = `${i + 1} de ${list.length}: ${textOf(c)}`;
    prev.disabled = i === 0; next.setAttribute('aria-label', i === list.length - 1 ? 'Cerrar' : 'Siguiente');
    if (!util.prefersReducedMotion()) { canvas.classList.remove('story-in'); void canvas.offsetWidth; canvas.classList.add('story-in'); }
  };
  const go = (d) => { if (i + d >= list.length) { m.close(); return; } i = Math.max(0, i + d); paint(); };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  m.el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
  const fileBase = `aishiteru-${p.id.replace(/[^a-z0-9]+/gi, '-')}`;
  async function sharePng() {
    if (busy) return; busy = true;
    try { const blob = await canvasBlob(canvas); const r = await deliver(blob, `${fileBase}-${i + 1}.png`, p.label); if (r === 'downloaded') ui.toast('Imagen descargada.', { tone: 'success' }); } catch (e) { console.error(e); ui.toast('No se pudo crear la imagen.', { tone: 'error' }); } finally { busy = false; }
  }
  async function makeVideo() {
    if (busy) return; busy = true; videoBtn.disabled = true;
    try {
      for (const c of list) if (c.photos) for (const id of c.photos) if (!images.has(id)) images.set(id, await loadBitmap(id));
      const blob = await recordVideo(list, opts(), (k, n) => { status.textContent = `Creando el video: ${k} de ${n}`; });
      status.textContent = '';
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const r = await deliver(blob, `${fileBase}.${ext}`, p.label);
      if (r === 'downloaded') ui.toast('Video descargado.', { tone: 'success' });
    } catch (e) { console.error(e); status.textContent = ''; ui.toast('Este navegador no pudo crear el video. Puedes compartir cada imagen.', { tone: 'error' }); } finally { busy = false; videoBtn.disabled = false; }
  }
  // swipe left/right
  let x0 = null;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  stage.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) { e.preventDefault(); go(dx < 0 ? 1 : -1); } });
  document.fonts?.ready.then(paint, paint);
  setTimeout(() => next.focus(), 50);
  return m;
}

// ---------- screen ----------
const KIND_LABEL = { month: 'Mes', year: 'Año', wrapped: 'Wrapped' };

export async function render(ctx = {}) {
  const page = el('section', { class: 'page page-wide resumen' });
  page.append(ui.pageHeader({ title: 'Resumen del año', jp: '年間', romaji: 'nenkan', back: '/inicio' }));
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  page.append(body);
  const today = util.localDay();
  const periods = allPeriods(profile.startDay(), today);
  const wanted = decodeURIComponent(ctx.params?.a || '');
  const flat = [...periods.wrapped, ...periods.year, ...periods.month];
  const due = periodDueOn(today, profile.startDay());
  let current = flat.find((p) => p.id === wanted) || (due && flat.find((p) => p.id === due.id)) || periods.month[0];
  let kind = current.kind;
  let token = 0;

  const draw = async () => {
    const my = ++token;
    const options = periods[kind];
    if (!options.find((p) => p.id === current.id)) current = options[0];
    const kinds = ui.segmented({ label: 'Tipo de resumen', value: kind, options: Object.keys(KIND_LABEL).filter((k) => periods[k].length).map((k) => ({ value: k, label: KIND_LABEL[k] })), onChange: (v) => { kind = v; current = periods[v][0]; draw(); } });
    kinds.classList.add('section-tabs');
    const sel = el('select', { class: 'input', 'aria-label': 'Periodo' }, options.map((p) => el('option', { value: p.id, selected: p.id === current.id }, p.kind === 'wrapped' ? `${p.label} (${p.short})` : p.label)));
    sel.addEventListener('change', () => { current = options.find((p) => p.id === sel.value) || current; draw(); });
    const tiles = el('div', { class: 'resumen-tiles' }, ui.skeleton(2));
    const playBtn = ui.button({ label: 'Ver las historias', iconName: 'play', variant: 'primary', onClick: () => {} });
    const wrappedNote = kind === 'wrapped' && current.to >= today ? el('p', { class: 'muted small' }, `Este año juntos va hasta el ${util.formatDay(current.to)}. Pueden verlo cuando quieran: se completa solo.`) : null;
    body.replaceChildren(...[kinds, ui.field({ label: 'Periodo', control: sel }), wrappedNote, tiles,
      el('div', { class: 'card-actions' }, playBtn),
      el('p', { class: 'note-inline' }, icon('lock', { size: 18 }), el('span', {}, 'Nada del ciclo, del Rincón ni de lo "Solo yo" entra en el resumen.'))].filter(Boolean));
    const s = await stats(current, today);
    if (my !== token) return;
    const list = cards(current, s);
    const shown = list.filter((c) => c.value && c.key !== 'intro');
    tiles.replaceChildren(shown.length
      ? el('ul', { class: 'resumen-grid' }, shown.map((c) => el('li', { class: 'card paper-card resumen-tile' },
        el('span', { class: 'muted small' }, c.kicker), el('strong', { class: 'resumen-num' }, c.value), el('span', { class: 'small' }, c.label))))
      : ui.emptyState({ title: 'Todavía hay poco por contar', text: 'Guarden recuerdos, respondan preguntas o dedíquense canciones y aquí aparece su resumen.', art: 'omamori' }));
    const footer = current.kind === 'wrapped' ? `Aishiteru · año ${current.index} juntos` : `Aishiteru · ${current.label}`;
    playBtn.onclick = () => { markSeen(current.id).catch(() => {}); openStories(current, list, { footer }); };
    playBtn.disabled = shown.length === 0;
  };
  try { await draw(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos armar el resumen', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  if (wanted) markSeen(current.id).catch(() => {});
  const offP = profile.onProfileChange(() => draw());
  return { node: page, cleanup: () => { offP(); } };
}
