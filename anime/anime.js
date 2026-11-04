// Syndicates anime hub: discover, airing schedule, your list, official places to watch (AniList data).
import { trending, seasonal, search, details, schedule, byIds, titleOf, currentSeason } from '../lib/anilist.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { accent } = await chrome.storage.sync.get('accent');
if (accent) document.documentElement.style.setProperty('--a', accent);
let { animeList = [] } = await chrome.storage.local.get('animeList');
const saveList = () => chrome.storage.local.set({ animeList });
const inList = (id) => animeList.some((a) => a.id === id);
const toEntry = (m) => ({ id: m.id, title: titleOf(m), cover: m.coverImage?.large || '', episodes: m.episodes || null, next: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt } : null });
const until = (sec) => { const d = sec - Date.now() / 1000; if (d <= 0) return 'out now'; const h = Math.floor(d / 3600); return h >= 24 ? `in ${Math.floor(h / 24)}d ${h % 24}h` : h ? `in ${h}h ${Math.floor((d % 3600) / 60)}m` : `in ${Math.max(1, Math.floor(d / 60))}m`; };

function card(m) {
  const c = document.createElement('div'); c.className = 'card';
  const next = m.nextAiringEpisode;
  c.innerHTML = `<div class="img">${m.averageScore ? `<span class="score">★ ${(m.averageScore / 10).toFixed(1)}</span>` : ''}${inList(m.id) ? '<span class="in-list">✓</span>' : ''}${next ? `<span class="next">Ep ${next.episode} · ${until(next.airingAt)}</span>` : ''}</div><b></b><span></span>`;
  c.querySelector('.img').style.backgroundImage = `url("${m.coverImage?.extraLarge || m.coverImage?.large || ''}")`;
  c.querySelector('b').textContent = titleOf(m);
  c.querySelector('span:last-child').textContent = [m.format?.replace('_', ' '), m.seasonYear, m.episodes ? `${m.episodes} eps` : ''].filter(Boolean).join(' · ');
  c.onclick = () => openSheet(m.id);
  return c;
}
const grid = (items) => { const g = document.createElement('div'); g.className = 'row'; g.append(...items.map(card)); return g; };
const loading = (msg = 'Loading…') => { $('view').innerHTML = `<p class="empty">${msg}</p>`; };
const fail = (e) => { $('view').innerHTML = `<p class="empty">${esc(e.message)}</p>`; };

async function viewDiscover() {
  loading();
  try {
    const [tr, se] = await Promise.all([trending(), seasonal()]);
    const v = $('view'); v.replaceChildren();
    const top = tr.find((m) => m.bannerImage) || tr[0];
    if (top) {
      const h = document.createElement('div'); h.className = 'hero';
      h.style.backgroundImage = `url("${top.bannerImage || top.coverImage?.extraLarge}")`;
      h.innerHTML = `<div class="in"><small>#1 trending</small><h1></h1><p></p></div>`;
      h.querySelector('h1').textContent = titleOf(top);
      h.querySelector('p').textContent = [top.genres?.slice(0, 3).join(' · '), top.averageScore ? `★ ${(top.averageScore / 10).toFixed(1)}` : ''].filter(Boolean).join('   ');
      h.onclick = () => openSheet(top.id);
      v.append(h);
    }
    const { season, year } = currentSeason();
    v.insertAdjacentHTML('beforeend', '<h2>Trending now</h2>'); v.append(grid(tr.slice(0, 18)));
    v.insertAdjacentHTML('beforeend', `<h2>${season[0] + season.slice(1).toLowerCase()} ${year}</h2>`); v.append(grid(se));
  } catch (e) { fail(e); }
}

let day = 0;
async function viewSchedule() {
  const v = $('view');
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + day);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }); });
  v.innerHTML = `<div class="days">${days.map((d, i) => `<button data-d="${i}" class="${i === day ? 'on' : ''}">${d}</button>`).join('')}</div><div id="slots"><p class="empty">Loading the schedule…</p></div>`;
  v.querySelectorAll('.days button').forEach((b) => b.onclick = () => { day = +b.dataset.d; viewSchedule(); });
  try {
    const items = await schedule(Math.floor(start / 1000), Math.floor(start / 1000) + 86400);
    const mine = items.filter((x) => inList(x.media.id)), rest = items.filter((x) => !inList(x.media.id));
    const box = $('slots'); box.replaceChildren();
    if (!items.length) box.innerHTML = '<p class="empty">Nothing airing.</p>';
    for (const x of [...mine, ...rest]) {
      const r = document.createElement('div'); r.className = 'slot';
      r.innerHTML = `<div class="tm"></div><img alt=""><div><b></b><div class="ep"></div></div><div class="mine">${inList(x.media.id) ? 'ON YOUR LIST' : ''}</div>`;
      r.querySelector('.tm').textContent = new Date(x.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      r.querySelector('img').src = x.media.coverImage?.large || '';
      r.querySelector('b').textContent = titleOf(x.media);
      r.querySelector('.ep').textContent = `Episode ${x.episode}${x.media.episodes ? ` of ${x.media.episodes}` : ''} · ${until(x.airingAt)}`;
      r.onclick = () => openSheet(x.media.id);
      box.append(r);
    }
  } catch (e) { $('slots').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

async function viewList() {
  const v = $('view');
  if (!animeList.length) { v.innerHTML = '<p class="empty">Your list is empty – open any anime and press “Add to my list”.</p>'; return; }
  v.innerHTML = '<h2>Watching</h2>';
  try { // refresh next-episode times
    const fresh = await byIds(animeList.map((a) => a.id));
    for (const m of fresh) { const e = animeList.find((a) => a.id === m.id); if (e) Object.assign(e, { ...toEntry(m), progress: e.progress || 0 }); }
    saveList();
    const order = (m) => m.nextAiringEpisode ? m.nextAiringEpisode.airingAt : 9e12;
    v.append(grid(fresh.sort((a, b) => order(a) - order(b))));
  } catch {
    v.append(grid(animeList.map((a) => ({ id: a.id, title: { english: a.title }, coverImage: { large: a.cover }, episodes: a.episodes }))));
  }
}

async function openSheet(id) {
  $('drawer').hidden = false;
  const sh = $('sheet');
  sh.innerHTML = '<p class="empty" style="padding:30px">Loading…</p>';
  history.replaceState(null, '', `#${id}`);
  try {
    const m = await details(id);
    const entry = () => animeList.find((a) => a.id === id);
    const streams = (m.externalLinks || []).filter((l) => l.type === 'STREAMING');
    sh.innerHTML = `<button class="close" title="Close">✕</button><div class="banner"></div><div class="sh-body">
      <div class="sh-head"><img alt=""><div><h1></h1><div class="chips"></div></div></div>
      <div class="actions"><button class="pri" id="listBtn"></button><span class="prog" id="prog" hidden><button id="pm">−</button><span id="pv"></span><button id="pp">+</button></span>
        ${m.trailer?.site === 'youtube' ? '<button id="trailer">▶ Trailer</button>' : ''}<button id="al">AniList ↗</button></div>
      ${streams.length ? `<h2>Where to watch</h2><div class="watch"></div>` : '<p class="empty">No official streaming links listed yet.</p>'}
      <h2>About</h2><div class="desc"></div></div>`;
    sh.querySelector('.banner').style.backgroundImage = `url("${m.bannerImage || m.coverImage?.extraLarge}")`;
    sh.querySelector('.sh-head img').src = m.coverImage?.extraLarge || m.coverImage?.large;
    sh.querySelector('h1').textContent = titleOf(m);
    sh.querySelector('.chips').innerHTML = [m.format, m.status?.replace(/_/g, ' ').toLowerCase(), m.episodes && `${m.episodes} episodes`, m.averageScore && `★ ${(m.averageScore / 10).toFixed(1)}`,
      m.studios?.nodes?.[0]?.name, ...(m.genres || []).slice(0, 4), m.nextAiringEpisode && `Ep ${m.nextAiringEpisode.episode} ${until(m.nextAiringEpisode.airingAt)}`].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    sh.querySelector('.desc').textContent = (m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const w = sh.querySelector('.watch');
    if (w) for (const l of streams) { const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = `<i style="background:${esc(l.color || '#888')}"></i>`; a.append(l.site); w.append(a); }
    const paint = () => {
      const e = entry();
      $('listBtn').textContent = e ? '✓ On my list' : '+ Add to my list';
      $('prog').hidden = !e;
      if (e) $('pv').textContent = `Ep ${e.progress || 0}${m.episodes ? ` / ${m.episodes}` : ''}`;
    };
    $('listBtn').onclick = () => { if (entry()) animeList = animeList.filter((a) => a.id !== id); else animeList.push({ ...toEntry(m), progress: 0 }); saveList(); paint(); };
    $('pm').onclick = () => { const e = entry(); e.progress = Math.max(0, (e.progress || 0) - 1); saveList(); paint(); };
    $('pp').onclick = () => { const e = entry(); e.progress = Math.min(m.episodes || 9999, (e.progress || 0) + 1); saveList(); paint(); };
    if ($('trailer')) $('trailer').onclick = () => chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${m.trailer.id}` });
    $('al').onclick = () => chrome.tabs.create({ url: `https://anilist.co/anime/${id}` });
    paint();
  } catch (e) { sh.innerHTML = `<button class="close">✕</button><p class="empty" style="padding:30px">${esc(e.message)}</p>`; }
  sh.querySelector('.close').onclick = closeSheet;
}
function closeSheet() { $('drawer').hidden = true; history.replaceState(null, '', location.pathname); }
document.querySelector('.scrim').onclick = closeSheet;
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

let tab = 'discover';
function go(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  ({ discover: viewDiscover, schedule: viewSchedule, list: viewList })[t]();
}
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => go(b.dataset.tab));
let qt;
$('q').oninput = () => {
  clearTimeout(qt);
  qt = setTimeout(async () => {
    const q = $('q').value.trim();
    if (!q) return go(tab);
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('on'));
    loading('Searching…');
    try { const r = await search(q); $('view').replaceChildren(Object.assign(document.createElement('h2'), { textContent: `Results for “${q}”` }), grid(r)); } catch (e) { fail(e); }
  }, 400);
};
go('discover');
if (/^#\d+$/.test(location.hash)) openSheet(+location.hash.slice(1));
