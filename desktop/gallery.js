// The wallpaper gallery: anime wallpapers from Wallhaven (wallhaven.cc), a large wallpaper site with a public API.
// Always only its anime category and only safe-for-work pictures (purity 100); at least full HD, widescreen.
// A picture you pick is downloaded into the app's folder (it stays usable offline) and becomes your wallpaper.
// Only Wallhaven's own addresses are ever fetched: the page asks by id, the address comes from the search here.
const { net } = require('electron');
const fs = require('fs');
const path = require('path');

const API = 'https://wallhaven.cc/api/v1/search';
const SORTS = { top: 'toplist', liked: 'favorites', new: 'date_added', random: 'random' };
let dir = '';
const known = new Map(); // id -> { full, type } from the searches
const init = (userData) => { dir = path.join(userData, 'wallpapers'); fs.mkdirSync(dir, { recursive: true }); };
const isWallhaven = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === host; } catch { return false; } };

async function search({ sort = 'top', q = '', page = 1 } = {}) {
  const p = new URLSearchParams({ categories: '010', purity: '100', atleast: '1920x1080', ratios: '16x9,16x10', sorting: SORTS[sort] || 'toplist', order: 'desc', page: String(Math.max(1, Math.min(50, page | 0 || 1))) });
  if ((SORTS[sort] || 'toplist') === 'toplist') p.set('topRange', '1M');
  const query = String(q || '').trim().slice(0, 60);
  if (query) p.set('q', query);
  const r = await net.fetch(`${API}?${p}`, { headers: { Accept: 'application/json' } });
  if (r.status === 429) throw new Error('Wallhaven says: too many searches, wait a minute');
  if (!r.ok) throw new Error(`Wallhaven answered ${r.status}`);
  const j = await r.json();
  const items = (Array.isArray(j.data) ? j.data : []).filter((w) => w && /^[a-z0-9]{4,10}$/i.test(w.id) && w.purity === 'sfw' && isWallhaven(w.path, 'w.wallhaven.cc') && isWallhaven(w.thumbs?.large, 'th.wallhaven.cc'));
  for (const w of items) known.set(w.id, { full: w.path, type: w.file_type });
  return { items: items.map((w) => ({ id: w.id, thumb: w.thumbs.large, res: w.resolution || '', colors: (w.colors || []).slice(0, 3) })), page: j.meta?.current_page || page, last: j.meta?.last_page || page };
}
/** Download a picture from the last searches; returns its path on disk. */
async function use(id) {
  const w = known.get(String(id));
  if (!w) throw new Error('search again first');
  const ext = w.type === 'image/png' ? 'png' : 'jpg';
  const file = path.join(dir, `wallhaven-${id}.${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) return file; // already here
  const r = await net.fetch(w.full);
  if (!r.ok) throw new Error(`download failed (${r.status})`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 40e6) throw new Error('the picture is too big');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40e6 || buf.length < 10000) throw new Error('that download didn\'t look like a picture');
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file);
  return file;
}
/** The pictures downloaded so far, newest first. */
function downloaded() {
  try {
    return fs.readdirSync(dir).filter((f) => /^wallhaven-[a-z0-9]+\.(jpg|png)$/i.test(f))
      .map((f) => ({ name: f, time: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.time - a.time).map((x) => x.name);
  } catch { return []; }
}
const fileOf = (name) => (/^wallhaven-[a-z0-9]+\.(jpg|png)$/i.test(name) ? path.join(dir, name) : '');
module.exports = { init, search, use, downloaded, fileOf, dir: () => dir };
