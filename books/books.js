// Ani Manga · Books: browse Project Gutenberg and read in the built-in reader.
import { books, book, GENRES, gutenbergPage, getReading, forgetReading, readerUrl } from '../lib/gutendex.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { accent } = await chrome.storage.sync.get('accent');
if (accent) document.documentElement.style.setProperty('--a', accent);
const byline = (b) => b.authors?.join(', ') || 'Unknown author';

function card(b, progress) {
  const c = document.createElement('div'); c.className = 'card book';
  c.innerHTML = `<div class="img">${progress != null ? `<span class="next">${Math.round(progress * 100)}% read</span>` : ''}</div><b></b><span></span>`;
  const img = c.querySelector('.img');
  if (b.cover) img.style.backgroundImage = `url("${b.cover}")`;
  else img.classList.add('nocover'), img.dataset.t = b.title;
  c.querySelector('b').textContent = b.title;
  c.querySelector('span:last-child').textContent = byline(b);
  c.onclick = () => openSheet(b);
  return c;
}
const grid = (items, progress) => { const g = document.createElement('div'); g.className = 'row'; g.append(...items.map((b) => card(b, progress?.(b)))); return g; };
const loading = (msg = 'Loading…') => { $('view').innerHTML = `<p class="empty">${esc(msg)}</p>`; };
const fail = (e) => { $('view').innerHTML = `<p class="empty">${esc(e.message)}</p>`; };

// a grid with a "Load more" button that keeps paging
async function pagedGrid(v, opts) {
  let page = 1;
  const first = await books({ ...opts, page });
  if (!first.results.length) { v.insertAdjacentHTML('beforeend', '<p class="empty">No books found.</p>'); return; }
  const g = grid(first.results); v.append(g);
  if (!first.hasMore) return;
  const more = Object.assign(document.createElement('button'), { className: 'more', textContent: 'Load more' });
  more.onclick = async () => {
    more.disabled = true; more.textContent = 'Loading…';
    try {
      const r = await books({ ...opts, page: ++page });
      g.append(...r.results.map((b) => card(b)));
      if (r.hasMore) { more.disabled = false; more.textContent = 'Load more'; } else more.remove();
    } catch (e) { more.disabled = false; more.textContent = `Retry (${e.message})`; page--; }
  };
  v.append(more);
}

async function continueRow(v) {
  const list = await getReading();
  if (!list.length) return;
  v.insertAdjacentHTML('beforeend', '<h2>Continue reading</h2>');
  const row = document.createElement('div'); row.className = 'row';
  for (const b of list.slice(0, 6)) {
    const c = card(b, b.progress);
    c.onclick = () => chrome.tabs.create({ url: readerUrl(b.id) });
    row.append(c);
  }
  v.append(row);
}

async function viewPopular() {
  loading();
  const v = $('view');
  try {
    v.replaceChildren();
    await continueRow(v);
    v.insertAdjacentHTML('beforeend', '<h2>Most read</h2>');
    await pagedGrid(v, {});
  } catch (e) { fail(e); }
}

let genre = GENRES[0];
async function viewGenres() {
  const v = $('view');
  v.innerHTML = `<div class="days">${GENRES.map(([label], i) => `<button data-g="${i}" class="${GENRES[i] === genre ? 'on' : ''}">${esc(label)}</button>`).join('')}</div><div id="gbox"><p class="empty">Loading…</p></div>`;
  v.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { genre = GENRES[+b.dataset.g]; viewGenres(); });
  const box = $('gbox');
  try { box.replaceChildren(); await pagedGrid(box, { topic: genre[1] }); } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

async function viewReading() {
  const v = $('view'), list = await getReading();
  if (!list.length) { v.innerHTML = '<p class="empty">Books you open show up here, with how far you got.</p>'; return; }
  v.innerHTML = '<h2>Reading</h2>';
  const row = document.createElement('div'); row.className = 'row';
  for (const b of list) {
    const c = card(b, b.progress);
    c.querySelector('.img').insertAdjacentHTML('beforeend', '<button class="cw-x" title="Remove">✕</button>');
    c.querySelector('.cw-x').onclick = async (e) => { e.stopPropagation(); await forgetReading(b.id); c.remove(); };
    row.append(c);
  }
  v.append(row);
}

async function openSheet(b) {
  $('drawer').hidden = false;
  const sh = $('sheet');
  sh.innerHTML = `<button class="close" title="Close">✕</button><div class="banner"></div><div class="sh-body">
    <div class="sh-head"><img alt=""><div><h1></h1><div class="by"></div><div class="chips"></div></div></div>
    <div class="actions"><button class="pri" id="readBtn">📖 Read</button>${b.epub ? '<button id="epubBtn">⬇ Download EPUB</button>' : ''}<button id="pgBtn">Project Gutenberg ↗</button></div>
    <h2>About</h2><div class="desc"></div></div>`;
  sh.querySelector('.close').onclick = closeSheet;
  if (b.cover) { sh.querySelector('.banner').style.backgroundImage = `url("${b.cover}")`; sh.querySelector('.sh-head img').src = b.cover; }
  else sh.querySelector('.sh-head img').remove();
  sh.querySelector('h1').textContent = b.title;
  sh.querySelector('.by').textContent = byline(b);
  sh.querySelector('#readBtn').onclick = () => chrome.tabs.create({ url: readerUrl(b.id) });
  sh.querySelector('#pgBtn').onclick = () => chrome.tabs.create({ url: gutenbergPage(b.id) });
  const epub = sh.querySelector('#epubBtn');
  if (epub) epub.onclick = () => chrome.downloads.download({ url: b.epub, filename: `Ani Manga/Books/${b.title.replace(/[^\w .,'-]+/g, ' ').trim().slice(0, 80) || b.id}.epub`, conflictAction: 'uniquify' });
  const fill = (x) => {
    sh.querySelector('.chips').innerHTML = [x.downloads && `${x.downloads.toLocaleString()} downloads`, ...(x.subjects || [])].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
    sh.querySelector('.desc').textContent = x.summary || 'No summary for this book.';
  };
  fill(b);
  if (!b.summary && b.subjects == null) book(b.id).then(fill, () => {}); // entries from "Reading" carry no details
}
function closeSheet() { $('drawer').hidden = true; }
document.querySelector('.scrim').onclick = closeSheet;
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

let tab = 'popular';
function go(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  ({ popular: viewPopular, genres: viewGenres, reading: viewReading })[t]();
}
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => go(b.dataset.tab));
let qt;
$('q').oninput = () => {
  clearTimeout(qt);
  qt = setTimeout(async () => {
    const q = $('q').value.trim();
    if (!q) return go(tab);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('on'));
    const v = $('view');
    v.replaceChildren(Object.assign(document.createElement('h2'), { textContent: `Results for “${q}”` }));
    try { await pagedGrid(v, { search: q }); } catch (e) { fail(e); }
  }, 450);
};
go('popular');
