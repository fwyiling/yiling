# Syndicate Studio: handoff

Studio is a Starblast (starblast.io) client. It shows the game with less work
for the GPU, a governor that stops FPS drops and optional lighter effects, and
carries features ported from the Syndicate client (each on its own switch in
the `\` panel). It ships two ways: a userscript (Tampermonkey) and a Windows
app (Tauri 2) that loads starblast.io with the client built in, its icon the
starblast.io logo. Current version: 2.5.11 (the r124 app: 1.4.4 (the Mac .dmg stays at 1.4.1), also as a Mac .dmg built once by `.github/workflows/build-studio-mac.yml` (universal, unsigned; runs when that file changes or by hand); the r187 app: 1.0.2, no longer built).

This repository (github.com/fwyiling/yiling, branch
claude/laughing-noether-4c3asv) keeps the layout of the original source: the
app and the tests find the client by relative path.

## Files

| Path | What it is |
|---|---|
| clients/studio-client.user.js | **The client.** Userscript header, config line, the perf core (copied in), then Studio's own UI. |
| clients/shared/perf-core.js | **The perf core: edit this, not the copy inside the client.** Shared with the Syndicate client. |
| tools/splice-shared.js | Copies perf-core.js into the client between `// #region perf-core` and `// #endregion perf-core`. Run `node tools/splice-shared.js` after editing the core; `--check` exits 1 if a copy is stale. |
| studio-desktop/ | The Windows app (Tauri 2.11, Rust). `src-tauri/src/lib.rs` embeds the client with `include_str!` and runs it as the page's initialization script. |
| tools/make-icon.mjs | Fetches the starblast.io logo for the app icon: the largest PNG icon in the game's web app manifest, else its favicon. The workflow runs it, then `tauri icon`. |
| .github/workflows/build-studio-desktop.yml | Builds the installer on windows-latest and commits it to dist-studio/. Runs on push to the branch (paths: studio-desktop/**, the client, the workflow) or by hand. |
| studio/dev/ | Test and measurement tools (Node + Playwright, run in a mock match). |
| duel-pilot/dev/mock.js, duel-pilot/dev/vendor/, index.js | The mock match the tests use: a fake game server, three.js, and a snapshot of the game's own code (index.js). |

## What the client does

1. **GPU state cache.** A WebGL call that sets state to the value already in place is dropped: uniforms, binds, caps, pixelStorei, blend, viewport and so on. The cache is per context and is cleared by anything that can change state behind it (deletes, relinks, VAO switches, context loss).
2. **Canvas upload dedupe.** A 2D canvas whose drawing since its last upload is the same calls on a cleared canvas, uploaded to the same texture with the same settings, isn't uploaded again. Gradients and patterns are matched by content.
3. **Vertex arrays.** three.js r85's per-draw attribute setup is turned into one cached VAO per setup (OES_vertex_array_object). It steps aside if the game uses VAOs or instancing itself.
4. **High-performance GPU** (`powerPreference`).
5. **Governor ("No FPS drops").** Turns off the game's auto quality (which rebuilds the renderer). While frames drop by 4% or more, it steps down through `settings.forced` in this order: galaxies, nebulae, planets and moons, background, full resolution. It steps back up after 20 s clean, waiting twice as long for a step that brought drops back.
6. **Lighter effects** (flags in `__perfCore.on`): noparticles, highperf (laser trail capped at 5), disablesuns, hudthrottle (HUD bars at 15/s, trailing, one clock per bar), offscreencull (asteroids over 1400 away updated every 6th frame), staticobj, nospin.
7. **Studio only:** ship outlines in each ship's hue (a back-face copy at 1.12×), and the settings UI.
8. **Ported from Syndicate** (the block after Studio's own, `window.__studioExt`): FOV zoom and its extended view (Syndicate's spectator engine, spectator mode itself unbound), full map radar with names, icons and tier tags, leaderboard ship icons in each player's hue, ESP (lines and boxes, everyone or within a distance), saturated ship colours, High Contrast, team highlight, no stars, fast respawn, team lock bypass, Aim Assist (lock 0 ms, 30° cone; Dodge Assist off by default).
   - Join custom game: a mode added after the game's own under PLAY (hooks on the home class found by `gameModesLoader`/`startGame`/`changeGameMode`). With it picked, a link box opens under the name box (inside `#player`, so it takes the game's styles); PLAY puts the link in the address and calls `gameModesLoader` again, as opening the link would.
   - Leave Game: `GameMenu.createMainMenu` gets a game `MenuButton` "LEAVE GAME" with the game's own `quit_to_menu` action (back to the start page).
   - ESP draws each ship in view at its model (`world.ships[i].model`, where the game draws it) straight after the game's world render (`__perfCore.afterRender`, the game's camera), boxed by the model's hull meshes; ships out of view come from the radar (about once a second, coarse steps), flown on between samples: a least-squares fit of the last few samples (at least 0.6 s apart) for velocity, a turn rate from how the fitted heading moves, the drawn spot following with a 0.25 s correction; a ship leaving the view carries on from where it was drawn. Simulated: mean error 2.6 units (the radar step is 4.7), ~1 unit of movement per frame.
   - Aim Assist physics per ship come from the game's own ShipInstance (top speed, inertia, turn, upgrades and mods included), else the mode's ship types with the upgrade levels in the status packets (`lv`, 4 bits per stat), else the level-1 table. It always leads for the biggest gun (its speed measured from your volleys, else your ship's own number); the muzzle is measured up to 30 forward (the Shadow X-3's is ~15).
   - What a shot inherits (2.5.2): fitted from your own big-gun volleys as `d = k·v + (c + p·(v·u))·u` (v your velocity from the status of the tick before the volley, u the bolt's heading; least squares decayed per shot, held near k 1, c 0, p 0). `c` catches recoil applied before the bolt leaves (the X-3's big gun has recoil 200), `p` a share of only the speed along the nose; gliding (RCS off) is when these show. It used to learn one `k` against the latest status, which can already carry the shot's recoil. The solvers (aim assist `solve`/`missAt`, the duel pilot's `aim`) add the push along the heading. Not checked against the real server: a synthetic test (scratchpad `glidefit.js`) recovers each rule (full velocity: k 1; recoil first: c −0.6; nose only: p 0.99) and hits as often as the true rule allows. `__synAim.k/.c/.p` show the live fit.
   - ESP boxes (own switch) fit each drawn ship: its hull's farthest points in 16 directions (once per model), through its matrix each frame. A ship on screen gets only its distance (the game's tag has the name); off screen, name and distance at the edge.
   - Ship tags: each other ship's energy (status.generator / ShipInstance.generator_capacity) as a third bar between the shield and gem bars, the three the same height in the game's space for its two (as Syndicate does it; drawn into the tag canvas by catching the game's own bar fillRects during its draw, so the badge stays on top and it moves with the tag), and lives left (status.lives - 1) as a heart and count left of "Lv"; tags scale with the FOV zoom (`AEGIS_tagzoomscale`).
   - The `\` panel is drawn in the look of the game's own Settings window (header bar with x, square switches), with its own styles.
   - Aim Assist shoots (`STUDIO_aim_cfg.autofire`): "big" (default) presses once the bar pays for the biggest gun's volley; "all" fires on target and never holds your own fire.
   - Survival timer: until joining closes (mode.max_enter_time from the welcome's servertime), then SURVIVAL.
   - Aim Assist has two triggers, each its own switch: holding its key (`STUDIO_aim`), firing (`STUDIO_aim_fire`, starts as `STUDIO_aim` was).
   - It wraps the WebSocket constructor to read the game's messages (ship status, radar, volleys, names) and caps control messages at 90 per second.
   - Game hooks found at runtime: `TeamBoard` (team lock), `IOII0` (ship finishes: High Contrast, team highlight, saturated glow), the scoreboard's draw method (icons), and a copy of `IOII0`/`WeaponModel` `IOIll` with `this.hue,1,1` (saturation). Checked against index.js; `window.__studioPatches` lists what was patched.
   - Upgrade animation fix (2.5.4, always on, source-patch rules with `feat: null`): the game's ShipModel/WeaponModel bump scales a new ship by `1.5 - cos(2π√i)` over 30 ticks, which ends at 0.5× and then snaps to 1× (the shield bump ends at 1.1 and snaps to 1.2); `+.5*i` / `+.1*i` make each end where it lands. Mock (scratchpad `bumptest.js`): before `… 0.52 0.50 → 1.00`, after `… 1.03 0.99 1.00`. The upgrade-panel ship previews were checked too: pixel-identical on r85, r124 and r187.
   - Match recording (2.5.6, the app only; switch "Record matches" in the panel, `STUDIO_record`, default on; not stopped by ] all mods off): from `entered` (with the game socket open) to leaving (socket closed, `pagehide` on Leave Game's reload) the game canvas (`#canvaswrapper canvas`, HUD included, the client's DOM overlays not) is copied each frame, scaled, onto a fixed-size canvas (the screen's size at the start, at most 1080 high; letterboxed if the window changes shape) that MediaRecorder records (`captureStream(0)` + `requestFrame()` at a steady 60 fps at most (2.5.10: unpaced at 144 Hz+ the user's video played sped up), 8 Mbps): the game canvas renders fewer pixels while zoomed out (FOV) or when quality steps down, and recording it directly changed the video's size mid-file (players stuck at the first size, so FOV looked absent; 2.5.9) with the game's sound (AudioNode.connect to a speaker also feeds a MediaStreamDestination). Each 1 s piece goes in order to the app (`rec_open` name+ext, `rec_chunk` raw ArrayBuffer, `rec_close`; `src-tauri/src/lib.rs`, permission `allow-studio-record`), which appends to `Videos\Starblast\starblast <date> <time>.webm`; closing the app loses at most the last second. WebM VP8 (+Opus) by default: in a test Chromium's MP4/H.264 recordings decoded with broken blocks, VP8/VP9 cleanly; `STUDIO_rec_mime` overrides. The next page says where the last one went. Mock (scratchpad `rectest.js`, fake app): nothing on the menu, open on entering, ~1 s pieces, closed on leaving; ffmpeg decodes it with 0 errors, audio not silent. Not run in the real app yet (the Rust compiles; CI builds it).
   - Big radar (2.5.7, `bigRadar`, switch `STUDIO_bigradar` default on, key E / `STUDIO_bigradar_key`, toggles; closes when you leave the match): the whole map over the middle of the screen (0.46 × the short side, the square with its corners cut), centred on you (wrapping), on its own `pointer-events:none` canvas (the game's camera and clicks untouched; not in recordings). Ships with a fresh status (<600 ms) at their exact place carried on by their speed, the rest at their radar contact gliding to each update; each a dot in the player's hue with name and tier tag; names that would cover another name or a dot move up/down (or to the left) with a line back to the dot. A grid that moves with you, your ship as an arrow at the centre.
   - Gravity field NaN guard (2.5.5, `fieldGuard`): survival/battle royale pass `sqrt((tick - start) / duration)` to `updateRepulsor`; before the start (survival's countdown) that's NaN (`Math.max(1e-5, NaN)` keeps it) and the field meshes got a NaN scale (garbage rings round the sun). Every class's `updateRepulsor` now takes NaN as 1e-5. A source-patch rule can't do it: `modeStep` reads the game's private config (`lO00I`), so its copy throws and falls back. Mock: in the countdown scale NaN → 0, after the start unchanged. A scan of the game for the bump's kind of mistake (an animation curve that doesn't end where it then snaps) found only the bumps.

Sections 1–4 change no pixel. Verify mode checks every skipped call against the real GPU state and every skipped upload against the canvas pixels.

## three.js r124

The game ships three.js r85. `clients/starblast-r124.user.js` runs it on r124 (WebGL2) instead, with no client, and `clients/studio-r124.user.js` is the Studio client on r124 (the client first, then the swap, which hands r124, never r85, to the perf core's `window.THREE` hook). In both the page's r85 still loads, and the moment its script has run (a microtask, before the game's own script) `window.THREE` is replaced by r124, adapted by `clients/shared/three-r124-compat.js`. Rebuild with `(cd tools && npm i) && node tools/build-r124.js`.

What the game needs from r124 (each checked in the mock against r85):
- Shaders: GLSL ES 3.0 has a built-in `texture()`; the game names variables and uniforms `texture` (renamed to `sbTexture` at compile, the uniform aliased).
- Faces: r124 turns meshes mirrored by a negative scale inside out (front faces clockwise), r85 did not; the HUD (a flipped orthographic camera, panels mirrored back) depends on r85's way, so `state.setMaterial` is told not to flip.
- Sprites: r124's sprite shader drops the sign of the scale; the HUD's panels are mirrored in x and its crosshair in y (restored in the shader; the crosshair was culled).
- Polyhedra: r85 split faces into 2^detail rows, r124 into detail + 1 (planets and rocks were coarse); the game's detail is converted.
- `.shading` (also in material options), `addAttribute`, `renderer.context`: mapped without r124's per-call warnings.

The workflow builds only the r124 app (the r85 app stays at 2.4.0, the r187 app at 1.0.2; their build steps were taken out, the user wants just r124). The r124 app: `--features r124 --config src-tauri/tauri.r124.conf.json` ("starblast.io r124", its own identifier, installs beside the main app); the workflow rebuilds the r124 scripts first. Checked in the mock: the perf core hooks the same (renderers, effects, governor; verify mode 0 mismatches on WebGL2, its WebGL1 vertex-array layer steps aside for r124's own), and the client's features (ESP, aim physics, radar, leaderboard icons, patches, join, Leave Game, the \\ panel) work as on r85.

The app (1.2.2 on) uses `clients/studio-r124-app.user.js` instead (`build()`'s `app` output): the app runs it before any page script, so r124 runs right there as code (not held as a string and injected), `sbSetup` adapts it, and the page's own r85 `<script>` is never run (a MutationObserver sets its type to `javascript/blocked` as the parser adds it; r85 does `THREE = THREE || {}` and would fill r124's object). Then the client, which finds `window.THREE` already r124. At load it logs `[three r124] loaded as the page's three.js` or warns if r85 ran anyway. Measured in Chromium: three.js start-up ~45 ms (r85 run + r124 string inject) down to ~22 ms; in-game cost unchanged. Mock: corestate same as studio-r124, bench VERIFY 0 mismatches, keytest passes. The Tampermonkey scripts keep the swap (they can be injected late).

## three.js r159 (test build, not in the app yet)

`node tools/build-r159.js` writes `clients/starblast-r159.user.js` (the game alone) and `clients/studio-r159.user.js` (the client), on three.js r159: the last release with a single-file build and the legacy-lights switch. Shared swap code: `tools/three-build-lib.js` (build-r124.js uses it too).

- Past r124 three.js removed `Geometry`/`Face3`, which the game builds every model with. `clients/shared/three-legacy.js` puts them back: three.js's own Geometry (r125 `examples/jsm/deprecated/Geometry.js`, from the `three-r125` npm alias, built in), Face3, and Box/Plane/Icosahedron... as Geometry made the way r124 made them (the BufferGeometry classes keep their r124 `XxxBufferGeometry` names).
- Drawing: while a renderer draws, `mesh.geometry` (Mesh/Line/Points) reads as a BufferGeometry made from the Geometry, remade when the game sets `verticesNeedUpdate` etc. (as r124's renderer did); outside a draw the game and the client see the Geometry.
- Textures: r125+ sizes a texture's GPU copy once (texStorage2D); when the picture changes size (a canvas made bigger) the copy is let go and made again, as r124 effectively did; a 0x0 canvas is not uploaded.
- Look kept as r124: `ColorManagement.enabled = false`, `outputColorSpace` linear, `renderer._useLegacyLights = true`, point/spot light decay 1 by default; `THREE.Math`, `VertexColors`, `FlatShading`, `removeAttribute`, `fromGeometry` back.
- Then `three-r124-compat.js` as for r124. The renderer wrappers (it, the legacy layer, perf-core's trap) make the renderer with `Reflect.construct`: from r125 WebGLRenderer is a class.
- Checked in the mock: the game draws the same as r124 (planet, ships, lights, HUD, crosshair); corestate hooks, bench VERIFY mismatch 0, keytest, aimsplit, aim shot modes, tags and panel pass.
- Further (r160+): no single-file build (bundle the module), legacy lights gone at r165 (light strengths by hand), WebGL1 gone at r163.

## three.js r167 and r187 (`tools/build-modern.js`)

`node tools/build-modern.js <rev> [--studio]` builds any three.js from r160 on (the npm alias `three-r<rev>` in `tools/`): `clients/starblast-r<rev>.user.js` (game only) and with `--studio` `clients/studio-r<rev>.user.js` (Tampermonkey) and `clients/studio-r<rev>-app.user.js` (the app). Built so far: r167 (game only; the user tested it on starblast.io) and r187 (all three; the **r187 app**, `--features r187`, `tauri.r187.conf.json`, "starblast.io r187", own identifier, installs beside the r124 app; CI builds both apps).

- No single-file build after r159 (r187: not even `three.module.min.js`; `three.module.js` imports `three.core.js`): esbuild bundles `build/three.module.js` into an IIFE. esbuild's exports are non-configurable getters, so `window.THREE` is set to a plain copy of them; otherwise the legacy layer can't replace `THREE.BoxGeometry` etc.
- Legacy lights are gone at r165: when `ShaderChunk.lights_pars_begin` has no `LEGACY_LIGHTS`, `three-legacy.js` patches it (light colours × PI, r124's linear distance fade), as legacy mode did. r124/r159 are not affected.
- r168 on: the sprite shader computes both scales in one line (`vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), ... )`); `three-r124-compat.js` keeps the sign for that form too (without it the HUD's mirrored sprites, scoreboard, panels, survivor count, were culled).
- perf-core's canvas upload skip also covers a whole-canvas `texSubImage2D` (r125+ sizes a texture once with texStorage2D and sends new drawings that way): on r159/r187 it skipped 0, now ~50 a match like r124; verify mode 0 mismatches.
- Same legacy + compat layers as r159 otherwise. `sbThreeLegacy` takes an optional third argument, the renderer name to wrap (default `WebGLRenderer`).
- WebGPU was tried and dropped: the WebGPU build has a top-level await, and the game's 10 GLSL ShaderMaterials would need porting.
- r187 checked in the mock, game and client, injected before and after the game's script: no three.js errors; corestate same as r124, bench VERIFY 0 mismatches, keytest, aimsplit/aimshots/aim, glidefit, ESP and tags as r124.
- The gravity-field rings (`Repulsor`) showing in some mock runs and not others is the mock's survival clock, not three.js: their scale is `sqrt((tick - survival_start) / duration)`, NaN before the start (the earlier note blaming r124/r159 was wrong; the client now guards it, see the NaN guard above).

## Keys and settings

- `\` settings panel in game (game switches + Studio switches + the ported ones), Esc closes. It's built from the game's own settings markup (`.modal`, `.option`, `.switch`), with a stand-in style if the game's stylesheet doesn't reach it
- `]` all Studio changes off; `]` again restores them
- F9 FPS / drops / quality-step readout
- F11 frameless fullscreen (app only, Tauri command `studio_fullscreen`)
- The same switches appear in the game's own Settings, under the vanilla options (via a hook on `buildSettings`).

localStorage: `STUDIO_fx_<flag>` ("1"/"0", all on by default), `STUDIO_gov`, `STUDIO_off` (everything off; reload), `STUDIO_verify` (verify mode, slow, testing only), `STUDIO_novao` (vertex arrays off).
Ported features: `AEGIS_fov`, `AEGIS_wideview`, `AEGIS_radarzoom`, `AEGIS_radarnames`, `AEGIS_radaricons`, `AEGIS_radartier`, `AEGIS_fastrespawn`, `AEGIS_highcontrast`, `STUDIO_nostars`, `STUDIO_lbicons`, `STUDIO_esp` (+ `STUDIO_esp_range` all/near, `STUDIO_esp_dist`), `STUDIO_saturate`, `STUDIO_teamhl`, `STUDIO_teamlock`, `STUDIO_aim` (+ `STUDIO_aim_key`, `STUDIO_aim_cfg`).

`window.__studio` / `window.__perfCore` expose `stats()`, `gov`, `fx` (what got hooked) and `on` (the flags), for checking.

## Perf core API (window.__perfCore)

The host sets `window.__perfCoreCfg = { keys: { off, verify, novao, gov }, govDefault }` before the core runs. Then:
`on` (flags), `setGov(on, persist)`, `onRender(fn(scene, cam, info, renderer), order)`, `afterRender(fn)`, `whenClass(test(proto), install(proto), ms)` (one shared scan of `window` for game classes), `settings()`, `cullScale()`, `ownsTimer(id)`, `readout(el)`.
The core hooks every `THREE.WebGLRenderer` as it's made (a property trap on `window.THREE`), so there's no polling for renderers.

## Testing

You need Node 20+ and Playwright with Chromium. Run from studio/dev/; Studio needs `CAPTURE=1` (it exposes the game object to the mock):

```
CAPTURE=1 NEAR=1 CLIENT=../../clients/studio-client.user.js node corestate.js   # what got hooked
CAPTURE=1 NEAR=1 CLIENT=../../clients/studio-client.user.js SECS=10 node synbench.js   # fps, GL calls, uploads
NEAR=1 VERIFY=1 CLIENT=../../clients/studio-client.user.js SECS=8 node bench.js   # mismatch must be 0
CLIENT=../../clients/studio-client.user.js node keytest.js   # \ panel and ]
```

The mock uses a software GPU (SwiftShader). Frame rate there is bound by pixels, not calls, so the GPU cache shows as fewer calls rather than more fps. The governor does show up in fps. After about 15 s the mock stops showing other ships, so take screenshots early.

## Building the app

Push to the branch, or run the workflow by hand, and the installer lands in dist-studio/. The version is in studio-desktop/src-tauri/tauri.conf.json and Cargo.toml (bump both) and in the client's `@version` and `__studio.version`. Static CRT (no VC++ runtime needed: see .cargo/config.toml; the workflow checks it). Release builds: LTO, one codegen unit, stripped, panic=abort.

WebView2 flags are in lib.rs. GPU: discrete GPU, GPU blocklist ignored, GPU raster and zero-copy. CPU: no occlusion or background throttling (so recording behind OBS works). RAM: no spare renderer, no back-forward cache, no translate, autofill server, casting or optimization-guide downloads. The window is black until the game paints.

The icon: studio-desktop/app-icon.svg is the starblast.io logo redrawn as vectors (the site only serves a 64 px icon, which looked pixelated), rendered to app-icon.png at 1024 (any SVG renderer, e.g. resvg). The workflow runs `tauri icon` on it into src-tauri/icons/ and commits the icons with the installers. Without app-icon.png it falls back to tools/make-icon.mjs (the logo from the game's own page).

There is also a sisyphus-desktop/ in the repo: a copy of studio-desktop that hasn't been rebranded yet. The client reads `window.__studioBrand` for its section titles.

## Where the time goes (2.5.11, mock, r124 app, scratchpad `profmap.js`)

Per frame at ~55 fps in the mock (SwiftShader, so "browser" includes the emulated GPU): browser/native 16.1 ms; three.js scene updates (updateMatrixWorld, updateMatrix, setFromEuler) ~0.3 ms; three.js rendering/other ~0.35 ms; the game's own code 0.44 ms; the whole client ~0.45 ms (GPU state cache 0.09, aim assist 0.04, the rest under 0.03 each). GPU: ~30 draw calls/frame (the plain game 695 GL calls → 154 with the client), the game's 10 custom shaders under 0.5% of draw time (HUD sprites the largest share): merging meshes or rewriting shaders wouldn't show. Network: game messages came as Blobs read back twice (game + client), ~0.3 ms/frame and an async hop per message; since 2.5.11 the game's sockets use `binaryType = "arraybuffer"` and the game's `onmessage` gets `{ data: { arrayBuffer() } }` (the shape the spectator's injected messages use) in the same task: Blob/arrayBuffer time 174 ms/8 s → 0. The game's renderer setSize resizes come from the quality governor stepping `resolution_div` (0.2%).

## Decisions already made

- Recordings show what the player sees. The user asked for videos at normal zoom while playing zoomed (so viewers can't tell FOV is used): declined, it exists only to hide mod use from others. Don't add that (or anything else meant to conceal the client's mods in recordings).

- The owner asked again for the Syndicate features (version 1.6.0 on): they are in, each on its own switch; `]` turns them all off with the rest.
- The app's icon is the starblast.io logo and the app is named starblast.io (window title and installer), at the owner's request. Its identifier stays com.syndicate.studio, so its saved settings carry over.
- Low-Poly was removed at the owner's request.
- Control messages must stay at 90 per second or fewer (the socket wrapper enforces it).
