# Syndicates Desktop

Animated wallpapers, desktop widgets and a Home panel for Windows 10 and 11, in the same
grey-blue style as the Syndicates Client.

- **Animated wallpaper** behind your desktop icons: Aurora, Particles, Waves, Starfield or a music
  Visualizer, or your own image, video or web page. Colour presets, speed, intensity, darkening, a
  gentle follow-the-mouse effect, colours that **follow the time of day**, and an option to **react
  to music** (system sound only, never the microphone).
- **Desktop widgets** on the wallpaper: clock (big, minimal or analog), greeting with your name,
  date, CPU and memory, weather, quote, now playing. Drag them anywhere in the Customize preview.
- **Home panel** (`Alt+Space`, changeable): search your apps or the web, pinned apps, all apps,
  to-dos, notes, system stats, and **now playing** with play / pause / skip for whatever app is
  playing (Spotify, a browser, Media Player…).
- **Taskbar**: the Windows taskbar options in one place (icons left or centre, search hidden / icon /
  box, Task view, auto-hide, accent colour), or switch on the **Syndicates dock**: a floating or
  full-width dock with Home, pinned apps, your open windows, now playing and a clock. The Windows taskbar hides
  itself while the dock is on and comes back when you turn it off or quit.
- **Lock screen and sign-in screen**: Windows can't animate them, so one click turns your wallpaper
  and widgets into the lock screen picture (and, if you like, the regular Windows wallpaper, which
  is what you see right after signing in). It can keep itself updated as you change things.
- Pauses itself during games and full-screen video, and on battery. Optional: hide desktop icons,
  start with Windows. Lives in the system tray.

## Run it

1. Install **Node.js LTS** from <https://nodejs.org> (once).
2. Double-click **`start.bat`** in this folder. The first start downloads what it needs (a minute or two).

Or from a terminal in this folder: `npm install`, then `npm start`.

To make an installer and a portable `.exe`: `npm run dist` (files appear in `dist/`).

Right-click the tray icon for Customize, Pause, Hide desktop icons, Start with Windows and Quit.
Quitting gives your desktop icons back if you hid them.

## If the desktop stays white or black

Quit from the tray icon and start it again. If it's still blank, open Customize > General and send
a screenshot along with your Windows version (Settings > System > About).

## Tests

`node test/win32-bindings.test.js` checks every Win32 declaration on any OS. On Windows,
`node test/win32-real.smoke.js`, `node test/media.smoke.js` and `npx electron test/electron-smoke.js`
check the real thing; the last one screenshots the desktop to prove the wallpaper shows behind the
icons. The GitHub Actions workflow `desktop-windows.yml` runs all of them on Windows and builds the
installer and portable `.exe` as a download.

## How it works

The wallpaper is a normal web page in an Electron window that is re-parented into Explorer's
desktop layer, between the wallpaper and the icons. Explorer creates that layer when it receives
the undocumented `0x052C` message. Windows 11 24H2 moved the layer, so `win32.js` detects which
layout it's on from the window tree and handles both.

References:
- [Lively Wallpaper](https://github.com/rocksdanister/lively): the desktop-layer technique and
  pausing during full-screen apps.
- [C0uki/beautiful-wallpaper#83](https://github.com/C0uki/beautiful-wallpaper/pull/83) and
  [youllook/VibingWrapper#7](https://github.com/youllook/VibingWrapper/pull/7): the Windows 11 24H2 changes.
- [Rainmeter](https://github.com/rainmeter/rainmeter) and [Seelen UI](https://github.com/eythaann/Seelen-UI):
  desktop widgets and a web-based desktop shell with its own dock.
- [TranslucentTB](https://github.com/TranslucentTB/TranslucentTB): restyling the Windows 11 taskbar
  itself needs code injected into Explorer, which breaks on new Windows builds, so this app uses
  Windows' own taskbar settings plus its own dock instead.
- [Chromium's occlusion tracking](https://chromium.googlesource.com/chromium/src/+/master/docs/windows_native_window_occlusion_tracking.md):
  why it's turned off (a window behind the icons otherwise renders white).
- [Windows.Media.Control](https://learn.microsoft.com/en-us/uwp/api/windows.media.control):
  the media session API behind "now playing" (the same source as the volume flyout).
- [LockScreen.SetImageFileAsync](https://learn.microsoft.com/en-us/uwp/api/windows.system.userprofile.lockscreen.setimagefileasync):
  the Windows API used for the lock screen picture.

Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key).
