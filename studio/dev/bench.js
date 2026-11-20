// BENCH: per-frame GL work in the mock game, with an optional client. CLIENT=path SECS=8 [VERIFY=1] [NEAR=1] node bench.js
const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const probe = fs.readFileSync(__dirname + '/probe.js', 'utf8');
  const L = await M.launch({ client: process.env.CLIENT || __dirname + '/empty.js', preInit: (process.env.VERIFY ? "try{localStorage.setItem('STUDIO_verify','1')}catch(e){}" : '') + fs.readFileSync(__dirname + '/capture.js', 'utf8') + (process.env.NOPROBE ? '' : probe), viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  await L.page.evaluate(() => { const C = window.__glc; if (C) { C.frames = 0; C.calls = {}; C.texPx = 0; C.uniSame = 0; C.uniAll = 0; C.ms = 0; C.up = {}; } });
  await L.page.waitForTimeout((+process.env.SECS || 8) * 1000);
  const C = await L.page.evaluate(() => window.__glc); const studio = await L.page.evaluate(() => window.__studio && window.__studio.stats());
  const f = C.frames || 1, top = Object.entries(C.calls).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => k + ' ' + (v / f).toFixed(1));
  console.log(JSON.stringify({ frames: C.frames, jsMsPerFrame: +(C.ms / f).toFixed(2), callsPerFrame: Math.round(Object.values(C.calls).reduce((a, b) => a + b, 0) / f), texMpxPerFrame: +(C.texPx / f / 1e6).toFixed(3), uniformRepeat: C.uniAll ? Math.round(100 * C.uniSame / C.uniAll) + '% of ' + Math.round(C.uniAll / f) : 0, studio, top, uploads: C.up, errs: L.errs().slice(0, 3) }, null, 1));
  process.exit(0);
})();
