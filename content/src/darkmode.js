// Proper dark mode for every site, powered by Dark Reader (MIT).
// Registered only while "Dark mode everywhere" is on, so it costs nothing when off.
import { enable, disable, setFetchMethod } from 'darkreader';

// stylesheets/images from other sites: fetched by the background (content-script fetch is CORS-limited)
setFetchMethod(async (url) => {
  const r = await chrome.runtime.sendMessage({ type: 'dr-fetch', url });
  if (!r?.ok || !r.result) throw new Error('fetch failed: ' + url);
  const { b64, text, type } = r.result;
  const body = b64 != null ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : text;
  return new Response(body, { headers: { 'content-type': type || 'text/css' } });
});

const SKINNED = /(^|\.)(google\.[a-z.]+|youtube\.com)$/; // these already get Shield's own dark skin
function apply(s) {
  const host = location.hostname.replace(/^www\./, '');
  const off = !s.forceDark || (s.darkExclude || []).includes(host) || (s.webSkin !== false && SKINNED.test(location.hostname));
  if (off) disable();
  else enable({ brightness: 100, contrast: 95, sepia: 0, grayscale: 0 });
}
chrome.storage.sync.get(['forceDark', 'darkExclude', 'webSkin'], apply);
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'sync' && ('forceDark' in c || 'darkExclude' in c || 'webSkin' in c)) chrome.storage.sync.get(['forceDark', 'darkExclude', 'webSkin'], apply);
});
