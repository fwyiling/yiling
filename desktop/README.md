# Syndicates Desktop

A desktop shell for Windows 10 and 11: wallpaper and widgets, a dock, a top bar with your tray icons, an
island, a desktops overview and themes, in the same grey-blue style as the Syndicates Client.

- **Wallpaper** behind your desktop icons: a photo, a video or a web page, or your Windows background if
  you pick nothing. Each virtual desktop can have its own. A built-in **anime gallery** (from Wallhaven,
  safe-for-work only) downloads the ones you pick.
- **Desktop widgets** on the wallpaper: clock, greeting, date, calendar, reminders, weather, CPU and
  memory, quote, now playing. Mac-style corners, centred, or dragged anywhere in the Customize preview.
- **Dock**: pinned apps, open windows (live previews when an app has several, a glow when one wants your
  attention, middle-click for another window), a Screenshots stack and the Bin. The Windows taskbar hides
  itself while the dock is on and comes back when you turn it off or quit.
- **Top bar**: the app in front, your desktops, **tray icons** (Discord, Steam, OneDrive…; hide the ones you
  don't want), weather, battery, Wi-Fi, sound, and panels for each. Its menu has Sleep, Restart, Shut down
  and Sign out.
- **Island**: a pill at the top for the timer, what's playing (with a seek bar), volume / brightness and
  short notes (Caps Lock, headphones), with an **island pet** to keep you company.
- **Desktops**: three-finger swipes like a MacBook, drag a window against the screen edge to take it to the
  next desktop, and an **overview** of every desktop and its windows (`Ctrl+Alt+Up`).
- **Home panel** (`Alt+Space`, changeable, or the **Windows key** like a Start menu): search apps, files and
  the web, pinned apps, to-dos, notes, timetable, books, lock / sleep / restart / shut down. Win+E and other
  shortcuts still work; Ctrl+Esc opens Windows' own Start menu. Customize > Home switches the Windows key off.
- **Themes**: restyle everything with variables and CSS, turn on several at once, share them as
  `.sdtheme` files. Built in: Frosted, Bubbles, Mecha. See [THEMES.md](THEMES.md).
- **Lock screen**: one click turns your wallpaper and widgets into the lock screen picture.
- Pauses itself during games and full-screen video (**gamer mode**, `Ctrl+Alt+G`) and on battery. Starts
  with Windows if you like. Lives in the system tray.

Everything is set in **Customize** (`Ctrl+Alt+S`, or the tray icon), which has a search box (`Ctrl+F`).

## Install it (recommended)

Open the repository's **Releases** page on GitHub, release **Syndicates Desktop (latest)**, and download
**`Syndicates-Desktop-Setup.exe`**. It installs like any app: Start menu and desktop shortcut, starts
with Windows, lives in the tray. No terminal, nothing to keep open. Every build there has passed the
Windows tests first. (`Syndicates-Desktop-Portable.exe` runs without installing.)

Windows may say "Windows protected your PC" because the app isn't code-signed: **More info → Run anyway**.

## Run it from source

1. Install **Node.js LTS** from <https://nodejs.org> (once).
2. Double-click **`start.bat`** in this folder. The first start downloads what it needs (a minute or two),
   then the app starts on its own and the window closes; closing it doesn't stop the app.
   It starts with Windows from then on, so you only do this once (Customize > General > Start with Windows
   turns that off).

To build the installer yourself: `npm run dist` (files appear in `dist/`).

Right-click the tray icon for Customize, Pause, Hide desktop icons, Start with Windows and Quit.
Quitting gives your desktop icons back if you hid them. Opening the app again while it runs opens Customize.

## If the desktop stays white or black

Quit from the tray icon and start it again. If it's still blank, open Customize > General and send
a screenshot along with your Windows version (Settings > System > About).

## Tests

On any OS: `node test/win32-bindings.test.js` checks every Win32 declaration, and `node test/units.test.js`
checks settings (including upgrades from older versions), themes and the helper-script launcher.

On Windows: `node test/win32-real.smoke.js`, and the smoke tests for each helper (`apps`, `sysctl`, `vdesk`,
`tray`, `media`), check the real thing; `npx electron test/electron-smoke.js` screenshots the desktop to
prove the wallpaper shows behind the icons. The GitHub Actions workflow `desktop-windows.yml` runs all of
them on Windows, builds the installer and portable `.exe`, starts the built app, and publishes the release
only if everything passed.

## How it works

The wallpaper is a normal web page in an Electron window that is re-parented into Explorer's
desktop layer, between the wallpaper and the icons. Explorer creates that layer when it receives
the undocumented `0x052C` message. Windows 11 24H2 moved the layer, so `win32.js` detects which
layout it's on from the window tree and handles both.

The dock, top bar, island and panels are transparent always-on-top windows. System things Windows only
offers through COM or WinRT (volume, Wi-Fi, now playing, virtual desktops, tray icons) run in long-lived
Windows PowerShell helpers that talk JSON over stdin / stdout; simple Win32 calls go through
[koffi](https://koffi.dev). Tray icons are heard by a hidden window named like the taskbar's, which passes
every message on to Explorer, so nothing is injected into Explorer.

References:
- [Lively Wallpaper](https://github.com/rocksdanister/lively): the desktop-layer technique and
  pausing during full-screen apps.
- [C0uki/beautiful-wallpaper#83](https://github.com/C0uki/beautiful-wallpaper/pull/83) and
  [youllook/VibingWrapper#7](https://github.com/youllook/VibingWrapper/pull/7): the Windows 11 24H2 changes.
- [Rainmeter](https://github.com/rainmeter/rainmeter) and [Seelen UI](https://github.com/eythaann/Seelen-UI):
  desktop widgets and a web-based desktop shell with its own dock, tray, overview and themes (ideas only:
  Seelen UI is AGPL, none of its code is used).
- [MScholtes/VirtualDesktop](https://github.com/MScholtes/VirtualDesktop) (MIT): the virtual-desktop
  interfaces used to move windows between desktops.
- [Wallhaven](https://wallhaven.cc): the anime wallpaper gallery (its public API).
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
