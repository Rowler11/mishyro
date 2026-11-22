// Sync tests (Fase A): several devices as separate browser profiles against `wrangler dev`.
// Usage: npx wrangler dev --port 8787 --ip 127.0.0.1   (from the repo), then
//   BASE=http://127.0.0.1:8787/ node tests/sync.cjs
// Uses only the fictitious seed-privado.example.json. Pairing is driven through the app's own
// module (the camera cannot be used headless); the QR screens are checked separately.
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const SHOTS = process.env.SHOTS || '';
const SEED = path.join(__dirname, '..', 'seed-privado.example.json');
const results = [];
const ok = (name, pass, note = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`); };

async function device(browser, who, { seed = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true }); // only so the test can drive the app's modules
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE);
  await page.getByRole('link', { name: 'Empezar desde cero' }).click();
  await page.getByRole('button', { name: who === 'sofia' ? /Sofía/ : /David/ }).click();
  if (seed) {
    await page.setInputFiles('#seed-file', SEED);
    await page.getByRole('button', { name: 'Importar' }).click();
    await page.getByRole('button', { name: 'Todo bien' }).click();
    await page.getByRole('button', { name: 'Ahora no' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.waitForFunction(() => location.hash === '#/inicio');
  }
  return { ctx, page, errors };
}
const mod = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const sync = await import('./js/core/sync.js');
  const db = await import('./js/core/db.js');
  // eslint-disable-next-line no-new-func
  return new Function('sync', 'db', 'a', `return (async () => { ${src} })()`)(sync, db, a);
}, [fn, arg]);
const waitFor = async (page, src, arg, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await mod(page, src, arg)) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

(async () => {
  const browser = await chromium.launch();
  try {
    // A: Sofía's phone creates the space.
    const A = await device(browser, 'sofia');
    await A.page.goto(`${BASE}#/ajustes/sincronizar`);
    await A.page.getByRole('button', { name: 'Crear nuestro espacio' }).click();
    await A.page.getByRole('button', { name: 'Crear', exact: true }).click();
    await A.page.getByText('Equipos unidos').waitFor();
    ok('crear el espacio', await waitFor(A.page, 'return sync.status().linked && sync.status().online;'));
    if (SHOTS) await A.page.screenshot({ path: path.join(SHOTS, 'sync-390-dia.png') });

    // Local data written before linking B.
    await mod(A.page, "await db.put('memories', { id: 'mem-a1', date: '2026-01-01', title: 'Recuerdo ficticio A', note: '' });");

    // B: David's phone (with its own seed) joins with a code for David.
    const B = await device(browser, 'david');
    await mod(B.page, "await db.put('memories', { id: 'mem-b1', date: '2026-02-02', title: 'Recuerdo ficticio B', note: '' });");
    const codeB = await mod(A.page, "return sync.makeInvite('david');");
    ok('código QR compacto', codeB.startsWith('AISHI1:') && codeB.length < 260, `${codeB.length} caracteres`);
    const joined = await mod(B.page, 'return sync.joinWithCode(a);', codeB);
    ok('unir el segundo equipo', joined === 'joined');
    ok('se juntan los datos de ambos (A recibe lo de B)', await waitFor(A.page, "return !!(await db.rawGet('memories', 'mem-b1'));"));
    ok('se juntan los datos de ambos (B recibe lo de A)', await waitFor(B.page, "return !!(await db.rawGet('memories', 'mem-a1'));"));
    ok('el mismo código no sirve dos veces', await mod(B.page, 'try { await sync.leave({ server: false }); } catch {} return true;') && await (async () => {
      try { await mod(B.page, 'return sync.joinWithCode(a);', codeB); return false; } catch { return true; }
    })());
    // B joins again with a fresh code.
    const codeB2 = await mod(A.page, "return sync.makeInvite('david');");
    await mod(B.page, 'return sync.joinWithCode(a);', codeB2);
    await waitFor(B.page, 'return sync.status().online;');

    // Live change A -> B.
    const t0 = Date.now();
    await mod(A.page, "await db.put('thinkingOfYou', { id: 'toy-1', at: new Date().toISOString(), by: 'sofia', phraseId: 'x' });");
    const live = await waitFor(B.page, "return !!(await db.rawGet('thinkingOfYou', 'toy-1'));", null, 5000);
    ok('cambio en vivo de A a B', live, `${Date.now() - t0} ms`);

    // Edit on B, wins on A (last write).
    await mod(B.page, "const r = await db.get('memories', 'mem-a1'); await db.put('memories', { ...r, title: 'Editado en B' });");
    ok('gana el último cambio', await waitFor(A.page, "return (await db.get('memories', 'mem-a1'))?.title === 'Editado en B';"));

    // Private "Solo yo" of Sofía: never reaches David's device.
    await mod(A.page, "await db.put('personal', { id: 'self-1', owner: 'sofia', visibility: 'self', kind: 'note', text: 'Solo de Sofía (ficticio)' });");
    await A.page.waitForTimeout(1500);
    ok('"Solo yo" de Sofía no llega al equipo de David', !(await mod(B.page, "return !!(await db.rawGet('personal', 'self-1'));")));

    // Fase 4B: the cycle. Only what Sofía marks "Visible para David" reaches him; un-marking removes it.
    await mod(A.page, "await db.put('cycleDays', { id: 'cycle:2026-11-01', date: '2026-11-01', period: true, flow: 'light', owner: 'sofia', visibility: 'self', visibleToPartner: false, private: true }); await db.put('cycleDays', { id: 'cycle:2026-11-02:v', date: '2026-11-02', period: true, flow: 'light', owner: 'sofia', visibility: 'shared', visibleToPartner: true, private: true }); await db.put('intimateLog', { id: 'il-1', date: '2026-11-02', note: 'ficticia', owner: 'sofia', visibility: 'self', visibleToPartner: false, private: true });");
    ok('ciclo: lo marcado visible llega a David', await waitFor(B.page, "return !!(await db.rawGet('cycleDays', 'cycle:2026-11-02:v'));"));
    ok('ciclo: lo no marcado y la capa privada no llegan a David', !(await mod(B.page, "return !!(await db.rawGet('cycleDays', 'cycle:2026-11-01')) || !!(await db.rawGet('intimateLog', 'il-1'));")));
    await mod(A.page, "await db.purge('cycleDays', 'cycle:2026-11-02:v'); await db.put('cycleDays', { id: 'cycle:2026-11-02', date: '2026-11-02', period: true, flow: 'light', owner: 'sofia', visibility: 'self', visibleToPartner: false, private: true });");
    ok('ciclo: al desmarcarlo se borra del equipo de David', await waitFor(B.page, "return !(await db.rawGet('cycleDays', 'cycle:2026-11-02:v'));"));
    // Papelera (v0.10.0): a deletion travels; bringing it back from the Papelera travels again, photo included.
    await mod(A.page, "const mid = await db.putMedia(new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }), { ownerStore: 'memories', ownerId: 'mem-tr' }); await db.put('memories', { id: 'mem-tr', date: '2026-03-03', title: 'Recuerdo ficticio a la papelera', note: '', mediaIds: [mid] });");
    ok('papelera: el recuerdo con foto llega a David', await waitFor(B.page, "const m = await db.rawGet('memories', 'mem-tr'); return !!m && !!(await db.getMedia(m.mediaIds[0]));", null, 12000));
    const tid = await mod(A.page, "return db.trash('memories', 'mem-tr', { label: 'x' });");
    ok('papelera: al borrarlo se va también del equipo de David', await waitFor(B.page, "return !(await db.rawGet('memories', 'mem-tr'));", null, 12000));
    await mod(A.page, 'return db.restore(a);', tid);
    ok('papelera: al recuperarlo vuelve a David con su foto', await waitFor(B.page, "const m = await db.rawGet('memories', 'mem-tr'); return !!m && !!(await db.getMedia(m.mediaIds[0]));", null, 15000), JSON.stringify(await mod(B.page, "const m = await db.rawGet('memories', 'mem-tr'); return { m: !!m, raw: m ? !!(await db.rawGet('media', m.mediaIds[0])) : null };")));
    ok('papelera: la Papelera no viaja (David no la tiene)', (await mod(B.page, "return (await db.rawAll('trash')).length;")) === 0);
    // C: Sofía's PC joins with the "mine" code and gets her "Solo yo".
    const C = await device(browser, 'sofia', { seed: false });
    const codeC = await mod(A.page, "return sync.makeInvite('sofia');");
    await mod(C.page, 'return sync.joinWithCode(a);', codeC);
    ok('"Solo yo" de Sofía llega a su PC', await waitFor(C.page, "return !!(await db.rawGet('personal', 'self-1'));"));
    const selfPhoto = await mod(A.page, "return db.putMedia(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), { ownerStore: 'personal', ownerId: 'self-1' });");
    ok('foto de "Solo yo" llega a su PC', await waitFor(C.page, 'return !!(await db.getMedia(a));', selfPhoto));
    ok('foto de "Solo yo" no llega al equipo de David', !(await mod(B.page, "return !!(await db.rawGet('media', a));", selfPhoto)));
    ok('ciclo: lo de Sofía llega a su PC', await waitFor(C.page, "return !!(await db.rawGet('cycleDays', 'cycle:2026-11-01')) && !!(await db.rawGet('intimateLog', 'il-1'));"));
    ok('el PC sin seed recibe todo', await waitFor(C.page, "return (await db.rawAll('memories')).length >= 2 && !!(await db.rawGet('profile', 'people'));"));

    // Photos: bytes arrive intact.
    const sent = await mod(A.page, `
      const bytes = new Uint8Array(2.5 * 1024 * 1024); for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
      const id = await db.putMedia(new Blob([bytes], { type: 'image/jpeg' }), { ownerStore: 'memories', ownerId: 'mem-a1' });
      return id;`);
    ok('foto de 2,5 MB llega completa', await waitFor(B.page, `
      const b = await db.getMedia(a); if (!b) return false;
      const x = new Uint8Array(await b.arrayBuffer()); return x.length === 2.5 * 1024 * 1024 && x[12345] === (12345 * 7) % 251;`, sent, 15000));

    // v0.4.1: photos live in the 5 shards, not in the main object, and deleting a photo frees its space.
    const u1 = await mod(A.page, 'return sync.refreshUsage({ force: true });');
    const MB = 1024 * 1024;
    ok('espacio: la foto de 2,5 MB cabe en los bloques y no en el objeto principal', u1 && u1.used >= 2.5 * MB && u1.pct >= 0, JSON.stringify(u1));
    const raw = await mod(A.page, `
      const c = await db.rawGet('settings', 'sync');
      const r = await fetch(new URL('api/s/' + c.spaceId + '/usage', document.baseURI), { headers: { authorization: 'Bearer ' + c.deviceId + '.' + c.token } });
      return r.json();`);
    ok('espacio: 5 bloques, la foto no está en el principal', raw.shards?.length === 5 && raw.own < 1.5 * MB && raw.shards.reduce((x, y) => x + y, 0) >= 2.5 * MB, JSON.stringify(raw));
    ok('espacio: el medidor guarda su último valor en el equipo', !!(await mod(A.page, 'return sync.lastUsage();')));
    await mod(A.page, "await db.purge('media', a);", sent);
    ok('espacio: borrar la foto libera su espacio', await (async () => {
      for (let i = 0; i < 20; i++) {
        const r = await mod(A.page, `
          const c = await db.rawGet('settings', 'sync');
          const x = await fetch(new URL('api/s/' + c.spaceId + '/usage', document.baseURI), { headers: { authorization: 'Bearer ' + c.deviceId + '.' + c.token } });
          return (await x.json()).shards.reduce((p, q) => p + q, 0);`);
        if (r < 1.2 * MB) return true;
        await new Promise((res) => setTimeout(res, 800));
      }
      return false;
    })());

    // The meter warns from 80 % and says plainly when it is full (the server answer is faked: 1 GB cannot be filled here).
    await A.page.route('**/api/s/*/usage', (r) => r.fulfill({ json: { own: 1000, shards: [0, 0, 0, 0, 0], used: 900 * MB, shardLimit: 1024 * MB, accountLimit: 5120 * MB, pct: 88 } }));
    await A.page.evaluate(() => { location.hash = '#/inicio'; });
    await A.page.waitForTimeout(400);
    await A.page.evaluate(() => { location.hash = '#/ajustes/sincronizar'; });
    await A.page.getByText('Se está llenando').waitFor({ timeout: 8000 }).then(() => ok('espacio: avisa con cariño al 80 %', true)).catch(() => ok('espacio: avisa con cariño al 80 %', false));
    await A.page.evaluate(() => { location.hash = '#/inicio'; });
    await A.page.waitForTimeout(1500);
    ok('espacio: Inicio avisa que la nube se llena', (await A.page.locator('.today-row', { hasText: 'La nube se está llenando' }).count()) === 1);
    await A.page.unroute('**/api/s/*/usage');
    await A.page.route('**/api/s/*/usage', (r) => r.fulfill({ json: { own: 1000, shards: [0, 0, 0, 0, 0], used: 5000 * MB, shardLimit: 1024 * MB, accountLimit: 5120 * MB, pct: 100 } }));
    await A.page.evaluate(() => { location.hash = '#/ajustes/sincronizar'; });
    await A.page.getByText('Se llenó el espacio').waitFor({ timeout: 8000 }).then(() => ok('espacio: dice claro cuando se llenó', true)).catch(() => ok('espacio: dice claro cuando se llenó', false));
    await A.page.unroute('**/api/s/*/usage');
    await mod(A.page, "await db.setSettings('syncUsage', { pct: 3, used: 1, accountLimit: 1, at: '' });");

    // Deletion travels.
    await mod(A.page, "await db.purge('thinkingOfYou', 'toy-1');");
    ok('borrar en A borra en B', await waitFor(B.page, "return !(await db.rawGet('thinkingOfYou', 'toy-1'));"));

    // D: a PC that shows its own code; A scans it (pairing mailbox).
    const D = await device(browser, 'david', { seed: false });
    const pairCode = await D.page.evaluate(async () => {
      const sync = await import('./js/core/sync.js');
      window.__pair = await sync.requestPairing();
      window.__pairDone = window.__pair.wait.then((r) => r);
      return window.__pair.code;
    });
    await mod(A.page, 'return sync.answerPairing(sync.parseCode(a), "david");', pairCode);
    const pr = await D.page.evaluate(() => window.__pairDone);
    ok('unir un PC mostrando su código', pr === 'joined');
    ok('el PC recibe los datos', await waitFor(D.page, "return !!(await db.rawGet('memories', 'mem-b1'));"));
    // v0.13: the same, typing the 10-letter short code on the linked phone (no camera needed).
    const E = await device(browser, 'sofia', { seed: false });
    const short = await E.page.evaluate(async () => {
      const sync = await import('./js/core/sync.js');
      window.__pair2 = await sync.requestPairing();
      window.__pair2Done = window.__pair2.wait.then((r) => r);
      return window.__pair2.short;
    });
    ok('código corto: 10 letras y números legibles', /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(short), short);
    ok('código corto: una letra mal escrita no sirve', !(await mod(A.page, 'return sync.isShortCode(a);', short.replace(/-/, '').slice(0, 9))));
    await mod(A.page, 'return sync.answerPairing(await sync.parseShort(a), "sofia");', short.toLowerCase().replace('-', ' '));
    ok('unir un equipo escribiendo el código corto', (await E.page.evaluate(() => window.__pair2Done)) === 'joined');
    ok('el equipo unido con el código corto es de Sofía', await mod(E.page, 'return sync.status().me === "sofia";'));
    await E.ctx.close();

    // Device list with readable names (decrypted on the device).
    const devs = await mod(A.page, 'return (await sync.refreshDevices()).map((d) => d.name);');
    ok('lista de equipos con nombres', devs.length === 6 && devs.every((n) => /^(PC|Celular) de \S/.test(n)), devs.join(', ')); // 6: B left once without telling the server

    // Remove D from A: D loses access at once.
    const dId = await mod(D.page, 'return sync.status().deviceId;');
    await mod(A.page, 'await sync.removeDevice(a);', dId);
    ok('sacar un equipo lo desconecta', await waitFor(D.page, 'return sync.status().removed;'));

    // Recovery (2026-11-21): 12 words and the passkey bring a reinstalled phone back, "Solo yo" included.
    {
      const rmod = (page, src, arg) => page.evaluate(async ([code, x]) => {
        const rescue = await import('./js/core/rescue.js');
        const sync = await import('./js/core/sync.js');
        const db = await import('./js/core/db.js');
        // eslint-disable-next-line no-new-func
        return new Function('rescue', 'sync', 'db', 'a', `return (async () => { ${code} })()`)(rescue, sync, db, x);
      }, [src, arg]);
      await mod(A.page, "await db.put('memories', { id: 'mem-self-r', date: '2026-03-03', title: 'Solo de Sofía (respaldo)', note: '', visibility: 'self', owner: 'sofia' });");
      const words = await rmod(A.page, 'const w = await rescue.newPhrase(); await rescue.protect({ phrase: w }); return w;');
      ok('frase: 12 palabras válidas', words.length === 12 && (await rmod(A.page, 'return (await rescue.checkPhrase(a.join(" "))).ok;', words)));
      ok('frase: detecta una palabra cambiada', !(await rmod(A.page, 'const w = [...a]; w[3] = w[3] === "abeja" ? "ábaco" : "abeja"; return (await rescue.checkPhrase(w.join(" "))).ok;', words)));
      ok('frase: tildes y mayúsculas no importan', await rmod(A.page, 'return (await rescue.checkPhrase(a.map((x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()).join("  "))).ok;', words));
      const E = await device(browser, 'david', { seed: false });
      let wrong = false;
      try { const other = await rmod(E.page, 'return rescue.newPhrase();'); await rmod(E.page, 'return rescue.restore({ phrase: a });', other); } catch { wrong = true; }
      ok('frase equivocada no entra', wrong);
      ok('volver a entrar con la frase', (await rmod(E.page, 'return rescue.restore({ phrase: a });', words)) === 'joined');
      ok('vuelve como la misma persona', await waitFor(E.page, "return sync.status().me === 'sofia';"));
      ok('llegan los datos compartidos', await waitFor(E.page, "return !!(await db.rawGet('memories', 'mem-a1'));"));
      ok('llega lo de "Solo yo"', await waitFor(E.page, "const m = await db.get('memories', 'mem-self-r').catch(() => null); return m?.title === 'Solo de Sofía (respaldo)';"));
      ok('la frase sirve otra vez (no se gasta)', await (async () => {
        const F = await device(browser, 'david', { seed: false });
        const r = await rmod(F.page, 'return rescue.restore({ phrase: a });', words).catch(() => null);
        await F.ctx.close(); return r === 'joined';
      })());
      // Passkey with PRF on a virtual authenticator (the credential is copied to the "new" phone).
      try {
        const cdpA = await A.ctx.newCDPSession(A.page);
        await cdpA.send('WebAuthn.enable');
        const { authenticatorId } = await cdpA.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
        // The virtual authenticator cannot export its PRF seed, so the "new phone" gets the secret that the
        // fingerprint gives on A (in real life Google's password manager syncs the passkey itself).
        const made = await rmod(A.page, 'const s = await rescue.createPasskey("Sofía"); if (!s) return null; await rescue.protect({ passkey: s }); return Array.from(s);');
        ok('huella: se guarda el respaldo', !!made);
        const again = await rmod(A.page, 'const s = await rescue.passkeySecret(); return s ? Array.from(s) : null;');
        ok('huella: la misma huella da la misma llave', !!again && again.join() === made.join());
        void authenticatorId;
        const G = await device(browser, 'david', { seed: false });
        const r = await rmod(G.page, 'return rescue.restore({ passkey: new Uint8Array(a) });', again);
        ok('volver a entrar con la huella', r === 'joined', String(r));
        ok('con la huella llega "Solo yo"', await waitFor(G.page, "const m = await db.get('memories', 'mem-self-r').catch(() => null); return !!m?.title;"));
        await G.ctx.close();
      } catch (e) { ok('volver a entrar con la huella', false, e.message); }
      for (const d of ['E']) ok(`consola limpia (${d})`, E.errors.length === 0, E.errors.slice(0, 3).join(' | '));
      await E.ctx.close();
    }

    // The server stores nothing readable.
    const leak = await A.page.evaluate(async () => {
      const s = (await import('./js/core/sync.js')).status();
      const cfg = await (await import('./js/core/db.js')).rawGet('settings', 'sync');
      const r = await fetch(`api/s/${cfg.spaceId}/ops?since=0`, { headers: { authorization: `Bearer ${cfg.deviceId}.${cfg.token}` } });
      const text = await r.text();
      return { linked: s.linked, readable: /Recuerdo ficticio|Editado en B|Solo de Sofía|memories|personal/.test(text) };
    });
    ok('el servidor no ve nada legible', leak.linked && !leak.readable);

    // Backups never carry the sync keys.
    const bk = await A.page.evaluate(async () => {
      const backup = await import('./js/core/backup.js');
      const { files } = await backup.exportBackup({ appVersion: 'test' });
      return JSON.stringify(files[0].data.stores.settings || []).includes('"sync"');
    });
    ok('la copia de seguridad no lleva las llaves', !bk);

    for (const [n, d] of Object.entries({ A, B, C, D })) ok(`consola limpia (${n})`, d.errors.length === 0, d.errors.slice(0, 3).join(' | '));
  } catch (e) {
    ok('sin excepciones', false, e.stack || e.message);
  } finally {
    await browser.close();
    const pass = results.filter((r) => r.pass).length;
    console.log(`\n${pass}/${results.length} sync`);
    process.exit(pass === results.length ? 0 : 1);
  }
})();
