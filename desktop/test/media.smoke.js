// Real Windows only: start the "now playing" reader and wait for its first report.
// Nothing plays on a test machine, so { on: false } without an error is the expected answer.
// Usage (on Windows): node test/media.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const media = require('../media');
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
