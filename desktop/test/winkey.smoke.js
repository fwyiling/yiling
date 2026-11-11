// Real Windows only: the Windows key helper hooks the keyboard, a tap of the Windows key alone reaches the app, and
// a Windows-key shortcut (here Win + an unassigned key) doesn't.
// Usage (on Windows): node test/winkey.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const winkey = require('../winkey');
const win32 = require('../win32');

const fail = (msg) => { console.error('FAIL', msg, JSON.stringify(winkey.status())); winkey.use(null); process.exit(1); };
const wait = (cond, ms, what) => new Promise((resolve) => { const end = Date.now() + ms; (function poll() { const v = cond(); if (v) return resolve(v); if (Date.now() > end) return fail(what); setTimeout(poll, 100); })(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let taps = 0;
  winkey.use(() => { taps++; });
  await wait(() => winkey.status().ready, 30000, 'the helper never got ready');
  console.log('ok   helper ready');
  winkey._test(); await sleep(300);
  win32.pressKeys([0x5B]); // the Windows key alone
  await wait(() => taps === 1, 5000, 'a tap of the Windows key did not arrive');
  console.log('ok   Windows key alone -> Home');
  win32.pressKeys([0x5B, 0xE8]); // a shortcut with it
  await sleep(1200);
  if (taps !== 1) fail('a Windows-key shortcut was taken as a tap');
  console.log('ok   Windows key shortcut passes through');
  winkey.use(null);
  console.log('PASS winkey');
  process.exit(0);
})();
