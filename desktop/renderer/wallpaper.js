import { mountWallpaper } from './wallpaper-view.js';

const view = mountWallpaper(document.getElementById('root'), await window.sd.get());
window.sd.onSettings((s) => view.update(s));
window.sd.onPause((p) => view.pause(p));
window.sd.onCursor(({ x, y }) => view.pointer(x, y));
window.sd.onDeskSlide?.((dir) => view.slide(dir));
view.pause(await window.sd.paused());
