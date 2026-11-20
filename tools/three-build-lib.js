// Shared by tools/build-r124.js and tools/build-r159.js: a userscript that
// puts a newer three.js in place of the r85 the page loads. The page's r85
// still loads; the moment it has run (before the game's own script),
// window.THREE is replaced by the new one, adapted by `setup` (source text
// run as sbSetup(THREE)), and handed to a hook already on window.THREE (the
// Studio perf core's), which never sees r85.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
function header(name, desc, version, threeVer) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    syndicate
// @version      ${version}
// @description  ${desc}
// @match        https://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Built from three@${threeVer} (MIT, threejs.org/license), the adapters in
// clients/shared/ and (the Studio one) the Studio client, by tools/.
// Edit those, then rebuild.
`;
}
function swapper(three, setup, rev) {
  return `(function() {
  "use strict";
  if (window.__sbThreeSwap) return;
  window.__sbThreeSwap = ${JSON.stringify(rev)};
  var NEW_THREE = ${JSON.stringify(three)};
${setup.replace(/^/gm, '  ')}
  // the page's three.js (r85) sets window.THREE; once its script has run
  // (a microtask: before the next script, the game's), the new one runs in
  // its place with a fresh THREE, and is adapted
  var cur, swapped = false, swapping = false;
  var before = Object.getOwnPropertyDescriptor(window, "THREE"), handOn = before && typeof before.set === "function" ? before.set : null;
  function swap() {
    if (swapped) return;
    swapped = true; swapping = true;
    try {
      var s = document.createElement("script");
      s.textContent = NEW_THREE;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
    } finally { swapping = false; }
    try { sbSetup(cur); } catch (e) { console.warn("[three r${rev}] adapting failed", e); }
    if (handOn) try { handOn.call(window, cur); } catch (e) { console.warn("[three r${rev}] hand-off failed", e); }
    if (!cur || cur.REVISION !== ${JSON.stringify(rev)}) console.warn("[three r${rev}] three.js swap did not take: THREE r" + (cur && cur.REVISION));
  }
  try {
    Object.defineProperty(window, "THREE", { configurable: true, enumerable: true,
      get: function() { return swapping ? undefined : cur; },
      set: function(v) { cur = v; if (!swapping && !swapped) Promise.resolve().then(swap); } });
  } catch (e) { console.warn("[three r${rev}] could not take over window.THREE", e); }
})();
`;
}
function write(rel, text, rev) {
  fs.writeFileSync(path.join(root, rel), text);
  console.log('wrote ' + rel + ' (' + Math.round(text.length / 1024) + ' KB, three r' + rev + ')');
}
// build({ pkg, rev, setup, game: [file, version], studio: file })
function build(o) {
  // (found on disk: newer three.js packages export only their modules)
  const dir = [path.join(__dirname, 'node_modules', o.pkg), path.join(root, 'node_modules', o.pkg)].find(d => fs.existsSync(path.join(d, 'build/three.min.js')));
  if (!dir) { console.error(o.pkg + ' is not installed: (cd tools && npm i)'); process.exit(1); }
  const threePath = path.join(dir, 'build/three.min.js');
  let three = fs.readFileSync(threePath, 'utf8');
  const rev = (three.match(/REVISION\s*=\s*"(\d+)"/) || three.match(/const \w+="(\d+)"/) || [])[1];
  if (rev !== o.rev) { console.error('expected three r' + o.rev + ', found r' + rev + ' at ' + threePath); process.exit(1); }
  // (r150-r159: the global build says it's deprecated on every load)
  three = three.replace(/^console\.warn\('Scripts "build\/three\.js" and "build\/three\.min\.js" are deprecated[^']*'\)/, 'void 0');
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  const sw = swapper(three, o.setup, rev);
  write(o.game[0], header('starblast.io on three.js r' + rev, 'Starblast with three.js r' + rev + ' (WebGL2) in place of r85, and the fixes the game needs for it. Nothing else.', o.game[1], ver) + sw, rev);
  // the Studio client on it: the client first (its perf core hooks
  // window.THREE at once), then the swap, which hands it the new three.js
  const client = fs.readFileSync(path.join(root, 'clients/studio-client.user.js'), 'utf8');
  const body = client.slice(client.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length);
  const cver = (client.match(/@version\s+(\S+)/) || [])[1] || '0';
  write(o.studio, header('Syndicate Studio on three.js r' + rev, 'The Studio client with the game on three.js r' + rev + ' (WebGL2) in place of r85.', cver, ver) + body.replace(/^\s*\n/, '') + '\n' + sw, rev);
}
module.exports = { build, root };
