// MangaDex connector using the official public API (https://api.mangadex.org/docs/).
// MangaDex is a JavaScript app, so page scraping is unreliable – the API is the clean way.

const API = 'https://api.mangadex.org';
const ALL_RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic'];

export const LANG_NAMES = {
  en: 'English', zh: '中文 (简体)', 'zh-hk': '中文 (繁體)', ja: '日本語', 'ja-ro': 'Japanese (romaji)', ko: '한국어',
  'ko-ro': 'Korean (romaji)', 'pt-br': 'Português (BR)', 'es-la': 'Español (LATAM)', es: 'Español', fr: 'Français',
  id: 'Bahasa Indonesia', vi: 'Tiếng Việt', ru: 'Русский', de: 'Deutsch', it: 'Italiano', tr: 'Türkçe', th: 'ไทย', pl: 'Polski',
};

export function parseMangaDexUrl(url) {
  const m = /mangadex\.org\/(title|chapter)\/([0-9a-f-]{36})/i.exec(url || '');
  return m ? { type: m[1].toLowerCase(), id: m[2].toLowerCase() } : null;
}

// Requests go through the user's open MangaDex tab when possible (MAIN world fetch):
// to MangaDex they are then identical to its own web app's requests. If that tab is
// gone we fall back to a direct request (with mangadex.org Origin set by a DNR rule).
let viaTab = null;
export function useMangaDexTab(tabId) { viaTab = tabId ?? null; }

async function tabFetchText(tabId, url) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', args: [url],
    func: async (u) => {
      try { const r = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(20000) }); return { status: r.status, text: await r.text() }; }
      catch (e) { return { status: 0, text: e && e.name === 'TimeoutError' ? 'timed out after 20s (MangaDex not reachable)' : String(e && e.message || e) }; }
    },
  });
  return result;
}

async function get(url) {
  // 1) straight from the extension, identified as SyndicatesClient (see the header rule in background.js)
  let direct = null;
  try {
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
    direct = { status: res.status, text: await res.text() };
    if (direct.status !== 403) return direct;
  } catch (e) { direct = { status: 0, text: String(e?.message || e) }; }
  // 2) fallback: through the open MangaDex tab, like the site itself
  if (viaTab != null) {
    try { const r = await tabFetchText(viaTab, url); if (r && r.status && r.status !== 403) return r; } catch {}
  }
  return direct;
}

async function api(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) qs.append(`${k}[${kk}]`, vv);
    else if (v !== undefined) qs.append(k, v);
  }
  const url = `${API}${path}${qs.toString() ? '?' + qs : ''}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { status, text } = await get(url);
    if (status === 429) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    let body = {};
    try { body = JSON.parse(text); } catch {}
    if (status === 403) throw new Error(`MangaDex refused the request (403: ${text.slice(0, 80)}). Reload the extension and the MangaDex tab, then try again.`);
    if (status < 200 || status >= 300 || body.result === 'error') {
      console.warn('[Syndicates Client] MangaDex', status, url, text.slice(0, 300));
      throw new Error(body.errors?.[0]?.detail || `MangaDex error ${status}`);
    }
    return body;
  }
  throw new Error('MangaDex is rate-limiting, try again in a minute');
}

/** Fetch an image through the MangaDex tab (fallback when the direct download is refused). */
export async function mangaDexImageViaTab(url) {
  if (viaTab == null) throw new Error('no MangaDex tab');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: viaTab }, world: 'MAIN', args: [url],
    func: async (u) => {
      const r = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(30000) });
      if (!r.ok) return { status: r.status };
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { status: r.status, b64: btoa(bin) };
    },
  });
  if (!result?.b64) throw new Error('HTTP ' + (result?.status || 0));
  const bin = atob(result.b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const pickTitle = (attr) => attr.title?.en || Object.values(attr.title || {})[0]
  || attr.altTitles?.find((t) => t.en)?.en || 'Untitled';

/** Resolve a MangaDex title or chapter URL into manga info. */
export async function mangaDexInfo(url, preferred = ['en', 'zh', 'zh-hk']) {
  const p = parseMangaDexUrl(url);
  if (!p) throw new Error('Not a MangaDex title or chapter link');
  let mangaId = p.id, currentChapterId = null, currentLang = null;
  if (p.type === 'chapter') {
    const { data } = await api(`/chapter/${p.id}`);
    mangaId = data.relationships.find((r) => r.type === 'manga').id;
    currentChapterId = data.id;
    currentLang = data.attributes.translatedLanguage;
  }
  const { data: manga } = await api(`/manga/${mangaId}`);
  const available = manga.attributes.availableTranslatedLanguages || [];
  const langs = [...preferred.filter((l) => available.includes(l)), ...available.filter((l) => !preferred.includes(l)).sort()];
  return {
    source: 'mangadex',
    mangaId,
    series: pickTitle(manga.attributes),
    langs,
    lang: currentLang || langs[0] || 'en',
    currentChapterId,
  };
}

/** All chapters of a manga in one language, oldest first, one upload per chapter number. */
export async function mangaDexChapters(mangaId, lang) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const body = await api(`/manga/${mangaId}/feed`, {
      translatedLanguage: [lang], limit: 500, offset, includeExternalUrl: 0,
      contentRating: ALL_RATINGS, includes: ['scanlation_group'],
      order: { volume: 'asc', chapter: 'asc' },
    });
    rows.push(...body.data);
    if (offset + 500 >= body.total) break;
  }
  const byNum = new Map();
  for (const c of rows) {
    const a = c.attributes;
    if (a.externalUrl || !a.pages) continue; // hosted elsewhere (e.g. official sites)
    const key = a.chapter ?? `oneshot-${c.id}`;
    const group = c.relationships.find((r) => r.type === 'scanlation_group')?.attributes?.name || '';
    const prev = byNum.get(key);
    if (prev && prev.pages >= a.pages) continue; // keep the most complete upload
    const num = a.chapter != null ? parseFloat(a.chapter) : 0;
    const label = (a.volume ? `Vol. ${a.volume} ` : '') + (a.chapter != null ? `Ch. ${a.chapter}` : 'Oneshot') + (a.title ? ` – ${a.title}` : '');
    byNum.set(key, { id: c.id, url: `https://mangadex.org/chapter/${c.id}`, num, label, group, pages: a.pages });
  }
  return [...byNum.values()].sort((x, y) => x.num - y.num);
}

// MangaDex@Home allows ~40 server lookups per minute; space them out.
let lastAtHome = 0;
/** Page image URLs for one chapter. */
export async function mangaDexPages(chapterId, dataSaver = false) {
  const wait = lastAtHome + 1600 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAtHome = Date.now();
  const { baseUrl, chapter } = await api(`/at-home/server/${chapterId}`);
  const files = dataSaver ? chapter.dataSaver : chapter.data;
  return files.map((f) => `${baseUrl}/${dataSaver ? 'data-saver' : 'data'}/${chapter.hash}/${f}`);
}

/** Step-by-step connection test, shown in the popup so failures are visible. */
export async function mangaDexDiagnose(tabUrl, tabId) {
  const steps = [];
  const step = async (name, fn) => {
    const t = Date.now();
    try { const r = await fn(); steps.push({ name, ok: true, detail: String(r ?? 'ok'), ms: Date.now() - t }); return r; }
    catch (e) { steps.push({ name, ok: false, detail: String(e?.message || e), ms: Date.now() - t }); return null; }
  };
  const p = parseMangaDexUrl(tabUrl);
  await step('Page is a MangaDex title or chapter', async () => { if (!p) throw new Error('open a mangadex.org/title/… or /chapter/… page'); return p.type; });
  if (!p) return steps;
  const path = p.type === 'chapter' ? `/chapter/${p.id}` : `/manga/${p.id}`;
  const viaTabText = async (url) => {
    const r = await tabFetchText(tabId, url);
    if (r.status !== 200) throw new Error(r.status ? `HTTP ${r.status} ${r.text.slice(0, 140)}` : r.text);
    return r.text;
  };
  await step('API request directly from the extension', async () => {
    const res = await fetch(API + path, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 140)}`);
    return 'HTTP 200';
  });
  await step('API request through the MangaDex tab (fallback)', async () => { await viaTabText(API + path); return 'HTTP 200'; });
  let chapterId = p.type === 'chapter' ? p.id : null;
  if (!chapterId) {
    chapterId = await step('Find a chapter of this title', async () => {
      const j = JSON.parse((await get(`${API}/manga/${p.id}/feed?limit=1&includeExternalUrl=0`)).text);
      if (!j.data?.length) throw new Error('no chapters hosted on MangaDex');
      return j.data[0].id;
    });
  }
  let img = null;
  if (chapterId) {
    img = await step('Image server lookup (MangaDex@Home)', async () => {
      const r = await get(`${API}/at-home/server/${chapterId}`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status} ${r.text.slice(0, 120)}`);
      const j = JSON.parse(r.text);
      return `${j.baseUrl}/data-saver/${j.chapter.hash}/${j.chapter.dataSaver[0]}`;
    });
  }
  if (img) {
    await step('Download one page directly', async () => {
      const res = await fetch(img, { credentials: 'omit', signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return `${(await res.arrayBuffer()).byteLength} bytes`;
    });
    await step('Download one page through the tab', async () => {
      const prev = viaTab; viaTab = tabId;
      try { return `${(await mangaDexImageViaTab(img)).length} bytes`; } finally { viaTab = prev; }
    });
  }
  await step('Save a test file to Downloads/Syndicates Client', async () => {
    const id = await chrome.downloads.download({ url: 'data:text/plain,Syndicates%20Client%20test', filename: 'Syndicates Client/test.txt', conflictAction: 'overwrite', saveAs: false });
    const state = await new Promise((resolve) => {
      const l = (d) => { if (d.id === id && d.state && d.state.current !== 'in_progress') { chrome.downloads.onChanged.removeListener(l); resolve(d.state.current); } };
      chrome.downloads.onChanged.addListener(l);
      setTimeout(() => resolve('timeout'), 15000);
    });
    if (state !== 'complete') throw new Error('download ' + state);
    await chrome.downloads.removeFile(id).catch(() => {}); // don't leave the test file behind
    chrome.downloads.erase({ id });
    return 'saved (and removed again)';
  });
  return steps;
}
