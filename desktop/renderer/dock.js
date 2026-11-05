// Syndicates dock: Start, Home, pinned apps, open windows grouped by app, now playing, quick settings, clock.
import { applyAccent, esc } from './common.js';

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get(), wins = [];
const icons = new Map(), targets = new Map();
const norm = (p) => String(p || '').toLowerCase();

function applyLook() {
  applyAccent(s.accent);
  const dk = s.dock;
  document.body.classList.toggle('full', dk.style === 'full');
  document.body.classList.toggle('floating', dk.style !== 'full');
  const h = { s: 52, m: 64, l: 78 }[dk.size] || 64;
  document.documentElement.style.setProperty('--h', `${h}px`);
  document.documentElement.style.setProperty('--op', Math.max(0.8, dk.opacity ?? 0.96));
  $('clock').hidden = !dk.clock;
  $('pins').hidden = !dk.pinned;
  $('running').hidden = !dk.running;
}

// ---------- tooltips (shown in the clear space above the dock) ----------
function showTip(el, text) {
  const t = $('tip'), r = el.getBoundingClientRect();
  t.textContent = text; t.style.left = `${r.left + r.width / 2}px`; t.hidden = false;
}
const hideTip = () => { $('tip').hidden = true; };
function tip(el, text) { el.dataset.tip = text; }
document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, el.dataset.tip); });
document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip(); });

// ---------- magnification (macOS Dock): icons near the cursor grow and push their neighbours ----------
const MAX = 0.42, RANGE = 110;
function magnify(x) {
  for (const it of document.querySelectorAll('.apps .item, .left > .item')) {
    if (x == null) { it.style.setProperty('--s', 1); continue; }
    const r = it.getBoundingClientRect(), c = r.left + r.width / 2;
    const k = Math.max(0, 1 - Math.abs(x - c) / RANGE);
    it.style.setProperty('--s', (1 + MAX * k * k).toFixed(3));
  }
}
$('dock').addEventListener('mousemove', (e) => { if (e.target.closest('.left')) magnify(e.clientX); else magnify(null); });
$('dock').addEventListener('mouseleave', () => magnify(null));

// ---------- apps ----------
function iconFor(key, loader, name) {
  const ph = document.createElement('div'); ph.className = 'ph'; ph.innerHTML = esc((name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
  ph.style.setProperty('--hue', [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
  if (!icons.has(key)) icons.set(key, loader().catch(() => ''));
  icons.get(key).then((url) => { if (url) { const img = new Image(); img.src = url; img.alt = ''; ph.replaceWith(img); } });
  return ph;
}
// click: bring forward; already in front: minimize; several windows: cycle through them
function focusGroup(list) {
  const i = list.findIndex((w) => w.active);
  const target = i >= 0 && list.length > 1 ? list[(i + 1) % list.length] : list[i >= 0 ? i : 0];
  sd.focusWindow(target.hwnd);
}
async function pinTarget(p) { if (!targets.has(p)) targets.set(p, sd.pinTarget(p).catch(() => p)); return targets.get(p); }

let groups = []; // open apps in dock order, for scrolling through them
async function render() {
  const pins = s.home.pins || [];
  const pinExes = await Promise.all(pins.map((p) => pinTarget(p.path)));
  const byExe = new Map();
  for (const w of wins) { const k = norm(w.exe); if (!byExe.has(k)) byExe.set(k, []); byExe.get(k).push(w); }
  const used = new Set();
  $('pins').replaceChildren(...pins.map((p, i) => {
    const k = norm(pinExes[i]), open = byExe.get(k) || [];
    if (open.length) used.add(k);
    const b = document.createElement('button');
    b.className = 'item' + (open.length ? ' running' : '') + (open.some((w) => w.active) ? ' active' : '');
    b.append(iconFor(`pin:${p.path}`, () => sd.appIcon(p.path), p.name));
    if (open.length > 1) b.insertAdjacentHTML('beforeend', `<span class="count">${open.length}</span>`);
    b.onclick = () => (open.length ? focusGroup(open) : sd.launch(p.path));
    b.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, [['Unpin', () => sd.unpin(p.path)]]); };
    tip(b, open.length ? `${p.name} · ${open[0].title}` : p.name);
    return b;
  }));
  const rest = [...byExe.entries()].filter(([k]) => !used.has(k));
  $('running').replaceChildren(...rest.map(([k, list]) => {
    const w = list[0], name = (w.exe.split(/[\\/]/).pop() || w.title).replace(/\.exe$/i, '');
    const b = document.createElement('button');
    b.className = 'item running' + (list.some((x) => x.active) ? ' active' : '');
    b.append(iconFor(`exe:${k}`, () => sd.exeIcon(w.exe), name));
    if (list.length > 1) b.insertAdjacentHTML('beforeend', `<span class="count">${list.length}</span>`);
    b.onclick = () => focusGroup(list);
    b.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, [['Pin to dock', () => sd.dockPin(w.exe)]]); };
    tip(b, list.length > 1 ? `${name} · ${list.length} windows` : w.title);
    return b;
  }));
  groups = [...pins.map((p, i) => byExe.get(norm(pinExes[i]))).filter(Boolean), ...rest.map(([, list]) => list)];
  const showPins = s.dock.pinned && pins.length, showRun = s.dock.running && rest.length;
  $('runSep').hidden = !(showPins && showRun);
  $('homeSep').hidden = !(showPins || showRun);
}

// ---------- scroll over the dock (wheel or two fingers) to go to the next / previous app, MacBook style ----------
let wheelAcc = 0, wheelAt = 0;
document.addEventListener('wheel', (e) => { // anywhere on the dock window, not only exactly over an icon
  e.preventDefault();
  wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(wheelAcc) < 60 || Date.now() - wheelAt < 280 || !groups.length) return;
  const dir = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; wheelAt = Date.now();
  const cur = groups.findIndex((g) => g.some((w) => w.active));
  const next = groups[((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir + groups.length) % groups.length];
  sd.focusWindow((next.find((w) => w.active) || next[0]).hwnd, false); // switch, never minimize
}, { passive: false });

// a small menu above the dock (pin / unpin)
function menu(x, items) {
  document.querySelector('.ctx')?.remove();
  const m = document.createElement('div'); m.className = 'ctx';
  for (const [label, fn] of items) { const b = Object.assign(document.createElement('button'), { textContent: label }); b.onclick = () => { m.remove(); fn(); }; m.append(b); }
  // inside the dock: outside it, clicks pass through to the windows behind
  const d = $('dock'), r = d.getBoundingClientRect(); d.append(m);
  m.style.left = `${Math.max(6, Math.min(x - r.left - m.offsetWidth / 2, r.width - m.offsetWidth - 6))}px`;
  hideTip(); setTimeout(() => addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }));
}

// ---------- now playing ----------
let np = { on: false };
function renderMedia() {
  $('np').hidden = $('npSep').hidden = !s.dock.media || !np.on;
  if ($('np').hidden) return;
  $('npTitle').textContent = np.title || 'Unknown title';
  $('npArtist').textContent = np.artist || '';
  $('np').classList.toggle('playing', !!np.playing);
  const art = $('np').querySelector('.art'), hasArt = /^data:image\//.test(np.art || '');
  art.style.backgroundImage = hasArt ? `url("${np.art}")` : ''; art.classList.toggle('none', !hasArt);
  $('np').querySelector('.txt').dataset.tip = [np.title, np.artist].filter(Boolean).join(' — ');
}
$('np').querySelectorAll('[data-m]').forEach((b) => {
  b.onclick = async () => {
    if (b.dataset.m === 'toggle') { np.playing = !np.playing; renderMedia(); } // feels instant; the real state follows
    await sd.mediaControl(b.dataset.m).catch(() => {});
  };
});
sd.onMedia((m) => { np = m; renderMedia(); });
sd.media().then((m) => { np = m; renderMedia(); }).catch(() => {});

// ---------- clock ----------
function tick() {
  const now = new Date();
  $('time').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- buttons ----------
$('start').onclick = () => sd.dockKeys('start');
$('home').onclick = () => sd.toggleHome(true);
$('quick').onclick = () => sd.dockKeys('quick');
$('clock').onclick = () => sd.dockKeys('notifications');
$('gear').onclick = () => sd.openSettings();
tip($('home'), `Home · ${s.home.hotkey}`);

// the window is a transparent strip; only the dock itself takes clicks
$('dock').addEventListener('mouseenter', () => sd.dockMouse(true));
$('dock').addEventListener('mouseleave', () => { sd.dockMouse(false); hideTip(); });
const setShown = (show) => { document.body.classList.toggle('away', !show); if (!show) { hideTip(); magnify(null); } };
sd.onDockShown(setShown);
sd.dockState().then(setShown);

sd.onSettings((n) => { s = n; applyLook(); render(); renderMedia(); });
sd.onWindows((list) => { wins = list; render(); });
applyLook(); tick(); setInterval(tick, 1000);
wins = await sd.windows().catch(() => []);
render();
