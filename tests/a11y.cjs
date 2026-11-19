// Accessibility check with axe-core on every Fase 1 view, day and night.
// Runs with reduced motion so axe reads final colors, not mid-fade ones.
// Usage: BASE=http://127.0.0.1:8765/mishyro/ AXE=/path/to/axe.min.js node tests/a11y.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/mishyro/';
const AXE = fs.readFileSync(process.env.AXE, 'utf8');
const SEED = path.join(__dirname, '..', 'seed-privado.example.json');

(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const theme of ['day', 'night']) {
    for (const width of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, bypassCSP: true, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(BASE);
      const scan = async (label) => {
        // Let entry animations (stagger, fades) finish so axe reads final colors.
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations
          .map((v) => `${v.impact} ${v.id}: ${v.nodes.length} × ${v.nodes.slice(0, 2).map((n) => `${n.target.join(' ')}${n.any[0]?.data?.contrastRatio ? ` (${n.any[0].data.fgColor} on ${n.any[0].data.bgColor} = ${n.any[0].data.contrastRatio})` : ''}`).join(' | ')}`));
        total += r.length;
        console.log(`${r.length ? 'FAIL' : 'PASS'} ${theme} @${width} ${label}${r.length ? `\n   ${r.join('\n   ')}` : ''}`);
      };
      await page.getByRole('button', { name: 'Empezar' }).waitFor();
      await page.evaluate(async (t) => { (await import('./js/core/theme.js')).apply({ theme: t }); }, theme);
      await scan('setup 1');
      await page.getByRole('button', { name: 'Empezar' }).click();
      await scan('setup 2');
      await page.getByRole('button', { name: /Sofía/ }).click();
      await scan('setup 3');
      await page.setInputFiles('#seed-file', SEED);
      await page.getByRole('button', { name: 'Importar' }).click();
      await page.getByText('Revisen que todo esté bien').waitFor();
      await scan('setup 4');
      await page.getByRole('button', { name: 'Todo bien' }).click();
      await scan('setup 5');
      await page.getByRole('button', { name: 'Ahora no' }).click();
      await scan('setup 6');
      await page.getByRole('button', { name: 'Terminar' }).click();
      await page.getByText('Un lugar solo de los dos').waitFor();
      await page.waitForTimeout(500);
      await scan('historia');
      await page.getByRole('button', { name: 'Saltar' }).click();
      await page.waitForFunction(() => location.hash === '#/inicio');
      await page.evaluate(async (t) => { (await import('./js/core/theme.js')).apply({ theme: t }); }, theme);
      for (const r of ['/inicio', '/capsula', '/capsula/nuevo', '/cupones', '/cartas', '/mas', '/ajustes', '/ajustes/apariencia', '/ajustes/movimiento', '/ajustes/legal', '/ajustes/legal/privacidad', '/ajustes/acerca', '/ajustes/guia-estilo', '/calendario']) {
        await page.evaluate((p) => { location.hash = `#${p}`; }, r);
        await page.waitForTimeout(700);
        await scan(r);
      }
      await page.evaluate(() => { location.hash = '#/ajustes/guia-estilo'; });
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Modal', exact: true }).click();
      await page.waitForTimeout(500);
      await scan('modal');
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${total} violations`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
