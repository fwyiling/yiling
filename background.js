// Shield Client – service worker
import { DEFAULTS } from './lib/defaults.js';


const MALWARE_FEED = 'https://urlhaus.abuse.ch/downloads/hostfile/';
const RISKY_EXT = [
  'exe', 'msi', 'scr', 'bat', 'cmd', 'com', 'pif', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf',
  'hta', 'jar', 'lnk', 'reg', 'dll', 'apk', 'dmg', 'pkg', 'sh', 'iso', 'cpl', 'msc',
];
const REFERRER_RULE_ID = 100000;
const ALLOW_RULE_ID = 100001;
const ALLOW_PRIORITY = 2 ** 30;      // beats every ad rule
const MALWARE_PRIORITY = 2 ** 30 + 1; // ...but malware is blocked even on paused sites

async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
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

async function apply() {
  const s = await getSettings();

  await setAdRulesets(s.adBlock);

  // Sites the user paused: let everything through on those pages.
  const allow = (s.allowlist || []).filter(Boolean);
  const rules = [];
  if (allow.length) {
    rules.push({
      id: ALLOW_RULE_ID, priority: ALLOW_PRIORITY,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: allow, resourceTypes: ['main_frame', 'sub_frame'] },
    });
  }

  // Referrer-Policy: send only the origin on cross-site requests.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [REFERRER_RULE_ID, ALLOW_RULE_ID],
    addRules: rules.concat(s.referrerPolicy
      ? [{
          id: REFERRER_RULE_ID, priority: 1,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [{ header: 'Referrer-Policy', operation: 'set', value: 'strict-origin-when-cross-origin' }],
          },
          condition: { resourceTypes: ['main_frame', 'sub_frame'] },
        }]
      : []),
  });

  chrome.declarativeNetRequest.setExtensionActionOptions?.({ displayActionCountAsBadgeText: true });
  chrome.action.setBadgeBackgroundColor({ color: s.accent || '#fa1e4e' });

  try {
    await chrome.privacy.websites.thirdPartyCookiesAllowed.set({ value: !s.blockTpCookies });
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({
      value: s.webrtc ? 'disable_non_proxied_udp' : 'default',
    });
  } catch (e) {
    console.warn('privacy API', e);
  }

  await applyMalwareRules(s.malware);
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
  for (let i = 0; i < malwareDomains.length; i += 1000) {
    addRules.push({
      id: i / 1000 + 1, priority: MALWARE_PRIORITY,
      action: { type: 'block' },
      condition: {
        requestDomains: malwareDomains.slice(i, i + 1000),
        resourceTypes: ['main_frame', 'sub_frame', 'script', 'xmlhttprequest', 'media', 'other'],
      },
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
  const s = await getSettings();
  if (!s.cleanTrackerCookies) return;
  const host = cookie.domain.replace(/^\./, '');
  const set = await loadTrackerDomains();
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
chrome.storage.onChanged.addListener((_c, area) => area === 'sync' && apply());
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

// ---- messages from the popup and the in-page dock ----
async function scanTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, files: ['content/scanner.js'] });
  return result;
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
    'set-paused': () => toggleListEntry('allowlist', msg.host, msg.paused),
    'hide-dock-here': () => toggleListEntry('dockHiddenOn', msg.host, true),
    'open-settings': () => chrome.action.openPopup().catch(() =>
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?tab=1') })),
  }[msg?.type];
  if (!run) return;
  Promise.resolve(run()).then((r) => reply({ ok: true, result: r }), (e) => reply({ ok: false, error: e.message }));
  return true;
});
