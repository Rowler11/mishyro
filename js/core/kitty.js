// Gatitos de acuarela (v0.16.0, option A chosen 2026-11-24): an original SVG drawing for each real pet
// of Mascotas, painted with the coat the couple picks (siamés, negro, atigrado…). Watercolor look without
// filters (cheap on phones): soft gradients, pigment pooling on the edges and a light wash on top.
// Parts move only with CSS classes (tail, blink, ears, breathing, petted, eating, playing), so
// "reducir movimiento" stops them like every other animation. No third-party art.
const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

// Coat palettes: base, shade (shadows and pigment edge), belly, eyes, nose and the pattern.
export const COATS = [
  { id: 'siames', label: 'Siamés', base: '#F3E7D6', shade: '#D9C3A5', belly: '#FBF5EC', point: '#5E4334', eye: '#6EA4E2', nose: '#7A5A4C', pattern: 'points' },
  { id: 'negro', label: 'Negro', base: '#3A3433', shade: '#211D1D', belly: '#463F3E', eye: '#E6C35A', nose: '#5E4E4E', pattern: 'solid' },
  { id: 'blanco', label: 'Blanco', base: '#FCFAF6', shade: '#E2D9CF', belly: '#FFFFFF', eye: '#86C0E8', nose: '#F0A3B1', pattern: 'solid' },
  { id: 'gris', label: 'Gris', base: '#A4A9B2', shade: '#7E848E', belly: '#C3C7CE', eye: '#E2B54C', nose: '#8C7F86', pattern: 'solid' },
  { id: 'naranja', label: 'Naranja', base: '#F0A562', shade: '#D4834A', belly: '#FBE6D0', stripe: '#C06A33', eye: '#9DBB58', nose: '#D9827A', pattern: 'tabby' },
  { id: 'atigrado', label: 'Atigrado', base: '#B9A086', shade: '#987E66', belly: '#EFE3D4', stripe: '#5B4839', eye: '#A6B94E', nose: '#B07A6E', pattern: 'tabby' },
  { id: 'calico', label: 'Calicó', base: '#FBF7F1', shade: '#E1D6C8', belly: '#FFFFFF', patchA: '#E59A57', patchB: '#3B3431', eye: '#D9A641', nose: '#F0A3B1', pattern: 'calico' },
  { id: 'carey', label: 'Carey', base: '#3E312C', shade: '#241C19', belly: '#4A3A33', patchA: '#C8773D', patchB: '#9A5A2E', eye: '#D9A641', nose: '#6B4E44', pattern: 'calico' },
  { id: 'bicolor', label: 'Blanco y negro', base: '#302C2C', shade: '#1C1919', belly: '#FBF8F4', eye: '#9CC15A', nose: '#E79AAA', pattern: 'tuxedo' },
  { id: 'crema', label: 'Crema', base: '#F1D8B4', shade: '#D8BA90', belly: '#FAEBD6', stripe: '#D2A877', eye: '#D9A641', nose: '#D98C82', pattern: 'tabby' },
];
// Collar with a little suzu bell, the Japanese touch (each pet its own color).
export const COLLARS = [
  { id: 'rojo', label: 'Rojo', value: '#C8384E' }, { id: 'azul', label: 'Azul', value: '#3F6FB5' },
  { id: 'rosa', label: 'Rosa', value: '#E58FAE' }, { id: 'verde', label: 'Verde', value: '#4E9A6B' },
  { id: 'morado', label: 'Morado', value: '#7D5BA6' }, { id: 'ninguno', label: 'Sin collar', value: '' },
];
const coatOf = (id) => COATS.find((c) => c.id === id) || COATS[5];

/** Best guess of the coat from what they already wrote (breed, color), so old profiles look right. */
export function guessCoat(pet = {}) {
  const t = `${pet.breed || ''} ${pet.color || ''}`.toLowerCase();
  const rules = [[/siam|point|himala|ragdoll|birman/, 'siames'], [/calic|tricol|^(?=.*blanc)(?=.*negr)(?=.*naranj)/, 'calico'], [/carey|tortu|concha/, 'carey'],
    [/blanc.*negr|negr.*blanc|bicolor|esmoquin|tuxedo|vaquit/, 'bicolor'], [/naranj|amarill|rubi|pelirr|anaranj/, 'naranja'],
    [/crema|beige|dorad/, 'crema'], [/atigr|rayad|tabby|marr[oó]n|caf[eé]/, 'atigrado'], [/negr/, 'negro'], [/blanc/, 'blanco'], [/gris|azul|plat/, 'gris']];
  return rules.find(([re]) => re.test(t))?.[1] || 'atigrado';
}
export const coatId = (pet) => (COATS.some((c) => c.id === pet?.coat) ? pet.coat : guessCoat(pet));
export const collarOf = (pet, index = 0) => COLLARS.find((c) => c.id === pet?.collar) || COLLARS[index % 5];

const EARS = {
  // Pointy cat ears, floppy dog ears or round ears for any other friend.
  gato: (c, p, i) => `<g class="k-ear k-ear-l"><path d="M35 38 L33 11 L55 27 Z" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2" stroke-linejoin="round"/><path d="M38 33 L37 17 L50 27 Z" fill="#F2B0BC" opacity=".75"/></g>
    <g class="k-ear k-ear-r"><path d="M85 38 L87 11 L65 27 Z" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2" stroke-linejoin="round"/><path d="M82 33 L83 17 L70 27 Z" fill="#F2B0BC" opacity=".75"/></g>`,
  perro: (c, p) => `<g class="k-ear k-ear-l"><path d="M38 28 C24 26 18 44 24 60 C30 62 36 52 40 40 Z" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2"/></g>
    <g class="k-ear k-ear-r"><path d="M82 28 C96 26 102 44 96 60 C90 62 84 52 80 40 Z" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2"/></g>`,
  otro: (c, p) => `<g class="k-ear k-ear-l"><circle cx="38" cy="26" r="9" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2"/><circle cx="38" cy="26" r="4.5" fill="#F2B0BC" opacity=".7"/></g>
    <g class="k-ear k-ear-r"><circle cx="82" cy="26" r="9" fill="${p.ear}" stroke="${c.shade}" stroke-opacity=".45" stroke-width="2.2"/><circle cx="82" cy="26" r="4.5" fill="#F2B0BC" opacity=".7"/></g>`,
};

function pattern(c, id) {
  if (c.pattern === 'tabby') {
    const s = `stroke="${c.stripe}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"`;
    return {
      head: `<path d="M60 26 V33 M53 27 Q54 31 55 34 M67 27 Q66 31 65 34" ${s}/><path d="M33 47 L41 48 M33 52 L41 51 M87 47 L79 48 M87 52 L79 51" ${s}/>`,
      body: `<path d="M41 80 Q46 82 47 88 M39 90 Q44 92 45 98 M79 80 Q74 82 73 88 M81 90 Q76 92 75 98" ${s}/>`,
      tail: `<path d="M95 90 L101 88 M98 81 L104 80" ${s}/>`,
    };
  }
  if (c.pattern === 'calico') {
    return {
      head: `<path d="M34 44 C33 32 42 25 52 26 C50 34 44 42 34 44 Z" fill="${c.patchA}" opacity=".9"/><path d="M70 25 C80 25 87 32 87 42 C80 40 72 34 70 25 Z" fill="${c.patchB}" opacity=".85"/>`,
      body: `<path d="M42 70 C50 66 56 74 52 84 C46 88 38 84 42 70 Z" fill="${c.patchB}" opacity=".85"/><path d="M70 86 C78 82 84 90 82 100 C76 104 68 98 70 86 Z" fill="${c.patchA}" opacity=".9"/>`,
      tail: `<path d="M94 86 C100 82 106 84 104 92 C100 94 96 92 94 86 Z" fill="${c.patchA}" opacity=".9"/>`,
    };
  }
  if (c.pattern === 'tuxedo') {
    return {
      head: `<path d="M60 33 C56 42 50 50 47 58 C52 66 68 66 73 58 C70 50 64 42 60 33 Z" fill="${c.belly}" opacity=".96"/>`,
      body: '', tail: '',
    };
  }
  if (c.pattern === 'points') {
    return {
      head: `<ellipse cx="60" cy="53" rx="17" ry="14" fill="url(#k-mask-${id})"/>`,
      body: '', tail: '',
    };
  }
  return { head: '', body: '', tail: '' };
}

/**
 * The drawing for a pet record ({ species, coat, collar, breed, color }). `index` picks a default collar
 * color so two pets never look the same. Returns an <svg class="kitty-art"> (decorative, aria-hidden).
 */
export function kittyArt(pet = {}, { index = 0, size } = {}) {
  const id = `k${++uid}`;
  const c = coatOf(coatId(pet));
  const species = /perr|dog/i.test(pet.species || '') ? 'perro' : /gat|cat/i.test(pet.species || 'gato') ? 'gato' : 'otro';
  const points = c.pattern === 'points';
  const p = { ear: points ? c.point : c.base, paw: points ? c.point : c.pattern === 'tuxedo' ? c.belly : c.base, tail: points ? c.point : c.base };
  const pat = pattern(c, id);
  const collar = collarOf(pet, index).value;
  const dark = '#2A2222';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', `kitty-art kitty-${species}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  svg.innerHTML = `<defs>
      <radialGradient id="k-body-${id}" cx="42%" cy="32%" r="78%"><stop offset="0" stop-color="${c.base}"/><stop offset=".72" stop-color="${c.base}"/><stop offset="1" stop-color="${c.shade}"/></radialGradient>
      <radialGradient id="k-head-${id}" cx="44%" cy="36%" r="70%"><stop offset="0" stop-color="${c.base}"/><stop offset=".8" stop-color="${c.base}"/><stop offset="1" stop-color="${c.shade}"/></radialGradient>
      ${points ? `<radialGradient id="k-mask-${id}"><stop offset="0" stop-color="${c.point}" stop-opacity=".95"/><stop offset=".6" stop-color="${c.point}" stop-opacity=".7"/><stop offset="1" stop-color="${c.point}" stop-opacity="0"/></radialGradient>` : ''}
    </defs>
    <ellipse class="k-shadow" cx="60" cy="113" rx="33" ry="4.5" fill="currentColor" opacity=".13"/>
    <g class="k-tail"><path d="M80 107 C101 109 109 93 101 78 C98 72 92 73 93 79 C98 91 94 100 80 101 Z" fill="${p.tail}" stroke="${c.shade}" stroke-opacity=".5" stroke-width="2.2" stroke-linejoin="round"/>${pat.tail}</g>
    <g class="k-body">
      <path d="M37 111 C29 96 33 74 46 64 C52 60 68 60 74 64 C87 74 91 96 83 111 Z" fill="url(#k-body-${id})" stroke="${c.shade}" stroke-opacity=".5" stroke-width="2.4" stroke-linejoin="round"/>
      ${pat.body}
      <ellipse cx="60" cy="92" rx="12.5" ry="16" fill="${c.belly}" opacity=".85"/>
      <path d="M44 74 C42 84 42 94 45 104" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="4" stroke-linecap="round" fill="none"/>
      <ellipse cx="49" cy="110" rx="8.5" ry="5" fill="${p.paw}" stroke="${c.shade}" stroke-opacity=".5" stroke-width="2"/>
      <g class="k-paw"><ellipse cx="71" cy="110" rx="8.5" ry="5" fill="${p.paw}" stroke="${c.shade}" stroke-opacity=".5" stroke-width="2"/></g>
    </g>
    <g class="k-head">
      ${EARS[species](c, p)}
      <path d="M31 47 C31 31 45 22 60 22 C75 22 89 31 89 47 C89 61 77 69 60 69 C43 69 31 61 31 47 Z" fill="url(#k-head-${id})" stroke="${c.shade}" stroke-opacity=".5" stroke-width="2.4"/>
      ${pat.head}
      <ellipse cx="50" cy="32" rx="9" ry="4" fill="#FFFFFF" opacity=".18"/>
      <ellipse cx="41" cy="56" rx="5.5" ry="3.2" fill="#F4A6B6" opacity=".45"/><ellipse cx="79" cy="56" rx="5.5" ry="3.2" fill="#F4A6B6" opacity=".45"/>
      <g class="k-eyes">
        <ellipse cx="48" cy="46" rx="5.4" ry="5.9" fill="${c.eye}" stroke="${dark}" stroke-opacity=".6" stroke-width="1"/><ellipse cx="72" cy="46" rx="5.4" ry="5.9" fill="${c.eye}" stroke="${dark}" stroke-opacity=".6" stroke-width="1"/>
        <ellipse class="k-pupil" cx="48" cy="46.5" rx="${species === 'gato' ? 1.9 : 3}" ry="4.3" fill="${dark}"/><ellipse class="k-pupil" cx="72" cy="46.5" rx="${species === 'gato' ? 1.9 : 3}" ry="4.3" fill="${dark}"/>
        <circle cx="49.8" cy="43.8" r="1.5" fill="#FFFFFF"/><circle cx="73.8" cy="43.8" r="1.5" fill="#FFFFFF"/>
      </g>
      <g class="k-eyes-happy" fill="none" stroke="${dark}" stroke-width="1.8" stroke-linecap="round"><path d="M43 47 Q48 42 53 47"/><path d="M67 47 Q72 42 77 47"/></g>
      <path d="M56.5 54 L63.5 54 L60 58 Z" fill="${c.nose}" stroke-linejoin="round"/>
      <path d="M60 58 Q57.5 62 54 60 M60 58 Q62.5 62 66 60" fill="none" stroke="${dark}" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/>
      <g class="k-mouth-open"><ellipse cx="60" cy="61.5" rx="2.6" ry="2.2" fill="#C85A6A"/></g>
      ${species === 'gato' ? `<g stroke="${dark}" stroke-opacity=".35" stroke-width=".9" stroke-linecap="round"><path d="M44 56 L27 53 M44 59 L28 60 M76 56 L93 53 M76 59 L92 60"/></g>` : ''}
      ${collar ? `<g class="k-collar"><path d="M42 66 Q60 74 78 66" stroke="${collar}" stroke-width="4.2" fill="none" stroke-linecap="round"/><g class="k-bell"><circle cx="60" cy="73.5" r="4" fill="#E9BE4F" stroke="#B48A2C" stroke-width="1"/><path d="M57 73.5 H63 M60 74.5 V77" stroke="#8A6A22" stroke-width=".9" stroke-linecap="round"/></g></g>` : ''}
    </g>`;
  return svg;
}

/** A tiny swatch of a coat for the picker (head only, cropped). */
export function coatSwatch(coat, species = 'gato') {
  const s = kittyArt({ coat, species, collar: 'ninguno' });
  s.setAttribute('viewBox', '27 8 66 62');
  s.classList.add('kitty-swatch');
  return s;
}
