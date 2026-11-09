// Starting a long PowerShell helper: Windows caps a command line at 32,767 characters, and a script passed with
// -EncodedCommand doubles in size (UTF-16, then base64), so the bigger helpers run from a file in the temp folder
// instead: written once per version (named by its content), with a BOM so Windows PowerShell reads it as UTF-8.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function psArgs(script, name) {
  const hash = crypto.createHash('sha256').update(script).digest('hex').slice(0, 12);
  const file = path.join(os.tmpdir(), `syndicates-${name}-${hash}.ps1`);
  try { if (!fs.existsSync(file)) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, '﻿' + script, 'utf8'); fs.renameSync(tmp, file); } }
  catch { /* written by another copy at the same moment: it's the same script */ }
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file];
}
module.exports = { psArgs };
