# Syndicates Client

A Chrome (Manifest V3) extension that turns Chrome into a privacy-first, Opera GX-style client:
ad and tracker blocking, YouTube extras, manga/novel downloads, sidebar apps, and a custom home page.

## Install / update
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this folder.
2. To update: in `chrome://extensions`, check **Loaded from** on the Syndicates Client card – run `git pull` in *that* folder, click reload ↻, and refresh open tabs. The popup shows the version next to the name.

## Shortcuts
| Key | What it does |
| --- | --- |
| `]` (when you're not typing) | Open sidebar apps – change it in popup → Style |
| `Alt+Shift+S` | Open sidebar apps (change at `chrome://extensions/shortcuts`) |
| `/` on the new tab page | Focus the search box |
| Right-click a link → **Open link in sidebar** | Peek at a link next to the page you're on |
| YouTube: scroll on the speed button | Fine-tune playback speed |

## Protection (all on before a page even loads)
- **Ads & trackers:** EasyList + EasyPrivacy compiled to Chrome rules (~57k), plus a built-in domain list. Pause per site from the popup or dock.
- **Dangerous sites:** abuse.ch URLhaus malware feed (refreshed every 12 h, retried after 5 min on failure) – known malware/scam sites show a warning page instead of loading.
- **Pop-ups & redirects (strict):** blocks pop-ups/pop-unders opened without a real click, invisible click-trap links, self-opened ad tabs, and pages that jump to another site after a click that wasn't on a link. Logins/payments are allowed; every block shows **Open anyway**.
- **Cookie banners:** auto-rejected on thousands of sites (DuckDuckGo autoconsent rules).
- **Learning tracker blocker:** a third party that sets cookies on 3+ different sites gets blocked (Privacy Badger-style). Same-company domains and essential services are never blocked.
- **Clean up on close (opt-in):** a site's cookies & storage are deleted 30 s after its last tab closes, except sites on your keep list (pre-filled with your most-visited sites).
- **Privacy:** third-party cookies blocked, tracker cookies deleted, WebRTC IP leak prevention, confirm risky downloads (.exe, .js, .bat …).
- The popup shows a summary: pop-ups blocked, cookie banners rejected, trackers learned, sites cleaned.

## YouTube
- Ads are removed from YouTube's player data before the player reads them (the uBlock Origin Lite approach), so the video is never interrupted; YouTube's playback requests are never blocked; the "ad blockers not allowed" popup is closed.
- Native-looking player buttons: **speed** (click / scroll), **screenshot** (PNG), and a **Syndicates menu** with skip ads, SponsorBlock, dislikes, loop, hide end-screen cards, hide Shorts, volume boost (up to 300%) and preferred quality.
- **SponsorBlock** auto-skips sponsor reads, self-promos and "subscribe" reminders (segments shown on the progress bar, with Undo). **Return YouTube Dislike** shows dislike counts.

## Manga, manhwa & novels
- **Download a chapter or the whole series** (popup → Save, or the floating dock).
  - **MangaDex** uses the official API through your open MangaDex tab: pick English / 中文 (简体) / 中文 (繁體) / any language, a range, optional data-saver. **Test MangaDex connection** in the Save tab shows which step fails.
  - **Other sites:** finds the chapter list on the page and fetches each chapter (loads JavaScript readers in a background tab).
  - **Easy to read:** manga → a folder with a `Read <series>.html` you double-click (chapter menu, ← → keys, remembers your place) or `.cbz` per chapter; novels → one `.html` book, `.epub` or `.txt`. Saved in `Downloads/Syndicates Client/<series>/`.
- **Auto-load next chapter:** on manga & novel sites the next chapter appears as you scroll (falls back to a big "Next chapter" button on JavaScript-only readers).

## Manga library (mass downloads)
Popup → **Manga library**: search MangaDex with covers, **+ List** or **Download** straight away, paste title/chapter links or a
whole MangaDex list to import it. **Download new chapters** checks every series and grabs only what's new; **Download everything**
gets all chapters. Each series keeps one reader that grows as new chapters arrive. On a MangaDex page: popup → Save → **Add to download list**.

## Look & feel
- **New tab:** the Syndicates page (right-click Chrome's bottom bar → Hide footer once; Chrome remembers it). Or popup → Style →
  *New tab opens* → **Google (customised)**: google.com with your theme colours, greeting + clock and your shortcuts.
- **Home page (new tab):** **Chrome+** (default – Chrome's own layout in tones of your Chrome colour, so it blends in), **Cyber/gamer** (neon HUD, synthwave) or **Clean glass**. Backgrounds (theme colour, synthwave, anime wallpapers, Bing daily, photos, gradients, upload…), clock & greeting, search engine picker, editable shortcuts, weather, quote, notes, to-do, fonts – all under **Customize**.
- **Google & YouTube skins** follow the home-page theme (calm Chrome+ tones by default, neon in Cyber mode).
- **Dark mode on every site** – Dark Reader engine (images keep their colours), with "No dark mode here" in the dock.
- **Floating dock** on every site: pause protection here, dark mode, accent, download chapter/series, YouTube shortcuts.
- Accent colour everywhere, per-site custom CSS, tab sleeper (frees RAM).

## Sidebar apps
Discord, Spotify, YouTube Music, WhatsApp, Telegram, ChatGPT, Claude, Twitch – or add any site with **+**.
Apps stay loaded while you switch (chats stay connected, music keeps playing). **Fit / − / +** zoom desktop sites
(e.g. Discord) so they fit the panel, **⧉** pops an app out into a floating window, **↗** opens it in a tab.
Drag the panel's left edge to make it wider.

## Chrome's own bars
- **Bottom bar on the new tab page** ("Syndicates Client" link + "Customise Chrome"): Chrome adds it to every extension's new tab page. Any one of:
  1. Right-click directly on the bar → **Hide footer** (newer Chrome).
  2. Double-click `tools\windows\hide-new-tab-footer.reg`, close every Chrome window, reopen. `chrome://policy` should list
     `NTPFooterExtensionAttributionEnabled = false` (status OK). Chrome then says "Managed by your organization" – normal. Undo: `show-new-tab-footer.reg`.
  3. Start Chrome with `--disable-features=NtpFooter` (`tools\windows\start-chrome-without-footer.bat`, or add it to your Chrome shortcut's *Target*).
- **Tab strip / address bar / bookmarks bar:** only a Chrome *theme* can restyle them. Matching themes are in `themes/`
  (red, cyan, violet, matrix): `chrome://extensions` → **Load unpacked** → pick e.g. `themes/cyber-red` (the theme folder itself).
  Popup → Style → **Reskin Chrome's top bar & footer** walks you through it. Make your own with `python3 tools/make-themes.py`.

## Console messages
`net::ERR_BLOCKED_BY_CLIENT` lines in DevTools are Syndicates Client blocking ads/trackers – expected with any blocker.

## Building bundled parts
```bash
cd tools && npm install
npx esbuild ../content/src/cookies.js --bundle --format=iife --outfile=../content/cookies.js
npx esbuild ../content/src/autonext.js --bundle --format=iife --outfile=../content/autonext.js
node build-darkmode.mjs
# filter lists:
git clone --depth 1 https://github.com/easylist/easylist /tmp/easylist && node build-rules.mjs /tmp/easylist
```

## Limits
- An extension can't sandbox your OS; it reduces exposure (blocklists, warning page, download prompts) but isn't antivirus.
- YouTube and Google change their pages often; skins and player buttons may need occasional updates.
- Some sites refuse to run inside the sidebar – use ⧉ or ↗ for those.
- Only download content you have the right to keep offline.

## Credits / references
- [EasyList / EasyPrivacy](https://github.com/easylist/easylist) – filter lists (GPLv3 / CC BY-SA 3.0); converted with [@ghostery/urlfilter2dnr](https://github.com/ghostery/urlfilter2dnr) (build-time only).
- [DuckDuckGo autoconsent](https://github.com/duckduckgo/autoconsent) (MPL-2.0) – cookie-banner engine + rules, vendored in `lib/vendor/`.
- [Dark Reader](https://github.com/darkreader/darkreader) (MIT) – dark-mode engine, bundled into `content/darkmode.js`.
- [catppuccin/userstyles](https://github.com/catppuccin/userstyles) (MIT) – Google's colour-variable map in `skins/google.css`.
- [YouTube-Enhancer/extension](https://github.com/YouTube-Enhancer/extension) (MIT) – approach for native-looking player buttons/menus.
- [SponsorBlock](https://sponsor.ajay.app) – segment data (CC BY-NC-SA 4.0), privacy-preserving hash lookup. [Return YouTube Dislike](https://returnyoutubedislike.com) – dislike counts.
- [Comics-Manga-Downloader-Extension](https://github.com/saptarshimondal/Comics-Manga-Downloader-Extension) (MIT) – image validation/retry approach.
- [Yui007/mangadex-extension](https://github.com/Yui007/mangadex-extension) (MIT) and the [MangaDex API](https://api.mangadex.org/docs/) – MangaDex downloads.
- [WebToEpub](https://github.com/dteviot/WebToEpub) – chapter-list discovery approach. [mue](https://github.com/mue/mue) (BSD-3) – home-page widget structure.
- uBlock Origin Lite, Privacy Badger, Cookie AutoDelete, Pagetual, Popup Blocker (strict), Opera GX – behaviour references (own code).
