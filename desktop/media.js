// "Now playing": what Windows' media controls show (Spotify, browsers, the Media Player app…).
// One long-running Windows PowerShell reads Windows.Media.Control (the same source as the volume
// flyout) and prints a JSON line whenever the song or play state changes. Controls are the
// standard media keys, so they work with every player.
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');

const PS = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function Await($op, $type) { $t = $asOp.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$parent = [int]$env:SD_PARENT_PID
$last = ''; $lastKey = ''; $art = ''
while ($true) {
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit 0 }
  $o = [ordered]@{ on = $false }
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $key = "$($p.Title)|$($p.Artist)"
      if ($key -ne $lastKey) {
        $lastKey = $key; $art = ''
        if ($p.Thumbnail) {
          try {
            $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            $ms = New-Object System.IO.MemoryStream
            [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st).CopyTo($ms)
            if ($ms.Length -lt 600000) { $art = 'data:' + $st.ContentType + ';base64,' + [Convert]::ToBase64String($ms.ToArray()) }
          } catch {}
        }
      }
      $o = [ordered]@{ on = $true; title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'); art = $art }
    }
  } catch { $o = [ordered]@{ on = $false; error = $_.Exception.Message } }
  # non-ASCII (Chinese, Japanese, emoji…) as \\uXXXX escapes: the text survives whatever the console code page is
  $j = [regex]::Replace(($o | ConvertTo-Json -Compress), '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value })
  if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  Start-Sleep -Milliseconds 900
}
`;

let child = null, state = { on: false }, listeners = new Set(), restarts = 0, stopped = false;

function emit(next) { state = next; for (const fn of listeners) fn(state); }

function start() {
  if (!win32.isWin || child || stopped) return;
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS, 'utf16le').toString('base64')],
    { windowsHide: true, env: { ...process.env, SD_PARENT_PID: String(process.pid) } });
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try { const j = JSON.parse(line); restarts = 0; emit({ on: !!j.on, title: j.title || '', artist: j.artist || '', app: j.app || '', playing: !!j.playing, art: j.art || '', error: j.error || '' }); } catch {}
    }
  });
  let lastErr = '';
  child.stderr.on('data', (d) => { lastErr = String(d).trim().split('\n')[0]; console.warn('[media]', lastErr); });
  child.on('exit', () => {
    child = null;
    if (stopped) return;
    emit({ on: false, error: lastErr || 'the media reader stopped' });
    if (++restarts <= 5) setTimeout(start, 3000 * restarts); // gave up after 5 quick failures (e.g. no media controls on this Windows)
  });
}

function stop() { stopped = true; child?.kill(); child = null; }

// virtual-key codes of the media keys
const KEYS = { toggle: 0xB3, next: 0xB0, prev: 0xB1 };
function control(cmd) {
  if (!KEYS[cmd]) throw new Error('unknown media command');
  win32.mediaKey(KEYS[cmd]);
}

module.exports = {
  PS, start, stop, control,
  get: () => state,
  onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
