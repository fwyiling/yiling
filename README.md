# Shield Client

Chrome (Manifest V3) extension: ad blocking, YouTube extras, privacy/malware protection,
GX-style customization, and a manga/novel downloader.

## Install
`chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.

## Features
- **Blocking:** third-party ad/tracker domains (`rules/ads.json`), plus a malicious-domain feed
  (abuse.ch URLhaus) refreshed every 12h.
- **YouTube:** auto-skip/fast-forward ads, hide ad slots, optional Shorts hiding, default speed, volume boost (up to 300%).
- **Privacy:** block third-party cookies, remove tracker cookies, trim cross-site referrer, stop WebRTC IP leaks.
- **Download guard:** risky file types (`.exe`, `.js`, `.bat`, `.msi`, …) are paused until you click Allow.
- **Appearance:** accent color, dark mode on every site, per-site custom CSS, custom new tab (wallpaper, clock, speed dial).
- **Tab sleeper:** discard tabs idle for N minutes to free RAM.
- **Downloader:** popup → *Download this page*. Chapter images → `.cbz`; novel text → `.epub` / `.txt`.
  Lazy-loaded readers: scroll the chapter once, then open the popup.

## Limits
- An extension can't sandbox your OS; it reduces exposure (blocklists, download prompts) but isn't antivirus.
- It can't restyle Chrome's own toolbar/tabs (that needs a separate Chrome *theme*).
- YouTube changes its markup often; ad-skip selectors in `content/youtube.js` may need updates.
- Only download content you have the right to keep offline.
