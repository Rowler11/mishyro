// Dormir y soñar (v0.31.0, Rowler 2026-11-25): a sleep log (when they went to bed and woke up, the
// hours, how well they slept, the last weeks of both) and a dream diary they can tell in text or in a
// voice note, with tags like "gracioso" to laugh about it together. Kept in the 'personal' store
// (kind 'sleep' or 'dream'); shared by default, a dream can be "Solo yo". Never to watch the other.
import { ui, util, db, profile } from '../core.js';
import { voiceAttach, saveAttached, player } from './voz.js';
import { toTrash } from './papelera.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
export const QUALITY = [
  { level: 1, label: 'Fatal', emoji: '😫' },
  { level: 2, label: 'Mal', emoji: '😪' },
  { level: 3, label: 'Regular', emoji: '😐' },
  { level: 4, label: 'Bien', emoji: '😌' },
  { level: 5, label: 'De maravilla', emoji: '😴' },
];
export const TAGS = [
  { id: 'funny', label: 'Gracioso', emoji: '😂' },
  { id: 'sweet', label: 'Bonito', emoji: '🥰' },
  { id: 'weird', label: 'Raro', emoji: '🌀' },
  { id: 'you', label: 'Salías tú', emoji: '💞' },
  { id: 'scary', label: 'Pesadilla', emoji: '😱' },
  { id: 'lucid', label: 'Lúcido', emoji: '✨' },
];
const sleepId = (day, who) => `sleep:${day}:${who}`;
const dayOf = (d) => util.toLocalISO ? util.toLocalISO(d).slice(0, 10) : d.toISOString().slice(0, 10);

/** Minutes asleep between two "HH:MM" times; a bedtime after the wake time crosses midnight. */
export function minutesBetween(bed, wake) {
  const t = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
  const a = t(bed); const b = t(wake);
  if (a == null || b == null) return null;
  return ((b - a) + 1440) % 1440 || 1440;
}
/** "7 h 30 min", "8 h". */
export function fmtHours(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** Averages of a list of sleep records: minutes, quality and the usual bedtime ("HH:MM"). */
export function summary(list) {
  const ok = list.filter((r) => r.minutes > 0);
  if (!ok.length) return null;
  const avg = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
  // bedtimes around midnight: count the small hours as +24 h so 23:30 and 00:30 average to 00:00
  const beds = ok.map((r) => { const [h, m] = r.bed.split(':').map(Number); const v = h * 60 + m; return v < 12 * 60 ? v + 1440 : v; });
  const b = Math.round(avg(beds)) % 1440;
  const q = ok.filter((r) => r.quality);
  return { minutes: Math.round(avg(ok.map((r) => r.minutes))), quality: q.length ? Math.round(avg(q.map((r) => r.quality)) * 10) / 10 : null,
    bed: `${String(Math.floor(b / 60)).padStart(2, '0')}:${String(b % 60).padStart(2, '0')}`, nights: ok.length };
}

async function all(kind) {
  return (await db.query('personal')).filter((r) => r.kind === kind && !r.deleted);
}

// ---------- sleep ----------
function sleepEditor(existing, onSaved) {
  const me = profile.active(); const today = util.localDay();
  const day = el('input', { class: 'input', type: 'date', value: existing?.date || today, max: today });
  const bed = el('input', { class: 'input', type: 'time', value: existing?.bed || '23:00' });
  const wake = el('input', { class: 'input', type: 'time', value: existing?.wake || '07:00' });
  let quality = existing?.quality || null;
  const total = el('p', { class: 'sleep-total', 'aria-live': 'polite' });
  const paintTotal = () => { total.textContent = `Dormiste ${fmtHours(minutesBetween(bed.value, wake.value))}`; };
  bed.addEventListener('input', paintTotal); wake.addEventListener('input', paintTotal); paintTotal();
  const q = el('div', { class: 'sleep-quality', role: 'radiogroup', 'aria-label': '¿Qué tal dormiste?' });
  const paintQ = () => q.replaceChildren(...QUALITY.map((x) => el('button', { class: `now-mood${quality === x.level ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(quality === x.level), onClick: () => { quality = x.level; util.haptic?.(8); paintQ(); } }, el('span', { 'aria-hidden': 'true' }, x.emoji), el('small', {}, x.label))));
  paintQ();
  const note = ui.textarea({ rows: 2, maxlength: 160, placeholder: 'Opcional: "me desperté a las 3", "Milu me despertó"', value: existing?.note || '' });
  ui.openModal({
    title: existing ? 'Editar la noche' : '¿Cómo dormiste?', kind: 'sheet', size: 'md',
    body: el('div', { class: 'stack' },
      ui.field({ label: 'La mañana del', control: day }),
      el('div', { class: 'sleep-times' }, ui.field({ label: 'Me acosté', control: bed }), ui.field({ label: 'Me levanté', control: wake })),
      total,
      el('p', { class: 'now-label' }, '¿Qué tal dormiste?'), q,
      ui.field({ label: 'Nota', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const minutes = minutesBetween(bed.value, wake.value);
      if (!util.isValidDay(day.value) || minutes == null) { ui.toast('Revisa el día y las horas.', { tone: 'error' }); return false; }
      const id = sleepId(day.value, me);
      if (existing && existing.id !== id) await db.purge('personal', existing.id).catch(() => {});
      await db.put('personal', { ...(existing || {}), id, kind: 'sleep', owner: me, by: me, date: day.value, bed: bed.value, wake: wake.value, minutes, quality, note: note.value.trim(), visibility: 'shared' });
      util.haptic?.('success'); ui.toast(minutes >= 420 ? 'Guardado. ¡Buena noche de sueño!' : 'Guardado. Hoy toca consentirse un poco.', { tone: 'success' });
      onSaved?.(); return true;
    } }],
  });
}

function chart(nights, people) {
  // last 7 mornings, a pair of bars per day (one per person), 0–10 h
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return dayOf(d); });
  const W = 320; const H = 150; const pad = 22; const bw = 12; const max = 600;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 22}`); svg.setAttribute('class', 'sleep-chart'); svg.setAttribute('role', 'img');
  const label = [];
  const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; svg.append(n); return n; };
  for (const h of [4, 8]) { const y = H - (h * 60 / max) * (H - pad); add('line', { x1: 24, x2: W, y1: y, y2: y, class: 'sleep-grid' }); add('text', { x: 0, y: y + 4, class: 'sleep-axis' }, `${h} h`); }
  days.forEach((d, i) => {
    const cx = 40 + i * ((W - 48) / 7) + 10;
    people.forEach((p, j) => {
      const r = nights.find((n) => n.date === d && n.by === p.id);
      if (!r) return;
      const h = Math.min(1, r.minutes / max) * (H - pad);
      add('rect', { x: cx + (j - (people.length - 1) / 2) * (bw + 3) - bw / 2, y: H - h, width: bw, height: Math.max(2, h), rx: 4, class: `sleep-bar radar-${j}` });
      label.push(`${p.name}, ${fmtDay.format(new Date(`${d}T12:00`))}: ${fmtHours(r.minutes)}`);
    });
    add('text', { x: cx, y: H + 16, 'text-anchor': 'middle', class: 'sleep-axis' }, fmtDay.format(new Date(`${d}T12:00`)).split(' ')[0].replace(/[,.]/g, ''));
  });
  svg.setAttribute('aria-label', label.length ? `Horas de sueño de la última semana. ${label.join('. ')}` : 'Aún no hay noches anotadas esta semana');
  return svg;
}

async function sleepTab(onChange) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const nights = (await all('sleep')).sort((a, b) => b.date.localeCompare(a.date));
  const people = [{ id: me, name: 'Tú' }, { id: partner, name: profile.nick(partner) || profile.name(partner) }];
  const today = nights.find((n) => n.by === me && n.date === util.localDay());
  const since = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return dayOf(d); })();
  const stat = (p) => {
    const s = summary(nights.filter((n) => n.by === p.id && n.date >= since));
    return el('div', { class: 'sleep-stat' }, el('p', { class: 'll-bars-name' }, el('span', { class: `ll-dot radar-${people.indexOf(p)}`, 'aria-hidden': 'true' }), p.name),
      s ? el('dl', { class: 'sleep-facts' },
        el('dt', {}, 'Promedio'), el('dd', {}, fmtHours(s.minutes)),
        el('dt', {}, 'Calidad'), el('dd', {}, s.quality ? `${QUALITY[Math.round(s.quality) - 1].emoji} ${QUALITY[Math.round(s.quality) - 1].label}` : '—'),
        el('dt', {}, 'Suele acostarse'), el('dd', {}, s.bed),
        el('dt', {}, 'Noches'), el('dd', {}, String(s.nights)))
        : el('p', { class: 'muted small' }, p.id === me ? 'Anota tu primera noche.' : 'Todavía no anota sus noches.'));
  };
  const row = (n) => {
    const q = QUALITY[(n.quality || 0) - 1];
    const mine = n.by === me;
    return el('li', { class: 'sleep-row' },
      el('span', { class: `ll-dot radar-${mine ? 0 : 1}`, 'aria-hidden': 'true' }),
      el('span', { class: 'sleep-row-main' }, el('strong', {}, `${fmtDay.format(new Date(`${n.date}T12:00`))} · ${fmtHours(n.minutes)}`),
        el('span', { class: 'muted small' }, `${mine ? 'Tú' : people[1].name} · ${n.bed} a ${n.wake}${q ? ` · ${q.emoji} ${q.label}` : ''}${n.note ? ` · ${n.note}` : ''}`)),
      mine ? el('span', { class: 'sleep-row-acts' },
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar esta noche', onClick: () => sleepEditor(n, onChange) }, icon('pencil', { size: 16 })),
        el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar esta noche', onClick: async () => { await toTrash('personal', n.id, { label: `Noche del ${n.date}`, what: 'Noche borrada', onRestored: onChange }); onChange(); } }, icon('trash-2', { size: 16 }))) : null);
  };
  return el('div', { class: 'stack' },
    el('section', { class: 'card paper-card sleep-today' },
      el('p', { class: 'card-kicker' }, 'Esta mañana'),
      today ? el('p', { class: 'sleep-big' }, `${fmtHours(today.minutes)} ${QUALITY[(today.quality || 0) - 1]?.emoji || ''}`) : el('p', {}, '¿Qué tal la noche? Anótala en un momento.'),
      el('div', { class: 'card-actions' }, ui.button({ label: today ? 'Editar' : 'Anotar mi noche', iconName: today ? 'pencil' : 'bed', variant: today ? 'ghost' : 'primary', onClick: () => sleepEditor(today || null, onChange) }))),
    el('section', { class: 'card paper-card' }, el('p', { class: 'card-kicker' }, 'La última semana'), chart(nights, people),
      el('div', { class: 'll-bars-wrap' }, people.map(stat)), el('p', { class: 'small muted' }, 'Promedios de los últimos 30 días. Entre 7 y 9 horas suele ser lo ideal para un adulto.')),
    nights.length ? el('details', { class: 'card paper-card' }, el('summary', {}, `Historial (${nights.length})`), el('ul', { class: 'sleep-list' }, nights.slice(0, 60).map(row))) : null);
}

// ---------- dreams ----------
function dreamEditor(existing, onSaved) {
  const me = profile.active();
  const title = ui.input({ maxlength: 80, placeholder: 'Ej.: Milu manejaba un bus', value: existing?.title || '' });
  const text = ui.textarea({ rows: 5, maxlength: 2000, placeholder: 'Cuéntalo como lo recuerdes, aunque no tenga sentido 😅', value: existing?.text || '' });
  const voice = voiceAttach({ mediaId: existing?.voiceMediaId || null, duration: existing?.voiceDuration || 0 });
  const tags = new Set(existing?.tags || []);
  const tagBox = el('div', { class: 'dream-tags', role: 'group', 'aria-label': 'Etiquetas' });
  const paintTags = () => tagBox.replaceChildren(...TAGS.map((t) => el('button', { class: `dream-tag${tags.has(t.id) ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(tags.has(t.id)), onClick: () => { if (tags.has(t.id)) tags.delete(t.id); else tags.add(t.id); util.haptic?.(8); paintTags(); } }, `${t.emoji} ${t.label}`)));
  paintTags();
  let visibility = existing?.visibility || 'shared';
  ui.openModal({
    title: existing ? 'Editar el sueño' : 'Contar un sueño', kind: 'sheet', size: 'lg', onClose: () => voice.cleanup(),
    body: el('div', { class: 'stack' },
      ui.field({ label: 'Título', control: title }),
      ui.field({ label: 'Lo que soñaste', control: text }),
      voice.node,
      el('p', { class: 'now-label' }, 'Etiquetas'), tagBox,
      ui.visibilityPicker({ value: visibility, onChange: (v) => { visibility = v; } })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (voice.recording()) { ui.toast('Termina la grabación primero.', { tone: 'info' }); return false; }
      const v = voice.value();
      if (!title.value.trim() && !text.value.trim() && !v.blob && !v.keep) { ui.toast('Escribe algo o graba una nota de voz.', { tone: 'info' }); return false; }
      const id = existing?.id || `dream:${util.uuid()}`;
      const rec = { ...(existing || {}), id, kind: 'dream', owner: me, by: me, date: existing?.date || util.localDay(), title: title.value.trim(), text: text.value.trim(), tags: [...tags], visibility, private: visibility === 'self' };
      const sav = await saveAttached(v, { ownerStore: 'personal', ownerId: id });
      await db.put('personal', { ...rec, voiceMediaId: sav.voiceMediaId, voiceDuration: sav.voiceDuration });
      util.haptic?.('success'); ui.toast(tags.has('funny') ? 'Guardado. Ese sí da risa 😂' : 'Sueño guardado.', { tone: 'success' });
      onSaved?.(); return true;
    } }],
  });
}

async function dreamsTab(onChange, state) {
  const me = profile.active(); const partner = profile.partnerOf(me);
  const pName = profile.nick(partner) || profile.name(partner);
  const list = (await all('dream')).filter((d) => d.visibility !== 'self' || d.owner === me).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const shown = list.filter((d) => state.tag === 'all' || (d.tags || []).includes(state.tag));
  const bag = new Set();
  const filters = el('div', { class: 'chip-row dream-filters', role: 'group', 'aria-label': 'Filtrar sueños' },
    [{ id: 'all', label: 'Todos', emoji: '🌙' }, ...TAGS].map((t) => el('button', { class: `chip${state.tag === t.id ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(state.tag === t.id), onClick: () => { state.tag = t.id; onChange(); } }, `${t.emoji} ${t.label}`)));
  const laugh = async (d) => {
    const r = { ...(d.reactions || {}) }; if (r[me]) delete r[me]; else r[me] = '😂';
    await db.put('personal', { ...d, reactions: r }); util.haptic?.(10); onChange();
  };
  const card = (d) => {
    const mine = d.owner === me;
    const reacts = Object.entries(d.reactions || {});
    return el('article', { class: 'card paper-card dream-card' },
      el('header', { class: 'dream-head' },
        el('span', { class: `ll-dot radar-${mine ? 0 : 1}`, 'aria-hidden': 'true' }),
        el('span', { class: 'muted small' }, `${mine ? 'Tú' : pName} · ${fmtLong.format(new Date(`${d.date}T12:00`))}${d.visibility === 'self' ? ' · Solo yo' : ''}`)),
      d.title ? el('h3', { class: 'dream-title' }, d.title) : null,
      d.text ? el('p', { class: 'dream-text' }, d.text) : null,
      d.voiceMediaId ? player({ mediaId: d.voiceMediaId, duration: d.voiceDuration, title: 'el sueño' }, bag) : null,
      (d.tags || []).length ? el('div', { class: 'dream-tags is-static' }, d.tags.map((id) => { const t = TAGS.find((x) => x.id === id); return t ? el('span', { class: 'dream-tag is-on' }, `${t.emoji} ${t.label}`) : null; })) : null,
      el('div', { class: 'dream-foot' },
        !mine ? el('button', { class: `btn btn-ghost btn-small${d.reactions?.[me] ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(!!d.reactions?.[me]), onClick: () => laugh(d) }, d.reactions?.[me] ? '😂 Me reí' : '😂 Reírme') : null,
        reacts.length && mine ? el('span', { class: 'small muted' }, `${pName} se rió 😂`) : null,
        mine ? el('span', { class: 'dream-acts' },
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar el sueño', onClick: () => dreamEditor(d, onChange) }, icon('pencil', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar el sueño', onClick: async () => {
            if (!(await ui.confirmDialog({ title: '¿Borrar este sueño?', message: d.title || 'Sueño sin título', confirmLabel: 'Borrar', danger: true }))) return;
            await toTrash('personal', d.id, { label: d.title || 'Sueño', what: 'Sueño borrado', extraMedia: d.voiceMediaId ? [d.voiceMediaId] : [], onRestored: onChange }); onChange();
          } }, icon('trash-2', { size: 16 }))) : null));
  };
  const funny = list.filter((d) => (d.tags || []).includes('funny')).length;
  return el('div', { class: 'stack' },
    el('section', { class: 'card paper-card sleep-today' },
      el('p', { class: 'card-kicker' }, 'Diario de sueños'),
      el('p', {}, 'Cuéntalo apenas despiertes, en texto o con tu voz, antes de que se te olvide.'),
      el('div', { class: 'card-actions' }, ui.button({ label: 'Contar un sueño', iconName: 'cloud-moon', variant: 'primary', onClick: () => dreamEditor(null, onChange) })),
      list.length ? el('p', { class: 'small muted' }, `${list.length} ${list.length === 1 ? 'sueño guardado' : 'sueños guardados'}${funny ? ` · ${funny} para reírse 😂` : ''}`) : null),
    list.length ? filters : null,
    ...(shown.length ? shown.map(card) : [ui.emptyState({ title: list.length ? 'Nada con esa etiqueta' : 'Aún no hay sueños', text: list.length ? 'Prueba con otra etiqueta.' : 'El primero que cuenten aparece aquí. Los graciosos llevan 😂.', art: 'moon' })]));
}

export async function render() {
  const page = el('section', { class: 'page page-wide dormir' });
  page.append(ui.pageHeader({ title: 'Dormir y soñar', jp: '眠り', romaji: 'nemuri', back: '/mas' }));
  const state = { tab: 'sleep', tag: 'all' };
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  const tabs = ui.segmented({ label: 'Sección', value: state.tab, options: [{ value: 'sleep', label: 'Dormir', icon: 'bed' }, { value: 'dreams', label: 'Sueños', icon: 'cloud-moon' }], onChange: (v) => { state.tab = v; draw(); } });
  page.append(tabs, body);
  const draw = async () => {
    try { body.replaceChildren(state.tab === 'sleep' ? await sleepTab(draw) : await dreamsTab(draw, state)); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir esta sección', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  };
  await draw();
  const off = db.onChange((s) => { if (s === 'personal' && page.isConnected) draw().catch(() => {}); });
  return { node: page, cleanup: () => off() };
}
