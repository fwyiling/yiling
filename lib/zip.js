// Minimal ZIP writer (store, no compression) – enough for CBZ and EPUB.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name: string, data: Uint8Array }]  ->  Blob */
export function makeZip(files, mime = 'application/zip') {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);      // store
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(local.buffer, name, f.data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(c.buffer, name);

    offset += 30 + name.length + f.data.length;
  }

  const centralSize = central.reduce((n, b) => n + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end.buffer], { type: mime });
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Build an EPUB book. chapters: [{ title, text }] (paragraphs separated by blank lines). */
export function makeEpubBook(title, chapters) {
  const enc = new TextEncoder();
  const f = (name, str) => ({ name, data: enc.encode(str) });
  const id = 'urn:uuid:' + crypto.randomUUID();
  const xhtml = (t, body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(t)}</title></head><body>${body}</body></html>`;
  const files = chapters.map((c, i) => f(`c${i + 1}.xhtml`,
    xhtml(c.title, `<h2>${esc(c.title)}</h2>\n` + c.text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('\n'))));
  const manifest = chapters.map((_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('');
  const toc = chapters.map((c, i) => `<li><a href="c${i + 1}.xhtml">${esc(c.title)}</a></li>`).join('');
  return makeZip([
    f('mimetype', 'application/epub+zip'), // must be first, stored
    f('META-INF/container.xml',
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
    f('content.opf',
      `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${id}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest><spine>${spine}</spine></package>`),
    f('nav.xhtml',
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc"><h1>${esc(title)}</h1><ol>${toc}</ol></nav></body></html>`),
    ...files,
  ], 'application/epub+zip');
}

export const makeEpub = (title, text) => makeEpubBook(title, [{ title, text }]);
