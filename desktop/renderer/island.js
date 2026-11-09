// The island: compact live view (timer ring + time, or cover + equalizer) that opens on hover into
// media controls and the timer, and pops out when the timer is done.
import { applyAccent, useTheme } from './common.js';
import { PETS, PET_IDS, petSvg } from './pets.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
const isl = $('island');
let s = await sd.get(), timer = await sd.timer(), np = { on: false }, open = false, alerting = false;

function look() {
  applyAccent(s.accent);
  // sit inside the top bar when it's on, a little below the edge otherwise
  document.documentElement.style.setProperty('--top', s.topbar?.on ? '1px' : '8px');
  document.documentElement.style.setProperty('--ch', s.topbar?.on ? '22px' : '32px');
  dressPets();
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
  setMood();
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
  progLoop();
}
document.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => sd.mediaControl(b.dataset.m).catch(() => {}));
// the song's position: Windows says when the song was at 0:00 (while playing) or where it stopped (paused), and the
// seconds are counted here, only while the island is open; drag the bar to jump
const prog = document.querySelector('.prog'), seekEl = prog.querySelector('.seek');
const fmtT = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = String(sec % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const songPos = () => Math.min(np.dur || 0, np.playing && np.t0 ? (Date.now() - np.t0) / 1000 : np.pos || 0);
let seeking = false, progT = 0;
function renderProg() {
  const ok = !!np.on && np.dur > 0;
  prog.hidden = !ok;
  if (!ok) return;
  seekEl.max = String(Math.round(np.dur)); seekEl.disabled = !np.canSeek;
  prog.querySelector('.p-dur').textContent = fmtT(np.dur);
  if (seeking) return;
  const p = songPos();
  seekEl.value = String(Math.round(p)); seekEl.style.setProperty('--v', `${(p / np.dur) * 100}%`);
  prog.querySelector('.p-now').textContent = fmtT(p);
}
function progLoop() {
  const run = open && !!np.playing && np.dur > 0;
  if (run && !progT) progT = setInterval(renderProg, 500); else if (!run && progT) { clearInterval(progT); progT = 0; }
  renderProg();
}
seekEl.addEventListener('input', () => { seeking = true; seekEl.style.setProperty('--v', `${(seekEl.value / np.dur) * 100}%`); prog.querySelector('.p-now').textContent = fmtT(+seekEl.value); });
seekEl.addEventListener('change', () => {
  const to = +seekEl.value;
  sd.mediaControl(`seek ${to}`).catch(() => {});
  if (np.playing) np.t0 = Date.now() - to * 1000; else np.pos = to; // straight away; Windows confirms a moment later
  seeking = false; renderProg();
}); // the real state comes back from Windows (no guessing: guesses went out of sync)

// ---------- shape ----------
// the window grows before the island opens and shrinks after it has closed (it's just the pill most of the time)
let shrinkT, bigWin = false;
function shape() {
  progLoop();
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
  placePet();
  // the open height follows its content
  if (open && !alerting) { // the open height follows what's in it (padding 30, 14 between sections)
    const secs = [...document.querySelectorAll('.panel > section:not([hidden])')];
    isl.style.height = `${30 + secs.reduce((h, e) => h + e.offsetHeight, 0) + 14 * (secs.length - 1)}px`;
  }
  else isl.style.height = '';
}
let openT, closeT;
let hovered = false;
isl.addEventListener('mouseenter', () => { hovered = true; wake(true); sd.islandMouse(true); clearTimeout(closeT); openT = setTimeout(() => { open = true; shape(); }, 90); });
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
function endAlert() { const was = alerting; alerting = false; clearTimeout(alertT); sd.islandMouse(false); shape(); if (timer.state === 'done') sd.timer('reset'); if (was) react('happy', 1100); }

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
  wake();
  // the pet reacts once the pill is back: Caps Lock startles it, headphones make it happy
  const r = info.kind === 'caps' ? (info.on ? 'wow' : '') : info.kind === 'device' ? (info.connected ? 'happy' : 'look') : info.kind === 'ime' ? 'look' : '';
  clearTimeout(osdT); osdT = setTimeout(() => { osdInfo = null; shape(); if (r) react(r, 1300); }, note ? 2400 : 1500);
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

// ---------- the pet ----------
// Lives in the pill: wanders about when nothing's on, naps when you've been away a while (sooner at night),
// dances while music plays, sits by the timer, and reacts to Caps Lock, headphones, new songs and a desktop
// switch. In the open island it sits in the timer's corner: click to pet it, right-click to meet the next one.
// Between those moments it holds still (a blink now and then), so the pill doesn't redraw for nothing.
const pet = $('pet'), perch = $('perch'), perchPet = perch.querySelector('.pet'), alertPet = $('alertPet');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let petNow = null, asleep = false, walking = false, reaction = null, reactT, perchReactT, lastActive = Date.now(), px = 0, wanderT, lovedAt = 0;
const petId = () => { const id = s.island?.pet ?? 'cat'; return PETS[id] ? id : null; }; // 'none' = no pet
for (const el of [pet, perchPet, alertPet]) el.innerHTML = '<div class="pet-dir"><div class="pet-bod"></div></div><i class="zz">z</i>';
function dressPets() {
  const id = petId();
  isl.classList.toggle('has-pet', !!id);
  if (id === petNow) return;
  petNow = id;
  for (const el of [pet, perchPet, alertPet]) { el.dataset.kind = PETS[id]?.kind || ''; el.querySelector('.pet-bod').innerHTML = id ? petSvg(id) : ''; }
  perch.title = id ? `${PETS[id].name}: click to pet, right-click for another friend` : '';
  if (id) { setMood(); perchMood(); }
}
function baseMood() {
  if (timer.state === 'running' && left() <= 10) return 'antsy'; // nearly there
  if (np.playing) return 'dance';
  if (active()) return 'watch';
  if (asleep) return 'sleep';
  return walking ? 'walk' : 'idle';
}
function setMood() { const m = reaction || baseMood(); if (pet.dataset.mood !== m) pet.dataset.mood = m; }
function react(m, ms) {
  if (!petNow) return;
  reaction = m; pet.dataset.mood = ''; void pet.offsetWidth; setMood(); // restart the animation if it's the same mood again
  if (m === 'love') hearts(pet, 2);
  clearTimeout(reactT); reactT = setTimeout(() => { reaction = null; setMood(); }, ms);
}
function wake(byHand) {
  lastActive = Date.now();
  if (!asleep) return;
  asleep = false; setMood();
  if (byHand) { perchPet.dataset.mood = 'sleep'; clearTimeout(perchReactT); perchReactT = setTimeout(() => perchReact('look', 1200), 500); } // rubs its eyes
}
setInterval(() => { // nap time?
  const h = new Date().getHours(), night = h >= 23 || h < 6;
  if (!asleep && !np.playing && !active() && !hovered && Date.now() - lastActive > (night ? 45e3 : 150e3)) { asleep = true; walking = false; setMood(); }
}, 5000);
function hearts(el, n) {
  for (let i = 0; i < n; i++) {
    const h = Object.assign(document.createElement('i'), { className: 'heart', textContent: '♥' });
    h.style.setProperty('--dx', `${(Math.random() * 14 - 5).toFixed(1)}px`); h.style.animationDelay = `${i * 140}ms`;
    el.append(h); setTimeout(() => h.remove(), 1200 + i * 140);
  }
}
function blinkLoop() {
  setTimeout(blinkLoop, 2600 + Math.random() * 4200);
  if (!petNow || document.body.classList.contains('switching')) return;
  for (const el of [pet, perchPet]) { if (/^(idle|walk|watch|perk|look)$/.test(el.dataset.mood || 'idle')) { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 130); } }
}
blinkLoop();
// where it stands in the pill
const pillW = () => (isl.classList.contains('live') ? 214 : 118);
function goTo(x, speed) {
  const d = Math.abs(x - px); if (d < 1) return 0;
  const dur = reduced ? 0 : d / speed;
  pet.classList.toggle('flip', x > px); // drawn facing a little left (the tail's on the right)
  pet.style.setProperty('--walk', `${dur.toFixed(2)}s`); pet.style.setProperty('--x', `${x.toFixed(1)}px`);
  px = x; return dur;
}
let wasLive = null, wasCompact = false;
function placePet() {
  if (!petNow) return;
  const live = isl.classList.contains('live'), compact = isl.classList.contains('compact'), ps = pet.offsetWidth || 19;
  if (compact && !wasCompact && Date.now() - lovedAt < 12000) { lovedAt = 0; setTimeout(() => react('love', 1100), 450); } // still happy you petted it
  wasCompact = compact;
  if (live === wasLive) return;
  wasLive = live;
  clearTimeout(wanderT); walking = false;
  if (live) goTo((pillW() - ps) / 2, 120); // between the ring / cover and the time
  else goTo(Math.min(px, pillW() - 10 - ps), 120);
  setMood();
  wanderT = setTimeout(wander, 2500);
}
function wander() {
  clearTimeout(wanderT);
  const next = (ms) => { wanderT = setTimeout(wander, ms); };
  if (!petNow || reduced || asleep || !isl.classList.contains('compact') || isl.classList.contains('live') || document.body.classList.contains('switching') || document.hidden) return next(4000);
  const r = Math.random(), ps = pet.offsetWidth || 19, min = 8, max = pillW() - 10 - ps;
  if (r < 0.5) { // a little walk
    let x = min + Math.random() * (max - min);
    if (Math.abs(x - px) < 16) x = px < (min + max) / 2 ? max : min;
    walking = true; setMood();
    const dur = goTo(x, 13);
    wanderT = setTimeout(() => { walking = false; setMood(); next(2500 + Math.random() * 4500); }, dur * 1000);
    return;
  }
  if (r < 0.62) react('look', 1300);
  else if (r < 0.78) { pet.classList.add('twitch'); setTimeout(() => pet.classList.remove('twitch'), 400); }
  next(3500 + Math.random() * 5000);
}
// the perch, in the open island
function perchMood() { const m = np.playing ? 'dance' : 'idle'; if (!perchReactT && perchPet.dataset.mood !== m) perchPet.dataset.mood = m; }
function perchReact(m, ms) {
  perchPet.dataset.mood = ''; void perchPet.offsetWidth; perchPet.dataset.mood = m;
  clearTimeout(perchReactT); perchReactT = setTimeout(() => { perchReactT = 0; perchMood(); }, ms);
}
let pats = [];
perch.addEventListener('click', () => {
  wake(); lovedAt = Date.now();
  const now = Date.now(); pats = pats.filter((t) => now - t < 2500); pats.push(now);
  if (pats.length >= 7) { pats = []; perchReact('dizzy', 1900); return; } // that's enough!
  perchReact('love', 1000); hearts(perchPet, pats.length > 3 ? 3 : 2);
});
perch.addEventListener('mouseenter', () => { if (!perchReactT) perchPet.dataset.mood = 'perk'; });
perch.addEventListener('mouseleave', () => { if (!perchReactT) perchMood(); });
perch.addEventListener('contextmenu', (e) => { // the next friend
  e.preventDefault();
  const next = PET_IDS[(PET_IDS.indexOf(petNow) + 1) % PET_IDS.length];
  s = { ...s, island: { ...s.island, pet: next } }; dressPets(); perchReact('wow', 700);
  sd.set({ island: { pet: next } }).catch(() => {});
});
sd.onMedia(() => perchMood());
dressPets(); placePet(); wander();

// ---------- wiring ----------
let tickT;
function onTimer(t) {
  const prev = timer.state, wasDone = prev === 'done', wasRunning = prev === 'running';
  timer = t; renderTimer();
  if (t.state !== prev) wake();
  if (t.state === 'running' && !wasRunning && !wasDone) react('happy', 900);
  if (t.state === 'done' && !wasDone) startAlert();
  clearInterval(tickT); if (t.state === 'running') tickT = setInterval(renderTimer, 250); // only ticks while a timer runs
  shape();
}
sd.onTimer(onTimer);
sd.onMedia((m) => {
  const before = np; np = m; renderMedia(); shape();
  if (!!m.playing !== !!before.playing || m.title !== before.title) wake();
  if (m.playing && before.playing && m.title && before.title && m.title !== before.title) react('happy', 950); // a new song
});
sd.media().then((m) => { np = m; renderMedia(); shape(); }).catch(() => {});
sd.onSettings((n) => { s = n; look(); });
look(); setMins(mins); onTimer(timer);

// switching desktops: endless animations (equaliser, glow) hold still for the slide, so Windows has one
// window fewer to compose every frame while it animates
let switchT = 0;
sd.onSwitching?.((ms) => {
  document.body.classList.add('switching'); clearTimeout(switchT);
  switchT = setTimeout(() => { document.body.classList.remove('switching'); if (!asleep && !np.playing) react('look', 1200); }, ms || 750); // "where are we?"
});
useTheme('island'); // Customize > Themes
