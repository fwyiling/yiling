// Clipboard history (like Win+V, in Home): text, links and pictures you copy, newest first, pinnable. Windows'
// clipboard sequence number is checked twice a second (it changes with every copy; reading it costs nothing), and only
// then the clipboard itself. Copies that password managers mark as private are never kept (the formats Windows'
// own clipboard history honours). Kept on this PC only: a JSON file and small pictures in the app's folder.
const { clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX = 60; // plus the pinned ones
let dir = '', file = '', items = [], lastSeq = -1, lastHash = '', timer = null, saveT = null, seqOf = () => -1;
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(list()); };
const list = () => items.map(({ id, type, text, img, w, h, pinned, at }) => ({ id, type, text: type === 'image' ? '' : text.slice(0, 2000), img, w, h, pinned, at }));
const isUrl = (t) => /^https?:\/\/\S+$/i.test(t.trim());

function init(userData, sequenceNumber) {
  dir = path.join(userData, 'clips'); file = path.join(userData, 'clipboard.json');
  if (sequenceNumber) seqOf = sequenceNumber;
  fs.mkdirSync(dir, { recursive: true });
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')).filter((x) => x && x.id && (x.type !== 'image' || fs.existsSync(path.join(dir, x.img || '')))); } catch { items = []; }
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(items)); } catch {} }, 400);
}
function prune() {
  const keep = items.filter((x) => x.pinned).concat(items.filter((x) => !x.pinned).slice(0, MAX));
  const ids = new Set(keep.map((x) => x.id));
  for (const x of items) if (!ids.has(x.id) && x.img) fs.rmSync(path.join(dir, x.img), { force: true });
  items = items.filter((x) => ids.has(x.id));
}
// marked private by the program that copied it (password managers): not kept
function isPrivate() {
  try {
    if (clipboard.readBuffer('ExcludeClipboardContentFromMonitorProcessing').length) return true;
    const can = clipboard.readBuffer('CanIncludeInClipboardHistory');
    if (can.length >= 4 && can.readUInt32LE(0) === 0) return true;
  } catch {}
  return false;
}
function add(item, hash) {
  const same = items.findIndex((x) => x.hash === hash);
  if (same >= 0) { const [x] = items.splice(same, 1); x.at = Date.now(); items.unshift(x); }
  else items.unshift({ id: crypto.randomBytes(6).toString('hex'), hash, at: Date.now(), pinned: false, ...item });
  prune(); save(); emit();
}
function poll() {
  const seq = seqOf();
  if (seq !== -1) { if (seq === lastSeq) return; lastSeq = seq; } // Windows: nothing new since the last look
  try {
    const formats = clipboard.availableFormats();
    if (formats.some((f) => /image/i.test(f))) {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const png = img.toPNG(), hash = crypto.createHash('sha1').update(png).digest('hex');
        if (hash === lastHash) return; lastHash = hash;
        if (isPrivate()) return;
        const sz = img.getSize(), k = Math.min(1, 640 / Math.max(sz.width, sz.height));
        const name = `clip-${hash.slice(0, 16)}.png`;
        if (!fs.existsSync(path.join(dir, name))) fs.writeFileSync(path.join(dir, name), (k < 1 ? img.resize({ width: Math.round(sz.width * k), quality: 'good' }) : img).toPNG());
        add({ type: 'image', img: name, w: sz.width, h: sz.height, text: '', full: false }, hash);
        return;
      }
    }
    const t = clipboard.readText();
    if (!t || !t.trim()) return;
    const hash = crypto.createHash('sha1').update(t).digest('hex');
    if (hash === lastHash) return; lastHash = hash;
    if (isPrivate()) return;
    add({ type: isUrl(t) ? 'link' : 'text', text: t.slice(0, 20000) }, hash);
  } catch {}
}
function start() { if (!timer) { timer = setInterval(poll, 500); poll(); } }
function stop() { clearInterval(timer); timer = null; }

/** Put an entry back on the clipboard (the caller then pastes it). */
function use(id) {
  const x = items.find((i) => i.id === id);
  if (!x) return false;
  if (x.type === 'image') { const img = nativeImage.createFromPath(path.join(dir, x.img)); if (img.isEmpty()) return false; clipboard.writeImage(img); }
  else clipboard.writeText(x.text);
  lastHash = x.hash; // not a new copy
  x.at = Date.now(); items = [x, ...items.filter((i) => i !== x)]; save(); emit();
  return true;
}
function pin(id, on) { const x = items.find((i) => i.id === id); if (x) { x.pinned = !!on; save(); emit(); } }
function remove(id) { const x = items.find((i) => i.id === id); if (!x) return; if (x.img) fs.rmSync(path.join(dir, x.img), { force: true }); items = items.filter((i) => i !== x); save(); emit(); }
function clear() { for (const x of items) if (!x.pinned && x.img) fs.rmSync(path.join(dir, x.img), { force: true }); items = items.filter((x) => x.pinned); save(); emit(); }
const imageFile = (name) => (/^clip-[0-9a-f]{16}\.png$/.test(name) ? path.join(dir, name) : '');

module.exports = { init, start, stop, list, use, pin, remove, clear, imageFile, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
