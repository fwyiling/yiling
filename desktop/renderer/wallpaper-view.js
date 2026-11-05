// The wallpaper: an animated scene (or image / video / web page) plus the desktop widgets.
// Used full-screen behind the icons and, scaled down, as the live preview in Customize.
import { createScene } from './scenes.js';
import { startAudio, stopAudio, levels } from './audio.js';
import { greeting, quoteOfTheHour, fmtTime, fmtDate } from './common.js';

// Time-of-day tint: keyframes by hour (tint colour, how much of it, extra darkness), blended smoothly.
const DAY = [[0, '#0b1a3a', 0.45, 0.18], [5, '#1d2450', 0.4, 0.12], [7, '#ff9a8b', 0.3, 0], [10, '#ffffff', 0, 0],
  [16, '#ffffff', 0, 0], [18.5, '#ff7a3d', 0.35, 0.02], [20, '#5b3a8c', 0.38, 0.08], [22, '#0b1a3a', 0.45, 0.16], [24, '#0b1a3a', 0.45, 0.18]];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lerp = (a, b, t) => a + (b - a) * t;
export function dayTint(colors, date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const i = DAY.findIndex((k, j) => h >= k[0] && h < DAY[j + 1][0]);
  const [a, b] = [DAY[i], DAY[i + 1]], t = (h - a[0]) / (b[0] - a[0]);
  const tint = hex(a[1]).map((v, k) => lerp(v, hex(b[1])[k], t)), amt = lerp(a[2], b[2], t), dark = lerp(a[3], b[3], t);
  return { colors: colors.map((c) => toHex(hex(c).map((v, k) => lerp(v, tint[k], amt)))), dark };
}

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export function mountWallpaper(root, settings, { preview = false, sd = window.sd } = {}) {
  root.classList.add('wp');
  const canvas = el('canvas', 'wp-canvas');
  const media = el('div', 'wp-media');
  const dim = el('div', 'wp-dim');
  const layer = el('div', 'wp-widgets');
  // grouped layouts: the time in one hero stack, the info as a row (or column) of matching cards
  const groups = { hero: el('div', 'wp-group wp-hero'), cards: el('div', 'wp-group wp-cards'), foot: el('div', 'wp-group wp-foot') };
  const GROUP_OF = { greeting: 'hero', clock: 'hero', date: 'hero', media: 'cards', weather: 'cards', stats: 'cards', quote: 'foot' };
  const ORDER = ['greeting', 'clock', 'date', 'media', 'weather', 'stats', 'quote'];
  layer.append(groups.hero, groups.cards, groups.foot);
  root.append(canvas, media, dim, layer);
  let scene = null, s = settings, mediaKey = '';
  // the preview in Customize shows a sample so the widget can be placed while nothing plays
  let nowPlaying = preview ? { on: true, title: 'Song title', artist: 'Artist', playing: true, art: '' } : { on: false };
  const widgets = {};

  // ---------- background ----------
  function applyBackground() {
    const w = s.wallpaper;
    const tint = w.dayCycle ? dayTint(w.colors) : { colors: w.colors, dark: 0 };
    root.style.setProperty('--dim', Math.min(0.85, w.dim + tint.dark));
    const animated = !['image', 'video', 'web'].includes(w.scene);
    canvas.hidden = !animated;
    // music-reactive: the wallpaper itself listens; the small preview in Customize never does
    const wantAudio = !preview && (w.audio || w.scene === 'visualizer');
    if (wantAudio) startAudio(); else if (!preview) stopAudio();
    if (animated) {
      const opts = { ...w, colors: tint.colors, fps: preview ? 30 : s.general.fps, levels: wantAudio ? levels : null };
      if (!scene) scene = createScene(canvas, opts); else scene.set(opts);
    } else { scene?.destroy(); scene = null; }
    const key = animated ? '' : `${w.scene}|${w.file}|${w.url}|${w.fileStamp || ''}`;
    if (key === mediaKey) return;
    mediaKey = key; media.replaceChildren();
    if (w.scene === 'image' && w.file) {
      const img = el('img'); img.src = `sd://media/wallpaper?v=${encodeURIComponent(w.fileStamp || w.file)}`; img.alt = ''; media.append(img);
    } else if (w.scene === 'video' && w.file) {
      const v = el('video'); Object.assign(v, { src: `sd://media/wallpaper?v=${encodeURIComponent(w.fileStamp || w.file)}`, muted: true, loop: true, autoplay: true, playsInline: true }); media.append(v);
    } else if (w.scene === 'web' && /^https?:\/\//i.test(w.url)) {
      const f = el('iframe'); f.src = w.url; f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.referrerPolicy = 'no-referrer'; media.append(f);
    } else if (!animated) {
      media.append(el('div', 'wp-empty', preview ? 'Pick a file or link below' : ''));
    }
  }

  // ---------- widgets ----------
  const MAKERS = {
    clock: () => el('div', 'w-clock'),
    greeting: () => el('div', 'w-greeting'),
    date: () => el('div', 'w-date'),
    stats: () => el('div', 'w-stats w-card', '<div class="ring" data-k="cpu"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.5"/><circle class="fg" cx="18" cy="18" r="15.5"/></svg><b></b><small>CPU</small></div><div class="ring" data-k="mem"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.5"/><circle class="fg" cx="18" cy="18" r="15.5"/></svg><b></b><small>RAM</small></div>'),
    weather: () => el('div', 'w-weather w-card', '<b class="t">–</b><span class="d">Set a city in Customize</span>'),
    quote: () => el('figure', 'w-quote', '<blockquote></blockquote><figcaption></figcaption>'),
    media: () => el('div', 'w-media w-card', '<div class="art none"><svg class=\"note\" viewBox=\"0 0 24 24\"><path d=\"M9 18V6l10-2v12\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"16.5\" cy=\"16\" r=\"2.5\"/></svg></div><div class="txt"><b></b><span></span></div><i class="eq"><s></s><s></s><s></s></i>'),
  };
  const layout = () => (['center', 'left', 'free'].includes(s.widgets.layout) ? s.widgets.layout : 'center');
  const visible = (k, cfg) => cfg.on && (k !== 'media' || nowPlaying.on) && (k !== 'weather' || preview || !!cfg.city);
  function placeWidgets() {
    const mode = layout();
    layer.dataset.layout = mode;
    for (const k of ORDER) {
      const cfg = s.widgets[k];
      if (!cfg || !MAKERS[k]) continue;
      if (!widgets[k]) { widgets[k] = MAKERS[k](); widgets[k].dataset.w = k; }
      const e = widgets[k];
      const parent = mode === 'free' ? layer : groups[GROUP_OF[k]];
      parent.append(e); // keeps ORDER inside each group
      e.hidden = !visible(k, cfg);
      e.style.left = mode === 'free' ? `${cfg.x * 100}%` : ''; e.style.top = mode === 'free' ? `${cfg.y * 100}%` : '';
      e.style.setProperty('--scale', cfg.scale || 1);
      if (k === 'clock') e.dataset.style = cfg.style || 'big';
    }
    tick(true);
  }
  function tick(force) {
    const now = new Date();
    const c = widgets.clock;
    if (c && !c.hidden) {
      if (c.dataset.style === 'analog') {
        if (!c.querySelector('svg')) c.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="face"/><line class="h" x1="50" y1="50" x2="50" y2="26"/><line class="m" x1="50" y1="50" x2="50" y2="14"/><line class="s" x1="50" y1="56" x2="50" y2="10"/><circle cx="50" cy="50" r="2.5" class="dot"/></svg>';
        const h = (now.getHours() % 12) + now.getMinutes() / 60, m = now.getMinutes() + now.getSeconds() / 60, sec = now.getSeconds();
        c.querySelector('.h').setAttribute('transform', `rotate(${h * 30} 50 50)`);
        c.querySelector('.m').setAttribute('transform', `rotate(${m * 6} 50 50)`);
        c.querySelector('.s').setAttribute('transform', `rotate(${sec * 6} 50 50)`);
      } else {
        const { hm, ampm } = fmtTime(now);
        const html = `<span class="hm">${hm}</span>${ampm ? `<span class="ap">${ampm}</span>` : ''}`;
        if (c.innerHTML !== html) c.innerHTML = html;
      }
    }
    if (widgets.greeting) widgets.greeting.textContent = greeting(now, s.name);
    if (widgets.date) widgets.date.textContent = fmtDate(now);
    if (widgets.quote && (force || now.getMinutes() === 0)) { const q = quoteOfTheHour(now); widgets.quote.querySelector('blockquote').textContent = `“${q[0]}”`; widgets.quote.querySelector('figcaption').textContent = `— ${q[1]}`; }
  }
  async function refreshStats() {
    if (!widgets.stats || widgets.stats.hidden || !sd?.stats) return;
    const st = await sd.stats().catch(() => null);
    if (!st) return;
    for (const k of ['cpu', 'mem']) {
      const r = widgets.stats.querySelector(`[data-k="${k}"]`);
      r.querySelector('b').textContent = `${st[k]}%`;
      r.querySelector('.fg').style.strokeDasharray = `${(st[k] / 100) * 97.4} 97.4`;
    }
  }
  async function refreshWeather() {
    const w = widgets.weather, city = s.widgets.weather?.city;
    if (!w || w.hidden || !sd?.weather) return;
    if (!city) { w.querySelector('.t').textContent = '–'; w.querySelector('.d').textContent = 'Set a city in Customize'; return; }
    try { const r = await sd.weather(city); w.querySelector('.t').textContent = `${r.temp}${r.unit}`; w.querySelector('.d').textContent = `${r.text} · ${r.place}`; }
    catch (e) { w.querySelector('.d').textContent = e.message || 'Weather unavailable'; }
  }

  function renderMedia() {
    const m = widgets.media;
    if (!m) return;
    m.hidden = !visible('media', s.widgets.media || {});
    m.querySelector('b').textContent = nowPlaying.title || 'Unknown title';
    m.querySelector('span').textContent = nowPlaying.artist || '';
    m.classList.toggle('playing', !!nowPlaying.playing);
    const art = m.querySelector('.art');
    art.style.backgroundImage = /^data:image\//.test(nowPlaying.art || '') ? `url("${nowPlaying.art}")` : '';
    art.classList.toggle('none', !nowPlaying.art);
  }
  if (!preview && sd?.onMedia) { sd.onMedia((m) => { nowPlaying = m; renderMedia(); }); sd.media().then((m) => { nowPlaying = m; renderMedia(); }).catch(() => {}); }

  function update(next) {
    const cityChanged = next.widgets.weather?.city !== s.widgets.weather?.city;
    s = next;
    root.style.setProperty('--a', s.accent);
    applyBackground(); placeWidgets(); renderMedia(); refreshStats();
    if (cityChanged || !widgets.weather?.dataset.loaded) { if (widgets.weather) widgets.weather.dataset.loaded = '1'; refreshWeather(); }
  }
  update(settings);
  const clockT = setInterval(() => tick(false), 1000);
  const statsT = setInterval(refreshStats, 3000);
  const weatherT = setInterval(refreshWeather, 15 * 60e3);
  const dayT = setInterval(() => { if (s.wallpaper.dayCycle) applyBackground(); }, 5 * 60e3);
  /** Where each visible widget sits now, as screen fractions (to switch to free placement without a jump). */
  function positions() {
    const r = root.getBoundingClientRect(), out = {};
    for (const [k, e] of Object.entries(widgets)) {
      if (e.hidden) continue;
      const b = e.getBoundingClientRect();
      out[k] = { x: +(((b.left + b.width / 2) - r.left) / r.width).toFixed(4), y: +(((b.top + b.height / 2) - r.top) / r.height).toFixed(4) };
    }
    return out;
  }
  return {
    update,
    positions,
    widgets,
    pause(p) { scene?.pause(p); media.querySelector('video')?.[p ? 'pause' : 'play']?.(); root.classList.toggle('paused', p); },
    pointer(x, y) { scene?.pointer(x, y); root.style.setProperty('--px', (x - 0.5).toFixed(3)); root.style.setProperty('--py', (y - 0.5).toFixed(3)); },
    destroy() { clearInterval(clockT); clearInterval(statsT); clearInterval(weatherT); clearInterval(dayT); scene?.destroy(); root.replaceChildren(); },
  };
}
