export const DEFAULTS = {
  adBlock: true,        // network-level ad/tracker blocking
  malware: true,        // block known-malicious domains (URLhaus feed)
  blockTpCookies: true, // block third-party cookies
  cleanTrackerCookies: true,
  webrtc: true,         // stop WebRTC leaking your real IP
  downloadGuard: true,  // confirm before risky file types download
  cookieReject: true,   // auto-reject cookie banners (DuckDuckGo autoconsent)
  learnTrackers: true,  // learn & block cross-site trackers (Privacy Badger-style)
  autoClean: false,     // clear a site's data when its last tab closes
  keepSites: [],        // sites never cleaned
  autoNext: true,       // auto-load next chapter on manga/novel sites
  popupBlock: true,     // strict pop-up / pop-under / redirect blocker
  sidebarApps: null,    // custom sidebar apps (null = defaults)
  hotSidebar: ']',      // key that opens the sidebar
  hotHome: '[',         // key that opens the Syndicates home page
  ytAds: true,
  ytHideShorts: false,
  ytSpeed: 1,
  ytBoost: 1,
  ytSponsor: true,      // SponsorBlock auto-skip
  ytDislikes: true,     // Return YouTube Dislike
  ytQuality: 'auto',    // preferred quality
  ytEndCards: false,    // hide end-screen cards
  ytButtons: true,      // extra player buttons
  // appearance (GX-style)
  accent: '#fa1e4e',
  accentPages: true,    // tint scrollbars + text selection on every site
  forceDark: false,     // dark-mode every site (Dark Reader engine)
  darkExclude: [],      // sites where dark mode stays off
  wallpaper: '',        // new-tab wallpaper URL
  tabSleepMin: 0,       // discard tabs idle for N minutes (0 = off)
  siteCss: {},          // { "example.com": "body{...}" }
  allowlist: [],        // sites where blocking is paused
  dock: true,           // floating client dock on every site
  dockHiddenOn: [],     // sites where the dock is hidden
  webSkin: true,        // skin on Google & YouTube
  googleHome: true,     // shortcuts + greeting on Google's homepage
  mdLangs: ['en', 'zh', 'zh-hk'], // MangaDex language preference, first = default
  hiAnime: true,                 // show HiAnime watch/download section in the anime hub
};
