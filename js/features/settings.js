// Ajustes: main list, Apariencia (with Movimiento y sonido), Legal y ayuda and Acerca de.
// Centro de seguridad and Copia de seguridad live in ajustes.js.
import { ui, util, db, theme, profile, router, CONFIG } from '../core.js';
import { SETTINGS_PAGES, HUBS, listed } from '../routes.js';
import * as fx from '../core/fx.js';
import { draw } from '../core/art.js';

const { el, icon, ja } = util;

export function render(ctx) {
  const page = ctx.def.settingsPage || (ctx.def.id === 'legal-doc' ? 'legal-doc' : 'main');
  // Movimiento y sonido lives inside Apariencia (2026-11-21); its old address opens that part.
  if (page === 'apariencia' || page === 'movimiento') return appearance(ctx, { focusMotion: page === 'movimiento' });
  if (page === 'legal') return legal();
  if (page === 'legal-doc') return legalDoc(ctx.params.doc);
  if (page === 'acerca') return about(ctx);
  return main(ctx);
}

// ---------- main ----------
function main({ app }) {
  let taps = 0; let tapTimer = null;
  const seal = el('button', { class: 'seal-btn', type: 'button', 'aria-label': 'Sello de Aishiteru', onClick: () => {
    taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 1500);
    seal.firstChild.classList.remove('hanko-stamp'); void seal.offsetWidth; seal.firstChild.classList.add('hanko-stamp');
    if (taps >= 7) { taps = 0; router.go('/yoru'); }
  } }, ui.hanko({ size: 56 }));

  // v0.26.0: no switching between the two. Your card shows who you are here and opens your photo.
  const me = profile.active(); const pic = profile.photo(me);
  const meCard = el('a', { class: 'card card-link me-card', href: '#/ajustes/perfil' },
    el('span', { class: 'avatar-preview me-avatar', 'aria-hidden': 'true' }, pic ? el('img', { src: pic, alt: '' }) : ([...profile.name(me)][0] || '?')),
    el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, profile.name(me)),
      el('span', { class: 'muted small' }, pic ? 'Tu perfil: cambia tu foto y tus datos' : 'Tu perfil: pon tu foto y revisa tus datos')),
    icon('chevron-right', { cls: 'list-chevron' }));

  // Joined pages (2026-11-21) show once, under the hub's name; their other parts are tabs inside.
  const rows = SETTINGS_PAGES.filter((p) => !p.hidden && listed(`ajustes/${p.id}`)).map((p) => ({ ...p, ...(HUBS.find((h) => h.id === `ajustes/${p.id}`) ? { title: HUBS.find((h) => h.id === `ajustes/${p.id}`).title, icon: HUBS.find((h) => h.id === `ajustes/${p.id}`).icon } : {}) })).map((p) => el('a', { class: 'list-row card-link', href: `#/ajustes/${p.id}` },
    el('span', { class: 'list-icon' }, icon(p.icon)),
    el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, p.title)),
    p.module ? icon('chevron-right', { cls: 'list-chevron' }) : el('span', { class: 'badge' }, 'Pronto')));

  const install = app.deferredInstall ? ui.button({ label: 'Instalar la app', iconName: 'download', variant: 'primary', onClick: async () => {
    app.deferredInstall.prompt();
    const { outcome } = await app.deferredInstall.userChoice;
    app.deferredInstall = null;
    if (outcome === 'accepted') { ui.toast('¡Listo! La app quedó instalada.', { tone: 'success' }); install.remove(); }
  } }) : null;

  return el('section', { class: 'page' },
    el('header', { class: 'page-head' },
      el('div', { class: 'page-titles' }, el('h1', { class: 'page-title', tabindex: '-1' }, 'Ajustes'), ja('設定', 'settei')),
      el('div', { class: 'page-actions' }, seal)),
    meCard,
    install ? el('div', { class: 'card stack' }, el('p', {}, 'Instálala para abrirla como una app, también sin conexión.'), install) : null,
    el('nav', { class: 'list card', 'aria-label': 'Secciones de ajustes' }, rows),
    el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Asistente inicial'),
      el('p', { class: 'muted' }, 'Vuelve a importar los datos iniciales o revisa nombres y fechas. No duplica nada.'),
      ui.button({ label: 'Abrir el asistente', iconName: 'wand-sparkles', href: '#/setup' })));
}

// ---------- appearance ----------
function appearance(ctx = {}, { focusMotion = false } = {}) {
  const wrap = el('div', { class: 'stack' });
  db.getSettings('appearance', theme.APPEARANCE_DEFAULTS).then((s) => {
    const save = async (patch) => { await db.setSettings('appearance', patch); theme.apply(patch); preview(); };
    const scaleOut = el('output', { class: 'range-out', for: 'text-scale' }, `${s.textScale}%`);
    const scale = el('input', { id: 'text-scale', type: 'range', min: '85', max: '200', step: '5', value: String(s.textScale), class: 'range' });
    scale.addEventListener('input', () => { scaleOut.textContent = `${scale.value}%`; });
    scale.addEventListener('change', () => save({ textScale: Number(scale.value) }));
    const previews = el('div', { class: 'theme-previews', 'aria-hidden': 'true' });
    const preview = () => {
      const now = theme.resolveTheme(theme.current().theme);
      const st = theme.styleOf(theme.current());
      const nm = { jp: 'Sakura', rojo: 'Palacio', azul: 'Porcelana' }[st];
      previews.replaceChildren(...['day', 'night'].map((t) => el('div', { class: `theme-preview tp-${t} tp-s-${st}${now === t ? ' tp-on' : ''}` },
        el('span', { class: 'tp-seal' }, st === 'jp' ? '愛' : '爱'), el('span', { class: 'tp-title' }, `${nm} de ${t === 'day' ? 'día' : 'noche'}`),
        el('span', { class: 'tp-line' }), el('span', { class: 'tp-line short' }), el('span', { class: 'tp-btn' }))));
    };
    preview();
    // v0.16.0: the visual style (Japonés, Palacio rojo, Porcelana azul), chosen 2026-11-24.
    const STYLE_INFO = [
      { value: 'jp', name: 'Japonés', icon: 'brand-sakura', colors: ['#C2405F', '#6B4E8C', '#C9A46A'], hint: 'Sakura, sellos redondos y olas.' },
      { value: 'rojo', name: 'Palacio rojo', icon: 'brand-plum', colors: ['#B42A26', '#C8972E', '#2E6A5C'], hint: 'Bermellón, dorado, jade y farolillos.' },
      { value: 'azul', name: 'Porcelana azul', icon: 'brand-plum', colors: ['#26478E', '#B23A30', '#B39556'], hint: 'Azul cobalto sobre porcelana blanca.' },
    ];
    const styleHint = el('p', { class: 'muted', 'aria-live': 'polite' });
    const styleCards = el('div', { class: 'style-previews', role: 'group', 'aria-label': 'Estilo de la app' });
    const drawStyles = (cur) => {
      styleHint.textContent = STYLE_INFO.find((x) => x.value === cur)?.hint || '';
      styleCards.replaceChildren(...STYLE_INFO.map((x) => {
        const b = el('button', { type: 'button', class: `style-preview sp-${x.value}`, 'aria-pressed': String(cur === x.value), 'data-style-pick': x.value },
          el('span', { class: 'sp-mark' }, util.icon(x.icon, { size: 30 })),
          el('span', { class: 'sp-name' }, x.name),
          el('span', { class: 'sp-swatches', 'aria-hidden': 'true' }, ...x.colors.map((c) => el('i', { style: { '--c': c } }))));
        b.addEventListener('click', async () => { await save({ style: x.value }); drawStyles(x.value); util.haptic(10); });
        return b;
      }));
    };
    drawStyles(theme.styleOf(s));
    wrap.append(
      el('div', { class: 'card stack' },
        el('h2', { class: 'card-title' }, 'Estilo'),
        el('p', { class: 'muted' }, 'Cómo se ve toda la app. Cada estilo tiene su versión de día y de noche, y lo pueden cambiar cuando quieran.'),
        styleCards, styleHint),
      el('div', { class: 'card stack' },
        el('h2', { class: 'card-title' }, 'Tema'),
        el('p', { class: 'muted' }, `Automático: tema claro de día (de ${theme.DAY_START}:00 a ${theme.NIGHT_START}:00) y oscuro de noche.`),
        ui.segmented({ label: 'Tema', value: s.theme, onChange: (v) => save({ theme: v }), options: [
          { value: 'auto', label: 'Automático', icon: 'sun-moon' }, { value: 'day', label: 'Día', icon: 'sun' }, { value: 'night', label: 'Noche', icon: 'moon' }] }),
        previews),
      el('div', { class: 'card stack' },
        el('h2', { class: 'card-title' }, 'Lectura'),
        ui.toggle({ label: 'Alto contraste', hint: 'Colores más marcados y bordes visibles.', checked: s.highContrast, onChange: (v) => save({ highContrast: v }) }),
        ui.toggle({ label: 'Fuente de alta legibilidad', hint: 'Atkinson Hyperlegible para todo el texto.', checked: s.legibleFont, onChange: (v) => save({ legibleFont: v }) }),
        el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'text-scale' }, 'Tamaño del texto'), el('div', { class: 'range-row' }, scale, scaleOut))),
      el('div', { class: 'card stack' },
        el('h2', { class: 'card-title' }, 'Letras de los títulos'),
        ui.toggle({ label: 'Mostrar letras junto a cada título', hint: 'Japonesas o chinas, según el estilo. Son decorativas: la app se entiende igual solo en español.', checked: s.japanese, onChange: (v) => save({ japanese: v }) })));
  });
  const motionPart = motion(ctx);
  if (focusMotion) motionPart.ready.then(() => requestAnimationFrame(() => motionPart.node.scrollIntoView({ block: 'start' })));
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Apariencia', back: '/ajustes' }), wrap,
    el('h2', { class: 'card-kicker settings-subtitle', id: 'movimiento' }, 'Movimiento y sonido'), motionPart.node);
}

// ---------- motion & sound ----------
/** Soft furin-like chime (shared with the opening, lives in util). */
export const chime = () => util.chime();

function motion({ app } = {}) {
  const wrap = el('div', { class: 'stack', 'aria-labelledby': 'movimiento', role: 'group' });
  const ready = db.getSettings('motion', theme.MOTION_DEFAULTS).then((s) => {
    const save = async (patch) => { await db.setSettings('motion', patch); theme.apply(patch); };
    const sys = matchMedia('(prefers-reduced-motion: reduce)').matches;
    util.fill(wrap, el('div', { class: 'card stack' },
      ui.toggle({ label: 'Animaciones', hint: sys ? 'Tu dispositivo pide reducir el movimiento: se usan versiones sobrias.' : 'Pétalos, sellos y transiciones. Apágalas para una versión sobria y rápida.', checked: s.animations, onChange: (v) => save({ animations: v }) }),
      ui.toggle({ label: 'Vibración suave', hint: 'Un toque leve en acciones clave.', checked: s.haptics, onChange: (v) => { save({ haptics: v }); if (v) util.haptic(15); } }),
      ui.toggle({ label: 'Sonidos suaves', hint: 'Campanilla y tonos generados en el teléfono. Apagados por defecto.', checked: s.sound, onChange: (v) => { save({ sound: v }); if (v) chime(); } }),
      ui.toggle({ label: 'Voces de los animalitos', hint: 'Maullidos, el pon-pon del tanuki y más cuando los tocas. Encendidas por defecto.', checked: s.animalSound !== false, onChange: (v) => { save({ animalSound: v }); if (v) import('../core/sounds.js').then((m) => m.play('cat', { force: true })); } }),
      el('div', { class: 'btn-row', role: 'group', 'aria-label': 'Escuchar los sonidos antes de activarlos' },
        ui.button({ label: 'Campanilla', iconName: 'bell', variant: 'ghost', small: true, onClick: chime }),
        ui.button({ label: 'Papel', iconName: 'mail', variant: 'ghost', small: true, onClick: () => util.sound('paper', { force: true }) }),
        ui.button({ label: 'Sello', iconName: 'award', variant: 'ghost', small: true, onClick: () => util.sound('stamp', { force: true }) }))),
    CONFIG.seasonalEffects ? el('div', { class: 'card stack' },
      ui.toggle({ label: 'Hojas de Inicio', hint: `Cambian solas con las estaciones de Japón: sakura en primavera, arce verde y luciérnagas en verano, arce rojo en otoño y nieve en invierno. Ahora caen ${fx.seasonLabel(fx.seasonOf())}; de noche, también con faroles.`, checked: s.seasonal !== false, onChange: (v) => save({ seasonal: v }) })) : null,
    el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Entrada con corazón'),
      el('p', { class: 'muted small' }, '"Te amo" en muchos idiomas dibuja un corazón al abrir la app. Las demás veces sale la bienvenida corta.'),
      ui.segmented({ label: 'Cuándo sale', value: s.intro === 'always' ? 'always' : 'daily', onChange: (v) => save({ intro: v }), options: [
        { value: 'daily', label: 'Una vez al día' }, { value: 'always', label: 'Siempre' }] }),
      sys || !s.animations ? el('p', { class: 'muted small' }, 'Con las animaciones apagadas sale la bienvenida corta.') : null,
      ui.button({ label: 'Ver la entrada', iconName: 'heart', variant: 'ghost', onClick: () => app.playIntro?.() })),
    petsCard());
  });
  return { node: wrap, ready };
}

/** Mascotas de papel (v0.14.0): rename the origami creatures; their personality stays. */
function petsCard() {
  const box = el('div', { class: 'card stack' }, el('h2', { class: 'card-title' }, 'Mascotas de papel'),
    el('p', { class: 'muted small' }, 'Viven en las secciones. Tócalas y te dicen algo. Ponles el nombre que quieran.'));
  import('../core/pets.js').then(async (pets) => {
    await pets.load();
    box.append(el('ul', { class: 'pet-names' }, Object.entries(pets.PETS).map(([id, p]) => {
      const input = el('input', { class: 'input', id: `pet-name-${id}`, value: pets.nameOf(id), maxlength: '20', autocomplete: 'off' });
      input.addEventListener('change', async () => { const v = input.value.trim() || p.name; input.value = v; await pets.saveNames({ [id]: v }); ui.toast(`Ahora se llama ${v}.`); });
      return el('li', { class: 'pet-name-row' },
        el('span', { class: 'pet-name-art', 'aria-hidden': 'true' }, draw(id === 'crane' ? 'crane' : id)),
        el('div', { class: 'grow stack-tight' }, el('label', { class: 'field-label', for: `pet-name-${id}` }, `Nombre de ${p.kind}`), input, el('span', { class: 'muted small' }, p.trait)));
    })));
  }).catch(() => {});
  return box;
}

// ---------- legal ----------
async function legalDocs() {
  return (await db.query('content', { index: 'kind', range: IDBKeyRange.only('legal') }))
    .sort((a, b) => order(a.id) - order(b.id));
}
function order(id) {
  const i = CONFIG.legalTexts.findIndex((x) => x.id === id);
  return i < 0 ? 999 : i;
}

function legal() {
  const list = el('nav', { class: 'list card', 'aria-label': 'Documentos legales y de ayuda' }, ui.skeleton(3));
  legalDocs().then((docs) => list.replaceChildren(...docs.map((d) => el('a', { class: 'list-row card-link', href: `#/ajustes/legal/${d.id.split(':').pop()}` },
    el('span', { class: 'list-icon' }, icon('file-text')),
    el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, d.title), el('span', { class: 'list-sub' }, d.summary)),
    icon('chevron-right', { cls: 'list-chevron' })))));
  // v0.14.0: the guide's hints and the "Primeros pasos" card can come back from here.
  const guide = el('section', { class: 'card stack-tight' },
    el('h2', { class: 'card-title' }, 'Guía de la app'),
    el('p', { class: 'muted small' }, 'Los animalitos te muestran la app otra vez: el recorrido de Inicio y el de cada sección la primera vez que entres. También vuelve "Primeros pasos".'),
    el('div', { class: 'btn-row' },
      ui.button({ label: 'Ver el recorrido', iconName: 'sparkles', small: true, onClick: async () => {
        const [g, t] = await Promise.all([import('./guia.js'), import('./tour.js')]);
        g.resetHints(); t.reset(); await db.setSettings('guideHidden', { hidden: false });
        router.go('/inicio'); setTimeout(() => t.start('main'), 500);
      } }),
      ui.button({ label: 'Solo las secciones', iconName: 'lightbulb', small: true, variant: 'ghost', onClick: async () => {
        const [g, t] = await Promise.all([import('./guia.js'), import('./tour.js')]);
        g.resetHints(); const main = t.state().main || 'done'; t.reset(); try { localStorage.setItem(`${CONFIG.storageKey}.tour`, JSON.stringify({ main })); } catch { /* private mode */ }
        await db.setSettings('guideHidden', { hidden: false });
        ui.toast('Listo: cada sección se explica otra vez la primera vez que entres.', { tone: 'success' });
      } })));
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Legal y ayuda', back: '/ajustes' }), guide, list,
    el('p', { class: 'muted small' }, CONFIG.legalFooter));
}

/** Light text format of the legal docs: blank line = paragraph, "## " = subtitle, "- " = list item. */
export function renderRich(text) {
  const out = [];
  for (const block of String(text || '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let list = null; let para = [];
    const flush = () => { if (para.length) { out.push(el('p', {}, para.join(' '))); para = []; } };
    for (const line of lines) {
      if (line.startsWith('## ')) { flush(); list = null; out.push(el('h2', { class: 'prose-h' }, line.slice(3).trim())); }
      else if (/^- /.test(line)) { flush(); if (!list) { list = el('ul'); out.push(list); } list.append(el('li', {}, line.slice(2).trim())); }
      else { list = null; para.push(line.trim()); }
    }
    flush();
  }
  return out;
}

/** Technical report with no personal data: versions, device, counts per store and recent errors. */
async function techReport() {
  const meta = await db.getMeta();
  const counts = [];
  for (const name of db.STORE_NAMES) {
    if (['meta', 'settings', 'errors', 'vault', 'syncState', 'syncInbox'].includes(name)) continue;
    const n = (await db.rawAll(name)).filter((r) => !r.deleted).length;
    if (n) counts.push(`${name}: ${n}`);
  }
  const errors = (await db.rawAll('errors')).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5)
    .map((e) => `- ${String(e.at).slice(0, 16)} v${e.version || '?'} ${String(e.message).slice(0, 140)}`);
  let persisted = 'n/d';
  try { persisted = String(await navigator.storage?.persisted?.()); } catch { /* ignore */ }
  return [
    'Reporte técnico de Aishiteru (sin datos personales)',
    `Versión: ${CONFIG.appVersion} · datos v${db.SCHEMA_VERSION}`,
    `Navegador: ${navigator.userAgent}`,
    `Pantalla: ${innerWidth}x${innerHeight} @${devicePixelRatio} · instalada: ${matchMedia('(display-mode: standalone)').matches ? 'sí' : 'no'}`,
    `Almacenamiento persistente: ${persisted} · configurada: ${meta.setupDone ? 'sí' : 'no'}`,
    `Elementos: ${counts.join(', ') || 'ninguno'}`,
    'Errores recientes:', ...(errors.length ? errors : ['- ninguno']),
  ].join('\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = el('textarea', { class: 'visually-hidden', 'aria-hidden': 'true' }, text);
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

function legalDoc(slug) {
  const body = el('article', { class: 'card prose legal-doc' }, ui.skeleton(4));
  const tools = el('div', { class: 'btn-row' });
  const extra = el('div', { class: 'stack' });
  const page = el('section', { class: 'page' }, ui.pageHeader({ title: 'Legal y ayuda', back: '/ajustes/legal' }), extra, body, tools);
  const id = `cfg:legal:${slug}`;
  const draw = async () => {
    const d = await db.get('content', id);
    if (!d) { body.replaceChildren(ui.emptyState({ title: 'Documento no encontrado', art: 'fan' })); return; }
    page.querySelector('.page-title').textContent = d.title;
    body.replaceChildren(el('p', { class: 'lead' }, d.summary), ...renderRich(d.body), el('p', { class: 'muted small legal-foot' }, CONFIG.legalFooter));
    const original = CONFIG.legalTexts.find((x) => x.id === id);
    tools.replaceChildren(...[
      ui.button({ label: 'Editar el texto', iconName: 'pencil', onClick: () => editLegal(d, draw) }),
      d.userEdited && original ? ui.button({ label: 'Restaurar el texto original', iconName: 'rotate-ccw', variant: 'ghost', onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Restaurar el texto?', message: 'Se pierde lo que cambiaron en este documento.', confirmLabel: 'Restaurar' }))) return;
        await db.rawPut('content', { ...(await db.rawGet('content', id)), ...original, kind: 'legal', userEdited: false, hidden: false, deleted: false, updatedAt: util.nowISO() });
        ui.toast('Texto restaurado.'); draw();
      } }) : null].filter(Boolean));
  };
  if (slug === 'version') {
    (async () => {
      const meta = await db.getMeta();
      const reportBtn = ui.button({ label: 'Copiar reporte técnico', iconName: 'copy', variant: 'primary', onClick: async () => {
        const ok = await copyText(await techReport());
        ui.toast(ok ? 'Reporte copiado. Pégalo en un mensaje o correo.' : 'No se pudo copiar. Intenta de nuevo.', { tone: ok ? 'success' : 'error' });
      } });
      const mail = ui.button({ label: 'Escribir un correo', iconName: 'mail', onClick: async () => {
        location.href = `mailto:?subject=${encodeURIComponent(`Aishiteru ${CONFIG.appVersion}: un problema`)}&body=${encodeURIComponent(`Qué pasó:\n\n\n${await techReport()}`)}`;
      } });
      extra.replaceChildren(el('section', { class: 'card stack' },
        el('dl', { class: 'facts' }, el('dt', {}, 'Versión'), el('dd', {}, CONFIG.appVersion), el('dt', {}, 'Versión de datos'), el('dd', {}, String(db.SCHEMA_VERSION)),
          el('dt', {}, 'Última actualización'), el('dd', {}, meta.updatedAt ? util.formatDay(String(meta.updatedAt).slice(0, 10)) : '—')),
        el('div', { class: 'btn-row' }, reportBtn, mail)));
    })();
  }
  draw();
  return page;
}

function editLegal(d, done) {
  const ta = ui.textarea({ rows: 16, maxlength: '20000' });
  ta.value = d.body || '';
  const f = ui.field({ label: 'Texto', control: ta, hint: 'Una línea en blanco separa párrafos. "## " al inicio de una línea hace un subtítulo y "- " un punto de lista.' });
  ui.openModal({
    title: `Editar: ${d.title}`, kind: 'sheet', size: 'lg', className: 'legal-editor', body: el('div', { class: 'stack' }, f),
    actions: [
      { label: 'Cancelar', variant: 'ghost', value: false },
      { label: 'Guardar', variant: 'primary', onClick: async () => {
        if (!ta.value.trim()) { f.setError('El texto no puede quedar vacío. Para volver al original usa "Restaurar".'); return false; }
        await db.put('content', { ...d, body: ta.value.trim() });
        ui.toast('Texto guardado.', { tone: 'success' }); done(); return true;
      } },
    ],
  });
}

// ---------- about ----------
function about() {
  const facts = el('dl', { class: 'facts' });
  (async () => {
    const meta = await db.getMeta();
    let persisted = 'No disponible';
    try { persisted = (await navigator.storage?.persisted?.()) ? 'Activo' : 'No activo'; } catch { /* ignore */ }
    const rows = [
      ['Versión', CONFIG.appVersion], ['Versión de datos', String(db.SCHEMA_VERSION)],
      ['Almacenamiento persistente', persisted],
      ['Última copia', meta.lastBackupAt ? util.formatDay(meta.lastBackupAt.slice(0, 10)) : 'Ninguna todavía'],
    ];
    facts.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  })();
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Acerca de', back: '/ajustes' }),
    el('div', { class: 'card stack about-card' },
      el('div', { class: 'about-brand' }, ui.logo({ size: 64 }), el('div', {}, el('p', { class: 'about-name' }, 'Aishiteru'), el('p', { class: 'muted small', 'data-jp-ok': '' }, '愛してる · te amo'))),
      el('p', {}, 'Una app hecha a mano para los dos. Todo se guarda solo en este dispositivo.'), facts),
    el('nav', { class: 'list card', 'aria-label': 'Más información' },
      el('a', { class: 'list-row card-link', href: '#/ajustes/guia-estilo' }, el('span', { class: 'list-icon' }, icon('palette')), el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, 'Guía de estilo')), icon('chevron-right', { cls: 'list-chevron' })),
      el('a', { class: 'list-row card-link', href: '#/ajustes/legal/licencias' }, el('span', { class: 'list-icon' }, icon('file-text')), el('span', { class: 'list-text' }, el('span', { class: 'list-title' }, 'Licencias y créditos')), icon('chevron-right', { cls: 'list-chevron' }))));
}
