// Builds clients/starblast-r124.user.js (the game on three.js r124 in place
// of the r85 it loads, nothing else) and clients/studio-r124.user.js (the
// Studio client with it). clients/shared/three-r124-compat.js adapts r124
// to the game.   (cd tools && npm i) ; node tools/build-r124.js
const fs = require('fs'), path = require('path');
const { build, root } = require('./three-build-lib');
const compat = fs.readFileSync(path.join(root, 'clients/shared/three-r124-compat.js'), 'utf8');
build({ pkg: 'three', rev: '124', setup: compat + '\nfunction sbSetup(T) { sbThreeCompat(T); }\n',
  game: ['clients/starblast-r124.user.js', '1.1.0'], studio: 'clients/studio-r124.user.js' });
