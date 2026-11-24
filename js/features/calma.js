// Respirar juntos y sonidos de calma (v0.24.0). The breath follows the clock (one cycle every 10 s
// counted from the epoch), so two phones opened at the same moment breathe in step without sending
// anything. Rain and temple sounds are generated in the phone: no files, no network.
import { ui, util } from '../core.js';

const { el } = util;
const CYCLE = 10000; const IN = 4000; // 4 s in, 6 s out
let ctx = null; let stopSound = () => {};

function rain() {
  ctx = ctx || new AudioContext();
  const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
  const g = ctx.createGain(); g.gain.value = 0.05;
  src.connect(f).connect(g).connect(ctx.destination); src.start();
  return () => { src.stop(); };
}
function temple() {
  ctx = ctx || new AudioContext();
  const bell = () => {
    const t = ctx.currentTime;
    [220, 330, 495].forEach((fr, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 / (i + 1), t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 6.2);
    });
  };
  bell(); const id = setInterval(bell, CYCLE);
  return () => clearInterval(id);
}

export function openCalma() {
  const orb = el('div', { class: 'calma-orb' });
  const word = el('p', { class: 'calma-word', role: 'status', 'aria-live': 'off' }, 'Inspira');
  const off = -(Date.now() % CYCLE);
  orb.style.animationDelay = `${off}ms`;
  let last = ''; let vib = 0;
  const tick = () => {
    const p = Date.now() % CYCLE; const w = p < IN ? 'Inspira' : 'Suelta el aire';
    if (w !== last) { last = w; word.textContent = w; if (document.documentElement.dataset.haptics === 'on') navigator.vibrate?.(w === 'Inspira' ? [40] : [25]); }
  };
  vib = setInterval(tick, 250); tick();
  let current = 'none';
  const choose = (k) => {
    stopSound(); stopSound = () => {}; current = k;
    try { if (k === 'rain') stopSound = rain(); else if (k === 'temple') stopSound = temple(); } catch { ui.toast('Este navegador no pudo generar el sonido.'); }
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === current)));
  };
  const seg = el('div', { class: 'calma-sounds', role: 'group', 'aria-label': 'Sonido de calma' },
    [['none', 'Silencio'], ['rain', 'Lluvia'], ['temple', 'Templo']].map(([k, label]) => el('button', { class: 'btn btn-secondary btn-small', type: 'button', 'data-k': k, 'aria-pressed': String(k === 'none'), onClick: () => choose(k) }, label)));
  ui.openModal({ title: 'Respirar juntos', size: 'sm', onClose: () => { clearInterval(vib); stopSound(); stopSound = () => {}; },
    body: el('div', { class: 'stack calma' },
      el('p', { class: 'muted small' }, 'Si los dos abren esto a la vez, respiran al mismo ritmo, sin mandar nada.'),
      el('div', { class: 'calma-stage' }, orb, word), seg) });
}
