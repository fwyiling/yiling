// Builds clients/starblast-r159.user.js and clients/studio-r159.user.js: as
// build-r124.js, on three.js r159 (the last with a single-file build and
// legacy lights). Past r124 three.js dropped the Geometry the game builds
// its models with: clients/shared/three-legacy.js puts it back, with
// three.js's own Geometry (r125's examples/jsm/deprecated/Geometry.js,
// built in here), then three-r124-compat.js does what r124 needed.
//   (cd tools && npm i) ; node tools/build-r159.js
const fs = require('fs'), path = require('path');
const { build, root } = require('./three-build-lib');
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
build({ pkg: 'three-r159', rev: '159', setup: makeGeometry + legacy + compat + '\nfunction sbSetup(T) { sbThreeLegacy(T, sbMakeGeometry); sbThreeCompat(T); }\n',
  game: ['clients/starblast-r159.user.js', '0.1.0'], studio: 'clients/studio-r159.user.js' });
