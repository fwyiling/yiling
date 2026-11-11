// Plain-Node checks of the parts that don't need Windows or Electron: settings (defaults, merging, upgrades from
// older versions), themes (built-ins, merging order, validation of imported files) and the helper-script launcher.
// Usage: node test/units.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-units-'));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

// ---------- settings ----------
const { Store, DEFAULTS, merge } = require('../settings-store');
ok('merge keeps defaults for missing keys and takes saved ones', () => {
  const m = merge({ a: 1, b: { c: 2, d: 3 }, list: [1] }, { b: { c: 9 }, list: [2, 3], extra: true });
  assert.deepStrictEqual(m, { a: 1, b: { c: 9, d: 3 }, list: [2, 3], extra: true });
});
const storeWith = (saved) => { const d = fs.mkdtempSync(path.join(tmp, 's')); fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify(saved)); return new Store(d); };
ok('a fresh install gets the defaults', () => {
  const s = new Store(fs.mkdtempSync(path.join(tmp, 's'))).get();
  assert.strictEqual(s.wallpaper.scene, 'image'); assert.deepStrictEqual(s.themes.active, []); assert.strictEqual(s.island.pet, 'cat');
});
ok('an animated scene from an old version becomes "nothing picked"', () => {
  const s = storeWith({ wallpaper: { scene: 'aurora', speed: 1.5, colors: ['#000'], audio: true } }).get();
  assert.strictEqual(s.wallpaper.scene, 'image'); assert.strictEqual(s.wallpaper.file, '');
  for (const k of ['speed', 'colors', 'audio']) assert.ok(!(k in s.wallpaper), `${k} should be gone`);
});
ok('an old scene with a video file picked becomes Video', () => assert.strictEqual(storeWith({ wallpaper: { scene: 'windows', file: 'C:\\a\\clip.MP4' } }).get().wallpaper.scene, 'video'));
ok('themes that no longer exist are dropped from what is in use', () => assert.deepStrictEqual(storeWith({ themes: { active: ['default', 'midnight', 'mecha', 'mine'] } }).get().themes.active, ['mecha', 'mine']));
ok('a broken settings file falls back to defaults', () => { const d = fs.mkdtempSync(path.join(tmp, 's')); fs.writeFileSync(path.join(d, 'settings.json'), '{not json'); assert.strictEqual(new Store(d).get().accent, DEFAULTS.accent); });
ok('set merges and flush writes a whole file', () => {
  const d = fs.mkdtempSync(path.join(tmp, 's')), st = new Store(d);
  st.set({ dock: { on: true } }); st.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8'));
  assert.strictEqual(saved.dock.on, true); assert.strictEqual(saved.dock.size, DEFAULTS.dock.size);
  assert.ok(!fs.existsSync(path.join(d, 'settings.json.tmp')));
});

// ---------- themes ----------
const themes = require('../themes');
themes.init(fs.mkdtempSync(path.join(tmp, 't')));
ok('the built-in themes are valid and listed', () => {
  const ids = themes.all().map((t) => t.id);
  assert.deepStrictEqual(ids, ['frosted', 'bubbles', 'mecha']);
  for (const t of themes.all()) { assert.ok(t.builtin && !t.broken && t.name && t.description, t.id); for (const k of Object.keys(t.styles)) assert.ok(themes.SURFACES.includes(k), `${t.id}: ${k}`); }
});
ok('theme CSS is balanced (every { has its })', () => {
  for (const t of themes.BUILTIN) for (const [k, css] of Object.entries({ shared: t.shared || '', ...t.styles })) {
    const plain = css.replace(/url\("[^"]*"\)/g, 'url()').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.strictEqual((plain.match(/{/g) || []).length, (plain.match(/}/g) || []).length, `${t.id}.${k}`);
  }
});
ok('several themes merge in order: the later one wins', () => {
  const b = themes.bundle(['frosted', 'mecha', 'no-such-theme']);
  assert.strictEqual(b.vars['--sd-topbar-bg'], themes.get('mecha').variables['--sd-topbar-bg']);
  assert.strictEqual(b.vars['--card'], themes.get('mecha').variables['--card']);
  assert.strictEqual(b.accent, themes.get('mecha').accent);
  assert.ok(b.styles.dock.includes('#dock'));
  assert.deepStrictEqual(themes.bundle([]), { vars: {}, accent: '', shared: '', styles: {} });
});
ok('a file that is not a theme is refused', () => { assert.throws(() => themes.validate({})); assert.throws(() => themes.validate([])); assert.throws(() => themes.validate(null)); });
ok('imported values cannot break out of their rule or close the style tag', () => {
  const t = themes.validate({ name: 'X', accent: 'red', variables: { '--t': '#fff; } body { display: none', 'bad key': 'x', '--ok': 'blue' }, styles: { dock: '#dock{}</style><script>', nope: 'x' }, shared: '</STYLE>' });
  assert.ok(!/[;{}<>]/.test(t.variables['--t'])); assert.ok(!('bad key' in t.variables)); assert.strictEqual(t.variables['--ok'], 'blue');
  assert.ok(!/<\/style/i.test(t.styles.dock + t.shared)); assert.ok(!('nope' in t.styles)); assert.ok(!('accent' in t));
});
ok('your own themes: create from a built-in, save, export, import, delete; built-ins are protected', () => {
  const id = themes.create('mecha');
  assert.ok(themes.get(id) && !themes.get(id).builtin);
  themes.save(id, { ...themes.get(id), name: 'Mine', variables: { '--t': '#123456' } });
  assert.strictEqual(themes.get(id).variables['--t'], '#123456');
  const out = path.join(tmp, 'out.sdtheme'); themes.exportTo(id, out);
  const id2 = themes.install(out);
  assert.notStrictEqual(id2, id); assert.strictEqual(themes.get(id2).name, 'Mine');
  assert.throws(() => themes.save('mecha', { name: 'hacked' }));
  assert.strictEqual(themes.remove('mecha'), false);
  assert.strictEqual(themes.remove(id), true); assert.strictEqual(themes.get(id), null);
});
ok('a broken file in the themes folder is listed as broken, not fatal', () => {
  fs.writeFileSync(path.join(themes.dir(), 'oops.sdtheme'), '{nope');
  const t = themes.all().find((x) => x.id === 'oops');
  assert.ok(t && t.broken); assert.ok(!themes.bundle(['oops']).shared);
  fs.unlinkSync(path.join(themes.dir(), 'oops.sdtheme'));
});

// ---------- helper scripts ----------
ok('long helper scripts are written once, by content, with a BOM', () => {
  const { psArgs } = require('../ps-script');
  const a = psArgs('Write-Output "é"', 'unit'), b = psArgs('Write-Output "é"', 'unit'), c = psArgs('Write-Output 2', 'unit');
  assert.strictEqual(a.at(-1), b.at(-1)); assert.notStrictEqual(a.at(-1), c.at(-1));
  const raw = fs.readFileSync(a.at(-1));
  assert.deepStrictEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.ok(a.includes('-File') && !a.includes('-EncodedCommand'));
  for (const f of [a.at(-1), c.at(-1)]) fs.unlinkSync(f);
});
ok('no helper script passed on the command line is near Windows\' 32,767 character limit', () => {
  for (const m of ['media']) { // still uses -EncodedCommand (UTF-16, then base64)
    const len = Buffer.from(require(`../${m}`).PS, 'utf16le').toString('base64').length;
    assert.ok(len < 30000, `${m}.js is ${len} characters encoded: run it with psArgs (a file) instead`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`all ${n} unit checks fine`);
