// Moving a window to the desktop next door (drag it against the left / right edge of the screen, like Spaces on
// a Mac). Windows' public API only moves an app's own windows between desktops; moving other apps' windows takes
// the shell's internal virtual-desktop interfaces. The interop below is adapted from MScholtes/VirtualDesktop
// (MIT License, Copyright (c) 2017 Markus Scholtes, https://github.com/MScholtes/VirtualDesktop), Windows 11 version:
// only the methods needed here, which sit at the same places on Windows 11 21H2 to 25H2.
// One long-running Windows PowerShell; a command per line on stdin, one JSON answer per line.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const win32 = require('./win32');
const { psArgs } = require('./ps-script');

const PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIInspectable), Guid("372E1D3B-38D3-42E4-A15B-8AB2B178F513")]
interface IApplicationView { }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("92CA9DCD-5622-4BBA-A805-5E9F541BD8C9")]
interface IObjectArray { void GetCount(out int count); void GetAt(int index, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object obj); }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("1841C6D7-4F9D-42C0-AF41-8747538F10E5")]
interface IApplicationViewCollection {
  [PreserveSig] int GetViews(out IObjectArray array);
  [PreserveSig] int GetViewsByZOrder(out IObjectArray array);
  [PreserveSig] int GetViewsByAppUserModelId([MarshalAs(UnmanagedType.LPWStr)] string id, out IObjectArray array);
  [PreserveSig] int GetViewForHwnd(IntPtr hwnd, out IApplicationView view);
}
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("3F07F4BE-B107-441A-AF0F-39D82529072C")]
interface IVirtualDesktop { bool IsViewVisible(IApplicationView view); Guid GetId(); }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("53F5CA0B-158F-4124-900C-057158060B27")]
interface IVirtualDesktopManagerInternal {
  int GetCount();
  void MoveViewToDesktop(IApplicationView view, IVirtualDesktop desktop);
  bool CanViewMoveDesktops(IApplicationView view);
  IVirtualDesktop GetCurrentDesktop();
  void GetDesktops(out IObjectArray desktops);
  [PreserveSig] int GetAdjacentDesktop(IVirtualDesktop from, int direction, out IVirtualDesktop desktop);
  void SwitchDesktop(IVirtualDesktop desktop);
}
// The same interface written out to the wallpaper methods. Windows 11 24H2 (build 26100+) put one method
// (SwitchDesktopAndMoveForegroundView) after SwitchDesktop without changing the interface id, so the layout is
// picked by build number; the app passes it in. Layouts from MScholtes/VirtualDesktop (VirtualDesktop11.cs, -24H2.cs).
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("53F5CA0B-158F-4124-900C-057158060B27")]
interface IVdmWall23 {
  int GetCount(); void a(); void b(); IVirtualDesktop GetCurrentDesktop(); void GetDesktops(out IObjectArray desktops); void c(); void d();
  void e(); void f(); void g(); void h(); void i();
  void SetDesktopName(IVirtualDesktop desktop, [MarshalAs(UnmanagedType.HString)] string name);
  void SetDesktopWallpaper(IVirtualDesktop desktop, [MarshalAs(UnmanagedType.HString)] string path);
}
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("53F5CA0B-158F-4124-900C-057158060B27")]
interface IVdmWall24 {
  int GetCount(); void a(); void b(); IVirtualDesktop GetCurrentDesktop(); void GetDesktops(out IObjectArray desktops); void c(); void d();
  void SwitchDesktopAndMoveForegroundView(IVirtualDesktop desktop);
  void e(); void f(); void g(); void h(); void i();
  void SetDesktopName(IVirtualDesktop desktop, [MarshalAs(UnmanagedType.HString)] string name);
  void SetDesktopWallpaper(IVirtualDesktop desktop, [MarshalAs(UnmanagedType.HString)] string path);
}
// to read a desktop's background back (the same on both builds)
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("3F07F4BE-B107-441A-AF0F-39D82529072C")]
interface IVirtualDesktopW {
  void a(); void b();
  [return: MarshalAs(UnmanagedType.HString)] string GetName();
  [return: MarshalAs(UnmanagedType.HString)] string GetWallpaperPath();
}
// Windows' documented wallpaper interface (what Settings uses): on Windows 11 it sets the background of the desktop
// showing, the one a desktop's own background overrides
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B")]
interface IDesktopWallpaper {
  void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
  [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorID);
  void a(); void b(); void c(); void d(); void e();
  void SetPosition(int position);
}
[ComImport, Guid("C2CF3110-460E-4fc1-B9D0-8A1C0C9CC4BD")] class DesktopWallpaperClass { }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("4CE81583-1E4C-4632-A621-07A53543148F")]
interface IVirtualDesktopPinnedApps {
  bool IsAppIdPinned([MarshalAs(UnmanagedType.LPWStr)] string appId);
  void PinAppID([MarshalAs(UnmanagedType.LPWStr)] string appId);
  void UnpinAppID([MarshalAs(UnmanagedType.LPWStr)] string appId);
  bool IsViewPinned(IApplicationView view);
  void PinView(IApplicationView view);
  void UnpinView(IApplicationView view);
}
// the public (documented) interface: which desktop a window is on, for any program's window
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A5CD92FF-29BE-454C-8D04-D82879FB3F1B")]
interface IVirtualDesktopManager { [PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr hwnd, out int on); [PreserveSig] int GetWindowDesktopId(IntPtr hwnd, out Guid id); }
[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("6D5140C1-7436-11CE-8034-00AA006009FA")]
interface IServiceProvider10 { [return: MarshalAs(UnmanagedType.IUnknown)] object QueryService(ref Guid service, ref Guid riid); }
public static class SdDesk {
  static IVirtualDesktopManagerInternal mgr;
  static IApplicationViewCollection views;
  static IVirtualDesktopPinnedApps pins;
  static IVirtualDesktopManager pub;
  static System.Collections.Generic.Dictionary<long, bool> carried = new System.Collections.Generic.Dictionary<long, bool>();
  static void Init() {
    if (mgr != null) return;
    var shell = (IServiceProvider10)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2F03A33-21F5-47FA-B4BB-156362A2F239"))); // ImmersiveShell
    Guid svc = new Guid("C5E0CDCA-7B6E-41B2-9FC4-D93975CC467B"), iid = typeof(IVirtualDesktopManagerInternal).GUID;
    mgr = (IVirtualDesktopManagerInternal)shell.QueryService(ref svc, ref iid);
    Guid vsvc = typeof(IApplicationViewCollection).GUID, viid = typeof(IApplicationViewCollection).GUID;
    views = (IApplicationViewCollection)shell.QueryService(ref vsvc, ref viid);
    try { Guid psvc = new Guid("B5A399E7-1C87-46B8-88E9-FC5747B171BD"), piid = typeof(IVirtualDesktopPinnedApps).GUID; pins = (IVirtualDesktopPinnedApps)shell.QueryService(ref psvc, ref piid); } catch { pins = null; }
    try { pub = (IVirtualDesktopManager)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("AA509086-5CA9-4C25-8F95-589D3C07B48A"))); } catch { pub = null; }
  }
  static IVirtualDesktop Next(bool right) {
    IVirtualDesktop target;
    return mgr.GetAdjacentDesktop(mgr.GetCurrentDesktop(), right ? 4 : 3, out target) == 0 ? target : null; // 3 = left, 4 = right
  }
  public static int Count() { Init(); return mgr.GetCount(); }
  // the window onto the desktop to the left / right; false when there is no desktop there
  public static bool Move(IntPtr hwnd, bool right) {
    Init();
    IApplicationView view;
    if (views.GetViewForHwnd(hwnd, out view) != 0 || view == null) return false;
    var target = Next(right); if (target == null) return false;
    mgr.MoveViewToDesktop(view, target);
    return true;
  }
  // Like Spaces on a Mac: the window stays in your hand while the desktops slide. It's shown on every desktop for the
  // slide (pinned), then Settle puts it on the desktop you arrived at. Without pinning, it's moved first (old way).
  public static bool Carry(IntPtr hwnd, bool right) {
    Init();
    IApplicationView view;
    if (views.GetViewForHwnd(hwnd, out view) != 0 || view == null) return false;
    var target = Next(right); if (target == null) return false;
    if (pins == null) { mgr.MoveViewToDesktop(view, target); return true; }
    bool ours = false;
    if (!pins.IsViewPinned(view)) { pins.PinView(view); ours = true; } // a window you pinned yourself stays pinned
    carried[hwnd.ToInt64()] = ours;
    return true;
  }
  public static bool Settle(IntPtr hwnd) {
    Init();
    bool ours; long key = hwnd.ToInt64();
    if (!carried.TryGetValue(key, out ours)) return false;
    carried.Remove(key);
    if (!ours) return true;
    IApplicationView view;
    if (views.GetViewForHwnd(hwnd, out view) != 0 || view == null) return false;
    pins.UnpinView(view);
    mgr.MoveViewToDesktop(view, mgr.GetCurrentDesktop());
    return true;
  }
  // the desktops overview: which desktop each window is on ({GUID}, or empty), a desktop by number, a window onto one
  public static string Map(string list) {
    Init();
    var sb = new System.Text.StringBuilder();
    foreach (var s in list.Split(',')) {
      long h; Guid g = Guid.Empty;
      if (pub != null && long.TryParse(s, out h) && pub.GetWindowDesktopId(new IntPtr(h), out g) != 0) g = Guid.Empty;
      if (sb.Length > 0) sb.Append(',');
      if (g != Guid.Empty) sb.Append(g.ToString("B").ToUpperInvariant());
    }
    return sb.ToString();
  }
  static IVirtualDesktop At(int i) {
    IObjectArray arr; mgr.GetDesktops(out arr);
    int n; arr.GetCount(out n);
    if (i < 0 || i >= n) return null;
    object o; Guid iid = typeof(IVirtualDesktop).GUID; arr.GetAt(i, ref iid, out o);
    return (IVirtualDesktop)o;
  }
  public static bool MoveTo(IntPtr hwnd, int i) {
    Init();
    IApplicationView view;
    if (views.GetViewForHwnd(hwnd, out view) != 0 || view == null) return false;
    var d = At(i); if (d == null) return false;
    mgr.MoveViewToDesktop(view, d);
    return true;
  }
  // a desktop's own background (Windows shows it while sliding to that desktop); checked afterwards by reading it back
  public static bool Wallpaper(int layout, int i, string file) {
    Init();
    var d = At(i); if (d == null || !System.IO.File.Exists(file)) return false;
    if (layout == 24) ((IVdmWall24)mgr).SetDesktopWallpaper(d, file);
    else if (layout == 23) ((IVdmWall23)mgr).SetDesktopWallpaper(d, file);
    else return false;
    string now = ((IVirtualDesktopW)d).GetWallpaperPath();
    return string.Equals(now, file, StringComparison.OrdinalIgnoreCase);
  }
  public static bool CurrentWallpaper(string file) {
    if (!System.IO.File.Exists(file)) return false;
    var dw = (IDesktopWallpaper)new DesktopWallpaperClass();
    dw.SetPosition(4); // fill
    dw.SetWallpaper(null, file); // every screen of the desktop showing
    return true;
  }
  public static bool SwitchTo(int i) { Init(); var d = At(i); if (d == null) return false; mgr.SwitchDesktop(d); return true; }
  // straight to the desktop next door (no slide): only when Windows' own Win+Ctrl+arrow didn't get through
  public static bool Switch(bool right) { Init(); var target = Next(right); if (target == null) return false; mgr.SwitchDesktop(target); return true; }
}
'@
[Console]::Out.WriteLine('{"ready":true,"count":' + [SdDesk]::Count() + '}'); [Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($null -eq $l) { exit 0 } # the app closed
  $p = $l.Trim().Split(' ')
  $ans = '{"id":' + [int]$p[0] + ',"ok":false}'
  try {
    if ($p[1] -eq 'map') { # answers with data: the desktop of each window
      $d = [SdDesk]::Map($(if ($p.Length -gt 2) { $p[2] } else { '' }))
      [Console]::Out.WriteLine('{"id":' + [int]$p[0] + ',"ok":true,"data":"' + $d + '"}'); [Console]::Out.Flush(); continue
    }
    $ok = switch ($p[1]) {
      'move' { [SdDesk]::Move([IntPtr][long]$p[2], $p[3] -eq 'right') }
      'carry' { [SdDesk]::Carry([IntPtr][long]$p[2], $p[3] -eq 'right') }
      'settle' { [SdDesk]::Settle([IntPtr][long]$p[2]) }
      'switch' { [SdDesk]::Switch($p[2] -eq 'right') }
      'switchto' { [SdDesk]::SwitchTo([int]$p[2]) }
      'moveto' { [SdDesk]::MoveTo([IntPtr][long]$p[2], [int]$p[3]) }
      'curwall' { [SdDesk]::CurrentWallpaper([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[2]))) }
      'wallpaper' { [SdDesk]::Wallpaper([int]$p[2], [int]$p[3], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p[4]))) }
      'count' { [SdDesk]::Count() -gt 0 }
      default { $false }
    }
    $ans = '{"id":' + [int]$p[0] + ',"ok":' + $(if ($ok) { 'true' } else { 'false' }) + '}'
  } catch { $ans = '{"id":' + [int]$p[0] + ',"ok":false,"error":"' + ($_.Exception.Message -replace '[^A-Za-z0-9 .,:()-]', ' ') + '"}' }
  [Console]::Out.WriteLine($ans); [Console]::Out.Flush()
}
`;

// Windows 11 only (Windows 10's interfaces are different)
const supported = () => win32.isWin && Number((os.release().split('.')[2]) || 0) >= 22000;
let child = null, ready = false, count = 0, nextId = 1, restarts = 0, stopped = false, lastError = '';
const waiting = new Map();
function start() {
  if (!supported() || child || stopped) return;
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(ps, psArgs(PS, 'vdesk'), { windowsHide: true });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.ready) { ready = true; count = j.count; restarts = 0; continue; }
      const w = waiting.get(j.id); if (!w) continue;
      waiting.delete(j.id); if (j.error) lastError = j.error; w(j.data !== undefined ? j : !!j.ok);
    }
  });
  child.stderr.on('data', (d) => { const l = String(d).split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#< CLIXML') && !x.startsWith('<Objs')); if (l) { lastError = l; console.warn('[vdesk]', l); } });
  child.on('exit', () => {
    child = null; ready = false;
    for (const w of waiting.values()) w(false);
    waiting.clear();
    if (!stopped && ++restarts <= 3) setTimeout(start, 3000 * restarts);
  });
}
function ask(cmd, timeout = 1500) {
  if (!ready || !child?.stdin.writable) return Promise.resolve(false);
  const id = nextId++;
  return new Promise((resolve) => {
    const t = setTimeout(() => { waiting.delete(id); resolve(false); }, timeout);
    waiting.set(id, (ok) => { clearTimeout(t); resolve(ok); });
    child.stdin.write(`${id} ${cmd}\n`);
  });
}
module.exports = {
  PS, start, supported,
  stop: () => { stopped = true; child?.kill(); child = null; ready = false; },
  status: () => ({ supported: supported(), ready, count, error: lastError }),
  move: (hwnd, right) => ask(`move ${Math.trunc(Number(hwnd))} ${right ? 'right' : 'left'}`),
  carry: (hwnd, right) => ask(`carry ${Math.trunc(Number(hwnd))} ${right ? 'right' : 'left'}`),
  settle: (hwnd) => ask(`settle ${Math.trunc(Number(hwnd))}`),
  switchTo: (right) => ask(`switch ${right ? 'right' : 'left'}`),
  /** The desktop ({GUID}, '' when unknown) of each window, in order. */
  async map(hwnds) {
    const list = hwnds.map((h) => Math.trunc(Number(h))).filter(Number.isFinite).slice(0, 200);
    if (!list.length) return [];
    const r = await ask(`map ${list.join(',')}`, 3000);
    return r && typeof r.data === 'string' ? r.data.split(',') : list.map(() => '');
  },
  goTo: (i) => ask(`switchto ${Math.trunc(Number(i))}`),
  /** The background of the desktop showing, through Windows' documented wallpaper interface. */
  currentWallpaper: (file) => (file ? ask(`curwall ${Buffer.from(String(file), 'utf8').toString('base64')}`, 4000) : Promise.resolve(false)),
  lastError: () => lastError,
  /** Desktop number i's own Windows background (a picture file). False where this Windows build isn't known. */
  wallpaper(i, file) {
    const build = Number(os.release().split('.')[2]) || 0;
    const layout = build >= 26100 ? 24 : build >= 22000 ? 23 : 0; // 24H2 and later / earlier Windows 11 (the helper only starts where the interface id matches)
    if (!layout || !file) return Promise.resolve(false);
    return ask(`wallpaper ${layout} ${Math.trunc(Number(i))} ${Buffer.from(String(file), 'utf8').toString('base64')}`, 4000);
  },
  moveTo: (hwnd, i) => ask(`moveto ${Math.trunc(Number(hwnd))} ${Math.trunc(Number(i))}`),
};
