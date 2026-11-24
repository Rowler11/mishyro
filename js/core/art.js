// Paper creatures and lilies (v0.13.0, chosen 2026-11-22): original SVG drawings made for Aishiteru,
// no third-party art. Origami style: flat folds, two tones per face. They move only with CSS classes
// (blink, tail, flap, sway), so "reducir movimiento" stops them like every other animation.
let uid = 0;
const NS = 'http://www.w3.org/2000/svg';
function svg(viewBox, body, cls) {
  const t = document.createElementNS(NS, 'svg');
  t.setAttribute('viewBox', viewBox);
  t.setAttribute('class', `art ${cls}`);
  t.setAttribute('aria-hidden', 'true');
  t.setAttribute('focusable', 'false');
  t.innerHTML = body;
  return t;
}

// ---------- Peluches de acuarela (v0.19.0, option B chosen 2026-11-24) ----------
// The six paper friends redrawn as round watercolor plushies: painted fur (soft radial gradients),
// shiny eyes and a few brush hairs. Same groups as before (art-head, art-eyes, art-tail, art-ears,
// art-arm, art-bamboo, art-wing-l/r), so every place that animates or wires them keeps working.
const FUR = {
  fox: { hi: '#FFB27A', base: '#EE8A50', lo: '#C9632F', belly: '#FFFFFF', belly2: '#F3E3D2', ear: '#3E2622', hair: '#B9552A', eye: ['#5A3B2E', '#1E1210'] },
  cat: { hi: '#FFF8EC', base: '#F3E5CF', lo: '#D6BE9C', belly: '#FFFFFF', belly2: '#F6EDE0', ear: '#6B4A3A', point: '#6B4A3A', hair: '#B89A78', eye: ['#9CC7F2', '#3A6FB0'] },
  rabbit: { hi: '#FFFFFF', base: '#F7F1EC', lo: '#DDD0C6', belly: '#FFFFFF', belly2: '#F8F1EC', ear: '#F4AFC0', hair: '#C9B8AC', eye: ['#5A3B2E', '#1E1210'] },
  tanuki: { hi: '#C9AA8C', base: '#A7856A', lo: '#7A5D48', belly: '#F6EBDD', belly2: '#E3D0BA', ear: '#3E2F27', mask: '#3E2F27', hair: '#6A5040', eye: ['#5A3B2E', '#1E1210'] },
  panda: { hi: '#FFFFFF', base: '#F6F3EF', lo: '#DCD6CF', belly: '#FFFFFF', belly2: '#F2EEE9', ear: '#2E2A2B', mask: '#2E2A2B', hair: '#BDB6AE', eye: ['#3A3536', '#0E0B0B'] },
};
const HEAD = 'M100 44c-40 0-62 26-62 54 0 26 26 44 62 44s62-18 62-44c0-28-22-54-62-54z';
const BODY = 'M58 184c-10-40 6-72 42-72s52 32 42 72z';
const mirror = (inner) => `${inner}<g transform="translate(200 0) scale(-1 1)">${inner}</g>`;

function plush(kind) {
  const c = FUR[kind]; const k = `pl${++uid}`;
  const defs = `<defs>
    <radialGradient id="${k}f" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${c.hi}"/><stop offset=".65" stop-color="${c.base}"/><stop offset="1" stop-color="${c.lo}"/></radialGradient>
    <radialGradient id="${k}b" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${c.belly}"/><stop offset="1" stop-color="${c.belly2}"/></radialGradient>
    <radialGradient id="${k}e" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="${c.eye[0]}"/><stop offset="1" stop-color="${c.eye[1]}"/></radialGradient>
    <radialGradient id="${k}s"><stop offset="0" stop-color="#5A3A30" stop-opacity=".22"/><stop offset="1" stop-color="#5A3A30" stop-opacity="0"/></radialGradient>
    <radialGradient id="${k}m" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${c.point || c.mask || c.lo}" stop-opacity=".85"/><stop offset="1" stop-color="${c.point || c.mask || c.lo}" stop-opacity="0"/></radialGradient>
  </defs>`;
  const F = `url(#${k}f)`; const B = `url(#${k}b)`; const E = `url(#${k}e)`;
  const shadow = `<ellipse cx="100" cy="188" rx="64" ry="7" fill="url(#${k}s)"/>`;
  // tails and things behind the body
  const back = {
    fox: `<g class="art-tail"><path d="M134 170c34 6 54-22 44-52-4 18-20 30-38 30" fill="${F}"/><path d="M168 130c8-8 10-12 10-12 4 14 0 26-8 34-4-8-4-16-2-22z" fill="${B}"/></g>`,
    cat: `<g class="art-tail"><path d="M136 176c34 2 44-30 30-50" fill="none" stroke="${c.point}" stroke-width="12" stroke-linecap="round"/><path d="M164 132c-2-4-4-6-6-7" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/></g>`,
    rabbit: `<g class="art-tail"><circle cx="142" cy="170" r="14" fill="${B}"/><circle cx="138" cy="166" r="5" fill="#fff" opacity=".8"/></g>`,
    tanuki: `<g class="art-tail"><path d="M130 176c30 10 52-6 50-34-2-10-12-14-20-8-10 8-18 22-30 26z" fill="${F}"/><path d="M160 136c6-4 14-2 18 4l-4 10c-4-6-10-8-16-6zM146 158c8-4 18-4 26 0l-6 10c-6-3-14-3-20-2z" fill="${c.mask}" opacity=".85"/></g>`,
    panda: `<g class="art-bamboo"><rect x="160" y="86" width="9" height="98" rx="4" fill="#8DBF6A"/><rect x="158" y="112" width="13" height="3" rx="1.5" fill="#6E9F4E"/><rect x="158" y="146" width="13" height="3" rx="1.5" fill="#6E9F4E"/><path d="M168 96c10-10 22-12 30-10-8 8-18 12-30 10z" fill="#A6D184"/><path d="M162 120c-10-6-14-14-14-22 8 4 12 12 14 22z" fill="#93C46F"/></g>`,
  }[kind];
  // ears (drawn before the head, so the head covers their base)
  const ears = {
    fox: mirror(`<path d="M52 70C40 46 42 24 50 14c14 6 28 22 34 40z" fill="${F}"/><path d="M56 58c-6-14-6-26-2-32 8 6 16 16 20 28z" fill="${c.ear}"/>`),
    cat: mirror(`<path d="M50 72C42 54 42 38 46 26c12 4 26 14 38 28z" fill="${F}"/><path d="M54 62c-5-11-5-20-3-27 7 4 15 10 21 18z" fill="${c.point}"/>`),
    rabbit: `<g class="art-ears">${mirror(`<ellipse cx="78" cy="30" rx="13" ry="38" transform="rotate(-12 78 30)" fill="${F}"/><ellipse cx="78" cy="32" rx="6" ry="28" transform="rotate(-12 78 32)" fill="${c.ear}" opacity=".85"/>`)}</g>`,
    tanuki: mirror(`<circle cx="56" cy="56" r="17" fill="${c.mask}"/><circle cx="57" cy="57" r="8" fill="${c.hi}" opacity=".7"/>`),
    panda: mirror(`<circle cx="54" cy="52" r="20" fill="${c.ear}"/><circle cx="50" cy="47" r="6" fill="#fff" opacity=".12"/>`),
  }[kind];
  // the lighter lower face
  const muzzle = kind === 'fox'
    ? `<path d="M100 142c-30 0-52-12-58-32 14 6 30 4 40-6 6 10 12 14 18 14s12-4 18-14c10 10 26 12 40 6-6 20-28 32-58 32z" fill="${B}"/>`
    : `<ellipse cx="100" cy="120" rx="30" ry="20" fill="${B}"/>`;
  const marks = {
    fox: '', rabbit: '',
    cat: `<ellipse cx="100" cy="112" rx="30" ry="24" fill="url(#${k}m)"/>`,
    tanuki: `<path d="M48 92c10-12 30-14 44-4 4 4 4 10 0 14-14 8-34 8-44 0-4-3-4-7 0-10zM152 92c-10-12-30-14-44-4-4 4-4 10 0 14 14 8 34 8 44 0 4-3 4-7 0-10z" fill="${c.mask}" opacity=".9"/>`,
    panda: mirror(`<ellipse cx="76" cy="98" rx="15" ry="19" transform="rotate(28 76 98)" fill="${c.mask}"/>`),
  }[kind];
  const eye = (x) => (kind === 'panda'
    ? `<circle cx="${x}" cy="96" r="7.5" fill="#FBF8F4"/><circle cx="${x + 1}" cy="96.5" r="5.5" fill="${E}"/><circle cx="${x + 3}" cy="94" r="2.2" fill="#fff"/>`
    : `<ellipse cx="${x}" cy="96" rx="9" ry="11" fill="${E}"/>${kind === 'cat' ? `<ellipse cx="${x}" cy="97" rx="3" ry="8" fill="#1E2A3A"/>` : ''}<circle cx="${x + 3}" cy="91" r="3.6" fill="#fff"/><circle cx="${x - 3}" cy="100" r="1.6" fill="#fff" opacity=".8"/>`);
  const nose = { fox: '#3A1F18', cat: '#C77C84', rabbit: '#E9849C', tanuki: '#2A1E1A', panda: '#2E2A2B' }[kind];
  const face = `<g class="art-eyes">${eye(78)}${eye(122)}</g>
    <path d="M94 113c0-3 12-3 12 0 0 4-6 7-6 7s-6-3-6-7z" fill="${nose}"/>
    <path d="M100 120c-2 5-8 6-10 3M100 120c2 5 8 6 10 3" stroke="#5A3328" stroke-opacity=".75" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${kind === 'rabbit' ? '<path d="M96 125h8v5c0 2-8 2-8 0z" fill="#fff" stroke="#D9CBC0" stroke-width=".8"/>' : ''}
    <ellipse cx="62" cy="114" rx="10" ry="6" fill="#F7A0B5" opacity=".55"/><ellipse cx="138" cy="114" rx="10" ry="6" fill="#F7A0B5" opacity=".55"/>
    ${kind === 'cat' || kind === 'tanuki' ? `<g stroke="${kind === 'cat' ? '#8C7464' : '#4A3A30'}" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"><path d="M70 118l-22-4M70 123l-21 3M130 118l22-4M130 123l21 3"/></g>` : ''}`;
  const hairs = `<g stroke="${c.hair}" stroke-width="1.4" stroke-linecap="round" opacity=".55" fill="none"><path d="M44 84l-6-2M42 92l-7 1M156 84l6-2M158 92l7 1M90 48l-2-6M100 46v-6M110 48l2-6"/></g>`;
  const shine = '<path d="M70 60c10-10 22-14 30-14" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" fill="none"/>';
  const paws = kind === 'panda' || kind === 'tanuki'
    ? `<ellipse cx="74" cy="182" rx="16" ry="10" fill="${c.mask}"/><ellipse cx="126" cy="182" rx="16" ry="10" fill="${c.mask}"/>`
    : `<ellipse cx="74" cy="182" rx="15" ry="9" fill="${kind === 'cat' ? c.point : c.lo}"/><ellipse cx="126" cy="182" rx="15" ry="9" fill="${kind === 'cat' ? c.point : c.lo}"/>`;
  const arms = kind === 'panda'
    ? `<g class="art-arm"><ellipse cx="66" cy="148" rx="13" ry="22" transform="rotate(24 66 148)" fill="${c.mask}"/></g><ellipse cx="134" cy="148" rx="13" ry="22" transform="rotate(-24 134 148)" fill="${c.mask}"/>`
    : '';
  const body = `<path d="${BODY}" fill="${F}"/><path d="M78 184c-4-26 6-48 22-48s26 22 22 48z" fill="${B}"/>${arms}${paws}`;
  return svg('0 0 200 200', `${defs}${shadow}${back}${body}<g class="art-head">${ears}<path d="${HEAD}" fill="${F}"/>${marks}${muzzle}${hairs}${face}${shine}</g>`, `creature plush ${kind}`);
}

/** Hana, the crane: a round watercolor bird; `color` tints her wings (the scenes use several). */
function craneArt(color) {
  const k = `cr${++uid}`;
  return svg('0 0 210 150', `<defs>
    <radialGradient id="${k}b" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EDE6E3"/></radialGradient>
    <linearGradient id="${k}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <g class="art-wing-l"><path d="M94 86C78 54 52 32 20 24c8 22 22 44 44 62z" fill="url(#${k}w)" opacity=".85"/><path d="M30 28c14 18 30 34 48 48" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/></g>
    <path d="M58 104c-14 4-26 2-36-6 12-2 22-6 30-12z" fill="#2E2A2B"/>
    <g stroke="#9A8A82" stroke-width="2.4" stroke-linecap="round"><path d="M98 124l-4 22M112 124l4 22"/></g>
    <ellipse cx="104" cy="98" rx="50" ry="32" fill="url(#${k}b)"/>
    <path d="M140 86c10-14 14-30 14-44" stroke="#FBF8F6" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="M150 56c2-6 4-10 4-14" stroke="#2E2A2B" stroke-width="13" stroke-linecap="round" fill="none"/>
    <circle cx="158" cy="36" r="15" fill="url(#${k}b)"/><ellipse cx="157" cy="24" rx="7" ry="4" fill="#D9384E"/>
    <path d="M171 36l24 4-24 4z" fill="#D8B26A"/>
    <g class="art-eyes"><circle cx="162" cy="35" r="3.4" fill="#1E1210"/><circle cx="163.3" cy="33.6" r="1.2" fill="#fff"/></g>
    <ellipse cx="156" cy="42" rx="4.5" ry="2.6" fill="#F7A0B5" opacity=".6"/>
    <g class="art-wing-r"><path d="M100 88c-2-32 8-60 30-80 10 28 6 58-12 82z" fill="url(#${k}w)"/><path d="M108 84c2-22 8-44 20-64" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/></g>`, 'creature plush crane');
}

const DRAW = {
  fox: () => plush('fox'),
  cat: () => plush('cat'),
  rabbit: () => plush('rabbit'),
  tanuki: () => plush('tanuki'),
  panda: () => plush('panda'),
  crane: (color = '#F3B7C5') => craneArt(color),
  lily: () => {
    const id = `lily${++uid}`;
    return svg('0 0 100 100', `
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E0587E"/><stop offset=".45" stop-color="#F4A3BB"/><stop offset="1" stop-color="#FFF6F8"/></linearGradient></defs>
    ${[30, 90, 150, 210, 270, 330].map((a) => `<path transform="rotate(${a} 50 50)" d="M50 50 C40 40 42 18 50 4 C58 18 60 40 50 50Z" fill="#FBE3EA"/>`).join('')}
    ${[0, 60, 120, 180, 240, 300].map((a) => `<g transform="rotate(${a} 50 50)"><path d="M50 50 C38 38 41 14 50 1 C59 14 62 38 50 50Z" fill="url(#${id})"/><path d="M50 46 L50 8" stroke="#E5708F" stroke-width=".8" opacity=".7"/><circle cx="47" cy="26" r=".9" fill="#B03A5B"/><circle cx="53" cy="30" r=".9" fill="#B03A5B"/><circle cx="48" cy="34" r=".8" fill="#B03A5B"/></g>`).join('')}
    ${[10, 70, 130, 190, 250, 310].map((a) => `<g transform="rotate(${a} 50 50)"><path d="M50 50 L50 30" stroke="#B8D08A" stroke-width="1"/><ellipse cx="50" cy="29" rx="1.6" ry="3" fill="#B5562E"/></g>`).join('')}
    <circle cx="50" cy="50" r="3" fill="#C9E09A"/>`, 'lily');
  },
  dice: () => svg('0 0 60 60', `<polygon points="30,4 54,16 30,28 6,16" fill="#fff"/><polygon points="6,16 30,28 30,56 6,44" fill="#F3D9DF"/><polygon points="54,16 30,28 30,56 54,44" fill="#E8C1CB"/><circle cx="30" cy="16" r="3" fill="#C2405F"/><circle cx="14" cy="30" r="2.4" fill="#C2405F"/><circle cx="22" cy="42" r="2.4" fill="#C2405F"/><circle cx="42" cy="28" r="2.4" fill="#C2405F"/><circle cx="46" cy="38" r="2.4" fill="#C2405F"/><circle cx="38" cy="46" r="2.4" fill="#C2405F"/>`, 'dice'),
  shuriken: () => svg('0 0 64 64', '<g class="sk-spin"><path class="sk-body" d="M32 3 L39.5 24.5 L61 32 L39.5 39.5 L32 61 L24.5 39.5 L3 32 L24.5 24.5Z"/><path class="sk-fold" d="M32 3 L39.5 24.5 L32 32Z M61 32 L39.5 39.5 L32 32Z M32 61 L24.5 39.5 L32 32Z M3 32 L24.5 24.5 L32 32Z"/><circle class="sk-hole" cx="32" cy="32" r="12.5"/></g>', 'shuriken'),
};
export const draw = (name, ...args) => (DRAW[name] ? DRAW[name](...args) : null);
export const names = Object.keys(DRAW);

/** A wrapped bouquet of three lilies (loading screen, chosen 2026-11-22). */
export function bouquet() {
  const box = document.createElement('div');
  box.className = 'bouquet';
  box.setAttribute('aria-hidden', 'true');
  box.append(svg('0 0 200 240', `
    <g class="bq-stems" stroke="#6E9A57" stroke-width="3" fill="none" stroke-linecap="round"><path d="M100 230 C98 170 70 120 56 84"/><path d="M100 230 C100 160 104 110 104 62"/><path d="M100 230 C104 170 130 120 148 88"/></g>
    <g class="bq-leaves" fill="#8DB86E"><path d="M98 190 C70 170 52 160 30 166 C52 150 80 156 98 176Z"/><path d="M102 186 C130 164 150 156 172 160 C150 146 122 154 102 172Z"/><path d="M100 170 C92 140 80 128 70 120 C88 124 100 140 104 160Z"/></g>
    <path d="M54 166 L100 178 L146 166 L124 238 L76 238Z" fill="#F6EBDD"/><path d="M54 166 L100 178 L100 238 L76 238Z" fill="#EAD9C3"/>
    <path d="M78 196 C90 204 110 204 122 196" stroke="#C2405F" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M100 200 C92 214 86 218 80 226 M100 200 C108 214 114 218 120 226" stroke="#C2405F" stroke-width="3" fill="none" stroke-linecap="round"/>`, 'bq-base'));
  for (const k of ['a', 'b', 'c']) { const s = document.createElement('span'); s.className = `bq-lily bq-${k}`; s.append(DRAW.lily()); box.append(s); }
  return box;
}
