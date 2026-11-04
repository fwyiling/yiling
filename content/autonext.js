(() => {
  // ../lib/extract.js
  function scanDocument(docArg, hrefArg) {
    const doc = docArg || document;
    const href = hrefArg || location.href;
    const live = !docArg;
    const abs = (u) => {
      try {
        return new URL(u, href).href;
      } catch {
        return "";
      }
    };
    const norm = (u) => u.replace(/#.*$/, "").replace(/\/+$/, "");
    const text = (el) => ((live ? el.innerText : el.textContent) || "").trim();
    const ancestors = (el, max = 6) => {
      const out = [];
      for (let n = el.parentElement, i = 0; n && i < max; n = n.parentElement, i++) out.push(n);
      return out;
    };
    const best = (items, weight) => {
      const counts = /* @__PURE__ */ new Map();
      for (const it of items) for (const a of ancestors(it)) counts.set(a, (counts.get(a) || 0) + weight(it));
      let top = null, topN = 0;
      for (const [el, n] of counts) if (n > topN || n === topN && top && top.contains(el)) {
        top = el;
        topN = n;
      }
      return top;
    };
    const LAZY = ["data-src", "data-lazy-src", "data-original", "data-url", "data-cfsrc", "data-lazy", "data-echo", "data-img", "data-pagespeed-lazy-src"];
    const BAD = /(logo|avatar|icon|banner|sprite|emoji|button|loading|spinner|placeholder|pixel|blank|gravatar|thumb)/i;
    const srcOf = (img) => {
      for (const k of LAZY) {
        const v = img.getAttribute(k);
        if (v && v.trim() && !v.startsWith("data:")) return v.trim();
      }
      const ss = img.getAttribute("data-srcset") || img.getAttribute("srcset");
      if (ss) {
        const last = ss.split(",").pop().trim().split(/\s+/)[0];
        if (last) return last;
      }
      return (live ? img.currentSrc || img.src : img.getAttribute("src")) || "";
    };
    const okImg = (img) => {
      const src = srcOf(img);
      if (!src || src.startsWith("data:") || /\.svg(\?|$)/i.test(src)) return false;
      if (BAD.test(src + " " + (img.className || "") + " " + (img.id || "") + " " + (img.alt || ""))) return false;
      if (live) {
        const lazy = LAZY.some((k) => img.hasAttribute(k));
        return img.naturalWidth >= 300 || img.width >= 300 || img.naturalWidth === 0 && lazy;
      }
      const w = parseInt(img.getAttribute("width"), 10);
      return !(w && w < 200);
    };
    const imgs = [...doc.querySelectorAll("img")].filter(okImg);
    let images = [];
    const box = imgs.length ? best(imgs, () => 1) : null;
    if (box) images = [...new Set([...box.querySelectorAll("img")].filter(okImg).map((i) => abs(srcOf(i))).filter(Boolean))];
    let body = "";
    const paras = [...doc.querySelectorAll("p")].filter((p) => text(p).length >= 40);
    const tBox = paras.length ? best(paras, (p) => text(p).length) : null;
    if (tBox) body = [...tBox.querySelectorAll("p")].map(text).filter(Boolean).join("\n\n");
    if (body.length < 500) {
      const cands2 = [...doc.querySelectorAll("#content,.content,#chapter-content,.chapter-content,.entry-content,#chr-content,.reading-content,.text-left,.chapter-c,article")];
      let top = null;
      for (const c of cands2) if (!top || c.textContent.length > top.textContent.length) top = c;
      if (top && top.textContent.length > body.length) {
        const clone = top.cloneNode(true);
        clone.querySelectorAll("script,style,noscript,iframe,ins,.ads,.adsbygoogle").forEach((n) => n.remove());
        clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        body = clone.textContent.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean).join("\n\n");
      }
    }
    const RX = /(?:chapter|chap|ch|episode|ep)\.?[\s_\-]*(\d+(?:\.\d+)?)/i;
    const here = new URL(href);
    const site = (h) => h.replace(/^www\./, "");
    const groupKey = (u) => {
      const U = new URL(u);
      const segs = U.pathname.replace(/\/+$/, "").split("/");
      const last = segs.pop() || "";
      const keys = [...U.searchParams.keys()].sort().join("&");
      return segs.join("/") + "/" + last.replace(/\d.*$/, "") + "?" + keys;
    };
    const cands = [];
    const consider = (raw, label) => {
      const u = abs(raw);
      if (!/^https?:/.test(u)) return;
      const U = new URL(u);
      if (site(U.hostname) !== site(here.hostname)) return;
      const lbl = (label || "").replace(/\s+/g, " ").trim();
      let path = U.pathname + U.search;
      try {
        path = decodeURIComponent(path);
      } catch {
      }
      const m = RX.exec(lbl) || RX.exec(path);
      if (!m) return;
      cands.push({ url: norm(u), num: parseFloat(m[1]), label: lbl.slice(0, 90) || `Chapter ${m[1]}` });
    };
    doc.querySelectorAll("a[href]").forEach((a) => consider(a.getAttribute("href"), a.textContent));
    doc.querySelectorAll("select option").forEach((o) => {
      const v = o.getAttribute("data-url") || o.value;
      if (v && /[/?]/.test(v)) consider(v, o.textContent);
    });
    const groups = /* @__PURE__ */ new Map();
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
    const pageTitle = text(doc.querySelector("h1") || doc.createElement("i")) || (doc.title || "").trim();
    const curNum = (RX.exec(pageTitle) || RX.exec(decodeURIComponent(here.pathname)) || [])[1];
    let chapters = [];
    if (chosen) {
      if (curNum && !chosen.some((c) => c.url === cur)) chosen.push({ url: cur, num: parseFloat(curNum), label: pageTitle.slice(0, 90) });
      const seenU = /* @__PURE__ */ new Set(), seenN = /* @__PURE__ */ new Set();
      for (const c of chosen) {
        if (seenU.has(c.url) || seenN.has(c.num)) continue;
        seenU.add(c.url);
        seenN.add(c.num);
        chapters.push(c);
      }
      chapters.sort((a, b) => a.num - b.num);
      chapters = chapters.slice(0, 3e3);
    }
    let currentIndex = chapters.findIndex((c) => c.url === cur);
    if (currentIndex < 0 && curNum) currentIndex = chapters.findIndex((c) => c.num === parseFloat(curNum));
    const og = doc.querySelector('meta[property="og:title"]');
    const rawTitle = pageTitle || og && og.getAttribute("content") || doc.title || "Download";
    const series = rawTitle.replace(/[\s\-–—|:,]*(?:chapter|chap|ch|episode|ep)\.?\s*\d+(?:\.\d+)?.*$/i, "").replace(/\s*[|\-–—]\s*(read|manga|manhwa|online|free).*$/i, "").trim() || rawTitle;
    return {
      title: rawTitle.trim(),
      series,
      url: href,
      origin: here.origin,
      images,
      text: body,
      chapters,
      currentIndex
    };
  }

  // ../content/src/autonext.js
  (() => {
    if (window.top !== window) return;
    if (/(^|\.)(mangadex\.org|youtube\.com|google\.[a-z.]+|bing\.com|github\.com|reddit\.com)$/.test(location.hostname)) return;
    const LIKELY = /chapter|chap[-_.\s]?\d|ch[-_.]\d|episode|ep[-_.]\d|\/read\/|第.{1,8}[章话話回]|capitulo|chapitre/i;
    if (!LIKELY.test(location.href + " " + document.title)) return;
    const abs = (u, base) => {
      try {
        return new URL(u, base).href;
      } catch {
        return null;
      }
    };
    const NEXT_TEXT = /^(next|next chapter|next page|next episode|next ch\.?|下一[章页頁話话回]|下一章节|次へ|次の話|다음|siguiente|suivant|próximo|›|»|→|>>|next\s*[›»→>])$/i;
    function findNext(doc, base) {
      const host = new URL(base).hostname;
      const rel = doc.querySelector('link[rel="next"], a[rel="next"]');
      const cands = [];
      if (rel) cands.push(rel.getAttribute("href"));
      for (const a of doc.querySelectorAll("a[href]")) {
        const t = (a.textContent || a.getAttribute("title") || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        if (NEXT_TEXT.test(t) || /\bnext\b/i.test(`${a.className} ${a.id}`) && t.length < 30) cands.push(a.getAttribute("href"));
      }
      for (const c of cands) {
        const u = c && !/^(javascript:|#)/i.test(c) ? abs(c, base) : null;
        if (u && new URL(u).hostname === host && u.split("#")[0] !== base.split("#")[0]) return u;
      }
      return null;
    }
    chrome.storage.sync.get("autoNext", ({ autoNext }) => {
      if (autoNext !== false) setTimeout(start, 800);
    });
    function start() {
      const first = scanDocument(null, null);
      const kind = first.images.length >= 3 ? "images" : first.text.length >= 1500 ? "text" : null;
      let next = kind && findNext(document, location.href);
      if (!next) return;
      let loading = false, count = 0;
      const bar = document.createElement("div");
      bar.id = "sc-autonext";
      bar.style.cssText = "margin:32px auto;max-width:720px;padding:14px 18px;border-radius:12px;background:#17121f;color:#e9e3f3;font:500 14px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 4px 20px #0005";
      const say = (html) => {
        bar.innerHTML = html;
      };
      say("Shield Client \xB7 the next chapter loads automatically when you get here \u2193");
      (document.querySelector("main, article, #content, .content") || document.body).append(bar);
      const io = new IntersectionObserver((es) => {
        if (es[0].isIntersecting) load();
      }, { rootMargin: "1600px 0px" });
      io.observe(bar);
      async function load() {
        if (loading || !next || count >= 40) return;
        loading = true;
        say("Loading the next chapter\u2026");
        const url = next;
        try {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(res.status);
          const doc = new DOMParser().parseFromString(await res.text(), "text/html");
          const r = scanDocument(doc, url);
          if (kind === "images" && r.images.length < 3 || kind === "text" && r.text.length < 500) throw new Error("reader needs JavaScript");
          const sec = document.createElement("section");
          sec.className = "sc-next-chapter";
          sec.style.cssText = "margin:0 auto;max-width:100%";
          const h = document.createElement("div");
          h.textContent = r.title;
          h.style.cssText = "margin:28px auto 16px;max-width:720px;padding:10px 16px;border-radius:10px;background:#17121f;color:#fff;font:600 16px system-ui,sans-serif;text-align:center";
          sec.append(h);
          if (kind === "images") {
            for (const src of r.images) {
              const img = new Image();
              img.loading = "lazy";
              img.decoding = "async";
              img.src = src;
              img.style.cssText = "display:block;max-width:100%;margin:0 auto";
              sec.append(img);
            }
          } else {
            const art = document.createElement("div");
            art.style.cssText = "max-width:760px;margin:0 auto;font-size:1.05em;line-height:1.75";
            for (const p of r.text.split(/\n{2,}/)) {
              const el = document.createElement("p");
              el.textContent = p;
              art.append(el);
            }
            sec.append(art);
          }
          bar.before(sec);
          if (new URL(url).origin === location.origin) history.replaceState(history.state, "", url);
          document.title = r.title;
          count++;
          next = findNext(doc, url);
          say(next ? "Keep scrolling \u2013 the next chapter loads automatically \u2193" : "You're on the latest chapter.");
        } catch {
          io.disconnect();
          say(`<a href="${url.replace(/"/g, "%22")}" style="color:#ff6b8b;font-weight:700;text-decoration:none">Next chapter \u2192</a>`);
        }
        loading = false;
      }
    }
  })();
})();
