// Top bar: Syndicates menu, the app in front, now playing, weather, battery, quick settings, clock.
import { applyAccent, useTheme } from './common.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get();
const TRAY_MAX = 7; // tray icons shown in the bar; the rest open in a panel
let trayIcons = [];
let deskNames = [];

function look() {
  applyAccent(s.accent);
  const t = s.topbar || {};
  // solid, or glass: a light tint over the desktop, blurred behind by Windows (the main process turns the blur on)
  document.documentElement.style.setProperty('--op', t.look === 'glass' ? 0.42 : (t.opacity ?? 0.96));
  $('weather').hidden = !t.weather; $('battery').hidden = !t.battery || !hasBattery;
  renderMedia(); renderTray();
}

// the app in front, like macOS shows it next to the Apple menu
sd.onTopbar?.((st) => {
  $('app').textContent = st.app || 'Desktop';
  // virtual desktops, like macOS Spaces: only shown once there is more than one
  const d = st.desks || { count: 1, current: 0 };
  if (d.names) deskNames = d.names; else d.names = deskNames; // the quick update on a switch carries no names: keep the last
  $('desks').hidden = d.count < 2;
  $('desks').replaceChildren(...Array.from({ length: d.count }, (_, i) => {
    const b = Object.assign(document.createElement('button'), { textContent: String(i + 1), className: i === d.current ? 'on' : '', title: d.names?.[i] || `Desktop ${i + 1}` });
    b.onclick = () => sd.topbarDesk(i);
    return b;
  }));
});

// clock: "Thu 5 Nov  20:51" in your own language and format
function tick() {
  const d = new Date();
  $('clock').textContent = `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}  ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
// on the minute, like Windows' own clock (it used to check every 10 s, so the minute could turn up to 10 s late)
(function everyMinute() { tick(); setTimeout(everyMinute, 60000 - (Date.now() % 60000) + 30); })();
document.addEventListener('visibilitychange', tick); // and straight away when the bar shows again (after sleep, gamer mode)

// now playing
let np = { on: false };
function renderMedia() {
  $('np').hidden = !(s.topbar?.media ?? true) || !np.on;
  if ($('np').hidden) return;
  $('np').classList.toggle('playing', !!np.playing);
  $('npText').textContent = [np.title, np.artist].filter(Boolean).join(' — ');
}
$('npToggle').onclick = () => sd.mediaControl('toggle').catch(() => {});
sd.onMedia((m) => { np = m; renderMedia(); });
sd.media().then((m) => { np = m; renderMedia(); }).catch(() => {});

// weather (automatic location unless a city is set for the weather widget)
async function weather() {
  if (!s.topbar?.weather) return;
  try { const w = await sd.weather(s.widgets.weather?.city || ''); $('weather').textContent = `${w.temp}${w.unit.replace('°C', '°')} ${w.text}`; $('weather').title = w.place; }
  catch { $('weather').textContent = ''; }
}
weather(); setInterval(weather, 15 * 60e3);

// battery (laptops only): asked from Windows, which knows whether there is one (the web API can't tell)
let hasBattery = false;
async function battery() {
  const b = await sd.battery().catch(() => null);
  hasBattery = !!b?.present;
  if (hasBattery) {
    $('battery').querySelector('span').textContent = `${b.percent}%`;
    $('battery').querySelector('b').style.width = `${b.percent}%`;
    $('battery').classList.toggle('low', b.percent <= 20 && !b.plugged); $('battery').classList.toggle('charging', !!b.charging);
    $('battery').title = b.charging ? 'Charging' : b.plugged ? 'Plugged in' : 'On battery';
  }
  look();
}
battery(); setInterval(battery, 5000);
sd.onPower?.(battery); // plugged in / unplugged: at once

$('logo').onclick = () => sd.flyout('menu', Math.round($('logo').getBoundingClientRect().left));
$('quick').onclick = () => { const r = $('quick').getBoundingClientRect(); sd.flyout('control', Math.round(r.left + r.width / 2)); };
$('timerBtn').onclick = () => sd.topbarTimer();
$('ovBtn').onclick = () => sd.overview();
const anchor = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.left + r.width / 2); };
$('clock').onclick = () => sd.flyout('calendar', anchor($('clock')));
$('wifiBtn').onclick = () => sd.flyout('wifi', anchor($('wifiBtn')));
$('battery').onclick = () => sd.flyout('battery', anchor($('battery')));
sd.onSettings((n) => { const cityChanged = n.widgets.weather?.city !== s.widgets.weather?.city || n.topbar?.weather !== s.topbar?.weather; s = n; look(); if (cityChanged) weather(); });
look();

// ---------- input method: Pinyin (拼) or English (EN), switched with Shift ----------
const IME_NATIVE = { 0x04: '拼', 0x11: 'あ', 0x12: '한' }; // Chinese, Japanese, Korean input methods in their own mode
function renderIme(m) {
  const b = $('ime');
  b.hidden = !m || s.topbar?.ime !== true;
  if (b.hidden) return;
  const own = m.ime && m.native ? IME_NATIVE[m.lang & 0x3FF] : '';
  b.textContent = own || 'EN';
  b.classList.toggle('native', !!own);
  b.title = own ? 'Typing Chinese (Pinyin). Shift switches to English.' : m.ime ? 'Typing English. Shift switches to Pinyin.' : 'English keyboard';
}
sd.onIme?.(renderIme);
sd.ime?.().then(renderIme).catch(() => {});
$('ime').onclick = () => sd.windowsSettings?.('language');

// ---------- other programs' tray icons ----------
// click / right-click / double-click send the program what Windows' tray would; more than fit go in a panel
function trayButton(it) {
  const b = document.createElement('button');
  b.title = it.tip || '';
  const img = new Image(); img.alt = ''; img.src = it.icon; b.append(img);
  const at = (kind) => { const r = b.getBoundingClientRect(); sd.trayClick(it.id, kind, r.left + r.width / 2, r.top + r.height / 2).catch(() => {}); };
  b.onclick = () => at('left');
  b.ondblclick = () => at('double');
  b.oncontextmenu = (e) => { e.preventDefault(); at('right'); };
  return b;
}
function renderTray() {
  const list = trayIcons.filter((x) => !x.hidden && x.icon && (!x.system || s.topbar?.traySystem)); // Windows' own sound / battery icons: the bar has its own
  $('tray').hidden = s.topbar?.tray === false || !list.length;
  if ($('tray').hidden) return;
  const hide = new Set(s.topbar?.trayHidden || []);
  const inBar = list.filter((x) => !hide.has(x.key)), shown = inBar.slice(0, TRAY_MAX);
  const items = shown.map((it) => {
    const b = trayButton(it);
    b.onauxclick = (e) => { if (e.button === 1) sd.set({ topbar: { trayHidden: [...hide, it.key] } }); }; // middle-click: hide it (it stays in the › panel)
    b.onmousedown = (e) => { if (e.button === 1) e.preventDefault(); };
    return b;
  });
  // always there: the icons that don't fit or that you hid, and where to hide / show them
  const more = document.createElement('button'); more.className = 'more';
  const rest = list.length - shown.length;
  more.title = rest ? `${rest} more · hide or show icons` : 'Hide or show icons';
  more.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  more.onclick = () => { const r = more.getBoundingClientRect(); sd.flyout('tray', Math.round(r.left + r.width / 2), { skip: 0 }); };
  items.push(more);
  $('tray').replaceChildren(...items);
}
sd.onTray?.((list) => { trayIcons = list || []; renderTray(); });
sd.trayList?.().then((list) => { trayIcons = list || []; renderTray(); }).catch(() => {});
useTheme('topbar'); // Customize > Themes
