// Mascotas (docs/05 Más §26): several pets, each with an editable profile (partial dates allowed),
// live age and days at home, health records with next doses and status, weight curve, vet visits and
// a contacts directory, medicines with daily boxes, food/litter supplies with refill date, expenses by
// category (with a "Fondo veterinario" goal in the Alcancía) and a moments timeline that can go to
// the Cápsula. Birthdays and arrival days reach the Calendario and Fechas especiales on their own
// (core/dates.js). Health templates are generic and never replace the vet.
import { ui, util, db, profile, CONFIG } from '../core.js';
import * as time from '../core/time.js';
import * as ics from '../core/ics.js';
import { openViewer } from '../core/viewer.js';
import { kittyArt, coatSwatch, COATS, COLLARS, coatId } from '../core/kitty.js';
import { photoField, dropOldMedia, mediaImg, moneyField, barChart, lineChart, tagsInput, lastMonths, monthLabel, monthOf, isQuotaError } from './hogar-kit.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDM = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const SOON_DAYS = 14;
const KEY = 'aishiteru.pet';

export const SPECIES = [{ value: 'gato', label: 'Gato' }, { value: 'perro', label: 'Perro' }, { value: 'otro', label: 'Otro' }];
export const EXPENSE_CATS = [
  { value: 'comida', label: 'Comida' }, { value: 'arena', label: 'Arena' }, { value: 'veterinario', label: 'Veterinario' },
  { value: 'juguetes', label: 'Juguetes' }, { value: 'otros', label: 'Otros' },
];

// ---------- pure helpers (unit-tested) ----------

/** { y, m, d } (year may be null) -> Date, or null without a full date. */
export const fullDate = (p) => (p && p.y && p.m && p.d ? new Date(p.y, p.m - 1, p.d) : null);

/** "2 años y 3 meses", "5 meses y 12 días", "12 días"; null without a full date. */
export function ageText(partial, now = new Date()) {
  // Only the year (v0.30.0): an approximate age.
  if (partial?.y && !(partial.m && partial.d)) {
    const n = now.getFullYear() - partial.y;
    return n <= 0 ? 'Menos de 1 año' : `Unos ${n} ${n === 1 ? 'año' : 'años'}`;
  }
  const d = fullDate(partial);
  if (!d || d > now) return null;
  const e = time.elapsed(d, now);
  const part = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const bits = e.years ? [part(e.years, 'año', 'años'), part(e.months, 'mes', 'meses')] : e.months ? [part(e.months, 'mes', 'meses'), part(e.days, 'día', 'días')] : [part(e.days, 'día', 'días') || 'Hoy'];
  return bits.filter(Boolean).join(' y ');
}

/** Days at home since the arrival date (null without a full date). */
export function daysHome(partial, now = new Date()) {
  const d = fullDate(partial);
  return d && d <= now ? util.daysBetween(d, now) : null;
}

/** Status of a dose by its next date: 'overdue' | 'soon' | 'ok' | 'none'. */
export function doseStatus(next, today = util.localDay()) {
  if (!next || !util.isValidDay(next)) return 'none';
  if (next < today) return 'overdue';
  const d = util.daysBetween(util.parseDay(today), util.parseDay(next));
  return d <= SOON_DAYS ? 'soon' : 'ok';
}
const STATUS = { overdue: { label: 'Vencida', cls: 'badge-danger' }, soon: { label: 'Próxima', cls: 'badge-warn' }, ok: { label: 'Al día', cls: 'badge-ok' }, none: { label: 'Sin próxima', cls: '' } };

/** Latest record per product (vaccines and deworming): the one that tells the status. */
export function latestByProduct(records) {
  const map = new Map();
  for (const r of records) {
    const k = String(r.data?.product || '').trim().toLowerCase();
    if (!k) continue;
    const prev = map.get(k);
    if (!prev || (r.date || '') > (prev.date || '')) map.set(k, r);
  }
  return [...map.values()];
}

/** "YYYY-MM-DD" + n days. */
export const addDays = (day, n) => { const d = util.parseDay(day); return d ? util.localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(n || 0))) : ''; };

/** Expense totals per "YYYY-MM" from pet records with an amount. */
export function monthlyTotals(records, months) {
  const out = Object.fromEntries(months.map((m) => [m, 0]));
  for (const r of records) { const k = monthOf(r.date); if (k in out) out[k] += Number(r.amountCOP) || 0; }
  return months.map((m) => out[m]);
}

// ---------- record types ----------
/** v0.29.0 (idea 45): a clean health card to print or save as PDF for the vet (the browser's "Guardar como PDF"). */
function printCartilla(pet, recs) {
  const rows = (type) => recs.filter((r) => r.type === type && !r.deleted).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const table = (title, head, list, cells) => (list.length ? el('section', {}, el('h2', {}, title), el('table', {}, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))),
    el('tbody', {}, list.map((r) => el('tr', {}, cells(r).map((c) => el('td', {}, c || '—'))))))) : null);
  const sheet = el('article', { class: 'print-cartilla' },
    el('h1', {}, `Cartilla de salud de ${pet.name}`),
    el('p', {}, [SPECIES.find((x) => x.value === pet.species)?.label, pet.breed, pet.sex, pet.color, pet.microchip ? `Microchip ${pet.microchip}` : ''].filter(Boolean).join(' · ')),
    table('Vacunas', ['Vacuna', 'Aplicada', 'Próxima', 'Veterinario'], rows('vaccine'), (r) => [r.data.product, util.formatDay(r.date), r.data.next ? util.formatDay(r.data.next) : '', r.data.vet]),
    table('Desparasitación', ['Producto', 'Aplicada', 'Próxima', 'Veterinario'], rows('deworm'), (r) => [r.data.product, util.formatDay(r.date), r.data.next ? util.formatDay(r.data.next) : '', r.data.vet]),
    table('Peso', ['Fecha', 'Kg'], rows('weight').slice(0, 12), (r) => [util.formatDay(r.date), String(r.data.kg)]),
    table('Visitas', ['Fecha', 'Motivo', 'Diagnóstico', 'Tratamiento'], rows('vet').slice(0, 12), (r) => [util.formatDay(r.date), r.data.reason, r.data.diagnosis, r.data.treatment]),
    table('Medicinas', ['Medicina', 'Dosis', 'Frecuencia', 'Desde'], rows('medication').slice(0, 12), (r) => [r.data.name, r.data.dose, r.data.frequency, util.formatDay(r.date)]),
    el('p', { class: 'print-foot' }, `Generada el ${util.formatDay(util.localDay())}.`));
  document.body.append(sheet); document.body.classList.add('printing-cartilla');
  const clean = () => { sheet.remove(); document.body.classList.remove('printing-cartilla'); removeEventListener('afterprint', clean); };
  addEventListener('afterprint', clean);
  setTimeout(() => window.print(), 50);
}

const T = {
  vaccine: { label: 'Vacuna', list: 'Vacunas', icon: 'shield-check', photo: 'Foto del carnet (opcional)', fields: [
    ['product', 'Vacuna', 'text', { required: true, max: 80 }], ['date', 'Fecha aplicada', 'date', { required: true, past: true }],
    ['next', 'Próxima dosis', 'date', {}], ['vet', 'Veterinario o clínica', 'text', { max: 80 }], ['note', 'Nota', 'textarea', {}]] },
  deworm: { label: 'Desparasitación', list: 'Desparasitación', icon: 'shield', photo: 'Foto del carnet (opcional)', fields: [
    ['product', 'Producto', 'text', { required: true, max: 80 }], ['date', 'Fecha aplicada', 'date', { required: true, past: true }],
    ['next', 'Próxima dosis', 'date', {}], ['vet', 'Veterinario o clínica', 'text', { max: 80 }], ['note', 'Nota', 'textarea', {}]] },
  weight: { label: 'Peso', list: 'Peso', icon: 'scale', fields: [
    ['date', 'Fecha', 'date', { required: true, past: true }], ['kg', 'Peso en kg', 'number', { required: true, step: '0.01', min: '0.01', max: '150' }], ['note', 'Nota', 'text', { max: 80 }]] },
  vet: { label: 'Visita al veterinario', list: 'Visitas', icon: 'stethoscope', photo: 'Adjunto (opcional)', fields: [
    ['date', 'Fecha', 'date', { required: true, past: true }], ['reason', 'Motivo', 'text', { required: true, max: 100 }], ['clinic', 'Veterinario o clínica', 'text', { max: 80 }],
    ['diagnosis', 'Diagnóstico', 'textarea', {}], ['treatment', 'Tratamiento', 'textarea', {}], ['cost', 'Costo', 'money', {}]] },
  medication: { label: 'Medicina o cuidado', list: 'Medicinas', icon: 'pill', fields: [
    ['name', 'Medicina o cuidado', 'text', { required: true, max: 80 }], ['dose', 'Dosis', 'text', { max: 60 }], ['frequency', 'Frecuencia', 'text', { max: 60, placeholder: 'Ej.: cada 12 horas' }],
    ['date', 'Desde', 'date', { required: true }], ['end', 'Hasta', 'date', {}], ['note', 'Nota', 'textarea', {}]] },
  supply: { label: 'Compra de comida o arena', list: 'Comida y arena', icon: 'package', fields: [
    ['item', 'Qué compraron', 'text', { required: true, max: 80 }], ['date', 'Fecha', 'date', { required: true, past: true }],
    ['lastsDays', 'Dura más o menos (días)', 'number', { step: '1', min: '1', max: '365' }], ['cost', 'Costo', 'money', {}], ['note', 'Nota', 'text', { max: 80 }]] },
  expense: { label: 'Gasto', list: 'Gastos', icon: 'wallet', fields: [
    ['date', 'Fecha', 'date', { required: true, past: true }], ['category', 'Categoría', 'select', { options: EXPENSE_CATS }], ['cost', 'Monto', 'money', { required: true }], ['note', 'Nota', 'text', { max: 80 }]] },
  moment: { label: 'Momento', list: 'Momentos', icon: 'camera', photo: 'Foto', fields: [
    ['date', 'Fecha', 'date', { required: true, past: true }], ['milestone', 'Hito (opcional)', 'select', { options: [] }], ['title', 'Título', 'text', { max: 80 }], ['note', 'Nota', 'textarea', {}]] },
};

function recordEditor(pet, type, existing, { onSaved }) {
  const spec = T[type];
  const data = existing?.data || {};
  const controls = {}; const fields = {};
  const today = util.localDay();
  const tplOptions = (CONFIG.petHealthTemplates || []).filter((t) => t.type === type && (!t.species || t.species === pet.species));
  for (const [key, label, kind, o] of spec.fields) {
    let c;
    const val = key === 'date' ? (existing?.date || today) : key === 'cost' ? (existing?.amountCOP ?? '') : (data[key] ?? '');
    if (kind === 'textarea') { c = ui.textarea({ rows: 3, maxlength: 1000 }); c.value = val; }
    else if (kind === 'money') { const mf = moneyField({ label, value: val }); c = mf.input; c.wrap = mf; }
    else if (kind === 'select') {
      const opts = key === 'milestone' ? (CONFIG.petMilestones || []).map((m) => ({ value: m.id, label: m.title })) : o.options;
      c = el('select', { class: 'input' }, key === 'milestone' ? el('option', { value: '' }, 'Ninguno') : null, opts.map((x) => el('option', { value: x.value, selected: x.value === val }, x.label)));
    } else c = ui.input({ type: kind === 'number' ? 'number' : kind, value: val, maxlength: o.max, step: o.step, min: o.min, max: kind === 'date' && o.past ? today : o.max, placeholder: o.placeholder || '', inputmode: kind === 'number' ? 'decimal' : undefined });
    controls[key] = c;
    fields[key] = kind === 'money' ? c.wrap.node : ui.field({ label, control: c, hint: key === 'next' ? 'Pregunten la fecha real al veterinario.' : key === 'lastsDays' ? 'Con esto calculamos cuándo reponer.' : undefined });
  }
  let tplSel = null;
  if (tplOptions.length && !existing) {
    tplSel = el('select', { class: 'input' }, el('option', { value: '' }, 'Escribir a mano'), tplOptions.map((t) => el('option', { value: t.id }, t.product)));
    const fill = () => {
      const t = tplOptions.find((x) => x.id === tplSel.value); if (!t) return;
      controls.product.value = t.product;
      if (t.everyDays && util.isValidDay(controls.date.value)) controls.next.value = addDays(controls.date.value, t.everyDays);
    };
    tplSel.addEventListener('change', fill);
    controls.date.addEventListener('change', fill);
  }
  const photo = spec.photo ? photoField({ mediaId: existing?.mediaIds?.[0] || null, label: spec.photo, alt: spec.label }) : null;
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const body = el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    tplSel ? ui.field({ label: 'Plantilla', control: tplSel, hint: 'Son genéricas: no reemplazan el criterio del veterinario.' }) : null,
    ...Object.values(fields), photo?.node, err);
  return ui.openModal({
    title: `${existing ? 'Editar' : 'Agregar'}: ${spec.label.toLowerCase()}`, size: 'sm', body,
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      err.textContent = '';
      Object.values(fields).forEach((f) => f.setError(''));
      if (photo?.busy()) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
      const out = {}; let amount = null;
      for (const [key, label, kind, o] of spec.fields) {
        const c = controls[key]; let v = c.value?.trim?.() ?? c.value;
        if (kind === 'money') { const n = c.amount(); v = Number.isFinite(n) ? n : ''; if (v !== '' && v <= 0) { fields[key].setError('Escribe un monto mayor que cero.'); return false; } amount = v === '' ? null : v; continue; }
        if (o.required && (v === '' || v == null)) { fields[key].setError(`Completa "${label}".`); c.focus(); return false; }
        if (kind === 'date' && v && !util.isValidDay(v)) { fields[key].setError('Fecha no válida.'); return false; }
        if (kind === 'date' && o.past && v > today) { fields[key].setError('Elige una fecha de hoy o de antes.'); return false; }
        if (kind === 'number' && v !== '') { v = Number(v); if (!Number.isFinite(v) || v <= 0) { fields[key].setError('Escribe un número mayor que cero.'); return false; } }
        out[key] = v;
      }
      if (spec.fields.some(([k, , , o]) => k === 'cost' && o.required) && amount == null) { fields.cost.setError('Escribe el monto.'); return false; }
      if (out.next && out.date && out.next < out.date) { fields.next.setError('La próxima dosis va después de la aplicada.'); return false; }
      if (out.end && out.date && out.end < out.date) { fields.end.setError('El final va después del inicio.'); return false; }
      if (type === 'moment' && !out.title && !out.milestone && !out.note && !photo) { err.textContent = 'Agrega una foto, un título o unas líneas.'; return false; }
      const id = existing?.id || util.uuid();
      const { date, ...rest } = out;
      try {
        const mediaId = photo ? await photo.commit('petRecords', id) : null;
        const rec = { ...(existing || {}), id, petId: pet.id, type, date, data: { ...(existing?.data || {}), ...rest }, amountCOP: amount, mediaIds: mediaId ? [mediaId] : [], by: existing?.by || profile.active(), visibility: 'shared', owner: 'both' };
        await db.put('petRecords', rec);
        await dropOldMedia(existing?.mediaIds || [], rec.mediaIds);
        photo?.revoke(); util.haptic(10); onSaved(rec); return true;
      } catch (x) { console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar. Inténtalo otra vez.'; return false; }
    } }],
  });
}

// ---------- profile editor ----------
// v0.30.0 (Rowler): a date can be exact, without the year, only the year (to know the age) or empty,
// and a saved date can be removed. Stored as { y, m, d } with nulls for what is not known.
function partialField(label, value) {
  const has = (v) => v != null && v !== '';
  const initial = has(value?.m) && has(value?.d) ? (value.y ? 'full' : 'noyear') : has(value?.y) ? 'year' : 'none';
  let mode = initial;
  const date = ui.input({ type: 'date', max: util.localDay() });
  if (has(value?.m) && has(value?.d)) date.value = `${value.y || 2000}-${String(value.m).padStart(2, '0')}-${String(value.d).padStart(2, '0')}`;
  const thisYear = new Date().getFullYear();
  const year = ui.input({ type: 'number', inputmode: 'numeric', min: String(thisYear - 40), max: String(thisYear), placeholder: String(thisYear - 1), value: value?.y ? String(value.y) : '' });
  const dateBox = el('div', { class: 'pdate-row' }, date);
  const yearBox = el('div', { class: 'pdate-row' }, year, el('span', { class: 'muted small' }, 'La edad se calcula aproximada.'));
  const err = el('p', { class: 'field-error', role: 'alert' });
  const paint = () => { dateBox.hidden = !(mode === 'full' || mode === 'noyear'); yearBox.hidden = mode !== 'year'; clear.hidden = mode === 'none'; };
  const seg = ui.segmented({ label: `${label}: qué sabes`, value: mode, options: [{ value: 'full', label: 'Fecha' }, { value: 'noyear', label: 'Sin año' }, { value: 'year', label: 'Solo año' }, { value: 'none', label: 'No sé' }],
    onChange: (v) => { mode = v; err.textContent = ''; paint(); } });
  seg.classList.add('pdate-modes');
  const clear = el('button', { class: 'btn btn-ghost btn-small pdate-clear', type: 'button', onClick: () => {
    date.value = ''; year.value = ''; mode = 'none'; seg.querySelector('input[value="none"]')?.click(); paint(); util.haptic?.(8);
  } }, icon('x', { size: 16 }), el('span', {}, 'Quitar fecha'));
  const f = el('fieldset', { class: 'field pdate' }, el('legend', { class: 'field-label' }, label), seg, dateBox, yearBox, el('div', { class: 'pdate-foot' }, clear), err);
  paint();
  f.value = () => {
    if (mode === 'none') return null;
    if (mode === 'year') { const y = Number(year.value); return y >= thisYear - 60 && y <= thisYear ? { y, m: null, d: null } : null; }
    if (!date.value) return null;
    const [y, m, d] = date.value.split('-').map(Number);
    return { y: mode === 'noyear' ? null : y, m, d };
  };
  f.check = () => {
    err.textContent = '';
    if (mode === 'year') { const y = Number(year.value); if (!(y >= thisYear - 60 && y <= thisYear)) { err.textContent = `Escribe un año entre ${thisYear - 60} y ${thisYear}.`; year.focus(); return false; } }
    if ((mode === 'full' || mode === 'noyear') && !date.value) { err.textContent = 'Elige la fecha o marca "No sé".'; date.focus(); return false; }
    return true;
  };
  return f;
}

function petEditor(existing, { onSaved, onDeleted }) {
  const p = existing || {};
  const name = ui.input({ value: p.name || '', maxlength: 40 });
  let species = p.species || 'gato';
  const breed = ui.input({ value: p.breed || '', maxlength: 60 });
  const sex = el('select', { class: 'input' }, [['', 'Sin decir'], ['hembra', 'Hembra'], ['macho', 'Macho']].map(([v, l]) => el('option', { value: v, selected: (p.sex || '') === v }, l)));
  const birth = partialField('Nacimiento', p.birth);
  const arrival = partialField('Llegó a casa', p.arrival);
  const color = ui.input({ value: p.color || '', maxlength: 80, placeholder: 'Color y señas' });
  const chip = ui.input({ value: p.microchip || '', maxlength: 30, inputmode: 'numeric' });
  const traits = tagsInput({ value: p.traits, placeholder: 'Curiosa, dormilona, conversadora' });
  const favorites = ui.input({ value: p.favorites || '', maxlength: 160, placeholder: 'Juguetes, comida, lugares' });
  const notes = ui.textarea({ rows: 3, maxlength: 1000 }); notes.value = p.notes || '';
  let coat = coatId(p);
  const collar = el('select', { class: 'input' }, el('option', { value: '' }, 'Automático'), COLLARS.map((c) => el('option', { value: c.id }, c.label)));
  collar.value = COLLARS.some((c) => c.id === p.collar) ? p.collar : '';
  const preview = el('span', { class: 'coat-preview', 'aria-hidden': 'true' });
  const paintPreview = () => preview.replaceChildren(kittyArt({ species, coat, collar: collar.value || undefined, breed: breed.value, color: color.value }));
  const coatGroup = el('div', { class: 'coat-picker', role: 'radiogroup', 'aria-label': 'Pelaje del dibujo' },
    COATS.map((c) => el('button', { class: 'coat-pick', type: 'button', role: 'radio', 'aria-checked': String(c.id === coat), 'data-coat': c.id, onClick: (e) => {
      coat = c.id; coatGroup.querySelectorAll('.coat-pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.coat === coat))); paintPreview();
      e.currentTarget.focus();
    } }, coatSwatch(c.id), el('span', {}, c.label))));
  collar.addEventListener('change', paintPreview);
  const look = el('fieldset', { class: 'coat-box' }, el('legend', {}, 'Su dibujo en la app'),
    el('div', { class: 'coat-top' }, preview, el('p', { class: 'muted small' }, 'Así aparece en Inicio y de paseo por la app. Elige el pelaje que más se le parezca.')),
    coatGroup, ui.field({ label: 'Collar con cascabel', control: collar }));
  const memorial = el('input', { type: 'checkbox', checked: !!p.memorial });
  const memorialDate = ui.input({ type: 'date', value: p.memorial?.date || '', max: util.localDay() });
  const memBox = el('div', { class: 'stack', hidden: !p.memorial }, ui.field({ label: 'Fecha (opcional)', control: memorialDate }));
  memorial.addEventListener('change', () => { memBox.hidden = !memorial.checked; });
  const photo = photoField({ mediaId: p.mediaId || null, label: 'Foto', alt: `Foto de ${p.name || 'la mascota'}` });
  const fName = ui.field({ label: 'Nombre', control: name });
  const err = el('p', { class: 'field-error form-error', role: 'alert' });
  const body = el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() },
    photo.node, fName,
    ui.segmented({ label: 'Especie', value: species, options: SPECIES, onChange: (v) => { species = v; paintPreview(); } }),
    ui.field({ label: 'Raza', control: breed }), ui.field({ label: 'Sexo', control: sex }),
    birth, arrival, ui.field({ label: 'Color y señas', control: color }), ui.field({ label: 'Microchip (opcional)', control: chip }),
    look, ui.field({ label: 'Personalidad', control: traits, hint: 'Con esto sabe qué decir cuando lo tocan.' }), ui.field({ label: 'Cosas favoritas', control: favorites }), ui.field({ label: 'Notas', control: notes }),
    existing ? el('details', { class: 'pet-memorial-box' }, el('summary', {}, 'En memoria'),
      el('p', { class: 'muted small' }, 'Para una mascota que ya no está. Se conserva con todo lo que guardaron, sin recordatorios ni conteos.'),
      el('label', { class: 'check-inline' }, memorial, el('span', {}, 'Está en nuestra memoria')), memBox) : null,
    existing ? ui.button({ label: 'Borrar esta mascota', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => {
      if (!(await ui.confirmDialog({ title: `¿Borrar a ${p.name}?`, message: 'Se borran su perfil y todos sus registros en los dos teléfonos. Si ya no está, mejor márquenla "En memoria".', confirmLabel: 'Borrar', danger: true }))) return;
      const recs = (await db.query('petRecords', { includeHidden: true })).filter((r) => r.petId === p.id);
      for (const r of recs) { await dropOldMedia(r.mediaIds || [], []); await db.purge('petRecords', r.id); }
      if (p.mediaId) await db.rawDelete('media', p.mediaId).catch(() => {});
      await db.purge('pets', p.id); modal.close(); onDeleted?.();
    } }) : null,
    err);
  paintPreview();
  const modal = ui.openModal({
    title: existing ? `Editar a ${p.name}` : 'Agregar mascota', size: 'md', body,
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (photo.busy()) { err.textContent = 'Espera a que la foto esté lista.'; return false; }
      if (!name.value.trim()) { fName.setError('Escribe su nombre.'); name.focus(); return false; }
      if (!birth.check() || !arrival.check()) return false;
      const id = p.id || util.uuid();
      try {
        const mediaId = await photo.commit('pets', id);
        const rec = { ...p, id, name: name.value.trim(), species, breed: breed.value.trim(), sex: sex.value, birth: birth.value(), arrival: arrival.value(), color: color.value.trim(), microchip: chip.value.trim(), mediaId, traits: traits.tags(), favorites: favorites.value.trim(), notes: notes.value.trim(), memorial: memorial.checked ? { date: memorialDate.value || '' } : null, coat, collar: collar.value, visibility: 'shared', owner: 'both' };
        await db.put('pets', rec);
        await dropOldMedia([p.mediaId], [mediaId]);
        photo.revoke(); onSaved(rec); return true;
      } catch (x) { console.error(x); err.textContent = isQuotaError(x) ? 'El teléfono no tiene espacio para la foto.' : 'No se pudo guardar.'; return false; }
    } }],
  });
  return modal;
}

function contactEditor(existing, { onSaved }) {
  const c = existing || {};
  const name = ui.input({ value: c.name || '', maxlength: 80 });
  let kind = c.kind || 'vet';
  const phone = ui.input({ type: 'tel', value: c.phone || '', maxlength: 30, inputmode: 'tel' });
  const address = ui.input({ value: c.address || '', maxlength: 120 });
  const note = ui.input({ value: c.note || '', maxlength: 120 });
  const f = ui.field({ label: 'Nombre', control: name });
  return ui.openModal({
    title: existing ? 'Editar contacto' : 'Nuevo contacto', size: 'sm',
    body: el('form', { class: 'stack', onSubmit: (e) => e.preventDefault() }, f,
      ui.segmented({ label: 'Tipo', value: kind, onChange: (v) => { kind = v; }, options: [{ value: 'vet', label: 'Veterinario' }, { value: 'emergency', label: 'Urgencias' }, { value: 'store', label: 'Tienda' }] }),
      ui.field({ label: 'Teléfono', control: phone }), ui.field({ label: 'Dirección', control: address }), ui.field({ label: 'Nota', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      if (!name.value.trim()) { f.setError('Escribe el nombre.'); return false; }
      const rec = { ...c, id: c.id || util.uuid(), name: name.value.trim(), kind, phone: phone.value.trim(), address: address.value.trim(), note: note.value.trim(), visibility: 'shared', owner: 'both' };
      await db.put('petContacts', rec); onSaved(); return true;
    } }],
  });
}

/** Ensure the "Fondo veterinario de {nombre}" goal exists in the Alcancía; returns it. */
export async function ensureVetFund(pet) {
  const goals = (await db.query('savingsGoals')).filter((g) => !g.deleted);
  const found = goals.find((g) => g.petId === pet.id && g.status !== 'archived');
  if (found) return found;
  const goal = { id: util.uuid(), name: `Fondo veterinario de ${pet.name}`, targetCOP: 500000, targetDate: '', icon: 'paw-print', note: '', status: 'active', doneAt: '', petId: pet.id, visibility: 'shared', owner: 'both' };
  await db.put('savingsGoals', goal);
  return goal;
}

// ---------- page ----------
export async function render() {
  const page = el('section', { class: 'page page-wide mascotas' });
  const urls = new Set();
  let selected = null; try { selected = sessionStorage.getItem(KEY); } catch { /* private mode */ }
  let tab = 'perfil';
  try { const t = sessionStorage.getItem('aishiteru.pet.tab'); if (t) { tab = t; sessionStorage.removeItem('aishiteru.pet.tab'); } } catch { /* private mode */ }
  const add = () => petEditor(null, { onSaved: (rec) => { selected = rec.id; remember(); ui.toast(`${rec.name} ya es parte de la familia.`, { tone: 'success' }); load(); } });
  const remember = () => { try { sessionStorage.setItem(KEY, selected || ''); } catch { /* ignore */ } };
  page.append(ui.pageHeader({ title: 'Mascotas', jp: 'ペット', romaji: 'petto', back: '/mas', actions: [ui.newButton('Mascota', add)] }));
  const body = el('div', { class: 'stack' }, ui.skeleton(4));
  page.append(body);

  const load = async () => {
    for (const u of urls) URL.revokeObjectURL(u); urls.clear();
    const [pets, records, contacts, homePrefs] = await Promise.all([db.query('pets'), db.query('petRecords'), db.query('petContacts'), db.getSettings('home', { petHidden: false })]);
    const list = pets.filter((p) => !p.deleted).sort((a, b) => (!!a.memorial - !!b.memorial) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (!list.length) { body.replaceChildren(ui.emptyState({ title: 'Su primera mascota', text: 'Perfil, salud, peso y fotos de cada hijo peludo.', art: 'omamori', action: { label: 'Agregar mascota', onClick: add } })); return; }
    const pet = list.find((p) => p.id === selected) || list[0];
    selected = pet.id;
    const recs = records.filter((r) => !r.deleted && r.petId === pet.id);
    const byType = (t) => recs.filter((r) => r.type === t).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const reload = () => load();
    const addBtn = (type) => ui.button({ label: `Agregar ${T[type].label.toLowerCase()}`, iconName: 'plus', small: true, onClick: () => recordEditor(pet, type, null, { onSaved: reload }) });
    const recActions = (r) => el('div', { class: 'list-item-actions' },
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${T[r.type].label.toLowerCase()} del ${util.formatDay(r.date)}`, onClick: () => recordEditor(pet, r.type, r, { onSaved: reload }) }, icon('pencil', { size: 16 })),
      el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${T[r.type].label.toLowerCase()} del ${util.formatDay(r.date)}`, onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Borrar este registro?', message: 'Se borra en los dos teléfonos.', confirmLabel: 'Borrar', danger: true }))) return;
        await dropOldMedia(r.mediaIds || [], []); await db.purge('petRecords', r.id); reload();
      } }, icon('trash-2', { size: 16 })));
    const photoBtn = (r, alt) => (r.mediaIds?.[0] ? el('button', { class: 'pet-thumb', type: 'button', 'aria-label': `Ver ${alt}`, onClick: () => openViewer([{ mediaId: r.mediaIds[0], alt, caption: alt, sub: util.formatDay(r.date) }]) }, mediaImg(r.mediaIds[0], { alt: '', urls })) : null);
    const section = (title, children, action) => el('section', { class: 'card paper-card pet-block' }, el('header', { class: 'pet-block-head' }, el('h2', {}, title), action || null), ...children);
    const empty = (text) => el('p', { class: 'muted' }, text);

    // ---- selector ----
    const selector = list.length < 2 ? null : el('div', { class: 'pet-selector', role: 'group', 'aria-label': 'Elegir mascota' },
      list.map((p) => el('button', { class: `pet-pick${p.id === pet.id ? ' is-on' : ''}${p.memorial ? ' is-memorial' : ''}`, type: 'button', 'aria-pressed': String(p.id === pet.id), onClick: () => { selected = p.id; remember(); tab = 'perfil'; load(); } },
        el('span', { class: 'pet-pick-photo' }, p.mediaId ? mediaImg(p.mediaId, { alt: '', urls }) : kittyArt(p, { index: list.indexOf(p) })),
        el('span', {}, p.name))));

    // ---- hero ----
    const age = ageText(pet.birth); const home = daysHome(pet.arrival);
    const next = pet.memorial ? null : time.nextOccurrence(pet.birth, {}) ;
    const nextArr = pet.memorial ? null : time.nextOccurrence(pet.arrival, {});
    const upcoming = [next && { label: 'cumpleaños', ...next }, nextArr && { label: 'día que llegó a casa', ...nextArr }].filter(Boolean).sort((a, b) => a.days - b.days)[0];
    const hero = el('article', { class: `card paper-card pet-hero${pet.memorial ? ' is-memorial' : ''}` },
      el('div', { class: 'pet-hero-photo' }, pet.mediaId ? el('button', { type: 'button', class: 'pet-hero-btn', 'aria-label': `Ver la foto de ${pet.name}`, onClick: () => openViewer([{ mediaId: pet.mediaId, alt: pet.name, caption: pet.name }]) }, mediaImg(pet.mediaId, { alt: '', urls })) : el('span', { class: 'pet-hero-kitty', role: 'img', 'aria-label': `Dibujo de ${pet.name}` }, kittyArt(pet, { index: list.indexOf(pet) }))),
      el('div', { class: 'pet-hero-text' },
        el('h2', { class: 'pet-name' }, pet.name),
        el('p', { class: 'muted' }, [SPECIES.find((s) => s.value === pet.species)?.label, pet.breed, pet.sex === 'hembra' ? 'hembra' : pet.sex === 'macho' ? 'macho' : ''].filter(Boolean).join(' · ')),
        pet.memorial
          ? el('p', { class: 'pet-memorial-line' }, icon('jp-sakura', { size: 18 }), ` En nuestra memoria${pet.memorial.date ? ` desde el ${fmtDay.format(util.parseDay(pet.memorial.date))}` : ''}.`)
          : el('dl', { class: 'pet-stats' },
            el('div', {}, el('dt', {}, 'Edad'), el('dd', {}, age || (pet.birth?.m ? 'Completa el año' : 'Sin fecha'))),
            el('div', {}, el('dt', {}, 'Días en casa'), el('dd', {}, home != null ? new Intl.NumberFormat('es-CO').format(home) : (pet.arrival?.m ? 'Completa el año' : 'Sin fecha')))),
        upcoming ? el('p', { class: 'pet-next' }, icon('cake', { size: 16 }), upcoming.days === 0 ? ` ¡Hoy es su ${upcoming.label}!` : ` Su ${upcoming.label}: en ${upcoming.days} ${upcoming.days === 1 ? 'día' : 'días'} (${fmtDM.format(upcoming.date)})`) : null),
      el('div', { class: 'pet-hero-actions' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar a ${pet.name}`, onClick: () => petEditor(pet, { onSaved: reload, onDeleted: () => { selected = null; remember(); reload(); } }) }, icon('pencil', { size: 20 }))),
      el('span', { class: 'pet-neko', 'aria-hidden': 'true' }, maneki()));

    // ---- tabs ----
    const TABS = [['perfil', 'Perfil'], ['salud', 'Salud'], ['peso', 'Peso'], ['vet', 'Veterinario'], ['cuidados', 'Cuidados'], ['gastos', 'Gastos'], ['momentos', 'Momentos'], ['album', 'Álbum']];
    const tabRow = el('div', { class: 'chip-row', role: 'tablist', 'aria-label': `Secciones de ${pet.name}` },
      TABS.map(([id, label]) => el('button', { class: 'chip', type: 'button', role: 'tab', 'aria-selected': String(tab === id), onClick: () => { tab = id; load(); } }, label)));

    const views = {
      perfil: () => {
        const row = (k, v) => (v ? el('div', {}, el('dt', {}, k), el('dd', {}, v)) : null);
        const has = pet.color || pet.microchip || pet.traits?.length || pet.favorites || pet.notes;
        return [section('Perfil', [has ? el('dl', { class: 'pet-profile' },
          row('Nacimiento', pet.birth?.m ? (pet.birth.y ? fmtDay.format(fullDate(pet.birth)) : `${fmtDM.format(new Date(2000, pet.birth.m - 1, pet.birth.d))} (sin año)`) : pet.birth?.y ? `En ${pet.birth.y} (sin día)` : ''),
          row('Llegó a casa', pet.arrival?.m ? (pet.arrival.y ? fmtDay.format(fullDate(pet.arrival)) : `${fmtDM.format(new Date(2000, pet.arrival.m - 1, pet.arrival.d))} (sin año)`) : pet.arrival?.y ? `En ${pet.arrival.y} (sin día)` : ''),
          row('Color y señas', pet.color), row('Microchip', pet.microchip),
          pet.traits?.length ? el('div', {}, el('dt', {}, 'Personalidad'), el('dd', { class: 'tag-row' }, pet.traits.map((t) => el('span', { class: 'tag' }, t)))) : null,
          row('Favoritos', pet.favorites), row('Notas', pet.notes)) : empty('Completen su perfil: personalidad, cosas favoritas y señas.')],
        ui.button({ label: 'Editar perfil', iconName: 'pencil', small: true, variant: 'ghost', onClick: () => petEditor(pet, { onSaved: reload, onDeleted: reload }) })),
        ui.toggle({ label: 'Que se paseen por la app', checked: !homePrefs.petHidden, hint: 'Se asoman sobre las tarjetas o duermen al final de las pantallas. Tócalos para que hablen y darles mimos.', onChange: (v) => db.setSettings('home', { petHidden: !v }) })];
      },
      salud: () => {
        const health = [...byType('vaccine'), ...byType('deworm')];
        const latest = latestByProduct(health).sort((a, b) => (a.data.next || '9999').localeCompare(b.data.next || '9999'));
        const exportIcs = () => {
          const evs = latest.filter((r) => r.data.next && r.data.next >= util.localDay()).map((r) => ({ uid: `pet-${r.id}`, title: `${pet.name}: ${r.data.product}`, start: util.parseDay(r.data.next), allDay: true, alarms: [ics.dayAlarm(1), ics.dayAlarm(0)] }));
          if (!evs.length) { ui.toast('No hay próximas dosis con fecha.'); return; }
          ics.download(`salud-${ics.fileName(pet.name)}.ics`, ics.calendar(evs)); ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
        };
        return [
          el('p', { class: 'card note-card small kit-note' }, icon('info', { size: 16 }), ' Las plantillas son genéricas. Consulten siempre al veterinario para las fechas reales.'),
          section('Estado', [latest.length ? el('ul', { class: 'pet-list' }, latest.map((r) => {
            const st = doseStatus(r.data.next);
            return el('li', { class: 'pet-row' }, icon(T[r.type].icon, { size: 20 }),
              el('div', { class: 'grow' }, el('strong', {}, r.data.product), el('p', { class: 'muted small' }, r.data.next ? `Próxima: ${util.formatDay(r.data.next)}` : `Aplicada: ${util.formatDay(r.date)}`)),
              el('span', { class: `badge ${STATUS[st].cls}` }, STATUS[st].label));
          })) : empty('Aún no hay vacunas ni desparasitaciones.')],
          latest.some((r) => r.data.next) ? ui.button({ label: 'Al calendario del teléfono', iconName: 'calendar', small: true, variant: 'ghost', onClick: exportIcs }) : null),
          section('Historial', [health.length ? el('ul', { class: 'pet-list' }, health.sort((a, b) => b.date.localeCompare(a.date)).map((r) => el('li', { class: 'pet-row' },
            photoBtn(r, `${r.data.product}`) || icon(T[r.type].icon, { size: 20 }),
            el('div', { class: 'grow' }, el('strong', {}, `${r.data.product}`), el('p', { class: 'muted small' }, [T[r.type].label, util.formatDay(r.date), r.data.vet].filter(Boolean).join(' · ')), r.data.note ? el('p', { class: 'small' }, r.data.note) : null),
            recActions(r)))) : empty('Lo que registren queda aquí.'),
          el('div', { class: 'btn-row' }, addBtn('vaccine'), addBtn('deworm'))]),
          ui.button({ label: 'Cartilla para el veterinario (PDF)', iconName: 'printer', small: true, variant: 'secondary', onClick: () => printCartilla(pet, recs) }),
        ];
      },
      // v0.29.0 (idea 44): every photo of the pet, by year, with the weight they had that year.
      album: () => {
        const photos = [];
        if (pet.mediaId) photos.push({ mediaId: pet.mediaId, date: pet.createdAt || util.localDay(), title: pet.name });
        for (const r of recs) for (const mid of r.mediaIds || []) if (r.type === 'moment' || r.type === 'vet') photos.push({ mediaId: mid, date: r.date, title: r.data?.title || T[r.type].label });
        if (!photos.length) return [section('Álbum', [empty(`Las fotos de los momentos de ${pet.name} aparecen aquí, por año.`)])];
        const years = new Map();
        for (const ph of photos.sort((a, b) => String(b.date).localeCompare(String(a.date)))) { const y = String(ph.date).slice(0, 4); years.set(y, [...(years.get(y) || []), ph]); }
        const weightIn = (y) => byType('weight').find((r) => String(r.date).startsWith(y));
        const items = photos.map((ph) => ({ mediaId: ph.mediaId, alt: ph.title, caption: ph.title, sub: util.formatDay(String(ph.date).slice(0, 10)) }));
        return [...years].map(([y, list]) => section(y, [
          weightIn(y) ? el('p', { class: 'muted small' }, icon('scale', { size: 14 }), ` Pesaba ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(weightIn(y).data.kg)} kg`) : null,
          el('div', { class: 'pet-album' }, list.map((ph) => el('button', { class: 'pet-album-item', type: 'button', 'aria-label': `Ver ${ph.title}`, onClick: () => openViewer(items, photos.indexOf(ph)) }, mediaImg(ph.mediaId, { alt: '', urls }))))].filter(Boolean)));
      },
      peso: () => {
        const ws = byType('weight').slice().reverse();
        const fmtKg = (v) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(v)} kg`;
        const last = ws[ws.length - 1]; const prev = ws[ws.length - 2];
        const diff = last && prev ? last.data.kg - prev.data.kg : null;
        return [section('Peso', [
          ws.length ? el('p', { class: 'pet-weight-now' }, el('strong', {}, fmtKg(last.data.kg)), diff != null ? el('span', { class: 'muted' }, ` · ${diff === 0 ? 'igual que antes' : `${diff > 0 ? '+' : '−'}${fmtKg(Math.abs(diff))} desde el ${util.formatDay(prev.date)}`}`) : null) : empty('Registren su peso para ver la curva de crecimiento.'),
          ws.length > 1 ? lineChart({ points: ws.map((r) => ({ day: r.date, value: r.data.kg })), title: `Curva de peso de ${pet.name}`, format: (v) => `${Number(v).toFixed(1)}` }) : null,
          ws.length ? el('ul', { class: 'pet-list' }, ws.slice().reverse().map((r, i, arr) => {
            const before = arr[i + 1]; const d = before ? r.data.kg - before.data.kg : null;
            return el('li', { class: 'pet-row' }, el('div', { class: 'grow' }, el('strong', {}, fmtKg(r.data.kg)), el('p', { class: 'muted small' }, [util.formatDay(r.date), d != null && d !== 0 ? `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))}` : '', r.data.note].filter(Boolean).join(' · '))), recActions(r));
          })) : null,
        ], addBtn('weight'))];
      },
      vet: () => {
        const visits = byType('vet');
        const cs = contacts.filter((c) => !c.deleted);
        const KIND = { vet: 'Veterinario', emergency: 'Urgencias', store: 'Tienda' };
        return [
          section('Visitas', [visits.length ? el('ul', { class: 'pet-list' }, visits.map((r) => el('li', { class: 'pet-row' },
            photoBtn(r, r.data.reason) || icon('stethoscope', { size: 20 }),
            el('div', { class: 'grow' }, el('strong', {}, r.data.reason), el('p', { class: 'muted small' }, [util.formatDay(r.date), r.data.clinic, r.amountCOP ? util.formatCOP(r.amountCOP) : ''].filter(Boolean).join(' · ')),
              r.data.diagnosis ? el('p', { class: 'small' }, el('strong', {}, 'Diagnóstico: '), r.data.diagnosis) : null,
              r.data.treatment ? el('p', { class: 'small' }, el('strong', {}, 'Tratamiento: '), r.data.treatment) : null),
            recActions(r)))) : empty('Sin visitas registradas.')], addBtn('vet')),
          section('Contactos', [cs.length ? el('ul', { class: 'pet-list' }, cs.map((c) => el('li', { class: 'pet-row' },
            icon(c.kind === 'store' ? 'store' : c.kind === 'emergency' ? 'siren' : 'stethoscope', { size: 20 }),
            el('div', { class: 'grow' }, el('strong', {}, c.name), el('p', { class: 'muted small' }, [KIND[c.kind], c.address, c.note].filter(Boolean).join(' · '))),
            c.phone ? el('a', { class: 'icon-btn icon-btn-small', href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, 'aria-label': `Llamar a ${c.name}` }, icon('phone', { size: 16 })) : null,
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Editar ${c.name}`, onClick: () => contactEditor(c, { onSaved: reload }) }, icon('pencil', { size: 16 })),
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar ${c.name}`, onClick: async () => {
              if (!(await ui.confirmDialog({ title: '¿Borrar este contacto?', message: c.name, confirmLabel: 'Borrar', danger: true }))) return;
              await db.purge('petContacts', c.id); reload();
            } }, icon('trash-2', { size: 16 }))))) : empty('Veterinario, clínica de urgencias y tienda: a un toque.')],
          ui.button({ label: 'Agregar contacto', iconName: 'plus', small: true, onClick: () => contactEditor(null, { onSaved: reload }) })),
        ];
      },
      cuidados: () => {
        const meds = byType('medication'); const supplies = byType('supply');
        const today = util.localDay();
        const activeMed = (r) => r.date <= today && (!r.data.end || r.data.end >= today);
        const refill = (r) => (r.data.lastsDays ? addDays(r.date, r.data.lastsDays) : '');
        const latestSupplies = latestByProduct(supplies.map((r) => ({ ...r, data: { ...r.data, product: r.data.item } })));
        const exportRefill = () => {
          const evs = latestSupplies.filter((r) => refill(r) >= today).map((r) => ({ uid: `refill-${r.id}`, title: `Reponer ${r.data.item} de ${pet.name}`, start: util.parseDay(refill(r)), allDay: true, alarms: [ics.dayAlarm(2)] }));
          if (!evs.length) { ui.toast('No hay reposiciones por venir.'); return; }
          ics.download(`reponer-${ics.fileName(pet.name)}.ics`, ics.calendar(evs)); ui.toast('Archivo listo. Ábrelo y elige tu calendario.', { tone: 'success' });
        };
        return [
          section('Medicinas y cuidados', [meds.length ? el('ul', { class: 'pet-list' }, meds.map((r) => {
            const on = activeMed(r); const checked = !!r.data.checks?.[today];
            return el('li', { class: `pet-row${on ? '' : ' is-past'}` },
              on ? el('label', { class: 'list-check pet-dose' }, el('input', { type: 'checkbox', checked, 'aria-label': `${r.data.name}: dado hoy`, onChange: async (e) => {
                const checks = { ...(r.data.checks || {}) }; if (e.target.checked) checks[today] = profile.active(); else delete checks[today];
                await db.put('petRecords', { ...r, data: { ...r.data, checks } }); util.haptic(8);
              } })) : icon('pill', { size: 20 }),
              el('div', { class: 'grow' }, el('strong', {}, r.data.name), el('p', { class: 'muted small' }, [r.data.dose, r.data.frequency, `${util.formatDay(r.date)}${r.data.end ? ` a ${util.formatDay(r.data.end)}` : ''}`, on ? (checked ? 'Hoy: hecho' : 'Hoy: pendiente') : 'Terminado'].filter(Boolean).join(' · '))),
              recActions(r));
          })) : empty('Tratamientos con dosis, frecuencia y una casilla por día.')], addBtn('medication')),
          section('Comida y arena', [latestSupplies.length ? el('ul', { class: 'pet-list' }, latestSupplies.map((r) => {
            const when = refill(r); const late = when && when < today;
            return el('li', { class: 'pet-row' }, icon('package', { size: 20 }),
              el('div', { class: 'grow' }, el('strong', {}, r.data.item), el('p', { class: `small ${late ? 'text-danger' : 'muted'}` }, [`Comprado el ${util.formatDay(r.date)}`, when ? `${late ? 'Había que reponer' : 'Reponer'} el ${util.formatDay(when)}` : '', r.amountCOP ? util.formatCOP(r.amountCOP) : ''].filter(Boolean).join(' · '))),
              recActions(r));
          })) : empty('Registren cada compra y calculamos cuándo reponer.'),
          latestSupplies.some((r) => refill(r) >= today) ? ui.button({ label: 'Al calendario del teléfono', iconName: 'calendar', small: true, variant: 'ghost', onClick: exportRefill }) : null], addBtn('supply')),
        ];
      },
      gastos: () => {
        // Every pet record with an amount counts: expenses, vet visits and supplies.
        const money = recs.filter((r) => Number(r.amountCOP) > 0).sort((a, b) => b.date.localeCompare(a.date));
        const months = lastMonths(6);
        const totals = monthlyTotals(money, months);
        const catOf = (r) => (r.type === 'vet' ? 'veterinario' : r.type === 'supply' ? (/arena/i.test(r.data.item) ? 'arena' : 'comida') : r.data.category || 'otros');
        const thisMonth = money.filter((r) => monthOf(r.date) === months[5]);
        const byCat = EXPENSE_CATS.map((c) => ({ ...c, total: thisMonth.filter((r) => catOf(r) === c.value).reduce((s, r) => s + r.amountCOP, 0) })).filter((c) => c.total);
        const fund = async () => {
          const g = await ensureVetFund(pet);
          ui.toast(`"${g.name}" está en la Alcancía.`, { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/alcancia'; } } });
        };
        return [
          section('Este mes', [el('p', { class: 'pet-weight-now' }, el('strong', {}, util.formatCOP(totals[5]))),
            byCat.length ? el('ul', { class: 'tag-row' }, byCat.map((c) => el('li', { class: 'tag' }, `${c.label}: ${util.formatCOP(c.total)}`))) : null,
            money.length ? barChart({ labels: months.map(monthLabel), values: totals, title: `Gastos de ${pet.name} en los últimos 6 meses`, format: util.formatCOP }) : null],
          ui.button({ label: 'Fondo veterinario', iconName: 'piggy-bank', small: true, variant: 'ghost', onClick: fund })),
          section('Registros', [money.length ? el('ul', { class: 'pet-list' }, money.map((r) => el('li', { class: 'pet-row' }, icon(T[r.type].icon, { size: 20 }),
            el('div', { class: 'grow' }, el('strong', {}, util.formatCOP(r.amountCOP)), el('p', { class: 'muted small' }, [EXPENSE_CATS.find((c) => c.value === catOf(r))?.label, util.formatDay(r.date), r.data.note || r.data.reason || r.data.item].filter(Boolean).join(' · '))),
            recActions(r)))) : empty('Comida, arena, veterinario y juguetes. Las visitas y compras con costo también suman aquí.')], addBtn('expense')),
        ];
      },
      momentos: () => {
        const ms = byType('moment');
        const milestones = CONFIG.petMilestones || [];
        const toCapsule = async (r) => {
          const title = r.data.title || milestones.find((m) => m.id === r.data.milestone)?.title || `Un momento con ${pet.name}`;
          const mem = { id: util.uuid(), date: r.date, title, note: r.data.note || '', mediaIds: [], visibility: 'shared', owner: 'both', by: profile.active(), fromPet: r.id };
          for (const mid of r.mediaIds || []) { const b = await db.getMedia(mid).catch(() => null); if (b) mem.mediaIds.push(await db.putMedia(b, { ownerStore: 'memories', ownerId: mem.id })); }
          await db.put('memories', mem);
          ui.toast('Está en la Cápsula.', { tone: 'success', action: { label: 'Ver', onClick: () => { location.hash = '#/capsula'; } } });
        };
        return [section(`La historia de ${pet.name}`, [ms.length ? el('ol', { class: 'pet-timeline' }, ms.map((r) => {
          const ml = milestones.find((m) => m.id === r.data.milestone);
          return el('li', { class: 'pet-moment' },
            r.mediaIds?.[0] ? el('button', { class: 'pet-moment-photo purikura-frame', type: 'button', 'aria-label': `Ver la foto: ${r.data.title || ml?.title || 'momento'}`, onClick: () => openViewer([{ mediaId: r.mediaIds[0], alt: r.data.title || pet.name, caption: r.data.title || ml?.title || pet.name, sub: util.formatDay(r.date) }]) }, mediaImg(r.mediaIds[0], { alt: '', urls })) : null,
            el('div', { class: 'grow' },
              el('p', { class: 'muted small' }, util.formatDay(r.date)),
              ml ? el('span', { class: 'tag' }, ml.title) : null,
              r.data.mischief ? el('span', { class: 'tag' }, 'Travesura') : null,
              r.data.title ? el('strong', { class: 'pet-moment-title' }, r.data.title) : null,
              r.data.note ? el('p', { class: 'small' }, r.data.note) : null,
              el('div', { class: 'list-item-actions' },
                r.mediaIds?.length && !r.fromCapsule ? el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Enviar a la Cápsula', title: 'Enviar a la Cápsula', onClick: () => toCapsule(r) }, icon('hourglass', { size: 16 })) : null,
                ...recActions(r).children)));
        })) : empty('Fotos con fecha, hitos, notas y travesuras: su línea de tiempo.')],
        el('div', { class: 'btn-row' }, addBtn('moment'), ui.button({ label: 'Anotar travesura', iconName: 'camera', small: true, variant: 'ghost', onClick: () => import('./gatitos.js').then((m) => m.mischiefEditor(pet, { onSaved: reload })) })))];
      },
    };

    requestAnimationFrame(() => tabRow.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
    body.replaceChildren(...[selector, hero, tabRow].filter(Boolean), el('div', { class: 'stack', role: 'tabpanel', 'aria-label': TABS.find(([id]) => id === tab)?.[1] }, ...views[tab]().filter(Boolean)));
  };
  try { await load(); } catch (e) { console.error(e); body.replaceChildren(ui.emptyState({ title: 'No pudimos abrir Mascotas', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); }
  const off = db.onChange((s) => { if (['pets', 'petRecords', 'petContacts'].includes(s) && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: () => { off(); for (const u of urls) URL.revokeObjectURL(u); } };
}

/** Original maneki-neko (raised paw), a small decorative line drawing. */
export function maneki({ size = 56 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'maneki'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 58V36c0-9 6-15 14-15s14 6 14 15v22Z"/><path d="M20 24 18 12l8 7M44 24l2-12-8 7"/><path d="M46 34c4-2 6-8 4-14"/><circle cx="50" cy="18" r="3"/><circle cx="27" cy="31" r="1.3"/><circle cx="37" cy="31" r="1.3"/><path d="M30 36c1 1 3 1 4 0"/><path d="M24 44h16"/><circle cx="32" cy="48" r="3.5"/><path d="M22 58h20"/></g>';
  return svg;
}
