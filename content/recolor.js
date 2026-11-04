// Cyber recolor for Google Search. Google's class names are obfuscated and change often,
// so instead of guessing selectors we read each element's computed colours and swap
// Google's neutral greys / link blues for the cyber palette (the approach Dark Reader uses).
// Work is done in idle time slices so it never blocks the page.
(() => {
  if (window.top !== window) return;
  const A = 'var(--sc-accent, #5e7d9c)';
  // colours follow the home-page theme (set as CSS variables by theme.js)
  const PALETTE = {
    base: 'color-mix(in srgb, var(--sc-base) 88%, transparent)',
    raised: 'var(--sc-mantle)',
    raised2: 'var(--sc-surface)',
    border: 'var(--sc-border)',
    link: 'var(--sc-link)',
  };
  const RGB = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/;
  const parse = (c) => { const m = RGB.exec(c || ''); return m && [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; };
  const neutral = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 14;
  const lum = (c) => (c[0] + c[1] + c[2]) / 3;
  const set = (el, prop, val) => el.style.setProperty(prop, val, 'important');

  const done = new WeakSet();
  function fix(el) {
    if (done.has(el) || el.id === 'shield-client-theme' || el.tagName === 'SHIELD-CLIENT-DOCK') return;
    done.add(el);
    const cs = getComputedStyle(el);

    const bg = parse(cs.backgroundColor);
    if (bg && bg[3] > 0.5 && neutral(bg)) {
      const L = lum(bg);
      if (L >= 14 && L < 40) set(el, 'background-color', PALETTE.base);
      else if (L >= 40 && L < 62) set(el, 'background-color', PALETTE.raised);
      else if (L >= 62 && L < 100) set(el, 'background-color', PALETTE.raised2);
    }

    const bi = cs.backgroundImage;
    if (bi && bi !== 'none' && bi.includes('gradient')) {
      const nb = bi.replace(new RegExp(RGB.source, 'g'), (m, r, g, b, a) => {
        const c = [+r, +g, +b];
        return neutral(c) && lum(c) >= 14 && lum(c) < 45 ? `color-mix(in srgb, var(--sc-base) ${a !== undefined ? Math.round(a * 100) : 100}%, transparent)` : m;
      });
      if (nb !== bi) set(el, 'background-image', nb);
    }

    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) {
      const bc = parse(cs.borderTopColor) || parse(cs.borderBottomColor);
      if (bc && bc[3] > 0 && neutral(bc) && lum(bc) >= 40 && lum(bc) < 120) set(el, 'border-color', PALETTE.border);
    }

    const fg = parse(cs.color);
    if (fg && fg[2] > fg[0] + 50 && fg[2] > fg[1] + 15 && lum(fg) > 120) set(el, 'color', PALETTE.link);
  }

  // ---- idle-time queue ----
  const queue = [];
  let scheduled = false;
  const idle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 16));
  function pump(deadline) {
    scheduled = false;
    let n = 0;
    while (queue.length && (deadline.timeRemaining() > 2 || n < 50)) {
      const el = queue.pop();
      if (el.isConnected) fix(el);
      n++;
    }
    if (queue.length) schedule();
  }
  function schedule() { if (!scheduled) { scheduled = true; idle(pump, { timeout: 300 }); } }
  function enqueueTree(rootEl) {
    if (rootEl.nodeType !== 1) return;
    queue.push(rootEl);
    const all = rootEl.getElementsByTagName('*');
    for (let i = all.length - 1; i >= 0; i--) queue.push(all[i]);
    schedule();
  }

  function start() {
    // first screen right away so there's no grey flash, the rest in idle time
    const all = document.body.getElementsByTagName('*');
    const first = Math.min(all.length, 600);
    fix(document.body);
    for (let i = 0; i < first; i++) fix(all[i]);
    for (let i = all.length - 1; i >= first; i--) queue.push(all[i]);
    schedule();
    new MutationObserver((muts) => {
      for (const m of muts) for (const node of m.addedNodes) enqueueTree(node);
    }).observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.sync.get('webSkin', ({ webSkin }) => {
    if (webSkin === false) return;
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  });
  // turning the skin off: reload so Google's own colours come back
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c.webSkin && c.webSkin.newValue === false) location.reload(); });
})();
