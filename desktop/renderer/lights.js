// Mac window buttons: the colour of the window's title bar behind them (so Windows' own buttons are covered
// seamlessly), square at the corner when the window is maximized; clicks do what the window's own buttons do.
const sd = window.sd;
const root = document.documentElement.style;
sd.onLights((l) => {
  if (l.color) root.setProperty('--bg', l.color);
  root.setProperty('--r', l.max ? '0px' : '8px'); // Windows 11 rounds a window's corners unless it's maximized
});
for (const b of document.querySelectorAll('[data-a]')) b.onclick = () => sd.lightsAct(b.dataset.a);
