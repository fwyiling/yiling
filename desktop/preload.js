// The only bridge between pages and the app: a small, fixed set of calls.
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => { const h = (_e, v) => cb(v); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('sd', {
  platform: process.platform,
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.invoke('settings:set', patch),
  paused: () => ipcRenderer.invoke('paused'),
  stats: () => ipcRenderer.invoke('stats'),
  weather: (city) => ipcRenderer.invoke('weather', city),
  apps: () => ipcRenderer.invoke('apps'),
  appIcon: (p) => ipcRenderer.invoke('app-icon', p),
  launch: (p) => ipcRenderer.invoke('launch', p),
  open: (url) => ipcRenderer.invoke('open', url),
  pickFile: (kind) => ipcRenderer.invoke('pick-file', kind),
  toggleHome: (show) => ipcRenderer.invoke('home:toggle', show),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  taskbar: () => ipcRenderer.invoke('taskbar:get'),
  setTaskbar: (patch) => ipcRenderer.invoke('taskbar:set', patch),
  applyLockScreen: () => ipcRenderer.invoke('lock:apply'),
  windowsSettings: (page) => ipcRenderer.invoke('windows-settings', page),
  windows: () => ipcRenderer.invoke('windows'),
  focusWindow: (hwnd) => ipcRenderer.invoke('window:focus', hwnd),
  exeIcon: (exe) => ipcRenderer.invoke('exe-icon', exe),
  pinTarget: (p) => ipcRenderer.invoke('pin-target', p),
  onWindows: on('windows'),
  onSettings: on('settings'),
  onPause: on('pause'),
  onCursor: on('cursor'),
  onHomeShown: on('home-shown'),
});
