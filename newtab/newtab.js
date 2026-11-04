const clock = document.getElementById('clock');
const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
tick(); setInterval(tick, 10000);

chrome.storage.sync.get(['accent', 'wallpaper'], ({ accent, wallpaper }) => {
  if (accent) document.documentElement.style.setProperty('--accent', accent);
  if (wallpaper) document.body.style.backgroundImage = `url("${wallpaper.replace(/"/g, '%22')}")`;
});

chrome.topSites.get((sites) => {
  const dial = document.getElementById('dial');
  for (const s of sites.slice(0, 12)) {
    const a = document.createElement('a');
    a.href = s.url;
    const img = document.createElement('img');
    img.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(s.url)}&size=32`;
    const t = document.createElement('span');
    t.textContent = s.title || new URL(s.url).hostname;
    a.append(img, t);
    dial.append(a);
  }
});
