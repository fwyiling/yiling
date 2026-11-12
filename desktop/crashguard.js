// Keeps the app standing when something goes wrong, and writes down what did (crash.log in the app's folder, also in
// Customize > General > Copy diagnostics):
//   - an error in the main process is logged instead of Electron's "A JavaScript error occurred" box (which left the
//     app half-working behind it)
//   - a window whose page crashed or ran out of memory is loaded again (a few times a minute at most), instead of
//     staying blank; one that hangs for 15 s is restarted the same way
//   - the graphics process going down is logged (Chromium starts it again by itself)
//   - a session that ended without quitting (a crash Windows had to clean up) is noticed at the next start, and
//     Windows' own crash dumps are kept on this PC (never sent anywhere) so it can be looked into
const { app, crashReporter } = require('electron');
const fs = require('fs');
const path = require('path');

let file = '', flag = '', lastSession = null, onGone = () => {};
const recent = [];
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function log(kind, msg) {
  const line = `${stamp()} [${kind}] ${String(msg).replace(/\s+\n/g, '\n').slice(0, 2000)}`;
  recent.push(line); if (recent.length > 30) recent.shift();
  try {
    if (file) {
      try { if (fs.statSync(file).size > 256 * 1024) fs.renameSync(file, file + '.old'); } catch {}
      fs.appendFileSync(file, line + '\n');
    }
  } catch {}
  try { process.stderr.write(line + '\n'); } catch {}
}

const nameOf = (wc) => { try { const u = new URL(wc.getURL()); return (u.pathname.split('/').pop() || u.host || 'page').replace(/\.html$/, ''); } catch { return 'page'; } };
const restarts = new WeakMap(); // webContents -> times it was reloaded in the last minute
function revive(wc, why) {
  if (!wc || wc.isDestroyed() || app.isQuitting) return;
  const now = Date.now(), times = (restarts.get(wc) || []).filter((t) => now - t < 60e3);
  if (times.length >= 3) { log('window', `${nameOf(wc)}: ${why}, again; not reloading it any more this minute`); return; }
  times.push(now); restarts.set(wc, times);
  setTimeout(() => { if (!wc.isDestroyed() && !app.isQuitting) { try { wc.reload(); } catch (e) { log('window', `${nameOf(wc)}: reload failed: ${e.message}`); } } }, 400 * times.length);
}

/** Call first thing, before the app is ready. */
function init() {
  process.on('uncaughtException', (e) => log('error', e?.stack || e));
  process.on('unhandledRejection', (e) => log('promise', e?.stack || e));
  try { crashReporter.start({ uploadToServer: false, compress: true }); } catch {} // dumps stay in app.getPath('crashDumps')
  app.on('render-process-gone', (_e, wc, d) => {
    if (d.reason === 'clean-exit') return;
    try { onGone(wc); } catch {}
    log('window', `${nameOf(wc)}: page ${d.reason} (exit code ${d.exitCode})`);
    revive(wc, d.reason);
  });
  app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') log('process', `${d.type}${d.name ? ` (${d.name})` : ''} ${d.reason} (exit code ${d.exitCode})`); });
  app.on('web-contents-created', (_e, wc) => {
    let hangT = null;
    wc.on('unresponsive', () => {
      clearTimeout(hangT);
      hangT = setTimeout(() => { if (wc.isDestroyed()) return; log('window', `${nameOf(wc)}: not responding for 15 s, restarting it`); try { wc.forcefullyCrashRenderer(); } catch {} }, 15e3); // then it's reloaded as a crashed page
    });
    wc.on('responsive', () => clearTimeout(hangT));
    wc.on('destroyed', () => clearTimeout(hangT));
    wc.on('preload-error', (_e2, p, err) => log('window', `${nameOf(wc)}: preload ${path.basename(p)}: ${err?.message}`));
  });
  app.whenReady().then(() => {
    const early = recent.slice(); // what came before ready, written now that there's a file
    file = path.join(app.getPath('userData'), 'crash.log');
    for (const l of early) { try { fs.appendFileSync(file, l + '\n'); } catch {} }
    flag = path.join(app.getPath('userData'), 'running.json');
    try { lastSession = JSON.parse(fs.readFileSync(flag, 'utf8')); } catch { lastSession = null; }
    if (lastSession) log('start', `the last session (started ${lastSession.at}, pid ${lastSession.pid}) ended without quitting: it crashed or was ended from outside`);
    try { fs.writeFileSync(flag, JSON.stringify({ pid: process.pid, at: stamp() })); } catch {}
  });
  app.on('will-quit', () => { try { fs.rmSync(flag, { force: true }); } catch {} });
}

/** For "Copy diagnostics": the last entries, and whether the last session crashed. */
function summary() {
  let tail = [];
  try { tail = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-25); } catch { tail = recent.slice(-25); }
  let dumps = 0;
  try { const d = app.getPath('crashDumps'); const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(p, e.name)); else if (e.name.endsWith('.dmp')) dumps++; } }; walk(d); } catch {}
  return { lastSessionCrashed: !!lastSession, crashDumps: dumps, log: tail };
}

module.exports = { init, log, summary, onWindowGone: (fn) => { onGone = fn; } };
