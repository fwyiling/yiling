# Shield Client

Chrome (Manifest V3) extension: ad blocking, YouTube extras, privacy/malware protection,
GX-style customization, and a manga/novel downloader.

## Install
`chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.

## Features
- **Blocking (on before any page loads):** EasyList + EasyPrivacy (~57k rules), a built-in domain list, and the abuse.ch
  URLhaus malware feed. Known-dangerous sites show a warning page instead of loading. Pause blocking per site from the popup or dock.
- **YouTube:** auto-skip ads, hide Shorts, default speed, volume boost up to 300%.
- **Privacy:** block third-party cookies, delete tracker cookies, trim referrers, stop WebRTC IP leaks, confirm risky downloads.
- **Downloader – chapter or whole series:**
  - **MangaDex** uses the official API: pick English / 中文 (简体) / 中文 (繁體) / any language, the whole series or a range,
    optional data-saver. Rate limits are respected.
  - **Other manga / manhwa / novel sites:** finds the chapter list on the page, then fetches each chapter
    (falls back to loading it in a background tab for JavaScript readers).
  - **Easy to read:** manga → a folder with a `Read <series>.html` you double-click (chapter menu, ← → keys, remembers your place),
    or `.cbz` per chapter. Novels → one `.html` book, `.epub`, or `.txt`. Saved in `Downloads/Shield Client/<series>/`.
- **Home page:** Cyber/gamer theme (neon HUD clock, glitch, scanlines, animated synthwave grid) or clean glass.
  Backgrounds: synthwave, SFW anime wallpapers (wallhaven.cc), Bing daily, photos, gradients, color, link, or upload.
  Clock/greeting, search engine picker, editable drag-to-reorder shortcuts, weather, quote, notes, to-do, fonts, glass,
  corner roundness, export/import. Open the ⚙ button.
- **Web skins:** cyber look on Google Search and YouTube (neon accent, dark synthwave backdrop, glowing progress bar).
  Toggle in the popup → Style. Skins live in `skins/` – plain CSS, easy to tweak.
- **Client dock:** floating button on every site with quick toggles and Download.
- **Tab sleeper**, accent color everywhere, per-site custom CSS.

## Chrome theme (tab strip, toolbar, address bar)
If your tab strip is still brown/grey, you haven't loaded a theme yet – that colour is Chrome's own.
Extensions can't restyle Chrome's own bars, so matching **themes** are in `themes/` (red, cyan, violet, matrix green).
Load one the same way: `chrome://extensions` → **Load unpacked** → pick e.g. `themes/cyber-red`.
Make your own colours by editing `tools/make-themes.py` and running `python3 tools/make-themes.py`.

To hide Chrome's own "Customise Chrome" button and footer on the new tab page: click it and switch off **Show footer**
(recent Chrome versions).

## Console messages
`net::ERR_BLOCKED_BY_CLIENT` lines in DevTools are Shield Client blocking ads/trackers – expected with any blocker.

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
- [mue](https://github.com/mue/mue) (BSD-3) – structure of the home page widgets/settings.
- [WebToEpub](https://github.com/dteviot/WebToEpub) – chapter-list discovery approach.
- [catppuccin/userstyles](https://github.com/catppuccin/userstyles) (MIT) – Google's colour-variable map used in `skins/google.css`.
- [MangaDex API](https://api.mangadex.org/docs/) – official API for MangaDex downloads.
