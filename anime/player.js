import { fetchSources, watchUrl } from '../lib/hianime.js';

const p = new URLSearchParams(location.search);
const slug = p.get('slug') || '';
const animeTitle = p.get('anime') || 'Anime';
const episodeIds = JSON.parse(p.get('ids') || '[]');  // [{id, number, title, filler}]
let currentIdx = parseInt(p.get('idx') || '0', 10);

const { accent } = await chrome.storage.sync.get('accent');
if (accent) document.documentElement.style.setProperty('--a', accent);

const $ = id => document.getElementById(id);
const video = $('video');
const overlay = $('overlay');
const msg = $('msg');

$('animeTitle').textContent = animeTitle;

// ---- HLS player (hls.js from CDN) ----
const HLS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js';
let hlsInstance = null;

async function loadHls() {
  if (window.Hls) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = HLS_CDN; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ---- episode chips ----
function renderEpList() {
  const list = $('epList');
  list.replaceChildren();
  episodeIds.forEach((ep, i) => {
    const chip = document.createElement('button');
    chip.className = 'ep-chip' + (ep.filler ? ' filler' : '') + (i === currentIdx ? ' active' : '');
    chip.title = ep.title;
    chip.innerHTML = `<span class="ep-num">${ep.number}</span>`;
    chip.onclick = () => loadEpisode(i);
    list.append(chip);
  });
}

function updateNav() {
  $('prevBtn').disabled = currentIdx <= 0;
  $('nextBtn').disabled = currentIdx >= episodeIds.length - 1;
  const ep = episodeIds[currentIdx];
  if (ep) $('epLabel').textContent = `Episode ${ep.number}${ep.title && ep.title !== `Episode ${ep.number}` ? ` · ${ep.title}` : ''}`;
  document.title = `${animeTitle} · Ep ${ep?.number ?? ''} · Syndicates`;
}

$('prevBtn').onclick = () => loadEpisode(currentIdx - 1);
$('nextBtn').onclick = () => loadEpisode(currentIdx + 1);

// ---- load episode ----
let currentM3u8 = null;
let currentTracks = [];

async function loadEpisode(idx) {
  if (idx < 0 || idx >= episodeIds.length) return;
  currentIdx = idx;
  currentM3u8 = null;
  currentTracks = [];

  const ep = episodeIds[idx];
  updateNav();
  renderEpList();

  overlay.classList.remove('hidden');
  msg.textContent = 'Fetching stream…';
  $('fallbackBtn').hidden = true;

  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  video.src = '';

  try {
    await loadHls();
    const { m3u8, tracks } = await fetchSources(ep.id);
    currentM3u8 = m3u8;
    currentTracks = tracks;

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: false, maxBufferLength: 30 });
      hlsInstance.loadSource(m3u8);
      hlsInstance.attachMedia(video);
      hlsInstance.once(Hls.Events.MANIFEST_PARSED, () => {
        overlay.classList.add('hidden');
        video.play().catch(() => {});
      });
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          overlay.classList.remove('hidden');
          msg.textContent = `Playback error: ${data.details}`;
          $('fallbackBtn').hidden = false;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = m3u8;
      video.addEventListener('loadedmetadata', () => { overlay.classList.add('hidden'); video.play().catch(() => {}); }, { once: true });
    } else {
      throw new Error('HLS not supported in this browser');
    }

    // Add subtitle tracks
    for (const t of tracks) {
      if (!t.file || t.kind === 'thumbnails') continue;
      const track = document.createElement('track');
      track.src = t.file; track.kind = t.kind || 'subtitles';
      track.label = t.label || 'Sub'; track.srclang = t.srclang || 'en';
      if (t.default) track.default = true;
      video.append(track);
    }
  } catch (e) {
    overlay.classList.remove('hidden');
    msg.textContent = `Could not load stream: ${e.message}`;
    $('fallbackBtn').hidden = false;
  }
}

// Fallback: open hianime.com directly
$('fallbackBtn').onclick = () => {
  const ep = episodeIds[currentIdx];
  chrome.tabs.create({ url: watchUrl(slug, ep?.number ?? 1) });
};

// ---- download ----
let dlProgress = null;

$('dlBtn').onclick = async () => {
  if (!currentM3u8) { alert('Load an episode first.'); return; }
  const ep = episodeIds[currentIdx];
  const btn = $('dlBtn');
  btn.disabled = true;

  if (!dlProgress) {
    dlProgress = document.createElement('div');
    dlProgress.id = 'dlProgress';
    $('stage').append(dlProgress);
  }
  dlProgress.style.width = '0';

  try {
    const r = await fetch(currentM3u8);
    if (!r.ok) throw new Error(`M3U8 fetch failed (${r.status})`);
    const playlist = await r.text();

    const baseUrl = currentM3u8.substring(0, currentM3u8.lastIndexOf('/') + 1);
    const segs = playlist.split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      .map(l => /^https?:\/\//.test(l) ? l : baseUrl + l);

    const chunks = [];
    let done = 0;
    for (const seg of segs) {
      btn.textContent = `⬇ ${done}/${segs.length}`;
      dlProgress.style.width = `${(done / segs.length) * 100}%`;
      const sr = await fetch(seg);
      if (!sr.ok) throw new Error(`Segment failed (${sr.status})`);
      chunks.push(await sr.arrayBuffer());
      done++;
    }
    dlProgress.style.width = '100%';

    const blob = new Blob(chunks, { type: 'video/mp2t' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animeTitle} - Episode ${ep?.number ?? currentIdx + 1}.ts`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    alert(`Download failed: ${e.message}`);
  } finally {
    btn.textContent = '⬇ Download';
    btn.disabled = false;
    dlProgress.style.width = '0';
  }
};

// ---- auto-download mode (opened with ?autodownload=1) ----
const autoDownload = p.get('autodownload') === '1';
if (autoDownload) {
  // After stream loads, trigger download automatically
  video.addEventListener('loadedmetadata', () => {
    setTimeout(() => $('dlBtn').click(), 500);
  }, { once: true });
}

// ---- init ----
renderEpList();
if (episodeIds.length) loadEpisode(currentIdx);
else { overlay.classList.remove('hidden'); msg.textContent = 'No episodes found.'; }
