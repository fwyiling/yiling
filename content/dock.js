// Floating "client dock" shown on every site: quick toggles + chapter saver.
(() => {
  if (window.top !== window || window.__shieldDock) return;
  window.__shieldDock = true;

  const host = location.hostname.replace(/^www\./, '');
  const send = (msg) => chrome.runtime.sendMessage(msg);
  let s = {};
  let root, shadow, panel, open = false;

  const ICON = '<svg viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-linejoin="miter"><path d="M17 27H111L64 111Z" stroke-width="13"/><path d="M89 42H45L55 59H80L67 82H50" stroke-width="12"/></svg>';

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; }
  .wrap { position: fixed; right: 14px; z-index: 2147483646; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .fab { width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: grab; display: grid; place-items: center;
    background: var(--a); color: #fff; box-shadow: 0 6px 20px color-mix(in srgb, var(--a) 45%, transparent), 0 2px 6px #0005;
    transition: transform .15s, opacity .2s; opacity: .55; }
  .wrap:hover .fab, .fab.open { opacity: 1; }
  .fab:hover { transform: scale(1.06); }
  .fab svg { width: 24px; height: 24px; }
  .fab.paused { background: #555; }
  .panel { width: 280px; background: #15151c; color: #f2f2f5; border: 1px solid #2a2a36; border-radius: 16px; padding: 14px;
    box-shadow: 0 18px 50px #000a; font-size: 13px; line-height: 1.4; transform-origin: bottom right; animation: pop .16s ease; }
  .panel[hidden] { display: none; }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .head .dot { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--a); }
  .head .dot svg { width: 18px; height: 18px; color: #fff; }
  .head b { display: block; font-size: 14px; }
  .head small { color: #9a9aab; display: block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { margin-left: auto; background: none; border: 0; color: #9a9aab; font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
  .x:hover { background: #22222c; color: #fff; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 12px; border: 1px solid #2a2a36;
    background: #1c1c25; color: #f2f2f5; cursor: pointer; text-align: left; font-size: 12.5px; transition: border-color .15s, background .15s; }
  .tile:hover { border-color: #3a3a4a; }
  .tile.on { background: color-mix(in srgb, var(--a) 18%, #1c1c25); border-color: var(--a); }
  .tile .t { font-weight: 600; }
  .tile .d { color: #9a9aab; font-size: 11px; }
  .tile.on .d { color: #e0e0e6; }
  .btn { display: block; width: 100%; margin-top: 8px; padding: 10px; border-radius: 10px; border: 0; cursor: pointer;
    background: var(--a); color: #fff; font-weight: 600; font-size: 13px; }
  .btn.ghost { background: #22222c; color: #f2f2f5; }
  .btn:hover { filter: brightness(1.1); }
  .msg { color: #9a9aab; font-size: 12px; margin-top: 10px; text-align: center; }
  .foot { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px solid #2a2a36; }
  .link { background: none; border: 0; color: #9a9aab; cursor: pointer; font-size: 12px; padding: 0; }
  .link:hover { color: #fff; }
  `;

  const paused = () => (s.allowlist || []).includes(host);

  function tile(id, title, desc, on) {
    return `<button class="tile ${on ? 'on' : ''}" data-act="${id}"><span class="t">${title}</span><span class="d">${desc}</span></button>`;
  }

  function render() {
    root.style.setProperty('--a', s.accent || '#fa1e4e');
    const fab = shadow.querySelector('.fab');
    fab.classList.toggle('paused', paused() || !s.adBlock);
    fab.classList.toggle('open', open);
    fab.title = paused() ? 'Syndicates Client – paused on this site' : 'Syndicates Client';
    if (!open) { panel.hidden = true; return; }
    panel.hidden = false;
    const yt = /(^|\.)youtube\.com$/.test(location.hostname);
    panel.innerHTML = `
      <div class="head"><div class="dot">${ICON}</div>
        <div><b>${paused() ? 'Paused here' : 'Protected'}</b><small>${host}</small></div>
        <button class="x" data-act="close" title="Close">×</button></div>
      <div class="grid">
        ${tile('protect', 'Protection', paused() ? 'Off on this site' : 'Blocking ads here', !paused() && s.adBlock)}
        ${tile('dark', 'Dark mode', s.forceDark ? 'On everywhere' : 'Off', s.forceDark)}
        ${yt ? tile('shorts', 'Hide Shorts', s.ytHideShorts ? 'Hidden' : 'Showing', s.ytHideShorts)
             : tile('accent', 'Accent tint', s.accentPages ? 'On' : 'Off', s.accentPages)}
        ${yt ? tile('ytads', 'Skip ads', s.ytAds ? 'On' : 'Off', s.ytAds)
             : tile('save', 'Download', /mangadex\.org$/.test(location.hostname) ? 'MangaDex series' : 'Chapter or series', false)}
      </div>
      <button class="btn ghost" data-act="animanga">Ani Manga · anime &amp; manga</button>
      <div class="out"></div>
      <div class="foot">
        <button class="link" data-act="hide">Hide on this site</button>
        ${s.forceDark ? `<button class="link" data-act="darkhere">${(s.darkExclude || []).includes(host) ? 'Dark mode here' : 'No dark mode here'}</button>` : ''}
        <button class="link" data-act="settings">All settings →</button>
      </div>`;
  }

  async function saveChapter() {
    const out = panel.querySelector('.out');
    out.innerHTML = '<div class="msg">Looking for chapters…</div>';
    const r = await send({ type: 'scan' });
    const p = r?.ok && r.result;
    if (!p) { out.innerHTML = `<div class="msg">Couldn't read this page${r?.error ? ': ' + r.error : ''}.</div>`; return; }
    const md = p.source === 'mangadex';
    const kind = md || p.images.length >= 3 ? 'images' : p.text.length >= 1500 ? 'text' : null;
    if (!kind) { out.innerHTML = '<div class="msg">No chapter found. Scroll to the end so every page loads, then try again.</div>'; return; }
    out.innerHTML = '';
    const n = p.chapters.length;
    const add = (label, preset, ghost) => {
      const b = document.createElement('button');
      b.className = 'btn' + (ghost ? ' ghost' : '');
      b.textContent = label;
      b.onclick = () => send({ type: 'download', page: p, kind, preset });
      out.append(b);
    };
    if (n > 1 || md) add(n > 1 ? `Whole series (${n} chapters)` : 'Choose chapters', 'all');
    if (!md || p.currentIndex >= 0) add('This chapter only', 'current', n > 1 || md);
  }

  async function act(a) {
    switch (a) {
      case 'close': open = false; break;
      case 'protect':
        if (!s.adBlock) await chrome.storage.sync.set({ adBlock: true });
        await send({ type: 'set-paused', host, paused: !paused() && s.adBlock });
        location.reload(); return;
      case 'dark': await chrome.storage.sync.set({ forceDark: !s.forceDark }); return;
      case 'accent': await chrome.storage.sync.set({ accentPages: !s.accentPages }); return;
      case 'shorts': await chrome.storage.sync.set({ ytHideShorts: !s.ytHideShorts }); return;
      case 'ytads': await chrome.storage.sync.set({ ytAds: !s.ytAds }); return;
      case 'save': saveChapter(); return;
      case 'settings': send({ type: 'open-settings' }); return;
      case 'animanga': open = false; send({ type: 'open-animanga' }); break;
      case 'hide': await send({ type: 'hide-dock-here', host }); return;
      case 'darkhere': {
        const ex = new Set(s.darkExclude || []);
        ex.has(host) ? ex.delete(host) : ex.add(host);
        await chrome.storage.sync.set({ darkExclude: [...ex] }); return;
      }
    }
    render();
  }

  function mount() {
    root = document.createElement('shield-client-dock');
    shadow = root.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="panel" hidden></div><button class="fab" aria-label="Syndicates Client">${ICON}</button></div>`;
    panel = shadow.querySelector('.panel');
    const wrap = shadow.querySelector('.wrap');
    const fab = shadow.querySelector('.fab');

    // vertical drag; a click without movement toggles the panel
    let y = 0;
    try { y = Number(localStorage.getItem('__shieldDockY')) || 0; } catch {}
    const place = () => { wrap.style.bottom = Math.max(10, Math.min(innerHeight - 60, 18 + y)) + 'px'; };
    place();
    fab.addEventListener('pointerdown', (e) => {
      const startY = e.clientY, startOff = y; let moved = false;
      fab.setPointerCapture(e.pointerId);
      const move = (ev) => { const d = startY - ev.clientY; if (Math.abs(d) > 4) moved = true; y = startOff + d; place(); };
      const up = () => {
        fab.removeEventListener('pointermove', move);
        if (moved) { try { localStorage.setItem('__shieldDockY', String(y)); } catch {} }
        else { open = !open; render(); }
      };
      fab.addEventListener('pointermove', move);
      fab.addEventListener('pointerup', up, { once: true });
    });
    panel.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { open = false; render(); } });
    document.addEventListener('fullscreenchange', () => { root.style.display = document.fullscreenElement ? 'none' : ''; });
    document.documentElement.append(root);
  }

  function sync(v) {
    s = v;
    const want = s.dock !== false && !(s.dockHiddenOn || []).includes(host);
    if (want && !root) mount();
    if (root) root.style.display = want ? '' : 'none';
    if (root && want) render();
  }

  chrome.storage.sync.get(null, sync);
  chrome.storage.onChanged.addListener((_c, area) => area === 'sync' && chrome.storage.sync.get(null, sync));
})();
