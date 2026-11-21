// Hash router (docs/09 §1). Routes are registered as patterns like "/capsula/:id".
// Views are ES modules loaded on demand with import(); each exports
// render(ctx) -> Node | { node, cleanup }.

const routes = []; // { pattern, re, keys, def }
let current = null; // { path, def, params, query, cleanup }
let guard = null; // () => Promise<boolean> (true = allow leaving)
let onNavigate = () => {};
let renderView = async () => {};
let lastPath = null;
let prevPath = null; // the route before the current one (page back arrows reuse it with history.back)

function compile(pattern) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  return { re, keys };
}

export function register(pattern, def) {
  routes.push({ pattern, ...compile(pattern), def });
}

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/inicio';
  const [path, qs = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { def: r.def, params, pattern: r.pattern };
    }
  }
  return null;
}

export const currentRoute = () => current;
export const previousPath = () => prevPath;
export const setGuard = (fn) => { guard = fn; };
export const clearGuard = () => { guard = null; };

export function go(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) { resolve(); return; }
  if (replace) { history.replaceState(history.state, '', target); resolve(); } else location.hash = target;
}

export function back(fallback = '/inicio') {
  if (history.length > 1 && lastPath) history.back(); else go(fallback, { replace: true });
}

async function resolve() {
  const { path, query } = parseHash();
  if (guard && lastPath && path !== lastPath) {
    const allow = await guard();
    if (!allow) {
      history.replaceState(history.state, '', `#${lastPath}`); // replaceState fires no hashchange
      return;
    }
    guard = null;
  }
  const found = match(path) || match('/no-encontrado');
  const prev = current;
  try { prev?.cleanup?.(); } catch (e) { console.error(e); }
  current = { path, query, def: found.def, params: found.params, pattern: found.pattern, cleanup: null };
  if (path !== lastPath) prevPath = lastPath;
  lastPath = path;
  onNavigate(current, prev);
  await renderView(current, prev);
}

/** Start listening. render(route, prev) draws the view; navigate(route, prev) runs first (locks, nav state). */
export function start({ render, navigate }) {
  renderView = render; onNavigate = navigate || (() => {});
  addEventListener('hashchange', () => { resolve(); });
  return resolve();
}
export const refresh = () => resolve();
