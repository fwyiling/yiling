// Lock screen (and sign-in screen) picture from the current wallpaper.
// Windows can't animate the lock screen, so this renders one frame of your wallpaper with its widgets
// and hands it to Windows' own lock screen API (Windows.System.UserProfile.LockScreen), which a
// desktop app can call through PowerShell without admin rights.
const { BrowserWindow, screen } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const win32 = require('./win32');

/** Render the wallpaper page off-screen at the primary display's real resolution and save a JPEG.
 *  In its own in-memory session (partition): Chromium keeps one zoom level per site and session, so zooming this
 *  page up to the screen's scale in the normal session zoomed every page of the app (top bar, dock, Customize). */
async function snapshot(dir, url, preload, partition = 'sd-snapshot') {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const w = new BrowserWindow({
    width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf), show: false, frame: false,
    webPreferences: { offscreen: true, preload, contextIsolation: true, sandbox: true, zoomFactor: sf, partition },
  });
  try {
    let last = null;
    w.webContents.on('paint', (_e, _dirty, image) => { last = image; });
    w.webContents.setFrameRate(15);
    await w.loadURL(url);
    // until the page says everything has drawn (the picture, the forecast with its icons), at most 7 s
    for (let t = 0; t < 70; t++) { if (await w.webContents.executeJavaScript("document.documentElement.dataset.ready === '1'").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 150)); // one more frame painted
    const img = last && !last.isEmpty() ? last : await w.webContents.capturePage();
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^lock-\d+\.jpg$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    // a new name each time: Windows caches lock screen images by path
    const file = path.join(dir, `lock-${Date.now()}.jpg`);
    fs.writeFileSync(file, img.toJPEG(92));
    return file;
  } finally { w.destroy(); }
}

const PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$m = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asOp = $m | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
$asAction = $m | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime]
$get = $asOp.MakeGenericMethod([Windows.Storage.StorageFile]).Invoke($null, @([Windows.Storage.StorageFile]::GetFileFromPathAsync($env:SD_LOCK_PATH)))
$get.Wait(-1) | Out-Null
$set = $asAction.Invoke($null, @([Windows.System.UserProfile.LockScreen]::SetImageFileAsync($get.Result)))
$set.Wait(-1) | Out-Null
'ok'
`;

/** Set the lock screen picture. The path is passed in an environment variable, never pasted into the script. */
function setLockScreen(file) {
  if (!win32.isWin) return Promise.reject(new Error('the lock screen can only be set on Windows'));
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'); // 64-bit PowerShell
  const encoded = Buffer.from(PS, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 30000, env: { ...process.env, SD_LOCK_PATH: file } },
    (err, stdout, stderr) => (err || !/ok/.test(stdout) ? reject(new Error((stderr || err?.message || 'Windows refused the picture').trim().split('\n')[0])) : resolve(true))));
}

module.exports = { snapshot, setLockScreen };
