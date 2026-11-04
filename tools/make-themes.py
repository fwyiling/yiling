"""Generate Chrome themes (tab strip, toolbar, address bar) matching Syndicates Client's cyber look.
Usage: python3 tools/make-themes.py   -> writes themes/<name>/ (load each as an unpacked extension)
Edit THEMES below to make your own colors."""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter

THEMES = {
    'cyber-red':    {'name': 'Syndicates Cyber · Red',    'accent': (250, 30, 78),  'base': (11, 6, 20),  'glow2': (140, 30, 255)},
    'cyber-cyan':   {'name': 'Syndicates Cyber · Cyan',   'accent': (0, 220, 255),  'base': (4, 10, 20),  'glow2': (40, 90, 255)},
    'cyber-violet': {'name': 'Syndicates Cyber · Violet', 'accent': (170, 80, 255), 'base': (10, 5, 22),  'glow2': (255, 40, 160)},
    'cyber-green':  {'name': 'Syndicates Cyber · Matrix', 'accent': (40, 255, 120), 'base': (3, 12, 8),   'glow2': (0, 160, 120)},
}

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def frame_image(c, w=3000, h=200):
    base, acc, g2 = c['base'], c['accent'], c['glow2']
    im = Image.new('RGB', (w, h), base)
    d = ImageDraw.Draw(im, 'RGBA')
    # soft color glows
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    gd.ellipse([w * .55, -h * 1.5, w * 1.1, h * 1.2], fill=acc + (90,))
    gd.ellipse([-w * .1, -h, w * .35, h * 1.4], fill=g2 + (70,))
    im.paste(glow.filter(ImageFilter.GaussianBlur(90)), (0, 0), glow.filter(ImageFilter.GaussianBlur(90)))
    # fine grid
    for x in range(0, w, 32): d.line([(x, 0), (x, h)], fill=acc + (14,))
    for y in range(0, h, 32): d.line([(0, y), (w, y)], fill=acc + (14,))
    # diagonal HUD stripes on the right
    for i in range(14):
        x = w - 420 + i * 18
        d.polygon([(x, 0), (x + 8, 0), (x - 40, h), (x - 48, h)], fill=acc + (28,))
    # random "data" ticks
    random.seed(7)
    for _ in range(90):
        x, y = random.randrange(w), random.randrange(h)
        d.rectangle([x, y, x + random.choice([2, 6, 14]), y + 1], fill=acc + (random.randrange(30, 90),))
    return im

def toolbar_image(c, w=3000, h=160):
    base, acc = c['base'], c['accent']
    top = mix(base, (255, 255, 255), .06)
    im = Image.new('RGB', (w, h), top)
    d = ImageDraw.Draw(im, 'RGBA')
    for y in range(h): d.line([(0, y), (w, y)], fill=mix(top, base, y / h) + (255,))
    d.line([(0, 0), (w, 0)], fill=acc + (160,), width=2)      # neon edge under the tabs
    for x in range(0, w, 6): d.point((x, 1), fill=acc + (60,))
    return im

for key, c in THEMES.items():
    out = os.path.join('themes', key); os.makedirs(os.path.join(out, 'images'), exist_ok=True)
    frame_image(c).save(os.path.join(out, 'images', 'frame.png'))
    toolbar_image(c).save(os.path.join(out, 'images', 'toolbar.png'))
    base, acc = c['base'], c['accent']
    toolbar = mix(base, (255, 255, 255), .06)
    rgb = lambda t: list(t)
    manifest = {
        'manifest_version': 3, 'version': '1.0', 'name': c['name'],
        'description': 'Futuristic tab strip, toolbar and address bar for Syndicates Client.',
        'theme': {
            'images': {'theme_frame': 'images/frame.png', 'theme_toolbar': 'images/toolbar.png'},
            'colors': {
                'frame': rgb(base), 'frame_inactive': rgb(mix(base, (0, 0, 0), .3)),
                'frame_incognito': rgb(mix(base, (0, 0, 0), .4)), 'frame_incognito_inactive': rgb(mix(base, (0, 0, 0), .5)),
                'toolbar': rgb(toolbar), 'toolbar_text': [240, 240, 248], 'toolbar_button_icon': rgb(mix(acc, (255, 255, 255), .25)),
                'tab_text': [255, 255, 255], 'tab_background_text': rgb(mix(acc, (255, 255, 255), .55)),
                'tab_background_text_inactive': [150, 150, 165],
                'bookmark_text': rgb(mix(acc, (255, 255, 255), .7)),
                'omnibox_background': rgb(mix(base, acc, .12)), 'omnibox_text': [255, 255, 255],
                'ntp_background': [5, 1, 10], 'ntp_text': [255, 255, 255], 'ntp_link': rgb(acc),
                'button_background': [0, 0, 0, 0],
            },
            'tints': {'buttons': [-1, -1, -1]},
            'properties': {'ntp_background_alignment': 'bottom'},
        },
    }
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=2)
    print('wrote', out)
