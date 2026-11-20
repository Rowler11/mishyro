// Design audit used by the aishiteru-design-check skill (UI UX Pro Max checklist + own rules).
// Checks every screen at 390/820/1440 px, day and night: horizontal scroll, touch targets under
// 44×44 (24×24 with a mouse at 1440), controls without an accessible name, and Japanese text outside the screen title.
// Usage: BASE=http://127.0.0.1:8787/ node tests/ui-audit.cjs   (fictitious seed only)
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/mishyro/';
const SEED = path.join(__dirname, '..', 'seed-privado.example.json');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const ROUTES_ALL = ['/inicio', '/capsula', '/capsula/nuevo', '/cupones', '/cartas', '/mas', '/ajustes', '/ajustes/perfil',
  '/ajustes/seguridad', '/ajustes/privacidad', '/ajustes/terceros', '/ajustes/copia', '/ajustes/apariencia',
  '/ajustes/movimiento', '/ajustes/legal', '/ajustes/legal/privacidad', '/ajustes/legal/version', '/buscar',
  '/ajustes/acerca', '/calendario', '/preguntas', '/canciones', '/diario', '/animo', '/jibun', '/retos', '/fechas', '/recordatorios', '/galeria', '/album', '/mapa', '/primeras-veces', '/photobooth', '/capsula-tiempo', '/planes', '/suenos', '/citas', '/regalos', '/encuentro', '/voz', '/lenguajes', '/gratitud', '/insignias', '/resumen'];

const ROUTES = ONLY ? ROUTES_ALL.filter((r) => ONLY.includes(r)) : ROUTES_ALL;

// Screens behind a tap: [route, button to press].
const OPENED = [['/cupones', 'Nuevo cupón'], ['/cartas', 'Escribir carta'], ['/inicio', /^Usa la app/], ['/ajustes/guia-estilo', 'Modal'], ['/canciones', 'Dedicar'], ['/diario', 'Escribir'], ['/jibun', 'Agregar'], ['/preguntas', 'Escribir mi pregunta'], ['/calendario', 'Nueva cita'], ['/recordatorios', /^Agregar$/], ['/mapa', 'Lugar'], ['/planes', 'Plan'], ['/suenos', 'Sueño'], ['/regalos', 'Deseo'], ['/capsula-tiempo', 'Escribir'], ['/gratitud', 'Escribir una nota'], ['/lenguajes', 'Responder el cuestionario'], ['/encuentro', /Poner la fecha|Cambiar/], ['/photobooth', 'Nueva foto'], ['/citas', '¿Quién decide?']];

async function setup(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.getByRole('button', { name: /Sofía/ }).click();
  await page.setInputFiles('#seed-file', SEED);
  await page.getByRole('button', { name: 'Importar' }).click();
  await page.getByRole('button', { name: 'Todo bien' }).click();
  await page.getByRole('button', { name: 'Ahora no' }).click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.waitForFunction(() => location.hash === '#/inicio');
}

// Runs in the page. Returns a list of findings for the current screen.
function audit(MIN) {
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const desc = (el) => {
    const cls = [...el.classList].slice(0, 2).join('.');
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${txt ? ` "${txt}"` : ''}`;
  };
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`overflow-x: page is ${document.documentElement.scrollWidth}px wide`);
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [tabindex="0"]';
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el) || el.disabled) continue;
    // Inline links inside running text are exempt (WCAG 2.5.8).
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement.closest('p, li')) continue;
    // The map's attribution line (Leaflet · OpenStreetMap) is running text too.
    if (el.closest('.leaflet-control-attribution')) continue;
    if (el.matches('.visually-hidden, .sr-only') || el.getBoundingClientRect().bottom < 0) continue;
    // A hidden radio counts as its visible label (segmented control).
    const shown = el.classList.contains('segmented-input') ? el.nextElementSibling : el;
    let box = shown.getBoundingClientRect();
    // An absolutely positioned ::after enlarges the hit area without changing the look.
    const after = getComputedStyle(shown, '::after');
    if (after.content !== 'none' && after.position === 'absolute') {
      const px = (v) => parseFloat(v) || 0;
      box = { width: box.width - px(after.left) - px(after.right), height: box.height - px(after.top) - px(after.bottom) };
    }
    // A checkbox/radio counts with its label; an input inside a label too.
    const label = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
    if (label && shown === el && /^(checkbox|radio)$/.test(el.type)) box = label.getBoundingClientRect();
    if (el.type === 'file' && getComputedStyle(el).opacity === '0') continue;
    if (Math.round(box.width) < MIN || Math.round(box.height) < MIN) out.push(`target ${Math.round(box.width)}×${Math.round(box.height)}: ${desc(el)}`);
    const name = (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || el.value || el.placeholder || (label && label.textContent) || '').trim();
    if (!name && !el.querySelector('img[alt]:not([alt=""])')) out.push(`no-name: ${desc(el)}`);
  }
  const jp = /[぀-ヿ一-龯]/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!jp.test(n.nodeValue)) continue;
    const el = n.parentElement;
    if (!visible(el) || el.closest('h1, .page-title, .page-head, [data-jp-ok]')) continue;
    out.push(`japanese outside title: ${desc(el)}`);
  }
  return [...new Set(out)];
}

(async () => {
  const browser = await chromium.launch();
  const all = new Map();
  for (const width of [390, 820, 1440]) {
    // Phone and tablet are touch (44×44 targets); the PC uses a mouse (24×24, WCAG 2.5.8).
    const touch = width < 1280;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    await setup(page);
    for (const theme of ['day', 'night']) {
      await page.evaluate(async (t) => { (await import('./js/core/theme.js')).apply({ theme: t }); }, theme);
      for (const r of ROUTES) {
        await page.evaluate((p) => { location.hash = `#${p}`; }, r);
        await page.waitForTimeout(450);
        for (const f of await page.evaluate(audit, width >= 1280 ? 24 : 44)) {
          const key = `${r} :: ${f}`;
          if (!all.has(key)) all.set(key, new Set());
          all.get(key).add(`${width}`);
        }
      }
      for (const [r, name] of OPENED) {
        await page.evaluate((p) => { location.hash = `#${p}`; }, r);
        await page.waitForTimeout(450);
        const target = typeof name === 'string' ? page.getByRole('button', { name, exact: true }) : page.getByRole('button', { name }).first();
        if (!(await target.count())) continue;
        await target.first().click();
        await page.waitForTimeout(450);
        for (const f of await page.evaluate(audit, width >= 1280 ? 24 : 44)) {
          const key = `${r} > ${name} :: ${f}`;
          if (!all.has(key)) all.set(key, new Set());
          all.get(key).add(`${width}`);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
      }
    }
    await ctx.close();
  }
  await browser.close();
  for (const [k, w] of all) console.log(`${k}  [${[...w].join(',')}]`);
  console.log(`\n${all.size} findings`);
  process.exit(all.size ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
