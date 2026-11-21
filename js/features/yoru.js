// Rincón privado +18 (docs/05 §33, route #/yoru with neutral names only). Pages:
//   /yoru               first entry (age check, notices, 6-digit PIN, fingerprint), consent of both, home
//   /yoru/juego/:modo   a game (yoru-juegos.js)
//   /yoru/si-no-quiza   private marks, only matches are revealed
//   /yoru/diario        diary of the corner
//   /yoru/grabaciones   audio and video, only with the agreement of both, encrypted, on this device
//   /yoru/contenido     import (.txt, .csv, .json or the encrypted file of the local tool), own cards
//   /yoru/ajustes       levels, hard limits, rests, recordings, security, own backup, delete
// Everything is in the "vault" store (always encrypted) and the corner locks on every leave.
import { ui, util, db, profile, security, cryptoBox, router, CONFIG } from '../core.js';
import * as V from '../core/vault.js';
import { adults, stars } from './juegos-kit.js';
import * as G from './yoru-juegos.js';

const { el, icon } = util;
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const LEVELS = () => CONFIG.vault?.levels || [];
const levelName = (n) => LEVELS().find((l) => l.n === n)?.label || `Nivel ${n}`;
const LIMIT_TAGS = () => CONFIG.vault?.limitTags || [];

// Consent of both, valid until the corner locks again (every leave locks it).
let consent = { stamp: -1, sofia: false, david: false };
const consented = () => consent.stamp === cryptoBox.unlockStamp(V.SCOPE) && consent.sofia && consent.david;

export async function render({ params }) {
  const page = el('section', { class: 'page yoru-page' });
  const cleanups = [installPanicCorner(), await installIdleLock()];
  const done = (extra) => ({ node: page, cleanup: () => { cleanups.forEach((f) => f?.()); extra?.(); } });

  const age = await adults();
  if (age !== 'yes') { blocked(page, age); return done(); }
  if (!security.hasKey(V.SCOPE)) { await firstEntry(page); return done(); }
  if (!V.ready()) { add(page, header()); return done(); } // the lock screen of app.js is in front
  if (!consented()) { consentGate(page); return done(); }

  const sub = params.a || '';
  if (sub === 'juego') { const c = await G.play(page, params.b, ctxBase()); return done(c); }
  if (sub === 'si-no-quiza') { await yesNoMaybe(page); return done(); }
  if (sub === 'diario') { await diary(page); return done(); }
  if (sub === 'grabaciones') { const c = await recordings(page); return done(c); }
  if (sub === 'contenido') { await content(page); return done(); }
  if (sub === 'ajustes') { await settingsPage(page); return done(); }
  await home(page);
  return done();
}

const ctxBase = () => ({ levelName, notices, back: '/yoru' });
const header = (title = 'Rincón', back = null, actions = []) => ui.pageHeader({ title, jp: title === 'Rincón' ? '夜' : null, romaji: 'yoru', back: back || false, actions });

/** Optional own inactivity lock of the corner (off by default; docs/05 §33 f). */
async function installIdleLock() {
  const { idleMinutes } = await V.getLocal();
  if (!idleMinutes || !V.ready()) return null;
  let t = 0;
  const reset = () => { clearTimeout(t); t = setTimeout(() => { cryptoBox.lock(V.SCOPE); router.refresh(); }, idleMinutes * 60000); };
  const evs = ['pointerdown', 'keydown', 'scroll'];
  evs.forEach((e) => addEventListener(e, reset, { passive: true }));
  reset();
  return () => { clearTimeout(t); evs.forEach((e) => removeEventListener(e, reset)); };
}

/** Double tap in the top-right corner covers everything (docs/05 §33 f). */
function installPanicCorner() {
  let last = 0;
  const onDown = (e) => {
    if (e.clientX < innerWidth - 72 || e.clientY > 72) return;
    const now = Date.now();
    if (now - last < 400) { last = 0; e.preventDefault(); security.panic({ goHome: () => router.go('/inicio', { replace: true }) }); }
    else last = now;
  };
  addEventListener('pointerdown', onDown, true);
  return () => removeEventListener('pointerdown', onDown, true);
}

/** Permanent notices (docs/05 §33 i). */
export function notices({ open = false } = {}) {
  const d = el('details', { class: 'card yoru-notice', open },
    el('summary', {}, icon('shield-check', { size: 18 }), el('span', {}, 'Antes de jugar')),
    el('ul', { class: 'yoru-notice-list' },
      el('li', {}, 'Solo para adultos. Todo es opcional y con el sí de los dos.'),
      el('li', {}, 'Se puede pausar, cambiar o parar en cualquier momento, sin explicar nada.'),
      el('li', {}, 'Las grabaciones son responsabilidad de quienes las hacen: no se comparten ni se suben a la nube.'),
      el('li', {}, 'La app no puede impedir capturas de pantalla.'),
      el('li', {}, 'Para cubrir todo al instante: toca dos veces la esquina de arriba a la derecha, o Esc dos veces.')));
  return d;
}

function blocked(page, age) {
  add(page, header(),
    ui.emptyState({
      title: age === 'no' ? 'Este espacio no está disponible' : 'Falta un dato para abrir este espacio',
      text: age === 'no' ? 'Es solo para adultos, según las fechas de nacimiento del perfil.' : 'Completen las dos fechas de nacimiento en Perfil y datos. Es solo para adultos.',
      art: 'moon', action: age === 'no' ? null : { label: 'Ir a Perfil y datos', onClick: () => router.go('/ajustes/perfil') } }));
}

// ---------- first entry: notices, PIN of 6 and fingerprint ----------
async function firstEntry(page) {
  const body = el('div', { class: 'stack yoru-first' });
  add(page, header(), body);
  const intro = () => put(body,
    el('div', { class: 'yoru-hero', 'aria-hidden': 'true' }, icon('jp-moon', { size: 54 })),
    el('p', { class: 'lead' }, 'Un espacio solo de los dos, aparte del resto de la app y con su propio PIN.'),
    notices({ open: true }),
    el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Cómo se protege'),
      el('ul', { class: 'plain-list' },
        el('li', {}, 'PIN de 6 números, y huella cuando el teléfono lo permita.'),
        el('li', {}, 'Todo queda cifrado en el equipo, también lo que viaja al otro teléfono.'),
        el('li', {}, 'Se cierra solo al salir de aquí, al cambiar de app o al bloquear la pantalla.'),
        el('li', {}, 'No aparece en la búsqueda, las insignias, el resumen ni en la copia general.')),
      el('p', { class: 'yoru-warn' }, icon('triangle-alert', { size: 18 }), el('span', {}, 'Si olvidan el PIN, lo de aquí no se puede recuperar. Ni nosotros podemos abrirlo.'))),
    el('div', { class: 'btn-row center-row' }, ui.button({ label: 'Crear el PIN de 6', iconName: 'key-round', variant: 'primary', onClick: askPin })));
  let first = null;
  const askPin = () => {
    const pad = ui.pinPad({
      label: first ? 'Repite el PIN' : 'Nuevo PIN de 6 números', min: V.PIN_DIGITS, max: V.PIN_DIGITS, submitLabel: first ? 'Confirmar' : 'Seguir',
      onSubmit: async (value) => {
        if (!first) { first = value; askPin(); return null; }
        if (value !== first) { first = null; setTimeout(askPin, 900); return 'No coinciden. Empecemos otra vez.'; }
        pad.setDisabled(true); pad.setMessage('Creando la llave…');
        const raw = await security.createPin(V.SCOPE, value);
        first = null;
        await V.setSettings({});
        offerBio(raw);
        return null;
      },
    });
    put(body, el('div', { class: 'card stack center-col yoru-pin' }, pad,
      el('p', { class: 'muted small' }, 'Elijan un PIN que no usen en otra parte. Sin él, nada de aquí se recupera.'),
      ui.button({ label: 'Volver', variant: 'ghost', small: true, onClick: () => { first = null; intro(); } })));
    requestAnimationFrame(() => pad.focusInput());
  };
  const offerBio = async (raw) => {
    const can = await cryptoBox.biometricAvailable();
    const finish = () => { consent = { stamp: -1, sofia: false, david: false }; router.refresh(); };
    if (!can) { finish(); return; }
    put(body, el('div', { class: 'card stack center-col' },
      icon('fingerprint', { size: 48 }),
      el('h2', { class: 'card-title' }, '¿Abrir también con huella?'),
      el('p', { class: 'muted' }, 'Funciona solo en este teléfono. El PIN sigue sirviendo siempre.'),
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Ahora no', variant: 'ghost', onClick: finish }),
        ui.button({ label: 'Usar huella', iconName: 'fingerprint', variant: 'primary', onClick: async () => {
          try { const bio = await security.enrollBiometric(V.SCOPE, raw); ui.toast(bio.prf ? 'Listo: la huella abre el Rincón.' : 'Listo. En este teléfono la huella no abre lo cifrado: pedirá el PIN.'); } catch { ui.toast('No se pudo registrar la huella. Puedes intentarlo en Ajustes del Rincón.'); }
          finish();
        } }))));
  };
  intro();
}

// ---------- consent of both on every entry ----------
function consentGate(page) {
  const stamp = cryptoBox.unlockStamp(V.SCOPE);
  if (consent.stamp !== stamp) consent = { stamp, sofia: false, david: false };
  const go = el('div', { class: 'btn-row center-row' });
  const btn = (p) => {
    const b = el('button', { class: 'consent-btn', type: 'button', 'aria-pressed': String(consent[p]), onClick: () => {
      consent[p] = !consent[p]; b.setAttribute('aria-pressed', String(consent[p])); util.haptic(8);
      paintGo();
    } }, el('span', { class: 'consent-avatar', 'aria-hidden': 'true' }, (profile.name(p) || '?').slice(0, 1)),
    el('span', { class: 'consent-text' }, el('strong', {}, profile.name(p)), el('span', {}, 'Quiero estar aquí')),
    el('span', { class: 'consent-check', 'aria-hidden': 'true' }, icon('check', { size: 20 })));
    return b;
  };
  const paintGo = () => put(go, consent.sofia && consent.david
    ? ui.button({ label: 'Entrar', iconName: 'arrow-right', variant: 'primary', onClick: () => router.refresh() })
    : el('p', { class: 'muted small' }, 'Los dos tienen que tocar su nombre.'));
  add(page, header(),
    el('div', { class: 'stack yoru-consent' },
      el('p', { class: 'lead center' }, '¿Los dos quieren estar aquí ahora?'),
      el('div', { class: 'consent-row' }, profile.PEOPLE.map(btn)),
      go, notices()));
  paintGo();
}

// ---------- home ----------
async function home(page) {
  const [s, lib] = await Promise.all([V.getSettings(), V.library()]);
  const max = V.maxLevel(s);
  const empty = !lib.items.length && !lib.dice.accion.length && !lib.gen.templates.length;
  const levelCard = el('a', { class: 'card card-link yoru-level', href: '#/yoru/ajustes' },
    el('span', { class: 'yoru-level-num', 'aria-hidden': 'true' }, String(max)),
    el('span', { class: 'stack-tight' },
      el('span', { class: 'muted small' }, 'Hoy juegan hasta'),
      el('strong', {}, `Nivel ${max} · ${levelName(max)}`),
      el('span', { class: 'muted small' }, `${profile.PEOPLE.map((p) => `${profile.name(p)} acepta hasta ${V.personLevel(s, p)}`).join(' · ')}. Manda el menor.`)),
    icon('chevron-right', { cls: 'list-chevron' }));
  const tile = (g) => el('li', {}, el('a', { class: 'game-tile', href: `#/yoru/juego/${g.id}` },
    el('span', { class: 'section-icon' }, icon(g.icon, { size: 22 })),
    el('span', { class: 'game-tile-text' }, el('span', { class: 'game-tile-title' }, g.title), el('span', { class: 'muted small clamp-2' }, g.blurb))));
  const available = G.GAMES.filter((g) => G.hasContent(g, lib));
  const surprise = ui.button({ label: 'Sorpréndannos', iconName: 'dices', variant: 'primary', onClick: () => {
    const g = available[Math.floor(Math.random() * available.length)];
    if (g) router.go(`/yoru/juego/${g.id}`);
  } });
  surprise.disabled = !available.length;
  const links = [
    ['si-no-quiza', 'Sí, no o quizá', 'list-checks', 'Solo se revelan las coincidencias.'],
    ['diario', 'Diario', 'notebook-pen', 'Lo que vivieron, si quieren anotarlo.'],
    ['grabaciones', 'Grabaciones', 'mic', 'Solo si los dos aceptan, cifradas.'],
    ['contenido', 'Contenido', 'file-up', 'Importar y escribir sus cartas.'],
    ['ajustes', 'Ajustes', 'sliders-horizontal', 'Niveles, límites, PIN y copia.'],
  ];
  add(page, header('Rincón', null, [ui.button({ label: 'Salir', iconName: 'lock', variant: 'ghost', small: true, onClick: () => { cryptoBox.lock(V.SCOPE); router.go('/inicio'); } })]),
    el('div', { class: 'stack' },
      levelCard,
      empty ? el('div', { class: 'card stack center-col' },
        icon('file-up', { size: 36 }),
        el('h2', { class: 'card-title' }, 'Todavía no hay cartas'),
        el('p', { class: 'muted center' }, 'Las preguntas, retos e ideas no vienen dentro de la app: se cargan aquí desde su archivo, y quedan cifradas.'),
        ui.button({ label: 'Cargar contenido', iconName: 'upload', variant: 'primary', href: '#/yoru/contenido' })) : null,
      !empty ? el('section', { class: 'stack' },
        el('div', { class: 'section-row' }, el('h2', { class: 'section-title' }, 'Juegos'), surprise),
        el('ul', { class: 'game-grid' }, G.GAMES.map((g) => (G.hasContent(g, lib) ? tile(g) : null)))) : null,
      el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'También'),
        el('ul', { class: 'game-grid' }, links.map(([id, t, ic, b]) => el('li', {}, el('a', { class: 'game-tile', href: `#/yoru/${id}` },
          el('span', { class: 'section-icon' }, icon(ic, { size: 22 })),
          el('span', { class: 'game-tile-text' }, el('span', { class: 'game-tile-title' }, t), el('span', { class: 'muted small clamp-2' }, b))))))),
      notices()));
}

// ---------- yes / no / maybe ----------
async function yesNoMaybe(page) {
  const [s, lib] = await Promise.all([V.getSettings(), V.library()]);
  const merged = V.mergeLimits(s.limits);
  const ideas = V.pool(lib.items, { kind: 'idea', band: [0, V.maxLevel(s)], merged }).sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
  const body = el('div', { class: 'stack' });
  add(page, header('Sí, no o quizá', '/yoru'), body);
  if (!ideas.length) { add(body, ui.emptyState({ title: 'No hay ideas para marcar', text: 'Carguen ideas (modo "idea") en Contenido, o suban el nivel en Ajustes.', art: 'moon', action: { label: 'Ir a Contenido', onClick: () => router.go('/yoru/contenido') } })); return; }
  const recs = Object.fromEntries(await Promise.all(profile.PEOPLE.map(async (p) => [p, await V.ynm(p)])));
  const paintHub = () => {
    const both = profile.PEOPLE.every((p) => recs[p].done);
    const m = both ? V.matches(recs.sofia.answers, recs.david.answers) : [];
    const byId = new Map(ideas.map((i) => [i.id, i]));
    const shown = m.filter((x) => byId.has(x.id));
    put(body,
      el('p', { class: 'muted' }, 'Cada uno marca en privado. Solo se muestran las ideas donde los dos dijeron "sí" o "quizá"; lo que alguien dijo que no, nunca se ve.'),
      el('div', { class: 'consent-row' }, profile.PEOPLE.map((p) => el('div', { class: 'card stack center-col ynm-person' },
        el('strong', {}, profile.name(p)),
        el('span', { class: `badge ${recs[p].done ? 'badge-ok' : ''}` }, recs[p].done ? 'Ya marcó' : `${Object.keys(recs[p].answers).length} de ${ideas.length}`),
        ui.button({ label: recs[p].done ? 'Revisar lo mío' : 'Marcar las mías', iconName: 'eye-off', small: true, onClick: () => mark(p) })))),
      both ? el('section', { class: 'card stack' },
        el('h2', { class: 'card-title' }, shown.length ? `Coinciden en ${shown.length}` : 'Esta vez no coincidieron en ninguna'),
        shown.length ? el('ul', { class: 'ynm-matches' }, shown.sort((a, b) => (a.both === 'si' ? -1 : 1) - (b.both === 'si' ? -1 : 1)).map((x) => el('li', {},
          el('span', { class: `badge ${x.both === 'si' ? 'badge-ok' : 'badge-warn'}` }, x.both === 'si' ? 'Los dos: sí' : 'Quizá'),
          el('span', {}, byId.get(x.id).text)))) : el('p', { class: 'muted' }, 'Pueden volver a marcar otro día.'),
        el('div', { class: 'btn-row' }, ui.button({ label: 'Empezar de nuevo', iconName: 'rotate-ccw', variant: 'ghost', small: true, onClick: async () => {
          if (!(await ui.confirmDialog({ title: '¿Borrar las marcas de los dos?', message: 'Cada uno vuelve a marcar desde cero.', confirmLabel: 'Borrar' }))) return;
          for (const p of profile.PEOPLE) { recs[p] = { id: `v:ynm:${p}`, person: p, answers: {}, done: false }; await V.saveYnm(recs[p]); }
          paintHub();
        } }))) : el('p', { class: 'muted small center' }, 'Cuando los dos terminen, aparecen aquí las coincidencias.'));
  };
  const mark = (p) => {
    const r = recs[p];
    const list = el('ul', { class: 'ynm-list' });
    const row = (i) => {
      const name = `ynm-${i.id}`;
      return el('li', { class: 'ynm-row' }, el('p', {}, i.text),
        ui.segmented({ label: i.text, name, value: r.answers[i.id] || '', options: [{ value: 'si', label: 'Sí' }, { value: 'quiza', label: 'Quizá' }, { value: 'no', label: 'No' }], onChange: (v) => { r.answers[i.id] = v; } }));
    };
    put(list, ...ideas.map(row));
    put(body,
      el('div', { class: 'card stack center-col' }, el('strong', {}, `Solo ${profile.name(p)}`), el('p', { class: 'muted small center' }, `${profile.name(profile.partnerOf(p))}, no mires: tus respuestas tampoco se le muestran.`)),
      list,
      el('div', { class: 'btn-row center-row ynm-actions' },
        ui.button({ label: 'Guardar y tapar', iconName: 'eye-off', variant: 'primary', onClick: async () => { r.done = true; await V.saveYnm(r); ui.toast('Guardado. Pasa el teléfono.'); paintHub(); window.scrollTo({ top: 0 }); } }),
        ui.button({ label: 'Cancelar', variant: 'ghost', onClick: paintHub })));
    window.scrollTo({ top: 0 });
  };
  paintHub();
}

// ---------- diary ----------
export const MOODS = [{ value: 'felices', label: 'Felices' }, { value: 'tranquilos', label: 'Tranquilos' }, { value: 'con-ganas', label: 'Con ganas de más' }, { value: 'cansados', label: 'Cansados' }];
const moodLabel = (v) => MOODS.find((m) => m.value === v)?.label || '';

async function diary(page) {
  const list = el('ul', { class: 'yoru-log stack' });
  add(page, header('Diario', '/yoru', [ui.newButton('Anotar', () => logForm(null, paint))]), el('p', { class: 'muted' }, 'Todo es opcional. Queda cifrado y solo se ve aquí.'), list);
  const paint = async () => {
    const all = await V.logs();
    if (!all.length) { put(list, el('li', {}, ui.emptyState({ title: 'Nada anotado todavía', text: 'Al terminar un juego pueden guardar cómo les fue.', art: 'moon' }))); return; }
    put(list, ...all.map((e) => el('li', { class: 'card stack-tight yoru-log-item' },
      el('div', { class: 'section-row' },
        el('strong', {}, util.formatDay(e.date) || e.date),
        e.rating ? el('span', { class: 'badge', 'aria-label': `${e.rating} de 5` }, '★'.repeat(e.rating)) : null),
      el('span', { class: 'muted small' }, [e.game ? G.gameTitle(e.game) : '', Number.isInteger(e.level) ? `Nivel ${e.level}` : '', moodLabel(e.mood)].filter(Boolean).join(' · ')),
      e.note ? el('p', {}, e.note) : null,
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Editar', iconName: 'pencil', variant: 'ghost', small: true, onClick: () => logForm(e, paint) }),
        ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta nota?', confirmLabel: 'Borrar', danger: true })) { await V.deleteLog(e.id); paint(); } } })))));
  };
  await paint();
}

/** Diary form (also used at the end of a game). */
export function logForm(entry, onSaved, preset = {}) {
  const e = { date: util.localDay(), rating: 0, mood: '', note: '', ...preset, ...(entry || {}) };
  const date = ui.input({ type: 'date', value: e.date, max: util.localDay() });
  const st = stars({ value: e.rating, label: 'Cómo les fue, de 1 a 5', onChange: (n) => { e.rating = n; } });
  const note = ui.textarea({ rows: 3, maxlength: 400, value: e.note || '', placeholder: 'Una nota corta (opcional)' });
  ui.openModal({
    title: entry ? 'Editar nota' : 'Anotar en el diario', size: 'sm',
    body: el('div', { class: 'stack' },
      ui.field({ label: 'Fecha', control: date }),
      ui.field({ label: 'Cómo les fue', control: st.node }),
      ui.field({ label: 'Ánimo', control: ui.segmented({ label: 'Ánimo', value: e.mood, options: MOODS, onChange: (v) => { e.mood = v; } }) }),
      ui.field({ label: 'Nota', control: note })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      await V.saveLog({ ...e, date: util.isValidDay(date.value) ? date.value : util.localDay(), note: note.value.trim(), by: profile.active() });
      ui.toast('Guardado en el diario.', { tone: 'success' }); onSaved?.();
    } }],
  });
}

// ---------- recordings ----------
const PICK_MIME = (video) => (video ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'])
  .find((t) => typeof MediaRecorder === 'function' && MediaRecorder.isTypeSupported?.(t)) || '';

async function recordings(page) {
  const s = await V.getSettings();
  const urls = [];
  const list = el('ul', { class: 'stack yoru-recs' });
  const area = el('div', { class: 'stack' });
  add(page, header('Grabaciones', '/yoru'),
    el('p', { class: 'muted' }, 'Quedan cifradas solo en este equipo y solo se reproducen aquí. No se comparten ni se suben a la nube.'),
    area, el('h2', { class: 'section-title' }, 'Guardadas aquí'), list);
  let stream = null; let recorder = null; let tick = 0;
  const stopAll = () => { try { recorder?.state === 'recording' && recorder.stop(); } catch { /* ignore */ } stream?.getTracks().forEach((t) => t.stop()); stream = null; clearInterval(tick); document.documentElement.classList.remove('is-recording'); };
  const can = typeof MediaRecorder === 'function' && !!navigator.mediaDevices?.getUserMedia;
  const start = () => {
    let agreed = false; let type = 'audio';
    const agree = el('input', { type: 'checkbox', id: 'rec-agree', class: 'check-input' });
    const go = ui.button({ label: 'Pedir permiso y grabar', iconName: 'mic', variant: 'primary', onClick: () => record(type) });
    go.disabled = true;
    agree.addEventListener('change', () => { agreed = agree.checked; go.disabled = !agreed; });
    put(area, el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Nueva grabación'),
      ui.field({ label: 'Qué grabar', control: ui.segmented({ label: 'Qué grabar', value: type, options: [{ value: 'audio', label: 'Audio', icon: 'mic' }, { value: 'video', label: 'Video', icon: 'camera' }], onChange: (v) => { type = v; } }) }),
      el('p', { class: 'muted small' }, `El teléfono pedirá el micrófono o la cámara solo ahora. Máximo ${Math.round(s.recMaxAudioSec / 60)} min de audio o ${s.recMaxVideoSec} s de video, y ${s.recMaxMB} MB.`),
      el('label', { class: 'check-row', for: 'rec-agree' }, agree, el('span', {}, 'Los dos aceptamos grabar ahora.')),
      el('div', { class: 'btn-row' }, go, ui.button({ label: 'Cancelar', variant: 'ghost', onClick: idle }))));
    void agreed;
  };
  const idle = () => put(area, can
    ? el('div', { class: 'btn-row' }, ui.button({ label: 'Nueva grabación', iconName: 'mic', variant: 'secondary', onClick: start }))
    : el('p', { class: 'muted' }, 'Este navegador no permite grabar.'));
  const record = async (type) => {
    const video = type === 'video';
    try { stream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { facingMode: 'user', width: { ideal: 1280 } } } : { audio: true }); }
    catch { ui.toast('No hubo permiso para grabar. Se puede dar en los ajustes del navegador.', { tone: 'error' }); idle(); return; }
    const mime = PICK_MIME(video);
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, ...(video ? { videoBitsPerSecond: 1_500_000 } : {}) } : undefined);
    const chunks = []; let bytes = 0; const t0 = Date.now();
    const maxSec = video ? s.recMaxVideoSec : s.recMaxAudioSec; const maxBytes = s.recMaxMB * 1024 * 1024;
    const time = el('span', { class: 'rec-time' }, '0:00');
    const preview = video ? el('video', { class: 'rec-preview', muted: true, playsinline: true, autoplay: true }) : null;
    if (preview) { preview.srcObject = stream; preview.muted = true; }
    const indicator = el('div', { class: 'rec-indicator', role: 'status', 'aria-live': 'polite' }, el('span', { class: 'rec-dot', 'aria-hidden': 'true' }), el('strong', {}, 'Grabando'), time);
    put(area, el('div', { class: 'card stack center-col' }, indicator, preview,
      ui.button({ label: 'Detener y guardar', iconName: 'pause', variant: 'primary', onClick: () => recorder.state === 'recording' && recorder.stop() })));
    document.documentElement.classList.add('is-recording');
    recorder.ondataavailable = (e) => { if (e.data?.size) { chunks.push(e.data); bytes += e.data.size; if (bytes >= maxBytes && recorder.state === 'recording') recorder.stop(); } };
    recorder.onstop = async () => {
      const duration = Math.round((Date.now() - t0) / 1000);
      stopAll();
      const blob = new Blob(chunks, { type: (mime || (video ? 'video/webm' : 'audio/webm')).split(';')[0] });
      if (!blob.size || !V.ready()) { idle(); return; }
      try { await V.saveRecording(blob, { type, duration }); ui.toast('Guardada y cifrada en este equipo.', { tone: 'success' }); }
      catch (e) { ui.toast(/quota/i.test(e?.message || '') ? 'No hay espacio en el equipo para guardarla.' : 'No se pudo guardar la grabación.', { tone: 'error' }); }
      idle(); paint();
    };
    recorder.start(1000);
    tick = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      if (sec >= maxSec && recorder.state === 'recording') recorder.stop();
    }, 250);
  };
  const paint = async () => {
    const all = await V.recordings();
    if (!all.length) { put(list, el('li', { class: 'muted' }, 'Ninguna por ahora.')); return; }
    put(list, ...all.map((r) => {
      const slot = el('div', { class: 'rec-player' });
      return el('li', { class: 'card stack-tight' },
        el('div', { class: 'section-row' }, el('span', {}, icon(r.type === 'video' ? 'camera' : 'mic', { size: 18 }), ' ', el('strong', {}, util.formatDay(r.date) || '')),
          el('span', { class: 'muted small' }, `${Math.floor((r.duration || 0) / 60)}:${String((r.duration || 0) % 60).padStart(2, '0')} · ${(r.size / 1048576).toFixed(1)} MB`)),
        slot,
        el('div', { class: 'btn-row' },
          ui.button({ label: 'Reproducir', iconName: 'play', variant: 'secondary', small: true, onClick: async () => {
            const blob = await V.recordingBlob(r);
            if (!blob) { ui.toast('No se pudo abrir.'); return; }
            const url = URL.createObjectURL(blob); urls.push(url);
            put(slot, el(r.type === 'video' ? 'video' : 'audio', { src: url, controls: true, autoplay: true, playsinline: true, class: 'rec-media', controlslist: 'nodownload noremoteplayback', disablepictureinpicture: true }));
          } }),
          ui.button({ label: 'Borrar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar la grabación?', message: 'No se puede deshacer.', confirmLabel: 'Borrar', danger: true })) { await V.deleteRecording(r.id); paint(); } } })));
    }));
  };
  idle(); await paint();
  return () => { stopAll(); urls.forEach((u) => URL.revokeObjectURL(u)); };
}

// ---------- content: import and own cards ----------
async function content(page) {
  const body = el('div', { class: 'stack' });
  const packsBox = el('div', { class: 'stack' });
  const file = el('input', { type: 'file', id: 'yoru-file', accept: '.txt,.csv,.json,text/plain,text/csv,application/json', class: 'sr-only' });
  add(page, header('Contenido', '/yoru'), body);
  const formatHelp = el('details', { class: 'card' }, el('summary', {}, 'Cómo preparar el archivo'),
    el('div', { class: 'stack small' },
      el('p', {}, 'Un elemento por línea: modo | nivel | texto. En .csv: modo,nivel,texto (y si quieren, etiquetas y segundos). En .json: una lista de { "modo", "nivel", "texto" }.'),
      el('p', {}, `Modos: ${Object.keys(V.KINDS).join(', ')}. Niveles: 0 a 5 (el 5 es su contenido propio).`),
      el('p', {}, 'Si lo cifraron con la herramienta local, carguen el .enc.json y escriban su frase. El archivo nunca sale del equipo.')));
  const preview = el('div', { class: 'stack' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { ui.toast('El archivo es muy grande (máximo 4 MB).', { tone: 'error' }); return; }
    let text = await f.text();
    let res = V.parseContent(text, f.name);
    if (res.encrypted) {
      const phrase = await askPhrase('Frase del archivo', 'Es la frase con la que lo cifraron en la herramienta local.');
      if (!phrase) return;
      try { text = await V.decryptFile(res.encrypted, phrase); } catch { ui.toast('La frase no abre este archivo.', { tone: 'error' }); return; }
      res = text && typeof text.text === 'string' ? V.parseContent(text.text, text.name || 'contenido.txt') : V.parseContent(typeof text === 'string' ? text : JSON.stringify(text), 'contenido.json');
      text = null;
    }
    showPreview(res, f.name);
  });
  const showPreview = (res, name) => {
    if (!res.pack) { put(preview, el('div', { class: 'card stack yoru-errors', role: 'alert' }, el('strong', {}, 'No se pudo cargar'), el('ul', {}, res.errors.map((e) => el('li', {}, e))))); return; }
    const sum = V.summarize(res.pack);
    put(preview, el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, `Vista previa: ${name}`),
      el('p', {}, `${res.count} elementos listos${res.errorCount ? `, ${res.errorCount} con errores (se omiten)` : ''}.`),
      el('ul', { class: 'plain-list small' }, Object.entries(sum.byKind).map(([k, n]) => el('li', {}, `${V.KINDS[k]}: ${n}`)),
        sum.dice ? el('li', {}, 'Dados: sí') : null, sum.gen ? el('li', {}, 'Generador: sí') : null),
      el('p', { class: 'muted small' }, `Por nivel: ${sum.byLevel.map((n, i) => `${i}: ${n}`).join(' · ')}`),
      res.errors.length ? el('details', {}, el('summary', {}, 'Ver errores'), el('ul', { class: 'small' }, res.errors.map((e) => el('li', {}, e)))) : null,
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Guardar cifrado', iconName: 'lock', variant: 'primary', onClick: async () => {
          await V.addPack({ ...res.pack, by: profile.active() }, 'import');
          ui.toast('Guardado y cifrado.', { tone: 'success' }); put(preview); paintPacks();
        } }),
        ui.button({ label: 'Descartar', variant: 'ghost', onClick: () => put(preview) }))));
  };
  const paintPacks = async () => {
    const all = await V.packs();
    put(packsBox, el('h2', { class: 'section-title' }, 'Cargado'),
      all.length ? el('ul', { class: 'stack' }, all.map((p) => {
        const sum = V.summarize(p);
        return el('li', { class: 'card section-row' },
          el('span', { class: 'stack-tight' }, el('strong', {}, p.name || 'Contenido'), el('span', { class: 'muted small' }, `${sum.items} cartas${sum.dice ? ' · dados' : ''}${sum.gen ? ' · generador' : ''} · ${util.formatDay((p.importedAt || p.createdAt || '').slice(0, 10))}`)),
          ui.button({ label: 'Quitar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => {
            if (!(await ui.confirmDialog({ title: `¿Quitar "${p.name || 'Contenido'}"?`, message: 'Se borra de este equipo y de los teléfonos unidos.', confirmLabel: 'Quitar', danger: true }))) return;
            await V.deletePack(p.id); paintPacks();
          } }));
      })) : el('p', { class: 'muted' }, 'Nada todavía.'));
  };
  const own = () => {
    let kind = 'reto'; let level = 5;
    const text = ui.textarea({ rows: 3, maxlength: V.MAX_TEXT, placeholder: 'Escriban su carta' });
    ui.openModal({ title: 'Escribir una carta', size: 'sm', body: el('div', { class: 'stack' },
      ui.field({ label: 'Modo', control: el('select', { class: 'input', onChange: (e) => { kind = e.target.value; } }, Object.entries(V.KINDS).map(([k, l]) => el('option', { value: k, selected: k === kind }, l))) }),
      ui.field({ label: 'Nivel', control: el('select', { class: 'input', onChange: (e) => { level = Number(e.target.value); } }, LEVELS().map((l) => el('option', { value: String(l.n), selected: l.n === level }, `${l.n} · ${l.label}`))) }),
      ui.field({ label: 'Texto', control: text })),
    actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => {
      const r = V.normItem({ kind, level, text: text.value });
      if (r.error) { ui.toast(r.error, { tone: 'error' }); return false; }
      await V.addManualItem(r.item); ui.toast('Guardada y cifrada.', { tone: 'success' }); paintPacks();
    } }] });
  };
  add(body,
    el('div', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Cargar un archivo'),
      el('p', { class: 'muted small' }, '.txt, .csv, .json o el .enc.json de la herramienta local. Se valida, se muestra antes de guardar y queda cifrado con el PIN del Rincón.'),
      el('div', { class: 'btn-row' }, file, el('label', { class: 'btn btn-primary', for: 'yoru-file' }, icon('upload'), el('span', {}, 'Elegir archivo')),
        ui.button({ label: 'Escribir una carta', iconName: 'pencil', variant: 'secondary', onClick: own }))),
    preview, formatHelp, packsBox);
  await paintPacks();
}

function askPhrase(title, hint, { confirm = false } = {}) {
  return new Promise((resolve) => {
    const a = ui.input({ type: 'password', autocomplete: 'off', minlength: 8, 'aria-label': 'Frase' });
    const b = confirm ? ui.input({ type: 'password', autocomplete: 'off', 'aria-label': 'Repite la frase' }) : null;
    let out = null;
    ui.openModal({ title, size: 'sm', onClose: () => resolve(out), body: el('div', { class: 'stack' }, el('p', { class: 'muted small' }, hint), ui.field({ label: 'Frase', control: a }), b ? ui.field({ label: 'Repite la frase', control: b }) : null),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Seguir', variant: 'primary', onClick: () => {
        if (a.value.length < 8) { ui.toast('Usa al menos 8 caracteres.'); return false; }
        if (b && a.value !== b.value) { ui.toast('Las frases no coinciden.'); return false; }
        out = a.value; return true;
      } }] });
    requestAnimationFrame(() => a.focus());
  });
}

// ---------- settings ----------
async function settingsPage(page) {
  const me = profile.active();
  const s = await V.getSettings();
  const local = await V.getLocal();
  const body = el('div', { class: 'stack' });
  add(page, header('Ajustes del Rincón', '/yoru'), body);
  const save = async (patch) => { Object.assign(s, patch); await V.setSettings(s); };

  // Levels: each one sets their own; the game uses the lower one.
  const lim = s.limits[me];
  const levelSel = ui.segmented({ label: `Hasta qué nivel acepta ${profile.name(me)}`, value: String(Math.min(4, s.levels[me] ?? 0)), options: LEVELS().filter((l) => l.n <= 4).map((l) => ({ value: String(l.n), label: String(l.n) })), onChange: async (v) => { s.levels[me] = Number(v); await save({ levels: s.levels }); paintLevelHint(); } });
  const levelHint = el('p', { class: 'muted small' });
  const paintLevelHint = () => { const n = s.levels[me] ?? 0; levelHint.textContent = `${levelName(n)}: ${LEVELS().find((l) => l.n === n)?.hint || ''} Hoy juegan hasta el ${V.maxLevel(s)}: manda el menor de los dos.`; };
  paintLevelHint();
  const ownToggle = ui.toggle({ label: 'Acepto el nivel 5 (contenido propio)', hint: 'Solo lo que ustedes cargaron. Cuenta si también aceptas el 4.', checked: !!s.own[me], onChange: async (v) => { s.own[me] = v; await save({ own: s.own }); paintLevelHint(); } });

  const tagBox = el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Temas que no quiero' });
  const lib = await V.library();
  const tagList = [...new Map([...LIMIT_TAGS(), ...lib.tags].map((t) => [t.id, t])).values()];
  put(tagBox, ...tagList.map((t) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(lim.tags.includes(t.id)), onClick: async () => {
      const on = !lim.tags.includes(t.id);
      lim.tags = on ? [...lim.tags, t.id] : lim.tags.filter((x) => x !== t.id);
      b.setAttribute('aria-pressed', String(on)); await save({ limits: s.limits });
    } }, t.label);
    return b;
  }));
  const words = ui.input({ value: (lim.words || []).join(', '), placeholder: 'Palabras separadas por comas', 'aria-label': 'Palabras que no quiero ver' });
  words.addEventListener('change', async () => { lim.words = words.value.split(',').map((w) => w.trim()).filter(Boolean).slice(0, 40); await save({ limits: s.limits }); ui.toast('Límites guardados.'); });

  const num = (label, key, min, max, step = 1, suffix = '') => {
    const i = ui.input({ type: 'number', min, max, step, value: s[key], inputmode: 'numeric' });
    i.addEventListener('change', async () => { const v = util.clamp(Math.round(Number(i.value) || min), min, max); i.value = v; await save({ [key]: v }); });
    return ui.field({ label: `${label}${suffix ? ` (${suffix})` : ''}`, control: i });
  };

  const bioBox = el('div', { class: 'stack' });
  const paintBio = async () => {
    const recs = await security.keyRecords(V.SCOPE);
    const has = recs.some((r) => r.bio?.credId);
    const can = await cryptoBox.biometricAvailable();
    put(bioBox, !can ? el('p', { class: 'muted small' }, 'Este equipo no tiene huella disponible.')
      : has ? el('div', { class: 'section-row' }, el('span', { class: 'badge badge-ok' }, 'Huella activa en este equipo'), ui.button({ label: 'Quitar huella', variant: 'ghost', small: true, onClick: async () => { await security.removeBiometric(V.SCOPE); paintBio(); } }))
        : ui.button({ label: 'Usar huella', iconName: 'fingerprint', variant: 'secondary', small: true, onClick: async () => {
          const pin = await askPin('Escribe el PIN del Rincón');
          if (!pin) return;
          const r = await security.verifyPin(V.SCOPE, pin);
          if (r.error) { ui.toast(r.error, { tone: 'error' }); return; }
          try { const bio = await security.enrollBiometric(V.SCOPE, r.keys[r.keys.length - 1].rawDek); ui.toast(bio.prf ? 'Listo: la huella abre el Rincón.' : 'Listo, pero en este equipo la huella no abre lo cifrado.'); } catch { ui.toast('No se pudo registrar la huella.'); }
          paintBio();
        } }));
  };
  await paintBio();

  add(body,
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, `Niveles de ${profile.name(me)}`),
      el('p', { class: 'muted small' }, `Cada uno elige los suyos en su turno con la app. Para cambiar los de ${profile.name(profile.partnerOf(me))}, cambien de persona arriba.`),
      levelSel, levelHint, ownToggle),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, `Límites de ${profile.name(me)}`),
      el('p', { class: 'muted small' }, `Lo que marques no sale nunca, aunque el otro lo acepte. Tus límites no se le muestran a ${profile.name(profile.partnerOf(me))}.`),
      tagBox, ui.field({ label: 'Palabras que no quiero ver', control: words })),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Juego'),
      ui.toggle({ label: 'Subir poco a poco', hint: 'Empiezan suave y suben un nivel en cada tramo, con un descanso antes.', checked: !!s.ramp, onChange: (v) => save({ ramp: v }) }),
      num('Descanso cada', 'restEvery', 3, 20, 1, 'cartas'),
      num('Retos encadenados', 'chainLength', 3, 10, 1, 'retos por cadena'),
      num('Rondas del juego de prendas', 'prendasRounds', 4, 20)),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Grabaciones'),
      num('Audio máximo', 'recMaxAudioSec', 30, 1800, 30, 'segundos'),
      num('Video máximo', 'recMaxVideoSec', 10, 600, 10, 'segundos'),
      num('Tamaño máximo', 'recMaxMB', 5, 300, 5, 'MB')),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Seguridad'),
      el('p', { class: 'muted small' }, 'El Rincón se cierra siempre al salir. Eso no se puede apagar.'),
      bioBox,
      ui.button({ label: 'Cambiar el PIN', iconName: 'key-round', variant: 'secondary', small: true, onClick: changePin }),
      field('Cerrar también tras minutos sin usar (0 = nunca)', (() => {
        const i = ui.input({ type: 'number', min: 0, max: 60, value: local.idleMinutes || 0, inputmode: 'numeric' });
        i.addEventListener('change', async () => { const v = util.clamp(Math.round(Number(i.value) || 0), 0, 60); i.value = v; await V.setLocal({ idleMinutes: v }); });
        return i;
      })()),
      ui.toggle({ label: 'Borrar el Rincón de este equipo tras 10 intentos fallidos', hint: 'Apagado de fábrica. Los otros teléfonos conservan el suyo.', checked: !!local.wipeAfterFailures, onChange: (v) => V.setLocal({ wipeAfterFailures: v }) }),
      ui.toggle({ label: 'Mostrar el Rincón en Más', hint: 'Apagado: solo se abre tocando 7 veces el sello de Ajustes.', checked: !!local.showInMore, onChange: (v) => V.setLocal({ showInMore: v }) })),
    backupCard(),
    el('section', { class: 'card stack' },
      el('h2', { class: 'card-title' }, 'Borrar'),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Borrar el Rincón de este equipo', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => wipe('local') }),
        ui.button({ label: 'Borrar su contenido en todos', iconName: 'trash-2', variant: 'ghost', small: true, onClick: () => wipe('all') }))));
}

const field = (label, control) => ui.field({ label, control });

function askPin(label) {
  return new Promise((resolve) => {
    let out = null;
    const pad = ui.pinPad({ label, min: V.PIN_DIGITS, max: V.PIN_DIGITS, submitLabel: 'Seguir', onSubmit: async (v) => { out = v; m.close(); return null; } });
    const m = ui.openModal({ title: 'PIN del Rincón', size: 'sm', body: el('div', { class: 'stack center-col' }, pad), onClose: () => resolve(out) });
    requestAnimationFrame(() => pad.focusInput());
  });
}

async function changePin() {
  const old = await askPin('PIN actual');
  if (!old) return;
  const r = await security.verifyPin(V.SCOPE, old);
  if (r.error) { ui.toast(r.error, { tone: 'error' }); return; }
  const a = await askPin('Nuevo PIN de 6 números');
  if (!a) return;
  const b = await askPin('Repite el nuevo PIN');
  if (a !== b) { ui.toast('No coinciden. El PIN sigue igual.', { tone: 'error' }); return; }
  await security.changePin(V.SCOPE, old, a, r.keys);
  ui.toast('PIN cambiado.', { tone: 'success' });
}

function backupCard() {
  let withRec = true;
  const file = el('input', { type: 'file', id: 'yoru-backup-file', accept: '.json,application/json', class: 'sr-only' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    let obj; try { obj = JSON.parse(await f.text()); } catch { ui.toast('El archivo no se pudo leer.', { tone: 'error' }); return; }
    if (obj?.format !== V.BACKUP_FORMAT) { ui.toast('Este archivo no es una copia del Rincón.', { tone: 'error' }); return; }
    const phrase = await askPhrase('Frase de la copia', 'La que escribieron al crear esta copia.');
    if (!phrase) return;
    try { const n = await V.importBackup(obj, phrase); ui.toast(`Restaurado: ${n.records} registros y ${n.media} grabaciones.`, { tone: 'success' }); }
    catch (e) { ui.toast(e.message || 'No se pudo restaurar.', { tone: 'error' }); }
  });
  return el('section', { class: 'card stack' },
    el('h2', { class: 'card-title' }, 'Copia del Rincón'),
    el('p', { class: 'muted small' }, 'Va aparte de la copia general (que nunca incluye el Rincón) y se cifra con una frase propia. Sin esa frase no se puede abrir: guárdenla bien y no compartan el archivo.'),
    ui.toggle({ label: 'Incluir las grabaciones', hint: 'Pueden pesar mucho.', checked: withRec, onChange: (v) => { withRec = v; } }),
    el('div', { class: 'btn-row' },
      ui.button({ label: 'Crear copia cifrada', iconName: 'download', variant: 'secondary', small: true, onClick: async () => {
        const phrase = await askPhrase('Frase de la copia', 'Mínimo 8 caracteres. No se guarda en ninguna parte.', { confirm: true });
        if (!phrase) return;
        ui.toast('Cifrando la copia…');
        const out = await V.exportBackup(phrase, { withRecordings: withRec });
        const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `rincon-${util.localDay()}.json` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        ui.toast('Copia descargada.', { tone: 'success' });
      } }),
      file, el('label', { class: 'btn btn-ghost btn-small', for: 'yoru-backup-file' }, icon('upload'), el('span', {}, 'Restaurar copia'))));
}

async function wipe(where) {
  const ok = await ui.confirmDialog({
    title: where === 'local' ? '¿Borrar el Rincón de este equipo?' : '¿Borrar el contenido del Rincón en todos los equipos?',
    message: where === 'local' ? 'Se borran el PIN, el contenido, el diario y las grabaciones de este equipo. Los otros teléfonos conservan el suyo.' : 'Se borran el contenido, el diario y las marcas en los teléfonos unidos. El PIN de cada equipo se mantiene. No se puede deshacer.',
    confirmLabel: 'Seguir', danger: true,
  });
  if (!ok) return;
  const pin = await askPin('Confirma con el PIN del Rincón');
  if (!pin) return;
  const r = await security.verifyPin(V.SCOPE, pin);
  if (r.error) { ui.toast(r.error, { tone: 'error' }); return; }
  if (where === 'local') { await V.wipeLocal(); ui.toast('El Rincón se borró de este equipo.'); router.go('/ajustes'); }
  else { await V.wipeEverywhere(); ui.toast('Se borró el contenido del Rincón.'); router.go('/yoru'); }
}
