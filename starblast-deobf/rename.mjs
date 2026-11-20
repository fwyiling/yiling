// Applies a {mangled: readable} map as whole-token replacement. The game's
// mangler is dictionary-based (same token everywhere, even inside strings),
// so token replacement mirrors it exactly.
import { readFileSync, writeFileSync } from 'fs';
import { parse } from '@babel/parser';
const [,, inp, mapFile, out] = process.argv;
let code = readFileSync(inp, 'utf8');
const map = JSON.parse(readFileSync(mapFile, 'utf8'));
const ast = parse(code, { tokens: true, errorRecovery: true });
const tokens = new Set(ast.tokens.filter(t => t.type.label === 'name' || t.type.keyword).map(t => t.value));
const targets = new Map();
let bad = 0;
for (const [k, v] of Object.entries(map)) {
  if (!/^[lIO01]+$/.test(k)) { console.error('not a mangled token:', k); bad++; }
  if (tokens.has(v)) { console.error(`collision: ${k} -> ${v} (already used)`); bad++; }
  if (targets.has(v)) { console.error(`duplicate target: ${v} (${targets.get(v)}, ${k})`); bad++; }
  targets.set(v, k);
}
if (bad) process.exit(1);
code = code.replace(/[A-Za-z_$][\w$]*/g, t => Object.hasOwn(map, t) ? map[t] : t);
writeFileSync(out, code);
const left = new Set(code.match(/\b[lIO01]*[lIO][lIO01]*\b/g)?.filter(t => /^[lIO01]{4,}$/.test(t)));
console.log(`renamed ${Object.keys(map).length}, mangled tokens left: ${left.size}`);
