// Real browser checks: fixtures exercise failure paths even when no games are scheduled.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const cors = {'access-control-allow-origin':'*'};
fs.mkdirSync(path.join(root,'../.phone-tools'),{recursive:true});
const fixedTime = new Date('2026-11-06T18:00:00Z');
const base = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const athlete = `${base}/athletes/1966`;
const event = {id:'123', date:'2026-11-06T23:00:00Z', competitions:[{
  status:{type:{state:'pre'}}, competitors:[
    {homeAway:'home', team:{id:'1', abbreviation:'ATL'}},
    {homeAway:'away', team:{id:'2', abbreviation:'BOS'}}]}]};
// Like ESPN in the morning: the undated scoreboard still lists last night's finished games, and the dated one
// has today's. slate 'tomorrow' = every game today has started, so the page must show tomorrow's.
const finishedEvent = {...event, id:'99', competitions:[{...event.competitions[0], status:{type:{state:'post'}}}]};
const tomorrowEvent = {...event, date:'2026-11-07T23:00:00Z'};
let slate = 'today';
let providerName = 'Draft Kings';
let propLine = 20.5;
let injuryPayloadOverride = null;
function fixture(url) {
  if (url.includes('/scoreboard')) {
    if (url.includes('dates=20261106')) return {leagues:[{season:{year:2027}}], events:[slate === 'today' ? event : finishedEvent]};
    if (url.includes('dates=20261107')) return {leagues:[{season:{year:2027}}], events:[tomorrowEvent]};
    return {season:{year:2027}, events:[finishedEvent]};
  }
  if (url.includes('/injuries')) return injuryPayloadOverride || {timestamp:fixedTime.toISOString(), injuries:[
    {id:1,injuries:[
      {athlete:{displayName:'Questionable Teammate'},status:'Questionable'},
      {athlete:{displayName:'Another Teammate'},status:'Doubtful'},
      {athlete:{displayName:'Quinten Post'},status:'Out'},
      {athlete:{displayName:'Zach Edey'},status:'Out',date:'2026-11-05T23:16Z',
        longComment:'With Zach Edey out, Test Player will likely get the starting nod.'}]},
    {id:'2',injuries:[{athlete:{displayName:'Opponent Center'},status:'Out'}]}]};
  if (url.includes('/propBets')) return {items:['Total Points', 'Total Rebounds', 'Total Assists',
    'Total 3-Point Field Goals', 'Total Steals', 'Total Blocks',
    'Total Points, Rebounds, and Assists', 'Total Points and Rebounds',
    'Total Points and Assists', 'Total Assists and Rebounds'].flatMap(name => [-110,-110].map(price => ({
    type:{name}, athlete:{$ref:athlete},
    current:{target:{value:name === 'Total Points' ? propLine : 20.5}}, odds:{american:{value:String(price)}}}))) };
  if (url.endsWith('/odds')) return {items:[{provider:{name:providerName}, spread:-2, overUnder:220,
    propBets:{$ref:`${base}/events/123/propBets?lang=en`}}]};
  // No games last season (a rookie): ESPN sends only its filters.
  if (url.includes('/gamelog?season=')) return {filters:[{name:'league', value:'nba', options:[]}]};
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
async function checkPhoneLayout(page, view) {
  const original = page.viewportSize();
  for (const width of [320, 375, 390, 412, 430]) {
    await page.setViewportSize({width, height:original.height});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.visualViewport.width,
      main: document.querySelector('main').getBoundingClientRect().width,
      clippedStats: [...document.querySelectorAll('.chips button')].filter(b => {
        const r=b.getBoundingClientRect(), row=b.parentElement.getBoundingClientRect();
        return r.width && row.height && (r.left < row.left - 1 || r.right > row.right + 1);
      }).map(b => b.textContent),
    }));
    assert(layout.document <= width + 1, `${view} at ${width}px overflows: ${JSON.stringify(layout)}`);
    assert(Math.abs(layout.viewport - width) <= 1, `${view} must not zoom out to fit`);
    assert(layout.main <= width - 28 + 1, `${view} must retain phone gutters`);
    assert.deepEqual(layout.clippedStats, [], `${view}: all stat/filter choices must fit without sideways scrolling`);
  }
  await page.setViewportSize(original);
}
async function fixtureChecks(browser, url, device) {
  const context = await browser.newContext({...devices[device],
    ...(process.env.PHONE_BROWSER === 'webkit' ? {serviceWorkers:'block'} : {})});
  const page = await context.newPage();
  if (process.env.PHONE_DEBUG) page.on('requestfailed', r => console.log(r.url(), r.failure()));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({time:fixedTime});
  await context.addInitScript(({time}) => localStorage.setItem('pt.ath.1966', JSON.stringify({
    t:time-864e5,name:'Test Player',team:'2'})), {time:fixedTime.getTime()});
  let mode = 'healthy', fallbacks = 0;
  await context.route('https://api.github.com/**',route=>route.fulfill({headers:cors,json:{object:{sha:'a'.repeat(40)}}}));
  await context.route('https://raw.githubusercontent.com/**', route => route.fulfill({headers:cors,json:{
    version:1,updatedAt:fixedTime.toISOString(),collectionOk:true,
    days:{'2026-11-05':{status:'locked',at:'2026-11-05T22:00:00Z',model:'test-v1',source:'DraftKings via ESPN',picks:[
      {rank:1,id:'1966',name:'Archived Player',stat:'points',side:'less',line:20.5,score:.6,market:.52,result:'hit',actual:19,signs:['Less']}]}},
    movement:{...Object.fromEntries([1,2,3].map(d=>[`old${d}|1966|points`,[{name:'Test Player',stat:'points',line:24.5,over:-110,under:-110,
        at:`2026-11-0${d}T21:00:00Z`,tip:`2026-11-0${d}T23:00:00Z`}]])),
      test:[{name:'Test Player',stat:'points',line:20.5,over:-110,under:-110,at:'2026-11-05T21:00:00Z'},
      {name:'Test Player',stat:'points',line:21.5,over:-115,under:-105,at:'2026-11-05T22:00:00Z'}]}
  }}));
  await context.route(/espn\.com/, async route => {
    const requestUrl = route.request().url();
    if (requestUrl.includes('a.espncdn')) return route.fulfill({status:404});
    if (mode === 'outage' || (mode === 'primary-down' && requestUrl.includes('site.web.api.espn.com/apis/site/'))
        || (mode === 'injuries-down' && requestUrl.includes('/injuries'))) return route.abort('failed');
    if (requestUrl.includes('site.api.espn.com')) fallbacks++;
    await route.fulfill({headers:cors,json:fixture(requestUrl)});
  });
  await page.goto(url);
  await finished(page);
  assert.equal(await page.evaluate(() => window.__health.ok), true, JSON.stringify(await page.evaluate(() => window.__health)));
  assert.equal(await page.locator('article.card').count(), 1, 'A real pick card must render');
  const availability = await page.locator('article.card .availability').innerText();
  for (const text of ['Zach Edey (Out)', 'Quinten Post (Out)', 'Questionable Teammate (Questionable)',
    'Opponent Center (Out)', 'will likely get the starting nod', 'starting lineup unverified', 'does not explicitly adjust'])
    assert(availability.includes(text), `Injury context must be visible without opening Stats: ${text}`);
  assert.equal(await page.locator('.detail').count(),0);
  await page.screenshot({path:path.join(root,'../.phone-tools/today-'+device.replaceAll(' ','-')+'.png'),fullPage:true});
  const checks = await page.evaluate(() => {
    const original=S.injuries;
    const p=S.props[0];
    S.injuries={'TEST PLAYER':{status:'Out',team:'1'}};
    const excludedByName=candidate(p)===null;
    S.injuries={'Different spelling':{id:p.id,status:'Out',team:'1'}};
    const excludedById=candidate(p)===null;
    S.injuries=original;
    const meta=S.injuryMeta;
    S.injuryMeta={...meta,sourceTime:Date.now()-31*60000};
    const staleHidden=board().length===0;
    S.injuryMeta=meta;
    return {excludedByName,excludedById,staleHidden};
  });
  assert.deepEqual(checks,{excludedByName:true,excludedById:true,staleHidden:true});
  await checkPhoneLayout(page, 'Today');
  await page.getByText('Filters and games', {exact:true}).click();
  await checkPhoneLayout(page, 'Expanded filters');
  await page.getByText('Filters and games', {exact:true}).click();
  await page.getByRole('button',{name:'Daily record',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('record-summary')?.textContent.includes('1/1'));
  assert.match(await page.locator('#record-summary').textContent(), /market baseline 52.0%/);
  assert.equal(await page.locator('.result-card').count(),1);
  assert.equal(await page.locator('.result-card .photo').count(),1,'Portrait falls back to initials if image is unavailable');
  assert.equal(await page.locator('#list').isVisible(),false);
  await checkPhoneLayout(page, 'Daily record');
  await page.screenshot({path:path.join(root,'../.phone-tools/record-'+device.replaceAll(' ','-')+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Ask',exact:true}).first().click();
  await page.locator('#ask-question').fill('What about Test Player with Edey out?');
  await page.locator('#ask-form button').click();
  assert.match(await page.locator('#ask-answer').innerText(), /Zach Edey \(Out\)/);
  await page.locator('#ask-question').fill('How have the top 5 performed?');
  await page.locator('#ask-form button').click();
  assert.match(await page.locator('#ask-answer').innerText(), /Quick facts.*[\s\S]*1\/1/);
  await page.locator('#ask-question').fill('How did Archived Player do?');
  await page.locator('#ask-form button').click();
  assert.match(await page.locator('#ask-answer').innerText(), /Result: hit; actual 19/);
  await checkPhoneLayout(page, 'Ask answer');
  await page.getByText('Optional on-device AI',{exact:true}).click();
  await page.evaluate(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  await page.locator('#load-ai').click();
  assert.match(await page.locator('#ai-status').innerText(), /does not support WebGPU/);
  await page.getByRole('button',{name:'Today picks',exact:true}).click();
  propLine=18.5;
  await refresh(page);
  assert.match(await page.locator('article.card .movement-strip summary').innerText(),/↓ 20.5 → 18.5 · −2 points/);
  const onlyMoved = on => page.evaluate(v => { const b=$('moved'); b.checked=v; b.onchange(); }, on);
  await onlyMoved(true);
  assert.equal(await page.locator('article.card').count(),1,'Only moved lines keeps a net mover');
  await onlyMoved(false);
  await page.locator('article.card .movement-strip summary').click();
  assert.match(await page.locator('article.card .movement-strip').innerText(),/At the new line the price is close to even: Over 18.5 is about 50%/);
  assert.match(await page.locator('article.card .movement-strip').innerText(),/not a confirmed cause/);
  assert.match(await page.locator('article.card .tags').innerText(),/Low line · usual 24.5/,'Line well under his usual is labeled');
  assert.match(await page.locator('article.card .movement-strip').innerText(),/6 below his usual 24.5/);
  await checkPhoneLayout(page, 'Expanded movement');
  await page.getByRole('button',{name:'Line moves',exact:true}).click();
  assert.equal(await page.locator('.move-card').count(),1);
  await checkPhoneLayout(page, 'Line moves');
  assert.match(await page.locator('.move-number').innerText(),/20.5 → 18.5/);
  await page.screenshot({path:path.join(root,'../.phone-tools/movement-'+device.replaceAll(' ','-')+'.png'),fullPage:true});
  propLine=20.5;
  await refresh(page);
  assert.equal(await page.locator('.move-card').count(),0,'A line back at its first number is not a current move');
  assert.match(await page.locator('#line-history').innerText(),/came back/);
  await page.locator('#move-returned').check();
  assert.match(await page.locator('.move-number').innerText(),/20.5 → 20.5/,'History of a returned line stays reachable');
  await page.locator('#move-returned').uncheck();
  assert.equal(await page.evaluate(()=>Object.values(store.get('pt.line.observations.v1')).find(h=>h[0].name==='Test Player'&&h[0].tip).length),3,'Observations stay stored');
  await page.getByRole('button',{name:'Today picks',exact:true}).click();
  assert.equal(await page.locator('article.card .movement-strip').count(),0,'No badge once the line is back');
  await onlyMoved(true);
  assert.equal(await page.locator('article.card').count(),0);
  assert.match(await page.locator('#list').innerText(),/No lines have moved/);
  await onlyMoved(false);
  assert.equal(await page.locator('article.card').count(),1);
  const rotation = await page.evaluate(() => rotationEvidence({log:[
    {d:'2026-11-04', m:28, cur:true}, {d:'2026-11-03', m:36, cur:true},
    {d:S.today, m:99, cur:true}, {d:'2025-12-01', m:99, cur:false}
  ]}).join(' '));
  assert.match(rotation, /median 32/);
  assert.match(rotation, /2 recent appearances/);
  assert.doesNotMatch(rotation, /99/);
  assert.match(rotation, /do not change the displayed probability/);
  await page.locator('[data-add]').first().click();
  assert.equal(await page.locator('#mine').isVisible(), true);
  await page.evaluate(() => {
    S.logs['1966']=Array.from({length:10},(_,i)=>({d:`2026-10-${String(30-i).padStart(2,'0')}`,
      p:20+i,r:10,a:5,tm:3,s:1,b:2,m:30,fa:15,ta:6,cur:true,o:'BOS',h:true}));
    draw();
  });
  await page.locator('[data-open]').first().click();
  assert.equal(await page.locator('.detail').count(), 1);
  assert.equal(await page.locator('.chart .col').count(), 10, 'Expanded stats must test populated game charts');
  await checkPhoneLayout(page, 'My picks and expanded stats');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.evaluate(() => window.__S.seasonYear), 2027, 'Season year from the dated scoreboard');
  providerName='DraftKings';
  await refresh(page);
  assert.equal(await page.locator('article.card').count(),1,'Cloud ESPN uses DraftKings without a space');
  providerName='Draft Kings';

  slate = 'tomorrow';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__S.today), '2026-11-07', "After today's games start, show tomorrow");
  assert.equal(await page.locator('article.card').count(), 1, "Tomorrow's lines must render");
  slate = 'today';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__S.today), '2026-11-06');

  mode = 'primary-down';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__health.ok), true);
  assert(fallbacks > 0, 'Alternate host must be used');

  mode = 'injuries-down';
  await refresh(page);
  assert.equal(await page.evaluate(() => window.__health.ok), false);
  assert.match(await page.locator('#connection').innerText(), /Using saved data/);
  assert.match(await page.locator('article.card .availability').innerText(), /Zach Edey \(Out\)/);
  mode = 'healthy';
  for (const payload of [{timestamp:fixedTime.toISOString(),injuries:[{id:'1'}]},
    {timestamp:'2026-11-06T16:00:00Z',injuries:[]}]) {
    injuryPayloadOverride=payload;
    await refresh(page);
    assert.equal(await page.evaluate(() => window.__health.ok),false);
    assert.match(await page.locator('article.card .availability').innerText(), /Zach Edey \(Out\)/);
  }
  injuryPayloadOverride=null;

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
  await page.evaluate(() => localStorage.removeItem(SNAPSHOT_KEY));
  mode='injuries-down';
  await refresh(page);
  assert.equal(await page.locator('article.card').count(),0,'Never recommend with unavailable injury data and no verified snapshot');
  assert.match(await page.locator('#connection').innerText(),/Picks are withheld/);
  mode='healthy';
  await refresh(page);
  // Exercise actual cached navigation, not just a mocked offline page.
  if (process.env.PHONE_BROWSER === 'webkit') {
    assert.deepEqual(errors, []);
    console.log(`${device}: WebKit layout and data regression checks PASS (offline navigation tested in Chromium)`);
    await context.close();
    return;
  }
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
    await checkPhoneLayout(page, 'Live Today');
    assert.deepEqual(errors,[]);
    // These probes run even after tip-off, when the app has no upcoming games to load.
    await page.evaluate(async () => {
      const score=await get(SITE+'/scoreboard?dates='+S.today.replaceAll('-',''));
      let lined = false;  // a game still to come that has DraftKings player lines on ESPN
      for (const e of score.events.filter(e => e.competitions[0].status.type.state==='pre')) {
        const odds=await get(`${CORE}/events/${e.id}/competitions/${e.id}/odds`);
        const dk=odds?.items?.find(isDraftKings);
        if (dk?.propBets && (await get(dk.propBets.$ref+'&limit=5'))?.items?.length) { lined = true; break; }
      }
      if (lined && !S.props.length) throw new Error('ESPN has player lines for '+S.today+' but the page shows none');
      const logs=await get(LOG+'1966/gamelog');
      if (!logs || !Array.isArray(logs.seasonTypes)) throw new Error('Game log format changed');
      const event=score.events[0];
      if (event) {
        const odds=await get(`${CORE}/events/${event.id}/competitions/${event.id}/odds`);
        if (odds && !Array.isArray(odds.items)) throw new Error('Odds format changed');
        const dk=odds?.items?.find(isDraftKings);
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
  const browser = await (process.env.PHONE_BROWSER === 'webkit' ? webkit : chromium).launch({headless:true});
  try {
    if (process.argv[2] === '--live') await liveChecks(browser, process.argv[3]);
    else {
      server = http.createServer((req,res) => {
        const pathname = new URL(req.url,'http://localhost').pathname;
        const file = pathname === '/sw.js' ? 'sw.js' : pathname === '/insights.js' ? 'insights.js' : 'index.html';
        res.writeHead(200, {'Content-Type':file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});
        res.end(fs.readFileSync(path.join(root,file)));
      });
      await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${server.address().port}/`;
      for (const device of ['iPhone 13','Pixel 7']) await fixtureChecks(browser,url,device);
    }
  } finally { await browser.close(); if(server) server.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
