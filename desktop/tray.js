// The system tray (Discord, Steam, OneDrive… the icons by the clock), shown in the top bar.
// With the dock on, Windows' taskbar is hidden, and its tray with it. Programs put their icons there with
// Shell_NotifyIcon, which sends them to the first window called "Shell_TrayWnd". A long-running PowerShell makes
// a hidden window of that name, kept in front of Explorer's, so it hears every icon first; then it passes each
// message on to Explorer unchanged, so Windows' own tray stays complete (and takes over if the app closes).
// Clicking an icon here sends the program the same message a click on Windows' tray would.
// No code goes into Explorer (taskbar replacements like RetroBar work the same way, without injection).
// One JSON line per change on stdout; one command per line on stdin.
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');
const { psArgs } = require('./ps-script');

const PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class SdTray {
  delegate IntPtr WndProcD(IntPtr h, uint m, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct WNDCLASSEX { public uint cbSize; public uint style; public WndProcD lpfnWndProc; public int cbClsExtra; public int cbWndExtra; public IntPtr hInstance; public IntPtr hIcon; public IntPtr hCursor; public IntPtr hbrBackground; public string lpszMenuName; public string lpszClassName; public IntPtr hIconSm; }
  [StructLayout(LayoutKind.Sequential)] struct COPYDATASTRUCT { public IntPtr dwData; public int cbData; public IntPtr lpData; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateWindowEx(uint ex, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
  [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterWindowMessage(string s);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool ChangeWindowMessageFilterEx(IntPtr h, uint msg, uint action, IntPtr p);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint pid);
  [DllImport("user32.dll")] static extern IntPtr SetTimer(IntPtr h, IntPtr id, uint ms, IntPtr fn);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string n);
  [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();

  class Item { public string Id; public uint Hwnd; public uint Uid; public uint Cb; public uint Ver; public string Tip = ""; public string Png = ""; public bool Hidden; public uint Pid; }
  static WndProcD proc;
  static IntPtr me = IntPtr.Zero, real = IntPtr.Zero;
  static uint taskbarCreated;
  static volatile bool dirty;
  static readonly object gate = new object();
  static readonly List<Item> items = new List<Item>();

  static void Out(string s) { lock (gate) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
  static string Esc(string s) {
    var b = new StringBuilder("\\"");
    foreach (char c in s ?? "") {
      if (c == '"' || c == '\\\\') { b.Append('\\\\'); b.Append(c); }
      else if (c < 32 || c > 126) b.Append("\\\\u" + ((int)c).ToString("x4")); // any language survives any console code page
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }
  // Explorer's own tray window (not ours)
  static IntPtr FindReal() {
    IntPtr h = IntPtr.Zero; uint mine = GetCurrentProcessId();
    for (int i = 0; i < 8; i++) {
      h = FindWindowEx(IntPtr.Zero, h, "Shell_TrayWnd", null);
      if (h == IntPtr.Zero) break;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != mine) return h;
    }
    return IntPtr.Zero;
  }
  static bool IsFront() { return FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Shell_TrayWnd", null) == me; }
  // in front of Explorer's, so programs find ours first; the same place and size as the taskbar (some programs ask)
  static void Front() {
    RECT r;
    if (real != IntPtr.Zero && GetWindowRect(real, out r)) SetWindowPos(me, new IntPtr(-1), r.L, r.T, r.R - r.L, r.B - r.T, 0x0010 | 0x0200); // HWND_TOPMOST, NOACTIVATE | NOOWNERZORDER
    else SetWindowPos(me, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0200);
  }
  static IntPtr Forward(uint msg, IntPtr w, IntPtr l) {
    if (real == IntPtr.Zero || !IsWindow(real)) real = FindReal();
    if (real == IntPtr.Zero) return IntPtr.Zero;
    IntPtr res; SendMessageTimeout(real, msg, w, l, 0x0002, 4000, out res); // SMTO_ABORTIFHUNG
    return res;
  }
  static string ToPng(uint h) {
    if (h == 0) return "";
    try {
      using (var ic = Icon.FromHandle(new IntPtr((int)h)))
      using (var bmp = ic.ToBitmap())
      using (var ms = new MemoryStream()) { bmp.Save(ms, ImageFormat.Png); return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray()); }
    } catch { return ""; }
  }
  static uint U32(IntPtr p, int off) { return (uint)Marshal.ReadInt32(p, off); }
  // SHELLTRAYDATA: signature, message, then NOTIFYICONDATA with 32-bit handles (the same for every program)
  static void Handle(IntPtr p, int cb) {
    if (cb < 8 + 24 || U32(p, 0) != 0x34753423) return;
    uint op = U32(p, 4);
    IntPtr n = IntPtr.Add(p, 8);
    int size = Math.Min((int)U32(n, 0), cb - 8);
    uint hwnd = U32(n, 4), uid = U32(n, 8), flags = U32(n, 12), cbm = U32(n, 16), hicon = U32(n, 20);
    int tipChars = size >= 936 ? 128 : 64;
    string tip = "";
    if (size >= 24 + tipChars * 2) { tip = Marshal.PtrToStringUni(IntPtr.Add(n, 24), tipChars); int z = tip.IndexOf('\\0'); if (z >= 0) tip = tip.Substring(0, z); }
    uint state = size >= 288 ? U32(n, 280) : 0, mask = size >= 288 ? U32(n, 284) : 0, ver = size >= 804 ? U32(n, 800) : 0;
    string id = hwnd + ":" + uid;
    if ((flags & 0x20) != 0 && size >= 952) { var g = new byte[16]; Marshal.Copy(IntPtr.Add(n, 936), g, 0, 16); id = new Guid(g).ToString(); }
    lock (gate) {
      Item it = items.Find(x => x.Id == id);
      if (op == 2) { if (it != null) { items.Remove(it); dirty = true; } return; } // NIM_DELETE
      if (op == 4) { if (it != null) it.Ver = ver; return; } // NIM_SETVERSION
      if (op != 0 && op != 1) return;
      if (it == null) { it = new Item(); it.Id = id; items.Add(it); }
      it.Hwnd = hwnd; it.Uid = uid;
      uint pid; GetWindowThreadProcessId(new IntPtr((int)hwnd), out pid); it.Pid = pid;
      if ((flags & 0x1) != 0) it.Cb = cbm;
      if ((flags & 0x2) != 0) it.Png = ToPng(hicon);
      if ((flags & 0x4) != 0) it.Tip = tip;
      if ((flags & 0x8) != 0 && (mask & 0x1) != 0) it.Hidden = (state & 0x1) != 0;
      dirty = true;
    }
  }
  static void Emit() {
    var b = new StringBuilder("{\\"icons\\":[");
    lock (gate) {
      dirty = false;
      for (int i = 0; i < items.Count; i++) {
        var x = items[i];
        if (i > 0) b.Append(',');
        b.Append("{\\"id\\":" + Esc(x.Id) + ",\\"tip\\":" + Esc(x.Tip) + ",\\"icon\\":" + Esc(x.Png) + ",\\"hidden\\":" + (x.Hidden ? "true" : "false") + ",\\"pid\\":" + x.Pid + ",\\"v\\":" + x.Ver + "}");
      }
    }
    Out(b.Append("],\\"front\\":" + (IsFront() ? "true" : "false") + "}").ToString());
  }
  static void Prune() { lock (gate) { if (items.RemoveAll(x => !IsWindow(new IntPtr((int)x.Hwnd))) > 0) dirty = true; } } // programs that quit without removing theirs
  static IntPtr WndProc(IntPtr h, uint msg, IntPtr w, IntPtr l) {
    try {
      if (msg == 0x004A) { // WM_COPYDATA: tray icons (1), and appbar and icon-position requests, all passed on to Explorer
        var cds = (COPYDATASTRUCT)Marshal.PtrToStructure(l, typeof(COPYDATASTRUCT));
        if (cds.dwData.ToInt64() == 1 && cds.lpData != IntPtr.Zero) Handle(cds.lpData, cds.cbData);
        return Forward(msg, w, l);
      }
      if (msg == 0x0113) { // WM_TIMER
        if (w.ToInt64() == 1) { if (dirty) Emit(); }
        else { Prune(); Front(); }
        return IntPtr.Zero;
      }
      if (taskbarCreated != 0 && msg == taskbarCreated) { IntPtr r = FindReal(); if (r != IntPtr.Zero) real = r; Front(); return IntPtr.Zero; } // Explorer restarted
      if (msg >= 0x0400) return Forward(msg, w, l); // other requests meant for the taskbar
    } catch (Exception e) { Out("{\\"error\\":" + Esc(e.Message) + "}"); }
    return DefWindowProc(h, msg, w, l);
  }
  // a click on the icon in the top bar: the messages Windows' tray sends for one
  static void Click(string id, string kind, int x, int y) {
    Item it;
    lock (gate) { it = items.Find(i => i.Id == id); }
    if (it == null || it.Cb == 0) return;
    IntPtr hw = new IntPtr((int)it.Hwnd);
    AllowSetForegroundWindow(it.Pid); // its menu / window may come to the front
    uint[] seq = kind == "right" ? new uint[] { 0x0204, 0x0205 } : kind == "double" ? new uint[] { 0x0203 } : new uint[] { 0x0201, 0x0202 };
    if (it.Ver >= 4) { // NOTIFYICON_VERSION_4: the event and icon id in lParam, the anchor point in wParam
      IntPtr wp = new IntPtr((y << 16) | (x & 0xFFFF));
      foreach (uint m in seq) PostMessage(hw, it.Cb, wp, new IntPtr((int)((it.Uid << 16) | m)));
      uint extra = kind == "right" ? 0x007Bu : kind == "left" ? 0x0400u : 0u; // WM_CONTEXTMENU / NIN_SELECT
      if (extra != 0) PostMessage(hw, it.Cb, wp, new IntPtr((int)((it.Uid << 16) | extra)));
    } else {
      foreach (uint m in seq) PostMessage(hw, it.Cb, new IntPtr((int)it.Uid), new IntPtr((int)m));
      if (kind == "right" && it.Ver == 3) PostMessage(hw, it.Cb, new IntPtr((int)it.Uid), new IntPtr(0x007B));
    }
  }
  static void ReadCommands() {
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      try {
        string[] p = line.Trim().Split(' ');
        if (p.Length >= 5 && p[0] == "click") Click(p[1], p[2], int.Parse(p[3]), int.Parse(p[4]));
        else if (p[0] == "list") dirty = true;
      } catch (Exception e) { Out("{\\"error\\":" + Esc(e.Message) + "}"); }
    }
    Environment.Exit(0); // the app closed
  }
  public static void Run() {
    real = FindReal();
    taskbarCreated = RegisterWindowMessage("TaskbarCreated");
    proc = new WndProcD(WndProc);
    var wc = new WNDCLASSEX();
    wc.cbSize = (uint)Marshal.SizeOf(typeof(WNDCLASSEX)); wc.lpfnWndProc = proc; wc.hInstance = GetModuleHandle(null); wc.lpszClassName = "Shell_TrayWnd";
    if (RegisterClassEx(ref wc) == 0) { Out("{\\"error\\":\\"RegisterClassEx " + Marshal.GetLastWin32Error() + "\\"}"); return; }
    me = CreateWindowEx(0x00000080 | 0x00000008, "Shell_TrayWnd", "", 0x80000000, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, wc.hInstance, IntPtr.Zero); // tool window, topmost, popup; never shown
    if (me == IntPtr.Zero) { Out("{\\"error\\":\\"CreateWindowEx " + Marshal.GetLastWin32Error() + "\\"}"); return; }
    ChangeWindowMessageFilterEx(me, 0x004A, 1, IntPtr.Zero); // programs at any level may send their icons
    ChangeWindowMessageFilterEx(me, taskbarCreated, 1, IntPtr.Zero);
    Front();
    SetTimer(me, new IntPtr(1), 300, IntPtr.Zero); // report changes at most this often (animated icons)
    SetTimer(me, new IntPtr(2), 3000, IntPtr.Zero); // stay in front; drop icons of closed programs
    PostMessage(new IntPtr(0xFFFF), taskbarCreated, IntPtr.Zero, IntPtr.Zero); // "the taskbar was created": every program adds its icons again (to us)
    Out("{\\"ready\\":true,\\"front\\":" + (IsFront() ? "true" : "false") + ",\\"explorer\\":" + (real != IntPtr.Zero ? "true" : "false") + "}");
    var t = new Thread(ReadCommands); t.IsBackground = true; t.Start();
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { TranslateMessage(ref m); DispatchMessage(ref m); }
  }
}
'@
[SdTray]::Run()
`;

let child = null, ready = false, icons = [], front = false, lastError = '', restarts = 0, stopped = false;
const listeners = new Set();
function start() {
  if (!win32.isWin || child || stopped) return;
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(ps, psArgs(PS, 'tray'), { windowsHide: true });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.error) { lastError = j.error; console.warn('[tray]', j.error); continue; }
      if (j.ready) { ready = true; restarts = 0; front = !!j.front; continue; }
      if (Array.isArray(j.icons)) {
        icons = j.icons.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, tip: String(x.tip || ''), icon: /^data:image\/png;base64,/.test(x.icon || '') ? x.icon : '', hidden: !!x.hidden, pid: x.pid | 0 }));
        front = !!j.front;
        for (const fn of listeners) fn(icons);
      }
    }
  });
  child.stderr.on('data', (d) => { const l = String(d).split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#< CLIXML') && !x.startsWith('<Objs')); if (l) { lastError = l; console.warn('[tray]', l); } });
  child.on('exit', () => {
    child = null; ready = false; icons = [];
    for (const fn of listeners) fn(icons);
    if (!stopped && ++restarts <= 3) setTimeout(start, 3000 * restarts);
  });
}
module.exports = {
  PS, start,
  stop: () => { stopped = true; child?.kill(); child = null; ready = false; icons = []; },
  resume: () => { stopped = false; restarts = 0; start(); },
  status: () => ({ ready, front, count: icons.length, error: lastError }),
  icons: () => icons,
  onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  /** A click on an icon: kind left / right / double, at screen point x, y (physical pixels). */
  click(id, kind, x, y) {
    if (!ready || !child?.stdin.writable || !/^[\w{}:.-]+$/.test(id) || !['left', 'right', 'double'].includes(kind)) return false;
    child.stdin.write(`click ${id} ${kind} ${Math.round(x)} ${Math.round(y)}\n`);
    return true;
  },
};
