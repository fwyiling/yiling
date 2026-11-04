// Shield Client – service worker
import { DEFAULTS } from './lib/defaults.js';
import { scanDocument } from './lib/extract.js';
import { parseMangaDexUrl, mangaDexInfo, mangaDexChapters } from './lib/mangadex.js';


const MALWARE_FEED = 'https://urlhaus.abuse.ch/downloads/hostfile/';
const RISKY_EXT = [
  'exe', 'msi', 'scr', 'bat', 'cmd', 'com', 'pif', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'hta', 'jar', 'lnk', 'reg', 'dll', 'apk', 'dmg', 'pkg', 'sh', 'iso', 'cpl', 'msc',
];
const REFERRER_RULE_ID = 100000;
const ALLOW_RULE_ID = 100001;
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

  if (!changed) chrome.declarativeNetRequest.setExtensionActionOptions?.({ displayActionCountAsBadgeText: true });
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
    console.warn('malware list update failed', e);
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
const MD_RULES = [100010, 100011];
async function mangaDexHeaderRules() {
  const action = {
    type: 'modifyHeaders',
    requestHeaders: [
      { header: 'Origin', operation: 'set', value: 'https://mangadex.org' },
      { header: 'Referer', operation: 'set', value: 'https://mangadex.org/' },
    ],
  };
  const base = { requestDomains: ['mangadex.org', 'mangadex.network'], resourceTypes: ['xmlhttprequest', 'image', 'other'] };
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: MD_RULES,
    addRules: [
      { id: MD_RULES[0], priority: 5, action, condition: { ...base, initiatorDomains: [chrome.runtime.id] } }, // popup / downloader page
      { id: MD_RULES[1], priority: 5, action, condition: { ...base, tabIds: [chrome.tabs.TAB_ID_NONE] } },      // service worker
    ],
  });
}
mangaDexHeaderRules();

// ---- lifecycle ----
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...cur });
  chrome.alarms.create('malware-update', { periodInMinutes: 60 * 12 });
  await apply();            // protection first; don't wait on the network
  await updateMalwareList();
});
chrome.runtime.onStartup.addListener(apply);
chrome.alarms.onAlarm.addListener((a) => a.name === 'malware-update' && updateMalwareList());
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

// ---- messages from the popup and the in-page dock ----
async function scanTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (parseMangaDexUrl(tab.url)) {
    const s = await getSettings();
    const info = await mangaDexInfo(tab.url, s.mdLangs);
    const chapters = await mangaDexChapters(info.mangaId, info.lang);
    return {
      ...info, title: info.series, url: tab.url, origin: 'https://mangadex.org', images: [], text: '',
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
  const tabId = msg.tabId ?? sender.tab?.id;
  const run = {
    'update-malware-list': () => updateMalwareList(),
    'scan': () => scanTab(tabId),
    'start-job': () => startJob(msg.job),
    'allow-once': () => allowOnce(msg.host),
    'download': () => startJob(buildJob(msg.page, msg.kind, msg.preset)),
    'set-paused': () => toggleListEntry('allowlist', msg.host, msg.paused),
    'hide-dock-here': () => toggleListEntry('dockHiddenOn', msg.host, true),
    'open-settings': () => chrome.action.openPopup().catch(() =>
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') })),
  }[msg?.type];
  if (!run) return;
  Promise.resolve(run()).then((r) => reply({ ok: true, result: r }), (e) => reply({ ok: false, error: e.message }));
  return true;
});
