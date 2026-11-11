// Updates from inside the app: the desktop-latest release (only builds that passed the Windows tests get there) is
// checked now and then, and installed with one click. Which build this is comes from build.json (written by CI); a copy
// without one (an old download) counts as out of date.
//   started from source (start.bat): the release's source package is unzipped over this folder (node_modules kept,
//     reinstalled only if package.json changed) and the app starts again
//   installed: the new Setup.exe runs silently over it, then the app starts again
//   portable: the new Portable.exe replaces this one once the app has quit, then starts
// Everything comes over HTTPS from github.com; nothing runs that didn't come from this project's release.
const { app, net, safeStorage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = 'fwyiling/yiling', TAG = 'desktop-latest';
const API = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`;
const DL = `https://github.com/${REPO}/releases/download/${TAG}/`;
const ASSETS = { source: 'Syndicates-Desktop-Source.zip', setup: 'Syndicates-Desktop-Setup.exe', portable: 'Syndicates-Desktop-Portable.exe' };

// The repository is private: reading its releases needs a GitHub token (fine-grained, read-only "Contents" on this repo
// is enough). It's typed into Customize, kept encrypted with Windows' own protection (safeStorage), never shown again.
const tokenFile = () => path.join(app.getPath('userData'), 'update-token.bin');
function token() {
  try { const b = fs.readFileSync(tokenFile()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : ''; } catch { return ''; }
}
function setToken(t) {
  t = String(t || '').trim();
  if (!t) { try { fs.rmSync(tokenFile(), { force: true }); } catch {} return true; }
  if (!/^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})$/.test(t)) throw new Error("that doesn't look like a GitHub token");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows can't protect the token on this PC");
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(t));
  return true;
}
const headers = (extra = {}) => { const t = token(); return { 'User-Agent': 'syndicates-desktop', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra }; };
let assetUrls = {}; // name -> API url (works with the token, for a private repository)

function current() {
  try { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'build.json'), 'utf8').replace(/^\uFEFF/, '')); return { sha: String(j.sha || ''), date: String(j.date || '') }; }
  catch { return { sha: '', date: '' }; }
}
/** How this copy runs: 'source' (start.bat), 'installed' or 'portable'. */
const kind = () => (!app.isPackaged ? 'source' : process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installed');

let state = { checking: false, available: false, latest: '', latestDate: '', error: '', lastCheck: 0, busy: false, progress: 0 };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(status()); };
const status = () => ({ ...state, current: current().sha, kind: kind(), hasToken: !!token() });

async function check() {
  if (state.checking || state.busy) return status();
  emit({ checking: true, error: '' });
  try {
    const r = await net.fetch(API, { headers: headers({ Accept: 'application/vnd.github+json' }) });
    if (r.status === 404 || r.status === 401) throw new Error(token() ? 'GitHub refused the token (it needs read access to this repository)' : "this project's releases are private: add a GitHub token below");
    if (!r.ok) throw new Error(r.status === 403 ? 'GitHub says: too many checks, try again later' : `GitHub answered ${r.status}`);
    const j = await r.json();
    const sha = String(j.target_commitish || '').trim() || ((/Built from ([0-9a-f]{7,40})/.exec(j.body || '') || [])[1] || '');
    const names = (j.assets || []).map((a) => a.name);
    assetUrls = Object.fromEntries((j.assets || []).map((a) => [a.name, a.url]));
    const need = ASSETS[kind()];
    const mine = current().sha;
    const newer = !!sha && names.includes(need) && !(mine && (sha.startsWith(mine) || mine.startsWith(sha)));
    emit({ checking: false, available: newer, latest: sha.slice(0, 7), latestDate: j.published_at || j.created_at || '', lastCheck: Date.now() });
  } catch (e) { emit({ checking: false, error: e.message, lastCheck: Date.now() }); }
  return status();
}

async function download(name, dest) {
  // with a token: through the API (a private repository's files aren't at the public address)
  const r = token() && assetUrls[name] ? await net.fetch(assetUrls[name], { headers: headers({ Accept: 'application/octet-stream' }) }) : await net.fetch(DL + name, { headers: headers() });
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  const total = Number(r.headers.get('content-length') || 0);
  const out = fs.createWriteStream(dest);
  const reader = r.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length; out.write(Buffer.from(value));
    if (total) emit({ progress: Math.round((got / total) * 100) });
  }
  await new Promise((res, rej) => { out.on('error', rej); out.end(res); });
  if (got < 100000) throw new Error('the download was too small');
  return dest;
}

const ps = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`; // a PowerShell string
/** A PowerShell script that waits for this app to quit, does the swap, and starts it again (it outlives the app). */
function runAfterQuit(lines) {
  const script = [`$ErrorActionPreference = 'Stop'`, `try { Wait-Process -Id ${process.pid} -Timeout 30 -ErrorAction SilentlyContinue } catch {}`, 'Start-Sleep -Milliseconds 600', ...lines].join('\r\n');
  const file = path.join(os.tmpdir(), `syndicates-update-${Date.now()}.ps1`);
  fs.writeFileSync(file, '\ufeff' + script, 'utf8');
  spawn(ps(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/** Download and install the latest build; the app quits and starts again. */
async function apply(quit) {
  if (process.platform !== 'win32') throw new Error('updates install on Windows only');
  if (state.busy) return;
  emit({ busy: true, progress: 0, error: '' });
  try {
    const k = kind(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syndicates-update-'));
    if (k === 'source') {
      const zip = await download(ASSETS.source, path.join(dir, ASSETS.source));
      const appDir = __dirname, electron = process.execPath;
      const pkgBefore = fs.readFileSync(path.join(appDir, 'package.json'), 'utf8');
      fs.writeFileSync(path.join(dir, 'package.before.json'), pkgBefore);
      runAfterQuit([
        `$src = Join-Path ${q(dir)} 'src'`,
        `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath $src -Force`,
        // the new files over this folder: node_modules, settings and anything else of the user's are left alone
        `Get-ChildItem -LiteralPath $src -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination ${q(appDir)} -Recurse -Force }`,
        `if ((Get-Content -Raw (Join-Path ${q(appDir)} 'package.json')) -ne (Get-Content -Raw (Join-Path ${q(dir)} 'package.before.json'))) { Push-Location ${q(appDir)}; & npm install --no-audit --no-fund --loglevel=error; Pop-Location }`,
        `Start-Process -FilePath ${q(electron)} -ArgumentList @(${q(appDir)}) -WorkingDirectory ${q(appDir)}`,
      ]);
    } else if (k === 'installed') {
      const exe = await download(ASSETS.setup, path.join(dir, ASSETS.setup));
      runAfterQuit([
        `Start-Process -FilePath ${q(exe)} -ArgumentList '/S' -Wait`, // NSIS, silent: installs over the current copy
        `Start-Process -FilePath ${q(process.execPath)}`,
      ]);
    } else {
      const target = process.env.PORTABLE_EXECUTABLE_FILE;
      const exe = await download(ASSETS.portable, path.join(dir, ASSETS.portable));
      runAfterQuit([
        `for ($i = 0; $i -lt 20; $i++) { try { Copy-Item -LiteralPath ${q(exe)} -Destination ${q(target)} -Force; break } catch { Start-Sleep -Milliseconds 500 } }`,
        `Start-Process -FilePath ${q(target)}`,
      ]);
    }
    emit({ progress: 100 });
    setTimeout(quit, 300);
  } catch (e) { emit({ busy: false, error: e.message }); throw e; }
}

let timer = null;
/** Checks 30 s after start and every 6 hours (fn hears about every change). */
function start(fn) {
  if (fn) listeners.add(fn);
  clearTimeout(timer); clearInterval(start.iv);
  timer = setTimeout(check, 30e3);
  start.iv = setInterval(check, 6 * 3600e3);
}
function stop() { clearTimeout(timer); clearInterval(start.iv); }

module.exports = { current, kind, check, apply, start, stop, status, setToken, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
