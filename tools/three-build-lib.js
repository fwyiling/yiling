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
// The swap, as one object made at the top of the script (sbThree), with two
// steps: late() right there, before the client, and early() at the end.
//  - early(): the usual case. The page's three.js (r85) is still to come:
//    window.THREE is taken over, and once r85 has run (a microtask: before
//    the next script, the game's) the new one runs in its place, is adapted
//    and handed to a hook already on window.THREE (the Studio perf core's).
//  - late(): the page's three.js has already run (a userscript manager can
//    inject a document-start script after the page's first scripts). If the
//    game has not made its renderer yet (no canvas in #canvaswrapper: the
//    game puts its renderer's there), the new one goes in now, before the
//    client hooks window.THREE; if it has, three.js stays and it says so.
function swapper(three, setup, rev) {
  return `var sbThree = (function() {
  "use strict";
  var NEW_THREE = ${JSON.stringify(three)};
${setup.replace(/^/gm, '  ')}
  var done = !!window.__sbThreeSwap, cur, swapped = false, swapping = false;
  if (!done) window.__sbThreeSwap = ${JSON.stringify(rev)};
  function inject() {
    var s = document.createElement("script");
    s.textContent = NEW_THREE;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }
  function check(T) { if (!T || T.REVISION !== ${JSON.stringify(rev)}) console.warn("[three r${rev}] three.js swap did not take: THREE r" + (T && T.REVISION)); }
  function notice(msg) {
    console.warn("[three r${rev}] " + msg);
    var show = function() {
      try {
        var d = document.createElement("div");
        d.textContent = msg;
        d.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:8px 14px;font:13px/1.4 Play,Verdana,sans-serif;color:#fff;background:hsl(205,27%,18%);border:1px solid hsl(205,30%,45%);text-shadow:0 0 6px hsla(200,100%,70%,.55);pointer-events:none";
        document.body.appendChild(d);
        setTimeout(function() { d.remove(); }, 12000);
      } catch (e) {}
    };
    if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
  }
  function late() {
    var old = window.THREE;
    if (done || !old || !old.REVISION) return;
    done = true;
    if (document.querySelector("#canvaswrapper canvas")) {
      notice("three.js r${rev} didn't load: the game had already started on the page's own three.js (r" + old.REVISION + "), so it stays on it. Reload the page (F5) to try again.");
      return;
    }
    try { inject(); } catch (e) { console.warn("[three r${rev}] loading failed", e); }
    var T = window.THREE;
    if (!T || T === old || T.REVISION !== ${JSON.stringify(rev)}) { window.THREE = old; check(T); return; }
    try { sbSetup(T); } catch (e) { console.warn("[three r${rev}] adapting failed", e); }
    console.log("[three r${rev}] in place of r" + old.REVISION + " (this script ran after the page's three.js, before the game used it)");
  }
  function early() {
    if (done) return;
    done = true;
    var before = Object.getOwnPropertyDescriptor(window, "THREE"), handOn = before && typeof before.set === "function" ? before.set : null;
    function swap() {
      if (swapped) return;
      swapped = true; swapping = true;
      try { inject(); } finally { swapping = false; }
      try { sbSetup(cur); } catch (e) { console.warn("[three r${rev}] adapting failed", e); }
      if (handOn) try { handOn.call(window, cur); } catch (e) { console.warn("[three r${rev}] hand-off failed", e); }
      check(cur);
    }
    try {
      Object.defineProperty(window, "THREE", { configurable: true, enumerable: true,
        get: function() { return swapping ? undefined : cur; },
        set: function(v) { cur = v; if (!swapping && !swapped) Promise.resolve().then(swap); } });
    } catch (e) { console.warn("[three r${rev}] could not take over window.THREE", e); }
  }
  return { late: late, early: early };
})();
sbThree.late();
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
  write(o.game[0], header('starblast.io on three.js r' + rev, 'Starblast with three.js r' + rev + ' (WebGL2) in place of r85, and the fixes the game needs for it. Nothing else.', o.game[1], ver) + sw + 'sbThree.early();\n', rev);
  // the Studio client on it: sbThree first (late(): a three.js already on the
  // page is replaced before the client hooks it), then the client (its perf
  // core hooks window.THREE at once), then early(), which hands it the new one
  const client = fs.readFileSync(path.join(root, 'clients/studio-client.user.js'), 'utf8');
  const body = client.slice(client.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length);
  const cver = (client.match(/@version\s+(\S+)/) || [])[1] || '0';
  write(o.studio, header('Syndicate Studio on three.js r' + rev, 'The Studio client with the game on three.js r' + rev + ' (WebGL2) in place of r85.', cver, ver) + sw + body.replace(/^\s*\n/, '') + '\nsbThree.early();\n', rev);
}
module.exports = { build, root };
