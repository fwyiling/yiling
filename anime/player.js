// Ani Manga player: plays HiAnime episodes in the client and downloads them (single or queued).
import { watchUrl, isPlaylist, isVideoFile } from '../lib/hianime.js';
import { DEFAULTS } from '../lib/defaults.js';
import { getWatching, loadShow, rememberShow, saveProgress } from '../lib/watching.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
// Chrome's downloads API only accepts plain ASCII file names (same rules as the manga downloader).
const safe = (s, fallback = 'Untitled') => {
  let t = String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|~]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 80).replace(/[.\s-]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = '_' + t;
  return t || fallback;
};

const prefs = { ...DEFAULTS, ...(await chrome.storage.sync.get(['accent', 'amAutoNext', 'amSkipFiller', 'amResume', 'amSyncList'])) };
if (prefs.accent) document.documentElement.style.setProperty('--a', prefs.accent);

const params = new URLSearchParams(location.search);
let key = params.get('s'), job, resumeAt = 0;
if (params.get('resume')) { // "Continue watching": rebuild the job from what was saved for this show
  const rkey = params.get('resume'), show = await loadShow(rkey), spot = (await getWatching()).find((w) => w.key === rkey);
  if (show?.episodes?.length) {
    job = { anime: show.anime, aniId: show.aniId, cover: show.cover, episodes: show.episodes, lang: show.lang, mode: 'watch', idx: spot?.idx || 0 };
    resumeAt = spot?.time || 0;
    key = `am_${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: job });
  }
} else if (key) {
  ({ [key]: job } = await chrome.storage.session.get(key));
  resumeAt = job?.resumeAt || 0;
}
const me = await chrome.tabs.getCurrent();
const video = $('video'), overlay = $('overlay'), msg = $('msg');

function fail(text) {
  overlay.classList.remove('hidden');
  msg.textContent = text;
}
if (!job?.episodes?.length) {
  fail('This player link has expired. Open the show again from Ani Manga.');
  await new Promise(() => {}); // stop here quietly
}

const { anime, episodes } = job;
let lang = job.lang || 'sub';
let currentIdx = Math.min(Math.max(job.idx || 0, 0), episodes.length - 1);
const resumeIdx = currentIdx;
$('animeTitle').textContent = anime;
let seen = job.mode === 'download' ? {} : await rememberShow(job);

// ---------- stream resolution ----------
// Each episode lists one or more players (sub and/or dub). A link straight to a video is used as is;
// an embedded player is opened in a hidden tab so the background can pick up the video it loads.
async function resolveStream(ep) {
  const links = [...(lang === 'dub' ? ep.dub : ep.sub), ...(lang === 'dub' ? ep.sub : ep.dub)];
  const site = 'https://hianimes.se/';
  const errors = [];
  for (const url of links) {
    if (isPlaylist(url) || isVideoFile(url)) {
      await chrome.runtime.sendMessage({ type: 'am-stream-headers', tabId: me.id, referer: site });
      return isPlaylist(url) ? { m3u8: url, tracks: [] } : { file: url, tracks: [] };
    }
    msg.textContent = 'Starting the episode’s player in the background…';
    const r = await chrome.runtime.sendMessage({ type: 'am-capture-stream', url, tabId: me.id });
    if (r?.ok && (r.result.m3u8 || r.result.file)) return r.result;
    errors.push(r?.error || 'no answer');
  }
  if (ep.slug) { // last resort: the episode's page on the site itself
    const r = await chrome.runtime.sendMessage({ type: 'am-capture-stream', url: watchUrl(ep), tabId: me.id });
    if (r?.ok && (r.result.m3u8 || r.result.file)) return r.result;
    errors.push(r?.error || 'no answer');
  }
  throw new Error(errors.length ? errors[errors.length - 1] : 'this episode has no player yet');
}

// ---------- HLS download (shared by single download and the queue) ----------
async function fetchText(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`playlist HTTP ${r.status}`);
  return r.text();
}
async function mediaPlaylist(url) {
  let text = await fetchText(url);
  if (text.includes('#EXT-X-STREAM-INF')) { // master playlist: take the highest-quality variant
    const lines = text.split('\n').map((l) => l.trim());
    let best = null, bw = -1;
    lines.forEach((l, i) => {
      const m = /^#EXT-X-STREAM-INF:.*?BANDWIDTH=(\d+)/.exec(l);
      const next = m && lines.slice(i + 1).find((x) => x && !x.startsWith('#'));
      if (next && +m[1] > bw) { bw = +m[1]; best = next; }
    });
    if (!best) throw new Error('empty master playlist');
    url = new URL(best, url).href;
    text = await fetchText(url);
  }
  return { url, text };
}
function parseSegments(text, base) {
  const segs = [];
  let keyInfo = null, init = null, seq = +(/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(text)?.[1] || 0);
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (l.startsWith('#EXT-X-KEY')) {
      const method = /METHOD=([^,]+)/.exec(l)?.[1];
      if (method === 'NONE') keyInfo = null;
      else if (method === 'AES-128') keyInfo = { uri: new URL(/URI="([^"]+)"/.exec(l)[1], base).href, iv: /IV=0x([0-9a-f]+)/i.exec(l)?.[1] || null };
      else throw new Error(`unsupported stream encryption (${method})`);
    } else if (l.startsWith('#EXT-X-MAP')) {
      init = new URL(/URI="([^"]+)"/.exec(l)[1], base).href;
    } else if (l && !l.startsWith('#')) {
      segs.push({ url: new URL(l, base).href, key: keyInfo, seq: seq++ });
    }
  }
  return { segs, init };
}
async function fetchBuf(u, label) {
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.arrayBuffer();
    } catch (e) {
      if (t >= 2) throw new Error(`${label} failed: ${e.message}`);
      await sleep(800 * (t + 1));
    }
  }
}
async function saveBlob(blob, ep, ext) {
  const blobUrl = URL.createObjectURL(blob);
  const show = safe(anime, 'Anime');
  const id = await chrome.downloads.download({ url: blobUrl, filename: `Ani Manga/${show}/${show} - Episode ${pad(ep.number)}${lang === 'dub' ? ' (dub)' : ''}.${ext}`, conflictAction: 'uniquify' });
  const revoke = (d) => {
    if (d.id === id && d.state && d.state.current !== 'in_progress') { URL.revokeObjectURL(blobUrl); chrome.downloads.onChanged.removeListener(revoke); }
  };
  chrome.downloads.onChanged.addListener(revoke);
}
async function downloadFile(ep, url, onProgress) { // a plain video file: stream it in with progress
  const r = await fetch(url);
  if (!r.ok) throw new Error(`video HTTP ${r.status}`);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) onProgress(got, total);
  }
  const ext = (/\.(mp4|webm|mkv|ogg)(\?|$)/i.exec(url)?.[1] || 'mp4').toLowerCase();
  await saveBlob(new Blob(parts, { type: r.headers.get('content-type') || 'video/mp4' }), ep, ext);
}
async function downloadEpisode(ep, stream, onProgress) {
  if (!stream.m3u8) return downloadFile(ep, stream.file, onProgress);
  const { url, text } = await mediaPlaylist(stream.m3u8);
  const { segs, init } = parseSegments(text, url);
  if (!segs.length) throw new Error('no video segments in playlist');
  const keys = new Map();
  const cryptoKey = (uri) => {
    if (!keys.has(uri)) keys.set(uri, fetchBuf(uri, 'key').then((b) => crypto.subtle.importKey('raw', b, 'AES-CBC', false, ['decrypt'])));
    return keys.get(uri);
  };
  const ivFor = (s) => {
    const iv = new Uint8Array(16);
    if (s.key.iv) { const h = s.key.iv.padStart(32, '0'); for (let i = 0; i < 16; i++) iv[i] = parseInt(h.substr(i * 2, 2), 16); }
    else new DataView(iv.buffer).setUint32(12, s.seq);
    return iv;
  };
  const parts = new Array(segs.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < segs.length) {
      const i = next++, s = segs[i];
      let buf = await fetchBuf(s.url, `segment ${i + 1}`);
      if (s.key) buf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivFor(s) }, await cryptoKey(s.key.uri), buf);
      parts[i] = buf;
      onProgress(++done, segs.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (init) parts.unshift(await fetchBuf(init, 'init segment'));
  await saveBlob(new Blob(parts, { type: init ? 'video/mp4' : 'video/mp2t' }), ep, init ? 'mp4' : 'ts');
}

// ---------- watch mode ----------
let hls = null, currentStream = null, loadSeq = 0;

function renderEpList() {
  $('epList').replaceChildren(...episodes.map((ep, i) => {
    const chip = document.createElement('button');
    chip.className = 'ep-chip' + (ep.filler ? ' filler' : '') + (seen[ep.number] ? ' seen' : '') + (i === currentIdx ? ' active' : '');
    chip.title = seen[ep.number] ? `${ep.title} (watched)` : ep.title;
    chip.textContent = ep.number;
    chip.onclick = () => loadEpisode(i);
    return chip;
  }));
}
function updateNav() {
  const ep = episodes[currentIdx];
  $('prevBtn').disabled = currentIdx <= 0;
  $('nextBtn').disabled = currentIdx >= episodes.length - 1;
  $('epLabel').textContent = `Episode ${ep.number}${ep.title && ep.title !== `Episode ${ep.number}` ? ` · ${ep.title}` : ''}`;
  document.title = `${anime} · Ep ${ep.number} · Ani Manga`;
}
async function addTracks(tracks) {
  video.querySelectorAll('track').forEach((t) => { if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src); t.remove(); });
  for (const t of tracks || []) {
    if (!t.file || t.kind === 'thumbnails') continue;
    try { // load the text through the extension: <track> can't fetch cross-site files itself
      const r = await fetch(t.file);
      if (!r.ok) continue;
      const el = Object.assign(document.createElement('track'), { kind: 'subtitles', label: t.label || 'Subtitles', srclang: 'en', src: URL.createObjectURL(await r.blob()) });
      if (t.default || /english/i.test(t.label || '')) el.default = true;
      video.append(el);
    } catch {}
  }
}
async function loadEpisode(idx) {
  if (idx < 0 || idx >= episodes.length) return;
  const mine = ++loadSeq;
  currentIdx = idx;
  currentStream = null;
  $('dlBtn').disabled = true;
  updateNav();
  renderEpList();
  history.replaceState(null, '', `?s=${encodeURIComponent(key)}&ep=${episodes[idx].number}`);
  chrome.storage.session.set({ [key]: { ...job, idx, lang } });
  overlay.classList.remove('hidden');
  msg.textContent = 'Finding a stream…';
  $('fallbackBtn').hidden = true;
  if (hls) { hls.destroy(); hls = null; }
  video.removeAttribute('src'); video.load();
  try {
    const stream = await resolveStream(episodes[idx]);
    if (mine !== loadSeq) return; // another episode was picked meanwhile
    currentStream = stream;
    $('dlBtn').disabled = false;
    const startAt = idx === resumeIdx && prefs.amResume ? resumeAt : 0;
    if (startAt) video.addEventListener('loadedmetadata', () => { if (mine === loadSeq && startAt < video.duration - Math.min(10, video.duration * 0.1)) video.currentTime = startAt; }, { once: true });
    if (stream.file) {
      video.src = stream.file;
      video.addEventListener('loadedmetadata', () => { if (mine === loadSeq) { overlay.classList.add('hidden'); video.play().catch(() => {}); } }, { once: true });
      video.addEventListener('error', () => { if (mine === loadSeq && video.getAttribute('src')) { fail('This video couldn’t be played. Try again or open it on HiAnime.'); $('fallbackBtn').hidden = false; } }, { once: true });
    } else if (window.Hls?.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(stream.m3u8);
      hls.attachMedia(video);
      hls.once(Hls.Events.MANIFEST_PARSED, () => { overlay.classList.add('hidden'); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { fail(`Playback error (${d.details}). Try again or open it on HiAnime.`); $('fallbackBtn').hidden = false; } });
    } else {
      throw new Error('this browser cannot play HLS video');
    }
    addTracks(stream.tracks);
  } catch (e) {
    if (mine !== loadSeq) return;
    fail(`Couldn’t load this episode: ${e.message}`);
    $('fallbackBtn').hidden = false;
  }
}
// remember the position every few seconds of playback (and on pause / leaving)
let lastSave = 0;
const save = async () => {
  if (!currentStream || !video.duration) return;
  lastSave = Date.now();
  const s = await saveProgress({ ...job, lang }, currentIdx, video.currentTime, video.duration, { syncList: prefs.amSyncList });
  if (s && Object.keys(s).length !== Object.keys(seen).length) { seen = s; renderEpList(); }
};
video.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 5000) save(); });
video.addEventListener('pause', save);
addEventListener('pagehide', save);
video.addEventListener('ended', async () => {
  await save();
  if (!prefs.amAutoNext) return;
  let next = currentIdx + 1;
  while (prefs.amSkipFiller && episodes[next]?.filler) next++;
  if (next < episodes.length) loadEpisode(next);
});
$('prevBtn').onclick = () => loadEpisode(currentIdx - 1);
$('nextBtn').onclick = () => loadEpisode(currentIdx + 1);
$('fallbackBtn').onclick = () => { const ep = episodes[currentIdx]; chrome.tabs.create({ url: ep.slug ? watchUrl(ep) : ep.sub[0] || ep.dub[0] }); };
if (episodes.some((ep) => ep.dub?.length)) {
  const b = $('langBtn');
  b.hidden = false;
  const paint = () => { b.textContent = lang === 'dub' ? 'DUB' : 'SUB'; b.title = lang === 'dub' ? 'Playing dubbed – switch to subtitles' : 'Playing subtitled – switch to dub'; };
  paint();
  b.onclick = () => { lang = lang === 'dub' ? 'sub' : 'dub'; chrome.storage.session.set({ [key]: { ...job, idx: currentIdx, lang } }); paint(); loadEpisode(currentIdx); };
}
$('dlBtn').onclick = async () => {
  if (!currentStream) return;
  const btn = $('dlBtn'), bar = $('dlProgress'), ep = episodes[currentIdx];
  btn.disabled = true;
  try {
    await downloadEpisode(ep, currentStream, (d, n) => { btn.textContent = `⬇ ${Math.round((d / n) * 100)}%`; bar.style.width = `${(d / n) * 100}%`; });
    btn.textContent = '✓ Saved';
    await sleep(2500);
  } catch (e) {
    alert(`Download failed: ${e.message}`);
  } finally {
    btn.textContent = '⬇ Download episode';
    btn.disabled = !currentStream;
    bar.style.width = '0';
  }
};

// ---------- download queue mode ----------
async function runQueue(indices) {
  $('stage').hidden = true; $('epRow').hidden = true; $('watchActions').hidden = true;
  $('queue').hidden = false;
  $('epLabel').textContent = `Downloading ${indices.length} episode${indices.length === 1 ? '' : 's'}`;
  document.title = `Downloading · ${anime} · Ani Manga`;
  const rows = indices.map((i) => {
    const ep = episodes[i];
    const li = document.createElement('li');
    li.innerHTML = '<span class="n"></span><span class="tt"></span><span class="st">Waiting</span><div class="bar2"><i></i></div>';
    li.querySelector('.n').textContent = `Ep ${ep.number}`;
    li.querySelector('.tt').textContent = ep.title;
    $('queueList').append(li);
    return li;
  });
  let ok = 0;
  for (let k = 0; k < indices.length; k++) {
    const ep = episodes[indices[k]], li = rows[k], st = li.querySelector('.st'), bar = li.querySelector('.bar2 i');
    li.className = 'active';
    li.scrollIntoView({ block: 'nearest' });
    $('queueHead').textContent = `Downloading ${k + 1} of ${indices.length}`;
    try {
      st.textContent = 'Finding stream…';
      const stream = await resolveStream(ep);
      await downloadEpisode(ep, stream, (d, n) => { st.textContent = `${Math.round((d / n) * 100)}%`; bar.style.width = `${(d / n) * 100}%`; });
      li.className = 'done'; st.textContent = 'Saved ✓'; ok++;
    } catch (e) {
      li.className = 'failed'; st.textContent = e.message; st.title = e.message;
    }
  }
  $('queueHead').textContent = `Finished · ${ok} of ${indices.length} saved`;
}

if (job.mode === 'download') runQueue(job.queue?.length ? job.queue : episodes.map((_, i) => i));
else { renderEpList(); loadEpisode(currentIdx); }
