// Real Windows only: put a solid magenta window into the desktop layer, screenshot the screen and
// check that the magenta actually shows. Proves the wallpaper renders (not white) behind the icons.
// Usage (on Windows): npx electron test/electron-smoke.js
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const win32 = require('../win32');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // same as the app
app.on('window-all-closed', () => {}); // keep running between strategies (default would quit)
// how much of the screen is magenta (sampled on a grid)
async function magentaShare(d) {
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: d.size });
  const img = src.thumbnail, { width, height } = img.getSize(), bmp = img.toBitmap(); // BGRA
  let magenta = 0, n = 0;
  for (let fy = 0.08; fy < 0.92; fy += 0.04) for (let fx = 0.04; fx < 0.96; fx += 0.04) {
    const i = (Math.floor(fy * height) * width + Math.floor(fx * width)) * 4;
    n++; if (bmp[i + 2] > 200 && bmp[i + 1] < 70 && bmp[i] > 200) magenta++;
  }
  return { share: magenta / n, img };
}
async function tryAttach(d, strategy) {
  const w = new BrowserWindow({ ...d.bounds, frame: false, show: false, skipTaskbar: true, focusable: false, backgroundColor: '#ff00ff', webPreferences: { backgroundThrottling: false } });
  await w.loadURL('data:text/html,<body style="margin:0;background:%23ff00ff"></body>');
  w.showInactive();
  const r = win32.attachToDesktop(w, screen.dipToScreenRect(null, d.bounds), strategy);
  w.webContents.invalidate();
  await new Promise((res) => setTimeout(res, 2500));
  const m = await magentaShare(d);
  return { w, r, ...m };
}

app.whenReady().then(async () => {
  if (process.platform !== 'win32') { console.log('skipped: not Windows'); return app.exit(0); }
  const d = screen.getPrimaryDisplay();
  console.log('win32:', JSON.stringify(win32.status()), '| display:', JSON.stringify(d.bounds), 'scale', d.scaleFactor);
  console.log('VISIBLE WINDOWS', JSON.stringify(win32.listWindows([process.pid]).map((w) => w.title)));
  { // control: an ordinary window on top. If even this is not seen, the screen capture itself is broken.
    const c = new BrowserWindow({ ...d.bounds, frame: false, show: false, backgroundColor: '#ff00ff' });
    await c.loadURL('data:text/html,<body style="margin:0;background:%23ff00ff"></body>');
    c.showInactive(); await new Promise((res) => setTimeout(res, 1500));
    console.log(`CONTROL plain window on top: visible=${Math.round((await magentaShare(d)).share * 100)}%`);
    c.destroy(); await new Promise((res) => setTimeout(res, 800));
  }
  if (process.argv.includes('--compare')) { // try every way of joining the 24H2 desktop and report each
    for (const strategy of win32.RAISED_STRATEGIES) {
      const t = await tryAttach(d, strategy);
      if (strategy === win32.RAISED_STRATEGIES[0]) console.log('TREE', JSON.stringify(win32.desktopTree()));
      console.log(`COMPARE ${strategy.padEnd(28)} attach=${JSON.stringify(t.r)} visible=${Math.round(t.share * 100)}%`);
      fs.writeFileSync(path.join(__dirname, '..', `smoke-${strategy}.png`), t.img.toPNG());
      t.w.destroy();
      await new Promise((res) => setTimeout(res, 800));
    }
    return app.exit(0);
  }
  const t = await tryAttach(d, 'auto');
  fs.writeFileSync(path.join(__dirname, '..', 'smoke-desktop.png'), t.img.toPNG());
  console.log('attach:', JSON.stringify(t.r), `| magenta on screen: ${Math.round(t.share * 100)}%`);
  const pass = t.r.ok && t.share > 0.3;
  console.log(pass ? 'PASS: the wallpaper window shows on the desktop' : 'FAIL: the wallpaper window is not visible');
  app.exit(pass ? 0 : 1);
});
