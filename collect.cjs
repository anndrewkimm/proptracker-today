'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {empty, observe, grade} = require('./tracking.cjs');
async function json(url) {
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if (!r.ok) throw Error(`Feed status ${r.status}`);
  return r.json();
}
(async()=>{
  const output=process.argv[2];
  if (!output) throw Error('Usage: node collect.cjs archive.json');
  // Existing corrupt archives fail loudly rather than resetting the track record.
  const state=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):empty();
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    if (!['index.html','insights.js','sw.js'].includes(name)) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname,name)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const diagnostics=[];
    page.on('response',response=>{
      if (/espn\.com.*(scoreboard|\/odds(?:\?|$))/.test(response.url())) diagnostics.push((async()=>{
        try {
          const data=await response.json();
          return {url:response.url(),status:response.status(),events:data.events?.map(e=>({id:e.id,tip:e.date,state:e.competitions?.[0]?.status?.type?.state})),
            providers:data.items?.map(i=>({name:i.provider?.name,props:!!i.propBets,ref:i.$ref}))};
        } catch {return {url:response.url(),status:response.status()};}
      })());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?collector=1`);
    await page.waitForFunction(()=>window.__done===true,null,{timeout:240000});
    const input=await page.evaluate(()=>({ok:window.__health.ok, day:S.today, events:window.__slate||[],
      picks:board().map(c=>{
        const p=S.props.find(p=>p.id===c.id && p.stat===c.stat);
        return {id:c.id,event:p.game.id,tip:p.game.tip,name:c.name,stat:c.stat,line:c.line,side:c.side,
          score:c.score,market:c.market,kind:c.kind,loaded:c.loaded,signs:c.signs,over:p.over,under:p.under,
          matchup:c.matchup,formHits:c.formHits,formGames:c.formGames,
          availability:availabilityNotes(c),injuryCheckedAt:S.injuryMeta?.fetchedAt};
      })}));
    if (!input.day || !Array.isArray(input.events)) throw Error('No valid slate');
    const imminent=input.events.some(e=>Date.parse(e.tip)>Date.now() && Date.parse(e.tip)-Date.now()<=90*60000);
    if (imminent && !input.picks.length) {
      input.ok=false;
      console.warn('Upcoming games but no eligible lines returned. Will retry on the next scheduled run; no selections locked.');
    }
    console.log(JSON.stringify({day:input.day,events:input.events.length,picks:input.picks.length,ok:input.ok}));
    if (!input.picks.length) console.log(JSON.stringify(await Promise.all(diagnostics)));
    if (!input.events.length) {
      for (const host of ['site.web.api.espn.com','site.api.espn.com']) {
        try {
          const probe=await json(`https://${host}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${input.day.replaceAll('-','')}`);
          console.log(JSON.stringify({host,events:probe.events?.length,day:probe.day,leagues:probe.leagues?.map(l=>l.season?.year)}));
        } catch(e) {console.log(host+': '+e.message);}
      }
    }
    observe(state,input,new Date().toISOString());
    const summaries=new Map();
    for (const day of Object.values(state.days)) for (const p of day.picks) {
      // Retry recent settled games too, allowing official stat corrections.
      if (Date.parse(p.tip)>Date.now() || (p.result && Date.parse(p.tip)<Date.now()-7*864e5)) continue;
      if (!summaries.has(p.event)) {
        try {summaries.set(p.event,await json('https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(p.event)));}
        catch {summaries.set(p.event,null);}
      }
      const result=grade(p,summaries.get(p.event));
      if (result) Object.assign(p,result,{gradedAt:new Date().toISOString()});
    }
    state.collectionOk=input.ok;
    state.slate={day:input.day,events:input.events.length,picks:input.picks.length};
    fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
    fs.writeFileSync(output+'.tmp',JSON.stringify(state));
    fs.renameSync(output+'.tmp',output);
    console.log(`Archive updated: ${Object.keys(state.days).length} days; complete board: ${input.ok}`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
