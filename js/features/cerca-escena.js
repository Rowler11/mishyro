// "Están cerca" (v0.38.0, Rowler 2026-11-27): the moment that plays over Inicio when they are close, then leaves.
// A paper scroll unrolls on a Japanese evening: sakura branch, hills in mist, a red torii and the two seals (their
// initials) walking along a dotted path to meet at the gate. A ripple runs out, the "a N km" stamp falls while the
// kilometres count down, and the words come up. No card stays behind.
// Pure drawing, no data: colours only through tokens (day/night and the 3 styles); nothing sets an inline style.
let n = 0;
export const DURATION = 7600; // ms the moment lasts (the caller fades it out at the end)
const W = 390; const H = 760;
const E = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => { t = E(t); return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2; };
const out = (t) => 1 - (1 - E(t)) ** 3;
const seg = (t, a, b) => E((t - a) / (b - a));

/** Words for each distance: the title and the line under it. */
export function words(km) {
  const k = Math.round(km).toLocaleString('es-CO');
  if (km < 1) return { title: 'Están juntitos', sub: 'A menos de 1 km uno del otro.' };
  if (km < 3) return { title: 'Están muy cerca', sub: `A unos ${k} km uno del otro.` };
  if (km < 6) return { title: 'Están cerca', sub: `A unos ${k} km uno del otro.` };
  return { title: 'Van en camino', sub: `A unos ${k} km, cada vez más cerca.` };
}

const stampText = (km) => (km < 1 ? '< 1 km' : `a ${Math.round(km)} km`);
const seal = (cls) => `<g class="${cls}"><ellipse cy="26" rx="17" ry="4" fill="var(--ns-ink)" opacity=".16"/><circle r="19" fill="color-mix(in srgb, var(--accent) 16%, var(--paper))" stroke="var(--accent)" stroke-width="2"/><circle r="24" fill="none" stroke="var(--accent)" stroke-width="3" opacity=".3"/><text y="6" text-anchor="middle" class="ns-letter" fill="var(--accent)"></text></g>`;
const pine = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0 l8 -34 l8 34z M10 0 l6 -26 l6 26z M-8 2 l6 -24 l6 24z" fill="var(--ns-ink)" opacity=".26"/>`;

/** The scene as { node, run }. `a` and `b` are the two initials (you on the left). run() plays it from the start
 * and returns a stop() function; the drawing before run() shows the finished picture. */
export function momentScene({ km = 2, a = '', b = '' } = {}) {
  km = Number(km) || 0; // only a number goes into the markup below
  const id = `ns${++n}`;
  const t = document.createElement('template');
  t.innerHTML = `<svg class="near-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${words(km).title}. ${km < 1 ? 'A menos de 1' : `A unos ${Math.round(km)}`} km.">
<defs>
<pattern id="${id}-sg" width="44" height="22" patternUnits="userSpaceOnUse"><g fill="none" stroke="var(--accent)" stroke-width="1.2" opacity=".32"><path d="M0 22 a22 22 0 0 1 44 0"/><path d="M7 22 a15 15 0 0 1 30 0"/><path d="M14 22 a8 8 0 0 1 16 0"/></g></pattern>
<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ns-s1)"/><stop offset=".55" stop-color="var(--ns-s2)"/><stop offset="1" stop-color="var(--ns-s3)"/></linearGradient>
<symbol id="${id}-pt" viewBox="0 0 24 24"><g fill="var(--accent)"><path id="${id}-pp" d="M12 12 C8.5 8 8.5 3 12 1.5 C15.5 3 15.5 8 12 12Z"/><use href="#${id}-pp" transform="rotate(72 12 12)"/><use href="#${id}-pp" transform="rotate(144 12 12)"/><use href="#${id}-pp" transform="rotate(216 12 12)"/><use href="#${id}-pp" transform="rotate(288 12 12)"/></g><circle cx="12" cy="12" r="1.6" fill="var(--gold)"/></symbol>
<clipPath id="${id}-tr"><rect class="ns-trl" x="0" y="440" width="0" height="60"/><rect class="ns-trr" x="${W}" y="440" width="0" height="60"/></clipPath>
</defs>
<rect y="-40" width="${W}" height="${H + 100}" fill="url(#${id}-sky)"/>
<g class="ns-stars" fill="var(--ns-star)" opacity="0">${[[30, 40, 1.2], [80, 120, 1], [140, 70, 1.4], [210, 30, 1], [280, 90, 1.3], [340, 50, 1.1], [60, 200, 1], [330, 180, 1.2], [180, 160, 1], [250, 230, 1], [110, 260, 1.2], [360, 280, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
<g transform="translate(0 -26)">
<g fill="var(--paper)" class="ns-clouds"><path class="ns-cloud-a" d="M20 130 q40 -14 90 -4 q30 -10 60 2 q-40 12 -150 2z" opacity=".55"/><path class="ns-cloud-b" d="M220 190 q40 -12 80 -2 q30 -8 60 2 q-40 10 -140 0z" opacity=".5"/><path class="ns-cloud-c" d="M60 250 q40 -10 90 -2 q30 -8 50 2 q-40 10 -140 0z" opacity=".45"/></g>
<g class="ns-sun"><circle cx="300" cy="360" r="60" fill="var(--ns-sun)" opacity=".12"/><circle cx="300" cy="360" r="40" fill="var(--ns-sun)" opacity=".24"/><circle cx="300" cy="360" r="22" fill="var(--ns-sun)" opacity=".95"/></g>
</g>
<g fill="var(--ns-ink)"><path d="M0 410 L50 366 L96 396 L156 340 L214 392 L276 356 L340 398 L390 372 V520 H0Z" opacity=".08"/><ellipse class="ns-mist-a" cx="100" cy="408" rx="170" ry="15" fill="var(--paper)" opacity=".5"/><ellipse class="ns-mist-b" cx="300" cy="424" rx="160" ry="16" fill="var(--paper)" opacity=".45"/><path d="M0 436 C60 404 120 432 190 414 S320 428 390 410 V520 H0Z" opacity=".14"/></g>
<rect y="450" width="${W}" height="400" fill="color-mix(in srgb, var(--accent) 12%, var(--paper))" opacity=".85"/><rect y="450" width="${W}" height="400" fill="url(#${id}-sg)" opacity=".55"/>
<path d="M0 450 C60 442 110 456 190 448 S320 454 390 446" fill="none" stroke="var(--ns-ink)" stroke-width="1" opacity=".18"/>
${pine(22, 452, 1)}${pine(348, 452, 1.15)}${pine(56, 456, .7)}
<g clip-path="url(#${id}-tr)"><path d="M20 468 Q100 484 168 466 M370 468 Q290 484 222 466" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-dasharray="2 8" stroke-linecap="round" class="ns-trail"/></g>
<g id="${id}-to"><g fill="none" stroke="var(--accent)" stroke-linecap="round"><path d="M148 340 Q195 326 242 340" stroke-width="10"/><path d="M158 360 H232" stroke-width="5.5"/><path d="M166 338 V460 M224 338 V460" stroke-width="8"/></g><path d="M148 337 Q195 323 242 337" fill="none" stroke="var(--ns-ink)" stroke-width="2" opacity=".5" stroke-linecap="round"/></g>
<use href="#${id}-to" transform="translate(0 934) scale(1 -1)" opacity=".16"/>
<g fill="none" stroke="var(--paper)" stroke-linecap="round" opacity=".7"><path d="M150 486 h90 M162 506 h66 M140 528 h110 M156 552 h80 M168 576 h54" stroke-width="2"/></g>
<g fill="none" stroke="var(--ns-ink)" stroke-linecap="round" opacity=".16" stroke-width="1.4"><path d="M24 520 q18 -7 36 0 M290 540 q20 -8 40 0 M60 600 q22 -8 44 0 M270 620 q22 -8 44 0 M110 690 q24 -8 48 0 M230 700 q22 -8 44 0"/></g>
<ellipse cx="195" cy="466" rx="60" ry="6" fill="var(--ns-ink)" opacity=".18"/>
<circle class="ns-r1" cx="195" cy="446" r="10" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0"/><circle class="ns-r2" cx="195" cy="446" r="10" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0"/>
<g class="ns-birds" fill="none" stroke="var(--ns-ink)" stroke-width="1.6" stroke-linecap="round" opacity="0"><path class="ns-bird-a" d="M0 0 q4 -5 8 0 q4 -5 8 0"/><path class="ns-bird-b" d="M0 0 q3 -4 6 0 q3 -4 6 0"/><path class="ns-bird-c" d="M0 0 q3 -4 6 0 q3 -4 6 0"/></g>
${seal('ns-sl')}${seal('ns-st')}
<g class="ns-stamp" opacity="0"><rect x="-48" y="-17" width="96" height="34" rx="3" fill="var(--paper)" stroke="var(--ns-ink)" stroke-width="2"/><rect x="-44" y="-13" width="88" height="26" rx="2" fill="none" stroke="var(--accent)" stroke-width="1"/><text y="7" text-anchor="middle" class="ns-stamp-t" fill="var(--ns-ink)"></text></g>
<g class="ns-petals"></g>
<g class="ns-branch"><path d="M392 -4 C350 20 320 14 270 52 S 210 80 170 74" fill="none" stroke="var(--ns-ink)" stroke-width="5" opacity=".75" stroke-linecap="round"/><path d="M300 30 C 290 56 270 70 250 78" fill="none" stroke="var(--ns-ink)" stroke-width="3" opacity=".6" stroke-linecap="round"/><use href="#${id}-pt" x="318" y="14" width="22" height="22"/><use href="#${id}-pt" x="284" y="36" width="18" height="18"/><use href="#${id}-pt" x="256" y="58" width="20" height="20"/><use href="#${id}-pt" x="228" y="66" width="16" height="16"/><use href="#${id}-pt" x="352" y="2" width="16" height="16"/><use href="#${id}-pt" x="200" y="68" width="14" height="14"/><use href="#${id}-pt" x="270" y="82" width="13" height="13"/></g>
<text class="ns-tt" x="${W / 2}" y="590" text-anchor="middle" opacity="0" fill="var(--ns-ink)"></text><text class="ns-ts" x="${W / 2}" y="622" text-anchor="middle" opacity="0" fill="var(--text-2)"></text>
<rect class="ns-wipe" x="0" y="-40" width="${W}" height="${H + 100}" fill="var(--paper)"/><rect class="ns-roll" x="0" y="-40" width="8" height="${H + 100}" fill="color-mix(in srgb, var(--ns-ink) 55%, var(--paper))" opacity="0"/>
</svg>`;
  const node = t.content.firstElementChild;
  const q = (s) => node.querySelector(s);
  const w = words(km);
  for (const [s, v] of [['.ns-sl .ns-letter', a], ['.ns-st .ns-letter', b], ['.ns-tt', w.title], ['.ns-ts', w.sub]]) q(s).textContent = v;
  const sl = q('.ns-sl'); const st = q('.ns-st'); const stamp = q('.ns-stamp'); const stampT = q('.ns-stamp-t');
  const trl = q('.ns-trl'); const trr = q('.ns-trr'); const wipe = q('.ns-wipe'); const roll = q('.ns-roll');
  const sun = q('.ns-sun'); const stars = q('.ns-stars'); const tt = q('.ns-tt'); const ts = q('.ns-ts'); const birds = q('.ns-birds');
  const r1 = q('.ns-r1'); const r2 = q('.ns-r2'); const petalsG = q('.ns-petals');
  const mistA = q('.ns-mist-a'); const mistB = q('.ns-mist-b');
  const cl = [q('.ns-cloud-a'), q('.ns-cloud-b'), q('.ns-cloud-c')]; const bd = [q('.ns-bird-a'), q('.ns-bird-b'), q('.ns-bird-c')];
  const NS = 'http://www.w3.org/2000/svg';
  const petals = Array.from({ length: 16 }, (_, i) => {
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', `#${id}-pt`); const s = 9 + (i % 4) * 3;
    u.setAttribute('width', String(s)); u.setAttribute('height', String(s)); u.setAttribute('opacity', '0'); petalsG.append(u);
    return { u, s, x0: (i * 61 + 30) % W, y0: (i * 83) % 460, v: 24 + (i % 5) * 7, ph: i * 0.8 };
  });
  const night = () => document.documentElement.dataset.theme === 'night';
  const at = (el, x, y, extra = '') => el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${extra}`);

  const frame = (ms, live) => {
    const T = live ? ms : 99999;
    const unroll = ease(seg(T, 0, 1100));
    wipe.setAttribute('x', (unroll * W).toFixed(1)); roll.setAttribute('x', (unroll * W - 4).toFixed(1)); roll.setAttribute('opacity', unroll > 0 && unroll < 1 ? '1' : '0');
    at(sun, 0, lerp(70, 0, ease(seg(T, 700, 2200))));
    stars.setAttribute('opacity', night() ? (out(seg(T, 900, 2200)) * 0.85).toFixed(2) : '0');
    const walk = ease(seg(T, 1100, 3100));
    const lx = lerp(36, 172, walk); const rx = lerp(354, 218, walk);
    const hop = (side) => (walk > 0 && walk < 1 ? -Math.abs(Math.sin(T / 150 + side)) * 5 : 0);
    const meet = seg(T, 3000, 3600); const pulse = 1 + Math.sin(meet * Math.PI) * 0.18;
    at(sl, lx, lerp(470, 450, walk) + hop(0), ` scale(${pulse.toFixed(3)})`); at(st, rx, lerp(470, 450, walk) + hop(2), ` scale(${pulse.toFixed(3)})`);
    trl.setAttribute('width', Math.max(0, lx).toFixed(1)); trr.setAttribute('x', rx.toFixed(1)); trr.setAttribute('width', Math.max(0, W - rx).toFixed(1));
    for (const [c, s0] of [[r1, 3000], [r2, 3300]]) { const k = seg(T, s0, s0 + 1200); c.setAttribute('r', lerp(26, 84, out(k)).toFixed(1)); c.setAttribute('opacity', (k > 0 && k < 1 ? (1 - k) * 0.7 : 0).toFixed(2)); }
    const drop = out(seg(T, 3300, 3900));
    at(stamp, 195, lerp(290, 408, drop), ` rotate(${lerp(-10, -2, drop).toFixed(1)}) scale(${lerp(1.8, 1, drop).toFixed(3)})`);
    stamp.setAttribute('opacity', E(seg(T, 3300, 3600)).toFixed(2));
    stampT.textContent = stampText(live ? lerp(Math.max(10, Math.ceil(km)), km, ease(seg(T, 3400, 4700))) : km);
    tt.setAttribute('opacity', out(seg(T, 3700, 4500)).toFixed(2)); tt.setAttribute('y', lerp(604, 590, out(seg(T, 3700, 4500))).toFixed(1));
    ts.setAttribute('opacity', out(seg(T, 3900, 4700)).toFixed(2));
    const sec = T / 1000;
    for (const p of petals) {
      const y = 40 + ((p.y0 + sec * p.v) % 480); const x = (p.x0 + Math.sin(sec * 1.2 + p.ph) * 18 + sec * 8) % (W + 30) - 15;
      p.u.setAttribute('x', x.toFixed(1)); p.u.setAttribute('y', y.toFixed(1));
      p.u.setAttribute('opacity', (seg(T, 2600, 3400) * 0.8).toFixed(2));
      p.u.setAttribute('transform', `rotate(${((sec * 60 + p.ph * 50) % 360).toFixed(0)} ${(x + p.s / 2).toFixed(1)} ${(y + p.s / 2).toFixed(1)})`);
    }
    cl.forEach((c, i) => at(c, Math.sin(sec / (2.6 + i)) * (10 + i * 4), 0));
    at(mistA, Math.sin(sec / 2.2) * 16, 0); at(mistB, -Math.sin(sec / 2.8) * 18, 0);
    birds.setAttribute('opacity', (seg(T, 1500, 2100) * (1 - seg(T, 6400, 7000)) * 0.75).toFixed(2));
    bd.forEach((b2, i) => at(b2, lerp(-30 - i * 22, 420, seg(T, 1500 + i * 350, 6800)), 150 + i * 22 + Math.sin(sec * 3 + i) * 4));
  };
  frame(0, false);

  /** Plays the scene once from the start; returns stop(), which leaves the finished picture. */
  const run = () => {
    let raf = 0; const t0 = performance.now();
    const step = (now) => { if (!node.isConnected && now - t0 > 100) return; frame(now - t0, true); raf = requestAnimationFrame(step); };
    frame(0, true); raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); frame(0, false); };
  };
  return { node, run };
}
