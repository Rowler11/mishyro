// Perfil y datos (docs/03): names, dates, special dates, milestones and the short text lists.
// Edits mark records userEdited so a CONFIG update never overwrites them; config texts can be restored.
import { ui, util, db, seed, profile, CONFIG } from '../core.js';

const { el, icon } = util;
const TAB_KEY = `${CONFIG.storageKey}.perfil.tab`;
const LIST_KEY = `${CONFIG.storageKey}.perfil.list`;
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const recall = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const put = (box, ...kids) => box.replaceChildren(...kids.flat().filter(Boolean));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtMD = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

const TABS = [
  { value: 'nosotros', label: 'Nosotros', icon: 'users' },
  { value: 'fechas', label: 'Fechas', icon: 'cake' },
  { value: 'hitos', label: 'Hitos', icon: 'flag' },
  { value: 'textos', label: 'Textos', icon: 'file-text' },
];

export function render() {
  let tab = 'nosotros';
  if (!TABS.some((t) => t.value === tab)) tab = 'nosotros';
  const body = el('div', { class: 'stack perfil-body' });
  const draw = () => {
    put(body, ui.skeleton(4));
    ({ nosotros, fechas, hitos, textos }[tab])(body);
  };
  const tabs = ui.segmented({ label: 'Parte de Perfil y datos', value: tab, options: TABS, onChange: (v) => { tab = v; remember(TAB_KEY, v); draw(); } });
  draw();
  return el('section', { class: 'page perfil-page' },
    ui.pageHeader({ title: 'Perfil y datos', jp: '情報', romaji: 'jōhō', back: '/ajustes' }),
    el('div', { class: 'perfil-tabs' }, tabs), body);
}

// ---------- form helpers ----------
function textField(label, value = '', { hint, max = 60, required = false, type = 'text' } = {}) {
  const control = ui.input({ type, value: value ?? '', maxlength: type === 'text' ? String(max) : undefined, required: required || undefined });
  const f = ui.field({ label: required ? label : `${label} (opcional)`, control, hint });
  control.addEventListener('input', () => f.setError(''));
  return { f, control, get value() { return control.value.trim(); } };
}

const today = () => util.localDay(new Date());

// =====================================================================
// Nosotros: names, nicknames, birthdays, start date
// =====================================================================
async function nosotros(box) {
  const [peopleRec, rel, dates] = await Promise.all([db.get('profile', 'people'), db.get('profile', 'relationship'), db.query('specialDates', { includeHidden: true })]);
  const people = peopleRec || {};
  const forms = {};
  const { photoPicker } = await import('./avatar.js');
  const photoBox = el('div', { class: 'stack' }, el('p', { class: 'field-label' }, 'Tu foto de perfil (opcional)'), photoPicker(profile.active()));
  const personCard = (who) => {
    const p = { ...(CONFIG.people[who] || {}), ...(people[who] || {}) };
    const shortName = textField('Nombre corto', p.shortName, { required: true, max: 24, hint: 'El que se ve en la app.' });
    const nickname = textField('Apodo', p.nickname, { max: 30, hint: 'Se usa en frases como "Buenos días, {apodo}".' });
    const fullName = textField('Nombre completo', p.fullName, { max: 80, hint: 'Solo se guarda en este dispositivo.' });
    const role = el('select', { class: 'input' }, [el('option', { value: '' }, 'Sin elegir'),
      ...profile.ROLES.map((r) => el('option', { value: r.id, selected: p.rel === r.id }, r.label))]);
    const roleF = ui.field({ label: 'Es…', control: role, hint: 'Novia, esposo, mi señora… Ajusta cómo le hablan algunos textos.' });
    const birth = textField('Cumpleaños', p.birth, { type: 'date' });
    birth.control.max = today();
    // Favorite color: the birthday card in Fechas especiales wears it.
    const color = el('select', { class: 'input' }, [['', 'Sin elegir'], ['sakura', 'Sakura (rosa)'], ['fuji', 'Fuji (lila)'], ['matcha', 'Matcha (verde)'], ['kohaku', 'Kohaku (ámbar)']]
      .map(([v, l]) => el('option', { value: v, selected: (p.color || '') === v }, l)));
    const colorF = ui.field({ label: 'Color favorito', control: color, hint: 'Viste su tarjeta de cumpleaños.' });
    forms[who] = { shortName, nickname, fullName, birth, color, role };
    return el('section', { class: 'card stack' },
      el('h2', { class: 'card-title perfil-person' }, el('span', { class: `person-dot dot-${who}`, 'aria-hidden': 'true' }), p.shortName || (who === profile.active() ? 'Tú' : 'Tu pareja'),
        profile.active() === who ? el('span', { class: 'badge' }, 'Tú, en este equipo') : null),
      // Each one changes only their own photo, on their own device (v0.26.0).
      profile.active() === who ? photoBox : null,
      shortName.f, roleF, nickname.f, fullName.f, birth.f, colorF);
  };
  const start = textField('Fecha en que empezamos', rel?.startDate ? String(rel.startDate).slice(0, 10) : '', { type: 'date', hint: 'El contador de Inicio cuenta desde aquí.' });
  start.control.max = today();

  const save = ui.button({ label: 'Guardar cambios', iconName: 'check', variant: 'primary', onClick: async () => {
    let bad = null;
    for (const who of profile.PEOPLE) {
      const f = forms[who];
      if (!f.shortName.value) { f.shortName.f.setError('Escribe un nombre.'); bad = bad || f.shortName.control; }
      if (f.birth.value && (!util.isValidDay(f.birth.value) || f.birth.value > today())) { f.birth.f.setError('Revisa la fecha.'); bad = bad || f.birth.control; }
    }
    if (start.value && (!util.isValidDay(start.value) || start.value > today())) { start.f.setError('La fecha no puede ser futura.'); bad = bad || start.control; }
    if (bad) { bad.focus(); return; }
    const next = { ...people, id: 'people' };
    for (const who of profile.PEOPLE) {
      const f = forms[who];
      next[who] = { ...(people[who] || {}), shortName: f.shortName.value, nickname: f.nickname.value, fullName: f.fullName.value, birth: f.birth.value, color: f.color.value, rel: f.role.value };
    }
    await db.put('profile', next);
    await db.put('profile', { ...(rel || {}), id: 'relationship', startDate: start.value });
    // Birthdays listed as special dates follow the person's birthday.
    for (const d of dates.filter((x) => x.kind === 'birthday' && profile.PEOPLE.includes(x.personOrPetId))) {
      const b = forms[d.personOrPetId].birth.value;
      const md = util.parseDay(b);
      const same = md && d.date?.y === md.getFullYear() && d.date?.m === md.getMonth() + 1 && d.date?.d === md.getDate();
      if (md && !same) await db.put('specialDates', { ...d, date: { y: md.getFullYear(), m: md.getMonth() + 1, d: md.getDate() } });
    }
    await profile.load();
    ui.toast('Guardado. Ya se ve en toda la app.', { tone: 'success' });
    nosotros(box);
  } });

  put(box,
    el('div', { class: 'perfil-people' }, personCard(profile.active()), personCard(profile.partnerOf(profile.active()))),
    el('section', { class: 'card stack' }, el('h2', { class: 'card-title' }, 'Nuestra historia'), start.f),
    el('div', { class: 'btn-row perfil-save' }, save),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Datos iniciales'),
      el('p', { class: 'muted' }, 'Para volver a importar el archivo de datos iniciales. No duplica nada ni pisa lo que ya editaron aquí.'),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Abrir el asistente', iconName: 'wand-sparkles', href: '#/setup' }))));
}

// =====================================================================
// Fechas especiales
// =====================================================================
const KINDS = [
  { value: 'anniversary', label: 'Aniversario' }, { value: 'birthday', label: 'Cumpleaños' },
  { value: 'pet', label: 'Mascota' }, { value: 'other', label: 'Otra' },
];
const REPEAT = [{ value: 'yearly', label: 'Cada año' }, { value: 'monthly', label: 'Cada mes' }, { value: 'none', label: 'Una vez' }];
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || 'Otra';

function dateText(d) {
  const md = d.date;
  if (!md?.m || !md?.d) return 'Sin fecha';
  const base = fmtMD.format(new Date(2000, md.m - 1, md.d));
  return md.y ? `${base} de ${md.y}` : base;
}
const sortDates = (a, b) => ((a.date?.m || 13) * 40 + (a.date?.d || 0)) - ((b.date?.m || 13) * 40 + (b.date?.d || 0));

async function fechas(box) {
  const list = (await db.query('specialDates', { includeHidden: true })).sort(sortDates);
  const rows = list.map((d) => itemRow({
    title: d.name || 'Sin nombre',
    sub: [dateText(d), kindLabel(d.kind), REPEAT.find((r) => r.value === (d.recurring || 'yearly'))?.label].join(' · '),
    rec: d,
    onEdit: () => dateEditor(d, () => fechas(box)),
    onToggleHidden: async () => { await db.put('specialDates', { ...d, hidden: !d.hidden }, { userEdit: false }); fechas(box); },
    onDelete: async () => {
      if (!(await ui.confirmDialog({ title: '¿Borrar esta fecha?', message: `"${d.name}" deja de aparecer en Inicio y en los avisos.`, confirmLabel: 'Borrar', danger: true }))) return;
      await db.purge('specialDates', d.id); ui.toast('Fecha borrada.'); fechas(box);
    },
  }));
  put(box, el('section', { class: 'card stack' },
    listHead('Fechas especiales', list.length, ui.button({ label: 'Agregar', iconName: 'plus', small: true, onClick: () => dateEditor(null, () => fechas(box)) })),
    el('p', { class: 'muted small' }, 'Salen en "Próxima fecha especial" de Inicio. El aniversario y los cumpleaños de "Nosotros" se cuentan solos aunque no estén aquí.'),
    rows.length ? el('ul', { class: 'edit-list' }, rows) : el('p', { class: 'muted' }, 'Todavía no hay fechas. Agreguen la primera.')));
}

function dateEditor(rec, done) {
  const isNew = !rec;
  const r = rec || { kind: 'other', recurring: 'yearly', date: {} };
  const name = textField('Nombre', r.name, { required: true, max: 60 });
  const md = r.date || {};
  const iso = md.m && md.d ? `${md.y || 2000}-${String(md.m).padStart(2, '0')}-${String(md.d).padStart(2, '0')}` : '';
  const date = textField('Fecha', iso, { type: 'date', required: true });
  let noYear = !!(md.m && !md.y);
  let kind = r.kind || 'other'; let recurring = r.recurring || 'yearly'; let who = profile.PEOPLE.includes(r.personOrPetId) ? r.personOrPetId : 'sofia';
  const whoBox = el('div', { class: 'field', hidden: kind !== 'birthday' },
    el('span', { class: 'field-label' }, 'De quién'),
    ui.segmented({ label: 'De quién es el cumpleaños', value: who, options: profile.PEOPLE.map((p) => ({ value: p, label: profile.name(p) })), onChange: (v) => { who = v; } }));
  const body = el('div', { class: 'stack' },
    name.f,
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Tipo'),
      ui.segmented({ label: 'Tipo de fecha', value: kind, options: KINDS, onChange: (v) => { kind = v; whoBox.hidden = v !== 'birthday'; } })),
    whoBox,
    date.f,
    ui.toggle({ label: 'No sé el año', hint: 'Se usa solo el día y el mes.', checked: noYear, onChange: (v) => { noYear = v; } }),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Se repite'),
      ui.segmented({ label: 'Se repite', value: recurring, options: REPEAT, onChange: (v) => { recurring = v; } })));
  ui.openModal({
    title: isNew ? 'Nueva fecha' : 'Editar fecha', kind: 'sheet', className: 'date-editor', body,
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: false },
      { label: 'Guardar', variant: 'primary', onClick: async () => {
        let bad = false;
        if (!name.value) { name.f.setError('Escribe un nombre.'); bad = true; }
        const day = util.parseDay(date.value);
        if (!day) { date.f.setError('Elige una fecha.'); bad = true; }
        if (day && noYear && recurring === 'none') { date.f.setError('Una fecha de una sola vez necesita el año.'); bad = true; }
        if (bad) return false;
        await db.put('specialDates', {
          ...r, name: name.value, kind, recurring,
          personOrPetId: kind === 'birthday' ? who : kind === 'pet' ? (r.personOrPetId || null) : null,
          date: { y: noYear ? null : day.getFullYear(), m: day.getMonth() + 1, d: day.getDate() },
        });
        ui.toast(isNew ? 'Fecha agregada.' : 'Fecha guardada.', { tone: 'success' });
        done();
        return true;
      } },
    ],
  });
  requestAnimationFrame(() => name.control.focus());
}

// =====================================================================
// Hitos
// =====================================================================
async function hitos(box) {
  const rec = await db.get('profile', 'milestones');
  const items = [...(rec?.items?.length ? rec.items : CONFIG.milestones)].sort((a, b) => a.days - b.days);
  const edited = !!rec?.userEdited;
  const saveAll = async (next) => { await db.put('profile', { ...(rec || {}), id: 'milestones', items: next }); hitos(box); };
  const rows = items.map((m) => itemRow({
    title: plural(m.days, 'día', 'días'), sub: m.message, rec: m,
    onEdit: () => milestoneEditor(m, items, saveAll),
    onDelete: async () => {
      if (!(await ui.confirmDialog({ title: '¿Quitar este hito?', message: `No se celebrará el día ${m.days}.`, confirmLabel: 'Quitar', danger: true }))) return;
      await saveAll(items.filter((x) => x.id !== m.id)); ui.toast('Hito quitado.');
    },
  }));
  put(box, el('section', { class: 'card stack' },
    listHead('Hitos de días juntos', items.length, ui.button({ label: 'Agregar', iconName: 'plus', small: true, onClick: () => milestoneEditor(null, items, saveAll) })),
    el('p', { class: 'muted small' }, 'Se celebran en Inicio el día que se cumplen, y se ve cuánto falta para el siguiente.'),
    el('ul', { class: 'edit-list' }, rows),
    edited ? el('div', { class: 'btn-row' }, ui.button({ label: 'Restablecer los hitos originales', iconName: 'rotate-ccw', variant: 'ghost', onClick: async () => {
      if (!(await ui.confirmDialog({ title: '¿Restablecer los hitos?', message: 'Vuelven los hitos con los que vino la app y se pierden los cambios hechos aquí.', confirmLabel: 'Restablecer' }))) return;
      await db.rawPut('profile', { ...rec, items: CONFIG.milestones, userEdited: false, origin: 'config', updatedAt: util.nowISO() });
      ui.toast('Hitos restablecidos.'); hitos(box);
    } })) : null));
}

function milestoneEditor(m, items, saveAll) {
  const days = textField('Días juntos', m ? String(m.days) : '', { type: 'number', required: true });
  days.control.min = '1'; days.control.max = '36500'; days.control.inputMode = 'numeric';
  const msg = ui.textarea({ rows: 3, maxlength: '160' });
  msg.value = m?.message || '';
  const mf = ui.field({ label: 'Mensaje', control: msg, hint: 'Lo que dice Inicio ese día.' });
  msg.addEventListener('input', () => mf.setError(''));
  ui.openModal({
    title: m ? 'Editar hito' : 'Nuevo hito', kind: 'sheet', body: el('div', { class: 'stack' }, days.f, mf),
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: false },
      { label: 'Guardar', variant: 'primary', onClick: async () => {
        const n = Number(days.value);
        let bad = false;
        if (!Number.isInteger(n) || n < 1 || n > 36500) { days.f.setError('Un número de días entre 1 y 36.500.'); bad = true; } else if (items.some((x) => x.days === n && x.id !== m?.id)) { days.f.setError('Ya hay un hito para ese día.'); bad = true; }
        if (!msg.value.trim()) { mf.setError('Escribe el mensaje.'); bad = true; }
        if (bad) return false;
        const item = { id: m?.id || `user:milestone:${util.uuid().slice(0, 8)}`, days: n, message: msg.value.trim() };
        await saveAll(m ? items.map((x) => (x.id === m.id ? item : x)) : [...items, item]);
        ui.toast('Hito guardado.', { tone: 'success' });
        return true;
      } },
    ],
  });
  requestAnimationFrame(() => days.control.focus());
}

// =====================================================================
// Textos cortos
// =====================================================================
const LISTS = [
  { kind: 'reason', title: 'Razones por las que te amo', hint: 'La razón del día en Inicio.', fields: [['text', 'Razón']], add: true },
  { kind: 'phrase', title: 'Frases de Pensando en ti', hint: 'Las que se envían con "Pensando en ti".', fields: [['text', 'Frase']], add: true, config: true },
  { kind: 'goodMorning', title: 'Buenos días', hint: 'El saludo de la mañana en Inicio.', fields: [['text', 'Saludo']], add: true, config: true },
  { kind: 'goodNight', title: 'Buenas noches', hint: 'El saludo de la noche en Inicio.', fields: [['text', 'Saludo']], add: true, config: true },
  { kind: 'coupon', title: 'Cupones iniciales', hint: 'Los cupones nuevos se crean en la Cuponera.', fields: [['title', 'Vale por'], ['description', 'Detalle']], filter: (r) => r.origin !== 'user' },
  { kind: 'letter', title: 'Cartas iniciales', hint: 'Las cartas nuevas se escriben en Cartas, en "Escribimos".', fields: [['label', 'Ábreme cuando…'], ['text', 'La carta']], filter: (r) => r.origin !== 'user' },
];
const PAGE = 10;

async function textos(box) {
  let kind = recall(LIST_KEY, 'reason');
  if (!LISTS.some((l) => l.kind === kind)) kind = 'reason';
  const select = el('select', { class: 'input', id: 'perfil-list' }, LISTS.map((l) => el('option', { value: l.kind, selected: l.kind === kind }, l.title)));
  const listBox = el('div', { class: 'stack' });
  select.addEventListener('change', () => { kind = select.value; remember(LIST_KEY, kind); drawList(); });
  const drawList = async () => {
    const def = LISTS.find((l) => l.kind === kind);
    const all = (await db.query('content', { index: 'kind', range: IDBKeyRange.only(kind), includeHidden: true })).filter(def.filter || (() => true))
      .sort((a, b) => (a.origin === 'user') - (b.origin === 'user') || String(a.id).localeCompare(String(b.id)));
    let showAll = all.length <= PAGE;
    const ul = el('ul', { class: 'edit-list' });
    const drawRows = () => {
      put(ul, (showAll ? all : all.slice(0, PAGE)).map((r) => itemRow({
        title: r[def.fields[0][0]] || 'Sin texto', sub: def.fields[1] ? r[def.fields[1][0]] : '', rec: r, clamp: true,
        incomplete: seed.needsCompletion(def.fields.map(([k]) => r[k]).join(' ')),
        onEdit: () => textEditor(def, r, drawList),
        onToggleHidden: async () => { await db.put('content', { ...r, hidden: !r.hidden }, { userEdit: false }); ui.toast(r.hidden ? 'Vuelve a aparecer.' : 'Oculto: ya no aparece en la app.'); drawList(); },
        // v0.26.0: every reason can be deleted, also the ones from the seed or the app (to the Papelera).
        onDelete: def.kind === 'reason' ? async () => {
          const { toTrash, TRASH_NOTE } = await import('./papelera.js');
          if (!(await ui.confirmDialog({ title: '¿Borrar esta razón?', message: TRASH_NOTE, confirmLabel: 'Borrar', danger: true }))) return;
          await toTrash('content', r.id, { label: String(r.text || '').slice(0, 60), section: 'Razones', what: 'Razón borrada', onRestored: drawList });
          drawList();
        } : r.origin === 'user' ? async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar este texto?', message: 'No se puede deshacer.', confirmLabel: 'Borrar', danger: true }))) return;
          await db.purge('content', r.id); ui.toast('Borrado.'); drawList();
        } : null,
      })));
    };
    drawRows();
    const more = showAll ? null : ui.button({ label: `Ver todos (${all.length})`, variant: 'ghost', small: true, onClick: () => { showAll = true; drawRows(); more.remove(); } });
    const visible = all.filter((r) => !r.hidden).length;
    put(listBox,
      listHead(def.title, all.length, def.add ? ui.button({ label: 'Agregar', iconName: 'plus', small: true, onClick: () => textEditor(def, null, drawList) }) : null,
        all.length !== visible ? `${visible} visibles` : ''),
      el('p', { class: 'muted small' }, def.hint),
      all.length ? ul : el('p', { class: 'muted' }, 'Esta lista está vacía.'),
      more,
      def.config ? el('div', { class: 'btn-row' }, ui.button({ label: 'Restablecer los textos originales', iconName: 'rotate-ccw', variant: 'ghost', onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Restablecer esta lista?', message: 'Los textos con los que vino la app vuelven a su versión original y a mostrarse. Los que agregaron ustedes se quedan.', confirmLabel: 'Restablecer' }))) return;
        await seed.resetKind(CONFIG, kind); ui.toast('Lista restablecida.'); drawList();
      } })) : null);
  };
  put(box, el('section', { class: 'card stack' },
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'perfil-list' }, 'Lista'), select),
    el('p', { class: 'muted small' }, 'En los textos, {apodo} se cambia por el apodo de quien recibe, y {o/a} por la forma de quien envía.'),
    listBox));
  drawList();
}

function textEditor(def, rec, done) {
  const isNew = !rec;
  const controls = def.fields.map(([key, label], i) => {
    const long = key === 'text' && def.kind === 'letter';
    const c = i === 0 && !long && def.kind !== 'reason' && def.kind !== 'letter' ? ui.textarea({ rows: 3, maxlength: '280' }) : ui.textarea({ rows: long ? 10 : 3, maxlength: long ? '6000' : '400' });
    c.value = rec?.[key] || '';
    const f = ui.field({ label, control: c });
    c.addEventListener('input', () => { f.setError(''); preview(); });
    return { key, c, f };
  });
  const sample = el('p', { class: 'perfil-preview', 'aria-live': 'polite' });
  const preview = () => {
    const t = controls[0].c.value;
    sample.textContent = /\{/.test(t) ? `Así se lee: ${profile.fill(t)}` : '';
  };
  preview();
  ui.openModal({
    title: isNew ? `Agregar a ${def.title.toLowerCase()}` : 'Editar texto', kind: 'sheet', className: 'text-editor',
    body: el('div', { class: 'stack' }, controls.map((x) => x.f), sample,
      rec && rec.origin !== 'user' ? el('p', { class: 'muted small' }, rec.origin === 'config' ? 'Si lo cambias, una actualización de la app ya no lo pisará. Puedes volver al original con "Restablecer".' : 'Viene de sus datos iniciales.') : null),
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: false },
      { label: 'Guardar', variant: 'primary', onClick: async () => {
        const first = controls[0];
        if (!first.c.value.trim()) { first.f.setError('Escribe el texto.'); first.c.focus(); return false; }
        const patch = Object.fromEntries(controls.map(({ key, c }) => [key, c.value.trim()]));
        await db.put('content', isNew ? { id: `user:${def.kind}:${util.uuid().slice(0, 8)}`, kind: def.kind, ...patch } : { ...rec, ...patch });
        ui.toast(isNew ? 'Agregado.' : 'Guardado.', { tone: 'success' });
        done();
        return true;
      } },
    ],
  });
  requestAnimationFrame(() => controls[0].c.focus());
}

// ---------- shared list row ----------
function listHead(title, count, action, extra = '') {
  return el('div', { class: 'list-head' },
    el('h2', { class: 'card-title' }, title, el('span', { class: 'count-pill' }, String(count))),
    extra ? el('span', { class: 'muted small' }, extra) : null,
    action);
}

function itemRow({ title, sub, rec, onEdit, onToggleHidden, onDelete, clamp = false, incomplete = false }) {
  const tags = [
    rec.hidden ? el('span', { class: 'badge' }, 'Oculto') : null,
    incomplete ? el('span', { class: 'badge badge-warn' }, 'Por completar') : null,
    rec.userEdited && rec.origin !== 'user' ? el('span', { class: 'badge' }, 'Editado') : null,
    rec.origin === 'user' ? el('span', { class: 'badge badge-ok' }, 'Agregado') : null,
  ].filter(Boolean);
  const short = String(title).slice(0, 40);
  return el('li', { class: `edit-row${rec.hidden ? ' is-hidden' : ''}` },
    el('div', { class: 'edit-text' },
      el('p', { class: `edit-title${clamp ? ' clamp-2' : ''}` }, title),
      sub ? el('p', { class: 'edit-sub clamp-2' }, sub) : null,
      tags.length ? el('div', { class: 'edit-tags' }, tags) : null),
    el('div', { class: 'edit-actions' },
      ui.button({ iconName: 'pencil', variant: 'ghost', small: true, ariaLabel: `Editar: ${short}`, onClick: onEdit }),
      onToggleHidden ? ui.button({ iconName: rec.hidden ? 'eye' : 'eye-off', variant: 'ghost', small: true, ariaLabel: `${rec.hidden ? 'Mostrar' : 'Ocultar'}: ${short}`, onClick: onToggleHidden }) : null,
      onDelete ? ui.button({ iconName: 'trash-2', variant: 'ghost', small: true, ariaLabel: `Borrar: ${short}`, onClick: onDelete }) : null));
}

