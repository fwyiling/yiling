// Small helpers shared by the wallpaper, Home and Customize pages.
export const fmtTime = (d, h24 = false) => {
  if (h24) return { hm: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), ampm: '' };
  const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, '0');
  return { hm: `${h}:${m}`, ampm: d.getHours() < 12 ? 'AM' : 'PM' };
};
export const fmtDate = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export function greeting(d, name) {
  const h = d.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}
const QUOTES = [
  ['The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['Well begun is half done.', 'Aristotle'],
  ['The obstacle is the way.', 'Marcus Aurelius'],
  ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
  ['What we do now echoes in eternity.', 'Marcus Aurelius'],
  ['Act as if what you do makes a difference. It does.', 'William James'],
  ['Luck is what happens when preparation meets opportunity.', 'Seneca'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['Knowing yourself is the beginning of all wisdom.', 'Aristotle'],
  ['The journey of a thousand miles begins with one step.', 'Lao Tzu'],
];
export const quoteOfTheHour = (d) => QUOTES[(d.getDate() * 24 + d.getHours()) % QUOTES.length];
// Timetable entries: { d: 0-6 (Monday first), s: '08:00', e: '09:30', t: 'Maths', p: 'Room 3' }
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const weekday = (d) => (d.getDay() + 6) % 7;
const mins = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
/** The class happening now, or the next one today: { cls, now } or null. */
export function nextClass(timetable, d = new Date()) {
  const t = d.getHours() * 60 + d.getMinutes();
  const today = (timetable || []).filter((c) => c.d === weekday(d)).sort((a, b) => mins(a.s) - mins(b.s));
  const cur = today.find((c) => mins(c.s) <= t && t < mins(c.e));
  if (cur) return { cls: cur, now: true };
  const nxt = today.find((c) => mins(c.s) > t);
  return nxt ? { cls: nxt, now: false } : null;
}
export const byTime = (a, b) => mins(a.s) - mins(b.s);
/** Like nextClass, but looks ahead through the week: { cls, now, day: 'today' | 'Tomorrow' | 'Mon'… } or null. */
export function upcomingClass(timetable, d = new Date()) {
  const nc = nextClass(timetable, d);
  if (nc) return { ...nc, day: 'today' };
  for (let k = 1; k <= 7; k++) {
    const wd = (weekday(d) + k) % 7, list = (timetable || []).filter((c) => c.d === wd).sort(byTime);
    if (list.length) return { cls: list[0], now: false, day: k === 1 ? 'Tomorrow' : DAYS[wd] };
  }
  return null;
}

// a theme can bring its own accent colour; while it's on, it wins over the one picked in Customize
let themeAccent = '', lastAccent = '';
export function applyAccent(accent) { lastAccent = accent; document.documentElement.style.setProperty('--a', themeAccent || accent || '#5e7d9c'); }
/** The active themes on this page (surface: dock, topbar, island, panels, home, wallpaper, settings), kept live. */
export async function useTheme(surface) {
  const paint = (b) => {
    let el = document.getElementById('sd-theme');
    if (!el) { el = document.createElement('style'); el.id = 'sd-theme'; document.head.append(el); } // after the page's own styles, so it wins
    const vars = Object.entries(b?.vars || {}).map(([k, v]) => `${k}: ${v};`).join(' ');
    el.textContent = b ? `:root { ${vars} }\n${b.shared || ''}\n${b.styles?.[surface] || ''}` : '';
    themeAccent = b?.accent || ''; applyAccent(lastAccent);
  };
  window.sd?.onTheme?.(paint);
  paint(await window.sd?.theme?.().catch(() => null));
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The wallpaper for a desktop: its own when "a different wallpaper on each desktop" is on and it has one. */
export function wallFor(w, id) {
  const own = w?.perDesk && id && w.desks?.[id];
  return own ? { ...w, scene: own.scene || 'image', file: own.file || '', url: own.url || '', fileStamp: own.fileStamp } : w;
}
