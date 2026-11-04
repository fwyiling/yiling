// Continue watching. amWatching is a short list of where you stopped in each show; amShow_<key>
// keeps that show's episode list and which episodes you've finished, so a resume needs no lookups.
const LIST = 'amWatching', MAX = 12;
const showId = (key) => `amShow_${key}`;
export const showKey = (job) => String(job.aniId || job.anime);

export async function getWatching() {
  const { [LIST]: list = [] } = await chrome.storage.local.get(LIST);
  return list;
}

export async function loadShow(key) {
  const { [showId(key)]: show } = await chrome.storage.local.get(showId(key));
  return show || null;
}

/** Remember the show's episode list (called when the player opens). Returns the episodes already finished. */
export async function rememberShow(job) {
  const key = showKey(job), old = await loadShow(key);
  const show = { anime: job.anime, aniId: job.aniId || null, cover: job.cover || '', episodes: job.episodes, lang: job.lang || 'sub', seen: old?.seen || {} };
  await chrome.storage.local.set({ [showId(key)]: show });
  return show.seen;
}

/** Save the position in an episode; an episode past 90% counts as watched. */
export async function saveProgress(job, idx, time, duration, { syncList = true } = {}) {
  const key = showKey(job), ep = job.episodes[idx];
  if (!ep || !Number.isFinite(time)) return null;
  const done = duration > 0 && time / duration >= 0.9;
  const show = (await loadShow(key)) || { anime: job.anime, aniId: job.aniId || null, cover: job.cover || '', episodes: job.episodes, seen: {} };
  if (done && !show.seen[ep.number]) {
    show.seen[ep.number] = 1;
    if (syncList && job.aniId) await bumpListProgress(job.aniId, ep.number);
  }
  show.lang = job.lang || show.lang;
  let list = (await getWatching()).filter((w) => w.key !== key);
  const last = idx >= job.episodes.length - 1;
  if (!(done && last)) { // finishing the final episode takes the show off the list
    const next = done ? idx + 1 : idx; // a finished episode resumes at the next one
    list.unshift({
      key, anime: job.anime, cover: job.cover || '', idx: next, number: job.episodes[next].number, total: job.episodes.length,
      time: done ? 0 : Math.floor(time), duration: done ? 0 : Math.floor(duration || 0), updatedAt: Date.now(),
    });
  }
  list = list.slice(0, MAX);
  await chrome.storage.local.set({ [LIST]: list, [showId(key)]: show });
  return show.seen;
}

async function bumpListProgress(aniId, number) {
  const { animeList = [] } = await chrome.storage.local.get('animeList');
  const e = animeList.find((a) => a.id === aniId);
  if (e && (e.progress || 0) < number) { e.progress = number; await chrome.storage.local.set({ animeList }); }
}

export async function forget(key) {
  const list = (await getWatching()).filter((w) => w.key !== key);
  await chrome.storage.local.set({ [LIST]: list });
}

export async function clearWatching() {
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove([LIST, ...Object.keys(all).filter((k) => k.startsWith('amShow_'))]);
}

export const resumeUrl = (key) => chrome.runtime.getURL(`anime/player.html?resume=${encodeURIComponent(key)}`);
export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
