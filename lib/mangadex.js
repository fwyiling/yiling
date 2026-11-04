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

async function api(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) qs.append(`${k}[${kk}]`, vv);
    else if (v !== undefined) qs.append(k, v);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}${qs.toString() ? '?' + qs : ''}`, { credentials: 'omit' });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.result === 'error') throw new Error(body.errors?.[0]?.detail || `MangaDex error ${res.status}`);
    return body;
  }
  throw new Error('MangaDex is rate-limiting, try again in a minute');
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
