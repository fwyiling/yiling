// shared mock-game launcher: const M = require('./mock'); const { page, ctx, logs } = await M.launch({ client, finish, preInit })
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const D = __dirname + '/';
function status(id, x, y, opts = {}) {
  const b = Buffer.alloc(56);
  b[0] = 0; b[1] = id; b[2] = (opts.alive === false ? 0 : 1) | (opts.up ? 2 : 0) | (3 << 2) | (opts.side > 0 ? 32 : opts.side < 0 ? 64 : 0); b[3] = opts.hue || 40;
  b.writeUInt32LE(opts.time != null ? opts.time : opts.tick || 1000, 4); b.writeUInt32LE(opts.time != null ? Math.round(opts.time * 0.06) : opts.tick || 1000, 8);
  b.writeUInt16LE(opts.angle || 0, 12); b.writeUInt16LE((opts.type || 101) | (opts.glide ? 0x4000 : 0), 14);
  b.writeFloatLE(x, 16); b.writeFloatLE(y, 20); b.writeFloatLE(opts.vx || 0, 24); b.writeFloatLE(opts.vy || 0, 28);
  b.writeFloatLE(opts.r || 0, 32); b.writeFloatLE(0, 36);
  b[40] = opts.stun || 0; b[41] = 100; b.writeUInt16LE(opts.shield ?? 100, 42); b.writeUInt16LE(opts.gen ?? 100, 44);
  b.writeUInt16LE(opts.crystals ?? 0, 46); b.writeUInt32LE(opts.score ?? 0, 48); b.writeUInt32LE(0, 52);
  return b;
}
function radar(entries) {
  const b = Buffer.alloc(2 + entries.length * 8); b[0] = 201; b[1] = entries.length;
  entries.forEach((e, i) => { const o = 2 + i * 8; b[o] = e.id; b.writeInt8(Math.round(e.nx * 127), o + 1); b.writeInt8(Math.round(e.ny * 127), o + 2); b[o + 3] = 1 | ((e.level - 1) << 5); b.writeUInt32LE(((e.model - 1) << 24 | (e.score & 0xFFFFFF)) >>> 0, o + 4); });
  return b;
}
// a server list like simstatus.json: three regions, a mix of modes, sizes and ages
const SIM = ['Europe', 'America', 'Asia'].map((loc, ri) => ({ location: loc, address: `${10 + ri}.0.0.1:3002`, systems: Array.from({ length: 9 - ri * 2 }, (_, i) => ({ name: ['Alpha Centauri', 'Sirius Rim', 'Vega Reach', 'Orion Deep', 'Draco Gate', 'Lyra Drift', 'Cygnus Fold', 'Hydra Spur', 'Pavo Line'][(i + ri * 3) % 9], id: 1000 + ri * 100 + i * 7, mode: ['team', 'survival', 'deathmatch', 'team', 'modding', 'invasion', 'team', 'survival', 'team'][i], players: [38, 12, 27, 3, 19, 8, 44, 0, 22][i] - ri * 2 > 0 ? [38, 12, 27, 3, 19, 8, 44, 0, 22][i] - ri * 2 : 0, open: i % 4 !== 3, time: 300 + i * 911 + ri * 1300 })) }));
const PLAYERS = ['foxie','ADAM','KYLO','CV9','P2W','NENE','TARKIN','TOM','Starblast'];
async function launch(o = {}) {
  const browser = await chromium.launch({ args: o.args || [] });
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1600, height: 900 }, deviceScaleFactor: o.dpr || 1 });
  const client = fs.readFileSync(o.client || process.env.CLIENT || require('path').join(__dirname, '../../clients/syndicate-client.user.js'), 'utf8');
  const game = fs.readFileSync(process.env.GAME || require('path').join(__dirname, '../../index.js'));
  await ctx.route('**/*', route => {
    const r = route.request(), u = r.url();
    if (/^https:\/\/starblast\.io\/?$/.test(u)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: r.resourceType() === 'document' && /synObfRemap/.test(client) ? '<!doctype html><html><head></head><body></body></html>' : game });
    if (/three\.min\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE || (D + 'vendor/three.min.js')) });
    if (/webfontloader\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(D + 'vendor/webfontloader.js') });
    if (/blockadblock|mapGen|atcb|googletagmanager/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (/simstatus\.json/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(SIM) });
    if (/dankdmitron\.dev\/api\/status\//.test(u)) { const id = +(u.match(/status\/(\d+)/) || [0, 1])[1]; const tags = ['[CA]', '|SA|', '{4L}', 'WT', '']; const pl = {}; for (let i = 0; i < 6 + id % 9; i++) pl[i] = { player_name: (tags[(i + id) % 5] ? tags[(i + id) % 5] + ' ' : '') + ['nova', 'vex', 'kai', 'ryu', 'zen', 'ash', 'lux', 'orb', 'pip'][i % 9] }; return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ players: pl }) }); }
    if (/rankings\.json/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ratings: { America: [{ name: 'AAA', official_rating: 2500, id: '1' }], Europe: [{ name: 'BBB', official_rating: 2400, id: '2' }], Asia: [] } }) });
    return route.abort();
  });
  const page = await ctx.newPage();
  const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack||'').split('\n').slice(1,3).join(' ')));
  const st = { up: false, kill: false };
  await page.routeWebSocket(/starblast\.io:3002/, ws => {
    let tick = 1000, timer = null, joined = false, t0 = Date.now();
    ws.onMessage(msg => {
      st.msgs = (st.msgs || 0) + 1; if (typeof msg !== 'string') { st.bin = (st.bin || 0) + 1; if (o.onBin) o.onBin(msg); return; }
      if (!/^[\[{p]/.test(msg)) st.last = msg.slice(0, 40);
      if (/^\d+$/.test(msg)) { if (o.onCtl) o.onCtl(+msg, Date.now()); return; }
      if (msg === 'ping') return ws.send('pong');
      let j; try { j = JSON.parse(msg); } catch (e) { return; }
      if (o.onJson) try { o.onJson(j); } catch (e) {}
      if (o.onJson && j && j.name) o.onJson(j);
      if (j.name === 'ojct:4' && !joined) {
        joined = true;
        ws.send(JSON.stringify({ name: 'welcome', data: { version: 92, seed: 4994, size: 800, systemid: 4242, region: 'Europe', mode: Object.assign({ id: 'survival', map_size: 200, max_level: 7, crystal_capacity: [20, 80, 180, 320, 500, 720, 980, 1280] }, o.mode || {}) } }));
        PLAYERS.forEach((n, i) => ws.send(JSON.stringify({ name: 'player_name', data: { id: i + 1, player_name: n, hue: (i * 40) % 360, friendly: i % 2, custom: o.custom ? o.custom(i) : o.finish ? { badge: 'star', laser: '0', finish: Array.isArray(o.finish) ? o.finish[i % o.finish.length] : o.finish, hue: 200 } : null } })));
      } else if (j.name === 'enter') {
        ws.send(JSON.stringify({ name: 'entered', data: { shipid: 7, team: 0 } }));
      } else if (j.name === 'respawn') {
        const send = () => { tick += 6; const CLK = o.clock ? 100000 + Date.now() - t0 : null; const a = (Date.now() - t0) / 1000;
          const me = o.me ? o.me(a) : null;
          ws.send(status(7, me ? me.x : process.env.NEAR ? -36 : 10, me ? me.y : process.env.NEAR ? 9 : 20, { time: CLK, vx: me ? me.vx : 0, vy: me ? me.vy : 0, r: me && me.r != null ? me.r : 0, gen: me && me.gen != null ? me.gen : 100, tick, crystals: 40, score: 120, alive: !st.kill, up: me && me.up != null ? me.up : st.up || o.thrust, type: o.myType || 101, angle: me && me.steer != null ? Math.round(me.steer) % 360 : 0, side: me && me.side, glide: me && me.glide }));
          PLAYERS.forEach((n, i) => { const q = o.pos ? o.pos(i + 1, a) : null; if (q) return i + 1 !== 7 && ws.send(status(i + 1, q.x, q.y, { tick, vx: q.vx, vy: q.vy, up: q.up !== false, type: q.code || 101, alive: q.alive !== false, angle: q.steer != null ? Math.round(q.steer) : 0, r: q.r || 0, glide: q.glide, side: q.side, stun: q.stun })); }); PLAYERS.forEach((n, i) => i + 1 !== 7 && !(o.pos && o.pos(i + 1, a)) && ws.send(status(i + 1, process.env.NEAR ? -36 + (i - 4) * 4 + Math.sin(a * 1.5 + i) * 2.5 : (i - 4) * 12 + Math.sin(a + i) * 4, process.env.NEAR ? ((i % 2) * 2 - 1) * 3 : (i % 3) * 10 - 10, { tick, hue: i * 28, score: 2000 - i * 200, up: true, r: a + i, type: o.types ? o.types[i % o.types.length] : 101 })));
          ws.send(radar([{ id: 7, nx: 0.02, ny: 0.05, level: 1, model: 1, score: 120 }, ...PLAYERS.map((n, i) => ({ id: i + 1, nx: (i - 4) / 10, ny: ((i % 3) - 1) / 8, level: 1 + (i % 4), model: 1, score: 2400 - i * 280 }))])); };
        send(); timer = setInterval(() => { send(); if (o.frame) o.frame(ws, (Date.now() - t0) / 1000); }, o.period || 100);
      }
    });
    ws.onClose(() => timer && clearInterval(timer));
  });
  await page.addInitScript("try{localStorage.setItem('AEGIS_intro_seen','1');localStorage.setItem('ACW_intro_seen','1');localStorage.setItem('force_server','1.2.3.4:3002')}catch(e){}");
  if (o.preInit) await page.addInitScript(o.preInit);
  await page.addInitScript(client);
  if (o.beforeGoto) await o.beforeGoto(page);
  await page.goto('https://starblast.io/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(o.wait || 9000);
  const start = async () => { await page.evaluate(() => window.activeStarblastGame.start('survival', 'TESTER', false, 36)); await page.waitForTimeout(o.startWait || 10000); };
  const tab = async (t, w) => { await page.evaluate(t => document.querySelector('#aegis .nav-tab[data-tab="' + t + '"]').click(), t); await page.waitForTimeout(w || 2500); };
  return { browser, ctx, page, logs, st, start, tab, errs: () => logs.filter(l => /PAGEERROR/.test(l)) };
}
module.exports = { launch, D };
