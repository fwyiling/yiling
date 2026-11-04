// Ani Manga streaming source: hianimes.se ("HiAnime"). The site is a front end for a JSON API
// (animehot.cc, with anitv.cfd as its own fallback). Each episode lists embedded players keyed by
// MyAnimeList id, e.g. https://zokoanime.video/stream/mal/3848/1/sub
export const HIANIME_HOST = 'hianimes.se';
export const API_HOSTS = ['animehot.cc', 'anitv.cfd'];
export const PLAYER_HOSTS = ['zokoanime.video'];
const APIS = API_HOSTS.map((h) => `https://${h}/api`);

async function api(method, path, body) {
  let last;
  for (const base of APIS) {
    const host = new URL(base).host;
    try {
      const r = await fetch(base + path, {
        method, credentials: 'omit', signal: AbortSignal.timeout(12000),
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.ok) return await r.json();
      last = new Error(`${host} answered ${r.status}`);
    } catch (e) {
      last = new Error(`can't reach ${host} (${e.message})`);
    }
  }
  throw last;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const asList = (d) => (Array.isArray(d) ? d : d?.results || d?.data || d?.animes || []);
const slugOf = (x) => x?.slug || (Array.isArray(x?.slugs) ? x.slugs[0] : x?.slugs) || '';
const toShow = (a) => ({ id: a._id || a.id, malId: a.mal_id ?? null, title: a.title, slug: slugOf(a), total: Number(a.totalEpisodes) || 0, cover: a.image || '' });

/**
 * Find a show. With a MyAnimeList id only an exact id match (or an exact title match) counts,
 * so "One Piece" never lands on one of the One Piece movies.
 */
export async function findAnime({ malId, titles }) {
  const wanted = new Set(titles.filter(Boolean).map(norm));
  let titleHit = null, first = null;
  for (const t of [...new Set(titles.filter(Boolean))]) {
    const list = asList(await api('POST', '/search', { title: t }));
    const exact = malId && list.find((a) => Number(a.mal_id) === Number(malId));
    if (exact) return toShow(exact);
    titleHit ||= list.find((a) => wanted.has(norm(a.title)));
    first ||= list[0];
  }
  if (titleHit) return toShow(titleHit);
  return !malId && first ? toShow(first) : null;
}

/** Every episode of a show (the API pages them 100 at a time). */
export async function fetchEpisodes(show) {
  const page = (start) => api('GET', `/episodes/${encodeURIComponent(show.id)}?start=${start}&end=${start + 99}`).then((d) => d?.episodes || []);
  let raw;
  if (show.total > 100) {
    const starts = Array.from({ length: Math.ceil(show.total / 100) }, (_, i) => i * 100 + 1);
    raw = (await Promise.all(starts.map(page))).flat();
  } else {
    raw = [];
    for (let s = 1; s < 5000; s += 100) { const p = await page(s); raw.push(...p); if (p.length < 100) break; }
  }
  const seen = new Set();
  return raw
    .map((ep) => ({
      id: ep.id || ep._id,
      number: Number(ep.episodeNumber),
      title: ep.title || `Episode ${ep.episodeNumber}`,
      slug: slugOf(ep),
      sub: (ep.link?.sub || []).filter(Boolean),
      dub: (ep.link?.dub || []).filter(Boolean),
      filler: !!ep.filler,
    }))
    .filter((ep) => Number.isFinite(ep.number) && !seen.has(ep.number) && seen.add(ep.number))
    .sort((a, b) => a.number - b.number);
}

export const watchUrl = (ep) => `https://${HIANIME_HOST}/watch/${ep.slug}`;
export const isPlaylist = (u) => /\.m3u8(\?|$)/i.test(u);
export const isVideoFile = (u) => /\.(mp4|webm|mkv|ogg)(\?|$)/i.test(u);
/** Hosts the background may open in a hidden tab to pick up a stream. */
export const capturable = (u) => {
  try {
    const { protocol, hostname } = new URL(u);
    return protocol === 'https:' && [HIANIME_HOST, ...PLAYER_HOSTS].some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};
