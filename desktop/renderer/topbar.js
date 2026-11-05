// Top bar: Syndicates menu, the app in front, now playing, weather, battery, quick settings, clock.
import { applyAccent } from './common.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get();

function look() {
  applyAccent(s.accent);
  const t = s.topbar || {};
  document.documentElement.style.setProperty('--op', t.opacity ?? 0.78);
  $('weather').hidden = !t.weather; $('battery').hidden = !t.battery || !hasBattery;
  renderMedia();
}

// the app in front, like macOS shows it next to the Apple menu
sd.onTopbar?.((st) => { $('app').textContent = st.app || 'Desktop'; });

// clock: "Thu 5 Nov  20:51" in your own language and format
function tick() {
  const d = new Date();
  $('clock').textContent = `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}  ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
tick(); setInterval(tick, 1000 * 10);

// now playing
let np = { on: false };
function renderMedia() {
  $('np').hidden = !(s.topbar?.media ?? true) || !np.on;
  if ($('np').hidden) return;
  $('np').classList.toggle('playing', !!np.playing);
  $('npText').textContent = [np.title, np.artist].filter(Boolean).join(' — ');
}
$('npToggle').onclick = () => { np.playing = !np.playing; renderMedia(); sd.mediaControl('toggle').catch(() => {}); };
sd.onMedia((m) => { np = m; renderMedia(); });
sd.media().then((m) => { np = m; renderMedia(); }).catch(() => {});

// weather (automatic location unless a city is set for the weather widget)
async function weather() {
  if (!s.topbar?.weather) return;
  try { const w = await sd.weather(s.widgets.weather?.city || ''); $('weather').textContent = `${w.temp}${w.unit.replace('°C', '°')} ${w.text}`; $('weather').title = w.place; }
  catch { $('weather').textContent = ''; }
}
weather(); setInterval(weather, 15 * 60e3);

// battery (laptops only)
let hasBattery = false;
navigator.getBattery?.().then((b) => {
  const show = () => {
    hasBattery = b.chargingTime !== 0 || b.level < 1 || !b.charging; // desktops report "full and charging" forever
    const pct = Math.round(b.level * 100);
    $('battery').querySelector('span').textContent = `${pct}%`;
    $('battery').querySelector('b').style.width = `${pct}%`;
    $('battery').classList.toggle('low', pct <= 20 && !b.charging); $('battery').classList.toggle('charging', b.charging);
    look();
  };
  b.addEventListener('levelchange', show); b.addEventListener('chargingchange', show); show();
}).catch(() => {});

$('logo').onclick = () => { const r = $('logo').getBoundingClientRect(); sd.topbarMenu(Math.round(r.left), Math.round(r.bottom)); };
$('quick').onclick = () => sd.topbarKeys('quick');
$('clock').onclick = () => sd.topbarKeys('notifications');
sd.onSettings((n) => { const cityChanged = n.widgets.weather?.city !== s.widgets.weather?.city || n.topbar?.weather !== s.topbar?.weather; s = n; look(); if (cityChanged) weather(); });
look();
