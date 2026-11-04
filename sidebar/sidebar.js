// Opera GX-style sidebar apps in Chrome's side panel.
const $ = (id) => document.getElementById(id);
export const DEFAULT_APPS = [
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/' },
  { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com/' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/a/' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/' },
];
const fav = (url) => url.startsWith('chrome-extension://') ? chrome.runtime.getURL('icons/icon32.png') : `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;

let { sidebarApps, accent } = await chrome.storage.sync.get(['sidebarApps', 'accent']);
let apps = (sidebarApps || DEFAULT_APPS).filter((a) => a.id !== 'music' && !a.url.includes('/music/music.html'));
if (accent) document.documentElement.style.setProperty('--a', accent);
let { lastSidebarApp } = await chrome.storage.local.get('lastSidebarApp');
const frames = new Map();

// ---- zoom: desktop sites (Discord, WhatsApp…) need ~1000px; shrink them so they fit the panel ----
const MIN_WIDTH = { discord: 720, whatsapp: 760, telegram: 620, chatgpt: 560, claude: 560, spotify: 760, ytmusic: 760, twitch: 760 }; // widths where each site's own layout still works
let { sidebarZoom = {} } = await chrome.storage.local.get('sidebarZoom'); // per app: 'fit' or a number
const zoomOf = (id) => sidebarZoom[id] ?? 'fit';
function fitScale(id) {
  const w = $('frames').clientWidth || 360;
  return Math.max(0.55, Math.min(1, w / (MIN_WIDTH[id] || 760)));
}
function applyZoom(id) {
  const f = frames.get(id);
  if (!f) return;
  const z = zoomOf(id), s = z === 'fit' ? fitScale(id) : z;
  f.style.transform = s === 1 ? '' : `scale(${s})`;
  f.style.width = `${100 / s}%`;
  f.style.height = `${100 / s}%`;
  if (id === lastSidebarApp) {
    $('zoomBox').hidden = false;
    $('zoomFit').classList.toggle('on', z === 'fit');
    $('zoomFit').textContent = z === 'fit' ? `Fit ${Math.round(s * 100)}%` : `${Math.round(s * 100)}%`;
  }
}
function setZoom(id, z) { sidebarZoom[id] = z; chrome.storage.local.set({ sidebarZoom }); applyZoom(id); }
const curScale = (id) => { const z = zoomOf(id); return z === 'fit' ? fitScale(id) : z; };
new ResizeObserver(() => { for (const id of frames.keys()) applyZoom(id); }).observe(document.getElementById('frames'));

function renderRail() {
  const rail = $('rail');
  rail.replaceChildren();
  for (const app of apps) {
    const b = document.createElement('button');
    b.title = app.name; b.dataset.id = app.id;
    const img = new Image(); img.src = fav(app.url); img.alt = '';
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'ltr', textContent: app.name[0] }));
    const x = Object.assign(document.createElement('span'), { className: 'x', textContent: '✕', title: 'Remove' });
    x.onclick = async (e) => { e.stopPropagation(); apps = apps.filter((a) => a.id !== app.id); await chrome.storage.sync.set({ sidebarApps: apps.filter((a) => !a.temp) }); frames.get(app.id)?.remove(); frames.delete(app.id); renderRail(); };
    b.append(img, x);
    b.onclick = () => openApp(app.id);
    rail.append(b);
  }
  rail.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  const add = Object.assign(document.createElement('button'), { className: 'add', textContent: '+', title: 'Add an app' });
  add.onclick = () => $('addDlg').showModal();
  rail.append(add);
  markRail();
}
function markRail() { document.querySelectorAll('#rail button[data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === lastSidebarApp)); }

async function openApp(id) {
  const app = apps.find((a) => a.id === id);
  if (!app) return;
  lastSidebarApp = id;
  chrome.storage.local.set({ lastSidebarApp: id });
  $('welcome').hidden = true;
  $('appName').textContent = app.name;
  await chrome.runtime.sendMessage({ type: 'sidebar-allow', url: app.url }).catch(() => {});
  if (!frames.has(id)) {                    // frames stay alive in the background: chats stay connected, music keeps playing
    const f = document.createElement('iframe');
    f.src = app.url;
    f.allow = 'autoplay; encrypted-media; clipboard-read; clipboard-write; microphone; camera; fullscreen; display-capture; picture-in-picture';
    $('frames').append(f);
    frames.set(id, f);
  }
  for (const [k, f] of frames) f.classList.toggle('on', k === id);
  applyZoom(id);
  markRail();
}

$('zoomOut').onclick = () => setZoom(lastSidebarApp, Math.max(0.4, Math.round((curScale(lastSidebarApp) - 0.1) * 10) / 10));
$('zoomIn').onclick = () => setZoom(lastSidebarApp, Math.min(1.5, Math.round((curScale(lastSidebarApp) + 0.1) * 10) / 10));
$('zoomFit').onclick = () => setZoom(lastSidebarApp, 'fit');
$('float').onclick = () => { const app = apps.find((a) => a.id === lastSidebarApp); if (app) chrome.runtime.sendMessage({ type: 'float-app', url: app.url, width: 520, height: 820 }); };
$('reload').onclick = () => { const f = frames.get(lastSidebarApp); if (f) f.src = f.src; };
$('popout').onclick = () => { const app = apps.find((a) => a.id === lastSidebarApp); if (app) chrome.tabs.create({ url: app.url }); };
$('addForm').onsubmit = async (e) => {
  if (e.submitter?.value !== 'ok') return;
  let url = $('addUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const app = { id: 'c' + Date.now().toString(36), name: $('addName').value.trim(), url };
  apps = [...apps, app];
  await chrome.storage.sync.set({ sidebarApps: apps.filter((a) => !a.temp) });
  $('addName').value = $('addUrl').value = '';
  renderRail(); openApp(app.id);
};

// right-click → "Open link in sidebar": a temporary app at the top of the rail
async function peek(url) {
  if (!url) return;
  apps = apps.filter((a) => a.id !== 'peek');
  apps.unshift({ id: 'peek', name: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } })(), url, temp: true });
  frames.get('peek')?.remove(); frames.delete('peek');
  renderRail(); openApp('peek');
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.sidebarPeek?.newValue) peek(c.sidebarPeek.newValue.url); });
const { sidebarPeek } = await chrome.storage.local.get('sidebarPeek');
renderRail();
if (sidebarPeek && Date.now() - sidebarPeek.t < 15000) peek(sidebarPeek.url);
else if (lastSidebarApp && apps.some((a) => a.id === lastSidebarApp)) openApp(lastSidebarApp);
