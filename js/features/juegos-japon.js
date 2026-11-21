// Japanese corner of the Juegos en pareja (docs/05 §34, Fase 5B): Origami (step by step guides
// with animated folds and the senbazuru counter), Tanabata (wishes on tanzaku strips hung on a
// bamboo, reviewed the next year), Palabra del día (a daily word for the trip, review cards and a
// quiz between the two), Nuestro manga (panels with their photos, speech bubbles and sound
// effects, exported as an image or printed) and Postales para imprimir (designs to hand over).
import { ui, util, db, profile, CONFIG } from '../core.js';
import * as K from './juegos-kit.js';

const { el, icon } = util;
/** replaceChildren that skips null/false (native replaceChildren would print "null"). */
const add = (node, ...kids) => node.append(...kids.flat().filter((k) => k != null && k !== false));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); kids.flat().filter(Boolean).forEach((k) => n.append(k)); return n; };
const pub = (r) => r && !r.deleted && r.visibility !== 'self' && !r.private;

export const direct = ['origami', 'tanabata', 'kotoba', 'manga', 'postales'];

// Decided with the user (Fase 5B cards): Japanese writing allowed in Palabra del día and in the
// manga sound effects; Tanabata wishes are written from July 1 to 7.
export const KOTOBA_SHOW_JP = true;
export const MANGA_SFX_JP = true;
export const TANABATA_WINDOW = { month: 7, from: 1, to: 7 };

// ---------- Origami ----------
// Diagrams on a 100x100 paper. shape: outline; folds: dashed fold lines; arrow: path of the move.
const SQ = '10,10 90,10 90,90 10,90';
export const ORIGAMI = [
  { id: 'grulla', title: 'Grulla', level: 'Media', blurb: 'La clásica: la de los mil deseos.', steps: [
    { text: 'Empieza con un cuadrado, color hacia abajo. Dobla por las dos diagonales y desdobla.', shape: SQ, folds: ['10,10 90,90', '90,10 10,90'] },
    { text: 'Voltea el papel. Dóblalo por la mitad a lo alto y a lo ancho, y desdobla.', shape: SQ, folds: ['50,10 50,90', '10,50 90,50'], flip: true },
    { text: 'Junta las cuatro esquinas abajo siguiendo los pliegues: queda un cuadrado pequeño (base preliminar), con la punta abierta abajo.', shape: '50,12 82,50 50,88 18,50', arrow: 'M20 20 Q35 60 48 84' },
    { text: 'En la capa de arriba, dobla los bordes de abajo hacia la línea del centro: queda una cometa.', shape: '50,12 68,46 50,88 32,46', folds: ['50,88 32,46', '50,88 68,46'], arrow: 'M24 52 Q34 58 44 62' },
    { text: 'Dobla el triángulo de arriba hacia abajo, marca bien y desdobla los tres pliegues.', shape: '50,12 82,50 50,88 18,50', folds: ['32,46 68,46'], arrow: 'M50 16 Q60 30 50 44' },
    { text: 'Doblez de pétalo: levanta la punta de abajo de la capa de arriba siguiendo el pliegue y deja que los lados se cierren hacia el centro.', shape: '50,4 64,50 50,90 36,50', arrow: 'M50 86 Q66 50 50 10' },
    { text: 'Voltea y repite los pasos 4 a 6 del otro lado: queda la base de pájaro, un rombo largo.', shape: '50,4 64,50 50,96 36,50', flip: true },
    { text: 'Dobla los bordes de abajo de la capa de arriba hacia el centro, para afinar las patas. Voltea y repite.', shape: '50,4 64,50 50,96 44,50 50,60 56,50', folds: ['50,96 44,50', '50,96 56,50'] },
    { text: 'Doblez invertido hacia adentro: sube cada pata entre las capas para formar el cuello y la cola.', shape: '50,30 64,58 50,70 36,58 14,18 40,56 60,56 86,18', arrow: 'M42 92 Q24 60 18 24' },
    { text: 'Haz otro doblez invertido pequeño en la punta del cuello: es la cabeza.', shape: '50,30 64,58 50,70 36,58 14,18 10,26 40,56 60,56 86,18', arrow: 'M18 22 Q8 22 10 28' },
    { text: 'Baja las alas, una a cada lado.', shape: '50,30 90,44 64,58 50,70 36,58 10,44 14,18 10,26 40,56 60,56 86,18', arrow: 'M50 34 Q76 30 86 44' },
    { text: '¡Lista! Abre un poco las alas con cuidado y sopla suave por el agujero de abajo para inflar el cuerpo.', final: 'crane' },
  ] },
  { id: 'corazon', title: 'Corazón', level: 'Fácil', blurb: 'Para dejarlo en una carta o en la almohada.', steps: [
    { text: 'Empieza con un cuadrado, color hacia abajo. Dobla por la mitad a lo alto y a lo ancho, y desdobla.', shape: SQ, folds: ['50,10 50,90', '10,50 90,50'] },
    { text: 'Dobla el borde de arriba hasta la línea del centro.', shape: '10,30 90,30 90,90 10,90', folds: ['10,30 90,30'], arrow: 'M50 12 Q62 22 50 46' },
    { text: 'Dobla el borde de abajo hasta el borde de arriba.', shape: '10,30 90,30 90,60 10,60', arrow: 'M50 88 Q64 60 50 32' },
    { text: 'Dobla la mitad derecha hacia arriba siguiendo la línea del centro, para que el borde de abajo quede vertical. Repite con la izquierda.', shape: '30,10 50,30 70,10 90,30 50,72 10,30', folds: ['50,30 50,72'], arrow: 'M86 58 Q84 30 70 16' },
    { text: 'Voltea el papel.', shape: '30,10 50,30 70,10 90,30 50,72 10,30', flip: true },
    { text: 'Dobla hacia atrás las cuatro puntas de arriba y las dos de los lados para redondear.', shape: '18,26 30,14 46,18 50,28 54,18 70,14 82,26 50,72', folds: ['22,12 12,24', '78,12 88,24'] },
    { text: 'Voltea: ¡tu corazón está listo!', final: 'heart' },
  ] },
  { id: 'rana', title: 'Rana saltarina', level: 'Media', blurb: 'Salta si le presionas la espalda.', steps: [
    { text: 'Usa medio cuadrado (un rectángulo). Dobla cada esquina de arriba en diagonal y desdobla: queda una X arriba.', shape: '30,8 70,8 70,92 30,92', folds: ['30,8 70,48', '70,8 30,48'] },
    { text: 'Dobla hacia atrás por la línea que cruza la X y desdobla.', shape: '30,8 70,8 70,92 30,92', folds: ['30,28 70,28'] },
    { text: 'Hunde los lados por los pliegues para que la parte de arriba se cierre en un triángulo.', shape: '50,8 70,28 70,92 30,92 30,28', arrow: 'M32 22 Q40 26 46 26' },
    { text: 'Dobla las puntas de abajo del triángulo hacia la punta de arriba: son las patas de adelante.', shape: '50,8 62,20 70,28 70,92 30,92 30,28 38,20', arrow: 'M34 28 Q38 16 48 10' },
    { text: 'Dobla los dos lados largos hacia el centro.', shape: '50,8 70,28 60,28 60,92 40,92 40,28 30,28', folds: ['40,28 40,92', '60,28 60,92'] },
    { text: 'Dobla la parte de abajo hacia arriba hasta la base del triángulo.', shape: '50,8 70,28 60,28 60,60 40,60 40,28 30,28', arrow: 'M50 90 Q64 74 50 62' },
    { text: 'Ahora dobla esa misma parte por la mitad, hacia abajo: es el resorte.', shape: '50,8 70,28 60,28 60,62 40,62 40,28 30,28', folds: ['40,46 60,46'] },
    { text: 'Voltea la rana. Presiona con el dedo la parte de atrás y suéltala: ¡salta!', final: 'frog' },
  ] },
  { id: 'tulipan', title: 'Tulipán', level: 'Fácil', blurb: 'Una flor con tallo, para regalar.', steps: [
    { text: 'Flor: dobla un cuadrado por la diagonal para formar un triángulo, con la punta hacia abajo.', shape: '10,20 90,20 50,80', folds: ['10,20 90,20'] },
    { text: 'Dobla la esquina izquierda hacia arriba en diagonal, que pase un poco la punta de arriba.', shape: '30,8 50,40 90,20 50,80 10,20', arrow: 'M14 22 Q20 4 32 10' },
    { text: 'Haz lo mismo con la esquina derecha. Ya se ve el tulipán.', shape: '30,8 50,40 70,8 90,20 50,80 10,20', arrow: 'M86 22 Q80 4 68 10' },
    { text: 'Voltea y dobla hacia atrás las puntas de los lados y la de abajo para redondear la flor.', shape: '30,10 50,36 70,10 80,24 50,74 20,24', flip: true },
    { text: 'Tallo: con otro cuadrado verde, dobla una cometa (dos bordes hacia la diagonal del centro).', shape: '50,6 64,60 50,94 36,60', folds: ['50,6 50,94'] },
    { text: 'Afina la cometa doblando otra vez los bordes hacia el centro, y dóblala por la mitad a lo largo.', shape: '50,6 56,60 50,94 44,60', arrow: 'M40 70 Q50 64 60 70' },
    { text: 'Saca un poco la parte de abajo como hoja y mete la punta de arriba en la flor. ¡Listo!', final: 'tulip' },
  ] },
];
export const SENBAZURU = 1000;
const FINALS = {
  crane: () => svg('path', { d: 'M8 30 L36 58 L50 40 L64 58 L92 22 L62 64 L50 76 L38 64 L14 40 L8 30 Z M8 30 L4 36 L10 36', class: 'ori-paper' }),
  heart: () => svg('path', { d: 'M50 84 L14 44 C4 30 14 14 30 16 C40 17 46 24 50 32 C54 24 60 17 70 16 C86 14 96 30 86 44 Z', class: 'ori-paper' }),
  frog: () => svg('g', {}, svg('path', { d: 'M50 16 L76 42 L70 74 L30 74 L24 42 Z', class: 'ori-paper' }), svg('circle', { cx: 42, cy: 36, r: 3.5, class: 'ori-eye' }), svg('circle', { cx: 58, cy: 36, r: 3.5, class: 'ori-eye' })),
  tulip: () => svg('g', {}, svg('path', { d: 'M50 54 L50 94', class: 'ori-stem' }), svg('path', { d: 'M50 80 Q64 66 70 70 Q62 84 50 86', class: 'ori-leaf' }), svg('path', { d: 'M30 10 L50 30 L70 10 L80 26 L50 58 L20 26 Z', class: 'ori-paper' })),
};
function oriDiagram(st) {
  const box = svg('svg', { viewBox: '0 0 100 100', class: 'ori-svg', 'aria-hidden': 'true' });
  if (st.final) { add(box, FINALS[st.final]()); box.classList.add('is-final'); return box; }
  add(box, svg('polygon', { points: st.shape, class: `ori-paper${st.flip ? ' is-flip' : ''}` }));
  for (const f of st.folds || []) { const [a, b] = f.split(' ').map((p) => p.split(',').map(Number)); add(box, svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'ori-fold', pathLength: 100 })); }
  if (st.arrow) add(box, svg('path', { d: st.arrow, class: 'ori-arrow', pathLength: 100, 'marker-end': 'url(#ori-head)' }));
  add(box, svg('defs', {}, svg('marker', { id: 'ori-head', viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0 L10 5 L0 10 Z', class: 'ori-arrow-head' }))));
  return box;
}

async function senbazuruCounts() {
  const recs = await K.artifacts('origami', 'senbazuru');
  const by = Object.fromEntries(profile.PEOPLE.map((p) => [p, recs.find((r) => r.id === `senbazuru:${p}`)?.data?.count || 0]));
  const wish = recs.find((r) => r.id === 'senbazuru:wish')?.data?.text || '';
  return { by, total: Object.values(by).reduce((a, b) => a + b, 0), wish };
}

async function origami(ctx) {
  const box = el('div', { class: 'stack' });
  const home = async () => {
    const sb = await senbazuruCounts();
    const strings = el('div', { class: 'senbazuru', role: 'img', 'aria-label': `${sb.total} de ${SENBAZURU} grullas` },
      Array.from({ length: 25 }, (_, i) => { const filled = Math.max(0, Math.min(40, sb.total - i * 40)); return el('span', { class: 'sb-string', style: { '--fill': String(filled / 40) } }); }));
    const bump = async (n) => {
      const me = profile.active(); const id = `senbazuru:${me}`;
      const cur = (await db.get('gameArtifacts', id).catch(() => null))?.data?.count || 0;
      const next = Math.max(0, cur + n);
      await K.putArtifact({ id, gameId: 'origami', type: 'senbazuru', data: { count: next } });
      if (n > 0) { util.haptic(8); K.ding(); }
      const after = sb.total + (next - cur);
      if (n > 0 && [100, 250, 500, 750, 1000].some((m) => sb.total < m && after >= m)) ui.confetti({ count: after >= SENBAZURU ? 90 : 30 });
      home();
    };
    put(box,
      el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Guías paso a paso'),
        el('ul', { class: 'game-grid' }, ORIGAMI.map((g) => el('li', {}, el('button', { class: 'game-tile', type: 'button', onClick: () => guide(g) },
          el('span', { class: 'section-icon' }, icon(g.id === 'grulla' ? 'jp-tsuru' : g.id === 'corazon' ? 'heart' : g.id === 'rana' ? 'leaf' : 'flower-2', { size: 22 })),
          el('span', { class: 'game-tile-text' }, el('span', { class: 'game-tile-title' }, g.title), el('span', { class: 'muted small' }, `${g.level} · ${g.steps.length} pasos`))))))),
      el('section', { class: 'card stack' },
        el('h2', { class: 'card-title' }, 'Senbazuru: mil grullas'),
        el('p', { class: 'muted small' }, 'Una tradición japonesa dice que quien dobla mil grullas de papel puede pedir un deseo. Se cuelgan en 25 hilos de 40 grullas. Vayan juntando las suyas.'),
        strings,
        el('p', { class: 'senbazuru-total' }, el('strong', {}, String(sb.total)), ` de ${SENBAZURU} · ${profile.PEOPLE.map((p) => `${profile.name(p)} ${sb.by[p]}`).join(' · ')}`),
        sb.wish ? el('p', { class: 'senbazuru-wish' }, icon('sparkles', { size: 16 }), ` Su deseo: ${sb.wish}`) : null,
        el('div', { class: 'btn-row' },
          ui.button({ label: 'Doblé una', iconName: 'plus', variant: 'primary', onClick: () => bump(1) }),
          ui.button({ label: '+10', variant: 'ghost', small: true, onClick: () => bump(10) }),
          ui.button({ label: 'Quitar una', variant: 'ghost', small: true, onClick: () => bump(-1) }),
          ui.button({ label: sb.wish ? 'Cambiar el deseo' : 'Escribir el deseo', iconName: 'pencil', variant: 'ghost', small: true, onClick: () => {
            const t = ui.input({ maxlength: '140', value: sb.wish });
            ui.openModal({ title: 'Nuestro deseo', kind: 'sheet', body: ui.field({ label: 'Cuando lleguen a mil…', control: t }),
              actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Guardar', variant: 'primary', onClick: async () => { await K.putArtifact({ id: 'senbazuru:wish', gameId: 'origami', type: 'senbazuru', data: { text: t.value.trim() } }); home(); return true; } }] });
          } }))));
    ctx.mount(box);
  };
  const guide = (g) => {
    let i = 0;
    const stage = el('div', { class: 'ori-stage' });
    const text = el('p', { class: 'ori-text', 'aria-live': 'polite' });
    const count = el('p', { class: 'muted small game-progress' });
    const prev = ui.button({ label: 'Anterior', iconName: 'arrow-left', variant: 'ghost', onClick: () => go(i - 1) });
    const next = ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: () => go(i + 1) });
    const go = (n) => {
      if (n >= g.steps.length) { K.logGame('origami', { result: g.title }); if (g.id === 'grulla') ui.toast('¿Sumamos la grulla al senbazuru?', { action: { label: 'Sumar', onClick: async () => { const id = `senbazuru:${profile.active()}`; const cur = (await db.get('gameArtifacts', id).catch(() => null))?.data?.count || 0; await K.putArtifact({ id, gameId: 'origami', type: 'senbazuru', data: { count: cur + 1 } }); ui.toast('Grulla sumada.', { tone: 'success' }); } } }); home(); return; }
      i = Math.max(0, n);
      const st = g.steps[i];
      put(stage, oriDiagram(st));
      text.textContent = st.text;
      count.textContent = `Paso ${i + 1} de ${g.steps.length}`;
      prev.disabled = i === 0;
      next.querySelector(':scope > span:not(.ripple-dot)').textContent = i === g.steps.length - 1 ? 'Terminé' : 'Siguiente';
      if (st.final) ui.confetti({ count: 20 });
    };
    ctx.mount(el('div', { class: 'stack center-col' },
      el('h2', { class: 'game-step-title', tabindex: '-1' }, g.title), count, stage, text,
      el('div', { class: 'btn-row center-row' }, prev, next),
      ui.button({ label: 'Volver a las guías', iconName: 'arrow-left', variant: 'ghost', small: true, onClick: home })));
    go(0);
  };
  await home();
  return () => {};
}

// ---------- Tanabata ----------
/** Whether wishes can be written on a day (window from CONFIG-like rule). */
export function tanabataOpen(day = util.localDay(), w = TANABATA_WINDOW) {
  const d = util.parseDay(day); if (!d) return false;
  return d.getMonth() + 1 === w.month && d.getDate() >= w.from && d.getDate() <= w.to;
}
/** Days until the next window opens (0 while open). */
export function daysToTanabata(day = util.localDay(), w = TANABATA_WINDOW) {
  if (tanabataOpen(day, w)) return 0;
  const d = util.parseDay(day); let y = d.getFullYear();
  let start = new Date(y, w.month - 1, w.from);
  if (d > new Date(y, w.month - 1, w.to)) start = new Date(++y, w.month - 1, w.from);
  return util.daysBetween(d, start);
}
const TANZAKU = ['#E9A3B6', '#F2D27B', '#9CC7A4', '#9DB8E0', '#C8A8DD', '#F4B183'];
const MAX_WISHES = 3;
// Where each strip hangs on the bamboo [left %, top %]: columns staggered so strips never overlap.
const TANZAKU_SLOTS = [[34, 8], [66, 8], [17, 20], [83, 20], [34, 34], [66, 34], [17, 46], [83, 46], [34, 60], [66, 60], [17, 72], [83, 72]];

async function tanabata(ctx) {
  const box = el('div', { class: 'stack' });
  let year = new Date().getFullYear();
  const load = async () => {
    const all = await K.artifacts('tanabata', 'tanzaku');
    const years = [...new Set([year, ...all.map((a) => a.data.year)])].sort((a, b) => b - a);
    const list = all.filter((a) => a.data.year === year).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const open = tanabataOpen() && year === new Date().getFullYear();
    const mineN = list.filter((a) => a.by === profile.active()).length;
    const bamboo = svg('svg', { viewBox: '0 0 300 420', class: 'bamboo', role: 'img', 'aria-label': `Bambú con ${list.length} deseos` },
      svg('path', { d: 'M150 410 L150 20', class: 'bamboo-stalk' }),
      ...[90, 180, 270, 360].map((y) => svg('path', { d: `M142 ${y} L158 ${y}`, class: 'bamboo-node' })),
      ...[[150, 60, -1], [150, 120, 1], [150, 200, -1], [150, 260, 1], [150, 330, -1]].map(([x, y, s]) => svg('path', { d: `M${x} ${y} q ${s * 60} -10 ${s * 120} 20 q ${s * -60} 0 ${s * -120} -20`, class: 'bamboo-leaf' })));
    const strips = el('div', { class: 'tanzaku-layer' }, list.slice(0, TANZAKU_SLOTS.length).map((a, i) => {
      const [left, top] = TANZAKU_SLOTS[i % TANZAKU_SLOTS.length]; const side = left < 50 ? -1 : 1;
      return el('button', { class: 'tanzaku', type: 'button', style: { '--c': a.data.color || TANZAKU[i % TANZAKU.length], left: `${left}%`, top: `${top}%`, '--r': `${side * (2 + (i % 3))}deg` },
        'aria-label': `Deseo de ${profile.name(a.by)}: ${a.data.text}`, onClick: () => ui.openModal({ title: `Deseo de ${profile.name(a.by)}`, size: 'sm', body: el('p', { class: 'tanzaku-full' }, a.data.text),
          actions: a.by === profile.active() && open ? [{ label: 'Quitar', variant: 'ghost', onClick: async () => { await db.softDelete('gameArtifacts', a.id); load(); return true; } }, { label: 'Cerrar', variant: 'primary' }] : [{ label: 'Cerrar', variant: 'primary' }] }) },
      el('span', { class: 'tanzaku-text' }, a.data.text.length > 40 ? `${a.data.text.slice(0, 38)}…` : a.data.text));
    }));
    put(box,
      el('section', { class: 'card stack center-col tanabata-head' },
        el('p', { class: 'muted small' }, 'Cuenta la leyenda que Orihime y Hikoboshi, separados por la Vía Láctea, solo se encuentran una noche al año: el 7 de julio. Esa noche se cuelgan deseos en tiras de papel en el bambú.'),
        open ? el('p', {}, el('strong', {}, mineN < MAX_WISHES ? `Puedes colgar ${MAX_WISHES - mineN} ${MAX_WISHES - mineN === 1 ? 'deseo más' : 'deseos más'} este año.` : 'Ya colgaste tus deseos de este año.'))
          : el('p', { class: 'muted' }, year === new Date().getFullYear() ? `Los deseos se escriben del ${TANABATA_WINDOW.from} al ${TANABATA_WINDOW.to} de julio${daysToTanabata() ? `: faltan ${daysToTanabata()} días` : ''}.` : `Los deseos de ${year}.`),
        open && mineN < MAX_WISHES ? ui.button({ label: 'Colgar un deseo', iconName: 'plus', variant: 'primary', onClick: write }) : null),
      el('div', { class: 'bamboo-wrap' }, bamboo, strips),
      list.length ? null : el('p', { class: 'muted center' }, year === new Date().getFullYear() ? 'El bambú los espera.' : 'Ese año no hubo deseos.'),
      years.length > 1 ? el('div', { class: 'chip-row chip-wrap', role: 'group', 'aria-label': 'Año' }, years.map((y) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(y === year), onClick: () => { year = y; load(); } }, String(y)))) : null);
  };
  const write = () => {
    const t = ui.textarea({ rows: 3, maxlength: '140', placeholder: 'Ej.: Que conozcamos Kioto juntos.' });
    let color = TANZAKU[Math.floor(Math.random() * TANZAKU.length)];
    const colors = el('div', { class: 'ink-row', role: 'radiogroup', 'aria-label': 'Color del papel' }, TANZAKU.map((c, i) => el('button', { class: `ink-dot${c === color ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(c === color), 'aria-label': `Color ${i + 1}`, style: { '--ink': c }, onClick: (e) => { color = c; colors.querySelectorAll('.ink-dot').forEach((x) => { x.classList.toggle('is-on', x === e.currentTarget); x.setAttribute('aria-checked', String(x === e.currentTarget)); }); } })));
    const f = ui.field({ label: 'Tu deseo', control: t });
    ui.openModal({ title: 'Un deseo para el bambú', kind: 'sheet', body: el('div', { class: 'stack' }, f, el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Color del papel'), colors)),
      actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Colgar', variant: 'primary', onClick: async () => {
        if (!t.value.trim()) { f.setError('Escribe tu deseo.'); return false; }
        await K.putArtifact({ id: util.uuid(), gameId: 'tanabata', type: 'tanzaku', data: { year: new Date().getFullYear(), text: t.value.trim(), color } });
        K.ding(); ui.confetti({ count: 20 }); load(); return true;
      } }] });
    requestAnimationFrame(() => t.focus());
  };
  ctx.mount(box);
  await load();
  return db.onChange((store) => { if (store === 'gameArtifacts' && box.isConnected && !document.querySelector('.overlay')) load().catch(() => {}); });
}

// ---------- Palabra del día ----------
export async function wordList() {
  const recs = (await db.query('content', { index: 'kind', range: IDBKeyRange.only('japaneseWord') }).catch(() => [])).filter((r) => !r.deleted && !r.hidden);
  return (recs.length ? recs : CONFIG.japaneseWords || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
/** Word of a day: a fixed shuffled order, one per day, never repeating until the list runs out. */
export function wordOfDay(words, day = util.localDay()) {
  if (!words.length) return null;
  const order = K.shuffle(words.map((_, i) => i), K.seeded('kotoba'));
  const n = util.daysBetween(util.parseDay('2026-01-01'), util.parseDay(day));
  return words[order[((n % words.length) + words.length) % words.length]];
}
/** Words already shown up to `day` (most recent first), at most `limit`. */
export function wordsSoFar(words, day = util.localDay(), limit = 60) {
  const out = []; const d = util.parseDay(day);
  for (let i = 0; i < Math.min(limit, words.length); i++) { const x = new Date(d); x.setDate(x.getDate() - i); const w = wordOfDay(words, util.localDay(x)); if (w && !out.includes(w)) out.push(w); }
  return out;
}
function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { ui.toast('Este teléfono no puede leer en voz alta.'); }
}
const wordFace = (w, { big = true } = {}) => el('div', { class: 'kotoba-face' },
  KOTOBA_SHOW_JP && w.jp ? el('span', { class: `kotoba-jp${big ? '' : ' is-small'}`, lang: 'ja', 'data-jp-ok': '' }, w.jp) : null,
  el('span', { class: 'kotoba-romaji' }, w.romaji));

async function kotoba(ctx) {
  const box = el('div', { class: 'stack' });
  const words = await wordList();
  if (!words.length) { ctx.mount(ui.emptyState({ title: 'Sin palabras', text: 'Agreguen palabras en los bancos de los juegos.', art: 'lantern' })); return () => {}; }
  const stateId = () => `gs:kotoba:${profile.active()}`;
  const getState = async () => (await db.get('gameState', stateId()).catch(() => null)) || { id: stateId(), gameId: 'kotoba', boxes: {}, visibility: 'shared', owner: profile.active() };
  const setBox = async (w, b) => { const st = await getState(); await db.put('gameState', { ...st, boxes: { ...(st.boxes || {}), [w.id]: b } }, { userEdit: false }); };
  // The count of words starts the first day they open Palabra del día (shared by both phones).
  const startDay = async () => {
    const id = 'gs:kotoba:start';
    const rec = await db.get('gameState', id).catch(() => null);
    if (rec?.day) return rec.day;
    await db.put('gameState', { id, gameId: 'kotoba', day: util.localDay(), visibility: 'shared', owner: 'both' }, { userEdit: false });
    return util.localDay();
  };
  const since = async () => Math.max(1, util.daysBetween(util.parseDay(await startDay()), util.parseDay(util.localDay())) + 1);
  const home = async () => {
    const w = wordOfDay(words);
    const st = await getState();
    const seen = wordsSoFar(words, util.localDay(), await since());
    const known = seen.filter((x) => (st.boxes?.[x.id] || 0) >= 3).length;
    put(box,
      el('section', { class: 'card stack center-col kotoba-today' },
        el('span', { class: 'card-cat' }, `Palabra de hoy · ${w.cat || 'Viaje'}`),
        wordFace(w),
        el('p', { class: 'kotoba-es' }, w.es),
        w.note ? el('p', { class: 'muted small' }, w.note) : null,
        el('div', { class: 'btn-row center-row' },
          'speechSynthesis' in window ? ui.button({ label: 'Escuchar', iconName: 'volume-2', variant: 'ghost', small: true, onClick: () => speak(w.jp || w.romaji) }) : null,
          ui.button({ label: 'Ya me la sé', iconName: 'check', small: true, variant: 'ghost', onClick: async () => { await setBox(w, 3); ui.toast('¡Bien!', { tone: 'success' }); home(); } }))),
      el('p', { class: 'muted small center' }, `Llevan ${seen.length} ${seen.length === 1 ? 'palabra' : 'palabras'} · ${profile.name(profile.active())} se sabe ${known}`),
      el('div', { class: 'btn-row center-row' },
        ui.button({ label: 'Repasar', iconName: 'layers', variant: 'primary', onClick: review }),
        ui.button({ label: 'Quiz entre los dos', iconName: 'swords', onClick: quiz })),
      el('details', { class: 'card kotoba-all' }, el('summary', {}, 'Las palabras que han salido'),
        el('ul', { class: 'kotoba-list' }, seen.map((x) => el('li', {}, KOTOBA_SHOW_JP && x.jp ? el('span', { lang: 'ja', class: 'kotoba-li-jp', 'data-jp-ok': '' }, x.jp) : null, el('strong', {}, x.romaji), el('span', { class: 'muted' }, ` · ${x.es}`))))));
    ctx.mount(box);
  };
  const review = async () => {
    const st = await getState();
    const deck = wordsSoFar(words, util.localDay(), await since()).sort((a, b) => (st.boxes?.[a.id] || 0) - (st.boxes?.[b.id] || 0)).slice(0, 12);
    let i = 0; let right = 0;
    const stage = K.cardStage({ swipe: false, label: 'Tarjeta de repaso' });
    const btns = el('div', { class: 'btn-row center-row' });
    const progress = el('p', { class: 'muted small game-progress' });
    const show = () => {
      if (i >= deck.length) { ui.confetti({ count: 20 }); ctx.mount(el('div', { class: 'game-result stack center-col' }, el('h2', { class: 'result-title', tabindex: '-1' }, `Repasaste ${deck.length}`), el('p', {}, `${right} las sabías.`), ui.button({ label: 'Volver', iconName: 'arrow-left', onClick: home }))); return; }
      const w = deck[i];
      progress.textContent = `${i + 1} de ${deck.length}`;
      stage.show(el('div', { class: 'stack center-col' }, wordFace(w), el('p', { class: 'kotoba-es is-hidden' }, w.es)), { faceDown: false });
      put(btns, ui.button({ label: 'Ver significado', iconName: 'eye', variant: 'primary', onClick: () => {
        stage.node.querySelector('.gcard:last-child .kotoba-es')?.classList.remove('is-hidden');
        put(btns,
          ui.button({ label: 'Otra vez', iconName: 'rotate-ccw', variant: 'ghost', onClick: async () => { await setBox(w, 1); i++; show(); } }),
          ui.button({ label: 'La sabía', iconName: 'check', variant: 'primary', onClick: async () => { right++; await setBox(w, Math.min(5, ((await getState()).boxes?.[w.id] || 0) + 1)); i++; show(); } }));
      } }));
    };
    ctx.mount(el('div', { class: 'stack center-col' }, progress, stage.node, btns, ui.button({ label: 'Terminar', variant: 'ghost', small: true, onClick: home })));
    show();
  };
  const quiz = async () => {
    const st = await K.settings();
    const s = K.createSession({ gameId: 'kotoba', level: st.level, passes: st.passes, refusePoints: st.refusePoints, drinkCap: st.drinkCap, waterEvery: st.waterEvery, first: profile.active() });
    const pool = wordsSoFar(words, util.localDay(), await since());
    const qs = K.shuffle(pool.length >= 6 ? pool : words).slice(0, 10);
    let i = 0;
    const progress = el('p', { class: 'muted small game-progress' });
    const qbox = el('div', { class: 'stack center-col' });
    const ask = () => {
      if (i >= qs.length) {
        s.save({ result: `${qs.length} palabras` }).catch(() => {});
        put(box, K.resultView(s, { lines: [`${qs.length} palabras en japonés.`], onRematch: quiz }));
        const back = box.querySelector('a[href="#/juegos"]'); if (back) back.setAttribute('href', '#/juegos/kotoba');
        ctx.mount(box); return;
      }
      const w = qs[i];
      progress.textContent = `Pregunta ${i + 1} de ${qs.length} · responde ${profile.name(s.turn())}`;
      const others = K.shuffle(words.filter((x) => x.id !== w.id && x.es !== w.es)).slice(0, 3).map((x) => x.es);
      const optsList = K.shuffle([w.es, ...others]);
      const next = ui.button({ label: 'Siguiente', iconName: 'arrow-right', variant: 'primary', onClick: () => { i++; s.next(); if (i % 2 === 0) s.round(); ask(); } }); next.hidden = true;
      const pass = K.passButton(s, () => { i++; s.next(); ask(); });
      const choices = el('div', { class: 'trivia-options' }, optsList.map((o) => el('button', { class: 'btn btn-secondary trivia-opt', type: 'button', onClick: (e) => {
        const ok = o === w.es;
        choices.querySelectorAll('button').forEach((b) => { b.disabled = true; if (b.textContent === w.es) b.classList.add('is-right'); });
        if (!ok) e.currentTarget.classList.add('is-wrong'); else { s.add(s.turn(), 1); K.ding(); }
        ui.announce(ok ? '¡Correcto!' : `No. Es: ${w.es}`);
        pass.hidden = true; next.hidden = false; next.focus();
      } }, o)));
      put(qbox, el('h2', { class: 'trivia-q', tabindex: '-1' }, '¿Qué significa?'), wordFace(w, { big: false }), choices, el('div', { class: 'btn-row center-row' }, pass, next));
    };
    ctx.mount(K.scoreboard(s), progress, qbox, ui.button({ label: 'Terminar', variant: 'ghost', small: true, onClick: home }));
    ask();
  };
  await home();
  return () => { try { speechSynthesis.cancel(); } catch { /* none */ } };
}

// ---------- Nuestro manga ----------
// Panels on a 1000 x 1414 page (A paper ratio), as [x, y, w, h].
export const MANGA_LAYOUTS = {
  dos: { label: '2 viñetas', panels: [[40, 40, 920, 655], [40, 719, 920, 655]] },
  tres: { label: '3 viñetas', panels: [[40, 40, 920, 425], [40, 489, 920, 425], [40, 938, 920, 436]] },
  cuatro: { label: '4 viñetas', panels: [[40, 40, 448, 655], [512, 40, 448, 655], [40, 719, 448, 655], [512, 719, 448, 655]] },
  grande: { label: '1 grande y 2', panels: [[40, 40, 920, 760], [40, 824, 448, 550], [512, 824, 448, 550]] },
};
export const PAGE = { w: 1000, h: 1414 };
const BUBBLES = [{ value: 'dice', label: 'Dice' }, { value: 'piensa', label: 'Piensa' }, { value: 'grita', label: 'Grita' }];

/** Wraps text into lines that fit `max` px with a canvas context. */
export function wrapLines(c, text, max) {
  const out = []; let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${word}` : word;
    if (c.measureText(t).width > max && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

async function renderManga(data, images) {
  const cv = document.createElement('canvas'); cv.width = PAGE.w; cv.height = PAGE.h;
  const c = cv.getContext('2d');
  const serif = getComputedStyle(document.documentElement).getPropertyValue('--font-serif') || 'serif';
  c.fillStyle = '#fff'; c.fillRect(0, 0, PAGE.w, PAGE.h);
  const layout = MANGA_LAYOUTS[data.layout] || MANGA_LAYOUTS.tres;
  layout.panels.forEach(([x, y, w, h], i) => {
    const img = images[i];
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (img) { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); const iw = img.naturalWidth * s; const ih = img.naturalHeight * s; c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    else { c.fillStyle = '#F3EEE9'; c.fillRect(x, y, w, h); }
    c.restore();
    c.lineWidth = 8; c.strokeStyle = '#111'; c.strokeRect(x, y, w, h);
  });
  for (const it of data.items || []) {
    const cx = it.x * PAGE.w; const cy = it.y * PAGE.h;
    if (it.kind === 'sfx') {
      c.save(); c.translate(cx, cy); c.rotate((it.rot || -8) * Math.PI / 180);
      c.font = `900 ${it.size || 84}px ${serif}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 14; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.strokeText(it.text, 0, 0);
      c.fillStyle = '#111'; c.fillText(it.text, 0, 0); c.restore();
      continue;
    }
    c.font = `600 34px ${serif}`;
    const lines = wrapLines(c, it.text, 300);
    const tw = Math.max(120, ...lines.map((l) => c.measureText(l).width)) + 60; const th = lines.length * 42 + 50;
    c.save();
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 5;
    if (it.kind === 'grita') {
      c.beginPath(); const spikes = 16;
      for (let k = 0; k <= spikes * 2; k++) { const a = (k / (spikes * 2)) * Math.PI * 2; const r = k % 2 ? 0.82 : 1.12; const px = cx + Math.cos(a) * (tw / 2) * r; const py = cy + Math.sin(a) * (th / 2) * r; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill(); c.stroke();
    } else {
      if (it.kind === 'dice') { c.beginPath(); c.moveTo(cx - 20, cy + th / 2 - 6); c.lineTo(cx - 34 + (it.tail || 0), cy + th / 2 + 44); c.lineTo(cx + 18, cy + th / 2 - 8); c.closePath(); c.fill(); c.stroke(); }
      else { [[0.62, 18], [0.78, 10]].forEach(([k, r], j) => { c.beginPath(); c.arc(cx - tw * 0.18 - j * 22, cy + th / 2 + 18 + j * 22, r, 0, Math.PI * 2); c.fill(); c.stroke(); }); }
      c.beginPath(); c.ellipse(cx, cy, tw / 2, th / 2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      if (it.kind === 'dice') { c.fillRect(cx - 22, cy + th / 2 - 14, 38, 12); }
    }
    c.restore();
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${it.kind === 'grita' ? 800 : 600} 34px ${serif}`;
    lines.forEach((l, k) => c.fillText(l, cx, cy - ((lines.length - 1) * 42) / 2 + k * 42));
  }
  return new Promise((r) => cv.toBlob(r, 'image/png'));
}

async function capsulePhotos(limit = 40) {
  const recs = (await db.query('memories').catch(() => [])).filter(pub);
  return recs.flatMap((m) => (m.mediaIds || []).map((id) => ({ id, title: m.title || '' }))).slice(0, limit);
}
const loadImg = (url) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });

async function manga(ctx) {
  const box = el('div', { class: 'stack' });
  const urls = new Set();
  const urlFor = async (mediaId) => { const b = await db.getMedia(mediaId).catch(() => null); if (!b) return ''; const u = URL.createObjectURL(b); urls.add(u); return u; };
  const sfxList = (CONFIG.games?.banks?.['manga-sfx'] ? await K.bankItems('manga-sfx') : []).map((x) => (MANGA_SFX_JP && x.jp ? x.jp : x.text));
  const home = async () => {
    const list = await K.artifacts('manga', 'manga');
    const tiles = [];
    for (const m of list.slice(0, 24)) tiles.push(el('li', { class: 'drawing-tile' },
      m.mediaId ? el('img', { src: await urlFor(m.mediaId), alt: `Manga: ${m.data.title || 'sin título'}` }) : el('div', { class: 'manga-thumb-empty' }, icon('book-open', { size: 30 })),
      el('p', { class: 'small' }, el('strong', {}, m.data.title || 'Sin título')),
      el('div', { class: 'btn-row' }, ui.button({ label: 'Abrir', iconName: 'pencil', small: true, onClick: () => editor(m) }))));
    put(box,
      el('section', { class: 'card stack center-col' },
        el('div', { class: 'game-intro-art', 'aria-hidden': 'true' }, icon('book-open', { size: 44 })),
        el('p', { class: 'game-intro-blurb' }, 'Armen una página de manga con sus fotos, globos de diálogo y onomatopeyas. Después la guardan como imagen o la imprimen.'),
        ui.button({ label: 'Nueva página', iconName: 'plus', variant: 'primary', onClick: () => editor() })),
      tiles.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Sus páginas'), el('ul', { class: 'drawing-grid' }, tiles)) : null);
    ctx.mount(box);
  };
  const editor = async (rec = null) => {
    const data = structuredClone(rec?.data || { title: '', layout: 'tres', panels: [], items: [] });
    const own = new Map(); // panel index -> { blob } uploaded from the device
    let selected = 0;
    const page = el('div', { class: 'manga-page', role: 'group', 'aria-label': 'Página de manga' });
    const paint = async () => {
      const layout = MANGA_LAYOUTS[data.layout];
      const panels = [];
      for (let i = 0; i < layout.panels.length; i++) {
        const [x, y, w, h] = layout.panels[i];
        const p = data.panels[i] || {};
        const src = own.get(i)?.url || (p.mediaId ? await urlFor(p.mediaId) : '');
        panels.push(el('button', { class: `manga-panel${i === selected ? ' is-selected' : ''}`, type: 'button', 'aria-label': `Viñeta ${i + 1}${src ? ', con foto' : ', vacía'}`,
          style: { left: `${(x / PAGE.w) * 100}%`, top: `${(y / PAGE.h) * 100}%`, width: `${(w / PAGE.w) * 100}%`, height: `${(h / PAGE.h) * 100}%` }, onClick: () => { selected = i; choosePhoto(i); } },
        src ? el('img', { src, alt: '' }) : el('span', { class: 'manga-panel-empty' }, icon('image-plus', { size: 26 }), el('span', { class: 'small' }, 'Toca para poner foto'))));
      }
      const items = (data.items || []).map((it, k) => {
        const n = el('div', { class: `manga-item is-${it.kind}`, 'data-jp-ok': '', tabindex: '0', role: 'button', 'aria-label': `${it.kind === 'sfx' ? 'Onomatopeya' : 'Globo'}: ${it.text}. Arrastra para mover; Enter para editar.`, style: { left: `${it.x * 100}%`, top: `${it.y * 100}%` }, lang: it.kind === 'sfx' && /[぀-ヿ]/.test(it.text) ? 'ja' : null }, it.text);
        drag(n, it, k);
        return n;
      });
      put(page, ...panels, ...items);
    };
    const drag = (n, it, k) => {
      let start = null; let moved = false;
      n.addEventListener('pointerdown', (e) => { e.preventDefault(); const r = page.getBoundingClientRect(); start = { r, dx: e.clientX - (it.x * r.width + r.left), dy: e.clientY - (it.y * r.height + r.top) }; moved = false; n.setPointerCapture?.(e.pointerId); n.classList.add('is-dragging'); });
      n.addEventListener('pointermove', (e) => { if (!start) return; moved = true; it.x = util.clamp((e.clientX - start.dx - start.r.left) / start.r.width, 0.04, 0.96); it.y = util.clamp((e.clientY - start.dy - start.r.top) / start.r.height, 0.03, 0.97); n.style.left = `${it.x * 100}%`; n.style.top = `${it.y * 100}%`; });
      const up = () => { if (!start) return; start = null; n.classList.remove('is-dragging'); if (!moved) editItem(k); };
      n.addEventListener('pointerup', up); n.addEventListener('pointercancel', () => { start = null; n.classList.remove('is-dragging'); });
      n.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        if (e.key === 'Enter') { e.preventDefault(); editItem(k); }
        const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (mv) { e.preventDefault(); it.x = util.clamp(it.x + mv[0], 0.04, 0.96); it.y = util.clamp(it.y + mv[1], 0.03, 0.97); n.style.left = `${it.x * 100}%`; n.style.top = `${it.y * 100}%`; }
      });
    };
    const panelCenter = (k = 0.3) => { const [x, y, w, h] = MANGA_LAYOUTS[data.layout].panels[Math.min(selected, MANGA_LAYOUTS[data.layout].panels.length - 1)]; return { x: (x + w / 2) / PAGE.w, y: (y + h * k) / PAGE.h }; };
    const editItem = (k) => {
      const it = data.items[k];
      const t = ui.input({ maxlength: it.kind === 'sfx' ? '14' : '90', value: it.text });
      let kind = it.kind;
      ui.openModal({ title: it.kind === 'sfx' ? 'Onomatopeya' : 'Globo', kind: 'sheet',
        body: el('div', { class: 'stack' }, ui.field({ label: 'Texto', control: t }), it.kind !== 'sfx' ? ui.field({ label: 'Tipo', control: ui.segmented({ label: 'Tipo', value: kind, options: BUBBLES, onChange: (v) => { kind = v; } }) }) : null),
        actions: [{ label: 'Quitar', variant: 'ghost', onClick: () => { data.items.splice(k, 1); paint(); return true; } }, { label: 'Guardar', variant: 'primary', onClick: () => { if (!t.value.trim()) return false; it.text = t.value.trim(); it.kind = kind; paint(); return true; } }] });
      requestAnimationFrame(() => t.focus());
    };
    const addBubble = () => {
      const t = ui.input({ maxlength: '90', placeholder: '¿Qué dice?' }); let kind = 'dice';
      const f = ui.field({ label: 'Texto', control: t });
      ui.openModal({ title: 'Nuevo globo', kind: 'sheet', body: el('div', { class: 'stack' }, f, ui.field({ label: 'Tipo', control: ui.segmented({ label: 'Tipo', value: kind, options: BUBBLES, onChange: (v) => { kind = v; } }) })),
        actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Agregar', variant: 'primary', onClick: () => { if (!t.value.trim()) { f.setError('Escribe el texto.'); return false; } data.items.push({ kind, text: t.value.trim(), ...panelCenter() }); paint(); return true; } }] });
      requestAnimationFrame(() => t.focus());
    };
    const addSfx = () => {
      const custom = ui.input({ maxlength: '14', placeholder: 'O escribe la tuya' });
      const m = ui.openModal({ title: 'Onomatopeya', kind: 'sheet',
        body: el('div', { class: 'stack' }, el('div', { class: 'chip-row chip-wrap' }, sfxList.map((s) => el('button', { class: 'chip manga-sfx-chip', type: 'button', 'data-jp-ok': '', lang: /[぀-ヿ]/.test(s) ? 'ja' : null, onClick: () => { data.items.push({ kind: 'sfx', text: s, rot: -8 + Math.round(Math.random() * 16), ...panelCenter(0.72) }); paint(); m.close(); } }, s))), ui.field({ label: 'Otra', control: custom })),
        actions: [{ label: 'Cancelar', variant: 'ghost' }, { label: 'Agregar', variant: 'primary', onClick: () => { if (!custom.value.trim()) return false; data.items.push({ kind: 'sfx', text: custom.value.trim(), rot: -8, ...panelCenter(0.72) }); paint(); return true; } }] });
    };
    const choosePhoto = async (i) => {
      const photos = await capsulePhotos();
      const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'manga-file' });
      const grid = el('ul', { class: 'manga-pick' });
      const m = ui.openModal({ title: `Foto para la viñeta ${i + 1}`, size: 'md',
        body: el('div', { class: 'stack' },
          el('label', { class: 'btn btn-secondary', for: 'manga-file' }, icon('upload', { size: 18 }), el('span', {}, 'Del teléfono o computador')), file,
          photos.length ? el('p', { class: 'muted small' }, 'O de la Cápsula:') : el('p', { class: 'muted small' }, 'Las fotos de la Cápsula también salen aquí.'), grid),
        actions: [data.panels[i]?.mediaId || own.has(i) ? { label: 'Quitar la foto', variant: 'ghost', onClick: () => { data.panels[i] = {}; own.delete(i); paint(); return true; } } : null, { label: 'Cerrar', variant: 'primary' }].filter(Boolean) });
      file.addEventListener('change', async () => {
        const f = file.files?.[0]; if (!f) return;
        try {
          const { compressImage } = await import('../core/images.js');
          const { blob } = await compressImage(f);
          const url = URL.createObjectURL(blob); urls.add(url);
          own.set(i, { blob, url }); data.panels[i] = {}; m.close(); paint();
        } catch { ui.toast('No pudimos leer esa imagen.', { tone: 'error' }); }
      });
      for (const p of photos) {
        const u = await urlFor(p.id); if (!u) continue;
        grid.append(el('li', {}, el('button', { class: 'manga-pick-btn', type: 'button', 'aria-label': `Usar foto: ${p.title}`, onClick: () => { data.panels[i] = { mediaId: p.id }; own.delete(i); m.close(); paint(); } }, el('img', { src: u, alt: '' }))));
      }
    };
    const title = ui.input({ maxlength: '60', placeholder: 'Ej.: El día del picnic', value: data.title || '' });
    const layoutSeg = ui.segmented({ label: 'Viñetas', value: data.layout, options: Object.entries(MANGA_LAYOUTS).map(([value, l]) => ({ value, label: l.label })), onChange: (v) => { data.layout = v; selected = 0; paint(); } });
    const exportBlob = async () => {
      const imgs = [];
      for (let i = 0; i < MANGA_LAYOUTS[data.layout].panels.length; i++) {
        const src = own.get(i)?.url || (data.panels[i]?.mediaId ? await urlFor(data.panels[i].mediaId) : '');
        imgs.push(src ? await loadImg(src) : null);
      }
      try { await document.fonts?.ready; } catch { /* fonts */ }
      return renderManga(data, imgs);
    };
    const save = async () => {
      const id = rec?.id || util.uuid();
      for (const [i, o] of own) { data.panels[i] = { mediaId: await db.putMedia(o.blob, { ownerStore: 'gameArtifacts', ownerId: id }) }; }
      own.clear();
      data.title = title.value.trim();
      const png = await exportBlob();
      const mediaId = png ? await db.putMedia(png, { ownerStore: 'gameArtifacts', ownerId: id, width: PAGE.w, height: PAGE.h }) : '';
      await K.putArtifact({ ...(rec || { id, gameId: 'manga', type: 'manga' }), id, data, mediaId });
      if (!rec) K.logGame('manga', { result: data.title || 'Página de manga' });
      rec = await db.get('gameArtifacts', id);
      ui.toast('Página guardada.', { tone: 'success' });
      return png;
    };
    const download = async () => {
      const png = await save(); if (!png) return;
      const u = URL.createObjectURL(png); urls.add(u);
      const a = el('a', { href: u, download: `manga-${(data.title || 'aishiteru').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` }); document.body.append(a); a.click(); a.remove();
    };
    const print = async () => {
      const png = await save(); if (!png) return;
      const u = URL.createObjectURL(png); urls.add(u);
      const sheet = el('div', { class: 'print-sheet print-manga' }, el('img', { src: u, alt: '' }));
      document.body.append(sheet); document.body.classList.add('printing-sheet');
      const done = () => { sheet.remove(); document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      sheet.querySelector('img').onload = () => { window.print(); setTimeout(done, 60000); };
    };
    ctx.mount(el('div', { class: 'stack manga-editor' },
      ui.field({ label: 'Título', control: title }),
      ui.field({ label: 'Viñetas', control: layoutSeg }),
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Globo', iconName: 'message-square', small: true, onClick: addBubble }),
        ui.button({ label: 'Onomatopeya', iconName: 'zap', small: true, onClick: addSfx })),
      el('p', { class: 'muted small' }, 'Toca una viñeta para ponerle foto. Los globos y onomatopeyas salen en la viñeta elegida: arrástralos a su lugar y tócalos para editar.'),
      page,
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Guardar', iconName: 'check', variant: 'primary', onClick: () => save().catch((e) => { console.error(e); ui.toast('No se pudo guardar.', { tone: 'error' }); }) }),
        ui.button({ label: 'Descargar imagen', iconName: 'download', onClick: () => download().catch((e) => { console.error(e); ui.toast('No se pudo exportar.', { tone: 'error' }); }) }),
        ui.button({ label: 'Imprimir', iconName: 'printer', variant: 'ghost', onClick: () => print().catch((e) => console.error(e)) }),
        rec ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar la página', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta página?', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('gameArtifacts', rec.id); home(); } } }, icon('trash-2', { size: 18 })) : null),
      ui.button({ label: 'Volver', iconName: 'arrow-left', variant: 'ghost', small: true, onClick: home })));
    await paint();
  };
  await home();
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}

// ---------- Postales para imprimir ----------
export const POSTCARD_DESIGNS = [
  { id: 'sakura', label: 'Sakura' }, { id: 'fuji', label: 'Monte Fuji' }, { id: 'ola', label: 'La ola' },
  { id: 'grullas', label: 'Grullas' }, { id: 'faroles', label: 'Faroles' }, { id: 'luna', label: 'Luna' },
];
const petal = (x, y, r = 7, rot = 0) => svg('g', { transform: `translate(${x} ${y}) rotate(${rot})` }, ...[0, 72, 144, 216, 288].map((a) => svg('ellipse', { cx: 0, cy: -r, rx: r * 0.55, ry: r, transform: `rotate(${a})`, fill: '#F4B6C6' })), svg('circle', { r: r * 0.28, fill: '#C2405F' }));
function postcardArt(id) {
  const a = svg('svg', { viewBox: '0 0 300 200', class: 'pc-art', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
  const bg = { sakura: '#FBF0F2', fuji: '#EAF1F6', ola: '#EEF3F7', grullas: '#F7F1E6', faroles: '#2B1E2A', luna: '#1E2433' }[id];
  add(a, svg('rect', { width: 300, height: 200, fill: bg }));
  if (id === 'sakura') {
    add(a, svg('path', { d: 'M-10 40 C60 60 120 30 180 70 S260 120 320 100', stroke: '#6B4A3A', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' }), svg('path', { d: 'M120 48 C140 20 170 18 190 10', stroke: '#6B4A3A', 'stroke-width': 4, fill: 'none' }));
    [[40, 48, 9], [80, 56, 8], [128, 44, 10], [160, 22, 7], [190, 12, 6], [200, 80, 9], [240, 100, 8], [280, 104, 10], [100, 120, 6, 30], [160, 150, 5, 50], [230, 170, 6, 10], [60, 160, 5, 80]].forEach(([x, y, r, rot]) => a.append(petal(x, y, r, rot || 0)));
  } else if (id === 'fuji') {
    add(a, svg('circle', { cx: 222, cy: 62, r: 28, fill: '#E8746A' }), svg('path', { d: 'M20 170 L130 60 Q150 46 170 60 L280 170 Z', fill: '#4E6F8F' }), svg('path', { d: 'M108 82 L130 60 Q150 46 170 60 L192 82 L176 90 L160 80 L146 92 L132 82 L120 90 Z', fill: '#fff' }),
      svg('path', { d: 'M0 170 L300 170 L300 200 L0 200 Z', fill: '#9DB8A2' }), svg('path', { d: 'M30 150 q20 -14 40 0 M220 140 q16 -10 32 0', stroke: '#fff', 'stroke-width': 4, fill: 'none', opacity: 0.8 }));
  } else if (id === 'ola') {
    add(a, svg('circle', { cx: 240, cy: 50, r: 18, fill: '#F2D27B' }), svg('path', { d: 'M0 140 C40 70 110 50 150 90 C120 80 100 100 120 120 C160 150 220 120 260 140 L300 150 L300 200 L0 200 Z', fill: '#2F5C8A' }),
      svg('path', { d: 'M150 90 C130 84 116 96 124 110 M140 92 c-6 -8 -16 -8 -20 0 M132 96 c-6 -6 -12 -4 -14 2', stroke: '#fff', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }), svg('path', { d: 'M0 170 C60 150 120 180 180 160 S260 170 300 160 L300 200 L0 200 Z', fill: '#4B7FB0' }));
  } else if (id === 'grullas') {
    add(a, svg('circle', { cx: 150, cy: 100, r: 70, fill: '#E9C46A', opacity: 0.35 }));
    [[90, 80, 1], [170, 60, 0.8], [210, 120, 0.6]].forEach(([x, y, s]) => a.append(svg('path', { transform: `translate(${x} ${y}) scale(${s})`, d: 'M-40 -10 L-12 18 L2 0 L16 18 L44 -18 L14 24 L2 36 L-10 24 L-34 0 Z', fill: '#C2405F' })));
    add(a, svg('path', { d: 'M0 180 Q150 150 300 180', stroke: '#C9A46A', 'stroke-width': 3, fill: 'none' }));
  } else if (id === 'faroles') {
    add(a, svg('path', { d: 'M0 30 Q150 70 300 30', stroke: '#C9A46A', 'stroke-width': 2, fill: 'none' }));
    [[50, 40], [110, 52], [170, 54], [230, 46], [280, 34]].forEach(([x, y], i) => add(a, svg('line', { x1: x, y1: y, x2: x, y2: y + 14, stroke: '#C9A46A', 'stroke-width': 2 }),
      svg('ellipse', { cx: x, cy: y + 40, rx: 20, ry: 26, fill: i % 2 ? '#E8746A' : '#C2405F' }), svg('path', { d: `M${x - 18} ${y + 32} h36 M${x - 20} ${y + 42} h40 M${x - 18} ${y + 52} h36`, stroke: '#2B1E2A', 'stroke-width': 1.2, opacity: 0.5 }),
      svg('rect', { x: x - 8, y: y + 12, width: 16, height: 4, fill: '#2B1E2A' }), svg('rect', { x: x - 8, y: y + 64, width: 16, height: 4, fill: '#2B1E2A' })));
    for (let i = 0; i < 18; i++) a.append(svg('circle', { cx: (i * 53) % 300, cy: 120 + ((i * 37) % 70), r: 1.6, fill: '#F2D27B', opacity: 0.8 }));
  } else if (id === 'luna') {
    add(a, svg('circle', { cx: 200, cy: 80, r: 46, fill: '#F6E7B4' }), svg('circle', { cx: 216, cy: 70, r: 40, fill: '#1E2433' }));
    for (let i = 0; i < 26; i++) a.append(svg('circle', { cx: (i * 71) % 300, cy: (i * 43) % 150, r: i % 5 ? 1.2 : 2, fill: '#fff', opacity: 0.8 }));
    add(a, svg('path', { d: 'M0 170 Q60 140 120 165 T240 160 T300 168 L300 200 L0 200 Z', fill: '#2E3A52' }), svg('path', { d: 'M40 120 q20 -12 40 0 q-20 6 -40 0 M220 140 q16 -8 32 0 q-16 5 -32 0', fill: '#3C4A66' }));
  }
  return a;
}
const lines = (text) => String(text || '').split('\n').map((l) => el('p', {}, l || ' '));
function postcardFront(d) { return el('div', { class: 'pc pc-front' }, postcardArt(d.design)); }
function postcardBack(d) {
  return el('div', { class: 'pc pc-back' },
    el('div', { class: 'pc-msg' }, lines(d.message)),
    el('div', { class: 'pc-side' }, el('div', { class: 'pc-stamp', 'aria-hidden': 'true' }, postcardArt(d.design)),
      el('p', { class: 'pc-line' }, el('span', {}, 'Para: '), d.to || ''), el('p', { class: 'pc-line' }, el('span', {}, 'De: '), d.from || '')));
}
function letterSheet(d) {
  return el('div', { class: 'pc-letter' }, el('div', { class: 'pc-letter-top' }, postcardArt(d.design)),
    el('div', { class: 'pc-letter-body' }, d.to ? el('p', { class: 'pc-letter-to' }, `${d.to}:`) : null, lines(d.message), d.from ? el('p', { class: 'pc-letter-from' }, d.from) : null),
    el('div', { class: 'pc-letter-bottom' }, postcardArt(d.design)));
}

async function postales(ctx) {
  const box = el('div', { class: 'stack' });
  const me = profile.active();
  const home = async (rec = null) => {
    const d = { design: 'sakura', format: 'postal', to: profile.name(profile.partnerOf(me)), from: profile.name(me), message: '', ...(rec?.data || {}) };
    const preview = el('div', { class: 'pc-preview' });
    const paint = () => put(preview, d.format === 'carta' ? letterSheet(d) : [postcardFront(d), postcardBack(d)]);
    const designs = el('div', { class: 'pc-designs', role: 'radiogroup', 'aria-label': 'Diseño' }, POSTCARD_DESIGNS.map((x) => el('button', { class: 'pc-design', type: 'button', role: 'radio', 'aria-checked': String(x.id === d.design), dataset: { id: x.id }, onClick: () => {
      d.design = x.id; designs.querySelectorAll('.pc-design').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === d.design))); paint();
    } }, postcardArt(x.id), el('span', { class: 'small' }, x.label))));
    const msg = ui.textarea({ rows: 5, maxlength: '600', placeholder: 'Escribe tu mensaje…' }); msg.value = d.message;
    const to = ui.input({ maxlength: '40', value: d.to }); const from = ui.input({ maxlength: '40', value: d.from });
    const sync = () => { d.message = msg.value; d.to = to.value; d.from = from.value; paint(); };
    for (const n of [msg, to, from]) n.addEventListener('input', util.debounce(sync, 150));
    const saveRec = async () => {
      sync();
      const id = rec?.id || util.uuid();
      await K.putArtifact({ ...(rec || { id, gameId: 'postales', type: 'postcard' }), id, data: { ...d } });
      if (!rec) K.logGame('postales', { result: POSTCARD_DESIGNS.find((x) => x.id === d.design)?.label || 'Postal' });
      rec = await db.get('gameArtifacts', id);
    };
    const print = async () => {
      await saveRec();
      const sheet = el('div', { class: `print-sheet print-postal is-${d.format}` }, d.format === 'carta' ? letterSheet(d) : [el('div', { class: 'print-page' }, postcardFront(d)), el('div', { class: 'print-page' }, postcardBack(d))]);
      document.body.append(sheet); document.body.classList.add('printing-sheet');
      const done = () => { sheet.remove(); document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done); window.print(); setTimeout(done, 60000);
    };
    const saved = await K.artifacts('postales', 'postcard');
    put(box,
      el('section', { class: 'card stack' },
        ui.field({ label: 'Formato', control: ui.segmented({ label: 'Formato', value: d.format, options: [{ value: 'postal', label: 'Postal' }, { value: 'carta', label: 'Carta' }], onChange: (v) => { d.format = v; paint(); } }) }),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Diseño'), designs),
        el('div', { class: 'cal-form-row' }, ui.field({ label: 'Para', control: to }), ui.field({ label: 'De', control: from })),
        ui.field({ label: 'Mensaje', control: msg, hint: 'Se imprime para entregarla en mano.' })),
      el('h2', { class: 'section-title' }, 'Vista previa'), preview,
      el('div', { class: 'btn-row' },
        ui.button({ label: 'Imprimir', iconName: 'printer', variant: 'primary', onClick: () => print().catch((e) => console.error(e)) }),
        ui.button({ label: 'Guardar', iconName: 'check', onClick: async () => { await saveRec(); ui.toast('Guardada.', { tone: 'success' }); home(rec); } }),
        rec ? ui.button({ label: 'Nueva', iconName: 'plus', variant: 'ghost', onClick: () => home() }) : null),
      saved.length ? el('section', { class: 'stack' }, el('h2', { class: 'section-title' }, 'Guardadas'),
        el('ul', { class: 'card pet-list' }, saved.slice(0, 20).map((r) => el('li', { class: 'pet-row' }, icon(r.data.format === 'carta' ? 'mail' : 'image', { size: 18 }),
          el('div', { class: 'grow' }, el('strong', {}, `${POSTCARD_DESIGNS.find((x) => x.id === r.data.design)?.label || 'Postal'} · para ${r.data.to || '—'}`), el('p', { class: 'muted small clamp-2' }, r.data.message || 'Sin mensaje')),
          ui.button({ label: 'Abrir', iconName: 'pencil', variant: 'ghost', small: true, onClick: () => home(r) }),
          el('button', { class: 'icon-btn icon-btn-small', type: 'button', 'aria-label': 'Borrar la postal', onClick: async () => { if (await ui.confirmDialog({ title: '¿Borrar esta postal?', confirmLabel: 'Borrar', danger: true })) { await db.softDelete('gameArtifacts', r.id); home(); } } }, icon('trash-2', { size: 16 })))))) : null);
    paint();
    ctx.mount(box);
  };
  await home();
  return () => {};
}

const GAMES = { origami, tanabata, kotoba, manga, postales };
export const play = (ctx) => GAMES[ctx.game.id](ctx);
