// System controls for the control centre and the island's pop-ups: volume and mute (Core Audio),
// screen brightness (WMI, laptop screens), Wi-Fi name/signal (netsh) and Wi-Fi / Bluetooth radios
// (Windows.Devices.Radios). One long-running Windows PowerShell; commands on stdin, state as JSON lines.
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');
const { psArgs } = require('./ps-script');

const PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[StructLayout(LayoutKind.Sequential)] struct PKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] struct PVAR { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore { int GetCount(out int n); int GetAt(int i, out PKEY k); int GetValue(ref PKEY k, out PVAR v); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
  int OpenPropertyStore(int access, out IPropertyStore props);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetState(out int state);
}
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection { int GetCount(out int n); int Item(int i, out IMMDevice dev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
// choosing where sound plays: the interface Windows' own sound settings use (ten methods come before the one needed)
[Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j();
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyConfigClient { }
// each app's own volume, as in Windows' volume mixer: the sessions on the output in use
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceAny { int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int a(); int b(); int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { int GetCount(out int n); int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  int GetState(out int state); int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  int a(); int b(); int c(); int d(); int e(); int f(); int g();
  int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id); int h();
  int GetProcessId(out uint pid); [PreserveSig] int IsSystemSoundsSession();
}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float level, ref Guid ctx); int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
public static class SdMixer {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, System.Text.StringBuilder s, ref int size);
  static string Exe(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return "";
    try { var sb = new System.Text.StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : ""; } finally { CloseHandle(h); }
  }
  static System.Collections.Generic.Dictionary<string, string> descs = new System.Collections.Generic.Dictionary<string, string>();
  static string Desc(string exe) {
    if (exe == "") return "";
    string d; if (descs.TryGetValue(exe, out d)) return d;
    try { d = System.Diagnostics.FileVersionInfo.GetVersionInfo(exe).FileDescription ?? ""; } catch { d = ""; }
    descs[exe] = d; return d;
  }
  static System.Collections.Generic.List<IAudioSessionControl2> Sessions() {
    var list = new System.Collections.Generic.List<IAudioSessionControl2>();
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return list;
    object o; var iid = typeof(IAudioSessionManager2).GUID;
    if (((IMMDeviceAny)dev).Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return list;
    IAudioSessionEnumerator e; if (((IAudioSessionManager2)o).GetSessionEnumerator(out e) != 0) return list;
    int n; e.GetCount(out n);
    for (int i = 0; i < n; i++) { IAudioSessionControl2 s; if (e.GetSession(i, out s) == 0 && s != null) list.Add(s); }
    return list;
  }
  // one line per app (its sessions together): pid, playing (1/0), volume 0-100, muted (1/0), name, exe; tab-separated
  public static string[] Apps() {
    var byPid = new System.Collections.Generic.Dictionary<uint, string[]>();
    foreach (var s in Sessions()) {
      try {
        int state; s.GetState(out state); if (state == 2) continue; // expired
        uint pid; s.GetProcessId(out pid);
        bool sys = s.IsSystemSoundsSession() == 0;
        var v = (ISimpleAudioVolume)s; float lv; bool m; v.GetMasterVolume(out lv); v.GetMute(out m);
        string exe = sys ? "" : Exe(pid), name = "";
        if (sys) name = "System sounds";
        else { s.GetDisplayName(out name); if (string.IsNullOrEmpty(name) || name.StartsWith("@")) name = Desc(exe); if (string.IsNullOrEmpty(name)) name = System.IO.Path.GetFileNameWithoutExtension(exe); }
        if (!sys && pid == 0) continue;
        string[] cur;
        if (byPid.TryGetValue(pid, out cur)) { if (state == 1) cur[1] = "1"; continue; }
        byPid[pid] = new string[] { pid.ToString(), state == 1 ? "1" : "0", ((int)Math.Round(lv * 100)).ToString(), m ? "1" : "0", (name ?? "").Replace((char)9, ' '), exe };
      } catch { }
    }
    var outl = new System.Collections.Generic.List<string>();
    foreach (var a in byPid.Values) outl.Add(string.Join(((char)9).ToString(), a));
    return outl.ToArray();
  }
  public static void Set(uint pid, int volume, int mute) {
    Guid g = Guid.Empty;
    foreach (var s in Sessions()) {
      try {
        uint p; s.GetProcessId(out p); if (p != pid) continue;
        var v = (ISimpleAudioVolume)s;
        if (volume >= 0) { v.SetMasterVolume(Math.Max(0, Math.Min(100, volume)) / 100f, ref g); if (volume > 0) v.SetMute(false, ref g); }
        if (mute >= 0) v.SetMute(mute == 1, ref g);
      } catch { }
    }
  }
}
public static class SdAudio {
  static IAudioEndpointVolume Vol() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume v; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v)); return v;
  }
  public static float Get() { float v; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty)); }
  public static bool Muted() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void Mute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
  // the sound outputs Windows has right now (speakers, headphones, Bluetooth…): id + name, names looked up once
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PVAR v);
  static System.Collections.Generic.Dictionary<string, string> names = new System.Collections.Generic.Dictionary<string, string>();
  static string Name(IMMDevice d) {
    try {
      IPropertyStore ps; if (d.OpenPropertyStore(0, out ps) != 0) return "";
      var k = new PKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; // PKEY_Device_FriendlyName
      PVAR v; if (ps.GetValue(ref k, out v) != 0) return "";
      string s = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : ""; // VT_LPWSTR
      PropVariantClear(ref v); return s ?? "";
    } catch { return ""; }
  }
  // the output in use (its id), and making another one the default for everything (system sounds, media, calls)
  public static string Default() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; if (e.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return "";
    string id; return dev.GetId(out id) == 0 && id != null ? id : "";
  }
  public static void SetDefault(string id) {
    bool known = false;
    foreach (var o in Outputs()) if (o.Split((char)9)[0] == id) known = true; // only an output Windows lists right now
    if (!known) return;
    var pc = (IPolicyConfig)(new PolicyConfigClient());
    for (int role = 0; role < 3; role++) Marshal.ThrowExceptionForHR(pc.SetDefaultEndpoint(id, role));
  }
  public static string[] Outputs() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDeviceCollection c; Marshal.ThrowExceptionForHR(e.EnumAudioEndpoints(0, 1, out c)); // render, DEVICE_STATE_ACTIVE
    int n; c.GetCount(out n);
    var list = new System.Collections.Generic.List<string>();
    for (int i = 0; i < n; i++) {
      IMMDevice d; if (c.Item(i, out d) != 0) continue;
      string id; if (d.GetId(out id) != 0 || id == null) continue;
      string nm; if (!names.TryGetValue(id, out nm)) { nm = Name(d); names[id] = nm; }
      list.Add(id + "\t" + nm);
    }
    return list.ToArray();
  }
}
'@
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function Await($op, $type) { $t = $asOp.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$radios = @()
try {
  [void][Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
  [void](Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
  $radios = @(Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]))
} catch {}
function Radio($kind) { $radios | Where-Object { $_.Kind.ToString() -eq $kind } | Select-Object -First 1 }
function SetRadio($kind, $on) { $r = Radio $kind; if ($r) { [void](Await ($r.SetStateAsync($(if ($on) { 'On' } else { 'Off' }))) ([Windows.Devices.Radios.RadioAccessStatus])) } }
function Brightness() { try { (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch { $null } }
# Wi-Fi name and signal from Windows' network API (in this process, cheap enough to ask every second); netsh is
# the fallback (a program run each time, so only every 6 s)
$netRt = $false
try { [void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]; $netRt = $true } catch {}
function WifiRt() {
  $p = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles() | Where-Object { $_.IsWlanConnectionProfile -and $_.GetNetworkConnectivityLevel().ToString() -ne 'None' } | Select-Object -First 1
  if (-not $p) { return @{ ssid = ''; signal = 0 } }
  $bars = $p.GetSignalBars()
  @{ ssid = [string]$p.WlanConnectionProfileDetails.GetConnectedSsid(); signal = $(if ($null -ne $bars) { [int]$bars * 20 } else { 0 }) }
}
function Wifi() {
  if ($netRt) { try { return (WifiRt) } catch { $script:netRt = $false } }
  try {
    $o = (netsh wlan show interfaces) -join [char]10
    $ssid = if ($o -match '(?m)^\\s*SSID\\s*:\\s*(.+)$') { $Matches[1].Trim() } else { '' }
    $sig = if ($o -match '(\\d+)%') { [int]$Matches[1] } else { 0 }
    @{ ssid = $ssid; signal = $sig }
  } catch { @{ ssid = ''; signal = 0 } }
}
$in = [Console]::OpenStandardInput(); $buf = New-Object byte[] 1024
$rd = $in.ReadAsync($buf, 0, $buf.Length)
$parent = [int]$env:SD_PARENT_PID
$last = ''; $tick = 0; $bright = Brightness; $wifi = Wifi; $apps = @(); $watchApps = $false; $outs = @(); $out = ''
while ($true) {
  if ($rd.IsCompleted) {
    $n = 0; try { $n = $rd.Result } catch {}
    if ($n -le 0) { exit 0 }
    foreach ($c in ([Text.Encoding]::ASCII.GetString($buf, 0, $n) -split [char]10)) {
      $p = $c.Trim().Split(' '); if (-not $p[0]) { continue }
      try {
        switch ($p[0]) {
          'volume' { [SdAudio]::Set([float]$p[1] / 100); if ([SdAudio]::Muted() -and [float]$p[1] -gt 0) { [SdAudio]::Mute($false) } }
          'mute' { [SdAudio]::Mute($p[1] -eq '1') }
          'output' { [SdAudio]::SetDefault($p[1]) }
          'apps' { $watchApps = ($p[1] -eq '1'); if (-not $watchApps) { $apps = @() }; $tick = 1 }
          'appvol' { [SdMixer]::Set([uint32]$p[1], [int]$p[2], -1); $tick = 1 } # report the new level at once
          'appmute' { [SdMixer]::Set([uint32]$p[1], -1, [int]$p[2]); $tick = 1 }
          'brightness' { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1 | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$p[1] } | Out-Null; $bright = [int]$p[1] }
          'wifi' { SetRadio 'WiFi' ($p[1] -eq '1'); $wifi = Wifi }
          'bluetooth' { SetRadio 'Bluetooth' ($p[1] -eq '1') }
          'airplane' { foreach ($r in $radios) { [void](Await ($r.SetStateAsync($(if ($p[1] -eq '1') { 'Off' } else { 'On' }))) ([Windows.Devices.Radios.RadioAccessStatus])) } }
        }
      } catch {}
    }
    $rd = $in.ReadAsync($buf, 0, $buf.Length)
  }
  if (($tick % 20) -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit 0 }
  if (($tick % 20) -eq 2) { $bright = Brightness }     # every 10 s (WMI is slow)
  if (($tick % $(if ($netRt) { 2 } else { 12 })) -eq 0) { $wifi = Wifi } # every second (every 6 s with netsh)
  $vol = -1; $muted = $false
  try { $vol = [math]::Round([SdAudio]::Get() * 100); $muted = [SdAudio]::Muted() } catch {}
  if (($tick % 4) -eq 0 -or $outs.Count -eq 0) { # the outputs every 2 s
    $outs = @(); try { $outs = @([SdAudio]::Outputs() | ForEach-Object { $q = $_.Split([char]9); [ordered]@{ id = $q[0]; name = $q[1] } }) } catch {}
    $out = ''; try { $out = [SdAudio]::Default() } catch {}
  }
  if ($watchApps -and ($tick % 2) -eq 1) { $apps = @(); try { $apps = @([SdMixer]::Apps() | ForEach-Object { $q = $_.Split([char]9); [ordered]@{ pid = [int]$q[0]; playing = $q[1] -eq '1'; volume = [int]$q[2]; muted = $q[3] -eq '1'; name = $q[4]; exe = $q[5] } }) } catch {} } # every second
  $w = Radio 'WiFi'; $b = Radio 'Bluetooth'
  $o = [ordered]@{
    volume = $vol; muted = $muted; brightness = $bright
    wifi = [ordered]@{ on = $(if ($w) { $w.State.ToString() -eq 'On' } else { [bool]$wifi.ssid }); has = [bool]$w; ssid = $wifi.ssid; signal = $wifi.signal }
    bluetooth = [ordered]@{ on = $(if ($b) { $b.State.ToString() -eq 'On' } else { $false }); has = [bool]$b }
    outputs = $outs; output = $out; apps = $apps
    airplane = $(if ($radios.Count) { -not ($radios | Where-Object { $_.State.ToString() -eq 'On' }) } else { $false })
  }
  $j = [regex]::Replace(($o | ConvertTo-Json -Compress -Depth 4), '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value })
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  $tick++
  Start-Sleep -Milliseconds 500 # twice a second is plenty for the control centre
}
`;

let child = null, state = null, listeners = new Set(), restarts = 0, stopped = false;
function start() {
  if (!win32.isWin || child || stopped) return;
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(ps, psArgs(PS, 'sysctl'), { windowsHide: true, env: { ...process.env, SD_PARENT_PID: String(process.pid) } }); // from a file: too long for a command line
  if (appsOn) child.stdin.write('apps 1\n'); // restarted while the sound panel is open
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try { const prev = state; state = JSON.parse(line); if (state.apps && !Array.isArray(state.apps)) state.apps = [state.apps]; restarts = 0; for (const fn of listeners) fn(state, prev); } catch {}
    }
  });
  child.stderr.on('data', (d) => { const l = String(d).split('\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#< CLIXML') && !x.startsWith('<Objs')); if (l) console.warn('[sysctl]', l); });
  child.on('exit', () => { child = null; if (!stopped && ++restarts <= 5) setTimeout(start, 3000 * restarts); });
}
function stop() { stopped = true; child?.kill(); child = null; }
const COMMANDS = { volume: (v) => Math.round(Math.max(0, Math.min(100, Number(v) || 0))), mute: (v) => (v ? 1 : 0), brightness: (v) => Math.round(Math.max(0, Math.min(100, Number(v) || 0))), wifi: (v) => (v ? 1 : 0), bluetooth: (v) => (v ? 1 : 0), airplane: (v) => (v ? 1 : 0) };
function set(what, value) {
  if (what === 'output') { // a sound output by its Windows id: {0.0.0.00000000}.{guid}
    if (!/^\{[0-9.]+\}\.\{[0-9a-fA-F-]{36}\}$/.test(String(value)) || !state?.outputs?.some((o) => o.id === value)) throw new Error('unknown sound output');
    if (child?.stdin.writable) child.stdin.write(`output ${value}\n`);
    return;
  }
  if (what === 'appvol' || what === 'appmute') { // one app's own volume / mute: [pid, value], for an app that's in the list
    const [pid, v] = Array.isArray(value) ? value : [];
    if (!Number.isInteger(pid) || !state?.apps?.some((a) => a.pid === pid)) throw new Error('unknown app');
    const n = what === 'appvol' ? Math.round(Math.max(0, Math.min(100, Number(v) || 0))) : (v ? 1 : 0);
    if (child?.stdin.writable) child.stdin.write(`${what} ${pid} ${n}\n`);
    return;
  }
  if (!COMMANDS[what]) throw new Error('unknown control');
  if (child?.stdin.writable) child.stdin.write(`${what} ${COMMANDS[what](value)}\n`);
}
let appsOn = false;
/** Each app's volume is read (every second) only while the sound panel shows it. */
function watchApps(on) { on = !!on; if (on === appsOn) return; appsOn = on; if (child?.stdin.writable) child.stdin.write(`apps ${on ? 1 : 0}\n`); }
module.exports = { PS, start, stop, set, watchApps, get: () => state, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
