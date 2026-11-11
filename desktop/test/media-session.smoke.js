// Real Windows only: a fake music player (Windows.Media.Playback.MediaPlayer) publishes a song with a
// Chinese title and a cover through Windows' media controls; the app's reader must show the title and the
// cover, and play/pause must reach the player. Usage (on Windows): node test/media-session.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const media = require('../media');

// a 16x16 PNG cover
function png() {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 16 }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.alloc(48, y * 12)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const cover = path.join(os.tmpdir(), 'sd-cover.png'); fs.writeFileSync(cover, png());

const PLAYER = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function Await($op, $type) { $t = $asOp.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[void][Windows.Media.Playback.MediaPlayer, Windows.Media.Playback, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mp = New-Object Windows.Media.Playback.MediaPlayer
$mp.CommandManager.IsEnabled = $false
$smtc = $mp.SystemMediaTransportControls
$smtc.IsEnabled = $true; $smtc.IsPlayEnabled = $true; $smtc.IsPauseEnabled = $true; $smtc.IsNextEnabled = $true; $smtc.IsPreviousEnabled = $true
$du = $smtc.DisplayUpdater
$du.Type = 'Music'
$du.MusicProperties.Title = '晴天 (Live)'
$du.MusicProperties.Artist = '周杰伦'
$f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:SD_COVER)) ([Windows.Storage.StorageFile])
$du.Thumbnail = [Windows.Storage.Streams.RandomAccessStreamReference]::CreateFromFile($f)
$du.Update()
$smtc.PlaybackStatus = 'Playing'
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
Start-Sleep -Seconds 60
`;
const exe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const player = spawn(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PLAYER, 'utf16le').toString('base64')], { env: { ...process.env, SD_COVER: cover } });
player.stderr.on('data', (d) => { const t = String(d).trim(); if (t && !t.startsWith('#< CLIXML')) console.log('[player]', t); });
const done = (code, msg) => { console.log(msg); media.stop(); player.kill(); process.exit(code); };
setTimeout(() => done(1, 'FAIL: timed out'), 60000);

let sawSong = false, sentToggle = false, lastArtError = '';
player.stdout.on('data', (d) => {
  if (!String(d).includes('READY') || sawSong) return;
  console.log('fake player is playing');
  media.onChange((st) => {
    console.log('state:', JSON.stringify({ ...st, art: st.art ? `${st.art.slice(0, 30)}… (${st.art.length} chars)` : '' }));
    if (st.artError) lastArtError = st.artError;
    if (Array.isArray(st.sessions) && st.sessions.length) console.log('players:', JSON.stringify(st.sessions)); // the sound panel's list
    if (!st.on || !String(st.title).includes('晴天')) return;
    sawSong = true;
    if (!sentToggle && st.art) { sentToggle = true; media.control('toggle'); return; }
    if (st.cmd && st.cmd.startsWith('toggle:')) {
      const ok = /toggle:True/i.test(st.cmd);
      done(ok ? 0 : 1, ok ? 'PASS: title, cover and play/pause all work' : `FAIL: play/pause did not reach the player (${st.cmd})`);
    }
  });
  media.start();
  setTimeout(() => { if (sawSong && !sentToggle) done(1, `FAIL: the song shows but its cover never arrived (${lastArtError || 'no reason given'})`); }, 25000);
});
