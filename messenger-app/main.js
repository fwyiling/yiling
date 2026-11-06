const { app, BrowserWindow, Menu, shell } = require('electron');
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
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
