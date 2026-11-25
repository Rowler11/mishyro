// Papelera (revisión 2026-11-21, idea N4): what is deleted in the main sections stays 30 days on
// this device and can come back. The deletion itself still travels to the other phone as before;
// bringing something back writes it again, so it returns to both.
import { ui, util, db, profile } from '../core.js';

const { el, icon } = util;
const fmtDay = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });

/**
 * Move a record (and its photos) to the Papelera and say so with an "Deshacer" toast.
 * label: what the person sees ("Recuerdo: Playa"); never stored for "Solo yo" or encrypted records.
 */
export async function toTrash(store, id, { label = '', section = '', what = 'Listo', extraMedia = [], onRestored } = {}) {
  const tid = await db.trash(store, id, { label, section, extraMedia });
  if (!tid) return null;
  ui.toast(`${what}: queda 30 días en la Papelera.`, { action: { label: 'Deshacer', onClick: async () => {
    if (await db.restore(tid)) { ui.toast('Volvió a su lugar.', { tone: 'success' }); onRestored?.(); }
  } } });
  return tid;
}

/** Text for the confirm dialogs that now go to the Papelera. */
export const TRASH_NOTE = 'Se borra en los dos teléfonos y queda 30 días en la Papelera de este, por si se arrepienten.';

const SECTION = {
  memories: ['Recuerdo', 'hourglass', '#/capsula'], letters: ['Carta', 'mail', '#/cartas'], diary: ['Diario', 'notebook-pen', '#/diario'],
  firsts: ['Primera vez', 'star', '#/primeras-veces'], places: ['Lugar', 'map', '#/mapa'], timeCapsules: ['Cápsula del tiempo', 'lock', '#/capsula-tiempo'],
  voiceNotes: ['Nota de voz', 'mic', '#/voz'], songs: ['Canción', 'music', '#/canciones'], dreams: ['Sueño', 'moon-star', '#/suenos'],
  content: ['Texto', 'file-text', '#/ajustes/perfil'], personal: ['Dormir y soñar', 'bed', '#/dormir'], bucketList: ['Plan', 'list-checks', '#/planes'], recipes: ['Receta', 'chef-hat', '#/recetas'], events: ['Cita', 'calendar', '#/calendario'],
};
const daysLeft = (t) => Math.max(0, Math.ceil((new Date(t.expiresAt) - Date.now()) / 86400000));

export function render() {
  const body = el('div', { class: 'stack' }, ui.skeleton(3));
  const page = el('section', { class: 'page' }, ui.pageHeader({ title: 'Papelera', back: '/ajustes' }), body);
  const load = async () => {
    const list = await db.trashList();
    if (!list.length) {
      util.fill(body, ui.emptyState({ title: 'La Papelera está vacía', text: 'Lo que borren en Cápsula, Cartas, Diario y otras secciones queda aquí 30 días, por si quieren recuperarlo.', art: 'wave' }));
      return;
    }
    util.fill(body,
      el('p', { class: 'muted' }, 'Lo borrado queda aquí 30 días en este dispositivo. Al recuperarlo vuelve a su sección en los dos teléfonos.'),
      el('ul', { class: 'card trash-list' }, list.map((t) => {
        const [kind, ic, href] = SECTION[t.store] || ['Elemento', 'file-text', ''];
        const name = t.label || (t.visibility === 'self' ? 'Algo de "Solo yo"' : 'Sin título');
        const left = daysLeft(t);
        return el('li', { class: 'trash-row' },
          el('span', { class: 'list-icon' }, icon(ic)),
          el('div', { class: 'grow' },
            el('strong', { class: 'trash-name' }, name),
            el('p', { class: 'muted small' }, [kind, `borrado el ${fmtDay.format(new Date(t.deletedAt))}`, t.by ? `por ${profile.name(t.by)}` : '', left === 1 ? 'queda 1 día' : `quedan ${left} días`].filter(Boolean).join(' · '))),
          el('div', { class: 'btn-row' },
            ui.button({ label: 'Recuperar', iconName: 'rotate-ccw', small: true, onClick: async () => {
              await db.restore(t.id); ui.toast(`${kind} recuperado. Está otra vez en su sección.`, { tone: 'success', action: href ? { label: 'Ver', onClick: () => { location.hash = href; } } : undefined }); load();
            } }),
            el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': `Borrar para siempre: ${name}`, onClick: async () => {
              if (!(await ui.confirmDialog({ title: '¿Borrar para siempre?', message: 'Ya no se podrá recuperar.', confirmLabel: 'Borrar', danger: true }))) return;
              await db.forget(t.id); load();
            } }, icon('trash-2', { size: 18 }))));
      })),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Vaciar la Papelera', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => {
        if (!(await ui.confirmDialog({ title: '¿Vaciar la Papelera?', message: `Se borran para siempre ${list.length === 1 ? 'el elemento' : `los ${list.length} elementos`} de este dispositivo.`, confirmLabel: 'Vaciar', danger: true }))) return;
        for (const t of list) await db.forget(t.id);
        load();
      } })));
  };
  load().catch((e) => { console.error(e); util.fill(body, ui.emptyState({ title: 'No pudimos abrir la Papelera', text: 'Cierra y vuelve a abrir la app.', art: 'wave' })); });
  const off = db.onChange((s) => { if (s === 'trash' && !document.querySelector('.overlay')) load().catch(() => {}); });
  return { node: page, cleanup: off };
}
