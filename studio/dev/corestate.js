// CORESTATE: what the perf core hooked in a mock match (renderers, effects, governor, settings). CLIENT=path [CAPTURE=1] node corestate.js
const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const L = await M.launch({ client: process.env.CLIENT, preInit: process.env.CAPTURE ? fs.readFileSync(__dirname + '/capture.js', 'utf8') : '', viewport: { width: 1280, height: 720 }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  console.log(JSON.stringify(await L.page.evaluate(() => { const C = window.__perfCore; if (!C) return 'no core'; const g = C.gov; return { fx: C.fx, on: C.on, gov: { on: g.on, step: g.step, fps: g.fps, settings: !!g.settings, auto: g.settings && g.settings.auto }, stats: (s => ({ mismatch: s.mismatch, upSkipped: s.uploadsSkipped, upSent: s.uploadsSent }))(C.stats()) }; })));
  console.log(L.errs().slice(0, 5).join('\n'));
  process.exit(0);
})();
