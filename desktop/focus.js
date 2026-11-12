// Focus mode: while it's on (on its own while you revise, or switched on by hand), the apps and websites you've
// listed as distractions get a nudge in the island when they come to the front, or are minimized straight away in
// strict mode. The app's own notifications stay quiet apart from the goals' and the timer's. Nothing is blocked
// on the network and nothing leaves this PC: it only looks at which window is in front, every second and a half.
let on = false, why = '', since = 0, timer = null, lastNudge = new Map(), blocked = 0;
let cfg = () => ({ apps: [], sites: [], strict: false }), win32 = null, onChange = () => {}, nudge = () => {};

const norm = (x) => String(x || '').trim().toLowerCase();
/** Is this window a distraction? Gives back what matched (an app or a site), or ''. */
function match(fg) {
  if (!fg) return '';
  const c = cfg();
  const exe = norm(fg.exe).replace(/\.exe$/, '');
  for (const a of c.apps || []) { const n = norm(a).replace(/\.exe$/, ''); if (n && exe === n) return a; }
  // a website: browsers put the page title (and often the site's name) in the window title
  const title = norm(fg.title);
  if (/(chrome|msedge|firefox|brave|opera|vivaldi|arc|zen)$/.test(exe)) for (const site of c.sites || []) { const n = norm(site).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\.(com|tv|org|net)$/, ''); if (n && title.includes(n)) return site; }
  return '';
}
function check() {
  const fg = win32.foregroundApp();
  const hit = match(fg);
  if (!hit) return;
  const now = Date.now(), key = `${hit}|${fg.hwnd}`;
  if (cfg().strict) { win32.minimizeWindow(fg.hwnd); blocked++; }
  if (now - (lastNudge.get(key) || 0) < (cfg().strict ? 4000 : 30000)) return; // a nudge, not nagging
  lastNudge.set(key, now);
  nudge(cfg().strict ? `Focus mode: ${hit} is minimized` : `Focus mode: ${hit} can wait`);
}

const status = () => ({ on, why, since, blocked });
function set(next, reason = 'manual') {
  next = !!next;
  if (next === on) { if (next && reason === 'manual') why = 'manual'; return status(); }
  on = next; why = on ? reason : ''; since = on ? Date.now() : 0; blocked = 0; lastNudge.clear();
  clearInterval(timer); timer = null;
  if (on && win32?.isWin) timer = setInterval(() => { try { check(); } catch {} }, 1500);
  onChange(status());
  return status();
}

function init(opts) {
  ({ win32 } = opts);
  if (opts.cfg) cfg = opts.cfg;
  if (opts.onChange) onChange = opts.onChange;
  if (opts.nudge) nudge = opts.nudge;
}

module.exports = { init, set, status, isOn: () => on, why: () => why, _match: match, _setCfg: (f) => { cfg = f; } };
