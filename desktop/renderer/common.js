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
export function applyAccent(accent) { document.documentElement.style.setProperty('--a', accent || '#5e7d9c'); }
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
