# Syndicates Desktop themes

A theme restyles the dock, top bar, island, panels, Home, the desktops overview, the desktop widgets and the Customize window.
Several can be on at once (Customize > Themes); where they overlap, the later one wins.

The easiest way to make one is **Customize > Themes > New theme** (or **Make a copy to edit** on a built-in one):
changes apply as you type. **Export…** saves it as a `.sdtheme` file to send to anyone; they use **Import theme…**.
Theme files also work when dropped into the themes folder (**Open themes folder**).

## The file

A `.sdtheme` file is JSON:

```json
{
  "name": "Midnight",
  "author": "you",
  "description": "Deep navy with a soft blue glow.",
  "tags": ["dock", "top bar"],
  "accent": "#6c8cff",
  "variables": {
    "--sd-dock-bg": "linear-gradient(rgba(22, 30, 60, .96), rgba(10, 14, 32, .96))",
    "--bg": "rgba(13, 18, 38, .96)",
    "--t": "#e8ecff"
  },
  "shared": "/* CSS for every part */",
  "styles": {
    "dock": "#dock { box-shadow: 0 0 26px rgba(108, 140, 255, .18); }",
    "topbar": "",
    "island": "",
    "panels": "",
    "home": "",
    "overview": "",
    "wallpaper": "",
    "settings": ""
  }
}
```

Only `name` is required. `accent` replaces the accent colour picked in Customize while the theme is on.

## Variables

| Variable | What it changes |
|---|---|
| `--t` / `--m` | Text / muted text |
| `--line` | Lines and borders in panels |
| `--bg` / `--card` | Panel background / cards inside panels |
| `--sd-font` | The font everywhere |
| `--sd-dock-bg`, `--sd-dock-border`, `--sd-dock-radius` | The dock |
| `--sd-topbar-bg`, `--sd-topbar-border` | The top bar |
| `--sd-island-bg` | The island |
| `--sd-panel-radius` | Corners of panels and menus |

Any other `--name` may be set too, for a theme's own CSS.

## What theme CSS can and can't do

Theme CSS styles only the app's own pages. They block anything loaded from the web, so a theme can't load remote
images or fonts or track anyone. A theme file is limited to about 600 KB.
