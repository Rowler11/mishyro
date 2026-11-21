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
        // meta-viewport off on purpose: David asked for no pinch zoom (2026-11-19); text size lives in Apariencia.
        const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'], rules: { 'meta-viewport': { enabled: false }, 'meta-viewport-large': { enabled: false } } })).violations
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
      for (const r of ['/inicio', '/capsula', '/capsula/nuevo', '/cupones', '/cartas', '/mas', '/ajustes', '/ajustes/perfil', '/ajustes/seguridad', '/ajustes/privacidad', '/ajustes/terceros', '/ajustes/copia', '/ajustes/apariencia', '/ajustes/movimiento', '/ajustes/legal', '/ajustes/legal/privacidad', '/ajustes/legal/version', '/buscar', '/ajustes/acerca', '/ajustes/guia-estilo', '/calendario', '/preguntas', '/canciones', '/diario', '/animo', '/jibun', '/retos', '/fechas', '/recordatorios', '/galeria', '/album', '/mapa', '/primeras-veces', '/photobooth', '/capsula-tiempo', '/planes', '/suenos', '/citas', '/regalos', '/encuentro', '/voz', '/lenguajes', '/gratitud', '/insignias', '/resumen', '/mascotas', '/listas', '/recetas', '/alcancia', '/gastos', '/habitos', '/rasca', '/ciclo', '/juegos', '/juegos/historial', '/juegos/ajustes', '/juegos/bancos', '/juegos/recuerdo', '/juegos/tesoro', '/juegos/cata', '/juegos/cocina', '/juegos/bingo', '/juegos/misteriosa', '/juegos/reto30', '/juegos/cine', '/juegos/origami', '/juegos/tanabata', '/juegos/kotoba', '/juegos/manga', '/juegos/postales', '/eventos', '/ajustes/papelera', '/modo-cita']) {
        await page.evaluate((p) => { location.hash = `#${p}`; }, r);
        await page.waitForTimeout(700);
        await scan(r);
      }
      await page.evaluate(() => { location.hash = '#/ajustes/guia-estilo'; });
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Modal', exact: true }).click();
      await page.waitForTimeout(500);
      await scan('modal');
      await page.keyboard.press('Escape');
      // Fase 6: Rincón (fictitious birthdays and content only)
      await page.evaluate(async () => {
        const db = await import('./js/core/db.js');
        for (const [p, d] of [['sofia', '1995-01-01'], ['david', '1994-02-02']]) await db.put('specialDates', { id: `a11y:birth:${p}`, title: 'Cumpleaños ficticio', kind: 'birthday', date: d, recurring: 'yearly', personOrPetId: p });
      });
      const hash = async (p, sel) => { await page.evaluate((h) => { location.hash = `#${h}`; }, p); if (sel) await page.waitForSelector(sel, { timeout: 20000 }); await page.waitForTimeout(700); };
      const pin = async () => { await page.locator('.pin-input').last().fill('246810'); await page.waitForTimeout(250); };
      await hash('/yoru', '.yoru-first');
      await scan('/yoru primera entrada');
      await page.getByRole('button', { name: 'Crear el PIN de 6' }).click();
      await page.waitForSelector('.pin-input');
      await scan('/yoru crear PIN');
      await pin(); await pin();
      await page.waitForSelector('.consent-btn', { timeout: 30000 });
      await scan('/yoru consentimiento');
      await page.locator('.consent-btn').nth(0).click(); await page.locator('.consent-btn').nth(1).click();
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.waitForSelector('.yoru-level');
      await page.evaluate(async () => {
        const V = await import('./js/core/vault.js');
        const txt = ['pregunta | 0 | Frase ficticia uno', 'pregunta | 1 | Frase ficticia dos', 'reto | 1 | Reto ficticio | | 20', 'idea | 1 | Idea ficticia A', 'idea | 1 | Idea ficticia B', 'mimos | 1 | Mimo ficticio'].join('\n');
        await V.addPack(V.parseContent(txt, 'ficticio.txt').pack);
      });
      await hash('/yoru', '.yoru-level');
      await scan('/yoru inicio');
      for (const r of ['/yoru/ajustes', '/yoru/diario', '/yoru/grabaciones', '/yoru/contenido', '/yoru/si-no-quiza']) { await hash(r, '.page'); await scan(r); }
      await hash('/yoru/juego/preguntas', '.consent-btn');
      await scan('/yoru juego: consentimiento');
      await page.locator('.consent-btn').nth(0).click(); await page.locator('.consent-btn').nth(1).click();
      await page.getByRole('button', { name: 'Empezar', exact: true }).click();
      await page.waitForSelector('.yoru-bar'); await page.waitForTimeout(700);
      await scan('/yoru juego: carta');
      await page.getByRole('button', { name: 'Pausa' }).click(); await page.waitForSelector('.yoru-pause');
      await scan('/yoru juego: pausa');
      await page.locator('.yoru-pause').getByRole('button', { name: 'Parar' }).click();
      await page.waitForTimeout(900);
      await scan('/yoru juego: descanso');
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\n${total} violations`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
