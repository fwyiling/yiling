// One Windows call that waits (a dialog, a slow shell call), run on its own short-lived thread so the main
// thread, which runs the bars and answers Windows for every app window, never stops for it.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const win32 = require('./win32');
const CALLS = { emptyBin: () => win32.emptyBin() }; // only these
const fn = CALLS[workerData && workerData.fn];
parentPort.postMessage(fn ? fn() : null);
