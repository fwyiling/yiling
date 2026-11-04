import { makeZip, makeEpubBook } from '../lib/zip.js';
import { scanDocument, autoScroll } from '../lib/extract.js';
import { buildMangaReader, buildNovelReader } from '../lib/reader.js';
import { mangaDexChapters, mangaDexPages, mangaDexImageViaTab, useMangaDexTab, LANG_NAMES } from '../lib/mangadex.js';

const $ = (id) => document.getElementById(id);
const jobId = new URLSearchParams(location.search).get('job');
const safe = (s) => String(s).replace(/[\\/:*?"<>|~\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80) || 'Untitled';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, w) => String(n).padStart(w, '0');

const { [`job_${jobId}`]: job } = await chrome.storage.session.get(`job_${jobId}`);
const { accent = '#fa1e4e' } = await chrome.storage.sync.get('accent');
document.documentElement.style.setProperty('--a', accent);
if (!job) { $('series').textContent = 'This download has expired. Start it again from the page.'; await new Promise(() => {}); } // stop here quietly

const isImages = job.kind === 'images';
const isMD = job.source === 'mangadex';
if (isMD) useMangaDexTab(Number.isInteger(job.sourceTabId) ? await chrome.tabs.get(job.sourceTabId).then((t) => t.id, () => null) : null);
if (!isMD) {
  // make sure the page the user is on is always downloadable on its own
  const here = { url: job.url.replace(/#.*$/, ''), num: 0, label: job.title };
  if (!job.chapters?.length) { job.chapters = [here]; job.currentIndex = 0; }
  else if (job.currentIndex < 0) { job.chapters.unshift(here); job.currentIndex = 0; }
}
let chapters = job.chapters || [];
$('series').textContent = job.series;
$('kicker').textContent = isMD ? 'Download from MangaDex' : isImages ? 'Download manga / comic' : 'Download novel';
$('folder').textContent = safe(job.series);
document.title = `Download · ${job.series}`;

// ================= STEP 1: setup =================
const FORMATS = isImages
  ? [
      { id: 'reader', title: 'Easy reader', tag: 'Recommended', desc: 'Saves every page in a folder plus a “Read” file. Double-click it to read in your browser: chapter menu, keyboard arrows, remembers where you stopped.' },
      { id: 'cbz', title: 'Comic files (.cbz)', desc: 'One file per chapter for comic apps: CDisplayEx, YACReader, Mihon/Tachiyomi, Panels, Chunky.' },
    ]
  : [
      { id: 'html', title: 'Easy reader', tag: 'Recommended', desc: 'One book file. Double-click to read in your browser with a chapter menu, font size, dark/sepia themes.' },
      { id: 'epub', title: 'eBook (.epub)', desc: 'For phones and e-readers: Apple Books, Google Play Books, Kindle (via Send to Kindle), Moon+ Reader.' },
      { id: 'txt', title: 'Plain text (.txt)', desc: 'Just the words, in one file.' },
    ];
FORMATS.forEach((f, i) => {
  const l = document.createElement('label');
  l.innerHTML = `<input type="radio" name="fmt" value="${f.id}" ${i ? '' : 'checked'}><div><b></b><small></small></div>`;
  l.querySelector('b').textContent = f.title;
  if (f.tag) l.querySelector('b').insertAdjacentHTML('beforeend', `<span class="tag">${f.tag}</span>`);
  l.querySelector('small').textContent = f.desc;
  $('formats').append(l);
});

const showCount = () => {
  const n = Math.max(0, +$('to').value - +$('from').value + 1);
  $('count').textContent = `${n} chapter${n === 1 ? '' : 's'}`;
  $('start').disabled = n === 0 || !chapters.length;
};
function preset(id) {
  document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  const [a, b] = id === 'current' ? [job.currentIndex, job.currentIndex] : id === 'rest' ? [job.currentIndex, chapters.length - 1] : [0, chapters.length - 1];
  $('from').value = a; $('to').value = b; showCount();
}
function renderChapters(initial) {
  $('from').replaceChildren(); $('to').replaceChildren(); $('presets').replaceChildren();
  chapters.forEach((c, i) => { $('from').add(new Option(c.label || `Chapter ${c.num}`, i)); $('to').add(new Option(c.label || `Chapter ${c.num}`, i)); });
  const hasCurrent = job.currentIndex >= 0 && chapters[job.currentIndex];
  const presets = [
    hasCurrent && { id: 'current', title: 'This chapter', sub: chapters[job.currentIndex].label || '' },
    hasCurrent && job.currentIndex > 0 && chapters.length > 1 && { id: 'rest', title: 'From here to the end', sub: `${chapters.length - job.currentIndex} chapters` },
    chapters.length > 1 && { id: 'all', title: 'Whole series', sub: `${chapters.length} chapters` },
  ].filter(Boolean);
  for (const p of presets) {
    const b = document.createElement('button');
    b.dataset.id = p.id;
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = p.title; b.querySelector('span').textContent = p.sub;
    b.onclick = () => preset(p.id);
    $('presets').append(b);
  }
  if (!chapters.length) $('presets').innerHTML = '<p class="sub">No chapters in this language on MangaDex (some are only on official sites).</p>';
  $('rangeRow').hidden = chapters.length < 2;
  if (job.currentIndex < 0) job.currentIndex = 0;
  preset((initial === 'all' || !hasCurrent) && chapters.length > 1 ? 'all' : 'current');
}
$('from').onchange = $('to').onchange = () => { document.querySelectorAll('#presets button').forEach((b) => b.classList.remove('on')); showCount(); };

// MangaDex: language picker + data saver
let dataSaver = false;
if (isMD) {
  $('langRow').hidden = false;
  for (const l of job.langs) {
    const b = document.createElement('button');
    b.textContent = LANG_NAMES[l] || l;
    b.dataset.lang = l;
    b.classList.toggle('on', l === job.lang);
    b.onclick = async () => {
      if (b.classList.contains('on')) return;
      document.querySelectorAll('#langs button').forEach((x) => x.classList.toggle('on', x === b));
      $('count').textContent = 'Loading chapters…'; $('start').disabled = true;
      try {
        chapters = await mangaDexChapters(job.mangaId, l);
        job.lang = l;
        job.currentIndex = chapters.findIndex((c) => c.id === job.currentChapterId);
        renderChapters('all');
      } catch (e) { $('count').textContent = e.message; }
    };
    $('langs').append(b);
  }
  $('saver').onchange = (e) => { dataSaver = e.target.checked; };
}
renderChapters(job.preset);
$('setup').hidden = false;

// ================= STEP 2: run =================
let cancelled = false;
const tab = await chrome.tabs.getCurrent();

async function setReferer(url) {
  const o = new URL(url).origin;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tab.id],
    addRules: [{
      id: tab.id, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: url }, { header: 'Origin', operation: 'set', value: o }] },
      condition: { tabIds: [tab.id], resourceTypes: ['xmlhttprequest'] },
    }],
  });
}

// --- image fetch: validation + retry/backoff (approach from Comics-Manga-Downloader-Extension, MIT) ---
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
function sniff(b) {
  if (!b.length) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'gif';
  if (b[0] === 0x52 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
  if (String.fromCharCode(...b.slice(4, 12)) === 'ftypavif') return 'avif';
  return 'unknown';
}
async function fetchImage(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch(url, { credentials: 'include', signal: ctl.signal });
      if (!res.ok) { const e = new Error('HTTP ' + res.status); e.fatal = !(res.status === 429 || res.status >= 500); throw e; }
      const data = new Uint8Array(await res.arrayBuffer());
      const kind = sniff(data);
      if (!kind) throw new Error('empty');
      if (kind === 'unknown' && /^\s*</.test(new TextDecoder().decode(data.slice(0, 64)))) throw new Error('not an image');
      const ext = kind !== 'unknown' ? kind : EXT[(res.headers.get('content-type') || '').split(';')[0]] || 'jpg';
      return { data, ext };
    } catch (e) {
      err = e;
      if (e.fatal || i === tries - 1) break;
      await sleep([300, 900, 2000][i] * (0.8 + Math.random() * 0.4));
    } finally { clearTimeout(t); }
  }
  throw err;
}

// --- load a chapter: try plain HTML first, fall back to a background tab for JS-rendered readers ---
const enough = (r) => (isImages ? r.images.length >= 3 : r.text.length >= 400);
async function loadChapter(url, c) {
  if (isMD) return { images: await mangaDexPages(c.id, dataSaver), text: '', title: c.label };
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const r = scanDocument(doc, url);
      if (enough(r)) return r;
    }
  } catch {}
  return scanInTab(url);
}
async function scanInTab(url) {
  const t = await chrome.tabs.create({ url, active: false });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(l); reject(new Error('page took too long')); }, 45000);
      const l = (id, info) => { if (id === t.id && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(l); resolve(); } };
      chrome.tabs.onUpdated.addListener(l);
    });
    await sleep(800);
    if (isImages) await chrome.scripting.executeScript({ target: { tabId: t.id }, func: autoScroll });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: scanDocument, args: [null, null] });
    return result;
  } finally {
    chrome.tabs.remove(t.id).catch(() => {});
  }
}

// --- saving through chrome.downloads so files land in Downloads/Shield Client/<series>/ ---
let lastId = null;
const waiters = new Map();
chrome.downloads.onChanged.addListener((d) => {
  const w = waiters.get(d.id);
  if (w && d.state && d.state.current !== 'in_progress') { waiters.delete(d.id); w(d.state.current); }
});
async function saveFile(filename, blob, keepInList = false) {
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({ url, filename, conflictAction: 'overwrite', saveAs: false });
    const state = await new Promise((r) => waiters.set(id, r));
    if (state !== 'complete') throw new Error('save failed');
    if (keepInList) lastId = id; else chrome.downloads.erase({ id });
    return id;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !cancelled) { const k = i++; await fn(items[k], k); }
  }));
}

$('start').onclick = async () => {
  const fmt = document.querySelector('input[name=fmt]:checked').value;
  const from = +$('from').value, to = +$('to').value;
  const picked = chapters.slice(from, to + 1).map((c, k) => ({ ...c, index: from + k }));
  $('setup').hidden = true; $('run').hidden = false;
  $('cancel').onclick = () => { cancelled = true; $('now').textContent = 'Cancelling…'; };

  const base = `Shield Client/${safe(job.series)}`;
  const width = Math.max(3, String(picked.length).length);
  const li = picked.map((c) => {
    const el = document.createElement('li');
    el.innerHTML = '<span></span><i>waiting</i>';
    el.firstChild.textContent = c.label || `Chapter ${c.num}`;
    $('list').append(el);
    return el;
  });
  const failed = [];
  const readerChapters = [];
  const textChapters = [];
  let pagesDone = 0;

  for (let k = 0; k < picked.length && !cancelled; k++) {
    const c = picked[k];
    const el = li[k];
    el.className = 'active'; el.lastChild.textContent = 'loading…';
    el.scrollIntoView({ block: 'nearest' });
    $('now').textContent = c.label || `Chapter ${c.num}`;
    $('sub').textContent = `Chapter ${k + 1} of ${picked.length}`;
    try {
      const page = c.index === job.currentIndex && job.current && enough(job.current) ? job.current : await loadChapter(c.url, c);
      if (!enough(page)) throw new Error(isImages ? 'no pages found' : 'no text found');
      const name = `${pad(k + 1, width)} - ${safe(c.label || 'Chapter ' + c.num)}`;

      if (isImages) {
        await setReferer(c.url);
        const results = new Array(page.images.length);
        let got = 0;
        await pool(page.images, 4, async (u, i) => {
          try { results[i] = await fetchImage(u); } catch (e) {
            if (isMD) { // direct download refused – fetch it through the MangaDex tab instead
              try { const data = await mangaDexImageViaTab(u); results[i] = { data, ext: sniff(data) === 'unknown' ? 'jpg' : sniff(data) }; } catch {}
            }
          }
          el.lastChild.textContent = `${++got}/${page.images.length} pages`;
        });
        const files = results.map((r, i) => r && { name: `${pad(i + 1, 3)}.${r.ext}`, data: r.data }).filter(Boolean);
        if (!files.length) throw new Error('pages blocked by the site');
        if (fmt === 'cbz') {
          await saveFile(`${base}/${name}.cbz`, makeZip(files, 'application/vnd.comicbook+zip'), true);
        } else {
          const dir = `chapters/${name}`;
          await pool(files, 3, (f) => saveFile(`${base}/${dir}/${f.name}`, new Blob([f.data])));
          readerChapters.push({ label: c.label || `Chapter ${c.num}`, pages: files.map((f) => `${dir}/${f.name}`) });
        }
        pagesDone += files.length;
        el.lastChild.textContent = files.length < page.images.length ? `✓ ${files.length}/${page.images.length} pages` : `✓ ${files.length} pages`;
      } else {
        textChapters.push({ title: c.label || page.title || `Chapter ${c.num}`, text: page.text });
        el.lastChild.textContent = `✓ ${page.text.split(/\s+/).length.toLocaleString()} words`;
      }
      el.className = 'ok';
    } catch (e) {
      failed.push(c.label || `Chapter ${c.num}`);
      el.className = 'err'; el.lastChild.textContent = '✕ ' + e.message;
    }
    const pct = Math.round(((k + 1) / picked.length) * 100);
    $('pct').textContent = pct + '%'; $('bar').style.width = pct + '%';
    await sleep(250); // be gentle with the site
  }

  // write the reader / book
  let mainFile = null;
  if (isImages && fmt === 'reader' && readerChapters.length) {
    mainFile = await saveFile(`${base}/Read ${safe(job.series)}.html`, new Blob([buildMangaReader(job.series, readerChapters, accent)], { type: 'text/html' }), true);
  }
  if (!isImages && textChapters.length) {
    const book = safe(job.series);
    if (fmt === 'html') mainFile = await saveFile(`${base}/${book}.html`, new Blob([buildNovelReader(job.series, textChapters, accent)], { type: 'text/html' }), true);
    if (fmt === 'epub') mainFile = await saveFile(`${base}/${book}.epub`, makeEpubBook(job.series, textChapters), true);
    if (fmt === 'txt') mainFile = await saveFile(`${base}/${book}.txt`, new Blob([textChapters.map((c) => `${c.title}\n\n${c.text}`).join('\n\n\n')], { type: 'text/plain' }), true);
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tab.id] });

  // ================= STEP 3: done =================
  $('run').hidden = true; $('done').hidden = false;
  const ok = picked.length - failed.length;
  $('doneTitle').textContent = cancelled ? 'Stopped' : ok ? 'All done!' : 'Nothing could be downloaded';
  $('doneSub').textContent = isImages
    ? `${ok} chapter${ok === 1 ? '' : 's'} · ${pagesDone} pages saved to Downloads/${base}`
    : `${ok} chapter${ok === 1 ? '' : 's'} saved to Downloads/${base}`;
  if (failed.length) $('failed').textContent = `Couldn't get: ${failed.slice(0, 8).join(', ')}${failed.length > 8 ? '…' : ''}`;
  const canOpen = mainFile && (fmt === 'reader' || fmt === 'html');
  $('open').hidden = !canOpen;
  $('open').onclick = () => chrome.downloads.open(mainFile);
  $('show').hidden = !lastId;
  $('show').onclick = () => chrome.downloads.show(mainFile || lastId);
  chrome.storage.session.remove(`job_${jobId}`);
};
