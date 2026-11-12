// Syndicates Desktop – animated wallpaper + desktop widgets + a Home panel for Windows.
const { app, BrowserWindow, Tray, Menu, Notification, screen, ipcMain, globalShortcut, shell, dialog, protocol, net, powerMonitor, nativeImage, session, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./settings-store');
const system = require('./system');
const win32 = require('./win32');
const media = require('./media');
const sysctl = require('./sysctl');
const netpower = require('./netpower');
const vdesk = require('./vdesk');
const themes = require('./themes');
const gallery = require('./gallery');
const systray = require('./tray'); // other programs' tray icons, for the top bar
const winkey = require('./winkey'); // the Windows key opens Home
const updater = require('./updater'); // updates from the desktop-latest release
const clips = require('./clipboard'); // clipboard history, in Home
const goals = require('./goals'); // daily revision / hobby time, in Home and on the desktop
const focus = require('./focus'); // focus mode: distractions nudged (or minimized) while you revise
const shots = require('./shots');
const taskbar = require('./taskbar');
const lockscreen = require('./lockscreen');

// One copy at a time. Started again from the same folder: the running one shows Customize. Started from another
// folder (a newer download unzipped somewhere else): the running copy steps aside and this one takes over, so an
// update never silently keeps the old version running.
const INSTANCE_FILE = () => path.join(app.getPath('userData'), 'instance.json');
const sameDir = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();
if (!app.requestSingleInstanceLock({ appPath: app.getAppPath() })) {
  let other = null; try { other = JSON.parse(fs.readFileSync(INSTANCE_FILE(), 'utf8')); } catch {}
  let ok = false;
  if (other?.appPath && !sameDir(other.appPath, app.getAppPath())) { // wait (up to 10 s) for the other copy to quit
    const nap = new Int32Array(new SharedArrayBuffer(4));
    for (let i = 0; i < 40 && !ok; i++) { Atomics.wait(nap, 0, 0, 250); ok = app.requestSingleInstanceLock({ appPath: app.getAppPath() }); }
  }
  if (!ok) { app.quit(); process.exit(0); }
}
const crashguard = require('./crashguard'); // errors logged instead of fatal, crashed windows reloaded, crash.log
crashguard.init();
// a crashed page in a full-screen window (Home) would leave a blank sheet over everything: hide it straight away
crashguard.onWindowGone((wc) => { if (homeWin && !homeWin.isDestroyed() && wc === homeWin.webContents) homeWin.hide(); });
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
// memory: about ten windows of the app's own pages share four renderer processes instead of one each (hundreds of MB);
// not all in one, so a busy page (Home filling in) never stalls the bars and the island
app.commandLine.appendSwitch('renderer-process-limit', '4');

// sd://ui/<file> serves the app's own pages; sd://media/wallpaper serves only the wallpaper file you picked.
protocol.registerSchemesAsPrivileged([{ scheme: 'sd', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const UI_DIR = path.join(__dirname, 'renderer');
const ui = (page, query = '') => `sd://ui/${page}${query}`;

let displayTimer;
let store, tray, homeWin = null, settingsWin = null, dockWin = null, islandWin = null, paused = false, userPaused = false;
let gamer = false, gamerAuto = false, fullSince = 0, notFullSince = 0, fullSteady = false; // gamer mode: everything of ours out of the way and idle
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
const displaysChanged = () => { clearTimeout(displayTimer); displayTimer = setTimeout(() => { buildWallpapers(); placeTopbar(); placeDock(); placeIsland(); deskWorker?.postMessage(deskWatchSettings()); }, 800); };

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
  const auto = (g.pauseOnFullscreen && win32.fullscreenAppRunning(displays, ownPids())) || (g.pauseOnBattery && powerMonitor.isOnBatteryPower())
    || (g.pauseWhenCovered && wallpaperCovered());
  // a full-screen game or video: gamer mode by itself, and off again afterwards. Only once something has stayed
  // full screen for 3 s: screenshot overlays and other brief full-screen flashes must not flip everything around.
  const full = win32.isWin && win32.fullscreenAppRunning(displays, ownPids());
  fullSince = full ? (fullSince || Date.now()) : 0;
  notFullSince = full ? 0 : (notFullSince || Date.now());
  fullSteady = !!fullSince && Date.now() - fullSince >= 3000;
  const notFullSteady = !!notFullSince && Date.now() - notFullSince >= 3000; // games lose focus for a moment all the time
  if (g.autoGamer !== false && win32.isWin) {
    if (fullSteady && !gamer) setGamer(true, true); else if (notFullSteady && gamer && gamerAuto) setGamer(false);
  }
  const next = userPaused || gamer || auto || overlayOn || !!lowPower;
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
// the Home panel is closed (memory freed) after 15 minutes unused; it opens again in a moment when called
let homeRelease = null;
function scheduleHomeRelease() {
  clearTimeout(homeRelease);
  if (winKeyOn()) return; // it's the Start menu now: kept ready, so the Windows key opens it at once
  homeRelease = setTimeout(() => { if (homeWin && !homeWin.isDestroyed() && !homeWin.isVisible()) { homeWin.destroy(); homeWin = null; } }, 15 * 60e3);
}
// hidden in two steps: the page clears itself first (search, results, the panel faded out), so the next opening
// starts from nothing and plays its one animation, instead of flashing the last frame and then animating again
let homeHideT = 0;
// Home covers the whole screen and stays on top, so it must never trap it: if its page stops answering (no
// heartbeat for 3 s) or crashes, it's hidden at once, and Esc closes it from here too, whatever the page is doing
let homeBeat = 0, homeGuardT = null;
function guardHome(on) {
  clearInterval(homeGuardT); homeGuardT = null;
  try { if (on) globalShortcut.register('Escape', () => { // the page answering: Esc goes to it (clears the search first); not answering: Home goes
    if (homeWin && !homeWin.isDestroyed() && Date.now() - homeBeat < 1200) { homeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); homeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); }
    else hideHome(true);
  }); else if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape'); } catch {}
  if (!on) return;
  homeBeat = Date.now(); crashguard.log('home', 'opened');
  homeGuardT = setInterval(() => {
    if (!homeWin || homeWin.isDestroyed() || !homeWin.isVisible()) { guardHome(false); return; }
    if (Date.now() - homeBeat > 3000) { crashguard.log('home', 'Home stopped answering while open: hidden so it doesn\'t cover the screen'); hideHome(true); }
  }, 500);
}
function hideHome(now) {
  if (!homeWin || homeWin.isDestroyed() || !homeWin.isVisible()) return;
  guardHome(false);
  if (now === true) { homeWin.hide(); try { homeWin.webContents.send('home-hidden'); } catch {} scheduleHomeRelease(); return; }
  homeWin.webContents.send('home-hidden');
  clearTimeout(homeHideT);
  homeHideT = setTimeout(() => { if (homeWin && !homeWin.isDestroyed()) homeWin.hide(); }, 70);
  scheduleHomeRelease();
}
// a pixel short of the whole screen: a topmost window covering the screen exactly is taken by Windows for a full-screen
// game (its own display path, black flashes on some graphics drivers)
const homeRect = (d) => ({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height - 1 });
function toggleHome(force, mode = '') {
  const show = force ?? !(homeWin && homeWin.isVisible());
  if (!show) { hideHome(); return; }
  clearTimeout(homeRelease); clearTimeout(homeHideT);
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!homeWin || homeWin.isDestroyed()) {
    homeWin = new BrowserWindow({
      // solid, not see-through: its backdrop was 90% dark already, and a transparent window the size of the screen (2880x1800
      // at 200%) is a lot for some graphics drivers to blend over the live wallpaper every frame
      ...homeRect(d), frame: false, transparent: false, show: false, skipTaskbar: true, resizable: false, alwaysOnTop: true,
      backgroundColor: '#07090e', title: 'Syndicates Home', webPreferences: webPrefs,
    });
    homeWin.setMenu(null);
    if (win32.isWin) win32.noTransitions(homeWin);
    homeWin.loadURL(ui('home.html'));
    homeWin.on('blur', () => hideHome());
    homeWin.on('closed', () => { homeWin = null; });
    // shown once the page has drawn its content (not on the first empty paint, which looked like loading twice)
    let shown = false;
    const reveal = () => { if (shown || !homeWin || homeWin.isDestroyed()) return; shown = true; homeWin.setBounds(homeRect(d)); homeWin.show(); guardHome(true); homeWin.focus(); if (win32.isWin && !homeWin.isFocused()) win32.focusOwn(homeWin); if (mode) homeWin.webContents.send('home-shown', mode); };
    ipcMain.once('home:ready', reveal);
    setTimeout(reveal, 2500); // in case the page is slow
    return;
  }
  homeWin.setBounds(homeRect(d));
  homeWin.show(); homeWin.focus(); guardHome(true);
  if (win32.isWin && !homeWin.isFocused()) win32.focusOwn(homeWin); // opened by the Windows key: the key went to another program
  homeWin.webContents.send('home-shown', mode);
}
// the Windows key (alone) opens Home, as Seelen UI's Start menu takes it over; Customize > Home switches it off
const winKeyOn = () => win32.isWin && store.get().home.winKey !== false && !process.argv.includes('--smoke');
function syncWinKey() { winkey.use(winKeyOn() ? () => toggleHome() : null); }

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
  reg('Ctrl+Alt+R', () => goals.toggle('revision')); // the revision stopwatch, on / off
  reg('Ctrl+Alt+F', () => focus.set(!focus.isOn(), 'manual')); // focus mode, on / off
  if (store.get().home.clipboard !== false) reg('Alt+Shift+V', () => toggleHome(true, 'clip')); // the clipboard history (Win+V stays Windows')
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
    if (!dockShown && !(win32.isWin && win32.fullscreenAppRunning([screen.dipToScreenRect(null, d.bounds)], ownPids()))) setDockShown(true); // not over games / full-screen video
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
let overlayAt = 0, overlayOn = false, nullSince = 0;
// "nothing in front" is normal on an empty desktop after switching: it only counts as Windows being busy
// (animating) for the first 1.5 s, otherwise the taskbar would stay up on that desktop for good
function overlayNow() {
  const ov = win32.systemOverlayActive();
  if (ov && win32.foregroundNull()) { nullSince ||= Date.now(); return Date.now() - nullSince < 1500; }
  nullSince = 0;
  return ov;
}
function hideTaskbar() {
  if (!win32.isWin) return;
  const ov = overlayNow();
  // pause the wallpaper under Task View, Start and the like; not for the moment in between of a desktop switch
  // ("nothing in front"): frozen during the slide and starting again after it looked choppy
  const covered = ov && !win32.foregroundNull();
  if (covered !== overlayOn) { overlayOn = covered; checkPause(); }
  if (ov) { overlayAt = Date.now(); return; }
  if (Date.now() - overlayAt < 800) return; // just after Task View / a desktop switch: let Windows finish first
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
  if (quiet() && !fresh) return; // not during a desktop slide: the next second is soon enough
  hideTaskbar(); // Explorer brings it back now and then (Start menu, display changes)
  if (!store.get().dock.running) return;
  const list = currentWindows(fresh ? 0 : 900);
  // a window that flashed for attention stays marked until you go to it (or it closes), like the taskbar's orange
  for (const w of list) { if (w.active) attention.delete(w.hwnd); w.attention = attention.has(w.hwnd); }
  for (const h of attention.keys()) if (!list.some((w) => w.hwnd === h)) attention.delete(h);
  const key = list.map((w) => `${w.hwnd}${w.active ? '*' : ''}${w.attention ? '!' : ''}${w.title}`).join('|');
  if (key !== windowsKey) { windowsKey = key; dockWin.webContents.send('windows', list); } // redraw the dock only when something changed
}
// Windows tells the dock when a window opens, closes, comes forward, changes its title or flashes for attention
// (the shell hook the taskbar itself listens to): the dock updates at once instead of up to a second later
const attention = new Map(); // hwnd -> when it flashed
let shellMsg = 0, shellT = 0;
const HSHELL = { CREATED: 1, DESTROYED: 2, ACTIVATED: 4, REDRAW: 6, RUDE_ACTIVATED: 0x8004, FLASH: 0x8006 };
function shellPoll(delay) {
  if (shellT) return; // a burst (a title that keeps changing) is read once per delay, never starved
  shellT = setTimeout(function run() { shellT = quiet() ? setTimeout(run, 400) : 0; if (!shellT) pollWindows(true); }, delay);
}
function hookShell() {
  if (!win32.isWin || !dockWin || dockWin.isDestroyed()) return;
  shellMsg = win32.shellHook(dockWin);
  if (!shellMsg) return;
  const num = (b) => (b.length >= 8 ? Number(b.readBigInt64LE(0)) : b.readInt32LE(0));
  dockWin.hookWindowMessage(shellMsg, (wp, lp) => {
    const code = num(wp) & 0xFFFF, hwnd = num(lp);
    if (code === HSHELL.FLASH) attention.set(hwnd, Date.now());
    else if (code === HSHELL.ACTIVATED || code === HSHELL.RUDE_ACTIVATED || code === HSHELL.DESTROYED) attention.delete(hwnd);
    if (code === HSHELL.REDRAW) shellPoll(300); // titles (a page loading, a song) change often
    else if (Object.values(HSHELL).includes(code)) shellPoll(40);
  });
  clearInterval(dockTimer); dockTimer = setInterval(pollWindows, 3000); // only a safety net now
}
// the taskbar, the moment Explorer shows it again (as Seelen UI does): during a desktop slide (nothing or Windows'
// switching window in front) it goes at once. The timer-based hiding above skips "nothing in front" on purpose
// (Start or Task View may be opening), which is exactly what a slide looks like, so the taskbar stayed up for it.
// Start, search and flyouts sit on the taskbar: left alone. With an app in front, one frame later, in case Start
// is just taking the front (pressing Win shows the taskbar a moment before Start appears).
const tbHookStats = { heard: 0, hidden: 0 };
function onTaskbarShown(hwnd, what = 'taskbar') {
  if (what !== 'taskbar') return;
  tbHookStats.heard++;
  if (!dockWin || dockWin.isDestroyed() || gamer || app.isQuitting) return;
  tbHookStats.hidden++;
  const kind = win32.foregroundKind();
  if (kind === 'none' || kind === 'switch') { win32.hideNow(hwnd); win32.showTaskbar(false); enforceHidden(hwnd); return; }
  if (kind === 'app') setTimeout(() => { if (dockWin && !gamer && !app.isQuitting && win32.foregroundKind() === 'app') { win32.hideNow(hwnd); win32.showTaskbar(false); } }, 40);
}
// as Seelen UI does: once Explorer has shown it, hidden again every 50 ms for half a second (Explorer shows it more
// than once at the start of a desktop switch)
let enforceT = 0;
function enforceHidden(hwnd) {
  clearInterval(enforceT); let n = 0;
  enforceT = setInterval(() => {
    if (++n > 10 || !dockWin || gamer || app.isQuitting) { clearInterval(enforceT); return; }
    const kind = win32.foregroundKind();
    if (kind === 'none' || kind === 'switch' || kind === 'app') { win32.hideNow(hwnd); win32.showTaskbar(false); }
  }, 50);
}
let tbWatchTimer = null;
function syncTaskbarWatch(on) {
  clearInterval(tbWatchTimer);
  if (!win32.isWin) return;
  on = !app.isQuitting && on;
  if (!on) { win32.unwatchTaskbar(); return; }
  win32.watchTaskbar(onTaskbarShown);
  tbWatchTimer = setInterval(() => win32.watchTaskbar(onTaskbarShown), 10000); // Explorer restarted: listen to the new one
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
    dockWin.once('ready-to-show', () => { win32.makeToolWindow(dockWin); placeDock(); dockWin.showInactive(); pollWindows(); startDockExtras(); hookShell(); syncTaskbarWatch(true); }); // tool window: on every virtual desktop
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
    if (shellMsg) { win32.unhookShell(dockWin); shellMsg = 0; }
    syncTaskbarWatch(false);
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
  winkey.pause(on); // in a game the Windows key does what Windows does
  // cheap on purpose: windows are only hidden (screen edges stay reserved, so nothing on screen has to move),
  // and the music reader keeps running (restarting PowerShell is the expensive part)
  for (const w of [dockWin, topWin, islandWin]) {
    if (!w || w.isDestroyed()) continue;
    if (on) w.hide(); else w.showInactive();
  }
  // Ctrl+Alt+G by hand: the Windows taskbar while the dock is away. Not when a full-screen game / video / F11 turned
  // gamer mode on by itself: the blue taskbar then flashed up behind it, and again for 3 s after leaving full screen.
  if (on) { if (dockWin && win32.isWin && !auto) win32.showTaskbar(true); }
  else pollWindows(true);
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

// ---------- switching desktops ----------
// Watched on a worker thread (deskwatch.js), so the main thread, which also answers Windows' messages for every
// app window, is free while Windows slides the desktops. If the worker can't start, the same watch runs here.
// Around a switch the heavy window scans pause ("quiet"), and the island's endless animations stop for a moment,
// so Windows has nothing extra to compose during the slide.
let deskNow = -1, lastSwitchLabel = [], quietUntil = 0, deskWorker = null, deskWorkerReady = false;
const QUIET_MS = 750; // Windows' slide, with a little to spare
const quiet = () => Date.now() < quietUntil;
// your Windows background's file (that desktop's own, if Windows has one per desktop)
const DESK_KEY = (id) => `Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops\\Desktops\\${id}`;
function winwallFile(id) {
  if (!win32.isWin) return '';
  const own = /^\{[0-9A-F-]{36}\}$/.test(id) ? win32.regString(DESK_KEY(id), 'Wallpaper') : '';
  return own || win32.regString('Control Panel\\Desktop', 'WallPaper');
}
// Pictures this app made: the stills (below) and lock screen pictures, which have the widgets drawn in. Neither is
// ever "your" Windows background: an old version set the lock picture as Windows' background, and Windows then
// showed those frozen widgets (an hour-old forecast, another town) for a moment on every desktop slide.
const STILL_DIR = () => path.join(app.getPath('userData'), 'still');
const LOCK_DIR = () => path.join(app.getPath('userData'), 'lock');
const inDir = (f, d) => !!f && path.dirname(path.resolve(f)).toLowerCase() === d.toLowerCase();
const isOurStill = (f) => inDir(f, STILL_DIR());
const isOurPicture = (f) => isOurStill(f) || inDir(f, LOCK_DIR());
const WIN_DEFAULT = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'Web', 'Wallpaper', 'Windows', 'img0.jpg');
/** Your own Windows background: the one from before this app changed it, or Windows' default picture. */
function ownWindowsBackground() {
  const p = store.get().wallpaper.prevWindows;
  if (p && !isOurPicture(p) && fs.existsSync(p)) return p;
  return fs.existsSync(WIN_DEFAULT()) ? WIN_DEFAULT() : '';
}
/** The Windows background to show when nothing's picked: never one of ours. */
function userWinwall(id) { const f = winwallFile(id); return isOurPicture(f) ? ownWindowsBackground() || f : f; }
// ---------- accent colour from the wallpaper ----------
// The most present vivid colour of the picture showing (photo, or your Windows background), made readable:
// pixels are grouped by hue, weighted by how colourful they are; the winning group's average, at a usable
// lightness. Videos and web pages keep the last colour.
function pictureAccent(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return '';
  const px = img.resize({ width: 64, quality: 'good' }).toBitmap(); // BGRA
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < px.length; i += 4) {
    const b = px[i] / 255, g = px[i + 1] / 255, r = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx < 0.18 || d < 0.12) continue; // too dark or too grey to count
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
    const w = d * d * mx, bin = bins[Math.floor(h / 20)];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const top = bins.reduce((a, x) => (x.w > a.w ? x : a), { w: 0 });
  if (!top.w) return '';
  let r = top.r / top.w, g = top.g / top.w, b = top.b / top.w;
  // to HSL, then a lightness and saturation that read well as an accent on dark glass
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const S = Math.min(0.75, Math.max(0.4, s)), L = Math.min(0.62, Math.max(0.48, l));
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
// Worked out once per picture (decoding a 4K photo takes a moment), and never during a desktop slide: a new accent
// redraws every bar, which would hitch the animation. It lands just after the slide instead.
let accentT = 0;
const accentCache = new Map(); // file|mtime -> colour
function syncWallAccent() {
  clearTimeout(accentT);
  accentT = setTimeout(function run() {
    if (quiet()) { accentT = setTimeout(run, 200); return; }
    const st = store.get();
    if (!st.general.accentFromWallpaper) return;
    const w = wallFor(st.wallpaper, deskId);
    const file = w.scene === 'image' && w.file ? w.file : !(w.scene === 'web' ? w.url : w.file) ? userWinwall(deskId) : '';
    let key = '';
    try { key = file ? `${file}|${fs.statSync(file).mtimeMs}` : ''; } catch {}
    if (!key) return;
    if (!accentCache.has(key)) { let c = ''; try { c = pictureAccent(file); } catch {} accentCache.set(key, c); if (accentCache.size > 40) accentCache.delete(accentCache.keys().next().value); }
    const c = accentCache.get(key);
    if (c && c !== st.accent) applySettings({ accent: c });
  }, 300);
}
// ---------- themes ----------
const themeBundle = () => themes.bundle(store.get().themes?.active);
function broadcastTheme() { const b = themeBundle(); all().forEach((w) => w.webContents.send('theme', b)); themeStamp++; syncWindowsWallpaper(3000); }
// which virtual desktop is showing (its id), for a different wallpaper on each desktop
let deskId = '';
function readDeskId() { if (win32.isWin) { const v = win32.virtualDesktops(); deskId = v.ids[v.current] || deskId; } return deskId; }
// the wallpaper for a desktop: its own when "a different wallpaper on each desktop" is on and it has one
function wallFor(w, id) {
  const own = w.perDesk && id && w.desks?.[id];
  return own ? { ...w, scene: own.scene || 'image', file: own.file || '', url: own.url || '', fileStamp: own.fileStamp } : w;
}
function onDeskSwitch(from, to, count, id) {
  deskNow = to;
  if (id && id !== deskId) { deskId = id; for (const w of wallpapers.values()) if (!w.isDestroyed()) w.webContents.send('wp-desk', id); syncWallAccent(); syncWindowsWallpaper(900); }
  if (gamer) return;
  quietUntil = Date.now() + QUIET_MS;
  const dir = Math.sign(to - from);
  // first, before anything slower: the wallpaper's glide starts with Windows' slide
  if (dir && store.get().general.deskMotion !== false && !lowPower) for (const w of wallpapers.values()) if (!w.isDestroyed()) w.webContents.send('desk-slide', dir);
  if (islandWin && !islandWin.isDestroyed()) islandWin.webContents.send('switching', QUIET_MS);
  // the top bar's desktop dots at once, without a window scan (the app name stays as it was)
  if (topWin && !topWin.isDestroyed()) { const name = topApp.split('|')[0] || 'Desktop'; topApp = `${name}|${count}|${to}`; lastDesk = to; topWin.webContents.send('topbar', { app: name, desks: { count, current: to } }); }
  setTimeout(checkPause, QUIET_MS); // resume the wallpaper / check for full-screen apps once the slide is over
  if (dockWin) for (const ms of [450, 1700]) setTimeout(() => { if (!gamer && !overlayNow()) win32.showTaskbar(false); }, ms); // after the slide, and once more after the empty-desktop grace
}
function deskWatchSettings() {
  const g = store.get().general;
  return { screen: screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds), hideLabel: g.hideSwitchLabel !== false, edgeSwitch: g.edgeSwitch !== false && vdesk.supported(),
    ime: store.get().topbar.ime === true };
}

// ---------- the input method (Pinyin / English) in the top bar ----------
// Shown as 拼 / EN; switching with Shift in the same window also gets a short note in the island.
let imeNow = null;
function onIme(m) {
  const prev = imeNow; imeNow = m;
  if (topWin && !topWin.isDestroyed()) topWin.webContents.send('ime', m);
  if (prev && m.ime && prev.ime && prev.hwnd === m.hwnd && prev.native !== m.native) osd({ kind: 'ime', native: m.native, lang: m.lang });
}


// a window held against the left / right edge while being dragged: you go to the desktop next door and the window
// comes with you, staying in your hand while Windows slides (Win+Ctrl+arrow; straight there if those keys don't get
// through mid-drag), then it's put on the desktop you arrived at
let lastEdgeMove = null;
async function edgeMove(hwnd, dir) {
  if (gamer || store.get().general.edgeSwitch === false) return;
  const before = win32.virtualDesktops().current;
  const ok = await vdesk.carry(hwnd, dir > 0);
  lastEdgeMove = { at: new Date().toISOString(), dir, ok };
  if (!ok) return; // no desktop on that side (or Windows refused)
  win32.pressKeys([0x5B, 0x11, dir > 0 ? 0x27 : 0x25]);
  setTimeout(async () => {
    if (win32.virtualDesktops().current === before) await vdesk.switchTo(dir > 0);
    await vdesk.settle(hwnd); // after the slide: the window belongs to the new desktop again
  }, 500);
}
function startDeskWatch() {
  if (!win32.isWin) return;
  try {
    const { Worker } = require('worker_threads');
    deskWorker = new Worker(path.join(__dirname, 'deskwatch.js'), { workerData: deskWatchSettings() });
    deskWorker.on('message', (m) => {
      if (m.type === 'ready') deskWorkerReady = true;
      else if (m.type === 'switch') onDeskSwitch(m.from, m.to, m.count, m.id);
      else if (m.type === 'label') lastSwitchLabel = m.found;
      else if (m.type === 'edge') edgeMove(m.hwnd, m.dir);
      else if (m.type === 'ime') onIme(m.m);
      else if (m.type === 'fail') { console.warn('[deskwatch]', m.error); deskWorker?.terminate(); }
    });
    deskWorker.on('error', (e) => { console.warn('[deskwatch]', e.message); crashguard.log('deskwatch', e.stack || e.message); });
    deskWorker.on('exit', () => { deskWorker = null; deskWorkerReady = false; }); // back to watching here
  } catch (e) { console.warn('[deskwatch] worker unavailable:', e.message); deskWorker = null; }
}
// the fallback, on the main thread
function watchDesktops() {
  if (!win32.isWin || deskWorkerReady) return;
  const vd = win32.virtualDesktops();
  if (vd.current === deskNow) return;
  const from = deskNow;
  deskNow = vd.current;
  if (from === -1) return;
  onDeskSwitch(from, vd.current, vd.count);
  if (!gamer && store.get().general.hideSwitchLabel !== false) {
    const scr = deskWatchSettings().screen;
    let n = 0, found = -1;
    const t = setInterval(() => {
      const h = win32.hideSwitchLabel(scr);
      if (h.length) { lastSwitchLabel = h; found = n; }
      if (++n >= 14 || (found >= 0 && n - found > 3)) clearInterval(t);
    }, 70);
  }
}

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

// ---------- full screen (F11, full-screen video): the top bar and island go at once, like macOS ----------
// A maximized window keeps them (it ends below the top bar). Gamer mode keeps its own 3-second rule.
let fullNow = false, fullSeen = 0;
function watchFullscreen() {
  if (!win32.isWin || gamer) return;
  const displays = screen.getAllDisplays().map((d) => screen.dipToScreenRect(null, d.bounds));
  const full = win32.fullscreenAppRunning(displays, ownPids());
  fullSeen = full ? fullSeen + 1 : 0;
  const next = fullSeen >= 2; // two checks in a row (~0.3 s): not for a split-second flash
  if (next === fullNow) return;
  fullNow = next;
  if (topWin && !topWin.isDestroyed()) { if (fullNow) topWin.hide(); else if (!fullSteady) topWin.showInactive(); }
  if (islandWin && !islandWin.isDestroyed()) { if (fullNow) islandWin.hide(); else islandWin.showInactive(); }
  if (fullNow) flyWin?.hide();
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
// glass: Windows blurs the desktop behind the bar (the page draws only a light tint); solid: no blur at all
function applyTopbarLook() {
  if (win32.isWin && topWin && !topWin.isDestroyed()) win32.setBlur(topWin, store.get().topbar.look === 'glass');
}
// Windows may push the bar into the work area when the screen or taskbar changes; put it back
function keepTopbarAtTop() {
  if (!win32.isWin || !topWin || topWin.isDestroyed()) return;
  const want = screen.dipToScreenRect(null, { ...screen.getPrimaryDisplay().bounds, height: TOP_H }), r = win32.windowRect(topWin);
  if (r && (r.y !== want.y || r.x !== want.x || r.height !== want.height)) win32.placeWindow(topWin, { x: want.x, y: want.y, width: want.width, height: want.height });
}
const prettyExe = (exe) => { const n = path.basename(exe || '', '.exe'); return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; };
function topbarTick() {
  if (!topWin || topWin.isDestroyed() || gamer || quiet()) return;
  const d = screen.getPrimaryDisplay();
  const full = fullNow || fullSteady; // F11 / full-screen video: out of the way at once (see watchFullscreen)
  if (full && topWin.isVisible()) topWin.hide(); else if (!full && !topWin.isVisible()) topWin.showInactive(); // out of the way of games and video
  keepTopbarAtTop(); keepIslandAtTop();
  const fg = currentWindows().find((w) => w.active);
  const name = fg ? (apps || []).find((a) => a.exe && a.exe.toLowerCase() === fg.exe.toLowerCase())?.name || prettyExe(fg.exe) : 'Desktop';
  const vd = win32.isWin ? win32.virtualDesktops() : { count: 1, current: 0 }, key = `${name}|${vd.count}|${vd.current}`;
  if (vd.current !== lastDesk) { lastDesk = vd.current; checkPause(); } // a new desktop: resume the wallpaper at once if nothing covers it
  if (key !== topApp) {
    topApp = key;
    const full = win32.isWin ? win32.virtualDesktops(true) : vd, mine = store.get().desktops?.names || {}; // names: only when something changed
    topWin.webContents.send('topbar', { app: name, desks: { count: vd.count, current: vd.current, names: (full.ids || []).map((id, i) => mine[id] || full.names?.[i] || '') } });
  }
}
// the system tray's icons in the top bar (tray.js): only while the top bar is there to show them
// Windows' own tray icons (sound, network, battery…) belong to Explorer: the top bar shows those itself, so they're
// marked and left out unless asked for
// key: the same icon after a restart (its window changes): the program and its icon number, or the icon's own GUID
const markTray = (list) => list.map((x) => {
  const exe = win32.isWin ? win32.processExe(x.pid) : '';
  return { ...x, system: /\\explorer\.exe$/i.test(exe), key: x.id.includes(':') ? `${path.basename(exe || 'app').toLowerCase()}#${x.id.split(':')[1]}` : `guid:${x.id}` };
});
function syncTray() {
  const t = store.get().topbar;
  if (win32.isWin && t.on && t.tray !== false) systray.resume(); else systray.stop();
}
function setTopbar(on) {
  if (on && (!topWin || topWin.isDestroyed())) {
    topWin = new BrowserWindow({ width: 800, height: TOP_H, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Syndicates Top Bar', webPreferences: webPrefs });
    topWin.setAlwaysOnTop(true, 'pop-up-menu');
    topWin.loadURL(ui('topbar.html'));
    topWin.once('ready-to-show', () => { win32.makeToolWindow(topWin); applyTopbarLook(); placeTopbar(); topWin.showInactive(); topApp = ''; topbarTick(); });
    topWin.on('closed', () => { topWin = null; });
    clearInterval(topTimer); topTimer = setInterval(topbarTick, 1000);
  } else if (!on && topWin) {
    clearInterval(topTimer);
    if (win32.isWin) win32.releaseEdge(topWin);
    topWin.destroy(); topWin = null;
  }
  syncTray();
}

// ---------- the island (a Dynamic-Island-style pill at the top: timer, now playing) ----------
// After DynamicWin (Windows) and boring.notch (macOS): a transparent window at the top centre; only the pill takes clicks.
const ISLAND = { w: 480, h: 440 }, ISLAND_SMALL = { w: 300, h: 50 }; // small while it's just the pill: less for Windows to compose
let islandBig = false;
function islandRect() { const d = screen.getPrimaryDisplay(), z = islandBig ? ISLAND : ISLAND_SMALL; return { x: Math.round(d.bounds.x + (d.bounds.width - z.w) / 2), y: d.bounds.y, width: z.w, height: z.h }; }
function placeIsland() {
  if (!islandWin || islandWin.isDestroyed()) return;
  islandWin.setBounds(islandRect());
  if (win32.isWin) win32.placeWindow(islandWin, screen.dipToScreenRect(null, islandRect())); // Windows pushes it below the top bar otherwise
}
// Windows moves it whenever the taskbar / top bar change the work area; put it back on the top edge
function keepIslandAtTop() {
  if (!win32.isWin || !islandWin || islandWin.isDestroyed() || gamer) return;
  const want = screen.dipToScreenRect(null, islandRect()), r = win32.windowRect(islandWin);
  if (r && (r.y !== want.y || r.x !== want.x || r.width !== want.width || r.height !== want.height)) win32.placeWindow(islandWin, want);
}
function setIsland(on) {
  if (on && (!islandWin || islandWin.isDestroyed())) {
    islandBig = false;
    islandWin = new BrowserWindow({ width: ISLAND_SMALL.w, height: ISLAND_SMALL.h, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, focusable: false,
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

// ---------- pop-ups in the island (volume, brightness, Caps Lock, headphones) ----------
function osd(info) { if (islandWin && !islandWin.isDestroyed() && store.get().general.ownOsd !== false) islandWin.webContents.send('osd', info); }
// ---------- low power mode (from the battery in the top bar) ----------
// Best power efficiency, the lowest refresh rate, the wallpaper paused; everything goes back as it was when switched off.
// Saved in settings (it survives restarts and can't drift from what the panel shows). It doesn't touch the
// refresh rate: changing that blanks many screens for a moment (pick a rate yourself in the same panel).
let lowPower = null;
async function setLowPower(on) {
  const cur = store.get().general.lowPower || null;
  if (on && !cur) {
    const prevMode = await netpower.powerMode();
    await netpower.setPowerMode('efficiency');
    store.set({ general: { lowPower: { prevMode } } });
  } else if (!on && cur) {
    store.set({ general: { lowPower: null } });
    await netpower.setPowerMode(cur.prevMode && cur.prevMode !== 'efficiency' ? cur.prevMode : 'balanced');
  }
  lowPower = store.get().general.lowPower;
  checkPause();
}

// headphones / speakers coming and going, straight from Windows' list of sound outputs (checked twice a second);
// the island's own check (Chromium's devicechange) arrived seconds late
const GENERIC_OUT = /^(headphones?|headset|earphones?|speakers?|耳机|头戴式耳机|耳麦|扬声器)$/i;
function outputName(n) {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(String(n || ''));
  if (!m) return String(n || 'Audio device');
  return GENERIC_OUT.test(m[1].trim()) && !/realtek|high definition|intel|amd|nvidia|smart sound/i.test(m[2]) ? m[2].trim() : m[1].trim(); // "Headphones (AirPods Pro)" -> AirPods Pro
}
function outputsChanged(st, prev) {
  if (!Array.isArray(st?.outputs) || !Array.isArray(prev?.outputs)) return;
  const was = new Map(prev.outputs.map((o) => [o.id, o.name])), now = new Map(st.outputs.map((o) => [o.id, o.name]));
  for (const [id, name] of now) if (!was.has(id)) return osd({ kind: 'device', name: outputName(name), connected: true });
  for (const [id, name] of was) if (!now.has(id)) return osd({ kind: 'device', name: outputName(name), connected: false });
}

// ---------- the dock's Bin and Screenshots stack ----------
// a Windows call that waits (Empty Bin asks first) runs on its own short-lived thread
function bgCall(fn) {
  return new Promise((resolve) => {
    const { Worker } = require('worker_threads');
    const w = new Worker(path.join(__dirname, 'bgcall.js'), { workerData: { fn } });
    w.once('message', resolve); w.once('error', () => resolve(null)); w.once('exit', () => resolve(null));
  });
}
let binState = { items: 0, bytes: 0 }, binTimer = null;
function checkBin() {
  if (!win32.isWin || !dockWin || dockWin.isDestroyed()) return;
  const b = win32.recycleBin();
  if (b.items !== binState.items || b.bytes !== binState.bytes) { binState = b; dockWin.webContents.send('bin', b); }
}
let shotsState = { dir: '', items: [] };
async function refreshShots() {
  shotsState = await shots.list();
  for (const w of [dockWin, flyWin]) if (w && !w.isDestroyed()) w.webContents.send('shots', shotsState);
}
function startDockExtras() {
  clearInterval(binTimer); binTimer = setInterval(checkBin, 3000); checkBin(); // emptied or filled in Explorer too
  refreshShots(); shots.watch(refreshShots);
}

// ---------- themed pop-ups: the top bar's menu and the control centre (instead of Windows' own) ----------
let flyWin = null;
let flyHiddenAt = 0, flyShownAt = 0;
const FLY = { tray: { w: 300, h: 330 }, shots: { w: 396, h: 470, dock: true }, menu: { w: 280, h: 486 }, control: { w: 380, h: 580 }, sound: { w: 360, h: 600 }, wifi: { w: 330, h: 470 }, battery: { w: 330, h: 430 }, calendar: { w: 360, h: 600 } };
// an app's windows, as live previews (a dock icon with several windows): as many cards as windows, 4 to a row
const WIN_CARD = { w: 212, h: 150, gap: 10 };
function windowsPanelSize(n) {
  const cols = Math.max(1, Math.min(4, n)), rows = Math.max(1, Math.ceil(Math.min(n, 8) / 4));
  return { w: 30 + cols * WIN_CARD.w + (cols - 1) * WIN_CARD.gap, h: 72 + rows * WIN_CARD.h + (rows - 1) * WIN_CARD.gap, dock: true };
}
function openFlyout(panel, anchorX, data = null) {
  if (!FLY[panel] && panel !== 'windows') return;
  if (panel === 'windows' && !(Array.isArray(data?.hwnds) && data.hwnds.length)) return;
  const d = screen.getPrimaryDisplay(), z = panel === 'windows' ? windowsPanelSize(data.hwnds.length) : FLY[panel];
  const dataKey = panel === 'windows' ? data.hwnds.join(',') : '';
  const same = flyWin && !flyWin.isDestroyed() && flyWin.panel === panel && (flyWin.dataKey || '') === dataKey;
  const x = Math.round(Math.max(d.bounds.x + 6, Math.min(d.bounds.x + d.bounds.width - z.w - 6, d.bounds.x + anchorX - (panel === 'menu' ? 8 : z.w / 2))));
  if (flyWin && !flyWin.isDestroyed() && flyWin.isVisible() && flyWin.panel !== panel) flyWin.hide(); // one panel at a time, never two on top of each other
  // under the top bar; the dock's Screenshots stack opens upwards, just above the dock
  const dockTop = d.bounds.y + d.bounds.height - (DOCK_H[store.get().dock.size] || DOCK_H.m) - 10;
  const bounds = { x, y: z.dock ? dockTop - z.h : d.bounds.y + (store.get().topbar.on ? TOP_H : 0) + 6, width: z.w, height: z.h };
  if (same && flyWin.isVisible()) { flyWin.hide(); return; } // a second click closes it
  // the click on the button already closed it (the panel lost focus a moment ago): don't open it again
  if (same && Date.now() - flyHiddenAt < 350) return;
  clearThumbs(flyWin);
  if (!flyWin || flyWin.isDestroyed()) {
    flyWin = new BrowserWindow({ ...bounds, frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, show: false,
      alwaysOnTop: true, backgroundColor: '#00000000', title: 'Syndicates Panel', webPreferences: webPrefs });
    flyWin.setAlwaysOnTop(true, 'pop-up-menu');
    // the click that opened it can blur it a moment later (the top bar takes focus): only a real click away closes it
    flyWin.on('blur', () => { if (Date.now() - flyShownAt < 300) return; flyWin?.hide(); flyHiddenAt = Date.now(); });
    flyWin.once('ready-to-show', () => win32.makeToolWindow(flyWin));
    flyWin.on('hide', () => { clearThumbs(flyWin); soundWatch(false); }); // previews belong to the panel: gone with it; the sound data stops
    flyWin.loadURL(ui('flyout.html'));
    flyWin.panel = panel; flyWin.data = data; flyWin.dataKey = dataKey; soundWatch(panel === 'sound');
    flyReveal(1500);
    return;
  }
  flyWin.panel = panel; flyWin.data = data; flyWin.dataKey = dataKey; soundWatch(panel === 'sound');
  flyWin.setBounds(bounds); flyWin.webContents.send('flyout', panel);
  flyReveal(400);
}
// each app's volume and every player: read only while the sound panel is open (it costs PowerShell time every second)
function soundWatch(on) { sysctl.watchApps(on); media.watchSessions(on); }
// shown only once the page has drawn the asked-for panel, so the previous one never flashes first
// (that flash, then the real panel, looked like it popped up twice)
let flyPending = null;
function flyReveal(fallbackMs) {
  clearTimeout(flyPending);
  flyPending = setTimeout(flyShow, fallbackMs);
}
function flyShow() {
  if (!flyPending) return;
  clearTimeout(flyPending); flyPending = null;
  if (!flyWin || flyWin.isDestroyed()) return;
  flyShownAt = Date.now(); flyWin.show(); flyWin.focus();
}
// live previews in the windows panel: DWM draws each window into the panel at the spots the page measured
// live previews: DWM draws each window into one of ours (the dock's windows panel) at the
// spots its page measured; a preview belongs to the window it's drawn in and goes when that one hides
const thumbs = new Map(); // our window -> Map(hwnd -> DWM thumbnail)
function clearThumbs(host) {
  for (const [w, m] of thumbs) { if (host && w !== host) continue; for (const t of m.values()) win32.thumbUnregister(t); thumbs.delete(w); }
}
function setThumbs(host, rects, allowed, max = 8) {
  if (!win32.isWin || !host || host.isDestroyed() || !Array.isArray(rects)) { clearThumbs(host); return []; }
  if (!thumbs.has(host)) thumbs.set(host, new Map());
  const mine = thumbs.get(host);
  const sf = screen.getDisplayMatching(host.getBounds()).scaleFactor || 1;
  const keyOf = (r) => (r.key ? `${r.hwnd}:${r.key}` : r.hwnd); // one window can be shown twice (big, and small in its desktop)
  const want = new Set(rects.map(keyOf));
  for (const [h, t] of mine) if (!want.has(h)) { win32.thumbUnregister(t); mine.delete(h); }
  const shown = [];
  for (const r of rects.slice(0, max)) {
    if (!allowed.some((w) => w.hwnd === r.hwnd)) continue; // only windows we listed ourselves
    let t = mine.get(keyOf(r));
    if (!t) { t = win32.thumbRegister(host, r.hwnd); if (!t) continue; mine.set(keyOf(r), t); }
    const src = win32.thumbSize(t), box = { x: r.x * sf, y: r.y * sf, w: r.w * sf, h: r.h * sf };
    // a minimized window has nothing worth showing (a sliver of title bar): the page's icon stays instead
    if (!src || src.w < 80 || src.h < 60) { win32.thumbPlace(t, box, false); continue; }
    const k = r.fill ? Math.min(box.w / src.w, box.h / src.h) : Math.min(box.w / src.w, box.h / src.h, 1), w = src.w * k, h = src.h * k; // fit, never blown up (small ones: exactly their box)
    win32.thumbPlace(t, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }, true);
    shown.push(r.hwnd);
  }
  return shown;
}

// a desktop dot in the top bar: there the way Windows does it (its slide), one desktop at a time
async function goToDesk(target) {
  if (!win32.isWin) return;
  const vd = win32.virtualDesktops(), steps = Math.max(-9, Math.min(9, Math.round(target) - vd.current));
  for (let i = 0; i < Math.abs(steps); i++) { win32.pressKeys([0x5B, 0x11, steps > 0 ? 0x27 : 0x25]); await new Promise((r) => setTimeout(r, 260)); }
}

const FLY_ACTIONS = {
  home: () => toggleHome(true), customize: openSettings, timer: openIslandTimer, gamer: () => setGamer(!gamer),
  newdesk: () => win32.pressKeys([0x5B, 0x11, 0x44]), showdesk: () => win32.pressKeys([0x5B, 0x44]), overview: () => win32.pressKeys([0x5B, 0x09]), // Windows' Task View (Win+Tab)
  settings: () => shell.openExternal('ms-settings:'), taskmgr: () => win32.pressKeys([0x11, 0x10, 0x1B]), lock: () => win32.lock(),
  notifications: () => win32.pressKeys([0x5B, 0x4E]),
  // power: Windows' own commands (sleep through the API that doesn't fall into hibernation)
  sleep: () => power(['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"]]),
  restart: () => power(['shutdown.exe', ['/r', '/t', '0']]), shutdown: () => power(['shutdown.exe', ['/s', '/t', '0']]), signout: () => power(['shutdown.exe', ['/l']]),
};
function power([exe, args]) {
  if (!win32.isWin) return;
  const dir = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const full = exe === 'powershell.exe' ? path.join(dir, 'WindowsPowerShell', 'v1.0', exe) : path.join(dir, exe);
  require('child_process').execFile(full, args, { windowsHide: true }, () => {});
}

// ---------- Windows' own background, kept as a still of ours ----------
// Windows draws its own background while desktops slide (and before the app has started), not our window. So that
// background is a still of the desktop as it looks right now: the same page rendered offscreen at the screen's real
// pixels, picture, darkening and widgets (not the ones that tick, the clock and CPU), fitted 1:1 with "fill". It's
// made again whenever what it shows changes (the weather, a to-do, the song, the date, a setting, a theme), so
// during a slide you see the same widgets in the same place and nothing pops when the slide ends.
// It goes onto every desktop at once through the shell's desktop interface (vdesk.js), so no desktop keeps an old
// picture; where that isn't available, a desktop gets it when you're on it. What Windows had before is remembered
// and put back when this is switched off or nothing is picked.
let stillT = 0, stillBusy = false, stillLast = 0, themeStamp = 0, lastWeatherJson = '';
const stillApplied = new Map(); // desktop id -> the content key its still shows
const STILL_VERSION = 4; // a new way of making stills: none made the old way is used again
const STILL_GAP = 20000; // at most one new still every 20 s (songs change, weather loads…)
const sha = (x) => require('crypto').createHash('sha1').update(x).digest('hex').slice(0, 16);
const mediaKey = () => { const m = media.get(); return m.on ? [m.title, m.artist, !!m.art].join('|') : 'off'; }; // not play / pause: a new still for every pause wasn't worth it
function stillKey(desk) {
  const st = store.get(), w = wallFor(st.wallpaper, desk), d = screen.getPrimaryDisplay(), now = new Date();
  return sha(JSON.stringify([STILL_VERSION, w.scene, w.file, w.url, w.fileStamp, w.dim, d.size, d.scaleFactor, st.widgets, st.home?.todos, st.home?.timetable, st.name, st.accent,
    st.themes?.active, themeStamp, lastWeatherJson, mediaKey(), now.toDateString(), now.getHours(), st.dock?.on, clockShown() ? now.getMinutes() : 0]));
}
function loadApplied() { // across restarts of the app, for as long as Explorer keeps running
  const saved = store.get().wallpaper.stillApplied2, pid = win32.explorerPid();
  if (saved && pid && saved.explorer === pid) for (const [k, v] of Object.entries(saved.desks || {})) stillApplied.set(k, v);
}
const saveApplied = () => store.set({ wallpaper: { stillApplied2: { explorer: win32.explorerPid(), desks: Object.fromEntries(stillApplied) } } });
// What's on screen is the surest picture of it: the wallpaper window itself, captured (the clock and CPU hidden for that
// frame). Offscreen rendering is the fallback (another desktop's wallpaper, or the window not drawn yet).
async function captureLive(want, px) {
  const w = wallpapers.get(screen.getPrimaryDisplay().id);
  if (!w || w.isDestroyed() || paused) return false;
  try {
    const ready = await w.webContents.executeJavaScript(`(async () => {
      const wt = document.querySelector('.w-weather'), pic = document.querySelector('.wp-media .wp-layer.in, .wp-media .wp-empty');
      if (!pic || (wt && !wt.hidden && !wt.dataset.done)) return false;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return true; })()`);
    if (!ready) return false;
    const img = await Promise.race([w.webContents.capturePage(), new Promise((r) => setTimeout(() => r(null), 2500))]);
    if (!img || img.isEmpty()) return false;
    const sz = img.getSize();
    fs.mkdirSync(STILL_DIR(), { recursive: true });
    fs.writeFileSync(want, (sz.width !== px.width || sz.height !== px.height ? img.resize({ ...px, quality: 'best' }) : img).toJPEG(92));
    return true;
  } catch (e) { console.warn('[still] capture', e.message); return false; }
}
async function renderStill(desk, key) {
  const d = screen.getPrimaryDisplay(), want = path.join(STILL_DIR(), `still-${key}.jpg`);
  if (fs.existsSync(want)) return want;
  if (desk === deskId && await captureLive(want, { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) })) return want;
  const shot = await lockscreen.snapshot(STILL_DIR(), ui('wallpaper.html', `?snapshot=1&still=1&desk=${encodeURIComponent(desk)}`), webPrefs.preload);
  // exactly the screen's pixels (Windows draws it 1:1 with "fill"), whatever size the snapshot came out
  const img = nativeImage.createFromPath(shot), px = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sz = img.getSize();
  if (!img.isEmpty() && (sz.width !== px.width || sz.height !== px.height)) { fs.writeFileSync(want, img.resize({ ...px, quality: 'best' }).toJPEG(92)); fs.rmSync(shot, { force: true }); }
  else fs.renameSync(shot, want);
  return want;
}
function pruneStills() {
  const keep = new Set([...stillApplied.values()].map((k) => `still-${k}.jpg`));
  const old = fs.readdirSync(STILL_DIR()).filter((f) => /^still-[0-9a-f]+\.jpg$/.test(f) && !keep.has(f)).map((f) => ({ f, t: fs.statSync(path.join(STILL_DIR(), f)).mtimeMs })).sort((x, y) => y.t - x.t).slice(4);
  for (const o of old) fs.rmSync(path.join(STILL_DIR(), o.f), { force: true });
}
/** Put a picture on desktop id (Windows' background there). The one showing: as Windows sets backgrounds; others: through the shell. */
// The desktop showing gets it both ways: as Windows sets backgrounds (the general one, shown at sign-in, and the fit)
// and as that desktop's own (a desktop with its own background ignores the general one: it kept Windows' default
// picture, seen on every slide away from it). Other desktops: their own.
const stillLog = []; // what each try did, for Copy diagnostics (the last 16)
async function setDeskBackground(id, i, file, style, cur) {
  const r = { at: new Date().toISOString().slice(11, 19), desk: i, current: id === cur, file: path.basename(file) };
  let ok = false;
  if (id === cur) { r.spi = !!win32.setWindowsWallpaper(file, style); ok = r.spi; }
  if (!vdesk.status().ready) { vdesk.start(); for (let t = 0; t < 40 && !vdesk.status().ready; t++) await new Promise((res) => setTimeout(res, 150)); } // it takes a few seconds to start
  if (vdesk.status().ready && v11()) {
    if (id === cur) r.settingsWay = !!(await vdesk.currentWallpaper(file)); // as Windows' Settings sets it: the desktop showing
    r.ownBackground = !!(await vdesk.wallpaper(i, file)); // that desktop's own background
    ok = r.ownBackground || (id === cur && (r.settingsWay || (ok && !win32.regString(DESK_KEY(id), 'Wallpaper'))));
  } else r.helper = vdesk.status().error || 'not ready';
  r.error = vdesk.lastError() || ''; r.ok = ok;
  r.after = win32.regString(DESK_KEY(id), 'Wallpaper').split('\\').pop() || '(general)';
  stillLog.push(r); if (stillLog.length > 16) stillLog.shift();
  return ok;
}
const v11 = () => vdesk.supported();
let stillFull = true; // a round for every desktop is due (anything but the minute's clock update asks for one)
function syncWindowsWallpaper(delay = 1500, nearOnly = false) {
  if (!nearOnly) stillFull = true;
  clearTimeout(stillT);
  stillT = setTimeout(async function run() {
    if (!win32.isWin || app.isQuitting) return;
    if (quiet() || stillBusy) { stillT = setTimeout(run, 400); return; }
    if (gamer) { stillT = setTimeout(run, 60e3); return; } // not while playing
    const st = store.get(), v = win32.virtualDesktops(), ids = v.ids.length ? v.ids : [deskId || 'local'], cur = ids.includes(deskId) ? deskId : ids[v.current] || ids[0];
    if (!stillApplied.size) loadApplied();
    const pickedOn = (id) => { const w = wallFor(st.wallpaper, id); return !!(w.scene === 'web' ? w.url : w.file); };
    stillBusy = true;
    try {
      if (!st.wallpaper.matchWindows || !ids.some(pickedOn)) { // off, or nothing picked (Windows' background is the wallpaper): the user's own back
        const own = ownWindowsBackground();
        if (own) for (const [i, id] of ids.entries()) if (isOurPicture(winwallFile(id)) || stillApplied.has(id)) { await setDeskBackground(id, i, own, own === st.wallpaper.prevWindows ? st.wallpaper.prevStyle || null : 10, cur); stillApplied.delete(id); }
        saveApplied();
        return;
      }
      const now = winwallFile(cur), prev = st.wallpaper.prevWindows;
      if (now && !isOurPicture(now) && (!prev || isOurPicture(prev))) store.set({ wallpaper: { prevWindows: now, prevStyle: win32.regString('Control Panel\\Desktop', 'WallpaperStyle') || '10' } });
      else if (prev && isOurPicture(prev)) store.set({ wallpaper: { prevWindows: '', prevStyle: '' } }); // a lock picture kept by an old version
      if (win32.regString('Control Panel\\Desktop', 'WallpaperStyle') !== '10') stillApplied.clear(); // another fit (an earlier version, or changed in Settings)
      // what each desktop should show; the one in front first. The same wallpaper everywhere: one picture for all.
      const order = [cur, ...ids.filter((id) => id !== cur)];
      if (st.widgets.weather?.on && !lastWeatherJson) { try { lastWeatherJson = JSON.stringify(await system.weather(st.widgets.weather?.city || '')); } catch {} } // known before the key: no second still once it loads
      const keys = new Map(order.map((id) => [id, stillKey(st.wallpaper.perDesk ? id : cur)]));
      // each minute only the desktops a slide goes to next (the one showing, and left / right of it); all of them every
      // five minutes and on every other change. Five full-screen pictures a minute was a lot of work for Explorer
      const near = !stillFull && new Date().getMinutes() % 5 !== 0, ci = ids.indexOf(cur);
      const todo = order.filter((id) => pickedOn(id) && stillApplied.get(id) !== keys.get(id) && (!near || Math.abs(ids.indexOf(id) - ci) <= 1));
      if (!todo.length) { if (!near) stillFull = false; return; }
      const wait = stillLast + STILL_GAP - Date.now();
      if (wait > 0) { stillBusy = false; stillT = setTimeout(run, wait); return; }
      stillLast = Date.now(); stillFull = false;
      const files = new Map();
      for (const id of todo) {
        const key = keys.get(id);
        if (!files.has(key)) files.set(key, await renderStill(st.wallpaper.perDesk ? id : cur, key));
        if (quiet()) { stillBusy = false; stillT = setTimeout(run, 600); return; } // a slide started: finish after it
        if (await setDeskBackground(id, ids.indexOf(id), files.get(key), 10, cur)) stillApplied.set(id, key);
      }
      saveApplied(); pruneStills();
    } catch (e) { console.warn('[still]', e.message); }
    finally { stillBusy = false; }
  }, delay);
}
setInterval(() => syncWindowsWallpaper(0), 10 * 60e3); // the date, the hour's greeting, the weather: only re-made if something changed
// A clock on the desktop is in the still too (otherwise a slide showed the time panel empty until the desktop was back),
// so while one shows, the still is made again as each minute starts. Not with the Mac layout, which has no clock.
const clockShown = () => { const w = store?.get().widgets; return !!w?.clock?.on && (w.layout === 'syn' || w.layout === 'free'); };
(function minuteStill() {
  const now = new Date(), wait = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 400;
  setTimeout(() => { if (store && clockShown() && store.get().wallpaper.matchWindows && !paused) syncWindowsWallpaper(0, true); minuteStill(); }, wait);
})();

// ---------- lock screen ----------
let lockTimer = null;
async function applyLockScreen() {
  const st = store.get();
  const file = await lockscreen.snapshot(path.join(app.getPath('userData'), 'lock'), ui('wallpaper.html', '?snapshot=1'), webPrefs.preload);
  const result = { file, lock: false, wallpaper: false, error: '' };
  try { result.lock = await lockscreen.setLockScreen(file); } catch (e) { result.error = e.message; }
  // Windows' own background gets the still without widgets (above), never this picture: baked-in widgets would show
  // through, out of date, whenever Windows draws its background
  if (st.lock.alsoWallpaper) { syncWindowsWallpaper(0); result.wallpaper = true; }
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
    ...(updater.status().available ? [{ label: `Update now (build ${updater.status().latest})`, click: () => updater.apply(() => app.quit()).catch(() => {}) }] : [{ label: 'Check for updates', click: () => updater.check() }]),
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
  if (patch.general?.hideSwitchLabel !== undefined || patch.general?.edgeSwitch !== undefined) {
    if (next.general.edgeSwitch !== false) vdesk.start();
    deskWorker?.postMessage(deskWatchSettings());
  }
  if (patch.home?.hotkey !== undefined && patch.home.hotkey !== before.home.hotkey) registerHotkey();
  if (patch.home?.winKey !== undefined) syncWinKey();
  if (patch.home?.clipboard !== undefined) { if (next.home.clipboard !== false) clips.start(); else clips.stop(); registerHotkey(); }
  if (patch.general?.autoUpdate !== undefined) { if (next.general.autoUpdate) updater.start(); else updater.stop(); }
  if (patch.general?.startWithWindows !== undefined) { setAutostart(next.general.startWithWindows); if (!next.general.autostartChosen) store.set({ general: { autostartChosen: true } }); }
  if (patch.general?.hideDesktopIcons !== undefined) win32.setDesktopIcons(!next.general.hideDesktopIcons);
  if (patch.topbar?.on !== undefined) setTopbar(next.topbar.on);
  if (patch.topbar?.look !== undefined) applyTopbarLook();
  if (patch.topbar?.tray !== undefined) syncTray();
  if (patch.themes !== undefined) broadcastTheme();
  if (patch.desktops !== undefined) topApp = ''; // a desktop renamed: the top bar's tooltips
  if (patch.general?.accentFromWallpaper !== undefined) { // on: remember the colour you picked; off: put it back
    if (next.general.accentFromWallpaper) { store.set({ general: { accentManual: before.accent } }); syncWallAccent(); }
    else if (next.general.accentManual) { const back = next.general.accentManual; store.set({ general: { accentManual: '' } }); setTimeout(() => applySettings({ accent: back }), 0); }
  }
  if (patch.wallpaper !== undefined) { syncWallAccent(); if (Object.keys(patch.wallpaper).some((k) => !['prevWindows', 'prevStyle', 'stillApplied', 'stillApplied2'].includes(k))) syncWindowsWallpaper(); }
  if (patch.widgets || patch.home?.todos || patch.home?.timetable || patch.name !== undefined || patch.accent !== undefined || patch.dock?.on !== undefined) syncWindowsWallpaper(3000); // the still shows the widgets
  if (patch.topbar?.ime !== undefined) { deskWorker?.postMessage({ ime: next.topbar.ime === true }); if (!next.topbar.ime && topWin && !topWin.isDestroyed()) topWin.webContents.send('ime', null); }
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
    paused, gamer, deskWorker: deskWorkerReady, vdesk: vdesk.status(), tray: systray.status(), winKey: winkey.status(), update: updater.status(), stillLog, windowsBackground: win32.isWin ? { global: win32.regString('Control Panel\\Desktop', 'WallPaper'), style: win32.regString('Control Panel\\Desktop', 'WallpaperStyle'), desks: Object.fromEntries(win32.virtualDesktops().ids.map((id) => [id, win32.regString(DESK_KEY(id), 'Wallpaper')])), prev: store.get().wallpaper.prevWindows, match: store.get().wallpaper.matchWindows } : null, taskbarHook: { active: !!tbWatchTimer, ...tbHookStats }, lastEdgeMove, lastSwitchLabel, lastOverlay: win32.isWin ? win32.lastOverlay() : null, switchKeys: hotkeyStatus.switchKeys, lastSwitch, dock: !!dockWin, topbar: !!topWin, island: !!islandWin, crashes: crashguard.summary(), taskbarVisible: win32.taskbarVisible(), media: { ...media.get(), art: media.get().art ? '(image)' : '' }, log: recentLog.slice(-20),
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
// a Store app's logo straight from its package: AppxManifest.xml names it; the largest PNG of that name is used
function packageLogo(exePath) {
  const m = /^(.*\\WindowsApps\\[^\\]+)\\/i.exec(exePath || '');
  if (!m) return null;
  try {
    const dir = m[1], xml = fs.readFileSync(path.join(dir, 'AppxManifest.xml'), 'utf8');
    const rel = (/Square44x44Logo="([^"]+)"/.exec(xml) || /Square150x150Logo="([^"]+)"/.exec(xml) || /<Logo>([^<]+)<\/Logo>/.exec(xml) || [])[1];
    if (!rel) return null;
    const full = path.join(dir, rel), base = path.basename(full, path.extname(full)), folder = path.dirname(full);
    const pngs = fs.readdirSync(folder).filter((f) => f.toLowerCase().startsWith(base.toLowerCase()) && /\.png$/i.test(f) && !/contrast|lightunplated/i.test(f))
      .map((f) => ({ f, size: fs.statSync(path.join(folder, f)).size })).sort((a, b) => b.size - a.size);
    const file = pngs[0] ? path.join(folder, pngs[0].f) : fs.existsSync(full) ? full : null;
    const img = file && nativeImage.createFromPath(file);
    return img && !img.isEmpty() ? img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL() : null;
  } catch { return null; }
}
async function iconFor(p, size) {
  if (/\\WindowsApps\\/i.test(p)) { // a Store app (pinned or running by its exe): its Start menu entry, or its package's logo
    if (!storeEntry(p) && !appsAt) await refreshApps(); // the Store app list may still be loading right after start
    const se = storeEntry(p);
    if (se?.logo) p = se.path;
    else { const logo = packageLogo(p); if (logo) return logo; if (se) p = se.path; }
  }
  const pin = store.get().home.pins.find((x) => x.path === p);
  if (pin?.icon && fs.existsSync(pin.icon)) { // an icon you picked yourself
    if (/\.(exe|dll)$/i.test(pin.icon)) { const u = bigIcon(pin.icon); if (u) return u; }
    const img = nativeImage.createFromPath(pin.icon);
    if (!img.isEmpty()) return img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
  }
  if (/\.lnk$/i.test(p) && win32.isWin) {
    // never the shortcut file's own icon (Windows gives a blank page with an arrow): follow it to its icon / program
    try {
      const l = shell.readShortcutLink(p);
      const env = (f) => String(f || '').replace(/%([^%]+)%/g, (_m, v) => process.env[v] || '');
      const icon = env(l.icon), target = env(l.target), index = l.iconIndex || 0;
      const isDir = (() => { try { return fs.statSync(target).isDirectory(); } catch { return false; } })();
      const src = icon && fs.existsSync(icon) ? icon : target && fs.existsSync(target) && !isDir ? target : '';
      if (src) {
        if (/\.(exe|dll|ico)$/i.test(src) && (index !== 0 || /\.dll$/i.test(src))) { // a numbered icon inside a file (imageres.dll, shell32.dll…)
          const px = win32.iconPixels(src, index, 96);
          if (px) return nativeImage.createFromBitmap(px.data, { width: px.width, height: px.height }).toDataURL();
        }
        if (/\.(exe|ico)$/i.test(src)) return bigIcon(src) || (await app.getFileIcon(src, { size: 'large' }).then((i) => i.toDataURL()).catch(() => ''));
        if (!icon && !/\.(exe|ico|dll)$/i.test(src)) return ''; // a shortcut to a script: letter tile
      } else if (!l.target && !isDir) {
        // a shortcut without a target (Store / system app): its Start menu entry knows the logo
        const e = (apps || []).find((a) => a.name.toLowerCase() === path.basename(p, '.lnk').toLowerCase() && a.logo);
        if (e) { const img = nativeImage.createFromPath(e.logo); if (!img.isEmpty()) return img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL(); }
      }
    } catch {}
  }
  if (/\.(bat|cmd|py|pyw|ps1|vbs|jar)$/i.test(p)) return ''; // scripts: Windows' icon for them is a blank page
  const e = appEntry(p);
  if (e?.logo) { const img = nativeImage.createFromPath(e.logo); if (!img.isEmpty()) return img.resize({ width: 128, height: 128, quality: 'best' }).toDataURL(); }
  if (e?.dir) { const logo = packageLogo(`${e.dir}\\app.exe`); if (logo) return logo; } // Store app: read the logo from its package
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
  ipcMain.handle('weather', async (_e, city) => {
    const v = await system.weather(city), j = JSON.stringify(v);
    if (j !== lastWeatherJson) { const had = !!lastWeatherJson; lastWeatherJson = j; if (had) broadcast('weather-changed'); syncWindowsWallpaper(3000); } // every widget shows the same forecast, and so does the still
    return v;
  });
  ipcMain.handle('books', (_e, q) => system.books(q));
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
  // Home stays in front until the program has been started: Windows only lets a program take the front if the one
  // starting it is in front. Hiding Home first left new windows behind, and apps already running (Claude…) only
  // flashed in the taskbar or stayed on another desktop. If opening fails, Home stays open and says why.
  ipcMain.handle('launch', async (_e, p) => {
    if (!isKnownApp(p)) throw new Error('unknown app');
    win32.allowForeground();
    await launchApp(p);
    setTimeout(() => toggleHome(false), 150);
    bringForward(p);
    return '';
  });
  ipcMain.handle('open', (_e, url) => { if (!httpOnly(url)) throw new Error('only web links'); toggleHome(false); return shell.openExternal(url); });
  // the anime wallpaper gallery (Customize > Wallpaper)
  ipcMain.handle('gallery:search', (_e, o) => gallery.search({ sort: String(o?.sort || 'top'), q: String(o?.q || ''), page: Number(o?.page) || 1 }));
  ipcMain.handle('gallery:use', (_e, id) => gallery.use(String(id)));
  ipcMain.handle('gallery:downloaded', () => gallery.downloaded().map((name) => ({ name, path: gallery.fileOf(name) })));
  // themes (Customize > Themes)
  const themeMeta = (t) => ({ id: t.id, name: t.name, author: t.author, description: t.description, tags: t.tags, builtin: !!t.builtin, broken: t.broken || '', accent: t.accent || '', variables: t.variables });
  ipcMain.handle('theme:bundle', () => themeBundle());
  ipcMain.handle('themes:list', () => ({ themes: themes.all().map(themeMeta), surfaces: themes.SURFACE_NAMES, variables: themes.VARIABLES }));
  ipcMain.handle('themes:get', (_e, id) => themes.get(String(id)));
  ipcMain.handle('themes:new', (_e, from) => { const id = themes.create(from ? String(from) : ''); broadcastTheme(); return id; });
  ipcMain.handle('themes:save', (_e, id, t) => { themes.save(String(id), t); broadcastTheme(); return themes.get(String(id)); });
  ipcMain.handle('themes:delete', (_e, id) => { const ok = themes.remove(String(id)); if (ok) applySettings({ themes: { active: (store.get().themes.active || []).filter((x) => x !== id) } }); return ok; });
  ipcMain.handle('themes:folder', () => shell.openPath(themes.dir()));
  ipcMain.handle('themes:import', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Themes', extensions: ['sdtheme', 'json'] }] });
    if (r.canceled) return [];
    const ids = [];
    for (const f of r.filePaths.slice(0, 20)) { try { ids.push(themes.install(f)); } catch (err) { throw new Error(`${path.basename(f)}: ${err.message}`); } }
    broadcastTheme();
    return ids;
  });
  ipcMain.handle('themes:export', async (e, id) => {
    const t = themes.get(String(id)); if (!t) return false;
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: `${t.id}.sdtheme`, filters: [{ name: 'Syndicates theme', extensions: ['sdtheme'] }] });
    if (r.canceled || !r.filePath) return false;
    themes.exportTo(t.id, r.filePath);
    return true;
  });
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
    const pages = { location: 'ms-settings:privacy-location', home: 'ms-settings:', wifi: 'ms-settings:network-wifi', bluetooth: 'ms-settings:bluetooth', sound: 'ms-settings:sound', mixer: 'ms-settings:apps-volume', batterysaver: 'ms-settings:batterysaver', nightlight: 'ms-settings:nightlight', accessibility: 'ms-settings:easeofaccess', colors: 'ms-settings:colors', language: 'ms-settings:regionlanguage', lockscreen: 'ms-settings:lockscreen', taskbar: 'ms-settings:taskbar', background: 'ms-settings:personalization-background', touchpad: 'ms-settings:devices-touchpad' };
    if (!pages[page]) throw new Error('unknown page');
    return shell.openExternal(pages[page]);
  });
  ipcMain.handle('windows', () => windowsList);
  ipcMain.handle('tray:list', () => markTray(systray.icons()));
  // a click on a tray icon in the top bar (or its overflow panel): x, y within that window, in its pixels
  ipcMain.handle('tray:click', (e, id, kind, x, y) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || (w !== topWin && w !== flyWin)) return false;
    const b = w.getBounds(), pt = screen.dipToScreenPoint({ x: Math.round(b.x + (+x || 0)), y: Math.round(b.y + (+y || 0)) });
    if (w === flyWin) flyWin.hide(); // its menu needs the front, not our panel
    win32.allowForeground();
    return systray.click(String(id), String(kind), pt.x, pt.y);
  });
  ipcMain.handle('window:close', (_e, hwnd) => { if (!windowsList.some((w) => w.hwnd === hwnd)) throw new Error('unknown window'); win32.closeWindow(hwnd); setTimeout(() => pollWindows(true), 300); });
  // middle-click on a dock icon: another window of that app (only apps that have a window open right now)
  ipcMain.handle('window:new', async (_e, exe) => { if (!exe || !windowsList.some((w) => w.exe === exe)) throw new Error('unknown app'); win32.allowForeground(); await launchApp(exe); });
  ipcMain.handle('window:focus', (_e, hwnd, toggle = true) => { if (!windowsList.some((w) => w.hwnd === hwnd)) throw new Error('unknown window'); win32.focusWindow(hwnd, toggle !== false); setTimeout(() => pollWindows(true), 150); });
  ipcMain.handle('exe-icon', async (_e, exe) => {
    if (!windowsList.some((w) => w.exe === exe)) return '';
    return iconFor(exe, 'large');
  });
  ipcMain.handle('pin-target', (_e, p) => { // what a pinned shortcut points at, to match it with open windows
    if (!isKnownApp(p)) return '';
    if (/\\WindowsApps\\/i.test(p)) return storeKey(p);
    const ae = appEntry(p);
    if (ae?.exe) return ae.exe;
    if (ae?.appId?.includes('!')) { const [fam] = ae.appId.split('!'); const i = fam.lastIndexOf('_'); return `store:${fam.slice(0, i)}|${fam.slice(i + 1)}`.toLowerCase(); }
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
  ipcMain.on('island:size', (e, big) => { if (!islandWin || e.sender !== islandWin.webContents || islandBig === !!big) return; islandBig = !!big; placeIsland(); });
  ipcMain.on('island:mouse', (e, inside) => { if (islandWin && e.sender === islandWin.webContents) islandWin.setIgnoreMouseEvents(!inside, { forward: true }); });
  ipcMain.handle('timer:get', () => timer);
  ipcMain.handle('timer', (_e, action, arg) => { if (!TIMER_ACTIONS[action]) throw new Error('unknown timer action'); return TIMER_ACTIONS[action](arg); });
  ipcMain.handle('switch:test', () => { switchApp(1, 'test'); return { ...hotkeyStatus, lastSwitch }; });
  // the picture chosen for the app's wallpaper, as the Windows background too
  ipcMain.handle('desktops', () => { const v = win32.isWin ? win32.virtualDesktops(true) : { count: 1, current: 0, ids: [], names: [] }; if (v.ids[v.current]) deskId = v.ids[v.current]; return { ...v, ids: v.ids.length ? v.ids : ['local'], current: v.ids.length ? v.current : 0 }; });
  ipcMain.handle('desk:current', () => readDeskId() || 'local');
  ipcMain.handle('wall:winkey', (_e, id) => userWinwall(String(id || '')) || 'none'); // which file the Windows background is, to reload only when it changes
  ipcMain.handle('wallpaper:toWindows', () => {
    const f = store.get().wallpaper.file;
    if (!win32.isWin || !f || !/\.(jpe?g|png|bmp)$/i.test(f) || !fs.existsSync(f)) return false;
    return win32.setWindowsWallpaper(f);
  });
  ipcMain.handle('switch:status', () => ({ ...hotkeyStatus, lastSwitch, autoAccent: win32.isWin && win32.autoAccent(), worker: deskWorkerReady }));
  ipcMain.handle('gamer', (_e, on) => { setGamer(on === undefined ? !gamer : !!on); return gamer; });
  // click a desktop dot: step there with Win+Ctrl+Left/Right (Windows' own switch, with its slide animation)
  ipcMain.handle('topbar:desk', async (e, target) => {
    if (!topWin || e.sender !== topWin.webContents || !win32.isWin) return;
    await goToDesk(target);
    topApp = ''; topbarTick();
  });
  const fromHomeWin = (e) => homeWin && !homeWin.isDestroyed() && e.sender === homeWin.webContents;
  // Home's instant answers: copy a result, paste an emoji where you were, currency rates (ECB, via Frankfurter)
  ipcMain.handle('home:copy', (e, t) => { if (fromHomeWin(e) && typeof t === 'string') clipboard.writeText(t.slice(0, 1000)); });
  ipcMain.handle('home:paste', (e, t) => { if (!fromHomeWin(e) || typeof t !== 'string') return; clipboard.writeText(t.slice(0, 1000)); hideHome(); if (win32.isWin) setTimeout(() => win32.pressKeys([0x11, 0x56]), 180); });
  const rateCache = new Map();
  ipcMain.handle('home:rates', async (_e, base) => {
    base = String(base || '').toUpperCase(); if (!/^[A-Z]{3}$/.test(base)) return null;
    const hit = rateCache.get(base); if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
    const r = await net.fetch(`https://api.frankfurter.app/latest?from=${base}`, { headers: { Accept: 'application/json' } }).catch(() => null);
    if (!r?.ok) return null;
    const j = await r.json().catch(() => null); if (!j?.rates) return null;
    const v = { date: j.date, rates: j.rates }; rateCache.set(base, { t: Date.now(), v }); return v;
  });
  // lyrics for the song playing: LRCLIB (free, open, time-synced lyrics); cached per song
  const lyricCache = new Map();
  const parseLrc = (lrc) => String(lrc || '').split(/\r?\n/).flatMap((line) => {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)], text = line.replace(/\[[^\]]*\]/g, '').trim();
    return times.map((m) => ({ t: +m[1] * 60 + +m[2], text }));
  }).sort((a, b) => a.t - b.t);
  ipcMain.handle('lyrics:get', async (_e, title, artist, dur) => {
    title = String(title || '').slice(0, 200); artist = String(artist || '').slice(0, 200); dur = Math.round(+dur || 0);
    if (!title) return null;
    const key = `${title}|${artist}|${dur}`;
    if (lyricCache.has(key)) return lyricCache.get(key);
    const get = async (url) => { const r = await net.fetch(url, { headers: { 'User-Agent': 'Syndicates Desktop (https://github.com/fwyiling/yiling)' } }).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };
    const clean = (t) => t.replace(/\s*[([](official|lyrics?|audio|video|mv|hd|4k|remaster(ed)?|feat\.?|ft\.?)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+.*(official|lyrics|video).*$/i, '').trim();
    const p = new URLSearchParams({ track_name: clean(title), artist_name: artist }); if (dur) p.set('duration', String(dur));
    let j = artist ? await get(`https://lrclib.net/api/get?${p}`) : null;
    if (!j?.syncedLyrics) { const list = await get(`https://lrclib.net/api/search?${new URLSearchParams({ q: `${clean(title)} ${artist}`.trim() })}`); j = Array.isArray(list) ? list.find((x) => x.syncedLyrics && (!dur || Math.abs((x.duration || 0) - dur) < 8)) || list.find((x) => x.syncedLyrics) : null; }
    const v = j?.syncedLyrics ? { lines: parseLrc(j.syncedLyrics).filter((l, i, a) => l.text || (a[i + 1] && a[i + 1].t - l.t > 4)).slice(0, 400) } : { lines: [] };
    lyricCache.set(key, v); if (lyricCache.size > 60) lyricCache.delete(lyricCache.keys().next().value);
    return v;
  });
  // clipboard history (Home)
  const fromHome = (e) => homeWin && !homeWin.isDestroyed() && e.sender === homeWin.webContents;
  ipcMain.on('home:beat', (e) => { if (homeWin && !homeWin.isDestroyed() && e.sender === homeWin.webContents) homeBeat = Date.now(); });
  ipcMain.handle('clip:list', (e) => (fromHome(e) ? clips.list() : []));
  ipcMain.handle('clip:use', (e, id) => { // back on the clipboard, Home away, pasted where you were
    if (!fromHome(e) || !clips.use(String(id))) return false;
    hideHome(); if (win32.isWin) setTimeout(() => win32.pressKeys([0x11, 0x56]), 180); // Ctrl+V
    return true;
  });
  ipcMain.handle('clip:copy', (e, id) => fromHome(e) && clips.use(String(id))); // only copy
  ipcMain.handle('clip:pin', (e, id, on) => { if (fromHome(e)) clips.pin(String(id), !!on); });
  ipcMain.handle('clip:remove', (e, id) => { if (fromHome(e)) clips.remove(String(id)); });
  // daily goals: everyone may read them (the widget, Home), Home, Customize and the island change them
  const goalsWriter = (e) => fromHome(e) || [settingsWin, islandWin].some((w) => w && !w.isDestroyed() && e.sender === w.webContents);
  ipcMain.handle('goals:get', () => goals.status());
  ipcMain.handle('goals:start', (e, k) => (goalsWriter(e) ? goals.start(String(k)) : goals.status()));
  ipcMain.handle('goals:stop', (e) => (goalsWriter(e) ? goals.stop() : goals.status()));
  ipcMain.handle('goals:add', (e, k, m) => (goalsWriter(e) ? goals.add(String(k), Number(m)) : goals.status()));
  ipcMain.handle('goals:toggle', (e, k) => (goalsWriter(e) ? goals.toggle(String(k)) : goals.status()));
  ipcMain.handle('focus:get', () => focus.status());
  ipcMain.handle('focus:set', (e, on) => (goalsWriter(e) ? focus.set(!!on, 'manual') : focus.status()));
  ipcMain.handle('clip:clear', (e) => { if (fromHome(e) || (settingsWin && e.sender === settingsWin.webContents)) clips.clear(); });
  ipcMain.handle('update:status', () => updater.status());
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:token', (_e, t) => { updater.setToken(t); return updater.check(); });
  ipcMain.handle('update:apply', () => updater.apply(() => app.quit()).then(() => true, (e) => { throw e; }));
  ipcMain.handle('overview:open', () => { if (win32.isWin) win32.pressKeys([0x5B, 0x09]); }); // Windows' Task View (Win+Tab)
  ipcMain.handle('ime:get', () => imeNow);
  ipcMain.handle('topbar:timer', (e) => { if (topWin && e.sender === topWin.webContents) openIslandTimer(); });
  ipcMain.handle('flyout:open', (_e, panel, x, data) => openFlyout(panel, x, !data ? null
    : panel === 'windows' ? { hwnds: (data.hwnds || []).map(Number).filter(Number.isFinite).slice(0, 8), name: String(data.name || '').slice(0, 80) }
    : panel === 'tray' ? { skip: Math.max(0, data.skip | 0) } : null));
  ipcMain.handle('flyout:data', () => flyWin?.data || null);
  ipcMain.handle('thumbs', (e, rects) => {
    const host = BrowserWindow.fromWebContents(e.sender), list = (rects || []).map((r) => ({ hwnd: Number(r.hwnd), x: +r.x || 0, y: +r.y || 0, w: +r.w || 0, h: +r.h || 0, key: /^[a-z0-9]{1,8}$/.test(r.key || '') ? r.key : '', fill: !!r.fill }));
    if (host && host === flyWin && flyWin.panel === 'windows') return setThumbs(flyWin, list, windowsList);
    if (host) clearThumbs(host);
    return [];
  });
  // files dropped on an app in the dock: opened in that app (a Store app or one started through a launcher: each file
  // opens in its usual app instead)
  ipcMain.handle('dock:openWith', async (e, target, files) => {
    if (!dockWin || e.sender !== dockWin.webContents) return 0;
    const pin = store.get().home.pins.find((p) => p.path === target), run = windowsList.find((w) => w.exe === target);
    if (!pin && !run) throw new Error('not on the dock');
    files = (Array.isArray(files) ? files : []).filter((f) => typeof f === 'string' && path.isAbsolute(f) && fs.existsSync(f)).slice(0, 50);
    if (!files.length) return 0;
    let exe = run ? run.exe : '';
    if (pin && /\.exe$/i.test(pin.path)) exe = pin.path;
    else if (pin && /\.lnk$/i.test(pin.path)) { try { const l = shell.readShortcutLink(pin.path); if (/\.exe$/i.test(l.target) && !/\\Update\.exe$/i.test(l.target)) exe = l.target; } catch {} }
    if (win32.isWin && exe && !/\\WindowsApps\\/i.test(exe) && fs.existsSync(exe)) {
      win32.allowForeground();
      require('child_process').spawn(exe, files, { detached: true, stdio: 'ignore' }).unref();
      return files.length;
    }
    for (const f of files) await shell.openPath(f);
    return files.length;
  });
  // Bin: how full, open it, empty it (Windows asks), send files there (they can be restored from it)
  ipcMain.handle('bin:get', () => (win32.isWin ? (binState = win32.recycleBin()) : binState));
  ipcMain.handle('bin:open', () => { if (win32.isWin) require('child_process').spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).unref(); });
  ipcMain.handle('bin:empty', async () => { if (!win32.isWin || !binState.items) return false; const ok = await bgCall('emptyBin'); checkBin(); return !!ok; });
  ipcMain.handle('bin:trash', async (e, paths) => {
    if (!dockWin || e.sender !== dockWin.webContents || !Array.isArray(paths)) throw new Error('not allowed');
    let moved = 0;
    for (const p of paths.slice(0, 200)) {
      if (typeof p !== 'string' || !path.isAbsolute(p) || path.parse(p).root === p || !fs.existsSync(p)) continue; // never a whole drive
      try { await shell.trashItem(p); moved++; } catch (err) { console.warn('[bin]', err.message); }
    }
    checkBin();
    return moved;
  });
  // Screenshots stack
  ipcMain.handle('shots:list', () => (shotsState.items.length ? shotsState : refreshShots().then(() => shotsState)));
  ipcMain.handle('shots:open', (_e, p) => { if (!shots.isKnown(p)) throw new Error('not a screenshot'); flyWin?.hide(); return shell.openPath(p); });
  ipcMain.handle('shots:folder', () => { flyWin?.hide(); const dir = shots.folder(); return shell.openPath(fs.existsSync(dir) ? dir : app.getPath('pictures')); });
  ipcMain.handle('shots:take', () => { flyWin?.hide(); setTimeout(() => win32.pressKeys([0x5B, 0x10, 0x53]), 150); }); // Win+Shift+S: Windows' snipping
  // drag a screenshot out of the stack into another app (a chat, an email…), like a Mac stack
  ipcMain.on('shots:drag', (e, p) => {
    if (!shots.isKnown(p) || !fs.existsSync(p)) return;
    const t = shots.thumbFor(p);
    let icon = t ? nativeImage.createFromDataURL(t) : nativeImage.createFromPath(p);
    if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
    e.sender.startDrag({ file: p, icon: icon.resize({ width: 96 }) });
  });
  ipcMain.handle('flyout:action', (_e, what) => { flyWin?.hide(); if (FLY_ACTIONS[what]) setTimeout(FLY_ACTIONS[what], 60); });
  ipcMain.handle('flyout:state', () => ({ gamer, hotkey: store.get().home.hotkey }));
  ipcMain.on('flyout:ready', flyShow);
  ipcMain.handle('flyout:panel', () => flyWin?.panel || 'menu'); // the page asks once it's ready (the first message can come too early)
  ipcMain.handle('sys:get', () => sysctl.get());
  ipcMain.handle('net:wifi', async (_e, scan) => { const list = await netpower.wifiList(!!scan); return { list, needsLocation: !!netpower.wifiList.needsLocation }; });
  ipcMain.handle('net:connect', (_e, ssid, password, secure) => netpower.wifiConnect(ssid, password, secure));
  ipcMain.handle('power:get', async () => {
    const mode = await netpower.powerMode();
    // power mode changed in Windows' own Settings while low power mode was on: the switch follows Windows
    if (store.get().general.lowPower && mode && mode !== 'efficiency') { store.set({ general: { lowPower: null } }); lowPower = null; checkPause(); }
    return { battery: win32.battery(), mode, display: win32.refreshRates(), low: !!store.get().general.lowPower };
  });
  ipcMain.handle('power:set', async (_e, what, value) => {
    if (what === 'mode') { // picking another mode ends low power mode, so the switch never disagrees with the mode
      if (store.get().general.lowPower && value !== 'efficiency') { store.set({ general: { lowPower: null } }); lowPower = null; checkPause(); }
      await netpower.setPowerMode(String(value));
    }
    else if (what === 'hz') win32.setRefreshRate(Number(value));
    else if (what === 'low') await setLowPower(!!value);
    return { battery: win32.battery(), mode: await netpower.powerMode(), display: win32.refreshRates(), low: !!store.get().general.lowPower };
  });
  ipcMain.handle('sys:set', (_e, what, value) => sysctl.set(what, value));
  ipcMain.handle('dock:keys', (e, what) => { if (!dockWin || e.sender !== dockWin.webContents || !DOCK_KEYS[what]) return; if (what === 'start' && winKeyOn()) toggleHome(); else win32.pressKeys(DOCK_KEYS[what]); });
  ipcMain.handle('media:get', () => media.get());
  ipcMain.handle('media:control', (_e, cmd, app) => media.control(String(cmd), app ? String(app) : ''));
  // the sound panel's app list: each program's icon, by its exe (only exes the volume mixer reported)
  const appIconCache = new Map();
  ipcMain.handle('sys:appIcons', async () => {
    const out = {};
    for (const a of sysctl.get()?.apps || []) {
      if (!a.exe || !/\.exe$/i.test(a.exe)) continue;
      if (!appIconCache.has(a.exe)) appIconCache.set(a.exe, await app.getFileIcon(a.exe, { size: 'normal' }).then((i) => i.toDataURL()).catch(() => ''));
      out[a.exe] = appIconCache.get(a.exe);
    }
    return out;
  });
  // pin what you dropped on Home (a file you chose by dragging it there)
  // files found by searching Home: those may be launched and pinned too
  // recent files (Windows' Recent list), for Home's Files tab
  ipcMain.handle('files:recent', () => { const r = system.recentFiles(); for (const f of r) foundFiles.add(f.path); return r; });
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
    const se = storeEntry(exe); // Store apps are pinned by their Start menu entry, so they can be opened again
    if (se) return addPin(se.path, se.name);
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
// Store apps (Claude, WhatsApp…) live in C:\Program Files\WindowsApps, where their exe can't be started or read
// directly. Their folder is Name_Version_Arch_Resource_PublisherId; the Start menu entry is Name_PublisherId!App.
function storeEntry(p) {
  const m = /\\WindowsApps\\([^\\]+)\\/i.exec(p || '');
  if (!m) return null;
  const parts = m[1].split('_');
  if (parts.length < 2) return null;
  const family = `${parts[0]}_${parts[parts.length - 1]}`.toLowerCase();
  return (apps || []).find((a) => a.appId && a.appId.toLowerCase().startsWith(`${family}!`)) || null;
}
const storeKey = (p) => { const m = /\\WindowsApps\\([^\\]+)\\/i.exec(p || ''); if (!m) return ''; const x = m[1].split('_'); return `store:${x[0]}|${x[x.length - 1]}`.toLowerCase(); };
async function launchApp(p) {
  if (/\\WindowsApps\\/i.test(p)) { // open Store apps the way Start does
    let se = storeEntry(p);
    if (!se) { await refreshApps(true); se = storeEntry(p); }
    if (se) p = se.path;
  }
  if (p.startsWith('shell:AppsFolder\\')) { // Store and other Start-menu-only apps open the way Start opens them
    if (win32.isWin) require('child_process').spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
    return Promise.resolve('');
  }
  const err = await shell.openPath(p);
  if (err) throw new Error(err);
  return '';
}

// The exe a launch ends up in, to bring its window forward if Windows kept it back (single-instance apps hand the
// request to the copy already running, which Windows often won't let come to the front by itself).
function launchTarget(p) {
  const store = /\\WindowsApps\\([^_\\]+)_/i.exec(p);
  if (store) return (exe) => new RegExp(`\\\\WindowsApps\\\\${store[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_`, 'i').test(exe);
  if (p.startsWith('shell:AppsFolder\\')) {
    const fam = p.slice(17).split('_')[0];
    return fam ? (exe) => exe.toLowerCase().includes(`\\windowsapps\\${fam.toLowerCase()}_`) : null;
  }
  let target = p, args = '';
  if (/\.lnk$/i.test(p)) { try { const l = shell.readShortcutLink(p); target = l.target || ''; args = l.args || ''; } catch { return null; } }
  // Squirrel-installed apps (Claude, Discord, Slack…) start through Update.exe --processStart "app.exe"
  const ps = /--processStart\s+"?([^"\s]+\.exe)/i.exec(args);
  const name = (ps ? ps[1] : /\.exe$/i.test(target) ? path.basename(target) : '').toLowerCase();
  return name ? (exe) => path.basename(exe).toLowerCase() === name : null;
}
function bringForward(p) {
  if (!win32.isWin) return;
  const match = launchTarget(p);
  if (!match) return; // a document: its program opens it, allowed to come forward above
  let tries = 0;
  const t = setInterval(() => {
    const list = win32.listWindows(ownPids()).filter((w) => match(w.exe || ''));
    if (list.some((w) => w.active) || ++tries > 10) { clearInterval(t); return; } // it came forward by itself (or gave up after 3 s)
    if (tries >= 3 && list.length) { win32.focusWindow(list[0].hwnd, false); clearInterval(t); } // still behind after ~1 s: bring it
  }, 300);
}

// ---------- start ----------
app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  try { fs.writeFileSync(INSTANCE_FILE(), JSON.stringify({ appPath: app.getAppPath(), pid: process.pid, version: app.getVersion() })); } catch {}
  gallery.init(app.getPath('userData'));
  clips.init(app.getPath('userData'), () => win32.clipboardSeq());
  goals.init(app.getPath('userData'), () => { const g = store.get().goals || {}; return { revision: Math.max(0, Number(g.revision) || 0), hobby: Math.max(0, Number(g.hobby) || 0), remind: g.remind !== false }; },
    (title, body) => { if (Notification.isSupported()) new Notification({ title, body }).show(); });
  focus.init({ win32, cfg: () => store.get().focus || {}, onChange: (f) => broadcast('focus', f),
    nudge: (text) => { if (islandWin && !islandWin.isDestroyed()) islandWin.webContents.send('osd', { kind: 'focus', text }); else if (Notification.isSupported()) new Notification({ title: 'Focus mode', body: text, silent: true }).show(); } });
  // focus mode follows the revision stopwatch (when it's set to), unless it was switched on by hand
  const focusFollow = (g) => {
    if (store.get().focus?.auto === false) return;
    if (g.running === 'revision' && !focus.isOn()) focus.set(true, 'revision');
    else if (g.running !== 'revision' && focus.why() === 'revision') focus.set(false);
  };
  goals.onChange((g) => { broadcast('goals', g); focusFollow(g); });
  focusFollow(goals.status());
  // asleep or shut down: the revision stopwatch stops (nothing counts while the PC is off), and so does a countdown
  powerMonitor.on('suspend', () => { goals.suspend(); if (timer.state === 'running') TIMER_ACTIONS.pause(); });
  if (store.get().home.clipboard !== false) clips.start();
  clips.onChange((l) => { if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('clips', l); });
  themes.init(app.getPath('userData'));
  setTimeout(() => { readDeskId(); syncWallAccent(); syncWindowsWallpaper(1500); }, 2500); // the accent from the wallpaper, if that's on
  themes.watch(broadcastTheme); // a theme dropped into (or edited in) the themes folder applies at once
  syncWinKey();
  // it keeps running across restarts by default (like Lively), started from start.bat too: once, for everyone who
  // hasn't chosen yet; switch it off in the tray menu or Customize > General and it stays off
  if (!store.get().general.autostartChosen && !process.argv.includes('--smoke')) store.set({ general: { startWithWindows: true, autostartChosen: true } });
  if (win32.isWin && !process.argv.includes('--smoke')) setAutostart(store.get().general.startWithWindows); // keeps the path current after moving/updating
  const sdHandler = (req) => {
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
    if (u.host === 'media' && u.pathname === '/wallpaper') { // the picked photo / video (for a desktop, when each has its own)
      const f = wallFor(store.get().wallpaper, u.searchParams.get('desk') || '').file;
      if (!f || !fs.existsSync(f)) return new Response('no file', { status: 404 });
      return net.fetch(pathToFileURL(f).href, { headers: req.headers }); // forwards Range for video seeking
    }
    if (u.host === 'media' && u.pathname === '/gallery') { // a picture downloaded from the gallery (by name, only from its folder)
      const f = gallery.fileOf(u.searchParams.get('f') || '');
      if (!f || !fs.existsSync(f)) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(f).href);
    }
    if (u.host === 'media' && u.pathname === '/clip') { // a picture from the clipboard history (by name, only from its folder)
      const f = clips.imageFile(u.searchParams.get('f') || '');
      return f && fs.existsSync(f) ? net.fetch(pathToFileURL(f).href) : new Response('not found', { status: 404 });
    }
    if (u.host === 'media' && u.pathname === '/winwall') { // nothing picked: your Windows background (that desktop's own, if Windows has one)
      const f = userWinwall(u.searchParams.get('desk') || '');
      if (!f || !/\.(jpe?g|png|bmp|gif|webp|jfif)$/i.test(f) || !fs.existsSync(f)) return new Response('no picture', { status: 404 });
      return net.fetch(pathToFileURL(f).href);
    }
    return new Response('not found', { status: 404 });
  };
  protocol.handle('sd', sdHandler);
  // the lock screen snapshot renders in its own session (its zoom must not reach the app's pages): same pages there
  session.fromPartition('sd-snapshot').protocol.handle('sd', sdHandler);
  // a zoom left on the app's pages (the old snapshot did that, and Chromium remembers it): back to 100%
  app.on('web-contents-created', (_e, wc) => wc.on('did-finish-load', () => { try { if (wc.getURL().startsWith('sd://') && Math.abs(wc.getZoomFactor() - 1) > 0.001 && wc.getType() === 'window' && wc.session === session.defaultSession) wc.setZoomFactor(1); } catch {} }));
  // device names (headphones connected…) for the island: our own pages may read them
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => (permission === 'media' ? String(origin).startsWith('sd://') : true));
  // nothing may capture the screen (the music-reactive wallpaper that did is gone)
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    cb({});
  });
  wireIpc();
  setTimeout(() => refreshApps(true), 4000); // in the background, after the wallpaper is up
  let lastMediaKey = '';
  media.onChange((st) => { broadcast('media', st); const k = mediaKey(); if (k !== lastMediaKey) { lastMediaKey = k; syncWindowsWallpaper(4000); } });
  systray.onChange((list) => { const marked = markTray(list); for (const w of [topWin, flyWin]) if (w && !w.isDestroyed()) w.webContents.send('tray', marked); });
  // system controls: the control centre shows them, the island pops up when volume / brightness change
  sysctl.onChange((st, prev) => { broadcast('sys', st); outputsChanged(st, prev); }); // volume / brightness / radios for the control centre (Windows shows its own volume pop-up)
  sysctl.start();
  // Caps Lock: a little pop-up in the island when it changes
  let caps = win32.capsLock();
  setInterval(() => { const c = win32.capsLock(); if (c !== caps) { caps = c; osd({ kind: 'caps', on: c }); } }, 300);
  media.start();
  buildWallpapers();
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  powerMonitor.on('on-battery', () => { checkPause(); broadcast('power', 'battery'); });
  powerMonitor.on('on-ac', () => { checkPause(); broadcast('power', 'ac'); });
  startDeskWatch();
  if (store.get().general.edgeSwitch !== false) vdesk.start(); // ready before the first drag (it takes a moment to start)
  setInterval(watchDesktops, 100); // only while the worker isn't running
  setInterval(() => { if (!quiet()) checkPause(); }, 700);
  setInterval(watchFullscreen, 150); // cheap checks; a new desktop or a closed window resumes the wallpaper quickly
  setInterval(() => { if (!dockWin && !gamer && win32.isWin) { const ov = win32.systemOverlayActive() && !win32.foregroundNull(); if (ov !== overlayOn) { overlayOn = ov; checkPause(); } } }, 300);
  setInterval(sendCursor, 50);
  registerHotkey();
  tray = new Tray(icon().resize({ width: 16, height: 16 }));
  tray.on('click', () => openSettings()); // the tray icon is the obvious way in; Home has its own shortcut and dock button
  updateTray();
  if (store.get().general.hideDesktopIcons) win32.setDesktopIcons(false);
  lowPower = store.get().general.lowPower || null;
  if (store.get().topbar.on) setTopbar(true);
  if (store.get().island.on) setIsland(true);
  if (store.get().dock.on) setDock(true);
  else if (win32.isWin && win32.taskbarOpacity() < 255) win32.showTaskbar(true); // left transparent by a run that didn't end cleanly
  else if (win32.isWin) win32.showTaskbar(true); // in case a crash left it hidden
  // started by you (shortcut, Start menu): open Customize, like Lively; started with Windows: stay in the tray
  if (!process.argv.includes('--smoke') && !process.argv.includes('--autostart')) openSettings(); // first run: show what can be customized
  // updates: checked 30 s after start and every 6 hours; a new build is announced once, installed with one click
  if (!process.argv.includes('--smoke') && store.get().general.autoUpdate !== false) {
    let told = '';
    updater.start((st) => {
      broadcast('update', st); updateTray();
      if (st.available && st.latest && st.latest !== told && Notification.isSupported()) {
        told = st.latest;
        const n = new Notification({ title: 'Syndicates Desktop update', body: 'A new version is ready. Click to install it (the app restarts by itself).', silent: true });
        n.on('click', () => updater.apply(() => app.quit()).catch(() => {}));
        n.show();
      }
    });
  } else updater.onChange((st) => { broadcast('update', st); updateTray(); });
  // --smoke: start, run for a while, print diagnostics and quit (used by the Windows test run)
  if (process.argv.includes('--smoke')) {
    // the taskbar hook: show the taskbar the way Explorer would, and it must be heard (and hidden again, the dock is on)
    setTimeout(() => { if (win32.isWin && dockWin) win32.showTaskbar(true); }, 11000);
    setTimeout(() => { console.log('SMOKE ' + JSON.stringify(diagnostics())); app.quit(); }, 15000);
  }
});
app.on('second-instance', (_e, _argv, _cwd, data) => {
  if (data?.appPath && !sameDir(data.appPath, app.getAppPath())) { if (!app.isQuitting) app.quit(); return; } // another copy (an update) takes over
  openSettings(); // opening it again while it runs brings Customize to the front
});
let workerStopping = false;
app.on('before-quit', (e) => {
  // the window-drag watcher first: asked to stop, it leaves between two checks (killing it mid-call crashed the app)
  if (deskWorker && !workerStopping) {
    workerStopping = true; e.preventDefault();
    let gone = false; const go = () => { if (gone) return; gone = true; app.quit(); };
    deskWorker.once('exit', go); deskWorker.postMessage({ stop: true }); setTimeout(go, 500);
    return;
  }
  app.isQuitting = true;
  for (const t of [dockTimer, dockEdgeTimer, topTimer, taskbarTimer]) clearInterval(t); // nothing may hide the taskbar after this
  syncTaskbarWatch(false);
  media.stop(); sysctl.stop(); systray.stop(); // Explorer has every icon too: its tray carries on
  winkey.use(null); // the Windows key opens Start again
  try { store?.flush(); } catch {}
  if (store?.get().general.hideDesktopIcons) win32.setDesktopIcons(true); // give the icons back
  if (topWin && win32.isWin) win32.releaseEdge(topWin);
  if (dockWin && win32.isWin) { win32.releaseEdge(dockWin); win32.showTaskbar(true); win32.setTaskbarAutoHide(!!store.get().dock.prevAutoHide); } // and the taskbar
});
app.on('will-quit', () => {
  try { goals.flush(); } catch {} // "last seen": a restart soon after carries on counting, a shutdown doesn't
  globalShortcut.unregisterAll();
  deskWorker?.terminate();
  vdesk.stop();
  if (win32.isWin) win32.edgeSnap(true); // Windows' snap-to-edge back as the user had it, even if quitting mid-drag
  if (win32.isWin && store?.get().dock.on) win32.showTaskbar(true); // last word: the taskbar is visible when we're gone
});
app.on('window-all-closed', () => {}); // keep running in the tray
