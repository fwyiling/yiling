// Settings live in one JSON file in the app's data folder.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  accent: '#5e7d9c',
  wallpaper: {
    scene: 'aurora',          // aurora | particles | waves | starfield | image | video | web | windows (Windows' own background, no wallpaper window)
    speed: 1,                 // 0.25 .. 2
    intensity: 0.8,           // 0 .. 1  (how much colour/motion)
    parallax: true,           // drift with the mouse
    audio: false,             // pulse with the music playing on the PC
    dayCycle: false,          // tint the colours by time of day
    colors: ['#5e7d9c', '#a7afb8', '#2b3a4d'],
    file: '',                 // image / video path for those scenes
    url: '',                  // web page for the "web" scene
    dim: 0.15,                // darken the wallpaper so widgets stay readable
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
  island: { on: true },   // the pill at the top: timer, now playing
  topbar: { on: true, weather: true, media: true, battery: true, ime: true, look: 'solid', opacity: 0.96 }, // look: solid | glass (frosted, the desktop blurred behind) // a slim bar along the top, like macOS
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
    if (saved?.general?.fps === 60 || saved?.general?.fps === '60') delete saved.general.fps; // old default; 30 looks the same for these slow scenes at half the work
    if (saved?.general) { delete saved.general.macButtons; delete saved.general.macButtonsV2; } // the Mac window buttons are gone
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
