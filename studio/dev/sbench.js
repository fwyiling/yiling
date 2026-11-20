// frames rendered in SECS and shader links, with game settings forced (FORCE='{"antialias":false}')
const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const force = process.env.FORCE || '{}';
  const pre = fs.readFileSync(__dirname + '/capture.js', 'utf8') + `
  (function(){ var F = ${force}; window.__links = 0; var lp = WebGLRenderingContext.prototype.linkProgram; WebGLRenderingContext.prototype.linkProgram = function(){ window.__links++; return lp.apply(this, arguments); };
    Object.defineProperty(Object.prototype, 'forced', { configurable: true, set: function(v){ Object.defineProperty(this, 'forced', { value: v, writable: true, configurable: true, enumerable: true }); if (v && typeof v === 'object') { for (var k in F) v[k] = { value: F[k] }; window.__settings = this; } }, get: function(){ return undefined; } });
    var raf = window.requestAnimationFrame, n = 0; window.__fr = function(){ return n; }; window.requestAnimationFrame = function(cb){ return raf.call(window, function(t){ n++; cb(t); }); };
  })();`;
  const L = await M.launch({ client: process.env.CLIENT || __dirname + '/empty.js', preInit: pre, viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start();
  const a = await L.page.evaluate(() => ({ f: window.__fr(), l: window.__links, ok: !!window.__settings }));
  await L.page.waitForTimeout((+process.env.SECS || 10) * 1000);
  const b = await L.page.evaluate(() => ({ f: window.__fr(), l: window.__links }));
  let live = null;
  if (process.env.LIVE) { const lv = JSON.parse(process.env.LIVE); await L.page.evaluate(lv => { for (const k in lv) window.__settings.forced[k] = { value: lv[k] }; }, lv); await L.page.waitForTimeout(1500); const c = await L.page.evaluate(() => ({ f: window.__fr(), l: window.__links })); await L.page.waitForTimeout((+process.env.SECS || 10) * 1000); const d = await L.page.evaluate(() => ({ f: window.__fr(), l: window.__links })); live = { set: lv, fps: +((d.f - c.f) / (+process.env.SECS || 10)).toFixed(1), links: d.l - b.l }; }
  console.log(JSON.stringify({ force: JSON.parse(force), captured: a.ok, fps: +((b.f - a.f) / (+process.env.SECS || 10)).toFixed(1), linksDuringPlay: b.l - a.l, live }));
  process.exit(0);
})();
