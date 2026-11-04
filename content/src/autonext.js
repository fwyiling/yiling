// Auto-load the next chapter on manga / novel sites when you reach the bottom
// (Pagetual-style endless reading). Works on plain-HTML readers; JavaScript-only
// readers get a big "Next chapter" button instead.
import { scanDocument } from '../../lib/extract.js';

(() => {
  if (window.top !== window) return;
  if (/(^|\.)(mangadex\.org|youtube\.com|google\.[a-z.]+|bing\.com|github\.com|reddit\.com)$/.test(location.hostname)) return;
  const LIKELY = /chapter|chap[-_.\s]?\d|ch[-_.]\d|episode|ep[-_.]\d|\/read\/|第.{1,8}[章话話回]|capitulo|chapitre/i;
  if (!LIKELY.test(location.href + ' ' + document.title)) return;

  const abs = (u, base) => { try { return new URL(u, base).href; } catch { return null; } };
  const NEXT_TEXT = /^(next|next chapter|next page|next episode|next ch\.?|下一[章页頁話话回]|下一章节|次へ|次の話|다음|siguiente|suivant|próximo|›|»|→|>>|next\s*[›»→>])$/i;
  function findNext(doc, base) {
    const host = new URL(base).hostname;
    const rel = doc.querySelector('link[rel="next"], a[rel="next"]');
    const cands = [];
    if (rel) cands.push(rel.getAttribute('href'));
    for (const a of doc.querySelectorAll('a[href]')) {
      const t = (a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (NEXT_TEXT.test(t) || (/\bnext\b/i.test(`${a.className} ${a.id}`) && t.length < 30)) cands.push(a.getAttribute('href'));
    }
    for (const c of cands) {
      const u = c && !/^(javascript:|#)/i.test(c) ? abs(c, base) : null;
      if (u && new URL(u).hostname === host && u.split('#')[0] !== base.split('#')[0]) return u;
    }
    return null;
  }

  chrome.storage.sync.get('autoNext', ({ autoNext }) => { if (autoNext !== false) setTimeout(start, 800); });

  function start() {
    const first = scanDocument(null, null);
    const kind = first.images.length >= 3 ? 'images' : first.text.length >= 1500 ? 'text' : null;
    let next = kind && findNext(document, location.href);
    if (!next) return;
    let loading = false, count = 0;

    const bar = document.createElement('div');
    bar.id = 'sc-autonext';
    bar.style.cssText = 'margin:32px auto;max-width:720px;padding:14px 18px;border-radius:12px;background:#17121f;color:#e9e3f3;font:500 14px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 4px 20px #0005';
    const say = (html) => { bar.innerHTML = html; };
    say('Shield Client · the next chapter loads automatically when you get here ↓');
    (document.querySelector('main, article, #content, .content') || document.body).append(bar);

    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: '1600px 0px' });
    io.observe(bar);

    async function load() {
      if (loading || !next || count >= 40) return;
      loading = true;
      say('Loading the next chapter…');
      const url = next;
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const r = scanDocument(doc, url);
        if ((kind === 'images' && r.images.length < 3) || (kind === 'text' && r.text.length < 500)) throw new Error('reader needs JavaScript');
        const sec = document.createElement('section');
        sec.className = 'sc-next-chapter';
        sec.style.cssText = 'margin:0 auto;max-width:100%';
        const h = document.createElement('div');
        h.textContent = r.title;
        h.style.cssText = 'margin:28px auto 16px;max-width:720px;padding:10px 16px;border-radius:10px;background:#17121f;color:#fff;font:600 16px system-ui,sans-serif;text-align:center';
        sec.append(h);
        if (kind === 'images') {
          for (const src of r.images) {
            const img = new Image();
            img.loading = 'lazy'; img.decoding = 'async'; img.src = src;
            img.style.cssText = 'display:block;max-width:100%;margin:0 auto';
            sec.append(img);
          }
        } else {
          const art = document.createElement('div');
          art.style.cssText = 'max-width:760px;margin:0 auto;font-size:1.05em;line-height:1.75';
          for (const p of r.text.split(/\n{2,}/)) { const el = document.createElement('p'); el.textContent = p; art.append(el); }
          sec.append(art);
        }
        bar.before(sec);
        if (new URL(url).origin === location.origin) history.replaceState(history.state, '', url); // refresh resumes here
        document.title = r.title;
        count++;
        next = findNext(doc, url);
        say(next ? 'Keep scrolling – the next chapter loads automatically ↓' : 'You\'re on the latest chapter.');
      } catch {
        io.disconnect();
        say(`<a href="${url.replace(/"/g, '%22')}" style="color:#ff6b8b;font-weight:700;text-decoration:none">Next chapter →</a>`);
      }
      loading = false;
    }
  }
})();
