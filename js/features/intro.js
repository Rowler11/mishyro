// Opening with petals (decided with the user on 2026-11-19, prototype "Entrada con pétalos" v14).
// A leafy sakura branch swings in with the wind and lets its petals go; each petal flies into a heart,
// turns over and becomes "te amo" in one language, with 愛してる blooming in the middle. While the heart
// forms everything else steps back. Once the app behind is ready the camera dives toward 愛してる, it
// stays a moment, fades, and the usual welcome ("Para …", 愛してる) appears. Ink clouds and a warm
// light sit in the background at the start. Everything is decorative (aria-hidden); tap skips it.
import { util } from '../core.js';

const WORDS = ['Te amo', 'I love you', "Je t'aime", 'Ti amo', 'Ich liebe dich', 'Ik hou van jou', 'Jag älskar dig', 'Jeg elsker deg', 'Kocham cię',
  'Seni seviyorum', 'Я тебя люблю', '사랑해', 'Σ\'αγαπώ', 'Aku cinta kamu', 'Anh yêu em', 'Mahal kita', 'Te iubesc', 'Volim te', 'Szeretlek',
  'Rakastan sinua', "T'estimo", 'Maite zaitut', 'Eu te amo', 'Mi amas vin'];
// v0.22.0: in the Chinese styles the heart becomes 我爱你 (option A, 2026-11-24).
let CENTER = '愛してる';

// Timeline in ms of "story time"; the whole thing plays SLOW times slower in real time.
const SLOW = 1.25;
const ENTER = 750; // the branch swings in
const FLIGHT = 1800; // a petal's flight into the heart
const HOLD_P = 160; // a landed petal rests before it turns
const FLIP = 620; // the petal turns over into its word
const QUIET = 3300; const QUIET_FOR = 1600; // from here the branch, clouds and light fade out
const C_IN = 800; // 愛してる blooms where its petals landed
const SHINE = 800; // a glint sweeps up the finished heart
const DIVE = 1300; // the camera dives toward 愛してる
const KEEP = 800; // 愛してる stays a moment
const VANISH = 800; // and fades
const HOLD = 3000; // the welcome stays long enough to read it
const MAX_WAIT = 15000; // real ms: if loading takes longer, dive anyway

const ease = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const inOut = (p) => 0.5 - Math.cos(Math.PI * p) / 2;
const out3 = (p) => 1 - (1 - p) ** 3;
const clamp = (v) => Math.max(0, Math.min(1, v));
const R = (a, b) => a + Math.random() * (b - a);

// Ink clouds (outlined, with curls) that draw themselves, float and fade; only at the sides.
const CLOUD = '<svg viewBox="0 0 200 90"><path class="intro-cloud-fill" pathLength="1" d="M26 72C10 72 8 52 26 50C22 32 48 24 60 40C66 16 106 12 114 38C126 24 152 30 150 48C168 44 180 62 166 72Z" stroke="currentColor" stroke-width="1.6"/><path pathLength="1" d="M166 72C186 74 196 58 186 48C178 41 168 50 175 56C179 59 183 55 180 52" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path pathLength="1" d="M62 60C60 52 72 50 73 57C74 61 68 62 67 58" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path pathLength="1" d="M112 62C111 55 121 54 122 60" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const CLOUDS = [ // width (in % of the screen, capped on wide screens), left %, top %, duration s, delay s, opacity, drift px
  [46, -6, 12, 16, 0.2, 0.95, 18], [34, 58, 8, 19, 2.4, 0.8, -16], [40, 64, 62, 21, 1.2, 0.85, -20], [44, -12, 76, 18, 7, 0.7, 16], [30, 70, 86, 15, 9, 0.6, -12]];

function heartOutline(n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = Math.PI + (i / n) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3 / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.08]);
  }
  pts.push(pts[0]);
  return pts;
}
function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Plays the opening inside `layer` (the splash). `ready` resolves when the app behind is drawn.
 * Calls onWelcome() when the usual welcome should show and onDone() at the end. Returns stop().
 */
export function playIntro(layer, { ready = Promise.resolve(), onWelcome, onDone }) {
  const st = document.documentElement.dataset.style;
  CENTER = st === 'rojo' || st === 'azul' ? '我爱你' : '愛してる';
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const tok = (v) => style.getPropertyValue(v).trim();
  const night = root.dataset.theme === 'night';

  // background layers: a soft sky, the ink clouds and the warm light
  const deco = document.createElement('div');
  deco.className = 'intro-deco';
  deco.setAttribute('aria-hidden', 'true');
  const div = (cls) => { const n = document.createElement('div'); n.className = cls; return n; };
  const clouds = div('intro-clouds');
  for (const [w, x, y, d, de, o, dx] of CLOUDS) {
    const c = div('intro-cloud');
    // CSSOM, not a style attribute: the app's CSP blocks inline styles
    Object.entries({ '--w': w, '--x': `${x}%`, '--y': `${y}%`, '--d': `${d}s`, '--de': `${de}s`, '--o': o, '--dx': `${dx}px` }).forEach(([k2, v]) => c.style.setProperty(k2, String(v)));
    c.innerHTML = CLOUD; // a fixed SVG from this file
    clouds.append(c);
  }
  deco.append(div('intro-sky'), clouds, div('intro-light'));
  const canvas = document.createElement('canvas');
  canvas.className = 'splash-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.prepend(deco, canvas);
  // the red seal stamped next to "Para …"
  const seal = document.createElement('span');
  seal.className = 'intro-seal';
  seal.setAttribute('aria-hidden', 'true');
  seal.append(util.icon('heart', { size: 15 }));
  layer.querySelector('.splash-for')?.append(seal);

  const ctx = canvas.getContext('2d');
  // colors: tokens resolved once (normalized to #rrggbb through the canvas)
  const norm = (c) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; return ctx.fillStyle; };
  const hex = (c) => { const m = norm(c).replace('#', ''); return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)); };
  const mix = (a, b, k) => { const x = hex(a); const y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`; };
  const accent = norm(tok('--accent') || '#C2405F');
  const gold = norm(tok('--gold') || '#C9A46A');
  // v0.32.8: a warmer, deeper bark (it was the grey of the text), so the branch reads as wood
  const bark = mix(norm(tok('--text-2') || '#7A6268'), night ? '#6A4A44' : '#5A3A30', 0.6);
  const barkLight = mix(bark, '#ffffff', 0.45);
  const tipColor = mix(accent, '#ffffff', night ? 0.35 : 0.72);
  const moteColor = mix(gold, '#ffffff', 0.15);
  const haloColor = night ? mix(accent, '#ffffff', 0.3) : mix(accent, gold, 0.35);
  const serif = tok('--font-serif') || 'serif';
  // v0.22.0: the heart's word uses the same letters as the titles (brush in Palacio rojo, porcelain serif in Porcelana azul)
  const centerFont = st === 'rojo' ? `400 SIZEpx 'Ma Shan Zheng', 'Noto Serif SC', ${serif}` : st === 'azul' ? `700 SIZEpx 'Noto Serif SC', ${serif}` : `700 SIZEpx ${serif}`;
  document.fonts?.load(centerFont.replace('SIZE', '40'), CENTER).catch(() => {});
  const sans = tok('--font-ui') || tok('--font-sans') || 'sans-serif';

  const r = layer.getBoundingClientRect();
  const W = r.width; const H = r.height;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const S = Math.min(W * 0.42, H * 0.25); const cx = W / 2; const cy = H * 0.47;

  // Petal sprites drawn once: a sakura petal with its notch, deeper at the base, lighter at the tip.
  const sprite = (shift, back, blur) => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 96; const g = c.getContext('2d');
    if (blur) g.filter = `blur(${blur}px)`;
    g.translate(48, 48); const s = 34; const k = back ? -0.12 : 0;
    const grad = g.createLinearGradient(-s * 0.3, s, s * 0.2, -s);
    grad.addColorStop(0, mix(accent, '#ffffff', (night ? 0.02 : 0.12) + k + shift * 0.2));
    grad.addColorStop(0.45, mix(accent, '#ffffff', (night ? 0.28 : 0.6) + k + shift * 0.2));
    grad.addColorStop(1, mix(accent, '#ffffff', (night ? 0.5 : 0.9) + k / 2));
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, s); g.bezierCurveTo(s, s * 0.45, s * 0.82, -s * 0.8, s * 0.24, -s);
    g.quadraticCurveTo(s * 0.08, -s * 0.9, 0, -s * 0.7); g.quadraticCurveTo(-s * 0.08, -s * 0.9, -s * 0.24, -s);
    g.bezierCurveTo(-s * 0.82, -s * 0.8, -s, s * 0.45, 0, s); g.fill();
    if (!blur) { // fine veins and a soft light along one side, so it reads as a thin, curved petal
      g.globalAlpha = 0.18; g.strokeStyle = mix(accent, '#ffffff', 0.1); g.lineWidth = 0.9;
      for (const a of [-0.35, 0, 0.35]) { g.beginPath(); g.moveTo(0, s * 0.9); g.quadraticCurveTo(a * s * 0.6, 0, a * s * 0.9, -s * 0.72); g.stroke(); }
      g.globalAlpha = back ? 0.08 : 0.22; const hl = g.createLinearGradient(-s, 0, s, 0); hl.addColorStop(0, '#ffffff'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.globalCompositeOperation = 'source-atop'; g.fillRect(-s, -s, 2 * s, 2 * s);
    }
    return c;
  };
  const sprites = [0, 0.5, 1].map((x) => sprite(x, false, 0));
  const backs = [0, 0.5, 1].map((x) => sprite(x, true, 0));
  const blurs = [0, 0.5, 1].map((x) => sprite(x, false, 3));
  // A petal tumbling in 3D: it turns in the plane (rot), around its long axis (flip shows the back) and nods.
  const petal = (x, y, size, rot, flip, alpha, k = 0, nod = 1, blurry = false) => {
    if (alpha <= 0.01) return;
    ctx.setTransform(dpr, 0, 0, dpr, dpr * x, dpr * y); ctx.rotate(rot); ctx.scale(Math.max(0.06, Math.abs(flip)), 0.7 + 0.3 * Math.abs(nod));
    ctx.globalAlpha = alpha;
    const rr = size * (96 / 68);
    ctx.drawImage(blurry ? blurs[k] : flip < 0 ? backs[k] : sprites[k], -rr, -rr, rr * 2, rr * 2);
  };

  // v0.32.8 (Rowler: more quality in the whole opening): each blossom is painted once into a sprite (five
  // notched petals with their shading, a deeper heart, golden stamens and a soft shadow) and reused, so the
  // branch looks finer and draws in one step per flower, which keeps the animation fluid on phones.
  const blossom = (k) => {
    const c = document.createElement('canvas'); const P = 112; c.width = c.height = P; const g = c.getContext('2d'); g.translate(P / 2, P / 2);
    const s = 22;
    g.shadowColor = 'rgba(60,20,30,.18)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate((i * Math.PI * 2) / 5); g.translate(0, -s * 0.95);
      const gr = g.createLinearGradient(0, s, 0, -s);
      gr.addColorStop(0, mix(accent, '#ffffff', (night ? 0.1 : 0.35) + k * 0.08)); gr.addColorStop(0.55, mix(accent, '#ffffff', (night ? 0.42 : 0.72) + k * 0.05)); gr.addColorStop(1, mix(accent, '#ffffff', night ? 0.62 : 0.93));
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, s); g.bezierCurveTo(s * 0.95, s * 0.5, s * 0.8, -s * 0.75, s * 0.24, -s);
      g.quadraticCurveTo(s * 0.08, -s * 0.84, 0, -s * 0.66); g.quadraticCurveTo(-s * 0.08, -s * 0.84, -s * 0.24, -s);
      g.bezierCurveTo(-s * 0.8, -s * 0.75, -s * 0.95, s * 0.5, 0, s); g.fill();
      g.restore();
    }
    g.shadowColor = 'transparent';
    for (let i = 0; i < 5; i++) { // fine veins
      g.save(); g.rotate((i * Math.PI * 2) / 5); g.globalAlpha = 0.22; g.strokeStyle = mix(accent, '#ffffff', 0.2); g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(0, -s * 0.2); g.quadraticCurveTo(s * 0.06, -s * 1.1, 0, -s * 1.55); g.stroke(); g.restore();
    }
    g.globalAlpha = 1;
    const heart = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.7);
    heart.addColorStop(0, mix(accent, '#000000', 0.08)); heart.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = heart; g.beginPath(); g.arc(0, 0, s * 0.7, 0, 7); g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const a = i * 0.571 + k; const l = s * (0.42 + 0.14 * ((i * 7) % 3) / 2); const ex = Math.cos(a) * l; const ey = Math.sin(a) * l;
      g.strokeStyle = mix(accent, '#ffffff', 0.15); g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ex * 0.5 + ey * 0.12, ey * 0.5 - ex * 0.12, ex, ey); g.stroke();
      g.fillStyle = mix(gold, '#ffffff', 0.15); g.beginPath(); g.arc(ex, ey, 1.4, 0, 7); g.fill();
    }
    g.fillStyle = mix(gold, accent, 0.4); g.beginPath(); g.arc(0, 0, 2.2, 0, 7); g.fill();
    return { c, half: P / 2, unit: s * 1.95 };
  };
  const blossoms = [0, 1, 2].map(blossom);

  // ---------- layout ----------
  const poly = heartOutline(420).map(([x, y]) => [cx + x * S, cy + y * S]);
  let len = 0; const lens = [0];
  for (let i = 1; i < poly.length; i++) { len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); lens.push(len); }
  const base = Math.max(8, Math.min(13, (S * 2.4) / 40));
  // a coarser outline is enough to test "inside" and keeps the layout fast on phones
  const inner = heartOutline(96).map(([x, y]) => [cx + x * S * 0.84, cy + y * S * 0.84]);
  const font = (size, bold) => `${bold ? 700 : 500} ${size}px ${sans}`;
  // text widths scale with the font size: measure each word once at 100px
  const widthAt = (bold) => { ctx.font = font(100, bold); const m = new Map(WORDS.map((t) => [t, ctx.measureText(t).width / 100])); return (t, size) => m.get(t) * size; };
  const wBold = widthAt(true); const wReg = widthAt(false);
  const boxes = []; const words = [];
  const fits = (b) => !boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  // 愛してる sits in the middle of the heart, in the serif of the titles
  const csize = Math.round(S * 0.21);
  const center = { x: cx, y: cy + S * 0.14, size: csize, font: centerFont.replace('SIZE', String(csize)) };
  ctx.font = center.font; center.w = ctx.measureText(CENTER).width;
  const ell = (x, y) => ((x - center.x) / (center.w / 2 + 4)) ** 2 + ((y - center.y) / (csize * 0.62)) ** 2;
  // 1) the outline, in drawing order
  let acc = 0; let last = null; let k = 0;
  for (let i = 1; i < poly.length; i++) {
    const [tx, ty] = poly[i]; if (last) acc += Math.hypot(tx - last[0], ty - last[1]); last = [tx, ty];
    if (acc < base * 1.3) continue; acc = 0;
    const x = cx + (tx - cx) * 0.93; const y = cy + (ty - cy) * 0.93;
    const text = WORDS[k++ % WORDS.length]; const size = base * R(0.85, 1.05);
    const w = wBold(text, size);
    const b = { w: w * 0.55, h: size * 0.8 }; b.x = x - b.w / 2; b.y = y - b.h / 2;
    if (!fits(b)) continue;
    boxes.push(b); words.push({ text, x, y, size, bold: true, edge: true, u: lens[i] / len });
  }
  const edgeCount = words.length;
  // 2) smaller words inside; the ones under 愛してる sink back when it blooms, so there is no hole
  for (let tries = 0; tries < 5000 && words.length < edgeCount + 260; tries++) {
    const x = cx - S + Math.random() * 2 * S; const y = cy - S + Math.random() * 2 * S;
    const text = WORDS[Math.floor(Math.random() * WORDS.length)]; const size = base * R(0.55, 0.95);
    if (!inside(inner, x, y)) continue;
    const w = wReg(text, size);
    const b = { x: x - w / 2 - 1, y: y - size / 2 - 1, w: w + 2, h: size + 2 };
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [x, b.y], [x, b.y + b.h]];
    if (!corners.every(([px, py]) => inside(inner, px, py)) || !fits(b)) continue;
    boxes.push(b); words.push({ text, x, y, size, bold: false, edge: false, near: Math.min(...corners.map(([px, py]) => ell(px, py))) });
  }
  const fill = words.slice(edgeCount).sort((a, b) => b.y - a.y + (Math.random() - 0.5) * 30);
  fill.forEach((w, i) => { w.u = i / fill.length; });
  // 3) petals that land on 愛してる and turn into its ink
  for (let i = 0; i < 18; i++) words.push({ text: '', ghost: true, x: center.x + (Math.random() - 0.5) * center.w, y: center.y + (Math.random() - 0.5) * csize * 0.7, size: 10 });

  // the leafy branch, top right; its length is capped on wide screens
  const reach = Math.min(W * 0.6, 420);
  const branch = { x0: W + 6, y0: H * 0.06, x1: W + 6 - reach, y1: H * 0.06 + Math.min(H * 0.09, 70) };
  branch.pt = (t) => [branch.x0 + (branch.x1 - branch.x0) * t, branch.y0 + (branch.y1 - branch.y0) * t + Math.sin(t * Math.PI) * -18];
  const flowers = (n, sMin, sMax, buds) => Array.from({ length: n }, () => ({ s: R(0.35, 1), off: R(-7, 7), size: R(sMin, sMax), rot: R(0, 6.28), bud: Math.random() < buds }));
  const limb = (u, ang, l, bend, w, fl, kids = []) => ({ u, ang, len: l, bend, w, seed: R(0, 6.28), flowers: fl, kids });
  // v0.12.1 (asked 2026-11-22): leafier, with more limbs and twigs and fuller clusters of flowers
  branch.kids = [0.08, 0.16, 0.24, 0.32, 0.41, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9].map((u, i) => {
    const up = i % 2 ? -1 : 1; const big = i % 3 !== 2;
    return limb(u, up * R(0.55, 1.05), big ? R(38, 62) : R(24, 36), -up * R(0.2, 0.5), big ? R(2.6, 3.6) : R(1.8, 2.4), flowers(big ? 6 : 4, 6, 10, 0.18), [
      limb(R(0.3, 0.5), -up * R(0.5, 0.9), R(16, 26), up * 0.3, 1.5, flowers(4, 5, 8, 0.22)),
      ...(big ? [limb(R(0.6, 0.85), up * R(0.4, 0.8), R(12, 20), -up * 0.3, 1.2, flowers(3, 5, 8, 0.25))] : []),
    ]);
  });
  branch.main = [0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.91, 1].flatMap((u) => [0, 1, 2].map(() => ({ u, off: R(-11, 11), size: R(6, 10), rot: R(0, 6.28), bud: Math.random() < 0.15 })));

  // each petal leaves the branch (or rides the wind from the right edge) and curls into place
  for (const w of words) {
    w.alpha = w.edge ? 1 : R(0.62, 0.92); // one color; only size and strength change
    w.under = !w.edge && !w.ghost && w.near < 1.6;
    if (!w.ghost) w.font = font(w.size, w.bold);
    w.depth = R(0.5, 1.6);
    w.home = w.ghost ? R(4200, 4700) : w.edge ? 2900 + w.u * 1200 : 3700 + w.u * 1400;
    w.s0 = w.home - FLIGHT * R(0.85, 1.15);
    const [bx, by] = branch.pt(R(0.1, 1));
    const fromBranch = Math.random() < 0.55;
    w.sx = fromBranch ? bx + R(-10, 10) : W + R(20, 60);
    w.sy = fromBranch ? by + R(-8, 8) : H * R(0.05, 0.5);
    const mx = (w.sx + w.x) / 2; const my = (w.sy + w.y) / 2; const dx = w.x - w.sx; const dy = w.y - w.sy; const n = Math.hypot(dx, dy) || 1;
    const swirl = (Math.random() < 0.5 ? -1 : 1) * R(0.25, 0.6) * n;
    w.cx = mx - (dy / n) * swirl; w.cy = my + (dx / n) * swirl;
    w.ps = R(5, 9); w.ph = R(0, 6.28); w.spin = R(-0.002, 0.002); w.flipSpeed = R(260, 520); w.nodSpeed = R(340, 640); w.k = Math.floor(Math.random() * 3);
    w.at = w.home + HOLD_P;
  }
  // loose petals in three depths (far, middle, a few near and out of focus) and motes of light
  const ambient = Array.from({ length: 24 }, (_, i) => {
    const layerN = i < 11 ? 0 : i < 21 ? 1 : 2;
    return { layer: layerN, x: Math.random() * W * 1.4, y: -Math.random() * H, v: [0.018, 0.03, 0.06][layerN] * R(0.8, 1.3), drift: -[0.012, 0.022, 0.05][layerN],
      ph: R(0, 6.28), s: [R(3, 5), R(5, 8), R(14, 22)][layerN], spin: R(-0.002, 0.002), flipSpeed: R(300, 600), k: Math.floor(Math.random() * 3),
      a: [0.35, 0.7, 0.55][layerN] * R(0.7, 1), blurry: layerN !== 1 };
  });
  const motes = Array.from({ length: 12 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: R(0.006, 0.016), ph: R(0, 6.28), tw: R(500, 1400), r: R(3, 7) }));
  const burst = Array.from({ length: 40 }, () => { const a = R(0, 6.28); const rr = Math.random() * S * 0.8; return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.9, a, sp: R(0.6, 1.8), s: R(5, 9), ph: R(0, 6.28), k: Math.floor(Math.random() * 3) }; });

  const T = { cIn: 4800 + HOLD_P };
  T.drawn = Math.max(T.cIn + C_IN, 3700 + 1400 + HOLD_P + FLIP); T.shine = T.drawn;
  T.dive = Infinity; T.end = Infinity; T.vanish = Infinity; T.gone = Infinity; // set once the app is ready

  // ---------- drawing ----------
  const gust = (t) => 0.6 + 0.4 * Math.sin(t / 1300) + 0.35 * Math.max(0, Math.sin(t / 700 + 1)) ** 3;
  // the wind moves the branch from the first moment: uneven gusts, stronger while it comes in and calmer
  // after; the tip lags behind the base so it bends instead of turning stiffly
  const windAt = (tt) => 0.075 * Math.sin(tt / 230) + 0.045 * Math.sin(tt / 151 + 1.3) + 0.03 * Math.sin(tt / 397 + 0.7);

  function drawBranch(alpha, t) {
    if (alpha <= 0.01) return;
    const sway = (Math.sin(t / 900) * 2 + gust(t) * 2) * clamp((t - ENTER) / 600);
    const slide = (1 - out3(clamp(t / ENTER))) * reach * 1.1;
    const strength = (0.3 + 0.7 * Math.exp(-t / 1500)) * clamp(t / 150);
    const pt = (u) => {
      const [bx, by] = branch.pt(u); const a = windAt(t - u * 140) * strength * u ** 0.4 * u; const dx = bx - branch.x0; const dy = by - branch.y0;
      return [branch.x0 + dx * Math.cos(a) - dy * Math.sin(a) + slide, branch.y0 + dx * Math.sin(a) + dy * Math.cos(a) + sway * u * u];
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // tapered bark with light catching its top edge
    const stroke = (pts, w0, w1) => {
      const n = pts.length - 1;
      for (let i = 0; i < n; i++) {
        const w = w0 + (w1 - w0) * (i / n); const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
        ctx.globalAlpha = alpha; ctx.strokeStyle = bark; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        if (w > 1.6) {
          const nx = -(by - ay); const ny = bx - ax; const nl = Math.hypot(nx, ny) || 1; const o = -w * 0.28;
          ctx.globalAlpha = alpha * 0.45; ctx.strokeStyle = barkLight; ctx.lineWidth = Math.max(0.6, w * 0.22);
          ctx.beginPath(); ctx.moveTo(ax + (nx / nl) * o, ay + (ny / nl) * o); ctx.lineTo(bx + (nx / nl) * o, by + (ny / nl) * o); ctx.stroke();
        }
      }
    };
    const flower = (x, y, sz, rot, bud) => {
      if (bud) { petal(x, y, sz * 0.38, rot, 0.55, alpha, 0, 1); return; }
      const B = blossoms[Math.abs(Math.round(rot * 10)) % 3]; const k2 = (sz * 1.05) / B.unit;
      ctx.setTransform(dpr * k2, 0, 0, dpr * k2, dpr * x, dpr * y); ctx.rotate(rot); ctx.globalAlpha = alpha;
      ctx.drawImage(B.c, -B.half, -B.half);
    };
    stroke(Array.from({ length: 25 }, (_, i) => pt(i / 24)), 7.5, 1.2);
    const blooms = [];
    // side limbs bend from where they grow and sway a little on their own
    const grow = (P, dir, L, depth, swayK) => {
      const pts = [P]; let [x, y] = P;
      for (let i = 1; i <= 10; i++) {
        const q = i / 10; const a = dir + L.bend * q + 0.12 * Math.sin(q * 7 + L.seed) + windAt(t - 180 * depth) * strength * swayK * q;
        x += (Math.cos(a) * L.len) / 10; y += (Math.sin(a) * L.len) / 10 + sway * 0.04 * q; pts.push([x, y]);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); stroke(pts, L.w, Math.max(0.6, L.w * 0.35));
      for (const f of L.flowers) { const [fx, fy] = pts[Math.min(10, Math.round(f.s * 10))]; blooms.push([fx + f.off * 0.4, fy + f.off * 0.6, f.size, f.rot, f.bud]); }
      for (const c of L.kids) { const i = Math.round(c.u * 10); const [ax, ay] = pts[i]; const [bx, by] = pts[Math.min(10, i + 1)]; grow([ax, ay], Math.atan2(by - ay, bx - ax) + c.ang, c, depth + 1, swayK * 1.4); }
    };
    for (const L of branch.kids) { const [ax, ay] = pt(L.u); const [bx, by] = pt(Math.min(1, L.u + 0.02)); grow([ax, ay], Math.atan2(by - ay, bx - ax) + L.ang, L, 1, 1.6); }
    for (const f of branch.main) { const [x, y] = pt(f.u); blooms.push([x, y + f.off, f.size, f.rot, f.bud]); }
    for (const b of blooms) flower(...b);
  }

  let raf = 0;
  const timers = [];
  const start = performance.now();
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  function frame(now) {
    const t = (now - start) / SLOW;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t > T.gone + 200) { canvas.remove(); return; } // the welcome is up: nothing left to draw
    const d = clamp((t - T.dive) / DIVE); const e = ease(d);
    const still = 1 - inOut(clamp((t - QUIET) / QUIET_FOR)); // everything but the heart steps back
    drawBranch(clamp(t / 300) * (1 - clamp(d * 2)) * still, t);
    const g = gust(t);
    const amb = (a) => {
      const y = (((a.y + a.v * t * 3 * (0.85 + 0.15 * Math.cos(t / a.flipSpeed + a.ph))) % (H + 80)) + H + 80) % (H + 80) - 40;
      const x = (((a.x + a.drift * t * 3 * g + Math.sin(t / 650 + a.ph) * 18 * (a.layer + 1)) % (W + 80)) + W + 80) % (W + 80) - 40;
      petal(x, y, a.s, a.ph + t * a.spin + Math.sin(t / 800 + a.ph) * 0.6, Math.cos(t / a.flipSpeed + a.ph), a.a * clamp((t - ENTER - 200) / 900) * still, a.k, Math.sin(t / (a.flipSpeed * 1.3) + a.ph), a.blurry);
    };
    if (still > 0) {
      for (const a of ambient) if (a.layer < 2) amb(a);
      // motes of light drifting up slowly, like pollen in the sun
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const m of motes) {
        const y = (((m.y - t * m.v) % (H + 20)) + H + 20) % (H + 20) - 10; const x = m.x + Math.sin(t / 1400 + m.ph) * 14;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, m.r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, moteColor); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = clamp((t - ENTER) / 1500) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / m.tw + m.ph))) * 0.7 * still;
        ctx.fillStyle = gr; ctx.fillRect(x - m.r, y - m.r, m.r * 2, m.r * 2);
      }
    }
    // a slow breath once the heart is complete (it keeps breathing while the app finishes loading)
    const breath = t > T.drawn && d === 0 ? 1 + 0.025 * Math.sin(((t - T.drawn) / SHINE) * Math.PI) : 1;
    // flying petals that become words
    for (const w of words) {
      if (t < w.s0 || t > w.at + (w.ghost ? FLIP / 2 : FLIP)) continue;
      const h = inOut(clamp((t - w.s0) / (w.home - w.s0))); const q = 1 - h;
      const x = q * q * w.sx + 2 * q * h * w.cx + h * h * w.x + Math.sin(t / 420 + w.ph) * 16 * q;
      const y = q * q * w.sy + 2 * q * h * w.cy + h * h * w.y + Math.abs(Math.cos(t / 420 + w.ph)) * 8 * q;
      const settle = clamp((t - w.home + 320) / 320);
      const flip = t < w.at ? Math.cos(t / w.flipSpeed + w.ph) * (1 - settle) + settle : Math.cos((clamp((t - w.at) / (FLIP / 2)) * Math.PI) / 2);
      const rot = (w.ph + t * w.spin + Math.sin(t / 420 + w.ph) * 0.5) * (1 - settle);
      const nod = t < w.at ? Math.sin(t / w.nodSpeed + w.ph) * (1 - settle) + settle : 1;
      petal(x, y, w.ps * (1 - 0.25 * h), rot, flip, Math.min(1, (t - w.s0) / 300), w.k, nod);
    }
    // words: one color; each turns in like a card as its petal turns away; the camera dives toward 愛してる
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = accent;
    const fade = 1 - clamp((d - 0.25) / 0.6);
    const band = cy + S * 1.15 - clamp((t - T.shine) / SHINE) * S * 2.6; // the glint sweeping up
    const sinkK = out3(clamp((t - T.cIn) / C_IN));
    for (const w of words) {
      if (w.ghost) continue;
      const f = clamp((t - w.at - FLIP / 2) / (FLIP / 2)); if (f <= 0) continue;
      const z = 1 + 10 * e * w.depth;
      const x = center.x + (w.x - center.x) * z * breath; const y = center.y + (w.y - center.y) * z * breath;
      const s = z * breath * (0.85 + 0.15 * out3(f));
      ctx.setTransform(dpr * s * Math.sin((f * Math.PI) / 2), 0, 0, dpr * s, dpr * x, dpr * y);
      const glint = t > T.shine && d === 0 ? Math.exp(-(((w.y - band) / (S * 0.18)) ** 2)) : 0;
      const sink = w.under ? 1 - 0.85 * sinkK * clamp((1.6 - w.near) / 0.6) : 1;
      ctx.globalAlpha = Math.min(1, w.alpha + glint * 0.6) * fade * sink; ctx.font = w.font; ctx.fillText(w.text, 0, 0);
      if (glint > 0.05) { ctx.globalAlpha = glint * 0.55 * fade; ctx.fillStyle = tipColor; ctx.fillText(w.text, 0, 0); ctx.fillStyle = accent; }
    }
    // 愛してる: its glow starts faint, swells as the camera arrives, breathes while it stays and leaves with it
    const ci = clamp((t - T.cIn) / C_IN);
    if (ci > 0 && t < T.gone) {
      const v = clamp((t - T.vanish) / VANISH);
      const zc = (1 + 0.45 * e) * breath * (1 + 0.04 * out3(v)) * (0.94 + 0.06 * out3(ci));
      const swell = inOut(clamp((t - T.dive) / (DIVE + KEEP * 0.5)));
      const breathe = t > T.end ? 1 + 0.1 * Math.sin(((t - T.end) / 900) * Math.PI * 2) * clamp((t - T.end) / 400) : 1;
      const glow = (0.3 + 0.7 * swell) * out3(ci) * (1 - out3(v)) * breathe;
      ctx.setTransform(dpr * zc, 0, 0, dpr * zc, dpr * center.x, dpr * center.y);
      ctx.font = center.font; ctx.fillStyle = haloColor;
      for (const [rad, a] of [[3.2, 0.7], [1.4, 0.6]]) { // a tight glow on the strokes, never a block behind them
        ctx.filter = `blur(${(rad * (0.6 + 0.4 * swell) * dpr * zc).toFixed(1)}px)`;
        ctx.globalAlpha = glow * a; ctx.fillText(CENTER, 0, 0);
      }
      const blur = (1 - out3(ci)) * 6 + out3(v) * 8;
      ctx.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : 'none';
      ctx.globalAlpha = out3(ci) * (1 - v); ctx.fillStyle = accent; ctx.fillText(CENTER, 0, 0);
      ctx.filter = 'none';
    }
    if (still > 0) for (const a of ambient) if (a.layer === 2) amb(a);
    // the dive: petals burst toward the camera
    if (d > 0 && d < 1) {
      for (const b of burst) {
        const q = out3(d) * b.sp; const x = b.x + Math.cos(b.a) * q * W * 0.9; const y = b.y + Math.sin(b.a) * q * H * 0.7;
        petal(x, y, b.s * (1 + 5 * q), b.ph + d * 3, Math.cos(d * 7 + b.ph), (1 - d) * 0.9, b.k, Math.sin(d * 5 + b.ph), q > 0.6);
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  // the dive waits for the heart and for the app behind; then the rest of the timeline follows from it
  const beginDive = () => {
    if (T.dive !== Infinity) return;
    const now = (performance.now() - start) / SLOW;
    T.dive = Math.max(T.drawn + SHINE, now); T.end = T.dive + DIVE; T.vanish = T.end + KEEP; T.gone = T.vanish + VANISH;
    const real = (story) => Math.max(0, story * SLOW - (performance.now() - start));
    // v0.32.8: the welcome comes once 愛してる has faded, so the two never overlap
    at(real(T.gone) + 80, () => onWelcome?.());
    at(real(T.gone) + 1100, () => seal.classList.add('on'));
    at(real(T.gone + HOLD), () => onDone?.());
  };
  Promise.race([ready, new Promise((res) => at(MAX_WAIT, res))]).then(beginDive, beginDive);

  // background: the warm light opens from the corner, then the clouds and light step back with the rest
  layer.classList.add('intro-go');
  at(900, () => layer.classList.add('intro-lit'));
  at(QUIET * SLOW, () => layer.classList.add('intro-quiet'));
  // the app's soft chime when the heart is complete, only if "Sonidos suaves" is on
  if (root.dataset.sound === 'on') at(T.drawn * SLOW, () => util.chime());
  raf = requestAnimationFrame(frame);

  return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); canvas.remove(); deco.remove(); };
}
