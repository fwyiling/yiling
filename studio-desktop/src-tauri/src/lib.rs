use std::io::Write;
use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// The Studio client (clients/studio-client.user.js), built into the app: it
// runs at the start of every starblast.io page load (the main frame only,
// not the page's iframes), before the game makes its WebGL context.
#[cfg(not(any(feature = "r124", feature = "r187")))]
const PAGE_SCRIPT: &str = include_str!("../../../clients/studio-client.user.js");
#[cfg(not(any(feature = "r124", feature = "r187")))]
const TITLE: &str = "starblast.io";
// The r124 build (--features r124): the client with the game on three.js r124
// in place of r85 (clients/studio-r124-app.user.js, built by tools/build-r124.js).
#[cfg(feature = "r124")]
const PAGE_SCRIPT: &str = include_str!("../../../clients/studio-r124-app.user.js");
#[cfg(feature = "r124")]
const TITLE: &str = "starblast.io r124";
// The r187 build (--features r187): the same on three.js r187
// (clients/studio-r187-app.user.js, built by tools/build-modern.js 187 --studio).
#[cfg(all(feature = "r187", not(feature = "r124")))]
const PAGE_SCRIPT: &str = include_str!("../../../clients/studio-r187-app.user.js");
#[cfg(all(feature = "r187", not(feature = "r124")))]
const TITLE: &str = "starblast.io r187";

// WebView2 (the Edge engine the app runs the game in) flags. Setting these
// replaces the app's defaults, so the features Tauri itself turns off
// (msWebOOUI, msPdfOOUI, msSmartScreenProtection) are listed again in the one
// --disable-features (a second one would override the first).
// GPU:
//  - --force_high_performance_gpu: the discrete GPU on a laptop with two.
//  - --ignore-gpu-blocklist: WebGL and canvas stay on the GPU on drivers
//    Chromium has listed (they fall back to the CPU otherwise).
//  - --enable-gpu-rasterization, --enable-zero-copy: the page's canvases
//    (scoreboard, names, radar) drawn on the GPU straight into GPU memory.
// CPU:
//  - CalculateNativeWinOcclusion off, --disable-backgrounding-occluded-windows,
//    --disable-background-timer-throttling, --disable-renderer-backgrounding:
//    the game keeps its pace when another window covers it or it isn't
//    focused (OBS on top, alt-tabbed), so a recording doesn't stutter.
// RAM (and CPU), browser parts a game window never uses:
//  - SpareRendererForSitePerProcess: no spare page process kept warm.
//  - BackForwardCache: Leave Game reloads the page; the old one isn't kept.
//  - Translate, AutofillServerCommunication, MediaRouter (casting) and the
//    Optimization Guide (hints and model downloads): off.
// None changes what is drawn; vsync stays on (no tearing in the recording).
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion,\
SpareRendererForSitePerProcess,BackForwardCache,Translate,AutofillServerCommunication,MediaRouter,\
OptimizationHints,OptimizationHintsFetching,OptimizationGuideModelDownloading,OptimizationTargetPrediction \
--disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding \
--force_high_performance_gpu --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy";

// F11 (sent by the client): the window fills the screen with no frame or
// title bar, and back.
#[tauri::command]
fn studio_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let on = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(on).map_err(|e| e.to_string())?;
    Ok(on)
}

// Match recording (the client's recorder): a file in Videos\Starblast,
// opened when a match starts, each second appended as it's recorded, closed
// when the match ends; one left open (the app closed mid-match) is closed as
// the app exits.
struct Rec(Mutex<Option<(std::fs::File, std::path::PathBuf)>>);

#[tauri::command]
fn rec_open(app: tauri::AppHandle, rec: tauri::State<Rec>, name: String, ext: String) -> Result<String, String> {
    if ext != "mp4" && ext != "webm" {
        return Err("unknown format".into());
    }
    let mut stem: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || " -_".contains(*c)).take(80).collect();
    if stem.trim().is_empty() {
        stem = "starblast".into();
    }
    let dir = app.path().video_dir().map_err(|e| e.to_string())?.join("Starblast");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).{ext}"));
        n += 1;
    }
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    *rec.0.lock().map_err(|e| e.to_string())? = Some((file, path.clone()));
    Ok(path.to_string_lossy().into_owned())
}

// (the bytes come raw: the page sends an ArrayBuffer)
#[tauri::command]
fn rec_chunk(rec: tauri::State<Rec>, request: tauri::ipc::Request) -> Result<(), String> {
    let mut guard = rec.0.lock().map_err(|e| e.to_string())?;
    let Some((file, _)) = guard.as_mut() else { return Ok(()) };
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => file.write_all(bytes),
        tauri::ipc::InvokeBody::Json(v) => {
            let bytes: Vec<u8> = serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
            file.write_all(&bytes)
        }
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn rec_close(rec: tauri::State<Rec>) -> Result<Option<String>, String> {
    let taken = rec.0.lock().map_err(|e| e.to_string())?.take();
    Ok(taken.map(|(file, path)| {
        let _ = file.sync_all();
        path.to_string_lossy().into_owned()
    }))
}

// F12 (sent by the client): the developer tools, for checking the client's
// state (the console) in the app as in a browser.
#[tauri::command]
fn studio_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Rec(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![studio_fullscreen, studio_devtools, rec_open, rec_chunk, rec_close])
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://starblast.io/".parse().unwrap()),
            )
            .title(TITLE)
            .inner_size(1600.0, 900.0)
            .min_inner_size(960.0, 540.0)
            .resizable(true)
            .center()
            // (black until the game paints, no white flash)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .additional_browser_args(BROWSER_ARGS)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .initialization_script(PAGE_SCRIPT)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
