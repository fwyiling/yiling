// Real Windows only: start the "now playing" reader and wait for its first report.
// Nothing plays on a test machine, so { on: false } without an error is the expected answer.
// Usage (on Windows): node test/media.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const media = require('../media');
const { execFileSync } = require('child_process');
const path = require('path');

// 1) song names in any language survive the trip from PowerShell (it once arrived as "����")
{
  const line = media.PS.split('\n').find((l) => l.includes('[regex]::Replace'));
  const ps = `$o = [ordered]@{ title = '晴天 (Live)'; artist = '周杰伦 · 🎵' }\n${line.trim()}\n[Console]::Out.WriteLine($j)`;
  const exe = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const out = execFileSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' });
  const got = JSON.parse(out.trim().split('\n').pop());
  console.log('round trip:', got.title, '|', got.artist);
  if (got.title !== '晴天 (Live)' || got.artist !== '周杰伦 · 🎵') { console.error('FAIL: non-English song names get garbled'); process.exit(1); }
}
const t = setTimeout(() => { console.error('FAIL: no report from the media reader in 40 s'); process.exit(1); }, 40000);
media.onChange((st) => {
  clearTimeout(t);
  console.log('media state:', JSON.stringify(st));
  media.stop();
  if (st.error) { console.error('FAIL: the media reader hit an error'); process.exit(1); }
  console.log('PASS: the media reader works');
  process.exit(0);
});
media.start();
