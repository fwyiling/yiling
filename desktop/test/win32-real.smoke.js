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
assert.strictEqual(w.status().error, '');
console.log('real Windows bindings fine');
