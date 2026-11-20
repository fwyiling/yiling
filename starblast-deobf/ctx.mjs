// usage: node ctx.mjs FILE START COUNT  — context for remaining mangled names (by frequency)
import { readFileSync } from 'fs';
const [,, file, start, count] = process.argv;
const lines = readFileSync(file, 'utf8').split('\n');
const freq = new Map();
lines.forEach((l, i) => { if (l.length > 5000) return; for (const t of l.match(/\b[lIO01]{4,}\b/g) ?? []) if (/[lIO]/.test(t)) freq.set(t, (freq.get(t) ?? 0) + 1); });
const names = [...freq].sort((a, b) => b[1] - a[1]).slice(+start, +start + +count);
const body = i => lines.slice(i + 1, i + 9).filter(l => !/^\s*var \w+;$/.test(l)).slice(0, 4).map(l => '      | ' + l.trim().slice(0, 110));
for (const [n, c] of names) {
  const re = new RegExp(`\\b${n}\\b`);
  const hits = []; lines.forEach((l, i) => { if (l.length < 5000 && re.test(l)) hits.push(i); });
  const defs = hits.filter(i => new RegExp(`(prototype\\.${n} = function|\\b${n} = function|this\\.${n} = |\\b${n}: )`).test(lines[i])).slice(0, 3);
  const uses = hits.filter(i => !defs.includes(i)).filter((_, k, a) => k % Math.max(1, Math.floor(a.length / 3)) === 0).slice(0, 3);
  console.log(`## ${n} (${c})`);
  for (const i of defs) { console.log(`  ${i + 1}: ${lines[i].trim().slice(0, 130)}`); if (/function/.test(lines[i])) console.log(body(i).join('\n')); }
  for (const i of uses) console.log(`  ${i + 1}: ${lines[i].trim().slice(0, 130)}`);
}
