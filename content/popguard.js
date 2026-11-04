// Isolated half of the pop-up guard: shows "Blocked a pop-up · Open anyway", reports your
// clicks to the background (so it can tell real link clicks from hijacks), shares the on/off flag.
(() => {
  if (window.top !== window) return;
  chrome.storage.sync.get(['popupBlock', 'allowlist'], ({ popupBlock, allowlist }) => {
    const host = location.hostname.replace(/^www\./, '');
    const on = popupBlock !== false && !(allowlist || []).includes(host);
    try { localStorage.setItem('__shieldPopups', on ? '1' : '0'); } catch {}
  });

  addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const el = e.target instanceof Element ? e.target : null;
    const a = el?.closest('a[href]');
    const interactive = !!el?.closest('a[href],button,input,select,label,[role=button],[role=link],[onclick],[tabindex]');
    chrome.runtime.sendMessage({ type: 'user-click', href: a ? a.href : null, interactive }).catch(() => {});
  }, true);

  let box, timer;
  function toast(url, why) {
    if (!box) {
      const host = document.createElement('shield-client-toast');
      const sh = host.attachShadow({ mode: 'closed' });
      sh.innerHTML = `<style>
        .t{position:fixed;left:50%;top:16px;transform:translate(-50%,-8px);z-index:2147483647;display:flex;align-items:center;gap:12px;max-width:min(560px,92vw);
           padding:10px 14px;border-radius:12px;background:#17121f;color:#f2eefa;font:500 13px/1.35 system-ui,sans-serif;box-shadow:0 10px 30px #0007;opacity:0;transition:.2s;pointer-events:none}
        .t.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
        .u{color:#a99fbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
        button{border:0;border-radius:8px;padding:6px 10px;font:600 12px system-ui,sans-serif;cursor:pointer}
        .go{background:#2a2235;color:#fff}.x{background:none;color:#a99fbb;padding:6px}</style>
        <div class="t"><span>🛡️ Blocked a <span class="why"></span></span><span class="u"></span><button class="go">Open anyway</button><button class="x">✕</button></div>`;
      document.documentElement.append(host);
      box = sh.querySelector('.t');
      sh.querySelector('.x').onclick = () => box.classList.remove('show');
    }
    box.querySelector('.why').textContent = why;
    try { box.querySelector('.u').textContent = new URL(url).hostname; } catch { box.querySelector('.u').textContent = url; }
    box.querySelector('.go').onclick = () => { chrome.runtime.sendMessage({ type: 'open-anyway', url }); box.classList.remove('show'); };
    box.classList.add('show');
    clearTimeout(timer); timer = setTimeout(() => box.classList.remove('show'), 6000);
  }
  addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'shield-client' && e.data.type === 'popup-blocked') toast(e.data.url, e.data.why);
  });
  chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'show-popup-toast') toast(m.url, m.why); });
})();
