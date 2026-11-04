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
assert.strictEqual(w.status().error, '');
console.log('real Windows bindings fine');
