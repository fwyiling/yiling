# Syndicates Desktop

Animated wallpapers, desktop widgets and a Home panel for Windows 10 and 11, in the same
grey-blue style as the Syndicates Client.

- **Animated wallpaper** behind your desktop icons: Aurora, Particles, Waves or Starfield, or
  your own image, video or web page. Colour presets, speed, intensity, darkening and a gentle
  follow-the-mouse effect.
- **Desktop widgets** on the wallpaper: clock (big, minimal or analog), greeting with your name,
  date, CPU and memory, weather, quote. Drag them anywhere in the Customize preview.
- **Home panel** (`Alt+Space`, changeable): search your apps or the web, pinned apps, all apps,
  to-dos, notes, system stats.
- Pauses itself during games and full-screen video, and on battery. Optional: hide desktop icons,
  start with Windows. Lives in the system tray.

## Run it

1. Install **Node.js LTS** from <https://nodejs.org> (once).
2. Double-click **`start.bat`** in this folder. The first start downloads what it needs (a minute or two).

Or from a terminal in this folder: `npm install`, then `npm start`.

To make an installer and a portable `.exe`: `npm run dist` (files appear in `dist/`).

Right-click the tray icon for Customize, Pause, Hide desktop icons, Start with Windows and Quit.
Quitting gives your desktop icons back if you hid them.

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
  desktop widgets and a web-based desktop shell.

Weather comes from [Open-Meteo](https://open-meteo.com) (free, no key).
