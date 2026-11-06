// The top bar's menu and the control centre (Wi-Fi, Bluetooth, brightness, volume, music…).
import { applyAccent } from './common.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get(), sys = await sd.sys().catch(() => null), np = await sd.media().catch(() => ({ on: false }));
applyAccent(s.accent);
sd.onSettings((n) => { s = n; applyAccent(s.accent); });

// ---------- menu ----------
const I = {
  home: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', customize: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 3h5"/>', gamer: '<path d="M6 9h12a4 4 0 0 1 3.9 4.9l-.8 3.4A2.5 2.5 0 0 1 16.8 18L15 16H9l-1.8 2a2.5 2.5 0 0 1-4.3-.7l-.8-3.4A4 4 0 0 1 6 9z"/><path d="M8 12v2M7 13h2M16 12.5h.01M17.5 14h.01"/>',
  newdesk: '<rect x="3" y="5" width="13" height="10" rx="2"/><path d="M19 9v10H7M19 3v4M17 5h4"/>', showdesk: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20h8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>', taskmgr: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
async function renderMenu() {
  const st = await sd.flyoutState().catch(() => ({}));
  const items = [['home', 'Open Home', st.hotkey || 'Alt+Space'], ['customize', 'Customize…', 'Ctrl+Alt+S'], '-', ['timer', 'Timer', 'Ctrl+Alt+T'], ['gamer', 'Gamer mode', st.gamer ? '' : 'Ctrl+Alt+G', st.gamer],
    ['newdesk', 'New desktop', 'Win+Ctrl+D'], ['showdesk', 'Show desktop', ''], '-', ['settings', 'Windows Settings', ''], ['taskmgr', 'Task Manager', 'Ctrl+Shift+Esc'], '-', ['lock', 'Lock', 'Win+L']];
  $('menu').replaceChildren(...items.map((it) => {
    if (it === '-') return document.createElement('hr');
    const b = document.createElement('button'); if (it[3]) b.className = 'on';
    b.innerHTML = `<svg viewBox="0 0 24 24">${I[it[0]]}</svg><span></span>${it[2] ? `<kbd>${it[2]}</kbd>` : ''}`;
    b.querySelector('span').textContent = it[1];
    b.onclick = () => sd.flyoutAction(it[0]);
    return b;
  }));
}

// ---------- control centre ----------
const fill = (el) => el.style.setProperty('--v', `${el.value}%`);
let dragging = null;
function renderSys() {
  if (!sys) return;
  $('tWifi').classList.toggle('on', !!sys.wifi?.on); $('tWifi').querySelector('label').textContent = sys.wifi?.on ? (sys.wifi.ssid || 'Wi-Fi') : 'Wi-Fi';
  $('tWifi').classList.toggle('na', !sys.wifi?.has && !sys.wifi?.ssid);
  $('tBt').classList.toggle('on', !!sys.bluetooth?.on); $('tBt').classList.toggle('na', !sys.bluetooth?.has);
  $('tAir').classList.toggle('on', !!sys.airplane);
  $('sBright').hidden = sys.brightness == null; // desktop monitors: brightness is on the monitor itself
  if (dragging !== 'bright' && sys.brightness != null) { $('bright').value = sys.brightness; $('brightV').textContent = sys.brightness; fill($('bright')); }
  if (dragging !== 'vol' && sys.volume >= 0) { $('vol').value = sys.muted ? 0 : sys.volume; $('volV').textContent = sys.muted ? 'Off' : sys.volume; fill($('vol')); }
  $('sVol').classList.toggle('muted', !!sys.muted);
}
function renderMedia() {
  $('cMedia').hidden = !np?.on;
  if (!np?.on) return;
  $('cMedia').classList.toggle('playing', !!np.playing);
  $('cTitle').textContent = np.title || 'Unknown title'; $('cArtist').textContent = np.artist || '';
  $('cApp').textContent = (np.app || '').split(/[!\\]/).pop().replace(/\.exe$/i, '').replace(/^\w/, (c) => c.toUpperCase());
  const art = /^data:image\//.test(np.art || '') ? `url("${np.art}")` : '';
  const a = $('cMedia').querySelector('.art'); a.style.backgroundImage = art; a.classList.toggle('has', !!art);
}
async function renderBattery() { const b = await sd.battery().catch(() => null); $('cBattery').textContent = b?.present ? `${b.percent}%${b.charging ? ' · charging' : ''}` : ''; }
$('tWifi').querySelector('.main').onclick = () => sd.setSys('wifi', !sys?.wifi?.on);
$('tBt').querySelector('.main').onclick = () => sd.setSys('bluetooth', !sys?.bluetooth?.on);
$('tAir').querySelector('.main').onclick = () => sd.setSys('airplane', !sys?.airplane);
document.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => {
  if (b.dataset.page === 'wifi' && b.closest('#control')) { showPanel('wifi'); return; } // the network list, here
  sd.windowsSettings(b.dataset.page); sd.flyoutAction('close');
});
for (const [id, what] of [['bright', 'brightness'], ['vol', 'volume']]) {
  const r = $(id); let t;
  r.oninput = () => { dragging = id; fill(r); $(`${id}V`).textContent = r.value; clearTimeout(t); t = setTimeout(() => sd.setSys(what, +r.value), 40); };
  r.onchange = () => { sd.setSys(what, +r.value); setTimeout(() => { dragging = null; }, 600); };
}
$('muteBtn').onclick = () => sd.setSys('mute', !sys?.muted);
$('cMedia').querySelectorAll('[data-m]').forEach((b) => b.onclick = () => sd.mediaControl(b.dataset.m).catch(() => {}));
sd.onSys((st) => { sys = st; renderSys(); });
sd.onMedia((m) => { np = m; renderMedia(); });

// ---------- Wi-Fi ----------
const bars = (sig) => { const n = sig >= 75 ? 3 : sig >= 45 ? 2 : sig >= 20 ? 1 : 0; return `<svg viewBox="0 0 24 24">${['M2.5 9.5a14 14 0 0 1 19 0', 'M5.8 13a9 9 0 0 1 12.4 0', 'M9.2 16.4a4 4 0 0 1 5.6 0'].map((d, i) => `<path d="${d}" opacity="${3 - i <= n ? 1 : .3}"/>`).join('')}<circle cx="12" cy="19.6" r=".9"/></svg>`; };
const LOCK = '<svg viewBox="0 0 24 24" class="lock"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
let openNet = '';
let wifiSeq = 0;
async function renderWifi(rescan = true) {
  $('wifiOn').checked = !!sys?.wifi?.on;
  if (sys && !sys.wifi?.on) { $('nets').innerHTML = '<li class="empty">Wi-Fi is off.</li>'; $('wifiNote').textContent = ''; return; }
  const seq = ++wifiSeq;
  if (rescan) { // what Windows knows right away, then again after a fresh scan
    $('wifiNote').textContent = 'Scanning…';
    drawNets(await sd.wifiList(false).catch(() => ({ list: [] })));
    const r = await sd.wifiList(true).catch(() => ({ list: [] }));
    if (seq === wifiSeq) drawNets(r, true);
  } else drawNets(await sd.wifiList(false).catch(() => ({ list: [] })), true);
}
function drawNets(r, done) {
  const list = r.list || [];
  $('wifiNote').textContent = done ? (list.length ? `${list.length} network${list.length > 1 ? 's' : ''}` : '') : 'Scanning…';
  if (r.needsLocation && list.length <= 1) { // Windows 11 hides nearby networks from apps without location access
    $('nets').innerHTML = '<li class="empty">Windows only lists nearby networks to apps when <b>Location</b> is on for desktop apps.<br><button class="link" id="locBtn">Open location settings</button></li>';
    $('locBtn').onclick = () => { sd.windowsSettings('location'); sd.flyoutAction('close'); };
    return;
  }
  $('nets').replaceChildren(...list.map((n) => {
    const li = document.createElement('li'); if (n.connected) li.className = 'on';
    li.innerHTML = `<button class="n">${bars(n.signal)}<span></span>${n.secure ? LOCK : ''}${n.connected ? '<small>Connected</small>' : ''}</button>`;
    li.querySelector('span').textContent = n.ssid;
    const go = async (password) => {
      li.querySelector('.msg')?.remove();
      $('wifiNote').textContent = `Connecting to ${n.ssid}…`;
      const res = await sd.wifiConnect(n.ssid, password, n.secure).catch((e) => ({ ok: false, error: String(e) }));
      if (res.needPassword) { openNet = n.ssid; renderWifi(false); return; }
      $('wifiNote').textContent = res.ok ? `Connected to ${n.ssid}` : '';
      if (!res.ok) { li.insertAdjacentHTML('beforeend', '<div class="msg"></div>'); li.querySelector('.msg').textContent = res.error || 'couldn’t connect'; }
      else { openNet = ''; renderWifi(false); }
    };
    li.querySelector('.n').onclick = () => { if (n.connected) return; if (n.secure && !n.known) { openNet = openNet === n.ssid ? '' : n.ssid; drawNets(r, done); } else go(); };
    if (openNet === n.ssid) { // a new protected network: its password, right here
      const f = document.createElement('form'); f.className = 'pw';
      f.innerHTML = '<input type="password" placeholder="Password" autocomplete="off"><button>Connect</button>';
      f.onsubmit = (e) => { e.preventDefault(); const v = f.querySelector('input').value; if (v.length >= 8) go(v); else f.querySelector('input').focus(); };
      li.append(f); setTimeout(() => f.querySelector('input').focus(), 30);
    }
    return li;
  }));
  if (!list.length) $('nets').innerHTML = `<li class="empty">${done ? 'No networks found.' : 'Scanning…'}</li>`;
}
$('wifiOn').onchange = () => { sd.setSys('wifi', $('wifiOn').checked); setTimeout(() => renderWifi(), 2500); };
$('wifiRefresh').onclick = () => renderWifi();

// ---------- battery and power ----------
async function renderBatteryPanel(p) {
  p ||= await sd.power().catch(() => null);
  if (!p) return;
  const b = p.battery || {};
  $('batPct').textContent = b.present ? `${b.percent}%` : 'No battery';
  $('batState').textContent = b.present ? (b.charging ? 'Charging' : b.plugged ? 'Plugged in' : 'On battery') : 'Plugged in';
  $('batFill').style.width = `${b.present ? b.percent : 100}%`;
  document.querySelector('.bat').classList.toggle('charging', !!b.charging); document.querySelector('.bat').classList.toggle('low', b.present && b.percent <= 20 && !b.plugged);
  $('lowPower').checked = !!p.low;
  $('lowPower').closest('.row-sw').querySelector('small').textContent = 'Best power efficiency and the wallpaper paused. Everything goes back when you switch it off.';
  $('powerMode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.value === p.mode));
  const d = p.display || { rates: [] };
  $('hzGrp').hidden = (d.rates || []).length < 2;
  // stuck on a film / TV rate (24, 30 Hz…): say so, with the screen's best rate one click away
  const best = Math.max(0, ...(d.rates || []));
  $('hzWarn').hidden = !(d.current && d.current < 48 && best > d.current);
  $('hzWarn').innerHTML = $('hzWarn').hidden ? '' : `Your screen is running at <b>${d.current} Hz</b>, so everything moves choppily. <button class="link" id="hzBest">Switch to ${best} Hz</button>`;
  if (!$('hzWarn').hidden) $('hzBest').onclick = async () => renderBatteryPanel(await sd.setPower('hz', best));
  $('hz').replaceChildren(...(d.rates || []).map((r) => { const x = Object.assign(document.createElement('button'), { textContent: `${r} Hz`, className: r === d.current ? 'on' : '' }); x.onclick = async () => renderBatteryPanel(await sd.setPower('hz', r)); return x; }));
}
$('lowPower').onchange = async () => renderBatteryPanel(await sd.setPower('low', $('lowPower').checked));
$('powerMode').querySelectorAll('button').forEach((x) => x.onclick = async () => renderBatteryPanel(await sd.setPower('mode', x.value)));

// ---------- calendar ----------
let calBase = new Date(); calBase.setDate(1);
const zh = /^zh/i.test(navigator.language);
// Chinese lunar date in the traditional form (九月廿八), from the browser's Chinese calendar
const LUNAR_DAYS = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
function lunarParts(d) {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).formatToParts(d);
    const month = (parts.find((p) => p.type === 'month') || {}).value || '';
    const day = parseInt((parts.find((p) => p.type === 'day') || {}).value, 10);
    return { month, day: LUNAR_DAYS[day - 1] || '', first: day === 1 };
  } catch { return { month: '', day: '', first: false }; }
}
const lunar = (d) => { const p = lunarParts(d); return p.month + p.day; };
const lunarDay = (d) => { const p = lunarParts(d); return p.first ? p.month : p.day; };
function renderCalendar() {
  const now = new Date();
  $('calToday').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('calLunar').textContent = zh ? lunar(now) : '';
  $('calMonth').textContent = calBase.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  const mondayFirst = zh || /^(en-GB|de|fr|es|it|nl|ru)/i.test(navigator.language);
  const startDow = mondayFirst ? (calBase.getDay() + 6) % 7 : calBase.getDay();
  const first = new Date(calBase); first.setDate(1 - startDow);
  const tt = s.home?.timetable || [];
  const hasClass = (d) => tt.some((c) => c.d === (d.getDay() + 6) % 7);
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, (mondayFirst ? 1 : 7) + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  $('calGrid').innerHTML = names.map((n) => `<i>${n}</i>`).join('') + cells.map((d) => {
    const cls = [d.getMonth() !== calBase.getMonth() && 'other', d.toDateString() === now.toDateString() && 'today', hasClass(d) && 'has'].filter(Boolean).join(' ');
    return `<span class="${cls}">${d.getDate()}${zh ? `<small>${lunarDay(d)}</small>` : ''}</span>`;
  }).join('');
  // today: classes from the timetable, then to-dos
  const wd = (now.getDay() + 6) % 7;
  const items = [...tt.filter((c) => c.d === wd).sort((a, b) => a.s.localeCompare(b.s)).map((c) => `<li><em>${c.s}–${c.e}</em><span></span></li>`)];
  const todos = (s.home?.todos || []).filter((t) => !t.done).slice(0, 4);
  $('agenda').innerHTML = items.join('') + todos.map(() => '<li><i></i><span></span></li>').join('') || '<li class="muted">Nothing planned today.</li>';
  const spans = $('agenda').querySelectorAll('li span');
  tt.filter((c) => c.d === wd).sort((a, b) => a.s.localeCompare(b.s)).forEach((c, i) => { spans[i].textContent = c.t + (c.p ? ` · ${c.p}` : ''); });
  todos.forEach((t, i) => { spans[items.length + i].textContent = t.text; });
}
$('calPrev').onclick = () => { calBase.setMonth(calBase.getMonth() - 1); renderCalendar(); };
$('calNext').onclick = () => { calBase.setMonth(calBase.getMonth() + 1); renderCalendar(); };
let fMins = 30;
$('fMinus').onclick = () => { fMins = Math.max(5, fMins - 5); $('fMins').textContent = fMins; };
$('fPlus').onclick = () => { fMins = Math.min(240, fMins + 5); $('fMins').textContent = fMins; };
$('fStart').onclick = () => { sd.timer('start', fMins * 60); sd.flyoutAction('close'); }; // runs in the island

// ---------- which panel ----------
const PANELS = ['menu', 'control', 'wifi', 'battery', 'calendar'];
let lastPanel = '', lastShown = 0;
function showPanel(panel) {
  if (panel === lastPanel && Date.now() - lastShown < 300) return; // the same request twice (message + ask): draw once
  lastPanel = panel; lastShown = Date.now();
  for (const p of PANELS) $(p).hidden = p !== panel;
  if (panel === 'menu') renderMenu();
  else if (panel === 'control') { renderSys(); renderMedia(); renderBattery(); }
  else if (panel === 'wifi') { openNet = ''; renderWifi(); }
  else if (panel === 'battery') renderBatteryPanel();
  else if (panel === 'calendar') { calBase = new Date(); calBase.setDate(1); renderCalendar(); }
}
// drawn: the window may appear (straight away; a hidden window gets no animation frames to wait for)
const drawAndReady = (p) => { showPanel(p); setTimeout(() => sd.flyoutReady(), 0); };
sd.onFlyout(drawAndReady);
sd.flyoutPanel().then(drawAndReady);
addEventListener('keydown', (e) => { if (e.key === 'Escape') sd.flyoutAction('close'); });
