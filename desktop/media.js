// "Now playing": what Windows' media controls show (Spotify, browsers, the Media Player app…).
// One long-running Windows PowerShell reads Windows.Media.Control (the same source as the volume
// flyout) and prints a JSON line whenever the song or play state changes. Controls are the
// standard media keys, so they work with every player.
const { spawn } = require('child_process');
const path = require('path');
const win32 = require('./win32');
const { psArgs } = require('./ps-script');

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
    # PowerShell won't cast the stream to IInputStream itself; .NET reflection does (it asks the object for the interface)
    $ctor = [Windows.Storage.Streams.DataReader].GetConstructor([type[]]@([Windows.Storage.Streams.IInputStream]))
    $dr = $ctor.Invoke(@($st))
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
$last = ''; $lastKey = ''; $art = ''; $artTries = 0; $artError = ''; $cmdResult = ''; $tick = 0; $all = @(); $watchAll = $false
while ($true) {
  $poll = ($tick % 2) -eq 0 # about twice a second
  if ($rd.IsCompleted) {
    $n = 0; try { $n = $rd.Result } catch {}
    if ($n -le 0) { exit 0 } # the app closed
    foreach ($c in ([Text.Encoding]::ASCII.GetString($buf, 0, $n) -split [char]10)) {
      $c = $c.Trim(); if (-not $c -or $c -eq 'poll') { continue } # 'poll': just read the state again (below)
      if ($c -match '^sessions ([01])$') { $watchAll = $Matches[1] -eq '1'; if (-not $watchAll) { $all = @() }; $tick = 0; continue } # every player: only while the sound panel shows them
      try {
        $s = $mgr.GetCurrentSession(); $op = $null
        if ($c -match '^(toggle|next|prev) ([A-Za-z0-9+/=]+)$') { # one particular player (the sound panel lists them all)
          $c = $Matches[1]; $want = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[2]))
          $s = $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -eq $want } | Select-Object -First 1
        }
        if ($s) {
          if ($c -eq 'toggle') { $op = $s.TryTogglePlayPauseAsync() }
          elseif ($c -eq 'next') { $op = $s.TrySkipNextAsync() }
          elseif ($c -eq 'prev') { $op = $s.TrySkipPreviousAsync() }
          elseif ($c -match '^seek (\\d+(\\.\\d+)?)$') { $op = $s.TryChangePlaybackPositionAsync([long]([double]$Matches[1] * 10000000)) } # 100 ns units
        }
        $cmdResult = if ($op) { "$($c):$(Await $op ([bool]))" } else { "$($c):no-session" }
      } catch { $cmdResult = "$($c):$($_.Exception.Message)" }
    }
    $rd = $in.ReadAsync($buf, 0, $buf.Length); $poll = $true
  }
  if (($tick % 40) -eq 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit 0 }
  if ($watchAll -and $poll -and ($tick % 4) -eq 0) { # every player Windows knows (several can play at once), about once a second
    $all = @(); try { foreach ($x in $mgr.GetSessions()) { try {
      $xp = Await ($x.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $all += [ordered]@{ app = $x.SourceAppUserModelId; title = $xp.Title; artist = $xp.Artist; playing = ($x.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') }
    } catch {} } } catch {}
  }
  if ($poll) {
    $o = [ordered]@{ on = $false }
    try {
      $s = $mgr.GetCurrentSession()
      if ($s) {
        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $key = "$($p.Title)|$($p.Artist)"
        if ($key -ne $lastKey) { $lastKey = $key; $art = ''; $artTries = 0; $artError = '' }
        if (-not $art -and $artTries -lt 12) { $artTries++; $art = Read-Art $p }
        $pi = $s.GetPlaybackInfo(); $playing = ($pi.PlaybackStatus.ToString() -eq 'Playing')
        # where the song is: while playing, the moment it was at 0:00 (steady, so this line only changes on a seek
        # or a new song, and the island counts the seconds itself); while paused, the position
        $tl = $s.GetTimelineProperties(); $dur = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds, 1); $pos = ($tl.Position - $tl.StartTime).TotalSeconds
        $t0 = 0; if ($playing -and $dur -gt 0) { $t0 = [long]([math]::Round(($tl.LastUpdatedTime.ToUnixTimeMilliseconds() - $pos * 1000) / 1000) * 1000) }
        $o = [ordered]@{ on = $true; title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; playing = $playing; art = $art; artError = $artError; cmd = $cmdResult
          dur = $dur; pos = $(if ($playing) { 0 } else { [math]::Round($pos) }); t0 = $t0; canSeek = [bool]$pi.Controls.IsPlaybackPositionEnabled }
      }
    } catch { $o = [ordered]@{ on = $false; error = $_.Exception.Message } }
    $o.sessions = @($all)
    # non-ASCII (Chinese, Japanese, emoji…) as \\uXXXX escapes: the text survives whatever the console code page is
    $j = [regex]::Replace(($o | ConvertTo-Json -Compress -Depth 4), '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value })
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
  child = spawn(ps, psArgs(PS, 'media'), { windowsHide: true, env: { ...process.env, SD_PARENT_PID: String(process.pid) } }); // from a file: Windows caps command lines
  if (sessionsOn) child.stdin.write('sessions 1\n'); // restarted while the sound panel is open
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try { const j = JSON.parse(line); restarts = 0; emit({ on: !!j.on, title: j.title || '', artist: j.artist || '', app: j.app || '', playing: !!j.playing, art: j.art || '', artError: j.artError || '', cmd: j.cmd || '', error: j.error || '',
        dur: +j.dur || 0, pos: +j.pos || 0, t0: +j.t0 || 0, canSeek: !!j.canSeek,
        sessions: (Array.isArray(j.sessions) ? j.sessions : j.sessions ? [j.sessions] : []).filter((x) => x && x.app).slice(0, 12).map((x) => ({ app: String(x.app), title: String(x.title || ''), artist: String(x.artist || ''), playing: !!x.playing })) }); } catch {}
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
let sessionsOn = false;
/** Every player is listed only while the sound panel shows them (one more Windows call per player each second). */
function watchSessions(on) { on = !!on; if (on === sessionsOn) return; sessionsOn = on; if (child?.stdin.writable) child.stdin.write(`sessions ${on ? 1 : 0}\n`); }
// gamer mode: no PowerShell polling in the background while you play
function pause() { stop(); emit({ on: false }); }
function resume() { stopped = false; restarts = 0; start(); }

// virtual-key codes of the media keys
const KEYS = { toggle: 0xB3, next: 0xB0, prev: 0xB1 };
// Through Windows' media session (works with players that ignore media keys, e.g. NetEase Cloud Music);
// the media keys are only the fallback when the reader isn't running.
function control(cmd, app) {
  if (app) { // one particular player, by its app id
    if (!KEYS[cmd] || !state.sessions?.some((x) => x.app === app) || !child?.stdin.writable) return;
    child.stdin.write(`${cmd} ${Buffer.from(app, 'utf8').toString('base64')}\n`); setTimeout(() => child?.stdin.writable && child.stdin.write('poll\n'), 450);
    return;
  }
  const seek = /^seek (\d{1,6}(\.\d+)?)$/.exec(cmd); // jump to a time in the song (seconds); needs the reader
  if (seek) { if (child && child.stdin.writable) { child.stdin.write(`seek ${seek[1]}\n`); setTimeout(() => child?.stdin.writable && child.stdin.write('poll\n'), 350); } return; }
  if (!KEYS[cmd]) throw new Error('unknown media command');
  if (child && child.stdin.writable) { child.stdin.write(cmd + '\n'); setTimeout(() => child?.stdin.writable && child.stdin.write('poll\n'), 450); }
  else win32.mediaKey(KEYS[cmd]);
}

module.exports = {
  PS, start, stop, pause, resume, control, watchSessions,
  get: () => state,
  onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
};
