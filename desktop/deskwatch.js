// Watches for desktop switches on a worker thread, and hides Windows' "Desktop N" label there too.
// The Electron main thread also answers Windows' messages for every app window (top bar, dock, island…).
// If it is busy walking every window on the screen just as Windows slides the desktops, the slide waits
// for it and hitches. Here, that work never touches the main thread.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const win32 = require('./win32');

let screenRect = workerData?.screen || null;
let hideLabel = workerData?.hideLabel !== false;
parentPort.on('message', (m) => {
  if (m && m.screen) screenRect = m.screen;
  if (m && typeof m.hideLabel === 'boolean') hideLabel = m.hideLabel;
});

const st = win32.status();
if (!win32.isWin || !st.ready) {
  parentPort.postMessage({ type: 'fail', error: st.error || 'not Windows' });
} else {
  parentPort.postMessage({ type: 'ready' });
  let current = -1, hunt = 0, sinceFound = -1;
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
