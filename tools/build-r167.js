// Builds clients/starblast-r167.user.js: the base game on three.js r167
// (WebGL2, standard WebGLRenderer). No Studio client - game only.
// r167 no longer ships build/three.min.js (removed the global IIFE build);
// we use build/three.module.min.js and esbuild to convert it to an IIFE.
//   (cd tools && npm i) ; node tools/build-r167.js
const fs = require('fs'), path = require('path');
const { root, swapper } = require('./three-build-lib');

const pkg = 'three-r167', rev = '167', gameVersion = '0.1.0';
const dir = [path.join(__dirname, 'node_modules', pkg), path.join(root, 'node_modules', pkg)]
  .find(d => fs.existsSync(path.join(d, 'build/three.module.min.js')));
if (!dir) { console.error(pkg + ' not found: (cd tools && npm i)'); process.exit(1); }

const esbuild = require(path.join(__dirname, 'node_modules/esbuild'));
const pkgVer = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
const raw = fs.readFileSync(path.join(dir, 'build/three.module.min.js'), 'utf8');

async function go() {
  // convert ES module named exports → global IIFE (window.THREE = ...)
  const result = await esbuild.build({
    stdin: { contents: raw, loader: 'js' },
    bundle: false,
    format: 'iife',
    globalName: '__sbM',
    minify: true,
    write: false,
  });
  // esbuild's exports are non-configurable getters, which the legacy layer
  // can't replace (T.BoxGeometry = ...): window.THREE gets a plain copy
  const three = '(function(){' + result.outputFiles[0].text +
    ';var o={};for(var k in __sbM)o[k]=__sbM[k];window.THREE=o;})();';

  // shared components (same as build-r159.js)
  const geoPath = path.join(__dirname, 'node_modules/three-r125/examples/jsm/deprecated/Geometry.js');
  let geo = fs.readFileSync(geoPath, 'utf8');
  const imp = geo.match(/^import\s*\{([^}]*)\}\s*from\s*'[^']*';\s*/m);
  if (!imp) { console.error('Geometry.js: no import block'); process.exit(1); }
  const names = imp[1].split(',').map(s => s.trim()).filter(Boolean);
  geo = geo.replace(imp[0], '').replace(/^export\s*\{\s*Geometry\s*\};?\s*$/m, '');
  const makeGeometry = 'function sbMakeGeometry(T) {\n  // three.js r125 examples/jsm/deprecated/Geometry.js (MIT)\n  var ' +
    names.map(n => n + ' = T.' + n).join(', ') + ';\n' + geo.replace(/^/gm, '  ') + '\n  return Geometry;\n}\n';
  const legacy = fs.readFileSync(path.join(root, 'clients/shared/three-legacy.js'), 'utf8');
  const compat = fs.readFileSync(path.join(root, 'clients/shared/three-r124-compat.js'), 'utf8');

  const setup = makeGeometry + legacy + compat + `
function sbSetup(T) {
  sbThreeLegacy(T, sbMakeGeometry);
  sbThreeCompat(T);
}
`;

  const sw = swapper(three, setup, rev);

  const hdr = `// ==UserScript==
// @name         starblast.io on three.js r${rev}
// @namespace    syndicate
// @version      ${gameVersion}
// @description  Starblast with three.js r${rev} (WebGL2) in place of r85. Base game only, no Studio client.
// @match        https://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Built from three@${pkgVer} (MIT, threejs.org/license) and clients/shared/ by tools/build-r167.js.
// Edit those, then rebuild.
`;

  const out = hdr + sw + 'sbThree.early();\n';
  fs.writeFileSync(path.join(root, 'clients/starblast-r167.user.js'), out);
  console.log('wrote clients/starblast-r167.user.js (' + Math.round(out.length / 1024) + ' KB, three r' + rev + ')');
}

go().catch(e => { console.error(e); process.exit(1); });
