// CPU profile of the game in the mock (with CLIENT), top self time by function, and the GL calls still sent
const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const probe = fs.readFileSync(__dirname + '/probe.js', 'utf8');
  const L = await M.launch({ client: process.env.CLIENT || __dirname + '/empty.js', preInit: fs.readFileSync(__dirname + '/capture.js', 'utf8') + (process.env.PROBE ? probe : ''), viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  const cdp = await L.page.context().newCDPSession(L.page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await L.page.waitForTimeout(8000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = {}, byId = {}; profile.nodes.forEach(n => byId[n.id] = n);
  const dt = {}; for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
  let tot = 0; profile.nodes.forEach(n => { const t = (dt[n.id] || 0) / 1000; tot += t; const f = n.callFrame; const k = (f.functionName || '(anon)') + ' ' + (f.url.split('/').pop() || '').slice(0, 20) + ':' + f.lineNumber + ':' + f.columnNumber; self[k] = (self[k] || 0) + t; });
  console.log('total ms', Math.round(tot)); Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(v.toFixed(0).padStart(6), (100 * v / tot).toFixed(1).padStart(5) + '%', k));
  if (process.env.PROBE) { const C = await L.page.evaluate(() => window.__glc); const f = C.frames || 1; console.log(Object.entries(C.calls).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + ' ' + (v / f).toFixed(1)).join(', ')); }
  process.exit(0);
})();
