// usage: node runtest.js <game.js or "original"> <screenshot.png>
const { chromium } = require('playwright');
const fs = require('fs');
const [,, gamePath, shot] = process.argv;
(async () => {
  const html = fs.readFileSync(process.env.ORIG_HTML || __dirname + '/work/index.html', 'utf8').replace(/ integrity="[^"]*"/g, '');
  const marker = '(function(s,t,a,r,b,l,i,o){';
  const start = html.indexOf(marker), end = html.indexOf('</script>', start);
  let game_src = gamePath === 'original' ? html.slice(start, end) : fs.readFileSync(gamePath, 'utf8');
  if (process.env.HOOK) { const [a, b] = process.env.HOOK.split('|'); game_src = game_src.replace(a, a + b); }
  const page_html = false ? html
    : html.slice(0, start) + game_src.replace(/<\/script/gi, '<\\/script') + html.slice(end);
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  const cdn = {
    'three.js/85/three.min.js': 'three-r85/build/three.min.js',
    'webfont/1.6.27/webfontloader.js': 'webfontloader/webfontloader.js',
    'blockadblock/3.2.1/blockadblock.min.js': 'blockadblock/blockadblock.js',
  };
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/**', r => {
    const key = r.request().url().split('/ajax/libs/')[1];
    if (!cdn[key]) return r.abort();
    r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(__dirname + '/node_modules/' + cdn[key]) });
  });
  await page.route('https://starblast.io/', r => r.fulfill({ status: 200, contentType: 'text/html', body: page_html }));
  await page.goto('https://starblast.io/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(12000);
  const info = await page.evaluate((expr) => ({ canvases: document.querySelectorAll('canvas').length, title: document.title, probe: expr ? (() => { try { return eval(expr); } catch (e) { return 'ERR ' + e.message; } })() : undefined }), process.env.PROBE || '');
  await page.screenshot({ path: shot });
  console.log(JSON.stringify(info));
  console.log(errors.length ? errors.slice(0, 15).join('\n') : 'no errors');
  await browser.close();
})();
