// Builds clients/starblast-r167.user.js: the base game on three.js r167 with
// WebGPURenderer (auto-falls back to WebGL2 when WebGPU is not available).
// No Studio client - game only.
//   (cd tools && npm i) ; node tools/build-r167.js
const fs = require('fs'), path = require('path');
const { root } = require('./three-build-lib');

const pkg = 'three-r167', rev = '167', gameVersion = '0.1.0';
const dir = [path.join(__dirname, 'node_modules', pkg), path.join(root, 'node_modules', pkg)]
  .find(d => fs.existsSync(path.join(d, 'build/three.webgpu.min.js')));
if (!dir) { console.error(pkg + ' not found: (cd tools && npm i)'); process.exit(1); }

const esbuild = require(path.join(__dirname, 'node_modules/esbuild'));

let raw = fs.readFileSync(path.join(dir, 'build/three.webgpu.min.js'), 'utf8');
const pkgVer = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

// r167's WebGPU ES module has a top-level await to pre-warm the GPU adapter;
// IIFE format doesn't support top-level await, so we replace it with an async
// IIFE that updates the adapter variable when it resolves. By the time the
// renderer is first used (after DOMContentLoaded + game init), the adapter
// request has resolved and WebGPU is used when available, WebGL2 otherwise.
const awaitBefore = 'let vd=void 0!==navigator.gpu;"undefined"!=typeof window&&vd&&(vd=await navigator.gpu.requestAdapter());';
const awaitAfter  = 'let vd=null;(async function(){if("undefined"!=typeof window&&void 0!==navigator.gpu)vd=await navigator.gpu.requestAdapter()})();';
if (!raw.includes(awaitBefore)) { console.error('WebGPU await pattern not found in ' + pkg + '; check if the package changed'); process.exit(1); }
raw = raw.replace(awaitBefore, awaitAfter);

// esbuild: convert from ES module (named exports) to IIFE (window.THREE = ...)
async function go() {
  const result = await esbuild.build({
    stdin: { contents: raw, loader: 'js' },
    bundle: false,
    format: 'iife',
    globalName: 'THREE',
    minify: true,
    write: false,
  });
  let three = result.outputFiles[0].text;
  // esbuild converts ES module named exports to read-only getters on the IIFE
  // result (live-binding semantics). The legacy layer needs to replace e.g.
  // T.BoxGeometry with its own wrapper, so convert all getter-only properties
  // to writable value properties immediately after the IIFE runs.
  three += '\n(function(){var T=window.THREE;if(!T)return;Object.getOwnPropertyNames(T).forEach(function(k){var d=Object.getOwnPropertyDescriptor(T,k);if(d&&d.get&&!d.set){try{var v=d.get();Object.defineProperty(T,k,{value:v,writable:true,configurable:true,enumerable:!!d.enumerable});}catch(e){}}});})();\n';

  // read shared components (same as build-r159.js)
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

  // sbSetup:
  //  1. sbThreeLegacy wraps WebGPURenderer (drawing counter + legacy lights/look)
  //  2. sbThreeCompat applies material/geometry fixes (GLSL name, polyhedra detail, etc.)
  //  3. The game calls new THREE.WebGLRenderer(...); redirect that to WebGPURenderer,
  //     which uses WebGPU when available and falls back to WebGL2 automatically.
  const setup = makeGeometry + legacy + compat + `
function sbSetup(T) {
  sbThreeLegacy(T, sbMakeGeometry, "WebGPURenderer");
  sbThreeCompat(T);
  var WGPU = T.WebGPURenderer;
  if (WGPU) {
    var W = function(params) { return Reflect.construct(WGPU, [params], new.target || W); };
    W.prototype = WGPU.prototype;
    T.WebGLRenderer = W;
  }
}
`;

  // build the swapper (same mechanism as r124/r159: late() + early())
  // the swapper checks THREE.REVISION; r167's IIFE sets it correctly
  const { swapper } = require('./three-build-lib');
  const sw = swapper(three, setup, rev);

  const hdr = `// ==UserScript==
// @name         starblast.io on three.js r${rev} (WebGPU)
// @namespace    syndicate
// @version      ${gameVersion}
// @description  Starblast with three.js r${rev} (WebGPU, falls back to WebGL2) in place of r85. Base game only, no Studio client.
// @match        https://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Built from three@${pkgVer} (MIT, threejs.org/license) and clients/shared/ by tools/build-r167.js.
// Edit those, then rebuild.
`;

  const out = hdr + sw + 'sbThree.early();\n';
  const outPath = path.join(root, 'clients/starblast-r167.user.js');
  fs.writeFileSync(outPath, out);
  console.log('wrote clients/starblast-r167.user.js (' + Math.round(out.length / 1024) + ' KB, three r' + rev + ')');
}

go().catch(e => { console.error(e); process.exit(1); });
