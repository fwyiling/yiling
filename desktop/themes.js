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
  {
    id: 'frosted', name: 'Frosted', author: 'Syndicates', description: 'Lighter, see-through bars and panels, like frosted glass.', tags: ['dock', 'top bar', 'panels'],
    variables: { '--sd-dock-bg': 'linear-gradient(rgba(255, 255, 255, .16), rgba(255, 255, 255, .08))', '--sd-dock-border': '1px solid rgba(255, 255, 255, .24)', '--sd-topbar-bg': 'rgba(255, 255, 255, .1)', '--sd-topbar-border': '1px solid rgba(255, 255, 255, .14)', '--bg': 'rgba(44, 50, 60, .7)', '--card': 'rgba(255, 255, 255, .08)', '--line': 'rgba(255, 255, 255, .14)', '--sd-island-bg': 'rgba(0, 0, 0, .78)' },
    styles: {},
  },
  {
    id: 'bubbles', name: 'Bubbles', author: 'Syndicates', description: 'The top bar becomes floating bubbles over your wallpaper, after the Seelen UI theme of that name.', tags: ['top bar'],
    variables: { '--sd-topbar-bg': 'transparent', '--sd-topbar-border': '0' },
    styles: { topbar: '#bar { padding: 0 6px; } #logo, #app:not(:empty), #desks:not([hidden]), #ovBtn, .tray:not([hidden]), .right > .seg:not([hidden]):not(:empty), #np:not([hidden]) { background: rgba(18, 22, 29, .9); border-radius: 9px; margin: 0 2px; box-shadow: 0 2px 8px rgba(0, 0, 0, .35); } #app { padding: 0 9px; height: 18px; display: flex; align-items: center; } .tray { padding: 0 3px; }' },
  },
  {
    // a cockpit display kept quiet: one dark tone, thin rules, a single accent, square corners, Bahnschrift
    id: 'mecha', name: 'Mecha', author: 'Syndicates', description: 'A quiet cockpit display: dark slate, thin rules, one cyan accent, square corners and a technical typeface.', tags: ['all', 'sci-fi'], accent: '#5ec4e8',
    variables: { '--sd-font': '"Bahnschrift", "Segoe UI Variable Text", "Segoe UI", sans-serif', '--t': '#e3edf3', '--m': '#8aa0ae', '--line': 'rgba(120, 200, 235, .2)', '--bg': 'rgba(8, 13, 20, .94)', '--card': 'rgba(120, 200, 235, .05)', '--sd-topbar-bg': 'rgba(8, 13, 20, .86)', '--sd-topbar-border': '1px solid rgba(120, 200, 235, .35)', '--sd-island-bg': 'rgba(6, 10, 16, .96)', '--sd-panel-radius': '6px', '--sd-dock-radius': '4px' },
    styles: { topbar: "/* one continuous dark strip with a hairline accent along the bottom; items separated by thin rules */\n#bar { position: relative; padding: 0 10px; background: rgba(8, 13, 20, .86); border-bottom: 1px solid rgba(120, 200, 235, .35); }\n.left, .right { gap: 0; }\n.left > *:not([hidden]) + *:not([hidden]), .right > *:not([hidden]):not(#clock) + *:not([hidden]):not(#clock) { margin-left: 2px; }\n#logo, #ovBtn, .seg, #np, .tray button, #desks button { border-radius: 2px; }\n#app:not(:empty) { display: flex; align-items: center; gap: 7px; padding: 0 10px; text-transform: uppercase; letter-spacing: .14em; font-size: 10.5px; font-weight: 600; }\n#app:not(:empty)::before { content: \"\"; width: 2px; height: 10px; background: var(--a); }\n#desks button { background: transparent; color: var(--m); }\n#desks button.on { background: transparent; color: var(--t); box-shadow: inset 0 -2px var(--a); }\n#clock { letter-spacing: .1em; font-size: 11px; } /* at the right end: the island has the middle */\n.tray, #np { padding: 0 2px; }\n.right > :is(.seg, .tray, #np):not([hidden]):not(:empty) { border-left: 1px solid rgba(120, 200, 235, .18); border-radius: 0; padding-left: 8px; margin-left: 4px; }\n.seg:is(button):hover, #np:hover, .tray button:hover, #logo:hover, #ovBtn:hover { background: rgba(120, 200, 235, .14); }\n.cell { border-color: rgba(220, 235, 245, .8); border-radius: 1px; } .cell::after { background: rgba(220, 235, 245, .8); } .cell b { background: var(--a); border-radius: 0; }", dock: "/* a dark slab, square corners, one accent hairline on top */\n#dock { border-radius: 4px; background: rgba(8, 13, 20, .88); border: 1px solid rgba(120, 200, 235, .2); border-top-color: rgba(120, 200, 235, .55); box-shadow: 0 10px 28px rgba(0, 0, 0, .45); }\n.item { border-radius: 3px; }\n.item:hover { background: rgba(120, 200, 235, .1); }\n.item img, .item .ph { border-radius: 20%; }\n.item.running::after { width: 4px; height: 2px; border-radius: 0; background: rgba(220, 235, 245, .6); }\n.item.active::after { width: 14px; height: 2px; border-radius: 0; background: var(--a); }\n.item .count { border-radius: 2px; color: #04121b; }\n.sep { background: rgba(120, 200, 235, .22); }", island: "#island { border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(120, 200, 235, .28); }\n#island.open, #island.alerting { border-radius: 6px; }\n#island.compact { box-shadow: inset 0 0 0 1px rgba(120, 200, 235, .32); }\n.presets button, .pill-b, .round, .go, .big-art { border-radius: 3px; }\n.go, .pill-b.accent { color: #04121b; }", panels: ".panel { border-radius: 6px; border-color: rgba(120, 200, 235, .22); }\n.ph b { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 600; }\nbutton, .tile, .grp { border-radius: 3px !important; }", overview: ".desk .shot, .win .tb { border-radius: 3px; }\n.desk.cur .shot { box-shadow: 0 0 0 2px var(--a); }\n.desk .name, .hint { text-transform: uppercase; letter-spacing: .14em; font-size: 11px; }\n.win .wt { border-radius: 2px; }", wallpaper: ".w-card, [data-layout=\"mac\"] .w-card { border-radius: .6cqmin; background: rgba(8, 13, 20, .62); box-shadow: inset 0 0 0 1px rgba(120, 200, 235, .2); backdrop-filter: blur(18px); }" },
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
