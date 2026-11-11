// The Windows key opens Home instead of Windows' Start menu, the way Seelen UI's own Start menu takes it over.
// A long-running PowerShell keeps a low-level keyboard hook. It looks only at the Windows keys: when one is pressed
// and released alone (nothing else typed while it was down), it swallows that release and sends Windows a
// harmless "no key" press (0xFF) before it, which is how Windows' Start menu is kept shut (PowerToys does the same),
// and tells the app on stdout. Win+E, Win+D, Win+Tab and every other shortcut pass through untouched; no key is
// recorded or sent anywhere. Ctrl+Esc still opens Windows' Start menu.
// stdin: "on" / "off" (pass the Windows key straight through while off). stdout: "start" per tap, "ready".
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');
const { psArgs } = require('./ps-script');

const PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class SdWinKey {
  delegate IntPtr HookProc(int code, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct KBD { public uint vk; public uint scan; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
  static readonly UIntPtr MARK = new UIntPtr(0x5D5D0001); // our own key events: let them through as they are
  static HookProc proc;
  static IntPtr hook;
  static volatile bool on = true, test = false; // test: the CI check's own simulated keys count too
  static bool winDown, other;
  static uint downAt;
  static readonly object outLock = new object();
  static void Out(string s) { lock (outLock) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
  static bool Held(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static IntPtr Proc(int code, IntPtr w, IntPtr l) {
    if (code >= 0) {
      KBD k = (KBD)Marshal.PtrToStructure(l, typeof(KBD));
      int msg = w.ToInt32();
      bool down = msg == 0x100 || msg == 0x104, up = msg == 0x101 || msg == 0x105;
      bool injected = (k.flags & 0x10) != 0, isWin = k.vk == 0x5B || k.vk == 0x5C;
      if (k.extra != MARK) {
        if (isWin && (!injected || test)) {
          if (down && !winDown) { winDown = true; downAt = k.time; other = Held(0x10) || Held(0x11) || Held(0x12); } // Shift / Ctrl / Alt already down: a shortcut
          else if (up && winDown) {
            winDown = false;
            if (on && !other && unchecked(k.time - downAt) < 1500) {
              // in this order: "no key" down and up while Windows still thinks Win is held, then Win's release
              keybd_event(0xFF, 0, 0, MARK); keybd_event(0xFF, 0, 2, MARK);
              keybd_event((byte)k.vk, 0, 1 | 2, MARK);
              ThreadPool.QueueUserWorkItem(delegate { Out("start"); });
              return new IntPtr(1); // the real release is replaced by the three above
            }
          }
        } else if (winDown && down) other = true;
      }
    }
    return CallNextHookEx(hook, code, w, l);
  }
  static void ReadCommands() {
    string line;
    while ((line = Console.In.ReadLine()) != null) { line = line.Trim(); if (line == "on") on = true; else if (line == "off") on = false; else if (line == "test") test = true; }
    Environment.Exit(0); // the app closed
  }
  public static void Run() {
    proc = new HookProc(Proc);
    hook = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0); // WH_KEYBOARD_LL
    if (hook == IntPtr.Zero) { Out("error " + Marshal.GetLastWin32Error()); return; }
    Out("ready");
    Thread t = new Thread(ReadCommands); t.IsBackground = true; t.Start();
    MSG m;
    while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
  }
}
'@
[SdWinKey]::Run()
`;

let child = null, ready = false, wantOn = true, restarts = 0, stopped = true, lastError = '', taps = 0;
let onTap = () => {};
function start() {
  if (!win32.isWin || child || stopped) return;
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(ps, psArgs(PS, 'winkey'), { windowsHide: true });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line === 'ready') { ready = true; restarts = 0; if (!wantOn) child?.stdin.write('off\n'); }
      else if (line === 'start') { taps++; onTap(); }
      else if (line.startsWith('error')) { lastError = line; console.warn('[winkey]', line); }
    }
  });
  child.stderr.on('data', (d) => { const l = String(d).split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#< CLIXML') && !x.startsWith('<Objs')); if (l) { lastError = l; console.warn('[winkey]', l); } });
  child.on('exit', () => { child = null; ready = false; if (!stopped && ++restarts <= 3) setTimeout(start, 3000 * restarts); });
}
module.exports = {
  PS,
  /** Take the Windows key over (fn runs on each tap of it alone); again with null to give it back. */
  use(fn) {
    if (fn) { onTap = fn; stopped = false; restarts = 0; start(); }
    else { stopped = true; child?.kill(); child = null; ready = false; }
  },
  /** For a while (a game in front): the Windows key does what Windows does, without stopping the helper. */
  pause(p) { wantOn = !p; if (ready && child?.stdin.writable) child.stdin.write(p ? 'off\n' : 'on\n'); },
  status: () => ({ on: !stopped, ready, taps, error: lastError }),
  _test: () => child?.stdin.write('test\n'), // test/winkey.smoke.js only
};
