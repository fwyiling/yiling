// Runs win32.js's whole setup on any OS: pretends to be Windows and swaps the Windows DLLs for fakes,
// while every function declaration still goes through koffi's real parser. Catches bad declarations
// (like the one that crashed with "Duplicate type name 'RECT'") without needing Windows.
// Usage: node test/win32-bindings.test.js
const assert = require('assert');
const koffi = require('koffi');

const declared = [];
const fakeLib = (dll) => ({
  func(...args) {
    // koffi.proto accepts the same forms as lib.func; give each a unique name so nothing collides
    const proto = args.length === 1 ? koffi.proto(args[0].replace(/(\w+)\s*\(/, (_m, n) => `${dll}_${n}_${declared.length}(`))
      : koffi.proto(args[0], `${dll}_${args[1]}_${declared.length}`, args[2], args[3]);
    declared.push({ dll, args });
    assert.ok(proto, 'declaration did not parse');
    return () => 0; // every fake call returns 0 / null / false
  },
});
koffi.load = (dll) => fakeLib(dll.replace('.dll', ''));
Object.defineProperty(process, 'platform', { value: 'win32' });

const w = require('../win32');
assert.strictEqual(w.isWin, true);
const st = w.status();
assert.strictEqual(st.error, '', `setup failed: ${st.error}`);
assert.strictEqual(st.ready, true);
console.log(`ok   setup declared ${declared.length} functions`);

const fakeWin = { getNativeWindowHandle: () => Buffer.alloc(8), isDestroyed: () => false };
const calls = {
  attachToDesktop: () => w.attachToDesktop(fakeWin, { x: 0, y: 0, width: 1920, height: 1080 }),
  fullscreenAppRunning: () => w.fullscreenAppRunning([{ x: 0, y: 0, width: 1920, height: 1080 }]),
  setDesktopIcons: () => w.setDesktopIcons(true),
  setWindowsWallpaper: () => w.setWindowsWallpaper('C:\\x.jpg'),
  taskbarAutoHide: () => w.taskbarAutoHide(),
  setTaskbarAutoHide: () => w.setTaskbarAutoHide(true),
  refreshTaskbar: () => w.refreshTaskbar(),
  reserveEdge: () => w.reserveEdge(fakeWin, { x: 0, y: 1016, width: 1920, height: 64 }),
  releaseEdge: () => w.releaseEdge(fakeWin),
  listWindows: () => w.listWindows([1]),
  focusWindow: () => w.focusWindow(123),
  desktopTree: () => w.desktopTree(),
  mediaKey: () => w.mediaKey(0xB3),
  showTaskbar: () => w.showTaskbar(true),
  systemOverlayActive: () => w.systemOverlayActive(),
  hideSwitchLabel: () => w.hideSwitchLabel({ x: 0, y: 0, width: 1920, height: 1080 }),
  taskbarVisible: () => w.taskbarVisible(),
  taskbarOpacity: () => w.taskbarOpacity(),
  watchTaskbar: () => w.watchTaskbar(() => {}),
  unwatchTaskbar: () => w.unwatchTaskbar(),
  foregroundKind: () => w.foregroundKind(),
  hideNow: () => w.hideNow(123),
  iconPixels: () => w.iconPixels('C:\\Windows\\explorer.exe'),
  placeWindow: () => w.placeWindow(fakeWin, { x: 0, y: 0, width: 100, height: 30 }),
  windowRect: () => w.windowRect(fakeWin),
  battery: () => w.battery(),
  capsLock: () => w.capsLock(),
  refreshRates: () => w.refreshRates(),
  wifiScan: () => w.wifiScan(),
  autoAccent: () => w.autoAccent(),
  repaintDesktop: () => w.repaintDesktop(),
  setBlur: () => w.setBlur(fakeWin, true),
  dragState: () => w.dragState(),
  edgeSnap: () => w.edgeSnap(true),
  regString: () => w.regString('Control Panel\\Desktop', 'WallPaper'),
  shellHook: () => w.shellHook(fakeWin),
  unhookShell: () => w.unhookShell(fakeWin),
  thumbRegister: () => w.thumbRegister(fakeWin, 123),
  thumbSize: () => w.thumbSize(1),
  thumbPlace: () => w.thumbPlace(1, { x: 10, y: 10, w: 200, h: 120 }),
  thumbUnregister: () => w.thumbUnregister(1),
  closeWindow: () => w.closeWindow(123),
  recycleBin: () => w.recycleBin(),
  inputMode: () => w.inputMode(),
  allowForeground: () => w.allowForeground(),
  makeToolWindow: () => w.makeToolWindow(fakeWin),
  virtualDesktops: () => w.virtualDesktops(),
  foregroundRect: () => w.foregroundRect([1]),
  pressKeys: () => w.pressKeys([0x5B, 0x41]),
};
const errors = [];
const origError = console.error;
console.error = (...a) => errors.push(a.join(' '));
for (const [name, fn] of Object.entries(calls)) { const r = fn(); console.log(`ok   ${name} -> ${JSON.stringify(r)}`); }
console.error = origError;
// with fake DLLs returning 0 there is no desktop layer; that must be reported, not thrown
assert.deepStrictEqual(errors, [], `helpers threw: ${errors.join('; ')}`);
assert.strictEqual(w.status().ready, true, 'setup must not be redone');
console.log('all win32 bindings fine');
