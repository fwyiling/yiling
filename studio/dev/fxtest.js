const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const off = process.env.OFF ? "try{['noparticles','highperf','disablesuns','lowpoly','hudthrottle','offscreencull','staticobj','nospin'].forEach(function(k){localStorage.setItem('STUDIO_fx_'+k,'0')})}catch(e){}" : "";
  const pre = off + (process.env.NOGOV ? "try{localStorage.setItem('STUDIO_gov','0')}catch(e){}" : "") + fs.readFileSync(__dirname + '/capture.js', 'utf8') + `(function(){ var raf = window.requestAnimationFrame, n = 0; window.__fr = function(){ return n; }; window.requestAnimationFrame = function(cb){ return raf.call(window, function(t){ n++; cb(t); }); }; })();`;
  const L = await M.launch({ client: process.env.CLIENT, preInit: pre, viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start(); await L.page.waitForTimeout(4000);
  const f0 = await L.page.evaluate(() => window.__fr()); await L.page.waitForTimeout(10000); const f1 = await L.page.evaluate(() => window.__fr());
  const r = await L.page.evaluate(() => { const S = window.__studio; let ast = null, sparkVis = null; return { fx: S.fx, fxOn: S.fxOn, explolight: S.gov.settings && S.gov.settings.check('explolight'), step: S.gov.step }; });
  console.log(JSON.stringify(Object.assign({ fps: +((f1 - f0) / 10).toFixed(1) }, r)), JSON.stringify(L.errs()));
  process.exit(0);
})();
