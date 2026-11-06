// System info for the widgets and the Home panel's app launcher.
const os = require('os');
const fs = require('fs');
const path = require('path');

let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] || c;
    for (const k of Object.keys(c.times)) total += c.times[k] - p.times[k];
    idle += c.times.idle - p.times.idle;
  });
  lastCpu = now;
  return total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
}

function stats() {
  const mem = 1 - os.freemem() / os.totalmem();
  return { cpu: cpuPercent(), mem: Math.round(mem * 100), uptime: os.uptime() };
}

// Start-menu shortcuts are the most reliable list of installed apps on Windows.
function startMenuDirs() {
  if (process.platform !== 'win32') return [];
  return [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
}
const SKIP = /^(uninstall|readme|help|license|website|documentation|release notes)|uninstall/i;
function listApps() {
  const seen = new Map();
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (/\.(lnk|url)$/i.test(e.name)) {
        const name = e.name.replace(/\.(lnk|url)$/i, '');
        if (!SKIP.test(name) && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, path: p });
      }
    }
  };
  for (const d of startMenuDirs()) walk(d, 0);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Everything the Start menu lists, Store apps included: Windows' shell:AppsFolder (what Get-StartApps reads).
// Store apps also get their logo from the package manifest (the largest PNG of it).
const APPS_PS = `
$ProgressPreference = 'SilentlyContinue'; $ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$pk = @{}; foreach ($p in Get-AppxPackage) { $pk[$p.PackageFamilyName] = $p }
$out = foreach ($it in (New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items()) {
  $id = $it.Path; $logo = ''; $dir = ''
  if ($id -match '^([^!]+)!(.+)$' -and $pk.ContainsKey($Matches[1])) {
    $pkg = $pk[$Matches[1]]; $aid = $Matches[2]; $dir = $pkg.InstallLocation
    try {
      $m = [xml](Get-Content -Raw -LiteralPath (Join-Path $pkg.InstallLocation 'AppxManifest.xml'))
      $app = @($m.Package.Applications.Application) | Where-Object { $_.Id -eq $aid } | Select-Object -First 1
      $ve = $app.VisualElements
      $rel = if ($ve.Square44x44Logo) { $ve.Square44x44Logo } else { $ve.Square150x150Logo }
      if ($rel) {
        $full = Join-Path $pkg.InstallLocation $rel; $base = [IO.Path]::GetFileNameWithoutExtension($full)
        $f = Get-ChildItem -LiteralPath (Split-Path $full) -Filter "$base*.png" | Where-Object { $_.Name -notmatch 'contrast|altform-lightunplated' } | Sort-Object Length -Descending | Select-Object -First 1
        $logo = if ($f) { $f.FullName } elseif (Test-Path -LiteralPath $full) { $full } else { '' }
      }
    } catch {}
  }
  [ordered]@{ n = $it.Name; id = $id; logo = $logo; dir = $dir }
}
$j = ConvertTo-Json @($out) -Compress
[Console]::Out.Write([regex]::Replace($j, '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value }))
`;
// AppIDs of desktop apps start with a known-folder GUID instead of the folder's path
const KNOWN = {
  '{6D809377-6AF0-444B-8957-A3773F02200E}': () => process.env.ProgramW6432 || process.env.ProgramFiles,
  '{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}': () => process.env['ProgramFiles(x86)'],
  '{F38BF404-1D43-42F2-9305-67DE0B28FC23}': () => process.env.SystemRoot,
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}': () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
  '{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}': () => path.join(process.env.SystemRoot || 'C:\\Windows', 'SysWOW64'),
  '{F1B32785-6FBA-4FCF-9D55-7B8E7F157091}': () => process.env.LOCALAPPDATA,
  '{3EB685DB-65F9-4CF6-A03A-E3EF65729F3D}': () => process.env.APPDATA,
};
function appIdToFile(id) {
  const m = /^(\{[0-9A-F-]{36}\})\\(.+)$/i.exec(id);
  const f = m ? (KNOWN[m[1].toUpperCase()] ? path.join(KNOWN[m[1].toUpperCase()]() || '', m[2]) : '') : /^[a-z]:\\/i.test(id) ? id : '';
  return /\.exe$/i.test(f) ? f : '';
}
const DOC = /\.(url|txt|chm|pdf|html?|rtf|md|ini|log)$/i;
function listAppsFull() {
  const lnk = listApps();
  if (process.platform !== 'win32') return Promise.resolve(lnk);
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve) => {
    require('child_process').execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(APPS_PS, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 45000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        let items = [];
        try { items = JSON.parse(String(stdout).trim() || '[]'); } catch {}
        const byName = new Map(lnk.map((a) => [a.name.toLowerCase(), a]));
        for (const it of Array.isArray(items) ? items : [items]) {
          const name = String(it?.n || '').trim(), id = String(it?.id || '');
          if (!name || !id || SKIP.test(name) || DOC.test(id) || /^https?:/i.test(id)) continue;
          const have = byName.get(name.toLowerCase());
          if (have) { have.appId ||= id; continue; } // the shortcut has the better icon
          byName.set(name.toLowerCase(), { name, path: `shell:AppsFolder\\${id}`, appId: id, logo: it.logo || '', dir: it.dir || '', exe: appIdToFile(id) });
        }
        if (err && !items.length) console.warn('[apps] Start menu list unavailable:', err.message);
        resolve([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
      });
  });
}

// Chromium's network stack (Electron net.fetch) uses the system proxy like a browser does; plain fetch doesn't
function web(url, opts) {
  try { const { net } = require('electron'); if (net?.fetch) return net.fetch(url, opts); } catch {}
  return fetch(url, opts);
}

// Open-Meteo: free weather API, no key. City name -> coordinates -> current weather.
const WEATHER_CODES = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
  61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
const weatherCache = new Map();
// no city set: where the internet connection is (GeoJS, free, no key) — roughly the right town
// The internet connection's location is wrong behind a VPN; the PC's own time zone isn't. When they disagree,
// the main city of the PC's time zone is used (Asia/Shanghai -> Shanghai).
const sysTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
async function geocode(name) {
  const g = await (await web(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`)).json();
  return g.results?.[0] || null;
}
async function locate() {
  const tz = sysTz();
  let j = null;
  try { j = await (await web('https://get.geojs.io/v1/ip/geo.json')).json(); } catch {}
  if (j?.latitude && (!tz || !j.timezone || j.timezone === tz)) return { name: j.city || j.region || j.country || 'Here', latitude: +j.latitude, longitude: +j.longitude };
  const city = tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ') : '';
  const p = city ? await geocode(city) : null;
  if (p) return { name: p.name, latitude: p.latitude, longitude: p.longitude };
  if (j?.latitude) return { name: j.city || 'Here', latitude: +j.latitude, longitude: +j.longitude };
  throw new Error('location unknown; set a city in Customize');
}
async function weather(city = '') {
  city = String(city || '').trim();
  const hit = weatherCache.get(city);
  if (hit && Date.now() - hit.t < 15 * 60e3) return hit.v;
  let place;
  if (city) {
    place = await geocode(city);
    if (!place) throw new Error(`couldn't find “${city}”`);
  } else place = await locate();
  const w = await (await web(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=${encodeURIComponent(sysTz() || 'auto')}`)).json();
  // the next six hours, from the current hour (the Mac-style weather widget shows them)
  const nowHour = (w.current?.time || '').slice(0, 13); // in the PC's time zone (asked for above)
  let start = (w.hourly?.time || []).findIndex((t) => t.slice(0, 13) === nowHour);
  if (start < 0) { const h = new Date().getHours(); start = (w.hourly?.time || []).findIndex((t) => +t.slice(11, 13) === h); } // fallback: the PC's clock
  start = Math.max(0, start);
  const hourly = (w.hourly?.time || []).slice(start + 1, start + 7).map((t, i) => ({ hour: +t.slice(11, 13), temp: Math.round(w.hourly.temperature_2m[start + 1 + i]), code: w.hourly.weather_code[start + 1 + i] }));
  const v = { place: place.name, temp: Math.round(w.current.temperature_2m), unit: w.current_units?.temperature_2m || '°C', text: WEATHER_CODES[w.current.weather_code] || '',
    code: w.current.weather_code, day: w.current.is_day !== 0, hi: Math.round(w.daily?.temperature_2m_max?.[0]), lo: Math.round(w.daily?.temperature_2m_min?.[0]), hourly };
  weatherCache.set(city, { t: Date.now(), v });
  return v;
}

// Books: Project Gutenberg through Gutendex, the same free library the Syndicates Client's Books use.
const bookCache = new Map();
async function books(query = '') {
  const q = String(query).trim().slice(0, 100);
  const hit = bookCache.get(q);
  if (hit && Date.now() - hit.t < 30 * 60e3) return hit.v;
  const r = await web(`https://gutendex.com/books/?languages=en${q ? `&search=${encodeURIComponent(q)}` : ''}`);
  if (!r.ok) throw new Error(`the book library answered ${r.status}`);
  const j = await r.json();
  const v = (j.results || []).slice(0, 24).map((b) => ({
    id: b.id, title: b.title, author: (b.authors?.[0]?.name || '').replace(/^(.+?), (.+)$/, '$2 $1'),
    cover: b.formats?.['image/jpeg'] || '',
  }));
  bookCache.set(q, { t: Date.now(), v });
  return v;
}

// GitHub: someone's public repositories, most recently pushed first (public API, no key).
async function githubRepos(user) {
  const u = String(user || '').trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(u)) throw new Error('not a GitHub username');
  const r = await web(`https://api.github.com/users/${u}/repos?sort=pushed&per_page=12`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Syndicates-Desktop' } });
  if (r.status === 404) throw new Error(`no GitHub user “${u}”`);
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  return (await r.json()).map((x) => ({ name: x.name, url: x.html_url, desc: x.description || '', lang: x.language || '', stars: x.stargazers_count, pushed: x.pushed_at }));
}

// Apps and shortcuts anywhere Windows Search has indexed (Desktop, Downloads, Documents…), for pinning by name.
const FILES_PS = `
$ProgressPreference = 'SilentlyContinue'; $ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$q = $env:SD_Q.Replace("'", "''")
$c = New-Object -ComObject ADODB.Connection
$c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
$rs = $c.Execute("SELECT TOP 40 System.ItemPathDisplay, System.ItemNameDisplay, System.ItemType FROM SYSTEMINDEX WHERE System.ItemNameDisplay LIKE '%$q%' AND SCOPE='file:' ORDER BY System.DateModified DESC")
$out = @()
while (-not $rs.EOF) { $out += [ordered]@{ p = $rs.Fields.Item('System.ItemPathDisplay').Value; n = $rs.Fields.Item('System.ItemNameDisplay').Value; t = $rs.Fields.Item('System.ItemType').Value }; $rs.MoveNext() }
$c.Close()
$j = ConvertTo-Json @($out) -Compress
[Console]::Out.Write([regex]::Replace($j, '[^\\x00-\\x7F]', { param($m) '\\u{0:x4}' -f [int][char]$m.Value }))
`;
// fallback without Windows Search: Desktop, Documents, Downloads, Pictures, Music, Videos (a few levels deep)
function walkFiles(q) {
  const home = require('os').homedir(), out = [], ql = q.toLowerCase();
  let seen = 0;
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= 30 || ++seen > 6000) return;
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.name.toLowerCase().includes(ql)) out.push({ name: e.name.replace(/\.(lnk|url)$/i, ''), path: p, folder: e.isDirectory() });
      if (e.isDirectory() && depth < 4) walk(p, depth + 1);
    }
  };
  for (const d of ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos']) walk(path.join(home, d), 0);
  return out;
}
function searchFiles(query) {
  const q = String(query || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 40); // nothing that means something to the query language
  if (q.length < 2) return Promise.resolve([]);
  if (process.platform !== 'win32') return Promise.resolve(walkFiles(q));
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve) => require('child_process').execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(FILES_PS, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 15000, env: { ...process.env, SD_Q: q } }, (err, stdout) => {
      let items = [];
      try { items = JSON.parse(String(stdout).trim() || '[]'); } catch {}
      let found = (Array.isArray(items) ? items : [items]).filter((x) => x?.p && !/\\(WinSxS|Installer|\$Recycle\.Bin|AppData)\\|unins\d*\.exe$/i.test(x.p))
        .map((x) => ({ name: String(x.n).replace(/\.(lnk|url|appref-ms)$/i, ''), path: String(x.p), folder: String(x.t || '').toLowerCase() === 'directory' }));
      if (!found.length) found = walkFiles(q); // Windows Search turned off: look through your own folders directly
      // apps and shortcuts first, then folders, then everything else (newest first, as the index gave them)
      const rank = (f) => (/\.(exe|lnk|appref-ms|url|bat|cmd)$/i.test(f.path) ? 0 : f.folder ? 1 : 2);
      resolve(found.sort((a, b) => rank(a) - rank(b)).slice(0, 24));
    }));
}

// Recently opened files: the shortcuts Windows keeps in Recent, newest first (on other systems: newest in your folders)
function recentFiles(limit = 80) {
  const { shell } = require('electron');
  const out = [];
  if (process.platform === 'win32') {
    const dir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Recent');
    let items = [];
    try { items = fs.readdirSync(dir).filter((f) => /\.lnk$/i.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })); } catch {}
    items.sort((a, b) => b.t - a.t);
    const seen = new Set();
    for (const { f, t } of items) {
      if (out.length >= limit) break;
      let target = '';
      try { target = shell.readShortcutLink(path.join(dir, f)).target; } catch {}
      if (!target || seen.has(target.toLowerCase())) continue;
      let st; try { st = fs.statSync(target); } catch { continue; } // gone or on a disconnected drive
      seen.add(target.toLowerCase());
      out.push({ name: path.basename(target), path: target, folder: st.isDirectory(), time: t });
    }
    return out;
  }
  const home = require('os').homedir();
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1); } else { try { out.push({ name: e.name, path: p, folder: false, time: fs.statSync(p).mtimeMs }); } catch {} } } };
  for (const d of ['Desktop', 'Documents', 'Downloads']) walk(path.join(home, d), 0);
  return out.sort((a, b) => b.time - a.time).slice(0, limit);
}

module.exports = { recentFiles, searchFiles, stats, listApps, listAppsFull, appIdToFile, weather, books, githubRepos };
