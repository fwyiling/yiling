// The app's icon: the starblast.io logo, as the game's own page publishes it.
// The page links a web app manifest (https://starblast.io/manifest.json); its
// largest PNG icon is used, else the page's favicon (static/img/icon64.png).
//   node tools/make-icon.mjs <out.png>
// then: npx tauri icon <out.png> --fit contain   (writes src-tauri/icons/)
import { writeFileSync } from "node:fs";

const MANIFEST = process.env.SB_MANIFEST || "https://starblast.io/manifest.json";
const FAVICON = process.env.SB_FAVICON || "https://starblast.io/static/img/icon64.png";
const out = process.argv[2] || "app-icon.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function get(url, kind) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (app icon build)" } });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return kind === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
}
// "192x192 512x512" -> 512
function side(s) { return Math.max(0, ...String(s || "").split(/\s+/).map(v => parseInt(v, 10) || 0)); }

const tried = [];
let candidates = [];
try {
  const m = await get(MANIFEST, "json");
  candidates = (m.icons || [])
    .filter(i => i && i.src && (!i.type || /png/i.test(i.type)) && !/\.(svg|ico|webp)(\?|$)/i.test(i.src))
    .sort((a, b) => side(b.sizes) - side(a.sizes))
    .map(i => new URL(i.src, MANIFEST).href);
} catch (e) { tried.push("manifest: " + e.message); }
candidates.push(FAVICON);

for (const url of candidates) {
  try {
    const buf = await get(url);
    if (!buf.subarray(0, 8).equals(PNG)) { tried.push(url + ": not a PNG"); continue; }
    writeFileSync(out, buf);
    console.log("app icon: " + url + " (" + buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20) + ") -> " + out);
    process.exit(0);
  } catch (e) { tried.push(e.message); }
}
console.error("no starblast.io icon could be fetched:\n  " + tried.join("\n  "));
process.exit(1);
