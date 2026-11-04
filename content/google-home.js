// Syndicates touches on Google's homepage (new tabs open here): greeting + clock above the logo,
// your shortcuts under the search box, and less clutter. Built in a shadow root so Google's CSS can't interfere.
(() => {
  if (window.top !== window) return;
  if (!/^\/(webhp)?$/.test(location.pathname) || new URLSearchParams(location.search).has('q')) return;
  const DEFAULT_SC = [
    { title: 'YouTube', url: 'https://www.youtube.com' }, { title: 'MangaDex', url: 'https://mangadex.org' }, { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Reddit', url: 'https://www.reddit.com' }, { title: 'GitHub', url: 'https://github.com' }, { title: 'Discord', url: 'https://discord.com/app' },
  ];
  const fav = (u) => chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(u)}&size=64`);

  chrome.storage.sync.get(['webSkin', 'googleHome'], async ({ webSkin, googleHome }) => {
    if (webSkin === false || googleHome === false) return;
    document.documentElement.classList.add('sc-ghome');
    const { ntp = {} } = await chrome.storage.local.get('ntp');
    let shortcuts = ntp.shortcuts || DEFAULT_SC;

    const host = document.createElement('syndicates-home');
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      :host { all: initial; display: block; font-family: "Google Sans", Roboto, "Segoe UI", system-ui, sans-serif; color: var(--sc-text, #e8e3df); }
      .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 600px; margin: 26px auto 0; }
      a, button { width: 112px; height: 112px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        text-decoration: none; color: inherit; font-size: 13px; background: none; border: 0; cursor: pointer; position: relative; transition: background .15s, transform .15s; font-family: inherit; }
      a:hover, button:hover { background: color-mix(in srgb, currentColor 9%, transparent); transform: translateY(-2px); }
      .ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--sc-surface, #3a302b); font-size: 24px; }
      .ic img { width: 24px; height: 24px; }
      span { max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .x { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; background: var(--sc-surface, #3a302b); font-size: 11px; display: none; place-items: center; color: inherit; }
      a:hover .x { display: grid; }
    </style><div class="grid"></div>`;
    const grid = sh.querySelector('.grid');
    const draw = () => {
      grid.replaceChildren(...shortcuts.map((s, i) => {
        const a = document.createElement('a'); a.href = s.url;
        a.innerHTML = `<div class="ic"><img alt=""></div><span></span><div class="x" title="Remove">✕</div>`;
        a.querySelector('img').src = fav(s.url); a.querySelector('span').textContent = s.title;
        a.querySelector('.x').onclick = async (e) => { e.preventDefault(); shortcuts = shortcuts.filter((_, k) => k !== i); await persist(); draw(); };
        return a;
      }));
      const add = document.createElement('button'); add.innerHTML = '<div class="ic">+</div><span>Add shortcut</span>';
      add.onclick = async () => {
        const url = prompt('Link (e.g. youtube.com)'); if (!url) return;
        const full = /^https?:\/\//.test(url) ? url : 'https://' + url;
        const title = prompt('Name', new URL(full).hostname.replace(/^www\./, '')) || new URL(full).hostname;
        shortcuts = [...shortcuts, { title, url: full }]; await persist(); draw();
      };
      grid.append(add);
    };
    const persist = async () => { const { ntp: n = {} } = await chrome.storage.local.get('ntp'); await chrome.storage.local.set({ ntp: { ...n, shortcuts } }); };

    // greeting + clock above the logo
    const top = document.createElement('syndicates-clock');
    const ts = top.attachShadow({ mode: 'open' });
    ts.innerHTML = `<style>:host{all:initial;display:block;text-align:center;font-family:"Google Sans",Roboto,"Segoe UI",system-ui,sans-serif;color:var(--sc-subtext,#b9b0a8);margin:0 0 18px}
      .g{font-size:15px;font-weight:500}.t{font-size:15px;opacity:.8;margin-top:2px}</style><div class="g"></div><div class="t"></div>`;
    const tick = () => {
      const d = new Date(), h = d.getHours();
      ts.querySelector('.g').textContent = `${h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${ntp.name ? ', ' + ntp.name : ''}`;
      ts.querySelector('.t').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    };

    const mount = () => {
      const form = document.querySelector('form[action="/search"]');
      if (!form || document.querySelector('syndicates-home')) return !!form;
      form.after(host);
      const logo = document.querySelector('img[alt="Google"], svg[aria-label="Google"], #hplogo, .lnXdpd')?.closest('div');
      if (logo && logo.parentElement) logo.before(top);
      tick(); setInterval(tick, 15000);
      draw();
      return true;
    };
    if (!mount()) { const mo = new MutationObserver(() => { if (mount()) mo.disconnect(); }); mo.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 10000); }
  });
})();
