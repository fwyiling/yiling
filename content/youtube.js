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

    const showingAd = s.ytAds && player.classList.contains('ad-showing');
    if (showingAd) {
      if (!adActive) { saved = { muted: v.muted, rate: Number(s.ytSpeed) || 1 }; adActive = true; }
      document
        .querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-overlay-close-button')
        .forEach((b) => b.click());
      v.muted = true;
      v.playbackRate = 16;
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
    } else if (adActive) {
      adActive = false;
      v.muted = saved.muted;
      v.playbackRate = saved.rate;
    }
  }

  chrome.storage.sync.get(null, (v) => {
    Object.assign(s, v);
    applyShorts();
    applyBoost();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) s[k] = changes[k].newValue;
    applyShorts();
    if (video && !adActive) video.playbackRate = Number(s.ytSpeed) || 1;
    applyBoost();
  });

  applyShorts();
  setInterval(tick, 250);
})();
