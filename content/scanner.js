// Injected on demand (scripting.executeScript). Returns the chapter images / text on the page.
(() => {
  const ancestors = (el, max = 6) => {
    const out = [];
    for (let n = el.parentElement, i = 0; n && i < max; n = n.parentElement, i++) out.push(n);
    return out;
  };
  const best = (items, weight) => {
    const counts = new Map();
    for (const it of items) for (const a of ancestors(it)) counts.set(a, (counts.get(a) || 0) + weight(it));
    let top = null, topN = 0;
    for (const [el, n] of counts) if (n > topN || (n === topN && top && top.contains(el))) { top = el; topN = n; }
    return top;
  };
  const srcOf = (img) => {
    const a = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-cfsrc'];
    for (const k of a) { const v = img.getAttribute(k); if (v && v.trim()) return v.trim(); }
    return img.currentSrc || img.src || '';
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ''; } };

  // ---- images (manga / manhwa) ----
  const imgs = [...document.images].filter((img) => {
    const src = srcOf(img);
    if (!src || src.startsWith('data:')) return false;
    const big = img.naturalWidth >= 300 || img.width >= 300;
    const lazyUnknown = img.naturalWidth === 0 && img.getAttribute('data-src');
    return big || lazyUnknown;
  });
  let images = [];
  const container = imgs.length ? best(imgs, () => 1) : null;
  if (container) {
    images = [...container.querySelectorAll('img')].map((i) => abs(srcOf(i))).filter(Boolean);
    images = [...new Set(images)];
  }

  // ---- text (novels) ----
  const paras = [...document.querySelectorAll('p')].filter((p) => p.innerText.trim().length >= 40);
  let text = '';
  const tContainer = paras.length ? best(paras, (p) => p.innerText.length) : null;
  if (tContainer) {
    const parts = [...tContainer.querySelectorAll('p')].map((p) => p.innerText.trim()).filter(Boolean);
    text = parts.join('\n\n');
  }

  const heading = document.querySelector('h1');
  return {
    title: (heading?.innerText || document.title || 'download').trim(),
    pageTitle: document.title,
    url: location.href,
    origin: location.origin,
    images,
    text,
  };
})();
