import { DEFAULTS } from '../lib/defaults.js';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const SWATCHES = ['#fa1e4e', '#ff7a00', '#ffd400', '#2ecc71', '#00c2ff', '#3b82f6', '#8b5cf6', '#ff4fd8'];

let settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
const save = (patch) => { Object.assign(settings, patch); return chrome.storage.sync.set(patch); };
if (new URLSearchParams(location.search).has('tab')) document.body.classList.add('full');

// ---- accent ----
function paintAccent() { document.documentElement.style.setProperty('--accent', settings.accent); }
paintAccent();
const sw = $('swatches');
for (const c of SWATCHES) {
  const b = document.createElement('button');
  b.style.background = c; b.title = c; b.dataset.color = c;
  b.onclick = () => { save({ accent: c }); paintAccent(); markSwatch(); };
  sw.insertBefore(b, sw.lastElementChild);
}
function markSwatch() {
  sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.color === settings.accent));
}
markSwatch();

// ---- tabs ----
const lastTab = localStorage.getItem('tab') || 'protect';
function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('on', s.dataset.panel === name));
  try { localStorage.setItem('tab', name); } catch {}
  if (name === 'save') scan();
}
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ---- switches / inputs ----
document.querySelectorAll('[data-key]').forEach((el) => {
  const key = el.dataset.key;
  if (el.type === 'checkbox') el.checked = !!settings[key];
  else el.value = settings[key] ?? '';
  el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
    save({ [key]: el.type === 'checkbox' ? el.checked : el.value });
    if (key === 'accent') { paintAccent(); markSwatch(); }
  });
});

// ---- segmented controls ----
document.querySelectorAll('[data-seg]').forEach((seg) => {
  const key = seg.dataset.seg;
  const mark = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.value) === Number(settings[key])));
  seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { save({ [key]: Number(b.value) }); mark(); }));
  mark();
});

// ---- current site ----
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = '';
try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, ''); } catch {}

function paintSite() {
  const paused = host && (settings.allowlist || []).includes(host);
  $('site').textContent = host || 'Protection everywhere';
  $('siteOn').checked = host ? !paused && settings.adBlock : settings.adBlock;
  $('siteOn').title = host ? `Protection on ${host}` : 'Protection on every site';
  const off = host ? !!paused || !settings.adBlock : !settings.adBlock;
  $('status').classList.toggle('off', off);
  $('statusText').textContent = !settings.adBlock ? 'Ad blocking is off everywhere'
    : paused ? `Paused on ${host} – tap the switch to turn it back on`
    : host ? `Protected on ${host}`
    : 'On – every site is checked before it loads';

  const list = settings.allowlist || [];
  $('pausedWrap').hidden = !list.length;
  $('paused').replaceChildren(...list.map((h) => {
    const b = document.createElement('button');
    b.textContent = h; b.title = 'Resume protection';
    b.onclick = async () => { await send({ type: 'set-paused', host: h, paused: false }); settings.allowlist = list.filter((x) => x !== h); paintSite(); };
    return b;
  }));
}
$('siteOn').onchange = async () => {
  if (!host) { await save({ adBlock: $('siteOn').checked }); paintSite(); return; }
  const paused = !$('siteOn').checked;
  if (!paused && !settings.adBlock) await save({ adBlock: true });
  await send({ type: 'set-paused', host, paused });
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  paintSite();
  chrome.tabs.reload(tab.id);
};
paintSite();

// malware list size
const { malwareDomains = [] } = await chrome.storage.local.get('malwareDomains');
if (malwareDomains.length) $('mal').textContent = `Stops ${malwareDomains.length.toLocaleString()} known malware & scam domains.`;

$('customizeHome').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html#customize') });

// ---- custom CSS ----
if (host) {
  $('host').textContent = host;
  $('css').value = (settings.siteCss || {})[host] || '';
  $('saveCss').onclick = async () => {
    const siteCss = { ...(settings.siteCss || {}) };
    if ($('css').value.trim()) siteCss[host] = $('css').value; else delete siteCss[host];
    await save({ siteCss });
    $('saveCss').textContent = 'Saved ✓';
    setTimeout(() => ($('saveCss').textContent = 'Save CSS'), 1500);
  };
} else $('saveCss').disabled = true;

// ---- save (downloader) ----
$('mdLangs').value = (settings.mdLangs || DEFAULTS.mdLangs).join(',');
$('mdLangs').onchange = () => save({ mdLangs: $('mdLangs').value.split(',') });

let scanned = false;
async function scan() {
  if (scanned) return;
  scanned = true;
  const empty = (msg) => { $('scan').innerHTML = `<p>${msg}</p>`; };
  if (!host) return empty('Open a manga, manhwa or novel chapter (or a MangaDex title page), then come back here.');
  const r = await send({ type: 'scan', tabId: tab.id });
  if (!r?.ok) return empty(r?.error ? `Couldn't read this page: ${r.error}` : 'This page can\'t be read. Try reloading it.');
  const page = r.result;
  const md = page.source === 'mangadex';
  const kind = md || page.images.length >= 3 ? 'images' : page.text.length >= 1500 ? 'text' : null;
  if (!kind) return empty('No chapter found here.<br>If pages load as you scroll, scroll to the end and try again.');

  $('scan').hidden = true;
  $('found').hidden = false;
  $('foundTitle').textContent = page.series || page.title;
  const n = page.chapters.length;
  $('foundSub').textContent = md
    ? `MangaDex · ${n} chapter${n === 1 ? '' : 's'} in ${({ en: 'English', zh: 'Chinese (Simplified)', 'zh-hk': 'Chinese (Traditional)' })[page.lang] || page.lang}`
    : n > 1 ? `${n} chapters found` : kind === 'images' ? `${page.images.length} pages on this page` : 'Novel chapter';

  const add = (label, preset, ghost) => {
    const b = document.createElement('button');
    b.className = 'btn' + (ghost ? ' ghost' : '');
    b.textContent = label;
    b.onclick = () => send({ type: 'download', page, kind, preset }).then(() => window.close());
    $('dlButtons').append(b);
  };
  if (n > 1) add(`Download whole series (${n} chapters)`, 'all');
  if (!md || page.currentIndex >= 0) add('Download this chapter', 'current', n > 1);
  if (!n && md) $('foundSub').textContent += ' – try another language on the next screen';
  if (!n && md) add('Choose language & chapters', 'all');
}

showTab(lastTab);
