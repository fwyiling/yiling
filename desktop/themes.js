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
    // after the line art of mecha anime cockpit screens: light plates with angled ends, thin white outlines, outlined pills
    id: 'mecha', name: 'Mecha', author: 'Syndicates', description: 'Line art like a mecha anime cockpit: light plates with angled ends, thin white outlines, outlined pills in a bracket, a frosted dock with white fins.', tags: ['all', 'anime'], accent: '#a6d6f2',
    variables: { '--t': '#eef5fb', '--m': '#a9bccb', '--line': 'rgba(236, 244, 252, .22)', '--bg': 'rgba(10, 15, 24, .9)', '--card': 'rgba(236, 244, 252, .05)', '--sd-topbar-bg': 'transparent', '--sd-topbar-border': '0', '--sd-island-bg': 'rgba(6, 10, 16, .85)', '--sd-panel-radius': '2px', '--sd-dock-radius': '0' },
    styles: { topbar: "/* line art over the wallpaper, like a mecha anime's cockpit screens: light plates with angled ends, thin white\n   outlines, an outlined clock, the status icons as outlined pills inside one bracket */\n#bar { position: relative; padding: 0 8px; background: linear-gradient(rgba(6, 10, 16, .5), rgba(6, 10, 16, 0)); box-shadow: inset 0 1px rgba(236, 244, 252, .55); }\n.left { gap: 0; }\n/* plates: an outline (the plate itself) with the fill drawn 1 px inside, both cut at the end */\n#logo, #app:not(:empty) { position: relative; isolation: isolate; height: 19px; border-radius: 0; background: rgba(236, 244, 252, .9); clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%); }\n#logo::before, #app:not(:empty)::before { content: \"\"; position: absolute; inset: 1px 1.5px 1px 1px; z-index: -1; background: linear-gradient(rgba(206, 226, 244, .96), rgba(178, 204, 228, .96)); clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%); }\n#logo { width: 38px; padding-right: 8px; }\n#logo img { filter: brightness(.25); }\n#app:not(:empty) { display: flex; align-items: center; margin-left: 3px; min-width: 200px; padding: 0 26px 0 12px; color: #0e1b2a; font-weight: 600; font-size: 11px; }\n#app:empty { display: none; }\n#ovBtn { margin-left: 8px; border-radius: 0; box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .9); height: 17px; }\n#desks button { border-radius: 0; background: transparent; color: rgba(236, 244, 252, .75); box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .35); }\n#desks button.on { background: rgba(236, 244, 252, .9); color: #0e1b2a; box-shadow: none; }\n/* the status icons: outlined pills, held together by one bracket underneath */\n.right { position: relative; gap: 5px; padding: 0 7px; }\n.right::before { content: \"\"; position: absolute; left: 0; right: 0; top: 4px; bottom: 1px; border: 1px solid rgba(236, 244, 252, .7); border-top: 0; pointer-events: none; }\n.right > :is(.seg, .tray, #np):not([hidden]):not(:empty):not(#clock) { height: 17px; padding: 0 8px; border-radius: 9px; background: rgba(6, 10, 16, .38); box-shadow: inset 0 0 0 1.2px rgba(236, 244, 252, .9); }\n.tray button { height: 15px; border-radius: 7px; }\n.seg:is(button):hover, #np:hover, .tray button:hover, #ovBtn:hover { background-color: rgba(236, 244, 252, .2) !important; }\n/* the clock: a dark box with a white outline and a small tick on top */\n#clock { position: relative; height: 19px; margin-left: 4px; padding: 0 12px; border-radius: 0; background: rgba(6, 10, 16, .8); box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .9); font-weight: 600; font-size: 11px; }\n#clock::before { content: \"\"; position: absolute; left: 50%; top: -3px; width: 1px; height: 4px; background: rgba(236, 244, 252, .9); }\n.cell { border-color: rgba(236, 244, 252, .9); } .cell::after { background: rgba(236, 244, 252, .9); } .cell b { background: #eef5fb; }", dock: "/* frosted light glass with a white base line and a white fin at each bottom corner */\n#dock { border-radius: 0; background: linear-gradient(rgba(214, 232, 248, .34), rgba(190, 214, 236, .22)); border: 1px solid rgba(236, 244, 252, .45); border-bottom: 2px solid rgba(242, 248, 255, .92); box-shadow: 0 10px 30px rgba(0, 0, 0, .35); padding: 0 26px; }\n#dock::before, #dock::after { content: \"\"; position: absolute; bottom: -2px; width: 20px; height: 20px; background: rgba(242, 248, 255, .94); pointer-events: none; }\n#dock::before { left: -1px; clip-path: polygon(0 0, 100% 100%, 0 100%); }\n#dock::after { right: -1px; clip-path: polygon(100% 0, 100% 100%, 0 100%); }\n.item { border-radius: 4px; }\n.item:hover { background: rgba(255, 255, 255, .18); }\n.item.sys { background: rgba(255, 255, 255, .12); }\n.item.running::after { width: 5px; height: 2px; border-radius: 0; background: rgba(255, 255, 255, .75); }\n.item.active::after { width: 14px; height: 2px; border-radius: 0; background: #fff; }\n.sep { background: rgba(255, 255, 255, .45); }", island: "#island, #island.open, #island.alerting, #island.osding { border-radius: 0; box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .9); }\n#island.open, #island.alerting { border-radius: 2px; }\n.presets button, .pill-b, .round, .go, .big-art { border-radius: 2px; }\n.go, .pill-b.accent { color: #0e1b2a; }", panels: ".panel { border-radius: 2px; border-color: rgba(236, 244, 252, .55); clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }\n.ph b { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; }\nbutton, .tile, .grp { border-radius: 2px !important; }", overview: ".desk .shot, .win .tb { border-radius: 0; }\n.desk.cur .shot { box-shadow: 0 0 0 1.5px rgba(236, 244, 252, .9); }\n.desk .name { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }\n.win .wt { border-radius: 0; box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .45); }", wallpaper: ".w-card, [data-layout=\"mac\"] .w-card { border-radius: .2cqmin; background: rgba(190, 214, 236, .18); box-shadow: inset 0 0 0 1px rgba(236, 244, 252, .55); }" },
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
