import { makeZip, makeEpubBook } from '../lib/zip.js';
import { scanDocument, autoScroll } from '../lib/extract.js';
import { buildMangaReader, buildNovelReader } from '../lib/reader.js';
import { mangaDexChapters, mangaDexPages, mangaDexImageViaTab, useMangaDexTab, LANG_NAMES } from '../lib/mangadex.js';

const $ = (id) => document.getElementById(id);
const jobId = new URLSearchParams(location.search).get('job');
// Chrome's downloads API only accepts plain, portable file names: no non-ASCII characters
// (not even "–" or curly quotes), no trailing dots, no reserved Windows names. Titles inside
// the reader keep their real text – only the names on disk are simplified.
const safe = (s, fallback = 'Untitled') => {
  let t = String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019\u201a\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u2033]/g, '').replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|~]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 80).replace(/[.\s-]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = '_' + t;
  return t || fallback;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n, w) => String(n).padStart(w, '0');

const { [`job_${jobId}`]: job } = await chrome.storage.session.get(`job_${jobId}`);
const { accent = '#5e7d9c' } = await chrome.storage.sync.get('accent');
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
const seriesName = safe(job.series, job.mangaId ? `MangaDex ${String(job.mangaId).slice(0, 8)}` : `Series ${new Date().toISOString().slice(0, 10)}`);
$('folder').textContent = seriesName;
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

// --- saving through chrome.downloads so files land in Downloads/Syndicates Client/<series>/ ---
let lastId = null;
const waiters = new Map();
chrome.downloads.onChanged.addListener((d) => {
  const w = waiters.get(d.id);
  if (w && d.state && d.state.current !== 'in_progress') { waiters.delete(d.id); w(d.state.current); }
});
const savedPaths = new Map();
async function saveFile(filename, blob, keepInList = false) {
  const url = URL.createObjectURL(blob);
  try {
    let id;
    try { id = await chrome.downloads.download({ url, filename, conflictAction: 'overwrite', saveAs: false }); }
    catch (e) {
      if (!/invalid filename/i.test(e.message)) throw e;
      const plain = filename.split('/').map((part, i, all) => i === all.length - 1 ? part : part.replace(/[^A-Za-z0-9 _.-]/g, '').trim().replace(/[.\s]+$/, '') || `part${i}`).join('/');
      id = await chrome.downloads.download({ url, filename: plain, conflictAction: 'overwrite', saveAs: false });
    }
    const state = await new Promise((r) => waiters.set(id, r));
    if (state !== 'complete') throw new Error('save failed');
    // where Chrome really put it (it may rename files or folders) – the reader uses this
    const [item] = await chrome.downloads.search({ id });
    savedPaths.set(id, item?.filename || '');
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

  const base = `Syndicates Client/${seriesName}`;
  const width = Math.max(3, String(chapters.length).length);
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
      const name = `${pad(c.index + 1, width)} - ${safe(c.label, `Chapter ${c.num || c.index + 1}`)}`;

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
          const ids = new Array(files.length);
          await pool(files, 3, async (f, i) => { ids[i] = await saveFile(`${base}/${dir}/${f.name}`, new Blob([f.data])); });
          readerChapters.push({ num: c.num, label: c.label || `Chapter ${c.num}`, pages: files.map((f, i) => ({ rel: `${dir}/${f.name}`, abs: savedPaths.get(ids[i]) || '' })) });
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
    // series folder on disk = the folder that contains "chapters"
    const firstAbs = readerChapters[0].pages.find((p) => p.abs)?.abs || '';
    const parts = firstAbs.split(/[\\/]/);
    const ci = parts.lastIndexOf('chapters');
    const seriesDir = ci > 0 ? parts.slice(0, ci).join('/') : '';
    const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map((s, i) => (i === 0 && /:$/.test(s) ? s : encodeURIComponent(s))).join('/');
    for (const ch of readerChapters) {
      ch.pages = ch.pages.map((p) => {
        const norm = (p.abs || '').replace(/\\/g, '/');
        const rel = seriesDir && norm.startsWith(seriesDir + '/') ? norm.slice(seriesDir.length + 1) : p.rel;
        return p.abs ? [rel, fileUrl(p.abs)] : [p.rel, ''];
      });
    }
    // keep every chapter downloaded so far in the reader (library "new chapters" runs add to it)
    const idxKey = `readerIndex_${job.mangaId || seriesName}`;
    const { [idxKey]: before = [] } = await chrome.storage.local.get(idxKey);
    const byLabel = new Map(before.map((c) => [c.label, c]));
    for (const c of readerChapters) byLabel.set(c.label, c);
    const all = [...byLabel.values()].sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
    await chrome.storage.local.set({ [idxKey]: all });
    mainFile = await saveFile(`${base}/Read ${seriesName}.html`, new Blob([buildMangaReader(job.series, all, accent)], { type: 'text/html' }), true);
  }
  if (!isImages && textChapters.length) {
    const book = seriesName;
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
  $('open').onclick = () => { try { chrome.downloads.open(mainFile); } catch { chrome.downloads.show(mainFile); } };
  $('show').hidden = !lastId;
  $('show').onclick = () => chrome.downloads.show(mainFile || lastId);
  chrome.storage.session.remove(`job_${jobId}`);
  if (job.libraryId) {
    const doneNums = picked.filter((c) => !failed.includes(c.label || `Chapter ${c.num}`)).map((c) => c.num || 0);
    const { mdLibrary = [] } = await chrome.storage.local.get('mdLibrary');
    const e = mdLibrary.find((x) => x.id === job.libraryId);
    if (e) { e.lastNum = Math.max(e.lastNum || 0, ...doneNums, 0); e.lastRun = Date.now(); e.total = chapters.length; await chrome.storage.local.set({ mdLibrary }); }
    await chrome.storage.local.set({ libraryRunDone: { id: job.libraryId, ok, failed: failed.length, t: Date.now() } });
    if (job.auto) setTimeout(() => window.close(), 1500);
  }
};

// library batch mode: pick format + chapters and start without asking
if (job.auto) {
  const f = document.querySelector(`input[name=fmt][value="${job.format || 'reader'}"]`); if (f) f.checked = true;
  if (isMD && job.dataSaver) { $('saver').checked = true; dataSaver = true; }
  let from = 0;
  if (job.preset === 'new') from = chapters.findIndex((c) => (c.num || 0) > (job.sinceNum || 0));
  if (!chapters.length || from < 0) {
    $('setup').hidden = true; $('done').hidden = false;
    $('doneTitle').textContent = 'No new chapters'; $('doneSub').textContent = job.series;
    $('open').hidden = true; $('show').hidden = true;
    await chrome.storage.local.set({ libraryRunDone: { id: job.libraryId, ok: 0, failed: 0, t: Date.now() } });
    setTimeout(() => window.close(), 1200);
  } else {
    $('from').value = from; $('to').value = chapters.length - 1;
    $('start').click();
  }
}
