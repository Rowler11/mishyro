// Render the PNG app icons from icons/icon.svg and icons/maskable.svg (hand-made SVGs; needs Playwright + Chromium).
// Usage: node tools/render-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.join(__dirname, '..', 'icons');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const jobs = [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['maskable.svg', 'maskable-512.png', 512],
    // v0.22.0: own icons for the long-press shortcuts (Android masks them to a circle)
    ['sc-amor.svg', 'sc-amor-192.png', 192], ['sc-pregunta.svg', 'sc-pregunta-192.png', 192], ['sc-pensando.svg', 'sc-pensando-192.png', 192]];
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(dir, src), 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await browser.close();
  console.log('icons rendered');
})();
