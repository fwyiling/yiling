// The Mecha theme's controls, for every page: switches, buttons, list rows, fields, tabs, cards. One drawing language
// throughout (thin light outlines, corners cut at 45°, light plates for whatever is on or selected), made from a
// few bevel-cut frames drawn here as 9-slice SVGs, so the dock, the top bar, the menus, Home and the Customize
// window all match. Added to the built-in Mecha theme in themes.js.

/** A bevel-cut frame as a CSS image: size s, cut c, which corners ('tl br' or 'br' or 'all'), fill and outline. */
function frame({ s = 18, c = 6, corners = 'tl br', fill, stroke }) {
  const a = 0.5, b = s - 0.5, tl = /tl|all/.test(corners), tr = /tr|all/.test(corners), br = /br|all/.test(corners), bl = /bl|all/.test(corners);
  const pts = [
    ...(tl ? [[a, c], [c, a]] : [[a, a]]),
    ...(tr ? [[s - c, a], [b, c]] : [[b, a]]),
    ...(br ? [[b, s - c], [s - c, b]] : [[b, b]]),
    ...(bl ? [[c, b], [a, s - c]] : [[a, b]]),
  ].map((p) => p.join(',')).join(' ');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}' viewBox='0 0 ${s} ${s}'><polygon points='${pts}' fill='${fill}' stroke='${stroke}' stroke-width='1'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// the same cut as a clip, for pictures (thumbnails, covers, previews) that can't take a frame
const clip = (c) => `clip-path: polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px);`;

const INK = '#0e1b2a'; // text on a light plate
const F = {
  f: frame({ s: 16, c: 5, fill: 'rgba(10,16,26,.55)', stroke: 'rgba(236,244,252,.34)' }), // a field, a button, a chip
  h: frame({ s: 16, c: 5, fill: 'rgba(190,214,236,.14)', stroke: 'rgba(236,244,252,.62)' }), // the same, under the pointer
  sel: frame({ s: 16, c: 5, fill: 'rgba(166,214,242,.16)', stroke: 'rgba(166,214,242,.9)' }), // chosen, in a list
  p: frame({ s: 16, c: 5, fill: 'rgba(214,230,246,.94)', stroke: 'rgba(236,244,252,.95)' }), // on / selected: a light plate
  card: frame({ s: 30, c: 10, fill: 'rgba(10,15,24,.9)', stroke: 'rgba(236,244,252,.4)' }), // a card
  cardSoft: frame({ s: 30, c: 10, fill: 'rgba(236,244,252,.035)', stroke: 'rgba(236,244,252,.26)' }), // a card inside a panel
  menu: frame({ s: 30, c: 10, fill: 'rgba(8,12,20,.99)', stroke: 'rgba(236,244,252,.5)' }), // a pop-up menu: solid, nothing shows through
  cardSel: frame({ s: 30, c: 10, fill: 'rgba(166,214,242,.08)', stroke: 'rgba(166,214,242,.85)' }), // a chosen card
  big: frame({ s: 36, c: 12, fill: 'rgba(8,12,20,.92)', stroke: 'rgba(236,244,252,.5)' }), // the search bar, a big panel
  bigSel: frame({ s: 36, c: 12, fill: 'rgba(8,12,20,.94)', stroke: 'rgba(166,214,242,.95)' }), // the search bar while typing
  danger: frame({ s: 16, c: 5, fill: 'rgba(229,72,77,.3)', stroke: 'rgba(255,140,140,.9)' }),
};
const bev = (v, c = 5) => `border: 1px solid transparent; border-radius: 0; border-image: var(--mx-${v}) ${c} fill / ${c}px stretch; background: none; box-shadow: none;`;
const swap = (v) => `border-image-source: var(--mx-${v});`;

// shared by every page: the frames as variables, square corners, the switch and the slider
const shared = `
:root { ${Object.entries(F).map(([k, v]) => `--mx-${k}: ${v};`).join(' ')} --mx-ink: ${INK}; }
::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-thumb { background: rgba(236, 244, 252, .28); border-radius: 0; } ::-webkit-scrollbar-track { background: transparent; }
::selection { background: rgba(166, 214, 242, .35); }
kbd { ${bev('f', 4)} color: var(--t); }
input[type=range] { height: 3px !important; border-radius: 0 !important; accent-color: #d6e6f6; }
input[type=range]::-webkit-slider-thumb { width: 10px !important; height: 18px !important; border-radius: 0 !important; background: #eef5fb !important; box-shadow: 0 0 0 1px rgba(14, 27, 42, .6) !important; ${clip(3)} }
`;

// the top bar's menus and control centre, the dock's panels
const panels = `
.panel { border: 1px solid transparent; border-radius: 0; border-image: var(--mx-big) 12 fill / 12px stretch; background: none; box-shadow: none; filter: drop-shadow(0 16px 30px rgba(0, 0, 0, .45)); }
.ph b, .grp > small, .agenda > small, .tray-h { text-transform: uppercase; letter-spacing: .12em; font-size: 11.5px; font-weight: 700; }
.ph b { font-size: 12px; }
footer, .pf, .agenda, .focus, #menu .power { border-color: rgba(236, 244, 252, .18); }
/* menu rows */
#menu button { border-radius: 0; } #menu button:hover { ${bev('h')} }
#menu button.on::after { border-radius: 0; width: 7px; height: 7px; transform: rotate(45deg); background: #d6e6f6; }
#menu .power button.armed { ${bev('danger')} }
/* the switch: a bevel-cut track, a small plate that slides */
.sw { width: 40px; height: 20px; }
.sw i { ${bev('f', 5)} transition: none; }
.sw i::after { top: 4px; left: 4px; width: 14px; height: 10px; border-radius: 0; background: rgba(236, 244, 252, .78); ${clip(3)} transition: transform .16s cubic-bezier(.2, .8, .2, 1), background .16s; }
.sw input:checked + i { ${swap('p')} background: none; }
.sw input:checked + i::after { transform: translateX(18px); background: ${INK}; }
/* Wi-Fi and other lists */
.nets li, .nets .n { border-radius: 0; }
.nets .n:hover { ${bev('h')} }
.nets li.on { ${bev('sel')} }
.nets .n small { color: #a6d6f2; letter-spacing: .06em; text-transform: uppercase; font-size: 10.5px; }
.nets .pw input { ${bev('f')} padding: 8px 10px; }
.nets .pw button, .go { ${bev('p')} color: ${INK}; font-weight: 700; letter-spacing: .04em; }
.go:hover, .nets .pw button:hover { filter: brightness(1.06); }
.link { color: #a6d6f2; letter-spacing: .03em; }
/* control centre */
.tile .main, .tile .more, .tile.split .main, .tile.split .more { ${bev('f')} }
.tile .main:hover, .tile .more:hover { ${swap('h')} }
.tile.on .main, .tile.on .more { ${swap('p')} color: ${INK}; }
.tile.on .more { filter: brightness(.9); }
.ic-b, .slide .more, .ctl button, .focus .round, .wins .x, .th-chip button { border-radius: 0; }
.ic-b:hover, .slide .more:hover, .ctl button:hover, .focus .round:hover { ${bev('h')} }
.focus .round { ${bev('f')} }
input[type=range] { background: linear-gradient(90deg, #d6e6f6 var(--v, 50%), rgba(236, 244, 252, .16) var(--v, 50%)) !important; }
.row-sw { ${bev('cardSoft', 10)} }
.seg { ${bev('f')} padding: 3px; } .seg button { border-radius: 0; } .seg button.on { ${bev('p', 4)} color: ${INK}; }
.card { ${bev('big', 12)} }
.media .art, .shots .th, .wins .tb { border-radius: 0; ${clip(6)} }
.bat .cell { border-radius: 0; ${clip(4)} } .bat .cell b { border-radius: 0; } .bat .cell::after { border-radius: 0; }
/* calendar */
.cal span { border-radius: 0; } .cal span:hover:not(.today) { ${bev('h')} }
.cal span.today { ${bev('p')} color: ${INK}; } .cal span.today small { color: rgba(14, 27, 42, .7); }
.cal span.has::after { border-radius: 0; transform: rotate(45deg); } .cal span.today.has::after { background: ${INK}; }
.agenda li i { border-radius: 0; transform: rotate(45deg) scale(.85); }
/* screenshots, windows, tray, sound outputs */
.shots li, .wins li { border-radius: 0; } .shots li:hover, .wins li:hover { ${bev('h')} }
.wins li.active .tb { box-shadow: inset 0 0 0 1.5px #d6e6f6; }
.traygrid button { ${bev('f')} } .traygrid button:hover { ${swap('h')} }
.traygrid .ti .eye { border-radius: 0; transform: rotate(45deg); } .traygrid .ti .eye svg { transform: rotate(-45deg); }
.outs button { border-radius: 0; } .outs button:hover { ${bev('h')} }
.outs button i { border-radius: 0; transform: rotate(45deg) scale(.78); } .outs button.on i { box-shadow: inset 0 0 0 4px #d6e6f6; }
/* the sound panel */
.plays li { ${bev('cardSoft', 10)} }
.plays li.on { ${swap('cardSel')} }
.plays .t small { color: #a6d6f2; text-transform: uppercase; letter-spacing: .08em; }
.plays .c button { border-radius: 0; } .plays .c button:hover { ${bev('h')} }
.mixer img, .mixer .ph { border-radius: 0; ${clip(4)} }
.mixer .n i { border-radius: 0; transform: rotate(45deg); background: #a6d6f2; }
`;

// Home (Alt+Space or the Windows key)
const home = `
#backdrop { background: repeating-linear-gradient(0deg, rgba(236, 244, 252, .025) 0 1px, transparent 1px 4px), radial-gradient(1100px 600px at 25% 0%, rgba(166, 214, 242, .12), transparent 70%), rgba(5, 8, 14, .93); }
#greet { letter-spacing: .02em; } #date { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; }
#time { letter-spacing: -.01em; }
h2, .sec-h h2 { text-transform: uppercase; letter-spacing: .14em; font-size: 12px !important; font-weight: 700; }
.search { ${bev('big', 12)} backdrop-filter: none; height: 56px; }
.search:focus-within { ${swap('bigSel')} box-shadow: none; } /* the default look's round glow would draw as a square ring */
#results, .apps, .card { ${bev('card', 10)} }
.res { border-radius: 0; } .res:hover, .res.sel, .res.on { ${bev('h')} }
.res img, .res .ph, .app img, .app .ph { border-radius: 0; }
.app { border-radius: 0; } .app:hover, .app:focus-visible { ${bev('h')} border-radius: 0; }
.app .pin, .book .save { border-radius: 0; ${clip(4)} }
.chip { ${bev('f')} color: var(--t); }
.chip:hover { ${swap('h')} }
.chip.on { ${swap('p')} color: ${INK}; font-weight: 600; }
.days .chip[data-n]::after { border-radius: 0; ${clip(3)} color: ${INK}; background: #d6e6f6; }
.tabs { ${bev('f')} } .tabs button { border-radius: 0; } .tabs button.on { ${bev('p', 4)} color: ${INK}; }
#todos li { border-radius: 0; } #todos li:hover { ${bev('h')} }
#todos .ck { border-radius: 0; width: 13px; height: 13px; margin: 0 3px; transform: rotate(45deg); border: 1.5px solid rgba(236, 244, 252, .6); }
#todos li.done .ck { background: #d6e6f6; border-color: #d6e6f6; }
#todoIn, #notes, .addrow input, .mini-search { ${bev('f')} }
#todoIn:focus, #notes:focus, .addrow input:focus, .mini-search:focus { ${swap('sel')} box-shadow: none; outline: none; }
.rows li { ${bev('cardSoft', 10)} }
.book { border-radius: 0; } .book:hover { ${bev('h')} } .book .cover { border-radius: 0; ${clip(8)} }
.np .art { border-radius: 0; ${clip(6)} } .mctl button { border-radius: 0; } .mctl button:hover { ${bev('h')} }
.bar i { border-radius: 0; height: 4px; } .bar b { background: #d6e6f6; }
.places button { border-radius: 0; } .places button:hover { ${bev('h')} }
.ctx { ${bev('menu', 10)} } .ctx button { border-radius: 0; } .ctx button:hover { ${bev('h')} }
.rpin { ${bev('f')} }
body.dropping #panel::after { border-radius: 0; }
.pmenu { ${bev('menu', 10)} filter: drop-shadow(0 12px 24px rgba(0, 0, 0, .5)); } .pmenu button { border-radius: 0; } .pmenu button:hover { ${bev('h')} }
.pmenu button.armed { ${bev('danger')} color: #fff; }
`;

// the Customize window
const settings = `
:root { --bg: #070b12; --p: #0b111b; --p2: #111a27; --line: rgba(236, 244, 252, .14); --t: #eef5fb; --m: #9fb3c4; }
body { background: repeating-linear-gradient(0deg, rgba(236, 244, 252, .02) 0 1px, transparent 1px 4px), var(--bg); }
.side { background: linear-gradient(90deg, rgba(166, 214, 242, .05), transparent), var(--p); border-right: 1px solid rgba(236, 244, 252, .22); }
.brand img { border-radius: 0; ${clip(5)} }
.side button { border-radius: 0; letter-spacing: .02em; } .side button:hover { ${bev('h')} }
.side button.on { ${bev('p')} color: ${INK}; } .side button.on svg { color: ${INK}; }
h2 { color: #a6d6f2; letter-spacing: .16em; } h2::before { content: ""; display: inline-block; width: 14px; height: 1px; margin-right: 8px; vertical-align: middle; background: currentColor; }
main.searching section::before { text-transform: uppercase; letter-spacing: .12em; font-size: 14px; }
.btn { ${bev('f')} color: var(--t); letter-spacing: .02em; } .btn:hover { ${swap('h')} border-color: transparent; }
.btn.pri { ${swap('p')} color: ${INK}; } .btn.danger:hover { ${swap('danger')} color: #fff; }
.field, .find, select.field, .th-css textarea, input[type=color] { ${bev('f')} color: var(--t); }
.field:focus, .find:focus, .th-css textarea:focus { ${swap('sel')} border-color: transparent; box-shadow: none; outline: none; }
select.field option { background: #0b111b; }
.keycap.listening { ${swap('sel')} color: #a6d6f2; }
/* switches and checkboxes: the same bevel-cut switch as the menus */
.switch input[type=checkbox], .wrow input[type=checkbox] { -webkit-appearance: none; appearance: none; position: relative; width: 40px !important; height: 20px !important; margin: 0; flex: none; cursor: pointer; ${bev('f')} }
.switch input[type=checkbox]::after, .wrow input[type=checkbox]::after { content: ""; position: absolute; top: 4px; left: 4px; width: 14px; height: 10px; background: rgba(236, 244, 252, .78); ${clip(3)} transition: transform .16s cubic-bezier(.2, .8, .2, 1), background .16s; }
.switch input[type=checkbox]:checked, .wrow input[type=checkbox]:checked { ${swap('p')} }
.switch input[type=checkbox]:checked::after, .wrow input[type=checkbox]:checked::after { transform: translateX(18px); background: ${INK}; }
.switch, .field-row { border-bottom-color: rgba(236, 244, 252, .1); }
.seg, .seg-b { ${bev('f')} padding: 3px; } .seg button, .seg-b button { border-radius: 0; }
.seg button.on, .seg-b button.on { ${bev('p', 4)} color: ${INK}; }
/* cards and pickers */
.wrow, .desk, .th-card, .pets button, .th-chip, .mac-swipe, .th-editor, .th-css details { ${bev('cardSoft', 10)} }
.desk.on, .th-card.on, .pets button.on { ${swap('cardSel')} box-shadow: none; }
.th-editor { ${swap('cardSel')} }
.desk.own b::after { border-radius: 0; transform: rotate(45deg); }
.preview, .lockprev, .scene, .gal-grid button, .preset, .th-card .mock { border-radius: 0; ${clip(10)} }
.scene, .gal-grid button { ${clip(8)} }
.preview { box-shadow: none; outline: 1px solid rgba(236, 244, 252, .3); outline-offset: -1px; }
.scene.on, .gal-grid button.on { border-color: transparent; box-shadow: inset 0 0 0 2px #d6e6f6; }
.preset.on { border-color: #d6e6f6; }
.gal-grid button span, .th-card .tags span, code, kbd, .mac-swipe kbd { border-radius: 0; }
.th-vars .sw { border-radius: 0; ${clip(4)} }
.slider input, .wrow input[type=range] { accent-color: #d6e6f6; }
a { color: #a6d6f2; }
`;

// desktop widgets: their insides to match the bevel-cut cards
const wallpaper = `
/* the card's background blur is a rectangle: cut it like the frame, or it showed as square corners */
.w-card, [data-layout="mac"] .w-card { clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px); box-shadow: none; }
.w-calendar .grid .today { border-radius: 0; background: #d6e6f6; color: ${INK}; ${clip(3)} }
.w-reminders li i { border-radius: 0; transform: rotate(45deg) scale(.85); }
.w-media .art, [data-layout="mac"] .w-media .art { border-radius: 0; ${clip(6)} }
.w-card b.mo, .w-reminders .rh b, .w-weather .place { text-transform: uppercase; letter-spacing: .12em; }
`;

// the island's buttons
const island = `
.presets button, .pill-b, .round { ${bev('f')} }
.presets button:hover, .pill-b:hover, .round:hover { ${swap('h')} }
.go, .pill-b.accent { ${bev('p')} color: ${INK}; }
.big-art { border-radius: 0; ${clip(8)} }
`;

// the dock's Syndicates button: the logo cut to the same bevel, on a light-outlined plate
const dock = `
#home.item.sys { ${bev('h', 6)} }
#home.item.sys:hover { ${swap('p')} }
#home.item.sys img { width: 66%; height: 66%; border-radius: 0; clip-path: polygon(24% 0, 100% 0, 100% 76%, 76% 100%, 0 100%, 0 24%); }
#start.item.sys { ${bev('f', 6)} } #start.item.sys:hover { ${swap('h')} }
`;

module.exports = { frame, shared, styles: { panels, home, settings, wallpaper, island, dock } };
