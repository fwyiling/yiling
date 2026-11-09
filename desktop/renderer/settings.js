// Customize window: live preview (drag widgets to move them) + wallpaper / widget / Home / general settings.
import { mountWallpaper } from './wallpaper-view.js';
import { PETS, petSvg } from './pets.js';
import { applyAccent, wallFor } from './common.js';

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
const fmt = { 'dock.opacity': (v) => `${Math.round(v * 100)}%`, 'wallpaper.dim': (v) => `${Math.round(v * 100)}%` };
document.querySelectorAll('[data-k]').forEach((el) => {
  const k = el.dataset.k;
  const read = () => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : k === 'general.fps' ? +el.value : el.value);
  el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    if (el.type === 'range') el.parentElement.querySelector('em').textContent = fmt[k]?.(el.value) ?? el.value;
    save(patchOf(k, read()));
  });
});

// ---------- background: photo, video or web page (one for all desktops, or one each) ----------
const GLYPHS = {
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2.5"/><path d="M17 10l4-2.5v9L17 14"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>',
};
const KINDS = { image: 'Photo', video: 'Video', web: 'Web page' };
let desks = { ids: [], names: [], current: 0 }, editDesk = ''; // '' = the main wallpaper (every desktop without its own)
const editing = () => (s.wallpaper.perDesk && editDesk ? wallFor(s.wallpaper, editDesk) : s.wallpaper);
const ownOf = (id) => s.wallpaper.desks?.[id] || null;
// a change to what's being edited: the main wallpaper, or that desktop's own (made from the main one the first time)
function savePick(patch) {
  if (!(s.wallpaper.perDesk && editDesk)) return save({ wallpaper: patch });
  const base = ownOf(editDesk) || { scene: s.wallpaper.scene, file: s.wallpaper.file, url: s.wallpaper.url, fileStamp: s.wallpaper.fileStamp };
  return save({ wallpaper: { desks: { [editDesk]: { ...base, ...patch } } } });
}
const sceneEls = Object.keys(KINDS).map((key) => {
  const b = document.createElement('button'); b.className = 'scene'; b.dataset.scene = key;
  b.innerHTML = `<div class="glyph">${GLYPHS[key]}</div><span>${KINDS[key]}</span>`;
  b.onclick = () => { const cur = editing(); savePick({ scene: key, ...(cur.scene !== key && key !== 'web' ? { file: '', fileStamp: Date.now() } : {}) }); };
  $('scenes').append(b);
  return b;
});
$('pick').onclick = async () => {
  const p = await sd.pickFile(editing().scene === 'video' ? 'video' : 'image');
  if (p) savePick({ file: p, fileStamp: Date.now() });
};
$('urlSet').onclick = () => { const u = $('url').value.trim(); if (/^https?:\/\//i.test(u)) savePick({ url: u }); else $('url').focus(); };
async function loadDesks() {
  desks = await sd.desktops().catch(() => desks);
  if (editDesk && !desks.ids.includes(editDesk)) editDesk = '';
  paintDesks();
}
function paintDesks() {
  const on = !!s.wallpaper.perDesk;
  $('deskRow').hidden = !on;
  view.setDesk(on && editDesk ? editDesk : desks.ids[desks.current] || '');
  if (!on) return;
  const chip = (id, label, sub) => {
    const b = document.createElement('button'); b.className = 'desk' + (editDesk === id ? ' on' : '') + (id && ownOf(id) ? ' own' : '');
    b.innerHTML = `<b></b><small></small>`; b.querySelector('b').textContent = label; b.querySelector('small').textContent = sub;
    b.onclick = () => { editDesk = id; paintDesks(); paint(); };
    return b;
  };
  const items = [chip('', 'Every desktop', 'unless it has its own')];
  desks.ids.forEach((id, i) => items.push(chip(id, desks.names[i] || `Desktop ${i + 1}`, `${ownOf(id) ? 'its own wallpaper' : 'the main one'}${i === desks.current ? ' · showing now' : ''}`)));
  if (editDesk && ownOf(editDesk)) { const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Use the main wallpaper here'; r.onclick = () => save({ wallpaper: { desks: { [editDesk]: null } } }); items.push(r); }
  $('deskRow').replaceChildren(...items);
}
addEventListener('focus', loadDesks); // a desktop added or renamed while Customize was in the background
loadDesks();

// ---------- widgets list ----------
const WIDGETS = { clock: 'Clock', greeting: 'Greeting', date: 'Date', stats: 'CPU & memory', weather: 'Weather', quote: 'Quote', media: 'Now playing', today: 'Today (next class, to-dos)', calendar: 'Calendar (Mac layout)', reminders: 'Reminders (Mac layout)' };
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
  $('accentTip').hidden = !st.autoAccent;
}
$('accentFix').onclick = (e) => { e.preventDefault(); sd.windowsSettings('colors'); };
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

// ---------- island pet ----------
const petBtns = [...Object.keys(PETS), 'none'].map((id) => {
  const b = document.createElement('button');
  b.dataset.pet = id; b.type = 'button';
  b.innerHTML = id === 'none' ? '<i class="none"></i>' : petSvg(id);
  b.append(document.createTextNode(id === 'none' ? 'No pet' : PETS[id].name));
  b.onclick = () => save({ island: { pet: id } });
  return b;
});
$('pets').replaceChildren(...petBtns);

// ---------- reflect settings in the controls ----------
function paint() {
  document.querySelectorAll('[data-k]').forEach((el) => {
    if (el === document.activeElement && el.type !== 'checkbox' && el.type !== 'range') return;
    const v = getPath(s, el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v;
    if (el.type === 'range') el.parentElement.querySelector('em').textContent = fmt[el.dataset.k]?.(v) ?? v;
  });
  const pet = PETS[s.island?.pet] ? s.island.pet : s.island?.pet === 'none' ? 'none' : 'cat';
  petBtns.forEach((b) => b.classList.toggle('on', b.dataset.pet === pet));
  $('petPick').hidden = !s.island?.on;
  const w = editing();
  sceneEls.forEach((b) => b.classList.toggle('on', b.dataset.scene === w.scene));
  $('fileRow').hidden = !['image', 'video'].includes(w.scene);
  $('urlRow').hidden = w.scene !== 'web';
  $('wpNote').hidden = !!(w.scene === 'web' ? w.url : w.file);
  paintDesks();
  $('pick').textContent = w.scene === 'video' ? 'Choose a video…' : 'Choose a photo…';
  $('fileName').textContent = w.file ? w.file.split(/[\\/]/).pop() : 'No file chosen';
  if (document.activeElement !== $('url')) $('url').value = w.url || '';
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

// nothing picked: Windows' own background, changed in Windows' Settings
$('winBg').onclick = (e) => { e.preventDefault(); sd.windowsSettings('background'); };
