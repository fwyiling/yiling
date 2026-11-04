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
  $('site').textContent = host || 'Browser page';
  $('siteOn').checked = !!host && !paused && settings.adBlock;
  $('siteOn').disabled = !host;
  $('status').classList.toggle('off', !!host && (!!paused || !settings.adBlock));
  $('status').classList.toggle('idle', !host);
  $('statusText').textContent = !host ? 'Nothing to protect on this page'
    : paused ? `Protection paused on ${host}`
    : !settings.adBlock ? 'Ad blocking is turned off'
    : `You're protected on ${host}`;

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
let scanned = false;
async function scan() {
  if (scanned) return;
  scanned = true;
  const empty = (msg) => { $('scan').innerHTML = `<p>${msg}</p>`; };
  if (!host) return empty('Open a manga, manhwa or novel chapter, then come back here.');
  const r = await send({ type: 'scan', tabId: tab.id });
  if (!r?.ok) return empty('This page can\'t be read. Try reloading it.');
  const page = r.result;
  const hasImages = page.images.length >= 3;
  const hasText = page.text.length >= 1500;
  if (!hasImages && !hasText) {
    return empty('No chapter found here.<br>If pages load as you scroll, scroll to the end and try again.');
  }
  $('scan').hidden = true;
  $('found').hidden = false;
  $('foundTitle').textContent = page.title;
  const go = (job) => send({ type: 'start-job', job }).then(() => window.close());
  if (hasImages) {
    $('dlImages').hidden = false;
    $('dlImages').textContent = `Download ${page.images.length} pages (.cbz)`;
    $('dlImages').onclick = () => go({ mode: 'images', title: page.title, images: page.images, url: page.url, origin: page.origin });
  }
  if (hasText) {
    const words = page.text.split(/\s+/).length.toLocaleString();
    $('dlEpub').hidden = false; $('dlEpub').textContent = `Save as eBook (.epub) · ${words} words`;
    $('dlEpub').onclick = () => go({ mode: 'text', format: 'epub', title: page.title, text: page.text });
    $('dlTxt').hidden = false; $('dlTxt').textContent = 'Save as plain text (.txt)';
    $('dlTxt').onclick = () => go({ mode: 'text', format: 'txt', title: page.title, text: page.text });
  }
}

showTab(lastTab);
