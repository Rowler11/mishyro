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
const cheeks = (y) => `<ellipse cx="40" cy="${y}" rx="5" ry="3" fill="#F4A6B6" opacity=".7"/><ellipse cx="80" cy="${y}" rx="5" ry="3" fill="#F4A6B6" opacity=".7"/>`;

const DRAW = {
  fox: () => svg('0 0 120 120', `
    <g class="art-tail"><polygon points="86,108 114,74 102,112" fill="#E58B5B"/><polygon points="108,82 114,74 105,95" fill="#FFF4EA"/></g>
    <polygon points="30,112 60,58 90,112" fill="#E58B5B"/><polygon points="60,58 90,112 60,112" fill="#CF7448"/><polygon points="48,112 60,80 72,112" fill="#FFF4EA"/>
    <g class="art-head"><polygon points="30,16 50,42 28,50" fill="#E58B5B"/><polygon points="34,25 45,40 32,45" fill="#3B2A2A"/>
    <polygon points="90,16 70,42 92,50" fill="#CF7448"/><polygon points="86,25 75,40 88,45" fill="#3B2A2A"/>
    <polygon points="26,44 94,44 60,84" fill="#F09A68"/><polygon points="60,44 94,44 60,84" fill="#DE8456"/>
    <polygon points="26,44 46,60 60,84" fill="#FFF4EA"/><polygon points="94,44 74,60 60,84" fill="#F2E2D4"/>
    <g class="art-eyes"><ellipse cx="47" cy="57" rx="3" ry="3.6" fill="#3B2A2A"/><ellipse cx="73" cy="57" rx="3" ry="3.6" fill="#3B2A2A"/></g>
    <polygon points="56,77 64,77 60,83" fill="#3B2A2A"/>${cheeks(66)}</g>`, 'creature fox'),
  cat: () => svg('0 0 120 120', `
    <g class="art-tail"><path d="M88 106 C110 104 112 80 100 70" stroke="#7A5642" stroke-width="7" fill="none" stroke-linecap="round"/></g>
    <polygon points="32,112 60,62 88,112" fill="#F1E2CC"/><polygon points="60,62 88,112 60,112" fill="#E2CDB0"/>
    <g class="art-head"><polygon points="30,20 52,40 28,52" fill="#7A5642"/><polygon points="90,20 68,40 92,52" fill="#5E402F"/>
    <polygon points="26,46 60,34 94,46 82,80 60,88 38,80" fill="#F4E8D6"/><polygon points="60,34 94,46 82,80 60,88" fill="#E7D6BD"/>
    <polygon points="46,66 60,60 74,66 66,84 54,84" fill="#8A6550"/>
    <g class="art-eyes"><ellipse cx="46" cy="56" rx="4.2" ry="4.6" fill="#5B8FD6"/><ellipse cx="74" cy="56" rx="4.2" ry="4.6" fill="#5B8FD6"/>
    <ellipse cx="46" cy="56" rx="1.4" ry="3.6" fill="#1F1A1A"/><ellipse cx="74" cy="56" rx="1.4" ry="3.6" fill="#1F1A1A"/></g>
    <polygon points="57,70 63,70 60,74" fill="#3B2A2A"/></g>`, 'creature cat'),
  rabbit: () => svg('0 0 120 120', `
    <g class="art-ears"><polygon points="44,8 54,46 38,46" fill="#F7F2EE"/><polygon points="45,16 51,42 42,42" fill="#F4B6C2"/>
    <polygon points="76,8 66,46 82,46" fill="#E9E1DA"/><polygon points="75,16 69,42 78,42" fill="#EBA3B3"/></g>
    <polygon points="30,112 60,66 90,112" fill="#F7F2EE"/><polygon points="60,66 90,112 60,112" fill="#E9E1DA"/>
    <g class="art-head"><polygon points="32,58 60,40 88,58 78,84 42,84" fill="#FBF7F3"/><polygon points="60,40 88,58 78,84 60,84" fill="#ECE4DD"/>
    <g class="art-eyes"><ellipse cx="48" cy="62" rx="3" ry="3.4" fill="#3B2A2A"/><ellipse cx="72" cy="62" rx="3" ry="3.4" fill="#3B2A2A"/></g>
    <polygon points="57,70 63,70 60,74" fill="#E07A93"/>${cheeks(72).replace(/cx="40"/, 'cx="42"').replace(/cx="80"/, 'cx="78"')}</g>`, 'creature rabbit'),
  tanuki: () => svg('0 0 120 120', `
    <g class="art-tail"><polygon points="84,106 110,90 104,114" fill="#8A6A52"/><polygon points="100,94 110,90 106,100" fill="#4A3A30"/></g>
    <polygon points="30,112 60,60 90,112" fill="#A7856A"/><polygon points="60,60 90,112 60,112" fill="#8F7058"/><polygon points="46,112 60,86 74,112" fill="#E9D8C4"/>
    <g class="art-head"><polygon points="32,22 50,40 30,48" fill="#8F7058"/><polygon points="88,22 70,40 90,48" fill="#7A5D48"/>
    <polygon points="26,46 60,36 94,46 84,78 60,86 36,78" fill="#B8977A"/><polygon points="60,36 94,46 84,78 60,86" fill="#A3836A"/>
    <polygon points="32,52 52,50 54,66 38,68" fill="#4A3A30"/><polygon points="88,52 68,50 66,66 82,68" fill="#4A3A30"/>
    <polygon points="48,70 60,66 72,70 60,84" fill="#F2E6D8"/>
    <g class="art-eyes"><circle cx="45" cy="59" r="2.6" fill="#FFF"/><circle cx="75" cy="59" r="2.6" fill="#FFF"/></g>
    <polygon points="57,72 63,72 60,76" fill="#2A1E1A"/></g>`, 'creature tanuki'),
  crane: (color = '#F3B7C5') => svg('0 0 140 100', `
    <g class="art-wing-l"><polygon points="70,56 22,8 56,60" fill="${color}"/><polygon points="70,56 40,26 56,60" fill="#fff" opacity=".35"/></g>
    <g class="art-wing-r"><polygon points="70,56 122,6 86,60" fill="#E58FA6"/></g>
    <polygon points="38,62 70,50 102,62 70,74" fill="#F7CBD6"/><polygon points="38,62 102,62 70,74" fill="#E7A2B5"/>
    <polygon points="44,62 52,62 18,28" fill="#F7CBD6"/><polygon points="18,28 8,34 21,33" fill="#E7A2B5"/>
    <polygon points="94,62 102,62 132,32" fill="#E7A2B5"/>`, 'creature crane'),
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
