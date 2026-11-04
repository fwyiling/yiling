// Syndicates Desktop – animated wallpaper + desktop widgets + a Home panel for Windows.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, globalShortcut, shell, dialog, protocol, net, powerMonitor, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./settings-store');
const system = require('./system');
const win32 = require('./win32');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// sd://ui/<file> serves the app's own pages; sd://media/wallpaper serves only the wallpaper file you picked.
protocol.registerSchemesAsPrivileged([{ scheme: 'sd', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const UI_DIR = path.join(__dirname, 'renderer');
const ui = (page, query = '') => `sd://ui/${page}${query}`;

let displayTimer;
let store, tray, homeWin = null, settingsWin = null, paused = false, userPaused = false;
const wallpapers = new Map(); // display id -> BrowserWindow
let apps = null;

const all = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
const broadcast = (ch, data) => all().forEach((w) => w.webContents.send(ch, data));
const icon = () => nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false };

// ---------- wallpaper ----------
function buildWallpapers() {
  for (const w of wallpapers.values()) if (!w.isDestroyed()) { w.intentional = true; w.destroy(); }
  wallpapers.clear();
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      ...d.bounds, frame: false, show: false, skipTaskbar: true, focusable: false, resizable: false, movable: false,
      backgroundColor: '#0c0f13', title: 'Syndicates Wallpaper', webPreferences: { ...webPrefs, backgroundThrottling: false },
    });
    w.setMenu(null);
    w.loadURL(ui('wallpaper.html', `?display=${d.id}`));
    w.once('ready-to-show', () => {
      if (win32.isWin) {
        const rect = screen.dipToScreenRect(null, d.bounds); // physical pixels for Win32
        const r = win32.attachToDesktop(w, rect);
        if (!r.ok) { // couldn't join the desktop layer: show as a normal window kept at the back
          console.warn('wallpaper attach failed:', r.reason);
          w.setBounds(d.bounds); w.showInactive(); w.setIgnoreMouseEvents(true);
        }
      } else {
        w.showInactive(); // previewing on macOS/Linux
      }
    });
    // Explorer restarting destroys its child windows; bring the wallpaper back
    w.on('closed', () => { if (!w.intentional && !app.isQuitting) { clearTimeout(displayTimer); displayTimer = setTimeout(buildWallpapers, 3000); } });
    wallpapers.set(d.id, w);
  }
}
const displaysChanged = () => { clearTimeout(displayTimer); displayTimer = setTimeout(buildWallpapers, 800); };

// pause when a full-screen app is in front, or on battery
function checkPause() {
  const g = store.get().general;
  const displays = screen.getAllDisplays().map((d) => (win32.isWin ? screen.dipToScreenRect(null, d.bounds) : d.bounds));
  const auto = (g.pauseOnFullscreen && win32.fullscreenAppRunning(displays)) || (g.pauseOnBattery && powerMonitor.isOnBatteryPower());
  const next = userPaused || auto;
  if (next !== paused) { paused = next; broadcast('pause', paused); updateTray(); }
}

// mouse position for the parallax effect (only sent when it moves)
let lastCursor = '';
function sendCursor() {
  if (paused || !store.get().wallpaper.parallax) return;
  const p = screen.getCursorScreenPoint();
  const key = `${p.x},${p.y}`;
  if (key === lastCursor) return;
  lastCursor = key;
  for (const [id, w] of wallpapers) {
    const d = screen.getAllDisplays().find((x) => x.id === id);
    if (d && !w.isDestroyed()) w.webContents.send('cursor', { x: (p.x - d.bounds.x) / d.bounds.width, y: (p.y - d.bounds.y) / d.bounds.height });
  }
}

// ---------- Home panel ----------
function toggleHome(force) {
  const show = force ?? !(homeWin && homeWin.isVisible());
  if (!show) { homeWin?.hide(); return; }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!homeWin || homeWin.isDestroyed()) {
    homeWin = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, show: false, skipTaskbar: true, resizable: false, alwaysOnTop: true,
      backgroundColor: '#00000000', title: 'Syndicates Home', webPreferences: webPrefs,
    });
    homeWin.setMenu(null);
    homeWin.loadURL(ui('home.html'));
    homeWin.on('blur', () => homeWin?.hide());
    homeWin.once('ready-to-show', () => { homeWin.setBounds(d.bounds); homeWin.show(); homeWin.focus(); });
    return;
  }
  homeWin.setBounds(d.bounds);
  homeWin.show(); homeWin.focus();
  homeWin.webContents.send('home-shown');
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const key = store.get().home.hotkey;
  try { if (key && !globalShortcut.register(key, () => toggleHome())) console.warn('hotkey in use:', key); } catch (e) { console.warn('bad hotkey', key, e.message); }
}

// ---------- settings window ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({ width: 1180, height: 800, minWidth: 900, minHeight: 620, title: 'Syndicates Desktop', backgroundColor: '#0f1216', icon: icon(), webPreferences: webPrefs, autoHideMenuBar: true });
  settingsWin.setMenu(null);
  settingsWin.loadURL(ui('settings.html'));
}

// ---------- tray ----------
function updateTray() {
  if (!tray) return;
  const g = store.get().general;
  tray.setToolTip(paused ? 'Syndicates Desktop · paused' : 'Syndicates Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open Home  (${store.get().home.hotkey})`, click: () => toggleHome(true) },
    { label: 'Customize…', click: openSettings },
    { type: 'separator' },
    { label: 'Pause wallpaper', type: 'checkbox', checked: userPaused, click: (i) => { userPaused = i.checked; checkPause(); } },
    { label: 'Hide desktop icons', type: 'checkbox', checked: g.hideDesktopIcons, enabled: win32.isWin, click: (i) => applySettings({ general: { hideDesktopIcons: i.checked } }) },
    { label: 'Start with Windows', type: 'checkbox', checked: g.startWithWindows, click: (i) => applySettings({ general: { startWithWindows: i.checked } }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ---------- settings changes ----------
function applySettings(patch) {
  const before = store.get();
  const next = store.set(patch);
  if (patch.home?.hotkey !== undefined && patch.home.hotkey !== before.home.hotkey) registerHotkey();
  if (patch.general?.startWithWindows !== undefined) app.setLoginItemSettings({ openAtLogin: !!next.general.startWithWindows });
  if (patch.general?.hideDesktopIcons !== undefined) win32.setDesktopIcons(!next.general.hideDesktopIcons);
  broadcast('settings', next);
  updateTray();
  return next;
}

// ---------- IPC ----------
const httpOnly = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
function wireIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, patch) => applySettings(patch));
  ipcMain.handle('paused', () => paused);
  ipcMain.handle('stats', () => system.stats());
  ipcMain.handle('weather', (_e, city) => system.weather(city));
  ipcMain.handle('apps', () => (apps ||= system.listApps()));
  ipcMain.handle('app-icon', async (_e, p) => {
    if (!isKnownApp(p)) return '';
    try { return (await app.getFileIcon(p, { size: 'large' })).toDataURL(); } catch { return ''; }
  });
  // only launch things that came from the Start menu or that you pinned yourself
  ipcMain.handle('launch', (_e, p) => { if (!isKnownApp(p)) throw new Error('unknown app'); toggleHome(false); return shell.openPath(p); });
  ipcMain.handle('open', (_e, url) => { if (!httpOnly(url)) throw new Error('only web links'); toggleHome(false); return shell.openExternal(url); });
  ipcMain.handle('pick-file', async (e, kind) => {
    const filters = kind === 'video' ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'mov'] }]
      : kind === 'app' ? [{ name: 'Apps and shortcuts', extensions: ['exe', 'lnk', 'url', 'bat'] }]
      : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }];
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('home:toggle', (_e, show) => toggleHome(show));
  ipcMain.handle('settings:open', () => { toggleHome(false); openSettings(); });
}
function isKnownApp(p) {
  if (typeof p !== 'string' || !p) return false;
  const known = (apps ||= system.listApps()).some((a) => a.path === p);
  return known || store.get().home.pins.some((x) => x.path === p);
}

// ---------- start ----------
app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  protocol.handle('sd', (req) => {
    const u = new URL(req.url);
    if (u.host === 'ui') {
      const file = path.normalize(path.join(UI_DIR, decodeURIComponent(u.pathname)));
      if (!file.startsWith(UI_DIR + path.sep)) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    }
    if (u.host === 'media' && u.pathname === '/wallpaper') {
      const f = store.get().wallpaper.file;
      if (!f || !fs.existsSync(f)) return new Response('no file', { status: 404 });
      return net.fetch(pathToFileURL(f).href, { headers: req.headers }); // forwards Range for video seeking
    }
    return new Response('not found', { status: 404 });
  });
  wireIpc();
  buildWallpapers();
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  powerMonitor.on('on-battery', checkPause);
  powerMonitor.on('on-ac', checkPause);
  setInterval(checkPause, 2000);
  setInterval(sendCursor, 50);
  registerHotkey();
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.on('click', () => toggleHome(true));
  updateTray();
  if (store.get().general.hideDesktopIcons) win32.setDesktopIcons(false);
  if (!fs.existsSync(store.file)) openSettings(); // first run: show what can be customized
});
app.on('second-instance', () => openSettings());
app.on('before-quit', () => {
  app.isQuitting = true;
  try { store?.flush(); } catch {}
  if (store?.get().general.hideDesktopIcons) win32.setDesktopIcons(true); // give the icons back
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {}); // keep running in the tray
