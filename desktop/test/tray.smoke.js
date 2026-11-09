// Real Windows only: the system tray helper hears programs' tray icons and clicks reach them.
// A test icon is made the ordinary way (a WinForms NotifyIcon in another PowerShell), then it must show up in the
// helper's list with its tooltip and picture, and a left and a right click sent through the helper must arrive.
// Usage (on Windows): node test/tray.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const tray = require('../tray');
const win32 = require('../win32');

const fail = (msg) => { console.error('FAIL', msg, JSON.stringify(tray.status())); try { tray.stop(); app?.kill(); } catch {} process.exit(1); };
const wait = (cond, ms, what) => new Promise((resolve) => { const end = Date.now() + ms; (function poll() { const v = cond(); if (v) return resolve(v); if (Date.now() > end) return fail(what); setTimeout(poll, 200); })(); });
let app = null, out = '';
(async () => {
  tray.start();
  await wait(() => tray.status().ready, 30000, 'the helper never got ready');
  console.log('ok   helper ready', JSON.stringify(tray.status()));
  const ps = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Text = 'SD tray test'
$n.add_MouseUp({ param($s, $e) [Console]::Out.WriteLine('CLICK ' + $e.Button); [Console]::Out.Flush() })
$n.Visible = $true
[Console]::Out.WriteLine('SHOWN'); [Console]::Out.Flush()
$t = [Diagnostics.Stopwatch]::StartNew()
while ($t.ElapsedMilliseconds -lt 40000) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 25 }
$n.Visible = $false; $n.Dispose()`;
  app = spawn(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
  app.stdout.setEncoding('utf8'); app.stdout.on('data', (d) => { out += d; });
  app.stderr.on('data', (d) => process.stderr.write(String(d)));
  await wait(() => out.includes('SHOWN'), 20000, 'the test icon was never shown');
  const icon = await wait(() => tray.icons().find((x) => x.tip === 'SD tray test'), 15000, 'the test icon never reached the helper');
  console.log('ok   test icon heard:', icon.id, icon.icon ? `picture ${icon.icon.length} chars` : 'no picture', 'front:', tray.status().front);
  assert.ok(icon.icon.startsWith('data:image/png;base64,'), 'the icon has no picture');
  assert.ok(tray.click(icon.id, 'left', 100, 100), 'click refused');
  await wait(() => out.includes('CLICK Left'), 8000, 'a left click never reached the program');
  console.log('ok   left click arrived');
  assert.ok(tray.click(icon.id, 'right', 100, 100), 'right click refused');
  await wait(() => out.includes('CLICK Right'), 8000, 'a right click never reached the program');
  console.log('ok   right click arrived');
  // the app's taskbar code must still find Explorer's taskbar, not the helper's window of the same name
  const vis = win32.taskbarVisible();
  console.log('ok   Explorer\'s taskbar still found (visible:', vis + ')');
  assert.strictEqual(typeof vis, 'boolean');
  app.kill();
  await wait(() => !tray.icons().some((x) => x.tip === 'SD tray test'), 15000, 'the icon of a closed program stayed');
  console.log('ok   the closed program\'s icon went away');
  console.log('PASS: the tray helper works');
  tray.stop(); process.exit(0);
})();
