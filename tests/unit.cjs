// Runs tests/unit.html in Chromium and prints the results.
// Usage: BASE=http://127.0.0.1:8765/mishyro/ node tests/unit.cjs
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/mishyro/';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}tests/unit.html`);
  const results = await page.waitForFunction(() => window.__results, null, { timeout: 120000 }).then((h) => h.jsonValue());
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n   ${r.error}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
