// Real Windows only: the virtual-desktop helper (drag a window onto the next desktop) loads the shell's
// interfaces on this Windows build, counts the desktops, and refuses a window that doesn't exist.
// Usage (on Windows 11): node test/vdesk.smoke.js
const assert = require('assert');
const vdesk = require('../vdesk');
if (!vdesk.supported()) { console.log('skipped: needs Windows 11'); process.exit(0); }
vdesk.start();
const deadline = Date.now() + 20000;
(async function wait() {
  const st = vdesk.status();
  if (!st.ready) {
    if (Date.now() > deadline) { console.error('FAIL helper never got ready:', st.error); process.exit(1); }
    return setTimeout(wait, 250);
  }
  console.log('ok   helper ready, desktops:', st.count);
  assert.ok(st.count >= 1, 'no desktops counted');
  const bogus = await vdesk.move(0x7ffffff0, true);
  console.log('ok   a window that does not exist is refused:', bogus === false);
  assert.strictEqual(bogus, false);
  assert.strictEqual(await vdesk.carry(0x7ffffff0, true), false, 'carry took a window that does not exist');
  assert.strictEqual(await vdesk.settle(0x7ffffff0), false, 'settle found a window it never carried');
  console.log('ok   carry / settle refuse windows that do not exist');
  const sw = await vdesk.switchTo(true); // with a single desktop there is nothing to the right
  console.log('ok   switch right with', st.count, 'desktop(s):', sw);
  if (st.count === 1) assert.strictEqual(sw, false);
  console.log('PASS: the virtual-desktop helper works on this Windows build');
  vdesk.stop(); process.exit(0);
})();
