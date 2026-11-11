// Daily goals: so many minutes of revision a day (3 hours by default) and at least so many of something you enjoy (30
// minutes). A stopwatch for each (start one in Home or on the widget, it stops the other), minutes can also be added by
// hand, and a nudge in the evening if a goal isn't met yet. Kept on this PC: goals.json in the app's folder; a new day
// starts at midnight (time running across it is split between the two days).
const fs = require('fs');
const path = require('path');

const KINDS = ['revision', 'hobby'];
let file = '', st = null, timer = null, getCfg = () => ({ revision: 180, hobby: 30, remind: true }), notify = () => {};
const listeners = new Set();

const dayOf = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fresh = () => ({ day: dayOf(), revision: 0, hobby: 0, running: null, since: 0, reminded: [], history: {} });
const save = () => { try { fs.writeFileSync(file, JSON.stringify(st)); } catch {} };
const fmt = (sec) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };

/** Seconds done today, the running stopwatch included. */
const done = (k) => st[k] + (st.running === k ? Math.max(0, (Date.now() - st.since) / 1000) : 0);
function status() {
  rollover();
  const c = getCfg();
  return { day: st.day, revision: Math.round(done('revision')), hobby: Math.round(done('hobby')), running: st.running, since: st.since, goal: { revision: c.revision * 60, hobby: c.hobby * 60 }, history: st.history };
}
const emit = () => { const s = status(); for (const fn of listeners) fn(s); };

// midnight: what ran before it counts for yesterday, the rest for today; yesterday goes into a short history
function rollover() {
  const today = dayOf();
  if (st.day === today) return false;
  if (st.running) { const mid = new Date(); mid.setHours(0, 0, 0, 0); st[st.running] += Math.max(0, (mid - st.since) / 1000); st.since = +mid; }
  st.history[st.day] = { revision: Math.round(st.revision), hobby: Math.round(st.hobby) };
  const keep = Object.keys(st.history).sort().slice(-14); st.history = Object.fromEntries(keep.map((d) => [d, st.history[d]]));
  Object.assign(st, { day: today, revision: 0, hobby: 0, reminded: [] });
  save();
  return true;
}

function stop() {
  rollover();
  if (!st.running) return status();
  st[st.running] += Math.max(0, (Date.now() - st.since) / 1000);
  st.running = null; st.since = 0; save(); emit();
  return status();
}
function start(kind) {
  if (!KINDS.includes(kind)) return status();
  if (st.running === kind) return status();
  stop();
  st.running = kind; st.since = Date.now(); save(); emit();
  return status();
}
/** Add (or take away, with a negative number) minutes by hand. */
function add(kind, minutes) {
  if (!KINDS.includes(kind)) return status();
  rollover();
  const m = Math.max(-600, Math.min(600, Number(minutes) || 0));
  st[kind] = Math.max(0, st[kind] + m * 60); save(); emit();
  return status();
}

// the evening nudges: at 5, 7 and 9 pm while revision is short of the goal, at 8 pm while there's been no hobby time
const NUDGES = [{ at: 17, k: 'revision' }, { at: 19, k: 'revision' }, { at: 21, k: 'revision' }, { at: 20, k: 'hobby' }];
function check() {
  if (rollover()) emit();
  const c = getCfg(), h = new Date().getHours();
  if (c.remind) {
    for (const n of NUDGES) {
      const id = `${n.k}@${n.at}`;
      if (h < n.at || st.reminded.includes(id)) continue;
      st.reminded.push(id); save();
      if (h > n.at) continue; // started the app later in the evening: no pile of old nudges
      const goal = c[n.k] * 60, have = done(n.k);
      if (have >= goal || st.running === n.k) continue;
      if (n.k === 'revision') notify('Revision', `${fmt(have)} of ${fmt(goal)} done today: ${fmt(goal - have)} to go. Start the timer in Home (Alt+Space).`);
      else notify('Time for yourself', `At least ${fmt(goal)} of something you enjoy today: ${have ? `${fmt(have)} so far` : 'none yet'}.`);
    }
  }
  if (st.running) { // made the day's goal while the stopwatch runs: say so, once
    const k = st.running, id = `${k}@goal`;
    if (!st.reminded.includes(id) && c[k] > 0 && done(k) >= c[k] * 60) { st.reminded.push(id); save(); notify(k === 'revision' ? 'Revision goal reached' : 'Hobby time done', `${fmt(c[k] * 60)} today. Nice work.`); }
  }
  if (st.running) emit(); // the widget's minutes move on
}

function init(userData, cfg, notifier) {
  file = path.join(userData, 'goals.json');
  if (cfg) getCfg = cfg;
  if (notifier) notify = notifier;
  try { st = { ...fresh(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { st = fresh(); }
  if (!KINDS.includes(st.running)) st.running = null;
  rollover();
  clearInterval(timer); timer = setInterval(check, 60e3); timer.unref?.();
  setTimeout(check, 5000).unref?.();
}

module.exports = { init, status, start, stop, add, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, _dayOf: dayOf };
