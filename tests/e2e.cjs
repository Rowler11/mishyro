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
    ok('setup: first backup downloads with the backup format', backup.format === 'aniversario-backup' && backup.schemaVersion === 1);
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
    // Más: collapsible groups, only one open at a time
    const openCount = () => page.$$eval('.acc-head[aria-expanded="true"]', (h) => h.length);
    const heads = page.locator('.acc-head');
    ok(`más @${w}: one group open on arrival`, (await openCount()) === 1);
    await heads.nth(1).click();
    await page.waitForTimeout(350);
    ok(`más @${w}: opening another group closes the first`, (await openCount()) === 1 && (await heads.nth(1).getAttribute('aria-expanded')) === 'true');
    ok(`más @${w}: open group shows cards with description`, await page.locator('#gb-recuerdos .section-card-blurb').first().isVisible());
    await heads.nth(1).click();
    await page.waitForTimeout(350);
    ok(`más @${w}: tapping the open group closes it`, (await openCount()) === 0);
    ok(`más @${w}: moments (Resumen, Cápsula del tiempo, Temporadas) are not listed`, (await page.$$eval('.section-card', (c) => c.filter((x) => ['#/resumen', '#/capsula-tiempo', '#/eventos'].includes(x.getAttribute('href'))).length)) === 0);
    await heads.nth(0).click();
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
    await page.waitForTimeout(250);
    await page.keyboard.press('2');
    await page.waitForTimeout(200);
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

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
