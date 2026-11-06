// Real Windows only: the system-controls helper (volume, brightness, Wi-Fi, radios) starts and reports.
// Usage (on Windows): node test/sysctl.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const sysctl = require('../sysctl');
const t = setTimeout(() => { console.error('FAIL: no report from the system-controls helper in 60 s'); process.exit(1); }, 60000);
sysctl.onChange((st) => {
  clearTimeout(t);
  console.log('system state:', JSON.stringify(st));
  sysctl.stop();
  console.log(typeof st.volume === 'number' ? 'PASS: the system-controls helper works' : 'FAIL: no volume field');
  process.exit(typeof st.volume === 'number' ? 0 : 1);
});
sysctl.start();
