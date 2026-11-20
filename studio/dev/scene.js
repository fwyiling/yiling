const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => {
  const pre = (process.env.PRE || '') + fs.readFileSync(__dirname + '/capture.js', 'utf8') + `
  (function(){ window.__scenes = []; var iv = setInterval(function(){ if (!window.THREE || !THREE.WebGLRenderer || THREE.WebGLRenderer.__w) return; clearInterval(iv);
    var R0 = THREE.WebGLRenderer; var R = function(p){ R0.call(this, p); var f = this.render, self = this; this.render = function(sc, cam){ if (sc && window.__scenes.indexOf(sc) < 0) window.__scenes.push(sc); return f.apply(this, arguments); }; };
    R.prototype = R0.prototype; for (var k in R0) R[k] = R0[k]; R.__w = 1; THREE.WebGLRenderer = R; }, 1); })();`;
  const L = await M.launch({ client: process.env.CLIENT, preInit: pre, viewport: { width: 1280, height: 720 }, myType: 101, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start(); await L.page.waitForTimeout(3000);
  const r = await L.page.evaluate(() => {
    const out = []; window.__scenes.forEach((sc, si) => { const cnt = {}; let n = 0;
      sc.traverse(o => { n++; const m = o.material; const key = o.type + '|' + (m ? m.type : '-') + '|' + (m && m.uniforms ? Object.keys(m.uniforms).sort().join(',') : '') + '|' + (o.geometry && o.geometry.attributes ? Object.keys(o.geometry.attributes).sort().join(',') : o.geometry ? o.geometry.type : '') + (m && m.blending === 2 ? '|ADD' : '') + (o.visible ? '' : '|hidden');
        const c = cnt[key] = cnt[key] || { n: 0, maxScale: 0, verts: 0 }; c.n++; c.maxScale = Math.max(c.maxScale, Math.abs(o.scale ? o.scale.x : 0)); const g = o.geometry; c.verts = Math.max(c.verts, g ? (g.attributes && g.attributes.position ? g.attributes.position.count : g.vertices ? g.vertices.length : 0) : 0); });
      out.push({ scene: si, objects: n, kinds: Object.entries(cnt).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => v.n + 'x ' + k + ' scale<=' + v.maxScale.toFixed(1) + ' verts<=' + v.verts) }); });
    return out; });
  r.filter(s => s.objects > 5).forEach(s => { console.log('== scene', s.scene, s.objects, 'objects'); s.kinds.forEach(k => console.log('  ' + k)); });
  process.exit(0);
})();
