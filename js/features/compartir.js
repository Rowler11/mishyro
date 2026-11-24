// Tarjeta para compartir (v0.24.1 idea 22): a picture with the days together and one short phrase, to
// post or send. It carries no names, dates or personal data: only the number and the phrase.
import { ui, util, profile } from '../core.js';
import * as time from '../core/time.js';

const { el } = util;
const PHRASES = ['Cada día, un poquito más.', 'Lo mejor de mis días eres tú.', 'Conectar, no desconectar.', 'Contigo, hasta lo simple es bonito.', 'Un día más, y sigo eligiéndote.', 'Poco a poco, florecemos.'];

function petal(g, x, y, r, a, color) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = color; g.beginPath();
  g.moveTo(0, 0); g.bezierCurveTo(-r * .7, -r * .4, -r * .5, -r * 1.2, 0, -r * 1.05); g.bezierCurveTo(r * .5, -r * 1.2, r * .7, -r * .4, 0, 0); g.fill(); g.restore();
}

export async function drawCard(days, phrase) {
  const css = getComputedStyle(document.documentElement);
  const v = (n, d) => css.getPropertyValue(n).trim() || d;
  const bg = v('--bg', '#FBF4F3'); const accent = v('--accent', '#C2405F'); const text = v('--text', '#2a2024'); const font = v('--font-serif', 'serif');
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  const grad = g.createRadialGradient(540, 420, 40, 540, 420, 760); grad.addColorStop(0, `${accent}33`); grad.addColorStop(1, `${accent}00`);
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
  for (let i = 0; i < 5; i++) petal(g, 540, 330, 150, (i * 72 * Math.PI) / 180, `${accent}${i % 2 ? 'cc' : 'ee'}`);
  g.fillStyle = v('--gold', '#C9A24B'); g.beginPath(); g.arc(540, 330, 22, 0, 7); g.fill();
  g.textAlign = 'center'; g.fillStyle = text;
  g.font = `700 260px ${font}`; g.fillText(String(days), 540, 800);
  g.fillStyle = accent; g.font = `500 64px ${font}`; g.fillText(days === 1 ? 'día juntos' : 'días juntos', 540, 890);
  g.fillStyle = text; g.font = `italic 48px ${font}`;
  const words = phrase.split(' '); let line = ''; let y = 1050;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 820) { g.fillText(line, 540, y); y += 64; line = w; } else line = t; }
  g.fillText(line, 540, y);
  g.fillStyle = `${accent}99`; g.font = `500 34px ${font}`; g.fillText('Aishiteru', 540, 1260);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function openShareCard() {
  const start = time.parseStart(profile.startDate());
  if (!start) { ui.toast('Primero falta la fecha en que empezaron.'); return; }
  const days = Math.max(0, util.daysBetween(start, new Date()));
  let i = days % PHRASES.length; let blob = null; let url = '';
  const img = el('img', { class: 'sharecard-img', alt: `Tarjeta: ${days} días juntos` });
  const paint = async () => { blob = await drawCard(days, PHRASES[i]); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); img.src = url; };
  paint();
  ui.openModal({ title: 'Tarjeta para compartir', size: 'sm', onClose: () => { if (url) URL.revokeObjectURL(url); },
    body: el('div', { class: 'stack' }, img, el('p', { class: 'muted small' }, 'Solo lleva el número y una frase: ni nombres ni fechas.')),
    actions: [
      { label: 'Otra frase', variant: 'ghost', onClick: () => { i = (i + 1) % PHRASES.length; paint(); return false; } },
      { label: 'Compartir', onClick: async () => {
        if (!blob) return false;
        const file = new File([blob], 'dias-juntos.png', { type: 'image/png' });
        try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return false; } } catch (e) { if (e?.name === 'AbortError') return false; }
        const a = el('a', { href: url, download: 'dias-juntos.png' }); document.body.append(a); a.click(); a.remove(); return false;
      } }],
  });
}
