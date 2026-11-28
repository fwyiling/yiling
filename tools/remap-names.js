#!/usr/bin/env node
// When Starblast re-obfuscates its game code (same code, its IlO01-style
// names reshuffled), this renames those names in the client to match.
//
//   node tools/remap-names.js <old game index> <new game index> [client files...]
//
// The old game index is the repo's index.js (the copy the client was written
// against); the new one is the page saved from https://starblast.io/. The two
// are aligned identifier by identifier. That only works when nothing but the
// names changed, so it is checked first: the text between identifiers must be
// identical (numbers aside) and each old name must map to one new name; otherwise it stops
// (a real update: the client needs a look by hand). The client files are
// rewritten in one pass (no chains), only names that exist in the old game.
// Then copy the new page over index.js, so the mock runs the new game.
const fs = require("fs");
const [oldF, newF, ...clients] = process.argv.slice(2);
if (!oldF || !newF) { console.error("usage: remap-names.js <old index> <new index> [client files...]"); process.exit(2); }
const a = fs.readFileSync(oldF, "utf8"), b = fs.readFileSync(newF, "utf8");
const ID = /[A-Za-z_$][\w$]*/g, OBF = /^[IlO][IlO01]{4}$/;
// (numbers may change too: the weekly event times, asia_ts and the like)
const NUM = /\d+(\.\d+)?(e[+-]?\d+)?/g, sa = a.replace(ID, ""), sb = b.replace(ID, "");
if (sa.replace(NUM, "#") !== sb.replace(NUM, "#")) { console.error("the code changed beyond the names: not a reshuffle, check the client by hand"); process.exit(1); }
const na = sa.match(NUM) || [], nb = sb.match(NUM) || [], nd = [];
for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) nd.push(na[i] + " -> " + nb[i]);
if (nd.length) console.log(nd.length + " numbers changed: " + nd.slice(0, 10).join(", "));
const ta = a.match(ID), tb = b.match(ID), map = {}, bad = new Set();
if (ta.length !== tb.length) { console.error("identifier counts differ"); process.exit(1); }
const other = {};
for (let i = 0; i < ta.length; i++) {
  const x = ta[i], y = tb[i];
  if (x === y) continue;
  if (OBF.test(x) && OBF.test(y)) { if (map[x] && map[x] !== y) bad.add(x); map[x] = y; }
  else other[x + " -> " + y] = (other[x + " -> " + y] || 0) + 1;
}
if (bad.size) { console.error("names mapped two ways:", [...bad].join(" ")); process.exit(1); }
console.log(Object.keys(map).length + " game names renamed; other changed identifiers (locals, class names):", JSON.stringify(other));
const oldNames = new Set(ta.filter(t => OBF.test(t)));
for (const f of clients) {
  const s = fs.readFileSync(f, "utf8"), used = {};
  const out = s.replace(/\b[IlO][IlO01]{4}\b/g, n => { if (!oldNames.has(n) || !map[n]) return n; used[n] = map[n]; return map[n]; });
  fs.writeFileSync(f, out);
  console.log(f + ": " + Object.keys(used).length + " names: " + Object.entries(used).map(e => e.join("->")).join(" "));
}
