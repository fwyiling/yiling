// Accent tint, forced dark mode, per-site CSS and the Google/YouTube cyber skins.
// Runs at document_start; does nothing visible unless a feature is on.
(() => {
  const root = document.documentElement;
  let style = null;

  function render(s) {
    const accent = s.accent || '#fa1e4e';
    root.style.setProperty('--sc-accent', accent);
    root.classList.toggle('sc-skin', s.webSkin !== false);

    const css = (s.siteCss || {})[location.hostname] || (s.siteCss || {})[location.hostname.replace(/^www\./, '')] || '';
    let out = '';
    if (s.accentPages) out += `html{scrollbar-color:${accent} transparent}::selection{background:${accent};color:#fff}`;
    if (s.forceDark) {
      out += 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}'
        + 'img,video,picture,canvas,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
    }
    out += css ? '\n' + css : '';
    if (!out && !style) return;
    if (!style) {
      style = document.createElement('style');
      style.id = 'shield-client-theme';
      (document.head || root).appendChild(style);
    }
    style.textContent = out;
  }

  chrome.storage.sync.get(null, render);
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && ['accent', 'webSkin', 'siteCss', 'accentPages', 'forceDark'].some((k) => k in c)) chrome.storage.sync.get(null, render);
  });
})();
