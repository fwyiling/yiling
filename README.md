# Shield Client

Chrome (Manifest V3) extension: ad blocking, YouTube extras, privacy/malware protection,
GX-style customization, and a manga/novel downloader.

## Install
`chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.

## Features
- **Blocking:** EasyList + EasyPrivacy compiled to DNR rulesets (~57k rules), a small built-in domain list, and a
  malicious-domain feed (abuse.ch URLhaus) refreshed every 12h. Big lists are enabled at runtime if Chrome's rule budget allows.
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

## Updating filter lists
```bash
git clone --depth 1 https://github.com/easylist/easylist /tmp/easylist
cd tools && npm install && node build-rules.mjs /tmp/easylist
```

## Credits / references
- [EasyList / EasyPrivacy](https://github.com/easylist/easylist) – filter lists (GPLv3 / CC BY-SA 3.0).
- [@ghostery/urlfilter2dnr](https://github.com/ghostery/urlfilter2dnr) (GPL-3.0) – build-time converter to DNR (`tools/`, not shipped).
- [Comics-Manga-Downloader-Extension](https://github.com/saptarshimondal/Comics-Manga-Downloader-Extension) (MIT) – image
  validation and retry/backoff approach in `downloader/downloader.js`.
- Design reference for MV3 blocking: uBlock Origin Lite (uAssets).
