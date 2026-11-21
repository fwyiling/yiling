// Builds the game (and the Studio client) on a three.js with no single-file
// build (r160 on): build/three.module.js (r171 on: it imports three.core.js)
// bundled by esbuild into an IIFE. Same legacy + compat layers as r159.
//   (cd tools && npm i) ; node tools/build-modern.js 187
// Writes clients/starblast-rN.user.js (game only) and, with --studio,
// clients/studio-rN.user.js and clients/studio-rN-app.user.js.
const fs = require('fs'), path = require('path');
const { root, swapper, appLoader } = require('./three-build-lib');

function geometry() {
  let geo = fs.readFileSync(path.join(__dirname, 'node_modules/three-r125/examples/jsm/deprecated/Geometry.js'), 'utf8');
  const imp = geo.match(/^import\s*\{([^}]*)\}\s*from\s*'[^']*';\s*/m);
  if (!imp) throw new Error('Geometry.js: no import block');
  const names = imp[1].split(',').map(s => s.trim()).filter(Boolean);
  geo = geo.replace(imp[0], '').replace(/^export\s*\{\s*Geometry\s*\};?\s*$/m, '');
  return 'function sbMakeGeometry(T) {\n  // three.js r125 examples/jsm/deprecated/Geometry.js (MIT)\n  var ' +
    names.map(n => n + ' = T.' + n).join(', ') + ';\n' + geo.replace(/^/gm, '  ') + '\n  return Geometry;\n}\n';
}

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
// Built from three@${threeVer} (MIT, threejs.org/license), clients/shared/ and (the Studio ones)
// the Studio client, by tools/build-modern.js. Edit those, then rebuild.
`;
}

async function build(rev, o) {
  o = o || {};
  const pkg = 'three-r' + rev;
  const dir = [path.join(__dirname, 'node_modules', pkg), path.join(root, 'node_modules', pkg)].find(d => fs.existsSync(path.join(d, 'build/three.module.js')));
  if (!dir) throw new Error(pkg + ' not found: (cd tools && npm i -D ' + pkg + '@npm:three@0.' + rev + '.0)');
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  const esbuild = require(path.join(__dirname, 'node_modules/esbuild'));
  const r = await esbuild.build({ entryPoints: [path.join(dir, 'build/three.module.js')], bundle: true, format: 'iife', globalName: '__sbM', minify: true, legalComments: 'none', write: false });
  // esbuild's exports are non-configurable getters, which the legacy layer
  // can't replace (T.BoxGeometry = ...): window.THREE gets a plain copy
  const three = '// threejs.org/license\n(function(){' + r.outputFiles[0].text + ';var o={};for(var k in __sbM)o[k]=__sbM[k];window.THREE=o;})();';
  const got = (three.match(/REVISION:\(\)=>(\w+)/) && true) || three.indexOf('"' + rev + '"') >= 0;
  if (!got) throw new Error('r' + rev + ': revision not found in the bundle');
  const legacy = fs.readFileSync(path.join(root, 'clients/shared/three-legacy.js'), 'utf8');
  const compat = fs.readFileSync(path.join(root, 'clients/shared/three-r124-compat.js'), 'utf8');
  const setup = geometry() + legacy + compat + '\nfunction sbSetup(T) { sbThreeLegacy(T, sbMakeGeometry); sbThreeCompat(T); }\n';
  const out = [];
  const write = (rel, text) => { fs.writeFileSync(path.join(root, rel), text); out.push(rel + ' (' + Math.round(text.length / 1024) + ' KB)'); };
  const sw = swapper(three, setup, String(rev));
  write('clients/starblast-r' + rev + '.user.js', header('starblast.io on three.js r' + rev, 'Starblast with three.js r' + rev + ' (WebGL2) in place of r85. Base game only, no Studio client.', o.gameVersion || '0.1.0', ver) + sw + 'sbThree.early();\n');
  if (o.studio) {
    const client = fs.readFileSync(path.join(root, 'clients/studio-client.user.js'), 'utf8');
    const body = client.slice(client.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length).replace(/^\s*\n/, '');
    const cver = (client.match(/@version\s+(\S+)/) || [])[1] || '0';
    write('clients/studio-r' + rev + '.user.js', header('Syndicate Studio on three.js r' + rev, 'The Studio client with the game on three.js r' + rev + ' (WebGL2) in place of r85.', cver, ver) + sw + body + '\nsbThree.early();\n');
    write('clients/studio-r' + rev + '-app.user.js', header('Syndicate Studio on three.js r' + rev + ' (app)', 'The Studio client with the game on three.js r' + rev + ', for the app (runs before the page; the page\'s own three.js is not run).', cver, ver) + three + '\n;\n' + appLoader(setup, String(rev)) + body);
  }
  console.log('three r' + rev + ' (' + ver + '): wrote ' + out.join(', '));
}
module.exports = { build };
if (require.main === module) {
  const rev = +process.argv[2];
  if (!(rev >= 160)) { console.error('usage: node tools/build-modern.js <revision, 160 or later> [--studio]'); process.exit(1); }
  build(rev, { studio: process.argv.includes('--studio') }).catch(e => { console.error(e.message || e); process.exit(1); });
}
