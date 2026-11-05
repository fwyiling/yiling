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
  const kernel32 = koffi.load('kernel32.dll');
  u = {
    koffi, RECT, EnumProc,
    GetCurrentThreadId: kernel32.func('uint32 __stdcall GetCurrentThreadId()'),
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
    keybd_event: user32.func('void __stdcall keybd_event(uint8 vk, uint8 scan, uint32 flags, uintptr_t extra)'),
    LockWorkStation: user32.func('bool __stdcall LockWorkStation()'),
    AttachThreadInput: user32.func('bool __stdcall AttachThreadInput(uint32 from, uint32 to, bool attach)'),
    BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(intptr_t hwnd)'),
    shell32: koffi.load('shell32.dll'),
    kernel32: koffi.load('kernel32.dll'),
    dwmapi: koffi.load('dwmapi.dll'),
  };
  // big icons: SHDefExtractIcon gives an HICON at any size (256 for the dock), GDI turns it into pixels
  const ICONINFO = koffi.struct('ICONINFO', { fIcon: 'int', xHotspot: 'uint32', yHotspot: 'uint32', hbmMask: 'intptr_t', hbmColor: 'intptr_t' });
  const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', { biSize: 'uint32', biWidth: 'int32', biHeight: 'int32', biPlanes: 'uint16', biBitCount: 'uint16',
    biCompression: 'uint32', biSizeImage: 'uint32', biXPelsPerMeter: 'int32', biYPelsPerMeter: 'int32', biClrUsed: 'uint32', biClrImportant: 'uint32' });
  const gdi32 = koffi.load('gdi32.dll');
  Object.assign(u, {
    ICONINFO, BITMAPINFOHEADER,
    SHDefExtractIconW: u.shell32.func('long __stdcall SHDefExtractIconW(str16 file, int index, uint flags, _Out_ intptr_t *large, _Out_ intptr_t *small, uint size)'),
    GetIconInfo: user32.func('bool __stdcall GetIconInfo(intptr_t icon, _Out_ ICONINFO *info)'),
    DestroyIcon: user32.func('bool __stdcall DestroyIcon(intptr_t icon)'),
    CreateCompatibleDC: gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)'),
    DeleteDC: gdi32.func('bool __stdcall DeleteDC(intptr_t hdc)'),
    DeleteObject: gdi32.func('bool __stdcall DeleteObject(intptr_t obj)'),
    GetDIBits: gdi32.func('int __stdcall GetDIBits(intptr_t hdc, intptr_t bmp, uint start, uint lines, _Out_ uint8_t *bits, _Inout_ BITMAPINFOHEADER *info, uint usage)'),
  });
  const advapi32 = koffi.load('advapi32.dll');
  u.RegGetValueW = advapi32.func('long __stdcall RegGetValueW(intptr_t hkey, str16 sub, str16 value, uint32 flags, void *type, _Out_ uint8_t *data, _Inout_ uint32_t *size)');
  const SYSTEM_POWER_STATUS = koffi.struct('SYSTEM_POWER_STATUS', { ACLineStatus: 'uint8', BatteryFlag: 'uint8', BatteryLifePercent: 'uint8', SystemStatusFlag: 'uint8', BatteryLifeTime: 'uint32', BatteryFullLifeTime: 'uint32' });
  u.SYSTEM_POWER_STATUS = SYSTEM_POWER_STATUS;
  u.GetSystemPowerStatus = u.kernel32.func('bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *status)');
  const APPBARDATA = koffi.struct('APPBARDATA', { cbSize: 'uint32', hWnd: 'intptr_t', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t' });
  Object.assign(u, {
    APPBARDATA,
    SHAppBarMessage: u.shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32 msg, _Inout_ APPBARDATA *data)'),
    OpenProcess: u.kernel32.func('intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    QueryFullProcessImageNameW: u.kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t proc, uint32 flags, uint16_t *buf, _Inout_ uint32_t *size)'),
    CloseHandle: u.kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
    DwmGetWindowAttribute: u.dwmapi.func('long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32 attr, _Out_ int32_t *value, uint32 size)'),
    // the same function for DWMWA_EXTENDED_FRAME_BOUNDS (the visible frame, without the invisible resize border)
    DwmGetFrameRect: u.dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['intptr_t', 'uint32', koffi.out(koffi.pointer(RECT)), 'uint32']),
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

/** Press and release a media key (play/pause 0xB3, next 0xB0, previous 0xB1). */
function mediaKey(vk) {
  if (!load()) return;
  u.keybd_event(vk, 0, 0x1, 0); // KEYEVENTF_EXTENDEDKEY
  u.keybd_event(vk, 0, 0x1 | 0x2, 0); // + KEYEVENTF_KEYUP
}

/** Progman's child windows, top to bottom, for diagnostics (which one covers the wallpaper?). */
function desktopTree() {
  if (!load()) return [];
  const progman = u.FindWindowW('Progman', null);
  const name = (h) => { const b = new Uint16Array(128); const n = u.GetClassNameW(h, b, 128); return String.fromCharCode(...b.subarray(0, n)); };
  const info = (h) => {
    const r = {}; u.GetWindowRect(h, r);
    return { hwnd: Number(h), cls: name(h), visible: !!u.IsWindowVisible(h), ex: '0x' + (Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE)) >>> 0).toString(16), rect: [r.left, r.top, r.right, r.bottom] };
  };
  const out = isNull(progman) ? [] : [{ ...info(progman), top: true }];
  for (let h = u.GetWindow(progman, 5), i = 0; !isNull(h) && i < 50; h = u.GetWindow(h, 2), i++) out.push(info(h)); // GW_CHILD, GW_HWNDNEXT
  return out;
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
  if (OVERLAY_CLASSES.has(cls)) return false; // Task View, Start, Alt+Tab cover the screen too, but they aren't games
  const r = {};
  if (!u.GetWindowRect(fg, r)) return false;
  return displays.some((d) => r.left <= d.x && r.top <= d.y && r.right >= d.x + d.width && r.bottom >= d.y + d.height);
}

/** The visible frame of the window in front (physical pixels), or null for the desktop, the dock itself,
 *  minimized windows and the app's own windows. Used for the dock's intellihide (as in Dash to Dock / Plank). */
function foregroundRect(ownPids = []) {
  if (!load()) return null;
  const fg = u.GetForegroundWindow();
  if (isNull(fg) || u.IsIconic(fg) || !u.IsWindowVisible(fg)) return null;
  const buf = new Uint16Array(64);
  const cls = String.fromCharCode(...buf.slice(0, u.GetClassNameW(fg, buf, 64)));
  if (['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd'].includes(cls)) return null;
  const pid = [0]; u.GetWindowThreadProcessId(fg, pid);
  if (ownPids.includes(pid[0])) return null;
  const r = {};
  if (u.DwmGetFrameRect(fg, 9, r, 16) !== 0 && !u.GetWindowRect(fg, r)) return null;
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
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

/** Hide or show the Windows taskbar on every monitor (what Seelen UI does while its own dock is on).
 *  Explorer sometimes shows it again (e.g. after the Start menu), so the app re-applies this while the dock runs. */
function showTaskbar(show) {
  if (!load()) return false;
  const bars = [u.FindWindowW('Shell_TrayWnd', null)];
  for (let h = 0, i = 0; i < 16; i++) { h = u.FindWindowExW(0, h, 'Shell_SecondaryTrayWnd', null); if (isNull(h)) break; bars.push(h); }
  let changed = false;
  for (const h of bars) {
    if (isNull(h) || !!u.IsWindowVisible(h) === !!show) continue;
    u.ShowWindow(h, show ? 5 : 0); changed = true; // SW_SHOW / SW_HIDE
  }
  return changed;
}

/** An icon from an exe/dll/ico file as BGRA pixels at `size` (e.g. 256), or null. Sharp when the dock magnifies it. */
function iconPixels(file, index = 0, size = 256) {
  if (!load()) return null;
  const large = [0], small = [0];
  if (u.SHDefExtractIconW(file, index, 0, large, small, (16 << 16) | size) !== 0 || isNull(large[0])) return null; // S_OK only
  if (!isNull(small[0])) u.DestroyIcon(small[0]);
  const info = {}, dc = u.CreateCompatibleDC(0);
  try {
    if (!u.GetIconInfo(large[0], info)) return null;
    const read = (bmp) => {
      const hdr = { biSize: 40, biWidth: size, biHeight: -size, biPlanes: 1, biBitCount: 32, biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 };
      const bits = Buffer.alloc(size * size * 4);
      return u.GetDIBits(dc, bmp, 0, size, bits, hdr, 0) === size ? bits : null; // DIB_RGB_COLORS, top-down
    };
    const px = isNull(info.hbmColor) ? null : read(info.hbmColor);
    if (!px) return null;
    let hasAlpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i]) { hasAlpha = true; break; }
    if (!hasAlpha) { // old icons: transparency comes from the mask (white = transparent)
      const mask = isNull(info.hbmMask) ? null : read(info.hbmMask);
      for (let i = 0; i < px.length; i += 4) px[i + 3] = mask && mask[i] ? 0 : 255;
    }
    return { width: size, height: size, data: px };
  } finally {
    if (!isNull(info.hbmColor)) u.DeleteObject(info.hbmColor);
    if (!isNull(info.hbmMask)) u.DeleteObject(info.hbmMask);
    u.DeleteDC(dc); u.DestroyIcon(large[0]);
  }
}

/** Put a window exactly at a physical-pixel rect (bars that must sit on the reserved screen edge). */
function placeWindow(win, r) { if (load() && !win.isDestroyed()) u.SetWindowPos(hwndOf(win), 0, r.x, r.y, r.width, r.height, SWP_NOZORDER | SWP_NOACTIVATE); }
/** A window's rect in physical pixels. */
function windowRect(win) { if (!load() || win.isDestroyed()) return null; const r = {}; return u.GetWindowRect(hwndOf(win), r) ? { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top } : null; }

/** The laptop battery as Windows reports it: { present, percent, charging }. */
function battery() {
  if (!load()) return { present: false };
  const st = {};
  if (!u.GetSystemPowerStatus(st)) return { present: false };
  const present = !(st.BatteryFlag & 128) && st.BatteryFlag !== 255 && st.BatteryLifePercent <= 100; // 128: no system battery
  return { present, percent: st.BatteryLifePercent, charging: !!(st.BatteryFlag & 8) || st.ACLineStatus === 1, plugged: st.ACLineStatus === 1 };
}

/** Make a bar a tool window: Windows shows tool windows on every virtual desktop (and never in Alt+Tab). */
function makeToolWindow(win) {
  if (!load() || win.isDestroyed()) return;
  const h = hwndOf(win);
  u.SetWindowLongPtrW(h, GWL_EXSTYLE, ((Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE)) | 0x80) & ~0x40000) >>> 0); // + WS_EX_TOOLWINDOW, - WS_EX_APPWINDOW
}

// Virtual desktops (macOS Spaces): Explorer keeps their ids and the current one in the registry (Windows 11).
const VD_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops';
function regBinary(sub, name) {
  const buf = Buffer.alloc(16 * 64), size = [buf.length];
  return u.RegGetValueW(-2147483647, sub, name, 0x8, null, buf, size) === 0 ? buf.subarray(0, size[0]) : null; // HKEY_CURRENT_USER, RRF_RT_REG_BINARY
}
function virtualDesktops() {
  if (!load()) return { count: 1, current: 0 };
  const ids = regBinary(VD_KEY, 'VirtualDesktopIDs'), cur = regBinary(VD_KEY, 'CurrentVirtualDesktop');
  const count = ids ? Math.max(1, Math.floor(ids.length / 16)) : 1;
  let current = 0;
  if (ids && cur && cur.length === 16) for (let i = 0; i < count; i++) if (ids.subarray(i * 16, i * 16 + 16).equals(cur)) current = i;
  return { count, current };
}

// Windows' own overlays: Task View (three-finger swipe up), Alt+Tab, Start, search, quick settings,
// notifications, the input-method switcher, and the taskbar itself while in use. Hiding the taskbar
// while one of these is in front closes it again, so the dock leaves the taskbar alone then.
const OVERLAY_CLASSES = new Set(['XamlExplorerHostIslandWindow', 'MultitaskingViewFrame', 'Windows.UI.Core.CoreWindow', 'ForegroundStaging',
  'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'TaskListThumbnailWnd', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland',
  'Shell_InputSwitchTopLevelWindow', 'ControlCenterWindow', 'Xaml_WindowedPopupClass', '#32768']);
function systemOverlayActive() {
  if (!load()) return false;
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return true; // in between: e.g. while Task View or a desktop switch animates
  const buf = new Uint16Array(128);
  return OVERLAY_CLASSES.has(String.fromCharCode(...buf.slice(0, u.GetClassNameW(fg, buf, 128))));
}

/** Whether the main Windows taskbar is showing. */
function taskbarVisible() { if (!load()) return true; const h = u.FindWindowW('Shell_TrayWnd', null); return isNull(h) ? true : !!u.IsWindowVisible(h); }

/** Press a key combination, e.g. [0x5B] (Win: Start menu) or [0x5B, 0x41] (Win+A: quick settings). */
function pressKeys(keys) {
  if (!load()) return;
  for (const k of keys) u.keybd_event(k, 0, 0, 0);
  for (const k of [...keys].reverse()) u.keybd_event(k, 0, 0x2, 0); // KEYEVENTF_KEYUP
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
// a process's program file, cached: it never changes while the process lives (pids are cleared now and then)
const exeCache = new Map();
let exeCacheAt = Date.now();
function exeOf(pid) {
  if (Date.now() - exeCacheAt > 60e3) { exeCache.clear(); exeCacheAt = Date.now(); }
  if (exeCache.has(pid)) return exeCache.get(pid);
  const h = u.OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
  if (isNull(h)) return '';
  try {
    const buf = new Uint16Array(1024), size = [1024];
    const exe = u.QueryFullProcessImageNameW(h, 0, buf, size) ? String.fromCharCode(...buf.slice(0, size[0])) : '';
    exeCache.set(pid, exe);
    return exe;
  } finally { u.CloseHandle(h); }
}
// one callback, registered once (registering a native callback on every call was wasteful)
let enumCb = null, enumOut = [], enumFg = 0, enumOwn = [];
function listWindows(ownPids = []) {
  if (!load()) return [];
  enumOut = []; enumFg = Number(u.GetForegroundWindow()); enumOwn = ownPids;
  enumCb ||= u.koffi.register((hwnd) => {
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
    if (enumOwn.includes(pid[0])) return true;
    enumOut.push({ hwnd: Number(hwnd), title: String.fromCharCode(...tb.slice(0, n)), exe: exeOf(pid[0]), active: Number(hwnd) === enumFg, minimized: !!u.IsIconic(hwnd) });
    return true;
  }, u.koffi.pointer(u.EnumProc));
  u.EnumWindows(enumCb, 0);
  return enumOut;
}
/** Click on a dock item: bring the window forward, or minimize it if it's already in front. */
function focusWindow(hwnd, toggle = true) {
  if (!load()) return;
  if (toggle && Number(u.GetForegroundWindow()) === hwnd && !u.IsIconic(hwnd)) { u.ShowWindow(hwnd, 6); return; } // SW_MINIMIZE
  if (u.IsIconic(hwnd)) u.ShowWindow(hwnd, 9); // SW_RESTORE
  // Windows only lets the app that got the last input change the foreground window. Two ways past that:
  // share input with the window in front for a moment (AttachThreadInput), and a tap of Alt.
  const fg = u.GetForegroundWindow(), pid = [0];
  const fgThread = isNull(fg) ? 0 : u.GetWindowThreadProcessId(fg, pid), me = u.GetCurrentThreadId();
  const attached = fgThread && fgThread !== me && u.AttachThreadInput(me, fgThread, true);
  try {
    u.keybd_event(0x12, 0, 0x1, 0); u.keybd_event(0x12, 0, 0x1 | 0x2, 0);
    u.BringWindowToTop(hwnd);
    if (!u.SetForegroundWindow(hwnd)) u.SwitchToThisWindow(hwnd, true);
  } finally { if (attached) u.AttachThreadInput(me, fgThread, false); }
  return Number(u.GetForegroundWindow()) === Number(hwnd);
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
  focusWindow: safe('focusWindow', focusWindow, false),
  desktopTree: safe('desktopTree', desktopTree, []),
  mediaKey: safe('mediaKey', mediaKey),
  showTaskbar: safe('showTaskbar', showTaskbar, false),
  systemOverlayActive: safe('systemOverlayActive', systemOverlayActive, true),
  taskbarVisible: safe('taskbarVisible', taskbarVisible, true),
  iconPixels: safe('iconPixels', iconPixels, null),
  placeWindow: safe('placeWindow', placeWindow),
  battery: safe('battery', battery, { present: false }),
  makeToolWindow: safe('makeToolWindow', makeToolWindow),
  virtualDesktops: safe('virtualDesktops', virtualDesktops, { count: 1, current: 0 }),
  windowRect: safe('windowRect', windowRect, null),
  foregroundRect: safe('foregroundRect', foregroundRect, null),
  pressKeys: safe('pressKeys', pressKeys),
  lock: safe('lock', () => load() && u.LockWorkStation(), false),
};
