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
    const apps = data.windows.filter((w) => w.desk === d.id), seen = new Set(), box = el.querySelector('.apps');
    for (const w of apps) { if (seen.has(w.exe) || seen.size >= 6) continue; seen.add(w.exe); const img = new Image(); img.alt = ''; iconOf(w.exe).then((u) => { if (u) img.src = u; else img.remove(); }); box.append(img); }
    if (apps.length > 6) box.insertAdjacentHTML('beforeend', `<em>+${apps.length - 6}</em>`);
    el.querySelector('.shot').onclick = () => sd.ov('desk', i);
    el.querySelector('.x')?.addEventListener('click', (e) => { e.stopPropagation(); sd.ov('remove', i); });
    // rename: double-click the name, Enter keeps it, Esc puts it back
    name.ondblclick = () => {
      name.contentEditable = 'true'; name.focus(); document.getSelection().selectAllChildren(name);
      const done = (keep) => { name.contentEditable = 'false'; name.onkeydown = null; name.onblur = null; if (keep && name.textContent.trim() !== d.name) sd.ov('rename', d.id, name.textContent.trim()); else name.textContent = d.name; };
      name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      name.onblur = () => done(true);
    };
    // drop a window here: it moves to this desktop
    el.ondragover = (e) => { if (e.dataTransfer.types.includes('text/x-hwnd') && i !== data.current) { e.preventDefault(); el.classList.add('drop'); } };
    el.ondragleave = () => el.classList.remove('drop');
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const hwnd = +e.dataTransfer.getData('text/x-hwnd');
      document.querySelector(`.win[data-hwnd="${hwnd}"]`)?.classList.add('gone');
      sd.ov('move', hwnd, i);
    };
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
    el.className = 'win' + (w.active ? ' active' : ''); el.dataset.hwnd = w.hwnd; el.draggable = true;
    el.innerHTML = `<div class="tb" style="height:${Math.floor(ch)}px" data-hwnd="${w.hwnd}"><img alt="">${w.minimized ? '<em>Minimized</em>' : ''}</div><div class="wt"><img alt=""><span></span><button class="x" title="Close">${X}</button></div>`;
    el.querySelector('span').textContent = w.title; el.title = w.title;
    iconOf(w.exe).then((u) => el.querySelectorAll('img').forEach((img) => { if (u) img.src = u; else img.remove(); }));
    el.onclick = () => sd.ov('focus', w.hwnd);
    el.onauxclick = (e) => { if (e.button === 1) { el.classList.add('gone'); sd.ov('close-window', w.hwnd); } };
    el.onmousedown = (e) => { if (e.button === 1) e.preventDefault(); };
    el.querySelector('.x').onclick = (e) => { e.stopPropagation(); el.classList.add('gone'); sd.ov('close-window', w.hwnd); };
    el.ondragstart = (e) => { e.dataTransfer.setData('text/x-hwnd', String(w.hwnd)); e.dataTransfer.effectAllowed = 'move'; const img = el.querySelector('.wt img'); if (img?.src) e.dataTransfer.setDragImage(img, 8, 8); };
    return el;
  }));
  clearTimeout(thumbT); thumbT = setTimeout(placeThumbs, 170); // once the fade-in has settled (previews don't follow CSS animations)
}
async function placeThumbs() {
  const boxes = [...document.querySelectorAll('.win:not(.gone) .tb')];
  const shown = await sd.thumbs(boxes.map((el) => { const r = el.getBoundingClientRect(); return { hwnd: +el.dataset.hwnd, x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 }; })).catch(() => []);
  for (const el of boxes) el.classList.toggle('live', shown.includes(+el.dataset.hwnd));
}
function render(d) {
  data = d;
  const cur = data.desks[data.current];
  // behind it all: this desktop's wallpaper (a photo, or the Windows background), blurred
  const q = cur ? `desk=${encodeURIComponent(cur.id)}&v=${encodeURIComponent(cur.wall.stamp || 0)}` : '';
  const bg = !cur ? '' : cur.wall.has && cur.wall.scene === 'image' ? `sd://media/wallpaper?${q}` : !cur.wall.has ? `sd://media/winwall?${q}` : '';
  $('bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  renderDesks(); renderWins();
  requestAnimationFrame(() => $('ov').classList.add('on'));
}
sd.onOverview(render);
sd.onOverviewClose(() => { $('ov').classList.remove('on'); clearTimeout(thumbT); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement?.contentEditable !== 'true') sd.ov('hide');
  if (/^[1-9]$/.test(e.key) && document.activeElement?.contentEditable !== 'true' && data && +e.key <= data.desks.length) sd.ov('desk', +e.key - 1);
});
// a click on the empty background closes it, like Mission Control
$('ov').addEventListener('click', (e) => { if (e.target === $('ov') || e.target.classList.contains('wins') || e.target.classList.contains('strip') || e.target.classList.contains('hint')) sd.ov('hide'); });
addEventListener('resize', () => { if (data && $('ov').classList.contains('on')) renderWins(); });
useTheme('overview'); // Customize > Themes
