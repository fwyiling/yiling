// Merge plain "||domain^" block rules into a few rules with long requestDomains lists.
// Same matching (a domain and its subdomains, any scheme), far fewer rules: EasyList drops from
// ~48k to ~3k rules, so it fits Chrome's guaranteed 30k static rules and can be enabled at install.
// Usage: node compact-rules.mjs ../rules/easylist.json [...more.json]   (rewrites the files in place)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHUNK = 5000;
const DOMAIN = /^\|\|([a-z0-9-]+(?:\.[a-z0-9-]+)+)\^$/;
const MERGEABLE_KEYS = new Set(['urlFilter', 'domainType', 'resourceTypes']);

export function compact(rules) {
  const groups = new Map(), rest = [];
  for (const r of rules) {
    const c = r.condition || {};
    const m = r.action?.type === 'block' && Object.keys(c).every((k) => MERGEABLE_KEYS.has(k)) && DOMAIN.exec((c.urlFilter || '').toLowerCase());
    if (!m) { rest.push(r); continue; }
    const key = JSON.stringify([r.priority || 1, c.domainType || null, (c.resourceTypes || []).slice().sort()]);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(m[1]);
  }
  const merged = [];
  for (const [key, set] of groups) {
    const [priority, domainType, resourceTypes] = JSON.parse(key);
    const domains = [...set].sort();
    for (let i = 0; i < domains.length; i += CHUNK) {
      const condition = { requestDomains: domains.slice(i, i + CHUNK) };
      if (domainType) condition.domainType = domainType;
      if (resourceTypes.length) condition.resourceTypes = resourceTypes;
      merged.push({ priority, action: { type: 'block' }, condition });
    }
  }
  return [...merged, ...rest].map((r, i) => ({ ...r, id: i + 1 }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const f of process.argv.slice(2)) {
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    const after = compact(before);
    fs.writeFileSync(f, JSON.stringify(after));
    console.log(`${f}: ${before.length} -> ${after.length} rules`);
  }
}
