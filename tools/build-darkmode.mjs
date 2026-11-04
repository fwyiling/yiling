// Builds content/darkmode.js (Dark Reader engine) + content/darkmode-proxy.js.
// Dark Reader normally injects an inline <script> into the page; Chrome blocks that from
// extensions, so the same proxy runs as a registered MAIN-world script and the bundle
// signals it with an event instead.
import { build } from 'esbuild';
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
await build({ entryPoints: [root + 'content/src/darkmode.js'], bundle: true, format: 'iife', target: 'chrome110', outfile: root + 'content/darkmode.js', nodePaths: [root + 'tools/node_modules'], logLevel: 'warning' });
let out = fs.readFileSync(root + 'content/darkmode.js', 'utf8');
const block = /const proxyScript = createOrUpdateScript\("darkreader--proxy"\);[\s\S]*?proxyScript\.remove\(\);/;
if (!block.test(out)) throw new Error('Dark Reader proxy block not found – check after upgrading darkreader');
out = out.replace(block, 'document.dispatchEvent(new CustomEvent("shield-dr-proxy", { detail: `${enableStyleSheetsProxy},${enableCustomElementRegistryProxy}` }));');
fs.writeFileSync(root + 'content/darkmode.js', out);
// extract injectProxy() from the library source
const src = fs.readFileSync(root + 'tools/node_modules/darkreader/darkreader.js', 'utf8');
const start = src.indexOf('function injectProxy(');
let depth = 0, i = src.indexOf('{', src.indexOf(')', start)), end = -1;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
const fn = src.slice(start, end);
fs.writeFileSync(root + 'content/darkmode-proxy.js', `// Dark Reader's page proxy (MIT, darkreader/darkreader), run in the page context on request.
(() => {
  ${fn}
  document.addEventListener('shield-dr-proxy', (e) => {
    const [a, b] = String(e.detail || 'true,true').split(',').map((x) => x === 'true');
    injectProxy(a, b);
  });
})();
`);
console.log('built darkmode.js + darkmode-proxy.js');
