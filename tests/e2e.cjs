// End-to-end smoke tests for Fase 1 (Playwright + preinstalled Chromium).
// Usage: serve the repo's parent so the app lives at /mishyro/, then:
//   BASE=http://127.0.0.1:8765/mishyro/ SHOTS=/tmp/shots node tests/e2e.cjs
// Uses only the fictitious seed-privado.example.json.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/mishyro/';
const SHOTS = process.env.SHOTS || '';
const SEED = path.join(__dirname, '..', 'seed-privado.example.json');
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`); };

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }

function watch(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', async (d) => { errors.push(`native dialog: ${d.type()}`); await d.dismiss(); });
  return errors;
}

async function completeSetup(page) {
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

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ---------- 1. Setup with the example seed, resume halfway, story ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.addInitScript(() => { delete window.showSaveFilePicker; window.showSaveFilePicker = undefined; });
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Empezar' }).waitFor();
    ok('setup: first open goes to #/setup', (await page.evaluate(() => location.hash)) === '#/setup');
    await page.getByRole('button', { name: 'Empezar' }).click();
    await page.getByRole('button', { name: /Sofía/ }).click();
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    await page.getByText('Revisen que todo esté bien').waitFor();
    await shot(page, 'setup-review-390');
    // close halfway and reopen: resumes at review, no duplicates
    await page.reload();
    await page.getByText('Revisen que todo esté bien').waitFor();
    ok('setup: resumes at the saved step after reload', true);
    const counts = await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      return { memories: (await db.rawAll('memories')).length, content: (await db.rawAll('content')).filter((c) => c.origin === 'seed').length };
    });
    ok('setup: seed imported once (4 memories? example has 2)', counts.memories === 2 && counts.content === 4, JSON.stringify(counts));
    await page.getByRole('button', { name: 'Todo bien' }).click();
    await page.getByRole('button', { name: 'Ahora no' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar primera copia' }).click()]);
    const file = await download.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('setup: first backup downloads with the backup format', backup.format === 'aniversario-backup' && backup.schemaVersion === 2);
    ok('backup: excludes vault and errors', !('vault' in backup.stores) && !('errors' in backup.stores));
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByText('Un lugar solo de los dos').waitFor();
    await shot(page, 'story-390');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Empezar' }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
    ok('story: ends in Inicio', true);
    await page.waitForTimeout(300);
    await shot(page, 'inicio-390');
    // Names come from the store (seed), not from the repo
    const chip = await page.locator('.chip-appbar .profile-text').textContent();
    ok('profile: names come from the imported seed', chip === 'Ana', chip);
    ok('appbar: avatar shows the initial and the flower has no tile', (await page.locator('.chip-appbar .profile-initial').textContent()) === 'A' && (await page.locator('.appbar .flower').count()) === 1 && (await page.locator('.appbar .logo').count()) === 0);
    ok('setup flow: no console errors or native dialogs', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2. Navigation on the three sizes, Atrás, night theme ----------
  for (const [w, h] of [[390, 844], [820, 1180], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    const routes = await page.evaluate(async () => {
      const r = await import('./js/routes.js');
      return ['/inicio', '/capsula', '/cupones', '/cartas', '/mas', '/ajustes', '/ajustes/apariencia', '/ajustes/movimiento', '/ajustes/legal', '/ajustes/legal/privacidad', '/ajustes/acerca', '/ajustes/guia-estilo', '/ajustes/seguridad', '/ajustes/perfil', '/buscar', '/capsula/nuevo', '/calendario/dia/2025-03-14', '/no-existe',
        ...r.GROUPS.flatMap((g) => g.sections.map((s) => `/${s.id}`))];
    });
    let broken = [];
    for (const r of routes) {
      await page.evaluate((p) => { location.hash = `#${p}`; }, r);
      await page.waitForTimeout(120);
      const title = await page.locator('main h1').first().textContent().catch(() => null);
      if (!title) broken.push(r);
    }
    ok(`routes @${w}: every route renders a heading (${routes.length})`, broken.length === 0, broken.join(','));
    // Inicio: counter beside the ensō, the day's cards with buttons, Pensando en ti
    await page.evaluate(() => { location.hash = '#/inicio'; });
    await page.waitForSelector('.counter-card');
    const days = await page.evaluate(() => Number(document.querySelector('.counter-days').textContent.replace(/\D/g, '')));
    ok(`inicio @${w}: counter shows the days together`, days > 300, String(days));
    ok(`inicio @${w}: counter has a screen reader summary`, /días en total/.test(await page.locator('.counter-card p.sr-only').textContent()));
    const sec1 = await page.locator('.counter-clock').textContent();
    await page.waitForTimeout(1300);
    ok(`inicio @${w}: counter ticks every second`, sec1 !== (await page.locator('.counter-clock').textContent()));
    ok(`inicio @${w}: the ring says how long until the next anniversary`, /^(Faltan \d+ días para|Mañana cumplen|¡Hoy cumplen)/.test(await page.locator('.counter-goal').textContent()));
    const dash = await page.evaluate(() => { const a = document.querySelector('.counter-ring-arc'); return [Number(a.getAttribute('stroke-dashoffset')), Number(a.getAttribute('stroke-dasharray'))]; });
    ok(`inicio @${w}: the ring is partly filled`, dash[0] >= 0 && dash[0] < dash[1], dash.join('/'));
    ok(`inicio @${w}: the ring is an ensō brush stroke with a red seal`, (await page.locator('.counter-ring path[filter], .counter-ring svg filter#enso-ink').count()) >= 1 && (await page.locator('.counter-seal').count()) === 1);
    ok(`inicio @${w}: "Lo que viene" shows calendar pages`, (await page.locator('.coming-card .mekuri').count()) >= 1 && (await page.locator('.coming-card .mekuri .mekuri-num').first().textContent()).trim().length > 0);
    ok(`inicio @${w}: no Japanese inside the cards`, !(await page.$$eval('.home-card', (c) => c.some((x) => /[぀-ヿ一-龯]/.test(x.textContent)))));
    ok(`inicio @${w}: omikuji skips texts still to complete`, (await page.locator('.omikuji-text').textContent()) === 'Texto de ejemplo.');
    ok(`inicio @${w}: no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    ok(`inicio @${w}: the counter sits beside a small ensō`, await page.evaluate(() => { const r = document.querySelector('.counter-ring').getBoundingClientRect(); const g = document.querySelector('.counter-goal').getBoundingClientRect(); return r.width <= 160 && g.left > r.right - 4; }));
    ok(`inicio @${w}: "Lo que viene" rows show their date`, (await page.locator('.coming-card .mekuri-when').count()) >= 1);
    ok(`inicio @${w}: no sideways scroll for the day's cards`, (await page.locator('.home-carousel, .home-dot').count()) === 0 && (await page.locator('.home-day .home-slide').count()) === 3);
    if (w < 900) {
      const shown = () => page.$$eval('.home-slide', (s) => s.filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.className));
      ok(`inicio @${w}: one card at a time, "Pensando en ti" first`, (await shown()).length === 1 && /thinking-card/.test((await shown())[0]) && (await page.locator('.day-pick[aria-pressed="true"]').textContent()) === 'Pensando en ti');
      await page.locator('.day-pick').filter({ hasText: 'Razón' }).click();
      await page.waitForTimeout(150);
      ok(`inicio @${w}: a button switches the card`, (await shown()).length === 1 && /omikuji-card/.test((await shown())[0]));
      await page.locator('.day-pick').filter({ hasText: 'Pensando en ti' }).click();
    } else ok(`inicio @${w}: on wide screens the three cards share one row`, await page.evaluate(() => new Set([...document.querySelectorAll('.home-slide')].map((x) => Math.round(x.getBoundingClientRect().top))).size === 1) && !(await page.locator('.day-picks').isVisible()));
    await page.evaluate(() => { navigator.share = async () => {}; });
    await page.locator('.thinking-btn').click();
    await page.waitForFunction(() => /Hoy pensaste/.test(document.querySelector('.thinking-count').textContent));
    const sent = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('thinkingOfYou')).length);
    ok(`inicio @${w}: Pensando en ti saves the send and counts it`, sent === 1, String(sent));
    await shot(page, `inicio-day-${w}`);
    // Back button
    await page.evaluate(() => { location.hash = '#/mas'; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { location.hash = '#/ajustes'; });
    await page.waitForTimeout(100);
    await page.goBack();
    await page.waitForTimeout(150);
    ok(`back @${w}: Atrás returns to the previous view`, (await page.evaluate(() => location.hash)) === '#/mas');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(`layout @${w}: no horizontal scroll on Más`, !overflow);
    // Más: shoji doors, one per group; a door opens into its cards (#/mas/<group>)
    const doors = page.locator('.door');
    ok(`más @${w}: one door per group`, (await doors.count()) === 7 && (await doors.nth(1).getAttribute('aria-label')).startsWith('Recuerdos,'));
    await doors.nth(1).click();
    await page.waitForFunction(() => location.hash === '#/mas/recuerdos', null, { timeout: 3000 });
    await page.waitForTimeout(250);
    ok(`más @${w}: a door opens its group's cards`, (await page.textContent('.more-group-title')) === 'Recuerdos' && (await page.locator('.more-cards .section-card').count()) > 0);
    ok(`más @${w}: cards come with a description`, await page.locator('.more-cards .section-card-blurb').first().isVisible());
    await page.getByRole('button', { name: 'Volver' }).click();
    await page.waitForFunction(() => location.hash === '#/mas', null, { timeout: 3000 });
    await page.waitForTimeout(250);
    ok(`más @${w}: Volver goes back to the doors and keeps the focus on the one opened`, (await doors.count()) === 7 && (await page.evaluate(() => document.activeElement?.dataset?.group)) === 'recuerdos');
    await page.evaluate(() => { location.hash = '#/mas/juntos'; });
    await page.waitForTimeout(150);
    await page.goBack();
    await page.waitForTimeout(250);
    ok(`más @${w}: Atrás closes the open group`, (await page.evaluate(() => location.hash)) === '#/mas' && (await doors.count()) === 7);
    const groupIds = await page.$$eval('.door', (d) => d.map((x) => x.dataset.group));
    let momentListed = false;
    for (const id of groupIds) {
      await page.evaluate((g) => { location.hash = `#/mas/${g}`; }, id);
      await page.waitForTimeout(120);
      if (await page.$$eval('.section-card', (c) => c.some((x) => ['#/resumen', '#/capsula-tiempo', '#/eventos'].includes(x.getAttribute('href'))))) momentListed = true;
    }
    ok(`más @${w}: moments (Resumen, Cápsula del tiempo, Temporadas) are not listed`, groupIds.length === 7 && !momentListed);
    await page.evaluate(() => { location.hash = '#/mas'; });
    await page.waitForTimeout(150);
    ok(`nav @${w}: no Japanese under the bottom tabs`, (await page.$$eval('.tab .ja', (n) => n.length)) === 0);
    await page.waitForTimeout(300);
    await shot(page, `mas-${w}`);
    // nav type per size
    const vis = await page.evaluate(() => ({ tabbar: getComputedStyle(document.querySelector('.tabbar')).display !== 'none', rail: getComputedStyle(document.querySelector('.rail')).display !== 'none', railW: document.querySelector('.rail').getBoundingClientRect().width }));
    const expect = w < 768 ? vis.tabbar && !vis.rail : (w < 1100 ? !vis.tabbar && vis.rail && vis.railW < 100 : vis.rail && vis.railW > 200);
    ok(`nav @${w}: ${w < 768 ? 'bottom bar' : w < 1100 ? 'compact rail' : 'full sidebar'}`, expect, JSON.stringify(vis));
    // style guide in day and night
    await page.evaluate(() => { location.hash = '#/ajustes/guia-estilo'; });
    await page.waitForTimeout(300);
    await shot(page, `guia-day-${w}`);
    await page.evaluate(async () => { const t = await import('./js/core/theme.js'); t.apply({ theme: 'night' }); });
    await page.waitForTimeout(200);
    await shot(page, `guia-night-${w}`);
    await page.evaluate(() => { location.hash = '#/inicio'; });
    await page.waitForTimeout(300);
    await shot(page, `inicio-night-${w}`);
    ok(`console @${w}: no errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2a. Opening heart: first open of the day, then the short welcome; Ajustes can make it always ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.reload();
    await page.waitForSelector('.splash');
    ok('entrada: the first open of the day draws the heart of words', (await page.locator('.splash-intro').count()) === 1 && (await page.locator('.splash-intro canvas.splash-canvas').count()) === 1);
    await page.waitForSelector('.splash-intro.show', { timeout: 20000 }); // the petals take ~12 s before the welcome
    ok('entrada: after the heart the usual welcome shows', (await page.locator('.splash-intro.show .splash-for').isVisible()));
    ok('entrada: the branch, clouds and light are drawn behind it and the seal sits next to the name',
      (await page.locator('.splash-intro .intro-cloud').count()) === 5 && (await page.locator('.splash-intro .splash-for .intro-seal').count()) === 1);
    ok('entrada: the small "aishiteru" shows under 愛してる', (await page.locator('.splash-intro .splash-romaji').textContent()) === 'aishiteru');
    await page.locator('.splash').waitFor({ state: 'detached', timeout: 8000 });
    ok('entrada: it ends in Inicio, already drawn', (await page.locator('.counter-card').count()) === 1);
    await page.reload();
    await page.waitForSelector('.splash');
    ok('entrada: the next open the same day keeps the short welcome', (await page.locator('.splash-intro').count()) === 0);
    await page.locator('.splash').click();
    await page.locator('.splash').waitFor({ state: 'detached' });
    await page.evaluate(() => { location.hash = '#/ajustes/movimiento'; });
    await page.locator('label.segmented-option', { hasText: 'Siempre' }).click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector('.splash');
    ok('entrada: with "Siempre" in Ajustes it plays on every open', (await page.locator('.splash-intro').count()) === 1);
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.locator('.splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Ver la entrada' }).click();
    ok('entrada: "Ver la entrada" plays it on demand', (await page.locator('.splash-intro').count()) === 1);
    await page.locator('.splash').click();
    ok('entrada: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2b. Cápsula: add with photos and a video, validation, order, detail, quota, delete ----------
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { location.hash = '#/capsula'; });
    await page.waitForSelector('.timeline');
    ok(`cápsula @${w}: seed memories in the timeline and the undated one under Por completar`, (await page.locator('.timeline:not(.timeline-drafts) .tl-card').count()) === 1 && (await page.locator('.timeline-drafts .tl-card').count()) === 1);
    // A 12 MP photo and a small JPEG with EXIF orientation 6 (rotated 90°), made in the page.
    const files = await page.evaluate(async () => {
      const mk = async (cw, ch, type) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d'); x.fillStyle = '#c2405f'; x.fillRect(0, 0, cw / 2, ch); x.fillStyle = '#6b4e8c'; x.fillRect(cw / 2, 0, cw / 2, ch); return new Uint8Array(await (await new Promise((r) => c.toBlob(r, type, 0.9))).arrayBuffer()); };
      const big = await mk(4000, 3000, 'image/png');
      const jpg = await mk(400, 200, 'image/jpeg');
      const exif = [0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const rot = new Uint8Array(jpg.length + exif.length); rot.set(jpg.slice(0, 2)); rot.set(exif, 2); rot.set(jpg.slice(2), 2 + exif.length);
      const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
      return { big: b64(big), rot: b64(rot) };
    });
    await page.locator('.page-new').click();
    const ed = page.locator('.memory-editor');
    await ed.waitFor();
    await ed.getByRole('button', { name: 'Guardar recuerdo' }).click();
    ok(`cápsula @${w}: title and date are required with visible errors`, (await ed.locator('.field-error:not(:empty)').count()) === 2);
    await page.setInputFiles('.memory-editor input[type=file]', [
      { name: 'big.png', mimeType: 'image/png', buffer: Buffer.from(files.big, 'base64') },
      { name: 'rot.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(files.rot, 'base64') },
    ]);
    await page.waitForFunction(() => document.querySelectorAll('.photo-tile').length === 2, null, { timeout: 20000 });
    // Videos (decided 2026-11-19): up to 15 s; a longer one is refused with a clear reason.
    await page.setInputFiles('.memory-editor input[type=file]', [path.join(__dirname, 'fixtures/video-ficticio.webm'), path.join(__dirname, 'fixtures/video-largo-ficticio.webm')]);
    await page.waitForFunction(() => document.querySelectorAll('.photo-tile').length === 3 && /30 segundos/.test(document.querySelector('.photo-msg')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
    ok(`cápsula @${w}: a 3 s video is added and a 32 s one is refused (limit 15 s)`, (await ed.locator('.photo-tile video').count()) === 1 && /dura más de 15 segundos/.test(await ed.locator('.photo-msg').textContent()), await ed.locator('.photo-msg').textContent());
    await ed.getByLabel('Título').fill('Picnic en el parque');
    ok(`cápsula @${w}: the error goes away once the field is fixed`, (await ed.locator('.field-error:not(:empty)').count()) === 1);
    // A year ago today, so "Un día como hoy" finds it whatever day the suite runs.
    await ed.getByLabel('Fecha').fill(await page.evaluate(() => { const d = new Date(); return `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
    await ed.getByLabel('Nota (opcional)').fill('Llevamos fresas.\n\nLlovió al final.');
    // Storage full: the save fails with a clear message and keeps what was typed.
    await page.evaluate(() => {
      const orig = IDBObjectStore.prototype.put;
      window.__restorePut = () => { IDBObjectStore.prototype.put = orig; };
      IDBObjectStore.prototype.put = function put(...a) { if (this.name === 'media') throw new DOMException('full', 'QuotaExceededError'); return orig.apply(this, a); };
    });
    await ed.getByRole('button', { name: 'Guardar recuerdo' }).click();
    await page.waitForTimeout(300);
    ok(`cápsula @${w}: full storage is reported and the form stays`, /No queda espacio/.test(await ed.locator('.form-error').textContent()) && (await ed.getByLabel('Título').inputValue()) === 'Picnic en el parque');
    await page.evaluate(() => window.__restorePut());
    await ed.getByRole('button', { name: 'Guardar recuerdo' }).click();
    await ed.waitFor({ state: 'detached' });
    const media = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('media')).map((m) => ({ w: m.width, h: m.height, mime: m.mime, duration: m.duration })));
    ok(`cápsula @${w}: the 12 MP photo is stored at 1280 px or less as JPEG`, media.some((m) => m.w === 1280 && m.h === 960 && m.mime === 'image/jpeg'), JSON.stringify(media));
    ok(`cápsula @${w}: EXIF orientation is applied (400x200 rotated to 200x400)`, media.some((m) => m.w === 200 && m.h === 400), JSON.stringify(media));
    ok(`cápsula @${w}: the video is stored as it came, with its length`, media.some((m) => m.mime === 'video/webm' && m.duration > 2 && m.duration < 4), JSON.stringify(media));
    ok(`cápsula @${w}: only the saved photos and video remain after the failed try`, media.length === 3, String(media.length));
    ok(`cápsula @${w}: Un día como hoy shows the memory from a year ago`, /Picnic/.test(await page.locator('.otd-card').textContent()));
    ok(`cápsula @${w}: a memory with photos is a shikishi with a seal; the year is a hanko and the month is marked`, (await page.locator('.tl-shikishi', { hasText: 'Picnic' }).locator('.tl-seal').count()) === 1 && (await page.locator('.tl-hanko', { hasText: String(new Date().getFullYear() - 1) }).count()) === 1 && (await page.locator('.tl-month', { hasText: 'Noviembre' }).count()) === 1);
    ok(`cápsula @${w}: a memory without photos is a compact row with its icon`, (await page.locator('.timeline:not(.timeline-drafts) .tl-ema .tl-ema-icon').count()) >= 1);
    ok(`cápsula @${w}: memory rows stay compact (110 px or less)`, (await page.locator('.timeline .tl-card').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().height)))) <= 110);
    const firstTitle = () => page.locator('.timeline:not(.timeline-drafts) .tl-title').first().textContent();
    ok(`cápsula @${w}: oldest on top by default`, (await firstTitle()) === 'Título');
    await page.getByRole('button', { name: 'Ver lo más reciente' }).click();
    ok(`cápsula @${w}: "Ver lo más reciente" puts the newest first`, (await firstTitle()) === 'Picnic en el parque');
    await page.getByRole('button', { name: 'Ver desde el inicio' }).click();
    await page.getByRole('button', { name: 'Ver lo más reciente' }).click();
    await page.locator('.timeline .tl-card', { hasText: 'Picnic' }).click();
    await page.waitForSelector('.memory-detail .carousel');
    await page.waitForFunction(() => document.querySelectorAll('.memory-detail .carousel-slide :is(img, video)').length === 3).catch(() => {});
    ok(`cápsula @${w}: detail shows a carousel with both photos and the video with its controls`, (await page.locator('.memory-detail .carousel-slide').count()) === 3 && (await page.locator('.memory-detail .carousel-slide video[controls]').count()) === 1);
    ok(`cápsula @${w}: ${w < 1100 ? 'detail opens as its own page' : 'detail opens in the side panel next to the list'}`, w < 1100 ? (await page.locator('.timeline').count()) === 0 : (await page.locator('.capsula-split .timeline-wrap').count()) === 1 && (await page.locator('.capsula-detail .memory-title').textContent()) === 'Picnic en el parque');
    ok(`cápsula @${w}: no horizontal scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await shot(page, `capsula-detail-${w}`);
    await page.locator('.memory-detail').getByRole('button', { name: 'Borrar' }).click();
    await page.getByRole('dialog', { name: '¿Borrar este recuerdo?' }).getByRole('button', { name: 'Borrar' }).click();
    await page.waitForFunction(() => !document.querySelector('.tl-card[href*="capsula/"]') || ![...document.querySelectorAll('.tl-title')].some((t) => t.textContent === 'Picnic en el parque'));
    const left = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('media')).length);
    ok(`cápsula @${w}: deleting a memory asks first and removes its photos and video`, left === 0, String(left));
    ok(`cápsula @${w}: memories from the initial data have no Borrar`, (await page.evaluate(async () => { location.hash = '#/capsula/seed%3Amemory%3Ainicio'; await new Promise((r) => setTimeout(r, 300)); return document.querySelectorAll('.memory-detail button').length && ![...document.querySelectorAll('.memory-detail button')].some((b) => b.textContent.includes('Borrar')); })));
    ok(`cápsula @${w}: no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2c. Cuponera: redeem with confirmation and hanko, persist, reset, create for the other ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      await db.put('content', { id: 't:c1', kind: 'coupon', title: 'Un masaje de 30 minutos', from: 'david', to: 'sofia' });
      await db.put('content', { id: 't:c2', kind: 'coupon', title: 'Cupón vencido', from: 'david', to: 'sofia', expiresOn: '2020-01-01' });
    });
    await page.evaluate(() => { location.hash = '#/cupones'; });
    await page.waitForSelector('.kippu');
    ok('cupones: seed and own coupons for Ana are listed in "Para ti"', (await page.locator('.kippu').count()) === 3);
    ok('cupones: an expired coupon cannot be redeemed', (await page.locator('.kippu.is-expired button', { hasText: 'Canjear' }).count()) === 0 && /Venció/.test(await page.locator('.kippu.is-expired').textContent()));
    const masaje = page.locator('.kippu', { hasText: 'masaje' });
    await masaje.getByRole('button', { name: 'Canjear' }).click();
    await page.getByRole('dialog', { name: '¿Canjear este cupón?' }).getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForTimeout(250);
    ok('cupones: cancelling the confirmation leaves it unused', (await masaje.getByRole('button', { name: 'Canjear' }).count()) === 1);
    await masaje.getByRole('button', { name: 'Canjear' }).click();
    await page.getByRole('dialog', { name: '¿Canjear este cupón?' }).getByRole('button', { name: 'Canjear' }).click();
    await page.waitForSelector('.kippu.is-redeemed .hanko');
    const status = await page.locator('.kippu.is-redeemed .kippu-meta').textContent();
    ok('cupones: redeeming stamps the hanko and saves "Canjeado el ..." in es-CO', /^Canjeado el \d{1,2} de [a-z]+ de \d{4} a las /.test(status.trim()), status);
    await page.waitForFunction(() => !document.querySelector('.kippu.is-redeemed'), null, { timeout: 4000 });
    ok('cupones: after its stamp, the used coupon leaves "Para ti"', (await page.locator('.kippu').count()) === 2);
    await page.reload();
    await page.waitForSelector('.kippu');
    const tab = (name) => page.locator('.cupones-tabs label.segmented-option', { hasText: name }).click();
    await tab('Historial');
    await page.waitForTimeout(250);
    ok('cupones: the redeemed state persists after reload, under "Los que usaste"', (await page.locator('.kippu.is-redeemed').count()) === 1 && /Los que usaste/.test(await page.locator('.cupones-body').textContent()));
    await page.getByRole('button', { name: 'Reiniciar cupones' }).click();
    await page.getByRole('dialog', { name: '¿Reiniciar los cupones?' }).getByRole('button', { name: 'Reiniciar' }).click();
    await page.waitForTimeout(400);
    await tab('Para ti');
    await page.waitForTimeout(250);
    ok('cupones: reset makes them all unused again', (await page.locator('.kippu.is-redeemed').count()) === 0 && (await page.locator('.kippu').count()) === 3);
    await page.locator('.page-new').click();
    await page.locator('.coupon-editor').getByRole('button', { name: 'Guardar', exact: true }).click();
    ok('cupones: a new coupon needs what it is for', (await page.locator('.coupon-editor .field-error:not(:empty)').count()) === 1);
    await page.locator('.coupon-editor').getByLabel('Vale por').fill('Un desayuno en la cama');
    await page.locator('.coupon-editor').getByLabel('Dedicatoria (opcional)').fill('Porque sí.');
    await page.locator('.coupon-editor').getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.waitForTimeout(400);
    ok('cupones: a saved coupon shows in "Guardados", for Leo', /Guardados \(1\)/.test(await page.locator('.cupones-tabs').textContent()) && /para Leo/i.test(await page.locator('.kippu').first().textContent()) && (await page.locator('.kippu').count()) === 1);
    const stored = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('content', { filter: (c) => c.kind === 'coupon' && c.origin === 'user' && c.title === 'Un desayuno en la cama' }))[0]);
    ok('cupones: it is stored from Ana to Leo with the dedication, not given yet', stored?.from === 'sofia' && stored?.to === 'david' && stored?.dedication === 'Porque sí.' && stored?.sentAt === null);
    await page.locator('.kippu-main').first().click();
    const sheet = page.locator('.coupon-detail');
    await sheet.waitFor();
    ok('cupones: tapping a ticket opens its detail with the dedication and actions', /Porque sí/.test(await sheet.textContent()) && (await sheet.getByRole('button', { name: 'Editar' }).count()) === 1 && (await sheet.getByRole('button', { name: 'Regalar' }).count()) === 1);
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
    const leoSees = () => page.evaluate(async () => {
      const { query } = await import('./js/core/db.js');
      return (await query('content', { filter: (c) => c.kind === 'coupon' && c.title === 'Un desayuno en la cama' && c.sentAt !== null })).length;
    });
    ok('cupones: a saved coupon is not given yet', (await leoSees()) === 0);
    await page.locator('.kippu', { hasText: 'desayuno' }).getByRole('button', { name: /Regalar/ }).click();
    await page.getByRole('dialog', { name: '¿Regalar este cupón?' }).getByRole('button', { name: 'Regalar' }).click();
    await page.waitForTimeout(400);
    ok('cupones: "Regalar" moves it to "Historial > Los que regalaste"', (await leoSees()) === 1 && /Los que regalaste/.test(await page.locator('.cupones-body').textContent()) && (await page.locator('.kippu', { hasText: 'desayuno' }).count()) === 1);
    ok('cupones: no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await shot(page, 'cupones-390');
    ok('cupones: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2d. Cartas: open with Esc and focus return, opened state, Escribimos draft -> sealed ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      for (const [i, l] of ['Ábreme cuando tengas un día pesado', 'Ábreme cuando necesites reír'].entries()) await db.put('content', { id: `t:l${i}`, kind: 'letter', label: l, text: 'Hola.\n\nTexto ficticio de prueba.' });
    });
    await page.evaluate(() => { location.hash = '#/cartas'; });
    await page.waitForSelector('.futo');
    ok('cartas: envelopes for Ana, the one still to complete stays hidden', (await page.locator('.futo').count()) === 2);
    ok('cartas: ribbon counts the letters still to open', /Te quedan 2 cartas por abrir/.test(await page.locator('.ribbon').textContent()));
    await page.locator('.futo', { hasText: 'necesites reír' }).click();
    await page.getByRole('dialog', { name: 'Ábreme cuando necesites reír' }).waitFor();
    ok('cartas: the letter opens on washi paper with its paragraphs', (await page.locator('.washi p').count()) >= 3);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    ok('cartas: Esc closes it and focus goes back to the envelope', await page.evaluate(() => !document.querySelector('[role="dialog"]') && document.activeElement.classList.contains('futo') && document.activeElement.textContent.includes('necesites reír')));
    const st = await page.locator('.futo.is-opened').getAttribute('aria-label');
    const short = (await page.locator('.futo.is-opened .futo-status').textContent()).trim();
    ok('cartas: the opened envelope says "Abierta el {fecha} a las {hora}" and shows the short date', /Abierta el \d{1,2} de [a-z]+ de \d{4} a las /.test(st) && /^Abierta el \d{1,2} [a-z]+\.?$/.test(short), `${st} | ${short}`);
    await page.reload();
    await page.waitForSelector('.futo');
    ok('cartas: the opened state persists', (await page.locator('.futo.is-opened').count()) === 1 && /1 carta por abrir/.test(await page.locator('.ribbon').textContent()));
    await page.locator('.segmented-option', { hasText: 'Escribimos' }).click();
    await page.locator('.page-new').click();
    const ed = page.locator('.letter-editor');
    await ed.getByRole('button', { name: 'Guardar borrador' }).click();
    ok('cartas: condition and text are required', (await ed.locator('.field-error:not(:empty)').count()) === 2);
    await ed.getByLabel('Ábreme cuando…').fill('veas la luna llena');
    await ed.getByLabel('La carta').fill('Mira hacia arriba.\n\nYo también la estoy viendo.');
    await ed.getByRole('button', { name: 'Guardar borrador' }).click();
    await page.waitForSelector('.own-letter.status-draft');
    const draftForLeo = await page.evaluate(async () => { const p = await import('./js/core/profile.js'); const db = await import('./js/core/db.js'); p.setActive('david'); const n = (await db.query('letters', { filter: (l) => !l.letterId })).length; p.setActive('sofia'); return n; });
    ok('cartas: a draft is "Solo yo" (Leo does not see it)', draftForLeo === 0);
    // Estampillas on the envelope (decided 2026-11-19, option A)
    await page.locator('.own-letter').getByRole('button', { name: 'Decorar sobre' }).click();
    const deco = page.locator('.sticker-editor');
    await deco.getByRole('button', { name: 'Poner: Flor de sakura' }).click();
    await deco.getByRole('button', { name: 'Poner: Gatito siamés' }).click();
    ok('stickers: tapping the tray puts stickers on the envelope', (await deco.locator('.sticker-board .sticker').count()) === 2);
    const sb = await deco.locator('.sticker-board .sticker').last().boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 70, sb.y + sb.height / 2 + 10, { steps: 6 }); await page.mouse.up();
    const sa = await deco.locator('.sticker-board .sticker').last().boundingBox();
    ok('stickers: a sticker can be dragged anywhere on the envelope', sa.x - sb.x > 50, `${sb.x} -> ${sa.x}`);
    await deco.getByRole('button', { name: 'Girar a la derecha' }).click();
    await deco.getByRole('button', { name: 'Más grande' }).click();
    await deco.locator('.sticker-board .sticker').first().focus();
    await page.keyboard.press('ArrowDown');
    await deco.getByRole('button', { name: 'Guardar el sobre' }).click();
    await page.waitForSelector('.own-letter.status-draft');
    const saved = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('letters', { filter: (l) => !l.letterId }))[0]?.stickers || []);
    ok('stickers: saved with the draft (kind, place, turn and size; arrows move it)', saved.length === 2 && saved[1].k === 'milu' && saved[1].r === 7 && saved[1].s === 1.15 && saved[0].y > 0.3, JSON.stringify(saved));
    ok('stickers: the draft says how many it has', /2 estampillas/.test(await page.locator('.own-letter').textContent()));
    await page.waitForSelector('.own-letter.status-draft');
    ok('cartas: a draft is a loose sheet "on the table" with a few lines of the letter', /Sobre la mesa/.test(await page.locator('.cartas-section').textContent()) && /Mira hacia arriba/.test(await page.locator('.draft-sheet .draft-lines').textContent()));
    ok('cartas: "Escribir carta" shows only once', (await page.getByRole('button', { name: /Escribir (una )?carta/ }).count()) === 1);
    await page.locator('.own-letter').getByRole('button', { name: 'Meter al sobre' }).click();
    await page.getByRole('dialog', { name: '¿Sellar esta carta?' }).getByRole('button', { name: 'Sellar' }).click();
    await page.waitForSelector('.own-letter.status-sealed');
    ok('cartas: a sealed letter goes "En camino" as an envelope and can no longer be edited', (await page.locator('.cartas-group', { hasText: 'En camino' }).locator('.futo-sent', { hasText: 'veas la luna llena' }).count()) === 1 && (await page.locator('.draft-sheet').count()) === 0);
    await page.locator('.futo-sent', { hasText: 'veas la luna llena' }).click();
    const sentDlg = page.getByRole('dialog', { name: 'Ábreme cuando veas la luna llena' });
    ok('cartas: tapping a sent envelope shows the letter, with no way to edit it', /Yo también la estoy viendo/.test(await sentDlg.textContent()) && (await sentDlg.getByRole('button', { name: /Editar|Seguir/ }).count()) === 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(async () => (await import('./js/core/profile.js')).setActive('david'));
    await page.waitForTimeout(400);
    await page.locator('.segmented-option', { hasText: 'Para ti' }).click();
    ok('cartas: Leo receives the sealed letter in "Para ti"', (await page.locator('.futo', { hasText: 'veas la luna llena' }).count()) === 1);
    ok('stickers: the sealed envelope arrives with its stickers', (await page.locator('.futo', { hasText: 'veas la luna llena' }).locator('.futo-stickers .sticker').count()) === 2);
    await page.locator('.segmented-option', { hasText: 'Escribimos' }).click();
    const sent = await page.locator('.cartas-group', { hasText: 'Leídas' }).locator('.futo-sent', { hasText: 'necesites reír' }).textContent();
    ok('cartas: on Leo\'s profile the initial letters show by status ("Leídas" once Ana opened them)', /Abierta el/.test(sent) && (await page.locator('.cartas-group', { hasText: 'En camino' }).locator('.futo-sent', { hasText: 'día pesado' }).count()) === 1, sent);
    ok('cartas: no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await shot(page, 'cartas-390');
    ok('cartas: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2e. Own stickers: from a sticker without background, from a photo (frame and background removal), album, share target ----------
  {
    const FIX = path.join(__dirname, 'fixtures');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { location.hash = '#/cartas'; });
    await page.locator('.segmented-option', { hasText: 'Escribimos' }).click();
    await page.locator('.page-new').click();
    const ed = page.locator('.letter-editor');
    await ed.getByLabel('Ábreme cuando…').fill('quieras reír');
    await ed.getByLabel('La carta').fill('Texto ficticio.');
    await ed.getByRole('button', { name: 'Guardar borrador' }).click();
    await page.waitForSelector('.own-letter.status-draft');
    await page.locator('.own-letter').getByRole('button', { name: 'Decorar sobre' }).click();
    const deco = page.locator('.sticker-editor');
    await deco.waitFor();
    await deco.locator('input[type=file]').setInputFiles(path.join(FIX, 'sticker-ficticio.png'));
    const mk = page.locator('.sticker-maker');
    await mk.waitFor();
    ok('own stickers: an image without background keeps its shape', /ya no tiene fondo/.test(await mk.locator('.maker-status').textContent()) && (await mk.locator('.segmented-input[value="forma"]').isChecked()));
    await mk.getByLabel('Nombre (opcional)').fill('Carita');
    await mk.getByRole('button', { name: 'Guardar estampilla' }).click();
    await page.waitForFunction(() => !document.querySelector('.sticker-maker'));
    ok('own stickers: saved in the album and placed on the envelope', (await deco.getByRole('button', { name: 'Poner: Carita' }).count()) === 1 && (await deco.locator('.sticker-board .sticker img').count()) === 1);
    await deco.locator('input[type=file]').setInputFiles(path.join(FIX, 'foto-ficticia.jpg'));
    await mk.waitFor();
    ok('own stickers: a photo starts in a frame', await mk.locator('.segmented-input[value="circulo"]').isChecked());
    await mk.locator('.segmented-option', { hasText: 'Sin fondo' }).click();
    await page.waitForFunction(() => /Listo|No pudimos/.test(document.querySelector('.maker-status')?.textContent || ''), null, { timeout: 120000 });
    const cut = await page.evaluate(() => {
      const c = document.querySelector('.maker-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 10) clear++;
      const mid = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3];
      return { clear: clear / (d.length / 4), mid };
    });
    ok('own stickers: "Sin fondo" removes the background on the device and keeps the subject', /Listo/.test(await mk.locator('.maker-status').textContent()) && cut.clear > 0.3 && cut.mid > 200, JSON.stringify(cut));
    await mk.getByRole('button', { name: 'Guardar estampilla' }).click();
    await page.waitForFunction(() => !document.querySelector('.sticker-maker'));
    await deco.getByRole('button', { name: 'Guardar el sobre' }).click();
    await page.waitForSelector('.own-letter.status-draft');
    const st = await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const l = (await db.query('letters', { filter: (x) => !x.letterId }))[0];
      const album = await db.query('lists', { index: 'kind', range: IDBKeyRange.only('sticker') });
      const media = await Promise.all(album.map((a) => db.getMedia(a.mediaId)));
      return { k: (l.stickers || []).map((s) => s.k), album: album.length, types: media.map((m) => m?.type) };
    });
    ok('own stickers: the letter keeps them and the album holds two images', st.k.length === 2 && st.k.every((k) => k.startsWith('c:')) && st.album === 2 && st.types.every((t) => /image\/(webp|png)/.test(t)), JSON.stringify(st));
    const models = await page.waitForFunction(async () => (await (await caches.open('modelos-v1')).keys()).length >= 3, null, { timeout: 8000 }).then(() => 3, async () => page.evaluate(async () => (await (await caches.open('modelos-v1')).keys()).length));
    ok('own stickers: the background remover stays cached for next time', models >= 3, String(models));
    // delete from the album
    await page.locator('.own-letter').getByRole('button', { name: 'Decorar sobre' }).click();
    await deco.getByRole('button', { name: 'Editar' }).click();
    await deco.getByRole('button', { name: 'Borrar del álbum: Carita' }).click({ force: true });
    await page.getByRole('dialog', { name: '¿Borrar esta estampilla?' }).getByRole('button', { name: 'Borrar' }).click();
    await page.waitForTimeout(400);
    ok('own stickers: deleting one takes it out of the album and off the envelope', (await deco.locator('[aria-label="Tus estampillas"] .sticker-pick:not(.sticker-new)').count()) === 1 && (await deco.locator('.sticker-board .sticker').count()) === 1);
    await deco.getByRole('button', { name: 'Cancelar' }).click();
    // Cartas > Estampillas: the album always in view
    await page.locator('.segmented-option', { hasText: 'Estampillas' }).click();
    const alb = page.locator('.sticker-album');
    await alb.waitFor();
    ok('estampillas tab: shows the album (1 own + Crear) and the 12 of the set', (await alb.locator('[aria-label="Sus estampillas"] .sticker-pick:not(.sticker-new)').count()) === 1
      && (await alb.locator('[aria-label="Sus estampillas"] .sticker-new').count()) === 1 && (await alb.locator('[aria-label="Estampillas del set"] .sticker-pick').count()) === 12);
    await alb.getByRole('button', { name: 'Decorar un sobre' }).click();
    await page.locator('.sticker-editor').waitFor();
    ok('estampillas tab: "Decorar un sobre" opens the newest draft in Escribimos', (await page.locator('.segmented-input[value="write"]').isChecked()));
    await page.locator('.sticker-editor').getByRole('button', { name: 'Cancelar' }).click();
    await page.locator('.segmented-option', { hasText: 'Escribimos' }).click();
    // "Compartir > Aishiteru" with an image
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    await page.evaluate(() => {
      const f = document.createElement('form'); f.method = 'POST'; f.action = './compartir'; f.enctype = 'multipart/form-data';
      const i = document.createElement('input'); i.type = 'file'; i.name = 'image'; i.id = 'share-test'; f.append(i); document.body.append(f);
    });
    await page.setInputFiles('#share-test', path.join(FIX, 'sticker-ficticio.png'));
    await page.evaluate(() => document.querySelector('#share-test').form.submit());
    const shared = await page.waitForSelector('.sticker-maker', { timeout: 15000 }).then(() => true, () => false);
    ok('own stickers: an image shared to the app opens "Nueva estampilla"', shared && /#\/cartas$/.test(page.url()), page.url());
    ok('own stickers: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2e. Ajustes: Centro de seguridad and Copia de seguridad ----------
  {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aishiteru-'));
    const pinIn = async (page, label, v) => { const i = page.getByLabel(label, { exact: true }); await i.waitFor(); await i.fill(v); await page.waitForTimeout(300); };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    // a private record with no PIN yet, and a memory that only exists in the backup
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      await db.put('memories', { id: 'test:priv', date: '2026-02-02', title: 'PRIVADO-DE-PRUEBA', mediaIds: [], private: true });
      await db.put('memories', { id: 'test:shared', date: '2026-03-03', title: 'Recuerdo de la copia', mediaIds: [] });
    });
    await page.evaluate(() => { location.hash = '#/ajustes/copia'; });
    await page.getByRole('switch', { name: /Incluir lo privado/ }).check();
    await page.getByLabel('Contraseña de la copia').fill('clave-ficticia-1');
    await page.getByLabel('Repite la contraseña').fill('otra-cosa');
    await page.getByRole('button', { name: 'Descargar copia' }).click();
    ok('copia: the backup password must be typed twice the same', (await page.locator('.field-error', { hasText: 'No coinciden' }).count()) === 1);
    await page.getByLabel('Repite la contraseña').fill('clave-ficticia-1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia' }).click()]);
    const file = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(file);
    const json = fs.readFileSync(file, 'utf8');
    ok('copia: the private part travels encrypted with the password', !json.includes('PRIVADO-DE-PRUEBA') && json.includes('"privateBlob":{') && json.includes('Recuerdo de la copia'));
    await page.waitForTimeout(300);
    ok('copia: "Última copia" shows today', /hoy/.test(await page.locator('.status-row').first().textContent()));
    // corrupt and newer-version files are rejected without touching anything
    const before = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('memories')).length);
    fs.writeFileSync(path.join(tmp, 'roto.json'), '{"format":"aniversario-backup", "schemaVersion": 1, "stores": {"memories": [{"id": 5}]}}');
    fs.writeFileSync(path.join(tmp, 'nueva.json'), JSON.stringify({ format: 'aniversario-backup', schemaVersion: 99, stores: {} }));
    fs.writeFileSync(path.join(tmp, 'texto.json'), 'esto no es json');
    const rejected = [];
    for (const f of ['roto.json', 'nueva.json', 'texto.json']) {
      await page.setInputFiles('#backup-file', path.join(tmp, f));
      await page.locator('.note-error').waitFor();
      rejected.push(await page.locator('.note-error p').first().textContent());
    }
    const after = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('memories')).length);
    ok('copia: corrupt, newer-version and non-JSON files are rejected without changes', before === after && /identificador/.test(rejected[0]) && /más nueva/.test(rejected[1]) && /JSON/.test(rejected[2]), rejected.join(' | '));

    // --- Centro de seguridad on the same phone ---
    await page.evaluate(() => { location.hash = '#/ajustes/seguridad'; });
    await page.getByRole('button', { name: 'Crear PIN de la app' }).click();
    await pinIn(page, 'Nuevo PIN de 4 números', '1357');
    await pinIn(page, 'Repite el PIN', '1357');
    await page.getByRole('button', { name: 'Cambiar PIN', exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    ok('seguridad: creating the app PIN turns on the lock at open', /Pide el PIN al abrir/.test(await page.locator('.status-row').first().textContent()));
    const enc = await page.evaluate(async () => JSON.stringify(await (await import('./js/core/db.js')).rawGet('memories', 'test:priv')));
    ok('seguridad: the private record becomes encrypted when the PIN is created', !enc.includes('PRIVADO-DE-PRUEBA') && enc.includes('"enc"'));
    await page.getByRole('button', { name: 'Cambiar PIN', exact: true }).click();
    await pinIn(page, 'PIN', '0000');
    ok('seguridad: changing the PIN rejects a wrong current PIN', /incorrecto/.test(await page.locator('.pin-msg').textContent()));
    await pinIn(page, 'PIN', '1357');
    await pinIn(page, 'PIN nuevo de 4 números', '8642');
    await pinIn(page, 'Repite el PIN nuevo', '8642');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 15000 });
    const pins = await page.evaluate(async () => { const s = await import('./js/core/security.js'); return [await s.unlock('app', '8642'), await s.unlock('app', '1357')]; });
    ok('seguridad: after the change the new PIN works and the old one does not', pins[0] === null && /incorrecto/.test(pins[1] || ''), JSON.stringify(pins));
    await page.locator('.segmented-option').filter({ hasText: /^5 min$/ }).click();
    await page.waitForTimeout(300);
    ok('seguridad: inactivity lock is saved', (await page.evaluate(async () => (await (await import('./js/core/security.js')).getSettings()).autoLockSeconds)) === 300);
    await page.getByRole('switch', { name: /Borrar todo tras/ }).click();
    await page.getByRole('dialog', { name: '¿Activar el borrado automático?' }).getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForTimeout(300);
    ok('seguridad: auto-wipe asks first and stays off when cancelled', !(await page.getByRole('switch', { name: /Borrar todo tras/ }).isChecked())
      && !(await page.evaluate(async () => (await (await import('./js/core/security.js')).getSettings()).wipeAfterFailures)));
    await page.getByRole('button', { name: 'Borrar Recuerdos de la Cápsula' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await pinIn(page, 'PIN', '8642');
    await page.locator('.wipe-row', { hasText: 'Recuerdos' }).filter({ hasText: 'Nada que borrar' }).waitFor({ timeout: 10000 });
    ok('seguridad: delete by section (with PIN) empties the Cápsula', (await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('memories')).length)) === 0);
    ok('seguridad + copia: no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await shot(page, 'seguridad-390');
    ok('seguridad + copia: no console errors', errors.length === 0, errors.join(' | '));

    // --- import on "the other phone": password, summary, combine ---
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await ctx2.newPage();
    const errors2 = watch(p2);
    await completeSetup(p2);
    await p2.evaluate(() => { location.hash = '#/ajustes/copia'; });
    await p2.setInputFiles('#backup-file', file);
    await p2.getByLabel('Contraseña de esta copia').fill('equivocada');
    await p2.getByRole('button', { name: 'Abrir lo privado' }).click();
    await p2.locator('.field-error', { hasText: 'no abre' }).waitFor();
    ok('import: a wrong backup password is rejected', true);
    await p2.getByLabel('Contraseña de esta copia').fill('clave-ficticia-1');
    await p2.getByRole('button', { name: 'Abrir lo privado' }).click();
    await p2.locator('.summary-table').waitFor();
    const rec = await p2.locator('.summary-table tr', { hasText: 'Recuerdos' }).textContent();
    ok('import: the summary shows what is new before applying', /Recuerdos\s*2/.test(rec.replace(/\s+/g, ' ')), rec);
    await p2.getByRole('button', { name: 'Combinar ahora' }).click();
    await p2.locator('.note-card', { hasText: 'se combinó' }).waitFor();
    const titles = await p2.evaluate(async () => (await (await import('./js/core/db.js')).query('memories')).map((m) => m.title));
    ok('import: combine brings the shared and the private memory', titles.includes('Recuerdo de la copia') && titles.includes('PRIVADO-DE-PRUEBA'), titles.join(', '));
    await shot(p2, 'copia-1440');
    ok('import: no console errors', errors2.length === 0, errors2.join(' | '));

    // --- Borrar todo ---
    await p2.evaluate(() => { location.hash = '#/ajustes/seguridad'; });
    await p2.getByRole('button', { name: 'Borrar todo', exact: true }).click();
    await p2.getByLabel('Escribe BORRAR para confirmar').fill('borra');
    await p2.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click();
    ok('borrar todo: needs the exact word', (await p2.locator('.field-error', { hasText: 'BORRAR' }).count()) === 1);
    await p2.evaluate(() => localStorage.setItem('aishiteru.capsula.order', 'asc'));
    await p2.getByLabel('Escribe BORRAR para confirmar').fill('BORRAR');
    await Promise.all([p2.waitForEvent('load'), p2.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click()]);
    await p2.getByRole('button', { name: 'Empezar' }).waitFor({ timeout: 10000 });
    // The theme cache is written again on start; everything else of the app must be gone.
    const left = await p2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('aishiteru.') && k !== 'aishiteru.theme'));
    ok('borrar todo: back to the setup with no local keys left', (await p2.evaluate(() => location.hash)) === '#/setup' && left.length === 0, left.join(','));
    await ctx2.close();
    await ctx.close();
  }

  // ---------- 2f. Perfil y datos: names reflect at once, dates, milestones, short texts, reset ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { location.hash = '#/ajustes/perfil'; });
    await page.locator('.segmented-option', { hasText: 'Nosotros' }).click();
    const first = page.locator('.perfil-people .card').first();
    await first.getByLabel('Nombre corto').fill('');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    ok('perfil: a short name is required', (await first.locator('.field-error', { hasText: 'Escribe un nombre' }).count()) === 1);
    await first.getByLabel('Nombre corto').fill('Anita');
    await first.getByLabel('Apodo (opcional)').fill('Sol');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForFunction(() => document.querySelector('.profile-chip .profile-text')?.textContent === 'Anita');
    ok('perfil: a new name shows at once in the app bar', true);
    await page.locator('.perfil-people .card').nth(1).getByLabel('Nombre corto').fill('Leito');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForTimeout(500);
    const nameOn = async (hash, name) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(700); return (await page.locator('main').innerText()).includes(name); };
    const seen = { inicio: await nameOn('#/inicio', 'Leito'), cartas: await nameOn('#/cartas', 'Leito') };
    ok('perfil: new names show in Inicio and Cartas without reloading', Object.values(seen).every(Boolean), JSON.stringify(seen));
    await page.reload();
    const welcome = await page.locator('.splash-for').textContent({ timeout: 5000 }).catch(() => '');
    ok('perfil: the welcome screen uses the new nickname', welcome.includes('Sol'), welcome);
    await page.locator('.splash').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { location.hash = '#/ajustes/perfil'; }); await page.locator('.perfil-people').waitFor().catch(() => {});
    const fill = await page.evaluate(async () => (await import('./js/core/profile.js')).fill('Buenos días, {apodo}.', 'sofia'));
    ok('perfil: the nickname is used in the texts', fill === 'Buenos días, Sol.', fill);
    await page.locator('.segmented-option', { hasText: 'Fechas' }).click();
    await page.getByRole('button', { name: 'Agregar' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre', { exact: true }).fill('Día ficticio');
    await dlg.getByLabel('Fecha', { exact: true }).fill('2025-12-24');
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.edit-row', { hasText: 'Día ficticio' }).waitFor();
    ok('perfil: a special date is added and listed by month', /24 de diciembre de 2025/.test(await page.locator('.edit-row').last().textContent()));
    await page.locator('.segmented-option', { hasText: 'Hitos' }).click();
    await page.getByRole('button', { name: 'Agregar' }).click();
    await dlg.getByLabel('Días juntos').fill('42');
    await dlg.getByLabel('Mensaje').fill('Mensaje ficticio de 42 días.');
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.edit-row', { hasText: '42 días' }).waitFor();
    ok('perfil: a milestone is added and the reset appears', (await page.getByRole('button', { name: 'Restablecer los hitos originales' }).count()) === 1);
    await page.getByRole('button', { name: 'Restablecer los hitos originales' }).click();
    await dlg.getByRole('button', { name: 'Restablecer' }).click();
    await page.waitForFunction(() => !document.body.textContent.includes('42 días'));
    ok('perfil: milestones go back to the originals', true);
    await page.locator('.segmented-option', { hasText: 'Textos' }).click();
    await page.selectOption('#perfil-list', 'goodMorning');
    await page.locator('.edit-row').first().waitFor();
    await page.locator('.edit-row').first().getByRole('button', { name: /^Ocultar/ }).click();
    await page.locator('.edit-row.is-hidden').waitFor();
    await page.locator('.edit-row').nth(1).getByRole('button', { name: /^Editar/ }).click();
    await dlg.getByLabel('Saludo').fill('Saludo ficticio editado.');
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.edit-row', { hasText: 'Saludo ficticio editado.' }).waitFor();
    const st = await page.evaluate(async () => {
      const db = await import('./js/core/db.js'); const seed = await import('./js/core/seed.js'); const { CONFIG } = await import('./js/config.js');
      const shown = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('goodMorning') })).map((r) => r.id);
      await seed.syncConfig(CONFIG); // a CONFIG update must not undo the edit
      const edited = (await db.rawGet('content', 'cfg:goodMorning:002')).text;
      return { hiddenOut: !shown.includes('cfg:goodMorning:001'), edited };
    });
    ok('perfil: hidden texts leave the app and edits survive a CONFIG update', st.hiddenOut && st.edited === 'Saludo ficticio editado.', JSON.stringify(st));
    await page.getByRole('button', { name: 'Restablecer los textos originales' }).click();
    await dlg.getByRole('button', { name: 'Restablecer' }).click();
    await page.waitForFunction(() => !document.querySelector('.edit-row.is-hidden'));
    const back = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawGet('content', 'cfg:goodMorning:002')));
    ok('perfil: "Restablecer" brings the original texts back', !back.userEdited && back.text !== 'Saludo ficticio editado.');
    ok('perfil: no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await shot(page, 'perfil-1440');
    ok('perfil: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2g. Privacidad, Modo sin terceros and Legal y ayuda ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { location.hash = '#/ajustes'; });
    await page.locator('.list .list-row').first().waitFor();
    ok('ajustes: every page is built (no "Pronto" left)', (await page.locator('.list .badge').count()) === 0);
    await page.evaluate(() => { location.hash = '#/ajustes/terceros'; });
    await page.getByRole('switch', { name: /Modo sin terceros/ }).check();
    await page.waitForTimeout(300);
    await page.reload();
    await page.getByRole('button', { name: 'Saltar' }).click().catch(() => {});
    await page.getByRole('switch', { name: /Modo sin terceros/ }).waitFor();
    ok('terceros: the switch persists and the app reads it', (await page.getByRole('switch', { name: /Modo sin terceros/ }).isChecked())
      && !(await page.evaluate(async () => (await import('./js/core/security.js')).thirdPartyAllowed())));
    await page.evaluate(() => { location.hash = '#/ajustes/privacidad'; });
    await page.locator('.status-row').first().waitFor();
    ok('privacidad: uses the names of the data, not fixed ones', /Lo decide Ana\..*Visible para Leo/.test(await page.locator('main').textContent()));
    await page.evaluate(() => { location.hash = '#/ajustes/legal/privacidad'; });
    await page.locator('.legal-doc h2').first().waitFor();
    ok('legal: the privacy policy is written, with subtitles and lists', (await page.locator('.legal-doc h2').count()) >= 4 && (await page.locator('.legal-doc li').count()) >= 3);
    await page.getByRole('button', { name: 'Editar el texto' }).click();
    await page.getByRole('dialog').getByLabel('Texto').fill('Texto ficticio editado.');
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.legal-doc', { hasText: 'Texto ficticio editado.' }).waitFor();
    await page.getByRole('button', { name: 'Restaurar el texto original' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurar' }).click();
    await page.waitForFunction(() => !document.querySelector('.legal-doc').textContent.includes('Texto ficticio editado.'));
    ok('legal: a text can be edited in the app and restored', (await page.locator('.legal-doc h2').count()) >= 4);
    await page.evaluate(() => { location.hash = '#/ajustes/legal/version'; });
    await page.getByRole('button', { name: 'Copiar reporte técnico' }).click();
    await page.waitForTimeout(400);
    const rep = await page.evaluate(() => navigator.clipboard.readText());
    ok('legal: the technical report is copied without personal data', /Versión: \d/.test(rep) && !/Ana|Leo|Ficticio|Texto de ejemplo/.test(rep), rep.split('\n')[1]);
    ok('privacidad + legal: no horizontal scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    ok('privacidad + legal: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2h. Buscar: accents, privacy, sealed letters, links, entry points ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js'); const profile = await import('./js/core/profile.js');
      const me = profile.active(); const other = profile.partnerOf(me);
      await db.put('memories', { id: 't:m1', title: 'Café en la Candelaria', note: 'Pedimos chocolate con queso.', date: '2026-06-14', visibility: 'shared', owner: me, mediaIds: [] });
      await db.put('memories', { id: 't:m2', title: 'Cafe secreto', note: '', visibility: 'self', private: true, owner: me, mediaIds: [] });
      await db.put('letters', { id: 't:l1', author: other, to: me, condition: 'llueva', body: 'Texto escondido', signature: 'X', status: 'sealed', visibility: 'shared', owner: 'both' });
      await db.put('letters', { id: 't:l2', author: other, to: me, condition: 'quieras un café', body: 'Leída, con montaña', signature: 'X', status: 'opened', openedAt: '2026-07-01T10:00:00Z', visibility: 'shared', owner: 'both' });
      await db.put('content', { id: 't:c9', kind: 'coupon', title: 'Un café con postre', from: other, to: me, origin: 'user' });
    });
    await page.locator('.appbar .search-btn').click();
    await page.locator('#search-q').waitFor();
    await page.waitForTimeout(300);
    ok('buscar: the app bar button opens it with the cursor in the box', (await page.evaluate(() => document.activeElement?.id)) === 'search-q');
    const query = async (q) => { await page.fill('#search-q', q); await page.waitForTimeout(400); return page.locator('.search-hit').allTextContents(); };
    let hits = await query('CAFE');
    ok('buscar: no accents or case needed, grouped by kind', hits.length === 3 && (await page.locator('.search-group').count()) === 3, hits.join(' | '));
    ok('buscar: the match is highlighted', (await page.locator('.search-hit mark').count()) >= 3);
    ok('buscar: "Solo yo" is never found', !(await query('secreto')).length);
    ok('buscar: an unopened letter keeps its text hidden', !(await query('escondido')).length);
    hits = await query('llueva');
    ok('buscar: an unopened letter is found by its title, marked as sealed', hits.length === 1 && hits[0].includes('Carta sin abrir'));
    ok('buscar: an opened letter is searchable by its text', (await query('montana')).length === 1);
    ok('buscar: one letter asks for more', (await query('c')).length === 0 && (await page.locator('.search-status').textContent()).includes('al menos 2'));
    await query('zzzz');
    ok('buscar: no results shows a friendly empty state', (await page.locator('.search-results .empty-state, .search-results [class*="empty"]').count()) > 0);
    await page.keyboard.press('Escape');
    ok('buscar: Esc clears the box', (await page.inputValue('#search-q')) === '');
    await query('candelaria');
    await page.locator('.search-hit').first().click();
    await page.waitForFunction(() => location.hash.startsWith('#/capsula/'));
    ok('buscar: a memory result opens that memory', true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE + '#/inicio'); await page.waitForTimeout(400);
    await page.keyboard.press('/');
    await page.locator('#search-q').waitFor();
    ok('buscar: "/" opens it and the rail marks Buscar only', (await page.locator('.rail [aria-current="page"]').count()) === 1 && (await page.locator('.rail [data-tab="buscar"][aria-current="page"]').count()) === 1);
    ok('buscar: no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    ok('buscar: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 2i. Leaving the app locks what is private and covers the screen; backup reminder at 14 days ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    const r = await page.evaluate(async () => {
      const security = await import('./js/core/security.js'); const profile = await import('./js/core/profile.js');
      const scope = `person:${profile.active()}`;
      await security.createPin(scope, '2580');
      await security.unlock(scope, '2580').catch(() => {});
      const before = security.isUnlocked(scope);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((ok) => setTimeout(ok, 300));
      return { before, after: security.isUnlocked(scope), curtain: !!document.querySelector('.curtain') };
    });
    ok('leave lock: going to another app locks the personal PIN space and shows the curtain', r.before && !r.after && r.curtain, JSON.stringify(r));
    const card = async (days) => {
      await page.evaluate(async (d) => {
        delete document.visibilityState;
        const db = await import('./js/core/db.js');
        await db.setMeta({ lastBackupAt: new Date(Date.now() - d * 86400000).toISOString() });
      }, days);
      await page.reload();
      await page.locator('.home-card').first().waitFor();
      return page.locator('.backup-card').count();
    };
    ok('backup reminder: hidden 13 days after the last copy', (await card(13)) === 0);
    ok('backup reminder: shown 15 days after the last copy', (await card(15)) === 1);
    ok('leave lock and reminder: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 3. Modal + keyboard + Atrás closes modal first ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await completeSetup(page);
    await page.evaluate(() => { location.hash = '#/ajustes/guia-estilo'; });
    await page.getByRole('button', { name: 'Modal', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    ok('modal: focus moves into the dialog', await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok('modal: Esc closes and returns focus to the opener', await page.evaluate(() => !document.querySelector('[role="dialog"]') && document.activeElement.textContent === 'Modal'));
    await page.getByRole('button', { name: 'Modal', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.goBack();
    await page.waitForTimeout(300);
    ok('modal: Atrás closes the modal without leaving the view', await page.evaluate(() => !document.querySelector('[role="dialog"]') && location.hash === '#/ajustes/guia-estilo'));
    await page.keyboard.press('?');
    ok('shortcuts: "?" opens the list', await page.getByRole('dialog', { name: 'Atajos de teclado' }).isVisible());
    await page.keyboard.press('Escape');
    // closing a modal steps history back; let that finish before the next shortcut
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.waitForTimeout(600);
    await page.keyboard.press('2');
    await page.waitForTimeout(400);
    ok('shortcuts: "2" opens Cápsula', (await page.evaluate(() => location.hash)) === '#/capsula');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok('panic: Esc twice covers the app', await page.locator('.panic').isVisible());
    await page.locator('.panic-back').click();
    await page.waitForTimeout(200);
    ok('panic: without app PIN, one tap returns', !(await page.locator('.panic').count()));
    ok('modal/keyboard: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 4. App PIN: lock at open, wrong PIN, encryption of private records ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Empezar' }).click();
    await page.getByRole('button', { name: /Sofía/ }).click();
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    await page.getByRole('button', { name: 'Todo bien' }).click();
    await page.getByRole('button', { name: 'Crear PIN' }).click();
    ok('pin: the pad has exactly 4 digits', (await page.locator('.pin-dot').count()) === 4);
    for (const pass of [0, 1]) { // 4 digits submit on their own
      for (const d of '2468') await page.locator('.pin-key', { hasText: d }).click();
      await page.waitForTimeout(pass ? 2500 : 400);
    }
    await page.getByRole('button', { name: 'Terminar' }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
    // a private record gets encrypted at rest
    const stored = await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      await db.put('memories', { id: 'test:private', date: '2026-01-01', title: 'SECRETO-DE-PRUEBA', note: 'x', mediaIds: [], private: true });
      const raw = await db.rawGet('memories', 'test:private');
      return JSON.stringify(raw);
    });
    ok('crypto: a private record is stored encrypted (title not readable)', !stored.includes('SECRETO-DE-PRUEBA') && stored.includes('"enc"'));
    await page.reload();
    await page.locator('.lock-full').waitFor();
    ok('app lock: asks for the PIN when the app opens', true);
    await shot(page, 'lock-390');
    ok('app lock: 4-digit pad', (await page.locator('.lock-full .pin-dot').count()) === 4);
    for (const d of '1111') await page.locator('.pin-key', { hasText: d }).click();
    await page.waitForTimeout(2500);
    ok('app lock: wrong PIN is rejected', (await page.locator('.pin-msg').textContent()).includes('incorrecto'));
    for (const d of '2468') await page.locator('.pin-key', { hasText: d }).click();
    await page.locator('.lock-full').waitFor({ state: 'detached', timeout: 10000 });
    const title = await page.evaluate(async () => (await (await import('./js/core/db.js')).get('memories', 'test:private')).title);
    ok('app lock: right PIN unlocks and decrypts', title === 'SECRETO-DE-PRUEBA');
    ok('pin flow: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---------- 5. "Solo yo": Sofía's record is invisible to David ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await completeSetup(page);
    const r = await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const profile = await import('./js/core/profile.js');
      profile.setActive('sofia');
      await db.put('personal', { id: 'test:self', owner: 'sofia', visibility: 'self', kind: 'note', title: 'Solo de Sofía', body: '' });
      const asSofia = (await db.query('personal')).length;
      profile.setActive('david');
      const asDavid = (await db.query('personal')).length;
      const get = await db.get('personal', 'test:self');
      return { asSofia, asDavid, get };
    });
    ok('visibility: "Solo yo" of Sofía is not shown or counted for David', r.asSofia === 1 && r.asDavid === 0 && r.get === null, JSON.stringify(r));
    await ctx.close();
  }

  // ---------- 6. Offline after first load ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await completeSetup(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await page.waitForTimeout(800);
    await ctx.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Saltar' }).click().catch(() => {});
    await page.evaluate(() => { location.hash = '#/ajustes/guia-estilo'; });
    await page.waitForTimeout(500);
    const h = await page.locator('main h1').first().textContent().catch(() => '');
    ok('offline: the app opens and navigates without network', h === 'Guía de estilo', h);
    await ctx.close();
  }

  // ---------- 7. Fase 3: Preguntas, Retos, Ánimo, Calendario with .ics, Fechas, Recordatorios ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', async (d) => { errs.push('dialog'); await d.dismiss(); });
    await completeSetup(page);
    const now = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dl = async (fn) => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); return fs.readFileSync(await d.path(), 'utf8'); };
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel); };

    await go('/preguntas', '.qa-card');
    await page.locator('.qa-form textarea').first().fill('Un café juntos');
    await page.getByRole('button', { name: 'Guardar respuesta' }).first().click();
    await page.waitForTimeout(400);
    ok('fase 3: question answered, partner face down', (await page.locator('.qa-face.is-up').count()) >= 1);
    await go('/retos', '.reto-card');
    await page.getByRole('button', { name: 'Marcar como cumplido' }).click();
    await page.waitForTimeout(500);
    ok('fase 3: weekly challenge done with seal', (await page.locator('.reto-card.is-done').count()) === 1);
    await go('/animo', '.mood-picker, .mood-pick, .animo');
    ok('fase 3: mood screen opens', (await page.locator('main h1').first().textContent()).includes('nimo'));

    await go('/calendario', '.cal-grid');
    ok('calendario: month grid and today', (await page.locator('.cal-cell:not(.is-empty)').count()) >= 28 && (await page.locator('.cal-cell.is-today').count()) === 1);
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    await page.getByLabel('Qué van a hacer').fill('Cena, sushi; y cine');
    await page.getByLabel('Fecha').fill(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3)));
    await page.getByLabel('Hora (opcional)').fill('19:30');
    await page.locator('label.segmented-option', { hasText: '1 hora antes' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(500);
    ok('calendario: new date shows on its day with a dot', (await page.locator('.cal-day .cal-event-title').count()) === 1 && (await page.locator('.cal-cell.is-selected .dot-cita').count()) === 1);
    const one = await dl(() => page.locator('.cal-day').getByRole('button', { name: 'Al teléfono' }).click());
    ok('calendario: .ics escapes text, keeps the time and adds the alarm', one.includes('SUMMARY:Cena\\, sushi\\; y cine') && /DTSTART:\d{8}T193000/.test(one) && one.includes('TRIGGER:-PT1H') && one.includes('\r\n'));
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    await page.getByLabel('Qué van a hacer').fill('Picnic');
    await page.getByLabel('Fecha').fill(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)));
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(500);
    await page.locator('.cal-day').getByRole('link', { name: 'Crear recuerdo' }).click();
    await page.waitForTimeout(800);
    ok('calendario: a past date becomes a prefilled memory', (await page.getByLabel('Título').inputValue()) === 'Picnic');
    await page.keyboard.press('Escape');

    await go('/fechas', '.fecha-card');
    ok('fechas: dates with countdown and age', (await page.locator('.fecha-card').count()) >= 3 && (await page.locator('.fecha-age').count()) >= 1);
    const f = await dl(() => page.getByRole('button', { name: 'Agregar todas al teléfono' }).click());
    ok('fechas: yearly .ics', (f.match(/RRULE:FREQ=YEARLY/g) || []).length >= 3);

    await go('/recordatorios', '.rem-card');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.getByLabel('Qué recordar').fill('Comprar flores');
    await page.getByLabel('Fecha').fill(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)));
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(500);
    const rem = await dl(() => page.getByRole('button', { name: 'Agregar al calendario del teléfono' }).click());
    ok('recordatorios: .ics with monthly rule and their own', rem.includes('FREQ=MONTHLY;BYMONTHDAY=') && rem.includes('Comprar flores'));
    await page.getByRole('switch', { name: /Recordatorios discretos/ }).check();
    await page.waitForTimeout(300);
    const rem2 = await dl(() => page.getByRole('button', { name: 'Agregar al calendario del teléfono' }).click());
    ok('recordatorios: discreet mode keeps the .ics neutral', !rem2.includes('Comprar flores') && rem2.includes('SUMMARY:Día especial'));
    await go('/inicio', '.counter-card, .home-card');
    await page.waitForTimeout(900);
    ok('inicio: "Para hoy" shows the reminder', (await page.locator('.today-row', { hasText: 'Mañana: comprar flores' }).count()) === 1);
    ok('fase 3: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---------- 8. Fase 4A: recuerdos y vínculo (fake microphone, fictitious data) ----------
  {
    const b2 = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const ctx = await b2.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ['microphone'] });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('dialog', async (d) => { errs.push('dialog'); await d.dismiss(); });
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(300); };
    const today = await page.evaluate(async () => (await import('./js/core/util.js')).localDay());

    // Pure rules
    const logic = await page.evaluate(async () => {
      const ins = await import('./js/features/insignias.js');
      const res = await import('./js/features/resumen.js');
      const ll = await import('./js/features/lenguajes.js');
      const map = await import('./js/features/mapa.js');
      const tc = await import('./js/features/capsula-tiempo.js');
      const s1 = ins.computeStreak(new Set(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20']), '2026-11-20');
      const s2 = ins.computeStreak(new Set(['2026-11-16', '2026-11-19', '2026-11-20']), '2026-11-20');
      const s3 = ins.computeStreak(new Set(['2026-11-18', '2026-11-19']), '2026-11-20');
      const sc = ll.score({ q1: 'tiempo', q2: 'tiempo', q3: 'actos' });
      const r = map.roundPosition(4.6097123, -74.0817456, 'city');
      return {
        grace: [s1.current, s1.graceDays.join()], twoEmpty: s2.current, todayPending: s3.current,
        dueMonth: res.periodDueOn('2026-11-29', '2026-05-02')?.id, dueStart: res.periodDueOn('2026-12-02', '2026-05-02')?.id,
        dueYear: res.periodDueOn('2027-01-03', '2026-05-02')?.id, dueWrapped: res.periodDueOn('2027-05-04', '2026-05-02')?.id, dueNone: res.periodDueOn('2026-11-15', '2026-05-02'),
        top: ll.top(sc), city: [r.lat, r.lng],
        tcClosed: tc.canOpen({ to: 'both', by: 'david', openAt: '2099-01-01' }, 'sofia'), tcOpen: tc.canOpen({ to: 'both', by: 'david', openAt: '2020-01-01' }, 'sofia'),
      };
    });
    ok('4A rules: streak forgives one empty day a week', logic.grace[0] === 4 && logic.grace[1] === '2026-11-18', JSON.stringify(logic.grace));
    ok('4A rules: two empty days in a row break the streak', logic.twoEmpty === 2, String(logic.twoEmpty));
    ok('4A rules: today without activity yet keeps the streak', logic.todayPending === 2, String(logic.todayPending));
    ok('4A rules: Resumen shows up at month end, year end and the anniversary', logic.dueMonth === 'm:2026-11' && logic.dueStart === 'm:2026-11' && logic.dueYear === 'y:2026' && logic.dueWrapped === 'w:1' && logic.dueNone === null, JSON.stringify(logic));
    ok('4A rules: love language top and city-level rounding', logic.top === 'tiempo' && logic.city[0] === 4.5 && logic.city[1] === -74, JSON.stringify(logic));
    ok('4A rules: a time capsule opens only on its day', !logic.tcClosed && logic.tcOpen);

    // Memory with photo and voice note -> Galería and viewer; a "Solo yo" one stays out
    const addMemory = async (title, { self = false, voice = false } = {}) => {
      await go('/capsula', '.page-new');
      await page.locator('.page-new').click();
      const ed = page.locator('.memory-editor');
      await page.setInputFiles('.memory-editor input[type=file]', path.join(__dirname, 'fixtures', 'foto-ficticia.jpg'));
      await page.waitForFunction(() => document.querySelectorAll('.memory-editor .photo-tile').length === 1, null, { timeout: 20000 });
      await ed.getByLabel('Título').fill(title);
      await ed.getByLabel('Fecha').fill(today);
      if (voice) {
        await ed.getByRole('button', { name: /Agregar una nota de voz/ }).click();
        await ed.locator('.rec-btn').click(); await page.waitForTimeout(1300); await ed.locator('.rec-btn').click();
        await ed.locator('.rec-status', { hasText: 'Grabación lista' }).waitFor();
      }
      if (self) {
        await ed.locator('label', { hasText: 'Solo yo' }).first().click();
        const later = page.getByRole('button', { name: 'Ahora no' });
        if (await later.isVisible({ timeout: 1500 }).catch(() => false)) await later.click();
        await page.waitForTimeout(300);
      }
      await ed.getByRole('button', { name: 'Guardar recuerdo' }).click();
      await ed.waitFor({ state: 'detached' });
    };
    await addMemory('Picnic ficticio', { voice: true });
    await addMemory('Secreto ficticio', { self: true });
    const mem = await page.evaluate(async () => { const { db } = await import('./js/core.js'); return (await db.query('memories')).filter((m) => /ficticio/.test(m.title)).map((m) => [m.title, !!m.voiceMediaId, m.visibility]); });
    ok('4A voz: a memory keeps its voice note', mem.some(([t, v]) => t === 'Picnic ficticio' && v), JSON.stringify(mem));
    await go('/galeria', '.gallery-tile');
    const tiles = await page.locator('.gallery-tile').count();
    ok('4A galería: shared photo shows, "Solo yo" does not', tiles === 1, `${tiles} tiles`);
    await page.locator('.gallery-tile').first().click();
    await page.waitForSelector('.viewer-media');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    ok('4A galería: viewer opens and Esc closes it', (await page.locator('.modal-viewer').count()) === 0);
    await go('/album', '.album-page, .mes-grid');
    ok('4A álbum: "Nuestro mes" calendar renders', (await page.locator('.mes-grid').count()) === 1);

    // Places, firsts, photobooth
    await go('/mapa', '.page-new');
    await page.locator('.page-new').click();
    await page.getByLabel('Nombre del lugar').fill('Café ficticio');
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(600);
    await page.locator('.section-tabs label', { hasText: 'Lista' }).click().catch(() => {});
    await page.waitForTimeout(400);
    ok('4A mapa: a place is saved and listed', (await page.locator('.place-name', { hasText: 'Café ficticio' }).count()) === 1);
    await go('/primeras-veces', '.first-progress');
    ok('4A primeras veces: progress and pages', (await page.locator('.first-progress').count()) === 1);
    await go('/photobooth', '.page-new');
    await page.locator('.page-new').click();
    await page.waitForSelector('.booth-studio');
    ok('4A photobooth: studio opens', true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // Time capsule: the form only allows tomorrow onwards (closed envelope); one from David that opens today -> Inicio notice -> open
    await go('/capsula-tiempo', '.page-new');
    await page.locator('.page-new').click();
    await page.getByLabel('Título').fill('Para mañana, ficticia');
    await page.getByLabel('Mensaje').fill('Mensaje cerrado');
    await page.getByLabel('Se abre el').fill(today);
    await page.getByRole('button', { name: 'Sellar' }).click(); await page.waitForTimeout(300);
    ok('4A cápsula del tiempo: today is not allowed as opening day', (await page.getByText('Elige un día a partir de mañana.').count()) === 1);
    await page.getByLabel('Se abre el').fill('2099-05-02');
    await page.getByRole('button', { name: 'Sellar' }).click(); await page.waitForTimeout(600);
    ok('4A cápsula del tiempo: a sealed envelope stays closed', (await page.locator('.tc-env-btn[disabled]', { hasText: 'Para mañana, ficticia' }).count()) === 1);
    await page.evaluate(async (d) => { const { db } = await import('./js/core.js'); await db.put('timeCapsules', { id: 'tc-ficticia', by: 'david', to: 'both', title: 'Para hoy, ficticia', text: 'Mensaje ficticio', mediaId: null, openAt: d, openedBy: [], visibility: 'shared', owner: 'both' }); }, today);
    await go('/inicio', '.home-card');
    await page.waitForTimeout(900);
    ok('4A cápsula del tiempo: Inicio says it opens today', (await page.locator('.today-row', { hasText: /cápsula del tiempo/ }).count()) === 1);
    await go('/capsula-tiempo', '.tc-env-btn');
    await page.locator('.tc-env-btn:not([disabled])').first().click();
    await page.waitForSelector('.tc-paper');
    ok('4A cápsula del tiempo: opens on its day', (await page.locator('.tc-paper', { hasText: 'Mensaje ficticio' }).count()) === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // Vínculo
    await go('/planes', '.ema');
    await page.locator('.ema-check input').first().click();
    await page.getByRole('button', { name: 'Marcar cumplido' }).click(); await page.waitForTimeout(600);
    ok('4A planes: a plan is marked done', (await page.locator('.ema.is-done').count()) >= 1);
    await go('/regalos', '.section-tabs');
    await page.locator('.section-tabs label', { hasText: 'Mi lista' }).click();
    await page.locator('.page-new').click();
    await page.getByLabel('¿Qué te gustaría?').fill('Libro ficticio');
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(600);
    ok('4A regalos: a wish is added to my list', (await page.locator('.gift', { hasText: 'Libro ficticio' }).count()) === 1);
    await go('/encuentro', '.page');
    await page.getByRole('button', { name: 'Poner la fecha' }).click();
    await page.getByLabel('Fecha').fill('2099-01-10');
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(600);
    ok('4A encuentro: countdown shows', /Faltan/.test(await page.locator('.meet-line').textContent()));
    await go('/lenguajes', '.page');
    await page.getByRole('button', { name: 'Responder el cuestionario' }).click();
    for (let k = 0; k < 10; k++) { await page.locator('.ll-opt').first().click(); await page.waitForTimeout(80); }
    await page.waitForSelector('.radar');
    ok('4A lenguajes: quiz ends with the chart', (await page.locator('.radar').count()) === 1);
    await go('/gratitud', '.jar-card');
    await page.getByRole('button', { name: 'Escribir una nota' }).click();
    await page.locator('.modal textarea').fill('Gracias, nota ficticia');
    await page.getByRole('button', { name: 'Echar al frasco' }).click(); await page.waitForTimeout(600);
    ok('4A gratitud: the note falls in the jar', (await page.locator('.jar-card strong').textContent()) === '1');
    await go('/citas', '.gacha-card');
    await page.getByRole('button', { name: 'Girar' }).click();
    await page.waitForSelector('.idea-card .idea-title', { timeout: 5000 });
    ok('4A citas: the gacha gives an idea', true);

    // Letter with a voice note: sealing takes it out of "Solo yo"
    await go('/cartas', '.page');
    await page.getByRole('button', { name: 'Escribir carta' }).click();
    const le = page.locator('.letter-editor');
    await le.locator('input').first().fill('me extrañes');
    await le.locator('textarea').fill('Carta ficticia con voz.');
    await le.getByRole('button', { name: /Agregar una nota de voz/ }).click();
    await le.locator('.rec-btn').click(); await page.waitForTimeout(1200); await le.locator('.rec-btn').click();
    await le.locator('.rec-status', { hasText: 'Grabación lista' }).waitFor();
    await le.getByRole('button', { name: 'Guardar borrador' }).click(); await le.waitFor({ state: 'detached' });
    const letter = await page.evaluate(async () => { const { db } = await import('./js/core.js'); const l = (await db.query('letters')).find((x) => x.body === 'Carta ficticia con voz.'); return l ? { v: !!l.voiceMediaId, d: l.voiceDuration, vis: l.visibility } : null; });
    ok('4A voz: a letter draft keeps its voice note', letter?.v && letter.d >= 1 && letter.vis === 'self', JSON.stringify(letter));

    // Racha e insignias, Resumen
    await go('/insignias', '.streak-card');
    ok('4A racha: today counts', /Hoy ya cuenta/.test(await page.locator('.streak-card').innerText()));
    const stamps = await page.locator('.ins-badge.is-on .ins-badge-name').allTextContents();
    ok('4A insignias: unlocked stamps in the showcase', stamps.includes('Primera gracia') && stamps.includes('Primer lugar'), stamps.join(', '));
    ok('4A insignias: locked ones show progress', (await page.locator('.ins-badge:not(.is-on) [role=progressbar]').count()) >= 3);
    await go('/resumen', '.resumen-tiles');
    await page.waitForSelector('.resumen-tile');
    const tilesText = (await page.locator('.resumen-tile').allInnerTexts()).join(' | ');
    ok('4A resumen: counts what they did this month', /Recuerdos\s*1\b/.test(tilesText) && /Gratitud/.test(tilesText) && /Lugares/.test(tilesText), tilesText);
    ok('4A resumen: "Solo yo" stays out', !/Recuerdos\s*2\b/.test(tilesText));
    await page.getByRole('button', { name: 'Ver las historias' }).click();
    await page.waitForSelector('.story-canvas');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
    const label = await page.locator('.story-canvas').getAttribute('aria-label');
    ok('4A resumen: stories move with the keyboard and read aloud', !!label && label.length > 3, label);
    const dl = await Promise.race([page.waitForEvent('download', { timeout: 6000 }).then((d) => d.suggestedFilename()), page.getByRole('button', { name: 'Compartir' }).click().then(() => new Promise(() => {}))]).catch(() => '');
    ok('4A resumen: a card exports as PNG', /\.png$/.test(dl), dl);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    if (SHOTS) await shot(page, 'fase4a-resumen-390');
    // v0.4.1: a heavy video is re-recorded lighter (1280 px, same length); a small one is kept as it came.
    const lv = await page.evaluate(async () => {
      const im = await import('./js/core/images.js');
      const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const x = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 12000000 });
      const ch = []; rec.ondataavailable = (e) => ch.push(e.data); rec.start(200);
      const t0 = Date.now();
      await new Promise((res) => { const f = () => { for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${Math.random() * 360},80%,50%)`; x.fillRect(Math.random() * 1920, Math.random() * 1080, 120, 90); } Date.now() - t0 < 3000 ? requestAnimationFrame(f) : res(); }; f(); });
      const done = new Promise((r) => { rec.onstop = r; }); rec.stop(); await done;
      const blob = new Blob(ch, { type: 'video/webm' });
      const out = await im.lightenVideo({ blob, duration: 3, width: 1920, height: 1080 });
      return { orig: blob.size, light: out.blob.size, w: out.width };
    });
    ok('4.0.1 videos: a heavy video comes out lighter and at 1280 px', lv.light < lv.orig * 0.7 && lv.w === 1280, JSON.stringify(lv));
    ok('fase 4A: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await b2.close();
  }

  // ---------- 9. Fase 4B: hogar, bienestar y finanzas (fictitious data) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('dialog', async (d) => { errs.push('dialog'); await d.dismiss(); });
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(300); };

    const logic = await page.evaluate(async () => {
      const L = await import('./js/features/listas.js');
      const G = await import('./js/features/gastos.js');
      const A = await import('./js/features/alcancia.js');
      const H = await import('./js/features/habitos.js');
      const R = await import('./js/features/rasca.js');
      const Rc = await import('./js/features/recetas.js');
      const M = await import('./js/features/mascotas.js');
      const C = await import('./js/features/ciclo.js');
      const merged = L.mergeItems([{ id: 'a', text: 'Tomates', done: false, order: 1 }], ['tomates ', 'Arroz', 'arroz', '']);
      const ex = [{ amountCOP: 40000, paidBy: 'sofia', split: { sofia: 50 } }, { amountCOP: 10000, paidBy: 'david', split: { sofia: 30 } }];
      const csv = G.toCSV([{ date: '2026-11-01', amountCOP: 1000, category: 'mercado', paidBy: 'sofia', split: { sofia: 50 }, note: 'a;b' }]);
      const checks = ['sofia', 'david'].flatMap((by) => ['2026-11-18', '2026-11-19'].map((date) => ({ habitId: 'h', date, by }))).concat([{ habitId: 'h', date: '2026-11-20', by: 'sofia' }]);
      const day = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const cyc = [];
      for (const st of ['2026-07-01', '2026-07-29', '2026-08-26', '2026-09-23']) for (let i = 0; i < 5; i++) cyc.push({ date: day(st, i), period: true, flow: 'medium' });
      const ps = C.periods(cyc);
      const pr = C.predict(ps, C.DEFAULTS, '2026-10-01');
      const irregular = C.stats(C.periods([...['2026-03-01', '2026-03-22', '2026-04-30', '2026-05-20'].map((d) => ({ date: d, period: true, flow: 'light' }))]));
      const nf = C.nextFertile(pr, '2026-10-01');
      const fert = ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12'].map((d) => C.fertilityOn(d, pr));
      return {
        fert,
        nf: [nf.ovulation, nf.from, nf.to],
        merged: [merged.added, merged.items.length], shares: G.shares({ amountCOP: 10001, split: { sofia: 50 } }), settle: G.settlement(ex), csvBom: csv.charCodeAt(0) === 0xFEFF, csvQuoted: csv.includes('"a;b"'),
        pct: A.pctOf({ targetCOP: 200000 }, 150000), mark: A.crossedMark(20, 55), both: [...H.bothDays(checks, 'h')].join(), plant: H.plantStage(0, 5),
        prize: R.pickPrize([{ id: 'p1' }, { id: 'p2' }], ['p1'], () => 0).id, cleared: R.clearedRatio(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]), 1),
        ing: Rc.parseIngredient('2 tazas de arroz'), step: Rc.parseStep('Hervir el arroz (15 min)'),
        dose: [M.doseStatus('2000-01-01'), M.doseStatus('2999-01-01'), M.doseStatus('')],
        periods: ps.length, lens: C.cycleLengths(ps).map((c) => c.length).join(), avg: pr.cycle, reliable: pr.reliable, next: pr.next, ov: pr.ahead[0].ovulation,
        phase: [C.phaseOf('2026-09-24', ps, 28), C.phaseOf('2026-10-07', ps, 28), C.phaseOf('2026-10-15', ps, 28)], irregular: irregular.reliable,
        ids: [C.dayId('2026-11-01', true), C.dayId('2026-11-01', false)],
      };
    });
    ok('4B listas: merging skips duplicates and empty lines', logic.merged[0] === 1 && logic.merged[1] === 2, JSON.stringify(logic.merged));
    ok('4B gastos: shares add up and the balance settles', logic.shares.sofia + logic.shares.david === 10001 && logic.settle?.from === 'david' && logic.settle.amount === 17000, JSON.stringify([logic.shares, logic.settle]));
    ok('4B gastos: CSV opens in Excel (BOM and quoted ";")', logic.csvBom && logic.csvQuoted);
    ok('4B alcancía: percent and the 25/50 marks', logic.pct === 75 && logic.mark === 50, JSON.stringify([logic.pct, logic.mark]));
    ok('4B hábitos: a day counts only when both marked', logic.both === '2026-11-18,2026-11-19', logic.both);
    ok('4B hábitos: the plant droops, never dies', logic.plant.droop && logic.plant.stage === 0);
    ok('4B rasca: no repeated prize and scratch ratio', logic.prize === 'p2' && logic.cleared === 0.5, JSON.stringify([logic.prize, logic.cleared]));
    ok('4B recetas: ingredient and step timer parsing', logic.ing.qty === '2' && logic.ing.text === 'arroz' && logic.step.timerSec === 900, JSON.stringify([logic.ing, logic.step]));
    ok('4B mascotas: dose status', logic.dose.join() === 'overdue,ok,none', logic.dose.join());
    ok('4B ciclo: periods, lengths and average', logic.periods === 4 && logic.lens === '28,28,28' && logic.avg === 28 && logic.reliable, JSON.stringify(logic));
    ok('4B ciclo: next start, ovulation 14 days before', logic.next === '2026-10-21' && logic.ov === '2026-10-07', `${logic.next} ${logic.ov}`);
    ok('4B ciclo: fertile window is 5 days before to 1 after ovulation', logic.nf.join() === '2026-10-07,2026-10-02,2026-10-08', logic.nf.join());
    ok('4B ciclo: fertility levels (low, fertile, most fertile)', logic.fert.join() === 'low,fertile,peak,peak,peak,fertile,low', logic.fert.join());
    ok('4B ciclo: phases', logic.phase.join() === 'menstrual,fertil,lutea', logic.phase.join());
    ok('4B ciclo: irregular cycles are not reliable', logic.irregular === false);
    ok('4B ciclo: the shared copy has its own id', logic.ids[0] === 'cycle:2026-11-01:v' && logic.ids[1] === 'cycle:2026-11-01');

    // Gastos UI: one expense 50/50, the balance line and "Ya quedamos parejos"
    await go('/gastos', '.page');
    await page.getByRole('button', { name: 'Anotar un gasto' }).click();
    await page.getByLabel('Monto', { exact: true }).fill('40000');
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(400);
    ok('4B gastos: balance after a 50/50 expense', /20\.000/.test(await page.locator('.balance-line').innerText()));
    await page.getByRole('button', { name: 'Ya quedamos parejos' }).click();
    await page.getByRole('button', { name: 'Anotar' }).click(); await page.waitForTimeout(400);
    ok('4B gastos: settled', /parejos/i.test(await page.locator('.balance-line').innerText()));

    // Ciclo: Sofía registers today, shares it; the private record stays hers; David sees only the shared one
    await go('/ciclo', '.cyc-today');
    await page.getByRole('button', { name: 'Registrar hoy' }).click(); // visible for him by default
    ok('4B ciclo: new records are visible for David by default', await page.locator('.modal .switch-row', { hasText: 'Visible para' }).locator('input').isChecked());
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Registro privado' }).click();
    await page.getByLabel('Nota (opcional)').fill('Nota privada ficticia');
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(400);
    if (SHOTS) await shot(page, 'fase4b-ciclo-390');
    const stored = await page.evaluate(async () => { const db = await import('./js/core/db.js'); return { days: (await db.rawAll('cycleDays')).map((r) => [r.id.endsWith(':v'), r.visibility]), priv: (await db.rawAll('intimateLog')).map((r) => r.visibility) }; });
    ok('4B ciclo: shared day is "shared", private record is "Solo yo"', stored.days.length === 1 && stored.days[0][0] && stored.days[0][1] === 'shared' && stored.priv.join() === 'self', JSON.stringify(stored));
    await go('/calendario', '.cal-grid');
    ok('4B calendario: Sofía sees the Ciclo and Privado layers', (await page.locator('.cal-layers .chip', { hasText: 'Ciclo' }).count()) === 1 && (await page.locator('.cal-layers .chip', { hasText: 'Privado' }).count()) === 1);
    if (SHOTS) await shot(page, 'fase4b-calendario-ciclo-390');
    await page.evaluate(async () => { (await import('./js/core/profile.js')).setActive('david'); });
    await go('/ciclo', '.page.ciclo .note-inline');
    const davidText = await page.locator('.page.ciclo').innerText();
    ok('4B ciclo: David sees only what was shared, read-only', davidText.includes('compartir contigo') && /entana fértil estimada/.test(davidText) && !davidText.includes('Nota privada ficticia') && (await page.locator('.page.ciclo .icon-btn[aria-label^="Borrar"]').count()) === 0 && !/Día \d+ del ciclo/.test(davidText) && /para acompañar a/i.test(davidText), davidText.slice(0, 160));
    await go('/calendario', '.cal-grid');
    ok('4B calendario: David has no Privado layer', (await page.locator('.cal-layers .chip', { hasText: 'Privado' }).count()) === 0);
    await page.evaluate(async () => { (await import('./js/core/profile.js')).setActive('sofia'); });
    // Un-sharing purges the shared copy (so it leaves the other phone too)
    await go('/ciclo', '.cyc-today');
    await page.getByRole('button', { name: 'Registrar hoy' }).click();
    await page.locator('.switch-label', { hasText: 'Visible para' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click(); await page.waitForTimeout(400);
    const after = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = await db.getMeta(); return { ids: (await db.rawAll('cycleDays')).map((r) => r.id), tomb: Object.keys(m.tombstones || {}).some((k) => k.startsWith('cycleDays:') && k.endsWith(':v')) }; });
    ok('4B ciclo: turning sharing off purges the shared copy', after.ids.length === 1 && !after.ids[0].endsWith(':v') && after.tomb, JSON.stringify(after));
    const excluded = await page.evaluate(async () => { const r = await import('./js/features/resumen.js'); const s = await r.stats({ from: '2000-01-01', to: '2999-12-31', kind: 'year' }); return JSON.stringify(s).includes('ficticia'); });
    ok('4B ciclo: never in the Resumen', !excluded);

    // Inicio: pet card with the days at home; hidden from Mascotas
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); await db.put('pets', { id: 'e2e-pet', name: 'Michi', species: 'gato', arrival: { y: 2026, m: 1, d: 1 }, visibility: 'shared', owner: 'both', createdAt: '2000-01-01T00:00:00Z' }); });
    await go('/inicio', '.pet-home-card');
    ok('4B inicio: pet card', /Michi/.test(await page.locator('.pet-home-card').innerText()));
    await page.getByRole('button', { name: /Ocultar la tarjeta de/ }).click(); await page.waitForTimeout(800);
    ok('4B inicio: pet card can be hidden', (await page.locator('.pet-home-card').count()) === 0);

    // Rasca y gana: a gift card is revealed without scratching
    await page.evaluate(async () => { const r = await import('./js/features/rasca.js'); await r.createCard({ to: 'sofia', from: 'david', origin: 'gift' }); });
    await go('/rasca', '.scratch-ticket');
    await page.locator('.scratch-ticket').first().click();
    await page.getByRole('button', { name: 'Revelar sin raspar' }).click(); await page.waitForTimeout(600);
    const scratched = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('scratchCards')).some((c) => c.scratchedAt));
    ok('4B rasca: "Revelar sin raspar" works', scratched);
    ok('fase 4B: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
