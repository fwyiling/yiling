// The desktops overview (Ctrl+Alt+Up): every desktop along the top, this desktop's windows below as live previews.
import { applyAccent, useTheme } from './common.js';
const sd = window.sd;
const $ = (id) => document.getElementById(id);
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let s = await sd.get(), data = null, thumbT = 0;
applyAccent(s.accent);
sd.onSettings((n) => { s = n; applyAccent(s.accent); });

const icons = new Map();
const iconOf = (exe) => { if (!icons.has(exe)) icons.set(exe, sd.exeIcon(exe).catch(() => '')); return icons.get(exe); };
// a desktop's wallpaper, small: its photo / video / page, or the Windows background
function wallNode(d) {
  const q = `desk=${encodeURIComponent(d.id)}&v=${encodeURIComponent(d.wall.stamp || 0)}`;
  if (d.wall.has && d.wall.scene === 'image') { const i = new Image(); i.alt = ''; i.src = `sd://media/wallpaper?${q}`; return i; }
  if (d.wall.has && d.wall.scene === 'video') { const v = document.createElement('video'); Object.assign(v, { src: `sd://media/wallpaper?${q}#t=1`, muted: true, preload: 'metadata' }); return v; }
  if (d.wall.has && d.wall.scene === 'web') { const w = document.createElement('div'); w.className = 'web'; w.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>'; return w; }
  const i = new Image(); i.alt = ''; i.src = `sd://media/winwall?desk=${encodeURIComponent(d.id)}`; i.onerror = () => i.remove(); return i;
}
function renderDesks() {
  const items = data.desks.map((d, i) => {
    const el = document.createElement('div');
    el.className = 'desk' + (i === data.current ? ' cur' : '');
    el.innerHTML = `<button class="x" title="Close this desktop (its windows move next door)">${X}</button><div class="shot"><div class="apps"></div></div><div class="name"></div>`;
    el.querySelector('.shot').prepend(wallNode(d));
    if (data.desks.length < 2) el.querySelector('.x').remove();
    const name = el.querySelector('.name'); name.textContent = d.name; name.title = 'Double-click to rename';
    // its windows, small, where they really are (live pictures where Windows gives them; the app's icon meanwhile);
    // minimized ones as icons along the bottom
    const apps = data.windows.filter((w) => w.desk === d.id), shot = el.querySelector('.shot'), box = el.querySelector('.apps');
    for (const w of [...apps].reverse()) { // bottom-most first, so the window in front is drawn last
      if (!w.at || w.minimized) continue;
      const m = document.createElement('div'); m.className = 'mini'; m.dataset.hwnd = w.hwnd; m.title = w.title;
      const cl = (v) => Math.max(0, Math.min(1, v));
      const x = cl(w.at.x), y = cl(w.at.y), r = cl(w.at.x + w.at.w), b = cl(w.at.y + w.at.h);
      if (r - x < 0.02 || b - y < 0.02) continue;
      Object.assign(m.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${(r - x) * 100}%`, height: `${(b - y) * 100}%` });
      const img = new Image(); img.alt = ''; iconOf(w.exe).then((u) => { if (u) img.src = u; else img.remove(); }); m.append(img);
      shot.append(m); dragOf(m, w);
    }
    const mins = apps.filter((w) => w.minimized || !w.at), seen = new Set();
    for (const w of mins) { if (seen.has(w.exe) || seen.size >= 6) continue; seen.add(w.exe); const img = new Image(); img.alt = ''; iconOf(w.exe).then((u) => { if (u) img.src = u; else img.remove(); }); box.append(img); }
    shot.onclick = () => { if (!justDragged) sd.ov('desk', i); };
    el.querySelector('.x')?.addEventListener('click', (e) => { e.stopPropagation(); sd.ov('remove', i); });
    // rename: double-click the name, Enter keeps it, Esc puts it back
    name.ondblclick = () => {
      name.contentEditable = 'true'; name.focus(); document.getSelection().selectAllChildren(name);
      const done = (keep) => { name.contentEditable = 'false'; name.onkeydown = null; name.onblur = null; if (keep && name.textContent.trim() !== d.name) sd.ov('rename', d.id, name.textContent.trim()); else name.textContent = d.name; };
      name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      name.onblur = () => done(true);
    };
    el.dataset.i = i; // a window dropped here moves to this desktop (see dragOf)
    return el;
  });
  const add = document.createElement('div'); add.className = 'desk add';
  add.innerHTML = '<div class="shot" title="New desktop (Win+Ctrl+D)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div><div class="name">New desktop</div>';
  add.querySelector('.shot').onclick = () => sd.ov('add');
  $('desks').replaceChildren(...items, add);
}
// this desktop's windows in a grid that fills the space (wider cells for a wide screen)
function renderWins() {
  const here = data.desks[data.current]?.id;
  const list = data.windows.filter((w) => w.desk === here);
  if (!list.length) { $('wins').style.gridTemplateColumns = ''; $('wins').innerHTML = '<div class="empty">No windows on this desktop</div>'; sd.thumbs([]).catch(() => {}); return; }
  const r = $('wins').getBoundingClientRect(), W = r.width - 120, H = r.height - 36;
  let best = { cols: 1, size: 0 };
  for (let cols = 1; cols <= list.length; cols++) { // the column count that gives the biggest 16:10 cells
    const rows = Math.ceil(list.length / cols), cw = (W - (cols - 1) * 30) / cols, ch = (H - (rows - 1) * 26) / rows - 34;
    const size = Math.min(cw, ch * 1.6);
    if (size > best.size) best = { cols, size, rows };
  }
  const cw = Math.min(best.size, 520), ch = cw / 1.6;
  $('wins').style.gridTemplateColumns = `repeat(${best.cols}, ${Math.floor(cw)}px)`;
  $('wins').replaceChildren(...list.map((w) => {
    const el = document.createElement('div');
    el.className = 'win' + (w.active ? ' active' : ''); el.dataset.hwnd = w.hwnd;
    el.innerHTML = `<div class="tb" style="height:${Math.floor(ch)}px" data-hwnd="${w.hwnd}"><img alt="">${w.minimized ? '<em>Minimized</em>' : ''}</div><div class="wt"><img alt=""><span></span><button class="x" title="Close">${X}</button></div>`;
    el.querySelector('span').textContent = w.title; el.title = w.title;
    iconOf(w.exe).then((u) => el.querySelectorAll('img').forEach((img) => { if (u) img.src = u; else img.remove(); }));
    el.onclick = () => { if (!justDragged) sd.ov('focus', w.hwnd); };
    el.onauxclick = (e) => { if (e.button === 1) { el.classList.add('gone'); sd.ov('close-window', w.hwnd); } };
    el.onmousedown = (e) => { if (e.button === 1) e.preventDefault(); };
    el.querySelector('.x').onclick = (e) => { e.stopPropagation(); el.classList.add('gone'); sd.ov('close-window', w.hwnd); };
    dragOf(el, w);
    return el;
  }));
  clearTimeout(thumbT); thumbT = setTimeout(placeThumbs, 170); // once the fade-in has settled (previews don't follow CSS animations)
}
// live pictures: the big previews of this desktop's windows, and the small windows inside every desktop
async function placeThumbs(skip = 0) {
  const boxes = [...document.querySelectorAll('.win:not(.gone) .tb')].filter((el) => +el.dataset.hwnd !== skip);
  const minis = [...document.querySelectorAll('.desk .mini')].filter((el) => +el.dataset.hwnd !== skip && !el.closest('.win.gone'));
  const rects = boxes.map((el) => { const r = el.getBoundingClientRect(); return { hwnd: +el.dataset.hwnd, x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })
    .concat(minis.map((el) => { const r = el.getBoundingClientRect(); return { hwnd: +el.dataset.hwnd, key: 'm', fill: true, x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const shown = await sd.thumbs(rects).catch(() => []);
  for (const el of boxes) el.classList.toggle('live', shown.includes(+el.dataset.hwnd));
  for (const el of minis) el.classList.toggle('live', shown.includes(+el.dataset.hwnd));
}
// dragging a window (a big preview, or a small one in a desktop) onto a desktop moves it there. Done with the pointer,
// not the browser's drag and drop: a card follows the pointer (the live picture can't, it's drawn by Windows), the
// desktop under it lights up, and letting go there moves the window.
let justDragged = false;
function dragOf(el, w) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.x')) return;
    const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = document.createElement('div'); ghost.className = 'ghost';
        ghost.innerHTML = '<img alt=""><span></span>'; ghost.querySelector('span').textContent = w.title;
        iconOf(w.exe).then((u) => { if (u) ghost.querySelector('img').src = u; else ghost.querySelector('img').remove(); });
        document.body.append(ghost); document.body.classList.add('dragging');
        document.querySelectorAll(`[data-hwnd="${w.hwnd}"]`).forEach((n) => n.classList.add('lifted'));
        placeThumbs(w.hwnd); // its live pictures off while it's carried
      }
      ghost.style.transform = `translate(${ev.clientX - 110}px, ${ev.clientY - 70}px)`;
      const desk = document.elementsFromPoint(ev.clientX, ev.clientY).map((n) => n.closest?.('.desk:not(.add)')).find(Boolean) || null;
      const ok = desk && data.desks[+desk.dataset.i]?.id !== w.desk; // not the desktop it's already on
      if (over !== desk) { over?.classList.remove('drop'); over = desk; if (over && ok) over.classList.add('drop'); }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (!ghost) return;
      justDragged = true; setTimeout(() => { justDragged = false; }, 50);
      ghost.remove(); document.body.classList.remove('dragging');
      const target = over && over.classList.contains('drop') ? +over.dataset.i : -1;
      over?.classList.remove('drop');
      document.querySelectorAll(`[data-hwnd="${w.hwnd}"]`).forEach((n) => n.classList.remove('lifted'));
      if (target >= 0) { document.querySelectorAll(`.win[data-hwnd="${w.hwnd}"]`).forEach((n) => n.classList.add('gone')); sd.ov('move', w.hwnd, target); }
      else placeThumbs();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
}
function render(d) {
  data = d; sel = -1;
  const cur = data.desks[data.current];
  // behind it all: this desktop's wallpaper (a photo, or the Windows background), blurred
  const q = cur ? `desk=${encodeURIComponent(cur.id)}&v=${encodeURIComponent(cur.wall.stamp || 0)}` : '';
  const bg = !cur ? '' : cur.wall.has && cur.wall.scene === 'image' ? `sd://media/wallpaper?${q}` : !cur.wall.has ? `sd://media/winwall?${q}` : '';
  $('bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  renderDesks(); renderWins();
  if (d.instant) shownAt = Date.now();
  if (d.instant) { // opened in place of Windows' Task View: there at once, no fade over it
    $('ov').style.transition = 'none'; $('ov').classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => { $('ov').style.transition = ''; }));
  } else requestAnimationFrame(() => $('ov').classList.add('on'));
}
sd.onOverview(render);
sd.onOverviewClose(() => { $('ov').classList.remove('on'); clearTimeout(thumbT); });
// arrow keys (or Tab) pick a window, Enter goes to it, Delete closes it; 1-9 switch desktop
let sel = -1, shownAt = 0;
function select(i) {
  const wins = [...document.querySelectorAll('.win:not(.gone)')];
  if (!wins.length) { sel = -1; return; }
  sel = Math.max(0, Math.min(wins.length - 1, i));
  wins.forEach((w, k) => w.classList.toggle('sel', k === sel));
}
addEventListener('keydown', (e) => {
  if (document.activeElement?.contentEditable === 'true') return; // renaming a desktop
  const wins = [...document.querySelectorAll('.win:not(.gone)')];
  const cols = Math.max(1, getComputedStyle($('wins')).gridTemplateColumns.split(' ').length);
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key] ?? (e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0);
  if (step && wins.length) { e.preventDefault(); select(sel < 0 ? 0 : e.key === 'Tab' ? (sel + step + wins.length) % wins.length : sel + step); return; }
  if (e.key === 'Enter' && wins[sel]) { sd.ov('focus', +wins[sel].dataset.hwnd); return; }
  if (e.key === 'Delete' && wins[sel]) { wins[sel].classList.add('gone'); sd.ov('close-window', +wins[sel].dataset.hwnd); select(sel); return; }
  if (e.key === 'Escape' && Date.now() - shownAt > 300) sd.ov('hide'); // not the Esc that closed Task View
  if (/^[1-9]$/.test(e.key) && data && +e.key <= data.desks.length) sd.ov('desk', +e.key - 1);
});
// a click on the empty background closes it, like Mission Control
$('ov').addEventListener('click', (e) => { if (e.target === $('ov') || e.target.classList.contains('wins') || e.target.classList.contains('strip') || e.target.classList.contains('hint')) sd.ov('hide'); });
addEventListener('resize', () => { if (data && $('ov').classList.contains('on')) renderWins(); });
useTheme('overview'); // Customize > Themes
