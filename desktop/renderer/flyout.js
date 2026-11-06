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
document.querySelectorAll('[data-page]').forEach((b) => b.onclick = () => { sd.windowsSettings(b.dataset.page); sd.flyoutAction('close'); });
for (const [id, what] of [['bright', 'brightness'], ['vol', 'volume']]) {
  const r = $(id); let t;
  r.oninput = () => { dragging = id; fill(r); $(`${id}V`).textContent = r.value; clearTimeout(t); t = setTimeout(() => sd.setSys(what, +r.value), 40); };
  r.onchange = () => { sd.setSys(what, +r.value); setTimeout(() => { dragging = null; }, 600); };
}
$('muteBtn').onclick = () => sd.setSys('mute', !sys?.muted);
$('cMedia').querySelectorAll('[data-m]').forEach((b) => b.onclick = () => sd.mediaControl(b.dataset.m).catch(() => {}));
sd.onSys((st) => { sys = st; renderSys(); });
sd.onMedia((m) => { np = m; renderMedia(); });

// ---------- which panel ----------
sd.onFlyout((panel) => {
  $('menu').hidden = panel !== 'menu'; $('control').hidden = panel !== 'control';
  if (panel === 'menu') renderMenu(); else { renderSys(); renderMedia(); renderBattery(); }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') sd.flyoutAction('close'); });
