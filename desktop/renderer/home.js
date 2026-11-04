// Home panel (Alt+Space): search apps and the web, pinned apps, to-dos, notes, system stats.
import { greeting, fmtTime, fmtDate, applyAccent, esc } from './common.js';

const sd = window.sd;
const $ = (id) => document.getElementById(id);
let s = await sd.get();
let apps = [];
const icons = new Map();
const ENGINES = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', brave: 'https://search.brave.com/search?q=' };

applyAccent(s.accent);
sd.onSettings((n) => { s = n; applyAccent(s.accent); renderTodos(); if (document.activeElement !== $('notes')) $('notes').value = s.home.notes || ''; if (!showAll) renderGrid(); });

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

// ---------- system ----------
async function sys() {
  const st = await sd.stats().catch(() => null);
  if (st) for (const k of ['cpu', 'mem']) { $(k).textContent = `${st[k]}%`; $(`${k}Bar`).style.width = `${st[k]}%`; }
}
async function weather() {
  const city = s.widgets.weather?.city;
  if (!city) { $('weather').textContent = ''; return; }
  try { const w = await sd.weather(city); $('weather').textContent = `${w.place}: ${w.temp}${w.unit}, ${w.text}`; } catch { $('weather').textContent = ''; }
}
setInterval(sys, 2500);

// ---------- now playing ----------
function renderMedia(m) {
  $('npCard').hidden = !m?.on;
  if (!m?.on) return;
  $('npTitle').textContent = m.title || 'Unknown title';
  $('npArtist').textContent = m.artist || m.app.replace(/\.exe$/i, '').split(/[!\\]/).pop() || '';
  $('npCard').classList.toggle('playing', !!m.playing);
  $('npCard').querySelector('.art').style.backgroundImage = /^data:image\//.test(m.art || '') ? `url("${m.art}")` : '';
}
$('npCard').querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => sd.mediaControl(b.dataset.m); });
sd.onMedia(renderMedia);
sd.media().then(renderMedia).catch(() => {});

// ---------- open / close ----------
const close = () => sd.toggleHome(false);
$('backdrop').onclick = close;
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('q').value) { $('q').value = ''; renderResults(); } else close(); } });
$('customize').onclick = () => sd.openSettings();
function onShown() { $('q').value = ''; renderResults(); $('q').focus(); sys(); weather(); tick(); }
sd.onHomeShown(onShown);
$('hint').textContent = `${s.home.hotkey} opens this panel from anywhere`;

apps = await sd.apps().catch(() => []);
renderGrid(); renderTodos(); onShown();
