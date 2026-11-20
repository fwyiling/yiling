const M = require('../../duel-pilot/dev/mock'); const fs = require('fs');
(async () => { const L = await M.launch({ client: process.env.CLIENT, preInit: "try{localStorage.setItem('STUDIO_gov','0')}catch(e){}" + fs.readFileSync(__dirname + '/capture.js', 'utf8'), viewport: { width: 1280, height: 720 }, myType: 605, types: [605, 603, 702, 401], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await L.start(); await L.page.waitForTimeout(3000);
  const S = () => L.page.evaluate(() => ({ allOff: window.__studio.allOff, fx: Object.assign({}, window.__studio.fxOn), panel: document.querySelectorAll('input[data-studio]').length, game: document.querySelectorAll('input[data-game]').length }));
  await L.page.mouse.click(640, 200); // focus the game
  await L.page.keyboard.press('Backslash'); await L.page.waitForTimeout(1800); console.log('after \\\\ :', JSON.stringify(await S()));
  await L.page.screenshot({ path: process.env.OUT1 });
  await L.page.keyboard.press('Backslash'); await L.page.waitForTimeout(500);
  await L.page.keyboard.press('BracketRight'); await L.page.waitForTimeout(500); console.log('after ] :', JSON.stringify(await S()));
  await L.page.keyboard.press('BracketRight'); await L.page.waitForTimeout(500); console.log('after ]]:', JSON.stringify(await S()));
  await L.page.evaluate(() => { const m = document.querySelector('.modal'); if (m) m.style.display = 'none'; }); await L.page.waitForTimeout(1500);
  await L.page.screenshot({ path: process.env.OUT2 }); console.log(JSON.stringify(L.errs())); process.exit(0); })();
