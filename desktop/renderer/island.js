// The island: compact live view (timer ring + time, or cover + equalizer) that opens on hover into
// media controls and the timer, and pops out when the timer is done.
import { applyAccent } from './common.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
const isl = $('island');
let s = await sd.get(), timer = await sd.timer(), np = { on: false }, open = false, alerting = false;

function look() {
  applyAccent(s.accent);
  // sit inside the top bar when it's on, a little below the edge otherwise
  document.documentElement.style.setProperty('--top', s.topbar?.on ? '1px' : '8px');
  document.documentElement.style.setProperty('--ch', s.topbar?.on ? '22px' : '32px');
}

// ---------- timer ----------
const fmt = (sec) => { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
const left = () => (timer.state === 'running' ? Math.max(0, (timer.endAt - Date.now()) / 1000) : timer.left);
const active = () => timer.state === 'running' || timer.state === 'paused';
let mins = 15;
const PRESETS = [[1, '1 min'], [5, '5 min'], [10, '10 min'], [25, '25 min'], [45, '45 min'], [60, '1 h']];
document.querySelector('.presets').replaceChildren(...PRESETS.map(([m, label]) => {
  const b = Object.assign(document.createElement('button'), { textContent: label });
  b.onclick = () => sd.timer('start', m * 60);
  return b;
}));
function setMins(m) { mins = Math.max(1, Math.min(600, m)); $('mins').textContent = mins; }
document.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => setMins(mins === 1 && +b.dataset.step > 0 ? 5 : mins + +b.dataset.step));
document.querySelector('.custom').addEventListener('wheel', (e) => { e.preventDefault(); setMins(mins + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
$('start').onclick = () => sd.timer('start', mins * 60);
$('pauseBtn').onclick = () => sd.timer(timer.state === 'running' ? 'pause' : 'resume');
$('plus').onclick = () => sd.timer('add', 60);
$('reset').onclick = () => sd.timer('reset');
$('more').onclick = () => { sd.timer('start', 5 * 60); endAlert(); };
$('dismiss').onclick = () => { sd.timer('reset'); endAlert(); };

function renderTimer() {
  const t = document.querySelector('.timer');
  t.classList.toggle('running', timer.state === 'running'); t.classList.toggle('paused', timer.state === 'paused');
  const l = left(), frac = timer.duration ? 1 - l / timer.duration : 0;
  $('left').textContent = fmt(l);
  $('of').textContent = timer.state === 'paused' ? 'paused' : `of ${fmt(timer.duration)}`;
  $('prog').style.width = `${Math.min(100, frac * 100)}%`;
  $('pauseBtn').textContent = timer.state === 'paused' ? 'Resume' : 'Pause';
  document.querySelector('.mini .t').textContent = fmt(l);
  document.querySelector('.ring .fg').style.strokeDashoffset = String(50.27 * (1 - frac));
}

// ---------- media ----------
function renderMedia() {
  const m = document.querySelector('.media');
  m.hidden = !np.on;
  isl.classList.toggle('playing', !!np.playing);
  m.querySelector('.title').textContent = np.title || 'Unknown title';
  m.querySelector('.artist').textContent = np.artist || '';
  const art = /^data:image\//.test(np.art || '') ? `url("${np.art}")` : '';
  m.querySelector('.big-art').style.backgroundImage = art; m.querySelector('.big-art').classList.toggle('has', !!art);
  document.querySelector('.mini-art').style.backgroundImage = art;
}
document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => sd.mediaControl(b.dataset.m).catch(() => {})); // the real state comes back from Windows (no guessing: guesses went out of sync)

// ---------- shape ----------
// the window grows before the island opens and shrinks after it has closed (it's just the pill most of the time)
let shrinkT, bigWin = false;
function shape() {
  const wantBig = open || alerting;
  clearTimeout(shrinkT);
  if (wantBig && !bigWin) { bigWin = true; sd.islandSize(true); setTimeout(applyShape, 40); return; } // let the window grow first
  if (!wantBig && bigWin) shrinkT = setTimeout(() => { bigWin = false; sd.islandSize(false); }, 650); // after the closing animation
  applyShape();
}
function applyShape() {
  isl.classList.toggle('osding', !!osdInfo && !open && !alerting);
  isl.classList.toggle('note', !!osdInfo && osdInfo.note);
  const t = active(), m = np.on;
  isl.dataset.mini = t && m ? 'both' : t ? 'timer' : m ? 'media' : 'none';
  isl.classList.toggle('alerting', alerting);
  isl.classList.toggle('open', open && !alerting);
  isl.classList.toggle('compact', !open && !alerting && !osdInfo);
  isl.classList.toggle('live', !open && !alerting && (t || m));
  // the open height follows its content
  if (open && !alerting) { // the open height follows what's in it (padding 30, 14 between sections)
    const secs = [...document.querySelectorAll('.panel > section:not([hidden])')];
    isl.style.height = `${30 + secs.reduce((h, e) => h + e.offsetHeight, 0) + 14 * (secs.length - 1)}px`;
  }
  else isl.style.height = '';
}
let openT, closeT;
let hovered = false;
isl.addEventListener('mouseenter', () => { hovered = true; sd.islandMouse(true); clearTimeout(closeT); openT = setTimeout(() => { open = true; shape(); }, 90); });
isl.addEventListener('mouseleave', () => { hovered = false; sd.islandMouse(false); clearTimeout(openT); closeT = setTimeout(() => { open = false; shape(); }, 380); });
// opened from the top bar's timer button, its menu or Ctrl+Alt+T: stays open until you've been in and out, or 8 s untouched
sd.onIslandOpen(() => {
  clearTimeout(closeT); open = true; sd.islandMouse(true); shape();
  closeT = setTimeout(function wait() { if (hovered) { closeT = setTimeout(wait, 1000); return; } open = false; sd.islandMouse(false); shape(); }, 8000);
});

// ---------- time's up ----------
function chime() { // three soft notes
  try {
    const ac = new AudioContext();
    [880, 1175, 1568].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + i * 0.22;
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      o.start(t0); o.stop(t0 + 1);
    });
    setTimeout(() => ac.close(), 2000);
  } catch {}
}
let alertT;
function startAlert() { alerting = true; $('doneOf').textContent = `${fmt(timer.duration)} timer`; sd.islandMouse(true); chime(); setTimeout(chime, 2400); shape(); clearTimeout(alertT); alertT = setTimeout(endAlert, 20000); }
function endAlert() { alerting = false; clearTimeout(alertT); sd.islandMouse(false); shape(); if (timer.state === 'done') sd.timer('reset'); }

// ---------- pop-ups: volume, brightness, Caps Lock, headphones ----------
const ICONS = {
  volume: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15 9a4 4 0 0 1 0 6M17.6 6.6a7.5 7.5 0 0 1 0 10.8"/>',
  muted: '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  brightness: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ime: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M8 14h8"/>',
  caps: '<path d="M12 4l7 8h-4v4H9v-4H5z"/><path d="M9 20h6"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
};
let osdInfo = null, osdT;
function showOsd(info) {
  const o = document.querySelector('.osd');
  const kind = info.kind === 'volume' && (info.muted || info.value === 0) ? 'muted' : info.kind === 'device' ? 'headphones' : info.kind;
  o.querySelector('.o-ic').innerHTML = ICONS[kind] || ICONS.volume;
  o.classList.toggle('on', info.kind === 'caps' ? !!info.on : info.kind === 'device' ? !!info.connected : info.kind === 'ime' ? !!info.native : false);
  const note = info.kind === 'caps' || info.kind === 'device' || info.kind === 'ime';
  if (note) o.querySelector('.o-txt').textContent = info.kind === 'caps' ? `Caps Lock ${info.on ? 'on' : 'off'}`
    : info.kind === 'ime' ? (info.native ? ({ 0x11: '日本語', 0x12: '한국어' }[info.lang & 0x3FF] || '中文 · 拼音') : 'English')
    : `${info.name || 'Audio device'} ${info.connected ? 'connected' : 'disconnected'}`;
  else { o.querySelector('.o-bar b').style.width = `${info.value}%`; o.querySelector('.o-val').textContent = info.kind === 'volume' && info.muted ? 'Off' : info.value; }
  osdInfo = { ...info, note };
  clearTimeout(osdT); osdT = setTimeout(() => { osdInfo = null; shape(); }, note ? 2400 : 1500);
  shape();
}
sd.onOsd(showOsd);
// headphones / speakers coming and going (Bluetooth, USB, jack)
let outputs = null;
let coreAudio = false; // the app watches Windows' sound outputs itself (faster); this check is only the fallback
sd.onSys?.((st) => { if (Array.isArray(st?.outputs)) coreAudio = true; });
async function scanOutputs(announce) {
  const list = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'audiooutput' && !['default', 'communications'].includes(d.deviceId));
  const now = new Map(list.map((d) => [d.deviceId, d.label]));
  if (announce && outputs && !coreAudio) {
    for (const [id, label] of now) if (!outputs.has(id)) { showOsd({ kind: 'device', name: label.replace(/\s*\(.*\)$/, ''), connected: true }); break; }
    for (const [id, label] of outputs) if (!now.has(id)) { showOsd({ kind: 'device', name: label.replace(/\s*\(.*\)$/, ''), connected: false }); break; }
  }
  outputs = now;
}
navigator.mediaDevices?.addEventListener('devicechange', () => setTimeout(() => scanOutputs(true), 400));
scanOutputs(false);

// ---------- wiring ----------
let tickT;
function onTimer(t) {
  const wasDone = timer.state === 'done';
  timer = t; renderTimer();
  if (t.state === 'done' && !wasDone) startAlert();
  clearInterval(tickT); if (t.state === 'running') tickT = setInterval(renderTimer, 250); // only ticks while a timer runs
  shape();
}
sd.onTimer(onTimer);
sd.onMedia((m) => { np = m; renderMedia(); shape(); });
sd.media().then((m) => { np = m; renderMedia(); shape(); }).catch(() => {});
sd.onSettings((n) => { s = n; look(); });
look(); setMins(mins); onTimer(timer);

// switching desktops: endless animations (equaliser, glow) hold still for the slide, so Windows has one
// window fewer to compose every frame while it animates
let switchT = 0;
sd.onSwitching?.((ms) => { document.body.classList.add('switching'); clearTimeout(switchT); switchT = setTimeout(() => document.body.classList.remove('switching'), ms || 750); });
