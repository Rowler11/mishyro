// Opening heart (decided 2026-11-19): on the first open of each day, "te amo" in many languages
// draws a heart while the app loads; once it is ready the camera dives into the heart and the
// usual welcome ("Para …", 愛してる) appears. Drawn on a canvas, decorative only (aria-hidden).

const WORDS = ['Te amo', 'I love you', "Je t'aime", 'Ti amo', 'Ich liebe dich', 'Ik hou van jou', 'Jag älskar dig', 'Jeg elsker deg', 'Kocham cię',
  'Seni seviyorum', 'Я тебя люблю', '사랑해', 'Σ\'αγαπώ', 'Aku cinta kamu', 'Anh yêu em', 'Mahal kita', 'Te iubesc', 'Volim te', 'Szeretlek',
  'Rakastan sinua', "T'estimo", 'Maite zaitut', 'Eu te amo', 'Mi amas vin'];

// Timeline in ms: outline, fill, the dive into the heart, and how long the welcome stays.
const EDGE = 900;
const FILL = 1100;
const POP = 380;
const DIVE = 750;
const HOLD = 1300;
const MAX_WAIT = 8000; // if loading takes longer, dive anyway

function heartOutline() {
  const pts = [];
  for (let i = 0; i < 400; i++) {
    const t = (i / 400) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3 / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + 0.08]);
  }
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

/** Lays the words out on a heart centered at (cx, cy) of size S. */
function layout(ctx, { W, cx, cy, S, colors, family }) {
  const poly = heartOutline().map(([x, y]) => [cx + x * S, cy + y * S]);
  const inner = poly.map(([x, y]) => [cx + (x - cx) * 0.86, cy + (y - cy) * 0.86]);
  const base = Math.max(8, Math.min(13, W / 40));
  const font = (size, bold) => `${bold ? 700 : 500} ${size}px ${family}`;
  const boxes = [];
  const words = [];
  const fits = (b) => !boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  // 1) the outline, in drawing order
  let acc = 0; let last = null; let k = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i];
    if (last) acc += Math.hypot(x - last[0], y - last[1]);
    last = [x, y];
    if (i && acc < base * 1.3) continue;
    acc = 0;
    const text = WORDS[k++ % WORDS.length]; const size = base * (0.85 + Math.random() * 0.2);
    ctx.font = font(size, true);
    const w = ctx.measureText(text).width;
    const b = { w: w * 0.55, h: size * 0.8 }; b.x = x - b.w / 2; b.y = y - b.h / 2;
    if (!fits(b)) continue;
    boxes.push(b); words.push({ text, x, y, font: font(size, true), edge: true });
  }
  const edgeCount = words.length;
  // 2) smaller words inside
  for (let tries = 0; tries < 5000 && words.length < edgeCount + 300; tries++) {
    const x = cx - S + Math.random() * 2 * S; const y = cy - S + Math.random() * 2 * S;
    const text = WORDS[Math.floor(Math.random() * WORDS.length)]; const size = base * (0.55 + Math.random() * 0.4);
    ctx.font = font(size, false);
    const w = ctx.measureText(text).width;
    const b = { x: x - w / 2 - 1, y: y - size / 2 - 1, w: w + 2, h: size + 2 };
    if (![[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].every(([px, py]) => inside(inner, px, py)) || !fits(b)) continue;
    boxes.push(b); words.push({ text, x, y, font: font(size, false), edge: false });
  }
  // the fill rises from the tip like ink
  const fill = words.slice(edgeCount).sort((a, b) => b.y - a.y + (Math.random() - 0.5) * 30);
  words.slice(0, edgeCount).forEach((w, i) => { w.at = (i / edgeCount) * EDGE; });
  fill.forEach((w, i) => { w.at = EDGE + (i / fill.length) * FILL; });
  words.forEach((w) => { w.color = w.edge ? colors[0] : colors[Math.floor(Math.random() * colors.length)]; });
  return words;
}

const ease = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * Plays the heart inside `layer` (the splash). `ready` resolves when the app behind is drawn.
 * Calls onWelcome() when the usual welcome should show and onDone() at the end. Returns stop().
 */
export function playIntro(layer, { ready = Promise.resolve(), onWelcome, onDone }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'splash-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  layer.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const style = getComputedStyle(document.documentElement);
  const tok = (v) => style.getPropertyValue(v).trim();
  const colors = [tok('--accent'), tok('--accent'), tok('--accent-2'), tok('--gold')];
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const r = layer.getBoundingClientRect();
  const W = r.width; const H = r.height;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  const S = Math.min(W * 0.42, H * 0.3); const cx = W / 2; const cy = H * 0.45;
  const words = layout(ctx, { W, cx, cy, S, colors, family });

  let raf = 0;
  let diveAt = Infinity;
  const timers = [];
  const start = performance.now();
  const drawn = EDGE + FILL + POP;
  const beginDive = () => {
    if (diveAt !== Infinity) return;
    diveAt = Math.max(performance.now(), start + drawn);
    const wait = diveAt - performance.now();
    timers.push(setTimeout(() => onWelcome?.(), wait + DIVE * 0.45));
    timers.push(setTimeout(() => onDone?.(), wait + DIVE + HOLD));
  };
  Promise.race([ready, new Promise((res) => timers.push(setTimeout(res, MAX_WAIT)))]).then(beginDive, beginDive);

  const frame = (now) => {
    const t = now - start;
    const d = Math.max(0, Math.min(1, (now - diveAt) / DIVE));
    const z = 1 + 9 * ease(d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // the dive: zoom toward the heart's center while the words fade past the camera
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cx - cx * z), dpr * (cy - cy * z));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fade = 1 - Math.max(0, (d - 0.35) / 0.65);
    for (const w of words) {
      const p = Math.max(0, Math.min(1, (t - w.at) / POP));
      if (p <= 0) continue;
      const s = 0.6 + 0.4 * (1 - (1 - p) ** 3);
      ctx.globalAlpha = p * (w.edge ? 1 : 0.88) * fade; ctx.fillStyle = w.color; ctx.font = w.font;
      ctx.save(); ctx.translate(w.x, w.y); ctx.scale(s, s); ctx.fillText(w.text, 0, 0); ctx.restore();
    }
    // still loading after the heart is complete: a word gently brightens now and then
    if (diveAt === Infinity && t > drawn && words.length) {
      const pick = words[Math.floor(now / 140) % words.length];
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 200); ctx.fillStyle = colors[3]; ctx.font = pick.font;
      ctx.fillText(pick.text, pick.x, pick.y);
    }
    ctx.globalAlpha = 1;
    if (d < 1) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);

  return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); canvas.remove(); };
}
