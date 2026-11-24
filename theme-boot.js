// Runs before the first paint (classic script, no inline JS because of the CSP):
// applies the cached theme so the app never flashes the wrong colors.
// "aishiteru" must match CONFIG.storageKey.
(function () {
  var root = document.documentElement;
  var p = {};
  try { p = JSON.parse(localStorage.getItem('aishiteru.theme') || '{}') || {}; } catch (e) { p = {}; }
  var mode = p.theme || 'auto';
  var h = new Date().getHours();
  root.dataset.theme = mode === 'day' || mode === 'night' ? mode : (h >= 6 && h < 18 ? 'day' : 'night');
  root.dataset.contrast = p.highContrast ? 'high' : 'normal';
  root.dataset.font = p.legibleFont ? 'legible' : 'default';
  root.dataset.ja = p.japanese === false ? 'off' : 'on';
  root.dataset.style = p.style === 'rojo' || p.style === 'azul' ? p.style : 'jp'; // v0.16.0 visual style
  root.dataset.motion = p.animations === false ? 'off' : 'on';
  if (p.textScale) root.style.fontSize = Math.min(200, Math.max(85, Number(p.textScale) || 100)) + '%';
  try { var who = localStorage.getItem('aishiteru.activeProfile'); if (who) root.dataset.profile = who; } catch (e) { /* ignore */ }
}());
