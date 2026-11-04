// AniList (https://anilist.co) – free public GraphQL API: anime info, schedules, trailers and
// official "where to watch" links. No account needed.
const CARD = `id idMal title { romaji english native } coverImage { large extraLarge color } bannerImage averageScore episodes format status season seasonYear genres
  nextAiringEpisode { episode airingAt timeUntilAiring }`;
async function gql(query, variables = {}) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000),
  }).catch((e) => { throw new Error(`Can't reach AniList (${e.message})`); });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(j.errors?.[0]?.message || `AniList error ${r.status}`);
  return j.data;
}
export const titleOf = (m) => m.title?.english || m.title?.romaji || m.title?.native || 'Untitled';
export function currentSeason(d = new Date()) {
  const m = d.getMonth();
  return { season: ['WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL', 'WINTER'][m], year: m === 11 ? d.getFullYear() + 1 : d.getFullYear() };
}
export async function trending() {
  return (await gql(`query { Page(perPage: 24) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${CARD} } } }`)).Page.media;
}
export async function seasonal() {
  const { season, year } = currentSeason();
  return (await gql(`query($s: MediaSeason, $y: Int) { Page(perPage: 30) { media(type: ANIME, season: $s, seasonYear: $y, sort: POPULARITY_DESC, isAdult: false) { ${CARD} } } }`, { s: season, y: year })).Page.media;
}
export async function search(q) {
  return (await gql(`query($q: String) { Page(perPage: 30) { media(type: ANIME, search: $q, isAdult: false, sort: SEARCH_MATCH) { ${CARD} } } }`, { q })).Page.media;
}
export async function details(id) {
  return (await gql(`query($id: Int) { Media(id: $id) { ${CARD} description(asHtml: false) duration studios(isMain: true) { nodes { name } }
    trailer { id site } externalLinks { site url type color } streamingEpisodes { title thumbnail url site } } }`, { id })).Media;
}
export async function schedule(fromSec, toSec) {
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const d = await gql(`query($a: Int, $b: Int, $p: Int) { Page(page: $p, perPage: 50) { pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $a, airingAt_lesser: $b, sort: TIME) { airingAt episode media { ${CARD} isAdult } } } }`, { a: fromSec, b: toSec, p: page });
    out.push(...d.Page.airingSchedules.filter((x) => !x.media.isAdult));
    if (!d.Page.pageInfo.hasNextPage) break;
  }
  return out;
}
export async function byIds(ids) {
  if (!ids.length) return [];
  return (await gql(`query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { ${CARD} } } }`, { ids })).Page.media;
}
