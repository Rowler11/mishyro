// The Chinese styles' art (v0.16.0, chosen 2026-11-24): Inicio's corner and the colors of what falls.
// "Palacio rojo": a gnarled plum branch (梅) with two red silk lanterns (灯笼) hanging from it, the
// lanterns glow at night. "Porcelana azul": the same branch painted in cobalt like blue-and-white
// porcelain, in front of a round moon. The branch follows the season: blossoms in winter and spring,
// leaves and small plums in summer, golden leaves in autumn (snow on the wood in winter).
// Pure SVG strings built from constants (no user data), drawn once per change.

/** 'jp' | 'rojo' | 'azul' from the root element. */
export const styleNow = () => {
  const s = document.documentElement.dataset.style;
  return s === 'rojo' || s === 'azul' ? s : 'jp';
};
export const isChinese = (s = styleNow()) => s === 'rojo' || s === 'azul';

/** What falls on Inicio by day, per style and season ('sakura' spring, 'hotaru' summer, 'momiji' autumn, 'snow' winter). */
export function fallingColors(style, season) {
  if (style === 'azul') {
    if (season === 'hotaru') return ['#26478E', '#3A62B0', '#5C82C8'];
    if (season === 'momiji') return ['#26478E', '#3A62B0', '#B39556'];
    return ['#FFFFFF', '#E3EBF8', '#C9D7EF'];
  }
  if (season === 'hotaru') return ['#4E8A3E', '#6AA34F', '#3C7232'];
  if (season === 'momiji') return ['#E0A82E', '#F0C24A', '#C98A1E', '#D9662E'];
  return ['#C8263A', '#E04A5E', '#F27A8C', '#B01E2E'];
}
/** The kind of particle: petals of plum in winter and spring, leaves the rest of the year (snow joins in winter). */
export const fallingKind = (season) => (season === 'hotaru' || season === 'momiji' ? 'leaf' : 'plum');

let seed = 1;
const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };
const f = (n) => n.toFixed(1);

function blossom(x, y, r, a, { petal, edge, center, stamen }) {
  const petals = [0, 72, 144, 216, 288].map((k) => {
    const g = ((k + a) * Math.PI) / 180;
    return `<circle cx="${f(x + Math.cos(g) * r * 0.62)}" cy="${f(y + Math.sin(g) * r * 0.62)}" r="${f(r * 0.52)}" fill="${petal}" stroke="${edge}" stroke-width="${f(Math.max(0.4, r * 0.06))}"/>`;
  }).join('');
  const st = Array.from({ length: 7 }, (_, i) => {
    const g = ((i * 51 + a) * Math.PI) / 180; const ex = x + Math.cos(g) * r * 0.42; const ey = y + Math.sin(g) * r * 0.42;
    return `<line x1="${f(x)}" y1="${f(y)}" x2="${f(ex)}" y2="${f(ey)}" stroke="${stamen}" stroke-width=".45"/><circle cx="${f(ex)}" cy="${f(ey)}" r=".75" fill="${stamen}"/>`;
  }).join('');
  return `<g>${petals}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.24)}" fill="${center}"/>${st}</g>`;
}
const bud = (x, y, r, c, edge) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.7)}" ry="${f(r)}" fill="${c}" stroke="${edge}" stroke-width=".5" transform="rotate(${f(rnd(-40, 40))} ${f(x)} ${f(y)})"/>`;
function leaf(x, y, r, a, c, vein) {
  return `<g transform="rotate(${f(a)} ${f(x)} ${f(y)})"><path d="M${f(x)} ${f(y - r)}C${f(x + r * 0.62)} ${f(y - r * 0.4)} ${f(x + r * 0.5)} ${f(y + r * 0.6)} ${f(x)} ${f(y + r)}C${f(x - r * 0.5)} ${f(y + r * 0.6)} ${f(x - r * 0.62)} ${f(y - r * 0.4)} ${f(x)} ${f(y - r)}Z" fill="${c}"/><path d="M${f(x)} ${f(y - r * 0.8)}L${f(x)} ${f(y + r * 0.9)}" stroke="${vein}" stroke-width=".5" opacity=".6"/></g>`;
}

// Lanterns hang from these points of the branch (x, y of the knot, size).
const HANG = [[150, 47, 44, '福'], [218, 30, 34, '爱']];

function lantern(x, top, s, word, id, night) {
  const y = top + s * 0.95;
  const glow = night ? `<circle cx="0" cy="0" r="${f(s * 1.35)}" fill="url(#cs-rojo-glow)"/>` : '';
  const ribs = [-0.62, -0.36, -0.12, 0.12, 0.36, 0.62].map((k) => `<path d="M${f(k * s * 0.55)} ${f(-s * 0.42)}Q${f(k * s * 0.95)} 0 ${f(k * s * 0.55)} ${f(s * 0.42)}" fill="none" stroke="rgba(110,16,12,.4)" stroke-width=".8"/>`).join('');
  const tassel = Array.from({ length: 9 }, (_, i) => { const dx = (i - 4) * 0.9; return `<line x1="${f(dx * 0.4)}" y1="${f(s * 0.74)}" x2="${f(dx)}" y2="${f(s * 1.16)}" stroke="${i % 3 ? '#C8302A' : '#E0503C'}" stroke-width=".9"/>`; }).join('');
  return `<g class="cs-lantern${id === 2 ? ' is-second' : ''}"><line x1="${x}" y1="${top}" x2="${x}" y2="${f(y - s * 0.55)}" stroke="#7A2A1E" stroke-width="1.1"/>
    <g transform="translate(${x} ${f(y)})">${glow}
      <rect x="${f(-s * 0.3)}" y="${f(-s * 0.56)}" width="${f(s * 0.6)}" height="${f(s * 0.12)}" rx="1.5" fill="url(#cs-rojo-gold)"/>
      <ellipse rx="${f(s * 0.6)}" ry="${f(s * 0.45)}" fill="url(#cs-rojo-silk${night ? 'n' : ''})"/>${ribs}
      <ellipse cx="${f(-s * 0.2)}" cy="${f(-s * 0.16)}" rx="${f(s * 0.14)}" ry="${f(s * 0.22)}" fill="#FFFFFF" opacity="${night ? 0.12 : 0.22}"/>
      <text y="${f(s * 0.14)}" text-anchor="middle" font-family="'Ma Shan Zheng', 'Noto Serif SC', serif" font-size="${f(s * 0.4)}" fill="#F6D27A">${word}</text>
      <rect x="${f(-s * 0.3)}" y="${f(s * 0.44)}" width="${f(s * 0.6)}" height="${f(s * 0.12)}" rx="1.5" fill="url(#cs-rojo-gold)"/>
      <line x1="0" y1="${f(s * 0.56)}" x2="0" y2="${f(s * 0.66)}" stroke="#C8302A" stroke-width="1"/>
      <circle cy="${f(s * 0.7)}" r="${f(s * 0.06)}" fill="url(#cs-rojo-gold)"/>${tassel}
    </g></g>`;
}

/**
 * Inicio's corner for a Chinese style. kind: today's ambient kind ('sakura' | 'hotaru' | 'momiji' | 'snow' | 'night').
 * At night the season of the date still shapes the branch (passed as season).
 */
export function cornerArt(style, kind, season) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 270 156'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const night = kind === 'night';
  const sea = night ? season : kind;
  const blue = style === 'azul';
  seed = 11;
  // gnarled plum limbs: short straight runs with sharp turns, from beyond the top right edge
  const limbs = [
    ['M276 12L246 18L232 30L206 34L188 46L160 50L142 62L118 66L100 80', 9],
    ['M232 30L226 16L214 8L200 6', 3.4], ['M206 34L208 48L198 60L190 74', 3.6], ['M188 46L176 36L162 32', 2.8],
    ['M160 50L156 64L146 74L140 88', 2.6], ['M142 62L128 52L116 50', 2.2], ['M118 66L114 80L104 92', 2], ['M246 18L254 32L250 46', 2.6],
    ['M100 80L88 84L80 94', 1.6], ['M190 74L182 82', 1.4], ['M200 6L190 4', 1.2], ['M250 46L258 54', 1.2],
  ];
  const ink = blue ? (night ? ['#B8C9EC', '#7E9BD6', '#3A5A9E'] : ['#4A6CB4', '#26478E', '#142A5C']) : (night ? ['#6A4A3E', '#3E2A22', '#22160F'] : ['#7A5040', '#4A2E24', '#2A1912']);
    // the main limb tapers from the edge to its tip: one segment per run, each a little thinner
  const main = limbs[0][0].slice(1).split('L').map((p) => p.split(' ').map(Number));
  const segs = main.slice(1).map((pt, i) => [main[i], pt, 9.5 - (i * 6.5) / (main.length - 2)]);
  const trunk = segs.map(([a, b, w]) => `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="${ink[2]}" stroke-width="${f(w + 1.4)}" stroke-linecap="round"/>`).join('')
    + segs.map(([a, b, w]) => `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="url(#cs-${style}-bark)" stroke-width="${f(w)}" stroke-linecap="round"/>`).join('');
  const wood = trunk + limbs.slice(1).map(([d, w]) => `<path d="${d}" fill="none" stroke="${ink[2]}" stroke-width="${f(w + (blue ? 1.3 : 1.6))}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="url(#cs-${style}-bark)" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
    // dry-brush highlights along the main limb
    + (blue ? '' : `<path d="${limbs[0][0]}" fill="none" stroke="${ink[0]}" stroke-width="1.4" stroke-dasharray="14 9 4 11" stroke-linecap="round" opacity=".32" transform="translate(0 -2.2)"/>`)
    // knots
    + [[232, 30], [188, 46], [142, 62]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.4" ry="2.4" fill="${ink[2]}" opacity=".7"/>`).join('');
  const snowCap = sea === 'snow' ? `<path d="M276 9L246 15L232 27L206 31L188 43L160 47L142 59L118 63L100 77" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="${night ? 0.7 : 0.95}"/>` : '';
  // where things grow: tips and along the limbs
  const spots = [[200, 6], [190, 4], [214, 8], [226, 16], [190, 74], [182, 82], [198, 60], [162, 32], [176, 36], [140, 88], [146, 74], [116, 50], [128, 52],
    [104, 92], [114, 80], [80, 94], [88, 84], [250, 46], [258, 54], [254, 32], [100, 80], [118, 66], [160, 50], [206, 34], [246, 18]];
  const C = blue
    ? { petal: night ? '#EEF3FC' : '#FFFFFF', edge: night ? '#94B1E8' : '#26478E', center: night ? '#94B1E8' : '#26478E', stamen: night ? '#D2BA84' : '#26478E', bud: night ? '#C9D7EF' : '#5C7FC4' }
    : { petal: night ? '#D2475A' : '#E0485C', edge: night ? '#8E1E2C' : '#A81E30', center: '#F6D27A', stamen: '#F3C95A', bud: '#B01E2E' };
  let growth = '';
  if (sea === 'hotaru' || sea === 'momiji') {
    const leaves = blue ? (sea === 'momiji' ? ['#26478E', '#3A62B0', '#B39556'] : ['#26478E', '#3A62B0', '#5C82C8']) : sea === 'momiji' ? ['#E0A82E', '#F0C24A', '#C98A1E', '#D9662E'] : ['#4E8A3E', '#6AA34F', '#3C7232'];
    spots.forEach(([x, y], i) => { for (let k = 0; k < 2; k++) growth += leaf(x + rnd(-6, 6), y + rnd(-5, 5), rnd(5, 7.5), rnd(-70, 70), night && !blue ? '#3A4A30' : leaves[(i + k) % leaves.length], blue ? '#FFFFFF' : '#FFFFFF'); });
    if (sea === 'hotaru') [[196, 64], [150, 80], [120, 60]].forEach(([x, y]) => { growth += `<circle cx="${x}" cy="${y}" r="3.4" fill="${blue ? '#5C82C8' : '#9BC25A'}" stroke="${blue ? '#26478E' : '#6A8F3A'}" stroke-width=".6"/>`; });
  } else {
    spots.forEach(([x, y], i) => {
      if (i % 4 === 3) growth += bud(x + rnd(-4, 4), y + rnd(-3, 3), 2.6, C.bud, C.edge);
      else growth += blossom(x + rnd(-5, 5), y + rnd(-4, 4), rnd(6.5, 9), rnd(0, 72), C);
    });
  }
  const moon = blue ? `<circle cx="196" cy="46" r="40" fill="url(#cs-${style}-moon)"/><circle cx="196" cy="46" r="40" fill="none" stroke="${night ? '#94B1E8' : '#26478E'}" stroke-width="1" opacity=".35"/>` : '';
  const lanterns = blue ? '' : HANG.map(([x, y, s, w], i) => lantern(x, y, s, w, i + 1, night)).join('');
  svg.innerHTML = `<defs>
    <linearGradient id="cs-${style}-bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink[0]}"/><stop offset=".55" stop-color="${ink[1]}"/><stop offset="1" stop-color="${ink[2]}"/></linearGradient>
    <linearGradient id="cs-${style}-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6D27A"/><stop offset=".5" stop-color="#C8972E"/><stop offset="1" stop-color="#8A6418"/></linearGradient>
    <radialGradient id="cs-${style}-silk" cx=".38" cy=".36" r=".75"><stop offset="0" stop-color="#F0584A"/><stop offset=".6" stop-color="#C8261F"/><stop offset="1" stop-color="#7E1410"/></radialGradient>
    <radialGradient id="cs-${style}-silkn" cx=".45" cy=".45" r=".7"><stop offset="0" stop-color="#FFC27A"/><stop offset=".35" stop-color="#F26A45"/><stop offset="1" stop-color="#A3201A"/></radialGradient>
    <radialGradient id="cs-${style}-glow"><stop offset="0" stop-color="#FFA060" stop-opacity=".42"/><stop offset="1" stop-color="#FF7A4A" stop-opacity="0"/></radialGradient>
    <radialGradient id="cs-${style}-moon" cx=".42" cy=".4" r=".7"><stop offset="0" stop-color="${night ? '#FFF6DE' : '#FFFFFF'}" stop-opacity="${night ? 0.95 : 0.9}"/><stop offset="1" stop-color="${night ? '#E8DDBE' : '#DCE5F4'}" stop-opacity="${night ? 0.75 : 0.7}"/></radialGradient>
    <filter id="cs-${style}-soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="1.4" flood-color="${blue ? '#0F1B3A' : '#3A1410'}" flood-opacity=".2"/></filter>
  </defs>${moon}<g class="corner-swing"><g filter="url(#cs-${style}-soft)">${wood}${snowCap}${growth}</g></g>${lanterns}`;
  return svg;
}

/** A Chinese silk lantern on a canvas (night ambient, behind the cards): red, gold caps, tassel. */
export function canvasLantern(ctx, s, t, ph) {
  const flick = 0.85 + Math.sin(t / 380 + ph) * 0.08 + Math.sin(t / 157 + ph * 2) * 0.04;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.5);
  g.addColorStop(0, `rgba(255,150,90,${0.32 * flick})`); g.addColorStop(1, 'rgba(255,120,70,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 1.5, 0, 6.29); ctx.fill();
  const b = ctx.createRadialGradient(-s * 0.1, -s * 0.1, 0, 0, 0, s * 0.62);
  b.addColorStop(0, '#FFC27A'); b.addColorStop(0.4, '#F26A45'); b.addColorStop(1, '#A3201A');
  ctx.fillStyle = b; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.6, s * 0.45, 0, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#C8972E';
  ctx.fillRect(-s * 0.3, -s * 0.55, s * 0.6, s * 0.12); ctx.fillRect(-s * 0.3, s * 0.43, s * 0.6, s * 0.12);
  ctx.strokeStyle = '#C8302A'; ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 0.4, s * 0.58); ctx.lineTo(i * 0.9, s * 0.95); ctx.stroke(); }
}

/** A plum petal on a canvas (rounded, with a small notch). */
export function canvasPetal(ctx, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(s * 1.1, s * 0.6, s * 0.95, -s * 0.9, 0.0, -s * 0.85);
  ctx.bezierCurveTo(-s * 0.95, -s * 0.9, -s * 1.1, s * 0.6, 0, s); ctx.fill();
}
