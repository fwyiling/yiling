// Themes, after Seelen UI's: a theme is a name, a description and tags, variables (colours, corners, font), CSS
// shared by every part, and CSS for each part (dock, top bar, island, panels, Home, overview, desktop widgets).
// Several can be on at once, in order: a later one wins where they overlap. Built-in themes ship with the app;
// your own and imported ones are .sdtheme files (JSON) in the themes folder, to share with anyone.
// Theme CSS only styles the app's own pages, and their Content-Security-Policy blocks anything loaded from the web.
const fs = require('fs');
const path = require('path');

const SURFACES = ['dock', 'topbar', 'island', 'panels', 'home', 'overview', 'wallpaper'];
const SURFACE_NAMES = { dock: 'Dock', topbar: 'Top bar', island: 'Island', panels: 'Panels and menus', home: 'Home', overview: 'Desktops overview', wallpaper: 'Desktop widgets' };
// the variables every page understands (anything else starting with -- may be set too, for a theme's own CSS)
const VARIABLES = {
  '--t': 'Text', '--m': 'Muted text', '--line': 'Lines and borders', '--bg': 'Panel background', '--card': 'Cards inside panels',
  '--sd-font': 'Font', '--sd-dock-bg': 'Dock background', '--sd-dock-border': 'Dock border', '--sd-dock-radius': 'Dock corners',
  '--sd-topbar-bg': 'Top bar background', '--sd-topbar-border': 'Top bar border', '--sd-island-bg': 'Island colour', '--sd-panel-radius': 'Panel corners',
};

const BUILTIN = [
  { id: 'default', name: 'Syndicates', author: 'Syndicates', description: 'The standard look: dark slate glass with your accent colour.', tags: ['all'], variables: {}, styles: {} },
  {
    id: 'frosted', name: 'Frosted', author: 'Syndicates', description: 'Lighter, see-through bars and panels, like frosted glass.', tags: ['dock', 'top bar', 'panels'],
    variables: { '--sd-dock-bg': 'linear-gradient(rgba(255, 255, 255, .16), rgba(255, 255, 255, .08))', '--sd-dock-border': '1px solid rgba(255, 255, 255, .24)', '--sd-topbar-bg': 'rgba(255, 255, 255, .1)', '--sd-topbar-border': '1px solid rgba(255, 255, 255, .14)', '--bg': 'rgba(44, 50, 60, .7)', '--card': 'rgba(255, 255, 255, .08)', '--line': 'rgba(255, 255, 255, .14)', '--sd-island-bg': 'rgba(0, 0, 0, .78)' },
    styles: {},
  },
  {
    id: 'midnight', name: 'Midnight', author: 'Syndicates', description: 'Deep navy with a soft blue glow.', tags: ['all'], accent: '#6c8cff',
    variables: { '--t': '#e8ecff', '--m': '#8f9ac4', '--line': 'rgba(120, 140, 255, .16)', '--bg': 'rgba(13, 18, 38, .96)', '--card': 'rgba(120, 140, 255, .07)', '--sd-dock-bg': 'linear-gradient(rgba(22, 30, 60, .96), rgba(10, 14, 32, .96))', '--sd-dock-border': '1px solid rgba(120, 140, 255, .25)', '--sd-topbar-bg': 'rgba(10, 14, 32, .95)', '--sd-topbar-border': '1px solid rgba(120, 140, 255, .18)', '--sd-island-bg': '#05081a' },
    shared: '', styles: { dock: '#dock { box-shadow: 0 12px 34px rgba(0, 0, 0, .5), 0 0 26px rgba(108, 140, 255, .18); }' },
  },
  {
    id: 'bubbles', name: 'Bubbles', author: 'Syndicates', description: 'The top bar becomes floating bubbles over your wallpaper, after the Seelen UI theme of that name.', tags: ['top bar'],
    variables: { '--sd-topbar-bg': 'transparent', '--sd-topbar-border': '0' },
    styles: { topbar: '#bar { padding: 0 6px; } #logo, #app:not(:empty), #desks:not([hidden]), #ovBtn, .tray:not([hidden]), .right > .seg:not([hidden]):not(:empty), #np:not([hidden]) { background: rgba(18, 22, 29, .9); border-radius: 9px; margin: 0 2px; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); } #app { padding: 0 9px; height: 18px; display: flex; align-items: center; } .tray { padding: 0 3px; }' },
  },
  {
    id: 'sakura', name: 'Sakura', author: 'Syndicates', description: 'Soft pink and plum, calm and warm.', tags: ['all'], accent: '#f783ac',
    variables: { '--t': '#fff0f6', '--m': '#e3a9c1', '--line': 'rgba(255, 182, 213, .16)', '--bg': 'rgba(46, 26, 38, .95)', '--card': 'rgba(255, 182, 213, .07)', '--sd-dock-bg': 'linear-gradient(rgba(62, 36, 51, .96), rgba(40, 22, 33, .96))', '--sd-dock-border': '1px solid rgba(255, 182, 213, .22)', '--sd-topbar-bg': 'rgba(40, 22, 33, .94)', '--sd-island-bg': '#1f0f18' },
    styles: {},
  },
  {
    id: 'nord', name: 'Nord', author: 'Syndicates', description: 'The cool, muted Nord palette.', tags: ['all'], accent: '#88c0d0',
    variables: { '--t': '#eceff4', '--m': '#a3adbf', '--line': 'rgba(216, 222, 233, .1)', '--bg': 'rgba(46, 52, 64, .97)', '--card': 'rgba(216, 222, 233, .05)', '--sd-dock-bg': 'linear-gradient(rgba(59, 66, 82, .97), rgba(46, 52, 64, .97))', '--sd-dock-border': '1px solid rgba(216, 222, 233, .12)', '--sd-topbar-bg': 'rgba(46, 52, 64, .97)', '--sd-island-bg': '#242933' },
    styles: {},
  },
  {
    id: 'terminal', name: 'Terminal', author: 'Syndicates', description: 'Green on black, square corners, monospace.', tags: ['all'], accent: '#39d353',
    variables: { '--sd-font': '"Cascadia Mono", Consolas, "Courier New", monospace', '--t': '#c9f7c9', '--m': '#6fa86f', '--line': 'rgba(57, 211, 83, .22)', '--bg': 'rgba(0, 0, 0, .96)', '--card': 'rgba(57, 211, 83, .05)', '--sd-dock-bg': '#000', '--sd-dock-border': '1px solid rgba(57, 211, 83, .4)', '--sd-dock-radius': '6px', '--sd-topbar-bg': '#000', '--sd-topbar-border': '1px solid rgba(57, 211, 83, .3)', '--sd-panel-radius': '6px' },
    styles: {},
  },
];

const MAX_CSS = 100 * 1024;
const cleanCss = (v) => (typeof v === 'string' ? v.slice(0, MAX_CSS).replace(/<\/style/gi, '') : '');
const cleanValue = (v) => String(v).replace(/[;{}<>]/g, '').slice(0, 300); // one value: it can't close the :root block
const slug = (s) => String(s || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'theme';
/** A theme as it may be kept and used: unknown fields dropped, sizes capped. Throws if it isn't a theme. */
function validate(t, id) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error('not a theme file');
  if (typeof t.name !== 'string' || !t.name.trim()) throw new Error('the theme has no name');
  const out = { id: id || slug(t.id || t.name), name: t.name.trim().slice(0, 60), author: String(t.author || '').slice(0, 60), description: String(t.description || '').slice(0, 300),
    tags: Array.isArray(t.tags) ? t.tags.map((x) => String(x).slice(0, 20)).slice(0, 8) : [], variables: {}, shared: cleanCss(t.shared), styles: {} };
  if (typeof t.accent === 'string' && /^#[0-9a-f]{6}$/i.test(t.accent)) out.accent = t.accent;
  if (t.variables && typeof t.variables === 'object') for (const [k, v] of Object.entries(t.variables)) if (/^--[a-z][a-z0-9-]{0,40}$/i.test(k) && v != null && String(v).trim()) out.variables[k] = cleanValue(v);
  if (t.styles && typeof t.styles === 'object') for (const k of SURFACES) if (t.styles[k]) out.styles[k] = cleanCss(t.styles[k]);
  return out;
}

let dir = '';
const fileOf = (id) => path.join(dir, `${id}.sdtheme`);
function init(userData) { dir = path.join(userData, 'themes'); fs.mkdirSync(dir, { recursive: true }); }
function userThemes() {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /\.(sdtheme|json)$/i.test(f)); } catch {}
  for (const f of names) {
    const id = slug(f.replace(/\.(sdtheme|json)$/i, ''));
    if (BUILTIN.some((b) => b.id === id)) continue;
    try { out.push({ ...validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), id), builtin: false }); } catch (e) { out.push({ id, name: f, broken: e.message, variables: {}, styles: {}, tags: [] }); }
  }
  return out;
}
const all = () => [...BUILTIN.map((t) => ({ ...validate(t, t.id), builtin: true })), ...userThemes()];
const get = (id) => all().find((t) => t.id === id) || null;
/** What the pages apply: the active themes merged in order (later wins). */
function bundle(active) {
  const list = (Array.isArray(active) ? active : []).map(get).filter((t) => t && !t.broken);
  const b = { vars: {}, accent: '', shared: '', styles: {} };
  for (const t of list) {
    Object.assign(b.vars, t.variables);
    if (t.accent) b.accent = t.accent;
    if (t.shared) b.shared += `\n/* ${t.name} */\n${t.shared}`;
    for (const [k, v] of Object.entries(t.styles)) b.styles[k] = `${b.styles[k] || ''}\n/* ${t.name} */\n${v}`;
  }
  return b;
}
function uniqueId(base) { let id = slug(base), n = 2; while (get(id)) id = `${slug(base)}-${n++}`; return id; }
/** Bring in a theme file; returns its id. */
function install(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.length > 600 * 1024) throw new Error('the file is too big for a theme');
  const t = validate(JSON.parse(raw));
  const id = uniqueId(t.id);
  fs.writeFileSync(fileOf(id), JSON.stringify({ ...t, id }, null, 2));
  return id;
}
/** A new theme of your own, started from another (or empty). */
function create(fromId) {
  const from = fromId ? get(fromId) : null;
  const t = validate({ ...(from || {}), name: from ? `${from.name} (mine)` : 'My theme', author: '', description: from ? `Based on ${from.name}.` : '' });
  const id = uniqueId(t.name);
  fs.writeFileSync(fileOf(id), JSON.stringify({ ...t, id }, null, 2));
  return id;
}
function save(id, t) {
  if (!get(id) || get(id).builtin) throw new Error('only your own themes can be changed');
  fs.writeFileSync(fileOf(id), JSON.stringify({ ...validate(t, id), id }, null, 2));
}
function remove(id) {
  const t = get(id);
  if (!t || t.builtin) return false;
  for (const ext of ['sdtheme', 'json']) { try { fs.unlinkSync(path.join(dir, `${id}.${ext}`)); } catch {} }
  return true;
}
function exportTo(id, dest) {
  const t = get(id); if (!t || t.broken) throw new Error('no such theme');
  const { builtin, broken, ...clean } = t; void builtin; void broken;
  fs.writeFileSync(dest, JSON.stringify(clean, null, 2));
}
let watcher = null;
function watch(fn) { try { watcher?.close(); watcher = fs.watch(dir, () => { clearTimeout(watch.t); watch.t = setTimeout(fn, 250); }); } catch {} }

module.exports = { SURFACES, SURFACE_NAMES, VARIABLES, BUILTIN, init, all, get, bundle, install, create, save, remove, exportTo, validate, watch, dir: () => dir };
