// Wi-Fi networks (list and connect, with Windows' own netsh) and power: Windows' power mode
// (efficiency / balanced / performance) and the screen's refresh rate. No admin rights needed.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const win32 = require('./win32');

// netsh speaks the console code page; "chcp 65001" first makes it UTF-8, so Chinese network names survive
const netshUtf8 = (args) => new Promise((resolve) => execFile('cmd.exe', ['/d', '/c', `chcp 65001>nul & netsh ${args}`], { windowsHide: true, timeout: 15000, maxBuffer: 4 << 20 },
  (err, out) => resolve(err && !out ? '' : String(out))));
// commands with a network name: no shell in between, the name passed exactly as typed (quotes refused)
const netsh = (args) => new Promise((resolve) => execFile('netsh.exe', args, { windowsHide: true, timeout: 20000, windowsVerbatimArguments: true },
  (err, out) => resolve({ ok: !err, out: String(out || '') })));

async function currentSsid() {
  const out = await netshUtf8('wlan show interfaces');
  const m = /^\s*SSID\s*:\s*(.+)$/m.exec(out); // "BSSID" lines don't match (anchored at the start)
  return m ? m[1].trim() : '';
}
/** Networks in range: [{ ssid, signal, secure, known, connected }], connected first, then strongest. */
async function wifiList(scan = false) {
  if (!win32.isWin) return [];
  if (scan && win32.wifiScan()) await new Promise((r) => setTimeout(r, 3500)); // a fresh scan takes a few seconds
  const [nets, profiles, cur] = await Promise.all([netshUtf8('wlan show networks mode=bssid'), netshUtf8('wlan show profiles'), currentSsid()]);
  // Windows 11 24H2: listing networks needs "Let desktop apps access your location"
  wifiList.needsLocation = !/SSID\s+\d+\s*:/.test(nets) && /location|位置|定位/i.test(nets);
  const known = new Set(profiles.split(/\r?\n/).filter((l) => /:\s*\S/.test(l) && /^\s{2,}/.test(l)).map((l) => l.split(':').slice(1).join(':').trim()));
  const list = [];
  let n = null;
  for (const line of nets.split(/\r?\n/)) {
    const ssid = /^SSID\s+\d+\s*:\s*(.*)$/.exec(line.trim());
    if (ssid) { n = { ssid: ssid[1].trim(), signal: 0, secure: true }; if (n.ssid) list.push(n); continue; }
    if (!n) continue;
    const pct = /(\d+)%/.exec(line); if (pct) n.signal = Math.max(n.signal, +pct[1]);
    if (/:\s*(Open|开放|開放)/i.test(line)) n.secure = false;
  }
  const seen = new Map();
  for (const x of list) if (!seen.has(x.ssid) || seen.get(x.ssid).signal < x.signal) seen.set(x.ssid, x);
  return [...seen.values()].map((x) => ({ ...x, known: known.has(x.ssid), connected: x.ssid === cur }))
    .sort((a, b) => (b.connected - a.connected) || (b.signal - a.signal));
}
const xml = (v) => String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
/** Connect: a known network straight away; a new one with its password (WPA2) or none (open). */
async function wifiConnect(ssid, password, secure = true) {
  if (!win32.isWin) return { ok: false, error: 'Windows only' };
  ssid = String(ssid || '');
  if (!ssid || ssid.includes('"')) return { ok: false, error: 'this network name can’t be used here' };
  const profiles = await netshUtf8('wlan show profiles');
  const known = profiles.split(/\r?\n/).some((l) => l.split(':').slice(1).join(':').trim() === ssid);
  if (!known) {
    if (secure && !password) return { ok: false, needPassword: true };
    const hex = Buffer.from(ssid, 'utf8').toString('hex').toUpperCase();
    const security = secure
      ? `<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xml(password)}</keyMaterial></sharedKey>`
      : '<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>';
    const file = path.join(os.tmpdir(), `sd-wifi-${process.pid}-${Date.now()}.xml`);
    fs.writeFileSync(file, `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${xml(ssid)}</name><SSIDConfig><SSID><hex>${hex}</hex><name>${xml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>${security}</security></MSM></WLANProfile>`);
    try { await netsh(['wlan', 'add', 'profile', `filename="${file}"`, 'user=current']); } finally { fs.rmSync(file, { force: true }); } // the password stays only in Windows' own profile
  }
  const r = await netsh(['wlan', 'connect', `name="${ssid}"`, `ssid="${ssid}"`]);
  if (!r.ok) return { ok: false, error: 'Windows couldn’t start connecting' };
  for (let i = 0; i < 12; i++) { // wait for it to really connect (or a wrong password)
    await new Promise((res) => setTimeout(res, 700));
    if (await currentSsid() === ssid) return { ok: true };
  }
  if (!known) await netsh(['wlan', 'delete', 'profile', `name="${ssid}"`]); // wrong password: don't keep a broken profile
  return { ok: false, error: known ? 'couldn’t connect' : 'wrong password, or the network is out of reach' };
}

// Windows 11 power mode ("Power mode" in Settings > Power): an overlay on the power plan
const MODES = { efficiency: '961cc777-2547-4f9d-8174-7d86181b8a7a', balanced: '00000000-0000-0000-0000-000000000000', performance: 'ded574b5-45a0-4f42-8737-46345c09c238' };
const powercfg = (args) => new Promise((resolve) => execFile('powercfg.exe', args, { windowsHide: true, timeout: 8000 }, (err, out) => resolve(err ? '' : String(out))));
async function powerMode() {
  if (!win32.isWin) return '';
  const g = (/([0-9a-f]{8}-[0-9a-f-]{27})/i.exec(await powercfg(['/getactiveoverlayscheme'])) || [])[1] || MODES.balanced;
  return Object.keys(MODES).find((k) => MODES[k] === g.toLowerCase()) || 'balanced';
}
async function setPowerMode(mode) {
  if (!win32.isWin || !MODES[mode]) return powerMode();
  await powercfg(['/overlaysetactive', MODES[mode]]);
  return powerMode();
}

module.exports = { wifiList, wifiConnect, powerMode, setPowerMode };
