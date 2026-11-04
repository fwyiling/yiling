// YouTube enhancements: ad skipping, Shorts hiding, default speed, volume boost.
(() => {
  const s = { ytAds: true, ytHideShorts: false, ytSpeed: 1, ytBoost: 1 };
  let video = null;
  let adActive = false;
  let saved = { muted: false, rate: 1 };
  let audioCtx = null;
  let gain = null;

  const applyShorts = () =>
    document.documentElement.classList.toggle('sc-hide-shorts', !!s.ytHideShorts);

  function applyBoost() {
    if (!video) return;
    if (s.ytBoost <= 1 && !gain) return;
    try {
      if (!audioCtx) {
        audioCtx = new AudioContext();
        gain = audioCtx.createGain();
        audioCtx.createMediaElementSource(video).connect(gain).connect(audioCtx.destination);
      }
      gain.gain.value = Number(s.ytBoost) || 1;
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* already connected or blocked */ }
  }

  function attach(v) {
    video = v;
    const setSpeed = () => {
      if (!adActive && s.ytSpeed && v.playbackRate !== Number(s.ytSpeed)) v.playbackRate = Number(s.ytSpeed);
    };
    v.addEventListener('loadedmetadata', setSpeed);
    v.addEventListener('play', () => { applyBoost(); }, { once: false });
    setSpeed();
  }

  function tick() {
    const player = document.querySelector('.html5-video-player');
    const v = player && player.querySelector('video.html5-main-video');
    if (v && v !== video) { audioCtx = null; gain = null; attach(v); }
    if (!v) return;

    // Fallback only (ads are normally removed before they load by yt-main.js):
    // click Skip, and mute + fast-forward. Never seek – seeking an ad that failed
    // to load is what used to freeze the real video.
    const showingAd = s.ytAds && player.classList.contains('ad-showing');
    if (showingAd) {
      if (!adActive) { saved = { muted: v.muted, rate: Number(s.ytSpeed) || 1 }; adActive = true; }
      document
        .querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-overlay-close-button')
        .forEach((b) => b.click());
      if (!v.muted) v.muted = true;
      if (v.playbackRate < 8) v.playbackRate = 8;
    } else if (adActive) {
      adActive = false;
      v.muted = saved.muted;
      v.playbackRate = saved.rate;
      if (v.paused && v.readyState > 2) v.play().catch(() => {});
    }

    // YouTube's "ad blockers are not allowed" popup: close it and keep playing
    const enforcement = document.querySelector('ytd-enforcement-message-view-model');
    if (enforcement) {
      const dialog = enforcement.closest('tp-yt-paper-dialog');
      (dialog || enforcement).remove();
      document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
      if (v.paused) v.play().catch(() => {});
    }
  }

  const shareFlag = () => { try { localStorage.setItem('__shieldYtAds', s.ytAds === false ? '0' : '1'); } catch {} };
  chrome.storage.sync.get(null, (v) => {
    Object.assign(s, v);
    shareFlag();
    applyShorts();
    applyBoost();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) s[k] = changes[k].newValue;
    shareFlag();
    applyShorts();
    if (video && !adActive) video.playbackRate = Number(s.ytSpeed) || 1;
    applyBoost();
  });

  applyShorts();
  setInterval(tick, 250);
})();
