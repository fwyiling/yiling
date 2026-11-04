// Strict pop-up guard – runs in the page context at document_start.
// Blocks window.open() to other sites unless you clicked a real, visible button/link.
// Logins and payments (OAuth popups) are always allowed.
(() => {
  if (window.__scPopGuard) return;
  window.__scPopGuard = true;
  let on = true;
  try { on = localStorage.getItem('__shieldPopups') !== '0'; } catch {}
  if (!on) return;

  const SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);
  const site = (h) => { const p = h.replace(/^www\./, '').split('.'); if (p.length <= 2) return p.join('.'); return p.slice(p[p.length - 1].length === 2 && SLD.has(p[p.length - 2]) ? -3 : -2).join('.'); };
  const OK_POPUPS = /^(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|(www\.)?facebook\.com|discord\.com|github\.com|(www\.)?paypal\.com|checkout\.stripe\.com|js\.stripe\.com|(api\.)?twitter\.com|x\.com|(www\.)?twitch\.tv|id\.twitch\.tv|(www\.)?reddit\.com|steamcommunity\.com|(www\.)?patreon\.com|(www\.)?ko-fi\.com|pay\.google\.com|(www\.)?amazon\.[a-z.]+)$/i;

  let lastClick = { t: 0, legit: false };
  const visible = (el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1 || r.width < 2 || r.height < 2) return false;
    return r.width * r.height < innerWidth * innerHeight * 0.6; // giant overlays are traps
  };
  window.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const el = e.target instanceof Element ? e.target.closest('a[href],button,input[type=submit],input[type=button],[role=button],[role=link],select,label') : null;
    lastClick = { t: Date.now(), legit: !!el && visible(el) };
    // click-trap: an invisible / page-covering link that opens another site
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (a && (a.target === '_blank' || a.target === '_new')) {
      try {
        const u = new URL(a.href, location.href);
        if (site(u.hostname) !== site(location.hostname) && !OK_POPUPS.test(u.hostname) && !visible(a) && !(a.textContent || '').trim()) {
          e.preventDefault(); e.stopImmediatePropagation();
          window.postMessage({ source: 'shield-client', type: 'popup-blocked', url: u.href, why: 'hidden link' }, '*');
        }
      } catch {}
    }
  }, true);

  const realOpen = window.open;
  const fake = { closed: true, close() {}, focus() {}, blur() {}, postMessage() {}, location: { href: '' }, document: { write() {}, close() {} } };
  window.open = function (url, ...rest) {
    try {
      const u = new URL(url || 'about:blank', location.href);
      const same = /^(about|javascript|blob|data):/.test(u.protocol) || site(u.hostname) === site(location.hostname);
      const userMeant = lastClick.legit && Date.now() - lastClick.t < 1200;
      if (same || OK_POPUPS.test(u.hostname) || userMeant) return realOpen.call(this, url, ...rest);
      window.postMessage({ source: 'shield-client', type: 'popup-blocked', url: u.href, why: 'pop-up' }, '*');
      return fake;
    } catch { return realOpen.call(this, url, ...rest); }
  };
})();
