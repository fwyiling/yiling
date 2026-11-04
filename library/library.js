// Manga library: collect MangaDex series and download them in one go (or only new chapters).
import { mangaDexEntry, mangaDexListEntries, mangaDexChapters, parseMangaDexUrl, mangaDexInfo, mangaDexSearch, LANG_NAMES } from '../lib/mangadex.js';

const $ = (id) => document.getElementById(id);
const { accent, mdLangs = ['en', 'zh', 'zh-hk'] } = await chrome.storage.sync.get(['accent', 'mdLangs']);
if (accent) document.documentElement.style.setProperty('--a', accent);
let { mdLibrary = [], libraryPrefs = { fmt: 'reader', saver: false } } = await chrome.storage.local.get(['mdLibrary', 'libraryPrefs']);
const save = () => chrome.storage.local.set({ mdLibrary });
$('fmt').value = libraryPrefs.fmt; $('saver').checked = libraryPrefs.saver;
$('fmt').onchange = $('saver').onchange = () => { libraryPrefs = { fmt: $('fmt').value, saver: $('saver').checked }; chrome.storage.local.set({ libraryPrefs }); };

// covers load through the extension (Referer rule for uploads.mangadex.org) – plain <img> links get refused
const coverCache = new Map();
async function coverBlob(url) {
  if (!url) throw new Error('no cover');
  if (!coverCache.has(url)) {
    coverCache.set(url, (async () => {
      for (const u of [url, url.replace(/\.256\.jpg$/, '.512.jpg'), url.replace(/\.256\.jpg$/, '')]) {
        const r = await fetch(u, { credentials: 'omit' }).catch(() => null);
        if (r && r.ok && /^image\//.test(r.headers.get('content-type') || 'image/')) return URL.createObjectURL(await r.blob());
        if (r && !r.ok) var lastStatus = r.status;
      }
      throw new Error(lastStatus ? `cover blocked (HTTP ${lastStatus})` : 'cover unavailable');
    })());
  }
  return coverCache.get(url);
}
function setCover(el, url) {
  coverBlob(url).then((b) => { el.style.backgroundImage = `url("${b}")`; }, (e) => { el.dataset.err = e.message; el.title = e.message; });
}

function status(msg) { $('status').hidden = !msg; $('status').textContent = msg || ''; }
const ago = (t) => { if (!t) return 'never'; const d = Math.round((Date.now() - t) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

function render() {
  $('empty').hidden = mdLibrary.length > 0;
  $('grid').replaceChildren(...mdLibrary.map((e) => {
    const c = document.createElement('div');
    c.className = 'card' + (running === e.id ? ' busy' : '');
    c.innerHTML = `<div class="cover"><span class="badge"></span></div><div class="body"><div class="title"></div><div class="meta"></div>
      <div class="row"><select title="Language"></select></div>
      <div class="row"><button data-a="new">New</button><button data-a="all">All</button><button data-a="open" title="Open on MangaDex">↗</button><button data-a="rm" class="x" title="Remove">✕</button></div></div>`;
    setCover(c.querySelector('.cover'), e.cover);
    c.querySelector('.badge').textContent = e.lastNum ? `Ch. ${e.lastNum}` : 'not downloaded';
    c.querySelector('.title').textContent = e.series;
    c.querySelector('.meta').textContent = `${LANG_NAMES[e.lang] || e.lang}${e.total ? ` · ${e.total} chapters` : ''} · last run ${ago(e.lastRun)}`;
    const sel = c.querySelector('select');
    for (const l of (e.langs?.length ? e.langs : [e.lang])) sel.add(new Option(LANG_NAMES[l] || l, l));
    sel.value = e.lang;
    sel.onchange = () => { e.lang = sel.value; save(); render(); };
    c.querySelector('[data-a="new"]').onclick = () => runQueue([e], 'new');
    c.querySelector('[data-a="all"]').onclick = () => runQueue([e], 'all');
    c.querySelector('[data-a="open"]').onclick = () => chrome.tabs.create({ url: e.url });
    c.querySelector('[data-a="rm"]').onclick = () => { if (confirm(`Remove ${e.series} from the library? (Downloaded files stay.)`)) { mdLibrary = mdLibrary.filter((x) => x.id !== e.id); save(); render(); } };
    for (const b of c.querySelectorAll('button')) b.disabled = !!running && b.dataset.a !== 'open';
    return c;
  }));
}

async function addEntries(list) {
  let added = 0;
  for (const e of list) if (!mdLibrary.some((x) => x.id === e.id)) { mdLibrary.push({ ...e, lastNum: 0, addedAt: Date.now() }); added++; }
  await save(); render();
  return added;
}
$('addBtn').onclick = async () => {
  const v = $('addUrl').value.trim();
  if (!v) return;
  $('addBtn').disabled = true; status('Looking it up on MangaDex…');
  try {
    let list;
    if (/\/list\//i.test(v)) list = await mangaDexListEntries(v, mdLangs);
    else {
      const p = parseMangaDexUrl(v);
      if (!p) throw new Error('That isn\'t a MangaDex title, chapter or list link.');
      const id = p.type === 'title' ? p.id : (await mangaDexInfo(v, mdLangs)).mangaId;
      list = [await mangaDexEntry(id, mdLangs)];
    }
    const n = await addEntries(list);
    status(n ? `Added ${n} series.` : 'Already in your library.');
    $('addUrl').value = '';
  } catch (e) { status(`Couldn't add it: ${e.message}`); }
  $('addBtn').disabled = false;
};
$('addUrl').onkeydown = (e) => { if (e.key === 'Enter') $('addBtn').click(); };

// ---------- batch downloads: one series at a time through the downloader ----------
let running = null, stop = false;
function waitForRun(id) {
  return new Promise((resolve) => {
    const l = (c, area) => { if (area === 'local' && c.libraryRunDone?.newValue?.id === id) { chrome.storage.onChanged.removeListener(l); resolve(c.libraryRunDone.newValue); } };
    chrome.storage.onChanged.addListener(l);
  });
}
async function runQueue(entries, mode) {
  if (running) return;
  stop = false;
  let done = 0, newCh = 0;
  for (const e of entries) {
    if (stop) break;
    running = e.id; render();
    status(`(${done + 1}/${entries.length}) ${e.series}: getting the chapter list…`);
    try {
      const chapters = await mangaDexChapters(e.id, e.lang);
      e.total = chapters.length; save();
      const fresh = mode === 'new' ? chapters.filter((c) => (c.num || 0) > (e.lastNum || 0)).length : chapters.length;
      if (!fresh) { status(`(${done + 1}/${entries.length}) ${e.series}: nothing new.`); done++; continue; }
      status(`(${done + 1}/${entries.length}) ${e.series}: downloading ${fresh} chapter${fresh === 1 ? '' : 's'}… (a download tab opens and closes by itself)`);
      const jobId = crypto.randomUUID();
      await chrome.storage.session.set({ [`job_${jobId}`]: {
        source: 'mangadex', kind: 'images', mangaId: e.id, series: e.series, langs: [e.lang], lang: e.lang, currentChapterId: null,
        url: e.url, origin: 'https://mangadex.org', chapters, currentIndex: -1, preset: mode, sinceNum: e.lastNum || 0,
        format: libraryPrefs.fmt, dataSaver: libraryPrefs.saver, auto: true, libraryId: e.id } });
      const wait = waitForRun(e.id);
      await chrome.tabs.create({ url: chrome.runtime.getURL(`downloader/downloader.html?job=${jobId}`), active: false });
      const r = await wait;
      newCh += r.ok;
      ({ mdLibrary } = await chrome.storage.local.get('mdLibrary'));
    } catch (err) { status(`${e.series}: ${err.message}`); await new Promise((r) => setTimeout(r, 2500)); }
    done++;
  }
  running = null; render();
  status(stop ? 'Stopped.' : `Finished: ${newCh} chapter${newCh === 1 ? '' : 's'} downloaded across ${done} series. Files are in Downloads/Syndicates Client.`);
}
$('dlNew').onclick = () => runQueue(mdLibrary, 'new');
$('dlAll').onclick = () => { if (confirm(`Download every chapter of all ${mdLibrary.length} series? This can take a long time.`)) runQueue(mdLibrary, 'all'); };
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.mdLibrary && !running) { mdLibrary = c.mdLibrary.newValue || []; render(); } });

// ---------- search with covers ----------
let searchT, lastQ = '';
async function search() {
  const q = $('q').value.trim();
  lastQ = q;
  if (!q) { $('results').hidden = true; return; }
  $('results').hidden = false;
  $('results').innerHTML = '<p class="empty">Searching MangaDex…</p>';
  try {
    const items = await mangaDexSearch(q, mdLangs);
    if (q !== lastQ) return;
    if (!items.length) { $('results').innerHTML = '<p class="empty">No results.</p>'; return; }
    $('results').replaceChildren(...items.map((it) => {
      const c = document.createElement('div'); c.className = 'res';
      c.innerHTML = `<div class="cover"><span class="badge"></span></div><div class="body"><div class="title"></div><div class="meta"></div><div class="desc"></div>
        <div class="row"><button data-a="add"></button><button data-a="dl" class="pri">Download</button></div></div>`;
      setCover(c.querySelector('.cover'), it.cover);
      const badge = c.querySelector('.badge'); badge.textContent = it.status || ''; badge.hidden = !it.status;
      c.querySelector('.title').textContent = it.series;
      c.querySelector('.meta').textContent = [it.year, LANG_NAMES[it.lang] || it.lang].filter(Boolean).join(' · ');
      c.querySelector('.desc').textContent = it.desc;
      const add = c.querySelector('[data-a="add"]');
      const paint = () => { const inList = mdLibrary.some((x) => x.id === it.id); add.textContent = inList ? '✓ In list' : '+ List'; add.classList.toggle('on', inList); };
      paint();
      add.onclick = async () => { if (!mdLibrary.some((x) => x.id === it.id)) await addEntries([it]); paint(); };
      c.querySelector('[data-a="dl"]').onclick = async () => { if (!mdLibrary.some((x) => x.id === it.id)) await addEntries([it]); paint(); runQueue([mdLibrary.find((x) => x.id === it.id)], 'all'); };
      return c;
    }));
  } catch (e) { $('results').innerHTML = `<p class="empty">Search failed: ${String(e.message).replace(/</g, '&lt;')}</p>`; }
}
$('q').oninput = () => { clearTimeout(searchT); searchT = setTimeout(search, 400); };
$('q').onkeydown = (e) => { if (e.key === 'Enter') { clearTimeout(searchT); search(); } };
const preQ = new URLSearchParams(location.search).get('q');
if (preQ) { $('q').value = preQ; search(); }

render();
// fill in covers for series added from the popup
(async () => {
  let changed = false;
  for (const e of mdLibrary.filter((x) => !x.cover)) {
    try { const info = await mangaDexEntry(e.id, mdLangs); e.cover = info.cover; e.langs = info.langs; changed = true; } catch {}
  }
  if (changed) { await save(); render(); }
})();
