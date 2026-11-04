import { makeZip, makeEpub } from '../lib/zip.js';

const $ = (id) => document.getElementById(id);
const jobId = new URLSearchParams(location.search).get('job');
const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'download';

function save(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

async function fetchImage(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const type = (res.headers.get('content-type') || '').split(';')[0];
      const ext = EXT[type] || (url.split(/[?#]/)[0].split('.').pop().slice(0, 4).toLowerCase() || 'jpg');
      return { data: new Uint8Array(await res.arrayBuffer()), ext };
    } catch (e) { err = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  throw err;
}

async function run() {
  const { [`job_${jobId}`]: job } = await chrome.storage.session.get(`job_${jobId}`);
  if (!job) { $('title').textContent = 'Job not found'; return; }
  $('title').textContent = job.title;
  const name = safe(job.title);

  if (job.mode === 'text') {
    $('status').textContent = 'Building file…';
    if (job.format === 'epub') save(makeEpub(job.title, job.text), name + '.epub');
    else save(new Blob([job.title + '\n\n' + job.text], { type: 'text/plain' }), name + '.txt');
    $('bar').value = 1; $('status').textContent = 'Done.';
    return;
  }

  // Some sites require a matching Referer for image requests.
  const tab = await chrome.tabs.getCurrent();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tab.id],
    addRules: [{
      id: tab.id, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [
        { header: 'Referer', operation: 'set', value: job.url },
        { header: 'Origin', operation: 'set', value: job.origin },
      ] },
      condition: { tabIds: [tab.id], resourceTypes: ['xmlhttprequest'] },
    }],
  });

  const total = job.images.length;
  const results = new Array(total);
  const failed = [];
  let done = 0, next = 0;
  $('bar').max = total;

  async function worker() {
    while (next < total) {
      const i = next++;
      try { results[i] = await fetchImage(job.images[i]); }
      catch (e) { failed.push(i + 1); }
      $('bar').value = ++done;
      $('status').textContent = `${done} / ${total} pages`;
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const pad = String(total).length;
  const files = results
    .map((r, i) => r && { name: `${String(i + 1).padStart(Math.max(pad, 3), '0')}.${r.ext}`, data: r.data })
    .filter(Boolean);
  if (!files.length) { $('status').textContent = 'No pages could be downloaded.'; return; }

  save(makeZip(files, 'application/vnd.comicbook+zip'), name + '.cbz');
  $('status').textContent = `Saved ${files.length}/${total} pages as ${name}.cbz`;
  if (failed.length) $('log').textContent = 'Failed pages: ' + failed.join(', ');
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tab.id] });
  chrome.storage.session.remove(`job_${jobId}`);
}

run().catch((e) => { $('status').textContent = 'Error: ' + e.message; });
