// Page scanning shared by the popup/dock (run inside the tab via scripting.executeScript)
// and the downloader page (run on fetched HTML). Every function here must be
// self-contained: executeScript serialises them, so no outer references.

/** Find chapter images, novel text and the series' chapter list in a document. */
export function scanDocument(docArg, hrefArg) {
  const doc = docArg || document;
  const href = hrefArg || location.href;
  const live = !docArg;
  const abs = (u) => { try { return new URL(u, href).href; } catch { return ''; } };
  const norm = (u) => u.replace(/#.*$/, '').replace(/\/+$/, '');
  const text = (el) => ((live ? el.innerText : el.textContent) || '').trim();

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

  // ---------- images (manga / manhwa / webtoon) ----------
  const LAZY = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-cfsrc', 'data-lazy', 'data-echo', 'data-img', 'data-pagespeed-lazy-src'];
  const BAD = /(logo|avatar|icon|banner|sprite|emoji|button|loading|spinner|placeholder|pixel|blank|gravatar|thumb)/i;
  const srcOf = (img) => {
    for (const k of LAZY) { const v = img.getAttribute(k); if (v && v.trim() && !v.startsWith('data:')) return v.trim(); }
    const ss = img.getAttribute('data-srcset') || img.getAttribute('srcset');
    if (ss) { const last = ss.split(',').pop().trim().split(/\s+/)[0]; if (last) return last; }
    return (live ? img.currentSrc || img.src : img.getAttribute('src')) || '';
  };
  const okImg = (img) => {
    const src = srcOf(img);
    if (!src || src.startsWith('data:') || /\.svg(\?|$)/i.test(src)) return false;
    if (BAD.test(src + ' ' + (img.className || '') + ' ' + (img.id || '') + ' ' + (img.alt || ''))) return false;
    if (live) {
      const lazy = LAZY.some((k) => img.hasAttribute(k));
      return img.naturalWidth >= 300 || img.width >= 300 || (img.naturalWidth === 0 && lazy);
    }
    const w = parseInt(img.getAttribute('width'), 10);
    return !(w && w < 200);
  };
  const imgs = [...doc.querySelectorAll('img')].filter(okImg);
  let images = [];
  const box = imgs.length ? best(imgs, () => 1) : null;
  if (box) images = [...new Set([...box.querySelectorAll('img')].filter(okImg).map((i) => abs(srcOf(i))).filter(Boolean))];

  // ---------- text (web novels) ----------
  let body = '';
  const paras = [...doc.querySelectorAll('p')].filter((p) => text(p).length >= 40);
  const tBox = paras.length ? best(paras, (p) => text(p).length) : null;
  if (tBox) body = [...tBox.querySelectorAll('p')].map(text).filter(Boolean).join('\n\n');
  if (body.length < 500) {
    const cands = [...doc.querySelectorAll('#content,.content,#chapter-content,.chapter-content,.entry-content,#chr-content,.reading-content,.text-left,.chapter-c,article')];
    let top = null;
    for (const c of cands) if (!top || c.textContent.length > top.textContent.length) top = c;
    if (top && top.textContent.length > body.length) {
      const clone = top.cloneNode(true);
      clone.querySelectorAll('script,style,noscript,iframe,ins,.ads,.adsbygoogle').forEach((n) => n.remove());
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      body = clone.textContent.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean).join('\n\n');
    }
  }

  // ---------- chapter list ----------
  const RX = /(?:chapter|chap|ch|episode|ep)\.?[\s_\-]*(\d+(?:\.\d+)?)/i;
  const here = new URL(href);
  const site = (h) => h.replace(/^www\./, '');
  const groupKey = (u) => {
    const U = new URL(u);
    const segs = U.pathname.replace(/\/+$/, '').split('/');
    const last = segs.pop() || '';
    const keys = [...U.searchParams.keys()].sort().join('&');
    return segs.join('/') + '/' + last.replace(/\d.*$/, '') + '?' + keys;
  };
  const cands = [];
  const consider = (raw, label) => {
    const u = abs(raw);
    if (!/^https?:/.test(u)) return;
    const U = new URL(u);
    if (site(U.hostname) !== site(here.hostname)) return;
    const lbl = (label || '').replace(/\s+/g, ' ').trim();
    let path = U.pathname + U.search;
    try { path = decodeURIComponent(path); } catch {}
    const m = RX.exec(lbl) || RX.exec(path);
    if (!m) return;
    cands.push({ url: norm(u), num: parseFloat(m[1]), label: lbl.slice(0, 90) || `Chapter ${m[1]}` });
  };
  doc.querySelectorAll('a[href]').forEach((a) => consider(a.getAttribute('href'), a.textContent));
  doc.querySelectorAll('select option').forEach((o) => {
    const v = o.getAttribute('data-url') || o.value;
    if (v && /[/?]/.test(v)) consider(v, o.textContent);
  });
  const groups = new Map();
  for (const c of cands) {
    const k = groupKey(c.url);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const cur = norm(href);
  let chosen = groups.get(groupKey(cur));
  if (!chosen || chosen.length < 2) {
    chosen = null;
    for (const g of groups.values()) if (g.length >= 2 && (!chosen || g.length > chosen.length)) chosen = g;
  }
  const pageTitle = text(doc.querySelector('h1') || doc.createElement('i')) || (doc.title || '').trim();
  const curNum = (RX.exec(pageTitle) || RX.exec(decodeURIComponent(here.pathname)) || [])[1];
  let chapters = [];
  if (chosen) {
    if (curNum && !chosen.some((c) => c.url === cur)) chosen.push({ url: cur, num: parseFloat(curNum), label: pageTitle.slice(0, 90) });
    const seenU = new Set(), seenN = new Set();
    for (const c of chosen) {
      if (seenU.has(c.url) || seenN.has(c.num)) continue;
      seenU.add(c.url); seenN.add(c.num); chapters.push(c);
    }
    chapters.sort((a, b) => a.num - b.num);
    chapters = chapters.slice(0, 3000);
  }
  let currentIndex = chapters.findIndex((c) => c.url === cur);
  if (currentIndex < 0 && curNum) currentIndex = chapters.findIndex((c) => c.num === parseFloat(curNum));

  const og = doc.querySelector('meta[property="og:title"]');
  const rawTitle = pageTitle || (og && og.getAttribute('content')) || doc.title || 'Download';
  const series = rawTitle
    .replace(/[\s\-–—|:,]*(?:chapter|chap|ch|episode|ep)\.?\s*\d+(?:\.\d+)?.*$/i, '')
    .replace(/\s*[|\-–—]\s*(read|manga|manhwa|online|free).*$/i, '')
    .trim() || rawTitle;

  return {
    title: rawTitle.trim(),
    series,
    url: href,
    origin: here.origin,
    images,
    text: body,
    chapters,
    currentIndex,
  };
}

/** Scroll through the page so lazy-loaded images load. Runs inside a tab. */
export async function autoScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = Date.now();
  let last = -1;
  while (Date.now() - start < 60000) {
    window.scrollBy(0, Math.max(400, innerHeight * 0.9));
    await sleep(180);
    const y = scrollY + innerHeight;
    if (y >= document.documentElement.scrollHeight - 5) {
      if (last === document.documentElement.scrollHeight) break;
      last = document.documentElement.scrollHeight;
      await sleep(700);
    }
  }
  window.scrollTo(0, 0);
  await sleep(300);
  return true;
}
