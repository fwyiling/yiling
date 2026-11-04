// Syndicates Desktop – animated wallpaper + desktop widgets + a Home panel for Windows.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, globalShortcut, shell, dialog, protocol, net, powerMonitor, nativeImage, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./settings-store');
const system = require('./system');
const win32 = require('./win32');
const taskbar = require('./taskbar');
const lockscreen = require('./lockscreen');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// keep the last warnings and errors for "Copy diagnostics"
const recentLog = [];
for (const level of ['warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => { recentLog.push(`[${level}] ${a.map(String).join(' ')}`); if (recentLog.length > 40) recentLog.shift(); orig(...a); };
}
const attachResults = new Map(); // display id -> result of joining the desktop layer
// Chromium stops drawing windows it thinks are covered and shows them white. A window behind the
// desktop icons always looks covered, so that check has to be off for the wallpaper to render.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// sd://ui/<file> serves the app's own pages; sd://media/wallpaper serves only the wallpaper file you picked.
protocol.registerSchemesAsPrivileged([{ scheme: 'sd', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const UI_DIR = path.join(__dirname, 'renderer');
const ui = (page, query = '') => `sd://ui/${page}${query}`;

let displayTimer;
let store, tray, homeWin = null, settingsWin = null, dockWin = null, paused = false, userPaused = false;
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
        // show first: a window Chromium considers hidden never paints, which left the desktop white
        w.showInactive();
        const rect = screen.dipToScreenRect(null, d.bounds); // physical pixels for Win32
        const r = win32.attachToDesktop(w, rect);
        attachResults.set(d.id, r);
        if (!r.ok) { // couldn't join the desktop layer: show as a normal window kept at the back
          console.warn('wallpaper attach failed:', r.reason);
          w.setBounds(d.bounds); w.setIgnoreMouseEvents(true);
        } else {
          w.webContents.invalidate(); // repaint inside its new parent
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

// ---------- Syndicates dock (replaces the look of the taskbar) ----------
const DOCK_H = { s: 52, m: 64, l: 78 };
let windowsList = [], dockTimer = null;
function ownPids() { return [process.pid, ...app.getAppMetrics().map((m) => m.pid)]; }
function placeDock() {
  if (!dockWin || dockWin.isDestroyed()) return;
  const dk = store.get().dock, d = screen.getPrimaryDisplay(), h = DOCK_H[dk.size] || DOCK_H.m;
  const strip = { x: d.bounds.x, y: d.bounds.y + d.bounds.height - h, width: d.bounds.width, height: h };
  if (win32.isWin && dk.reserve) {
    win32.releaseEdge(dockWin);
    const r = win32.reserveEdge(dockWin, screen.dipToScreenRect(null, strip), 'bottom'); // maximized windows stop above the dock
    dockWin.setBounds(r ? screen.screenToDipRect(null, r) : strip);
  } else dockWin.setBounds(strip);
}
async function pollWindows() {
  if (!dockWin || dockWin.isDestroyed() || !store.get().dock.running) return;
  windowsList = win32.listWindows(ownPids());
  dockWin.webContents.send('windows', windowsList);
}
async function setDock(on) {
  const st = store.get();
  if (on && (!dockWin || dockWin.isDestroyed())) {
    if (win32.isWin && st.dock.prevAutoHide == null) store.set({ dock: { prevAutoHide: win32.taskbarAutoHide() } });
    if (win32.isWin) win32.setTaskbarAutoHide(true); // the Windows taskbar slides away; the dock takes its place
    dockWin = new BrowserWindow({ width: 800, height: 64, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Syndicates Dock', webPreferences: webPrefs });
    dockWin.setAlwaysOnTop(true, 'pop-up-menu');
    dockWin.loadURL(ui('dock.html'));
    dockWin.once('ready-to-show', () => { placeDock(); dockWin.showInactive(); pollWindows(); });
    dockWin.on('closed', () => { dockWin = null; });
    clearInterval(dockTimer); dockTimer = setInterval(pollWindows, 1000);
  } else if (!on && dockWin) {
    clearInterval(dockTimer);
    if (win32.isWin) { win32.releaseEdge(dockWin); win32.setTaskbarAutoHide(!!st.dock.prevAutoHide); }
    store.set({ dock: { prevAutoHide: null } });
    dockWin.destroy(); dockWin = null;
  }
}

// ---------- lock screen ----------
let lockTimer = null;
async function applyLockScreen() {
  const st = store.get();
  const file = await lockscreen.snapshot(path.join(app.getPath('userData'), 'lock'), ui('wallpaper.html', '?snapshot=1'), webPrefs.preload);
  const result = { file, lock: false, wallpaper: false, error: '' };
  try { result.lock = await lockscreen.setLockScreen(file); } catch (e) { result.error = e.message; }
  if (st.lock.alsoWallpaper) result.wallpaper = win32.setWindowsWallpaper(file);
  store.set({ lock: { last: file, lastAt: Date.now(), lastError: result.error } });
  broadcast('settings', store.get());
  return result;
}
const lockSoon = () => { clearTimeout(lockTimer); lockTimer = setTimeout(() => applyLockScreen().catch((e) => console.warn('lock screen', e.message)), 15000); };

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
  if (patch.dock) { if (patch.dock.on !== undefined) setDock(next.dock.on); else placeDock(); }
  if (next.lock.auto && (patch.wallpaper || patch.widgets || patch.accent || patch.name)) lockSoon(); // keep the lock screen matching
  broadcast('settings', next);
  updateTray();
  return next;
}

// ---------- diagnostics ----------
function diagnostics() {
  const os = require('os');
  return {
    app: app.getVersion(), electron: process.versions.electron, os: `${os.type()} ${os.release()} ${os.arch()}`,
    win32: win32.status(),
    displays: screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, scale: d.scaleFactor, wallpaper: attachResults.get(d.id) || null })),
    paused, dock: !!dockWin, log: recentLog.slice(-20),
  };
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
  ipcMain.handle('diagnostics', () => diagnostics());
  ipcMain.handle('taskbar:get', () => taskbar.read());
  ipcMain.handle('taskbar:set', (_e, patch) => taskbar.apply(patch));
  ipcMain.handle('lock:apply', () => applyLockScreen());
  ipcMain.handle('windows-settings', (_e, page) => { // only these Settings pages
    const pages = { colors: 'ms-settings:colors', lockscreen: 'ms-settings:lockscreen', taskbar: 'ms-settings:taskbar', background: 'ms-settings:personalization-background' };
    if (!pages[page]) throw new Error('unknown page');
    return shell.openExternal(pages[page]);
  });
  ipcMain.handle('windows', () => windowsList);
  ipcMain.handle('window:focus', (_e, hwnd) => { if (!windowsList.some((w) => w.hwnd === hwnd)) throw new Error('unknown window'); win32.focusWindow(hwnd); setTimeout(pollWindows, 150); });
  ipcMain.handle('exe-icon', async (_e, exe) => {
    if (!windowsList.some((w) => w.exe === exe)) return '';
    try { return (await app.getFileIcon(exe, { size: 'normal' })).toDataURL(); } catch { return ''; }
  });
  ipcMain.handle('pin-target', (_e, p) => { // what a pinned shortcut points at, to match it with open windows
    if (!isKnownApp(p)) return '';
    if (!/\.lnk$/i.test(p) || process.platform !== 'win32') return p;
    try { return shell.readShortcutLink(p).target || p; } catch { return p; }
  });
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
    if (u.host === 'media' && u.pathname === '/lock') {
      const f = store.get().lock.last;
      if (!f || !fs.existsSync(f)) return new Response('no snapshot', { status: 404 });
      return net.fetch(pathToFileURL(f).href);
    }
    if (u.host === 'media' && u.pathname === '/wallpaper') {
      const f = store.get().wallpaper.file;
      if (!f || !fs.existsSync(f)) return new Response('no file', { status: 404 });
      return net.fetch(pathToFileURL(f).href, { headers: req.headers }); // forwards Range for video seeking
    }
    return new Response('not found', { status: 404 });
  });
  // music-reactive wallpaper: system sound ("loopback", Windows only), and only for the wallpaper page
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    const fromWallpaper = (req.frame?.url || '').startsWith(ui('wallpaper.html'));
    if (!fromWallpaper || !win32.isWin) return cb({});
    desktopCapturer.getSources({ types: ['screen'] }).then((src) => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({}));
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
  if (store.get().dock.on) setDock(true);
  if (!fs.existsSync(store.file) && !process.argv.includes('--smoke')) openSettings(); // first run: show what can be customized
  // --smoke: start, run for a while, print diagnostics and quit (used by the Windows test run)
  if (process.argv.includes('--smoke')) setTimeout(() => { console.log('SMOKE ' + JSON.stringify(diagnostics())); app.quit(); }, 15000);
});
app.on('second-instance', () => openSettings());
app.on('before-quit', () => {
  app.isQuitting = true;
  try { store?.flush(); } catch {}
  if (store?.get().general.hideDesktopIcons) win32.setDesktopIcons(true); // give the icons back
  if (dockWin && win32.isWin) { win32.releaseEdge(dockWin); win32.setTaskbarAutoHide(!!store.get().dock.prevAutoHide); } // and the taskbar
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {}); // keep running in the tray
