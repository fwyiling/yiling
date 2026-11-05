// Real Windows only: the app search must know everything the Start menu lists, Store apps included.
// Usage (on Windows): node test/apps.smoke.js
if (process.platform !== 'win32') { console.log('skipped: not Windows'); process.exit(0); }
const system = require('../system');
(async () => {
  const lnk = system.listApps();
  const all = await system.listAppsFull();
  const store = all.filter((a) => a.appId && a.appId.includes('!'));
  const withLogo = store.filter((a) => a.logo);
  console.log(`Start-menu shortcuts: ${lnk.length} | everything the Start menu lists: ${all.length} | Store apps: ${store.length} (${withLogo.length} with a logo)`);
  console.log('examples:', all.slice(0, 12).map((a) => a.name).join(', '));
  console.log('Store examples:', store.slice(0, 6).map((a) => `${a.name}${a.logo ? ' [logo]' : ''}`).join(', '));
  if (all.length <= lnk.length) { console.error('FAIL: the Start menu list added nothing'); process.exit(1); }
  console.log('PASS');
})();
