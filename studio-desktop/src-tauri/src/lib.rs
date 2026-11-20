use tauri::{WebviewUrl, WebviewWindowBuilder};

// The Studio client (clients/studio-client.user.js), built into the app: it
// runs at the start of every starblast.io page load (the main frame only,
// not the page's iframes), before the game makes its WebGL context.
const STUDIO_CLIENT: &str = include_str!("../../../clients/studio-client.user.js");

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![studio_fullscreen])
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://starblast.io/".parse().unwrap()),
            )
            .title("Syndicate Studio")
            .inner_size(1600.0, 900.0)
            .min_inner_size(960.0, 540.0)
            .resizable(true)
            .center()
            // (black until the game paints, no white flash)
            .background_color(tauri::window::Color(0, 0, 0, 255))
            .additional_browser_args(BROWSER_ARGS)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
            .initialization_script(STUDIO_CLIENT)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
