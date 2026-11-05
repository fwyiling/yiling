// Customize window: live preview (drag widgets to move them) + wallpaper / widget / Home / general settings.
import { mountWallpaper } from './wallpaper-view.js';
import { createScene, SCENE_NAMES } from './scenes.js';
import { applyAccent } from './common.js';

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get();
applyAccent(s.accent);

// ---------- live preview ----------
const preview = $('preview');
const view = mountWallpaper(preview, s, { preview: true });
const save = (patch) => sd.set(patch).then((n) => (s = n));
sd.onSettings((n) => { s = n; applyAccent(s.accent); view.update(s); paint(); });
preview.addEventListener('pointermove', (e) => { const r = preview.getBoundingClientRect(); view.pointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
preview.addEventListener('pointerleave', () => view.pointer(0.5, 0.5));

// drag widgets to place them (stored as fractions of the screen, so any resolution works)
preview.addEventListener('pointerdown', (e) => {
  const w = e.target.closest('.wp-widgets [data-w]');
  if (!w || !preview.classList.contains('editing')) return;
  e.preventDefault();
  if ((s.widgets.layout || 'center') !== 'free') { // keep everything where it is, then let this one move freely
    const pos = view.positions();
    s = { ...s, widgets: { ...s.widgets, layout: 'free', ...Object.fromEntries(Object.entries(pos).map(([k, p]) => [k, { ...s.widgets[k], ...p }])) } };
    view.update(s);
    save({ widgets: { layout: 'free', ...pos } });
  }
  w.setPointerCapture(e.pointerId); w.classList.add('dragging');
  const key = w.dataset.w, r = preview.getBoundingClientRect();
  const move = (ev) => {
    const x = Math.min(0.98, Math.max(0.02, (ev.clientX - r.left) / r.width)), y = Math.min(0.98, Math.max(0.02, (ev.clientY - r.top) / r.height));
    w.style.left = `${x * 100}%`; w.style.top = `${y * 100}%`;
    w.dataset.x = x; w.dataset.y = y;
  };
  const up = () => {
    w.removeEventListener('pointermove', move); w.classList.remove('dragging');
    if (w.dataset.x) save({ widgets: { [key]: { x: +(+w.dataset.x).toFixed(4), y: +(+w.dataset.y).toFixed(4) } } });
  };
  w.addEventListener('pointermove', move);
  w.addEventListener('pointerup', up, { once: true });
});

// ---------- tabs ----------
document.querySelectorAll('.side [data-tab]').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.side [data-tab]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('on', p.dataset.panel === b.dataset.tab));
  preview.classList.toggle('editing', b.dataset.tab === 'widgets');
  document.querySelector('.preview-wrap').hidden = !['wallpaper', 'widgets'].includes(b.dataset.tab); // the preview only matters for these
  $('tip').textContent = b.dataset.tab === 'widgets' ? 'Drag any widget to move it.' : 'This is your desktop. Changes apply instantly.';
});

// ---------- generic inputs: data-k="path.to.key" ----------
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const patchOf = (p, v) => p.split('.').reduceRight((acc, k) => ({ [k]: acc }), v);
const fmt = { 'dock.opacity': (v) => `${Math.round(v * 100)}%`, 'wallpaper.speed': (v) => `${(+v).toFixed(2)}×`, 'wallpaper.intensity': (v) => `${Math.round(v * 100)}%`, 'wallpaper.dim': (v) => `${Math.round(v * 100)}%` };
document.querySelectorAll('[data-k]').forEach((el) => {
  const k = el.dataset.k;
  const read = () => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : k === 'general.fps' ? +el.value : el.value);
  el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    if (el.type === 'range') el.parentElement.querySelector('em').textContent = fmt[k]?.(el.value) ?? el.value;
    save(patchOf(k, read()));
  });
});

// ---------- scenes ----------
const GLYPHS = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2.5"/><path d="M17 10l4-2.5v9L17 14"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>',
};
const minis = [];
const sceneEls = [...Object.keys(SCENE_NAMES), 'image', 'video', 'web'].map((key) => {
  const b = document.createElement('button'); b.className = 'scene'; b.dataset.scene = key;
  if (SCENE_NAMES[key]) { const c = document.createElement('canvas'); b.append(c); minis.push([key, c]); }
  else b.insertAdjacentHTML('beforeend', `<div class="glyph">${GLYPHS[key]}</div>`);
  b.insertAdjacentHTML('beforeend', `<span>${SCENE_NAMES[key] || { image: 'Image', video: 'Video', web: 'Web page' }[key]}</span>`);
  b.onclick = () => save({ wallpaper: { scene: key } });
  $('scenes').append(b);
  return b;
});
const miniScenes = minis.map(([key, c]) => ({ key, scene: createScene(c, { ...s.wallpaper, scene: key, fps: 20, parallax: false }) }));
$('pick').onclick = async () => {
  const kind = s.wallpaper.scene === 'video' ? 'video' : 'image';
  const p = await sd.pickFile(kind);
  if (p) save({ wallpaper: { file: p, fileStamp: Date.now() } });
};
$('urlSet').onclick = () => { const u = $('url').value.trim(); if (/^https?:\/\//i.test(u)) save({ wallpaper: { url: u } }); else $('url').focus(); };

// ---------- colours ----------
const PRESETS = [
  ['Syndicates', ['#5e7d9c', '#a7afb8', '#2b3a4d']], ['Midnight', ['#3b5bdb', '#7048e8', '#141a33']], ['Sunset', ['#f76707', '#e64980', '#3b1f2b']],
  ['Ocean', ['#1098ad', '#4dabf7', '#0b2833']], ['Forest', ['#2f9e44', '#94d82d', '#13261a']], ['Sakura', ['#f783ac', '#fcc2d7', '#3a2230']], ['Mono', ['#adb5bd', '#f1f3f5', '#212529']],
];
PRESETS.forEach(([name, cols]) => {
  const b = document.createElement('button'); b.className = 'preset'; b.title = name;
  b.innerHTML = cols.map((c) => `<i style="background:${c}"></i>`).join('');
  b.onclick = () => save({ wallpaper: { colors: cols } });
  $('presets').append(b);
});
document.querySelectorAll('[data-color]').forEach((inp) => inp.addEventListener('input', () => {
  const cols = [...s.wallpaper.colors]; cols[+inp.dataset.color] = inp.value; save({ wallpaper: { colors: cols } });
}));

// ---------- widgets list ----------
const WIDGETS = { clock: 'Clock', greeting: 'Greeting', date: 'Date', stats: 'CPU & memory', weather: 'Weather', quote: 'Quote', media: 'Now playing', today: 'Today (next class, to-dos)' };
$('wlist').replaceChildren(...Object.entries(WIDGETS).map(([k, label]) => {
  const r = document.createElement('div'); r.className = 'wrow'; r.dataset.w = k;
  r.innerHTML = `<input type="checkbox" title="Show"><b>${label}</b><input type="range" min="0.5" max="2" step="0.05" title="Size"><div class="extra"></div>`;
  r.querySelector('[type=checkbox]').onchange = (e) => save({ widgets: { [k]: { on: e.target.checked } } });
  r.querySelector('[type=range]').oninput = (e) => save({ widgets: { [k]: { scale: +e.target.value } } });
  const extra = r.querySelector('.extra');
  if (k === 'clock') { extra.innerHTML = '<select class="field"><option value="big">Big</option><option value="minimal">Minimal</option><option value="analog">Analog</option></select>'; extra.firstChild.onchange = (e) => save({ widgets: { clock: { style: e.target.value } } }); }
  if (k === 'weather') { extra.innerHTML = '<input class="field" placeholder="City (empty: automatic)">'; let t; extra.firstChild.oninput = (e) => { clearTimeout(t); t = setTimeout(() => save({ widgets: { weather: { city: e.target.value.trim() } } }), 600); }; }
  return r;
}));

// ---------- Home panel ----------
const hotkey = $('hotkey');
hotkey.onclick = () => {
  hotkey.classList.add('listening'); hotkey.textContent = 'Press keys…';
  const onKey = (e) => {
    e.preventDefault();
    if (e.key === 'Escape') return done();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (!mods.length) return; // a global shortcut needs a modifier
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    save({ home: { hotkey: [...mods, key].join('+') } });
    done();
  };
  const done = () => { removeEventListener('keydown', onKey, true); hotkey.classList.remove('listening'); paint(); };
  addEventListener('keydown', onKey, true);
};
$('clearPins').onclick = () => save({ home: { pins: [] } });
$('diag').onclick = async () => {
  const d = await sd.diagnostics();
  await navigator.clipboard.writeText(JSON.stringify(d, null, 2)).catch(() => {});
  const w = d.displays.map((x) => x.wallpaper).filter(Boolean);
  $('diagNote').textContent = `Copied. Windows helpers: ${d.win32.ready ? 'ready' : d.win32.error || 'off'} · wallpaper: ${w.length ? w.map((r) => (r.ok ? (r.raised ? 'attached (24H2 layout)' : 'attached') : r.reason)).join(', ') : 'not attached'}`;
};
$('openHome').onclick = () => sd.toggleHome(true);

// ---------- segmented choices stored in settings: data-seg="dock.style" ----------
document.querySelectorAll('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.onclick = (e) => { e.preventDefault(); save(patchOf(seg.dataset.seg, b.value)); }));

// ---------- Windows taskbar (read live from Windows, not stored by us) ----------
let tb = {};
async function loadTaskbar() { tb = await sd.taskbar().catch(() => ({ supported: false })); paintTaskbar(); }
function paintTaskbar() {
  document.querySelectorAll('[data-tb]').forEach((el) => {
    const k = el.dataset.tb;
    if (el.classList.contains('seg')) el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.value === tb[k]));
    else el.checked = !!tb[k];
    const lockedByDock = k === 'autoHide' && s.dock.on;
    (el.closest('.seg') || el).classList?.toggle('disabled', !tb.supported || lockedByDock);
    if (el.type === 'checkbox') el.disabled = !tb.supported || lockedByDock;
  });
  $('tbNote').textContent = tb.supported ? 'The same options as Windows Settings, applied straight away.' : 'These options work on Windows only.';
  $('autoHideNote').textContent = s.dock.on ? 'On while the Syndicates dock is in use.' : 'It slides up when you move the mouse to the bottom.';
}
document.querySelectorAll('[data-tb]').forEach((el) => {
  const k = el.dataset.tb;
  const set = async (v) => { tb = await sd.setTaskbar({ [k]: v }); paintTaskbar(); };
  if (el.classList.contains('seg')) el.querySelectorAll('button').forEach((b) => b.onclick = (e) => { e.preventDefault(); set(b.value); });
  else el.onchange = () => set(el.checked);
});
$('openColors').onclick = (e) => { e.preventDefault(); sd.windowsSettings('colors'); };
loadTaskbar();

// ---------- lock screen ----------
$('openLock').onclick = (e) => { e.preventDefault(); sd.windowsSettings('lockscreen'); };
$('openTouchpad').onclick = (e) => { e.preventDefault(); sd.windowsSettings('touchpad'); };
function showSwitch(st) {
  const keys = st.switchKeys ? 'Ctrl+Alt+Shift+←/→ are ready.' : 'Ctrl+Alt+Shift+←/→ are taken by another app on this PC, so swipes set to them can\'t reach Syndicates.';
  const last = st.lastSwitch ? ` Last switch: ${st.lastSwitch.via === 'gesture' ? 'from a swipe / the keys' : st.lastSwitch.via === 'test' ? 'from the Test button' : 'from the dock'}, ${new Date(st.lastSwitch.at).toLocaleTimeString()}${st.lastSwitch.note ? ` (${st.lastSwitch.note})` : st.lastSwitch.ok === false ? ' (Windows didn\'t bring the app forward)' : st.lastSwitch.to ? ` → ${st.lastSwitch.to}` : ''}.` : ' No swipe has arrived yet: if you swiped, the touchpad isn\'t sending the keys (check Advanced gestures).';
  $('switchStatus').textContent = keys + last;
}
sd.switchStatus().then(showSwitch).catch(() => {});
setInterval(() => { if (document.querySelector('[data-panel=general].on')) sd.switchStatus().then(showSwitch).catch(() => {}); }, 2000);
$('switchTest').onclick = async () => showSwitch(await sd.switchTest());
const GESTURE = { apps: 'switch apps', desktops: 'switch desktops ✓', volume: 'change the volume', nothing: 'do nothing', custom: 'press custom shortcuts' };
function showGestures(g) {
  if (!g?.precision) { $('gestureNote').textContent = 'No precision touchpad found: three-finger gestures need one. With a keyboard: Win+Ctrl+← / → switches desktops.'; $('macSwipe').disabled = true; return; }
  $('gestureNote').textContent = `Right now, three-finger swipes left / right ${GESTURE[g.three] || g.three}.`;
  $('macSwipe').disabled = g.three === 'desktops';
}
sd.gestures().then(showGestures).catch(() => {});
$('macSwipe').onclick = async () => showGestures(await sd.macGestures());
$('lockApply').onclick = async () => {
  const b = $('lockApply');
  b.disabled = true; b.textContent = 'Making the picture…';
  try {
    const r = await sd.applyLockScreen();
    $('lockStatus').textContent = r.lock ? `Lock screen updated${r.wallpaper ? ' · Windows wallpaper too' : ''}.` : `Picture saved, but Windows didn't take it: ${r.error}`;
  } catch (e) { $('lockStatus').textContent = `Couldn't make the picture: ${e.message}`; }
  b.disabled = false; b.textContent = 'Use my wallpaper as the lock screen';
};
function paintLock() {
  const L = s.lock, prev = $('lockPrev');
  if (L.last) { prev.style.backgroundImage = `url("sd://media/lock?v=${L.lastAt}")`; prev.classList.add('has'); }
  if (!$('lockStatus').textContent && L.lastAt) $('lockStatus').textContent = L.lastError ? `Last try: ${L.lastError}` : `Last updated ${new Date(L.lastAt).toLocaleString()}.`;
}

// ---------- reflect settings in the controls ----------
function paint() {
  document.querySelectorAll('[data-k]').forEach((el) => {
    if (el === document.activeElement && el.type !== 'checkbox' && el.type !== 'range') return;
    const v = getPath(s, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v;
    if (el.type === 'range') el.parentElement.querySelector('em').textContent = fmt[el.dataset.k]?.(v) ?? v;
  });
  const w = s.wallpaper;
  sceneEls.forEach((b) => b.classList.toggle('on', b.dataset.scene === w.scene));
  $('fileRow').hidden = !['image', 'video'].includes(w.scene);
  $('urlRow').hidden = w.scene !== 'web';
  $('pick').textContent = w.scene === 'video' ? 'Choose a video…' : 'Choose an image…';
  $('fileName').textContent = w.file ? w.file.split(/[\\/]/).pop() : 'No file chosen';
  if (document.activeElement !== $('url')) $('url').value = w.url || '';
  document.querySelectorAll('[data-color]').forEach((inp) => { inp.value = w.colors[+inp.dataset.color] || '#000000'; });
  document.querySelectorAll('.preset').forEach((b, i) => b.classList.toggle('on', PRESETS[i][1].join() === w.colors.join()));
  miniScenes.forEach((m) => m.scene.set({ ...w, scene: m.key, fps: 20, parallax: false }));
  document.querySelectorAll('.wrow').forEach((r) => {
    const c = s.widgets[r.dataset.w];
    r.querySelector('[type=checkbox]').checked = c.on;
    r.querySelector('[type=range]').value = c.scale || 1;
    const ex = r.querySelector('.extra .field');
    if (ex && ex !== document.activeElement) ex.value = r.dataset.w === 'clock' ? c.style || 'big' : c.city || '';
  });
  hotkey.textContent = s.home.hotkey || 'Not set';
  $('hk').textContent = s.home.hotkey || '';
  $('pinCount').textContent = `${s.home.pins.length} pinned`;
  document.querySelectorAll('[data-seg]').forEach((seg) => { const v = getPath(s, seg.dataset.seg); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.value === v)); });
  $('dockOpts').classList.toggle('off', !s.dock.on);
  $('topOpts').classList.toggle('off', !s.topbar?.on);
  paintLock();
  if (tb.supported !== undefined) paintTaskbar();
}
paint();
