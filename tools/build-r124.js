// Builds clients/starblast-r124.user.js: the game on three.js r124 in place of
// the r85 it loads, nothing else (no client). The page's r85 still loads; the
// moment it has run, before the game's own script, window.THREE is replaced
// by r124 and clients/shared/three-r124-compat.js adapts r124 to the game.
//   (cd tools && npm i three@0.124.0) ; node tools/build-r124.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const threePath = require.resolve('three/build/three.min.js', { paths: [__dirname, root] });
const three = fs.readFileSync(threePath, 'utf8');
const rev = (three.match(/REVISION\s*=\s*"(\d+)"/) || [])[1];
if (rev !== '124') { console.error('expected three r124, found r' + rev + ' at ' + threePath); process.exit(1); }
const compat = fs.readFileSync(path.join(root, 'clients/shared/three-r124-compat.js'), 'utf8');

const out = `// ==UserScript==
// @name         starblast.io on three.js r124
// @namespace    syndicate
// @version      1.0.0
// @description  Starblast with three.js r124 (WebGL2) in place of r85, and the fixes the game needs for it. Nothing else.
// @match        https://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Built by tools/build-r124.js from three@0.124.0 (MIT, threejs.org/license)
// and clients/shared/three-r124-compat.js. Edit those, then rebuild.
(function() {
  "use strict";
  if (window.__sbR124) return;
  window.__sbR124 = true;
  var R124 = ${JSON.stringify(three)};
${compat.replace(/^/gm, '  ')}
  // the page's three.js (r85) sets window.THREE; once its script has run
  // (a microtask: before the next script, the game's), r124 runs in its
  // place with a fresh THREE, and is adapted
  var cur, swapped = false, swapping = false;
  function swap() {
    if (swapped) return;
    swapped = true; swapping = true;
    try {
      var s = document.createElement("script");
      s.textContent = R124;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } finally { swapping = false; }
    sbThreeCompat(cur);
    if (!cur || cur.REVISION !== "124") console.warn("[r124] three.js swap did not take: THREE r" + (cur && cur.REVISION));
  }
  try {
    Object.defineProperty(window, "THREE", { configurable: true, enumerable: true,
      get: function() { return swapping ? undefined : cur; },
      set: function(v) { cur = v; if (!swapping && !swapped) Promise.resolve().then(swap); } });
  } catch (e) { console.warn("[r124] could not take over window.THREE", e); }
})();
`;
const dest = path.join(root, 'clients/starblast-r124.user.js');
fs.writeFileSync(dest, out);
console.log('wrote ' + path.relative(root, dest) + ' (' + Math.round(out.length / 1024) + ' KB, three r' + rev + ')');
