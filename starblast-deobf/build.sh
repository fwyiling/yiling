#!/usr/bin/env bash
# Fetch the live client and produce work/game.named.js + work/shaders/.
set -euo pipefail
cd "$(dirname "$0")"
W=work; mkdir -p $W
[ -f $W/index.html ] || curl -sS https://starblast.io/ -o $W/index.html
python3 -I extract.py $W/index.html $W/inline >/dev/null
GAME=$(grep -l '^(function(s,t,a,r,b,l,i,o){' $W/inline/*.js)
node --max-old-space-size=6000 unminify.mjs "$GAME" $W/game.unmin.js
node --max-old-space-size=6000 rename.mjs $W/game.unmin.js names.json $W/game.named.js
rm -rf $W/shaders && node shaders.mjs $W/game.named.js $W/shaders | tail -1
