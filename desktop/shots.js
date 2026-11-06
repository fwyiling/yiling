// Recent screenshots, for the dock's Screenshots stack: Windows' Screenshots folder (Win+PrtScn and the Snipping
// Tool save there; wherever it was moved to), newest first, with small thumbnails, watched for new ones.
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');
const win32 = require('./win32');

const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;
const SHELL_FOLDERS = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders';
function folder() {
  const moved = win32.isWin ? win32.regString(SHELL_FOLDERS, '{B7BEDE81-DF94-4682-A7D8-57A52620B86F}') : ''; // FOLDERID_Screenshots
  if (moved && fs.existsSync(moved)) return moved;
  return path.join(app.getPath('pictures'), 'Screenshots');
}

const thumbs = new Map(); // path|mtime -> data URL
async function thumb(p, mtime) {
  const key = `${p}|${mtime}`;
  if (thumbs.has(key)) return thumbs.get(key);
  let img = null;
  try { img = await nativeImage.createThumbnailFromPath(p, { width: 320, height: 200 }); } catch {} // Windows' own thumbnail (fast, cached by Explorer)
  if (!img || img.isEmpty()) { img = nativeImage.createFromPath(p); if (!img.isEmpty()) img = img.resize({ width: 320 }); }
  const url = img && !img.isEmpty() ? `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}` : '';
  thumbs.set(key, url);
  if (thumbs.size > 80) thumbs.delete(thumbs.keys().next().value);
  return url;
}

const known = new Set(); // what the stack showed: only these may be opened / dragged out
async function list(n = 12) {
  const dir = folder();
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => IMG.test(f)); } catch { return { dir, items: [] }; }
  const items = names.map((f) => {
    const p = path.join(dir, f);
    try { const st = fs.statSync(p); return st.isFile() ? { name: f, path: p, time: st.mtimeMs } : null; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.time - a.time).slice(0, n);
  for (const it of items) { it.thumb = await thumb(it.path, it.time); known.add(it.path); }
  return { dir, items };
}

// a new screenshot (or one deleted): tell the dock, a moment after the file is fully written
let watcher = null, watchedDir = '', timer = null;
function watch(onChange) {
  const dir = folder();
  if (dir !== watchedDir) {
    watcher?.close(); watcher = null; watchedDir = dir;
    try { watcher = fs.watch(dir, () => { clearTimeout(timer); timer = setTimeout(onChange, 700); }); } catch { watchedDir = ''; } // not there yet
  }
  setTimeout(() => watch(onChange), 60000); // folder moved or created since
}

module.exports = { folder, list, watch, isKnown: (p) => known.has(p), thumbFor: (p) => [...thumbs.entries()].find(([k]) => k.startsWith(`${p}|`))?.[1] || '' };
