// Recetas y menú de citas en casa (docs/05 Más §39): their own cookbook (photo, servings, time,
// difficulty, ingredients with amounts, numbered steps with optional timers, tags and "who cooks it
// best"), a cook mode (big step by step, Screen Wake Lock when the browser allows it, hourglass timers)
// and the date-at-home menu: starter, main, dessert and drink (no alcohol unless they turn it on),
// songs and ambience; a printable menu card, the shopping list sent to Listas without duplicates,
// a date in the Calendario and, at the end, a rating and a memory in the Cápsula.
import { ui, util, db, profile, CONFIG } from '../core.js';
import { photoField, dropOldMedia, mediaImg, isQuotaError } from './hogar-kit.js';
import { addItems, openLists, norm } from './listas.js';

const { el, icon } = util;
const KEY = 'aishiteru.recetas.tab';
export const TAGS = ['dulce', 'salado', 'rápido', 'especial', 'japonés'];
export const DIFFICULTY = [{ value: 'facil', label: 'Fácil' }, { value: 'media', label: 'Media' }, { value: 'dificil', label: 'Difícil' }];
const COOKS = [{ value: 'sofia', label: () => profile.name('sofia') }, { value: 'david', label: () => profile.name('david') }, { value: 'both', label: () => 'Los dos' }];
const COURSES = [['starterId', 'Entrada'], ['mainId', 'Plato fuerte'], ['dessertId', 'Postre']];
const UNITS = ['g', 'kg', 'ml', 'l', 'taza', 'tazas', 'cda', 'cdas', 'cdta', 'cdtas', 'unidad', 'unidades', 'pizca', 'diente', 'dientes', 'lonja', 'lonjas', 'hoja', 'hojas', 'lata', 'paquete'];

// ---------- pure helpers (unit-tested) ----------

/** "200 g arroz" -> { qty: '200', unit: 'g', text: 'arroz' }; "Sal al gusto" -> { qty: '', unit: '', text: 'Sal al gusto' }. */
export function parseIngredient(line) {
  const s = String(line || '').trim().replace(/\s+/g, ' ');
  const m = /^(\d+(?:[.,/]\d+)?|½|¼|¾)\s*(.*)$/.exec(s);
  if (!m) return { qty: '', unit: '', text: s };
  let rest = m[2];
  const u = UNITS.find((x) => rest.toLowerCase().startsWith(`${x} `) || rest.toLowerCase() === x);
  let unit = '';
  if (u) { unit = rest.slice(0, u.length); rest = rest.slice(u.length).trim(); }
  rest = rest.replace(/^de\s+/i, '');
  return { qty: m[1], unit, text: rest || s };
}
export const ingredientLine = (i) => [i.qty, i.unit, i.qty && i.unit ? 'de' : '', i.text].filter(Boolean).join(' ').replace(/ de de /, ' de ');

/** "Hervir el arroz (15 min)" -> { text: 'Hervir el arroz', timerSec: 900 }. Also "[10 min]" or "(1 h)". */
export function parseStep(line) {
  const s = String(line || '').trim();
  const m = /\s*[([]\s*(\d+(?:[.,]\d+)?)\s*(min|minutos?|h|horas?|s|seg|segundos?)\s*[)\]]\s*$/i.exec(s);
  if (!m) return { text: s, timerSec: 0 };
  const n = Number(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  const sec = unit.startsWith('h') ? n * 3600 : unit.startsWith('s') ? n : n * 60;
  return { text: s.slice(0, m.index).trim() || s, timerSec: Math.round(sec) };
}
export const stepLine = (st) => (st.timerSec ? `${st.text} (${st.timerSec % 3600 === 0 ? `${st.timerSec / 3600} h` : `${Math.round(st.timerSec / 60)} min`})` : st.text);

/** Shopping texts for several recipes: one per ingredient, merged by name (no duplicates). */
export function shoppingTexts(recipes) {
  const seen = new Map();
  for (const r of recipes) for (const i of r?.ingredients || []) {
    const k = norm(i.text);
    if (k && !seen.has(k)) seen.set(k, i.text.charAt(0).toUpperCase() + i.text.slice(1));
  }
  return [...seen.values()];
}

const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const fmtTimer = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec % 60)).padStart(2, '0')}`;

// ---------- recipe editor ----------
function recipeEditor(existing, { onSaved }) {
  const r = existing || {};
  const name = ui.input({ value: r.name || '', maxlength: 80 });
  const servings = ui.input({ type: 'number', min: '1', max: '30', value: r.servings || 2, inputmode: 'numeric' });
  const minutes = ui.input({ type: 'number', min: '1', max: '1440', value: r.minutes || 30, inputmode: 'numeric' });
  let difficulty = r.difficulty || 'facil';
  let bestCook = r.bestCook || 'both';
  const tags = new Set(r.tags || []);
  const ingredients = ui.textarea({ rows: 6, maxlength: 3000, placeholder: '200 g de arroz\n2 huevos\nSal al gusto' });
  ingredients.value = (r.ingredients || []).map(ingredientLine).join('\n');
  const steps = ui.textarea({ rows: 7, maxlength: 6000, placeholder: 'Lavar el arroz\nCocinar a fuego bajo (15 min)' });
  steps.value = (r.steps || []).map(stepLine).join('\n');
  const photo = photoField({ mediaId: r.mediaId || null, label: 'Foto del plato (opcional)', alt: r.name || 'Plato' });
  const fName = ui.field({ label: 'Nombre', control: name });
  const fIng = ui.field({ label: 'Ingredientes, uno por línea', control: ingredients, hint: 'Cantidad, unidad e ingrediente: "200 g de arroz".' });
  const fSteps = ui.field({ label: 'Pasos, uno por línea', control: steps, hint: 'Para un temporizador, termina el paso con "(10 min)".' });
  const tagRow = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Etiquetas' }, TAGS.map((t) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tags.has(t)), onClick: () => { if (tags.has(t)) tags.delete(t); else tags.add(t); b.setAttribute('aria-pressed', String(tags.has(t))); } }, t);
    return b;
  }));
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  return ui.openModal({
    title: existing ? 'Editar receta' : 'Nueva receta', size: 'md',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
      photo.node, fName,
      el('div', { class: 'cal-form-row' }, ui.field({ label: 'Porciones', control: servings }), ui.field({ label: 'Minutos', control: minutes })),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Dificultad'), ui.segmented({ label: 'Dificultad', value: difficulty, options: DIFFICULTY, onChange: (v) => { difficulty = v; } })),
      fIng, fSteps,
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Etiquetas'), tagRow),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, '¿Quién la cocina mejor?'), ui.segmented({ label: '¿Quién la cocina mejor?', value: bestCook, options: COOKS.map((c) => ({ value: c.value, label: c.label() })), onChange: (v) => { bestCook = v; } })),
      err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      err.textContent = '';
      if (photo.busy()) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
      if (!name.value.trim()) { fName.setError('Ponle nombre.'); name.focus(); return false; }
      const ing = ingredients.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => ({ id: r.ingredients?.[i]?.id || util.uuid(), ...parseIngredient(l) }));
      const st = steps.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => ({ id: r.steps?.[i]?.id || util.uuid(), ...parseStep(l) }));
      if (!ing.length) { fIng.setError('Escribe al menos un ingrediente.'); return false; }
      if (!st.length) { fSteps.setError('Escribe al menos un paso.'); return false; }
      const id = r.id || util.uuid();
      try {
        const mediaId = await photo.commit('recipes', id);
        const rec = { ...r, id, name: name.value.trim(), mediaId, servings: Math.max(1, Number(servings.value) || 1), minutes: Math.max(1, Number(minutes.value) || 1), difficulty, ingredients: ing, steps: st, tags: [...tags], bestCook, verify: false, cooked: r.cooked || [], visibility: 'shared', owner: 'both' };
        await db.put('recipes', rec);
        await dropOldMedia([r.mediaId], [mediaId]);
        photo.revoke(); onSaved(rec); return true;
      } catch (x) { console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar.'; return false; }
    } }],
  });
}

// ---------- shopping list ----------
async function toShopping(recipes, { name }) {
  const texts = shoppingTexts(recipes);
  const lists = await openLists('shopping');
  let listId = null;
  if (lists.length) {
    const sel = el('select', { class: 'input' }, el('option', { value: '' }, `Una lista nueva: "${name}"`), lists.map((l) => el('option', { value: l.id }, l.name)));
    const m = ui.openModal({ title: 'Lista de compras', size: 'sm', body: el('div', { class: 'stack' }, el('p', {}, `${texts.length} ingredientes. Los que ya estén en la lista no se repiten.`), ui.field({ label: '¿A cuál lista?', control: sel })),
      actions: [{ label: 'Cancelar', variant: 'ghost', value: 'cancel' }, { label: 'Enviar', variant: 'primary', value: 'ok', onClick: () => { listId = sel.value || null; } }] });
    if ((await m.result) !== 'ok') return;
  }
  const res = await addItems({ listId, name, kind: 'shopping', texts });
  ui.toast(res.added ? `${res.added} ingredientes en "${res.list.name}".` : 'Ya estaban todos en la lista.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/listas'; } } });
}

// ---------- cook mode ----------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); return true; }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { return false; }
  return on ? false : true;
}

export function cookMode(recipe) {
  let i = 0; let timer = null; let left = 0; let running = false;
  const stepBox = el('div', { class: 'cook-step', 'aria-live': 'polite' });
  const awakeNote = el('p', { class: 'muted small cook-awake' });
  const glass = el('div', { class: 'hourglass', 'aria-hidden': 'true' }, el('span', { class: 'hourglass-top' }), el('span', { class: 'hourglass-bottom' }));
  const clock = el('span', { class: 'cook-clock', role: 'timer', 'aria-live': 'off' });
  const timerBtn = ui.button({ label: 'Iniciar', iconName: 'play', small: true });
  const timerBox = el('div', { class: 'cook-timer' }, glass, clock, timerBtn);
  const stop = () => { clearInterval(timer); timer = null; running = false; timerBox.classList.remove('is-running'); };
  const tick = () => {
    left--; clock.textContent = fmtTimer(left);
    glass.style.setProperty('--p', String(1 - left / (recipe.steps[i].timerSec || 1)));
    if (left <= 0) { stop(); timerBox.classList.add('is-done'); clock.textContent = '¡Listo!'; util.haptic([200, 100, 200]); util.chime?.(); ui.announce(`Terminó el tiempo del paso ${i + 1}.`); }
  };
  timerBtn.addEventListener('click', () => {
    if (running) { stop(); timerBtn.querySelector('span').textContent = 'Seguir'; return; }
    if (left <= 0) left = recipe.steps[i].timerSec;
    running = true; timerBox.classList.add('is-running'); timerBox.classList.remove('is-done'); timerBtn.querySelector('span').textContent = 'Pausar';
    timer = setInterval(tick, 1000);
  });
  const prev = ui.button({ label: 'Anterior', iconName: 'chevron-left', variant: 'ghost', onClick: () => go(i - 1) });
  const next = ui.button({ label: 'Siguiente', iconName: 'chevron-right', variant: 'primary', onClick: () => go(i + 1) });
  const counter = el('p', { class: 'cook-counter' });
  const go = (n) => {
    if (n >= recipe.steps.length) { modal.close('done'); return; }
    i = Math.max(0, n); stop();
    const st = recipe.steps[i];
    left = st.timerSec || 0;
    counter.textContent = `Paso ${i + 1} de ${recipe.steps.length}`;
    stepBox.replaceChildren(el('span', { class: 'cook-num', 'aria-hidden': 'true' }, String(i + 1)), el('p', {}, st.text));
    timerBox.hidden = !st.timerSec; timerBox.classList.remove('is-done', 'is-running');
    clock.textContent = fmtTimer(left); glass.style.setProperty('--p', '0'); timerBtn.querySelector('span').textContent = 'Iniciar';
    prev.disabled = i === 0;
    next.querySelector('span').textContent = i === recipe.steps.length - 1 ? 'Terminar' : 'Siguiente';
  };
  const onVis = () => { if (document.visibilityState === 'visible' && wakeLock === null) keepAwake(true); };
  const modal = ui.openModal({
    title: recipe.name, size: 'lg', className: 'cook-modal',
    body: el('div', { class: 'cook' }, el('div', { class: 'cook-hat', 'aria-hidden': 'true' }, icon('chef-hat', { size: 40 })), counter, stepBox, timerBox, awakeNote, el('div', { class: 'cook-nav' }, prev, next)),
    onClose: () => { stop(); keepAwake(false); document.removeEventListener('visibilitychange', onVis); },
  });
  keepAwake(true).then((ok) => { awakeNote.textContent = ok ? 'La pantalla se queda encendida mientras cocinan.' : 'Este navegador no deja mantener la pantalla encendida; tóquenla de vez en cuando.'; });
  document.addEventListener('visibilitychange', onVis);
  go(0);
  return modal;
}

// ---------- recipe detail ----------
function recipeDetail(r, { reload, urls }) {
  const cooks = { sofia: profile.name('sofia'), david: profile.name('david'), both: 'Los dos' };
  const cooked = r.cooked || [];
  const markCooked = async () => {
    await db.put('recipes', { ...r, cooked: [...cooked, { date: util.localDay(), by: profile.active() }] });
    util.haptic([10, 30, 10]); ui.confetti({ count: 24 });
    ui.toast(cooked.length ? '¡Otra vez! Anotado.' : '¡Su primer plato juntos con esta receta!', { tone: 'success' });
    modal.close(); reload();
  };
  const modal = ui.openModal({
    title: r.name, size: 'md', className: 'recipe-modal',
    body: el('div', { class: 'stack recipe-detail' },
      r.mediaId ? el('div', { class: 'recipe-hero' }, mediaImg(r.mediaId, { alt: r.name, urls })) : null,
      el('p', { class: 'recipe-meta' }, [`${r.minutes} min`, `${r.servings} ${r.servings === 1 ? 'porción' : 'porciones'}`, DIFFICULTY.find((d) => d.value === r.difficulty)?.label, `La cocina mejor: ${cooks[r.bestCook] || 'Los dos'}`].filter(Boolean).join(' · ')),
      r.tags?.length ? el('ul', { class: 'tag-row' }, r.tags.map((t) => el('li', { class: 'tag' }, t))) : null,
      r.verify ? el('p', { class: 'card note-card small kit-note' }, icon('info', { size: 16 }), ' Receta de ejemplo: revisen cantidades y tiempos a su gusto.') : null,
      el('h3', { class: 'recipe-h' }, 'Ingredientes'),
      el('ul', { class: 'recipe-ings' }, r.ingredients.map((i) => el('li', {}, el('label', { class: 'check-inline' }, el('input', { type: 'checkbox' }), el('span', {}, ingredientLine(i)))))),
      el('h3', { class: 'recipe-h' }, 'Pasos'),
      el('ol', { class: 'recipe-steps' }, r.steps.map((s) => el('li', {}, s.text, s.timerSec ? el('span', { class: 'badge' }, icon('clock', { size: 12 }), ` ${Math.round(s.timerSec / 60)} min`) : null))),
      cooked.length ? el('p', { class: 'muted small' }, `La han cocinado ${cooked.length} ${cooked.length === 1 ? 'vez' : 'veces'}; la última, el ${util.formatDay(cooked[cooked.length - 1].date)}.`) : null,
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Modo cocina', iconName: 'chef-hat', variant: 'primary', onClick: async () => { modal.close(); const m = cookMode(r); if ((await m.result) === 'done') markCooked(); } }),
        ui.button({ label: 'La cocinamos', iconName: 'circle-check', onClick: markCooked }),
        ui.button({ label: 'A la lista', iconName: 'list-todo', variant: 'ghost', onClick: () => toShopping([r], { name: `Mercado: ${r.name}` }) })),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Editar', iconName: 'pencil', variant: 'ghost', small: true, onClick: () => { modal.close(); recipeEditor(r, { onSaved: reload }); } }),
        ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar esta receta?', message: `"${r.name}" se borra en los dos teléfonos.`, confirmLabel: 'Borrar', danger: true }))) return;
          if (r.mediaId) await db.rawDelete('media', r.mediaId).catch(() => {});
          await db.purge('recipes', r.id); modal.close(); reload();
        } }))),
  });
  return modal;
}

// ---------- date menu ----------
function menuEditor(existing, recipes, songs, { onSaved }) {
  const m = existing || {};
  const date = ui.input({ type: 'date', value: m.date || util.localDay() });
  const pick = (key, label) => {
    const sel = el('select', { class: 'input' }, el('option', { value: '' }, 'Sin elegir'), recipes.map((r) => el('option', { value: r.id, selected: m[key] === r.id }, r.name)));
    return { key, sel, field: ui.field({ label, control: sel }) };
  };
  const picks = COURSES.map(([k, l]) => pick(k, l));
  let alcohol = !!m.alcohol;
  const drinks = () => (CONFIG.drinkIdeas || []).filter((d) => alcohol || !d.alcohol);
  const drink = ui.input({ value: m.drink || '', maxlength: 80, list: 'drink-ideas' });
  const dl = el('datalist', { id: 'drink-ideas' });
  const paintDrinks = () => dl.replaceChildren(...drinks().map((d) => el('option', { value: d.name })));
  paintDrinks();
  const songBox = el('div', { class: 'stack-tight menu-songs' }, songs.length ? songs.slice(0, 30).map((s) => el('label', { class: 'check-inline' }, el('input', { type: 'checkbox', value: s.id, checked: (m.songIds || []).includes(s.id) }), el('span', {}, s.title || 'Canción'))) : el('p', { class: 'muted small' }, 'Agreguen canciones en Canciones para elegirlas aquí.'));
  const ambience = ui.input({ value: m.ambience || '', maxlength: 120, placeholder: 'Velas, mantel, flores, luz baja' });
  const fDate = ui.field({ label: 'Fecha', control: date });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  return ui.openModal({
    title: existing ? 'Editar menú' : 'Menú de cita en casa', size: 'md',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, fDate, ...picks.map((p) => p.field),
      ui.field({ label: 'Bebida', control: drink }), dl,
      ui.toggle({ label: 'Incluir bebidas con alcohol', checked: alcohol, hint: 'Apagado por defecto.', onChange: (v) => { alcohol = v; paintDrinks(); } }),
      el('div', { class: 'stack-tight' }, el('span', { class: 'field-label' }, 'Música'), songBox),
      ui.field({ label: 'Ambientación', control: ambience }), err),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!util.isValidDay(date.value)) { fDate.setError('Elige una fecha.'); return false; }
      if (!picks.some((p) => p.sel.value)) { err.textContent = 'Elige al menos un plato.'; return false; }
      const rec = { ...m, id: m.id || util.uuid(), date: date.value, drink: drink.value.trim(), alcohol, songIds: [...songBox.querySelectorAll('input:checked')].map((x) => x.value), ambience: ambience.value.trim(), visibility: 'shared', owner: 'both', by: m.by || profile.active() };
      for (const p of picks) rec[p.key] = p.sel.value || null;
      await db.put('dateMenus', rec); onSaved(rec); return true;
    } }],
  });
}

function menuCard(menu, recipes, songs) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const date = util.parseDay(menu.date);
  return el('article', { class: 'menu-card', 'aria-label': `Menú del ${util.formatDay(menu.date)}` },
    el('header', { class: 'menu-card-head' },
      el('p', { class: 'menu-card-kicker' }, 'Menú de esta noche'),
      el('p', { class: 'menu-card-date' }, date ? capitalize(new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)) : ''),
      el('p', { class: 'menu-card-for' }, `${profile.name('sofia')} & ${profile.name('david')}`)),
    el('dl', { class: 'menu-card-list' },
      ...COURSES.map(([k, label]) => (menu[k] && byId.get(menu[k]) ? el('div', {}, el('dt', {}, label), el('dd', {}, byId.get(menu[k]).name)) : null)).filter(Boolean),
      menu.drink ? el('div', {}, el('dt', {}, 'Bebida'), el('dd', {}, menu.drink)) : null),
    (menu.songIds || []).length ? el('p', { class: 'menu-card-extra' }, icon('music', { size: 14 }), ' ', menu.songIds.map((id) => songs.find((s) => s.id === id)?.title).filter(Boolean).join(' · ')) : null,
    menu.ambience ? el('p', { class: 'menu-card-extra' }, icon('sparkles', { size: 14 }), ` ${menu.ambience}`) : null,
    el('span', { class: 'menu-card-hanko', 'aria-hidden': 'true' }, '愛'));
}

function rateMenu(menu, { onSaved }) {
  let rating = menu.rating || 0;
  const stars = el('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Calificación' });
  const paint = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { class: `star-btn${n <= rating ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(n === rating), 'aria-label': `${n} de 5`, onClick: () => { rating = n; paint(); } }, icon('star', { size: 28 }))));
  paint();
  const note = ui.textarea({ rows: 3, maxlength: 600, placeholder: '¿Qué fue lo mejor?' }); note.value = menu.note || '';
  const asMemory = el('input', { type: 'checkbox', checked: !menu.memoryId });
  return ui.openModal({
    title: '¿Cómo estuvo?', size: 'sm',
    body: el('div', { class: 'stack' }, stars, ui.field({ label: 'Nota (opcional)', control: note }), menu.memoryId ? null : el('label', { class: 'check-inline' }, asMemory, el('span', {}, 'Guardarlo como recuerdo en la Cápsula'))),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!rating) { ui.toast('Elige de 1 a 5 estrellas.'); return false; }
      const rec = { ...menu, rating, note: note.value.trim(), doneAt: menu.doneAt || util.localDay() };
      if (!menu.memoryId && asMemory.checked) {
        const mem = { id: util.uuid(), date: menu.date, title: 'Cena en casa', note: note.value.trim(), mediaIds: [], visibility: 'shared', owner: 'both', by: profile.active(), fromMenu: menu.id };
        await db.put('memories', mem); rec.memoryId = mem.id;
      }
      await db.put('dateMenus', rec); ui.confetti({ count: 20 }); onSaved(); return true;
    } }],
  });
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide recetas' });
  const urls = new Set();
  let tab = 'recetas'; try { tab = sessionStorage.getItem(KEY) || 'recetas'; } catch { /* ignore */ }
  let tag = ''; let q = '';
  const addRecipe = () => recipeEditor(null, { onSaved: (r) => { ui.toast('Receta guardada.', { tone: 'success' }); load(); recipeDetail(r, { reload: load, urls }); } });
  let data = { recipes: [], menus: [], songs: [] };
  const addMenu = () => menuEditor(null, data.recipes, data.songs, { onSaved: () => { ui.toast('Menú listo.', { tone: 'success' }); load(); } });
  const newBtn = ui.newButton('Nuevo', () => (tab === 'menus' ? addMenu() : addRecipe()));
  page.append(ui.pageHeader({ title: 'Recetas y menú', jp: 'レシピ', romaji: 'reshipi', back: '/mas', actions: [newBtn] }));
  const tabs = ui.segmented({ label: 'Ver', value: tab, options: [{ value: 'recetas', label: 'Recetas', icon: 'chef-hat' }, { value: 'menus', label: 'Menú en casa', icon: 'sparkles' }], onChange: (v) => { tab = v; try { sessionStorage.setItem(KEY, v); } catch { /* ignore */ } load(); } });
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(el('div', { class: 'stack' }, tabs, body));

  const load = async () => {
    for (const u of urls) URL.revokeObjectURL(u); urls.clear();
    const [recipes, menus, songs] = await Promise.all([db.query('recipes'), db.query('dateMenus'), db.query('songs')]);
    data = { recipes: recipes.filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'es')), menus: menus.filter((m) => !m.deleted).sort((a, b) => b.date.localeCompare(a.date)), songs: songs.filter((s) => !s.deleted) };
    if (tab === 'menus') return paintMenus();
    const search = ui.input({ type: 'search', value: q, placeholder: 'Buscar receta o ingrediente', 'aria-label': 'Buscar receta' });
    search.addEventListener('input', util.debounce(() => { q = search.value; paintList(); }, 200));
    const chips = el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filtrar por etiqueta' }, ['', ...TAGS].map((t) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(tag === t), onClick: (e) => { tag = t; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); paintList(); } }, t || 'Todas')));
    const grid = el('div');
    const paintList = () => {
      const k = norm(q);
      const shown = data.recipes.filter((r) => (!tag || r.tags?.includes(tag)) && (!k || norm(r.name).includes(k) || r.ingredients.some((i) => norm(i.text).includes(k))));
      if (!data.recipes.length) { grid.replaceChildren(ui.emptyState({ title: 'Su primera receta', text: 'Lo que cocinan juntos, con pasos y temporizadores.', art: 'omamori', action: { label: 'Agregar receta', onClick: addRecipe } })); return; }
      if (!shown.length) { grid.replaceChildren(el('p', { class: 'muted' }, 'Nada coincide con esa búsqueda.')); return; }
      grid.replaceChildren(el('ul', { class: 'recipe-grid' }, shown.map((r) => el('li', {},
        el('button', { class: 'recipe-card', type: 'button', onClick: () => recipeDetail(r, { reload: load, urls }) },
          el('span', { class: 'recipe-card-photo' }, r.mediaId ? mediaImg(r.mediaId, { alt: '', urls }) : icon('chef-hat', { size: 36 })),
          el('span', { class: 'recipe-card-text' }, el('strong', {}, r.name), el('span', { class: 'muted small' }, `${r.minutes} min · ${DIFFICULTY.find((d) => d.value === r.difficulty)?.label || ''}${(r.cooked || []).length ? ` · ${(r.cooked || []).length}×` : ''}`)))))));
    };
    body.replaceChildren(search, chips, grid);
    paintList();
  };

  const paintMenus = () => {
    if (!data.recipes.length) { body.replaceChildren(ui.emptyState({ title: 'Primero, una receta', text: 'El menú se arma con sus recetas: entrada, plato fuerte y postre.', art: 'omamori', action: { label: 'Agregar receta', onClick: addRecipe } })); return; }
    if (!data.menus.length) { body.replaceChildren(ui.emptyState({ title: 'Una noche en casa', text: 'Elijan entrada, plato fuerte, postre, bebida y música. Sale una carta de restaurante para ver o imprimir.', art: 'omamori', action: { label: 'Armar un menú', onClick: addMenu } })); return; }
    const byId = new Map(data.recipes.map((r) => [r.id, r]));
    body.replaceChildren(el('div', { class: 'menu-list' }, data.menus.map((m) => {
      const chosen = COURSES.map(([k]) => byId.get(m[k])).filter(Boolean);
      const schedule = async () => {
        const ev = { id: m.eventId || util.uuid(), by: profile.active(), title: 'Cena en casa', start: `${m.date}T19:30`, place: 'En casa', note: chosen.map((r) => r.name).join(', '), remind: '1d' };
        await db.put('events', ev); await db.put('dateMenus', { ...m, eventId: ev.id });
        ui.toast('Está en el Calendario.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/calendario'; } } }); load();
      };
      const print = () => {
        const sheet = el('div', { class: 'print-menu' }, menuCard(m, data.recipes, data.songs));
        document.body.append(sheet); document.body.classList.add('printing-menu');
        const done = () => { sheet.remove(); document.body.classList.remove('printing-menu'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done); window.print(); setTimeout(done, 60000);
      };
      return el('section', { class: 'menu-item' }, menuCard(m, data.recipes, data.songs),
        m.rating ? el('p', { class: 'menu-rating', 'aria-label': `${m.rating} de 5 estrellas` }, '★'.repeat(m.rating), el('span', { class: 'muted' }, '☆'.repeat(5 - m.rating))) : null,
        el('div', { class: 'btn-row' },
          ui.button({ label: 'Lista de compras', iconName: 'list-todo', small: true, onClick: () => toShopping(chosen, { name: `Cena del ${util.formatDay(m.date)}` }) }),
          m.eventId ? null : ui.button({ label: 'Agendar', iconName: 'calendar', small: true, onClick: schedule }),
          ui.button({ label: m.rating ? 'Calificación' : 'Calificar', iconName: 'star', small: true, variant: m.rating ? 'ghost' : 'secondary', onClick: () => rateMenu(m, { onSaved: load }) }),
          ui.button({ label: 'Imprimir', iconName: 'printer', small: true, variant: 'ghost', onClick: print }),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Editar menú', onClick: () => menuEditor(m, data.recipes, data.songs, { onSaved: load }) }, icon('pencil', { size: 16 })),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar menú', onClick: async () => {
            if (!(await ui.confirmDialog({ title: '¿Borrar este menú?', message: 'Se borra en los dos teléfonos. La cita del calendario y el recuerdo se quedan.', confirmLabel: 'Borrar', danger: true }))) return;
            await db.purge('dateMenus', m.id); load();
          } }, icon('trash-2', { size: 16 }))));
    })));
  };

  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir las recetas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (['recipes', 'dateMenus'].includes(s) && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); for (const u of urls) URL.revokeObjectURL(u); keepAwake(false); } };
}
