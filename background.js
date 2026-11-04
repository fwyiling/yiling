// Syndicates Client – service worker
import { DEFAULTS } from './lib/defaults.js';
import { scanDocument } from './lib/extract.js';
import { filterCompactRules, evalSnippets } from './lib/vendor/autoconsent.esm.js';
import { HIANIME_HOST, API_HOSTS, PLAYER_HOSTS, capturable } from './lib/hianime.js';
import { BOOK_HOSTS } from './lib/gutendex.js';
import { parseMangaDexUrl, mangaDexInfo, mangaDexChapters, useMangaDexTab, mangaDexDiagnose } from './lib/mangadex.js';


const MALWARE_FEED = 'https://urlhaus.abuse.ch/downloads/hostfile/';
const RISKY_EXT = [
  'exe', 'msi', 'scr', 'bat', 'cmd', 'com', 'pif', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'hta', 'jar', 'lnk', 'reg', 'dll', 'apk', 'dmg', 'pkg', 'sh', 'iso', 'cpl', 'msc',
];
const REFERRER_RULE_ID = 100000;
const ALLOW_RULE_ID = 100001;
// YouTube's own playback/telemetry endpoints: blocking them can stall the player.
const YT_ALLOW_IDS = [100003, 100004];
const ALLOW_PRIORITY = 2 ** 30;      // beats every ad rule
const MALWARE_PRIORITY = 2 ** 30 + 1; // ...but malware is blocked even on paused sites

// Settings are cached in memory: cookie/download events fire constantly and
// re-reading storage each time made browsing feel slow.
let settingsCache = null;
async function getSettings() {
  if (!settingsCache) settingsCache = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  return settingsCache;
}

let trackerDomains = null;
async function loadTrackerDomains() {
  if (!trackerDomains) {
    const res = await fetch(chrome.runtime.getURL('rules/domains.json'));
    trackerDomains = new Set(await res.json());
  }
  return trackerDomains;
}

// Big EasyList/EasyPrivacy rulesets only fit if Chrome's shared static-rule pool has room,
// so enable them one at a time and fall back to the small built-in list on failure.
async function setAdRulesets(on) {
  const dnr = chrome.declarativeNetRequest;
  if (!on) {
    await dnr.updateEnabledRulesets({ disableRulesetIds: ['ads', 'easylist', 'easyprivacy'] });
    return;
  }
  await dnr.updateEnabledRulesets({ enableRulesetIds: ['ads'] });
  for (const id of ['easylist', 'easyprivacy']) {
    try {
      await dnr.updateEnabledRulesets({ enableRulesetIds: [id] });
    } catch (e) {
      console.warn(`ruleset ${id} not enabled (rule budget?)`, e.message);
    }
  }
}

const PRIVACY_KEYS = ['blockTpCookies', 'webrtc'];
/** Apply settings. With `changed`, only the parts affected by those keys are touched. */
async function apply(changed) {
  const s = await getSettings();
  const has = (...k) => !changed || k.some((x) => changed.includes(x));

  if (has('adBlock')) await setAdRulesets(s.adBlock);

  if (has('allowlist')) {
    // Sites the user paused: let everything through on those pages.
    // (100000 was an old Referrer-Policy rule – Chrome already defaults to that policy, so it was removed.)
    const allow = (s.allowlist || []).filter(Boolean);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [REFERRER_RULE_ID, ALLOW_RULE_ID],
      addRules: allow.length ? [{
        id: ALLOW_RULE_ID, priority: ALLOW_PRIORITY,
        action: { type: 'allowAllRequests' },
        condition: { requestDomains: allow, resourceTypes: ['main_frame', 'sub_frame'] },
      }] : [],
    });
  }

  if (!changed) {
    chrome.declarativeNetRequest.setExtensionActionOptions?.({ displayActionCountAsBadgeText: true });
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: YT_ALLOW_IDS,
      addRules: [
        { id: YT_ALLOW_IDS[0], priority: ALLOW_PRIORITY - 1, action: { type: 'allow' },
          condition: { requestDomains: ['googlevideo.com', 'ytimg.com', 'youtube-nocookie.com'] } },
        { id: YT_ALLOW_IDS[1], priority: ALLOW_PRIORITY - 1, action: { type: 'allow' },
          condition: { regexFilter: '^https://(www|m|music)\\.youtube\\.com/(youtubei/|generate_204|api/stats/(qoe|watchtime|playback))' } },
      ],
    });
  }
  if (has('accent')) chrome.action.setBadgeBackgroundColor({ color: s.accent || '#fa1e4e' });

  if (has(...PRIVACY_KEYS)) {
    try {
      await chrome.privacy.websites.thirdPartyCookiesAllowed.set({ value: !s.blockTpCookies });
      await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: s.webrtc ? 'disable_non_proxied_udp' : 'default' });
    } catch (e) {
      console.warn('privacy API', e);
    }
  }

  if (has('malware')) await applyMalwareRules(s.malware);
  if (has('learnTrackers')) await applyLearnedRule();
  if (has('forceDark')) await syncDarkScript(!!s.forceDark);
  if (changed && changed.includes('autoClean') && s.autoClean && !(s.keepSites || []).length) await seedKeepList();
}

// ---- malware blocklist -> dynamic rules (many domains per rule) ----
async function applyMalwareRules(enabled) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const old = existing.filter((r) => r.id < REFERRER_RULE_ID).map((r) => r.id);
  if (!enabled) {
    if (old.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old });
    return;
  }
  const { malwareDomains = [] } = await chrome.storage.local.get('malwareDomains');
  if (!malwareDomains.length) return;
  const addRules = [];
  for (let i = 0, n = 0; i < malwareDomains.length; i += 1000, n++) {
    const requestDomains = malwareDomains.slice(i, i + 1000);
    // page visits -> friendly warning page; everything else -> silently blocked
    addRules.push({
      id: n * 2 + 1, priority: MALWARE_PRIORITY,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked/blocked.html' } },
      condition: { requestDomains, resourceTypes: ['main_frame'] },
    }, {
      id: n * 2 + 2, priority: MALWARE_PRIORITY,
      action: { type: 'block' },
      condition: { requestDomains, resourceTypes: ['sub_frame', 'script', 'xmlhttprequest', 'media', 'image', 'object', 'other'] },
    });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old, addRules });
}

async function updateMalwareList() {
  try {
    const res = await fetch(MALWARE_FEED);
    if (!res.ok) throw new Error(res.status);
    const domains = (await res.text())
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/)[1])
      .filter((d) => d && d !== 'localhost' && /^[a-z0-9.-]+$/i.test(d));
    const unique = [...new Set(domains)].slice(0, 25000);
    await chrome.storage.local.set({ malwareDomains: unique, malwareUpdated: Date.now() });
    await applyMalwareRules((await getSettings()).malware);
  } catch (e) {
    console.warn('malware list update failed – retrying in 5 minutes', e?.message || e);
    chrome.alarms.create('malware-retry', { delayInMinutes: 5 });
  }
}

// ---- tracker-cookie cleaner ----
chrome.cookies.onChanged.addListener(async ({ cookie, removed }) => {
  if (removed) return;
  const s = settingsCache || await getSettings();
  if (!s.cleanTrackerCookies) return;
  const host = cookie.domain.replace(/^\./, '');
  const set = trackerDomains || await loadTrackerDomains();
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) {
      const url = `http${cookie.secure ? 's' : ''}://${host}${cookie.path}`;
      chrome.cookies.remove({ url, name: cookie.name, storeId: cookie.storeId });
      return;
    }
  }
});

// ---- risky download guard ----
const pendingDownloads = new Map();
chrome.downloads.onCreated.addListener(async (item) => {
  const s = await getSettings();
  if (!s.downloadGuard) return;
  if (item.byExtensionId === chrome.runtime.id) return; // our own downloader
  const name = (item.filename || item.finalUrl || item.url || '').split(/[?#]/)[0];
  const ext = name.split('.').pop().toLowerCase();
  if (!RISKY_EXT.includes(ext)) return;
  await chrome.downloads.pause(item.id).catch(() => {});
  const nid = `dl-${item.id}`;
  pendingDownloads.set(nid, item.id);
  chrome.notifications.create(nid, {
    type: 'basic',
    iconUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    title: `Risky file: .${ext}`,
    message: `${item.finalUrl || item.url}\nThis file type can run code on your computer.`,
    buttons: [{ title: 'Block' }, { title: 'Allow' }],
    requireInteraction: true,
  });
});

chrome.notifications.onButtonClicked.addListener(async (nid, btn) => {
  const id = pendingDownloads.get(nid);
  if (id === undefined) return;
  pendingDownloads.delete(nid);
  if (btn === 1) await chrome.downloads.resume(id).catch(() => {});
  else { await chrome.downloads.cancel(id).catch(() => {}); await chrome.downloads.erase({ id }); }
  chrome.notifications.clear(nid);
});
chrome.notifications.onClosed.addListener(async (nid) => {
  const id = pendingDownloads.get(nid);
  if (id !== undefined) { // dismissed without choice -> block
    pendingDownloads.delete(nid);
    await chrome.downloads.cancel(id).catch(() => {});
  }
});

// ---- MangaDex: the API refuses (403) requests whose Origin is chrome-extension://…
// so our own requests to MangaDex go out with mangadex.org as Origin/Referer.
// MangaDex's API answers "403 Bot challenge not passed" to browser-looking requests from
// outside its site. Its API rules ask clients to identify themselves with an honest
// User-Agent instead (approach from Ryuu3rs/storyhoard-extension, Apache-2.0).
const MD_RULES = [100010, 100011, 100012, 100013, 100014];
async function mangaDexHeaderRules() {
  const ua = `SyndicatesClient/${chrome.runtime.getManifest().version} (browser extension; +https://github.com/fwyiling/yiling)`;
  const api = { type: 'modifyHeaders', requestHeaders: [
    { header: 'User-Agent', operation: 'set', value: ua },
    { header: 'Origin', operation: 'remove' },
    { header: 'Referer', operation: 'remove' },
  ] };
  const img = { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://mangadex.org/' }] };
  const cover = { type: 'modifyHeaders', requestHeaders: [{ header: 'User-Agent', operation: 'set', value: ua }, { header: 'Referer', operation: 'set', value: 'https://mangadex.org/' }] };
  const types = ['xmlhttprequest', 'image', 'other'];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: MD_RULES,
    addRules: [
      { id: MD_RULES[0], priority: 5, action: api, condition: { requestDomains: ['api.mangadex.org'], resourceTypes: types, initiatorDomains: [chrome.runtime.id] } }, // popup / downloader page
      { id: MD_RULES[1], priority: 5, action: api, condition: { requestDomains: ['api.mangadex.org'], resourceTypes: types, tabIds: [chrome.tabs.TAB_ID_NONE] } },      // service worker
      { id: MD_RULES[2], priority: 5, action: img, condition: { requestDomains: ['mangadex.network'], resourceTypes: types, initiatorDomains: [chrome.runtime.id] } },
      { id: MD_RULES[3], priority: 5, action: img, condition: { requestDomains: ['mangadex.network'], resourceTypes: types, tabIds: [chrome.tabs.TAB_ID_NONE] } },
      // covers (uploads.mangadex.org): same honest User-Agent as the API, plus MangaDex as referrer
      { id: MD_RULES[4], priority: 5, action: cover, condition: { requestDomains: ['uploads.mangadex.org'], resourceTypes: types, initiatorDomains: [chrome.runtime.id] } },
    ],
  });
}
mangaDexHeaderRules();

// ---- Ani Manga: HiAnime requests ----
// The site's API and players expect to be called from hianimes.se; fetch() can't set Referer or Origin.
const AM_RULE = 100040;
const AM_TAB_RULE_BASE = 200000; // + tabId: per-player-tab Referer for the stream's own CDN
const AM_SITE = `https://${HIANIME_HOST}`;
const AM_ALLOW = ALLOW_PRIORITY - 10, AM_HEADERS = ALLOW_PRIORITY - 5; // header rules must outrank the allow rule to still apply
const AM_TAB_ALLOW_BASE = 300000, AM_CAPTURE_ALLOW_BASE = 400000;
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [AM_RULE, AM_RULE + 1, AM_RULE + 2],
  addRules: [
    // the client's own blockers (ad lists, learned trackers) must never break Ani Manga; malware rules still win
    { id: AM_RULE + 2, priority: AM_ALLOW, action: { type: 'allow' }, condition: { requestDomains: [HIANIME_HOST, ...API_HOSTS, ...PLAYER_HOSTS, ...BOOK_HOSTS], initiatorDomains: [chrome.runtime.id] } },
    { id: AM_RULE, priority: AM_HEADERS, condition: { requestDomains: [HIANIME_HOST, ...API_HOSTS], initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest', 'other'] },
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: `${AM_SITE}/` }, { header: 'Origin', operation: 'set', value: AM_SITE }] } },
    { id: AM_RULE + 1, priority: AM_HEADERS, condition: { requestDomains: PLAYER_HOSTS, initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest', 'media', 'other'] },
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: `${AM_SITE}/` }] } },
  ],
}).catch((e) => console.warn('ani manga rules', e));

const amRuleId = (tabId) => AM_TAB_RULE_BASE + (tabId % 100000);
async function amStreamHeaders(tabId, referer) {
  if (tabId == null || !referer) return;
  const origin = new URL(referer).origin;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [amRuleId(tabId), AM_TAB_ALLOW_BASE + (tabId % 100000)],
    addRules: [{
      id: AM_TAB_ALLOW_BASE + (tabId % 100000), priority: AM_ALLOW, action: { type: 'allow' },
      condition: { tabIds: [tabId], resourceTypes: ['xmlhttprequest', 'media', 'other'] },
    }, {
      id: amRuleId(tabId), priority: AM_HEADERS,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: referer }, { header: 'Origin', operation: 'set', value: origin }] },
      condition: { tabIds: [tabId], resourceTypes: ['xmlhttprequest', 'media', 'other'], excludedRequestDomains: [HIANIME_HOST, ...API_HOSTS, 'anilist.co', 'mangadex.org', 'mangadex.network', 'githubusercontent.com'] },
    }],
  });
}
chrome.tabs.onRemoved.addListener((tabId) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [amRuleId(tabId), AM_TAB_ALLOW_BASE + (tabId % 100000), AM_CAPTURE_ALLOW_BASE + (tabId % 100000)] }).catch(() => {}));

// Episodes are embedded players: open one in a hidden, muted tab, press play, and pick up the
// video address (HLS playlist or plain video file) it requests.
const amCaptures = new Map(); // hidden tabId -> { resolve, reject, timer, nudge, m3u8, file, referer, tracks }
function amFinish(tabId) {
  const c = amCaptures.get(tabId);
  if (!c) return;
  amCaptures.delete(tabId);
  clearTimeout(c.timer); clearInterval(c.nudge);
  chrome.tabs.remove(tabId).catch(() => {});
  c.resolve({ m3u8: c.m3u8, file: c.file, referer: c.referer, tracks: c.tracks });
}
const amRefererOf = (d) => (d.initiator && d.initiator !== 'null' ? `${d.initiator}/` : `${AM_SITE}/`);
chrome.webRequest.onBeforeRequest.addListener((d) => {
  const c = amCaptures.get(d.tabId);
  if (!c || c.m3u8) return;
  const path = d.url.split(/[?#]/)[0];
  if (/\.vtt$/i.test(path) && !/thumbnails?/i.test(path) && !c.tracks.some((t) => t.file === d.url)) {
    c.tracks.push({ file: d.url, label: decodeURIComponent(path.split('/').pop().replace(/\.vtt$/i, '')), kind: 'captions' });
  }
  if (/\.m3u8$/i.test(path)) {
    c.m3u8 = d.url; c.referer = amRefererOf(d);
    setTimeout(() => amFinish(d.tabId), 1500); // give subtitle files a moment to show up
  } else if (!c.file && (d.type === 'media' || /\.(mp4|webm|mkv)$/i.test(path)) && /^https?:/.test(d.url)) {
    c.file = d.url; c.referer = amRefererOf(d);
    setTimeout(() => amFinish(d.tabId), 2500); // an HLS playlist may still follow; prefer it
  }
}, { urls: ['<all_urls>'], types: ['xmlhttprequest', 'media', 'other'] });
chrome.tabs.onRemoved.addListener((tabId) => {
  const c = amCaptures.get(tabId);
  if (c) { amCaptures.delete(tabId); clearTimeout(c.timer); clearInterval(c.nudge); c.reject(new Error('The video tab was closed')); }
});
// many embedded players only fetch the video after a click on play
function amPressPlay() {
  document.querySelectorAll('video').forEach((v) => { v.muted = true; v.play?.().catch(() => {}); });
  const b = document.querySelector('.jw-icon-display, .jw-display-icon-container, .plyr__control--overlaid, .vjs-big-play-button, .art-control-play, .play-button, .btn-play, #play, button[aria-label*="play" i]');
  if (b && !b.dataset.amPressed) { b.dataset.amPressed = '1'; b.click(); }
}
async function amCaptureStream(url, playerTabId) {
  if (!capturable(url)) throw new Error(`won't open ${new URL(url).host}: not a HiAnime page or player`);
  // the hidden tab lets the player load untouched (ad lists often break embedded players); malware is still blocked
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{ id: AM_CAPTURE_ALLOW_BASE + (tab.id % 100000), priority: AM_ALLOW,
    action: { type: 'allowAllRequests' }, condition: { tabIds: [tab.id], resourceTypes: ['main_frame', 'sub_frame'] } }] }).catch(() => {});
  await chrome.tabs.update(tab.id, { url, muted: true });
  const found = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const c = amCaptures.get(tab.id);
      amCaptures.delete(tab.id); clearInterval(c?.nudge);
      chrome.tabs.remove(tab.id).catch(() => {});
      reject(new Error("the episode's player didn't start in time"));
    }, 30000);
    const nudge = setInterval(() => chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: amPressPlay }).catch(() => {}), 2500);
    amCaptures.set(tab.id, { resolve, reject, timer, nudge, m3u8: null, file: null, referer: null, tracks: [] });
  });
  await amStreamHeaders(playerTabId, found.referer);
  return found;
}

async function openAniManga(from) {
  const anime = chrome.runtime.getURL('anime/anime.html');
  const pages = ['anime/anime.html', 'library/library.html', 'books/books.html'].map((p) => chrome.runtime.getURL(p));
  const tabs = await chrome.tabs.query({ windowId: from?.windowId ?? chrome.windows.WINDOW_ID_CURRENT });
  const open = tabs.find((t) => { const u = t.url || t.pendingUrl || ''; return pages.some((p) => u.startsWith(p)); });
  if (open) return chrome.tabs.update(open.id, { active: true });
  return chrome.tabs.create({ url: anime, windowId: from?.windowId, index: from ? from.index + 1 : undefined });
}

// ---- lifecycle ----
chrome.runtime.onInstalled.addListener(async () => {
  // after an update, point the side panel at the fresh files (an open panel must be reopened once)
  chrome.sidePanel?.setOptions?.({ path: 'sidebar/sidebar.html', enabled: true }).catch(() => {});
  const cur = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...cur });
  chrome.alarms.create('malware-update', { periodInMinutes: 60 * 12 });
  await apply();            // protection first; don't wait on the network
  await updateMalwareList();
});
chrome.runtime.onStartup.addListener(apply);
chrome.alarms.onAlarm.addListener((a) => (a.name === 'malware-update' || a.name === 'malware-retry') && updateMalwareList());
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'sync') return;
  settingsCache = null;
  apply(Object.keys(c));
});
// ---- tab sleeper (frees RAM like GX Control) ----
async function sleepTabs() {
  const { tabSleepMin } = await getSettings();
  if (!tabSleepMin) return;
  const cutoff = Date.now() - tabSleepMin * 60000;
  const tabs = await chrome.tabs.query({ active: false, discarded: false, audible: false, pinned: false });
  for (const t of tabs) if (t.lastAccessed && t.lastAccessed < cutoff) chrome.tabs.discard(t.id).catch(() => {});
}
chrome.alarms.create('tab-sleep', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'tab-sleep' && sleepTabs());

// Remember where each tab was heading, so the warning page can say which site was stopped.
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0 && /^https?:/.test(url)) chrome.storage.session.set({ [`nav_${tabId}`]: url });
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`nav_${tabId}`));

let allowSeq = 900000;
async function allowOnce(host) {
  // session rule: lives until Chrome restarts
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{ id: allowSeq++, priority: MALWARE_PRIORITY + 1, action: { type: 'allowAllRequests' },
      condition: { requestDomains: [host], resourceTypes: ['main_frame', 'sub_frame'] } }],
  });
}

// ---- YouTube extras: SponsorBlock segments + Return YouTube Dislike counts ----
const ytCache = new Map();
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function ytData(videoId) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('bad video id');
  if (ytCache.has(videoId)) return ytCache.get(videoId);
  const out = { segments: [], dislikes: null };
  await Promise.all([
    (async () => { // privacy-preserving lookup: only the first 4 chars of the hash are sent
      const prefix = (await sha256Hex(videoId)).slice(0, 4);
      const cats = encodeURIComponent(JSON.stringify(['sponsor', 'selfpromo', 'interaction']));
      const r = await fetch(`https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${cats}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const hit = (await r.json()).find((x) => x.videoID === videoId);
      out.segments = (hit?.segments || []).filter((s) => !s.actionType || s.actionType === 'skip')
        .map((s) => ({ start: s.segment[0], end: s.segment[1], cat: s.category })).sort((a, b) => a.start - b.start);
    })().catch(() => {}),
    (async () => {
      const r = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) out.dislikes = (await r.json()).dislikes ?? null;
    })().catch(() => {}),
  ]);
  ytCache.set(videoId, out);
  if (ytCache.size > 300) ytCache.delete(ytCache.keys().next().value);
  return out;
}

// ---- cookie banners: DuckDuckGo autoconsent (MPL-2.0) – background half ----
let acRules = null;
async function acCompactRules() {
  if (!acRules) acRules = await (await fetch(chrome.runtime.getURL('rules/autoconsent-compact.json'))).json();
  return acRules;
}
async function handleAutoconsent(msg, sender) {
  const tabId = sender.tab?.id, frameId = sender.frameId ?? 0;
  if (tabId == null) return;
  const send = (m) => chrome.tabs.sendMessage(tabId, { ...m, __ac: true }, { frameId }).catch(() => {});
  if (msg.type === 'init') {
    const s = await getSettings();
    const url = sender.url || `${sender.origin}/`;
    let host = '';
    try { host = new URL(sender.tab?.url || url).hostname.replace(/^www\./, ''); } catch {}
    const enabled = s.cookieReject !== false && !(s.allowlist || []).includes(host);
    send({
      type: 'initResp',
      rules: { autoconsent: [], compact: filterCompactRules(await acCompactRules(), { url, mainFrame: frameId === 0 }) },
      config: {
        enabled, autoAction: 'optOut', disabledCmps: [], enablePrehide: true, enableCosmeticRules: true,
        enableHeuristicDetection: true, enablePopupMutationObserver: true, heuristicMode: 'tier1', detectRetries: 20,
        isMainWorld: false, prehideTimeout: 2000, performanceLoggingEnabled: false,
        logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false },
      },
    });
  } else if (msg.type === 'eval') {
    let result = false;
    const fn = evalSnippets[msg.snippetId];
    if (fn) {
      try { const [r] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, world: 'MAIN', func: fn }); result = r?.result; } catch {}
    }
    send({ type: 'evalResp', id: msg.id, result });
  } else if (msg.type === 'optOutResult' && msg.result) {
    const { cookieStats = 0 } = await chrome.storage.local.get('cookieStats');
    chrome.storage.local.set({ cookieStats: cookieStats + 1 });
  }
}

// ---- shared: registrable domain ("site") of a URL ----
const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'mil']);
function regDomain(host) {
  const p = host.replace(/^www\./, '').split('.');
  if (p.length <= 2 || /^\d+$/.test(p[p.length - 1])) return p.join('.');
  const n = p[p.length - 1].length === 2 && SLD.has(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join('.');
}
function siteOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? regDomain(u.hostname) : null; } catch { return null; }
}

// ---- clear a site's data when its last tab closes (Cookie AutoDelete-style) ----
const tabSites = new Map();
chrome.tabs.query({}).then((tabs) => tabs.forEach((t) => { const s = siteOf(t.url || ''); if (s) tabSites.set(t.id, s); }));
chrome.tabs.onUpdated.addListener((id, info, tab) => { const s = siteOf(tab.url || ''); if (s) tabSites.set(id, s); });
chrome.tabs.onRemoved.addListener(async (id) => {
  const site = tabSites.get(id);
  tabSites.delete(id);
  if (!site) return;
  const s = await getSettings();
  if (!s.autoClean || (s.keepSites || []).includes(site)) return;
  chrome.alarms.create(`clean:${site}`, { when: Date.now() + 30000 }); // grace period: reopen within 30s and nothing is lost
});
async function cleanSite(site) {
  const s = await getSettings();
  if (!s.autoClean || (s.keepSites || []).includes(site)) return;
  const open = (await chrome.tabs.query({})).some((t) => siteOf(t.url || '') === site);
  if (open) return;
  const cookies = await chrome.cookies.getAll({ domain: site });
  await Promise.all(cookies.map((c) => chrome.cookies.remove({ url: `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, name: c.name, storeId: c.storeId }).catch(() => {})));
  const origins = [];
  for (const sub of ['', 'www.']) for (const proto of ['https://', 'http://']) origins.push(proto + sub + site);
  await chrome.browsingData.remove({ origins }, { cacheStorage: true, indexedDB: true, localStorage: true, serviceWorkers: true, fileSystems: true }).catch(() => {});
  const { cleanStats = 0 } = await chrome.storage.local.get('cleanStats');
  chrome.storage.local.set({ cleanStats: cleanStats + 1 });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name.startsWith('clean:')) cleanSite(a.name.slice(6)); });
const KEEP_DEFAULTS = ['google.com', 'youtube.com', 'mangadex.org', 'github.com', 'discord.com', 'spotify.com', 'claude.ai', 'chatgpt.com', 'whatsapp.com', 'twitch.tv', 'microsoft.com', 'live.com'];
async function seedKeepList() {
  const top = await chrome.topSites.get().catch(() => []);
  const sites = new Set([...KEEP_DEFAULTS, ...top.map((t) => siteOf(t.url)).filter(Boolean)]);
  const s = await getSettings();
  await chrome.storage.sync.set({ keepSites: [...new Set([...(s.keepSites || []), ...sites])].slice(0, 200) });
}

// ---- learning tracker blocker (Privacy Badger-style) ----
// A third-party site that sets cookies on 3+ different websites is following you → block it.
const LEARN_RULE_ID = 100020;
const LEARN_THRESHOLD = 3;
const ENTITY = {}; // sites owned by the same company don't count as third parties for each other
for (const [owner, sites] of Object.entries({
  google: ['google.com', 'youtube.com', 'gstatic.com', 'googleusercontent.com', 'ggpht.com', 'googlevideo.com', 'ytimg.com', 'googleapis.com', 'blogger.com', 'youtube-nocookie.com'],
  meta: ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'whatsapp.com', 'whatsapp.net', 'messenger.com'],
  microsoft: ['microsoft.com', 'live.com', 'bing.com', 'msn.com', 'office.com', 'microsoftonline.com', 'skype.com', 'xbox.com', 'outlook.com'],
  amazon: ['amazon.com', 'media-amazon.com', 'ssl-images-amazon.com', 'primevideo.com', 'twitch.tv', 'jtvnw.net', 'ttvnw.net'],
  discord: ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net'],
  spotify: ['spotify.com', 'scdn.co', 'spotifycdn.com'],
  mangadex: ['mangadex.org', 'mangadex.network'],
  apple: ['apple.com', 'icloud.com', 'mzstatic.com'],
  x: ['x.com', 'twitter.com', 'twimg.com'],
  reddit: ['reddit.com', 'redd.it', 'redditstatic.com', 'redditmedia.com'],
  bilibili: ['bilibili.com', 'hdslb.com', 'biliapi.net', 'biliapi.com', 'bilivideo.com', 'bilivideo.cn', 'biligame.com', 'b23.tv'],
  tencent: ['qq.com', 'gtimg.com', 'gtimg.cn', 'qpic.cn', 'tencent.com', 'wechat.com', 'myqcloud.com'],
  alibaba: ['taobao.com', 'tmall.com', 'alicdn.com', 'alipay.com', 'aliyun.com', 'alibaba.com', 'aliexpress.com', 'mmstat.com'],
  baidu: ['baidu.com', 'bdstatic.com', 'bdimg.com', 'baidupcs.com'],
  zhihu: ['zhihu.com', 'zhimg.com'],
  valve: ['steampowered.com', 'steamcommunity.com', 'steamstatic.com', 'steamusercontent.com'],
  github: ['github.com', 'githubusercontent.com', 'githubassets.com'],
})) for (const s of sites) ENTITY[s] = owner;
const entity = (site) => ENTITY[site] || site;
// services sites need to work: never learned as trackers
const NEVER_BLOCK = new Set(['gstatic.com', 'googleapis.com', 'recaptcha.net', 'hcaptcha.com', 'cloudflare.com', 'cloudflareinsights.com', 'cloudfront.net',
  'akamaihd.net', 'akamaized.net', 'jsdelivr.net', 'unpkg.com', 'fastly.net', 'bootstrapcdn.com', 'fontawesome.com', 'typekit.net', 'ytimg.com',
  'googlevideo.com', 'youtube.com', 'youtube-nocookie.com', 'vimeo.com', 'vimeocdn.com', 'paypal.com', 'paypalobjects.com', 'stripe.com', 'stripe.network',
  'github.com', 'githubusercontent.com', 'google.com', 'apple.com', 'microsoft.com', 'microsoftonline.com', 'live.com', 'twitch.tv', 'discord.com',
  'spotify.com', 'gravatar.com', 'wp.com', 'imgur.com', 'giphy.com', 'mangadex.org', 'mangadex.network', 'disqus.com', 'steampowered.com', 'steamcommunity.com', 'hcaptcha.com', 'okta.com', 'auth0.com', 'arkoselabs.com', 'funcaptcha.com',
  // HiAnime streaming CDNs — required for in-client playback and downloads
  HIANIME_HOST, ...API_HOSTS, ...PLAYER_HOSTS, ...BOOK_HOSTS]);
let learn = null, learnDirty = false;
async function loadLearn() {
  if (!learn) { const { learned } = await chrome.storage.local.get('learned'); learn = learned || { seen: {}, blocked: [] }; }
  return learn;
}
async function applyLearnedRule() {
  const s = await getSettings();
  const l = await loadLearn();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [LEARN_RULE_ID],
    addRules: s.learnTrackers && l.blocked.length ? [{
      id: LEARN_RULE_ID, priority: 3, action: { type: 'block' },
      condition: { requestDomains: l.blocked.filter((d) => !NEVER_BLOCK.has(d)).slice(0, 5000), domainType: 'thirdParty', resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'ping', 'media', 'other'] },
    }] : [],
  });
}
let learnFlushT = null;
function learnSoon() {
  learnDirty = true;
  clearTimeout(learnFlushT);
  learnFlushT = setTimeout(async () => { if (!learnDirty) return; learnDirty = false; await chrome.storage.local.set({ learned: learn }); }, 4000);
}
chrome.webRequest.onHeadersReceived.addListener((d) => {
  if (!settingsCache?.learnTrackers || d.tabId < 0 || !d.initiator || !learn) return;
  const first = siteOf(d.initiator), third = siteOf(d.url);
  if (!first || !third || first === third || entity(first) === entity(third) || NEVER_BLOCK.has(third)) return;
  if (!d.responseHeaders?.some((h) => h.name.toLowerCase() === 'set-cookie')) return;
  const seen = (learn.seen[third] ||= []);
  if (seen.includes(first)) return;
  seen.push(first);
  if (seen.length > 10) seen.shift();
  if (seen.length >= LEARN_THRESHOLD && !learn.blocked.includes(third)) { learn.blocked.push(third); applyLearnedRule(); }
  learnSoon();
}, { urls: ['<all_urls>'], types: ['script', 'image', 'xmlhttprequest', 'sub_frame', 'ping', 'other'] }, ['responseHeaders', 'extraHeaders']);
getSettings().then(() => loadLearn());

// ---- sidebar apps: let sites load inside the side panel ----
// Side-panel frames have no tab (tabId -1): strip only their "don't embed me" headers.
const SIDEBAR_RULE = 100030;
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [SIDEBAR_RULE],
  addRules: [{
    id: SIDEBAR_RULE, priority: 4,
    action: { type: 'modifyHeaders', responseHeaders: [
      { header: 'x-frame-options', operation: 'remove' },
      { header: 'content-security-policy', operation: 'remove' },
      { header: 'cross-origin-opener-policy', operation: 'remove' },
    ] },
    condition: { tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ['sub_frame'] },
  }],
}).catch((e) => console.warn('sidebar rule', e));
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
// ] hotkey: open the side panel
function openSidebarFor(which, windowId) {
  // open first – Chrome only allows it straight after the key press
  const open = windowId != null ? chrome.sidePanel.open({ windowId }) : Promise.reject(new Error('no window'));
  return open.catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('sidebar/sidebar.html') }));
}
// [ hotkey: jump to the Syndicates home page (reuse one that's already open in this window)
async function openHome(from) {
  const home = chrome.runtime.getURL('newtab/newtab.html');
  const tabs = await chrome.tabs.query({ windowId: from?.windowId ?? chrome.windows.WINDOW_ID_CURRENT });
  const open = tabs.find((t) => t.id !== from?.id && ((t.url || t.pendingUrl || '').startsWith(home) || /^chrome:\/\/newtab\/?$/.test(t.url || '')));
  if (open) return chrome.tabs.update(open.id, { active: true });
  return chrome.tabs.create({ url: home + '?home', windowId: from?.windowId, index: from ? from.index + 1 : undefined });
}
// right-click → open a link (or the current page) in the sidebar
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'sc-sidebar-link', title: 'Open link in sidebar', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'sc-sidebar-page', title: 'Open this page in sidebar', contexts: ['page'] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === 'sc-sidebar-link' ? info.linkUrl : info.pageUrl;
  if (!url || tab?.windowId == null) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {}); // must happen right away (user gesture)
  chrome.storage.local.set({ sidebarPeek: { url, t: Date.now() } });
});
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'open-sidebar' && tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  if (cmd === 'open-home') openHome(tab);
  if (cmd === 'open-animanga') openAniManga(tab);
});
async function sidebarAllow(url) {
  // keep logins working inside the panel even with third-party cookies blocked
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const site = regDomain(host);
    await chrome.contentSettings.cookies.set({ primaryPattern: `https://[*.]${site}/*`, setting: 'allow' });
  } catch {}
}

// ---- strict pop-up blocker: new tabs/windows a page opens by itself, and hijacked redirects ----
const OK_POPUP_HOST = /^(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|(www\.)?facebook\.com|discord\.com|github\.com|(www\.)?paypal\.com|checkout\.stripe\.com|(api\.)?twitter\.com|x\.com|id\.twitch\.tv|steamcommunity\.com|pay\.google\.com)$/i;
const lastClicks = new Map();   // tabId -> { t, site, interactive }
const pendingPopups = new Map(); // new tabId -> { source, t }
const tabTopSite = new Map();    // tabId -> site of the committed page
function userWanted(sourceTab, targetSite, within = 1500) {
  const c = lastClicks.get(sourceTab);
  return !!c && Date.now() - c.t < within && (c.site === targetSite || (c.interactive && !c.site));
}
async function popupGuardOn(tabId) {
  const s = await getSettings();
  if (s.popupBlock === false) return false;
  try { const t = await chrome.tabs.get(tabId); const h = new URL(t.url).hostname.replace(/^www\./, ''); return !(s.allowlist || []).includes(h); } catch { return true; }
}
async function judgePopup(newTab, url) {
  const p = pendingPopups.get(newTab);
  if (!p) return;
  const target = siteOf(url);
  if (!target) return; // about:blank – wait for the real address
  pendingPopups.delete(newTab);
  const src = tabTopSite.get(p.source);
  let host = ''; try { host = new URL(url).hostname; } catch {}
  if (!src || target === src || OK_POPUP_HOST.test(host) || userWanted(p.source, target)) return;
  if (!(await popupGuardOn(p.source))) return;
  chrome.tabs.remove(newTab).catch(() => {});
  chrome.tabs.sendMessage(p.source, { type: 'show-popup-toast', url, why: 'pop-up tab' }, { frameId: 0 }).catch(() => {});
  bump('popupStats');
  recentPopupBlock.set(p.source, Date.now());
}
const recentPopupBlock = new Map();
chrome.webNavigation.onCreatedNavigationTarget.addListener(({ sourceTabId, tabId, url }) => {
  pendingPopups.set(tabId, { source: sourceTabId, t: Date.now() });
  setTimeout(() => pendingPopups.delete(tabId), 5000);
  judgePopup(tabId, url);
});
chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0 && pendingPopups.has(tabId)) judgePopup(tabId, url);
});
// the page you're on jumps to another site right after a click that wasn't on a link → go back
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url, transitionType, transitionQualifiers }) => {
  if (frameId !== 0) return;
  const before = tabTopSite.get(tabId), now = siteOf(url);
  if (now) tabTopSite.set(tabId, now);
  if (!before || !now || before === now) return;
  if (!['link', 'auto_bookmark'].includes(transitionType) && !(transitionQualifiers || []).includes('client_redirect')) return;
  if (transitionQualifiers?.includes('forward_back') || transitionType === 'typed' || transitionType === 'generated') return;
  const c = lastClicks.get(tabId);
  const hijack = c && Date.now() - c.t < 1500 && !c.interactive && c.site !== now;
  const tabUnder = (recentPopupBlock.get(tabId) || 0) > Date.now() - 4000 && !(c && c.site === now);
  if (!(hijack || tabUnder) || OK_POPUP_HOST.test(new URL(url).hostname)) return;
  if (!(await popupGuardOn(tabId))) return;
  tabTopSite.set(tabId, before);
  chrome.tabs.goBack(tabId).catch(() => {});
  setTimeout(() => chrome.tabs.sendMessage(tabId, { type: 'show-popup-toast', url, why: 'redirect' }, { frameId: 0 }).catch(() => {}), 1200);
  bump('popupStats');
});
chrome.tabs.onRemoved.addListener((id) => { lastClicks.delete(id); tabTopSite.delete(id); recentPopupBlock.delete(id); });

// ---- dark mode everywhere (Dark Reader engine), injected only while it's on ----
async function syncDarkScript(on) {
  const have = await chrome.scripting.getRegisteredContentScripts({ ids: ['darkmode', 'darkmode-proxy'] }).catch(() => []);
  if (on && !have.length) {
    await chrome.scripting.registerContentScripts([
      { id: 'darkmode-proxy', js: ['content/darkmode-proxy.js'], matches: ['http://*/*', 'https://*/*'], runAt: 'document_start', world: 'MAIN' },
      { id: 'darkmode', js: ['content/darkmode.js'], matches: ['http://*/*', 'https://*/*'], runAt: 'document_start' },
    ]).catch((e) => console.warn('dark mode', e));
    // turn it on in tabs that are already open
    for (const t of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })) {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content/darkmode-proxy.js'], world: 'MAIN' }).catch(() => {});
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content/darkmode.js'] }).catch(() => {});
    }
  } else if (!on && have.length) {
    await chrome.scripting.unregisterContentScripts({ ids: have.map((x) => x.id) }).catch(() => {});
  }
}
async function drFetch(url) {
  const r = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const type = r.headers.get('content-type') || '';
  if (/^(text\/|application\/(json|javascript|xml))|css|svg/.test(type)) return { text: await r.text(), type };
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 3e6) throw new Error('too large');
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(bin), type };
}

async function bump(key) { const v = (await chrome.storage.local.get(key))[key] || 0; await chrome.storage.local.set({ [key]: v + 1 }); }

// ---- messages from the popup and the in-page dock ----
async function scanTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (parseMangaDexUrl(tab.url)) {
    const s = await getSettings();
    useMangaDexTab(tabId);
    const info = await mangaDexInfo(tab.url, s.mdLangs);
    const chapters = await mangaDexChapters(info.mangaId, info.lang);
    return {
      ...info, sourceTabId: tabId, title: info.series, url: tab.url, origin: 'https://mangadex.org', images: [], text: '',
      chapters, currentIndex: chapters.findIndex((c) => c.id === info.currentChapterId),
    };
  }
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: scanDocument, args: [null, null] });
  return result;
}
function buildJob(page, kind, preset) {
  const { images, text, ...rest } = page;
  return { ...rest, kind, preset, current: page.source ? null : { images, text, title: page.title } };
}
async function startJob(job) {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [`job_${id}`]: job });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`downloader/downloader.html?job=${id}`) });
}
async function toggleListEntry(key, host, on) {
  const s = await getSettings();
  const list = new Set(s[key] || []);
  on ? list.add(host) : list.delete(host);
  await chrome.storage.sync.set({ [key]: [...list] });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.__ac) { handleAutoconsent(msg, sender); return; }
  const tabId = msg.tabId ?? sender.tab?.id;
  const run = {
    'update-malware-list': () => updateMalwareList(),
    'scan': () => scanTab(tabId),
    'start-job': () => startJob(msg.job),
    'allow-once': () => allowOnce(msg.host),
    'dr-fetch': () => drFetch(msg.url),
    'sidebar-allow': () => sidebarAllow(msg.url),
    'open-sidebar': () => chrome.sidePanel.open({ windowId: msg.windowId }),
    'float-app': () => chrome.windows.create({ url: msg.url, type: 'popup', width: msg.width || 480, height: msg.height || 760, focused: true }),
    'hotkey': () => (msg.which === 'home' ? openHome(sender.tab) : openSidebarFor(msg.which, sender.tab?.windowId)),
    'user-click': () => { if (tabId != null) lastClicks.set(tabId, { t: Date.now(), site: msg.href ? siteOf(msg.href) : null, interactive: !!msg.interactive }); },
    'popup-blocked': () => bump('popupStats'),
    'open-anyway': () => { if (tabId != null) lastClicks.set(tabId, { t: Date.now(), site: siteOf(msg.url), interactive: true }); return chrome.tabs.create({ url: msg.url, openerTabId: tabId ?? undefined }); },
    'learn-reset': async () => { learn = { seen: {}, blocked: [] }; await chrome.storage.local.set({ learned: learn }); await applyLearnedRule(); },
    'learn-stats': async () => { const l = await loadLearn(); return { blocked: l.blocked.length, watching: Object.keys(l.seen).length, list: l.blocked.slice(-30) }; },
    'keep-site': async () => { const s = await getSettings(); const k = new Set(s.keepSites || []); msg.keep ? k.add(msg.site) : k.delete(msg.site); await chrome.storage.sync.set({ keepSites: [...k] }); },
    'clean-now': () => cleanSite(msg.site),
    'yt-data': () => ytData(msg.videoId),
    'md-diagnose': async () => mangaDexDiagnose((await chrome.tabs.get(tabId)).url, tabId),
    'download': () => startJob(buildJob(msg.page, msg.kind, msg.preset)),
    'open-animanga': () => openAniManga(sender.tab),
    'am-capture-stream': () => amCaptureStream(msg.url, msg.tabId),
    'am-stream-headers': () => amStreamHeaders(msg.tabId, msg.referer),
    'set-paused': () => toggleListEntry('allowlist', msg.host, msg.paused),
    'hide-dock-here': () => toggleListEntry('dockHiddenOn', msg.host, true),
    'open-settings': () => chrome.action.openPopup().catch(() =>
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') })),
  }[msg?.type];
  if (!run) return;
  Promise.resolve(run()).then((r) => reply({ ok: true, result: r }), (e) => reply({ ok: false, error: e.message }));
  return true;
});
