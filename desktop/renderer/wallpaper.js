import { useTheme } from './common.js';
import { mountWallpaper } from './wallpaper-view.js';

const q = new URLSearchParams(location.search);
// ?plain: the picture only. ?still: the picture and the widgets that don't tick (no clock, no CPU), for Windows' own
// background (see syncWindowsWallpaper). ?desk=: that desktop's wallpaper instead of the one showing.
if (q.has('plain')) document.documentElement.classList.add('plain');
if (q.has('still')) document.documentElement.classList.add('still-shot');
const view = mountWallpaper(document.getElementById('root'), await window.sd.get(), { desk: q.get('desk') || await window.sd.deskCurrent().catch(() => '') });
window.sd.onWpDesk?.((id) => { if (!q.get('desk')) view.setDesk(id); }); // another virtual desktop: its own wallpaper, if it has one
window.sd.onSettings((s) => view.update(s));
window.sd.onPause((p) => view.pause(p));
window.sd.onCursor(({ x, y }) => { if (!q.has('snapshot')) view.pointer(x, y); });
window.sd.onDeskSlide?.((dir) => view.slide(dir));
window.sd.onWeatherChanged?.(() => view.refreshWeather());
view.pause(await window.sd.paused());
useTheme('wallpaper'); // Customize > Themes
// a snapshot is taken once everything has drawn: the picture faded in, the forecast in (with its icons)
if (q.has('snapshot')) {
  const t0 = Date.now();
  (function check() {
    const pic = document.querySelector('.wp-media .wp-layer.in, .wp-media .wp-empty'), w = document.querySelector('.w-weather');
    const ok = pic && (!w || w.hidden || w.dataset.done) && [...document.images].every((i) => i.complete);
    if (ok || Date.now() - t0 > 6000) setTimeout(() => { document.documentElement.dataset.ready = '1'; }, 700); // the fade-in, finished
    else setTimeout(check, 100);
  })();
}
