// Voces de los animalitos (v0.20.0, option A chosen 2026-11-24): cartoon sounds made right here with
// Web Audio (no files, nothing copied, works offline). Each friend has its own voice: meow, fox yip,
// rabbit squeak, the tanuki's pon-pon drum, the panda munching bamboo and the crane's call; the cats
// also purr. They play only when Ajustes > Apariencia > "Voces de los animalitos" is on (on by default)
// and never carry information on their own: each one goes with a bubble or a move on screen.
let ctx = null;
let master = null;

/** On unless they turned it off (html[data-animal-sound="off"], set by Ajustes). */
export const enabled = () => document.documentElement.dataset.animalSound !== 'off';

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor(); // keeps every voice at a gentle, even volume
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
function noise(a, len) {
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * len)), a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = buf; return s;
}
/** A tone through one or two band-pass "mouth" filters whose pitch follows `curve` ([time, Hz] pairs). */
function voice(a, t, { type = 'sawtooth', curve, formants = [], peak = 0.25, attack = 0.03, len = 0.4, vibrato = 0 }) {
  const o = a.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(curve[0][1], t);
  for (const [dt, f] of curve.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
  if (vibrato) { const v = a.createOscillator(); const vg = a.createGain(); v.frequency.value = 6; vg.gain.value = vibrato; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + len + 0.05); }
  const g = a.createGain(); env(g, t, peak, attack, len);
  let node = o;
  if (formants.length) {
    const sum = a.createGain();
    for (const fm of formants) {
      const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = fm.q || 6;
      bp.frequency.setValueAtTime(fm.curve[0][1], t);
      for (const [dt, f] of fm.curve.slice(1)) bp.frequency.exponentialRampToValueAtTime(f, t + dt);
      o.connect(bp).connect(sum);
    }
    node = sum;
  }
  node.connect(g).connect(master);
  o.start(t); o.stop(t + attack + len + 0.05);
}

const VOICES = {
  // "mi-aaau": rising then falling pitch, the mouth opens (i -> a) and closes (u)
  meow(a, t, high = 1) {
    voice(a, t, { curve: [[0, 520 * high], [0.18, 780 * high], [0.55, 470 * high]], vibrato: 8, peak: 0.5, attack: 0.05, len: 0.55,
      formants: [{ q: 5, curve: [[0, 500], [0.2, 1000], [0.55, 450]] }, { q: 7, curve: [[0, 2300], [0.2, 1500], [0.55, 900]] }] });
  },
  // two short, bright yips
  fox(a, t) {
    [0, 0.2].forEach((d, i) => voice(a, t + d, { type: 'square', curve: [[0, 820 + i * 80], [0.05, 1350 + i * 80], [0.13, 700]], peak: 0.12, attack: 0.01, len: 0.13,
      formants: [{ q: 4, curve: [[0, 1200], [0.13, 900]] }] }));
  },
  // tiny squeaks
  rabbit(a, t) {
    [0, 0.12, 0.24].forEach((d, i) => voice(a, t + d, { type: 'sine', curve: [[0, 1700 + i * 150], [0.06, 2500 + i * 150]], peak: 0.16, attack: 0.008, len: 0.07 }));
  },
  // pon-pon: his belly drum
  tanuki(a, t) {
    [0, 0.24].forEach((d) => {
      voice(a, t + d, { type: 'sine', curve: [[0, 170], [0.25, 62]], peak: 0.7, attack: 0.005, len: 0.3 });
      const n = noise(a, 0.05); const g = a.createGain(); env(g, t + d, 0.06, 0.002, 0.04); const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      n.connect(lp).connect(g).connect(master); n.start(t + d);
    });
  },
  // a sleepy "mmm" and three crunches of bamboo
  panda(a, t) {
    voice(a, t, { type: 'triangle', curve: [[0, 190], [0.45, 150]], peak: 0.32, attack: 0.06, len: 0.45, formants: [{ q: 3, curve: [[0, 320], [0.45, 280]] }] });
    [0.55, 0.72, 0.89].forEach((d) => { const n = noise(a, 0.07); const g = a.createGain(); env(g, t + d, 0.22, 0.004, 0.06); const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 600; bp.Q.value = 1.2; n.connect(bp).connect(g).connect(master); n.start(t + d); });
  },
  // koo-roo, like a crane far away
  crane(a, t) {
    voice(a, t, { type: 'triangle', curve: [[0, 880], [0.2, 820]], peak: 0.22, attack: 0.02, len: 0.22, vibrato: 14, formants: [{ q: 3, curve: [[0, 1100], [0.2, 900]] }] });
    voice(a, t + 0.27, { type: 'triangle', curve: [[0, 1050], [0.3, 760]], peak: 0.2, attack: 0.02, len: 0.32, vibrato: 14, formants: [{ q: 3, curve: [[0, 1200], [0.3, 850]] }] });
  },
  // a low, rumbling purr that swells and fades
  purr(a, t) {
    const len = 1.3; const n = noise(a, len); const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
    const am = a.createGain(); am.gain.value = 0.5; const lfo = a.createOscillator(); lfo.frequency.value = 25; const lg = a.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + len);
    const g = a.createGain(); env(g, t, 0.9, 0.25, len - 0.25);
    n.connect(lp).connect(am).connect(g).connect(master); n.start(t); n.stop(t + len);
  },
};
// a friendly "wuf-wuf" for dogs
VOICES.dog = (a, t) => {
  [0, 0.22].forEach((d) => voice(a, t + d, { curve: [[0, 330], [0.04, 420], [0.14, 210]], peak: 0.35, attack: 0.01, len: 0.14,
    formants: [{ q: 3, curve: [[0, 700], [0.14, 450]] }, { q: 5, curve: [[0, 1400], [0.14, 1000]] }] }));
};
VOICES.cat = (a, t) => VOICES.meow(a, t, 1.15);
VOICES.kitty = (a, t) => VOICES.meow(a, t, 0.95 + Math.random() * 0.2);

let lastAt = 0;
/** Plays a friend's voice: 'fox' | 'cat' | 'rabbit' | 'tanuki' | 'panda' | 'crane' | 'kitty' | 'dog' | 'meow' | 'purr'. */
export function play(kind, { force = false } = {}) {
  if (!force && !enabled()) return;
  const fn = VOICES[kind]; if (!fn) return;
  const now = performance.now(); if (now - lastAt < 180) return; // a tap storm never turns into noise
  lastAt = now;
  try { const a = audio(); fn(a, a.currentTime + 0.02); } catch { /* audio not available */ }
}
export const kinds = Object.keys(VOICES);
