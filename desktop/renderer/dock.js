// Syndicates dock: Home button, pinned apps, open windows grouped by app, clock.
import { applyAccent, esc } from './common.js';

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get(), wins = [];
const icons = new Map(), targets = new Map();
const norm = (p) => String(p || '').toLowerCase();

function applyLook() {
  applyAccent(s.accent);
  const dk = s.dock;
  document.body.className = dk.style === 'full' ? 'full' : 'floating';
  const h = { s: 52, m: 64, l: 78 }[dk.size] || 64;
  document.documentElement.style.setProperty('--h', `${h}px`);
  document.documentElement.style.setProperty('--op', dk.opacity ?? 0.85);
  $('clockBox').hidden = !dk.clock;
  $('pins').hidden = !dk.pinned;
  $('running').hidden = !dk.running;
}

function iconFor(key, loader, name) {
  const ph = document.createElement('div'); ph.className = 'ph'; ph.innerHTML = esc((name.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
  if (!icons.has(key)) icons.set(key, loader().catch(() => ''));
  icons.get(key).then((url) => { if (url) { const img = new Image(); img.src = url; img.alt = ''; ph.replaceWith(img); } });
  return ph;
}
function tip(el, text) {
  let t;
  el.onmouseenter = () => { t = Object.assign(document.createElement('div'), { className: 'tip', textContent: text }); const r = el.getBoundingClientRect(); t.style.left = `${r.left + r.width / 2}px`; document.body.append(t); };
  el.onmouseleave = () => t?.remove();
}
// click: bring forward; already in front: minimize; several windows: cycle through them
function focusGroup(list) {
  const i = list.findIndex((w) => w.active);
  const target = i >= 0 && list.length > 1 ? list[(i + 1) % list.length] : list[i >= 0 ? i : 0];
  sd.focusWindow(target.hwnd);
}

async function pinTarget(p) { if (!targets.has(p)) targets.set(p, sd.pinTarget(p).catch(() => p)); return targets.get(p); }

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
    tip(b, list.length > 1 ? `${name} · ${list.length} windows` : w.title);
    return b;
  }));
  $('runSep').hidden = !rest.length || !pins.length || !s.dock.running || !s.dock.pinned;
  $('homeSep').hidden = !(s.dock.pinned && pins.length) && !(s.dock.running && rest.length);
}

function tick() {
  const now = new Date();
  $('time').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// now playing
let np = { on: false };
function renderMedia() {
  $('np').hidden = !s.dock.media || !np.on;
  if ($('np').hidden) return;
  $('npTitle').textContent = np.title || 'Unknown title';
  $('npArtist').textContent = np.artist || '';
  $('np').classList.toggle('playing', !!np.playing);
  $('np').querySelector('.art').style.backgroundImage = /^data:image\//.test(np.art || '') ? `url("${np.art}")` : '';
}
$('np').querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => sd.mediaControl(b.dataset.m); });
sd.onMedia((m) => { np = m; renderMedia(); });
sd.media().then((m) => { np = m; renderMedia(); }).catch(() => {});

$('home').onclick = () => sd.toggleHome(true);
tip($('home'), `Home · ${s.home.hotkey}`);
sd.onSettings((n) => { s = n; applyLook(); render(); renderMedia(); });
sd.onWindows((list) => { wins = list; render(); });
applyLook(); tick(); setInterval(tick, 1000);
wins = await sd.windows().catch(() => []);
render();
