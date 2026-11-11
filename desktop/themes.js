// Themes, after Seelen UI's: a theme is a name, a description and tags, variables (colours, corners, font), CSS
// shared by every part, and CSS for each part (dock, top bar, island, panels, Home, overview, desktop widgets).
// Several can be on at once, in order: a later one wins where they overlap. Built-in themes ship with the app;
// your own and imported ones are .sdtheme files (JSON) in the themes folder, to share with anyone.
// Theme CSS only styles the app's own pages, and their Content-Security-Policy blocks anything loaded from the web.
const fs = require('fs');
const path = require('path');

const SURFACES = ['dock', 'topbar', 'island', 'panels', 'home', 'overview', 'wallpaper', 'settings'];
const SURFACE_NAMES = { dock: 'Dock', topbar: 'Top bar', island: 'Island', panels: 'Panels and menus', home: 'Home', overview: 'Desktops overview', wallpaper: 'Desktop widgets', settings: 'Customize window' };
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
    // line art like a mecha anime's cockpit screens: bevel-cut light plates and panels with thin light outlines
    id: 'mecha', name: 'Mecha', author: 'Syndicates', description: 'Line art like a mecha anime cockpit: bevel-cut plates and panels with thin light outlines, a frosted bevel-cut dock.', tags: ['all', 'anime'], accent: '#a6d6f2',
    variables: { '--t': '#eef5fb', '--m': '#a9bccb', '--line': 'rgba(236, 244, 252, .22)', '--bg': 'rgba(10, 15, 24, .93)', '--card': 'rgba(236, 244, 252, .05)', '--sd-topbar-bg': 'transparent', '--sd-topbar-border': '0', '--sd-island-bg': 'rgba(6, 10, 16, .88)', '--sd-panel-radius': '0', '--sd-dock-radius': '0' },
    styles: { topbar: "/* line art over the wallpaper: bevel-cut light plates for the app, one bevel-cut panel for the status icons and\n   the clock, a hairline along the top of the screen */\n#bar { position: relative; padding: 0 8px; background: linear-gradient(rgba(6, 10, 16, .5), rgba(6, 10, 16, 0)); box-shadow: inset 0 1px rgba(236, 244, 252, .5); }\n.left { gap: 6px; }\n#logo { height: 19px; width: 30px; border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpolygon points='0.5,0.5 17.5,0.5 17.5,12 12,17.5 0.5,17.5' fill='rgba%28214,230,246,.92%29' stroke='rgba%28236,244,252,.85%29' stroke-width='1'/%3E%3C/svg%3E\") 6 fill / 6px stretch; background: none; }\n#logo img { filter: brightness(.22); }\n#app:not(:empty) { display: flex; align-items: center; height: 19px; min-width: 190px; padding: 0 22px 0 11px; color: #0e1b2a; font-weight: 600; font-size: 11px; border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpolygon points='0.5,0.5 23.5,0.5 23.5,16 16,23.5 0.5,23.5' fill='rgba%28214,230,246,.9%29' stroke='rgba%28236,244,252,.85%29' stroke-width='1'/%3E%3C/svg%3E\") 8 fill / 8px stretch; background: none; }\n#app:empty { display: none; }\n#ovBtn { border-radius: 2px; }\n#desks { gap: 1px; }\n#desks button { height: 17px; min-width: 19px; background: transparent; color: rgba(236, 244, 252, .7); border-radius: 0; }\n#desks button:hover:not(.on) { background: rgba(236, 244, 252, .14); color: #fff; }\n#desks button.on { color: #0e1b2a; border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpolygon points='0.5,4 4,0.5 11.5,0.5 11.5,8 8,11.5 0.5,11.5' fill='rgba%28214,230,246,.92%29' stroke='rgba%28236,244,252,.85%29' stroke-width='1'/%3E%3C/svg%3E\") 4 fill / 4px stretch; background: none; }\n/* the status icons and the clock: one panel, thin rules between groups */\n.right { height: 20px; gap: 1px; padding: 0 4px; border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpolygon points='0.5,6 6,0.5 17.5,0.5 17.5,12 12,17.5 0.5,17.5' fill='rgba%286,10,16,.5%29' stroke='rgba%28236,244,252,.7%29' stroke-width='1'/%3E%3C/svg%3E\") 6 fill / 6px stretch; background: none; }\n.right > :is(.seg, .tray, #np):not([hidden]):not(:empty) { height: 16px; border-radius: 2px; }\n.tray { padding-right: 6px; margin-right: 4px; box-shadow: 1px 0 rgba(236, 244, 252, .22); border-radius: 0 !important; }\n#clock { margin-left: 4px; padding-left: 10px !important; box-shadow: -1px 0 rgba(236, 244, 252, .28); border-radius: 0 !important; font-weight: 600; font-size: 11px; letter-spacing: .02em; }\n.seg:is(button):hover, #np:hover, .tray button:hover, #ovBtn:hover, #logo:hover { background-color: rgba(236, 244, 252, .16) !important; }\n.cell { border-color: rgba(236, 244, 252, .85); } .cell::after { background: rgba(236, 244, 252, .85); } .cell b { background: #eef5fb; }", dock: "/* frosted glass with bevel-cut corners and a thin light outline that follows them */\n#dock { border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Cpolygon points='0.5,12 12,0.5 24,0.5 35.5,12 35.5,24 24,35.5 12,35.5 0.5,24' fill='rgba%28200,222,242,.26%29' stroke='rgba%28236,244,252,.7%29' stroke-width='1'/%3E%3C/svg%3E\") 12 fill / 12px stretch; background: none; box-shadow: none; filter: drop-shadow(0 10px 22px rgba(0, 0, 0, .35)); }\n.item { border-radius: 3px; }\n.item:hover { background: rgba(255, 255, 255, .16); }\n.item.sys { background: rgba(255, 255, 255, .1); }\n.item.running::after { width: 5px; height: 2px; border-radius: 0; background: rgba(255, 255, 255, .7); }\n.item.active::after { width: 14px; height: 2px; border-radius: 0; background: #fff; }\n.sep { background: rgba(255, 255, 255, .35); }", island: "#island, #island.open, #island.alerting, #island.osding { border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Cpolygon points='0.5,6 6,0.5 17.5,0.5 17.5,12 12,17.5 0.5,17.5' fill='rgba%286,10,16,.88%29' stroke='rgba%28236,244,252,.75%29' stroke-width='1'/%3E%3C/svg%3E\") 6 fill / 6px stretch; background: none; box-shadow: none; }\n#island.open, #island.alerting { border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Cpolygon points='0.5,12 12,0.5 35.5,0.5 35.5,24 24,35.5 0.5,35.5' fill='rgba%288,12,20,.94%29' stroke='rgba%28236,244,252,.6%29' stroke-width='1'/%3E%3C/svg%3E\") 12 fill / 12px stretch; background: none; box-shadow: none; }\n.presets button, .pill-b, .round, .go, .big-art { border-radius: 2px; }\n.go, .pill-b.accent { color: #0e1b2a; }", panels: ".panel { border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Cpolygon points='0.5,12 12,0.5 35.5,0.5 35.5,24 24,35.5 0.5,35.5' fill='rgba%2810,15,24,.93%29' stroke='rgba%28236,244,252,.5%29' stroke-width='1'/%3E%3C/svg%3E\") 12 fill / 12px stretch; background: none; }\n.ph b { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; }\nbutton, .tile, .grp { border-radius: 2px !important; }", overview: ".desk .shot { border-radius: 0; clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }\n.desk.cur .name { color: #fff; } .desk.cur .shot { box-shadow: none; outline: 1.5px solid rgba(236, 244, 252, .9); outline-offset: 2px; }\n.desk .name { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }\n.win .tb { border-radius: 0; } .win .wt { border-radius: 0; }", wallpaper: ".w-card, [data-layout=\"mac\"] .w-card { border: 1px solid transparent; border-radius: 0; border-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 30 30'%3E%3Cpolygon points='0.5,10 10,0.5 29.5,0.5 29.5,20 20,29.5 0.5,29.5' fill='rgba%28190,214,236,.16%29' stroke='rgba%28236,244,252,.55%29' stroke-width='1'/%3E%3C/svg%3E\") 10 fill / 10px stretch; background: none; }" },
  },
];
// Mecha's controls (switches, buttons, lists, fields, Home, the Customize window): see mecha.js
{
  const MX = require('./mecha');
  const mecha = BUILTIN.find((t) => t.id === 'mecha');
  mecha.shared = MX.shared;
  mecha.styles.panels = MX.styles.panels; // replaces the first version's few lines
  for (const k of ['home', 'settings', 'wallpaper', 'island']) mecha.styles[k] = `${mecha.styles[k] || ''}\n${MX.styles[k]}`;
  mecha.description = 'Line art like a mecha anime cockpit: bevel-cut plates, panels, switches and buttons with thin light outlines, everywhere from the dock to Customize.';
}

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
