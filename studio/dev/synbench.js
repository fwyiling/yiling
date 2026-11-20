// SYNBENCH: whole-page cost of a client in a mock match: frame rate, main-thread script/task time per second,
// live timers, GPU calls and texture uploads per frame. CLIENT=path SECS=10 [SHOT=file.png] [PRE=js] node synbench.js
const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const timers = "(function(){var si=setInterval,ci=clearInterval,n=new Set();window.setInterval=function(f,t){var id=si.apply(this,arguments);n.add(id);return id};window.clearInterval=function(id){n.delete(id);return ci.apply(this,arguments)};window.__liveIntervals=function(){return n.size}})();";
  const L = await M.launch({ client: process.env.CLIENT, preInit: timers + (process.env.PRE || '') + (process.env.CAPTURE ? fs.readFileSync(__dirname + '/capture.js', 'utf8') : '') + fs.readFileSync(__dirname + '/probe.js', 'utf8'), viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  const cdp = await L.ctx.newCDPSession(L.page); await cdp.send('Performance.enable');
  const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await L.page.evaluate(() => { const C = window.__glc; if (C) { C.frames = 0; C.calls = {}; C.texPx = 0; C.ms = 0; C.up = {}; } });
  const a = await met(), t0 = Date.now(); await L.page.waitForTimeout((+process.env.SECS || 10) * 1000); const b = await met(), s = (Date.now() - t0) / 1000;
  const C = await L.page.evaluate(() => window.__glc), f = C.frames || 1;
  if (process.env.SHOT) await L.page.screenshot({ path: process.env.SHOT });
  console.log(JSON.stringify({ fps: +(C.frames / s).toFixed(1), scriptMsPerSec: +((b.ScriptDuration - a.ScriptDuration) * 1000 / s).toFixed(1), taskMsPerSec: +((b.TaskDuration - a.TaskDuration) * 1000 / s).toFixed(1), styleLayoutMsPerSec: +(((b.RecalcStyleDuration - a.RecalcStyleDuration) + (b.LayoutDuration - a.LayoutDuration)) * 1000 / s).toFixed(1), liveIntervals: await L.page.evaluate(() => window.__liveIntervals()), heapMB: +(b.JSHeapUsedSize / 1e6).toFixed(1), glCallsPerFrame: Math.round(Object.values(C.calls).reduce((x, y) => x + y, 0) / f), texMpxPerFrame: +(C.texPx / f / 1e6).toFixed(3), errs: L.errs().slice(0, 3) }, null, 1));
  process.exit(0);
})();
