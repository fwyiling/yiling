// Syndicates Client home page – every part is configurable from the Customize drawer.
const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  theme: 'mynt', seed: '#8a5a44', mode: 'dark', scanlines: true, glitch: true, hud: true, animate: false, perfV: 5,
  bgType: 'theme', animeEvery: 'day', bgGradient: 0, bgColor: '#14141c', bgUrl: '', bgPhotoEvery: 'day', bgBlur: 0, bgDim: 25, bgZoom: true,
  showGreeting: true, name: '', greetingText: '',
  showClock: true, clock24: false, clockSeconds: false, clockSize: 96, clockWeight: 300, showDate: true,
  showSearch: true, engine: 'google', searchWidth: 600, searchPlaceholder: '',
  showShortcuts: true, shortcutSource: 'custom', shortcutCols: 6, shortcutSize: 92, shortcutLabels: true, shortcutStyle: 'glass',
  shortcuts: [
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'MangaDex', url: 'https://mangadex.org' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Reddit', url: 'https://www.reddit.com' },
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Discord', url: 'https://discord.com/app' },
  ],
  showWeather: false, weatherCity: '', weatherUnit: 'c',
  showQuote: true, showNotes: true, showTodo: true, notes: '', todos: [],
  showToday: true, showTimetable: true, showShelves: false, timetable: {}, quoteShift: 0,
  font: 'system', textShadow: true, glassBlur: 14, glassAlpha: 18, radius: 16, panelDark: false, layout: 'center',
  zen: false,
};

const GRADIENTS = [
  ['Aurora', 'linear-gradient(135deg,#0f2027,#203a43 40%,#2c5364)'],
  ['Sunset', 'linear-gradient(135deg,#ff512f,#dd2476)'],
  ['Neon', 'linear-gradient(135deg,#12002f,#5b0e91 50%,#fa1e4e)'],
  ['Ocean', 'linear-gradient(135deg,#00c6ff,#0072ff)'],
  ['Forest', 'linear-gradient(135deg,#134e5e,#71b280)'],
  ['Midnight', 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)'],
  ['Peach', 'linear-gradient(135deg,#ffecd2,#fcb69f)'],
  ['Mesh', 'radial-gradient(at 20% 20%,#ff3cac 0,transparent 50%),radial-gradient(at 80% 30%,#784ba0 0,transparent 50%),radial-gradient(at 50% 90%,#2b86c5 0,transparent 55%),#111'],
];
const ENGINES = {
  google: ['Google', 'https://www.google.com/search?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
  brave: ['Brave', 'https://search.brave.com/search?q='],
  startpage: ['Startpage', 'https://www.startpage.com/do/search?q='],
  ecosia: ['Ecosia', 'https://www.ecosia.org/search?q='],
  perplexity: ['Perplexity', 'https://www.perplexity.ai/search?q='],
  youtube: ['YouTube', 'https://www.youtube.com/results?search_query='],
  mangadex: ['MangaDex', 'https://mangadex.org/search?q='],
};
const FONTS = {
  cyber: ['Orbitron + Rajdhani (gamer)', 'Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;700;900', 'Rajdhani', 'Orbitron'],
  orbitron: ['Orbitron', 'Orbitron:wght@400;500;700;900'],
  audiowide: ['Audiowide', 'Audiowide'],
  rajdhani: ['Rajdhani', 'Rajdhani:wght@400;500;600;700'],
  system: ['System', null],
  inter: ['Inter', 'Inter:wght@300;400;500;600;700'],
  poppins: ['Poppins', 'Poppins:wght@300;400;500;600;700'],
  montserrat: ['Montserrat', 'Montserrat:wght@300;400;500;600;700'],
  grotesk: ['Space Grotesk', 'Space+Grotesk:wght@300;400;500;600;700'],
  outfit: ['Outfit', 'Outfit:wght@200;300;400;600;700'],
  playfair: ['Playfair Display', 'Playfair+Display:wght@400;500;700'],
  mono: ['JetBrains Mono', 'JetBrains+Mono:wght@300;400;600'],
};
const SWATCHES = ['#fa1e4e', '#ff7a00', '#ffd400', '#2ecc71', '#00c2ff', '#3b82f6', '#8b5cf6', '#ff4fd8', '#ffffff'];
const QUOTES = [
  ['You have power over your mind – not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'],
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
  ['A journey of a thousand miles begins with a single step.', 'Laozi'],
  ['Nature does not hurry, yet everything is accomplished.', 'Laozi'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['In the midst of winter, I found there was, within me, an invincible summer.', 'Albert Camus'],
  ['The unexamined life is not worth living.', 'Socrates'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant, after Aristotle'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['No man ever steps in the same river twice.', 'Heraclitus'],
  ['Man is condemned to be free.', 'Jean-Paul Sartre'],
  ['The obstacle is the way.', 'after Marcus Aurelius'],
  ['Knowing yourself is the beginning of all wisdom.', 'Aristotle'],
  ['First say to yourself what you would be; then do what you have to do.', 'Epictetus'],
  ['Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],
  ['The mind is everything. What you think you become.', 'attributed to the Buddha'],
  ['Do not spoil what you have by desiring what you have not.', 'Epicurus'],
  ['To be is to do.', 'Immanuel Kant'],
];

let s = { ...DEFAULTS };
let accent = '#fa1e4e';
const saveTimers = {};
function set(patch, { quiet } = {}) {
  Object.assign(s, patch);
  clearTimeout(saveTimers.s);
  saveTimers.s = setTimeout(() => chrome.storage.local.set({ ntp: s }), 250);
  if (!quiet) render();
  refreshWhen();
}

// ================= render =================
// ---- Chrome-style tonal palette from one base colour (like Chrome's "Customise Chrome" colours) ----
function hexToHsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${Math.max(0, Math.min(100, s)).toFixed(1)}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`;
// Chrome+ and Material You share one layout (dashboard cards, shelves, quote card); Mynt restyles it.
const chromeLike = () => s.theme === 'chrome' || s.theme === 'mynt';
function isDark() { return s.mode === 'dark' || (s.mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); }
function chromePalette() {
  const [h, sat] = hexToHsl(s.seed || '#8a5a44');
  const c = Math.min(sat, 60);
  return isDark()
    ? { bg: hsl(h, c * 0.32, 8), surface: hsl(h, c * 0.3, 12), surface2: hsl(h, c * 0.3, 17), surface3: hsl(h, c * 0.32, 22),
        outline: hsl(h, c * 0.25, 30), primary: hsl(h, Math.max(c, 45), 76), onPrimary: hsl(h, c * 0.5, 14),
        text: hsl(h, c * 0.15, 92), muted: hsl(h, c * 0.15, 70), glow: hsl(h, Math.max(c, 50), 45) }
    : { bg: hsl(h, c * 0.45, 97), surface: hsl(h, c * 0.45, 93), surface2: hsl(h, c * 0.4, 89), surface3: hsl(h, c * 0.4, 84),
        outline: hsl(h, c * 0.3, 75), primary: hsl(h, Math.max(c, 50), 38), onPrimary: hsl(h, 20, 98),
        text: hsl(h, c * 0.3, 12), muted: hsl(h, c * 0.2, 35), glow: hsl(h, Math.max(c, 55), 70) };
}
// Material You-style tonal palette (primary / secondary / tertiary containers) from one seed colour.
// An untouched seed follows the client's accent colour.
function myntPalette() {
  const [h, sat] = hexToHsl(!s.seed || s.seed === '#8a5a44' ? accent : s.seed);
  const c = Math.max(38, Math.min(sat, 72)), t = (h + 60) % 360;
  return isDark()
    ? { bg: hsl(h, c * 0.16, 6), surface: hsl(h, c * 0.2, 10), surface2: hsl(h, c * 0.22, 13), surface3: hsl(h, c * 0.24, 17), surface4: hsl(h, c * 0.25, 21),
        outline: hsl(h, c * 0.14, 42), primary: hsl(h, c, 80), onPrimary: hsl(h, c * 0.9, 18), text: hsl(h, c * 0.12, 92), muted: hsl(h, c * 0.14, 72), glow: hsl(h, c, 42),
        pc: hsl(h, c * 0.7, 27), onPc: hsl(h, c, 91), sc: hsl(h, c * 0.32, 23), onSc: hsl(h, c * 0.35, 88), tc: hsl(t, c * 0.55, 27), onTc: hsl(t, c * 0.8, 90) }
    : { bg: hsl(h, c * 0.5, 98), surface: hsl(h, c * 0.45, 95), surface2: hsl(h, c * 0.42, 92), surface3: hsl(h, c * 0.4, 89), surface4: hsl(h, c * 0.38, 86),
        outline: hsl(h, c * 0.18, 62), primary: hsl(h, c, 40), onPrimary: hsl(h, 30, 99), text: hsl(h, c * 0.3, 11), muted: hsl(h, c * 0.18, 34), glow: hsl(h, c, 72),
        pc: hsl(h, c * 0.85, 88), onPc: hsl(h, c, 13), sc: hsl(h, c * 0.35, 89), onSc: hsl(h, c * 0.4, 15), tc: hsl(t, c * 0.7, 88), onTc: hsl(t, c, 13) };
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (s.mode === 'system') { bgKey = ''; render(); } });

function applyLook() {
  const r = document.documentElement.style;
  r.setProperty('--accent', accent);
  r.setProperty('--clock', s.clockSize + 'px');
  r.setProperty('--clock-weight', s.clockWeight);
  r.setProperty('--cols', s.shortcutCols);
  r.setProperty('--tile', s.shortcutSize + 'px');
  r.setProperty('--search-w', s.searchWidth + 'px');
  r.setProperty('--glass-blur', s.glassBlur + 'px');
  r.setProperty('--glass-alpha', s.glassAlpha / 100);
  r.setProperty('--radius', s.radius + 'px');
  const [fname, fq, body, display] = FONTS[s.font] || FONTS.system;
  if (fq && !document.querySelector(`link[data-font="${s.font}"]`)) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${fq}&display=swap` });
    link.dataset.font = s.font;
    document.head.append(link);
  }
  const fam = (n) => `"${n}", "Segoe UI", system-ui, sans-serif`;
  r.setProperty('--font', fq ? fam(body || fname) : '"Segoe UI", system-ui, -apple-system, sans-serif');
  r.setProperty('--font-display', fq ? fam(display || body || fname) : 'inherit');
  const b = document.body.classList;
  b.toggle('no-shadow', !s.textShadow);
  b.toggle('panel-dark', s.panelDark);
  b.toggle('top', s.layout === 'top');
  b.toggle('zen', s.zen);
  b.toggle('no-labels', !s.shortcutLabels);
  b.toggle('style-flat', s.shortcutStyle === 'flat');
  b.toggle('theme-cyber', s.theme === 'cyber');
  b.toggle('theme-chrome', chromeLike());
  b.toggle('theme-mynt', s.theme === 'mynt');
  b.toggle('light', chromeLike() && !isDark());
  if (chromeLike()) {
    const p = s.theme === 'mynt' ? myntPalette() : chromePalette();
    for (const [k, v] of Object.entries(p)) r.setProperty('--c-' + k, v);
    r.setProperty('--accent', p.primary);
  }
  b.toggle('scanlines', s.theme === 'cyber' && s.scanlines && (s.animate || s.bgType !== 'cyber'));
  b.toggle('static-bg', !s.animate);
  b.toggle('glitch', s.glitch);
  b.toggle('hud', s.hud);
  b.toggle('still', !s.animate);
  $('btnZen').classList.toggle('on', s.zen);
}

let bgKey = '';
async function applyBackground() {
  const bg = $('bg');
  bg.style.filter = s.bgBlur ? `blur(${s.bgBlur}px)` : '';
  bg.style.transform = s.bgZoom ? 'scale(1.04)' : '';
  $('dim').style.opacity = s.bgDim / 100;
  const key = [s.theme, s.seed, s.mode, isDark(), s.bgType, s.bgGradient, s.bgColor, s.bgUrl, s.bgPhotoEvery, s.animeEvery, s.animate, s.scanlines, accent, innerWidth, innerHeight].join('|');
  if (key === bgKey) return;
  bgKey = key;
  $('credit').textContent = '';
  bg.replaceChildren();
  const setImg = (url) => { bg.style.background = `#111 url("${url.replace(/"/g, '%22')}") center / cover no-repeat`; };
  if (s.bgType === 'theme') {
    // Chrome-style: the theme surface colour with a soft glow (drawn by CSS, no image)
    bg.style.background = '';
    bg.className = 'theme-bg';
    return;
  }
  bg.className = '';
  if (s.bgType === 'cyber' && !s.animate) {
    // still image: drawn once, so typing never waits on animation/compositing
    bg.style.background = '#05010a';
    const url = await synthwaveImage(accent, s.theme === 'cyber' && s.scanlines);
    setImg(url);
  } else if (s.bgType === 'cyber') {
    bg.style.background = '#05010a';
    const c = document.createElement('div'); c.className = 'cyber-bg';
    c.innerHTML = '<div class="stars"></div><div class="sun"></div><div class="horizon"></div><div class="floor"><i></i></div>';
    bg.append(c);
  } else if (s.bgType === 'anime') {
    // SFW anime wallpapers from wallhaven.cc (public API, no account)
    const today = new Date().toDateString();
    let { animeCache } = await chrome.storage.local.get('animeCache');
    if (!animeCache || animeCache.day !== today || !animeCache.list?.length) {
      try {
        const j = await (await fetch('https://wallhaven.cc/api/v1/search?categories=010&purity=100&atleast=1920x1080&ratios=16x9,16x10&sorting=toplist&topRange=1M')).json();
        animeCache = { day: today, list: j.data.map((w) => ({ path: w.path, page: w.url })) };
        chrome.storage.local.set({ animeCache });
      } catch { animeCache = animeCache?.list?.length ? animeCache : null; }
    }
    if (animeCache) {
      const list = animeCache.list;
      const pick = s.animeEvery === 'tab' ? list[Math.floor(Math.random() * list.length)] : list[Math.floor(Date.now() / 864e5) % list.length];
      setImg(pick.path);
      $('credit').textContent = 'Wallpaper: wallhaven.cc';
    } else bg.style.background = GRADIENTS[2][1];
  } else if (s.bgType === 'gradient') bg.style.background = GRADIENTS[s.bgGradient]?.[1] || GRADIENTS[0][1];
  else if (s.bgType === 'color') bg.style.background = s.bgColor;
  else if (s.bgType === 'url' && s.bgUrl) setImg(s.bgUrl);
  else if (s.bgType === 'upload') {
    const { ntpUpload } = await chrome.storage.local.get('ntpUpload');
    if (ntpUpload) setImg(ntpUpload); else bg.style.background = GRADIENTS[0][1];
  } else if (s.bgType === 'photo') {
    const seed = s.bgPhotoEvery === 'tab' ? Math.random().toString(36).slice(2) : new Date().toDateString();
    setImg(`https://picsum.photos/seed/${encodeURIComponent(seed)}/${Math.min(3840, screen.width * devicePixelRatio | 0)}/${Math.min(2160, screen.height * devicePixelRatio | 0)}`);
    $('credit').textContent = 'Photo: Lorem Picsum / Unsplash';
  } else if (s.bgType === 'bing') {
    const today = new Date().toDateString();
    let { bingCache } = await chrome.storage.local.get('bingCache');
    if (!bingCache || bingCache.day !== today) {
      try {
        const j = await (await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US')).json();
        const im = j.images[0];
        bingCache = { day: today, url: 'https://www.bing.com' + im.url.replace(/_\d+x\d+\./, '_UHD.'), credit: im.copyright };
        chrome.storage.local.set({ bingCache });
      } catch { bingCache = bingCache || null; }
    }
    if (bingCache) { setImg(bingCache.url); $('credit').textContent = bingCache.credit || ''; }
    else bg.style.background = GRADIENTS[2][1];
  } else bg.style.background = GRADIENTS[0][1];
}

// ---- synthwave scene rendered once to an image ----
let lastSynthUrl = null;
async function synthwaveImage(acc, scan) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  const cx = W / 2, hy = H * 0.5, vmin = Math.min(W, H);
  // sky
  const sky = g.createRadialGradient(cx, H * 1.2, 0, cx, H * 1.2, H * 1.15);
  sky.addColorStop(0, mixHex(acc, '#1a0533', 0.45)); sky.addColorStop(0.45, '#12021f'); sky.addColorStop(0.75, '#05010a'); sky.addColorStop(1, '#05010a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // stars (seeded so they don't jump between tabs)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.fillStyle = '#fff'; const r = (rnd() < 0.85 ? 0.7 : 1.3) * dpr; g.beginPath(); g.arc(rnd() * W, rnd() * hy * 0.95, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  // sun with retro stripes
  const D = vmin * 0.3, R = D / 2, sy = hy + vmin * 0.06 - R;
  g.save(); g.beginPath(); g.rect(0, 0, W, hy); g.clip();
  g.shadowColor = 'rgba(255,41,117,.65)'; g.shadowBlur = 90 * dpr;
  const sg = g.createLinearGradient(0, sy - R, 0, sy + R);
  sg.addColorStop(0, '#ffd319'); sg.addColorStop(0.55, '#ff2975'); sg.addColorStop(1, '#8c1eff');
  g.fillStyle = sg; g.beginPath(); g.arc(cx, sy, R, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out';
  for (let y = sy, gap = 2 * dpr, step = 0; y < sy + R; step++) { y += 12 * dpr; g.fillRect(cx - R, y, D, gap); gap += 0.9 * dpr; y += gap; }
  g.restore();
  // floor grid in perspective
  const line = mixHex(acc, '#ffffff', 0.85);
  g.save(); g.beginPath(); g.rect(0, hy, W, H - hy); g.clip();
  g.fillStyle = '#07020e'; g.fillRect(0, hy, W, H - hy);
  const strokes = (alpha, width) => {
    g.strokeStyle = line; g.globalAlpha = alpha; g.lineWidth = width;
    g.beginPath();
    for (let i = 1; i <= 15; i++) { const t = Math.pow(i / 15, 2.2); const y = hy + (H - hy) * t; g.moveTo(0, y); g.lineTo(W, y); }
    for (let k = -24; k <= 24; k++) { const xb = cx + k * W * 0.075; g.moveTo(cx + k * W * 0.006, hy); g.lineTo(xb, H); }
    g.stroke();
  };
  strokes(0.22, 8 * dpr); strokes(0.95, 2 * dpr);
  g.globalAlpha = 1;
  const fade = g.createLinearGradient(0, hy, 0, hy + (H - hy) * 0.4);
  fade.addColorStop(0, 'rgba(7,2,14,1)'); fade.addColorStop(1, 'rgba(7,2,14,0)');
  g.fillStyle = fade; g.fillRect(0, hy, W, H - hy);
  g.restore();
  // horizon glow
  const hg = g.createLinearGradient(0, hy - 30 * dpr, 0, hy + 30 * dpr);
  hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.5, hexA(acc, 0.55)); hg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hg; g.fillRect(0, hy - 30 * dpr, W, 60 * dpr);
  g.fillStyle = acc; g.fillRect(0, hy - dpr, W, 2 * dpr);
  // baked scanlines + vignette
  if (scan) {
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 0; y < H; y += 3 * dpr) g.fillRect(0, y, W, dpr);
    const v = g.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.45, cx, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (lastSynthUrl) URL.revokeObjectURL(lastSynthUrl);
  return (lastSynthUrl = URL.createObjectURL(blob));
}
function hexRgb(h) { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mixHex(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return `rgb(${x.map((v, i) => Math.round(v * t + y[i] * (1 - t))).join(',')})`; }
function hexA(h, a) { return `rgba(${hexRgb(h).join(',')},${a})`; }
let resizeT;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => applyBackground(), 300); });

function tick() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  let ampm = '';
  if (!s.clock24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
  $('time').textContent = `${s.clock24 ? String(h).padStart(2, '0') : h}:${m}${s.clockSeconds ? ':' + sec : ''}`;
  $('time').dataset.text = $('time').textContent;
  $('ampm').textContent = ampm;
  $('date').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const part = h => (h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  $('greeting').textContent = s.greetingText || `${part(d.getHours())}${s.name ? ', ' + s.name : ''}`;
}

function renderSearch() {
  const [name] = ENGINES[s.engine] || ENGINES.google;
  $('engineBtn').textContent = name;
  $('q').placeholder = s.searchPlaceholder || `Search ${name} or type a link`;
}
// pause the background animation while typing, so keystrokes are never delayed
$('q').addEventListener('focus', () => document.body.classList.add('typing'));
$('q').addEventListener('blur', () => document.body.classList.remove('typing'));

$('search').onsubmit = (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  const looksUrl = /^[a-z]+:\/\//i.test(q) || (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(q));
  location.href = looksUrl ? (/^[a-z]+:\/\//i.test(q) ? q : 'https://' + q) : (ENGINES[s.engine] || ENGINES.google)[1] + encodeURIComponent(q);
};
$('engineBtn').onclick = () => {
  const keys = Object.keys(ENGINES);
  set({ engine: keys[(keys.indexOf(s.engine) + 1) % keys.length] });
  $('q').focus();
};

const fav = (url) => `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`;
let dragFrom = -1;
async function renderShortcuts() {
  const box = $('shortcuts');
  box.replaceChildren();
  let list = s.shortcuts;
  const editable = s.shortcutSource === 'custom';
  if (!editable) list = (await chrome.topSites.get()).slice(0, s.shortcutCols * 2).map((t) => ({ title: t.title, url: t.url }));
  list.forEach((sc, i) => {
    const a = document.createElement('a');
    a.className = 'tile' + (s.shortcutStyle === 'flat' ? '' : ' glass');
    a.href = sc.url;
    a.dataset.n = String(i + 1).padStart(2, '0');
    const icon = document.createElement('div');
    icon.className = 'fav';
    const img = new Image(); img.src = fav(sc.url); img.alt = '';
    img.onerror = () => icon.replaceChildren(Object.assign(document.createElement('b'), { textContent: (sc.title || '?')[0].toUpperCase() }));
    icon.append(img);
    const label = document.createElement('span');
    label.textContent = sc.title || new URL(sc.url).hostname;
    a.append(icon, label);
    if (editable) {
      const ed = document.createElement('div'); ed.className = 'ed';
      const e1 = Object.assign(document.createElement('button'), { textContent: '✎', title: 'Edit' });
      const e2 = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Remove' });
      e1.onclick = (ev) => { ev.preventDefault(); openEditor(i); };
      e2.onclick = (ev) => { ev.preventDefault(); set({ shortcuts: s.shortcuts.filter((_, k) => k !== i) }); };
      ed.append(e1, e2); a.append(ed);
      a.draggable = true;
      a.ondragstart = () => { dragFrom = i; a.classList.add('dragging'); };
      a.ondragend = () => a.classList.remove('dragging');
      a.ondragover = (ev) => ev.preventDefault();
      a.ondrop = (ev) => {
        ev.preventDefault();
        if (dragFrom < 0 || dragFrom === i) return;
        const arr = [...s.shortcuts]; const [m] = arr.splice(dragFrom, 1); arr.splice(i, 0, m);
        dragFrom = -1; set({ shortcuts: arr });
      };
    }
    box.append(a);
  });
  if (editable) {
    const add = Object.assign(document.createElement('button'), { className: 'tile add', title: 'Add shortcut' });
    if (chromeLike()) add.innerHTML = '<div class="fav add-ic">+</div><span>Add shortcut</span>';
    else add.textContent = '+';
    add.onclick = () => openEditor(-1);
    box.append(add);
  }
}
let editing = -1;
function openEditor(i) {
  editing = i;
  const sc = s.shortcuts[i] || { title: '', url: '' };
  $('scTitle').textContent = i < 0 ? 'Add shortcut' : 'Edit shortcut';
  $('scName').value = sc.title; $('scUrl').value = sc.url;
  $('modal').hidden = false; $('scName').focus();
}
$('scCancel').onclick = () => ($('modal').hidden = true);
$('modal').onclick = (e) => { if (e.target === $('modal')) $('modal').hidden = true; };
$('scForm').onsubmit = (e) => {
  e.preventDefault();
  let url = $('scUrl').value.trim();
  if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
  const item = { title: $('scName').value.trim(), url };
  const arr = [...s.shortcuts];
  if (editing < 0) arr.push(item); else arr[editing] = item;
  $('modal').hidden = true; set({ shortcuts: arr });
};

const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
  51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Storms'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'] };
async function renderWeather() {
  const w = $('weather');
  w.hidden = !s.showWeather;
  if (!s.showWeather) return;
  if (!s.weatherCity) { w.innerHTML = '<span class="c">Set your city in Customize → Widgets</span>'; return; }
  const key = `${s.weatherCity}|${s.weatherUnit}`;
  let { wxCache } = await chrome.storage.local.get('wxCache');
  if (!wxCache || wxCache.key !== key || Date.now() - wxCache.at > 30 * 60000) {
    try {
      const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(s.weatherCity)}`)).json();
      const p = g.results?.[0];
      if (!p) throw new Error('City not found');
      const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&temperature_unit=${s.weatherUnit === 'f' ? 'fahrenheit' : 'celsius'}`)).json();
      wxCache = { key, at: Date.now(), city: p.name, t: Math.round(f.current.temperature_2m), code: f.current.weather_code };
      chrome.storage.local.set({ wxCache });
    } catch (e) { w.innerHTML = ''; w.append(Object.assign(document.createElement('span'), { className: 'c', textContent: e.message || 'Weather unavailable' })); return; }
  }
  const [icon, desc] = WX[wxCache.code] || ['🌡️', ''];
  w.innerHTML = '';
  w.append(icon + ' ', Object.assign(document.createElement('span'), { className: 't', textContent: `${wxCache.t}°` }),
    Object.assign(document.createElement('span'), { className: 'c', textContent: `${desc} · ${wxCache.city}` }));
}

function renderQuote() {
  const day = Math.floor(Date.now() / 864e5) + (s.quoteShift || 0);
  const [q, a] = QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
  $('quote').hidden = !s.showQuote || chromeLike();
  $('quote').replaceChildren(`“${q}”`, Object.assign(document.createElement('i'), { textContent: a }));
  const qc = $('qcard');
  qc.hidden = !s.showQuote || !chromeLike();
  qc.querySelector('.q').textContent = `“${q}”`;
  qc.querySelector('.who').textContent = `— ${a}`;
}

function renderTodos() {
  const ul = $('todos');
  ul.replaceChildren(...s.todos.map((t, i) => {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: t.done });
    cb.onchange = () => set({ todos: s.todos.map((x, k) => (k === i ? { ...x, done: cb.checked } : x)) }, { quiet: true }) || renderTodos();
    const sp = Object.assign(document.createElement('span'), { textContent: t.text });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Delete' });
    del.onclick = () => { set({ todos: s.todos.filter((_, k) => k !== i) }, { quiet: true }); renderTodos(); };
    li.append(cb, sp, del);
    return li;
  }));
  if (typeof renderDash === 'function' && $('dash')) renderDash();
}
$('todoForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('todoIn').value.trim();
  if (!v) return;
  $('todoIn').value = '';
  set({ todos: [...s.todos, { text: v, done: false }] }, { quiet: true }); renderTodos();
};
$('todoClear').onclick = () => { set({ todos: s.todos.filter((t) => !t.done) }, { quiet: true }); renderTodos(); };
$('notes').oninput = () => set({ notes: $('notes').value }, { quiet: true });

function togglePop(id) {
  for (const p of ['popNotes', 'popTodo']) $(p).hidden = p === id ? !$(p).hidden : true;
}
$('btnNotes').onclick = () => togglePop('popNotes');
$('btnTodo').onclick = () => togglePop('popTodo');
$('btnSidebar').onclick = async () => { const w = await chrome.windows.getCurrent(); chrome.sidePanel.open({ windowId: w.id }); };
$('btnZen').onclick = () => set({ zen: !s.zen });
$('btnAniManga').onclick = () => { location.href = chrome.runtime.getURL('anime/anime.html'); };

// ---- dashboard: Today (to-dos) + Timetable ----
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
let ttDay = new Date().getDay();
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
function renderDash() {
  const dash = $('dash');
  const show = chromeLike() && (s.showToday || s.showTimetable);
  dash.hidden = !show;
  if (!show) return;
  // Today
  const tc = $('todayCard'); tc.hidden = !s.showToday;
  if (s.showToday) {
    const done = s.todos.filter((t) => t.done).length, total = s.todos.length;
    const pct = total ? done / total : 0;
    tc.querySelector('.ring').style.setProperty('--p', pct);
    tc.querySelector('.ring b').textContent = total ? `${Math.round(pct * 100)}%` : '–';
    tc.querySelector('.sub').textContent = total ? `${done} of ${total} done` : 'Nothing planned yet';
    const ul = tc.querySelector('ul');
    ul.replaceChildren(...s.todos.map((t, i) => {
      const li = document.createElement('li'); li.className = t.done ? 'done' : '';
      li.innerHTML = '<button class="ck" title="Done"></button><span></span><button class="rm" title="Delete">✕</button>';
      li.querySelector('span').textContent = t.text;
      li.querySelector('.ck').onclick = () => { set({ todos: s.todos.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) }, { quiet: true }); renderTodos(); };
      li.querySelector('.rm').onclick = () => { set({ todos: s.todos.filter((_, k) => k !== i) }, { quiet: true }); renderTodos(); };
      return li;
    }));
  }
  // Timetable
  const tt = $('ttCard'); tt.hidden = !s.showTimetable;
  if (s.showTimetable) {
    const key = DAYS[ttDay], today = ttDay === new Date().getDay();
    const d = new Date(); d.setDate(d.getDate() + ((ttDay - d.getDay() + 7) % 7));
    tt.querySelector('.day').textContent = today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long' });
    const items = [...(s.timetable[key] || [])].sort((a, b) => toMin(a.time) - toMin(b.time));
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    let nextIdx = -1, nowIdx = -1;
    if (today) items.forEach((it, i) => { const st = toMin(it.time), en = it.end ? toMin(it.end) : st + 60; if (st <= nowMin && nowMin < en) nowIdx = i; if (nextIdx < 0 && st > nowMin) nextIdx = i; });
    const ol = tt.querySelector('ol');
    ol.replaceChildren(...items.map((it, i) => {
      const li = document.createElement('li');
      li.className = i === nowIdx ? 'now' : i === nextIdx ? 'next' : (today && toMin(it.end || it.time) + (it.end ? 0 : 60) <= nowMin ? 'past' : '');
      li.innerHTML = '<time></time><div><b></b><small></small></div><button class="rm" title="Delete">✕</button>';
      li.querySelector('time').textContent = it.time + (it.end ? `–${it.end}` : '');
      li.querySelector('b').textContent = it.title;
      li.querySelector('small').textContent = i === nowIdx ? 'happening now' : i === nextIdx ? `next · in ${toMin(it.time) - nowMin} min` : '';
      li.querySelector('.rm').onclick = () => { const all = { ...s.timetable }; all[key] = (all[key] || []).filter((x) => x !== it); set({ timetable: all }, { quiet: true }); renderDash(); };
      return li;
    }));
    tt.querySelector('.empty-tt').hidden = items.length > 0;
  }
}
$('todayForm').onsubmit = (e) => { e.preventDefault(); const v = $('todayIn').value.trim(); if (!v) return; $('todayIn').value = ''; set({ todos: [...s.todos, { text: v, done: false }] }, { quiet: true }); renderTodos(); };
$('ttForm').onsubmit = (e) => {
  e.preventDefault();
  const title = $('ttTitle').value.trim(), time = $('ttTime').value, end = $('ttEnd').value;
  if (!title || !time) return;
  const key = DAYS[ttDay], all = { ...s.timetable };
  all[key] = [...(all[key] || []), { time, end: end || '', title }];
  $('ttTitle').value = ''; set({ timetable: all }, { quiet: true }); renderDash();
};
$('ttPrev').onclick = () => { ttDay = (ttDay + 6) % 7; renderDash(); };
$('ttNext').onclick = () => { ttDay = (ttDay + 1) % 7; renderDash(); };
$('qShuffle').onclick = () => set({ quoteShift: (s.quoteShift || 0) + 1 });
setInterval(() => { if (!$('dash').hidden) renderDash(); }, 60000);

// ---- shelves: Continue reading (manga library) + Airing today (anime list) ----
async function coverUrl(url) {
  if (!url) return '';
  try { const r = await fetch(url, { credentials: 'omit' }); if (r.ok) return URL.createObjectURL(await r.blob()); } catch {}
  return url;
}
let shelvesKey = '';
async function renderShelves() {
  const box = $('shelves');
  if (s.showShelves === false || !chromeLike()) { box.replaceChildren(); return; }
  const { mdLibrary = [], animeList = [] } = await chrome.storage.local.get(['mdLibrary', 'animeList']);
  const reading = mdLibrary.filter((e) => e.lastNum).sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0)).slice(0, 6);
  const now = Date.now() / 1000;
  const airing = animeList.filter((a) => a.next && a.next.airingAt - now < 86400 * 1.5 && a.next.airingAt - now > -3600).slice(0, 6);
  const key = JSON.stringify([reading.map((e) => [e.id, e.lastNum]), airing.map((a) => [a.id, a.next?.episode])]);
  if (key === shelvesKey) return;
  shelvesKey = key;
  const shelf = (title, items, link) => {
    if (!items.length) return null;
    const sec = document.createElement('div'); sec.className = 'shelf';
    sec.innerHTML = `<div class="shelf-h"><span></span><a></a></div><div class="shelf-row"></div>`;
    sec.querySelector('.shelf-h span').textContent = title;
    Object.assign(sec.querySelector('.shelf-h a'), { textContent: 'Open →', href: chrome.runtime.getURL(link) });
    const row = sec.querySelector('.shelf-row');
    for (const it of items) {
      const a = document.createElement('a'); a.className = 'pcard'; a.href = it.href;
      a.innerHTML = '<div class="pc-img"></div><div class="pc-t"></div><div class="pc-s"></div>';
      a.querySelector('.pc-t').textContent = it.title; a.querySelector('.pc-s').textContent = it.sub;
      coverUrl(it.cover).then((u) => { if (u) a.querySelector('.pc-img').style.backgroundImage = `url("${u}")`; });
      row.append(a);
    }
    return sec;
  };
  const fmtIn = (t) => { const d = t - now; return d <= 0 ? 'airing now' : d < 3600 ? `in ${Math.round(d / 60)} min` : `in ${Math.round(d / 3600)} h`; };
  box.replaceChildren(...[
    shelf('Continue reading', reading.map((e) => ({ title: e.series, sub: `Ch. ${e.lastNum}${e.total ? ` of ${e.total}` : ''}`, cover: e.cover, href: e.url })), 'library/library.html'),
    // Ani Manga stays reachable from here even before anything is in your lists
    !reading.length && !airing.length && (() => {
      const sec = document.createElement('div'); sec.className = 'shelf';
      sec.innerHTML = '<div class="shelf-h"><span>Ani Manga</span><a>Open →</a></div>';
      sec.querySelector('a').href = chrome.runtime.getURL('anime/anime.html');
      return sec;
    })(),
    shelf('Airing today', airing.map((a) => ({ title: a.title, sub: `Ep ${a.next.episode} · ${fmtIn(a.next.airingAt)}`, cover: a.cover, href: chrome.runtime.getURL(`anime/anime.html#${a.id}`) })), 'anime/anime.html'),
  ].filter(Boolean));
}

function render() {
  applyLook();
  applyBackground();
  $('greeting').hidden = !s.showGreeting;
  $('clock').hidden = !s.showClock;
  $('date').hidden = !s.showDate;
  $('search').hidden = !s.showSearch;
  $('shortcuts').hidden = !s.showShortcuts;
  $('btnNotes').hidden = !s.showNotes;
  $('btnTodo').hidden = !s.showTodo;
  if (!s.showNotes) $('popNotes').hidden = true;
  if (!s.showTodo) $('popTodo').hidden = true;
  tick(); renderSearch(); renderShortcuts(); renderWeather(); renderQuote(); renderTodos(); renderShelves(); renderDash();
  if (document.activeElement !== $('notes')) $('notes').value = s.notes;
}

// ================= customize drawer =================
const SECTIONS = [
  { em: '⚡', title: 'Style', items: [
    { type: 'seg', key: 'theme', label: 'Theme', options: [['mynt', 'Material You'], ['chrome', 'Chrome+'], ['cyber', 'Cyber / gamer'], ['glass', 'Clean glass']] },
    { type: 'custom', when: chromeLike, render: renderSeedPicker },
    { type: 'seg', key: 'mode', label: 'Mode', options: [['system', 'Follow device'], ['dark', 'Dark'], ['light', 'Light']], when: chromeLike },
    { type: 'toggle', key: 'hud', label: 'HUD frame', desc: 'Corner brackets around the clock', when: () => s.theme === 'cyber' },
    { type: 'toggle', key: 'glitch', label: 'Glitch effect', desc: 'Clock glitches every few seconds', when: () => s.theme === 'cyber' },
    { type: 'toggle', key: 'scanlines', label: 'Scanlines', desc: 'Retro screen lines + vignette', when: () => s.theme === 'cyber' },
    { type: 'custom', render: (w) => { const b = document.createElement('div'); b.className = 'btns'; const x = Object.assign(document.createElement('button'), { textContent: 'Reskin Chrome top bar & footer →' }); x.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('setup/theme.html') }); b.append(x); w.append(b); } },
    { type: 'toggle', key: 'animate', label: 'Animations', desc: 'Moving grid + glitch. Uses more power and can make typing feel slower' },
  ] },
  { em: '🖼️', title: 'Background', items: [
    { type: 'seg', key: 'bgType', label: 'Type', options: [['theme', 'Theme colour'], ['cyber', 'Synthwave'], ['anime', 'Anime'], ['bing', 'Bing daily'], ['photo', 'Photos'], ['gradient', 'Gradient'], ['color', 'Color'], ['url', 'Link'], ['upload', 'Upload']] },
    { type: 'seg', key: 'animeEvery', label: 'New wallpaper', options: [['day', 'Every day'], ['tab', 'Every new tab']], when: () => s.bgType === 'anime' },
    { type: 'custom', when: () => s.bgType === 'gradient', render: renderGradientPicker },
    { type: 'color', key: 'bgColor', label: 'Color', when: () => s.bgType === 'color' },
    { type: 'text', key: 'bgUrl', label: 'Image link', placeholder: 'https://…/wallpaper.jpg', when: () => s.bgType === 'url' },
    { type: 'custom', when: () => s.bgType === 'upload', render: renderUpload },
    { type: 'seg', key: 'bgPhotoEvery', label: 'New photo', options: [['day', 'Every day'], ['tab', 'Every new tab']], when: () => s.bgType === 'photo' },
    { type: 'range', key: 'bgBlur', label: 'Blur', min: 0, max: 30, unit: 'px' },
    { type: 'range', key: 'bgDim', label: 'Darken', min: 0, max: 85, unit: '%' },
    { type: 'toggle', key: 'bgZoom', label: 'Slight zoom', desc: 'Hides blurred edges' },
  ] },
  { em: '🕒', title: 'Clock & greeting', items: [
    { type: 'toggle', key: 'showClock', label: 'Show clock' },
    { type: 'seg', key: 'clock24', label: 'Format', options: [[false, '12-hour'], [true, '24-hour']], when: () => s.showClock },
    { type: 'toggle', key: 'clockSeconds', label: 'Show seconds', when: () => s.showClock },
    { type: 'range', key: 'clockSize', label: 'Size', min: 40, max: 200, unit: 'px', when: () => s.showClock },
    { type: 'seg', key: 'clockWeight', label: 'Weight', options: [[200, 'Thin'], [300, 'Light'], [500, 'Medium'], [700, 'Bold']], when: () => s.showClock },
    { type: 'toggle', key: 'showDate', label: 'Show date' },
    { type: 'toggle', key: 'showGreeting', label: 'Show greeting' },
    { type: 'text', key: 'name', label: 'Your name', placeholder: 'e.g. Alex', when: () => s.showGreeting },
    { type: 'text', key: 'greetingText', label: 'Custom message (replaces greeting)', placeholder: 'Leave empty for Good morning…', when: () => s.showGreeting },
  ] },
  { em: '🔎', title: 'Search', items: [
    { type: 'toggle', key: 'showSearch', label: 'Show search bar' },
    { type: 'select', key: 'engine', label: 'Search engine', options: Object.entries(ENGINES).map(([k, [n]]) => [k, n]), when: () => s.showSearch },
    { type: 'range', key: 'searchWidth', label: 'Width', min: 320, max: 900, unit: 'px', when: () => s.showSearch },
    { type: 'text', key: 'searchPlaceholder', label: 'Placeholder text', placeholder: 'Search or type a link', when: () => s.showSearch },
  ] },
  { em: '⭐', title: 'Shortcuts', items: [
    { type: 'toggle', key: 'showShortcuts', label: 'Show shortcuts' },
    { type: 'seg', key: 'shortcutSource', label: 'Show', options: [['custom', 'My shortcuts'], ['top', 'Most visited']], when: () => s.showShortcuts },
    { type: 'custom', when: () => s.showShortcuts && s.shortcutSource === 'custom', render: renderShortcutList },
    { type: 'range', key: 'shortcutCols', label: 'Per row', min: 3, max: 10, unit: '', when: () => s.showShortcuts },
    { type: 'range', key: 'shortcutSize', label: 'Tile size', min: 60, max: 140, unit: 'px', when: () => s.showShortcuts },
    { type: 'seg', key: 'shortcutStyle', label: 'Style', options: [['glass', 'Glass'], ['flat', 'Minimal']], when: () => s.showShortcuts },
    { type: 'toggle', key: 'shortcutLabels', label: 'Show names', when: () => s.showShortcuts },
  ] },
  { em: '🧩', title: 'Widgets', items: [
    { type: 'toggle', key: 'showToday', label: 'Today card', desc: 'Your to-do list on the home page' },
    { type: 'toggle', key: 'showTimetable', label: 'Timetable card', desc: 'Weekly timetable with what’s on now / next' },
    { type: 'toggle', key: 'showShelves', label: 'Continue reading / Airing today', desc: 'From your manga library and anime list' },
    { type: 'toggle', key: 'showWeather', label: 'Weather', desc: 'Free, no account (Open-Meteo)' },
    { type: 'text', key: 'weatherCity', label: 'City', placeholder: 'e.g. London', when: () => s.showWeather },
    { type: 'seg', key: 'weatherUnit', label: 'Unit', options: [['c', '°C'], ['f', '°F']], when: () => s.showWeather },
    { type: 'toggle', key: 'showQuote', label: 'Philosophical quote of the day' },
    { type: 'toggle', key: 'showNotes', label: 'Notes button' },
    { type: 'toggle', key: 'showTodo', label: 'To-do button' },
  ] },
  { em: '🎨', title: 'Look & feel', items: [
    { type: 'custom', render: renderAccent },
    { type: 'select', key: 'font', label: 'Font', options: Object.entries(FONTS).map(([k, [n]]) => [k, n]) },
    { type: 'seg', key: 'layout', label: 'Position', options: [['center', 'Centered'], ['top', 'Higher up']] },
    { type: 'range', key: 'glassBlur', label: 'Glass blur', min: 0, max: 40, unit: 'px' },
    { type: 'range', key: 'glassAlpha', label: 'Glass opacity', min: 0, max: 60, unit: '%' },
    { type: 'range', key: 'radius', label: 'Corner roundness', min: 0, max: 32, unit: 'px' },
    { type: 'toggle', key: 'panelDark', label: 'Dark glass', desc: 'Better on bright wallpapers' },
    { type: 'toggle', key: 'textShadow', label: 'Text shadow', desc: 'Keeps text readable on any photo' },
  ] },
  { em: '💾', title: 'Backup & reset', items: [{ type: 'custom', render: renderBackup }] },
];

const whenList = [];
function refreshWhen() { for (const [node, fn] of whenList) node.hidden = !fn(); }

function buildDrawer() {
  const body = $('drawerBody');
  body.replaceChildren();
  whenList.length = 0;
  SECTIONS.forEach((sec, i) => {
    const d = document.createElement('details');
    d.className = 'sec'; d.open = i === 0;
    d.innerHTML = `<summary><span class="em">${sec.em}</span>${sec.title}</summary>`;
    const inner = document.createElement('div'); inner.className = 'sec-body';
    for (const it of sec.items) {
      const node = buildItem(it);
      if (it.when) whenList.push([node, it.when]);
      inner.append(node);
    }
    d.append(inner); body.append(d);
  });
  refreshWhen();
}

function buildItem(it) {
  const wrap = document.createElement('div');
  wrap.className = 'it';
  const lbl = (extra = '') => { const l = document.createElement('div'); l.className = 'lbl'; l.textContent = it.label || ''; if (extra) l.append(Object.assign(document.createElement('em'), { textContent: extra })); return l; };
  if (it.type === 'toggle') {
    wrap.classList.add('tg');
    const t = document.createElement('div'); t.textContent = it.label;
    if (it.desc) t.append(Object.assign(document.createElement('small'), { textContent: it.desc }));
    const sw = document.createElement('label'); sw.className = 'sw';
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!s[it.key] });
    cb.onchange = () => set({ [it.key]: cb.checked });
    sw.append(cb, document.createElement('span'));
    wrap.append(t, sw);
  } else if (it.type === 'seg') {
    const seg = document.createElement('div'); seg.className = 'seg';
    const mark = () => seg.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', it.options[k][0] === s[it.key]));
    it.options.forEach(([v, name]) => {
      const b = Object.assign(document.createElement('button'), { textContent: name });
      b.onclick = () => { set({ [it.key]: v }); mark(); };
      seg.append(b);
    });
    mark(); wrap.append(lbl(), seg);
  } else if (it.type === 'select') {
    const sel = document.createElement('select');
    it.options.forEach(([v, n]) => sel.add(new Option(n, v)));
    sel.value = s[it.key];
    sel.onchange = () => set({ [it.key]: sel.value });
    wrap.append(lbl(), sel);
  } else if (it.type === 'range') {
    const l = lbl(s[it.key] + it.unit);
    const r = Object.assign(document.createElement('input'), { type: 'range', min: it.min, max: it.max, value: s[it.key] });
    r.oninput = () => { l.lastChild.textContent = r.value + it.unit; set({ [it.key]: Number(r.value) }); };
    wrap.append(l, r);
  } else if (it.type === 'text') {
    const inp = Object.assign(document.createElement('input'), { type: 'text', value: s[it.key] || '', placeholder: it.placeholder || '' });
    inp.onchange = () => set({ [it.key]: inp.value.trim() });
    wrap.append(lbl(), inp);
  } else if (it.type === 'color') {
    const inp = Object.assign(document.createElement('input'), { type: 'color', value: s[it.key] });
    inp.oninput = () => set({ [it.key]: inp.value });
    wrap.append(lbl(), inp);
  } else if (it.type === 'custom') {
    it.render(wrap);
  }
  return wrap;
}

// Chrome's own preset colours, plus the brown Chrome is using now
const SEEDS = [['Your Chrome', '#8a5a44'], ['Blue', '#4a7bd0'], ['Cool grey', '#5f6b7a'], ['Grey', '#6b6b6b'], ['Aqua', '#2e8b94'], ['Viridian', '#3a8a5c'],
  ['Citron', '#a19a2d'], ['Apricot', '#c27c3e'], ['Rose', '#c2526b'], ['Fuchsia', '#b0459c'], ['Violet', '#7a5ac8'], ['Neon red', '#fa1e4e']];
function renderSeedPicker(wrap) {
  const l = document.createElement('div'); l.className = 'lbl'; l.textContent = 'Colour – match it to your Chrome colour so the page blends in';
  const sw = document.createElement('div'); sw.className = 'swatches';
  const mark = () => sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === s.seed));
  for (const [name, c] of SEEDS) {
    const b = Object.assign(document.createElement('button'), { title: name }); b.dataset.c = c; b.style.background = c;
    b.onclick = () => { set({ seed: c }); mark(); };
    sw.append(b);
  }
  const pick = document.createElement('label'); pick.title = 'Any colour';
  const ci = Object.assign(document.createElement('input'), { type: 'color', value: s.seed });
  ci.oninput = () => { set({ seed: ci.value }); mark(); };
  pick.append(ci); sw.append(pick);
  mark(); wrap.append(l, sw);
}

function renderGradientPicker(wrap) {
  const g = document.createElement('div'); g.className = 'presets';
  GRADIENTS.forEach(([name, css], i) => {
    const b = Object.assign(document.createElement('button'), { title: name });
    b.style.background = css;
    b.classList.toggle('on', s.bgGradient === i);
    b.onclick = () => { set({ bgGradient: i }); g.querySelectorAll('button').forEach((x, k) => x.classList.toggle('on', k === i)); };
    g.append(b);
  });
  wrap.append(g);
}
function renderUpload(wrap) {
  const row = document.createElement('div'); row.className = 'btns';
  const l = document.createElement('label'); l.textContent = 'Choose image from computer';
  const f = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  f.onchange = () => {
    const file = f.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = async () => { await chrome.storage.local.set({ ntpUpload: rd.result }); bgKey = ''; set({ bgType: 'upload' }); };
    rd.readAsDataURL(file);
  };
  l.append(f); row.append(l); wrap.append(row);
}
function renderAccent(wrap) {
  const l = document.createElement('div'); l.className = 'lbl'; l.textContent = 'Accent color (used everywhere)';
  const sw = document.createElement('div'); sw.className = 'swatches';
  const mark = () => sw.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === accent));
  for (const c of SWATCHES) {
    const b = Object.assign(document.createElement('button'), { title: c }); b.dataset.c = c; b.style.background = c;
    b.onclick = () => { chrome.storage.sync.set({ accent: c }); };
    sw.append(b);
  }
  const pick = document.createElement('label'); pick.title = 'Any color';
  const ci = Object.assign(document.createElement('input'), { type: 'color', value: accent });
  ci.oninput = () => chrome.storage.sync.set({ accent: ci.value });
  pick.append(ci); sw.append(pick);
  mark(); accentMarkers.push(mark);
  wrap.append(l, sw);
}
const accentMarkers = [];
function renderShortcutList(wrap) {
  const list = document.createElement('div'); list.className = 'sclist';
  const draw = () => {
    list.replaceChildren(...s.shortcuts.map((sc, i) => {
      const row = document.createElement('div');
      const img = new Image(); img.src = fav(sc.url);
      const sp = Object.assign(document.createElement('span'), { textContent: sc.title });
      const up = Object.assign(document.createElement('button'), { textContent: '↑', title: 'Move up' });
      const ed = Object.assign(document.createElement('button'), { textContent: '✎', title: 'Edit' });
      const rm = Object.assign(document.createElement('button'), { textContent: '✕', title: 'Remove' });
      up.onclick = () => { if (!i) return; const a = [...s.shortcuts]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ shortcuts: a }); draw(); };
      ed.onclick = () => openEditor(i);
      rm.onclick = () => { set({ shortcuts: s.shortcuts.filter((_, k) => k !== i) }); draw(); };
      row.append(img, sp, up, ed, rm);
      return row;
    }));
  };
  shortcutListDraw = draw;
  const btns = document.createElement('div'); btns.className = 'btns';
  const add = Object.assign(document.createElement('button'), { textContent: '+ Add shortcut' });
  add.onclick = () => openEditor(-1);
  btns.append(add);
  draw(); wrap.append(list, btns);
}
let shortcutListDraw = null;
function renderBackup(wrap) {
  const row = document.createElement('div'); row.className = 'btns';
  const ex = Object.assign(document.createElement('button'), { textContent: 'Export' });
  ex.onclick = () => {
    const a = Object.assign(document.createElement('a'), { download: 'shield-client-home.json', href: URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })) });
    a.click();
  };
  const im = document.createElement('label'); im.textContent = 'Import';
  const f = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
  f.onchange = async () => { try { set({ ...DEFAULTS, ...JSON.parse(await f.files[0].text()) }); bgKey = ''; buildDrawer(); render(); } catch { alert('That file is not a Syndicates Client backup.'); } };
  im.append(f);
  const rs = Object.assign(document.createElement('button'), { textContent: 'Reset', className: 'danger' });
  rs.onclick = () => { if (confirm('Reset the home page to default settings? Your notes and to-dos will be cleared.')) { s = { ...DEFAULTS }; set({}); bgKey = ''; buildDrawer(); } };
  row.append(ex, im, rs);
  wrap.append(row);
}

function openDrawer(open) {
  $('drawer').classList.toggle('open', open);
  $('drawer').setAttribute('aria-hidden', String(!open));
  $('btnCustomize').classList.toggle('on', open);
}
$('pillCustomize').onclick = () => openDrawer(true);
$('btnCustomize').onclick = () => openDrawer(!$('drawer').classList.contains('open'));
$('drawerClose').onclick = () => openDrawer(false);

document.addEventListener('keydown', async (e) => {
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    const { hotSidebar = ']' } = await chrome.storage.sync.get(['hotSidebar']);
    if (e.key === hotSidebar) {
      const w = await chrome.windows.getCurrent(); chrome.sidePanel.open({ windowId: w.id }); return;
    }
  }
  if (e.key === 'Escape') { openDrawer(false); togglePop(null); $('modal').hidden = true; }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('q').focus(); }
});

// ================= boot =================
const [{ ntp }, sync] = await Promise.all([chrome.storage.local.get('ntp'), chrome.storage.sync.get(['accent'])]);
s = { ...DEFAULTS, ...(ntp || {}) };
if ((s.perfV || 0) < 3) { s.animate = false; s.theme = 'chrome'; s.bgType = 'theme'; s.font = 'system'; s.perfV = 3; chrome.storage.local.set({ ntp: s }); }
if (s.perfV < 4) { s.showShelves = false; s.perfV = 4; chrome.storage.local.set({ ntp: s }); }
if (s.perfV < 5) { s.theme = 'mynt'; s.mode = 'dark'; s.bgType = 'theme'; s.showShelves = true; s.perfV = 5; chrome.storage.local.set({ ntp: s }); } // one-time move to the Material You home
accent = sync.accent || accent;
render();
buildDrawer();
paintHud();
if (location.hash === '#customize') openDrawer(true);
setInterval(tick, 1000);
function paintHud() {} // status label removed
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'sync' && c.adBlock) paintHud();
  if (area === 'sync' && c.accent) { accent = c.accent.newValue; applyLook(); applyBackground(); accentMarkers.forEach((m) => m()); }
  if (area === 'local' && c.ntp && shortcutListDraw) { s = { ...DEFAULTS, ...c.ntp.newValue }; renderShortcuts(); shortcutListDraw(); }
});
