# starblast-deobf

Reproducible pipeline that turns the live starblast.io client into readable JS,
as groundwork for a WebGPU renderer port. The game's code is **not** committed:
`build.sh` fetches it and writes everything to `work/` (gitignored).

```bash
npm install
./build.sh          # -> work/game.named.js, work/shaders/*.glsl
npm test            # loads the renamed client on starblast.io in headless Chromium
```

## Pipeline

1. `extract.py` pulls the inline scripts out of `index.html`; the game is the ~1.2 MB one.
2. `unminify.mjs` runs webcrack (unminify only; there is no string table or VM to undo).
3. `rename.mjs` applies `names.json`. The game's mangler maps each real name to one
   `l/I/O/0/1` token everywhere (even inside strings and GLSL), so a whole-token
   replace is exact. It refuses names that would collide with existing identifiers.
4. `shaders.mjs` dumps every GLSL source with its owning class.
5. `runtest.cjs` swaps the page's game script for `work/game.named.js` via request
   interception (keeps the real origin) and screenshots the welcome screen.

Status: 105 of ~457 mangled names restored, covering ~73% of mangled occurrences.
Add names to `names.json` and rerun `./build.sh && npm test`.

## Findings relevant to WebGPU

- Renderer: Three.js **r85** (2017) loaded from cdnjs, `THREE.WebGLRenderer` in `Display`
  (plus one shared renderer in `ShipModel` for thumbnails).
- Uses legacy `THREE.Geometry`/`Face3` (removed in r125): must move to `BufferGeometry`
  before upgrading to a Three.js with `WebGPURenderer`.
- 10 `ShaderMaterial`s, all additive-blended effects: `Particles`, `Display`, `Explosions`,
  `Laserticles`, `Stars`, `Galaxy`, `NoiseGlow`, `Repulsor`, `CollectibleGlow`, `Snow`.
  These need rewriting in TSL (node materials); Phong/Lambert/Basic materials port as-is.
- Most of those are point sprites using `gl_PointSize`. WebGPU has no point size
  (points are always 1px), so they must become instanced quads
  (e.g. `PointsNodeMaterial`/`SpriteNodeMaterial` with a size node).
- UI is drawn to 2D canvases and uploaded as textures; that is renderer-agnostic.
