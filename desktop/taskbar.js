// Windows taskbar options: the same switches as Settings > Personalization > Taskbar / Colors.
// They are per-user registry values, changed with Windows' own reg.exe (no admin rights), and only
// when you change an option here – starting the app never touches them.
const { execFile } = require('child_process');
const win32 = require('./win32');

const ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const SEARCH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search';
const THEME = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const VALUES = {
  align: { key: ADV, name: 'TaskbarAl', to: (v) => (v === 'left' ? 0 : 1), from: (n) => (n === 0 ? 'left' : 'center'), def: 'center' },
  search: { key: SEARCH, name: 'SearchboxTaskbarMode', to: (v) => ({ hidden: 0, icon: 1, box: 2 }[v] ?? 2), from: (n) => (['hidden', 'icon', 'box', 'box'][n] ?? 'box'), def: 'box' },
  taskView: { key: ADV, name: 'ShowTaskViewButton', to: (v) => (v ? 1 : 0), from: (n) => n !== 0, def: true },
  accentTint: { key: THEME, name: 'ColorPrevalence', to: (v) => (v ? 1 : 0), from: (n) => n === 1, def: false },
};

const run = (args) => new Promise((resolve) => execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve(err ? null : stdout)));
async function readDword(key, name) {
  const out = await run(['query', key, '/v', name]);
  const m = out && /REG_DWORD\s+0x([0-9a-f]+)/i.exec(out);
  return m ? parseInt(m[1], 16) : null;
}

/** Current taskbar settings as Windows has them. */
async function read() {
  if (!win32.isWin) return { align: 'center', search: 'box', taskView: true, accentTint: false, autoHide: false, supported: false };
  const out = { supported: true };
  for (const [k, v] of Object.entries(VALUES)) { const n = await readDword(v.key, v.name); out[k] = n == null ? v.def : v.from(n); }
  out.autoHide = win32.taskbarAutoHide();
  return out;
}

/** Change one or more options, then let Explorer pick them up. */
async function apply(patch) {
  if (!win32.isWin) return read();
  for (const [k, val] of Object.entries(patch)) {
    if (k === 'autoHide') { win32.setTaskbarAutoHide(!!val); continue; }
    const v = VALUES[k];
    if (v) await run(['add', v.key, '/v', v.name, '/t', 'REG_DWORD', '/d', String(v.to(val)), '/f']);
  }
  win32.refreshTaskbar();
  return read();
}

// Precision touchpad gestures (Settings > Bluetooth & devices > Touchpad). ThreeFingerSlideEnabled:
// 0 nothing, 1 switch apps and show desktop, 2 switch desktops and show desktop, 3 audio and volume, 65535 custom.
const TOUCHPAD = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad';
const SLIDE = { 0: 'nothing', 1: 'apps', 2: 'desktops', 3: 'volume', 65535: 'custom' };
async function gestures() {
  if (!win32.isWin) return { precision: false, three: null };
  const out = await run(['query', TOUCHPAD]);
  const n = await readDword(TOUCHPAD, 'ThreeFingerSlideEnabled');
  return { precision: !!out, three: SLIDE[n ?? 1] || 'apps' }; // missing value = Windows' default, switch apps
}
async function setThreeFingerApps() {
  if (!win32.isWin) return gestures();
  await run(['add', TOUCHPAD, '/v', 'ThreeFingerSlideEnabled', '/t', 'REG_DWORD', '/d', '1', '/f']);
  win32.refreshTaskbar();
  return gestures();
}

module.exports = { read, apply, gestures, setThreeFingerApps };
