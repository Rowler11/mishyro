// Ahora mismo (v0.31.0, Rowler 2026-11-25): what each one is doing and how they feel, on Inicio,
// side by side. One shared 'streaks' record per person (type 'now'): an activity (from the list or
// one of their own), a mood from the Medidor de ánimo (it also marks today's mood there), a short
// line of their own and when it was set. It fades after 24 hours. Only to feel close: never to check.
import { ui, util, db, profile } from '../core.js';
import { MOODS, saveMood } from './animo.js';

const { el, icon } = util;
export const TTL = 24 * 3600 * 1000;
const idOf = (who) => `now:${who}`;

export const ACTIVITIES = [
  { id: 'work', icon: 'briefcase', label: 'Trabajando' },
  { id: 'study', icon: 'book-open', label: 'Estudiando' },
  { id: 'road', icon: 'car', label: 'En camino' },
  { id: 'eat', icon: 'utensils', label: 'Comiendo' },
  { id: 'cook', icon: 'chef-hat', label: 'Cocinando' },
  { id: 'gym', icon: 'dumbbell', label: 'Haciendo ejercicio' },
  { id: 'rest', icon: 'coffee', label: 'Descansando' },
  { id: 'tv', icon: 'tv', label: 'Viendo algo' },
  { id: 'play', icon: 'gamepad-2', label: 'Jugando' },
  { id: 'music', icon: 'music', label: 'Escuchando música' },
  { id: 'shop', icon: 'shopping-bag', label: 'De compras' },
  { id: 'people', icon: 'users', label: 'Con familia o amigos' },
  { id: 'sleep', icon: 'moon', label: 'Durmiendo' },
  { id: 'miss', icon: 'heart', label: 'Extrañándote' },
];
// Icons offered for an activity of their own
export const OWN_ICONS = ['sparkles', 'heart', 'smile', 'coffee', 'book-open', 'music', 'moon', 'sunrise', 'gamepad-2', 'chef-hat', 'briefcase', 'users'];

/** "ahora", "hace 5 min", "hace 2 h", "hace 1 día". */
export function ago(iso, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
/** A status counts for 24 hours. */
export const fresh = (r, now = Date.now()) => !!(r && r.at && !r.cleared && now - new Date(r.at).getTime() < TTL);
const actOf = (r) => (r?.act ? ACTIVITIES.find((a) => a.id === r.act) || (r.own ? { id: r.act, icon: r.own.icon || 'sparkles', label: r.own.label } : null) : null);
const moodOf = (level) => MOODS.find((m) => m.level === level) || null;

export async function getNow(who) { return db.get('streaks', idOf(who)).catch(() => null); }

async function save(patch) {
  const me = profile.active(); const prev = await getNow(me);
  const keep = fresh(prev) ? prev : {};
  const rec = { ...(prev || {}), ...keep, ...patch, id: idOf(me), type: 'now', by: me, at: util.nowISO(), cleared: false, visibility: 'shared', owner: 'both' };
  // the last few, to pick again with one tap
  const a = actOf(rec);
  if (a && patch.act) {
    const r = { act: a.id, ...(rec.own ? { own: rec.own } : {}) };
    rec.recent = [r, ...(prev?.recent || []).filter((x) => x.act !== a.id)].slice(0, 6);
  }
  if (!patch.own && patch.act) delete rec.own;
  await db.put('streaks', rec);
  if (patch.mood) saveMood(util.localDay(), patch.mood, { source: 'now' }).catch(() => {});
  return rec;
}

function editor(onDone) {
  const me = profile.active();
  return getNow(me).then((prev) => {
    const cur = fresh(prev) ? prev : null;
    let act = cur?.act || null; let own = cur?.own || null; let mood = cur?.mood || null;
    const text = el('input', { class: 'input', maxlength: '80', placeholder: 'Algo más (opcional): "en la fila del banco 😅"', value: cur?.text || '', 'aria-label': 'Algo más' });
    const grid = el('div', { class: 'now-acts', role: 'radiogroup', 'aria-label': '¿Qué estás haciendo?' });
    const mine = (prev?.mine || []);
    const paintActs = () => grid.replaceChildren(
      ...ACTIVITIES.map((a) => chip(a, act === a.id && !own, () => { act = a.id; own = null; paintActs(); })),
      ...mine.map((o) => chip({ id: o.id, icon: o.icon, label: o.label }, own?.id === o.id, () => { act = o.id; own = o; paintActs(); })),
      el('button', { class: 'now-act now-act-new', type: 'button', onClick: () => newOwn() }, icon('plus', { size: 20 }), el('span', {}, 'Crear el mío')));
    const chip = (a, on, pick) => el('button', { class: `now-act${on ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(on), onClick: () => { util.haptic?.(8); pick(); } }, icon(a.icon, { size: 20 }), el('span', {}, a.label));
    const moods = el('div', { class: 'now-moods', role: 'radiogroup', 'aria-label': '¿Cómo te sientes?' });
    const paintMoods = () => moods.replaceChildren(...MOODS.map((m) => el('button', { class: `now-mood${mood === m.level ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(mood === m.level), 'aria-label': m.name, title: m.name, onClick: () => { mood = mood === m.level ? null : m.level; util.haptic?.(8); paintMoods(); } }, el('span', { 'aria-hidden': 'true' }, m.emoji), el('small', {}, m.name))));
    const newOwn = () => {
      let ic = OWN_ICONS[0];
      const name = el('input', { class: 'input', maxlength: '28', placeholder: 'Ej.: Pintando, Con Milu, En clase de inglés', 'aria-label': 'Nombre' });
      const icons = el('div', { class: 'now-icons', role: 'radiogroup', 'aria-label': 'Ícono' });
      const paintIcons = () => icons.replaceChildren(...OWN_ICONS.map((n) => el('button', { class: `now-icon${ic === n ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(ic === n), 'aria-label': n, onClick: () => { ic = n; paintIcons(); } }, icon(n, { size: 20 }))));
      paintIcons();
      ui.openModal({ title: 'Tu propio estado', size: 'sm', body: el('div', { class: 'stack' }, name, icons),
        actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Crear', variant: 'primary', onClick: () => {
          const label = name.value.trim(); if (!label) { name.focus(); return false; }
          const o = { id: `own:${util.uuid().slice(0, 8)}`, icon: ic, label };
          mine.push(o); act = o.id; own = o; paintActs(); return true;
        } }] });
      setTimeout(() => name.focus(), 50);
    };
    paintActs(); paintMoods();
    const recent = (prev?.recent || []).map((r) => (r.own ? { id: r.act, icon: r.own.icon, label: r.own.label, own: r.own } : ACTIVITIES.find((a) => a.id === r.act))).filter(Boolean).slice(0, 4);
    const m = ui.openModal({
      title: 'Ahora mismo', kind: 'sheet', size: 'md', className: 'now-modal',
      body: el('div', { class: 'stack' },
        recent.length ? el('div', { class: 'now-recent' }, el('p', { class: 'now-label' }, 'Recientes'),
          el('div', { class: 'now-recent-row' }, recent.map((r) => el('button', { class: 'chip now-recent-chip', type: 'button', onClick: async () => { await save({ act: r.id, ...(r.own ? { own: r.own } : {}), mood, text: text.value.trim(), mine }); util.haptic?.('success'); m.close(); onDone?.(); } }, icon(r.icon, { size: 16 }), r.label)))) : null,
        el('p', { class: 'now-label' }, '¿Qué estás haciendo?'), grid,
        el('p', { class: 'now-label' }, '¿Cómo te sientes?'), moods,
        text,
        el('p', { class: 'muted small' }, 'Tu pareja lo ve en Inicio durante 24 horas. El ánimo también queda en el Medidor de ánimo.')),
      actions: [
        ...(cur ? [{ label: 'Quitar', variant: 'ghost', onClick: async () => { await db.put('streaks', { ...prev, cleared: true }); onDone?.(); return true; } }] : []),
        { label: 'Listo', variant: 'primary', onClick: async () => {
          if (!act && !mood && !text.value.trim()) { ui.toast('Elige algo, tu ánimo o escribe una línea.', { tone: 'info' }); return false; }
          await save({ act, ...(own ? { own } : {}), mood, text: text.value.trim(), mine });
          util.haptic?.('success'); ui.toast('Listo. Tu pareja lo verá en Inicio.', { tone: 'success' }); onDone?.(); return true;
        } }],
    });
    return m;
  });
}

function half(r, { who, mine, onEdit }) {
  const ok = fresh(r); const a = ok ? actOf(r) : null; const md = ok ? moodOf(r.mood) : null;
  const kids = ok ? [
    el('span', { class: 'now-badge', 'aria-hidden': 'true' }, a ? icon(a.icon, { size: 24 }) : el('span', { class: 'now-emoji' }, md?.emoji || '💭'),
      a && md ? el('span', { class: 'now-badge-mood' }, md.emoji) : null),
    el('span', { class: 'now-text' },
      el('span', { class: 'now-who' }, who),
      el('strong', { class: 'now-what' }, a?.label || md?.name || r.text),
      r.text && (a || md) ? el('span', { class: 'now-line' }, r.text) : null,
      el('span', { class: 'now-when', 'data-at': r.at }, `${md && a ? `${md.name} · ` : ''}${ago(r.at)}`)),
  ] : [
    el('span', { class: 'now-badge is-empty', 'aria-hidden': 'true' }, icon(mine ? 'plus' : 'cloud-moon', { size: 22 })),
    el('span', { class: 'now-text' }, el('span', { class: 'now-who' }, who),
      el('strong', { class: 'now-what is-empty' }, mine ? '¿Qué haces ahora?' : 'Sin estado por ahora'),
      el('span', { class: 'now-when' }, mine ? 'Toca para contarle' : 'Aparece aquí cuando lo comparta')),
  ];
  return mine
    ? el('button', { class: `now-half is-mine${ok ? '' : ' is-blank'}`, type: 'button', onClick: onEdit, 'aria-label': ok ? `Tu estado: ${a?.label || md?.name || r.text}. Cambiar` : 'Contar qué haces ahora' }, ...kids)
    : el('div', { class: `now-half${ok ? '' : ' is-blank'}` }, ...kids);
}

/** Card for Inicio: both statuses side by side; yours changes with a tap. */
export async function homeCard({ onChange } = {}) {
  const me = profile.active(); const other = profile.partnerOf(me);
  const card = el('section', { class: 'card home-card now-card', 'aria-labelledby': 'now-title' });
  const paint = async () => {
    const [mine, theirs] = await Promise.all([getNow(me), getNow(other)]);
    card.replaceChildren(
      el('h2', { class: 'card-kicker', id: 'now-title' }, 'Ahora mismo'),
      el('div', { class: 'now-row' },
        half(theirs, { who: profile.nick(other) || profile.name(other) || 'Tu pareja', mine: false }),
        half(mine, { who: 'Tú', mine: true, onEdit: () => editor(() => { paint(); onChange?.(); }) })));
  };
  await paint();
  // live: a change from the other phone repaints it; "hace X" ticks every minute
  const off = db.onChange((s) => { if (s === 'streaks' && card.isConnected) paint().catch(() => {}); });
  const tick = setInterval(() => {
    if (!card.isConnected) { clearInterval(tick); off(); return; }
    card.querySelectorAll('.now-when[data-at]').forEach((n) => { n.textContent = n.textContent.replace(/(ahora|hace .+)$/, ago(n.dataset.at)); });
  }, 60000);
  return card;
}
export { editor as openEditor };
