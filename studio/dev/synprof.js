// SYNPROF: CPU profile of a client in a mock match, self time grouped by function and by client source line.
// CLIENT=path SECS=8 [NEAR=1] node synprof.js
const M = require('../../duel-pilot/dev/mock');
(async () => {
  const L = await M.launch({ client: process.env.CLIENT, preInit: process.env.CAPTURE ? require('fs').readFileSync(__dirname + '/capture.js', 'utf8') : '', viewport: { width: 1280, height: 720 }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  const cdp = await L.ctx.newCDPSession(L.page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start'); await L.page.waitForTimeout((+process.env.SECS || 8) * 1000); const { profile } = await cdp.send('Profiler.stop');
  const dt = {}; for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
  const tot = Object.values(dt).reduce((a, b) => a + b, 0), by = {};
  for (const n of profile.nodes) { const t = dt[n.id] || 0; if (!t) continue; const c = n.callFrame, u = c.url || '(native)';
    const where = /starblast\.io\/?$/.test(u) && c.lineNumber > 0 ? 'client:' + (c.lineNumber + 1) : u.replace(/^.*\//, '').slice(0, 30) + ':' + (c.lineNumber + 1);
    const k = (c.functionName || '(anon)') + ' @' + where; by[k] = (by[k] || 0) + t; }
  console.log('total sampled ms', (tot / 1000).toFixed(0));
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, +process.env.TOP || 45).forEach(([k, v]) => console.log((100 * v / tot).toFixed(1).padStart(5) + '%  ' + k));
  process.exit(0);
})();
