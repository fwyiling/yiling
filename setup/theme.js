const THEMES = [
  ['cyber-red', 'Cyber · Red', '#fa1e4e', '#1b1525'],
  ['cyber-cyan', 'Cyber · Cyan', '#00dcff', '#121a24'],
  ['cyber-violet', 'Cyber · Violet', '#aa50ff', '#1a1528'],
  ['cyber-green', 'Cyber · Matrix', '#28ff78', '#121c17'],
];
const box = document.getElementById('themes');
for (const [dir, name, ac, tb] of THEMES) {
  const d = document.createElement('div');
  d.className = 'th';
  d.innerHTML = `<div class="pv" style="background-image:url(../themes/${dir}/images/frame.png);--ac:${ac};--tb:${tb}"></div><div class="nm"></div>`;
  d.querySelector('.nm').append(name, Object.assign(document.createElement('code'), { textContent: `themes/${dir}` }));
  box.append(d);
}
document.getElementById('openExt').onclick = () => chrome.tabs.create({ url: 'chrome://extensions' });
chrome.storage.sync.get('accent', ({ accent }) => accent && document.documentElement.style.setProperty('--a', accent));
