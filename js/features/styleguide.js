// Internal style guide (Ajustes > Acerca de > Guía de estilo): colors, type,
// icons, components and motion, to check consistency in every phase.
import { ui, util, profile, security } from '../core.js';

const { el, icon, ja } = util;

const COLORS = [
  ['--bg', 'Fondo'], ['--surface', 'Superficie'], ['--border', 'Borde'], ['--text', 'Texto'], ['--text-2', 'Texto secundario'],
  ['--accent', 'Acento'], ['--accent-soft', 'Acento suave'], ['--accent-2', 'Acento 2'], ['--gold', 'Kin'], ['--success', 'Éxito'], ['--danger', 'Peligro'],
];
export const ICONS = ['house', 'hourglass', 'ticket', 'mail', 'layout-grid', 'settings', 'calendar', 'cake', 'award', 'smile', 'sparkles', 'bell',
  'plane', 'image', 'book-open', 'map', 'star', 'lock', 'camera', 'notebook-pen', 'mic', 'message-circle-question', 'heart-handshake', 'hand-heart',
  'flag', 'repeat', 'music', 'list-checks', 'moon-star', 'dices', 'gift', 'gamepad-2', 'wand-sparkles', 'party-popper', 'paw-print', 'piggy-bank',
  'wallet', 'list-todo', 'chef-hat', 'user-round', 'users', 'heart', 'search', 'plus', 'x', 'check', 'arrow-left', 'chevron-right', 'eye-off',
  'fingerprint', 'download', 'upload', 'share-2', 'sun', 'moon', 'sun-moon', 'palette', 'shield-check', 'file-text', 'info', 'triangle-alert', 'pencil', 'trash-2'];
export const JP_ICONS = ['jp-sakura', 'jp-torii', 'jp-chochin', 'jp-sensu', 'jp-tsuru', 'jp-omamori', 'jp-moon', 'jp-wave', 'jp-futo', 'jp-ticket'];

const chip = (v) => { const c = el('span', { class: 'swatch-chip' }); c.style.background = `var(${v})`; return c; };
const block = (title, ...kids) => el('section', { class: 'card stack sg-block' }, el('h2', { class: 'card-title' }, title), ...kids);

export function render() {
  const replay = (node) => { node.classList.remove('stagger'); void node.offsetWidth; ui.stagger(node); };
  const staggerDemo = ui.stagger(el('div', { class: 'sg-row' }, [1, 2, 3, 4, 5].map((n) => el('span', { class: 'sg-chip' }, String(n)))));
  const sealBox = el('div', { class: 'sg-row' }, ui.hanko({ size: 72, stamp: true }));
  let vis = 'shared';

  return el('section', { class: 'page page-wide styleguide' },
    ui.pageHeader({ title: 'Guía de estilo', back: '/ajustes/acerca' }),
    el('div', { class: 'sg-grid' },
      block('Colores', el('div', { class: 'swatches' }, COLORS.map(([v, n]) => el('div', { class: 'swatch' },
        chip(v), el('span', { class: 'swatch-name' }, n), el('code', {}, v))))),
      block('Tipografía',
        el('p', { class: 'sg-display' }, '1.234 días'),
        el('p', { class: 'sg-heading sg-h1' }, 'Título Shippori Mincho'),
        el('p', { class: 'sg-heading sg-h3' }, 'Subtítulo de sección'),
        el('p', {}, 'Cuerpo en Zen Maru Gothic: una fuente redondeada y amable para leer todos los días.'),
        el('p', { class: 'muted' }, 'Texto secundario para notas y ayudas.'),
        el('p', {}, 'Etiqueta japonesa: ', ja('思い出', 'omoide'))),
      block('Íconos', el('div', { class: 'icon-grid' }, [...ICONS, ...JP_ICONS].map((n) => el('span', { class: 'icon-cell', title: n }, icon(n), el('span', { class: 'icon-name' }, n))))),
      block('Botones',
        el('div', { class: 'sg-row' },
          ui.button({ label: 'Principal', variant: 'primary' }), ui.button({ label: 'Secundario' }), ui.button({ label: 'Fantasma', variant: 'ghost' }),
          ui.button({ label: 'Peligro', variant: 'danger' }), ui.button({ label: 'Con ícono', iconName: 'heart', variant: 'primary' }),
          el('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Deshabilitado'),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ícono' }, icon('plus'))),
        el('div', { class: 'sg-row' }, el('span', { class: 'badge' }, 'Fase 3'), el('span', { class: 'badge badge-ok' }, 'Lista'), el('span', { class: 'pending' }, 'por completar'))),
      block('Formularios',
        ui.field({ label: 'Título', control: ui.input({ placeholder: 'Escribe algo' }), hint: 'Una ayuda corta.' }),
        (() => { const f = ui.field({ label: 'Con error', control: ui.input({ value: '' }) }); f.setError('Este campo es obligatorio.'); return f; })(),
        ui.field({ label: 'Nota', control: ui.textarea({ rows: 3 }) }),
        ui.toggle({ label: 'Interruptor', hint: 'Con texto de ayuda.', checked: true }),
        ui.segmented({ label: 'Tema', value: 'a', options: [{ value: 'a', label: 'Uno' }, { value: 'b', label: 'Dos' }, { value: 'c', label: 'Tres' }] }),
        ui.visibilityPicker({ value: vis, onChange: async (v) => {
          vis = v;
          if (v === 'self') await security.offerPersonalPin(profile.active(), profile.name(profile.partnerOf(profile.active())));
        } })),
      block('Ventanas y avisos', el('div', { class: 'sg-row' },
        ui.button({ label: 'Modal', onClick: () => ui.openModal({ title: 'Un modal', jp: '手紙', romaji: 'tegami', body: el('p', {}, 'Se cierra con Esc, con la X o con Atrás, y devuelve el foco.'), actions: [{ label: 'Listo', variant: 'primary' }] }) }),
        ui.button({ label: 'Hoja / panel', onClick: () => ui.openModal({ kind: 'sheet', title: 'Hoja inferior', body: el('p', {}, 'En el teléfono sale desde abajo; en el PC es un panel lateral.') }) }),
        ui.button({ label: 'Confirmación', onClick: async () => ui.toast((await ui.confirmDialog({ title: '¿Borrar esto?', message: 'Se puede recuperar con una copia.', confirmLabel: 'Borrar', danger: true })) ? 'Confirmado' : 'Cancelado') }),
        ui.button({ label: 'Toast', onClick: () => ui.toast('Guardado con cariño.', { tone: 'success' }) }),
        ui.button({ label: 'Toast con acción', onClick: () => ui.toast('Hay una versión nueva de la app.', { action: { label: 'Actualizar', onClick: () => ui.toast('Ejemplo') } }) }),
        ui.shareButton({ title: 'Aishiteru', text: 'Un ejemplo para compartir' }))),
      block('PIN', ui.pinPad({ label: 'PIN de ejemplo (1234)', onSubmit: async (p) => (p === '1234' ? (ui.toast('Correcto', { tone: 'success' }), null) : 'PIN incorrecto. Inténtalo de nuevo.') })),
      block('Tarjetas y estados',
        el('div', { class: 'card shoji' }, el('p', { class: 'card-kicker' }, 'Marco shoji'), el('p', {}, 'Borde fino con esquinas marcadas.')),
        el('div', { class: 'brush-divider', role: 'separator' }),
        ui.emptyState({ title: 'Aún no hay recuerdos', text: 'El primero puede ser el de hoy.', art: 'crane', action: { label: 'Agregar', onClick: () => {} } }),
        ui.skeleton(3)),
      block('Patrones', el('div', { class: 'patterns' }, ['seigaiha', 'asanoha', 'kumiko'].map((p) => el('div', { class: `pattern pattern-${p}` }, el('span', {}, p))))),
      block('Movimiento',
        el('p', { class: 'muted' }, 'Con "Animaciones" apagado o reduce motion del sistema, todo se vuelve sobrio.'),
        staggerDemo, ui.button({ label: 'Repetir entrada escalonada', onClick: () => replay(staggerDemo) }),
        sealBox, ui.button({ label: 'Estampar sello', onClick: () => sealBox.replaceChildren(ui.hanko({ size: 72, stamp: true })) }),
        el('div', { class: 'card ripple sg-ripple' }, 'Toca aquí para ver la onda'))));
}
