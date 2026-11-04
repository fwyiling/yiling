export const DEFAULTS = {
  adBlock: true,        // network-level ad/tracker blocking
  malware: true,        // block known-malicious domains (URLhaus feed)
  blockTpCookies: true, // block third-party cookies
  cleanTrackerCookies: true,
  referrerPolicy: true, // trim cross-site referrer
  webrtc: true,         // stop WebRTC leaking your real IP
  downloadGuard: true,  // confirm before risky file types download
  ytAds: true,
  ytHideShorts: false,
  ytSpeed: 1,
  ytBoost: 1,
  // appearance (GX-style)
  accent: '#fa1e4e',
  accentPages: true,    // tint scrollbars + text selection on every site
  forceDark: false,     // dark-mode every site
  wallpaper: '',        // new-tab wallpaper URL
  tabSleepMin: 0,       // discard tabs idle for N minutes (0 = off)
  siteCss: {},          // { "example.com": "body{...}" }
  allowlist: [],        // sites where blocking is paused
  dock: true,           // floating client dock on every site
  dockHiddenOn: [],     // sites where the dock is hidden
};
