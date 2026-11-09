// Settings live in one JSON file in the app's data folder.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  accent: '#5e7d9c',
  wallpaper: {
    scene: 'image',           // image | video | web; nothing picked: your Windows background shows
    file: '',                 // the photo / video
    url: '',                  // the web page
    parallax: true,           // drift with the mouse
    dim: 0.15,                // darken the wallpaper so widgets stay readable
    perDesk: false,           // a different wallpaper on each virtual desktop
    desks: {},                // desktop id -> { scene, file, url, fileStamp } (null: same as the main one)
  },
  widgets: {
    layout: 'mac',            // mac (corner widgets, like macOS) | center | left (grouped, tidy) | free (drag each widget anywhere)
    clock:    { on: true,  x: 0.5,  y: 0.34, scale: 1, style: 'big' },   // big | minimal | analog
    greeting: { on: true,  x: 0.5,  y: 0.22, scale: 1 },
    date:     { on: true,  x: 0.5,  y: 0.46, scale: 1 },
    stats:    { on: true,  x: 0.08, y: 0.86, scale: 1 },
    weather:  { on: false, x: 0.92, y: 0.1,  scale: 1, city: '' },
    quote:    { on: true,  x: 0.5,  y: 0.9,  scale: 1 },
    media:    { on: true,  x: 0.86, y: 0.86, scale: 1 },
    calendar: { on: true,  x: 0.08, y: 0.14, scale: 1 },   // Mac layout
    reminders: { on: true, x: 0.08, y: 0.86, scale: 1 },   // Mac layout (your to-dos)
    today:    { on: true,  x: 0.14, y: 0.86, scale: 1 },   // next class and to-dos (only shows when there's something)   // now playing (only shows while something plays)
  },
  name: '',
  home: { hotkey: 'Alt+Space', engine: 'google', pins: [], todos: [], notes: '', timetable: [], books: [] },
  general: { startWithWindows: false, pauseOnFullscreen: true, pauseOnBattery: true, hideDesktopIcons: false, fps: 30, pauseWhenCovered: true, autoGamer: true, hideSwitchLabel: true, deskMotion: true, edgeSwitch: true, ownOsd: true, lowPower: null },
  dock: { on: false, style: 'floating', size: 'm', pinned: true, running: true, clock: true, media: true, start: true, homeBtn: true, quick: true, gear: true, magnify: true, opacity: 0.96, bin: true, shots: true, hide: 'smart', reserve: true, prevAutoHide: null },
  island: { on: true, pet: 'cat' },   // the pill at the top: timer, now playing; pet: a little friend living in it (cat, bunny, chick, panda, puppy, ghost, slime or none)
  topbar: { on: true, weather: true, media: true, battery: true, ime: false, look: 'solid', opacity: 0.96 }, // look: solid | glass (frosted, the desktop blurred behind) // a slim bar along the top, like macOS
  lock: { auto: false, alsoWallpaper: true, last: '', lastAt: 0, lastError: '' },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    if (saved?.general) delete saved.general.fps; // only the animated scenes used it, and they're gone
    const wp = saved?.wallpaper;
    if (wp) { // photo, video and web page only now: an animated scene (or "Windows") becomes the picked file, or your Windows background
      if (!['image', 'video', 'web'].includes(wp.scene)) wp.scene = /\.(mp4|webm|mkv|mov)$/i.test(wp.file || '') ? 'video' : 'image';
      for (const k of ['speed', 'intensity', 'audio', 'dayCycle', 'colors']) delete wp[k];
    }
    if (saved?.general) { delete saved.general.macButtons; delete saved.general.macButtonsV2; } // the Mac window buttons are gone
    if (saved?.topbar && !saved.topbar.imeV2) { delete saved.topbar.ime; saved.topbar.imeV2 = true; } // the input indicator is off by default now (it may get in the way of Pinyin's Shift)
    if (saved?.topbar?.opacity === 0.78) delete saved.topbar.opacity; // the old see-through default: the desktop showed through unblurred
    if (saved?.dock?.opacity === 0.85) delete saved.dock.opacity; // the old see-through default; text behind bled through
    if (saved?.widgets && !saved.widgets.macOffered) { saved.widgets.layout = 'mac'; saved.widgets.macOffered = true; } // the new Mac-style widgets, once (Customize > Widgets switches back)
    this.data = merge(DEFAULTS, saved);
  }
  get() { return this.data; }
  set(patch) {
    this.data = merge(this.data, patch);
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 300);
    return this.data;
  }
  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file); // never leave a half-written settings file
  }
}

module.exports = { Store, DEFAULTS, merge };
