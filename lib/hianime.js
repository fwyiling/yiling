// HiAnime (hianime.com) integration — search, episode listing, stream source resolution.
// Decryption uses the enimax-anime/key index to reconstruct the AES passphrase from the
// ciphertext itself, then decrypts with AES-CBC using an OpenSSL-compatible key derivation.
const BASE = 'https://hianime.com';
const KEY_URL = 'https://raw.githubusercontent.com/enimax-anime/key/e4/key.txt';

// ---- compact MD5 (needed for OpenSSL EVP_BytesToKey) ----
function _md5(str) {
  function sadd(x, y) { const l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
  function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
  function cmn(q, a, b, x, s, t) { return sadd(rol(sadd(sadd(a, q), sadd(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  const nb = ((str.length + 8) >> 6) + 1;
  const blk = new Array(nb * 16).fill(0);
  for (let i = 0; i < str.length; i++) blk[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
  blk[str.length >> 2] |= 0x80 << ((str.length % 4) * 8);
  blk[nb * 16 - 2] = str.length * 8;
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < blk.length; i += 16) {
    let [oa, ob, oc, od] = [a, b, c, d];
    a=ff(a,b,c,d,blk[i],7,-680876936);d=ff(d,a,b,c,blk[i+1],12,-389564586);c=ff(c,d,a,b,blk[i+2],17,606105819);b=ff(b,c,d,a,blk[i+3],22,-1044525330);
    a=ff(a,b,c,d,blk[i+4],7,-176418897);d=ff(d,a,b,c,blk[i+5],12,1200080426);c=ff(c,d,a,b,blk[i+6],17,-1473231341);b=ff(b,c,d,a,blk[i+7],22,-45705983);
    a=ff(a,b,c,d,blk[i+8],7,1770035416);d=ff(d,a,b,c,blk[i+9],12,-1958414417);c=ff(c,d,a,b,blk[i+10],17,-42063);b=ff(b,c,d,a,blk[i+11],22,-1990404162);
    a=ff(a,b,c,d,blk[i+12],7,1804603682);d=ff(d,a,b,c,blk[i+13],12,-40341101);c=ff(c,d,a,b,blk[i+14],17,-1502002290);b=ff(b,c,d,a,blk[i+15],22,1236535329);
    a=gg(a,b,c,d,blk[i+1],5,-165796510);d=gg(d,a,b,c,blk[i+6],9,-1069501632);c=gg(c,d,a,b,blk[i+11],14,643717713);b=gg(b,c,d,a,blk[i],20,-373897302);
    a=gg(a,b,c,d,blk[i+5],5,-701558691);d=gg(d,a,b,c,blk[i+10],9,38016083);c=gg(c,d,a,b,blk[i+15],14,-660478335);b=gg(b,c,d,a,blk[i+4],20,-405537848);
    a=gg(a,b,c,d,blk[i+9],5,568446438);d=gg(d,a,b,c,blk[i+14],9,-1019803690);c=gg(c,d,a,b,blk[i+3],14,-187363961);b=gg(b,c,d,a,blk[i+8],20,1163531501);
    a=gg(a,b,c,d,blk[i+13],5,-1444681467);d=gg(d,a,b,c,blk[i+2],9,-51403784);c=gg(c,d,a,b,blk[i+7],14,1735328473);b=gg(b,c,d,a,blk[i+12],20,-1926607734);
    a=hh(a,b,c,d,blk[i+5],4,-378558);d=hh(d,a,b,c,blk[i+8],11,-2022574463);c=hh(c,d,a,b,blk[i+11],16,1839030562);b=hh(b,c,d,a,blk[i+14],23,-35309556);
    a=hh(a,b,c,d,blk[i+1],4,-1530992060);d=hh(d,a,b,c,blk[i+4],11,1272893353);c=hh(c,d,a,b,blk[i+7],16,-155497632);b=hh(b,c,d,a,blk[i+10],23,-1094730640);
    a=hh(a,b,c,d,blk[i+13],4,681279174);d=hh(d,a,b,c,blk[i],11,-358537222);c=hh(c,d,a,b,blk[i+3],16,-722521979);b=hh(b,c,d,a,blk[i+6],23,76029189);
    a=hh(a,b,c,d,blk[i+9],4,-640364487);d=hh(d,a,b,c,blk[i+12],11,-421815835);c=hh(c,d,a,b,blk[i+15],16,530742520);b=hh(b,c,d,a,blk[i+2],23,-995338651);
    a=ii(a,b,c,d,blk[i],6,-198630844);d=ii(d,a,b,c,blk[i+7],10,1126891415);c=ii(c,d,a,b,blk[i+14],15,-1416354905);b=ii(b,c,d,a,blk[i+5],21,-57434055);
    a=ii(a,b,c,d,blk[i+12],6,1700485571);d=ii(d,a,b,c,blk[i+3],10,-1894986606);c=ii(c,d,a,b,blk[i+10],15,-1051523);b=ii(b,c,d,a,blk[i+1],21,-2054922799);
    a=ii(a,b,c,d,blk[i+8],6,1873313359);d=ii(d,a,b,c,blk[i+15],10,-30611744);c=ii(c,d,a,b,blk[i+6],15,-1560198380);b=ii(b,c,d,a,blk[i+13],21,1309151649);
    a=ii(a,b,c,d,blk[i+4],6,-145523070);d=ii(d,a,b,c,blk[i+11],10,-1120210379);c=ii(c,d,a,b,blk[i+2],15,718787259);b=ii(b,c,d,a,blk[i+9],21,-343485551);
    a=sadd(a,oa);b=sadd(b,ob);c=sadd(c,oc);d=sadd(d,od);
  }
  const out = new Uint8Array(16);
  [a,b,c,d].forEach((v,i) => { out[i*4]=v&0xff;out[i*4+1]=(v>>8)&0xff;out[i*4+2]=(v>>16)&0xff;out[i*4+3]=(v>>24)&0xff; });
  return out;
}

function _evpKey(pass, salt, kl, il) {
  const p = typeof pass === 'string' ? new TextEncoder().encode(pass) : pass;
  const s = salt || new Uint8Array(0);
  let d = new Uint8Array(0), di = new Uint8Array(0);
  while (d.length < kl + il) {
    const inp = new Uint8Array(di.length + p.length + s.length);
    inp.set(di); inp.set(p, di.length); inp.set(s, di.length + p.length);
    let str = '';
    for (const b of inp) str += String.fromCharCode(b);
    di = _md5(str);
    const nd = new Uint8Array(d.length + di.length); nd.set(d); nd.set(di, d.length); d = nd;
  }
  return { key: d.slice(0, kl), iv: d.slice(kl, kl + il) };
}

async function _decryptAES(b64, passphrase) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const SALT_HDR = [83,97,108,116,101,100,95,95]; // "Salted__"
  let salt, body;
  if (bytes.slice(0,8).every((b,i) => b === SALT_HDR[i])) { salt = bytes.slice(8,16); body = bytes.slice(16); }
  else { salt = new Uint8Array(0); body = bytes; }
  const { key, iv } = _evpKey(passphrase, salt, 32, 16);
  const ck = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, ck, body);
  return new TextDecoder().decode(plain);
}

let _keyCache = null;
async function _getDecryptKey() {
  if (_keyCache) return _keyCache;
  const r = await fetch(KEY_URL, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Key fetch failed (${r.status})`);
  _keyCache = await r.json();
  setTimeout(() => { _keyCache = null; }, 3600000); // refresh every hour
  return _keyCache;
}

async function _megaCloudSources(embedUrl) {
  const url = new URL(embedUrl);
  const id = url.pathname.split('/').pop().split('?')[0];
  // Different CDNs use different API paths
  const isMega = url.hostname.includes('megacloud');
  const apiPath = isMega ? '/embed-2/ajax/e-1/getSources' : '/ajax/getSources';
  const apiUrl = `https://${url.hostname}${apiPath}?id=${id}`;
  const r = await fetch(apiUrl, {
    headers: { Referer: embedUrl, 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Sources API error (${r.status})`);
  const json = await r.json();
  if (!json.sources) throw new Error('No sources in response');

  if (!json.encrypted) {
    return { sources: Array.isArray(json.sources) ? json.sources : [], tracks: json.tracks || [] };
  }

  const pairs = await _getDecryptKey();
  let keyStr = '';
  for (const [s, e] of pairs) keyStr += json.sources.slice(s, e);
  let cipher = json.sources;
  for (const [s, e] of [...pairs].sort((a, b) => b[0] - a[0])) cipher = cipher.slice(0, s) + cipher.slice(e);
  const decrypted = await _decryptAES(cipher, keyStr);
  const sources = JSON.parse(decrypted);
  return { sources: Array.isArray(sources) ? sources : sources?.sources || [], tracks: json.tracks || [] };
}

// ---- public API ----

/** Find a HiAnime show by title. Returns {slug, id, title, cover} or null. */
export async function findAnime(title) {
  const r = await fetch(`${BASE}/search?keyword=${encodeURIComponent(title)}`, {
    credentials: 'omit', signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HiAnime search error (${r.status})`);
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const link = doc.querySelector('.flw-item .film-name a, .flw-item a[href*="/watch/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const m = href.match(/\/([\w-]+-(\d+))\b/);
  if (!m) return null;
  const img = doc.querySelector('.flw-item img');
  return {
    slug: m[1],
    id: m[2],
    title: link.textContent.trim(),
    cover: img?.getAttribute('data-src') || img?.src || '',
  };
}

/** Fetch the episode list for a HiAnime show by its numeric ID. */
export async function fetchEpisodes(hiAnimeId) {
  const r = await fetch(`${BASE}/ajax/v2/episode/list/${hiAnimeId}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Episodes error (${r.status})`);
  const json = await r.json();
  if (!json.html) return [];
  const doc = new DOMParser().parseFromString(json.html, 'text/html');
  return [...doc.querySelectorAll('a[data-id][data-number]')].map(a => ({
    id: a.dataset.id,
    number: parseInt(a.dataset.number, 10),
    title: a.getAttribute('title') || `Episode ${a.dataset.number}`,
    filler: a.classList.contains('filler'),
  }));
}

/**
 * Resolve the streaming sources for an episode server ID.
 * Returns { m3u8, tracks, embedUrl } where m3u8 is the HLS playlist URL and
 * tracks is an array of subtitle/caption track objects.
 */
export async function fetchSources(episodeId) {
  // Step 1: get the list of available streaming servers
  const sr = await fetch(`${BASE}/ajax/v2/episode/servers?episodeId=${episodeId}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/` },
    signal: AbortSignal.timeout(15000),
  });
  if (!sr.ok) throw new Error(`Servers error (${sr.status})`);
  const sJson = await sr.json();
  const sDoc = new DOMParser().parseFromString(sJson.html || '', 'text/html');

  // Prefer hd-1 sub, fall back to any available sub server, then dub
  const serverEl = sDoc.querySelector('[data-type="sub"] [data-id]') ||
                   sDoc.querySelector('[data-id]');
  if (!serverEl) throw new Error('No streaming server found');

  // Step 2: get the embed URL for the chosen server
  const vr = await fetch(`${BASE}/ajax/v2/episode/sources?id=${serverEl.dataset.id}`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/` },
    signal: AbortSignal.timeout(15000),
  });
  if (!vr.ok) throw new Error(`Source URL error (${vr.status})`);
  const vJson = await vr.json();
  const embedUrl = vJson.link;
  if (!embedUrl) throw new Error('No embed URL returned');

  // Step 3: resolve the embed URL to an M3U8 stream
  const { sources, tracks } = await _megaCloudSources(embedUrl);
  const hd = sources.find(s => s.quality === '1080p') ||
             sources.find(s => s.quality === '720p') ||
             sources[0];
  if (!hd?.url) throw new Error('No playable source found');

  return {
    m3u8: hd.url,
    quality: hd.quality || 'auto',
    tracks,
    embedUrl,
    intro: vJson.intro || null,
    outro: vJson.outro || null,
  };
}

/** Build the HiAnime watch page URL for an episode (fallback if sources fail). */
export const watchUrl = (slug, episodeNumber) =>
  `${BASE}/watch/${slug}?ep=${episodeNumber}`;
