import { DEFAULTS } from '../lib/defaults.js';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;
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

$('reskinChrome').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('setup/theme.html') });
$('customizeHome').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html#customize') });

chrome.storage.local.get('cookieStats').then(({ cookieStats }) => {
  if (cookieStats) $('cookieInfo').textContent = `Clicks "Reject all" on cookie banners for you – ${cookieStats.toLocaleString()} rejected so far.`;
});

// protection summary
chrome.storage.local.get(['popupStats', 'cookieStats', 'cleanStats', 'learned']).then((v) => {
  const n = (x) => (x || 0).toLocaleString();
  $('stPop').textContent = n(v.popupStats); $('stCookie').textContent = n(v.cookieStats);
  $('stTrack').textContent = n(v.learned?.blocked?.length); $('stClean').textContent = n(v.cleanStats);
});
// sidebar
// what a new tab opens (read by newtab/redirect.js before the page renders)
{
  const cur = (() => { try { return localStorage.getItem('scStartPage') || 'google'; } catch { return 'google'; } })();
  document.querySelectorAll('#startSeg button').forEach((b) => {
    b.classList.toggle('on', b.value === cur);
    b.onclick = () => { try { localStorage.setItem('scStartPage', b.value); } catch {} document.querySelectorAll('#startSeg button').forEach((x) => x.classList.toggle('on', x === b)); };
  });
}
$('openLibrary').onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') }); window.close(); };
$('openSidebar').onclick = async () => { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); window.close(); };
// learned trackers
send({ type: 'learn-stats' }).then((r) => { if (r?.ok && r.result.blocked) $('learnInfo').textContent = `Blocks companies that follow you across 3+ sites – ${r.result.blocked} learned so far.`; });
$('learnReset').onclick = async () => { await send({ type: 'learn-reset' }); $('learnReset').textContent = 'Reset ✓'; $('learnInfo').textContent = 'Blocks companies that follow you across 3+ sites.'; };
// keep logins for this site when auto-clean is on
{
  const siteOf = (h) => { const p = h.split('.'); return p.slice(p.length > 2 && p[p.length - 1].length === 2 && ['co', 'com', 'net', 'org'].includes(p[p.length - 2]) ? -3 : -2).join('.'); };
  const site = host && siteOf(host);
  const paint = () => {
    const kept = (settings.keepSites || []).includes(site);
    $('keepSite').hidden = !site || !settings.autoClean;
    $('keepSite').textContent = kept ? `✓ Keeping ${site}` : `Keep ${site}'s logins`;
  };
  $('keepSite').onclick = async () => {
    const kept = (settings.keepSites || []).includes(site);
    await send({ type: 'keep-site', site, keep: !kept });
    settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) }; paint();
  };
  document.querySelector('[data-key="autoClean"]').addEventListener('change', () => setTimeout(async () => { settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) }; paint(); }, 600));
  paint();
}

// hotkeys: click a keycap, then press the new key (Esc cancels, Backspace turns it off)
document.querySelectorAll('[data-hot]').forEach((btn) => {
  const key = btn.dataset.hot;
  const show = () => { btn.textContent = settings[key] || 'off'; };
  show();
  btn.onclick = () => {
    btn.classList.add('listening'); btn.textContent = 'press a key…';
    const onKey = async (e) => {
      e.preventDefault(); e.stopPropagation();
      removeEventListener('keydown', onKey, true);
      btn.classList.remove('listening');
      if (e.key !== 'Escape') await save({ [key]: e.key === 'Backspace' ? '' : e.key.length === 1 ? e.key : settings[key] });
      show();
    };
    addEventListener('keydown', onKey, true);
  };
});

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

// MangaDex connection test
if (/(^|\.)mangadex\.org$/.test(host)) {
  $('mdDiag').hidden = false;
  $('mdTest').onclick = () => runMdTest();
}
async function runMdTest() {
  {
    $('mdTest').disabled = true; $('mdTest').textContent = 'Testing… (takes a few seconds)';
    const r = await send({ type: 'md-diagnose', tabId: tab.id });
    const steps = r?.ok ? r.result : [{ name: 'Run test', ok: false, detail: r?.error || 'no response from extension – reload it in chrome://extensions' }];
    $('mdSteps').replaceChildren(...steps.map((st) => {
      const li = document.createElement('li'); li.className = st.ok ? 'ok' : 'bad';
      li.append(Object.assign(document.createElement('i'), { textContent: st.ok ? '✓' : '✕' }), Object.assign(document.createElement('b'), { textContent: st.name }), Object.assign(document.createElement('small'), { textContent: st.detail }));
      return li;
    }));
    $('mdTest').disabled = false; $('mdTest').textContent = 'Test again';
    $('mdCopy').hidden = false;
    $('mdCopy').onclick = () => navigator.clipboard.writeText(`Syndicates Client v${chrome.runtime.getManifest().version} MangaDex test\n` + tab.url + '\n' + steps.map((st) => `${st.ok ? 'OK ' : 'FAIL'} ${st.name}: ${st.detail} (${st.ms ?? 0}ms)`).join('\n')).then(() => ($('mdCopy').textContent = 'Copied ✓'));
  }
}

let scanned = false;
async function scan() {
  if (scanned) return;
  scanned = true;
  const empty = (msg) => { $('scan').innerHTML = `<p>${msg}</p>`; };
  if (!host) return empty('Open a manga, manhwa or novel chapter (or a MangaDex title page), then come back here.');
  const r = await send({ type: 'scan', tabId: tab.id });
  if (!r?.ok) {
    empty(r?.error ? `Couldn't read this page: ${r.error}` : 'This page can\'t be read. Try reloading it.');
    if (/(^|\.)mangadex\.org$/.test(host)) { $('scan').insertAdjacentHTML('beforeend', '<p>Running a connection test below – please screenshot it.</p>'); runMdTest(); }
    return;
  }
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
  if (md) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    const { mdLibrary = [] } = await chrome.storage.local.get('mdLibrary');
    const inList = mdLibrary.some((x) => x.id === page.mangaId);
    b.textContent = inList ? '✓ In your download list – open library' : '♥ Add to download list';
    b.onclick = async () => {
      const { mdLibrary: lib = [] } = await chrome.storage.local.get('mdLibrary');
      if (!lib.some((x) => x.id === page.mangaId)) {
        lib.push({ id: page.mangaId, series: page.series, lang: page.lang, langs: page.langs || [page.lang], cover: '', url: `https://mangadex.org/title/${page.mangaId}`, lastNum: 0, addedAt: Date.now() });
        await chrome.storage.local.set({ mdLibrary: lib });
        b.textContent = '✓ Added – open library';
      } else chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html') });
    };
    $('dlButtons').append(b);
  }
  if (!md || page.currentIndex >= 0) add('Download this chapter', 'current', n > 1);
  if (!n && md) $('foundSub').textContent += ' – try another language on the next screen';
  if (!n && md) add('Choose language & chapters', 'all');
}

showTab(lastTab);
