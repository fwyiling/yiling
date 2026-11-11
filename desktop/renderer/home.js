// Home panel (Alt+Space): search apps and the web, pinned apps, to-dos, notes, system stats.
import { greeting, fmtTime, fmtDate, applyAccent, esc, DAYS, weekday, nextClass, byTime, useTheme } from './common.js';
const why = (e) => String(e?.message || e || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^TypeError: fetch failed$|net::ERR_[A-Z_]+/, "can't reach the internet right now");
// open an app or file; if Windows can't, Home stays open and says why (it used to fail silently)
async function openItem(p) {
  try { await sd.launch(p); }
  catch (e) { const h = document.getElementById('hint'); if (h) h.textContent = `Couldn't open ${String(p).split(/[\\/]/).pop()}: ${why(e) || 'Windows refused'}`; }
}

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get();
let apps = [];
const icons = new Map();
const ENGINES = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', brave: 'https://search.brave.com/search?q=' };

applyAccent(s.accent);
sd.onSettings((n) => { s = n; applyAccent(s.accent); renderTodos(); renderTimetable(); renderReading(); renderIconsBtn(); if (document.activeElement !== $('notes')) $('notes').value = s.home.notes || ''; if (!showAll) renderGrid(); });

// ---------- clock ----------
function tick() {
  const now = new Date(), { hm, ampm } = fmtTime(now);
  $('greet').textContent = greeting(now, s.name);
  $('date').textContent = fmtDate(now);
  $('time').innerHTML = `${hm}<small>${ampm}</small>`;
}
tick(); setInterval(tick, 1000);

// ---------- app icons ----------
const lazy = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); e.target.load?.(); } }, { rootMargin: '200px' });
const initial = (n) => esc((n.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
// apps without a real icon get a calm colour tile with their initial (colour from the name, so it never changes)
const hue = (n) => [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function iconEl(a) {
  const ph = document.createElement('div'); ph.className = 'ph'; ph.innerHTML = initial(a.name); ph.style.setProperty('--hue', hue(a.name));
  const load = async () => {
    if (!icons.has(a.path)) icons.set(a.path, sd.appIcon(a.path).catch(() => ''));
    const url = await icons.get(a.path);
    if (url && ph.isConnected) { const img = new Image(); img.src = url; img.alt = ''; ph.replaceWith(img); }
  };
  if (icons.has(a.path)) load(); else { ph.load = load; lazy.observe(ph); } // fetch icons only when they scroll into view
  return ph;
}
const isPinned = (a) => s.home.pins.some((p) => p.path === a.path);
async function togglePin(a) {
  const pins = isPinned(a) ? s.home.pins.filter((p) => p.path !== a.path) : [...s.home.pins, { name: a.name, path: a.path }];
  s = await sd.set({ home: { pins } });
  renderGrid();
}
function appTile(a) {
  const b = document.createElement('button'); b.className = 'app'; b.title = a.name;
  b.append(iconEl(a), Object.assign(document.createElement('span'), { textContent: a.name }));
  const pin = Object.assign(document.createElement('button'), { className: 'pin', textContent: isPinned(a) ? '✕' : '＋', title: isPinned(a) ? 'Unpin' : 'Pin' });
  pin.onclick = (e) => { e.stopPropagation(); togglePin(a); };
  b.append(pin);
  b.onclick = () => openItem(a.path);
  b.oncontextmenu = (e) => { e.preventDefault(); tileMenu(a, e.clientX, e.clientY); };
  return b;
}

// ---------- pinned / all apps ----------
let showAll = false;
function renderGrid() {
  const list = showAll ? apps : s.home.pins;
  $('appsTitle').textContent = showAll ? `All apps · ${apps.length}` : 'Pinned';
  $('allBtn').classList.toggle('on', showAll);
  $('allBtn').textContent = showAll ? 'Pinned' : 'All apps';
  $('grid').replaceChildren(...list.map(appTile));
  if (!list.length) $('grid').innerHTML = `<p class="empty">${showAll ? 'No apps found in the Start menu.' : 'Nothing pinned yet. Drag any app, shortcut or script here, open <b>All apps</b> and press ＋, or right-click an app in the dock.'}</p>`;
}
$('allBtn').onclick = () => { showAll = !showAll; renderGrid(); };
$('addPin').onclick = async () => {
  const p = await sd.pickFile('app');
  if (!p) return;
  const name = p.split(/[\\/]/).pop().replace(/\.(exe|lnk|url|bat)$/i, '');
  s = await sd.set({ home: { pins: [...s.home.pins.filter((x) => x.path !== p), { name, path: p }] } });
  showAll = false; renderGrid();
};

// ---------- right-click a tile: pin / unpin, change icon, show in folder ----------
function tileMenu(a, x, y) {
  document.querySelector('.ctx')?.remove();
  const m = document.createElement('div'); m.className = 'ctx';
  const item = (label, fn) => { const b = Object.assign(document.createElement('button'), { textContent: label }); b.onclick = () => { m.remove(); fn(); }; m.append(b); };
  item(isPinned(a) ? 'Unpin' : 'Pin', () => togglePin(a));
  if (isPinned(a)) item('Change icon…', async () => { s = await sd.pinIcon(a.path); icons.delete(a.path); renderGrid(); });
  if (!a.path.startsWith('shell:')) item('Show in folder', () => sd.revealPin(a.path));
  document.body.append(m);
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
  setTimeout(() => addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }));
}

// ---------- drop an app, shortcut or script anywhere on Home to pin it ----------
addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
addEventListener('drop', async (e) => {
  e.preventDefault(); document.body.classList.remove('dropping');
  const files = [...(e.dataTransfer?.files || [])];
  let added = 0, err = '';
  for (const f of files) { try { s = await sd.pinFile(f); added++; } catch (x) { err = String(x?.message || x).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); } }
  if (added) { showAll = false; renderGrid(); document.querySelector('[data-t=apps]').click(); }
  $('hint').textContent = added ? `Pinned ${added} app${added > 1 ? 's' : ''}` : err || $('hint').textContent;
});

// ---------- search ----------
let sel = 0, rows = [];
function score(name, q) { const n = name.toLowerCase(); if (n.startsWith(q)) return 3; if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 2; return n.includes(q) ? 1 : 0; }
// files Windows Search found for the current query (apps/shortcuts/scripts outside the Start menu)
let fileHits = [], fileQ = '', fileT = 0;
function searchFilesSoon(q) {
  clearTimeout(fileT);
  if (q.length < 2) { fileHits = []; fileQ = ''; return; }
  fileT = setTimeout(async () => {
    const r = await sd.searchFiles(q).catch(() => []);
    if ($('q').value.trim().toLowerCase() !== q) return;
    fileQ = q; fileHits = r; renderResults();
  }, 300);
}
function pinButton(a) {
  const b = document.createElement('button'); b.className = 'rpin';
  const pinned = isPinned(a);
  b.textContent = pinned ? 'Pinned' : 'Pin'; b.classList.toggle('on', pinned); b.title = pinned ? 'Unpin from Home and the dock' : 'Pin to Home and the dock';
  b.onclick = async (e) => {
    e.stopPropagation();
    s = pinned ? await sd.unpin(a.path) : (a.file ? await sd.pinPath(a.path) : await sd.set({ home: { pins: [...s.home.pins, { name: a.name, path: a.path }] } }));
    renderResults();
  };
  return b;
}
const PIN_EXT = /\.(exe|lnk|url|bat|cmd|appref-ms|py|pyw|ps1|vbs|jar)$/i;
function resultMenu(r, x, y) {
  document.querySelector('.ctx')?.remove();
  const m = document.createElement('div'); m.className = 'ctx';
  const item = (label, fn) => { const b = Object.assign(document.createElement('button'), { textContent: label }); b.onclick = () => { m.remove(); fn(); }; m.append(b); };
  item('Open', () => r.run());
  if (!String(r.app.path).startsWith('shell:')) item('Show in folder', () => sd.revealPin(r.app.path));
  if (!r.app.file || r.pinnable) item(isPinned(r.app) ? 'Unpin' : 'Pin', () => r.app.file && !isPinned(r.app) ? sd.pinPath(r.app.path).then((n) => { s = n; renderResults(); }) : togglePin(r.app).then(renderResults));
  document.body.append(m);
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
  setTimeout(() => addEventListener('pointerdown', (e) => { if (!m.contains(e.target)) m.remove(); }, { once: true }));
}
function renderResults() {
  const q = $('q').value.trim().toLowerCase();
  $('results').hidden = !q;
  document.querySelector('.cols').hidden = !!q;
  if (!q) return;
  const pool = [...apps, ...s.home.pins.filter((p) => !apps.some((a) => a.path === p.path))]; // your pinned apps too, even ones the Start menu doesn't know
  const hits = pool.map((a) => [a, score(a.name, q)]).filter(([, sc]) => sc).sort((x, y) => y[1] - x[1] || x[0].name.localeCompare(y[0].name)).slice(0, 8).map(([a]) => a);
  const known = new Set(hits.map((a) => a.path));
  const files = fileQ === q ? fileHits.filter((f) => !known.has(f.path) && !hits.some((a) => a.name.toLowerCase() === f.name.toLowerCase())).slice(0, 10) : [];
  if (fileQ !== q) searchFilesSoon(q);
  const raw = $('q').value.trim();
  const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(raw) && !raw.includes(' ');
  rows = [...hits.map((a) => ({ label: a.name, hint: 'App', app: a, run: () => openItem(a.path) })),
    ...files.map((f) => ({ label: f.name, hint: (f.folder ? 'Folder · ' : '') + f.path.replace(/[\\/][^\\/]+$/, ''), app: { ...f, file: true }, pinnable: PIN_EXT.test(f.path), run: () => openItem(f.path) })),
    isUrl ? { label: raw, hint: 'Open site', run: () => sd.open(/^https?:/i.test(raw) ? raw : `https://${raw}`) } : null,
    { label: `Search the web for “${raw}”`, hint: (s.home.engine || 'google').replace(/^./, (c) => c.toUpperCase()), run: () => sd.open((ENGINES[s.home.engine] || ENGINES.google) + encodeURIComponent(raw)) }].filter(Boolean);
  sel = Math.min(sel, rows.length - 1);
  $('results').replaceChildren(...rows.map((r, i) => {
    const d = document.createElement('div'); d.className = 'res' + (i === sel ? ' on' : '');
    d.append(r.app ? iconEl(r.app) : Object.assign(document.createElement('div'), { className: 'ph', textContent: r.hint === 'Open site' ? '↗' : '⌕' }));
    d.append(Object.assign(document.createElement('span'), { textContent: r.label }), Object.assign(document.createElement('small'), { textContent: r.hint }));
    if (r.app && (!r.app.file || r.pinnable)) d.append(pinButton(r.app)); // documents and folders open; apps can also be pinned
    d.onclick = () => r.run();
    if (r.app) d.oncontextmenu = (e) => { e.preventDefault(); resultMenu(r, e.clientX, e.clientY); };
    return d;
  }));
}
$('q').oninput = () => { sel = 0; renderResults(); };
$('q').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter' && e.ctrlKey && rows[sel]?.app) { $('results').children[sel]?.querySelector('.rpin')?.click(); e.preventDefault(); }
  else if (e.key === 'Enter' && rows[sel]) rows[sel].run();
};

// ---------- to-dos & notes ----------
function renderTodos() {
  const list = s.home.todos || [];
  $('todoCount').textContent = list.length ? `${list.filter((t) => t.done).length}/${list.length}` : '';
  $('todos').replaceChildren(...list.map((t, i) => {
    const li = document.createElement('li'); li.className = t.done ? 'done' : '';
    li.innerHTML = '<button class="ck" title="Done"></button><span></span><button class="rm" title="Remove">✕</button>';
    li.querySelector('span').textContent = t.text;
    li.querySelector('.ck').onclick = () => saveTodos(list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
    li.querySelector('.rm').onclick = () => saveTodos(list.filter((_, j) => j !== i));
    return li;
  }));
}
const saveTodos = async (todos) => { s = await sd.set({ home: { todos } }); renderTodos(); };
$('todoForm').onsubmit = (e) => { e.preventDefault(); const t = $('todoIn').value.trim(); if (!t) return; $('todoIn').value = ''; saveTodos([...(s.home.todos || []), { text: t, done: false }]); };
$('notes').value = s.home.notes || '';
let notesT; $('notes').oninput = () => { clearTimeout(notesT); notesT = setTimeout(() => sd.set({ home: { notes: $('notes').value } }), 400); };

// ---------- now playing ----------
function renderMedia(m) {
  $('npCard').hidden = !m?.on;
  if (!m?.on) return;
  $('npTitle').textContent = m.title || 'Unknown title';
  $('npArtist').textContent = m.artist || m.app.replace(/\.exe$/i, '').split(/[!\\]/).pop() || '';
  $('npCard').classList.toggle('playing', !!m.playing);
  const art = $('npCard').querySelector('.art'), hasArt = /^data:image\//.test(m.art || '');
  art.style.backgroundImage = hasArt ? `url("${m.art}")` : ''; art.classList.toggle('none', !hasArt);
}
$('npCard').querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => sd.mediaControl(b.dataset.m); });
sd.onMedia(renderMedia);
sd.onApps((list) => { apps = list; if (showAll) renderGrid(); if ($('q').value) renderResults(); });
sd.media().then(renderMedia).catch(() => {});

// ---------- tabs ----------
let tab = 'apps';
document.querySelectorAll('.tabs [data-t]').forEach((b) => b.onclick = () => {
  tab = b.dataset.t;
  document.querySelectorAll('.tabs [data-t]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== tab; });
  if (tab === 'books' && !$('bookRes').children.length) searchBooks('');
  if (tab === 'files') loadFiles();
  if (tab === 'clip') loadClips();
});

// ---------- clipboard history ----------
let clipList = [];
const PIN = '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 3v1H6v-1l4-3zM12 14v6"/></svg>', DEL = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const clipAgo = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
async function loadClips() { clipList = await sd.clips('list').catch(() => []); renderClips(); }
function renderClips() {
  if (tab !== 'clip') return;
  const q = $('clipQ').value.trim().toLowerCase();
  const list = clipList.filter((c) => !q || (c.type !== 'image' && c.text.toLowerCase().includes(q))).sort((a, b) => (b.pinned - a.pinned) || (b.at - a.at));
  if (!list.length) { $('clipList').innerHTML = `<li class="empty muted">${clipList.length ? 'Nothing matches.' : 'Copy something (Ctrl+C) and it shows up here.'}</li>`; return; }
  $('clipList').replaceChildren(...list.map((c) => {
    const li = document.createElement('li'); li.className = `clip ${c.type}${c.pinned ? ' pinned' : ''}`; li.tabIndex = 0;
    li.innerHTML = `<div class="body"></div><div class="meta"><small></small><button class="ic pin" title="${c.pinned ? 'Unpin' : 'Pin (kept when you clear)'}">${PIN}</button><button class="ic del" title="Remove">${DEL}</button></div>`;
    const body = li.querySelector('.body');
    if (c.type === 'image') { const img = new Image(); img.alt = ''; img.src = `sd://media/clip?f=${encodeURIComponent(c.img)}`; body.append(img); li.querySelector('small').textContent = `${c.w}×${c.h} · ${clipAgo(c.at)}`; }
    else { body.textContent = c.text; li.querySelector('small').textContent = `${c.type === 'link' ? 'Link' : `${c.text.length} chars`} · ${clipAgo(c.at)}`; }
    const paste = () => sd.clips('use', c.id);
    li.onclick = (e) => { if (!e.target.closest('button')) paste(); };
    li.onkeydown = (e) => { if (e.key === 'Enter') paste(); if (e.key === 'Delete') sd.clips('remove', c.id); };
    li.querySelector('.pin').onclick = () => sd.clips('pin', c.id, !c.pinned);
    li.querySelector('.del').onclick = () => sd.clips('remove', c.id);
    return li;
  }));
}
sd.onClips?.((l) => { clipList = l; renderClips(); });
$('clipQ').oninput = renderClips;
$('clipClearH').onclick = () => sd.clips('clear');

// ---------- timetable ----------
let day = weekday(new Date());
function renderTimetable() {
  const tt = s.home.timetable || [];
  $('dayChips').replaceChildren(...DAYS.map((name, i) => {
    const b = Object.assign(document.createElement('button'), { className: 'chip' + (i === day ? ' on' : '') + (i === weekday(new Date()) ? ' today' : ''), textContent: name, type: 'button' });
    const n = tt.filter((c) => c.d === i).length; if (n) b.dataset.n = n;
    b.onclick = () => { day = i; renderTimetable(); };
    return b;
  }));
  const nc = nextClass(tt);
  $('nowNext').textContent = nc ? `${nc.now ? 'Now' : 'Next'}: ${nc.cls.t} ${nc.cls.s}${nc.cls.p ? ' · ' + nc.cls.p : ''}` : '';
  const list = tt.map((c, i) => ({ ...c, i })).filter((c) => c.d === day).sort(byTime);
  $('classes').replaceChildren(...list.map((c) => {
    const li = document.createElement('li');
    if (nc && nc.cls === tt[c.i]) li.className = nc.now ? 'now' : 'next';
    li.innerHTML = '<span class="when"></span><b></b><span class="muted"></span><button class="rm" title="Remove">✕</button>';
    li.querySelector('.when').textContent = `${c.s}–${c.e}`; li.querySelector('b').textContent = c.t; li.querySelector('.muted').textContent = c.p || '';
    li.querySelector('.rm').onclick = () => sd.set({ home: { timetable: tt.filter((_, j) => j !== c.i) } }).then((n) => { s = n; renderTimetable(); });
    return li;
  }));
  if (!list.length) $('classes').innerHTML = `<li class="empty">Nothing on ${DAYS[day]} yet. Add your classes below; the next one shows on your desktop.</li>`;
}
$('classForm').onsubmit = async (e) => {
  e.preventDefault();
  const c = { d: day, s: $('cStart').value, e: $('cEnd').value, t: $('cTitle').value.trim(), p: $('cPlace').value.trim() };
  if (!c.t || c.e <= c.s) { $('cEnd').focus(); return; }
  s = await sd.set({ home: { timetable: [...(s.home.timetable || []), c] } });
  $('cTitle').value = ''; $('cPlace').value = ''; $('cStart').value = c.e;
  const [h, m] = c.e.split(':').map(Number), end = new Date(0, 0, 0, h + 1, m); $('cEnd').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  renderTimetable(); $('cTitle').focus();
};

// ---------- books (Project Gutenberg, like the Syndicates Client) ----------
const readUrl = (b) => `https://www.gutenberg.org/ebooks/${b.id}.html.images`;
function bookEl(b, saved) {
  const el = document.createElement('div'); el.className = 'book';
  el.innerHTML = '<div class="cover"></div><b></b><span class="muted"></span><button class="save"></button>';
  if (/^https:\/\/www\.gutenberg\.org\//.test(b.cover)) el.querySelector('.cover').style.backgroundImage = `url("${b.cover}")`;
  else el.querySelector('.cover').textContent = b.title.split(/[;:]/)[0]; // a plain cloth cover with the title
  el.querySelector('b').textContent = b.title; el.querySelector('.muted').textContent = b.author;
  const btn = el.querySelector('.save'); btn.textContent = saved ? '✕' : '＋'; btn.title = saved ? 'Remove from reading list' : 'Add to reading list';
  btn.onclick = async (e) => {
    e.stopPropagation();
    const list = s.home.books || [];
    s = await sd.set({ home: { books: saved ? list.filter((x) => x.id !== b.id) : [{ id: b.id, title: b.title, author: b.author, cover: b.cover }, ...list.filter((x) => x.id !== b.id)].slice(0, 30) } });
    renderReading(); searchBooks(lastQ, true);
  };
  el.onclick = () => sd.open(readUrl(b));
  return el;
}
function renderReading() {
  const list = s.home.books || [];
  $('readingH').hidden = $('reading').hidden = !list.length;
  $('reading').replaceChildren(...list.map((b) => bookEl(b, true)));
}
let lastQ = '', lastRes = [];
async function searchBooks(q, redraw = false) {
  if (!redraw) {
    lastQ = q; $('bookResH').textContent = q ? `Results for “${q}”` : 'Popular'; $('bookRes').innerHTML = '<p class="empty">Loading…</p>';
    try { lastRes = await sd.books(q); } catch (e) { $('bookRes').innerHTML = `<p class="empty">${esc(why(e) || 'The library is unreachable right now.')}</p>`; return; }
  }
  const saved = new Set((s.home.books || []).map((b) => b.id));
  $('bookRes').replaceChildren(...lastRes.filter((b) => !saved.has(b.id)).map((b) => bookEl(b, false)));
  if (!lastRes.length) $('bookRes').innerHTML = '<p class="empty">No books found.</p>';
}
$('bookForm').onsubmit = (e) => { e.preventDefault(); searchBooks($('bookQ').value.trim()); };

// ---------- files (recent, filter, search) ----------
const KINDS = { pdf: /\.pdf$/i, doc: /\.(docx?|pptx?|xlsx?|txt|md|rtf|odt|ods|odp|csv|wps|et|dps)$/i, img: /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i };
let fileKind = 'all', recent = [], fileQT = 0;
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
function renderFiles(list) {
  const shown = list.filter((f) => fileKind === 'all' || (!f.folder && KINDS[fileKind].test(f.name))).slice(0, 40);
  $('fileList').replaceChildren(...shown.map((f) => {
    const li = document.createElement('li'); li.className = 'file';
    li.append(iconEl({ name: f.name, path: f.path }));
    li.insertAdjacentHTML('beforeend', '<div class="ft"><b></b><span class="muted"></span></div><span class="muted when"></span>');
    li.querySelector('b').textContent = f.name;
    li.querySelector('.ft .muted').textContent = f.path.replace(/[\\/][^\\/]+$/, '');
    li.querySelector('.when').textContent = f.time ? ago(f.time) : (f.folder ? 'Folder' : '');
    li.onclick = () => openItem(f.path);
    li.oncontextmenu = (e) => { e.preventDefault(); resultMenu({ app: { ...f, file: true }, pinnable: PIN_EXT.test(f.path), run: () => openItem(f.path) }, e.clientX, e.clientY); };
    return li;
  }));
  if (!shown.length) $('fileList').innerHTML = `<li class="empty">${$('fileQ').value ? 'Nothing found.' : 'No recent files of this kind yet. Open a file and it shows up here.'}</li>`;
}
async function loadFiles() {
  const q = $('fileQ').value.trim();
  if (q.length >= 2) { renderFiles(await sd.searchFiles(q).catch(() => [])); return; }
  recent = await sd.recentFiles().catch(() => []); renderFiles(recent);
}
$('fileKinds').querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
  fileKind = b.dataset.kind; $('fileKinds').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); loadFiles();
});
$('fileQ').oninput = () => { clearTimeout(fileQT); fileQT = setTimeout(loadFiles, 300); };

// ---------- places (instead of desktop icons) ----------
document.querySelectorAll('[data-place]').forEach((b) => b.onclick = () => sd.openPlace(b.dataset.place));
function renderIconsBtn() {
  const hidden = s.general.hideDesktopIcons;
  $('iconsBtn').textContent = hidden ? 'Show desktop icons' : 'Hide desktop icons';
  $('iconsBtn').classList.toggle('on', !hidden);
}
$('iconsBtn').onclick = async () => { s = await sd.set({ general: { hideDesktopIcons: !s.general.hideDesktopIcons } }); renderIconsBtn(); };

// ---------- open / close ----------
const close = () => sd.toggleHome(false);
$('backdrop').onclick = close;
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('q').value) { $('q').value = ''; renderResults(); } else close(); } });
$('customize').onclick = () => sd.openSettings();
// power, as at the bottom of Windows' Start menu: one button, a menu above it; restart and shut down ask twice
$('pwrBtn').onclick = (e) => { e.stopPropagation(); $('pwrMenu').hidden = !$('pwrMenu').hidden; };
addEventListener('click', (e) => { if (!$('pwrMenu').hidden && !$('pwrMenu').contains(e.target)) $('pwrMenu').hidden = true; });
for (const b of document.querySelectorAll('#pwrMenu [data-pw]')) {
  let armed = 0;
  b.onclick = (e) => {
    e.stopPropagation();
    const k = b.dataset.pw, label = b.querySelector('span');
    if ((k === 'restart' || k === 'shutdown') && !armed) {
      b.classList.add('armed'); label.dataset.was = label.textContent; label.textContent = `${label.textContent}? Click again`;
      armed = setTimeout(() => { armed = 0; b.classList.remove('armed'); label.textContent = label.dataset.was; }, 3000);
      return;
    }
    $('pwrMenu').hidden = true;
    sd.flyoutAction(k);
  };
}
function onHidden() { document.body.classList.add('off'); $('pwrMenu').hidden = true; $('q').value = ''; renderResults(); document.querySelector('.ctx')?.remove(); }
function onShown(mode) {
  if (mode === 'clip') document.querySelector('.tabs [data-t=clip]')?.click(); // Alt+Shift+V: straight to the clipboard history
  if (document.body.classList.contains('off')) {
    document.body.classList.remove('off');
    for (const e of [$('panel'), $('backdrop')]) { e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; }
  }
  $('q').value = ''; renderResults(); $('q').focus();
  $('q').placeholder = mode === 'pin' ? 'Type an app’s name, then press Pin (or Ctrl+Enter)' : 'Search apps, files, folders or the web'; tick(); renderTimetable(); renderIconsBtn();
  sd.apps().then((list) => { if (list.length !== apps.length) { apps = list; if (showAll) renderGrid(); } }).catch(() => {}); // picks up newly installed apps
}
sd.onHomeShown(onShown);
sd.onHomeHidden?.(onHidden);
$('hint').textContent = `${s.home.hotkey} opens this panel · drag apps here to pin them · right-click a tile for more`;

apps = await sd.apps().catch(() => []);
renderGrid(); renderTodos(); renderReading(); onShown();
requestAnimationFrame(() => sd.homeReady()); // drawn: the window may appear now
useTheme('home'); // Customize > Themes
