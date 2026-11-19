// Theme: Kioto (day) / Tokio neón (night), automatic by hour with a manual
// override, high contrast, text size, legible font, Japanese labels and motion.
// The resolved preferences are cached in localStorage ("{storageKey}.theme")
// only so theme-boot.js can paint the right theme before the database opens.

export const APPEARANCE_DEFAULTS = { theme: 'auto', highContrast: false, textScale: 100, legibleFont: false, japanese: true };
export const MOTION_DEFAULTS = { animations: true, haptics: true, sound: false };
export const DAY_START = 6; export const NIGHT_START = 18;
const THEME_COLORS = { day: '#FBF4F3', night: '#161214' };

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
  root.dataset.motion = prefs.animations ? 'on' : 'off';
  root.dataset.haptics = prefs.haptics ? 'on' : 'off';
  root.dataset.sound = prefs.sound ? 'on' : 'off';
  root.style.fontSize = `${Math.min(200, Math.max(85, Number(prefs.textScale) || 100))}%`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.highContrast ? (theme === 'day' ? '#FFFFFF' : '#000000') : THEME_COLORS[theme]);
  try {
    localStorage.setItem(`${storageKey}.theme`, JSON.stringify({
      theme: prefs.theme, highContrast: prefs.highContrast, textScale: prefs.textScale,
      legibleFont: prefs.legibleFont, japanese: prefs.japanese, animations: prefs.animations,
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
