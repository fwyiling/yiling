// Real Windows only: the system-controls helper (volume, brightness, Wi-Fi, radios) starts and reports.
// Usage (on Windows): node test/sysctl.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const sysctl = require('../sysctl');
const t = setTimeout(() => { console.error('FAIL: no report from the system-controls helper in 60 s'); process.exit(1); }, 60000);
sysctl.onChange((st) => {
  clearTimeout(t);
  console.log('system state:', JSON.stringify(st));
  sysctl.stop();
  // the sound outputs (headphones notes) come from the same helper's Core Audio code
  const ok = typeof st.volume === 'number' && Array.isArray(st.outputs) && typeof st.output === 'string'; // output: the one in use ('' on a PC without sound)
  console.log(ok ? `PASS: the system-controls helper works (${st.outputs.length} sound output(s))` : `FAIL: ${typeof st.volume !== 'number' ? 'no volume field' : 'no outputs list / output in use'}`);
  process.exit(ok ? 0 : 1);
});
sysctl.start();
