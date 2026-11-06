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
let lights = !!workerData?.lights, ownPids = workerData?.ownPids || [];
let imeOn = workerData?.ime !== false;
parentPort.on('message', (m) => {
  if (m && m.screen) screenRect = m.screen;
  if (m && typeof m.hideLabel === 'boolean') hideLabel = m.hideLabel;
  if (m && typeof m.lights === 'boolean') { lights = m.lights; if (!lights) sendLights(null); }
  if (m && Array.isArray(m.ownPids)) ownPids = m.ownPids;
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

// Mac window buttons: where the window in front has its minimize / maximize / close, so the main thread can lay the
// lights over them. Sent only when that changes; hidden while a window is being dragged or resized.
let lastLights = '';
function sendLights(b) {
  const key = b ? `${b.hwnd}|${b.x}|${b.y}|${b.width}|${b.height}|${b.max}|${b.color}` : '';
  if (key === lastLights) return;
  lastLights = key;
  parentPort.postMessage({ type: 'lights', b });
}
function watchLights() {
  if (!lights) return;
  sendLights(win32.inMoveSize() ? null : win32.captionButtons(ownPids));
}

// the input method in front: Pinyin (Chinese) or English, for the top bar; sent when it changes
let lastIme = '';
function watchIme() {
  if (!imeOn) return;
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
  setInterval(watchLights, 50);
  setInterval(watchIme, 250); // often: snapping has to be paused before the pointer reaches the edge
  setInterval(() => {
    const vd = win32.virtualDesktops(); // two small registry reads
    if (vd.current !== current) {
      const from = current;
      current = vd.current;
      if (from !== -1) {
        parentPort.postMessage({ type: 'switch', from, to: current, count: vd.count });
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
