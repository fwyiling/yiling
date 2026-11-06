// Syndicates dock: Start, Home, pinned apps, open windows grouped by app, now playing, quick settings, clock.
import { applyAccent, esc } from './common.js';

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get(), wins = [];
const icons = new Map(), targets = new Map();
const norm = (p) => String(p || '').toLowerCase();
// a Store app's windows run from WindowsApps\Name_Version_Arch__Publisher\…; its pin says store:name|publisher
const windowKey = (exe) => { const m = /\\windowsapps\\([^\\]+)\\/i.exec(exe || ''); if (!m) return norm(exe); const x = m[1].toLowerCase().split('_'); return `store:${x[0]}|${x[x.length - 1]}`; };

function applyLook() {
  applyAccent(s.accent);
  const dk = s.dock;
  document.body.classList.toggle('full', dk.style === 'full');
  document.body.classList.toggle('floating', dk.style !== 'full');
  const h = { s: 52, m: 64, l: 78 }[dk.size] || 64;
  document.documentElement.style.setProperty('--h', `${h}px`);
  document.documentElement.style.setProperty('--op', Math.max(0.8, dk.opacity ?? 0.96));
  $('clock').hidden = !dk.clock || !!s.topbar?.on; // the top bar shows the time already
  $('start').hidden = dk.start === false; $('home').hidden = dk.homeBtn === false;
  // the top bar already shows Wi-Fi, sound and the time: no need for them twice
  const top = !!s.topbar?.on;
  $('quick').hidden = dk.quick === false || top; $('gear').hidden = dk.gear === false;
  magnifyOn = dk.magnify !== false; if (!magnifyOn) magnify(null);
  $('pins').hidden = !dk.pinned;
  $('bin').hidden = dk.bin === false; $('shots').hidden = dk.shots === false;
  $('stackSep').hidden = $('bin').hidden && $('shots').hidden;
  $('running').hidden = !dk.running;
}

// ---------- tooltips (shown in the clear space above the dock) ----------
function showTip(el, text) {
  const t = $('tip'), r = el.getBoundingClientRect();
  t.textContent = text; t.style.left = `${r.left + r.width / 2}px`; t.hidden = false;
}
const hideTip = () => { $('tip').hidden = true; };
function tip(el, text) { el.dataset.tip = text; }
// a message under an icon for a few seconds (e.g. an app that wouldn't open)
function flashTip(el, text) { showTip(el, text); clearTimeout(flashTip.t); flashTip.t = setTimeout(hideTip, 4000); }
document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, el.dataset.tip); });
document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hideTip(); });

// ---------- magnification (macOS Dock): icons near the cursor grow and push their neighbours ----------
const MAX = 0.42, RANGE = 110;
let magnifyOn = true;
function magnify(x) {
  if (!magnifyOn) x = null;
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

// Dragging files like on a Mac: hold them over an app in the dock and it comes forward (so you can drop them into
// its window), or let go on the icon to open them in that app. The taskbar did the first; the dock replaced it.
function springLoad(b, open, target, name) {
  let t = 0;
  const files = (e) => e.dataTransfer?.types.includes('Files');
  b.addEventListener('dragenter', (e) => {
    if (!files(e)) return;
    b.classList.add('drop'); clearTimeout(t);
    if (open.length) t = setTimeout(() => { b.classList.add('sprung'); sd.focusWindow((open.find((w) => w.active) || open[0]).hwnd, false).catch(() => {}); }, 650);
  });
  b.addEventListener('dragover', (e) => { if (files(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  const done = () => { clearTimeout(t); b.classList.remove('drop', 'sprung'); };
  b.addEventListener('dragleave', (e) => { if (!b.contains(e.relatedTarget)) done(); });
  b.addEventListener('drop', async (e) => {
    if (!files(e)) return;
    e.preventDefault(); done();
    const n = await sd.dockOpenWith(target, [...e.dataTransfer.files]).catch(() => 0);
    if (n) flashTip(b, `Opening ${n} file${n > 1 ? 's' : ''} in ${name}`);
  });
}

const launching = new Map(); // pinned apps starting up: path -> timer
async function render() {
  const pins = s.home.pins || [];
  const pinExes = await Promise.all(pins.map((p) => pinTarget(p.path)));
  const byExe = new Map();
  for (const w of wins) { const k = windowKey(w.exe); if (!byExe.has(k)) byExe.set(k, []); byExe.get(k).push(w); }
  const used = new Set();
  $('pins').replaceChildren(...pins.map((p, i) => {
    const k = norm(pinExes[i]), open = byExe.get(k) || [];
    if (open.length) used.add(k);
    const b = document.createElement('button');
    b.className = 'item' + (open.length ? ' running' : '') + (open.some((w) => w.active) ? ' active' : '');
    b.append(iconFor(`pin:${p.path}`, () => sd.appIcon(p.path), p.name));
    if (open.length > 1) b.insertAdjacentHTML('beforeend', `<span class="count">${open.length}</span>`);
    if (open.length) launching.delete(p.path); else if (launching.has(p.path)) b.classList.add('launching'); // its window is up: stop bouncing
    b.onclick = () => {
      if (open.length) return focusGroup(open);
      // like a Mac: the icon bounces until the app's window shows (at most a few seconds)
      launching.set(p.path, setTimeout(() => { launching.delete(p.path); render(); }, 4000)); b.classList.add('launching');
      sd.launch(p.path).catch((e) => { clearTimeout(launching.get(p.path)); launching.delete(p.path); b.classList.remove('launching'); flashTip(b, `Couldn't open ${p.name}: ${String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`); });
    };
    b.oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, [['Move left', () => movePin(i, -1)], ['Move right', () => movePin(i, 1)], ['Unpin', () => sd.unpin(p.path)]]); };
    // drag pinned icons to reorder them
    b.draggable = true;
    b.ondragstart = (e) => { e.dataTransfer.setData('text/x-pin', String(i)); e.dataTransfer.effectAllowed = 'move'; hideTip(); };
    b.ondragover = (e) => { if (e.dataTransfer.types.includes('text/x-pin')) { e.preventDefault(); b.classList.add('dropbefore'); } };
    b.ondragleave = () => b.classList.remove('dropbefore');
    b.ondrop = (e) => { if (!e.dataTransfer.types.includes('text/x-pin')) return; e.preventDefault(); b.classList.remove('dropbefore'); const from = +e.dataTransfer.getData('text/x-pin'); if (from !== i) reorderPins(from, i); };
    springLoad(b, open, p.path, p.name);
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
    springLoad(b, list, w.exe, name);
    tip(b, list.length > 1 ? `${name} · ${list.length} windows` : w.title);
    return b;
  }));
  const showPins = s.dock.pinned && pins.length, showRun = s.dock.running && rest.length;
  $('runSep').hidden = !(showPins && showRun);
  $('homeSep').hidden = !(showPins || showRun);
}

// ---------- Screenshots stack and Bin, at the end of the apps (like a Mac's Downloads stack and Trash) ----------
const FOLDER = '<svg viewBox="0 0 48 48" class="folder"><path d="M6 15.5a3.5 3.5 0 0 1 3.5-3.5h9l3.5 4h16.5a3.5 3.5 0 0 1 3.5 3.5V36a3.5 3.5 0 0 1-3.5 3.5h-29A3.5 3.5 0 0 1 6 36z"/><rect x="17" y="22.5" width="14" height="10" rx="2"/><circle cx="24" cy="27.5" r="2.6"/></svg>';
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
let shotItems = [];
function renderShots(st) {
  shotItems = st?.items || [];
  const pile = $('shots').querySelector('.pile');
  const top = shotItems.filter((x) => x.thumb).slice(0, 3);
  if (!top.length) pile.innerHTML = FOLDER;
  else pile.replaceChildren(...top.map((it, i) => { const im = new Image(); im.src = it.thumb; im.alt = ''; im.style.setProperty('--i', i); im.style.zIndex = 3 - i; return im; }));
  $('shots').classList.toggle('empty', !top.length);
  tip($('shots'), shotItems.length ? `Screenshots · newest ${ago(shotItems[0].time)}` : 'Screenshots');
}
$('shots').onclick = () => { const r = $('shots').getBoundingClientRect(); hideTip(); sd.flyout('shots', Math.round(r.left + r.width / 2)); };
$('shots').oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, [['Open the Screenshots folder', () => sd.shotsFolder()], ['Take a screenshot', () => sd.takeShot()]]); };
sd.onShots(renderShots); sd.shots().then(renderShots).catch(() => {});

let binItems = 0;
function renderBin(b) {
  binItems = b?.items || 0;
  $('bin').classList.toggle('full', binItems > 0);
  tip($('bin'), binItems ? `Bin · ${binItems} item${binItems > 1 ? 's' : ''}` : 'Bin · empty');
}
$('bin').onclick = () => sd.openBin();
$('bin').oncontextmenu = (e) => { e.preventDefault(); menu(e.clientX, [['Open', () => sd.openBin()], ...(binItems ? [['Empty Bin…', () => sd.emptyBin()]] : [])]); };
// drop files on the Bin to delete them (they stay restorable in it); drop a pinned app on it to unpin it
$('bin').ondragover = (e) => { const t = e.dataTransfer.types; if (t.includes('Files') || t.includes('text/x-pin')) { e.preventDefault(); $('bin').classList.add('drop'); } };
$('bin').ondragleave = () => $('bin').classList.remove('drop');
$('bin').ondrop = async (e) => {
  e.preventDefault(); $('bin').classList.remove('drop');
  const pin = e.dataTransfer.getData('text/x-pin');
  if (pin !== '') { const p = (s.home.pins || [])[+pin]; if (p) sd.unpin(p.path); return; }
  const n = await sd.trashFiles([...e.dataTransfer.files]).catch(() => 0);
  if (n) flashTip($('bin'), `Moved ${n} item${n > 1 ? 's' : ''} to the Bin`);
};
sd.onBin(renderBin); sd.bin().then(renderBin).catch(() => {});

// ---------- scroll over the dock (wheel or two fingers) to go to the next / previous app, MacBook style ----------
let wheelAcc = 0, wheelAt = 0;
document.addEventListener('wheel', (e) => { // anywhere on the dock window, not only exactly over an icon
  e.preventDefault();
  wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(wheelAcc) < 60 || Date.now() - wheelAt < 280) return;
  const dir = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; wheelAt = Date.now();
  sd.switchApp(dir); // the same instant switch as the three-finger swipe
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

// ---------- reorder pinned apps ----------
async function reorderPins(from, to) {
  const pins = [...(s.home.pins || [])]; const [p] = pins.splice(from, 1); pins.splice(to, 0, p);
  s = await sd.set({ home: { pins } }); render();
}
const movePin = (i, d) => { const n = (s.home.pins || []).length; if (i + d >= 0 && i + d < n) reorderPins(i, i + d); };

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
