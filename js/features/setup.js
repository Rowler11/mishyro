// First-open setup wizard (#/setup, 6 steps) and the 4-screen welcome story (#/setup/historia).
// Progress is saved in meta.setupStep, so closing halfway resumes without duplicating anything.
import { ui, util, db, seed, security, backup, profile, router, cryptoBox, CONFIG } from '../core.js';

const plural = (n, one, many) => `${n || 0} ${n === 1 ? one : many}`;

const { el, icon, ja } = util;
const STEPS = 6;

export function render(ctx) {
  if (ctx.route.path === '/setup/historia') return story(ctx);
  return wizard(ctx);
}

// ---------- wizard ----------
function wizard({ app }) {
  const root = el('section', { class: 'layer setup', 'aria-labelledby': 'setup-title' });
  const card = el('div', { class: 'layer-card' });
  const progress = el('ol', { class: 'steps', 'aria-label': 'Progreso' });
  root.append(card);
  let step = 1;

  const go = async (n) => {
    step = Math.max(1, Math.min(STEPS, n));
    await db.setMeta({ setupStep: step });
    draw();
  };

  const frame = (title, jp, romaji, body, actions, { back = true } = {}) => {
    progress.replaceChildren(...Array.from({ length: STEPS }, (_, i) => el('li', {
      class: `step-dot${i + 1 === step ? ' on' : ''}${i + 1 < step ? ' done' : ''}`,
      'aria-current': i + 1 === step ? 'step' : undefined,
    }, el('span', { class: 'sr-only' }, `Paso ${i + 1}${i + 1 < step ? ', hecho' : ''}`))));
    util.fill(card,
      el('div', { class: 'layer-top' },
        back && step > 1 ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Paso anterior', onClick: () => go(step - 1) }, icon('arrow-left')) : el('span', { class: 'icon-btn-space' }),
        el('p', { class: 'step-count' }, `Paso ${step} de ${STEPS}`), progress),
      el('div', { class: 'layer-body view-enter' },
        el('h1', { class: 'layer-title', id: 'setup-title', tabindex: '-1' }, title), jp ? ja(jp, romaji) : null, body),
      actions ? el('div', { class: 'layer-actions' }, actions) : null);
    requestAnimationFrame(() => card.querySelector('h1')?.focus({ preventScroll: true }));
  };

  const draw = () => [null, welcome, who, data, review, pin, finish][step]();

  // 1. Welcome
  function welcome() {
    frame('Aishiteru', null, null, el('div', { class: 'welcome' },
      ui.logo({ size: 120, bloom: true, label: 'Logo de Aishiteru: flor de sakura con corazón' }),
      ja('愛してる', 'aishiteru'),
      el('p', { class: 'lead' }, 'Un lugar solo de los dos.'),
      el('p', { class: 'muted' }, 'Vamos a dejarla lista en unos pasos. Todo se guarda solo en este dispositivo.')),
    [ui.button({ label: 'Empezar', variant: 'primary', onClick: () => go(2) })], { back: false });
  }

  // 2. Who uses this device
  function who() {
    const pick = (id) => el('button', { class: `who-card${profile.hasChosen() && profile.active() === id ? ' on' : ''}`, type: 'button', onClick: () => {
      profile.setActive(id); util.haptic(10); go(3);
    } }, el('span', { class: 'who-initial', 'aria-hidden': 'true' }, (profile.name(id) || '?').slice(0, 1)), el('span', { class: 'who-name' }, profile.name(id)));
    frame('¿Quién usa este dispositivo?', null, null, el('div', { class: 'stack' },
      el('p', { class: 'muted' }, 'Así la app sabe quién escribe cada cosa. Se puede cambiar luego en un toque.'),
      el('div', { class: 'who-grid' }, pick('sofia'), pick('david'))), null);
  }

  // 3. Import seed or type data
  function data() {
    const out = el('div', { class: 'stack', 'aria-live': 'polite' });
    const fileIn = el('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'seed-file' });
    const drop = el('label', { class: 'dropzone', for: 'seed-file' },
      icon('upload', { size: 32 }), el('span', { class: 'dropzone-title' }, 'Elegir seed-privado.json'),
      el('span', { class: 'muted small' }, 'o arrástralo aquí desde el PC'));
    const handle = async (file) => {
      out.replaceChildren(ui.skeleton(2));
      let obj;
      try { obj = await backup.readFile(file, 5 * 1024 * 1024); } catch (e) { out.replaceChildren(el('p', { class: 'error-text' }, e.message)); return; }
      const v = seed.validateSeed(obj);
      if (!v.ok) {
        out.replaceChildren(el('div', { class: 'card note-card note-error', role: 'alert' },
          el('p', { class: 'card-kicker' }, 'El archivo no se pudo usar'),
          el('ul', {}, v.errors.slice(0, 8).map((e) => el('li', {}, e))),
          el('p', { class: 'muted small' }, 'No se guardó nada.')));
        return;
      }
      const c = v.counts;
      out.replaceChildren(el('div', { class: 'card note-card' },
        el('p', { class: 'card-kicker' }, 'Listo para importar'),
        el('ul', { class: 'counts' },
          el('li', {}, plural(c.reasons, 'razón', 'razones')), el('li', {}, plural(c.coupons, 'cupón', 'cupones')), el('li', {}, plural(c.letters, 'carta', 'cartas')),
          el('li', {}, plural(c.memories, 'recuerdo', 'recuerdos')), el('li', {}, plural(c.specialDates, 'fecha especial', 'fechas especiales')), el('li', {}, plural(c.pets, 'mascota', 'mascotas'))),
        ui.button({ label: 'Importar', variant: 'primary', iconName: 'check', onClick: async () => {
          await seed.applySeed(obj); await profile.load();
          ui.toast('Datos iniciales importados.', { tone: 'success' });
          go(4);
        } })));
    };
    fileIn.addEventListener('change', () => fileIn.files[0] && handle(fileIn.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) handle(f); });

    frame('Sus datos', null, null, el('div', { class: 'stack' },
      el('p', { class: 'muted' }, 'Importa el archivo privado con sus nombres, fechas y textos, o escríbelos a mano. Ese archivo nunca se sube a internet.'),
      fileIn, drop, out,
      el('div', { class: 'divider-text' }, el('span', {}, 'o')),
      ui.button({ label: 'Escribirlos a mano', iconName: 'pencil', onClick: () => manual() }),
      ui.button({ label: 'Traerlos de otro equipo', iconName: 'smartphone', variant: 'ghost', href: '#/unir' })), null);
  }

  function manual() {
    const people = {};
    const mk = (id) => {
      const p = profile.person(id);
      const f = {
        short: ui.input({ value: p.shortName || '', required: true, autocomplete: 'off', maxlength: '40' }),
        nick: ui.input({ value: p.nickname || '', autocomplete: 'off', maxlength: '40' }),
        birth: ui.input({ type: 'date', value: p.birth || '' }),
      };
      people[id] = f;
      return el('fieldset', { class: 'card stack' }, el('legend', { class: 'card-title' }, p.shortName || profile.name(id)),
        ui.field({ label: 'Nombre corto', control: f.short }), ui.field({ label: 'Apodo (opcional)', control: f.nick }),
        ui.field({ label: 'Cumpleaños (opcional)', control: f.birth, hint: 'Con el año, la app muestra la edad que cumple.' }));
    };
    const rel = (profile.startDate() || '').slice(0, 16);
    const date = ui.input({ type: 'date', value: rel.slice(0, 10), max: util.localDay() });
    const time = ui.input({ type: 'time', value: rel.slice(11, 16) || '00:00' });
    const dateField = ui.field({ label: 'Empezamos el', control: date, hint: 'Si no saben la hora, dejen 00:00.' });
    const pet = { name: ui.input({ maxlength: '40' }), species: ui.input({ maxlength: '30', placeholder: 'gato, perro…' }), breed: ui.input({ maxlength: '40' }), birth: ui.input({ type: 'date' }), arrival: ui.input({ type: 'date' }) };
    const form = el('form', { class: 'stack', novalidate: true },
      mk('sofia'), mk('david'),
      el('fieldset', { class: 'card stack' }, el('legend', { class: 'card-title' }, 'Nuestra relación'), dateField, ui.field({ label: 'Hora', control: time })),
      el('details', { class: 'card' }, el('summary', { class: 'card-title' }, 'Mascota (opcional)'),
        el('div', { class: 'stack' }, ui.field({ label: 'Nombre', control: pet.name }), ui.field({ label: 'Especie', control: pet.species }), ui.field({ label: 'Raza', control: pet.breed }),
          ui.field({ label: 'Nació el', control: pet.birth }), ui.field({ label: 'Llegó a casa el', control: pet.arrival }))));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let ok = true;
      for (const id of ['sofia', 'david']) {
        const fld = people[id].short.closest('.field');
        if (!people[id].short.value.trim()) { fld.setError('Escribe un nombre.'); ok = false; } else fld.setError('');
      }
      let startDate = '';
      if (date.value) {
        const d = util.parseDay(date.value); const [hh, mm] = (time.value || '00:00').split(':').map(Number);
        d.setHours(hh || 0, mm || 0, 0, 0);
        if (d > new Date()) { dateField.setError('La fecha no puede estar en el futuro.'); ok = false; } else { dateField.setError(''); startDate = util.toLocalISO(d); }
      }
      if (!ok) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
      const val = (id) => ({ shortName: people[id].short.value.trim(), nickname: people[id].nick.value.trim(), birth: people[id].birth.value });
      await seed.applyManual({ people: { sofia: val('sofia'), david: val('david') }, startDate, pet: { name: pet.name.value.trim(), species: pet.species.value.trim(), breed: pet.breed.value.trim(), birth: pet.birth.value, arrival: pet.arrival.value } });
      await profile.load();
      go(4);
    });
    frame('Escribir los datos', null, null, form, [
      ui.button({ label: 'Volver', variant: 'ghost', onClick: () => draw() }),
      el('button', { class: 'btn btn-primary', type: 'button', onClick: () => form.requestSubmit() }, 'Guardar'),
    ]);
  }

  // 4. Review
  async function review() {
    const people = (await db.rawGet('profile', 'people')) || {};
    const rel = (await db.rawGet('profile', 'relationship')) || {};
    const pets = (await db.query('pets'));
    const content = await db.rawAll('content');
    const count = (kind) => content.filter((c) => c.kind === kind && !c.deleted).length;
    const memories = await db.query('memories');
    const pending = [...content.filter((c) => c.origin === 'seed'), ...memories].filter((r) => Object.values(r).some((v) => typeof v === 'string' && seed.needsCompletion(v))).length;
    const missing = (v) => (v ? v : el('span', { class: 'pending' }, 'por completar'));
    const day = (s) => (s ? util.formatDay(s.slice(0, 10)) : '');
    const partialDay = (p) => (p?.m ? `${p.d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][p.m - 1]}${p.y ? ` de ${p.y}` : ''}` : '');
    const row = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    const personRows = (id) => {
      const p = people[id] || {};
      return el('div', { class: 'card' }, el('h2', { class: 'card-title' }, p.shortName || profile.name(id)),
        el('dl', { class: 'facts' }, row('Apodo', missing(p.nickname)), row('Cumpleaños', missing(day(p.birth)))));
    };
    frame('Revisen que todo esté bien', null, null, el('div', { class: 'stack' },
      el('div', { class: 'grid-2' }, personRows('sofia'), personRows('david')),
      el('div', { class: 'card' }, el('h2', { class: 'card-title' }, 'Relación'), el('dl', { class: 'facts' }, row('Empezamos el', missing(day(rel.startDate))))),
      el('div', { class: 'card' }, el('h2', { class: 'card-title' }, 'Mascotas'),
        pets.length ? el('ul', { class: 'plain' }, pets.map((p) => el('li', {}, `${p.name}${p.breed ? `, ${p.breed}` : ''}${p.birth?.m ? ` · nació el ${partialDay(p.birth)}` : ''}`))) : el('p', { class: 'muted' }, 'Ninguna por ahora.')),
      el('div', { class: 'card' }, el('h2', { class: 'card-title' }, 'Textos'),
        el('p', {}, `${plural(count('reason'), 'razón', 'razones')}, ${plural(count('coupon'), 'cupón', 'cupones')}, ${plural(count('letter'), 'carta', 'cartas')} y ${plural(memories.length, 'recuerdo', 'recuerdos')}.`),
        pending ? el('p', { class: 'muted small' }, `${pending === 1 ? '1 texto todavía tiene' : `${pending} textos todavía tienen`} partes por completar. Se pueden terminar en Perfil y datos.`) : null),
      el('p', { class: 'muted small' }, 'Todo esto se puede cambiar después en Ajustes > Perfil y datos.')),
    [ui.button({ label: 'Corregir a mano', variant: 'ghost', onClick: () => { step = 3; manual(); } }), ui.button({ label: 'Todo bien', variant: 'primary', onClick: () => go(5) })]);
  }

  // 5. Optional app PIN + fingerprint
  async function pin() {
    if (security.hasKey('app')) {
      frame('PIN de la app', null, null, el('p', {}, 'Ya tienen un PIN de la app en este dispositivo. Se cambia en Ajustes > Centro de seguridad.'),
        [ui.button({ label: 'Seguir', variant: 'primary', onClick: () => go(6) })]);
      return;
    }
    const intro = el('div', { class: 'stack' },
      el('p', {}, 'Es opcional. Si lo crean, la app lo pide al abrirse y cifra lo que marquen como privado.'),
      el('p', { class: 'muted small' }, 'Importante: si olvidan el PIN, lo privado no se puede recuperar. Nadie lo guarda, ni siquiera la app.'));
    frame('¿Proteger la app con un PIN?', null, null, intro, [
      ui.button({ label: 'Ahora no', variant: 'ghost', onClick: () => go(6) }),
      ui.button({ label: 'Crear PIN', variant: 'primary', iconName: 'lock', onClick: () => createPinFlow() }),
    ]);
  }

  function createPinFlow() {
    let first = null;
    const body = el('div', { class: 'stack center' });
    const ask = () => {
      const pad = ui.pinPad({
        label: first ? 'Repite el PIN' : 'Nuevo PIN de 4 números', submitLabel: first ? 'Confirmar' : 'Seguir',
        onSubmit: async (value) => {
          if (!first) { first = value; ask(); return null; }
          if (value !== first) { first = null; setTimeout(ask, 900); return 'No coinciden. Empecemos otra vez.'; }
          pad.setDisabled(true); pad.setMessage('Creando la llave…');
          const raw = await security.createPin('app', value);
          await bioOffer(raw);
          return null;
        },
      });
      body.replaceChildren(pad);
      requestAnimationFrame(() => pad.focusInput());
    };
    frame('Crear PIN de la app', null, null, body, [ui.button({ label: 'Cancelar', variant: 'ghost', onClick: () => draw() })]);
    ask();
  }

  async function bioOffer(rawDek) {
    if (!(await cryptoBox.biometricAvailable())) { ui.toast('PIN creado.', { tone: 'success' }); go(6); return; }
    frame('¿Usar también la huella?', null, null, el('div', { class: 'stack' },
      el('p', {}, 'Podrán abrir la app con la huella o el rostro del teléfono.'),
      el('p', { class: 'muted small' }, 'Si el teléfono no permite usar la huella para cifrar, la huella solo abre la pantalla y lo privado sigue pidiendo el PIN. La app te dirá cuál es el caso.')),
    [ui.button({ label: 'Solo PIN', variant: 'ghost', onClick: () => go(6) }),
      ui.button({ label: 'Usar huella', variant: 'primary', iconName: 'fingerprint', onClick: async () => {
        try {
          const bio = await security.enrollBiometric('app', rawDek);
          ui.toast(bio.prf ? 'Huella lista: abre la app y lo privado.' : 'Huella lista: abre la pantalla; lo privado pedirá el PIN.', { tone: 'success' });
        } catch { ui.toast('No se pudo registrar la huella. Pueden hacerlo luego en Ajustes.', { tone: 'error' }); }
        go(6);
      } })]);
  }

  // 6. Persistent storage + first backup
  async function finish() {
    const status = el('p', { class: 'status-line', 'aria-live': 'polite' }, 'Revisando…');
    const persist = async () => {
      let ok = false;
      try { ok = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()); } catch { ok = false; }
      await db.setMeta({ persisted: !!ok });
      status.replaceChildren(icon(ok ? 'shield-check' : 'triangle-alert', { size: 20 }),
        el('span', {}, ok ? 'Almacenamiento persistente activo: el navegador no borrará los datos por su cuenta.' : 'El navegador no activó el almacenamiento persistente. Instalar la app ayuda; la copia de seguridad es aún más importante.'));
    };
    persist();
    const backupBtn = ui.button({ label: 'Descargar primera copia', iconName: 'download', onClick: async () => {
      const { files } = await backup.exportBackup({ includePrivate: false, appVersion: CONFIG.appVersion });
      for (const f of files) await backup.saveJSON(f.name, f.data);
      await db.setMeta({ lastBackupAt: util.nowISO() });
      ui.toast('Copia guardada. Guárdenla en un lugar seguro.', { tone: 'success' });
    } });
    frame('Cuidar sus datos', null, null, el('div', { class: 'stack' },
      el('p', {}, 'Los datos viven solo en este dispositivo. Si se borran los datos del navegador sin una copia, se pierde todo.'),
      status,
      el('div', { class: 'card stack' }, el('p', {}, 'La copia de seguridad es un archivo que pueden guardar o pasar al otro teléfono o al PC.'), backupBtn)),
    [ui.button({ label: 'Terminar', variant: 'primary', iconName: 'check', onClick: async () => {
      await db.setMeta({ setupDone: true, setupStep: STEPS, setupDoneAt: util.nowISO() });
      app.setupDone = true;
      const meta = await db.getMeta();
      router.go(meta.onboardingDone ? '/inicio' : '/setup/historia');
    } })]);
  }

  db.getMeta().then((m) => {
    step = m.setupDone ? 1 : Math.max(1, Math.min(STEPS, m.setupStep || 1));
    if (step === 3 && profile.hasChosen() === false) step = 2;
    draw();
  });
  return root;
}

// ---------- 4-screen story ----------
const STORY = [
  { jp: '二人', romaji: 'futari', art: 'jp-sakura', title: 'Un lugar solo de los dos', text: 'Aquí vive su historia: el tiempo juntos, los recuerdos, las cartas y los cupones.' },
  { jp: '思い出', romaji: 'omoide', art: 'jp-tsuru', title: 'Para guardar lo que viven', text: 'Fotos, fechas especiales, canciones y planes, todo en un mismo lugar y a su manera.' },
  { jp: '遊び', romaji: 'asobi', art: 'jp-chochin', title: 'Para conocerse y jugar', text: 'Preguntas del día, ideas de citas y juegos para hacer juntos, en persona.' },
  { jp: '愛', romaji: 'ai', art: 'jp-omamori', title: 'Privado y en su teléfono', text: 'Todo se queda en este dispositivo. Con la copia de seguridad pasan los datos al otro teléfono o al PC.' },
];

function story() {
  let i = 0;
  const root = el('section', { class: 'layer story', 'aria-roledescription': 'carrusel', 'aria-label': 'Bienvenida' });
  const done = async () => { await db.setMeta({ onboardingDone: true }); router.go('/inicio'); };
  const draw = (dir = 1) => {
    const s = STORY[i];
    root.replaceChildren(el('div', { class: 'layer-card story-card' },
      el('div', { class: 'layer-top' }, el('span', { class: 'icon-btn-space' }), el('p', { class: 'step-count' }, `${i + 1} de ${STORY.length}`),
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: done }, 'Saltar')),
      el('div', { class: `story-slide ${dir > 0 ? 'from-right' : 'from-left'}`, role: 'group', 'aria-roledescription': 'diapositiva', 'aria-label': `${i + 1} de ${STORY.length}` },
        el('div', { class: 'story-art', 'aria-hidden': 'true' }, icon(s.art, { size: 120 })),
        el('h1', { class: 'layer-title', tabindex: '-1' }, s.title), ja(s.jp, s.romaji), el('p', { class: 'lead' }, s.text)),
      el('div', { class: 'story-dots', 'aria-hidden': 'true' }, STORY.map((_, k) => el('span', { class: `dot${k === i ? ' on' : ''}` }))),
      el('div', { class: 'layer-actions' },
        i > 0 ? ui.button({ label: 'Atrás', variant: 'ghost', onClick: () => { i--; draw(-1); } }) : el('span'),
        ui.button({ label: i === STORY.length - 1 ? 'Empezar' : 'Siguiente', variant: 'primary', onClick: () => { if (i === STORY.length - 1) done(); else { i++; draw(1); } } }))));
    requestAnimationFrame(() => root.querySelector('h1')?.focus({ preventScroll: true }));
  };
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && i < STORY.length - 1) { i++; draw(1); }
    if (e.key === 'ArrowLeft' && i > 0) { i--; draw(-1); }
  });
  let x0 = null;
  root.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  root.addEventListener('pointerup', (e) => {
    if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && i < STORY.length - 1) { i++; draw(1); } else if (dx > 0 && i > 0) { i--; draw(-1); }
  });
  draw();
  return root;
}
