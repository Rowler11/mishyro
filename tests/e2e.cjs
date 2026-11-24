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
  await page.getByRole('link', { name: 'Empezar desde cero' }).click();
  await page.getByRole('button', { name: /Sofía/ }).click();
  await page.setInputFiles('#seed-file', SEED);
  await page.getByRole('button', { name: 'Importar' }).click();
  await page.getByRole('button', { name: 'Todo bien' }).click();
  await page.getByRole('button', { name: 'Ahora no' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Terminar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.waitForFunction(() => location.hash === '#/inicio');
  await exampleContent(page);
}

// Since v0.14.0 the seed file brings only names, dates and pets (clean start). Most checks below need
// some letters, coupons, reasons and memories, so the example ones are written straight to the DB.
async function exampleContent(page, { reload = true } = {}) {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  await page.evaluate(async (seed) => {
    const { upsertSeeded } = await import('./js/core/seed.js');
    await upsertSeeded('content', [
      ...(seed.reasons || []).map((r) => ({ id: r.id, kind: 'reason', text: r.text })),
      ...(seed.coupons || []).map((c) => ({ id: c.id, kind: 'coupon', title: c.title, description: c.description })),
      ...(seed.letters || []).map((l) => ({ id: l.id, kind: 'letter', label: l.label, text: l.text })),
    ], 'seed');
    await upsertSeeded('memories', (seed.memories || []).map((m) => ({ id: m.id, date: /^\d{4}-\d{2}-\d{2}$/.test(m.date || '') ? m.date : '', title: m.title, note: m.note, mediaIds: [], draft: !/^\d{4}-\d{2}-\d{2}$/.test(m.date || '') })), 'seed');
  }, seed);
  // Re-render Inicio without reloading (a reload would spend the first-open-of-the-day heart).
  if (reload) {
    await page.evaluate(() => { location.hash = '#/ajustes'; }); await page.waitForFunction(() => document.querySelector('main h1')?.textContent.includes('Ajustes'));
    await page.evaluate(() => { location.hash = '#/inicio'; }); await page.waitForSelector('.counter-card');
  }
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
    await page.getByRole('link', { name: 'Empezar desde cero' }).waitFor();
    await page.locator('.short-code').waitFor({ timeout: 15000 }).catch(() => {});
    ok('setup: first open on a PC shows only the QR and the short code', (await page.evaluate(() => location.hash)) === '#/unir' && (await page.locator('.qr-box').count()) === 1 && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(await page.locator('.short-code').innerText()) && (await page.getByText('¿Quién usa este dispositivo?').count()) === 0);
    await page.getByRole('link', { name: 'Empezar desde cero' }).click();
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
    ok('setup: clean start, the file brings no letters, coupons, reasons or memories', counts.memories === 0 && counts.content === 0, JSON.stringify(counts));
    await page.getByRole('button', { name: 'Todo bien' }).click();
    await page.getByRole('button', { name: 'Ahora no' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar primera copia' }).click()]);
    const file = await download.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('setup: first backup downloads with the backup format', backup.format === 'aniversario-backup' && backup.schemaVersion === 3);
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
    ok(`más @${w}: one door per group`, (await doors.count()) === 7 && (await doors.nth(1).innerText()).replace(/\s+/g, ' ').trim().startsWith('Recuerdos '));
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
    // Map tiles come from OpenStreetMap; the test sandbox has no internet, so those failed loads are not the app's.
    const appErrors = errors.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(e));
    ok(`console @${w}: no errors`, appErrors.length === 0, appErrors.join(' | '));
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
    ok(`cápsula @${w}: a new memory starts dated today (v0.13)`, (await ed.getByLabel('Fecha').inputValue()) === await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }));
    await ed.getByLabel('Fecha').fill('');
    await ed.getByRole('button', { name: 'Guardar recuerdo' }).click();
    ok(`cápsula @${w}: title (or a photo) and date are required with visible errors`, (await ed.locator('.field-error:not(:empty)').count()) === 2);
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
    await page.waitForSelector('.toast', { hasText: 'Papelera' }); // v0.10.0: the memory goes to the Papelera first
    await page.waitForFunction(() => /^#\/capsula$/.test(location.hash) || matchMedia('(min-width: 1100px)').matches);
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
    await page.waitForSelector('.cupones-tabs');
    ok('cupones: always opens on "Historial"', (await page.locator('.cupones-tabs input:checked').getAttribute('value')) === 'given');
    await page.locator('.cupones-tabs label.segmented-option', { hasText: 'Para ti' }).click();
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
    await page.waitForSelector('.cupones-tabs');
    const tab = (name) => page.locator('.cupones-tabs label.segmented-option', { hasText: name }).click();
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
    // Since v0.11.0 a letter "En camino" can still be edited until it is opened; it stays sealed.
    ok('cartas: tapping a sent envelope shows the letter, with "Editar" while unopened', /Yo también la estoy viendo/.test(await sentDlg.textContent()) && (await sentDlg.getByRole('button', { name: 'Editar', exact: true }).count()) === 1);
    await sentDlg.getByRole('button', { name: 'Editar', exact: true }).click();
    const sealedEd = page.getByRole('dialog', { name: 'Editar carta' });
    await sealedEd.getByLabel('La carta').fill('Yo también la estoy viendo, editada.');
    await sealedEd.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForTimeout(500);
    ok('cartas: editing a sealed letter keeps it sealed with the new text', (await page.evaluate(async () => { const db = await import('./js/core/db.js'); const l = (await db.rawAll('letters')).find((x) => /editada/.test(x.body || '')); return l?.status === 'sealed' && l.visibility === 'shared'; })));
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
    await p2.getByRole('link', { name: 'Empezar desde cero' }).waitFor({ timeout: 10000 });
    // The theme cache is written again on start; everything else of the app must be gone.
    const left = await p2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('aishiteru.') && k !== 'aishiteru.theme'));
    ok('borrar todo: back to the setup with no local keys left', /^#\/(setup|unir)$/.test(await p2.evaluate(() => location.hash)) && left.length === 0, left.join(','));
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
    await page.getByRole('link', { name: 'Empezar desde cero' }).click();
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
    await page.getByRole('button', { name: 'Continuar' }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Continuar' }).click();
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

  // ---------- 10. Fase 5A: juegos y eventos de temporada (fictitious data) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(BASE);
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(300); };
    const L = await page.evaluate(async () => {
      const K = await import('./js/features/juegos-kit.js');
      const M = await import('./js/features/juegos-mesa.js');
      const E = await import('./js/features/eventos.js');
      const { CONFIG } = await import('./js/config.js');
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      let used = []; const seen = [];
      for (let i = 0; i < 3; i++) { const r = K.nextFromBank(items, used); used = r.used; seen.push(r.item.id); }
      const wrap = K.nextFromBank(items, used);
      const wheelOk = [3, 6, 8, 12].every((n) => Array.from({ length: n }, (_, i) => K.wheelIndexAt(n, K.wheelTarget(n, i, 123)) === i && K.wheelTarget(n, i, 123) - 123 >= 5 * 360).every(Boolean));
      const ev = CONFIG.seasonalEvents;
      const amor = E.activeEvents(ev, new Date(2026, 8, 19)).map((a) => a.event.id);
      const amorWrong = E.activeEvents(ev, new Date(2026, 8, 12)).map((a) => a.event.id);
      const ctxE = { startDay: '2026-05-02' };
      const mes = E.activeEvents(ev, new Date(2026, 10, 2), ctxE).map((a) => a.period);
      const aniv = E.activeEvents(ev, new Date(2027, 4, 2), ctxE).map((a) => a.event.id);
      const mesEv = ev.find((e) => e.rule.type === 'monthly');
      const ch = [E.monthlyChallenge(mesEv, '2026-11'), E.monthlyChallenge(mesEv, '2026-12')];
      const trivia = M.buildTrivia({ start: '2026-05-02', people: { sofia: 'Ana', david: 'Leo' }, places: [{ name: 'Lugar A', date: '2026-06-01' }, { name: 'Lugar B', date: '2026-07-10' }] }, () => 0.3);
      const liga = M.ligaStats([
        { gameId: 'liga', winner: 'david', date: '2026-11-01', ligaType: 'Parqués' },
        { gameId: 'liga', winner: 'sofia', date: '2026-11-02', ligaType: 'Parqués' },
        { gameId: 'liga', winner: 'sofia', date: '2026-11-03', ligaType: 'UNO' },
        { gameId: 'liga', winner: 'sofia', date: '2026-10-03', ligaType: 'UNO', deleted: true }], '2026-11-20');
      return {
        noRepeat: new Set(seen).size === 3, wrapReset: wrap.reset && wrap.used.length === 1, wheelOk,
        pass: [K.passOutcome(0, 1), K.passOutcome(1, 1)].join(','), drink: [K.drinkAllowed({ drink: true, drinks: 2 }), K.drinkAllowed({ drink: true, drinks: 3 }), K.drinkAllowed({ drink: false })].join(','),
        adults: [K.adultsStatus(['1990-01-01', '1992-02-02']), K.adultsStatus(['1990-01-01', '']), K.adultsStatus(['1990-01-01', '2015-01-01'])].join(','),
        amor: amor.includes('cfg:event:amoryamistad') && !amorWrong.includes('cfg:event:amoryamistad'),
        mes, anivHasMes: aniv.some((id) => ev.find((e) => e.id === id)?.rule.type === 'monthly'), ch: !!ch[0] && ch[0] !== ch[1],
        trivia: trivia.length >= 3 && trivia.every((t) => t.options.includes(t.answer) && new Set(t.options).size === t.options.length),
        liga: `${liga.total}:${liga.wins.sofia}-${liga.wins.david}:${liga.crown}:${liga.streak.who}${liga.streak.n}`,
        noKanjiTiles: K.GAME_LIST.every((g) => !/[぀-ヿ一-鿿]/.test(g.title + g.blurb)),
        ready: K.GAME_LIST.filter((g) => g.ready).length,
      };
    });
    ok('5A bancos: no repeats until the bank runs out, then resets', L.noRepeat && L.wrapReset);
    ok('5A ruleta: the wheel always stops on the drawn segment', L.wheelOk);
    ok('5A pases: free while there are passes, then penalty', L.pass === 'free,penalty', L.pass);
    ok('5A bebida: off unless on, capped at 3', L.drink === 'true,false,false', L.drink);
    ok('5A bebida: adults check (yes / unknown / no)', L.adults === 'yes,unknown,no', L.adults);
    ok('5A eventos: Amor y Amistad is the 3rd Saturday of September', L.amor);
    ok('5A eventos: mesiversario monthly, not on the anniversary', L.mes.includes('2026-11') && !L.anivHasMes, JSON.stringify(L.mes));
    ok('5A eventos: mesiversario challenge rotates by month', L.ch);
    ok('5A trivia: questions with the answer among unique options', L.trivia);
    ok('5A liga: wins, month crown and streak (deleted ignored)', L.liga === '3:2-1:sofia:sofia2', L.liga);
    ok('5A sala: games ready and no Japanese letters on tiles', L.ready >= 12 && L.noKanjiTiles, String(L.ready));

    await go('/juegos', '.page.juegos');
    const room = await page.locator('.page.juegos').innerText();
    ok('5A sala: room renders without stray "null"', !/\bnull\b/.test(room));
    // Esto o aquello: one full round saved to history
    await go('/juegos/estooaquello', '.page');
    await page.getByRole('button', { name: 'Empezar' }).click(); await page.waitForTimeout(500);
    const both = page.getByRole('button', { name: /^Los dos:/ }).first();
    if (await both.count()) await both.click();
    await page.getByRole('button', { name: 'Terminar' }).click(); await page.waitForTimeout(400);
    const confirm = page.getByRole('button', { name: /^(Terminar|Sí, terminar)$/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await page.waitForTimeout(600);
    const saved = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('games')).filter((g) => g.gameId === 'estooaquello').length);
    ok('5A esto o aquello: a played game is saved to history', saved >= 1, String(saved));
    // Juntos: record minutes, counts in Resumen
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); await db.put('games', { id: 'e2e-juntos', gameId: 'juntos', minutes: 20, date: '2026-11-10', visibility: 'shared', owner: 'both', createdAt: '2026-11-10T00:00:00Z' }); });
    const st = await page.evaluate(async () => { const r = await import('./js/features/resumen.js'); return r.stats({ from: '2026-11-01', to: '2026-11-30', kind: 'month' }); });
    ok('5A resumen: together minutes counted apart from games', st.togetherMin >= 20, JSON.stringify({ g: st.games, t: st.togetherMin }));
    await go('/juegos/historial', '.page'); await go('/juegos/ajustes', '.page'); await go('/juegos/bancos', '.page');
    ok('5A bancos: editor lists the banks', (await page.locator('.page').innerText()).includes('Mímica'));
    await go('/eventos', '.page.eventos');
    ok('5A eventos: page renders with "Lo que viene"', /Lo que viene/.test(await page.locator('.page.eventos').innerText()));
    ok('fase 5A: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---------- 11. Fase 5B: los 13 juegos que faltaban (fictitious data) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(BASE);
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(350); };
    const btn = (name) => page.getByRole('button', { name, exact: true });
    const sheetBtn = (name) => page.locator('.overlay').last().getByRole('button', { name, exact: true });
    const as = async (who) => { await page.evaluate((w) => { localStorage.setItem('aishiteru.activeProfile', w); }, who); await page.reload(); await page.waitForSelector('.page', { timeout: 15000 }); };
    // pure helpers
    const L = await page.evaluate(async () => {
      const K = await import('./js/features/juegos-kit.js');
      const P = await import('./js/features/juegos-planes.js');
      const C = await import('./js/features/juegos-casa.js');
      const J = await import('./js/features/juegos-japon.js');
      const { CONFIG } = await import('./js/config.js');
      const g = (on) => Array.from({ length: 16 }, (_, i) => on.includes(i));
      const row = P.bingoLines(g([4, 5, 6, 7])); const col = P.bingoLines(g([1, 5, 9, 13])); const dia = P.bingoLines(g([0, 5, 10, 15])); const anti = P.bingoLines(g([3, 6, 9, 12]));
      const none = P.bingoLines(g([0, 1, 2, 4])); const full = P.bingoLines(g(Array.from({ length: 16 }, (_, i) => i)));
      const st = P.challengeStates('2026-11-01', { 1: { at: '2026-11-01' } }, '2026-11-03');
      const env = [{ unlock: 'time', at: '19:00' }, { unlock: 'step' }, { unlock: 'step' }];
      const e1 = C.envelopeStates(env, { date: '2026-11-21', now: new Date(2026, 10, 21, 18, 0) }).join();
      const e2 = C.envelopeStates(env, { date: '2026-11-21', now: new Date(2026, 10, 21, 19, 1) }).join();
      const e3 = C.envelopeStates(env, { date: '2026-11-21', opened: { 0: 'x' }, done: { 0: 'x' }, now: new Date(2026, 10, 21, 20, 0) }).join();
      const e4 = C.envelopeStates(env, { date: '2026-11-21', opened: { 0: 'x' }, now: new Date(2026, 10, 21, 20, 0) }).join();
      const words = CONFIG.japaneseWords;
      const days = Array.from({ length: words.length }, (_, i) => { const d = new Date(2026, 0, 1); d.setDate(d.getDate() + i); return J.wordOfDay(words, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`).id; });
      const rank = C.cataRanking([{ name: 'A', ratings: { sofia: { sabor: 2, textura: 2, aroma: 2 } } }, { name: 'B', ratings: { sofia: { sabor: 5, textura: 4, aroma: 5 } } }]);
      const ids = Object.values(CONFIG.games.banks).flat().map((x) => x.id).concat(words.map((w) => w.id));
      return {
        bingo: [row.count, col.count, dia.count, anti.count, none.count, full.full, full.count, row.full].join(','),
        reto: `${P.challengeDay('2026-11-01', '2026-11-03')}:${st.slice(0, 4).join('/')}`,
        env: [e1, e2, e3, e4].join(' | '),
        tana: [J.tanabataOpen('2026-07-01'), J.tanabataOpen('2026-07-07'), J.tanabataOpen('2026-07-08'), J.tanabataOpen('2026-06-30'), J.daysToTanabata('2026-06-30'), J.daysToTanabata('2026-07-08') > 300].join(','),
        wordsN: words.length, noRepeat: new Set(days).size === words.length, stable: J.wordOfDay(words, '2026-11-21').id === J.wordOfDay(words, '2026-11-21').id,
        wordsOk: words.every((w) => w.jp && w.romaji && w.es && w.cat),
        cata: `${rank[0].name}:${rank[0].avg}`, guess: [C.guessMatches('chocolate negro', 'Chocolate'), C.guessMatches('Maní', 'mani'), C.guessMatches('', 'x'), C.guessMatches('papas', 'galletas')].join(','),
        pts: [0, 2, 3, 4, 5, 6].map(C.recuerdoPoints).join(''), px: [C.pixelSize(0), C.pixelSize(6)].join(','),
        avg: P.avgStars({ sofia: { stars: 4 }, david: { stars: 5 } }),
        uniqueIds: new Set(ids).size === ids.length, ready: K.GAME_LIST.filter((x) => x.ready).length,
        seeded: K.seeded('x')() === K.seeded('x')(),
        banks: ['cocina', 'bingo', 'reto30', 'manga-sfx'].map((b) => CONFIG.games.banks[b].length).join(','),
        noKanjiTiles: K.GAME_LIST.every((x) => !/[぀-ヿ一-鿿]/.test(x.title + x.blurb)),
      };
    });
    ok('5B bingo: rows, columns, both diagonals and full card', L.bingo === '1,1,1,1,0,true,10,false', L.bingo);
    ok('5B 30 días: day number and day states', L.reto === '3:done/missed/today/future', L.reto);
    ok('5B cita misteriosa: envelopes open by time and by step', L.env === 'locked,locked,locked | ready,locked,locked | open,ready,locked | open,locked,locked', L.env);
    ok('5B tanabata: wishes from July 1 to 7 only', L.tana === 'true,true,false,false,1,true', L.tana);
    ok('5B palabra del día: no repeats until the list runs out, stable per day', L.noRepeat && L.stable && L.wordsOk && L.wordsN >= 120, String(L.wordsN));
    ok('5B cata: ranking by stars and forgiving guesses', L.cata === 'B:4.7' && L.guess === 'true,true,false,false', `${L.cata} ${L.guess}`);
    ok('5B recuerdo: earlier guesses score more; pixels shrink to sharp', L.pts === '332211' && L.px === '56,1', `${L.pts} ${L.px}`);
    ok('5B cine: average of the reviews', L.avg === 4.5, String(L.avg));
    ok('5B bancos: every bank id is unique and banks are filled', L.uniqueIds && L.banks === '18,45,36,22', L.banks);
    ok('5B sala: all 25 games ready, no Japanese letters on tiles', L.ready === 25 && L.noKanjiTiles, String(L.ready));

    await go('/juegos', '.page.juegos');
    ok('5B sala: no "Pronto" left in the room', (await page.locator('.soon-pill').count()) === 0);

    // Bingo: a full row gives a Rasca y gana card to each one
    await go('/juegos/bingo', '.bingo-grid');
    for (let i = 0; i < 4; i++) { await page.locator('.bingo-cell').nth(i).click(); await sheetBtn('Lo hicimos').click(); await page.waitForTimeout(450); }
    const bingo = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const cards = (await db.query('scratchCards')).filter((c) => c.origin === 'bingo'); const done = (await db.query('gameArtifacts')).find((a) => a.type === 'bingoCard').data.cells.filter((c) => c.doneAt).length; return `${cards.length}:${done}`; });
    ok('5B bingo: marking a row saves it and gives two scratch cards', bingo === '2:4', bingo);
    await shot(page, '5b-bingo-390');

    // Desafío de 30 días
    await go('/juegos/reto30', '.page');
    await btn('Empezar el desafío').click(); await page.waitForSelector('.reto-grid');
    const before = await page.locator('.reto-text').innerText();
    await btn('Cambiar reto').click(); await page.waitForTimeout(300);
    const after = await page.locator('.reto-text').innerText();
    await btn('Lo hicimos').click(); await page.waitForTimeout(400);
    ok('5B 30 días: start, swap today and mark it done', before !== after && (await page.locator('.reto-day.is-done').count()) === 1);

    // Noche de cine
    await go('/juegos/cine', '.page');
    for (const t of ['Película ficticia uno', 'Serie ficticia dos']) {
      await btn('Agregar').click(); await page.locator('.overlay input').first().fill(t);
      if (t.startsWith('Serie')) await page.locator('.overlay label[for$="-serie"]').click();
      await sheetBtn('Guardar').click(); await page.waitForTimeout(300);
    }
    await btn('¿Qué vemos hoy?').click(); await sheetBtn('Girar').click(); await page.waitForTimeout(5200);
    await sheetBtn('¡Esa!').click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Ya la vimos' }).first().click();
    await page.locator('.overlay .star-btn').nth(3).click(); await sheetBtn('Guardar').click(); await page.waitForTimeout(400);
    const cine = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = (await db.query('gameArtifacts')).filter((a) => a.type === 'movie'); return `${m.length}:${m.filter((x) => x.data.status === 'vista' && x.data.reviews?.sofia?.stars === 4).length}`; });
    ok('5B cine: add, spin the wheel and review with stars', cine === '2:1', cine);

    // Adivina el recuerdo with two fictitious photo memories
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const blob = await (await fetch('./tests/fixtures/foto-ficticia.jpg')).blob();
      for (const [i, title] of [[1, 'Recuerdo ficticio uno'], [2, 'Recuerdo ficticio dos']]) {
        const id = `e2e-mem-${i}`; const mediaId = await db.putMedia(blob, { ownerStore: 'memories', ownerId: id });
        await db.put('memories', { id, title, date: `2026-0${i + 5}-10`, note: '', mediaIds: [mediaId], visibility: 'shared', owner: 'both' });
      }
    });
    await go('/juegos/recuerdo', '.page'); await btn('Empezar').click(); await page.waitForSelector('.reveal-canvas');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^¡Adivinó / }).first().click(); await btn('Siguiente foto').click();
    await btn('Nadie').click(); await btn('Ver resultado').click(); await page.waitForSelector('.game-result');
    await shot(page, '5b-recuerdo-390');
    const rec = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('games')).filter((g) => g.gameId === 'recuerdo').map((g) => Object.values(g.score).join('-')).join());
    ok('5B recuerdo: a round scores and the game is saved', /3-0|0-3/.test(rec), rec);

    // Cata a ciegas
    await go('/juegos/cata', '.page');
    await page.locator('.segmented').nth(2).locator('label[for$="-2"]').click();
    await btn('Preparar las muestras').click();
    await page.locator('.page input.input').nth(0).fill('Chocolate'); await page.locator('.page input.input').nth(1).fill('Maní');
    await btn('Listo, a probar').click();
    for (const guess of ['chocolate', 'galleta']) { await page.locator('.star-btn').nth(4).click(); await page.locator('.page input.input').fill(guess); await btn('Siguiente').click(); await page.waitForTimeout(200); }
    await page.waitForSelector('.cata-rank');
    ok('5B cata: tasting, ranking and guesses', /adivinó 1 de 2/.test(await page.locator('.game-result').innerText()));

    // Reto de cocina (duelo)
    await go('/juegos/cocina', '.page'); await btn('Empezar').click(); await page.waitForSelector('.wheel');
    await btn('Girar').click(); await page.waitForTimeout(5000);
    await btn('Ver la receta').click(); await btn('Empezar a cocinar').click(); await btn('Terminamos').click();
    for (let k = 0; k < 2; k++) { await page.locator('.star-btn').nth(k === 0 ? 4 : 2).click(); await btn('Listo').click(); await page.waitForTimeout(200); }
    await page.waitForSelector('.game-result');
    await shot(page, '5b-cocina-390');
    ok('5B cocina: spin, cook, vote and a winner', /Ganó/.test(await page.locator('.game-result').innerText()));

    // Búsqueda del tesoro: made by Sofía, played by David on his phone
    await go('/juegos/tesoro', '.page'); await btn('Armar una búsqueda').click();
    const ta = page.locator('.overlay textarea');
    await ta.nth(0).fill('Pista ficticia uno'); await ta.nth(1).fill('Pista ficticia dos');
    await page.locator('.overlay input[placeholder^="Ej.: un beso"]').fill('Premio ficticio');
    await sheetBtn('Guardar').click(); await page.waitForTimeout(400);
    await as('david'); await go('/juegos/tesoro', '.sealed-card');
    await page.locator('.sealed-card').getByRole('button', { name: 'Empezar' }).click();
    await btn('¡La encontré!').click(); await page.waitForTimeout(250); await btn('¡La encontré!').click(); await page.waitForSelector('.tesoro-prize');
    ok('5B tesoro: clues one by one on the other phone, then the prize', (await page.locator('.tesoro-prize').innerText()) === 'Premio ficticio');

    // Cita misteriosa: made by David for Sofía; first envelope by time (already passed), second by step
    await go('/juegos/misteriosa', '.page'); await btn('Armar una cita').click();
    const tx = page.locator('.overlay textarea'); await tx.nth(0).fill('Sobre ficticio uno'); await tx.nth(1).fill('Sobre ficticio dos');
    await page.locator('.overlay input[type=time]').first().fill('00:00');
    await page.locator('.overlay .tesoro-row').nth(2).getByRole('button', { name: 'Quitar sobre' }).click();
    await sheetBtn('Guardar').click(); await page.waitForTimeout(400);
    await as('sofia'); await go('/juegos/misteriosa', '.sealed-card');
    await page.locator('.sealed-card').getByRole('button', { name: 'Abrir' }).click(); await page.waitForSelector('.envelopes');
    const locked = await page.locator('.envelope.is-locked').count();
    await btn('Abrir el sobre').click(); await btn('Hecho, el siguiente').click(); await btn('Abrir el sobre').click(); await btn('¡Terminamos!').click();
    await page.waitForTimeout(400);
    await shot(page, '5b-misteriosa-390');
    const mist = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('gameArtifacts')).find((a) => a.type === 'mysteryDate').data.status);
    ok('5B cita misteriosa: sealed envelopes open in order and the date ends', locked === 1 && mist === 'done', `${locked} ${mist}`);

    // Origami: a whole guide and the senbazuru counter
    await go('/juegos/origami', '.page');
    await btn('Doblé una').click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Corazón/ }).click();
    for (let i = 0; i < 6; i++) { await btn('Siguiente').click(); await page.waitForTimeout(120); }
    await shot(page, '5b-origami-390');
    await btn('Terminé').click(); await page.waitForTimeout(300);
    ok('5B origami: guide to the end and a crane counted', /\b1\b de 1000/.test(await page.locator('.senbazuru-total').innerText()));

    // Tanabata renders the bamboo
    await go('/juegos/tanabata', '.bamboo');
    ok('5B tanabata: bamboo and the July window', /julio/.test(await page.locator('.page').innerText()));

    // Palabra del día: Japanese writing, review and quiz
    await go('/juegos/kotoba', '.kotoba-today');
    const jp = await page.locator('.kotoba-today .kotoba-jp').innerText();
    await btn('Repasar').click(); await btn('Ver significado').click(); await btn('La sabía').click(); await page.waitForTimeout(500); await ((await btn('Volver').count()) ? btn('Volver') : btn('Terminar')).click();
    await btn('Quiz entre los dos').click(); await page.locator('.trivia-opt').first().click(); await btn('Siguiente').click();
    await shot(page, '5b-kotoba-390');
    ok('5B palabra del día: word in Japanese, review and quiz', /[぀-ヿ一-鿿]/.test(jp) && (await page.locator('.trivia-opt').count()) === 4, jp);
    await btn('Terminar').click();

    // Nuestro manga: photo, bubble and sound effect, saved as an image
    await go('/juegos/manga', '.page'); await btn('Nueva página').click(); await page.waitForSelector('.manga-page');
    await page.locator('.manga-panel').first().click(); await page.locator('.manga-pick-btn').first().click();
    await page.getByRole('button', { name: 'Globo' }).click(); await page.locator('.overlay input').first().fill('Texto ficticio'); await sheetBtn('Agregar').click();
    await page.getByRole('button', { name: 'Onomatopeya' }).click(); await page.locator('.overlay .manga-sfx-chip').first().click();
    await page.waitForTimeout(300);
    await shot(page, '5b-manga-390');
    await btn('Guardar').click(); await page.waitForTimeout(1200);
    const manga = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = (await db.query('gameArtifacts')).find((a) => a.type === 'manga'); const b = m?.mediaId ? await db.getMedia(m.mediaId) : null; return `${m?.data.items.length}:${b?.type}:${m?.data.panels[0]?.mediaId ? 'photo' : 'none'}`; });
    ok('5B manga: page with photo, bubble and sound effect exported as PNG', manga === '2:image/png:photo', manga);

    // Postales: design, message and saved
    await go('/juegos/postales', '.pc-preview');
    await page.locator('.pc-design').nth(2).click(); await page.locator('textarea').fill('Mensaje ficticio');
    await btn('Imprimir').click(); await page.waitForTimeout(300);
    await shot(page, '5b-postales-390');
    const pc = await page.evaluate(async () => (await (await import('./js/core/db.js')).query('gameArtifacts')).filter((a) => a.type === 'postcard').map((a) => a.data.design + ':' + a.data.message).join());
    ok('5B postales: design and message saved for printing', pc === 'ola:Mensaje ficticio', pc);
    await page.locator('.pc-preview').evaluate(() => {});
    await go('/juegos/historial', '.page');
    ok('5B historial: the new games show in the history', /Tesoro encontrado|Búsqueda del tesoro/.test(await page.locator('.page').innerText()));
    ok('fase 5B: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---------- 12. Fase 6: Rincón privado (fictitious texts only) ----------
  {
    const b6 = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const ctx = await b6.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ['microphone', 'camera'] });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(BASE);
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(350); };
    const btn = (name) => page.getByRole('button', { name, exact: true });
    const PIN = '246810';
    const FAKE = ['# contenido ficticio de prueba', 'pregunta | 0 | Frase ficticia zeta cero', 'pregunta | 1 | Frase ficticia zeta uno', 'pregunta | 3 | Frase ficticia zeta tres',
      'reto | 1 | Reto ficticio zeta uno | t-limite | 20', 'reto | 1 | Reto ficticio zeta dos | | 20', 'mimos | 1 | Mimo ficticio zeta', 'sintocar | 1 | Sin tocar ficticio zeta',
      'idea | 0 | Idea ficticia zeta A', 'idea | 1 | Idea ficticia zeta B', 'idea | 1 | Idea ficticia zeta C', 'prenda | 1 | Prenda ficticia zeta', 'cita | 1 | Cita ficticia zeta / Paso ficticio uno / Paso ficticio dos'].join('\n');
    const fakeFile = { name: 'ficticio.txt', mimeType: 'text/plain', buffer: Buffer.from(FAKE) };
    const birth = async (sofia, david) => page.evaluate(async ([a, b]) => {
      const db = await import('./js/core/db.js');
      for (const [p, d] of [['sofia', a], ['david', b]]) await db.put('specialDates', { id: `t6:birth:${p}`, title: 'Cumpleaños ficticio', kind: 'birthday', date: d, recurring: 'yearly', personOrPetId: p });
    }, [sofia, david]);
    const enterPin = async (pin) => { await page.locator('.pin-input').last().fill(pin); await page.waitForTimeout(200); };
    const unlock = async () => { await page.waitForSelector('.lock .pin-input'); await enterPin(PIN); await page.waitForSelector('.consent-btn', { timeout: 20000 }); };
    const consentBoth = async (label = 'Entrar') => { await page.locator('.consent-btn').nth(0).click(); await page.locator('.consent-btn').nth(1).click(); await btn(label).click(); };

    // age gate: missing date, under 18, then adults
    await go('/yoru', '.page');
    ok('6 edad: no abre si falta una fecha de nacimiento', /Falta un dato/.test(await page.locator('main').innerText()));
    await birth('1995-01-01', '2012-05-05');
    await go('/inicio', '.page'); await go('/yoru', '.page');
    ok('6 edad: no abre si alguien es menor de 18', /no está disponible/.test(await page.locator('main').innerText()));
    await birth('1995-01-01', '1994-02-02');
    await go('/inicio', '.page'); await go('/yoru', '.yoru-first');
    ok('6 primera entrada: avisos y advertencia de PIN sin recuperación', /no se puede recuperar/.test(await page.locator('main').innerText()) && (await page.locator('.yoru-notice').count()) === 1);
    await btn('Crear el PIN de 6').click();
    await enterPin(PIN); await enterPin('111111');
    ok('6 PIN: si no coinciden, empieza otra vez', /No coinciden/.test(await page.locator('main').innerText()));
    await page.waitForTimeout(1100);
    await enterPin(PIN); await enterPin(PIN);
    await page.waitForSelector('.consent-btn', { timeout: 30000 });
    const keyRec = await page.evaluate(async () => (await (await import('./js/core/db.js')).rawAll('settings')).filter((r) => r.id.startsWith('key:vault:')).map((r) => r.digits));
    ok('6 PIN: llave de 6 dígitos creada', keyRec.length === 1 && keyRec[0] === 6, JSON.stringify(keyRec));
    ok('6 consentimiento: no entra hasta que los dos tocan', (await btn('Entrar').count()) === 0);
    await consentBoth();
    await page.waitForSelector('.yoru-level');
    ok('6 título de la pestaña neutro', (await page.title()) === 'Aishiteru', await page.title());
    ok('6 sin contenido: invita a cargar', /Todavía no hay cartas/.test(await page.locator('main').innerText()));

    // import: invalid then valid; stored encrypted
    await go('/yoru/contenido', '#yoru-file');
    await page.setInputFiles('#yoru-file', { name: 'malo.txt', mimeType: 'text/plain', buffer: Buffer.from('esto no sirve\nmodo raro | 7 | x') });
    await page.waitForSelector('.yoru-errors');
    ok('6 importador: archivo inválido se rechaza con mensaje claro', /No se pudo cargar/.test(await page.locator('.yoru-errors').innerText()));
    await page.setInputFiles('#yoru-file', fakeFile);
    await page.waitForSelector('text=Vista previa');
    ok('6 importador: vista previa con conteo', /12 elementos listos/.test(await page.locator('main').innerText()));
    await btn('Guardar cifrado').click(); await page.waitForTimeout(800);
    const raw = await page.evaluate(async () => { const db = await import('./js/core/db.js'); return JSON.stringify(await db.rawAll('vault')); });
    ok('6 cifrado: ningún texto del Rincón legible en IndexedDB', raw.length > 200 && !/zeta|ficticia|ficticio/i.test(raw));

    // levels: each sets their own, the lower one rules; limits filter
    await page.evaluate(async () => { const V = await import('./js/core/vault.js'); const s = await V.getSettings(); s.levels = { sofia: 3, david: 1 }; s.ramp = false; s.limits.david.tags = ['t-limite']; await V.setSettings(s); });
    await go('/yoru', '.yoru-level');
    ok('6 niveles: manda el menor aceptado', /Nivel 1/.test(await page.locator('.yoru-level').innerText()));
    const lim = await page.evaluate(async () => { const V = await import('./js/core/vault.js'); const s = await V.getSettings(); const lib = await V.library(); return V.pool(lib.items, { kind: 'reto', band: [0, V.maxLevel(s)], merged: V.mergeLimits(s.limits) }).map((i) => i.text).join('|'); });
    ok('6 límites duros: filtran lo marcado por cualquiera', lim === 'Reto ficticio zeta dos', lim);
    await go('/yoru/ajustes', '.page');
    ok('6 ajustes: no muestra los límites del otro', !(await page.locator('main').innerText()).includes('t-limite'));

    // a game: consent, bar always visible, no repeats, Parar -> rest screen -> diary
    await go('/yoru/juego/preguntas', '.consent-btn');
    ok('6 juego: pide el consentimiento de los dos', (await btn('Empezar').count()) === 0);
    await consentBoth('Empezar');
    await page.waitForSelector('.yoru-bar');
    const bar = await page.locator('.yoru-bar').innerText();
    ok('6 juego: Pausa, Cambiar y Parar siempre visibles', /Pausa/.test(bar) && /Cambiar/.test(bar) && /Parar/.test(bar));
    const seen = [];
    for (let i = 0; i < 2; i++) { seen.push(await page.locator('.gcard').last().innerText()); await btn('Siguiente').click(); await page.waitForTimeout(500); }
    ok('6 generador: no repite hasta agotar el mazo', seen[0] !== seen[1] && !/zeta tres/.test(seen.join()), seen.join(' / '));
    await page.locator('.yoru-bar-btn', { hasText: 'Pausa' }).click();
    ok('6 pausa: pantalla de pausa', await page.locator('.yoru-pause').isVisible());
    await page.locator('.yoru-pause').getByRole('button', { name: 'Seguir' }).click();
    await page.locator('.yoru-bar-btn', { hasText: 'Parar' }).click();
    await page.waitForSelector('.yoru-end');
    await shot(page, '6-fin-390');
    ok('6 parar: pasa al descanso con preguntas de cuidado', /Paramos aquí/.test(await page.locator('.yoru-end').innerText()) && /Cómo se sintieron/.test(await page.locator('.yoru-end').innerText()));
    await page.locator('.yoru-end .star-btn').nth(3).click();
    await btn('Guardar en el diario').click(); await page.waitForSelector('.yoru-level');
    await go('/yoru/diario', '.yoru-log');
    ok('6 diario: guarda juego y valoración', /Preguntas/.test(await page.locator('.yoru-log').innerText()) && /★★★★/.test(await page.locator('.yoru-log').innerText()));

    // yes / no / maybe: only matches
    await go('/yoru/si-no-quiza', '.ynm-person');
    const answer = async (who, vals) => { await page.locator('.ynm-person').nth(who).getByRole('button').click(); for (let i = 0; i < vals.length; i++) await page.locator('.ynm-row').nth(i).locator('label', { hasText: vals[i] }).click(); await btn('Guardar y tapar').click(); await page.waitForTimeout(300); };
    await answer(0, ['Sí', 'No', 'Quizá']); await answer(1, ['Sí', 'Sí', 'Sí']);
    const ynm = await page.locator('main').innerText();
    ok('6 sí/no/quizá: solo coincidencias, nunca lo rechazado', /Coinciden en 2/.test(ynm) && !/zeta B/.test(ynm) && /zeta A/.test(ynm), ynm.slice(0, 200));

    // recording: needs the agreement box, visible indicator, stays encrypted and local
    await go('/yoru/grabaciones', '.page');
    await btn('Nueva grabación').click();
    ok('6 grabación: no arranca sin la casilla de los dos', await btn('Pedir permiso y grabar').isDisabled());
    await page.locator('#rec-agree').check();
    await btn('Pedir permiso y grabar').click();
    await page.waitForSelector('.rec-indicator');
    ok('6 grabación: indicador visible mientras graba', await page.locator('.rec-indicator').isVisible() && await page.evaluate(() => document.documentElement.classList.contains('is-recording')));
    await page.waitForTimeout(1500);
    await btn('Detener y guardar').click(); await page.waitForSelector('.yoru-recs .card', { timeout: 15000 });
    const media = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = (await db.rawAll('media')).filter((x) => x.ownerStore === 'vault'); return m.map((x) => `${!!x.enc}:${x.blob === null}:${x.localOnly}`).join(); });
    ok('6 grabación: se guarda cifrada y solo en este equipo', media === 'true:true:true', media);

    // leave locks; panic corner
    await go('/inicio', '.page'); await go('/yoru', '.lock');
    ok('6 bloqueo: al salir de la sección pide el PIN de nuevo', await page.locator('.lock .pin-input').isVisible());
    await enterPin('000000');
    ok('6 bloqueo: PIN incorrecto se rechaza', /incorrecto/i.test(await page.locator('.lock').innerText()));
    await unlock(); await consentBoth(); await page.waitForSelector('.yoru-level');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const lockedHidden = await page.evaluate(async () => !(await import('./js/core/crypto.js')).isUnlocked('vault'));
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    ok('6 bloqueo: al ocultar la app (otra app o minimizar)', lockedHidden);
    await unlock(); await consentBoth(); await page.waitForSelector('.yoru-level');
    await page.mouse.click(385, 20); await page.mouse.click(385, 20);
    await page.waitForSelector('.panic');
    ok('6 pánico: doble toque en la esquina cubre todo y cierra el Rincón', await page.evaluate(async () => !(await import('./js/core/crypto.js')).isUnlocked('vault')));
    await page.locator('.panic-back').click();

    // never in the general backup, caches, URL or search
    const leak = await page.evaluate(async () => {
      const b = await import('./js/core/backup.js');
      const out = JSON.stringify(await b.exportBackup({ appVersion: '0.8.0' }));
      let cache = '';
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) cache += r.url;
      return { backup: /zeta|v:pack/.test(out), cache: /vault-content|rincon|zeta/i.test(cache), url: location.href.includes('zeta') };
    });
    ok('6 fuera de la copia general, cachés y URL', !leak.backup && !leak.cache && !leak.url, JSON.stringify(leak));

    // own encrypted backup: restore elsewhere only with the right phrase
    await go('/yoru', '.lock'); await unlock(); await consentBoth(); await page.waitForSelector('.yoru-level');
    await go('/yoru/ajustes', '.page');
    await btn('Crear copia cifrada').click();
    await page.locator('.overlay input').nth(0).fill('frase ficticia larga'); await page.locator('.overlay input').nth(1).fill('frase ficticia larga');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.overlay').getByRole('button', { name: 'Seguir' }).click()]);
    const file = await dl.path();
    const vb = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('6 copia propia: cifrada y con su formato', vb.format === 'aniversario-vault-backup' && !/zeta/.test(JSON.stringify(vb)));
    const ctx2 = await b6.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await ctx2.newPage();
    const errs2 = watch(p2);
    await completeSetup(p2);
    const res2 = await p2.evaluate(async ([bk, pin]) => {
      const db = await import('./js/core/db.js');
      for (const [p, d] of [['sofia', '1995-01-01'], ['david', '1994-02-02']]) await db.put('specialDates', { id: `t6:birth:${p}`, title: 'x', kind: 'birthday', date: d, recurring: 'yearly', personOrPetId: p });
      const security = await import('./js/core/security.js'); const V = await import('./js/core/vault.js');
      await security.createPin('vault', pin);
      let wrong = 'ok'; try { await V.importBackup(bk, 'otra frase cualquiera'); } catch (e) { wrong = e.code; }
      const n = await V.importBackup(bk, 'frase ficticia larga');
      const lib = await V.library();
      return { wrong, n, items: lib.items.length, logs: (await V.logs()).length };
    }, [vb, PIN]);
    ok('6 copia propia: se restaura en otro navegador solo con la frase correcta', res2.wrong === 'PHRASE' && res2.items === 12 && res2.logs === 1, JSON.stringify(res2));
    ok('6 otro navegador: sin errores', errs2.length === 0, errs2.join(' | '));
    await ctx2.close();

    // wipe this device only
    await go('/yoru/ajustes', '.page');
    await btn('Borrar el Rincón de este equipo').click(); await page.locator('.overlay').getByRole('button', { name: 'Seguir' }).click();
    await page.waitForSelector('.overlay .pin-input'); await page.locator('.overlay .pin-input').fill(PIN);
    await page.waitForFunction(() => location.hash === '#/ajustes', null, { timeout: 20000 });
    const wiped = await page.evaluate(async () => { const db = await import('./js/core/db.js'); return (await db.rawAll('vault')).length + (await db.rawAll('settings')).filter((r) => r.id.startsWith('key:vault:')).length + (await db.rawAll('media')).filter((m) => m.ownerStore === 'vault').length; });
    ok('6 borrar: el Rincón se borra de este equipo con confirmación y PIN', wiped === 0, String(wiped));
    ok('fase 6: no page errors or native dialogs', errs.length === 0, errs.join(' | '));
    await ctx.close(); await b6.close();
  }

  // ---------- 13. Fase 7: pulido (season effect, hanabi, sounds, small details, headers) ----------
  {
    const b7 = await chromium.launch();
    const ctx = await b7.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(BASE);
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(350); };
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const reopen = async () => { await page.evaluate(() => { location.hash = '#/inicio'; }); await page.reload(); await page.waitForSelector('.splash', { timeout: 20000 }).catch(() => {}); await page.waitForFunction(() => !document.querySelector('.splash') && location.hash.startsWith('#/inicio'), null, { timeout: 40000 }); };

    // v0.12.0: the season lives behind Inicio's cards all the time (fx.ambient), with the branch in the corner
    await reopen();
    ok('12 hojas: el fondo vivo está en Inicio', await page.waitForSelector('.home .ambient-canvas', { timeout: 4000 }).then(() => true).catch(() => false));
    await page.waitForTimeout(8000);
    ok('12 hojas: sigue ahí después de unos segundos (siempre presentes)', await page.$('.home .ambient-canvas') !== null);
    const layer = await page.evaluate(() => { const c = document.querySelector('.ambient-canvas:not(.is-back)'); const card = document.querySelector('.home-cards'); const cs = getComputedStyle(c); return [cs.pointerEvents, cs.zIndex, getComputedStyle(card).zIndex].join(','); });
    ok('12 hojas (v0.15.1): caen por encima de las tarjetas sin bloquear toques', layer === 'none,3,1', layer);
    ok('12 hojas (v0.15.1): los faroles de noche van en una capa detrás de las tarjetas', await page.evaluate(() => getComputedStyle(document.querySelector('.ambient-canvas.is-back')).zIndex === '0'));
    ok('12 hojas: no sale encima de todo como antes', await page.$('.fx-canvas') === null);
    const painted = await page.evaluate(() => { const c = document.querySelector('.ambient-canvas:not(.is-back)'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    ok('12 hojas: se dibujan partículas', painted > 50, String(painted));
    const kinds = await page.evaluate(async () => { const fx = await import('./js/core/fx.js'); const r = document.documentElement; const was = r.dataset.theme; r.dataset.theme = 'day'; const day = fx.ambientKind(); r.dataset.theme = 'night'; const night = fx.ambientKind(); r.dataset.theme = was; return `${day === fx.seasonOf()}|${night}`; });
    ok('12 hojas: de día la estación, de noche luciérnagas y chōchin', kinds === 'true|night', kinds);
    const corner = await page.evaluate(async () => { const c = document.querySelector('.home-corner'); const was = document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'day'; await new Promise((r) => setTimeout(r, 120)); const before = c.dataset.kind; const wis = !!c.querySelector('.corner-maple') && !!c.querySelector('.corner-furin'); document.documentElement.dataset.theme = 'night'; await new Promise((r) => setTimeout(r, 120)); const n = [c.dataset.kind, c.querySelectorAll('ellipse').length >= 2, !c.querySelector('.corner-maple')]; document.documentElement.dataset.theme = was; return [before, wis, ...n].join(','); });
    ok('12 rama (v0.15.1): de día arce japonés con furin, de noche dos chōchin colgados', /^(sakura|momiji|snow|hotaru),true,night,true,true$/.test(corner), corner);
    await page.locator('.home-corner').click();
    ok('12 rama: al tocarla se sacude', await page.locator('.home-corner').evaluate((c) => c.classList.contains('is-shaking')));
    ok('12 rama: es decorativa para lectores de pantalla', await page.locator('.home-corner').getAttribute('aria-hidden') === 'true');
    const xmas = await page.evaluate(async () => { const ev = await import('./js/features/eventos.js'); const fx = await import('./js/core/fx.js'); const top = ev.decoLayer('lights'); const card = ev.decoLayer('lights', 8, { onCard: true }); const c = fx.cornerArt('snow', { xmas: true }); return [top.querySelectorAll('.xmas-lantern').length, !!top.querySelector('.deco-bit'), card.querySelectorAll('.xmas-lantern').length, !!card.querySelector('.xmas-bow'), !!c.querySelector('.corner-tanzaku'), top.getAttribute('aria-hidden')].join(','); });
    ok('Navidad a la japonesa (v0.15.1): 5 chōchin en Inicio, cinta con moño en la tarjeta y campana en el arce', xmas === '5,false,3,true,false,true', xmas);
    const ja = await page.evaluate(() => getComputedStyle(document.querySelector('.page-head .ja')).animationName);
    ok('12 título a pincel: el japonés del título se pinta', /ja-paint/.test(ja), ja);
    const enso = await page.evaluate(async () => { const { ui } = await import('./js/core.js'); const n = ui.skeleton(2); return !!n.querySelector('svg.enso-loader .enso-stroke') && n.getAttribute('role') === 'status'; });
    ok('12 carga: ensō a pincel en vez del círculo que gira', enso);
    const seasons = await page.evaluate(async () => { const fx = await import('./js/core/fx.js'); return [3, 6, 9, 0].map((m) => fx.seasonOf(new Date(2026, m, 10))).join(',') + '|' + fx.seasonOf(new Date(2026, 0, 10), 'sur'); });
    ok('7 temporada: calendario de Japón (y el sur corrido 6 meses)', seasons === 'sakura,hotaru,momiji,snow|hotaru', seasons);
    await go('/mas', '.page');
    ok('12 hojas: solo en Inicio (se van al salir)', await page.$('.ambient-canvas') === null);

    // switch in Ajustes and sound previews
    await go('/ajustes/movimiento', '.page');
    await page.getByRole('switch', { name: 'Hojas de Inicio' }).click();
    await page.waitForTimeout(300);
    ok('7 ajustes: las hojas de Inicio se apagan', await page.evaluate(() => document.documentElement.dataset.seasonal) === 'off');
    for (const n of ['Campanilla', 'Papel', 'Sello']) await page.getByRole('button', { name: n, exact: true }).click();
    ok('7 ajustes: los sonidos se escuchan antes de activarlos (sin errores)', errs.length === 0, errs.join(' | '));
    ok('7 sonido: apagado por defecto', await page.evaluate(() => document.documentElement.dataset.sound) === 'off');
    await reopen();
    await page.waitForTimeout(1500);
    ok('12 hojas apagadas: Inicio queda sin fondo vivo', await page.$('.ambient-canvas') === null && await page.$('.fx-canvas') === null);

    // hanabi on a birthday, once that day
    await page.evaluate(async (d) => { const db = await import('./js/core/db.js'); await db.put('specialDates', { id: 't7:birth', title: 'Cumpleaños ficticio', kind: 'birthday', date: `2000-${d.slice(5)}`, recurring: 'yearly', personOrPetId: 'sofia' }); }, today);
    await reopen();
    const hanabi = await page.waitForSelector('.fx-canvas', { timeout: 4000 }).then(() => true).catch(() => false);
    const key = await page.evaluate(() => localStorage.getItem('aishiteru.home.hanabiDay'));
    ok('7 hanabi: sale el día del cumpleaños (aun con la temporada apagada)', hanabi && key === today, `${hanabi} ${key}`);
    await page.waitForSelector('.fx-canvas', { state: 'detached', timeout: 9000 }).catch(() => {});
    await reopen();
    ok('7 hanabi: una sola vez ese día', !(await page.waitForSelector('.fx-canvas', { timeout: 2500 }).then(() => true).catch(() => false)));

    // Un día como hoy (shared only) on Inicio; owner seal in Cápsula
    await page.evaluate(async (d) => {
      const db = await import('./js/core/db.js');
      const y = String(Number(d.slice(0, 4)) - 1);
      await db.put('memories', { id: 't7:otd', title: 'Recuerdo ficticio de hace un año', date: `${y}${d.slice(4)}`, note: '', mediaIds: [], visibility: 'shared', private: false, owner: 'sofia', tags: [] });
      await db.put('memories', { id: 't7:otd-self', title: 'Secreto ficticio', date: `${y}${d.slice(4)}`, note: '', mediaIds: [], visibility: 'self', private: true, owner: 'sofia', tags: [] });
    }, today);
    await reopen();
    await page.waitForSelector('.today-list', { timeout: 15000 }).catch(() => {});
    const homeText = await page.locator('main').innerText();
    ok('7 Un día como hoy: aviso en Inicio con el recuerdo compartido', /Un día como hoy: Recuerdo ficticio de hace un año/.test(homeText));
    ok('7 Un día como hoy: lo de "Solo yo" no sale en Inicio', !/Secreto ficticio/.test(homeText));
    await go('/capsula', '.timeline-wrap');
    const seal = await page.locator('a[data-id="t7:otd"] .seal-initial').innerText().catch(() => '');
    const initial = await page.evaluate(async () => { const p = await import('./js/core/profile.js'); return p.name('sofia').charAt(0).toUpperCase(); });
    ok('7 Cápsula: sello rojo con la inicial de quien lo guardó', seal === initial && !!initial, `${seal}/${initial}`);
    const empty = await page.evaluate(async () => { const { ui } = await import('./js/core.js'); const n = ui.emptyState({ title: 'x', art: 'thread' }); return !!n.querySelector('svg.empty-thread path'); });
    ok('7 Cápsula vacía: ilustración del hilo rojo', empty);

    // dot on the Cartas tab (one sealed letter for the active profile)
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); const p = await import('./js/core/profile.js'); const me = p.active(); await db.put('letters', { id: 't7:letter', author: p.partnerOf(me), to: me, condition: 'Ábreme cuando sea una prueba', body: 'Carta ficticia', signature: '', status: 'sealed', sealedAt: new Date().toISOString(), visibility: 'shared', private: false, owner: 'both' }); });
    const n = await page.evaluate(async () => (await import('./js/features/cartas.js')).unopenedCount());
    await page.waitForTimeout(600);
    const label = await page.locator('.tabbar [data-tab="cartas"]').getAttribute('aria-label');
    const dot = await page.locator('.tabbar [data-tab="cartas"]').evaluate((a) => a.classList.contains('has-dot'));
    ok('7 Cartas: puntito y etiqueta con las cartas por abrir', n > 0 ? dot && label.includes(`${n === 1 ? '1 por abrir' : `${n} por abrir`}`) : !dot && label === 'Cartas', `${n} ${dot} ${label}`);

    // policies, zoom, shortcuts, headers
    const pol = await page.evaluate(async () => (await import('./js/config.js')).CONFIG.legalTexts.find((t) => t.id === 'cfg:legal:privacidad').body);
    ok('7 privacidad: explica la sincronización cifrada y cómo borrar la nube', /extremo a extremo/.test(pol) && /Borrar todo del servidor/.test(pol));
    const vp = await page.$eval('meta[name="viewport"]', (m) => m.content);
    ok('7 accesibilidad: se permite el zoom', !/user-scalable=no|maximum-scale/.test(vp), vp);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press('?');
    const sc = await page.locator('.overlay').innerText().catch(() => '');
    ok('7 atajos: la lista incluye las flechas', /Pasar fotos/.test(sc));
    await page.keyboard.press('Escape');
    if (/:8787\//.test(BASE)) {
      const h = await page.evaluate(async () => { const r = await fetch('./', { method: 'HEAD' }); return [r.headers.get('x-frame-options'), r.headers.get('content-security-policy'), r.headers.get('x-content-type-options')].join('|'); });
      ok('7 encabezados de seguridad publicados', h === "DENY|frame-ancestors 'none'|nosniff", h);
    }
    ok('fase 7: no page errors or native dialogs', errs.length === 0, errs.join(' | '));

    // reduced motion: no particles at all
    const ctxR = await b7.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const pr = await ctxR.newPage();
    await completeSetup(pr);
    const any = await pr.waitForSelector('.fx-canvas, .ambient-canvas', { timeout: 3000 }).then(() => true).catch(() => false);
    const forced = await pr.evaluate(async () => { const fx = await import('./js/core/fx.js'); return [fx.seasonal({ force: true }), fx.hanabi()]; });
    ok('7 movimiento reducido: sin partículas ni hanabi', !any && forced.every((x) => x === false), JSON.stringify(forced));
    await ctxR.close();
    await ctx.close(); await b7.close();
  }

  // ---------- 14. v0.10.0: revisión completa (null fix, details, Papelera, Modo cita) ----------
  {
    const b10 = await chromium.launch();
    const ctx = await b10.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(BASE);
    await completeSetup(page);
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(400); };
    const mainText = () => page.evaluate(() => document.querySelector('main').innerText);

    // E1/E2: no literal "null" on screens that used to print it
    for (const [r, sel] of [['/rasca', '.section-title'], ['/mapa', '.place-counter, .map-wrap, main h1'], ['/habitos', 'main h1'], ['/insignias', '.streak-card'], ['/ajustes/movimiento', '.card']]) {
      await go(r, sel);
      ok(`10 sin "null" en ${r}`, !/\bnull\b/.test(await mainText()));
    }
    // viewer without caption
    await page.evaluate(async () => { const v = await import('./js/core/viewer.js'); const c = document.createElement('canvas'); c.width = c.height = 8; const b = await new Promise((r) => c.toBlob(r)); v.openViewer([{ blob: b, alt: 'x' }]); });
    await page.waitForTimeout(400);
    ok('10 visor sin título: sin "null"', !/\bnull\b/.test(await page.evaluate(() => document.querySelector('.overlay')?.innerText || '')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // E3: Modo sin terceros
    await go('/ajustes/terceros', '.external-table');
    const ter = await mainText();
    ok('10 Modo sin terceros: sin "Pronto" y sin "solo habla con su propio sitio"', !/Pronto/.test(ter) && !/solo habla con su propio sitio/.test(ter));

    const ta = await page.evaluate(async () => (await import('./js/core/ui.js')).textarea({ value: 'Nota guardada' }).value);
    ok('10 textarea: muestra el texto guardado al editar (antes salía vacío, p. ej. en el diario del Rincón)', ta === 'Nota guardada', ta);

    // D2: ¡Úsame pronto!
    const soon = await page.evaluate(async () => {
      const c = await import('./js/features/cupones.js'); const u = await import('./js/core/util.js');
      const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return u.localDay(x); };
      return [c.isExpiringSoon({ expiresOn: d(3) }), c.isExpiringSoon({ expiresOn: d(7) }), c.isExpiringSoon({ expiresOn: d(8) }), c.isExpiringSoon({ expiresOn: d(-1) }), c.isExpiringSoon({ expiresOn: '' })];
    });
    ok('10 Cuponera: "Úsame pronto" solo de 0 a 7 días', JSON.stringify(soon) === '[true,true,false,false,false]', JSON.stringify(soon));
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js'); const p = await import('./js/core/profile.js'); const u = await import('./js/core/util.js');
      const me = p.active(); const x = new Date(); x.setDate(x.getDate() + 2);
      await db.put('content', { id: 't10:coupon', kind: 'coupon', title: 'Cupón ficticio', description: '', dedication: '', expiresOn: u.localDay(x), from: p.partnerOf(me), to: me, sentAt: u.nowISO(), visibility: 'shared', owner: 'both' });
    });
    await go('/cupones', '.cupones-tabs');
    await page.locator('.cupones-tabs label.segmented-option', { hasText: 'Para ti' }).click(); await page.waitForSelector('.kippu');
    ok('10 Cuponera: el sello se ve en el cupón que vence pronto', await page.locator('.kippu-soon', { hasText: '¡Úsame pronto!' }).count() >= 1);

    // D3: encuentro phrases
    const lines = await page.evaluate(async () => {
      const e = await import('./js/features/encuentro.js');
      const at = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, time: '23:59' }; };
      return [1, 3, 6, 20].map((n) => e.countdownLine(at(n)));
    });
    ok('10 Encuentro: frases según lo que falta', lines[0] === '¡Mañana se ven!' && lines[1] === 'Faltan 3 sueños' && /^Ya casi/.test(lines[2]) && /para verse$/.test(lines[3]), JSON.stringify(lines));

    // D4: ema swings once when a plan is fulfilled
    await go('/planes', '.ema');
    await page.locator('.ema:not(.is-done) .ema-check input').first().click({ force: true });
    await page.getByRole('button', { name: 'Marcar cumplido' }).click();
    const swung = await page.waitForSelector('.ema.is-swinging', { timeout: 4000 }).then(() => true).catch(() => false);
    ok('10 Planes: la tablilla se balancea al cumplirse', swung);

    // N2: round milestones
    const rm = await page.evaluate(async () => { const t = await import('./js/core/time.js'); return [1000, 1111, 2000, 2222, 999, 1500].map((n) => !!t.roundMilestone(n)); });
    ok('10 hitos redondos: 1000, 1111, 2000 y 2222 sí; 999 y 1500 no', JSON.stringify(rm) === '[true,true,true,true,false,false]', JSON.stringify(rm));

    // N1: "Yo también" when the partner thought of you today
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); const p = await import('./js/core/profile.js'); const u = await import('./js/core/util.js'); await db.put('thinkingOfYou', { at: u.nowISO(), by: p.partnerOf(p.active()), phraseId: 'x' }); });
    await go('/inicio', '.home-cards');
    const tab = page.locator('.home-day button', { hasText: 'Pensando en ti' });
    if (await tab.count()) await tab.first().click();
    await page.waitForSelector('.thinking-reply', { timeout: 5000 }).catch(() => {});
    const replyBtn = page.locator('.thinking-reply button', { hasText: 'Yo también' });
    ok('10 Pensando en ti: aparece "Yo también"', await replyBtn.count() === 1);
    if (await replyBtn.count()) await replyBtn.click();
    const replied = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const p = await import('./js/core/profile.js'); return (await db.query('thinkingOfYou')).some((t) => t.reply && t.by === p.active()); });
    ok('10 Pensando en ti: la respuesta se guarda', replied);

    // D1: both today (pure function; the line needs the sync)
    const both = await page.evaluate(async () => { const h = await import('./js/features/home.js'); const now = new Date(); const y = new Date(now.getTime() - 86400000 * 2);
      return [h.bothToday([{ person: 'david', seen: now.getTime() }], 'david', now), h.bothToday([{ person: 'david', seen: y.getTime() }], 'david', now), h.bothToday([{ person: 'david', seen: now.getTime(), me: true }], 'david', now)]; });
    ok('10 "Hoy los dos pasaron": solo con un equipo del otro visto hoy', JSON.stringify(both) === '[true,false,false]', JSON.stringify(both));
    ok('10 "Hoy los dos pasaron": sin sincronización no sale', await page.locator('.both-today:not([hidden])').count() === 0);

    // N3: phrase of the day on the app lock
    const phr = await page.evaluate(async () => { const s = await import('./js/core/security.js'); const d1 = new Date(2026, 0, 1); const d2 = new Date(2026, 0, 2); return [s.lockPhrase(d1), s.lockPhrase(d1), s.lockPhrase(d2)]; });
    ok('10 bloqueo: frase del día estable y distinta al día siguiente', phr[0] && phr[0] === phr[1] && phr[1] !== phr[2], JSON.stringify(phr));
    const lockTxt = await page.evaluate(async () => { const s = await import('./js/core/security.js'); await s.createPin('app', '1357'); s.lockScreen({ scope: 'app' }); await new Promise((r) => setTimeout(r, 500)); return document.querySelector('.lock-phrase')?.textContent || ''; });
    ok('10 bloqueo: la pantalla del PIN muestra la frase', lockTxt.length > 5, lockTxt);
    await page.locator('.lock input').first().fill('1357').catch(() => {});
    await page.keyboard.type('1357').catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.lock-full'), null, { timeout: 5000 }).catch(() => {});
    ok('10 bloqueo: se abre con el PIN', await page.locator('.lock-full').count() === 0);

    // N4: Papelera
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const c = document.createElement('canvas'); c.width = c.height = 8; const b = await new Promise((r) => c.toBlob(r, 'image/jpeg'));
      const mid = await db.putMedia(b, { ownerStore: 'memories', ownerId: 't10:mem', width: 8, height: 8 });
      await db.put('memories', { id: 't10:mem', title: 'Recuerdo ficticio para la papelera', date: '2026-01-05', note: '', mediaIds: [mid], visibility: 'shared', owner: 'both', draft: false });
    });
    await go('/capsula/t10:mem', 'main h1');
    const delBtn = page.getByRole('button', { name: /^Borrar/ }).first();
    await delBtn.click();
    await page.locator('.overlay').getByRole('button', { name: 'Borrar' }).click();
    await page.waitForSelector('.toast', { hasText: 'Papelera' }).catch(() => {});
    const afterDel = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const t = await db.trashList(); return { gone: !(await db.rawGet('memories', 't10:mem')), trash: t.filter((x) => x.recId === 't10:mem').length, media: t.find((x) => x.recId === 't10:mem')?.media?.length || 0 }; });
    ok('10 Papelera: el recuerdo se borra y queda en la Papelera con su foto', afterDel.gone && afterDel.trash === 1 && afterDel.media === 1, JSON.stringify(afterDel));
    await go('/ajustes/papelera', '.trash-list');
    ok('10 Papelera: se ve en Ajustes con su nombre', await page.locator('.trash-row', { hasText: 'Recuerdo ficticio para la papelera' }).count() === 1);
    await page.locator('.trash-row', { hasText: 'Recuerdo ficticio para la papelera' }).getByRole('button', { name: 'Recuperar' }).click();
    await page.waitForTimeout(500);
    const back = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = await db.get('memories', 't10:mem'); const meta = await db.getMeta(); return { m: !!m, media: m ? !!(await db.getMedia(m.mediaIds[0])) : false, tomb: !!meta.tombstones?.['memories:t10:mem'], trash: (await db.trashList()).length }; });
    ok('10 Papelera: recuperar devuelve el recuerdo, su foto y quita la lápida', back.m && back.media && !back.tomb && back.trash === 0, JSON.stringify(back));
    const solo = await page.evaluate(async () => {
      const db = await import('./js/core/db.js'); const p = await import('./js/core/profile.js'); const me = p.active();
      await db.rawPut('memories', db.withDefaults({ id: 't10:self', title: 'Secreto ficticio', visibility: 'self', owner: p.partnerOf(me), mediaIds: [] }));
      await db.trash('memories', 't10:self', { label: 'Secreto ficticio' });
      const raw = (await db.rawAll('trash')).find((t) => t.recId === 't10:self');
      return { label: raw.label, listed: (await db.trashList()).some((t) => t.recId === 't10:self') };
    });
    ok('10 Papelera: lo "Solo yo" del otro no se lista ni guarda su título', solo.label === '' && !solo.listed, JSON.stringify(solo));
    const exp = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const far = new Date(Date.now() + 31 * 86400000); const iso = (await import('./js/core/util.js')).toLocalISO(far); return db.emptyExpiredTrash(iso); });
    ok('10 Papelera: a los 30 días se vacía sola', exp >= 1, String(exp));
    const bk = await page.evaluate(async () => { const b = await import('./js/core/backup.js'); const r = await b.exportBackup({}); const d = r.files[0].data; const o = typeof d === 'string' ? JSON.parse(d) : d; return Object.keys(o.stores).includes('trash'); }).catch((e) => `err ${e.message}`);
    ok('10 Papelera: no viaja en la copia de seguridad', bk === false, String(bk));

    // N5: Modo cita
    await go('/modo-cita?titulo=Cena%20ficticia', '.date-mode-intro');
    ok('10 Modo cita: el título llega desde la idea', (await page.locator('.date-mode input').first().inputValue()) === 'Cena ficticia');
    await page.locator('.date-mode input').nth(1).fill('Un lugar ficticio');
    await page.getByRole('button', { name: 'Empezar la cita' }).click();
    await page.waitForSelector('.date-mode-question');
    ok('10 Modo cita: pregunta para conversar', (await page.locator('.date-mode-question').innerText()).length > 5);
    await page.setInputFiles('#date-mode-photo', path.join(__dirname, 'fixtures', 'foto-ficticia.jpg'));
    await page.waitForSelector('.date-mode-photos .photo-tile', { timeout: 8000 });
    await page.locator('.date-mode textarea').fill('Nota ficticia de la cita');
    await page.waitForTimeout(600);
    await page.reload();
    if (await page.waitForSelector('.lock-full', { timeout: 6000 }).then(() => true).catch(() => false)) await page.keyboard.type('1357'); // app PIN made above
    await page.waitForSelector('.date-mode-question', { timeout: 20000 });
    ok('10 Modo cita: sigue en curso después de recargar', (await page.locator('.date-mode textarea').inputValue()) === 'Nota ficticia de la cita' && await page.locator('.date-mode-photos .photo-tile').count() === 1);
    await page.getByRole('button', { name: 'Terminar y guardar el recuerdo' }).click();
    await page.waitForSelector('.date-mode-end');
    const mem = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const m = (await db.query('memories')).find((x) => x.fromDateMode); return m ? { title: m.title, photos: m.mediaIds.length, note: m.note } : null; });
    ok('10 Modo cita: arma el recuerdo con título, foto, lugar y nota', mem && mem.title === 'Cena ficticia' && mem.photos === 1 && /Nota ficticia/.test(mem.note) && /Un lugar ficticio/.test(mem.note), JSON.stringify(mem));
    await go('/modo-cita', '.date-mode-intro');
    ok('10 Modo cita: al terminar vuelve a empezar de cero', true);
    await go('/modos', '.page');
    ok('10 Juegos > Modos: tiene Modo cita (v0.14.0)', await page.locator('main a[href="#/modo-cita"]').count() >= 1);
    const real = errs.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED/.test(e)); // map tiles: no internet in the test sandbox
    ok('v0.10.0: no page errors or native dialogs', real.length === 0, real.join(' | '));
    await ctx.close(); await b10.close();
  }

  // ---------- 15. v0.11.0: Inicio accesos, secciones juntas, Galería, permisos, atrás ----------
  {
    const b11 = await chromium.launch();
    const ctx = await b11.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.goto(BASE);
    await page.locator('.short-code').waitFor();
    ok('11 bienvenida (PC): solo el QR y el código, sin crear perfil', (await page.locator('.qr-box').count()) === 1 && (await page.getByText('Sus datos').count()) === 0);
    await page.locator('.join-rescue summary').click();
    await page.getByLabel('Mis 12 palabras').fill('una dos tres');
    await page.getByRole('button', { name: 'Entrar con mis palabras' }).click();
    ok('11 volver a entrar: pide 12 palabras', await page.locator('.field-error', { hasText: 'Son 12 palabras' }).waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
    // Setup until the permissions step
    await page.getByRole('link', { name: 'Empezar desde cero' }).click();
    ok('v0.13 PC: "Empezar desde cero" pasa directo a elegir quién', await page.getByText('¿Quién usa este dispositivo?').waitFor({ timeout: 5000 }).then(() => true).catch(() => false));
    await page.getByRole('button', { name: /Sofía/ }).click();
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    await page.getByRole('button', { name: 'Todo bien' }).click();
    await page.getByRole('button', { name: 'Ahora no' }).click();
    await page.getByText('Pídelos de una vez').waitFor();
    ok('11 permisos: un paso con los 4 y "Permitir todo"', (await page.locator('.perm-row').count()) === 4 && (await page.getByRole('button', { name: 'Permitir todo' }).count()) === 1);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(400); };
    await go('/inicio', '.quick-actions');
    ok('11 Inicio: 4 accesos rápidos', (await page.locator('.quick-action').count()) === 4);
    ok('11 Inicio: 6 favoritos y "Prueben hoy"', (await page.locator('.fav-tile:not(.fav-add)').count()) === 6 && (await page.locator('.discover-card').count()) === 1);
    ok('11 Inicio: sin "null"', !/\bnull\b/.test(await page.locator('main').innerText()));
    await page.locator('.fav-card').getByRole('button', { name: 'Editar' }).click();
    const favDlg = page.getByRole('dialog', { name: 'Sus favoritos' });
    await favDlg.getByLabel('Calendario').uncheck();
    await favDlg.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(400);
    ok('11 Inicio: quitar un favorito deja "Agregar"', (await page.locator('.fav-tile:not(.fav-add)').count()) === 5 && (await page.locator('.fav-add').count()) === 1);
    await page.locator('.quick-action', { hasText: 'Escribir carta' }).click();
    await page.getByRole('dialog', { name: /Carta para/ }).waitFor();
    ok('11 Inicio: "Escribir carta" abre el editor', true);
    await page.keyboard.press('Escape');
    // Más and hubs
    await go('/mas/nosotros', '.section-card');
    const nos = await page.locator('.section-card-name').allInnerTexts();
    ok('11 Más: Nosotros sin Fechas, Recordatorios ni Encuentro sueltos', nos.join('|') === 'Calendario|Insignias y premios|Ánimo', nos.join('|'));
    const total = await page.evaluate(async () => { const r = await import('./js/routes.js'); return r.GROUPS.flatMap((g) => g.sections.filter((s) => !s.moment && r.listed(s.id))).length; });
    ok('11 Más: 22 secciones (v0.14.0: Rasca y gana vive dentro de Insignias)', total === 22, String(total));
    await page.locator('a[href="#/calendario"]').click();
    await page.waitForSelector('.hub-tabs');
    ok('11 Calendario: pestañas Mes, Fechas, Avisos y botón Próximo encuentro', (await page.locator('.hub-tab').allInnerTexts()).join('|') === 'Mes|Fechas|Avisos' && (await page.locator('a[href="#/encuentro"]').count()) >= 1);
    await page.locator('.hub-tab', { hasText: 'Fechas' }).click();
    await page.waitForFunction(() => location.hash === '#/fechas');
    await page.locator('.page-back').click();
    await page.waitForFunction(() => location.hash === '#/mas/nosotros');
    ok('11 atrás: desde una pestaña vuelve al grupo de Más', true);
    await go('/ajustes', '.list-row');
    ok('11 Ajustes: 6 entradas', (await page.locator('nav.list .list-row').count()) === 6);
    await go('/ajustes/movimiento', '#movimiento');
    ok('11 Apariencia: incluye Movimiento y sonido', (await page.locator('.page-title').innerText()) === 'Apariencia' && (await page.getByText('Vibración suave').count()) === 1);
    await go('/ajustes/permisos', '.perm-row');
    ok('11 Ajustes: Permisos dentro de Privacidad', (await page.locator('.hub-tab.is-on').innerText()) === 'Permisos');
    await go('/ajustes/sincronizar', '.settings-page');
    ok('11 Tus datos: Copia, Sincronización y Papelera', (await page.locator('.hub-tab').allInnerTexts()).join('|') === 'Copia|Sincronización|Papelera');
    // Galería: new sources and Subir
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const blob = await (await fetch('tests/fixtures/foto-ficticia.jpg')).blob();
      const m1 = await db.putMedia(blob, { ownerStore: 'dreams', ownerId: 'd-f' });
      await db.put('dreams', { id: 'd-f', name: 'Sueño ficticio', mediaId: m1, visibility: 'shared', owner: 'both', date: '2026-05-05' });
      const m2 = await db.putMedia(blob, { ownerStore: 'letters', ownerId: 'l-f' });
      await db.put('letters', { id: 'l-f', author: 'david', to: 'sofia', condition: 'te rías', body: 'x', status: 'sealed', mediaId: m2, visibility: 'shared', owner: 'both' });
    });
    await go('/galeria', '.chip-row');
    const chips = await page.locator('.chip').allInnerTexts();
    ok('11 Galería: suma Sueños', chips.some((c) => c.startsWith('Sueños')));
    ok('11 Galería: una carta sellada no muestra su foto', !chips.some((c) => c.startsWith('Cartas')));
    await page.getByRole('link', { name: 'Subir' }).click();
    await page.getByRole('dialog').waitFor();
    ok('11 Galería: Subir abre un recuerdo nuevo', /capsula/.test(page.url()));
    await page.keyboard.press('Escape');
    const real = errs.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED/.test(e));
    ok('v0.11.0: no page errors or native dialogs', real.length === 0, real.join(' | '));
    await ctx.close(); await b11.close();
  }

  // ---------- v0.14.0: clean start, guide, garden, paper pets, Juegos tabs, Mi espacio, fixed tabs ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.addInitScript(() => { window.alert = window.confirm = window.prompt = () => { throw new Error('native dialog'); }; });
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Empezar desde cero' }).click();
    await page.getByRole('button', { name: /David/ }).click();
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    ok('14 Empezar: el resumen dice que cartas, cupones y recuerdos empiezan vacíos', /empiezan vacíos/.test(await page.locator('main').textContent()));
    for (const n of ['Todo bien', 'Ahora no', 'Continuar', 'Terminar', 'Saltar']) await page.getByRole('button', { name: n }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
    await page.waitForSelector('.garden-card');
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(300); };
    // Guide
    ok('14 Guía: Inicio muestra "Primeros pasos" con 8 pasos y 3 sugeridos', /de 8$/.test((await page.locator('.guide-card .guide-count').textContent()).trim()) && (await page.locator('.guide-step').count()) === 3);
    await go('/cartas', '.page');
    ok('14 Guía: la primera vez una sección muestra su pista', (await page.locator('.guide-hint').count()) === 1);
    await page.locator('.guide-hint').getByRole('button', { name: 'Entendido' }).click();
    await go('/inicio', '.garden-card'); await go('/cartas', '.page');
    ok('14 Guía: con "Entendido" la pista no vuelve', (await page.locator('.guide-hint').count()) === 0);
    await go('/inicio', '.guide-card');
    await page.locator('.guide-card').getByRole('button', { name: 'Ocultar' }).click();
    await page.waitForFunction(() => !document.querySelector('.guide-card'));
    ok('14 Guía: "Ocultar" la quita de Inicio', true);
    // Garden
    await page.waitForSelector('.garden-card');
    ok('14 Jardín: empieza sin flores', /0 flores/.test(await page.locator('.garden-card .guide-count').textContent()));
    await page.locator('.garden-card').getByRole('button', { name: 'Plantar hoy' }).click();
    ok('14 Jardín: se puede elegir entre 7 flores', (await page.locator('.garden-pick').count()) === 7);
    await page.locator('.garden-pick', { hasText: 'Lirio' }).click();
    await page.waitForFunction(() => /1 flor/.test(document.querySelector('.garden-card .guide-count')?.textContent || ''), null, { timeout: 8000 });
    const g = await page.evaluate(async () => { const db = await import('./js/core/db.js'); const u = await import('./js/core/util.js'); const r = await db.get('streaks', 'garden'); return r?.days?.[u.localDay()]; });
    ok('14 Jardín: la flor elegida queda guardada para los dos teléfonos', g?.david === 'lirio', JSON.stringify(g));
    ok('14 Jardín: hoy ya no ofrece plantar otra vez', /Hoy plantaste: Lirio/.test(await page.locator('.garden-card').textContent()) && (await page.locator('.garden-card').getByRole('button', { name: 'Plantar hoy' }).count()) === 0);
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); await db.put('memories', { id: 't14:m', title: 'Recuerdo ficticio', date: '2026-05-05', mediaIds: [] }); });
    await go('/ajustes', '.list-row'); await go('/inicio', '.garden-card');
    ok('14 Jardín: un recuerdo planta una sakura', /2 flores/.test(await page.locator('.garden-card .guide-count').textContent()));
    // Paper pets
    await page.locator('.garden-card .pet').click();
    await page.waitForSelector('.pet-bubble');
    ok('14 Mascotas: el panda se llama Jorge y habla al tocarlo', /^Jorge: /.test(await page.locator('.pet-bubble').textContent()));
    await page.evaluate(async () => { const pets = await import('./js/core/pets.js'); await pets.saveNames({ panda: 'Bambú' }); });
    await go('/ajustes', '.list-row'); await go('/inicio', '.garden-card');
    ok('14 Mascotas: el nombre se puede cambiar', /Bambú/.test(await page.locator('.garden-card .pet').getAttribute('aria-label')));
    // Juegos, Liga, Modos, Insignias
    await go('/juegos', '.hub-tabs');
    ok('14 Juegos: pestañas Jugar, Liga y Modos', (await page.locator('.hub-tab').allInnerTexts()).join('|') === 'Jugar|Liga|Modos');
    await go('/liga', '.liga-race');
    ok('14 Liga: ranking del mes con barras', (await page.locator('.liga-bar-fill').count()) >= 2 && (await page.locator('.liga-col').count()) === 6);
    await go('/modos', '.page');
    ok('14 Modos: Modo juntos y Modo cita a la vista', (await page.locator('main a[href="#/juegos/juntos"]').count()) >= 1 && (await page.locator('main a[href="#/modo-cita"]').count()) >= 1);
    await go('/insignias', '.hub-tabs');
    ok('14 Insignias: los premios (rasca y gana) están aquí', (await page.locator('.hub-tab').allInnerTexts()).join('|') === 'Insignias|Premios');
    await go('/mas', 'button.door');
    await page.locator('button.door[data-group="personal"]').click();
    await page.waitForFunction(() => location.hash === '#/jibun', null, { timeout: 5000 });
    ok('14 Más: Mi espacio entra directo, sin segundo toque', true);
    // Mi espacio
    await page.waitForSelector('.own-desk');
    ok('14 Mi espacio: escritorio con frase del día y 8 cajones', (await page.locator('.own-desk-line').textContent()).length > 10 && (await page.locator('.own-drawer').count()) === 8);
    await page.locator('.own-drawer', { hasText: 'Notas' }).click();
    await page.waitForSelector('.own-drawer[aria-pressed="true"]:not(:first-child)', { timeout: 5000 }).catch(() => {});
    ok('14 Mi espacio: un cajón filtra y queda marcado', (await page.locator('.own-drawer[aria-pressed="true"]').textContent()).startsWith('Notas'));
    // Calendario, Canciones
    await go('/calendario', '.cal-cell');
    ok('14 Calendario: los sábados vienen marcados como Día de novios', (await page.locator('.cal-cell.is-novios').count()) >= 4);
    await go('/canciones', '.page');
    ok('14 Canciones: un solo botón "Dedicar"', (await page.getByRole('button', { name: /Dedicar/ }).count()) === 1);
    // Old ideas from the spec applied in v0.14.0
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const blob = await (await fetch('tests/fixtures/foto-ficticia.jpg')).blob();
      const m = await db.putMedia(blob, { ownerStore: 'memories', ownerId: 't14:g' });
      await db.put('memories', { id: 't14:g', title: 'Paseo ficticio', date: '2026-06-01', mediaIds: [m], visibility: 'shared', owner: 'both' });
    });
    await go('/galeria', '.gallery-grid');
    await page.waitForSelector('.gallery-daily:not([hidden]) img', { timeout: 8000 });
    ok('14 Galería: foto del día arriba', /Foto del día/.test(await page.locator('.gallery-daily').textContent()));
    await page.getByRole('button', { name: 'Presentación' }).click();
    await page.waitForSelector('.kami-card img', { timeout: 8000 });
    ok('14 Galería: presentación en teatro de papel', (await page.locator('.kami-frame').count()) === 1 && /Paseo ficticio/.test(await page.locator('.kami-caption').textContent()));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.kami-frame'));
    await go('/citas', '.sos-card');
    await page.getByRole('button', { name: 'Cita de emergencia' }).click();
    await page.waitForSelector('.idea-card, .gacha + *', { timeout: 8000 });
    const tags = await page.locator('.idea-card').first().textContent().catch(() => '');
    ok('14 Ideas de citas: "Cita de emergencia" da una idea de 1 hora', /1 hora/.test(tags), tags.slice(0, 120));
    await go('/insignias', '.ins-badge');
    await page.mouse.move(300, 200);
    ok('14 Insignias: el brillo sigue al movimiento', /%$/.test(await page.evaluate(() => document.querySelector('main .page').style.getPropertyValue('--shine-x'))));
    await go('/resumen', '.resumen-tiles');
    await page.getByRole('button', { name: 'Ver las historias' }).click();
    await page.waitForSelector('.story-canvas');
    for (let k = 0; k < 40 && (await page.locator('.story-sign:not([hidden])').count()) === 0; k++) await page.locator('.story-next').click();
    ok('14 Resumen: la última tarjeta se firma por los dos', (await page.locator('.story-sign button').count()) === 2);
    await page.locator('.story-sign button').first().click();
    await page.waitForSelector('.story-signed');
    const sig = await page.evaluate(async () => { const db = await import('./js/core/db.js'); return (await db.query('streaks')).find((r) => r.type === 'wrapped-sign')?.signed; });
    ok('14 Resumen: la firma queda guardada para los dos teléfonos', Array.isArray(sig) && sig.length === 1, JSON.stringify(sig));
    await page.keyboard.press('Escape');
    ok('14 sin desplazamiento lateral', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    const real = errs.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(e));
    ok('v0.14.0: no page errors or native dialogs', real.length === 0, real.join(' | '));
    await ctx.close();
  }

  // ---------- v0.15.0: Contador de amor and scheduled notices ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await page.addInitScript(() => { window.alert = window.confirm = window.prompt = () => { throw new Error('native dialog'); }; });
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Empezar desde cero' }).click();
    await page.getByRole('button', { name: /David/ }).click();
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    for (const n of ['Todo bien', 'Ahora no', 'Continuar', 'Terminar', 'Saltar']) await page.getByRole('button', { name: n }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
    await page.waitForSelector('.love-card');
    const go = async (r, sel) => { await page.evaluate((h) => { location.hash = h; }, `#${r}`); await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(300); };
    const loves = () => page.evaluate(async () => { const db = await import('./js/core/db.js'); return (await db.query('streaks')).filter((r) => r.type === 'love').map((r) => r.id); });
    ok('15 Amor: Inicio tiene su tarjeta "Contador de amor" con la racha en 0', /0 días/.test(await page.locator('.love-card .love-streak').textContent()));
    ok('15 Amor: el corazón grande dice "Enviar amor"', (await page.getByRole('button', { name: /^Enviar amor a / }).count()) === 1);
    await page.locator('.love-heart').click();
    await page.waitForFunction(() => document.querySelector('.love-heart')?.getAttribute('aria-pressed') === 'true');
    const today = await page.evaluate(async () => (await import('./js/core/util.js')).localDay());
    ok('15 Amor: al tocarlo se guarda un envío para hoy, a nombre de quien lo envía', JSON.stringify(await loves()) === JSON.stringify([`love:${today}:david`]));
    await page.waitForTimeout(1600);
    await page.waitForSelector('.love-card');
    await page.locator('.love-heart').click();
    await page.waitForTimeout(400);
    ok('15 Amor: solo se envía una vez al día por persona', (await loves()).length === 1);
    ok('15 Amor: la tarjeta queda en "Amor enviado hoy"', /Amor enviado hoy/.test(await page.locator('.love-heart').textContent()));
    // Partner's sends and three earlier days of both: a 4-day streak; a gap before them does not count.
    await page.evaluate(async () => {
      const db = await import('./js/core/db.js'); const util = await import('./js/core/util.js');
      const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return util.localDay(x); };
      const put = (n, who) => db.put('streaks', { id: `love:${d(n)}:${who}`, type: 'love', by: who, day: d(n), visibility: 'shared', owner: 'both' });
      await put(0, 'sofia'); for (const n of [1, 2, 3]) { await put(n, 'david'); await put(n, 'sofia'); }
      for (const n of [5, 6]) { await put(n, 'david'); await put(n, 'sofia'); } // older run of 2, day 4 missing
    });
    await go('/ajustes', '.page'); await go('/inicio', '.love-card');
    ok('15 Amor: racha de días seguidos en que los dos enviaron amor', /4 días/.test(await page.locator('.love-card .love-streak').textContent()));
    ok('15 Amor: cuenta el total enviado entre los dos', /12\s*Amor enviado/.test(await page.locator('.love-stats').innerText()));
    ok('15 Amor: dice cuando hoy lo enviaron los dos', /se enviaron amor los dos/.test(await page.locator('.love-hint').textContent()));
    const pts = Number((await page.locator('.love-stat strong').nth(2).textContent()).trim());
    await page.evaluate(async () => { const db = await import('./js/core/db.js'); await db.put('content', { kind: 'letter', title: 'Carta ficticia', body: 'Texto ficticio', status: 'draft', author: 'david', visibility: 'shared', owner: 'both' }); });
    await go('/ajustes', '.page'); await go('/inicio', '.love-card');
    ok('15 Amor: los puntos suben con lo que hacen juntos (una carta = +10)', Number((await page.locator('.love-stat strong').nth(2).textContent()).trim()) === pts + 10, `${pts}`);
    ok('15 Amor: muestra el nivel y cuánto falta para el siguiente', /Nivel \S+\. Faltan \d+ puntos para "/.test(await page.locator('.love-card').textContent()));
    const streak = await page.evaluate(async () => {
      const m = await import('./js/features/amor.js');
      const L = (day, by) => ({ day, by });
      return [m.streakOf([L('2026-11-20', 'david'), L('2026-11-20', 'sofia'), L('2026-11-21', 'david'), L('2026-11-21', 'sofia')], '2026-11-22').current,
        m.streakOf([L('2026-11-21', 'david'), L('2026-11-21', 'sofia'), L('2026-11-22', 'david')], '2026-11-22').current,
        m.streakOf([L('2026-11-20', 'david'), L('2026-11-20', 'sofia')], '2026-11-22').current,
        m.streakOf([L('2026-11-01', 'david'), L('2026-11-01', 'sofia'), L('2026-11-02', 'david'), L('2026-11-02', 'sofia'), L('2026-11-03', 'david'), L('2026-11-03', 'sofia')], '2026-11-22').best];
    });
    ok('15 Amor: la racha sigue viva hasta que termina el día y se corta si falta uno', JSON.stringify(streak) === '[2,1,0,3]', JSON.stringify(streak));
    // Scheduled notices: the plan this device would hand to the server.
    const plan = await page.evaluate(async () => {
      const m = await import('./js/features/avisos.js'); const sync = await import('./js/core/sync.js');
      const items = await m.plan();
      const day = (x) => new Date(x.at).toDateString();
      const todayStr = new Date().toDateString();
      return { kinds: [...new Set(items.map((x) => x.k.split(':').slice(0, 2).join(':')))], n: items.length, future: items.every((x) => x.at > Date.now()),
        loveToday: items.some((x) => x.k === 'loveRemind' && day(x) === todayStr), love: items.filter((x) => x.k === 'loveRemind').length,
        hour: new Date(items.find((x) => x.k === 'loveRemind').at).getHours(), prefs: sync.noticePrefs(), noContent: items.every((x) => Object.keys(x).join() === 'at,k') };
    });
    ok('15 Avisos: el plan incluye mesiversario y recordatorio de amor', plan.kinds.includes('r:monthiversary') && plan.kinds.includes('loveRemind'), plan.kinds.join(', '));
    ok('15 Avisos: todo es a futuro y no lleva contenido (solo hora y tipo)', plan.future && plan.noContent);
    ok('15 Avisos: "¿Ya enviaste amor hoy?" no se programa hoy si ya lo enviaste', !plan.loveToday && plan.love >= 20);
    ok('15 Avisos: el recordatorio de amor va a las 20:00 por defecto', plan.hour === 20 && plan.prefs.loveAt === '20:00');
    const planOff = await page.evaluate(async () => {
      const db = await import('./js/core/db.js');
      const all = await db.query('reminders'); for (const r of all.filter((x) => x.kind === 'monthiversary')) await db.put('reminders', { ...r, enabled: false });
      const ev = { id: 'ev-aviso', title: 'Plan ficticio', start: (() => { const x = new Date(); x.setDate(x.getDate() + 5); return `${x.toISOString().slice(0, 10)}T19:00`; })(), remind: '1h', visibility: 'shared', owner: 'both' };
      await db.put('events', ev);
      const m = await import('./js/features/avisos.js');
      const items = await m.plan();
      const e = items.find((x) => x.k === 'r:event:0');
      return { month: items.some((x) => x.k.startsWith('r:monthiversary')), ev: e ? new Date(e.at).getHours() : null };
    });
    ok('15 Avisos: lo apagado en Recordatorios no se programa', !planOff.month);
    ok('15 Avisos: un plan del Calendario con aviso de 1 hora llega una hora antes', planOff.ev === 18, String(planOff.ev));
    ok('15 Avisos: sin equipos unidos no se envía nada al servidor', (await page.evaluate(async () => (await import('./js/core/sync.js')).scheduleNotices([{ at: Date.now() + 3600000, k: 'loveRemind' }]))) === null);
    // App shortcut and the service worker's fixed words.
    const man = await page.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).shortcuts.map((s) => `${s.name}|${s.url}`));
    ok('15 Atajo: el ícono tiene "Enviar amor" al mantenerlo presionado', man.includes('Enviar amor|./#/inicio?amor=1'), man.join(', '));
    const swText = await page.evaluate(async () => (await fetch('sw.js')).text());
    ok('15 Avisos: el service worker tiene textos fijos para amor y recordatorios', /loveRemind:/.test(swText) && /love:/.test(swText) && /function noticeText/.test(swText) && /monthiversary:/.test(swText));
    ok('15 sin desplazamiento lateral', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    const real = errs.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(e));
    ok('v0.15.0: no page errors or native dialogs', real.length === 0, real.join(' | '));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
