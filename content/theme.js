// Applies accent tint, forced dark mode, and per-site custom CSS on every page.
(() => {
  const style = document.createElement('style');
  style.id = 'shield-client-theme';
  const mount = () => (document.head || document.documentElement).appendChild(style);
  mount();

  function render(s) {
    const host = location.hostname.replace(/^www\./, '');
    const css = (s.siteCss || {})[location.hostname] || (s.siteCss || {})[host] || '';
    const accent = s.accent || '#fa1e4e';
    let out = '';
    if (s.accentPages) {
      out += `html{scrollbar-color:${accent} transparent}::selection{background:${accent};color:#fff}`;
    }
    if (s.forceDark) {
      out += `html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}` +
             `img,video,picture,canvas,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}`;
    }
    style.textContent = out + '\n' + css;
  }

  chrome.storage.sync.get(null, render);
  chrome.storage.onChanged.addListener((_c, area) => area === 'sync' && chrome.storage.sync.get(null, render));
})();
