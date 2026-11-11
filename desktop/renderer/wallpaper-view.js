// The wallpaper: a photo, a video or a web page (your Windows background when nothing's picked), plus the
// desktop widgets. Each virtual desktop can have its own. Used full-screen behind the icons and, scaled down,
// as the live preview in Customize.
import { greeting, quoteOfTheHour, fmtTime, fmtDate, upcomingClass, wallFor } from './common.js';

// weather icons by WMO code (Open-Meteo), drawn as simple line art
function weatherIcon(code, day = true) {
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.6 4.6L6 6M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>';
  const moon = '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>';
  const cloud = '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.5 3.5 0 0 0 7 18z"/>';
  const g = code === 0 ? (day ? sun : moon) : code <= 2 ? `<g transform="translate(-3 -3) scale(.7)">${day ? sun : moon}</g><g transform="translate(3 3) scale(.75)">${cloud}</g>`
    : code === 3 || code === 45 || code === 48 ? cloud
    : code >= 95 ? `${cloud}<path d="M12 13l-2 4h3l-2 4"/>`
    : (code >= 71 && code <= 77) || code === 85 || code === 86 ? `<g transform="translate(0 -3)">${cloud}</g><path d="M8 20h.01M12 21h.01M16 20h.01"/>`
    : `<g transform="translate(0 -3)">${cloud}</g><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>`;
  return `<svg viewBox="0 0 24 24">${g}</svg>`;
}

// a 5×7 dot-matrix font for the Syndicates clock (like an LED board): lit dots and faint unlit ones
const DOTS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
};
// Mecha pixels, not round LEDs: each one a square with two corners cut (the bevel of the theme's frames), all the lit
// ones in one path and the unlit in another (cheap to draw, crisp at any size)
function dotMatrix(text) {
  let x = 0; const lit = [], dim = [];
  const S = 0.9, C = 0.3, O = (1 - S) / 2;
  const px = (cx, cy) => `M${cx + O + C} ${cy + O}h${S - C}v${S - C}l${-C} ${C}h${C - S}v${C - S}z`;
  for (const ch of text) {
    const g = DOTS[ch]; if (!g) continue;
    g.forEach((row, y) => [...row].forEach((b, i) => (b === '1' ? lit : dim).push(px(x + i, y))));
    x += g[0].length + 1;
  }
  const w = Math.max(1, x - 1);
  return `<svg class="dm" viewBox="0 0 ${w} 7" style="aspect-ratio:${w}/7"><defs><linearGradient id="dmLit" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="0" y2="1"><stop class="g0" offset=".05"/><stop class="g0" offset=".22"/><stop class="g1" offset=".26"/><stop class="g1" offset=".7"/><stop class="g2" offset=".74"/></linearGradient></defs>`
    + `<path class="off" d="${dim.join('')}"/><path class="on" d="${lit.join('')}"/></svg>`;
}
// a pixel health bar: so many square cells, lit up to the value (green, then amber, then red as it climbs)
const CELLS = 20;
const healthBar = () => `<i class="cells">${Array.from({ length: CELLS }, (_, i) => `<s style="--i:${i}"></s>`).join('')}</i>`;
// light the first n cells; the last lit one is the bar's glowing head
function fillCells(row, n) {
  row.querySelectorAll('.cells s').forEach((c, i) => { c.classList.toggle('on', i < n); c.classList.toggle('head', i === n - 1); });
  row.style.setProperty('--fill', n / CELLS);
}

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export function mountWallpaper(root, settings, { preview = false, sd = window.sd, desk = '' } = {}) {
  root.classList.add('wp');
  const media = el('div', 'wp-media');
  const dim = el('div', 'wp-dim');
  const layer = el('div', 'wp-widgets');
  // grouped layouts: the time in one hero stack, the info as a row (or column) of matching cards
  const groups = { tl: el('div', 'wp-group wp-tl'), bl: el('div', 'wp-group wp-bl'), synl: el('div', 'wp-group wp-synl'), synb: el('div', 'wp-group wp-synb'), synr: el('div', 'wp-group wp-synr') };
  // Mac layout (after macOS desktop widgets): calendar + weather top left, reminders + now playing bottom left
  const MAC_GROUP = { calendar: 'tl', weather: 'tl', goals: 'tl', reminders: 'bl', media: 'bl' };
  const hidden = el('div', 'wp-hidden');
  // Syndicates layout (made for the Mecha theme): a cockpit HUD down the left, a strip along the bottom, a rail on the right
  const SYN_GROUP = { greeting: 'synl', clock: 'synl', date: 'synl', weather: 'synl', calendar: 'synl', reminders: 'synl', media: 'synb', today: 'synb', stats: 'synr', goals: 'synr', quote: 'synr' };
  const ORDER = ['greeting', 'clock', 'date', 'calendar', 'weather', 'goals', 'today', 'reminders', 'media', 'stats', 'quote'];
  layer.append(groups.tl, groups.bl, groups.synl, groups.synb, groups.synr, hidden);
  root.append(media, dim, layer);
  let s = settings, mediaKey = '', deskId = desk, winToken = 0;
  // the preview in Customize shows a sample so the widget can be placed while nothing plays
  let nowPlaying = preview ? { on: true, title: 'Song title', artist: 'Artist', playing: true, art: '' } : { on: false };
  const widgets = {};

  // ---------- background ----------
  // a new picture fades in over the old one (switching desktops with different wallpapers, picking a new one)
  function show(node) {
    const old = [...media.children];
    node.classList.add('wp-layer');
    media.append(node);
    const reveal = () => { node.classList.add('in'); setTimeout(() => old.forEach((o) => o.remove()), 650); };
    if (node.tagName === 'IMG') { node.onload = reveal; node.onerror = () => { node.remove(); if (!old.length) media.append(el('div', 'wp-empty wp-layer in', preview ? 'Pick a photo, video or page below' : '')); }; }
    else if (node.tagName === 'VIDEO') { node.oncanplay = reveal; node.onerror = reveal; }
    else reveal();
  }
  function applyBackground() {
    const w = wallFor(s.wallpaper, deskId);
    root.style.setProperty('--dim', Math.min(0.85, w.dim ?? 0.15));
    root.classList.toggle('still', w.parallax === false);
    const src = (w.scene === 'image' || w.scene === 'video') && w.file ? w.scene : w.scene === 'web' && /^https?:\/\//i.test(w.url) ? 'web' : 'windows';
    // what's actually shown, not which desktop: switching desktops with the same wallpaper changes nothing (it used
    // to reload and fade in the same picture on every switch, a visible flash). Windows' own background: its file.
    if (src === 'windows') {
      const token = ++winToken;
      (sd.winwallKey ? sd.winwallKey(deskId) : Promise.resolve(deskId)).catch(() => deskId).then((file) => {
        if (token !== winToken) return; // a newer change came in meanwhile
        const key = `windows|${file}`;
        if (key === mediaKey) return;
        mediaKey = key;
        const img = el('img', 'wp-native'); img.alt = ''; img.src = `sd://media/winwall?desk=${encodeURIComponent(deskId)}&v=${encodeURIComponent(file)}`; show(img);
      });
      return;
    }
    winToken++;
    const key = `${src}|${src === 'web' ? w.url : w.file}|${w.fileStamp || ''}`;
    if (key === mediaKey) return;
    mediaKey = key;
    const q = `desk=${encodeURIComponent(deskId)}&v=${encodeURIComponent(w.fileStamp || w.file || Date.now())}`;
    if (src === 'image') { const img = el('img'); img.alt = ''; img.src = `sd://media/wallpaper?${q}`; show(img); }
    else if (src === 'video') { const v = el('video'); Object.assign(v, { src: `sd://media/wallpaper?${q}`, muted: true, loop: true, autoplay: true, playsInline: true }); if (root.classList.contains('paused')) v.autoplay = false; show(v); }
    else if (src === 'web') { const f = el('iframe'); f.src = w.url; f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.referrerPolicy = 'no-referrer'; show(f); }
  }

  // ---------- widgets ----------
  const MAKERS = {
    clock: () => el('div', 'w-clock'),
    greeting: () => el('div', 'w-greeting'),
    date: () => el('div', 'w-date'),
    stats: () => el('div', 'w-stats w-card', `<div class="hbars"><div class="hb" data-k="cpu"><b>CPU</b>${healthBar()}<em></em></div><div class="hb" data-k="mem"><b>RAM</b>${healthBar()}<em></em></div></div>` + '<div class="ring" data-k="cpu"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.5"/><circle class="fg" cx="18" cy="18" r="15.5"/></svg><b></b><small>CPU</small></div><div class="ring" data-k="mem"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.5"/><circle class="fg" cx="18" cy="18" r="15.5"/></svg><b></b><small>RAM</small></div>'),
    weather: () => el('div', 'w-weather w-card', '<div class="wh"><span class="place"></span><b class="t">–</b></div><div class="wr"><i class="wi"></i><span class="d">Loading…</span><span class="hl"></span></div><div class="hours"></div>'),
    calendar: () => el('div', 'w-calendar w-card'),
    reminders: () => el('div', 'w-reminders w-card', '<div class="rh"><b>Reminders</b><em></em></div><ul></ul>'),
    today: () => el('div', 'w-today w-card', '<div class="col cls"><span class="lbl">Next</span><b></b><span class="sub"></span></div><div class="col todo"><span class="lbl">To-do</span><b></b><span class="sub"></span></div>'),
    goals: () => el('div', 'w-goals w-card', `<div class="gh"><b>Today's goals</b><em></em></div><div class="hb" data-k="revision"><b>REVISE</b>${healthBar()}<em></em></div><div class="hb" data-k="hobby"><b>HOBBY</b>${healthBar()}<em></em></div>`),
    quote: () => el('figure', 'w-quote', '<blockquote></blockquote><figcaption></figcaption>'),
    media: () => el('div', 'w-media w-card', '<div class="art none"><svg class=\"note\" viewBox=\"0 0 24 24\"><path d=\"M9 18V6l10-2v12\"/><circle cx=\"6.5\" cy=\"18\" r=\"2.5\"/><circle cx=\"16.5\" cy=\"16\" r=\"2.5\"/></svg></div><div class="txt"><b></b><span></span></div><i class="eq"><s></s><s></s><s></s></i>'),
  };
  const layout = () => (['mac', 'syn', 'free'].includes(s.widgets.layout) ? s.widgets.layout : 'mac');
  const cardsLayout = () => layout() === 'mac' || layout() === 'syn'; // the card-shaped widgets (calendar, reminders, the wide weather)
  // Today: the class on now / next (from the Home panel's timetable) and what's left on the to-do list
  function todayInfo() {
    const nc = upcomingClass(s.home?.timetable), open = (s.home?.todos || []).filter((t) => !t.done);
    if (preview && !nc && !open.length) return { nc: { cls: { t: 'Maths', s: '10:00', p: 'Room 3' }, now: false, day: 'today' }, open: [{ text: 'Finish the essay' }, {}] };
    return { nc, open };
  }
  function renderToday() {
    const e = widgets.today; if (!e) return;
    const { nc, open } = todayInfo();
    e.querySelector('.todo').hidden = !open.length || (layout() === 'syn' && !!s.widgets.reminders?.on); // Syndicates: the to-dos are in Reminders already
    const lbl = e.querySelector('.cls .lbl'), b = e.querySelector('.cls b'), sub = e.querySelector('.cls .sub');
    if (nc) { lbl.textContent = nc.now ? 'Now' : nc.day === 'today' ? 'Next' : `Next · ${nc.day}`; b.textContent = nc.cls.t; sub.textContent = [nc.cls.s, nc.cls.p].filter(Boolean).join(' · '); }
    else { lbl.textContent = 'Timetable'; b.textContent = 'No classes yet'; sub.textContent = 'Add them in Home (Alt+Space)'; }
    if (open.length) { e.querySelector('.todo b').textContent = `${open.length} left`; e.querySelector('.todo .sub').textContent = open[0].text || ''; }
  }
  // Daily goals (revision, hobby): from the app (Home starts and stops them); the running one keeps counting here
  let goalsSt = null, goalsAt = 0;
  const hm = (sec) => { const m = Math.floor(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  function renderGoals() {
    const e = widgets.goals; if (!e || e.hidden) return;
    const g = goalsSt || (preview ? { revision: 4800, hobby: 600, running: 'revision', goal: { revision: 10800, hobby: 1800 } } : null);
    if (!g) return;
    for (const k of ['revision', 'hobby']) {
      const have = g[k] + (g.running === k && goalsSt ? (Date.now() - goalsAt) / 1000 : 0), goal = g.goal[k] || 1;
      const row = e.querySelector(`.hb[data-k="${k}"]`), n = Math.min(CELLS, Math.floor((have / goal) * CELLS));
      fillCells(row, n);
      row.querySelector('em').textContent = `${hm(have)}/${hm(goal)}`;
      row.classList.toggle('done', have >= goal); row.classList.toggle('run', g.running === k);
    }
    e.querySelector('.gh em').textContent = g.running ? `● ${g.running === 'revision' ? 'REVISING' : 'HOBBY'}` : '';
  }
  if (!preview && sd?.goals) { sd.onGoals?.((g) => { goalsSt = g; goalsAt = Date.now(); renderGoals(); }); sd.goals().then((g) => { goalsSt = g; goalsAt = Date.now(); renderGoals(); }).catch(() => {}); }
  const visible = (k, cfg) => cfg.on && (k !== 'media' || nowPlaying.on || cardsLayout())

  function placeWidgets() {
    const mode = layout();
    layer.dataset.layout = mode; layer.classList.toggle('macish', mode === 'mac' || mode === 'syn');
    layer.dataset.dock = s.dock?.on ? 'on' : 'off'; // keep the bottom clear for the dock
    for (const k of ORDER) {
      const cfg = s.widgets[k];
      if (!cfg || !MAKERS[k]) continue;
      if (!widgets[k]) { widgets[k] = MAKERS[k](); widgets[k].dataset.w = k; }
      const e = widgets[k];
      const g = mode === 'mac' ? MAC_GROUP[k] : mode === 'syn' ? SYN_GROUP[k] : 'layer';
      const parent = g === 'layer' ? layer : groups[g] || hidden; // calendar and reminders only exist in the Mac layout
      parent.append(e); // keeps ORDER inside each group
      e.hidden = !visible(k, cfg) || parent === hidden;
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
        const html = layout() === 'syn' ? `${dotMatrix(hm)}${ampm ? `<span class="ap">${ampm}</span>` : ''}` // Syndicates: LED dots
          : `<span class="hm">${hm}</span>${ampm ? `<span class="ap">${ampm}</span>` : ''}`;
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
      const r = widgets.stats.querySelector(`.ring[data-k="${k}"]`);
      r.querySelector('b').textContent = `${st[k]}%`;
      r.querySelector('.fg').style.strokeDasharray = `${(st[k] / 100) * 97.4} 97.4`;
      const hb = widgets.stats.querySelector(`.hb[data-k="${k}"]`), n = Math.round((st[k] / 100) * CELLS);
      hb.querySelector('em').textContent = `${String(st[k]).padStart(2, '0')}%`;
      fillCells(hb, n);
    }
  }
  async function refreshWeather() {
    const w = widgets.weather, city = s.widgets.weather?.city;
    if (!w || w.hidden || !sd?.weather) return;
    w.dataset.loaded = '1';
    try {
      const r = await sd.weather(city || '');
      w.querySelector('.t').textContent = cardsLayout() ? `${r.temp}°` : `${r.temp}${r.unit}`;
      w.querySelector('.d').textContent = cardsLayout() ? r.text : `${r.text} · ${r.place}`;
      w.querySelector('.place').textContent = r.place;
      w.querySelector('.wi').innerHTML = weatherIcon(r.code, r.day);
      w.querySelector('.hl').textContent = Number.isFinite(r.hi) ? `H:${r.hi}° L:${r.lo}°` : '';
      w.dataset.done = '1';
      w.querySelector('.hours').replaceChildren(...(r.hourly || []).map((h) => { const d = el('div', 'hr'); d.innerHTML = `<small>${String(h.hour).padStart(2, '0')}</small><i>${weatherIcon(h.code, h.hour >= 6 && h.hour < 19)}</i><b>${h.temp}°</b>`; return d; }));
    }
    catch (e) { w.dataset.done = '1'; w.querySelector('.t').textContent = '–'; w.querySelector('.d').textContent = String(e?.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/fetch failed|net::ERR_\w+/, "can't reach the weather service") || 'Weather unavailable'; }
  }

  function renderMedia() {
    const m = widgets.media;
    if (!m) return;
    m.hidden = !visible('media', s.widgets.media || {});
    m.querySelector('b').textContent = nowPlaying.on ? nowPlaying.title || 'Unknown title' : 'Not playing';
    m.querySelector('span').textContent = nowPlaying.artist || '';
    m.classList.toggle('playing', !!nowPlaying.playing);
    const art = m.querySelector('.art');
    art.style.backgroundImage = /^data:image\//.test(nowPlaying.art || '') ? `url("${nowPlaying.art}")` : '';
    art.classList.toggle('none', !nowPlaying.art);
  }
  if (!preview && sd?.onMedia) { sd.onMedia((m) => { nowPlaying = m; renderMedia(); }); sd.media().then((m) => { nowPlaying = m; renderMedia(); }).catch(() => {}); }

  // Mac layout: a month calendar and your to-dos
  function renderCalendar() {
    const c = widgets.calendar; if (!c) return;
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const key = `${y}-${m}-${now.getDate()}`; if (c.dataset.key === key) return; c.dataset.key = key;
    const cells = [...Array(first.getDay()).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
    const wd = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
    c.innerHTML = `<b class="mo">${now.toLocaleDateString(undefined, { month: 'long' })}</b><div class="grid">${wd.map((d) => `<i>${d}</i>`).join('')}${cells.map((d) => `<span${d === now.getDate() ? ' class="today"' : ''}>${d}</span>`).join('')}</div>`;
  }
  function renderReminders() {
    const r = widgets.reminders; if (!r) return;
    const open = (s.home?.todos || []).filter((t) => !t.done);
    r.querySelector('em').textContent = open.length || '';
    r.querySelector('ul').replaceChildren(...open.slice(0, 4).map((t) => { const li = el('li'); li.innerHTML = '<i></i><span></span>'; li.querySelector('span').textContent = t.text; return li; }));
    if (!open.length) r.querySelector('ul').innerHTML = '<li class="none">All done</li>';
  }

  function update(next) {
    const cityChanged = next.widgets.weather?.city !== s.widgets.weather?.city;
    s = next;
    root.style.setProperty('--a', s.accent);
    applyBackground(); placeWidgets(); renderMedia(); renderToday(); renderGoals(); renderCalendar(); renderReminders(); refreshStats();
    if (cityChanged || (widgets.weather && !widgets.weather.hidden && !widgets.weather.dataset.loaded)) refreshWeather(); // also when it's just been switched on
  }
  update(settings);
  const clockT = setInterval(() => { tick(false); renderCalendar(); }, 1000);
  const todayT = setInterval(() => { if (widgets.today) { widgets.today.hidden = !visible('today', s.widgets.today || {}); renderToday(); } renderGoals(); }, 30e3);
  const statsT = setInterval(refreshStats, 3000);
  const weatherT = setInterval(refreshWeather, 15 * 60e3);
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
    refreshWeather,
    widgets,
    pause(p) { media.querySelectorAll('video').forEach((v) => (p ? v.pause() : v.play().catch(() => {}))); root.classList.toggle('paused', p); },
    /** Another virtual desktop is showing (or, in Customize, being edited): its wallpaper. */
    setDesk(id) { if (id === deskId) return; deskId = id; applyBackground(); },
    // switching desktops: the wallpaper glides a little the way the windows go, then settles back (depth: the
    // widgets in front move a bit more than the picture behind). Added on top of the parallax transforms, on the
    // compositor only, so it costs nothing on the main thread; off when Windows' animation effects are off.
    slide(dir) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const go = (e, dist) => e && !e.hidden && e.animate(
        // eased per half: glide out with the slide, then settle back softly (one curve over the whole thing jerked)
        [{ transform: 'translateX(0)', easing: 'cubic-bezier(.33,0,.2,1)' }, { transform: `translateX(${dir > 0 ? "-" : ""}${dist})`, offset: 0.38, easing: 'cubic-bezier(.4,0,.2,1)' }, { transform: 'translateX(0)' }],
        { duration: 800, composite: 'add' });
      go(media, '1.1%'); // the picture only: the widgets stay put, like a Mac's desktop widgets
    },
    pointer(x, y) { root.style.setProperty('--px', (x - 0.5).toFixed(3)); root.style.setProperty('--py', (y - 0.5).toFixed(3)); },
    destroy() { clearInterval(clockT); clearInterval(todayT); clearInterval(statsT); clearInterval(weatherT); root.replaceChildren(); },
  };
}
