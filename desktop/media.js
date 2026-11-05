// "Now playing": what Windows' media controls show (Spotify, browsers, the Media Player app…).
// One long-running Windows PowerShell reads Windows.Media.Control (the same source as the volume
// flyout) and prints a JSON line whenever the song or play state changes. Controls are the
// standard media keys, so they work with every player.
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');

const PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # no progress records on stderr
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function Await($op, $type) { $t = $asOp.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

# cover art: players often publish it a moment after the title, so this is retried for a while per song
function Read-Art($p) {
  if ($null -eq $p.Thumbnail) { $script:artError = 'the player gives no cover'; return '' }
  try {
    $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    # read in chunks until the end: PowerShell 5.1 often can't see the stream's Size / ContentType
    $dr = New-Object Windows.Storage.Streams.DataReader($st)
    $ms = New-Object System.IO.MemoryStream
    for ($i = 0; $i -lt 64; $i++) {
      $n = [int](Await ($dr.LoadAsync(65536)) ([uint32]))
      if ($n -le 0) { break }
      $chunk = New-Object byte[] $n
      $dr.ReadBytes($chunk)
      $ms.Write($chunk, 0, $n)
      if ($n -lt 65536) { break }
    }
    $bytes = $ms.ToArray()
    if ($bytes.Length -lt 8) { $script:artError = "cover was $($bytes.Length) bytes"; return '' }
    # the image type from its first bytes
    $type = if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { 'image/png' } elseif ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { 'image/jpeg' } elseif ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { 'image/gif' } elseif ($bytes[0] -eq 0x52 -and $bytes[8] -eq 0x57) { 'image/webp' } elseif ($bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) { 'image/bmp' } else { '' }
    if (-not $type) { $script:artError = "unknown cover format ($($bytes[0]) $($bytes[1]))"; return '' }
    $script:artError = ''
    return 'data:' + $type + ';base64,' + [Convert]::ToBase64String($bytes)
  } catch { $script:artError = $_.Exception.Message; return '' }
}

# commands from the app arrive on stdin ("toggle", "next", "prev"); read without blocking the loop
$in = [Console]::OpenStandardInput(); $buf = New-Object byte[] 512
$rd = $in.ReadAsync($buf, 0, $buf.Length)
$parent = [int]$env:SD_PARENT_PID
$last = ''; $lastKey = ''; $art = ''; $artTries = 0; $artError = ''; $cmdResult = ''; $tick = 0
while ($true) {
  $poll = ($tick % 4) -eq 0
  if ($rd.IsCompleted) {
    $n = 0; try { $n = $rd.Result } catch {}
    if ($n -le 0) { exit 0 } # the app closed
    foreach ($c in ([Text.Encoding]::ASCII.GetString($buf, 0, $n) -split [char]10)) {
      $c = $c.Trim(); if (-not $c) { continue }
      try {
        $s = $mgr.GetCurrentSession(); $op = $null
        if ($s) {
          if ($c -eq 'toggle') { $op = $s.TryTogglePlayPauseAsync() }
          elseif ($c -eq 'next') { $op = $s.TrySkipNextAsync() }
          elseif ($c -eq 'prev') { $op = $s.TrySkipPreviousAsync() }
        }
        $cmdResult = if ($op) { "$($c):$(Await $op ([bool]))" } else { "$($c):no-session" }
      } catch { $cmdResult = "$($c):$($_.Exception.Message)" }
    }
    $rd = $in.ReadAsync($buf, 0, $buf.Length); $poll = $true
  }
  if (($tick % 40) -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit 0 }
  if ($poll) {
    $o = [ordered]@{ on = $false }
    try {
      $s = $mgr.GetCurrentSession()
      if ($s) {
        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $key = "$($p.Title)|$($p.Artist)"
        if ($key -ne $lastKey) { $lastKey = $key; $art = ''; $artTries = 0; $artError = '' }
        if (-not $art -and $artTries -lt 12) { $artTries++; $art = Read-Art $p }
        $o = [ordered]@{ on = $true; title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'); art = $art; artError = $artError; cmd = $cmdResult }
      }
    } catch { $o = [ordered]@{ on = $false; error = $_.Exception.Message } }
    # non-ASCII (Chinese, Japanese, emoji…) as \\uXXXX escapes: the text survives whatever the console code page is
    $j = [regex]::Replace(($o | ConvertTo-Json -Compress), '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value })
    if ($j -ne $last) { [Console]::Out.WriteLine($j); [Console]::Out.Flush(); $last = $j }
  }
  $tick++
  Start-Sleep -Milliseconds 220
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
      try { const j = JSON.parse(line); restarts = 0; emit({ on: !!j.on, title: j.title || '', artist: j.artist || '', app: j.app || '', playing: !!j.playing, art: j.art || '', artError: j.artError || '', cmd: j.cmd || '', error: j.error || '' }); } catch {}
    }
  });
  let lastErr = '';
  child.stderr.on('data', (d) => {
    const line = String(d).split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#< CLIXML') && !l.startsWith('<Objs')); // PowerShell's progress noise
    if (line) { lastErr = line; console.warn('[media]', line); }
  });
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
// Through Windows' media session (works with players that ignore media keys, e.g. NetEase Cloud Music);
// the media keys are only the fallback when the reader isn't running.
function control(cmd) {
  if (!KEYS[cmd]) throw new Error('unknown media command');
  if (child && child.stdin.writable) child.stdin.write(cmd + '\n');
  else win32.mediaKey(KEYS[cmd]);
}

module.exports = {
  PS, start, stop, control,
  get: () => state,
  onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
