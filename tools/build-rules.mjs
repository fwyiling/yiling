// Converts EasyList / EasyPrivacy network filters into DNR static rulesets.
// Usage: node build-rules.mjs <path-to-easylist-repo-clone>
import fs from 'node:fs';
import path from 'node:path';
import { convertWithAdguard } from '@ghostery/urlfilter2dnr';

const src = process.argv[2];
if (!src) { console.error('usage: node build-rules.mjs <easylist clone>'); process.exit(1); }
const out = path.resolve('..', 'rules');

const SETS = {
  easylist: ['easylist/easylist_general_block.txt', 'easylist/easylist_thirdparty.txt',
             'easylist/easylist_adservers.txt', 'easylist/easylist_specific_block.txt',
             'easylist/easylist_allowlist.txt'],
  easyprivacy: ['easyprivacy/easyprivacy_general.txt', 'easyprivacy/easyprivacy_thirdparty.txt',
                'easyprivacy/easyprivacy_trackingservers.txt', 'easyprivacy/easyprivacy_specific.txt',
                'easyprivacy/easyprivacy_allowlist.txt'],
};
const MAX_RULES = 100000; // Chrome enables >30k static rules only if the browser-wide pool has room (checked at runtime)
const MAX_REGEX = 500;    // Chrome allows 1000 regex rules total

for (const [name, files] of Object.entries(SETS)) {
  const lines = files.flatMap((f) => {
    const p = path.join(src, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n') : [];
  }).filter((l) => l && !l.startsWith('!') && !l.startsWith('[') && !/##|#@#|#\?#|#\$#/.test(l));

  const { rules, errors, limitations } = await convertWithAdguard(lines);
  let regex = 0;
  const kept = [];
  for (const r of rules) {
    if (r.condition?.regexFilter && ++regex > MAX_REGEX) continue;
    if (r.action?.type === 'redirect') continue; // needs web_accessible_resources
    if (kept.length >= MAX_RULES) break;
    kept.push({ ...r, id: kept.length + 1 });
  }
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(kept));
  console.log(`${name}: ${lines.length} filters -> ${rules.length} rules, kept ${kept.length} (${regex} regex), ${errors.length} errors, ${limitations.length} limitations`);
}
