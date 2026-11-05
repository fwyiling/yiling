// Home panel (Alt+Space): search apps and the web, pinned apps, to-dos, notes, system stats.
import { greeting, fmtTime, fmtDate, applyAccent, esc, DAYS, weekday, nextClass, byTime } from './common.js';
const why = (e) => String(e?.message || e || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^TypeError: fetch failed$|net::ERR_[A-Z_]+/, "can't reach the internet right now");

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
const initial = (n) => esc((n.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase());
function iconEl(a) {
  const ph = document.createElement('div'); ph.className = 'ph'; ph.innerHTML = initial(a.name);
  const load = async () => {
    if (!icons.has(a.path)) icons.set(a.path, sd.appIcon(a.path).catch(() => ''));
    const url = await icons.get(a.path);
    if (url) { const img = new Image(); img.src = url; img.alt = ''; ph.replaceWith(img); }
  };
  load();
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
  b.onclick = () => sd.launch(a.path);
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
  if (!list.length) $('grid').innerHTML = `<p class="empty">${showAll ? 'No apps found in the Start menu.' : 'Nothing pinned yet – open <b>All apps</b> and press ＋ on the ones you use most.'}</p>`;
}
$('allBtn').onclick = () => { showAll = !showAll; renderGrid(); };
$('addPin').onclick = async () => {
  const p = await sd.pickFile('app');
  if (!p) return;
  const name = p.split(/[\\/]/).pop().replace(/\.(exe|lnk|url|bat)$/i, '');
  s = await sd.set({ home: { pins: [...s.home.pins.filter((x) => x.path !== p), { name, path: p }] } });
  showAll = false; renderGrid();
};

// ---------- search ----------
let sel = 0, rows = [];
function score(name, q) { const n = name.toLowerCase(); if (n.startsWith(q)) return 3; if (n.split(/[\s\-_.]+/).some((w) => w.startsWith(q))) return 2; return n.includes(q) ? 1 : 0; }
function renderResults() {
  const q = $('q').value.trim().toLowerCase();
  $('results').hidden = !q;
  document.querySelector('.cols').hidden = !!q;
  if (!q) return;
  const hits = apps.map((a) => [a, score(a.name, q)]).filter(([, sc]) => sc).sort((x, y) => y[1] - x[1] || x[0].name.localeCompare(y[0].name)).slice(0, 8).map(([a]) => a);
  const raw = $('q').value.trim();
  const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(raw) && !raw.includes(' ');
  rows = [...hits.map((a) => ({ label: a.name, hint: 'App', app: a, run: () => sd.launch(a.path) })),
    isUrl ? { label: raw, hint: 'Open site', run: () => sd.open(/^https?:/i.test(raw) ? raw : `https://${raw}`) } : null,
    { label: `Search the web for “${raw}”`, hint: (s.home.engine || 'google').replace(/^./, (c) => c.toUpperCase()), run: () => sd.open((ENGINES[s.home.engine] || ENGINES.google) + encodeURIComponent(raw)) }].filter(Boolean);
  sel = Math.min(sel, rows.length - 1);
  $('results').replaceChildren(...rows.map((r, i) => {
    const d = document.createElement('div'); d.className = 'res' + (i === sel ? ' on' : '');
    d.append(r.app ? iconEl(r.app) : Object.assign(document.createElement('div'), { className: 'ph', textContent: r.hint === 'Open site' ? '↗' : '⌕' }));
    d.append(Object.assign(document.createElement('span'), { textContent: r.label }), Object.assign(document.createElement('small'), { textContent: r.hint }));
    d.onclick = () => r.run();
    return d;
  }));
}
$('q').oninput = () => { sel = 0; renderResults(); };
$('q').onkeydown = (e) => {
  if (e.key === 'ArrowDown') { sel = Math.min(rows.length - 1, sel + 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); renderResults(); e.preventDefault(); }
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
sd.media().then(renderMedia).catch(() => {});

// ---------- tabs ----------
let tab = 'apps';
document.querySelectorAll('.tabs [data-t]').forEach((b) => b.onclick = () => {
  tab = b.dataset.t;
  document.querySelectorAll('.tabs [data-t]').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('[data-p]').forEach((p) => { p.hidden = p.dataset.p !== tab; });
  if (tab === 'books' && !$('bookRes').children.length) searchBooks('');
  if (tab === 'gh') renderGithub();
});

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

// ---------- GitHub ----------
const GH_LINKS = [['Profile', (u) => `https://github.com/${u}`], ['Repositories', (u) => `https://github.com/${u}?tab=repositories`], ['Pull requests', () => 'https://github.com/pulls'],
  ['Issues', () => 'https://github.com/issues'], ['Notifications', () => 'https://github.com/notifications'], ['New repository', () => 'https://github.com/new']];
async function renderGithub() {
  const u = s.home.github || '';
  $('ghUser').value = u;
  $('ghLinks').replaceChildren(...GH_LINKS.filter(([n]) => u || !['Profile', 'Repositories'].includes(n)).map(([name, url]) => {
    const b = Object.assign(document.createElement('button'), { className: 'chip', textContent: name, type: 'button' });
    b.onclick = () => sd.open(url(u)); return b;
  }));
  if (!u) { $('ghRepos').innerHTML = '<li class="empty">Add your username to see your repositories here.</li>'; $('ghNote').textContent = ''; return; }
  $('ghNote').textContent = 'public repositories';
  try {
    const repos = await sd.githubRepos(u);
    $('ghRepos').replaceChildren(...repos.map((x) => {
      const li = document.createElement('li'); li.className = 'repo';
      li.innerHTML = '<b></b><span class="muted desc"></span><span class="muted meta"></span>';
      li.querySelector('b').textContent = x.name; li.querySelector('.desc').textContent = x.desc;
      li.querySelector('.meta').textContent = [x.lang, x.stars ? `★ ${x.stars}` : '', new Date(x.pushed).toLocaleDateString()].filter(Boolean).join(' · ');
      li.onclick = () => sd.open(x.url); return li;
    }));
    if (!repos.length) $('ghRepos').innerHTML = '<li class="empty">No public repositories.</li>';
  } catch (e) { $('ghRepos').innerHTML = `<li class="empty">${esc(why(e))}</li>`; }
}
$('ghForm').onsubmit = async (e) => { e.preventDefault(); s = await sd.set({ home: { github: $('ghUser').value.trim().replace(/^@/, '') } }); renderGithub(); };

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
function onShown() { $('q').value = ''; renderResults(); $('q').focus(); tick(); renderTimetable(); renderIconsBtn(); }
sd.onHomeShown(onShown);
$('hint').textContent = `${s.home.hotkey} opens this panel from anywhere`;

apps = await sd.apps().catch(() => []);
renderGrid(); renderTodos(); renderReading(); onShown();
