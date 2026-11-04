// Single-key shortcuts that work on any page while you're not typing:
//   ]  → sidebar apps   (change it in the popup → Style)
//   [  → Syndicates home page (to-dos, timetable…)
(() => {
  const safeSend = (m) => { try { const p = chrome.runtime.sendMessage(m); if (p && p.catch) p.catch(() => {}); return p || Promise.resolve(); } catch { return Promise.resolve(); } };
  if (window.top !== window) return;
  let keys = { hotSidebar: ']', hotHome: '[' };
  chrome.storage.sync.get(['hotSidebar', 'hotHome'], (v) => { keys = { ...keys, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)) }; });
  chrome.storage.onChanged.addListener((c, a) => { if (a === 'sync') for (const k of ['hotSidebar', 'hotHome']) if (c[k]) keys[k] = c[k].newValue; });
  const typing = (el) => {
    for (let n = el; n; n = n.parentElement || n.getRootNode?.().host) {
      if (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.getAttribute?.('role') === 'textbox') return true;
    }
    return false;
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || !e.isTrusted) return;
    if (typing(e.composedPath()[0]) || typing(document.activeElement)) return;
    const which = e.key === keys.hotSidebar ? 'sidebar' : e.key === keys.hotHome ? 'home' : null;
    if (!which || !e.key) return;
    e.preventDefault(); e.stopPropagation();
    safeSend({ type: 'hotkey', which });
  }, true);
})();
