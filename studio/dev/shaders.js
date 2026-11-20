const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const pre = fs.readFileSync(__dirname + '/capture.js', 'utf8') + `
  (function(){ var P = WebGLRenderingContext.prototype, T0 = performance.now(), src = new WeakMap(), att = new WeakMap(); window.__sh = []; window.__ctx = []; var gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(t){ var had = this.__had; var r = gc.apply(this, arguments); if (/webgl/.test(t) && !had) { this.__had = 1; window.__ctx.push([Math.round(performance.now() - T0), this.width + 'x' + this.height, this.isConnected, (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 9).map(function(l){ return l.trim().slice(0, 90); }).join(' <- ')]); } return r; };
    var ss = P.shaderSource; P.shaderSource = function(s, t){ src.set(s, t); return ss.apply(this, arguments); };
    var as = P.attachShader; P.attachShader = function(p, s){ var a = att.get(p) || []; a.push(src.get(s) || ''); att.set(p, a); return as.apply(this, arguments); };
    var lp = P.linkProgram; P.linkProgram = function(p){ var t = performance.now(); var r = lp.apply(this, arguments); this.getProgramParameter(p, this.LINK_STATUS); var a = att.get(p) || []; var f = a.join('\\n'); var name = (f.match(/#define SHADER_NAME ([^\\n]*)/) || [0, '?'])[1]; var defs = (f.match(/#define (USE_[A-Z_]+|NUM_[A-Z_]+ [1-9]|FLAT_SHADED|DOUBLE_SIDED|ALPHATEST[^\\n]*)/g) || []).filter(function(x, i, A){ return A.indexOf(x) === i; }).join(' '); window.__sh.push([Math.round(t - T0), Math.round(performance.now() - t), name, defs.replace(/#define /g, '').slice(0, 160), f.length]); return r; };
  })();`;
  const L = await M.launch({ client: process.env.CLIENT, preInit: pre, viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const t0 = await L.page.evaluate(() => performance.now()); await L.start(); await L.page.waitForTimeout(+process.env.WAIT || 8000);
  const sh = await L.page.evaluate(() => window.__sh); const st = await L.page.evaluate(() => performance.now());
  console.log('start() called at about', Math.round(t0), 'ms; page now', Math.round(st));
  console.log('webgl contexts [at, size, in page]', JSON.stringify(await L.page.evaluate(() => window.__ctx)));
  const byT = {}; sh.forEach(s => { const k = Math.floor(s[0] / 1000); byT[k] = (byT[k] || 0) + 1; }); console.log('links per second:', JSON.stringify(byT));
  if (process.env.LIST) sh.forEach(s => console.log(String(s[0]).padStart(6), String(s[1]).padStart(4) + 'ms', s[2].padEnd(22), s[3], '(' + s[4] + ' chars)'));
  process.exit(0);
})();
