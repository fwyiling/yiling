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
    GetLayeredWindowAttributes: user32.func('bool __stdcall GetLayeredWindowAttributes(intptr_t hwnd, _Out_ uint32_t *key, _Out_ uint8_t *alpha, _Out_ uint32_t *flags)'),
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
    SystemParametersInfoGetInt: user32.func('__stdcall', 'SystemParametersInfoW', 'bool', ['uint', 'uint', koffi.out(koffi.pointer('int')), 'uint']),
    RedrawWindow: user32.func('bool __stdcall RedrawWindow(intptr_t hwnd, void *rect, intptr_t rgn, uint flags)'),
    AllowSetForegroundWindow: user32.func('bool __stdcall AllowSetForegroundWindow(uint32 pid)'),
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
    GetKeyState: user32.func('short __stdcall GetKeyState(int vk)'),
    // display modes (refresh rate); DEVMODEW is handled as a raw 220-byte buffer at fixed offsets
    EnumDisplaySettingsW: user32.func('bool __stdcall EnumDisplaySettingsW(str16 device, uint32 mode, _Inout_ uint8_t *devmode)'),
    ChangeDisplaySettingsExW: user32.func('long __stdcall ChangeDisplaySettingsExW(str16 device, uint8_t *devmode, intptr_t hwnd, uint32 flags, void *param)'),
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
  u.CreateRectRgn = gdi32.func('intptr_t __stdcall CreateRectRgn(int l, int t, int r, int b)');
  u.SetWindowRgn = user32.func('int __stdcall SetWindowRgn(intptr_t hwnd, intptr_t rgn, bool redraw)');
  // the input method of the window in front: Chinese (Pinyin) or English mode, for the top bar's 拼 / EN
  u.GetKeyboardLayout = user32.func('uintptr_t __stdcall GetKeyboardLayout(uint32 thread)');
  u.GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vk)');
  u.GetClipboardSequenceNumber = user32.func('uint32 __stdcall GetClipboardSequenceNumber()');
  u.SendMessageTimeoutNum = user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['intptr_t', 'uint', 'uintptr_t', 'intptr_t', 'uint', 'uint', koffi.out(koffi.pointer('uintptr_t'))]);
  try { u.ImmGetDefaultIMEWnd = koffi.load('imm32.dll').func('intptr_t __stdcall ImmGetDefaultIMEWnd(intptr_t hwnd)'); } catch {}
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
  // Wi-Fi: ask the adapter for a fresh scan (netsh only shows the last scan's results)
  try {
    const wlan = koffi.load('wlanapi.dll');
    u.WlanOpenHandle = wlan.func('uint32 __stdcall WlanOpenHandle(uint32 version, void *reserved, _Out_ uint32_t *negotiated, _Out_ intptr_t *handle)');
    u.WlanEnumInterfaces = wlan.func('uint32 __stdcall WlanEnumInterfaces(intptr_t handle, void *reserved, _Out_ void **list)');
    u.WlanScan = wlan.func('uint32 __stdcall WlanScan(intptr_t handle, uint8_t *guid, void *ssid, void *ie, void *reserved)');
    u.WlanFreeMemory = wlan.func('void __stdcall WlanFreeMemory(void *mem)');
    u.WlanCloseHandle = wlan.func('uint32 __stdcall WlanCloseHandle(intptr_t handle, void *reserved)');
  } catch { /* no Wi-Fi service on this PC (desktops without Wi-Fi) */ }
  u.RegSetKeyValueW = advapi32.func('long __stdcall RegSetKeyValueW(intptr_t hkey, str16 sub, str16 name, uint32 type, str16 data, uint32 size)');
  u.RegGetValueW = advapi32.func('long __stdcall RegGetValueW(intptr_t hkey, str16 sub, str16 value, uint32 flags, void *type, _Out_ uint8_t *data, _Inout_ uint32_t *size)');
  const SYSTEM_POWER_STATUS = koffi.struct('SYSTEM_POWER_STATUS', { ACLineStatus: 'uint8', BatteryFlag: 'uint8', BatteryLifePercent: 'uint8', SystemStatusFlag: 'uint8', BatteryLifeTime: 'uint32', BatteryFullLifeTime: 'uint32' });
  u.SYSTEM_POWER_STATUS = SYSTEM_POWER_STATUS;
  u.GetSystemPowerStatus = u.kernel32.func('bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *status)');
  // a window being dragged (Windows' move loop) and where the pointer is: for dragging a window onto the next desktop
  koffi.struct('POINT', { x: 'long', y: 'long' });
  u.GUITHREADINFO = koffi.struct('GUITHREADINFO', { cbSize: 'uint32', flags: 'uint32', hwndActive: 'intptr_t', hwndFocus: 'intptr_t', hwndCapture: 'intptr_t',
    hwndMenuOwner: 'intptr_t', hwndMoveSize: 'intptr_t', hwndCaret: 'intptr_t', rcCaret: RECT });
  u.GetGUIThreadInfo = user32.func('bool __stdcall GetGUIThreadInfo(uint32 thread, _Inout_ GUITHREADINFO *info)');
  u.GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *pt)');
  // the Recycle Bin: how full it is, and emptying it (with Windows' own confirmation)
  u.SHQUERYRBINFO = koffi.struct('SHQUERYRBINFO', { cbSize: 'uint32', i64Size: 'int64', i64NumItems: 'int64' });
  u.SHQueryRecycleBinW = u.shell32.func('long __stdcall SHQueryRecycleBinW(str16 root, _Inout_ SHQUERYRBINFO *info)');
  u.SHEmptyRecycleBinW = u.shell32.func('long __stdcall SHEmptyRecycleBinW(intptr_t hwnd, str16 root, uint32 flags)');
  // blur behind a window (frosted glass): the accent policy Windows' own taskbar uses; works on frameless, transparent windows
  u.ACCENT_POLICY = koffi.struct('ACCENT_POLICY', { AccentState: 'int32', AccentFlags: 'int32', GradientColor: 'uint32', AnimationId: 'int32' });
  koffi.struct('WINCOMPATTRDATA', { Attrib: 'int32', pvData: 'void *', cbData: 'size_t' });
  u.SetWindowCompositionAttribute = user32.func('bool __stdcall SetWindowCompositionAttribute(intptr_t hwnd, WINCOMPATTRDATA *data)');
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
  // the dock: Windows tells a "shell hook" window when windows open, close, come forward or flash for attention
  // (what the taskbar listens to), instead of the dock looking every second
  u.RegisterWindowMessageW = user32.func('uint32 __stdcall RegisterWindowMessageW(str16 name)');
  // the moment Explorer shows its taskbar again (a WinEvent, as Seelen UI does it), not up to 300 ms later
  u.WinEventProc = koffi.proto('void __stdcall WinEventProc(intptr_t hook, uint32 event, intptr_t hwnd, long idObject, long idChild, uint32 thread, uint32 time)');
  u.SetWinEventHook = user32.func('intptr_t __stdcall SetWinEventHook(uint32 eventMin, uint32 eventMax, intptr_t hmod, WinEventProc *cb, uint32 pid, uint32 tid, uint32 flags)');
  u.UnhookWinEvent = user32.func('bool __stdcall UnhookWinEvent(intptr_t hook)');
  u.GetAncestor = user32.func('intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32 flags)');
  u.ShowWindowAsync = user32.func('bool __stdcall ShowWindowAsync(intptr_t hwnd, int cmd)');
  u.RegisterShellHookWindow = user32.func('bool __stdcall RegisterShellHookWindow(intptr_t hwnd)');
  u.DeregisterShellHookWindow = user32.func('bool __stdcall DeregisterShellHookWindow(intptr_t hwnd)');
  // live window previews: DWM draws another window, scaled, into one of ours (how the taskbar's previews work: no screenshots)
  u.DWM_THUMBNAIL_PROPERTIES = koffi.struct('DWM_THUMBNAIL_PROPERTIES', { dwFlags: 'uint32', rcDestination: RECT, rcSource: RECT, opacity: 'uint8', fVisible: 'int32', fSourceClientAreaOnly: 'int32' });
  u.SIZE = koffi.struct('SIZE', { cx: 'long', cy: 'long' });
  u.DwmSetWindowAttribute = u.dwmapi.func('long __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32 attr, int32_t *value, uint32 size)');
  u.DwmRegisterThumbnail = u.dwmapi.func('long __stdcall DwmRegisterThumbnail(intptr_t dest, intptr_t src, _Out_ intptr_t *thumb)');
  u.DwmUnregisterThumbnail = u.dwmapi.func('long __stdcall DwmUnregisterThumbnail(intptr_t thumb)');
  u.DwmUpdateThumbnailProperties = u.dwmapi.func('long __stdcall DwmUpdateThumbnailProperties(intptr_t thumb, DWM_THUMBNAIL_PROPERTIES *props)');
  u.DwmQueryThumbnailSourceSize = u.dwmapi.func('long __stdcall DwmQueryThumbnailSourceSize(intptr_t thumb, _Out_ SIZE *size)');
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
function fullscreenAppRunning(displays, ownPids = []) {
  if (!load()) return false;
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return false;
  const buf = new Uint16Array(64);
  const n = u.GetClassNameW(fg, buf, 64);
  const cls = String.fromCharCode(...buf.slice(0, n));
  if (cls === 'Progman' || cls === 'WorkerW' || cls === 'Shell_TrayWnd') return false; // the desktop itself
  if (OVERLAY_CLASSES.has(cls)) return false; // Task View, Start, Alt+Tab cover the screen too, but they aren't games
  if (systemOverlayActive()) return false; // nor anything else Windows' shell puts in front
  const pid = [0]; u.GetWindowThreadProcessId(fg, pid);
  if (ownPids.includes(pid[0])) return false; // our own Home panel covers the screen too
  // a maximized window can fill the screen too (with the taskbar hidden nothing is reserved), but it isn't full screen
  if (Number(u.GetWindowLongPtrW(fg, -16)) & 0x01000000) return false; // GWL_STYLE, WS_MAXIMIZE
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
function setWindowsWallpaper(file, style) {
  if (!load()) return false;
  // style: how Windows fits it ('10' fill, '6' fit, '2' stretch, '0' centre / tile, '22' span); set before the
  // picture so Windows draws it that way straight away
  if (style != null) {
    const put = (name, v) => u.RegSetKeyValueW(-2147483647, 'Control Panel\\Desktop', name, 1, v, (v.length + 1) * 2); // HKCU, REG_SZ
    put('WallpaperStyle', String(style)); put('TileWallpaper', '0');
  }
  return u.SystemParametersInfoW(0x0014, 0, file, 0x01 | 0x02); // SPI_SETDESKWALLPAPER, save + tell everyone
}

/** The window being dragged by its title bar right now (not resized), with the pointer and the whole screen area; else null. */
function dragState() {
  if (!load()) return null;
  const gi = { cbSize: u.koffi.sizeof(u.GUITHREADINFO), flags: 0, hwndActive: 0, hwndFocus: 0, hwndCapture: 0, hwndMenuOwner: 0, hwndMoveSize: 0, hwndCaret: 0, rcCaret: { left: 0, top: 0, right: 0, bottom: 0 } };
  if (!u.GetGUIThreadInfo(0, gi) || !(gi.flags & 0x2) || isNull(gi.hwndMoveSize)) return null; // the thread in front is in its move/size loop (GUI_INMOVESIZE)
  const pt = {}, r = {};
  if (!u.GetCursorPos(pt) || !u.GetWindowRect(gi.hwndMoveSize, r)) return null;
  // a resize has the pointer on the window's left / right border; a move holds it inside, by the title bar
  if (pt.x - r.left < 12 || r.right - pt.x < 12) return null;
  return { hwnd: Number(gi.hwndMoveSize), x: pt.x, y: pt.y,
    screen: { left: u.GetSystemMetrics(76), top: u.GetSystemMetrics(77), width: u.GetSystemMetrics(78), height: u.GetSystemMetrics(79) } }; // the virtual screen (all monitors)
}

// Windows' "snap a window when it's dragged to the edge of the screen" (SPI_GETDOCKMOVING / SPI_SETDOCKMOVING). Turned
// off only while a window is being dragged near the left / right edge (that edge moves it to the next desktop instead)
// and on again straight after. Never written to the registry, so it can't outlive the app: the user's own choice,
// HKCU\Control Panel\Desktop\DockMoving, is what Windows starts with, and what the app puts back.
function userDockMoving() {
  const buf = Buffer.alloc(16), size = [buf.length];
  if (u.RegGetValueW(-2147483647, 'Control Panel\\Desktop', 'DockMoving', 0x2, null, buf, size) !== 0) return true; // RRF_RT_REG_SZ; not set: on
  return buf.toString('utf16le', 0, size[0]).replace(/\0+$/, '').trim() !== '0';
}
function edgeSnap(on) {
  if (!load()) return false;
  const cur = [0];
  if (!u.SystemParametersInfoGetInt(0x0090, 0, cur, 0)) return false; // SPI_GETDOCKMOVING
  const want = on ? userDockMoving() : false; // "on" means: back to what the user chose
  if (!!cur[0] !== want) u.SystemParametersInfoW(0x0091, want ? 1 : 0, null, 0); // SPI_SETDOCKMOVING, this session only, no broadcast
  return want;
}

/** A text value from HKEY_CURRENT_USER (REG_EXPAND_SZ values come back expanded), or ''. */
function regString(sub, name) {
  if (!load()) return '';
  const buf = Buffer.alloc(2048), size = [buf.length];
  if (u.RegGetValueW(-2147483647, sub, name, 0x2, null, buf, size) !== 0) return ''; // RRF_RT_REG_SZ
  return buf.toString('utf16le', 0, size[0]).replace(/\0+$/, '');
}
/** Write a text value under HKEY_CURRENT_USER. */
function regSetString(sub, name, value) {
  if (!load()) return false;
  const v = String(value);
  return u.RegSetKeyValueW(-2147483647, sub, name, 1, v, (v.length + 1) * 2) === 0; // REG_SZ
}
/** What's in the Recycle Bin (all drives): { items, bytes }. */
function recycleBin() {
  if (!load()) return { items: 0, bytes: 0 };
  const info = { cbSize: u.koffi.sizeof(u.SHQUERYRBINFO), i64Size: 0, i64NumItems: 0 };
  if (u.SHQueryRecycleBinW(null, info) !== 0) return { items: 0, bytes: 0 };
  return { items: Number(info.i64NumItems), bytes: Number(info.i64Size) };
}
/** Empty the Recycle Bin. Windows asks first (and plays its sound); this waits for the answer, so run it off the main thread. */
function emptyBin() {
  if (!load()) return false;
  return u.SHEmptyRecycleBinW(0, null, 0) === 0;
}

/** The window in front's input: its language and, with a Chinese / Japanese / Korean input method, whether it types
 *  in that language (Pinyin's Chinese mode) or English (Shift switches). { hwnd, lang, ime, native } or null. */
function inputMode() {
  if (!load()) return null;
  // never while Shift, Ctrl, Alt or Win is held: asking the input method in the middle of a Shift press could get in
  // the way of Pinyin's own Shift switch. Asked again once the keys are up.
  for (const vk of [0x10, 0x11, 0x12, 0x5B, 0x5C]) if (u.GetAsyncKeyState(vk) & 0x8000) return null;
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return null;
  const pid = [0], tid = u.GetWindowThreadProcessId(fg, pid);
  const lang = Number(BigInt(u.GetKeyboardLayout(tid)) & 0xFFFFn); // LANGID of the keyboard layout (0x0804 Chinese, 0x0409 English…)
  const primary = lang & 0x3FF;
  if (![0x04, 0x11, 0x12].includes(primary) || !u.ImmGetDefaultIMEWnd) return { hwnd: Number(fg), lang, ime: false, native: false };
  const ime = u.ImmGetDefaultIMEWnd(fg);
  if (isNull(ime)) return { hwnd: Number(fg), lang, ime: true, native: true };
  // WM_IME_CONTROL: is the input method on, and is it converting (Chinese) or passing letters through (English)?
  const open = [0], conv = [0];
  const ok1 = u.SendMessageTimeoutNum(ime, 0x283, 0x5, 0, 0x2, 60, open); // IMC_GETOPENSTATUS, SMTO_ABORTIFHUNG
  const ok2 = u.SendMessageTimeoutNum(ime, 0x283, 0x1, 0, 0x2, 60, conv); // IMC_GETCONVERSIONMODE
  if (!ok1 && !ok2) return { hwnd: Number(fg), lang, ime: true, native: true }; // didn't answer: assume the language's own mode
  return { hwnd: Number(fg), lang, ime: true, native: !!Number(open[0]) && (Number(conv[0]) & 1) === 1 }; // IME_CMODE_NATIVE
}
/** Frosted glass behind a window (true), or nothing (false). */
function setBlur(win, on) {
  if (!load()) return false;
  const ptr = u.koffi.alloc(u.ACCENT_POLICY, 1);
  try {
    u.koffi.encode(ptr, u.ACCENT_POLICY, { AccentState: on ? 3 : 0, AccentFlags: 0, GradientColor: 0, AnimationId: 0 }); // ACCENT_ENABLE_BLURBEHIND / DISABLED
    return !!u.SetWindowCompositionAttribute(hwndOf(win), { Attrib: 19, pvData: ptr, cbData: 16 }); // WCA_ACCENT_POLICY
  } finally { u.koffi.free(ptr); }
}

/** No Windows fade when the window shows or hides: the page animates itself (two animations read as opening twice). */
function noTransitions(win) {
  if (!load()) return false;
  return u.DwmSetWindowAttribute(hwndOf(win), 3, [1], 4) === 0; // DWMWA_TRANSITIONS_FORCEDISABLED
}

/** Have Explorer draw the desktop again (after the app's wallpaper windows are gone, Windows' own shows). */
function repaintDesktop() {
  if (!load()) return false;
  const progman = u.FindWindowW('Progman', null);
  if (isNull(progman)) return false;
  // RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW | RDW_FRAME; the wallpaper itself is left as the user set it
  u.RedrawWindow(progman, null, 0, 0x585);
  for (let h = u.FindWindowExW(0, 0, 'WorkerW', null), i = 0; !isNull(h) && i < 20; h = u.FindWindowExW(0, h, 'WorkerW', null), i++) u.RedrawWindow(h, null, 0, 0x585);
  return true;
}

// ---------- taskbar ----------
const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABM_GETSTATE = 4, ABM_SETSTATE = 10, ABS_AUTOHIDE = 1;
// Explorer's taskbar. Not just the first "Shell_TrayWnd": the app's own tray (tray.js) makes a window of that name
// too (so programs' tray icons reach it), and hiding / auto-hiding that one would do nothing.
function explorerTray() {
  let other = 0;
  for (let h = 0, i = 0; i < 8; i++) {
    h = u.FindWindowExW(0, h, 'Shell_TrayWnd', null);
    if (isNull(h)) break;
    const pid = [0]; u.GetWindowThreadProcessId(h, pid);
    const exe = exeOf(pid[0]);
    if (/\\explorer\.exe$/i.test(exe)) return h;
    if (!other && !/\\powershell\.exe$/i.test(exe)) other = h; // its program couldn't be read: still not our helper
  }
  return other;
}
/** Explorer's process id (it changes when Explorer restarts, and with it the backgrounds it keeps per desktop). */
function explorerPid() { if (!load()) return 0; const h = explorerTray(); if (isNull(h)) return 0; const pid = [0]; u.GetWindowThreadProcessId(h, pid); return pid[0]; }
const appbar = (hwnd, extra = {}) => ({ cbSize: u.koffi.sizeof(u.APPBARDATA), hWnd: hwnd, uCallbackMessage: 0, uEdge: 3, rc: { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0, ...extra });
function taskbarAutoHide() {
  if (!load()) return false;
  const d = appbar(explorerTray());
  return (Number(u.SHAppBarMessage(ABM_GETSTATE, d)) & ABS_AUTOHIDE) !== 0;
}
/** The same switch as Settings > Personalization > Taskbar > Automatically hide the taskbar. */
function setTaskbarAutoHide(on) {
  if (!load()) return false;
  u.SHAppBarMessage(ABM_SETSTATE, appbar(explorerTray(), { lParam: on ? ABS_AUTOHIDE : 0 }));
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
function taskbars() {
  const bars = [explorerTray()];
  for (let h = 0, i = 0; i < 16; i++) { h = u.FindWindowExW(0, h, 'Shell_SecondaryTrayWnd', null); if (isNull(h)) break; bars.push(h); }
  return bars.filter((h) => !isNull(h));
}
// Hidden AND fully transparent: Explorer shows the taskbar again by itself for a moment (switching desktops, Start,
// display changes), and that flashed a strip in the accent colour during the desktop slide. Transparent, a taskbar
// Explorer brings back stays unseen until it's hidden again. Back to opaque whenever it's shown on purpose.
const layeredByUs = new Set(); // taskbars this run made layered (the style is taken off again when shown)
function taskbarSeeThrough(h, hide) {
  const ex = Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE));
  if (hide) {
    if (!(ex & WS_EX_LAYERED)) { u.SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_LAYERED); layeredByUs.add(Number(h)); }
    u.SetLayeredWindowAttributes(h, 0, 0, 0x2); // LWA_ALPHA
  } else if (ex & WS_EX_LAYERED) {
    u.SetLayeredWindowAttributes(h, 0, 255, 0x2);
    if (layeredByUs.delete(Number(h))) u.SetWindowLongPtrW(h, GWL_EXSTYLE, ex & ~WS_EX_LAYERED);
  }
}
// Windows 11 ignores the transparency above, and Explorer shows the taskbar for a moment at the start of a desktop
// switch, so the slide's picture of the desktop had a blue strip in it. An empty window region makes it draw nothing
// at all, shown or not; taken off again whenever it's shown on purpose (and when the app quits).
const clippedByUs = new Set();
function taskbarClip(h, hide) {
  if (hide) { if (!clippedByUs.has(Number(h)) && u.SetWindowRgn(h, u.CreateRectRgn(0, 0, 0, 0), true)) clippedByUs.add(Number(h)); }
  else { clippedByUs.delete(Number(h)); u.SetWindowRgn(h, 0, true); } // always: also undoes a clip left by a run that crashed
}
function showTaskbar(show) {
  if (!load()) return false;
  let changed = false;
  for (const h of taskbars()) {
    taskbarSeeThrough(h, !show);
    try { taskbarClip(h, !show); } catch {}
    if (!!u.IsWindowVisible(h) === !!show) continue;
    u.ShowWindow(h, show ? 5 : 0); changed = true; // SW_SHOW / SW_HIDE
  }
  return changed;
}
/** How opaque Explorer's taskbar is: 255 normally, 0 while the dock keeps it out of sight. */
function taskbarOpacity() {
  if (!load()) return 255;
  const h = explorerTray(); if (isNull(h)) return 255;
  if (!(Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE)) & WS_EX_LAYERED)) return 255;
  const key = [0], alpha = [255], flags = [0];
  return u.GetLayeredWindowAttributes(h, key, alpha, flags) && (flags[0] & 0x2) ? alpha[0] : 255;
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
// Settings > Personalization > Colours > Accent colour "Automatic": Windows picks it from the wallpaper again on
// every desktop switch, which can make the slide stutter (and with Syndicates the Windows wallpaper isn't seen anyway)
function autoAccent() {
  if (!load()) return false;
  const buf = Buffer.alloc(64), size = [buf.length];
  if (u.RegGetValueW(-2147483647, 'Control Panel\\Desktop', 'AutoColorization', 0xFFFF, null, buf, size) !== 0) return false; // RRF_RT_ANY
  if (size[0] === 4) return buf.readUInt32LE(0) === 1; // REG_DWORD
  return buf.toString('utf16le', 0, size[0]).replace(/\0+$/, '').trim() === '1'; // stored as text on some PCs
}
// a GUID's 16 bytes as Windows writes it: {01234567-89AB-CDEF-0123-456789ABCDEF}
const guidStr = (b) => { const h = (x) => x.toString('hex').toUpperCase(); return `{${h(Buffer.from(b.subarray(0, 4)).reverse())}-${h(Buffer.from(b.subarray(4, 6)).reverse())}-${h(Buffer.from(b.subarray(6, 8)).reverse())}-${h(b.subarray(8, 10))}-${h(b.subarray(10, 16))}}`; };
/** The virtual desktops: how many, which one is showing, their ids (stable when reordered) and the names given in Windows. */
function virtualDesktops(withNames = false) { // names: a few more registry reads, only when asked (the watcher polls this)
  if (!load()) return { count: 1, current: 0, ids: [], names: [] };
  const ids = regBinary(VD_KEY, 'VirtualDesktopIDs'), cur = regBinary(VD_KEY, 'CurrentVirtualDesktop');
  const count = ids ? Math.max(1, Math.floor(ids.length / 16)) : 1;
  let current = 0;
  if (ids && cur && cur.length === 16) for (let i = 0; i < count; i++) if (ids.subarray(i * 16, i * 16 + 16).equals(cur)) current = i;
  const list = ids && ids.length >= 16 ? Array.from({ length: count }, (_, i) => guidStr(ids.subarray(i * 16, i * 16 + 16))) : [];
  return { count, current, ids: list, names: withNames ? list.map((g) => regString(`${VD_KEY}\\Desktops\\${g}`, 'Name')) : [] };
}

// Windows' own overlays: Task View (three-finger swipe up), Alt+Tab, Start, search, quick settings,
// notifications, the input-method switcher, and the taskbar itself while in use. Hiding the taskbar
// while one of these is in front closes it again, so the dock leaves the taskbar alone then.
const OVERLAY_CLASSES = new Set(['XamlExplorerHostIslandWindow', 'MultitaskingViewFrame', 'Windows.UI.Core.CoreWindow', 'ForegroundStaging',
  'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'TaskListThumbnailWnd', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland',
  'Shell_InputSwitchTopLevelWindow', 'ControlCenterWindow', 'Xaml_WindowedPopupClass', '#32768']);
// Windows' shell programs: anything they put in front (Task View, Start, search, flyouts…) counts as busy
const SHELL_EXES = new Set(['explorer.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'searchhost.exe', 'searchapp.exe', 'shellhost.exe', 'textinputhost.exe', 'lockapp.exe', 'applicationframehost.exe']);
const FILE_EXPLORER = new Set(['CabinetWClass', 'ExploreWClass', 'Progman', 'WorkerW']); // normal folders and the desktop are not overlays
let lastOverlay = { cls: '', exe: '' };
function systemOverlayActive() {
  if (!load()) return false;
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return true; // in between: e.g. while Task View or a desktop switch animates
  const buf = new Uint16Array(128);
  const cls = String.fromCharCode(...buf.slice(0, u.GetClassNameW(fg, buf, 128)));
  if (OVERLAY_CLASSES.has(cls)) { lastOverlay = { cls, exe: '' }; return true; }
  if (FILE_EXPLORER.has(cls)) return false;
  const pid = [0]; u.GetWindowThreadProcessId(fg, pid);
  const exe = (exeOf(pid[0]).split('\\').pop() || '').toLowerCase();
  if (exe === 'applicationframehost.exe' && cls === 'ApplicationFrameWindow') return false; // a normal Store app window
  if (SHELL_EXES.has(exe)) { lastOverlay = { cls, exe }; return true; }
  return false;
}

// The "Desktop 2" label Windows shows when switching desktops: a small Explorer window near the bottom.
// Right after a switch, small Explorer pop-ups in the lower part of the screen are hidden (nothing else is touched).
const KEEP_SHELL = new Set(['Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Progman', 'WorkerW', 'CabinetWClass', 'ExploreWClass', 'TaskListThumbnailWnd', 'NotifyIconOverflowWindow', '#32768']);
let popCb = null, popOut = [], popScreen = null;
function hideSwitchLabel(screenRect) {
  if (!load()) return [];
  popOut = []; popScreen = screenRect;
  popCb ||= u.koffi.register((hwnd) => {
    if (!u.IsWindowVisible(hwnd)) return true;
    const buf = new Uint16Array(128), cls = String.fromCharCode(...buf.slice(0, u.GetClassNameW(hwnd, buf, 128)));
    if (KEEP_SHELL.has(cls)) return true;
    const pid = [0]; u.GetWindowThreadProcessId(hwnd, pid);
    if ((exeOf(pid[0]).split('\\').pop() || '').toLowerCase() !== 'explorer.exe') return true;
    const r = {}; if (!u.GetWindowRect(hwnd, r)) return true;
    const w = r.right - r.left, h = r.bottom - r.top, s = popScreen;
    if (w < 60 || w > 800 || h < 24 || h > 300) return true; // only small pop-ups
    if (r.top < s.y + s.height * 0.55) return true; // in the lower part of the screen, where the label appears
    u.ShowWindow(hwnd, 0); // SW_HIDE
    popOut.push({ cls, rect: [r.left, r.top, w, h] });
    return true;
  }, u.koffi.pointer(u.EnumProc));
  u.EnumWindows(popCb, 0);
  return popOut;
}

// DEVMODEW offsets: dmSize 68, dmFields 72, dmBitsPerPel 168, dmPelsWidth 172, dmPelsHeight 176, dmDisplayFrequency 184
const DEVMODE_SIZE = 220;
let rateCache = { key: '', rates: [] };
function devmode() { const b = Buffer.alloc(DEVMODE_SIZE); b.writeUInt16LE(DEVMODE_SIZE, 68); return b; }
/** The main screen's refresh rate now, and the rates it supports at its current resolution. */
function refreshRates() {
  if (!load()) return { current: 0, rates: [] };
  const cur = devmode();
  if (!u.EnumDisplaySettingsW(null, 0xFFFFFFFF, cur)) return { current: 0, rates: [] }; // ENUM_CURRENT_SETTINGS
  const w = cur.readUInt32LE(172), h = cur.readUInt32LE(176), bpp = cur.readUInt32LE(168), rates = new Set();
  const current = cur.readUInt32LE(184), key = `${w}x${h}x${bpp}`;
  // the driver's list only changes with the resolution (or another screen): test each mode once, not on every open
  if (rateCache.key === key && rateCache.rates.includes(current)) return { current, rates: rateCache.rates, width: w, height: h };
  for (let i = 0; i < 500; i++) {
    const m = devmode();
    if (!u.EnumDisplaySettingsW(null, i, m)) break;
    if (m.readUInt32LE(172) !== w || m.readUInt32LE(176) !== h || m.readUInt32LE(168) !== bpp) continue;
    const hz = m.readUInt32LE(184);
    if (hz <= 1 || (m.readUInt32LE(180) & 0x2)) continue; // "default" and interlaced modes
    // only what the screen really takes: Windows' dry run (CDS_TEST) must accept it
    m.writeUInt32LE(0x400000 | 0x80000 | 0x100000, 72); // DM_DISPLAYFREQUENCY | DM_PELSWIDTH | DM_PELSHEIGHT
    if (u.ChangeDisplaySettingsExW(null, m, 0, 0x2, null) === 0) rates.add(hz);
  }
  // 59 / 60, 119 / 120, 143 / 144…: one entry each (the one in use, or the rounder one)
  const merged = [];
  for (const r of [...rates].sort((a, b) => a - b)) {
    const last = merged[merged.length - 1];
    if (last && r - last <= 1) merged[merged.length - 1] = r === current ? r : last === current ? last : Math.max(last, r);
    else merged.push(r);
  }
  if (!merged.includes(current) && current > 1) { merged.push(current); merged.sort((a, b) => a - b); } // the rate in use is real, whatever the dry run said
  // 23.976 / 24 / 25 / 30 Hz are film and TV modes: everything on the desktop looks choppy at them. Not offered
  // (only shown while the screen is actually on one, so it can be switched back)
  for (let i = merged.length - 1; i >= 0; i--) if (merged[i] < 48 && merged[i] !== current) merged.splice(i, 1);
  rateCache = { key, rates: merged };
  return { current, rates: merged, width: w, height: h };
}
/** Switch the main screen to another refresh rate (one it supports). True when Windows accepted it. */
function setRefreshRate(hz) {
  if (!load()) return false;
  const m = devmode();
  if (!u.EnumDisplaySettingsW(null, 0xFFFFFFFF, m)) return false;
  m.writeUInt32LE(hz >>> 0, 184);
  m.writeUInt32LE(0x400000, 72); // DM_DISPLAYFREQUENCY
  return u.ChangeDisplaySettingsExW(null, m, 0, 0x1, null) === 0; // CDS_UPDATEREGISTRY, DISP_CHANGE_SUCCESSFUL
}

/** Start a Wi-Fi scan on every adapter (results show up in netsh a few seconds later). Number of adapters asked. */
function wifiScan() {
  if (!load() || !u.WlanOpenHandle) return 0;
  const neg = [0], h = [0];
  if (u.WlanOpenHandle(2, null, neg, h) !== 0) return 0;
  const listPtr = [null];
  let n = 0;
  try {
    if (u.WlanEnumInterfaces(h[0], null, listPtr) !== 0 || !listPtr[0]) return 0;
    // WLAN_INTERFACE_INFO_LIST: count, index, then entries of GUID (16) + description (512) + state (4)
    const count = u.koffi.decode(listPtr[0], 'uint32');
    const raw = Buffer.from(u.koffi.decode(listPtr[0], 'uint8_t', 8 + count * 532));
    for (let i = 0; i < count; i++) if (u.WlanScan(h[0], raw.subarray(8 + i * 532, 8 + i * 532 + 16), null, null, null) === 0) n++;
  } finally { if (listPtr[0]) u.WlanFreeMemory(listPtr[0]); u.WlanCloseHandle(h[0], null); }
  return n;
}

/** Whether the main Windows taskbar is showing. */
function taskbarVisible() { if (!load()) return true; const h = explorerTray(); return isNull(h) ? true : !!u.IsWindowVisible(h); }

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
let enumCb = null, enumOut = [], enumFg = 0, enumOwn = [], enumAll = false;
/** The open app windows (the dock's list). allDesktops: also those on other virtual desktops (the overview). */
function listWindows(ownPids = [], allDesktops = false) {
  if (!load()) return [];
  enumOut = []; enumFg = Number(u.GetForegroundWindow()); enumOwn = ownPids; enumAll = allDesktops;
  enumCb ||= u.koffi.register((hwnd) => {
    if (!u.IsWindowVisible(hwnd) || !isNull(u.GetWindow(hwnd, 4))) return true; // GW_OWNER
    const ex = Number(u.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    if ((ex & 0x80) && !(ex & 0x40000)) return true; // WS_EX_TOOLWINDOW without WS_EX_APPWINDOW
    const cloaked = [0];
    // DWMWA_CLOAKED: hidden UWP windows (always skipped), and windows on other desktops (cloaked by the shell: 2)
    if (u.DwmGetWindowAttribute(hwnd, 14, cloaked, 4) === 0 && cloaked[0] && !(enumAll && cloaked[0] === 2)) return true;
    const tb = new Uint16Array(256), n = u.GetWindowTextW(hwnd, tb, 256);
    if (!n) return true;
    const cls = new Uint16Array(128), cn = u.GetClassNameW(hwnd, cls, 128);
    if (SHELL_CLASSES.has(String.fromCharCode(...cls.slice(0, cn)))) return true;
    const pid = [0]; u.GetWindowThreadProcessId(hwnd, pid);
    if (enumOwn.includes(pid[0])) return true;
    enumOut.push({ hwnd: Number(hwnd), title: String.fromCharCode(...tb.slice(0, n)), exe: exeOf(pid[0]), active: Number(hwnd) === enumFg, minimized: !!u.IsIconic(hwnd), elsewhere: !!cloaked[0] });
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

// ---------- the dock: shell hook and live previews ----------
/** Ask Windows to tell this window about other windows (opened, closed, activated, flashing). Returns the message id. */
function shellHook(win) {
  if (!load()) return 0;
  const msg = u.RegisterWindowMessageW('SHELLHOOK');
  return msg && u.RegisterShellHookWindow(hwndOf(win)) ? msg : 0;
}
const unhookShell = (win) => load() && u.DeregisterShellHookWindow(hwndOf(win));
/** A live, scaled copy of window `src` drawn into our window `win` (until unregistered). Returns its handle or 0. */
function thumbRegister(win, src) {
  if (!load()) return 0;
  const out = [0];
  return u.DwmRegisterThumbnail(hwndOf(win), src, out) === 0 ? Number(out[0]) : 0;
}
function thumbSize(thumb) {
  if (!load()) return null;
  const sz = {};
  return u.DwmQueryThumbnailSourceSize(thumb, sz) === 0 ? { w: sz.cx, h: sz.cy } : null;
}
/** Place a preview (physical pixels, in our window's client area); hidden when `visible` is false. */
function thumbPlace(thumb, rect, visible = true) {
  if (!load()) return false;
  const props = { dwFlags: 0x1 | 0x4 | 0x8 | 0x10, opacity: 255, fVisible: visible ? 1 : 0, fSourceClientAreaOnly: 0, // destination, opacity, visible, whole window
    rcDestination: { left: Math.round(rect.x), top: Math.round(rect.y), right: Math.round(rect.x + rect.w), bottom: Math.round(rect.y + rect.h) }, rcSource: { left: 0, top: 0, right: 0, bottom: 0 } };
  return u.DwmUpdateThumbnailProperties(thumb, props) === 0;
}
const thumbUnregister = (thumb) => load() && u.DwmUnregisterThumbnail(thumb) === 0;
/** Ask a window to close, like its X button (the app can still ask to save first). */
const closeWindow = (hwnd) => load() && u.PostMessageW(hwnd, 0x0010, 0, 0); // WM_CLOSE

// ---------- the taskbar, the moment Explorer shows it ----------
// Explorer shows its taskbar again by itself (switching desktops, Start, display changes). A WinEvent hook on
// Explorer's process hears it at once; onShow(hwnd) decides. The callback runs on the thread that set the hook,
// from its message loop (the app's main thread).
let tbHook = 0, tbCb = null, tbPid = 0, tbOnShow = null;
const TASKBAR_CLASSES = new Set(['Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
function watchTaskbar(onShow) {
  if (!load()) return false;
  tbOnShow = onShow;
  const tray = explorerTray();
  if (isNull(tray)) return false;
  const pid = [0]; u.GetWindowThreadProcessId(tray, pid);
  if (tbHook && pid[0] === tbPid) return true; // already listening to this Explorer
  unwatchTaskbar(true);
  tbCb ||= u.koffi.register((hook, event, hwnd, idObject) => {
    try {
      if (idObject !== 0 || isNull(hwnd) || event === 0x8001) return; // OBJID_WINDOW only; not EVENT_OBJECT_DESTROY
      const root = u.GetAncestor(hwnd, 2); // GA_ROOT
      const buf = new Uint16Array(64), cls = String.fromCharCode(...buf.slice(0, u.GetClassNameW(root, buf, 64)));
      if (TASKBAR_CLASSES.has(cls)) tbOnShow?.(Number(root), 'taskbar');
    } catch {}
  }, u.koffi.pointer(u.WinEventProc));
  tbHook = Number(u.SetWinEventHook(0x8000, 0x8002, 0, tbCb, pid[0], 0, 0x0000 | 0x0002)); // EVENT_OBJECT_CREATE .. SHOW (as Seelen UI); out of context, skip our own process
  tbPid = tbHook ? pid[0] : 0;
  return !!tbHook;
}
function unwatchTaskbar(keepHandler = false) {
  if (tbHook && load()) u.UnhookWinEvent(tbHook);
  tbHook = 0; tbPid = 0;
  if (!keepHandler) tbOnShow = null;
}
/** What's in front right now, for the taskbar's sake: 'none' (in between, e.g. a desktop sliding), 'switch'
 *  (Windows' own switching windows), 'shell' (Start, search, flyouts: they sit on the taskbar), or 'app'. */
const ANCHORED = new Set(['Windows.UI.Core.CoreWindow', 'ControlCenterWindow', 'Xaml_WindowedPopupClass', '#32768', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland', 'Shell_InputSwitchTopLevelWindow', 'TaskListThumbnailWnd', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
function foregroundKind() {
  if (!load()) return 'app';
  const fg = u.GetForegroundWindow();
  if (isNull(fg)) return 'none';
  const buf = new Uint16Array(128), cls = String.fromCharCode(...buf.slice(0, u.GetClassNameW(fg, buf, 128)));
  if (cls === 'ForegroundStaging' || cls === 'MultitaskingViewFrame' || cls === 'XamlExplorerHostIslandWindow') return 'switch';
  if (ANCHORED.has(cls)) return 'shell';
  const pid = [0]; u.GetWindowThreadProcessId(fg, pid);
  const exe = (exeOf(pid[0]).split('\\').pop() || '').toLowerCase();
  if (['startmenuexperiencehost.exe', 'searchhost.exe', 'searchapp.exe', 'shellexperiencehost.exe', 'shellhost.exe'].includes(exe)) return 'shell';
  return 'app';
}
const hideNow = (hwnd) => load() && u.ShowWindowAsync(hwnd, 0); // SW_HIDE, without waiting on Explorer

module.exports = {
  isWin,
  RAISED_STRATEGIES,
  status: () => ({ ready: !!load(), error: setupError?.message || '' }),
  attachToDesktop: safe('attachToDesktop', attachToDesktop, (e) => ({ ok: false, reason: e.message })),
  fullscreenAppRunning: safe('fullscreenAppRunning', fullscreenAppRunning, false),
  setDesktopIcons: safe('setDesktopIcons', setDesktopIcons, false),
  setWindowsWallpaper: safe('setWindowsWallpaper', setWindowsWallpaper, false),
  focusOwn: safe('focusOwn', (win) => focusWindow(hwndOf(win), false), false),
  repaintDesktop: safe('repaintDesktop', repaintDesktop, false),
  setBlur: safe('setBlur', setBlur, false),
  noTransitions: safe('noTransitions', noTransitions, false),
  explorerPid: safe('explorerPid', explorerPid, 0),
  dragState: safe('dragState', dragState, null),
  edgeSnap: safe('edgeSnap', edgeSnap, false),
  regString: safe('regString', regString, ''),
  regSetString: safe('regSetString', regSetString, false),
  inputMode: safe('inputMode', inputMode, null),
  windowTitle: safe('windowTitle', (hwnd) => { if (!load()) return ''; const b = new Uint16Array(256), n = u.GetWindowTextW(hwnd, b, 256); return String.fromCharCode(...b.slice(0, n)); }, ''),
  isForeground: safe('isForeground', (hwnd) => { if (!load()) return false; const fg = u.GetForegroundWindow(); return !isNull(fg) && Number(u.GetAncestor(fg, 2)) === Number(hwnd); }, false),
  /** Changes with every copy (the clipboard history only reads the clipboard when it does). */
  clipboardSeq: safe('clipboardSeq', () => (load() ? u.GetClipboardSequenceNumber() : -1), -1),
  keyDown: safe('keyDown', (vk) => !!(load() && (u.GetAsyncKeyState(vk) & 0x8000)), false),
  foregroundId: safe('foregroundId', () => (load() ? Number(u.GetForegroundWindow()) : 0), 0),
  recycleBin: safe('recycleBin', recycleBin, { items: 0, bytes: 0 }),
  emptyBin: safe('emptyBin', emptyBin, false),
  // the program we're about to start (or an already-running one it hands over to, like Claude) may come to the front
  allowForeground: safe('allowForeground', () => !!(load() && u.AllowSetForegroundWindow(0xFFFFFFFF)), false), // ASFW_ANY
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
  foregroundNull: safe('foregroundNull', () => !!load() && isNull(u.GetForegroundWindow()), false),
  hideSwitchLabel: safe('hideSwitchLabel', hideSwitchLabel, []),
  lastOverlay: () => lastOverlay,
  taskbarVisible: safe('taskbarVisible', taskbarVisible, true),
  taskbarOpacity: safe('taskbarOpacity', taskbarOpacity, 255),
  watchTaskbar: safe('watchTaskbar', watchTaskbar, false),
  unwatchTaskbar: safe('unwatchTaskbar', unwatchTaskbar),
  foregroundKind: safe('foregroundKind', foregroundKind, 'app'),
  hideNow: safe('hideNow', hideNow, false),
  iconPixels: safe('iconPixels', iconPixels, null),
  placeWindow: safe('placeWindow', placeWindow),
  battery: safe('battery', battery, { present: false }),
  refreshRates: safe('refreshRates', refreshRates, { current: 0, rates: [] }),
  wifiScan: safe('wifiScan', wifiScan, 0),
  autoAccent: safe('autoAccent', autoAccent, false),
  setRefreshRate: safe('setRefreshRate', setRefreshRate, false),
  makeToolWindow: safe('makeToolWindow', makeToolWindow),
  virtualDesktops: safe('virtualDesktops', virtualDesktops, { count: 1, current: 0, ids: [], names: [] }),
  windowRect: safe('windowRect', windowRect, null),
  /** Where another program's window is on screen (physical pixels, without its invisible resize border), or null. */
  hwndRect: safe('hwndRect', (hwnd) => { if (!load()) return null; const r = {}; if (u.DwmGetFrameRect(hwnd, 9, r, 16) !== 0 && !u.GetWindowRect(hwnd, r)) return null; return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top }; }, null),
  foregroundRect: safe('foregroundRect', foregroundRect, null),
  pressKeys: safe('pressKeys', pressKeys),
  shellHook: safe('shellHook', shellHook, 0),
  unhookShell: safe('unhookShell', unhookShell, false),
  thumbRegister: safe('thumbRegister', thumbRegister, 0),
  thumbSize: safe('thumbSize', thumbSize, null),
  thumbPlace: safe('thumbPlace', thumbPlace, false),
  thumbUnregister: safe('thumbUnregister', thumbUnregister, false),
  closeWindow: safe('closeWindow', closeWindow, false),
  lock: safe('lock', () => load() && u.LockWorkStation(), false),
  processExe: safe('processExe', (pid) => (load() && pid ? exeOf(pid) : ''), ''), // the program a process runs (cached)
  capsLock: safe('capsLock', () => !!(load() && (u.GetKeyState(0x14) & 1)), false),
};
