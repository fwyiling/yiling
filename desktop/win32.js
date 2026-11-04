// Windows-only: put a window behind the desktop icons, and spot full-screen apps.
//
// Technique from Lively Wallpaper and the Windows 11 24H2 fixes in C0uki/beautiful-wallpaper#83 and
// youllook/VibingWrapper#7. Sending 0x052C to Progman makes Explorer create the wallpaper layer:
//  - classic desktop (Windows 10, Windows 11 up to 23H2): a top-level WorkerW sits behind the
//    WorkerW that holds the icons (SHELLDLL_DefView); our window becomes its child.
//  - raised desktop (Windows 11 24H2+): SHELLDLL_DefView and WorkerW are both children of Progman;
//    our window becomes a *layered* child of Progman, placed directly below the icons.
// The layout is detected from the window tree, not the Windows version.
const isWin = process.platform === 'win32';
let u = null, setupError = null;

// Builds the bindings once. If anything fails it stays off (and says why) instead of retrying:
// a retry would re-register the same koffi types and throw "Duplicate type name".
function load() {
  if (u || !isWin || setupError) return u;
  try { u = bind(); } catch (e) { setupError = e; console.error('[win32] setup failed:', e.message); }
  return u;
}
function bind() {
  let u;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  const EnumProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lparam)');
  u = {
    koffi, RECT, EnumProc,
    FindWindowW: user32.func('intptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
    FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, str16 cls, str16 name)'),
    SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint msg, uintptr_t wp, intptr_t lp, uint flags, uint timeout, _Out_ uintptr_t *result)'),
    EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lparam)'),
    SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t hwnd)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int index)'),
    SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int index, intptr_t value)'),
    SetLayeredWindowAttributes: user32.func('bool __stdcall SetLayeredWindowAttributes(intptr_t hwnd, uint key, uint8 alpha, uint flags)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint flags)'),
    GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
    GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, uint16_t *buf, int max)'),
    PostMessageW: user32.func('bool __stdcall PostMessageW(intptr_t hwnd, uint msg, uintptr_t wp, intptr_t lp)'),
    // taskbar, wallpaper and the dock's window list
    // the same Win32 function again, with the last-but-two parameter as a string (koffi: convention, symbol, result, params)
    SendMessageTimeoutStr: user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['intptr_t', 'uint', 'uintptr_t', 'str16', 'uint', 'uint', koffi.out(koffi.pointer('uintptr_t'))]),
    SystemParametersInfoW: user32.func('bool __stdcall SystemParametersInfoW(uint action, uint param, str16 value, uint flags)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
    GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint cmd)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, uint16_t *buf, int max)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t hwnd, int cmd)'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(intptr_t hwnd)'),
    SwitchToThisWindow: user32.func('void __stdcall SwitchToThisWindow(intptr_t hwnd, bool altTab)'),
    shell32: koffi.load('shell32.dll'),
    kernel32: koffi.load('kernel32.dll'),
    dwmapi: koffi.load('dwmapi.dll'),
  };
  const APPBARDATA = koffi.struct('APPBARDATA', { cbSize: 'uint32', hWnd: 'intptr_t', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t' });
  Object.assign(u, {
    APPBARDATA,
    SHAppBarMessage: u.shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32 msg, _Inout_ APPBARDATA *data)'),
    OpenProcess: u.kernel32.func('intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    QueryFullProcessImageNameW: u.kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32 flags, uint16_t *buf, _Inout_ uint32_t *size)'),
    CloseHandle: u.kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
    DwmGetWindowAttribute: u.dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32 attr, _Out_ int32_t *value, uint32 size)'),
  });
  return u;
}
/** Run a Win32 helper without ever letting an error escape into the app (timers call these). */
const safe = (name, fn, fallback) => (...args) => {
  try { return fn(...args); } catch (e) { console.error(`[win32] ${name} failed:`, e.message); return typeof fallback === 'function' ? fallback(e) : fallback; }
};

const GWL_STYLE = -16, GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000, WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000;
const WS_SYSMENU = 0x00080000, WS_MINMAXBOX = 0x00030000, WS_MAXIMIZE = 0x01000000, WS_EX_LAYERED = 0x00080000;
const SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010, SWP_FRAMECHANGED = 0x0020, SWP_SHOWWINDOW = 0x0040;

// Window handles are plain integers (they fit in 32 bits even on 64-bit Windows).
const hwndOf = (win) => { const buf = win.getNativeWindowHandle(); return Number(buf.length >= 8 ? buf.readBigInt64LE(0) : buf.readInt32LE(0)); };
const isNull = (h) => !h || Number(h) === 0;
const same = (a, b) => !isNull(a) && Number(a) === Number(b);

function spawnLayer(progman, wp, lp) {
  const out = [0];
  u.SendMessageTimeoutW(progman, 0x052C, wp, lp, 0, 1000, out);
}

function findLayer() {
  const progman = u.FindWindowW('Progman', null);
  if (isNull(progman)) return null;
  const tryFind = () => {
    const defView = u.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
    const worker = u.FindWindowExW(progman, 0, 'WorkerW', null);
    if (!isNull(defView) && !isNull(worker)) return { raised: true, parent: progman, after: defView, worker };
    let classic = null;
    const cb = u.koffi.register((hwnd) => {
      const view = u.FindWindowExW(hwnd, 0, 'SHELLDLL_DefView', null);
      if (!isNull(view)) { const w = u.FindWindowExW(0, hwnd, 'WorkerW', null); if (!isNull(w)) classic = w; }
      return true;
    }, u.koffi.pointer(u.EnumProc));
    try { u.EnumWindows(cb, 0); } finally { u.koffi.unregister(cb); }
    return classic ? { raised: false, parent: classic, after: null } : null;
  };
  spawnLayer(progman, 0xD, 1); // the form 24H2 needs; older builds accept it too
  let layer = tryFind();
  if (!layer) { spawnLayer(progman, 0, 0); layer = tryFind(); }
  return layer;
}

const WS_EX_NOREDIRECTIONBITMAP = 0x00200000;
// How the window joins the raised (24H2+) desktop. 'auto' is what the app uses; the others exist so the
// Windows test run can compare them on a real machine.
const RAISED_STRATEGIES = ['progman-layered', 'progman-layered+bottom', 'worker-child', 'progman-plain+bottom', 'progman-layered-redirected+bottom'];
const HWND_BOTTOM = 1, SWP_NOSIZE = 0x0001, SWP_NOMOVE = 0x0002;

/** Make an Electron window part of the desktop background. rect is in physical screen pixels. */
function attachToDesktop(win, rect, strategy = 'auto') {
  if (!load()) return { ok: false, reason: 'not Windows' };
  const layer = findLayer();
  if (!layer) return { ok: false, reason: 'desktop layer not found' };
  const hwnd = hwndOf(win);
  const full = !layer.raised ? 'classic' : strategy === 'auto' ? 'progman-layered' : strategy;
  const [how, extra] = full.split('+');
  let style = Number(u.GetWindowLongPtrW(hwnd, GWL_STYLE));
  style &= ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINMAXBOX | WS_MAXIMIZE);
  style |= WS_CHILD;
  u.SetWindowLongPtrW(hwnd, GWL_STYLE, style >>> 0); // keep it an unsigned 32-bit style value
  if (how === 'progman-layered' || how === 'progman-layered-redirected') { // Progman has no redirection surface: only layered children show up
    let ex = Number(u.GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) | WS_EX_LAYERED;
    if (how === 'progman-layered-redirected') ex &= ~WS_EX_NOREDIRECTIONBITMAP; // Chromium sets this; layered windows need a redirection bitmap
    u.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex >>> 0);
    u.SetLayeredWindowAttributes(hwnd, 0, 255, 0x2);
  }
  const parent = how === 'classic' ? layer.parent : how === 'worker-child' ? layer.worker : layer.parent;
  u.SetParent(hwnd, parent);
  // child windows are positioned relative to the parent, which covers the whole virtual screen
  const vx = u.GetSystemMetrics(76), vy = u.GetSystemMetrics(77); // SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
  const x = rect.x - vx, y = rect.y - vy;
  if (how.startsWith('progman')) u.SetWindowPos(hwnd, layer.after, x, y, rect.width, rect.height, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
  else u.SetWindowPos(hwnd, 0, x, y, rect.width, rect.height, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
  // Explorer's own WorkerW draws the plain wallpaper; it must stay the bottom child of Progman or it covers us (as Lively does)
  if (extra === 'bottom' && layer.worker) u.SetWindowPos(layer.worker, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  if (!same(u.GetParent(hwnd), parent)) return { ok: false, reason: 'Explorer refused the window', how: full };
  return { ok: true, raised: layer.raised, how: full };
}

/** True when the foreground window covers a whole monitor (a game or full-screen video). */
function fullscreenAppRunning(displays) {
  if (!load()) return false;
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return false;
  const buf = new Uint16Array(64);
  const n = u.GetClassNameW(fg, buf, 64);
  const cls = String.fromCharCode(...buf.slice(0, n));
  if (cls === 'Progman' || cls === 'WorkerW' || cls === 'Shell_TrayWnd') return false; // the desktop itself
  const r = {};
  if (!u.GetWindowRect(fg, r)) return false;
  return displays.some((d) => r.left <= d.x && r.top <= d.y && r.right >= d.x + d.width && r.bottom >= d.y + d.height);
}

/** Show or hide the desktop icons (the same toggle as Desktop > View > Show desktop icons). */
function setDesktopIcons(show) {
  if (!load()) return false;
  const progman = u.FindWindowW('Progman', null);
  let view = u.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  if (isNull(view)) { // classic layout: the icons live in a WorkerW
    const cb = u.koffi.register((hwnd) => { const v = u.FindWindowExW(hwnd, 0, 'SHELLDLL_DefView', null); if (!isNull(v)) view = v; return true; }, u.koffi.pointer(u.EnumProc));
    try { u.EnumWindows(cb, 0); } finally { u.koffi.unregister(cb); }
  }
  if (isNull(view)) return false;
  const list = u.FindWindowExW(view, 0, 'SysListView32', null);
  const visible = !isNull(list) && (Number(u.GetWindowLongPtrW(list, GWL_STYLE)) & 0x10000000) !== 0; // WS_VISIBLE
  if (visible !== show) u.PostMessageW(view, 0x0111, 0x7402, 0); // WM_COMMAND "toggle desktop icons"
  return true;
}

// ---------- desktop picture ----------
/** Set the regular Windows wallpaper (shown before the app starts, and if it isn't running). */
function setWindowsWallpaper(file) {
  if (!load()) return false;
  return u.SystemParametersInfoW(0x0014, 0, file, 0x01 | 0x02); // SPI_SETDESKWALLPAPER, save + tell everyone
}

// ---------- taskbar ----------
const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABM_GETSTATE = 4, ABM_SETSTATE = 10, ABS_AUTOHIDE = 1;
const appbar = (hwnd, extra = {}) => ({ cbSize: u.koffi.sizeof(u.APPBARDATA), hWnd: hwnd, uCallbackMessage: 0, uEdge: 3, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0, ...extra });
function taskbarAutoHide() {
  if (!load()) return false;
  const d = appbar(u.FindWindowW('Shell_TrayWnd', null));
  return (Number(u.SHAppBarMessage(ABM_GETSTATE, d)) & ABS_AUTOHIDE) !== 0;
}
/** The same switch as Settings > Personalization > Taskbar > Automatically hide the taskbar. */
function setTaskbarAutoHide(on) {
  if (!load()) return false;
  u.SHAppBarMessage(ABM_SETSTATE, appbar(u.FindWindowW('Shell_TrayWnd', null), { lParam: on ? ABS_AUTOHIDE : 0 }));
  return true;
}
/** Tell Explorer that taskbar settings in the registry changed, so it redraws without a restart. */
function refreshTaskbar() {
  if (!load()) return;
  const out = [0];
  for (const area of ['TraySettings', 'ImmersiveColorSet', 'WindowsThemeElement']) u.SendMessageTimeoutStr(0xffff, 0x001A, 0, area, 0x0002, 200, out); // HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG
}

// ---------- the dock: reserve a strip of the screen like the taskbar does ----------
function reserveEdge(win, rect, edge = 'bottom') {
  if (!load()) return null;
  const hwnd = hwndOf(win), uEdge = { left: 0, top: 1, right: 2, bottom: 3 }[edge];
  u.SHAppBarMessage(ABM_NEW, appbar(hwnd, { uCallbackMessage: 0x0400 + 77 }));
  const d = appbar(hwnd, { uEdge, rc: { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height } });
  u.SHAppBarMessage(ABM_QUERYPOS, d);
  if (edge === 'bottom') d.rc.top = d.rc.bottom - rect.height; else if (edge === 'top') d.rc.bottom = d.rc.top + rect.height;
  u.SHAppBarMessage(ABM_SETPOS, d);
  return { x: d.rc.left, y: d.rc.top, width: d.rc.right - d.rc.left, height: d.rc.bottom - d.rc.top };
}
function releaseEdge(win) { if (load() && !win.isDestroyed()) u.SHAppBarMessage(ABM_REMOVE, appbar(hwndOf(win))); }

// ---------- open windows, for the dock ----------
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow']);
function exeOf(pid) {
  const h = u.OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
  if (isNull(h)) return '';
  try { const buf = new Uint16Array(1024), size = [1024]; return u.QueryFullProcessImageNameW(h, 0, buf, size) ? String.fromCharCode(...buf.slice(0, size[0])) : ''; }
  finally { u.CloseHandle(h); }
}
/** Top-level app windows a taskbar would show: visible, not owned, not tool windows, not cloaked. */
function listWindows(ownPids = []) {
  if (!load()) return [];
  const out = [], fg = Number(u.GetForegroundWindow());
  const cb = u.koffi.register((hwnd) => {
    if (!u.IsWindowVisible(hwnd) || !isNull(u.GetWindow(hwnd, 4))) return true; // GW_OWNER
    const ex = Number(u.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    if ((ex & 0x80) && !(ex & 0x40000)) return true; // WS_EX_TOOLWINDOW without WS_EX_APPWINDOW
    const cloaked = [0];
    if (u.DwmGetWindowAttribute(hwnd, 14, cloaked, 4) === 0 && cloaked[0]) return true; // DWMWA_CLOAKED: hidden UWP / other desktops
    const tb = new Uint16Array(256), n = u.GetWindowTextW(hwnd, tb, 256);
    if (!n) return true;
    const cls = new Uint16Array(128), cn = u.GetClassNameW(hwnd, cls, 128);
    if (SHELL_CLASSES.has(String.fromCharCode(...cls.slice(0, cn)))) return true;
    const pid = [0]; u.GetWindowThreadProcessId(hwnd, pid);
    if (ownPids.includes(pid[0])) return true;
    out.push({ hwnd: Number(hwnd), title: String.fromCharCode(...tb.slice(0, n)), exe: exeOf(pid[0]), active: Number(hwnd) === fg, minimized: !!u.IsIconic(hwnd) });
    return true;
  }, u.koffi.pointer(u.EnumProc));
  try { u.EnumWindows(cb, 0); } finally { u.koffi.unregister(cb); }
  return out;
}
/** Click on a dock item: bring the window forward, or minimize it if it's already in front. */
function focusWindow(hwnd) {
  if (!load()) return;
  if (Number(u.GetForegroundWindow()) === hwnd && !u.IsIconic(hwnd)) { u.ShowWindow(hwnd, 6); return; } // SW_MINIMIZE
  if (u.IsIconic(hwnd)) u.ShowWindow(hwnd, 9); // SW_RESTORE
  if (!u.SetForegroundWindow(hwnd)) u.SwitchToThisWindow(hwnd, true);
}

module.exports = {
  isWin,
  RAISED_STRATEGIES,
  status: () => ({ ready: !!load(), error: setupError?.message || '' }),
  attachToDesktop: safe('attachToDesktop', attachToDesktop, (e) => ({ ok: false, reason: e.message })),
  fullscreenAppRunning: safe('fullscreenAppRunning', fullscreenAppRunning, false),
  setDesktopIcons: safe('setDesktopIcons', setDesktopIcons, false),
  setWindowsWallpaper: safe('setWindowsWallpaper', setWindowsWallpaper, false),
  taskbarAutoHide: safe('taskbarAutoHide', taskbarAutoHide, false),
  setTaskbarAutoHide: safe('setTaskbarAutoHide', setTaskbarAutoHide, false),
  refreshTaskbar: safe('refreshTaskbar', refreshTaskbar),
  reserveEdge: safe('reserveEdge', reserveEdge, null),
  releaseEdge: safe('releaseEdge', releaseEdge),
  listWindows: safe('listWindows', listWindows, []),
  focusWindow: safe('focusWindow', focusWindow),
};
