// Single-key shortcuts that work on any page while you're not typing:
//   ]  → sidebar apps   (change it in the popup → Style)
(() => {
  if (window.top !== window) return;
  let keys = { hotSidebar: ']' };
  chrome.storage.sync.get(['hotSidebar'], (v) => { keys = { ...keys, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)) }; });
  chrome.storage.onChanged.addListener((c, a) => { if (a === 'sync') for (const k of ['hotSidebar']) if (c[k]) keys[k] = c[k].newValue; });
  const typing = (el) => {
    for (let n = el; n; n = n.parentElement || n.getRootNode?.().host) {
      if (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.getAttribute?.('role') === 'textbox') return true;
    }
    return false;
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || !e.isTrusted) return;
    if (typing(e.composedPath()[0]) || typing(document.activeElement)) return;
    const which = e.key === keys.hotSidebar ? 'sidebar' : null;
    if (!which || !e.key) return;
    e.preventDefault(); e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'hotkey', which }).catch(() => {});
  }, true);
})();
