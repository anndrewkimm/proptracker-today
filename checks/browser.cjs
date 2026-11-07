// Real browser checks: fixtures exercise failure paths even when no games are scheduled.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const fixedTime = new Date('2026-11-06T18:00:00Z');
const base = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const athlete = `${base}/athletes/1966`;
const event = {id:'123', date:'2026-11-06T23:00:00Z', competitions:[{
  status:{type:{state:'pre'}}, competitors:[
    {homeAway:'home', team:{id:'1', abbreviation:'ATL'}},
    {homeAway:'away', team:{id:'2', abbreviation:'BOS'}}]}]};
function fixture(url) {
  if (url.includes('/scoreboard')) return {season:{year:2027}, events:[event]};
  if (url.includes('/injuries')) return {injuries:[]};
  if (url.includes('/propBets')) return {items:[-110,-110].map(price => ({
    type:{name:'Total Points'}, athlete:{$ref:athlete},
    current:{target:{value:20.5}}, odds:{american:{value:String(price)}}}))};
  if (url.endsWith('/odds')) return {items:[{provider:{name:'Draft Kings'}, spread:-2, overUnder:220,
    propBets:{$ref:`${base}/events/123/propBets?lang=en`}}]};
  if (url.includes('/gamelog')) return {labels:[], seasonTypes:[]};
  if (url.includes('/athletes/')) return {displayName:'Test Player', team:{$ref:`${base}/teams/1`}};
  throw new Error('Unexpected API request: '+url);
}
async function finished(page) {
  await page.waitForFunction(() => window.__done === true, null, {timeout:180000});
}
async function refresh(page) {
  await page.evaluate(() => load());
  await finished(page);
}
async function fixtureChecks(browser, url, device) {
  const context = await browser.newContext({...devices[device]});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({time:fixedTime});
  let mode = 'healthy', fallbacks = 0;
  await context.route(/espn\.com/, async route => {
    const requestUrl = route.request().url();
    if (requestUrl.includes('a.espncdn')) return route.fulfill({status:404});
    if (mode === 'outage' || (mode === 'primary-down' && requestUrl.includes('site.web.api.espn.com/apis/site/'))
        || (mode === 'injuries-down' && requestUrl.includes('/injuries'))) return route.abort('failed');
    if (requestUrl.includes('site.api.espn.com')) fallbacks++;
    await route.fulfill({json:fixture(requestUrl)});
  });
  await page.goto(url);
  await finished(page);
  assert.equal(await page.evaluate(() => window.__health.ok), true);
  assert.equal(await page.locator('article.card').count(), 1, 'A real pick card must render');
  await page.locator('[data-add]').first().click();
  assert.equal(await page.locator('#mine').isVisible(), true);
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('.detail').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  mode = 'primary-down';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__health.ok), true);
  assert(fallbacks > 0, 'Alternate host must be used');

  mode = 'injuries-down';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__health.ok), false);
  assert.match(await page.locator('#connection').innerText(), /incomplete/);

  mode = 'outage';
  await refresh(page);
  assert.equal(await page.locator('article.card').count(), 1);
  assert.match(await page.locator('#connection').innerText(), /Using saved data/);
  assert.equal(await page.locator('#mine').isVisible(), true, 'My picks survive refresh failure');

  await page.evaluate(() => {
    const s = store.get(SNAPSHOT_KEY); s.time -= 31 * 60000; store.set(SNAPSHOT_KEY,s);
  });
  await refresh(page);
  assert.equal(await page.locator('article.card').count(), 0);
  assert.match(await page.locator('#connection').innerText(), /over 30 minutes old/);

  await page.evaluate(() => { const s=store.get(SNAPSHOT_KEY); s.today='2026-11-05'; store.set(SNAPSHOT_KEY,s); });
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__health.saved), false, 'Yesterday must never be restored');

  mode = 'healthy';
  await refresh(page);
  await page.evaluate(() => {
    const s=store.get(SNAPSHOT_KEY);
    s.games.forEach(g => g.tip=new Date(Date.now()-1000).toISOString());
    store.set(SNAPSHOT_KEY,s);
  });
  mode = 'outage';
  await refresh(page);
  assert.equal(await page.locator('article.card').count(), 0, 'Started games must disappear from saved data');
  mode = 'healthy';
  await refresh(page);
  // Exercise actual cached navigation, not just a mocked offline page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  mode = 'outage';
  await page.reload();
  await finished(page);
  assert.equal(await page.title(), 'PropTracker Today');
  assert.equal(await page.locator('article.card').count(), 1);
  assert.match(await page.locator('#connection').innerText(), /Using saved data/);
  assert.deepEqual(errors, []);
  console.log(`${device}: cards, controls, alternate host, partial failure, saved data, expiry, offline reload PASS`);
  await context.close();
}
async function liveChecks(browser, url) {
  for (const device of ['iPhone 13','Pixel 7']) {
    const context = await browser.newContext({...devices[device]});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto(url, {waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await finished(page);
    const health = await page.evaluate(() => window.__health);
    assert.equal(health?.ok,true,JSON.stringify(health));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    assert.deepEqual(errors,[]);
    // These probes run even after tip-off, when the app has no upcoming games to load.
    await page.evaluate(async () => {
      const score=await get(SITE+'/scoreboard');
      const logs=await get(LOG+'1966/gamelog');
      if (!logs || !Array.isArray(logs.seasonTypes)) throw new Error('Game log format changed');
      const event=score.events[0];
      if (event) {
        const odds=await get(`${CORE}/events/${event.id}/competitions/${event.id}/odds`);
        if (odds && !Array.isArray(odds.items)) throw new Error('Odds format changed');
        const dk=odds?.items?.find(o => o.provider?.name==='Draft Kings');
        if (dk?.propBets) {
          const props=await get(dk.propBets.$ref+'&limit=1000');
          if (!props || !Array.isArray(props.items)) throw new Error('Props unavailable');
          const ref=props.items.find(p=>p.athlete?.$ref)?.athlete.$ref;
          if (ref && !(await get(ref))?.displayName) throw new Error('Player details unavailable');
        }
      }
    });
    console.log(`${device}: live page, scoreboard, injuries, odds, props and game logs PASS`);
    await context.close();
  }
}
(async () => {
  let server;
  const browser = await chromium.launch({headless:true});
  try {
    if (process.argv[2] === '--live') await liveChecks(browser, process.argv[3]);
    else {
      server = http.createServer((req,res) => {
        const file = new URL(req.url,'http://localhost').pathname === '/sw.js' ? 'sw.js' : 'index.html';
        res.writeHead(200, {'Content-Type':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});
        res.end(fs.readFileSync(path.join(root,file)));
      });
      await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${server.address().port}/`;
      for (const device of ['iPhone 13','Pixel 7']) await fixtureChecks(browser,url,device);
    }
  } finally { await browser.close(); if(server) server.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
