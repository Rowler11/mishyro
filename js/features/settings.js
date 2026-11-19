// Ajustes: main list, Apariencia, Movimiento y sonido, Legal y ayuda and Acerca de.
// Centro de seguridad and Copia de seguridad live in ajustes.js.
import { ui, util, db, theme, profile, router, CONFIG } from '../core.js';
import { SETTINGS_PAGES } from '../routes.js';

const { el, icon, ja } = util;

export function render(ctx) {
  const page = ctx.def.settingsPage || (ctx.def.id === 'legal-doc' ? 'legal-doc' : 'main');
  if (page === 'apariencia') return appearance();
  if (page === 'movimiento') return motion();
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

  const who = ui.segmented({
    label: 'Quién usa la app', value: profile.active(),
    options: [{ value: 'sofia', label: profile.name('sofia') }, { value: 'david', label: profile.name('david') }],
    onChange: (v) => { profile.setActive(v); ui.toast(`Ahora usa la app: ${profile.name(v)}`); },
  });

  const rows = SETTINGS_PAGES.map((p) => el('a', { class: 'list-row card-link', href: `#/ajustes/${p.id}` },
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
    el('div', { class: 'card stack' }, el('h2', { class: 'card-title' }, 'Quién usa la app'),
      el('p', { class: 'muted' }, 'Sirve para saber quién escribe cada cosa y qué es "Solo yo". Se recuerda en este dispositivo.'), who),
    install ? el('div', { class: 'card stack' }, el('p', {}, 'Instálala para abrirla como una app, también sin conexión.'), install) : null,
    el('nav', { class: 'list card', 'aria-label': 'Secciones de ajustes' }, rows),
    el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Asistente inicial'),
      el('p', { class: 'muted' }, 'Vuelve a importar los datos iniciales o revisa nombres y fechas. No duplica nada.'),
      ui.button({ label: 'Abrir el asistente', iconName: 'wand-sparkles', href: '#/setup' })));
}

// ---------- appearance ----------
function appearance() {
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
      previews.replaceChildren(...['day', 'night'].map((t) => el('div', { class: `theme-preview tp-${t}${now === t ? ' tp-on' : ''}` },
        el('span', { class: 'tp-seal' }, '愛'), el('span', { class: 'tp-title' }, t === 'day' ? 'Sakura de día' : 'Sakura de noche'),
        el('span', { class: 'tp-line' }), el('span', { class: 'tp-line short' }), el('span', { class: 'tp-btn' }))));
    };
    preview();
    wrap.append(
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
        el('h2', { class: 'card-title' }, 'Japonés'),
        ui.toggle({ label: 'Mostrar textos en japonés', hint: 'Son decorativos: la app se entiende igual solo en español.', checked: s.japanese, onChange: (v) => save({ japanese: v }) })));
  });
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Apariencia', back: '/ajustes' }), wrap);
}

// ---------- motion & sound ----------
let audioCtx = null;
/** Soft furin-like chime generated with Web Audio (no audio files). */
export function chime() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    [1318.5, 1975.5, 2637].forEach((f, i) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.12 / (i + 1), t + i * 0.05 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 1.6);
      o.connect(g).connect(audioCtx.destination); o.start(t + i * 0.05); o.stop(t + 1.8);
    });
  } catch { /* audio not available */ }
}

function motion() {
  const wrap = el('div', { class: 'stack' });
  db.getSettings('motion', theme.MOTION_DEFAULTS).then((s) => {
    const save = async (patch) => { await db.setSettings('motion', patch); theme.apply(patch); };
    const sys = matchMedia('(prefers-reduced-motion: reduce)').matches;
    wrap.append(el('div', { class: 'card stack' },
      ui.toggle({ label: 'Animaciones', hint: sys ? 'Tu dispositivo pide reducir el movimiento: se usan versiones sobrias.' : 'Pétalos, sellos y transiciones. Apágalas para una versión sobria y rápida.', checked: s.animations, onChange: (v) => save({ animations: v }) }),
      ui.toggle({ label: 'Vibración suave', hint: 'Un toque leve en acciones clave.', checked: s.haptics, onChange: (v) => { save({ haptics: v }); if (v) util.haptic(15); } }),
      ui.toggle({ label: 'Sonidos suaves', hint: 'Campanilla y tonos generados en el teléfono. Apagados por defecto.', checked: s.sound, onChange: (v) => { save({ sound: v }); if (v) chime(); } }),
      ui.button({ label: 'Escuchar la campanilla', iconName: 'bell', variant: 'ghost', onClick: chime })));
  });
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Movimiento y sonido', back: '/ajustes' }), wrap);
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
  return el('section', { class: 'page' }, ui.pageHeader({ title: 'Legal y ayuda', back: '/ajustes' }), list,
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
    if (['meta', 'settings', 'errors', 'vault'].includes(name)) continue;
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
