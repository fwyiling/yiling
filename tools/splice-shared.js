// Copies clients/shared/perf-core.js into every client that carries it, between
// its "// #region perf-core" and "// #endregion perf-core" lines (or in place
// of a /*PERF_CORE*/ line, the first time). Run after editing the shared file:
//   node tools/splice-shared.js          write the clients
//   node tools/splice-shared.js --check  exit 1 if any client is out of date
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const CORE = fs.readFileSync(path.join(root, 'clients/shared/perf-core.js'), 'utf8').replace(/\s+$/, '') + '\n';
const TARGETS = ['clients/studio-client.user.js', 'clients/syndicate-client.user.js'];
const check = process.argv.includes('--check');
let stale = 0;
for (const rel of TARGETS) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { console.log(rel + ': not here, skipped'); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf('// #region perf-core'), b = src.indexOf('// #endregion perf-core');
  let out;
  if (a >= 0 && b > a) out = src.slice(0, a) + CORE + src.slice(src.indexOf('\n', b) + 1);
  else if (src.includes('/*PERF_CORE*/\n')) out = src.replace('/*PERF_CORE*/\n', () => CORE);
  else { console.log(rel + ': no perf-core markers, skipped'); continue; }
  if (out === src) { console.log(rel + ': up to date'); continue; }
  stale++;
  if (check) console.log(rel + ': OUT OF DATE (run node tools/splice-shared.js)');
  else { fs.writeFileSync(file, out); console.log(rel + ': perf-core copied in'); }
}
if (check && stale) process.exit(1);
