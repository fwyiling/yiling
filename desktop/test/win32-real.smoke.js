// Real Windows only: load the Win32 bindings against the actual DLLs and call the read-only helpers.
// Usage (on Windows): node test/win32-real.smoke.js
const assert = require('assert');
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const w = require('../win32');
const st = w.status();
assert.ok(st.ready, `Win32 setup failed: ${st.error}`);
console.log('ok   bindings ready');
const wins = w.listWindows([process.pid]);
assert.ok(Array.isArray(wins));
console.log(`ok   listWindows: ${wins.length} windows`, wins.slice(0, 5).map((x) => `${x.title} (${x.exe.split('\\').pop()})`));
console.log('ok   taskbarAutoHide:', w.taskbarAutoHide());
console.log('ok   fullscreenAppRunning:', w.fullscreenAppRunning([{ x: 0, y: 0, width: 1024, height: 768 }]));
const ic = w.iconPixels('C:\\Windows\\explorer.exe', 0, 256);
assert.ok(ic && ic.width === 256, 'no 256 px icon from explorer.exe');
let opaque = 0; for (let i = 3; i < ic.data.length; i += 4) if (ic.data[i] > 200) opaque++;
console.log(`ok   256 px icon from explorer.exe: ${Math.round(100 * opaque / (256 * 256))}% opaque pixels`);
assert.ok(opaque > 256 * 256 * 0.15, 'the big icon came out empty');
console.log('ok   battery:', JSON.stringify(w.battery()));
console.log('ok   virtual desktops:', JSON.stringify(w.virtualDesktops()));
console.log('ok   refresh rates:', JSON.stringify(w.refreshRates()));
console.log('ok   wifi scan (adapters asked; 0 on a PC without Wi-Fi):', w.wifiScan());
console.log('ok   accent colour picked from the wallpaper:', w.autoAccent());
console.log('ok   repaint desktop (for the Windows-background mode):', w.repaintDesktop());
// how long the window scans take on this thread (the app keeps them away from desktop slides)
const time = (name, fn, n = 20) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(); console.log(`ok   ${name}: ${(Number(process.hrtime.bigint() - t) / 1e6 / n).toFixed(2)} ms each`); };
const scr = { x: 0, y: 0, width: 1024, height: 768 };
time('virtualDesktops', () => w.virtualDesktops(), 200);
time('listWindows', () => w.listWindows([process.pid]));
time('fullscreenAppRunning', () => w.fullscreenAppRunning([scr]));
time('hideSwitchLabel (nothing to hide)', () => w.hideSwitchLabel({ x: 0, y: 100000, width: 1, height: 1 }));
assert.strictEqual(w.status().error, '');
console.log('real Windows bindings fine');
// the desktop watcher runs on a worker thread: the bindings must load there as well
const { Worker } = require('worker_threads');
const worker = new Worker(require('path').join(__dirname, '..', 'deskwatch.js'), { workerData: { screen: scr, hideLabel: false } });
const to = setTimeout(() => { console.error('FAIL desk watcher worker never got ready'); process.exit(1); }, 15000);
worker.on('error', (e) => { console.error('FAIL desk watcher worker:', e.message); process.exit(1); });
worker.on('message', (m) => {
  if (m.type === 'fail') { console.error('FAIL desk watcher worker:', m.error); process.exit(1); }
  if (m.type === 'ready') { clearTimeout(to); console.log('ok   desk watcher runs on a worker thread'); worker.terminate().then(() => process.exit(0)); }
});
