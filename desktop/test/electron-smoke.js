// Real Windows only: put a solid magenta window into the desktop layer, screenshot the screen and
// check that the magenta actually shows. Proves the wallpaper renders (not white) behind the icons.
// Usage (on Windows): npx electron test/electron-smoke.js
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const win32 = require('../win32');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // same as the app
app.whenReady().then(async () => {
  if (process.platform !== 'win32') { console.log('skipped: not Windows'); return app.exit(0); }
  const d = screen.getPrimaryDisplay();
  const w = new BrowserWindow({ ...d.bounds, frame: false, show: false, skipTaskbar: true, focusable: false, backgroundColor: '#ff00ff', webPreferences: { backgroundThrottling: false } });
  await w.loadURL('data:text/html,<body style="margin:0;background:%23ff00ff"></body>');
  w.showInactive();
  const r = win32.attachToDesktop(w, screen.dipToScreenRect(null, d.bounds));
  console.log('attach:', JSON.stringify(r), '| win32:', JSON.stringify(win32.status()));
  await new Promise((res) => setTimeout(res, 3000));
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: d.size });
  const img = src.thumbnail, { width, height } = img.getSize(), bmp = img.toBitmap(); // BGRA
  let magenta = 0, n = 0;
  for (let fy = 0.08; fy < 0.92; fy += 0.04) for (let fx = 0.04; fx < 0.96; fx += 0.04) {
    const i = (Math.floor(fy * height) * width + Math.floor(fx * width)) * 4;
    n++; if (bmp[i + 2] > 200 && bmp[i + 1] < 70 && bmp[i] > 200) magenta++;
  }
  fs.writeFileSync(path.join(__dirname, '..', 'smoke-desktop.png'), img.toPNG());
  const share = magenta / n;
  console.log(`magenta on screen: ${magenta}/${n} sample points (${Math.round(share * 100)}%)`);
  const pass = r.ok && share > 0.3;
  console.log(pass ? 'PASS: the wallpaper window shows on the desktop' : 'FAIL: the wallpaper window is not visible');
  app.exit(pass ? 0 : 1);
});
