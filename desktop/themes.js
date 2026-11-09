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
    // a cockpit HUD: dark glass frames with accent corner brackets, an angled plate for the app, a framed clock in the middle
    id: 'mecha', name: 'Mecha HUD', author: 'Syndicates', description: 'A sci-fi cockpit display: dark glass frames with glowing corner brackets, an angled plate for the app, a framed clock in the middle.', tags: ['all', 'sci-fi'], accent: '#5fd4ff',
    variables: { '--sd-font': '"Bahnschrift", "Segoe UI Variable Text", "Segoe UI", sans-serif', '--t': '#e4f4ff', '--m': '#8db4cd', '--line': 'rgba(150, 215, 255, .26)', '--bg': 'rgba(5, 14, 26, .92)', '--card': 'rgba(150, 215, 255, .06)', '--sd-topbar-bg': 'transparent', '--sd-topbar-border': '0', '--sd-island-bg': 'rgba(4, 12, 22, .95)', '--sd-panel-radius': '2px', '--sd-dock-radius': '2px' },
    styles: { topbar: "#bar { position: relative; padding: 0 5px; }\n.left { gap: 0; }\n/* the logo and the app in front: one angled plate */\n#logo, #app { height: 20px; border-radius: 0; background: linear-gradient(90deg, rgba(95, 212, 255, .3), rgba(95, 212, 255, .08)); border-top: 1px solid rgba(190, 236, 255, .8); border-bottom: 1px solid rgba(190, 236, 255, .25); }\n#logo { width: 34px; clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%); }\n#app:not(:empty) { display: flex; align-items: center; margin-left: -5px; padding: 0 24px 0 15px; text-transform: uppercase; letter-spacing: .12em; font-size: 10.5px; clip-path: polygon(8px 0, 100% 0, calc(100% - 13px) 100%, 0 100%); text-shadow: 0 0 6px rgba(95, 212, 255, .6); }\n#app:empty { display: none; }\n#ovBtn { margin-left: 8px; height: 18px; border-radius: 0; background: linear-gradient(var(--a), var(--a)) left top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1px 5px no-repeat, transparent; }\n#desks button { border-radius: 0; background: transparent; box-shadow: inset 0 0 0 1px rgba(190, 236, 255, .35); }\n#desks button.on { background: var(--a); color: #021019; box-shadow: 0 0 10px rgba(95, 212, 255, .6); }\n/* the clock: a framed readout in the middle, with lines out to each side */\n#clock { position: absolute; left: 50%; transform: translateX(-50%); height: 20px; padding: 0 16px; border-radius: 0; background: linear-gradient(var(--a), var(--a)) left top / 7px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) left top / 1.5px 7px no-repeat, linear-gradient(var(--a), var(--a)) right top / 7px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) right top / 1.5px 7px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 7px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1.5px 7px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 7px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1.5px 7px no-repeat, rgba(5, 14, 26, .8); box-shadow: inset 0 0 0 1px rgba(190, 236, 255, .22), 0 0 14px rgba(95, 212, 255, .22); letter-spacing: .1em; font-size: 11px; text-shadow: 0 0 6px rgba(95, 212, 255, .55); }\n#clock::before, #clock::after { content: \"\"; position: absolute; top: 50%; width: 40px; height: 1px; background: linear-gradient(90deg, transparent, rgba(190, 236, 255, .7)); }\n#clock::before { right: 100%; } #clock::after { left: 100%; transform: scaleX(-1); }\n/* status: each in its own small bracketed frame */\n.right { gap: 6px; }\n.right > .seg:not(#clock):not([hidden]):not(:empty), .tray:not([hidden]), #np:not([hidden]) { height: 18px; border-radius: 0; background: linear-gradient(var(--a), var(--a)) left top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1px 5px no-repeat, rgba(5, 14, 26, .6); box-shadow: inset 0 0 0 1px rgba(190, 236, 255, .14); }\n.seg:is(button):hover, #np:hover, .tray button:hover, #logo:hover { background-color: rgba(95, 212, 255, .2) !important; }\n.tray button { height: 16px; border-radius: 0; }\n.cell { border-color: rgba(190, 236, 255, .85); border-radius: 1px; } .cell::after { background: rgba(190, 236, 255, .85); } .cell b { background: var(--a); box-shadow: 0 0 6px var(--a); border-radius: 0; }\n#weather, #npText { letter-spacing: .05em; }", dock: "/* a HUD frame: dark glass, accent brackets on the corners, a scan line along the top */\n#dock { border-radius: 2px; background: linear-gradient(var(--a), var(--a)) left top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 2px 14px no-repeat, linear-gradient(rgba(8, 22, 38, .86), rgba(3, 11, 21, .9)); border: 1px solid rgba(150, 215, 255, .28); box-shadow: 0 12px 30px rgba(0, 0, 0, .5), 0 0 20px rgba(95, 212, 255, .12), inset 0 0 26px rgba(95, 212, 255, .06); }\n#dock::before { content: \"\"; position: absolute; left: 24px; right: 24px; top: -1px; height: 1px; background: linear-gradient(90deg, transparent, rgba(95, 212, 255, .85), transparent); pointer-events: none; }\n#dock::after { content: \"\"; position: absolute; left: 50%; bottom: -1px; width: 60px; height: 2px; transform: translateX(-50%); background: var(--a); box-shadow: 0 0 10px var(--a); pointer-events: none; }\n.item { border-radius: 2px; }\n.item:hover { background: rgba(95, 212, 255, .1); box-shadow: inset 0 0 0 1px rgba(95, 212, 255, .4); }\n.item.sys { background: rgba(95, 212, 255, .06); box-shadow: inset 0 0 0 1px rgba(150, 215, 255, .18); }\n.item img, .item .ph { border-radius: 18%; }\n.item.running::after { width: 6px; height: 2px; border-radius: 0; background: rgba(150, 215, 255, .7); }\n.item.active::after { width: 16px; height: 2px; border-radius: 0; background: var(--a); box-shadow: 0 0 8px var(--a); }\n.item .count { border-radius: 2px; background: var(--a); color: #021019; box-shadow: 0 0 8px rgba(95, 212, 255, .6); }\n.sep { width: 1px; background: linear-gradient(transparent, rgba(150, 215, 255, .55), transparent); }", island: "#island, #island.open, #island.alerting, #island.osding { border-radius: 2px; background: linear-gradient(var(--a), var(--a)) left top / 8px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) left top / 1.5px 8px no-repeat, linear-gradient(var(--a), var(--a)) right top / 8px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) right top / 1.5px 8px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 8px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1.5px 8px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 8px 1.5px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1.5px 8px no-repeat, var(--sd-island-bg); box-shadow: inset 0 0 0 1px rgba(150, 215, 255, .28), 0 0 16px rgba(95, 212, 255, .16); }\n#island.open { background: linear-gradient(var(--a), var(--a)) left top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 2px 14px no-repeat, var(--sd-island-bg); }\n#island.compact { box-shadow: inset 0 0 0 1px rgba(150, 215, 255, .32); }\n.presets button, .pill-b, .round, .go, .big-art { border-radius: 2px; }\n.go, .pill-b.accent { color: #021019; box-shadow: 0 0 10px rgba(95, 212, 255, .45); }\n.bar b, .ring .fg { filter: drop-shadow(0 0 3px var(--a)); }", panels: ".panel { border-radius: 2px; border: 0; background: linear-gradient(var(--a), var(--a)) left top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right top / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right top / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 2px 14px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 14px 2px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 2px 14px no-repeat, var(--bg); box-shadow: inset 0 0 0 1px rgba(150, 215, 255, .22), 0 18px 50px rgba(0, 0, 0, .55), 0 0 22px rgba(95, 212, 255, .1); }\n.ph b { text-transform: uppercase; letter-spacing: .12em; font-size: 12.5px; text-shadow: 0 0 6px rgba(95, 212, 255, .5); }\nbutton, .tile, .grp, .seg button, .shots .th, .wins .tb { border-radius: 2px !important; }", overview: ".desk .shot, .win .tb { border-radius: 2px; }\n.desk.cur .shot { box-shadow: 0 0 0 2px var(--a), 0 0 22px rgba(95, 212, 255, .45); }\n.desk .name, .hint { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }\n.win .wt { border-radius: 0; background: linear-gradient(var(--a), var(--a)) left top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right top / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right top / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1px 5px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 5px 1px no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1px 5px no-repeat, rgba(5, 14, 26, .7); }", wallpaper: ".w-card, [data-layout=\"mac\"] .w-card { border-radius: .3cqmin; background: linear-gradient(var(--a), var(--a)) left top / 1.4cqmin .18cqmin no-repeat, linear-gradient(var(--a), var(--a)) left top / .18cqmin 1.4cqmin no-repeat, linear-gradient(var(--a), var(--a)) right top / 1.4cqmin .18cqmin no-repeat, linear-gradient(var(--a), var(--a)) right top / .18cqmin 1.4cqmin no-repeat, linear-gradient(var(--a), var(--a)) left bottom / 1.4cqmin .18cqmin no-repeat, linear-gradient(var(--a), var(--a)) left bottom / .18cqmin 1.4cqmin no-repeat, linear-gradient(var(--a), var(--a)) right bottom / 1.4cqmin .18cqmin no-repeat, linear-gradient(var(--a), var(--a)) right bottom / .18cqmin 1.4cqmin no-repeat, rgba(5, 14, 26, .55); box-shadow: inset 0 0 0 1px rgba(150, 215, 255, .2), 0 0 2cqmin rgba(95, 212, 255, .12); }" },
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
