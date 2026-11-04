// Built-in-looking YouTube extras. Buttons and menus use YouTube's own player classes
// (ytp-button, ytp-popup/ytp-settings-menu, ytp-menuitem) so they look native – the
// approach used by YouTube-Enhancer (MIT). Data: SponsorBlock (sponsor.ajay.app, CC BY-NC-SA)
// and Return YouTube Dislike (returnyoutubedislikeapi.com).
(() => {
  if (window.top !== window && !location.pathname.startsWith('/embed/')) return;
  const S = { ytAds: true, ytSponsor: true, ytDislikes: true, ytQuality: 'auto', ytEndCards: false, ytButtons: true, ytHideShorts: false, ytBoost: 1, ytSpeed: 1 };
  let loop = false, currentId = null, segments = [], dislikes = null;

  const svg = (d, vb = '0 0 24 24') => `<svg height="100%" viewBox="${vb}" width="100%" fill="#fff"><path d="${d}"/></svg>`;
  const ICON = {
    shield: '<svg height="100%" width="100%" viewBox="-40 -40 208 208" fill="none" stroke="#fff"><path d="M17 27H111L64 111Z" stroke-width="13"/><path d="M89 42H45L55 59H80L67 82H50" stroke-width="12"/></svg>',
    camera: svg('M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9Zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z', '-6 -6 36 36'),
  };
  const $p = () => document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  const $v = () => $p()?.querySelector('video.html5-main-video');
  const videoId = () => {
    try { const u = new URL(location.href); return u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/) || [])[1] || null; } catch { return null; }
  };

  // ---------- control bar buttons ----------
  function mkButton(id, html, title) {
    const b = document.createElement('button');
    b.className = 'ytp-button sc-yt-btn'; b.id = id; b.title = title; b.setAttribute('aria-label', title);
    b.innerHTML = html;
    return b;
  }
  function ensureControls() {
    const rc = document.querySelector('#movie_player .ytp-right-controls, .html5-video-player .ytp-right-controls');
    const existing = document.getElementById('sc-yt-controls');
    if (!S.ytButtons) { existing?.remove(); return; }
    if (!rc || (existing && rc.contains(existing))) return;
    existing?.remove();
    const box = document.createElement('div');
    box.id = 'sc-yt-controls';
    const speed = mkButton('sc-yt-speed', '<span class="sc-yt-speed-label">1×</span>', 'Playback speed (click to change, scroll to fine-tune)');
    const shot = mkButton('sc-yt-shot', ICON.camera, 'Screenshot (saves a PNG)');
    const shield = mkButton('sc-yt-shield', ICON.shield, 'Syndicates Client');
    speed.onclick = () => { const v = $v(); if (!v) return; const steps = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 0.75]; const i = steps.indexOf(v.playbackRate); v.playbackRate = steps[(i + 1) % steps.length]; };
    speed.addEventListener('wheel', (e) => { const v = $v(); if (!v) return; e.preventDefault(); v.playbackRate = Math.min(4, Math.max(0.25, Math.round((v.playbackRate + (e.deltaY < 0 ? 0.25 : -0.25)) * 100) / 100)); }, { passive: false });
    shot.onclick = screenshot;
    shield.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    box.append(speed, shot, shield);
    const left = rc.querySelector('.ytp-right-controls-left');
    if (left) left.before(box); else rc.prepend(box);
    paintSpeed();
  }
  function paintSpeed() {
    const l = document.querySelector('#sc-yt-speed .sc-yt-speed-label'); const v = $v();
    if (l && v) l.textContent = `${+v.playbackRate.toFixed(2)}×`;
  }

  // ---------- screenshot ----------
  function screenshot() {
    const v = $v(); if (!v || !v.videoWidth) return;
    const c = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
    c.getContext('2d').drawImage(v, 0, 0);
    const t = Math.floor(v.currentTime), stamp = `${Math.floor(t / 60)}m${String(t % 60).padStart(2, '0')}s`;
    const title = (document.title.replace(/ - YouTube$/, '') || 'YouTube').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);
    c.toBlob((b) => {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `${title} ${stamp}.png` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Screenshot saved');
    }, 'image/png');
  }

  // ---------- native-style menu ----------
  const QUALITIES = [['auto', 'Auto'], ['hd720', '720p'], ['hd1080', '1080p'], ['hd1440', '1440p'], ['hd2160', '4K'], ['highres', 'Best available']];
  const BOOSTS = [[1, 'Off'], [1.5, '150%'], [2, '200%'], [3, '300%']];
  const ITEMS = [
    { key: 'ytAds', label: 'Skip ads' },
    { key: 'ytSponsor', label: 'Skip sponsors (SponsorBlock)' },
    { key: 'ytDislikes', label: 'Show dislikes' },
    { key: 'loop', label: 'Loop video', local: true },
    { key: 'ytEndCards', label: 'Hide end-screen cards' },
    { key: 'ytHideShorts', label: 'Hide Shorts' },
    { key: 'ytBoost', label: 'Volume boost', cycle: BOOSTS },
    { key: 'ytQuality', label: 'Preferred quality', cycle: QUALITIES },
  ];
  function buildMenu() {
    const menu = document.createElement('div');
    menu.id = 'sc-yt-menu';
    menu.className = 'ytp-popup ytp-settings-menu';
    menu.innerHTML = '<div class="ytp-panel"><div class="ytp-panel-header sc-yt-head"><span>Syndicates Client</span></div><div class="ytp-panel-menu" role="menu"></div></div>';
    const list = menu.querySelector('.ytp-panel-menu');
    for (const it of ITEMS) {
      const row = document.createElement('div');
      row.className = 'ytp-menuitem'; row.tabIndex = 0;
      row.setAttribute('role', it.cycle ? 'menuitem' : 'menuitemcheckbox');
      row.innerHTML = '<div class="ytp-menuitem-icon"></div><div class="ytp-menuitem-label"></div><div class="ytp-menuitem-content"></div>';
      row.querySelector('.ytp-menuitem-label').textContent = it.label;
      const content = row.querySelector('.ytp-menuitem-content');
      if (!it.cycle) content.innerHTML = '<div class="ytp-menuitem-toggle-checkbox"></div>';
      row.onclick = (e) => {
        e.stopPropagation();
        if (it.local) { loop = !loop; const v = $v(); if (v) v.loop = loop; paintMenu(); return; }
        if (it.cycle) { const i = it.cycle.findIndex(([v]) => v === S[it.key]); chrome.storage.sync.set({ [it.key]: it.cycle[(i + 1) % it.cycle.length][0] }); }
        else chrome.storage.sync.set({ [it.key]: !S[it.key] });
      };
      row.dataset.key = it.key;
      list.append(row);
    }
    return menu;
  }
  function paintMenu() {
    const menu = document.getElementById('sc-yt-menu'); if (!menu) return;
    for (const it of ITEMS) {
      const row = menu.querySelector(`[data-key="${it.key}"]`); if (!row) continue;
      if (it.cycle) row.querySelector('.ytp-menuitem-content').textContent = (it.cycle.find(([v]) => v === S[it.key]) || it.cycle[0])[1];
      else row.setAttribute('aria-checked', String(it.local ? loop : !!S[it.key]));
    }
  }
  function toggleMenu(force) {
    const p = $p(); if (!p) return;
    let menu = document.getElementById('sc-yt-menu');
    const open = force ?? !(menu && menu.style.display !== 'none');
    if (!menu) { menu = buildMenu(); p.append(menu); }
    menu.style.display = open ? '' : 'none';
    paintMenu();
  }
  document.addEventListener('click', (e) => { const m = document.getElementById('sc-yt-menu'); if (m && m.style.display !== 'none' && !m.contains(e.target)) toggleMenu(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

  // ---------- toast (styled like YouTube's player notices) ----------
  let toastT;
  function toast(text, action) {
    const p = $p(); if (!p) return;
    let t = document.getElementById('sc-yt-toast');
    if (!t) { t = document.createElement('div'); t.id = 'sc-yt-toast'; p.append(t); }
    t.replaceChildren(text);
    if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = (e) => { e.stopPropagation(); action.run(); t.classList.remove('show'); }; t.append(b); }
    t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4000);
  }

  // ---------- SponsorBlock ----------
  const SB_COLORS = { sponsor: '#00d400', selfpromo: '#ffff00', interaction: '#cc00ff' };
  const SB_NAMES = { sponsor: 'sponsor', selfpromo: 'self-promotion', interaction: 'subscribe reminder' };
  function drawSegments() {
    document.getElementById('sc-yt-segs')?.remove();
    const v = $v(), bar = document.querySelector('#movie_player .ytp-progress-bar, .html5-video-player .ytp-progress-bar');
    if (!S.ytSponsor || !v || !bar || !segments.length || !isFinite(v.duration) || !v.duration) return;
    const box = document.createElement('div'); box.id = 'sc-yt-segs';
    for (const s of segments) {
      const d = document.createElement('div');
      d.style.left = (s.start / v.duration) * 100 + '%';
      d.style.width = Math.max(0.3, ((s.end - s.start) / v.duration) * 100) + '%';
      d.style.background = SB_COLORS[s.cat] || '#00d400';
      d.title = SB_NAMES[s.cat] || s.cat;
      box.append(d);
    }
    bar.append(box);
  }
  function onTime() {
    const v = $v(); if (!v) return;
    if (S.ytSponsor && !document.querySelector('.html5-video-player.ad-showing')) {
      const t = v.currentTime;
      for (const s of segments) {
        if (!s.done && t >= s.start && t < s.end - 0.25) {
          s.done = true;
          v.currentTime = s.end;
          toast(`Skipped ${SB_NAMES[s.cat] || 'segment'}`, { label: 'Undo', run: () => { v.currentTime = s.start; } });
          break;
        }
      }
    }
  }

  // ---------- Return YouTube Dislike ----------
  const fmt = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  function paintDislikes(tries = 0) {
    document.querySelectorAll('.sc-yt-dislikes').forEach((n) => n.remove());
    if (!S.ytDislikes || dislikes == null) return;
    const btn = document.querySelector('ytd-watch-metadata dislike-button-view-model button, #segmented-dislike-button button, ytd-menu-renderer dislike-button-view-model button');
    if (!btn) { if (tries < 20) setTimeout(() => paintDislikes(tries + 1), 500); return; }
    const span = document.createElement('div');
    span.className = 'yt-spec-button-shape-next__button-text-content sc-yt-dislikes';
    span.textContent = fmt.format(dislikes);
    btn.classList.add('sc-yt-has-dislikes');
    btn.append(span);
  }

  // ---------- quality: applied by the page-context script ----------
  function shareQuality() {
    try { localStorage.setItem('__shieldYtQuality', S.ytQuality || 'auto'); } catch {}
    window.postMessage({ source: 'shield-client', type: 'quality' }, location.origin);
  }

  // ---------- per-video setup ----------
  async function onVideo() {
    const id = videoId();
    if (!id || id === currentId) return;
    currentId = id; segments = []; dislikes = null; loop = false;
    const v = $v(); if (v) v.loop = false;
    drawSegments(); paintDislikes(); paintMenu();
    try {
      const r = await chrome.runtime.sendMessage({ type: 'yt-data', videoId: id });
      if (id !== currentId || !r?.ok) return;
      segments = r.result.segments || [];
      dislikes = r.result.dislikes;
      drawSegments(); paintDislikes();
    } catch {}
  }

  function applyCss() { document.documentElement.classList.toggle('sc-hide-endcards', !!S.ytEndCards); }

  let attached = null;
  function tick() {
    ensureControls();
    const v = $v();
    if (v && v !== attached) {
      attached = v;
      v.addEventListener('ratechange', paintSpeed);
      v.addEventListener('timeupdate', onTime);
      v.addEventListener('loadedmetadata', () => { drawSegments(); paintSpeed(); });
    }
    if (videoId() !== currentId) onVideo();
    if (segments.length && !document.getElementById('sc-yt-segs')) drawSegments();
  }

  chrome.storage.sync.get(null, (v) => {
    Object.assign(S, v);
    applyCss(); shareQuality();
    setInterval(tick, 700);
    document.addEventListener('yt-navigate-finish', () => { tick(); shareQuality(); });
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'sync') return;
    for (const k in c) S[k] = c[k].newValue;
    applyCss(); paintMenu();
    if ('ytQuality' in c) shareQuality();
    if ('ytSponsor' in c) drawSegments();
    if ('ytDislikes' in c) paintDislikes();
    if ('ytButtons' in c) ensureControls();
  });
})();
