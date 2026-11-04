// Books: Project Gutenberg's 70,000+ public-domain books through Gutendex (https://gutendex.com),
// a free JSON API with no key. Book text comes straight from gutenberg.org.
export const GUTENDEX = 'https://gutendex.com';
export const BOOK_HOSTS = ['gutendex.com', 'gutenberg.org'];

async function get(url) {
  const r = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(20000) })
    .catch((e) => { throw new Error(`can't reach Project Gutenberg (${e.message})`); });
  if (!r.ok) throw new Error(`Project Gutenberg answered ${r.status}`);
  return r.json();
}

const pick = (formats, ...types) => {
  for (const t of types) for (const [k, v] of Object.entries(formats || {})) if (k.startsWith(t) && !/\.zip$/i.test(v)) return v;
  return '';
};
// "Austen, Jane" -> "Jane Austen"
const personName = (n) => (n || '').includes(',') ? n.split(',').map((x) => x.trim()).reverse().join(' ') : n || '';

export function toBook(b) {
  return {
    id: b.id,
    title: b.title,
    authors: (b.authors || []).map((a) => personName(a.name)).filter(Boolean),
    summary: (b.summaries || [])[0] || '',
    subjects: [...new Set([...(b.bookshelves || []), ...(b.subjects || [])].map((s) => s.replace(/^Browsing: /, '').split(' -- ')[0]))].slice(0, 8),
    languages: b.languages || [],
    downloads: b.download_count || 0,
    cover: pick(b.formats, 'image/jpeg'),
    html: pick(b.formats, 'text/html'),
    text: pick(b.formats, 'text/plain; charset=utf-8', 'text/plain'),
    epub: pick(b.formats, 'application/epub+zip'),
  };
}

/** A page of books. Options: search, topic, languages ('en'), page. Sorted by popularity. */
export async function books({ search = '', topic = '', languages = 'en', page = 1 } = {}) {
  const q = new URLSearchParams({ languages, sort: 'popular' });
  if (search) q.set('search', search);
  if (topic) q.set('topic', topic);
  if (page > 1) q.set('page', page);
  const d = await get(`${GUTENDEX}/books/?${q}`);
  return { count: d.count || 0, hasMore: !!d.next, results: (d.results || []).filter((b) => b.media_type === 'Text' && !b.copyright).map(toBook) };
}

export async function book(id) { return toBook(await get(`${GUTENDEX}/books/${encodeURIComponent(id)}`)); }

export const gutenbergPage = (id) => `https://www.gutenberg.org/ebooks/${id}`;

export const GENRES = [
  ['Adventure', 'adventure'], ['Mystery', 'detective'], ['Science fiction', 'science fiction'], ['Fantasy', 'fantasy'],
  ['Romance', 'love stories'], ['Horror', 'horror'], ['Historical', 'historical fiction'], ['Children', 'children'],
  ['Poetry', 'poetry'], ['Philosophy', 'philosophy'], ['Plays', 'drama'], ['Short stories', 'short stories'],
];

// Reading progress: the books you've opened, newest first, with how far you got.
const READING = 'bkReading';
export async function getReading() { const { [READING]: l = [] } = await chrome.storage.local.get(READING); return l; }
export async function saveReading(b, progress, where = '') {
  const list = (await getReading()).filter((x) => x.id !== b.id);
  list.unshift({ id: b.id, title: b.title, authors: b.authors, cover: b.cover, html: b.html, text: b.text, epub: b.epub, progress: Math.max(0, Math.min(1, progress || 0)), where, updatedAt: Date.now() });
  await chrome.storage.local.set({ [READING]: list.slice(0, 30) });
}
export async function forgetReading(id) { await chrome.storage.local.set({ [READING]: (await getReading()).filter((x) => x.id !== id) }); }
export const readerUrl = (id) => chrome.runtime.getURL(`books/reader.html?id=${encodeURIComponent(id)}`);
