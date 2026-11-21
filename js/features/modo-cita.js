// Modo cita (revisión 2026-11-21, idea N5): one calm screen for while they are out together.
// A question to talk about, a quick photo button and a line "para no olvidar"; at the end the
// app puts it all together as a memory in the Cápsula and asks them to put the phone away.
// The date in progress lives in this device's settings (never synced) so a reload resumes it.
import { ui, util, db, profile, CONFIG } from '../core.js';
import { compressImage, isQuotaError, MAX_PHOTOS } from '../core/images.js';

const { el, icon } = util;
const STATE = 'modoCita';
const fmtTime = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });

/** "45 min", "1 h 5 min", "3 h". */
export function lengthText(fromIso, now = new Date()) {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso)) / 60000));
  const h = Math.floor(mins / 60); const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const questions = () => (CONFIG.questionBank || []).filter((q) => q.text);
const pickQuestion = (avoid) => {
  const list = questions().filter((q) => q.id !== avoid);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
};

async function readState() { const s = await db.getSettings(STATE, { active: false }); return s.active ? s : null; }
const saveState = (patch) => db.setSettings(STATE, patch);
async function clearState() { await db.setSettings(STATE, { active: false, memoryId: '', mediaIds: [], title: '', place: '', note: '', startedAt: '', questionId: '' }); }

export async function render(ctx) {
  const body = el('div', { class: 'stack date-mode' }, ui.skeleton(3));
  const page = el('section', { class: 'page' }, ui.pageHeader({ title: 'Modo cita', jp: 'お出かけ', romaji: 'odekake', back: '/mas/juntos' }), body);
  const urls = new Set();
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };

  // ---------- before ----------
  const startScreen = () => {
    const title = ui.input({ maxlength: 80, placeholder: 'Ej.: Cena y caminata', value: ctx?.query?.titulo || '' });
    const place = ui.input({ maxlength: 80, placeholder: 'Opcional', value: ctx?.query?.lugar || '' });
    util.fill(body,
      el('div', { class: 'card paper-card stack date-mode-intro' },
        el('span', { class: 'date-mode-seal', 'aria-hidden': 'true' }, icon('heart', { size: 30 })),
        el('h2', { class: 'card-title' }, 'Para cuando salgan juntos'),
        el('p', {}, 'Una pregunta para conversar, un botón para la foto y, al final, el recuerdo queda armado solo en la Cápsula. El resto del tiempo, el teléfono guardado.')),
      el('div', { class: 'card stack' },
        ui.field({ label: '¿Qué van a hacer?', control: title }),
        ui.field({ label: '¿Dónde?', control: place }),
        ui.button({ label: 'Empezar la cita', iconName: 'heart', variant: 'primary', onClick: async () => {
          await saveState({ active: true, memoryId: util.uuid(), startedAt: util.nowISO(), title: title.value.trim(), place: place.value.trim(), note: '', mediaIds: [], questionId: pickQuestion()?.id || '', by: profile.active() });
          util.haptic(15); draw();
        } })));
  };

  // ---------- during ----------
  const liveScreen = (s) => {
    const since = el('p', { class: 'date-mode-time', 'aria-live': 'off' });
    const paintTime = () => { since.textContent = `Juntos desde las ${fmtTime.format(new Date(s.startedAt))} · ${lengthText(s.startedAt)}`; };
    paintTime(); clearInterval(timer); timer = setInterval(paintTime, 30000);

    const q = questions().find((x) => x.id === s.questionId) || pickQuestion();
    const qText = el('p', { class: 'date-mode-question' }, q ? q.text : 'Cuéntense lo mejor de su semana.');
    let qId = q?.id || '';
    const another = ui.button({ label: 'Otra pregunta', iconName: 'refresh-cw', small: true, variant: 'ghost', onClick: async () => {
      const n = pickQuestion(qId); if (!n) return; qId = n.id; qText.textContent = n.text; await saveState({ questionId: n.id });
    } });

    const grid = el('div', { class: 'photo-grid date-mode-photos' });
    const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'date-mode-photo', 'aria-label': 'Tomar una foto' });
    const paintPhotos = async () => {
      const ids = (await readState())?.mediaIds || [];
      const tiles = [];
      for (const [i, id] of ids.entries()) {
        const b = await db.getMedia(id).catch(() => null);
        if (!b) continue;
        const u = URL.createObjectURL(b); urls.add(u);
        tiles.push(el('div', { class: 'photo-tile' }, el('img', { src: u, alt: `Foto ${i + 1} de la cita` }),
          el('button', { class: 'icon-btn photo-remove', type: 'button', 'aria-label': `Quitar la foto ${i + 1}`, onClick: async () => {
            const cur = (await readState())?.mediaIds || [];
            await db.rawDelete('media', id).catch(() => {});
            await saveState({ mediaIds: cur.filter((x) => x !== id) }); paintPhotos();
          } }, icon('x', { size: 16 }))));
      }
      util.fill(grid, tiles, ids.length < MAX_PHOTOS ? el('label', { class: 'photo-add', for: file.id }, icon('camera', { size: 24 }), el('span', { class: 'small' }, 'Foto')) : null);
    };
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; file.value = '';
      if (!f) return;
      try {
        const cur = (await readState())?.mediaIds || [];
        if (cur.length >= MAX_PHOTOS) { ui.toast(`Caben ${MAX_PHOTOS} fotos por recuerdo.`); return; }
        const img = await compressImage(f);
        const id = await db.putMedia(img.blob, { ownerStore: 'memories', ownerId: s.memoryId, width: img.width, height: img.height });
        await saveState({ mediaIds: [...cur, id] }); util.haptic(10); paintPhotos();
      } catch (e) {
        ui.toast(isQuotaError(e) ? 'No queda espacio en este teléfono para la foto.' : 'No se pudo guardar la foto. Inténtalo otra vez.', { tone: 'error' });
      }
    });
    paintPhotos();

    const note = ui.textarea({ rows: 3, maxlength: 600, placeholder: 'Lo que dijeron, lo que comieron, lo que no quieren olvidar…' });
    note.value = s.note || ''; // a textarea takes its text from .value, not from the attribute
    note.addEventListener('input', util.debounce(() => saveState({ note: note.value }), 400));

    util.fill(body,
      el('div', { class: 'card paper-card date-mode-head' },
        el('p', { class: 'card-kicker' }, 'Cita en curso'),
        el('h2', { class: 'date-mode-title' }, s.title || 'Una cita juntos'),
        s.place ? el('p', { class: 'muted small' }, icon('map-pin', { size: 14 }), ` ${s.place}`) : null,
        since,
        el('p', { class: 'muted small' }, 'Pongan el teléfono boca abajo. Aquí todo queda esperando.')),
      el('section', { class: 'card stack', 'aria-labelledby': 'dm-q' },
        el('h2', { class: 'card-kicker', id: 'dm-q' }, 'Para conversar'), qText, another),
      el('section', { class: 'card stack', 'aria-labelledby': 'dm-p' },
        el('h2', { class: 'card-kicker', id: 'dm-p' }, 'Fotos de hoy'), grid, file),
      el('section', { class: 'card stack' }, ui.field({ label: 'Para no olvidar', control: note })),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Terminar y guardar el recuerdo', iconName: 'hourglass', variant: 'primary', onClick: () => finish(note.value) }),
        ui.button({ label: 'Cancelar la cita', variant: 'ghost', small: true, onClick: cancel })));
  };

  const finish = async (noteText) => {
    const s = await readState(); if (!s) return draw();
    const lines = [noteText.trim(), s.place ? `En ${s.place}.` : '', `${lengthText(s.startedAt)} juntos.`].filter(Boolean);
    try {
      await db.put('memories', {
        id: s.memoryId, title: s.title || 'Una cita juntos', date: util.localDay(new Date(s.startedAt)), note: lines.join('\n'),
        mediaIds: s.mediaIds || [], draft: false, visibility: 'shared', private: false, owner: s.by || profile.active(), fromDateMode: true,
      });
    } catch (e) { console.error(e); ui.toast('No se pudo guardar el recuerdo. Inténtalo otra vez.', { tone: 'error' }); return; }
    await clearState(); stop();
    util.haptic([10, 30, 10]); util.sound('chime'); ui.confetti({ count: 24 });
    util.fill(body,
      el('div', { class: 'card paper-card stack date-mode-end' },
        el('span', { class: 'date-mode-seal', 'aria-hidden': 'true' }, icon('check', { size: 30 })),
        el('h2', { class: 'card-title' }, 'Quedó guardado en la Cápsula'),
        el('p', {}, 'Ahora sí: a guardar el teléfono y a seguir disfrutando.'),
        el('div', { class: 'btn-row' },
          ui.button({ label: 'Ver el recuerdo', iconName: 'hourglass', href: `#/capsula/${encodeURIComponent(s.memoryId)}` }),
          ui.button({ label: 'Listo', variant: 'ghost', href: '#/inicio' }))));
  };

  const cancel = async () => {
    if (!(await ui.confirmDialog({ title: '¿Cancelar la cita?', message: 'Se borran las fotos y la nota de esta cita. No se guarda ningún recuerdo.', confirmLabel: 'Cancelar la cita', cancelLabel: 'Seguir', danger: true }))) return;
    const s = await readState();
    for (const id of s?.mediaIds || []) await db.rawDelete('media', id).catch(() => {});
    await clearState(); stop(); draw();
  };

  const draw = async () => {
    stop();
    const s = await readState();
    if (s) liveScreen(s); else startScreen();
  };
  await draw().catch((e) => { console.error(e); util.fill(body, ui.emptyState({ title: 'No pudimos abrir el modo cita', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); });
  return { node: page, cleanup: stop };
}

/** Is a date in progress? (for the "Cita en curso" note in Sugerencias de citas). */
export const inProgress = async () => !!(await readState());
