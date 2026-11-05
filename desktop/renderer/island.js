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
document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { if (b.dataset.m === 'toggle') { np.playing = !np.playing; renderMedia(); } sd.mediaControl(b.dataset.m).catch(() => {}); });

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
  const t = active(), m = np.on;
  isl.dataset.mini = t && m ? 'both' : t ? 'timer' : m ? 'media' : 'none';
  isl.classList.toggle('alerting', alerting);
  isl.classList.toggle('open', open && !alerting);
  isl.classList.toggle('compact', !open && !alerting);
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
