// Watches for desktop switches on a worker thread, and hides Windows' "Desktop N" label there too.
// The Electron main thread also answers Windows' messages for every app window (top bar, dock, island…).
// If it is busy walking every window on the screen just as Windows slides the desktops, the slide waits
// for it and hitches. Here, that work never touches the main thread.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const win32 = require('./win32');

let screenRect = workerData?.screen || null;
let hideLabel = workerData?.hideLabel !== false;
let edgeSwitch = workerData?.edgeSwitch !== false;
let imeOn = workerData?.ime === true; // off unless switched on in Customize
parentPort.on('message', (m) => {
  if (m && m.screen) screenRect = m.screen;
  if (m && typeof m.hideLabel === 'boolean') hideLabel = m.hideLabel;
  if (m && typeof m.ime === 'boolean') imeOn = m.ime;
  if (m && typeof m.edgeSwitch === 'boolean') { edgeSwitch = m.edgeSwitch; if (!edgeSwitch && snapPaused) { snapPaused = false; win32.edgeSnap(true); } }
});
// A window dragged against the far left / right edge of the screen and held there: onto the desktop next door,
// like Spaces on a Mac (the main thread moves it). Held on, it keeps going a desktop at a time.
// Windows' own snap-to-half at that edge would fight it, so it's paused while the window is near the left / right
// edge, and back on as soon as it isn't (dragging to the top to maximize, Win+arrows and snap layouts stay).
const EDGE_HOLD = 550, EDGE_AGAIN = 1100;
let edgeSince = 0, edgeDir = 0, lastEdge = -Infinity, snapPaused = false;
function watchEdge(now) {
  const d = edgeSwitch ? win32.dragState() : null;
  const s = d && d.screen;
  const zone = s ? Math.max(160, s.width * 0.15) : 0; // reached before the pointer can get to the edge
  const near = !!d && (d.x <= s.left + zone || d.x >= s.left + s.width - 1 - zone);
  if (near !== snapPaused) { snapPaused = near; win32.edgeSnap(!near); }
  const dir = !d ? 0 : d.x <= s.left ? -1 : d.x >= s.left + s.width - 1 ? 1 : 0;
  if (!dir || dir !== edgeDir) { edgeSince = dir ? now : 0; edgeDir = dir; return; }
  if (now - edgeSince >= EDGE_HOLD && now - lastEdge >= EDGE_AGAIN) {
    lastEdge = now; edgeSince = now;
    parentPort.postMessage({ type: 'edge', hwnd: d.hwnd, dir });
  }
}

// The input method in front: Pinyin (Chinese) or English, for the top bar; sent when it changes. Asking it is a
// message to the app in front, so it's asked as rarely as possible: once, half a second after Shift is let go
// (Pinyin's switch) or another window comes to the front; never while typing. In between only the key state and
// the window in front are looked at, which nothing else notices.
let lastIme = '', shiftWas = false, fgWas = 0, askAt = Date.now() + 1000;
function watchIme() {
  if (!imeOn) return;
  const now = Date.now(), shift = win32.keyDown(0x10), fg = win32.foregroundId();
  if (shiftWas && !shift) askAt = now + 500;
  if (fg !== fgWas) { fgWas = fg; askAt = now + 500; }
  shiftWas = shift;
  if (!askAt || now < askAt) return;
  askAt = 0;
  const m = win32.inputMode();
  const key = m ? `${m.lang}|${m.ime}|${m.native}` : '';
  if (!m || key === lastIme) return;
  lastIme = key;
  parentPort.postMessage({ type: 'ime', m });
}

const st = win32.status();
if (!win32.isWin || !st.ready) {
  parentPort.postMessage({ type: 'fail', error: st.error || 'not Windows' });
} else {
  parentPort.postMessage({ type: 'ready' });
  let current = -1, hunt = 0, sinceFound = -1;
  win32.edgeSnap(true); // the user's own snap setting, in case an earlier run ended while it was paused
  setInterval(() => watchEdge(Date.now()), 25);
  setInterval(watchIme, 50); // often: snapping has to be paused before the pointer reaches the edge
  setInterval(() => {
    const vd = win32.virtualDesktops(); // two small registry reads
    if (vd.current !== current) {
      const from = current;
      current = vd.current;
      if (from !== -1) {
        parentPort.postMessage({ type: 'switch', from, to: current, count: vd.count, id: vd.ids[current] || '' });
        if (hideLabel && screenRect) { hunt = 16; sinceFound = -1; } // the label shows up within a few frames
      }
    }
    if (hunt > 0) {
      hunt--;
      const found = win32.hideSwitchLabel(screenRect);
      if (found.length) { sinceFound = 0; parentPort.postMessage({ type: 'label', found }); }
      else if (sinceFound >= 0 && ++sinceFound > 4) hunt = 0; // gone for good: stop looking
    }
  }, 50);
}
