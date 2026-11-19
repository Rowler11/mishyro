// Buscar (docs/09 #/buscar, decision 7a): one search over memories, letters and coupons.
// Never searches what is private or "Solo yo", and never reveals the text of a letter not opened yet.
import { ui, util, db, profile, seed, CONFIG } from '../core.js';

const { el, icon } = util;
const AUTHOR = Object.entries(CONFIG.people || {}).find(([, p]) => p.role === 'author')?.[0] || 'david';
const fmtDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const MIN = 2;
const PER_GROUP = 20;

/** Lowercase without accents, so "cafe" finds "Café". Keeps string length for highlighting. */
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .normalize('NFC');
const foldKeep = (s) => String(s || '').split('').map((ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ch).join('');

/** Build the searchable index for the active person. Only what they can see and is not private. */
export async function buildIndex() {
  const me = profile.active();
  const isPublic = (r) => !r.deleted && !r.hidden && !r.private && r.visibility !== 'self';
  const [memories, content, letters] = await Promise.all([
    db.query('memories'), db.query('content', { filter: (r) => r.kind === 'coupon' || r.kind === 'letter' }), db.query('letters')]);
  const items = [];
  for (const m of memories.filter(isPublic)) {
    items.push({ group: 'memories', id: m.id, title: m.title || 'Recuerdo sin título', fields: [m.title, m.note], date: m.date || '', href: `#/capsula/${encodeURIComponent(m.id)}` });
  }
  const opened = new Map(letters.filter((l) => l.letterId).map((l) => [l.letterId, l]));
  for (const c of content.filter((r) => r.kind === 'letter' && isPublic(r))) {
    if (seed.needsCompletion(c.label) || seed.needsCompletion(c.text)) continue;
    const from = c.from || AUTHOR; const to = c.to || profile.partnerOf(from);
    if (from !== me && to !== me) continue;
    const readable = from === me || opened.has(c.id);
    items.push({ group: 'letters', id: c.id, title: c.label, fields: readable ? [c.label, c.text] : [c.label], sealed: !readable,
      href: to === me && readable ? `#/cartas/${encodeURIComponent(c.id)}` : '#/cartas' });
  }
  for (const l of letters.filter((x) => !x.letterId && isPublic(x) && x.status !== 'draft')) {
    if (l.author !== me && l.to !== me && profile.partnerOf(l.author) !== me) continue;
    const toMe = l.author !== me;
    const readable = !toMe || l.status === 'opened';
    const label = /^ábreme cuando/i.test(String(l.condition || '')) ? l.condition : `Ábreme cuando ${l.condition || ''}`.trim();
    items.push({ group: 'letters', id: l.id, title: label, fields: readable ? [label, l.body, l.signature] : [label], sealed: !readable,
      href: toMe && readable ? `#/cartas/${encodeURIComponent(l.id)}` : '#/cartas' });
  }
  for (const c of content.filter((r) => r.kind === 'coupon' && isPublic(r))) {
    if (seed.needsCompletion(c.title)) continue;
    items.push({ group: 'coupons', id: c.id, title: c.title, fields: [c.title, c.description, c.dedication], date: c.expiresOn || '', href: '#/cupones' });
  }
  return items.map((it) => ({ ...it, haystack: it.fields.filter(Boolean).map(String) }));
}

/** Every word of the query must appear somewhere in the item (accent and case insensitive). */
export function search(items, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length || fold(query).trim().length < MIN) return [];
  return items.map((it) => {
    const folded = it.haystack.map(foldKeep);
    if (!words.every((w) => folded.some((f) => f.includes(w)))) return null;
    const inTitle = words.filter((w) => foldKeep(it.title).includes(w)).length;
    const hit = folded.findIndex((f) => f.includes(words[0]));
    // A title hit still shows the next field (note, text) as context.
    return { ...it, score: inTitle * 10 + (hit === 0 ? 1 : 0), excerptSource: it.haystack[hit > 0 ? hit : 1] || '' };
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
}

/** Text with each query word wrapped in <mark> (built with nodes, never innerHTML). */
function highlight(text, words) {
  const src = String(text || '');
  const f = foldKeep(src);
  const ranges = [];
  for (const w of words) { let i = f.indexOf(w); while (i >= 0 && w) { ranges.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } }
  ranges.sort((a, b) => a[0] - b[0]);
  const out = []; let pos = 0;
  for (const [a, b] of ranges) { if (a < pos) continue; if (a > pos) out.push(src.slice(pos, a)); out.push(el('mark', {}, src.slice(a, b))); pos = b; }
  if (pos < src.length) out.push(src.slice(pos));
  return out;
}

function excerpt(text, words, size = 120) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  const f = foldKeep(src);
  const i = Math.max(0, ...[f.indexOf(words[0])].filter((x) => x >= 0), 0);
  const start = Math.max(0, i - 40);
  const cut = src.slice(start, start + size);
  return `${start > 0 ? '…' : ''}${cut}${start + size < src.length ? '…' : ''}`;
}

const GROUPS = [
  { id: 'memories', title: 'Recuerdos', icon: 'hourglass' },
  { id: 'letters', title: 'Cartas', icon: 'mail' },
  { id: 'coupons', title: 'Cupones', icon: 'ticket' },
];

export function render() {
  const input = el('input', { class: 'input search-input', type: 'search', id: 'search-q', autocomplete: 'off', enterkeyhint: 'search',
    placeholder: 'Un lugar, una palabra, un nombre…', 'aria-describedby': 'search-hint', maxlength: '80', dataset: { autofocus: '' } });
  const clear = el('button', { class: 'icon-btn search-clear', type: 'button', 'aria-label': 'Borrar la búsqueda', hidden: true, onClick: () => { input.value = ''; run(); input.focus(); } }, icon('x'));
  const status = el('p', { class: 'muted small search-status', id: 'search-hint', role: 'status', 'aria-live': 'polite' }, 'Busca en recuerdos, cartas y cupones. Lo privado y lo "Solo yo" no aparecen.');
  const results = el('div', { class: 'search-results' });
  let items = null;
  const ready = buildIndex().then((x) => { items = x; });

  const run = util.debounce(async () => {
    clear.hidden = !input.value;
    await ready;
    const q = input.value.trim();
    if (fold(q).length < MIN) {
      results.replaceChildren();
      status.textContent = q ? 'Escribe al menos 2 letras.' : 'Busca en recuerdos, cartas y cupones. Lo privado y lo "Solo yo" no aparecen.';
      return;
    }
    const words = fold(q).split(/\s+/).filter(Boolean);
    const found = search(items, q);
    status.textContent = found.length ? `${found.length} ${found.length === 1 ? 'resultado' : 'resultados'} para "${q}".` : `Nada con "${q}". Prueba con otra palabra.`;
    if (!found.length) { results.replaceChildren(ui.emptyState({ title: 'Sin resultados', text: 'Prueba con menos palabras o sin tildes.', art: 'lantern' })); return; }
    results.replaceChildren(...GROUPS.map((g) => {
      const list = found.filter((r) => r.group === g.id);
      if (!list.length) return null;
      return el('section', { class: 'card search-group', 'aria-labelledby': `sg-${g.id}` },
        el('h2', { class: 'card-title search-group-title', id: `sg-${g.id}` }, icon(g.icon, { size: 20 }), g.title, el('span', { class: 'badge', 'aria-label': `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'}` }, String(list.length))),
        el('ul', { class: 'search-list' }, list.slice(0, PER_GROUP).map((r) => el('li', {},
          el('a', { class: 'search-hit', href: r.href },
            el('span', { class: 'search-hit-title' }, ...highlight(r.title, words)),
            r.sealed ? el('span', { class: 'search-hit-sub' }, 'Carta sin abrir: su texto no se busca hasta que la abras.')
              : r.excerptSource && r.excerptSource !== r.title ? el('span', { class: 'search-hit-sub' }, ...highlight(excerpt(r.excerptSource, words), words)) : null,
            r.date && util.parseDay(r.date) ? el('span', { class: 'search-hit-date' }, r.group === 'coupons' ? `Vence el ${fmtDate.format(util.parseDay(r.date))}` : fmtDate.format(util.parseDay(r.date))) : null)))),
        list.length > PER_GROUP ? el('p', { class: 'muted small' }, `Y ${list.length - PER_GROUP} más. Afina la búsqueda para verlos.`) : null);
    }).filter(Boolean));
  }, 150);
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; run(); } });

  return el('section', { class: 'page search-page' },
    ui.pageHeader({ title: 'Buscar', back: '/inicio' }),
    el('div', { class: 'search-box', role: 'search' },
      el('label', { class: 'visually-hidden', for: 'search-q' }, 'Buscar'),
      icon('search', { size: 20, cls: 'search-icon' }), input, clear),
    status, results);
}
