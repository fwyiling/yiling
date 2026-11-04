// Shield Music – a Spotify-style player for YouTube Music's catalogue.
// Data: YouTube.js (LuanRT/YouTube.js, MIT) talking to YouTube Music's own web API.
// Playback: YouTube's embedded player, controlled with its postMessage API.
import { Innertube } from 'youtubei.js/web';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ICON_PLAY = '<path d="M8 5v14l11-7z"/>', ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
const DEMO = new URLSearchParams(location.search).has('demo');

// ---------------- state ----------------
const store = await chrome.storage.local.get(['musicLiked', 'musicHistory', 'musicPlaylists', 'musicVolume', 'musicNowPanel']);
let liked = store.musicLiked || [];
let history = store.musicHistory || [];
let playlists = store.musicPlaylists || [];
let queue = [], qi = -1, shuffle = false, repeat = 'off';
let cur = 0, dur = 0, playing = false, nowTab = 'queue';
const save = () => chrome.storage.local.set({ musicLiked: liked, musicHistory: history.slice(0, 200), musicPlaylists: playlists });
const { accent } = await chrome.storage.sync.get('accent');
if (accent) document.documentElement.style.setProperty('--a', accent);
if (store.musicNowPanel === false) document.body.classList.add('no-now');

// ---------------- YouTube Music data ----------------
let ytPromise = null;
const yt = () => (ytPromise ||= Innertube.create({ retrieve_player: false, generate_session_locally: true, fetch: (i, init) => fetch(i, init) }));
const text = (v) => (v == null ? '' : typeof v === 'string' ? v : v.text ?? v.toString?.() ?? '');
function bestThumb(item) {
  const list = item?.thumbnail?.contents || item?.thumbnails || item?.thumbnail || item?.thumbnail?.thumbnails || [];
  const arr = Array.isArray(list) ? list : [];
  const t = arr.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  let url = t?.url || '';
  if (url.startsWith('//')) url = 'https:' + url;
  return url.replace(/=w\d+-h\d+/, '=w544-h544');
}
function toTrack(item) {
  const id = item?.id || item?.video_id || item?.videoId || item?.endpoint?.payload?.videoId;
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const artists = (item.artists || item.authors || []).map((a) => a.name).filter(Boolean).join(', ')
    || text(item.author?.name ?? item.author) || text(item.subtitle).split(' • ').slice(-2, -1)[0] || text(item.subtitle);
  return {
    id, title: text(item.title) || 'Unknown', artist: artists || '', album: text(item.album?.name ?? item.album),
    duration: item.duration?.seconds ?? 0, art: bestThumb(item) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}
async function searchSongs(q, type = 'song') {
  if (DEMO) return demoTracks(q);
  const r = await (await yt()).music.search(q, { type });
  const shelf = r.songs || r.videos || r.contents?.[0];
  return (shelf?.contents || []).map(toTrack).filter(Boolean);
}
async function homeFeed() {
  if (DEMO) return [{ title: 'Quick picks', items: demoTracks('mix') }, { title: 'Trending', items: demoTracks('hot') }];
  const h = await (await yt()).music.getHomeFeed();
  return (h.sections || []).map((s) => ({ title: text(s.header?.title) || text(s.title) || 'For you', items: (s.contents || []).map(toTrack).filter(Boolean) }))
    .filter((s) => s.items.length);
}
async function upNext(id) {
  if (DEMO) return demoTracks('next');
  const r = await (await yt()).music.getUpNext(id);
  return (r.contents || []).map(toTrack).filter(Boolean);
}
async function lyrics(id) {
  if (DEMO) return 'Demo lyrics\n\nLa la la…';
  const l = await (await yt()).music.getLyrics(id);
  return text(l?.description) || '';
}
function demoTracks(seed) {
  const names = [['Neon Skyline', 'Arcade Hearts'], ['Midnight Drive', 'Synthrider'], ['Solo Level Up', 'Hunter Beats'], ['Cherry Lights', 'Luna Park'],
    ['Pixel Rain', 'Low Orbit'], ['Afterglow', 'Kairo'], ['Hyperdrive', 'Volt'], ['Velvet Sky', 'Mira']];
  return names.map(([t, a], i) => ({ id: `demo${seed.slice(0, 3)}${i}`.padEnd(11, 'x').slice(0, 11), title: t, artist: a, album: 'Shield Sessions', duration: 180 + i * 17,
    art: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${(i * 47 + seed.length * 30) % 360} 80% 55%)"/><stop offset="1" stop-color="hsl(${(i * 47 + 140) % 360} 70% 30%)"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>`)}` }));
}

// ---------------- player (YouTube embed + postMessage API) ----------------
const frame = $('yt');
const post = (o) => frame.contentWindow?.postMessage(JSON.stringify(o), '*');
const cmd = (func, args = []) => post({ event: 'command', func, args });
frame.addEventListener('load', () => { post({ event: 'listening', id: 'shield', channel: 'widget' }); cmd('setVolume', [+$('pVol').value]); });
addEventListener('message', (e) => {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  if (d.event === 'infoDelivery' && d.info) {
    if (d.info.currentTime != null) cur = d.info.currentTime;
    if (d.info.duration) dur = d.info.duration;
    if (d.info.playerState != null) {
      playing = d.info.playerState === 1;
      if (d.info.playerState === 0) onEnded();
    }
    paintProgress();
  } else if (d.event === 'onError') {
    toast('This song can\'t be played here – skipping');
    setTimeout(next, 800);
  }
});
function load(track) {
  cur = 0; dur = track.duration || 0; playing = true;
  frame.src = DEMO ? 'about:blank' : `https://www.youtube-nocookie.com/embed/${track.id}?enablejsapi=1&autoplay=1&controls=0&playsinline=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(location.origin)}`;
  history = [track, ...history.filter((t) => t.id !== track.id)];
  save();
  paintNow(); paintProgress();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: [{ src: track.art, sizes: '544x544' }] });
  }
}
function playList(list, i = 0) { queue = list.slice(); qi = i; load(queue[qi]); refreshQueue(); }
async function next() {
  if (repeat === 'one' && queue[qi]) return load(queue[qi]);
  if (shuffle && queue.length > 1) { let j; do { j = Math.floor(Math.random() * queue.length); } while (j === qi); qi = j; return load(queue[qi]); }
  if (qi + 1 < queue.length) { qi++; return load(queue[qi]); }
  if (repeat === 'all' && queue.length) { qi = 0; return load(queue[qi]); }
  // end of queue → keep the music going with YouTube Music's radio
  try { const more = (await upNext(queue[qi].id)).filter((t) => !queue.some((q) => q.id === t.id)); if (more.length) { queue.push(...more); qi++; load(queue[qi]); refreshQueue(); } } catch {}
}
function prev() { if (cur > 4) { cmd('seekTo', [0, true]); return; } if (qi > 0) { qi--; load(queue[qi]); } }
function onEnded() { playing = false; next(); }
function togglePlay() { if (qi < 0) return; playing ? cmd('pauseVideo') : cmd('playVideo'); playing = !playing; paintProgress(); }

$('pPlay').onclick = togglePlay;
$('pNext').onclick = next;
$('pPrev').onclick = prev;
$('pShuffle').onclick = () => { shuffle = !shuffle; $('pShuffle').classList.toggle('on', shuffle); };
$('pRepeat').onclick = () => { repeat = { off: 'all', all: 'one', one: 'off' }[repeat]; $('pRepeat').classList.toggle('on', repeat !== 'off'); $('pRepeat').textContent = repeat === 'one' ? '⟳¹' : '⟳'; };
$('pSeek').oninput = (e) => { if (dur) { cur = (e.target.value / 1000) * dur; cmd('seekTo', [cur, true]); paintProgress(); } };
$('pVol').value = store.musicVolume ?? 80;
$('pVol').oninput = (e) => { cmd('setVolume', [+e.target.value]); chrome.storage.local.set({ musicVolume: +e.target.value }); };
$('pLike').onclick = () => { if (queue[qi]) toggleLike(queue[qi]); };
$('pQueue').onclick = () => { const off = document.body.classList.toggle('no-now'); chrome.storage.local.set({ musicNowPanel: !off }); };
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => { cmd('playVideo'); playing = true; paintProgress(); });
  navigator.mediaSession.setActionHandler('pause', () => { cmd('pauseVideo'); playing = false; paintProgress(); });
  navigator.mediaSession.setActionHandler('nexttrack', next);
  navigator.mediaSession.setActionHandler('previoustrack', prev);
}
addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.key === 'ArrowRight' && e.shiftKey) next();
  if (e.key === 'ArrowLeft' && e.shiftKey) prev();
});
setInterval(() => { if (playing && DEMO) { cur = Math.min(dur, cur + 1); paintProgress(); } }, 1000);

function paintProgress() {
  $('pCur').textContent = fmt(cur); $('pDur').textContent = fmt(dur);
  if (document.activeElement !== $('pSeek')) $('pSeek').value = dur ? Math.round((cur / dur) * 1000) : 0;
  $('pPlayIcon').innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
  $('pPlay').title = playing ? 'Pause' : 'Play';
}
function paintNow() {
  const t = queue[qi];
  if (!t) return;
  $('pArt').src = $('nowArt').src = t.art;
  $('pTitle').textContent = $('nowTitle').textContent = t.title;
  $('pArtist').textContent = $('nowArtist').textContent = t.artist;
  $('pLike').textContent = liked.some((l) => l.id === t.id) ? '♥' : '♡';
  $('pLike').classList.toggle('on', liked.some((l) => l.id === t.id));
  document.title = `${t.title} · ${t.artist} – Shield Music`;
  document.querySelectorAll('.trow').forEach((r) => r.classList.toggle('playing', r.dataset.id === t.id));
  if (nowTab === 'lyrics') showLyrics();
}
function toggleLike(t) {
  liked = liked.some((l) => l.id === t.id) ? liked.filter((l) => l.id !== t.id) : [t, ...liked];
  save(); paintNow(); paintLib();
  document.querySelectorAll(`.lk[data-id="${t.id}"]`).forEach((b) => { const on = liked.some((l) => l.id === t.id); b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡'; });
  toast(liked.some((l) => l.id === t.id) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
}
let toastT;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => $('toast').classList.remove('show'), 2200); }

// ---------------- now-playing panel ----------------
document.querySelectorAll('.now-tabs button').forEach((b) => b.onclick = () => {
  nowTab = b.dataset.tab;
  document.querySelectorAll('.now-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.body.classList.toggle('video', nowTab === 'video');
  if (nowTab === 'queue') refreshQueue();
  if (nowTab === 'lyrics') showLyrics();
  if (nowTab === 'video') $('nowBody').innerHTML = '<p class="empty">The video plays above. Switch back to Up next any time – the music keeps going.</p>';
});
function refreshQueue() {
  if (nowTab !== 'queue') return;
  const rest = queue.slice(qi + 1, qi + 40);
  $('nowBody').replaceChildren(rest.length ? trackList(rest, { compact: true, onPlay: (t) => { qi = queue.indexOf(t); load(t); refreshQueue(); } }) : Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Songs you add show up here. When the queue ends, a radio based on your last song keeps playing.' }));
}
async function showLyrics() {
  const t = queue[qi];
  $('nowBody').innerHTML = '<p class="empty">Loading lyrics…</p>';
  if (!t) return;
  try { const l = await lyrics(t.id); if (queue[qi] !== t) return; $('nowBody').innerHTML = l ? `<div class="lyrics">${esc(l)}</div>` : '<p class="empty">No lyrics for this song.</p>'; }
  catch { $('nowBody').innerHTML = '<p class="empty">No lyrics for this song.</p>'; }
}

// ---------------- views ----------------
function trackList(tracks, { compact = false, onPlay } = {}) {
  const box = document.createElement('div'); box.className = 'tracks';
  tracks.forEach((t, i) => {
    const r = document.createElement('div');
    r.className = 'trow'; r.dataset.id = t.id;
    const isLiked = liked.some((l) => l.id === t.id);
    r.innerHTML = compact
      ? `<img src="${esc(t.art)}" alt=""><div><div class="tt">${esc(t.title)}</div><div class="ta">${esc(t.artist)}</div></div><div class="d">${t.duration ? fmt(t.duration) : ''}</div>`
      : `<div class="n">${i + 1}</div><img src="${esc(t.art)}" alt="" loading="lazy"><div><div class="tt">${esc(t.title)}</div><div class="ta">${esc(t.artist)}</div></div><div class="al">${esc(t.album)}</div><button class="lk ${isLiked ? 'on' : ''}" data-id="${esc(t.id)}" title="Like">${isLiked ? '♥' : '♡'}</button><div class="d">${t.duration ? fmt(t.duration) : ''}</div>`;
    r.onclick = (e) => {
      if (e.target.closest('.lk')) { e.stopPropagation(); toggleLike(t); return; }
      onPlay ? onPlay(t, i) : playList(tracks, i);
    };
    r.oncontextmenu = (e) => { e.preventDefault(); addToPlaylistMenu(t); };
    if (queue[qi]?.id === t.id) r.classList.add('playing');
    box.append(r);
  });
  return box;
}
function card(t, list, i) {
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = `<img src="${esc(t.art)}" alt="" loading="lazy"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small><button class="fab" title="Play"><svg viewBox="0 0 24 24">${ICON_PLAY}</svg></button>`;
  c.onclick = () => playList(list, i);
  return c;
}
const mnav = () => `<div class="mnav"><button data-go="home">Home</button><button data-go="search">Search</button><button data-go="liked">Liked</button></div>`;
function wireMnav() { document.querySelectorAll('.mnav button').forEach((b) => b.onclick = () => go(b.dataset.go)); }

async function viewHome() {
  const hour = new Date().getHours();
  const v = $('view');
  v.innerHTML = `${mnav()}<h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>`;
  wireMnav();
  if (history.length || liked.length) {
    const quick = document.createElement('div'); quick.className = 'quick';
    const picks = [...history.slice(0, 4), ...liked.slice(0, 4)].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).slice(0, 6);
    picks.forEach((t, i) => { const q = document.createElement('div'); q.className = 'q'; q.innerHTML = `<img src="${esc(t.art)}" alt=""><span>${esc(t.title)}</span>`; q.onclick = () => playList(picks, i); quick.append(q); });
    v.append(quick);
  }
  if (history.length) { v.insertAdjacentHTML('beforeend', '<h2>Recently played</h2>'); const s = document.createElement('div'); s.className = 'shelf'; history.slice(0, 20).forEach((t, i, a) => s.append(card(t, a, i))); v.append(s); }
  const loading = Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Loading recommendations…' });
  v.append(loading);
  try {
    const sections = await homeFeed();
    loading.remove();
    for (const sec of sections.slice(0, 8)) {
      v.insertAdjacentHTML('beforeend', `<h2>${esc(sec.title)}</h2>`);
      const s = document.createElement('div'); s.className = 'shelf';
      sec.items.slice(0, 24).forEach((t, i, a) => s.append(card(t, a, i)));
      v.append(s);
    }
  } catch (e) {
    loading.className = 'empty err';
    loading.textContent = `Couldn't load recommendations (${e.message}). Search still works – try it.`;
  }
}
let lastQuery = '', searchType = 'song';
function viewSearch() {
  const v = $('view');
  v.innerHTML = `${mnav()}<div class="searchbox"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><input id="q" placeholder="What do you want to listen to?" autocomplete="off"></div>
    <div class="chips"><button data-t="song" class="${searchType === 'song' ? 'on' : ''}">Songs</button><button data-t="video" class="${searchType === 'video' ? 'on' : ''}">Videos</button></div><div id="results"></div>`;
  wireMnav();
  const q = $('q'); q.value = lastQuery; q.focus();
  let t;
  const run = async () => {
    lastQuery = q.value.trim();
    if (!lastQuery) { $('results').innerHTML = '<p class="empty">Search for songs, artists or anime openings.</p>'; return; }
    $('results').innerHTML = '<p class="empty">Searching…</p>';
    try {
      const tracks = await searchSongs(lastQuery, searchType);
      if (q.value.trim() !== lastQuery) return;
      $('results').replaceChildren(tracks.length ? trackList(tracks) : Object.assign(document.createElement('p'), { className: 'empty', textContent: 'No results.' }));
    } catch (e) { $('results').innerHTML = `<p class="empty err">Search failed (${esc(e.message)}).</p>`; }
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 350); };
  document.querySelectorAll('.chips button').forEach((b) => b.onclick = () => { searchType = b.dataset.t; document.querySelectorAll('.chips button').forEach((x) => x.classList.toggle('on', x === b)); run(); });
  run();
}
function viewList(title, kind, tracks, cover) {
  const v = $('view');
  v.innerHTML = `${mnav()}<div class="hero"><span class="cover ${cover}">${cover === 'liked' ? '♥' : cover === 'recent' ? '⟲' : '♫'}</span><div><small>${kind}</small><h1>${esc(title)}</h1><p>${tracks.length} song${tracks.length === 1 ? '' : 's'}</p></div></div>`;
  wireMnav();
  if (tracks.length) {
    const b = document.createElement('button'); b.className = 'bigplay'; b.title = 'Play'; b.innerHTML = `<svg viewBox="0 0 24 24">${ICON_PLAY}</svg>`;
    b.onclick = () => playList(tracks, 0);
    v.append(b, trackList(tracks));
  } else v.insertAdjacentHTML('beforeend', '<p class="empty">Nothing here yet. Tap ♡ on a song to save it (right-click a song to add it to a playlist).</p>');
}

// ---------------- library ----------------
function paintLib() {
  $('likedCount').textContent = `${liked.length} song${liked.length === 1 ? '' : 's'}`;
  $('playlists').replaceChildren(...playlists.map((p) => {
    const b = document.createElement('button'); b.className = 'libitem'; b.dataset.view = 'pl:' + p.id;
    b.innerHTML = `<span class="cover" style="${p.tracks[0] ? `background-image:url('${esc(p.tracks[0].art)}')` : ''}">${p.tracks[0] ? '' : '♫'}</span><span><b>${esc(p.name)}</b><small>Playlist · ${p.tracks.length} songs</small></span>`;
    b.onclick = () => go('pl:' + p.id);
    return b;
  }));
}
$('newPl').onclick = () => {
  const name = prompt('Playlist name', `My playlist #${playlists.length + 1}`);
  if (!name) return;
  playlists.push({ id: Date.now().toString(36), name: name.slice(0, 40), tracks: [] });
  save(); paintLib();
};
function addToPlaylistMenu(t) {
  if (!playlists.length) { toast('Create a playlist first with + in Your library'); return; }
  const names = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  const pick = parseInt(prompt(`Add "${t.title}" to which playlist?\n${names}`, '1'), 10);
  const p = playlists[pick - 1];
  if (!p) return;
  if (!p.tracks.some((x) => x.id === t.id)) p.tracks.push(t);
  save(); paintLib(); toast(`Added to ${p.name}`);
}

// ---------------- routing ----------------
function go(view) {
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  if (view === 'home') viewHome();
  else if (view === 'search') viewSearch();
  else if (view === 'liked') viewList('Liked Songs', 'Playlist', liked, 'liked');
  else if (view === 'recent') viewList('Recently played', 'History', history, 'recent');
  else if (view.startsWith('pl:')) { const p = playlists.find((x) => x.id === view.slice(3)); if (p) viewList(p.name, 'Playlist', p.tracks, ''); }
  $('main').scrollTop = 0;
}
document.querySelectorAll('nav [data-view], .lib > [data-view]').forEach((b) => b.onclick = () => go(b.dataset.view));
paintLib(); paintProgress(); refreshQueue();
go('home');
