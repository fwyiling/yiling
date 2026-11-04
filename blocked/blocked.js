(async () => {
  const tab = await chrome.tabs.getCurrent();
  const key = `nav_${tab.id}`;
  const { [key]: url } = await chrome.storage.session.get(key);
  const back = document.getElementById('back');
  back.onclick = () => (history.length > 2 ? history.go(-2) : (location.href = 'chrome://newtab'));
  if (!url) return;
  const host = new URL(url).hostname;
  document.getElementById('site').textContent = host;
  const go = document.getElementById('go');
  go.hidden = false;
  go.onclick = async () => {
    if (!confirm(`${host} is known to be dangerous. Open it anyway until you restart Chrome?`)) return;
    await chrome.runtime.sendMessage({ type: 'allow-once', host });
    location.href = url;
  };
})();
