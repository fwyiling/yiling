// Ani Manga reader for Project Gutenberg books: clean typography, contents, themes, saved position.
import { book as fetchBook, getReading, saveReading } from '../lib/gutendex.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const { accent, bkPrefs = { theme: 'dark', size: 19, font: 'serif' } } = await chrome.storage.sync.get(['accent', 'bkPrefs']);
if (accent) root.style.setProperty('--a', accent);
const prefs = { ...bkPrefs };
const applyPrefs = () => {
  root.dataset.theme = prefs.theme; root.dataset.font = prefs.font; root.style.setProperty('--size', `${prefs.size}px`);
  chrome.storage.sync.set({ bkPrefs: prefs });
};
applyPrefs();
$('themeBtn').onclick = () => { prefs.theme = { dark: 'sepia', sepia: 'light', light: 'dark' }[prefs.theme] || 'dark'; applyPrefs(); };
$('fontBtn').onclick = () => { prefs.font = prefs.font === 'serif' ? 'sans' : 'serif'; applyPrefs(); };
$('smaller').onclick = () => { keepPlace(() => { prefs.size = Math.max(14, prefs.size - 1); applyPrefs(); }); };
$('bigger').onclick = () => { keepPlace(() => { prefs.size = Math.min(30, prefs.size + 1); applyPrefs(); }); };
$('tocBtn').onclick = () => { $('toc').hidden = !$('toc').hidden; $('tocBtn').classList.toggle('on', !$('toc').hidden); };

const id = new URLSearchParams(location.search).get('id');
const status = (t) => { $('book').innerHTML = ''; $('book').append(Object.assign(document.createElement('p'), { className: 'status', textContent: t })); };

// ---- turn a Gutenberg page into safe, clean markup (allowlist: text structure and images only) ----
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'EM', 'I', 'B', 'STRONG', 'U', 'BR', 'HR', 'UL', 'OL', 'LI', 'PRE',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'A', 'SPAN', 'DIV', 'SUP', 'SUB', 'SMALL', 'FIGURE', 'FIGCAPTION', 'CENTER', 'CITE', 'DL', 'DT', 'DD']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'MATH', 'NOSCRIPT', 'LINK', 'META', 'HEAD', 'TITLE', 'VIDEO', 'AUDIO']);
function clean(node, base) {
  const out = document.createDocumentFragment();
  for (const n of node.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) { out.append(n.textContent); continue; }
    if (n.nodeType !== Node.ELEMENT_NODE || DROP.has(n.tagName)) continue;
    if (!KEEP.has(n.tagName)) { out.append(clean(n, base)); continue; } // unknown wrapper: keep its text
    const el = document.createElement(n.tagName === 'CENTER' ? 'div' : n.tagName);
    if (n.id) el.id = `b-${n.id}`;
    if (n.tagName === 'IMG') {
      try {
        const u = new URL(n.getAttribute('src') || '', base);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
        el.src = u.href; el.alt = n.getAttribute('alt') || ''; el.loading = 'lazy';
      } catch { continue; }
    } else if (n.tagName === 'A') {
      const h = n.getAttribute('href') || '';
      if (h.startsWith('#')) el.setAttribute('href', `#b-${h.slice(1)}`); // links inside the book only
    } else if ((n.tagName === 'TD' || n.tagName === 'TH') && n.getAttribute('colspan')) {
      el.colSpan = Math.min(20, +n.getAttribute('colspan') || 1);
    }
    el.append(clean(n, base));
    out.append(el);
  }
  return out;
}
function stripBoilerplate(doc) {
  doc.querySelectorAll('#pg-header, #pg-footer, .pg-boilerplate, #pg-machine-header, #pg-start-separator, #pg-end-separator, section.pg-boilerplate').forEach((e) => e.remove());
  // older files: everything outside the "*** START / END OF THE PROJECT GUTENBERG EBOOK" lines
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let start = null, end = null;
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!start && /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i.test(t.textContent)) start = t;
    if (/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i.test(t.textContent)) { end = t; break; }
  }
  const block = (t) => { let e = t.parentElement; while (e && e.parentElement !== doc.body) e = e.parentElement; return e; };
  if (start) { const b = block(start); if (b) { while (b.previousSibling) b.previousSibling.remove(); b.remove(); } }
  if (end) { const b = block(end); if (b) { while (b.nextSibling) b.nextSibling.remove(); b.remove(); } }
}
function fromText(txt) {
  const s = txt.indexOf('*** START OF'), e = txt.indexOf('*** END OF');
  const body = txt.slice(s >= 0 ? txt.indexOf('\n', s) + 1 : 0, e >= 0 ? e : undefined);
  const frag = document.createDocumentFragment();
  for (const para of body.split(/\r?\n\s*\r?\n/)) {
    const t = para.replace(/\s*\r?\n\s*/g, ' ').trim();
    if (!t) continue;
    const head = t.length < 70 && /^(chapter|book|part|volume|act|scene|letter|canto|stave)\b|^[IVXLC]+\.?$/i.test(t);
    frag.append(Object.assign(document.createElement(head ? 'h2' : 'p'), { textContent: t }));
  }
  return frag;
}

// ---- load ----
const saved = (await getReading()).find((x) => String(x.id) === String(id));
let b = saved;
try { if (!b?.html && !b?.text) b = await fetchBook(id); } catch (e) { status(`Couldn’t load this book: ${e.message}`); throw e; }
if (!b) { status('Book not found.'); throw new Error('no book'); }
document.title = `${b.title} · Ani Manga`;
$('title').textContent = b.title;
$('where').textContent = b.authors?.join(', ') || '';
try {
  let content;
  if (b.html) {
    const r = await fetch(b.html);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    stripBoilerplate(doc);
    content = clean(doc.body, r.url);
  } else if (b.text) {
    const r = await fetch(b.text);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    content = fromText(await r.text());
  } else throw new Error('this book has no readable version');
  $('book').replaceChildren(content);
} catch (e) { status(`Couldn’t load this book: ${e.message}`); throw e; }

// ---- contents ----
const heads = [...$('book').querySelectorAll('h2')].length >= 3 ? [...$('book').querySelectorAll('h2')] : [...$('book').querySelectorAll('h2, h3')];
heads.forEach((h, i) => { if (!h.id) h.id = `c-${i}`; });
$('tocList').replaceChildren(...heads.filter((h) => h.textContent.trim()).map((h) => {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = `#${h.id}`; a.textContent = h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
  a.onclick = (e) => { e.preventDefault(); h.scrollIntoView(); if (innerWidth < 900) $('toc').hidden = true; };
  li.append(a); return li;
}));
if (!heads.length) $('tocBtn').hidden = true;

// ---- position ----
function scrollMax() { return Math.max(1, document.documentElement.scrollHeight - innerHeight); }
function progress() { return Math.min(1, scrollY / scrollMax()); }
function currentHead() {
  let cur = null;
  for (const h of heads) { if (h.getBoundingClientRect().top < 120) cur = h; else break; }
  return cur;
}
function keepPlace(change) { const p = progress(); change(); requestAnimationFrame(() => scrollTo(0, p * scrollMax())); }
let lastSave = 0;
async function save() { lastSave = Date.now(); await saveReading(b, progress(), currentHead()?.textContent.trim().slice(0, 60) || ''); }
function onScroll() {
  $('prog').style.width = `${progress() * 100}%`;
  const h = currentHead();
  $('where').textContent = [b.authors?.join(', '), h?.textContent.trim().slice(0, 60)].filter(Boolean).join(' · ');
  document.querySelectorAll('#tocList a').forEach((a) => a.classList.toggle('here', h && a.getAttribute('href') === `#${h.id}`));
  if (Date.now() - lastSave > 4000) save();
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('pagehide', save);
if (saved?.progress) requestAnimationFrame(() => { scrollTo(0, saved.progress * scrollMax()); onScroll(); });
else save();
