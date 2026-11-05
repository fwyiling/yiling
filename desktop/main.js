// Syndicates Desktop – animated wallpaper + desktop widgets + a Home panel for Windows.
const { app, BrowserWindow, Tray, Menu, Notification, screen, ipcMain, globalShortcut, shell, dialog, protocol, net, powerMonitor, nativeImage, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./settings-store');
const system = require('./system');
const win32 = require('./win32');
const media = require('./media');
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
let store, tray, homeWin = null, settingsWin = null, dockWin = null, islandWin = null, paused = false, userPaused = false;
let gamer = false, gamerAuto = false; // gamer mode: everything of ours out of the way and idle
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
const displaysChanged = () => { clearTimeout(displayTimer); displayTimer = setTimeout(() => { buildWallpapers(); placeTopbar(); placeDock(); placeIsland(); }, 800); };

// pause when a full-screen app is in front, or on battery
// Lively's default: nobody sees the wallpaper behind a maximized window, so don't spend CPU/GPU drawing it
function wallpaperCovered() {
  if (!win32.isWin || screen.getAllDisplays().length > 1) return false; // with several screens the others may still show it
  const fg = win32.foregroundRect(ownPids()); if (!fg) return false;
  const wa = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
  const ix = Math.max(0, Math.min(fg.x + fg.width, wa.x + wa.width) - Math.max(fg.x, wa.x)), iy = Math.max(0, Math.min(fg.y + fg.height, wa.y + wa.height) - Math.max(fg.y, wa.y));
  return ix * iy >= wa.width * wa.height * 0.97;
}
function checkPause() {
  keepIslandAtTop(); // also without the top bar: the taskbar coming and going moves it
  const g = store.get().general;
  const displays = screen.getAllDisplays().map((d) => (win32.isWin ? screen.dipToScreenRect(null, d.bounds) : d.bounds));
  const auto = (g.pauseOnFullscreen && win32.fullscreenAppRunning(displays)) || (g.pauseOnBattery && powerMonitor.isOnBatteryPower())
    || (g.pauseWhenCovered && wallpaperCovered());
  if (g.autoGamer !== false && win32.isWin) { // a full-screen game or video: gamer mode by itself, and off again afterwards
    const full = win32.fullscreenAppRunning(displays);
    if (full && !gamer) setGamer(true, true); else if (!full && gamer && gamerAuto) setGamer(false);
  }
  const next = userPaused || gamer || auto;
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
// the Home panel is closed (memory freed) after 3 minutes unused; it opens again in a moment when called
let homeRelease = null;
function scheduleHomeRelease() {
  clearTimeout(homeRelease);
  homeRelease = setTimeout(() => { if (homeWin && !homeWin.isDestroyed() && !homeWin.isVisible()) { homeWin.destroy(); homeWin = null; } }, 3 * 60e3);
}
function toggleHome(force, mode = '') {
  const show = force ?? !(homeWin && homeWin.isVisible());
  if (!show) { homeWin?.hide(); scheduleHomeRelease(); return; }
  clearTimeout(homeRelease);
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!homeWin || homeWin.isDestroyed()) {
    homeWin = new BrowserWindow({
      ...d.bounds, frame: false, transparent: true, show: false, skipTaskbar: true, resizable: false, alwaysOnTop: true,
      backgroundColor: '#00000000', title: 'Syndicates Home', webPreferences: webPrefs,
    });
    homeWin.setMenu(null);
    homeWin.loadURL(ui('home.html'));
    homeWin.on('blur', () => { homeWin?.hide(); scheduleHomeRelease(); });
    homeWin.on('closed', () => { homeWin = null; });
    homeWin.once('ready-to-show', () => { homeWin.setBounds(d.bounds); homeWin.show(); homeWin.focus(); if (mode) setTimeout(() => homeWin?.webContents.send('home-shown', mode), 400); });
    return;
  }
  homeWin.setBounds(d.bounds);
  homeWin.show(); homeWin.focus();
  homeWin.webContents.send('home-shown', mode);
}

const hotkeyStatus = { switchKeys: false };
let lastSwitch = null;
function registerHotkey() {
  globalShortcut.unregisterAll();
  const key = store.get().home.hotkey;
  const reg = (k, fn) => { try { return !!k && globalShortcut.register(k, fn); } catch (e) { console.warn('bad hotkey', k, e.message); return false; } };
  // Alt+Space is also Windows' window menu and PowerToys Run's key; fall back if something else owns it
  if (!reg(key, () => toggleHome()) && !reg('Alt+Shift+Space', () => toggleHome())) console.warn('hotkey in use:', key);
  reg('Ctrl+Alt+S', () => openSettings()); // Customize from anywhere
  // bind a three-finger swipe to these in Windows' touchpad settings for MacBook-style switching
  const right = reg('Ctrl+Alt+Shift+Right', () => switchApp(1, 'gesture')), left = reg('Ctrl+Alt+Shift+Left', () => switchApp(-1, 'gesture'));
  hotkeyStatus.switchKeys = right && left;
  if (!hotkeyStatus.switchKeys) console.warn('[switch] Ctrl+Alt+Shift+Left/Right is taken by another app');
  reg('Ctrl+Alt+T', () => openIslandTimer()); // the timer, from anywhere
  reg('Ctrl+Alt+G', () => setGamer(!gamer)); // gamer mode
}

// ---------- settings window ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    // Windows won't let a background app take the foreground; briefly topmost brings it up anyway
    settingsWin.show(); settingsWin.setAlwaysOnTop(true); settingsWin.focus(); settingsWin.setAlwaysOnTop(false);
    return;
  }
  settingsWin = new BrowserWindow({ width: 1180, height: 800, minWidth: 900, minHeight: 620, title: 'Syndicates Desktop', backgroundColor: '#0f1216', icon: icon(), webPreferences: webPrefs, autoHideMenuBar: true });
  settingsWin.setMenu(null);
  settingsWin.loadURL(ui('settings.html'));
  settingsWin.once('ready-to-show', () => { settingsWin.show(); settingsWin.focus(); });
}

// ---------- Syndicates dock (replaces the look of the taskbar) ----------
const DOCK_H = { s: 52, m: 64, l: 78 }, DOCK_HEADROOM = 46;
let dockShown = true, dockHideTimer = null, dockMouseInside = false, dockBlocked = false, dockTick = 0;
// 'smart': hides only when the window in front would be covered; 'always': until the mouse hits the bottom edge; 'never'
const dockHideMode = (dk) => (['smart', 'always', 'never'].includes(dk.hide) ? dk.hide : dk.autohide === false ? 'never' : 'smart');
// Auto-hide (like Seelen UI's dock and macOS): out of sight until the mouse touches the bottom edge of the screen.
function setDockShown(show) {
  if (!dockWin || dockWin.isDestroyed() || show === dockShown) return;
  dockShown = show;
  if (!show) { dockMouseInside = false; dockWin.setIgnoreMouseEvents(true, { forward: true }); }
  dockWin.webContents.send('dock-shown', show);
}
function dockEdgeCheck() {
  if (!dockWin || dockWin.isDestroyed() || gamer) return;
  const dk = store.get().dock, mode = dockHideMode(dk);
  if (mode === 'never') { setDockShown(true); return; }
  const d = screen.getPrimaryDisplay(), p = screen.getCursorScreenPoint();
  const onDisplay = p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width;
  const bottom = d.bounds.y + d.bounds.height, h = DOCK_H[dk.size] || DOCK_H.m;
  // smart (intellihide, as in Dash to Dock and Plank): stay up unless the window in front would be covered
  if (mode === 'smart' && ++dockTick % 4 === 0) {
    const fg = win32.isWin ? win32.foregroundRect(ownPids()) : null;
    const band = screen.dipToScreenRect(null, { x: d.bounds.x, y: bottom - h - 8, width: d.bounds.width, height: h + 8 });
    dockBlocked = !!fg && fg.x < band.x + band.width && fg.x + fg.width > band.x && fg.y + fg.height > band.y + 4 && fg.y < band.y + band.height;
  }
  if (mode === 'smart' && !dockBlocked) { clearTimeout(dockHideTimer); dockHideTimer = null; setDockShown(true); return; }
  if (onDisplay && p.y >= bottom - 2) {
    clearTimeout(dockHideTimer); dockHideTimer = null;
    if (!dockShown && !(win32.isWin && win32.fullscreenAppRunning([screen.dipToScreenRect(null, d.bounds)]))) setDockShown(true); // not over games / full-screen video
  } else if (dockShown && !dockMouseInside && p.y < bottom - h - 12 && !dockHideTimer) {
    dockHideTimer = setTimeout(() => { dockHideTimer = null; setDockShown(false); }, 650);
  } else if (dockMouseInside) { clearTimeout(dockHideTimer); dockHideTimer = null; }
}
let windowsList = [], dockTimer = null, dockEdgeTimer = null, taskbarTimer = null;
function ownPids() { return [process.pid, ...app.getAppMetrics().map((m) => m.pid)]; }
function placeDock() {
  if (!dockWin || dockWin.isDestroyed()) return;
  const dk = store.get().dock, d = screen.getPrimaryDisplay(), h = DOCK_H[dk.size] || DOCK_H.m;
  const strip = { x: d.bounds.x, y: d.bounds.y + d.bounds.height - h, width: d.bounds.width, height: h };
  // the window is taller than the dock: room above it for magnified icons and tooltips (clicks pass through there)
  const win = { ...strip, y: strip.y - DOCK_HEADROOM, height: h + DOCK_HEADROOM };
  if (win32.isWin) win32.releaseEdge(dockWin);
  if (win32.isWin && dk.reserve && dockHideMode(dk) === 'never') win32.reserveEdge(dockWin, screen.dipToScreenRect(null, strip), 'bottom'); // maximized windows stop above it
  dockWin.setBounds(win);
  dockWin.webContents.send('dock-shown', dockShown);
}
// hide the Windows taskbar (the dock replaces it), but never while Task View, Start or another Windows
// overlay is open: hiding it then would close that overlay again
let overlayAt = 0;
function hideTaskbar() {
  if (!win32.isWin) return;
  if (win32.systemOverlayActive()) { overlayAt = Date.now(); return; }
  if (Date.now() - overlayAt < 1200) return; // just after Task View / a desktop switch: let Windows finish first
  if (win32.taskbarVisible()) win32.showTaskbar(false);
}

// one shared list of open windows for the dock and the top bar, at most once a second
let windowsAt = 0, windowsKey = '';
function currentWindows(maxAge = 900) {
  if (Date.now() - windowsAt > maxAge) { windowsList = win32.isWin ? win32.listWindows(ownPids()) : []; windowsAt = Date.now(); }
  return windowsList;
}
async function pollWindows(fresh = false) {
  if (!dockWin || dockWin.isDestroyed() || app.isQuitting || gamer) return; // never hide the taskbar again once quitting has begun
  hideTaskbar(); // Explorer brings it back now and then (Start menu, display changes)
  if (!store.get().dock.running) return;
  const list = currentWindows(fresh ? 0 : 900);
  const key = list.map((w) => `${w.hwnd}${w.active ? '*' : ''}${w.title}`).join('|');
  if (key !== windowsKey) { windowsKey = key; dockWin.webContents.send('windows', list); } // redraw the dock only when something changed
}
async function setDock(on) {
  const st = store.get();
  if (on && (!dockWin || dockWin.isDestroyed())) {
    if (win32.isWin && st.dock.prevAutoHide == null) store.set({ dock: { prevAutoHide: win32.taskbarAutoHide() } });
    if (win32.isWin) { win32.setTaskbarAutoHide(true); win32.showTaskbar(false); } // one bottom bar: the Windows taskbar goes away while the dock is on
    dockShown = dockHideMode(st.dock) !== 'always';
    dockWin = new BrowserWindow({ width: 800, height: 64 + DOCK_HEADROOM, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Syndicates Dock', webPreferences: webPrefs });
    dockWin.setAlwaysOnTop(true, 'pop-up-menu');
    dockWin.loadURL(ui('dock.html'));
    dockWin.once('ready-to-show', () => { win32.makeToolWindow(dockWin); placeDock(); dockWin.showInactive(); pollWindows(); }); // tool window: on every virtual desktop
    // clicks pass through the transparent strip around the floating pill to the windows behind it
    dockWin.setIgnoreMouseEvents(true, { forward: true });
    dockWin.on('closed', () => { dockWin = null; });
    clearInterval(dockTimer); dockTimer = setInterval(pollWindows, 1000);
    clearInterval(dockEdgeTimer); dockEdgeTimer = setInterval(dockEdgeCheck, 60);
    clearInterval(taskbarTimer); taskbarTimer = setInterval(() => { if (!gamer && !app.isQuitting) hideTaskbar(); }, 300); // cheap: one window lookup
  } else if (!on && dockWin) {
    clearInterval(dockTimer); clearInterval(dockEdgeTimer); clearInterval(taskbarTimer);
    if (win32.isWin) { win32.releaseEdge(dockWin); win32.showTaskbar(true); win32.setTaskbarAutoHide(!!st.dock.prevAutoHide); }
    store.set({ dock: { prevAutoHide: null } });
    dockWin.destroy(); dockWin = null;
  }
}

// ---------- gamer mode ----------
// Wallpaper paused, top bar / dock / island hidden (their screen edges given back), no background polling,
// the Windows taskbar back (auto-hidden) so Start still works. Ctrl+Alt+G, the tray, the top bar menu, or
// automatically while a full-screen game runs.
function setGamer(on, auto = false) {
  if (on === gamer) return;
  gamer = on; gamerAuto = on && auto;
  for (const w of [dockWin, topWin, islandWin]) {
    if (!w || w.isDestroyed()) continue;
    if (on) { if (win32.isWin) win32.releaseEdge(w); w.hide(); } else w.showInactive();
  }
  if (on) { media.pause(); if (dockWin && win32.isWin) win32.showTaskbar(true); }
  else { media.resume(); placeTopbar(); placeDock(); pollWindows(true); }
  checkPause();
  broadcast('gamer', gamer);
  updateTray();
  if (!auto && Notification.isSupported()) new Notification({ title: on ? 'Gamer mode on' : 'Gamer mode off', body: on ? 'Wallpaper paused, bars hidden. Ctrl+Alt+G to turn it off.' : 'Everything is back.', silent: true }).show();
}

// ---------- timer (shown in the island) ----------
// Lives here, not in a page, so it keeps counting whatever happens to the windows.
let timer = { state: 'idle', duration: 0, endAt: 0, left: 0 }, timerDone = null;
function timerSet(next) {
  timer = { ...timer, ...next };
  clearTimeout(timerDone);
  if (timer.state === 'running') timerDone = setTimeout(timerFinish, Math.max(0, timer.endAt - Date.now()));
  broadcast('timer', timer);
  return timer;
}
function timerFinish() {
  timerSet({ state: 'done', left: 0, endAt: Date.now() });
  if (Notification.isSupported()) new Notification({ title: "Time's up", body: `Your ${fmtDuration(timer.duration)} timer has finished.` }).show(); // seen even in a game
}
const fmtDuration = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min` : sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`);
const timerLeft = () => (timer.state === 'running' ? Math.max(0, timer.endAt - Date.now()) / 1000 : timer.left);
const TIMER_ACTIONS = {
  start: (sec) => { sec = Math.max(1, Math.min(24 * 3600, Math.round(Number(sec) || 0))); return timerSet({ state: 'running', duration: sec, endAt: Date.now() + sec * 1000, left: sec }); },
  pause: () => (timer.state === 'running' ? timerSet({ state: 'paused', left: timerLeft() }) : timer),
  resume: () => (timer.state === 'paused' ? timerSet({ state: 'running', endAt: Date.now() + timer.left * 1000 }) : timer),
  add: (sec) => {
    sec = Math.round(Number(sec) || 60);
    if (timer.state === 'running') return timerSet({ endAt: timer.endAt + sec * 1000, duration: timer.duration + sec });
    if (timer.state === 'paused') return timerSet({ left: timer.left + sec, duration: timer.duration + sec });
    return TIMER_ACTIONS.start(sec);
  },
  reset: () => timerSet({ state: 'idle', duration: 0, endAt: 0, left: 0 }),
};

// ---------- MacBook-style switching: straight to the next / previous app, no picker ----------
// Apps keep a stable left-to-right order (the order they were first seen, like Spaces on a Mac), so
// swiping right then left always comes back to where you were.
const appOrder = [];
function switchApp(dir, via = 'dock') {
  lastSwitch = { at: new Date().toISOString(), via, dir };
  if (!win32.isWin) return;
  const list = win32.listWindows(ownPids());
  const groups = new Map();
  for (const w of list) { const k = (w.exe || String(w.hwnd)).toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); if (!appOrder.includes(k)) appOrder.push(k); }
  const keys = appOrder.filter((k) => groups.has(k));
  if (keys.length < 2) { lastSwitch.note = 'fewer than two apps open'; return; }
  const cur = keys.findIndex((k) => groups.get(k).some((w) => w.active));
  const next = keys[((cur < 0 ? 0 : cur) + dir + keys.length) % keys.length];
  const ok = win32.focusWindow(groups.get(next)[0].hwnd, false); // its most recent window
  lastSwitch.to = next.split('\\').pop(); lastSwitch.ok = ok !== false;
  setTimeout(() => pollWindows(true), 150);
}

// ---------- top bar (like the macOS menu bar) ----------
const TOP_H = 24; // the macOS menu bar's height
let topWin = null, topTimer = null, topApp = '', lastDesk = -1;
function placeTopbar() {
  if (!topWin || topWin.isDestroyed()) return;
  const d = screen.getPrimaryDisplay(), strip = { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: TOP_H };
  topWin.setBounds(strip);
  if (win32.isWin) {
    const phys = screen.dipToScreenRect(null, strip);
    win32.releaseEdge(topWin); win32.reserveEdge(topWin, phys, 'top'); // maximized windows start below it
    win32.placeWindow(topWin, phys); // and the bar itself stays ON the reserved strip (it used to be pushed below it)
  }
}
// Windows may push the bar into the work area when the screen or taskbar changes; put it back
function keepTopbarAtTop() {
  if (!win32.isWin || !topWin || topWin.isDestroyed()) return;
  const want = screen.dipToScreenRect(null, { ...screen.getPrimaryDisplay().bounds, height: TOP_H }), r = win32.windowRect(topWin);
  if (r && (r.y !== want.y || r.x !== want.x || r.height !== want.height)) win32.placeWindow(topWin, { x: want.x, y: want.y, width: want.width, height: want.height });
}
const prettyExe = (exe) => { const n = path.basename(exe || '', '.exe'); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; };
function topbarTick() {
  if (!topWin || topWin.isDestroyed() || gamer) return;
  const d = screen.getPrimaryDisplay();
  const full = win32.isWin && win32.fullscreenAppRunning([screen.dipToScreenRect(null, d.bounds)]);
  if (full && topWin.isVisible()) topWin.hide(); else if (!full && !topWin.isVisible()) topWin.showInactive(); // out of the way of games and video
  keepTopbarAtTop(); keepIslandAtTop();
  const fg = currentWindows().find((w) => w.active);
  const name = fg ? (apps || []).find((a) => a.exe && a.exe.toLowerCase() === fg.exe.toLowerCase())?.name || prettyExe(fg.exe) : 'Desktop';
  const vd = win32.isWin ? win32.virtualDesktops() : { count: 1, current: 0 }, key = `${name}|${vd.count}|${vd.current}`;
  if (vd.current !== lastDesk) { lastDesk = vd.current; checkPause(); } // a new desktop: resume the wallpaper at once if nothing covers it
  if (key !== topApp) { topApp = key; topWin.webContents.send('topbar', { app: name, desks: vd }); }
}
function setTopbar(on) {
  if (on && (!topWin || topWin.isDestroyed())) {
    topWin = new BrowserWindow({ width: 800, height: TOP_H, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Syndicates Top Bar', webPreferences: webPrefs });
    topWin.setAlwaysOnTop(true, 'pop-up-menu');
    topWin.loadURL(ui('topbar.html'));
    topWin.once('ready-to-show', () => { win32.makeToolWindow(topWin); placeTopbar(); topWin.showInactive(); topApp = ''; topbarTick(); });
    topWin.on('closed', () => { topWin = null; });
    clearInterval(topTimer); topTimer = setInterval(topbarTick, 1000);
  } else if (!on && topWin) {
    clearInterval(topTimer);
    if (win32.isWin) win32.releaseEdge(topWin);
    topWin.destroy(); topWin = null;
  }
}
function topbarMenu(x, y) {
  Menu.buildFromTemplate([
    { label: `Open Home  (${store.get().home.hotkey})`, click: () => toggleHome(true) },
    { label: 'Customize…  (Ctrl+Alt+S)', click: openSettings },
    { type: 'separator' },
    { label: 'Timer  (Ctrl+Alt+T)', click: openIslandTimer },
    { label: 'Gamer mode  (Ctrl+Alt+G)', type: 'checkbox', checked: gamer, click: () => setGamer(!gamer) },
    { label: 'New desktop  (Win+Ctrl+D)', click: () => win32.pressKeys([0x5B, 0x11, 0x44]) },
    { label: 'Show desktop', click: () => win32.pressKeys([0x5B, 0x44]) },
    { label: 'Windows Settings', click: () => shell.openExternal('ms-settings:') },
    { label: 'Task Manager', click: () => win32.pressKeys([0x11, 0x10, 0x1B]) },
    { type: 'separator' },
    { label: 'Lock', click: () => win32.lock() },
  ]).popup({ window: topWin, x, y });
}

// ---------- the island (a Dynamic-Island-style pill at the top: timer, now playing) ----------
// After DynamicWin (Windows) and boring.notch (macOS): a transparent window at the top centre; only the pill takes clicks.
const ISLAND = { w: 480, h: 320 };
function islandRect() { const d = screen.getPrimaryDisplay(); return { x: Math.round(d.bounds.x + (d.bounds.width - ISLAND.w) / 2), y: d.bounds.y, width: ISLAND.w, height: ISLAND.h }; }
function placeIsland() {
  if (!islandWin || islandWin.isDestroyed()) return;
  islandWin.setBounds(islandRect());
  if (win32.isWin) win32.placeWindow(islandWin, screen.dipToScreenRect(null, islandRect())); // Windows pushes it below the top bar otherwise
}
// Windows moves it whenever the taskbar / top bar change the work area; put it back on the top edge
function keepIslandAtTop() {
  if (!win32.isWin || !islandWin || islandWin.isDestroyed() || gamer) return;
  const want = screen.dipToScreenRect(null, islandRect()), r = win32.windowRect(islandWin);
  if (r && (r.y !== want.y || r.x !== want.x)) win32.placeWindow(islandWin, want);
}
function setIsland(on) {
  if (on && (!islandWin || islandWin.isDestroyed())) {
    islandWin = new BrowserWindow({ ...ISLAND, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Syndicates Island', webPreferences: webPrefs });
    islandWin.setAlwaysOnTop(true, 'screen-saver'); // above the top bar
    islandWin.setIgnoreMouseEvents(true, { forward: true });
    islandWin.loadURL(ui('island.html'));
    islandWin.once('ready-to-show', () => { win32.makeToolWindow(islandWin); placeIsland(); if (!gamer) islandWin.showInactive(); });
    islandWin.on('closed', () => { islandWin = null; });
  } else if (!on && islandWin) { islandWin.destroy(); islandWin = null; }
}

// the timer from the top bar, its menu or Ctrl+Alt+T: open the island on its timer
function openIslandTimer() {
  if (!islandWin || islandWin.isDestroyed()) { applySettings({ island: { on: true } }); setTimeout(openIslandTimer, 900); return; }
  if (gamer) setGamer(false);
  islandWin.webContents.send('island-open', 'timer');
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
    { label: 'Gamer mode  (Ctrl+Alt+G)', type: 'checkbox', checked: gamer, click: () => setGamer(!gamer) },
    { type: 'separator' },
    { label: 'Pause wallpaper', type: 'checkbox', checked: userPaused, click: (i) => { userPaused = i.checked; checkPause(); } },
    { label: 'Hide desktop icons', type: 'checkbox', checked: g.hideDesktopIcons, enabled: win32.isWin, click: (i) => applySettings({ general: { hideDesktopIcons: i.checked } }) },
    { label: 'Start with Windows', type: 'checkbox', checked: g.startWithWindows, click: (i) => applySettings({ general: { startWithWindows: i.checked } }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ---------- start with Windows ----------
// Register the program that should really start: the installed exe, the portable exe itself (not the
// temporary copy it runs from), or Electron plus this folder when started from source (start.bat).
function setAutostart(on) {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = app.isPackaged ? ['--autostart'] : [app.getAppPath(), '--autostart'];
  app.setLoginItemSettings({ openAtLogin: !!on, path: exe, args });
}

// ---------- settings changes ----------
function applySettings(patch) {
  const before = store.get();
  const next = store.set(patch);
  if (patch.home?.hotkey !== undefined && patch.home.hotkey !== before.home.hotkey) registerHotkey();
  if (patch.general?.startWithWindows !== undefined) setAutostart(next.general.startWithWindows);
  if (patch.general?.hideDesktopIcons !== undefined) win32.setDesktopIcons(!next.general.hideDesktopIcons);
  if (patch.topbar?.on !== undefined) setTopbar(next.topbar.on);
  if (patch.island?.on !== undefined) setIsland(next.island.on);
  if (patch.dock) { if (patch.dock.on !== undefined) setDock(next.dock.on); else { placeDock(); dockEdgeCheck(); } }
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
    paused, gamer, switchKeys: hotkeyStatus.switchKeys, lastSwitch, dock: !!dockWin, topbar: !!topWin, island: !!islandWin, taskbarVisible: win32.taskbarVisible(), media: { ...media.get(), art: media.get().art ? '(image)' : '' }, log: recentLog.slice(-20),
  };
}

// ---------- big app icons ----------
// Electron's getFileIcon tops out at 32-48 px, which looks soft when the dock magnifies icons. This reads the
// 256 px icon from the program itself (following shortcuts to their icon file), scaled to 128 px.
const iconCache = new Map();
function bigIcon(p) {
  if (!win32.isWin) return '';
  if (iconCache.has(p)) return iconCache.get(p);
  let file = p, index = 0;
  if (/\.lnk$/i.test(p)) {
    try { const l = shell.readShortcutLink(p); if (l.icon) { file = l.icon; index = l.iconIndex || 0; } else file = l.target || ''; } catch { file = ''; }
  }
  file = file.replace(/%([^%]+)%/g, (_m, v) => process.env[v] || '');
  let url = '';
  const winDir = (process.env.SystemRoot || 'C:\\Windows').toLowerCase() + '\\';
  if (file.toLowerCase().startsWith(winDir)) { iconCache.set(p, ''); return ''; } // Windows' own apps: their usual icon looks right
  if (/\.(exe|dll|ico)$/i.test(file)) {
    const px = win32.iconPixels(file, index, 256);
    if (px) url = nativeImage.createFromBitmap(px.data, { width: px.width, height: px.height }).resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
  }
  iconCache.set(p, url);
  return url;
}
// what a shortcut really starts, so a .lnk to a script or an icon-less app gets a clean letter tile, not a blank page
const PINNABLE = /\.(exe|lnk|url|bat|cmd|appref-ms|msc|py|pyw|ps1|vbs|jar)$/i;
function addPin(p, name) {
  const pins = store.get().home.pins.filter((x) => x.path !== p);
  return applySettings({ home: { pins: [...pins, { name: name || path.basename(p).replace(/\.[^.]+$/, ''), path: p }] } });
}
async function iconFor(p, size) {
  const pin = store.get().home.pins.find((x) => x.path === p);
  if (pin?.icon && fs.existsSync(pin.icon)) { // an icon you picked yourself
    if (/\.(exe|dll)$/i.test(pin.icon)) { const u = bigIcon(pin.icon); if (u) return u; }
    const img = nativeImage.createFromPath(pin.icon);
    if (!img.isEmpty()) return img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
  }
  if (/\.lnk$/i.test(p) && win32.isWin) {
    try {
      const l = shell.readShortcutLink(p);
      const isDir = (() => { try { return fs.statSync(l.target).isDirectory(); } catch { return false; } })();
      if (!l.icon && l.target && !isDir && !/\.(exe|ico|dll)$/i.test(l.target)) return '';
    } catch {}
  }
  if (/\.(bat|cmd|py|pyw|ps1|vbs|jar)$/i.test(p)) return ''; // scripts: Windows' icon for them is a blank page
  const e = appEntry(p);
  if (e?.logo) { const img = nativeImage.createFromPath(e.logo); if (!img.isEmpty()) return img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL(); }
  if (e?.exe) return bigIcon(e.exe) || (await app.getFileIcon(e.exe, { size }).then((i) => i.toDataURL()).catch(() => ''));
  if (p.startsWith('shell:')) return '';
  return bigIcon(p) || (await app.getFileIcon(p, { size }).then((i) => i.toDataURL()).catch(() => ''));
}

// ---------- IPC ----------
const httpOnly = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
function wireIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (_e, patch) => applySettings(patch));
  ipcMain.handle('paused', () => paused);
  ipcMain.handle('stats', () => system.stats());
  ipcMain.handle('weather', (_e, city) => system.weather(city));
  ipcMain.handle('books', (_e, q) => system.books(q));
  ipcMain.handle('github-repos', (_e, user) => system.githubRepos(user));
  // Places: what the desktop icons were for, so they can be hidden without losing anything
  ipcMain.handle('places:open', (_e, key) => {
    const PLACES = { pc: 'shell:MyComputerFolder', home: app.getPath('home'), downloads: app.getPath('downloads'), documents: app.getPath('documents'), recycle: 'shell:RecycleBinFolder' };
    const p = PLACES[key];
    if (!p) throw new Error('unknown place');
    toggleHome(false);
    if (p.startsWith('shell:')) { if (win32.isWin) require('child_process').spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref(); return true; }
    return shell.openPath(p);
  });
  ipcMain.handle('apps', () => { apps ||= system.listApps(); refreshApps(); return apps; }); // answers at once; the full list follows as 'apps'
  ipcMain.handle('app-icon', async (_e, p) => {
    if (!isKnownApp(p)) return '';
    return iconFor(p, 'large');
  });
  // only launch things that came from the Start menu or that you pinned yourself
  ipcMain.handle('launch', (_e, p) => { if (!isKnownApp(p)) throw new Error('unknown app'); toggleHome(false); return launchApp(p); });
  ipcMain.handle('open', (_e, url) => { if (!httpOnly(url)) throw new Error('only web links'); toggleHome(false); return shell.openExternal(url); });
  ipcMain.handle('pick-file', async (e, kind) => {
    const filters = kind === 'video' ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'mov'] }]
      : kind === 'app' ? [{ name: 'Apps and shortcuts', extensions: ['exe', 'lnk', 'url', 'bat'] }]
      : [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }];
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('home:toggle', (_e, show, mode) => toggleHome(show, mode === 'pin' ? 'pin' : ''));
  ipcMain.handle('diagnostics', () => diagnostics());
  ipcMain.handle('taskbar:get', () => taskbar.read());
  ipcMain.handle('taskbar:set', (_e, patch) => taskbar.apply(patch));
  ipcMain.handle('gestures:get', () => taskbar.gestures());
  ipcMain.handle('gestures:mac', () => taskbar.setThreeFingerDesktops());
  ipcMain.handle('lock:apply', () => applyLockScreen());
  ipcMain.handle('windows-settings', (_e, page) => { // only these Settings pages
    const pages = { colors: 'ms-settings:colors', lockscreen: 'ms-settings:lockscreen', taskbar: 'ms-settings:taskbar', background: 'ms-settings:personalization-background', touchpad: 'ms-settings:devices-touchpad' };
    if (!pages[page]) throw new Error('unknown page');
    return shell.openExternal(pages[page]);
  });
  ipcMain.handle('windows', () => windowsList);
  ipcMain.handle('window:focus', (_e, hwnd, toggle = true) => { if (!windowsList.some((w) => w.hwnd === hwnd)) throw new Error('unknown window'); win32.focusWindow(hwnd, toggle !== false); setTimeout(() => pollWindows(true), 150); });
  ipcMain.handle('exe-icon', async (_e, exe) => {
    if (!windowsList.some((w) => w.exe === exe)) return '';
    return iconFor(exe, 'large');
  });
  ipcMain.handle('pin-target', (_e, p) => { // what a pinned shortcut points at, to match it with open windows
    if (!isKnownApp(p)) return '';
    if (appEntry(p)?.exe) return appEntry(p).exe;
    if (!/\.lnk$/i.test(p) || process.platform !== 'win32') return p;
    try { return shell.readShortcutLink(p).target || p; } catch { return p; }
  });
  ipcMain.on('dock:mouse', (e, inside) => {
    if (!dockWin || e.sender !== dockWin.webContents || !dockShown) return;
    dockMouseInside = !!inside;
    dockWin.setIgnoreMouseEvents(!inside, { forward: true });
  });
  // the dock's Start / quick settings / notifications buttons press the Windows shortcuts for them
  const DOCK_KEYS = { start: [0x5B], quick: [0x5B, 0x41], notifications: [0x5B, 0x4E] }; // Win, Win+A, Win+N
  ipcMain.handle('dock:state', () => dockShown);
  ipcMain.handle('switch-app', (e, dir) => { if (dockWin && e.sender === dockWin.webContents) switchApp(dir > 0 ? 1 : -1); });
  ipcMain.handle('battery', () => win32.battery());
  ipcMain.on('island:mouse', (e, inside) => { if (islandWin && e.sender === islandWin.webContents) islandWin.setIgnoreMouseEvents(!inside, { forward: true }); });
  ipcMain.handle('timer:get', () => timer);
  ipcMain.handle('timer', (_e, action, arg) => { if (!TIMER_ACTIONS[action]) throw new Error('unknown timer action'); return TIMER_ACTIONS[action](arg); });
  ipcMain.handle('switch:test', () => { switchApp(1, 'test'); return { ...hotkeyStatus, lastSwitch }; });
  ipcMain.handle('switch:status', () => ({ ...hotkeyStatus, lastSwitch }));
  ipcMain.handle('gamer', (_e, on) => { setGamer(on === undefined ? !gamer : !!on); return gamer; });
  ipcMain.handle('topbar:menu', (e, x, y) => { if (topWin && e.sender === topWin.webContents) topbarMenu(x, y); });
  // click a desktop dot: step there with Win+Ctrl+Left/Right (Windows' own switch, with its slide animation)
  ipcMain.handle('topbar:desk', async (e, target) => {
    if (!topWin || e.sender !== topWin.webContents || !win32.isWin) return;
    const vd = win32.virtualDesktops(), steps = Math.max(-9, Math.min(9, Math.round(target) - vd.current));
    for (let i = 0; i < Math.abs(steps); i++) { win32.pressKeys([0x5B, 0x11, steps > 0 ? 0x27 : 0x25]); await new Promise((r) => setTimeout(r, 260)); }
    topApp = ''; topbarTick();
  });
  ipcMain.handle('topbar:timer', (e) => { if (topWin && e.sender === topWin.webContents) openIslandTimer(); });
  ipcMain.handle('topbar:keys', (e, what) => { const K = { quick: [0x5B, 0x41], notifications: [0x5B, 0x4E] }; if (topWin && e.sender === topWin.webContents && K[what]) win32.pressKeys(K[what]); });
  ipcMain.handle('dock:keys', (e, what) => { if (dockWin && e.sender === dockWin.webContents && DOCK_KEYS[what]) win32.pressKeys(DOCK_KEYS[what]); });
  ipcMain.handle('media:get', () => media.get());
  ipcMain.handle('media:control', (_e, cmd) => media.control(String(cmd)));
  // pin what you dropped on Home (a file you chose by dragging it there)
  // files found by searching Home: those may be launched and pinned too
  ipcMain.handle('files:search', async (_e, q) => { const r = await system.searchFiles(q); for (const f of r) foundFiles.add(f.path); return r; });
  ipcMain.handle('pin:add', (_e, p) => {
    p = String(p || '');
    if (!PINNABLE.test(p) || !fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error('only apps, shortcuts and scripts can be pinned');
    return addPin(p);
  });
  // pin a program that is running, from the dock (handy for apps you made yourself)
  ipcMain.handle('dock:pin', (e, exe) => {
    if (!dockWin || e.sender !== dockWin.webContents) return;
    const w = windowsList.find((x) => x.exe === exe);
    if (!w || !/\.exe$/i.test(exe)) throw new Error('not a running app');
    const name = path.basename(exe, '.exe');
    return addPin(exe, name.charAt(0).toUpperCase() + name.slice(1));
  });
  ipcMain.handle('pin:remove', (_e, p) => applySettings({ home: { pins: store.get().home.pins.filter((x) => x.path !== p) } }));
  ipcMain.handle('pin:icon', async (e, p) => {
    const pins = store.get().home.pins;
    if (!pins.some((x) => x.path === p)) throw new Error('not pinned');
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Choose an icon', properties: ['openFile'], filters: [{ name: 'Icons and pictures', extensions: ['png', 'ico', 'jpg', 'jpeg', 'webp', 'exe', 'dll'] }] });
    if (r.canceled) return store.get();
    iconCache.delete(p);
    return applySettings({ home: { pins: pins.map((x) => (x.path === p ? { ...x, icon: r.filePaths[0] } : x)) } });
  });
  ipcMain.handle('pin:reveal', (_e, p) => { if (isKnownApp(p) && !p.startsWith('shell:')) shell.showItemInFolder(p); });
  ipcMain.handle('settings:open', () => { toggleHome(false); openSettings(); });
}
function isKnownApp(p) {
  if (typeof p !== 'string' || !p) return false;
  const known = foundFiles.has(p) || (apps ||= system.listApps()).some((a) => a.path === p);
  return known || store.get().home.pins.some((x) => x.path === p);
}
// the quick shortcut list right away, then everything the Start menu lists (Store apps too); refreshed so new installs appear
let appsAt = 0, appsLoading = null;
const foundFiles = new Set();
function refreshApps(force = false) {
  if (appsLoading || (!force && Date.now() - appsAt < 10 * 60e3)) return appsLoading;
  appsLoading = system.listAppsFull().then((list) => { if (list.length && list.length !== (apps || []).length) { apps = list; if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('apps', apps); } appsAt = Date.now(); }).catch(() => {}).finally(() => { appsLoading = null; });
  return appsLoading;
}
const appEntry = (p) => (apps || []).find((a) => a.path === p) || store.get().home.pins.find((x) => x.path === p);
function launchApp(p) {
  if (p.startsWith('shell:AppsFolder\\')) { // Store and other Start-menu-only apps open the way Start opens them
    if (win32.isWin) require('child_process').spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
    return Promise.resolve('');
  }
  return shell.openPath(p);
}

// ---------- start ----------
app.whenReady().then(() => {
  const firstRun = !fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
  store = new Store(app.getPath('userData'));
  // installed apps keep running across restarts by default (like Lively); switch it off in the tray menu
  if (firstRun && app.isPackaged && !process.argv.includes('--smoke')) store.set({ general: { startWithWindows: true } });
  if (win32.isWin && !process.argv.includes('--smoke')) setAutostart(store.get().general.startWithWindows); // keeps the path current after moving/updating
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
  setTimeout(() => refreshApps(true), 4000); // in the background, after the wallpaper is up
  media.onChange((st) => broadcast('media', st));
  media.start();
  buildWallpapers();
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  powerMonitor.on('on-battery', checkPause);
  powerMonitor.on('on-ac', checkPause);
  setInterval(checkPause, 700); // cheap checks; a new desktop or a closed window resumes the wallpaper quickly
  setInterval(sendCursor, 50);
  registerHotkey();
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.on('click', () => openSettings()); // the tray icon is the obvious way in; Home has its own shortcut and dock button
  updateTray();
  if (store.get().general.hideDesktopIcons) win32.setDesktopIcons(false);
  if (store.get().topbar.on) setTopbar(true);
  if (store.get().island.on) setIsland(true);
  if (store.get().dock.on) setDock(true);
  else if (win32.isWin) win32.showTaskbar(true); // in case a crash left it hidden
  // started by you (shortcut, Start menu): open Customize, like Lively; started with Windows: stay in the tray
  if (!process.argv.includes('--smoke') && !process.argv.includes('--autostart')) openSettings(); // first run: show what can be customized
  // --smoke: start, run for a while, print diagnostics and quit (used by the Windows test run)
  if (process.argv.includes('--smoke')) setTimeout(() => { console.log('SMOKE ' + JSON.stringify(diagnostics())); app.quit(); }, 15000);
});
app.on('second-instance', () => openSettings()); // opening it again while it runs brings Customize to the front
app.on('before-quit', () => {
  app.isQuitting = true;
  for (const t of [dockTimer, dockEdgeTimer, topTimer, taskbarTimer]) clearInterval(t); // nothing may hide the taskbar after this
  media.stop();
  try { store?.flush(); } catch {}
  if (store?.get().general.hideDesktopIcons) win32.setDesktopIcons(true); // give the icons back
  if (topWin && win32.isWin) win32.releaseEdge(topWin);
  if (dockWin && win32.isWin) { win32.releaseEdge(dockWin); win32.showTaskbar(true); win32.setTaskbarAutoHide(!!store.get().dock.prevAutoHide); } // and the taskbar
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (win32.isWin && store?.get().dock.on) win32.showTaskbar(true); // last word: the taskbar is visible when we're gone
});
app.on('window-all-closed', () => {}); // keep running in the tray
