// Accent tint, forced dark mode, per-site CSS and the Google/YouTube cyber skins.
// Runs at document_start; does nothing visible unless a feature is on.
(() => {
  const root = document.documentElement;
  let style = null;

  // palette for the Google / YouTube skins, matching the home page (Chrome+ or Cyber)
  const hexRgb = (h) => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function hue(hex) {
    const [r, g, b] = hexRgb(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100];
  }
  const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${Math.min(100, s).toFixed(1)}% ${l}%)`;
  function palette(ntp, accent) {
    if ((ntp?.theme || 'chrome') === 'cyber') {
      const m = (p, base) => `color-mix(in srgb, ${accent} ${p}%, ${base})`;
      return { cyber: true, a: accent, base: m(5, '#0a0612'), mantle: m(8, '#110a1d'), crust: '#07040d', surface: m(16, '#1e1232'), text: '#f2eefa', subtext: '#b9b0c9', link: m(50, '#fff'), border: m(38, '#2a1a40'), glow: accent };
    }
    const [h, sat] = hue(ntp?.seed || '#8a5a44'), c = Math.min(sat, 60);
    return { cyber: false, a: hsl(h, Math.max(c, 45), 72), base: hsl(h, c * 0.32, 8), mantle: hsl(h, c * 0.3, 11), crust: hsl(h, c * 0.3, 6), surface: hsl(h, c * 0.3, 17),
      text: hsl(h, c * 0.15, 92), subtext: hsl(h, c * 0.15, 70), link: hsl(h, Math.max(c, 45), 78), border: hsl(h, c * 0.25, 24), glow: hsl(h, Math.max(c, 50), 45) };
  }
  let ntpTheme = null;

  function render(s) {
    const accent = s.accent || '#fa1e4e';
    root.style.setProperty('--sc-accent', accent);
    root.classList.toggle('sc-skin', s.webSkin !== false);
    const p = palette(ntpTheme, accent);
    for (const k of ['a', 'base', 'mantle', 'crust', 'surface', 'text', 'subtext', 'link', 'border', 'glow']) root.style.setProperty('--sc-' + k, p[k]);
    root.classList.toggle('sc-cyber', p.cyber);

    const css = (s.siteCss || {})[location.hostname] || (s.siteCss || {})[location.hostname.replace(/^www\./, '')] || '';
    let out = '';
    if (s.accentPages) out += `html{scrollbar-color:${accent} transparent}::selection{background:${accent};color:#fff}`;
    // dark mode is handled by content/darkmode.js (Dark Reader engine)
    out += css ? '\n' + css : '';
    if (!out && !style) return;
    if (!style) {
      style = document.createElement('style');
      style.id = 'shield-client-theme';
      (document.head || root).appendChild(style);
    }
    style.textContent = out;
  }

  chrome.storage.local.get('ntp', ({ ntp }) => { ntpTheme = ntp || null; chrome.storage.sync.get(null, render); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.ntp) { const o = c.ntp.oldValue || {}, n = c.ntp.newValue || {}; if (o.theme !== n.theme || o.seed !== n.seed) { ntpTheme = n; chrome.storage.sync.get(null, render); } }
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && ['accent', 'webSkin', 'siteCss', 'accentPages', 'forceDark'].some((k) => k in c)) chrome.storage.sync.get(null, render);
  });
})();
