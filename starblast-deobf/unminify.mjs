import { webcrack } from 'webcrack';
import { readFileSync, writeFileSync } from 'fs';
const [,, inp, out] = process.argv;
const t = Date.now();
const res = await webcrack(readFileSync(inp, 'utf8'), { unpack: false, deobfuscate: true, unminify: true, mangle: false, jsx: false });
writeFileSync(out, res.code);
console.log('done', out, res.code.length, (Date.now()-t)/1000+'s');
