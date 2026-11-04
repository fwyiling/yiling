import { DEFAULTS } from '../lib/defaults.js';

const $ = (id) => document.getElementById(id);

// ---- settings ----
const settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
document.querySelectorAll('[data-key]').forEach((el) => {
  const key = el.dataset.key;
  if (el.type === 'checkbox') el.checked = !!settings[key];
  else el.value = String(settings[key]);
  el.addEventListener('change', () => {
    const value = el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value) : el.value;
    chrome.storage.sync.set({ [key]: value });
  });
});

const { malwareDomains = [], malwareUpdated } = await chrome.storage.local.get(['malwareDomains', 'malwareUpdated']);
$('mal').textContent = malwareDomains.length
  ? `(${malwareDomains.length.toLocaleString()} domains)`
  : malwareUpdated ? '' : '(list not loaded yet)';

// ---- per-site CSS ----
{
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(t.url).hostname; } catch {}
  if (host) {
    $('host').textContent = host;
    $('css').value = (settings.siteCss || {})[host] || '';
    $('saveCss').onclick = async () => {
      const { siteCss = {} } = await chrome.storage.sync.get('siteCss');
      if ($('css').value.trim()) siteCss[host] = $('css').value; else delete siteCss[host];
      await chrome.storage.sync.set({ siteCss });
      $('saveCss').textContent = 'Saved ✓';
    };
  } else $('saveCss').disabled = true;
}

// ---- page scan ----
let page = null;
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https?:/.test(tab.url || '')) throw new Error('This page can\'t be scanned.');
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/scanner.js'] });
  page = result;
} catch (e) {
  $('scan').textContent = e.message;
}

async function startJob(job) {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [`job_${id}`]: job });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`downloader/downloader.html?job=${id}`) });
  window.close();
}

if (page) {
  const hasImages = page.images.length >= 3;
  const hasText = page.text.length >= 1500;
  $('scan').textContent = hasImages || hasText
    ? `${page.title}`
    : 'No chapter images or novel text found. If it\'s a reader with lazy-loading, scroll through the chapter first, then reopen this popup.';

  if (hasImages) {
    const b = $('dlImages');
    b.hidden = false;
    b.textContent = `Download ${page.images.length} pages (.cbz)`;
    b.onclick = () => startJob({ mode: 'images', title: page.title, images: page.images, url: page.url, origin: page.origin });
  }
  if (hasText) {
    const words = page.text.split(/\s+/).length.toLocaleString();
    for (const [id, fmt] of [['dlEpub', 'epub'], ['dlTxt', 'txt']]) {
      const b = $(id);
      b.hidden = false;
      b.textContent = `Save text (${words} words) as .${fmt}`;
      b.onclick = () => startJob({ mode: 'text', format: fmt, title: page.title, text: page.text });
    }
  }
}
