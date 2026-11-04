// Runs in YouTube's own page context at document_start.
// Same idea as uBlock Origin Lite's YouTube filters: remove the ad instructions from
// YouTube's player data *before* the player reads them, so no ad is ever scheduled.
// Nothing is blocked mid-playback, so the video itself is never interrupted.
(() => {
  let on = true;
  try { on = localStorage.getItem('__shieldYtAds') !== '0'; } catch {}
  if (!on) return;

  const KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const prune = (o) => {
    if (!o || typeof o !== 'object') return o;
    for (const k of KEYS) if (k in o) delete o[k];
    if (o.playerResponse && typeof o.playerResponse === 'object') prune(o.playerResponse);
    return o;
  };
  const hasAds = (o) => o && typeof o === 'object' && (KEYS.some((k) => k in o) || (o.playerResponse && typeof o.playerResponse === 'object'));

  // 1) JSON responses parsed by the player (player / next endpoints)
  const parse = JSON.parse;
  JSON.parse = function (...args) {
    const r = parse.apply(this, args);
    try { if (hasAds(r)) prune(r); } catch {}
    return r;
  };

  // 2) fetch().json() on the player endpoints
  const rjson = Response.prototype.json;
  Response.prototype.json = function () {
    const url = this.url || '';
    return rjson.call(this).then((r) => {
      try { if (/\/youtubei\/v1\/(player|next|reel)/.test(url)) prune(r); } catch {}
      return r;
    });
  };

  // 3) the initial player data embedded in the page
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    let val;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { return val; },
        set(v) { val = prune(v); },
      });
    } catch {}
  }
})();
