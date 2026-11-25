// Theme: Kioto (day) / Tokio neón (night), automatic by hour with a manual
// override, high contrast, text size, legible font, Japanese labels and motion.
// v0.16.0: a visual style on top of day/night (data-style): 'jp' (the original Japanese look),
// 'rojo' (Palacio rojo) or 'azul' (Porcelana azul), chosen 2026-11-24 by the user.
// The resolved preferences are cached in localStorage ("{storageKey}.theme")
// only so theme-boot.js can paint the right theme before the database opens.
import { titleLetters } from './letters.js';

export const APPEARANCE_DEFAULTS = { theme: 'auto', highContrast: false, textScale: 100, legibleFont: false, japanese: true, style: 'jp' };
export const STYLES = ['jp', 'rojo', 'azul'];
export const MOTION_DEFAULTS = { animations: true, haptics: true, sound: true, animalSound: true, intro: 'daily', seasonal: true }; // intro: 'daily' | 'always' (opening heart)
export const DAY_START = 6; export const NIGHT_START = 18;
const THEME_COLORS = {
  jp: { day: '#FBF4F3', night: '#161214' }, rojo: { day: '#FBF3E8', night: '#15100E' }, azul: { day: '#F4F6F9', night: '#0F131C' },
};
export const styleOf = (p = prefs) => (STYLES.includes(p.style) ? p.style : 'jp');

let storageKey = 'aishiteru';
let prefs = { ...APPEARANCE_DEFAULTS, ...MOTION_DEFAULTS };
let timer = null;
const listeners = new Set();

export const onThemeChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const setStorageKey = (k) => { storageKey = k; };

/** "day" or "night" for a theme mode at a given time. */
export function resolveTheme(mode, date = new Date()) {
  if (mode === 'day' || mode === 'night') return mode;
  const h = date.getHours();
  return h >= DAY_START && h < NIGHT_START ? 'day' : 'night';
}

export function apply(next = {}) {
  prefs = { ...prefs, ...next };
  const root = document.documentElement;
  const theme = resolveTheme(prefs.theme);
  root.dataset.theme = theme;
  root.dataset.themeMode = prefs.theme;
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
  root.dataset.font = prefs.legibleFont ? 'legible' : 'default';
  root.dataset.ja = prefs.japanese ? 'on' : 'off';
  const style = styleOf();
  if (root.dataset.style !== style) { root.dataset.style = style; relabel(style); }
  root.dataset.motion = prefs.animations ? 'on' : 'off';
  root.dataset.haptics = prefs.haptics ? 'on' : 'off';
  root.dataset.sound = prefs.sound ? 'on' : 'off';
  root.dataset.animalSound = prefs.animalSound === false ? 'off' : 'on';
  root.dataset.seasonal = prefs.seasonal === false ? 'off' : 'on';
  root.style.fontSize = `${Math.min(200, Math.max(85, Number(prefs.textScale) || 100))}%`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.highContrast ? (theme === 'day' ? '#FFFFFF' : '#000000') : THEME_COLORS[style][theme]);
  try {
    localStorage.setItem(`${storageKey}.theme`, JSON.stringify({
      theme: prefs.theme, highContrast: prefs.highContrast, textScale: prefs.textScale,
      legibleFont: prefs.legibleFont, japanese: prefs.japanese, animations: prefs.animations, style,
    }));
  } catch { /* storage may be unavailable */ }
  clearInterval(timer);
  if (prefs.theme === 'auto') {
    timer = setInterval(() => { if (resolveTheme('auto') !== root.dataset.theme) apply(); }, 60000);
  }
  listeners.forEach((fn) => fn(theme, prefs));
  return theme;
}

export const current = () => ({ ...prefs, resolved: document.documentElement.dataset.theme });

/** Title letters already on screen follow a style change (new ones are written by util.ja). */
function relabel(style) {
  document.querySelectorAll('.ja[data-jp]').forEach((n) => {
    const t = titleLetters(n.dataset.jp, style);
    n.textContent = t.text; n.lang = t.lang;
  });
}

/** v0.33.0: the real hour of the day as a phase (dawn, day, dusk, night): the opening, the loading screen,
 * Inicio's sky and the pets follow it. Same cuts as Inicio's sky. */
export function dayPhase(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 5.5 ? 'night' : h < 7.5 ? 'dawn' : h < 16.5 ? 'day' : h < 19 ? 'dusk' : 'night';
}
