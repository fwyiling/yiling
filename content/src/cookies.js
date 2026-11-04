// Cookie-banner auto-reject, powered by DuckDuckGo's autoconsent (MPL-2.0).
// Runs in every frame; the background script supplies the rules and handles "eval" steps.
import AutoConsent from '../../lib/vendor/autoconsent.esm.js';

const safeSend = (m) => { try { const p = chrome.runtime.sendMessage(m); if (p && p.catch) p.catch(() => {}); return p || Promise.resolve(); } catch { return Promise.resolve(); } };
const consent = new AutoConsent((msg) => safeSend({ ...msg, __ac: true }));
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.__ac) consent.receiveMessageCallback(msg);
});
