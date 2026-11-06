const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SITE = 'https://messenger.abeto.co/';

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    title: 'Messenger',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#6cc3bf',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  win.loadURL(SITE);

  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    // -3 is ERR_ABORTED (navigation replaced), not a real failure
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });

  win.webContents.on('page-title-updated', (e) => e.preventDefault());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.loadURL(SITE);
      e.preventDefault();
    }
  });
}

// No installer, so the app adds its own Desktop and Start Menu shortcuts on first run.
// A marker file keeps them from reappearing if the user deletes them.
function createShortcutsOnce() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const marker = path.join(app.getPath('userData'), 'shortcuts-created');
  if (fs.existsSync(marker)) return;
  const link = { target: process.execPath, icon: process.execPath, iconIndex: 0, description: 'Messenger' };
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  for (const dir of [app.getPath('desktop'), startMenu]) {
    try { shell.writeShortcutLink(path.join(dir, 'Messenger.lnk'), link); } catch {}
  }
  try { fs.writeFileSync(marker, ''); } catch {}
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(null);
  app.whenReady().then(() => {
    createShortcutsOnce();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
