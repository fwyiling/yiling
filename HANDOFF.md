# Syndicate Studio: handoff

Studio is a Starblast (starblast.io) client. It shows the game with less work
for the GPU, a governor that stops FPS drops and optional lighter effects, and
carries features ported from the Syndicate client (each on its own switch in
the `\` panel). It ships two ways: a userscript (Tampermonkey) and a Windows
app (Tauri 2) that loads starblast.io with the client built in, its icon the
starblast.io logo. Current version: 2.4.0.

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
   - It wraps the WebSocket constructor to read the game's messages (ship status, radar, volleys, names) and caps control messages at 90 per second.
   - Game hooks found at runtime: `TeamBoard` (team lock), `IOII0` (ship finishes: High Contrast, team highlight, saturated glow), the scoreboard's draw method (icons), and a copy of `IOII0`/`WeaponModel` `IOIll` with `this.hue,1,1` (saturation). Checked against index.js; `window.__studioPatches` lists what was patched.

Sections 1–4 change no pixel. Verify mode checks every skipped call against the real GPU state and every skipped upload against the canvas pixels.

## three.js r124 (test build, no client)

The game ships three.js r85. `clients/starblast-r124.user.js` runs it on r124 (WebGL2) instead, with no client: the page's r85 still loads, and the moment its script has run (a microtask, before the game's own script) `window.THREE` is replaced by r124, adapted by `clients/shared/three-r124-compat.js`. Rebuild with `(cd tools && npm i) && node tools/build-r124.js`.

What the game needs from r124 (each checked in the mock against r85):
- Shaders: GLSL ES 3.0 has a built-in `texture()`; the game names variables and uniforms `texture` (renamed to `sbTexture` at compile, the uniform aliased).
- Faces: r124 turns meshes mirrored by a negative scale inside out (front faces clockwise), r85 did not; the HUD (a flipped orthographic camera, panels mirrored back) depends on r85's way, so `state.setMaterial` is told not to flip.
- Sprites: r124's sprite shader drops the sign of `scale.x`; the HUD's sprites rely on it (restored in the shader).
- Polyhedra: r85 split faces into 2^detail rows, r124 into detail + 1 (planets and rocks were coarse); the game's detail is converted.
- `.shading` (also in material options), `addAttribute`, `renderer.context`: mapped without r124's per-call warnings.

The desktop app builds a second app from it: `--features r124 --config src-tauri/tauri.r124.conf.json` ("starblast.io r124", its own identifier, installs beside the main app). The Studio client is not yet adapted to r124 (its perf core hooks r85 internals).

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

## Decisions already made

- The owner asked again for the Syndicate features (version 1.6.0 on): they are in, each on its own switch; `]` turns them all off with the rest.
- The app's icon is the starblast.io logo and the app is named starblast.io (window title and installer), at the owner's request. Its identifier stays com.syndicate.studio, so its saved settings carry over.
- Low-Poly was removed at the owner's request.
- Control messages must stay at 90 per second or fewer (the socket wrapper enforces it).
