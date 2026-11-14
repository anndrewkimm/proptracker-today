 'use strict';
if (!new URLSearchParams(location.search).has('collector')) (() => {
  const archiveURL='https://raw.githubusercontent.com/anndrewkimm/proptracker-today/tracker-data/archive.json';
  let archive=store.get('pt.public.archive.v1'), engine=null;
  const style=document.createElement('style'); style.textContent=`
    #board-area{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
    #board-area[hidden]{display:none}
    .tracking-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:12px 0 18px}
    .tracking-nav button{padding:10px 5px;font-size:13px}.tracking-nav .on{background:var(--accent);color:white}
    .tracking-title{font-size:24px;letter-spacing:-.6px;margin:8px 0}.record-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .record-controls label{font-size:12px;color:var(--muted)}.record-controls select{margin-top:5px}
    .record-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}
    .record-metric{padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
    .record-metric b{display:block;font-size:28px;letter-spacing:-1px}.record-metric span{font-size:12px;color:var(--muted)}
    .record-grid,.movement-grid{display:grid;gap:12px;margin-top:14px}.result-card,.move-card{border:1px solid var(--line);border-radius:18px;padding:16px;background:var(--panel)}
    .result-head{display:flex;align-items:center;gap:12px}.result-head .photo{width:50px;height:50px;flex-shrink:0}
    .result-bottom{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;margin-top:14px;gap:8px}
    .result-badge{border-radius:9px;padding:5px 10px;background:var(--soft);font-weight:650;font-size:13px}
    .result-badge.hit{color:var(--good);background:var(--good-soft)}.result-badge.miss{color:var(--bad);background:var(--bad-soft)}
    .movement-strip{padding:10px 12px;background:var(--accent-soft);border-radius:12px;margin:10px 0;font-size:13px;color:var(--accent)}
    .clues{margin:6px 0;padding-left:18px;display:grid;gap:6px;line-height:1.45}
    .movement-strip summary{font-weight:650}.movement-strip p{color:var(--fg);line-height:1.5}
    .move-number{font-size:29px;letter-spacing:-1px;font-weight:700;margin:12px 0 4px}.move-number small{font-size:13px;letter-spacing:0;color:var(--accent)}
    .spark{width:100%;height:76px;display:block;margin:10px 0;color:var(--accent)}
    .timeline{border-left:2px solid var(--accent-soft);padding-left:12px;display:grid;gap:10px;margin:12px 0;font-size:12px}
    .timeline b{font-size:15px}.record-stars{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.record-stars div{border-radius:12px;background:var(--soft);padding:10px}
    .question-chips{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}#ask-answer{background:var(--soft);border-radius:16px;padding:16px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
    #ask-answer:empty{display:none}#ask-form{display:flex;gap:8px}#ask-question{min-width:0}
    @media(min-width:760px){.record-grid,.movement-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.record-metrics{grid-template-columns:repeat(4,1fr)}}
  `;document.head.append(style);
  const main=document.querySelector('main');
  const boardArea=document.createElement('div');boardArea.id='board-area';
  const start=document.getElementById('mine'), end=document.getElementById('more');
  main.insertBefore(boardArea,start);
  let item=start;
  while(item){const next=item.nextSibling;boardArea.append(item);if(item===end)break;item=next;}
  const nav=document.createElement('nav'); nav.className='tracking-nav';nav.setAttribute('aria-label','Today views');
  nav.innerHTML=['Today picks','Daily record','Line moves','Ask'].map((v,i)=>`<button type="button" data-view="${i}" aria-pressed="${i===0}" class="${i===0?'on':''}">${v}</button>`).join('');
  main.insertBefore(nav,boardArea);
  const panel=document.createElement('section');panel.hidden=true;main.insertBefore(panel,boardArea);
  panel.innerHTML=`<p id="archive-status" class="sub" role="status">Loading shared record…</p>
    <div id="daily-view"><h2 class="tracking-title">Your daily shortlist, graded</h2><p class="sub">The same saved picks on your phone and desktop.</p>
    <div class="record-controls"><label>Daily top X<select id="record-x" aria-label="Number of daily picks">${[1,3,5,10,15,20].map(x=>`<option ${x===5?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Period<select id="record-period"><option value="all">All recorded days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label></div>
    <div id="record-metrics" class="record-metrics"></div><div id="record-stars" class="record-stars"></div>
    <details><summary>Accuracy details</summary><p id="record-summary" class="sub"></p></details>
    <label class="sub" for="record-day">Game day</label><select id="record-day"></select><div id="record-days"></div>
    <details style="margin-top:20px"><summary>How daily tracking works</summary><p class="sub">Standard DraftKings lines, most stars then chance, one pick per player, up to 20. Selections lock on the first complete collection in the 90 minutes before the first tip-off. Changing top X only changes the results you view. Missed collections are labeled; historical picks are never invented. These are not verified PrizePicks offers or profit results.</p></details></div>
    <div id="moves-view" hidden><h2 class="tracking-title">Follow the line</h2><p class="sub">See what changed before you pick. First observed → latest observed.</p>
    <div class="record-controls"><label>Player<input id="move-search" type="search" placeholder="Find a player"></label><label>Period<select id="move-period"><option value="today">Today's board</option><option value="all">Last 30 days</option></select></label></div>
    <label class="sub"><input id="move-returned" type="checkbox" style="width:auto;min-height:0"> Include lines that moved and came back</label>
    <div id="line-history" class="movement-grid"></div></div>
    <div id="ask-view" hidden><h2 class="tracking-title">Ask your tracker</h2><p class="sub">Quick answers from your saved results and observed lines.</p>
    <div class="question-chips"><button data-question="How have the top 5 performed?">Top 5 results</button><button data-question="Which lines changed?">What moved?</button></div>
    <form id="ask-form"><input id="ask-question" aria-label="Question about picks" placeholder="Ask about a player or a line…" maxlength="600" required><button type="submit">Ask</button></form>
    <p id="ask-answer" role="status"></p>
    <details style="margin-top:24px"><summary>Optional on-device AI</summary><p class="sub">Optional download; quick answers above need no model. Requires WebGPU and potentially hundreds of MB. AI can be wrong; saved facts remain authoritative.</p>
    <button id="load-ai" type="button">Download & enable local AI</button> <button id="stop-ai" type="button" hidden>Turn AI off</button><p id="ai-status" class="sub"></p></details></div>`;
  const el=id=>document.getElementById(id), percent=v=>`${(v*100).toFixed(1)}%`;
  const photo=(name,id)=>`<div class="photo">${esc(name.split(' ').slice(0,2).map(w=>w[0]).join(''))}${id?`<img alt="" loading="lazy" src="https://a.espncdn.com/i/headshots/nba/players/full/${esc(id)}.png">`:''}</div>`;
  const time=at=>new Date(at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const changes=h=>h.filter((p,i)=>!i||p.line!==h[i-1].line);
  // A current move: the latest observed line differs from the first. Unchanged lines, price-only updates
  // and lines that moved and came back are not (their observations stay stored).
  const netMove=h=>h.length>1&&h.at(-1).line!==h[0].line;
  const moveText=(h,unit)=>{const d=h.at(-1).line-h[0].line;return `${d>0?'↑':'↓'} ${h[0].line} → ${h.at(-1).line} · ${d>0?'+':'−'}${Math.abs(d)}${unit?' '+unit.toLowerCase():''}`;};
  let local=store.get('pt.line.observations.v1')||{};
  function histories(){
    const merged={};
    for(const source of [archive?.movement||{},local]) for(const [k,h] of Object.entries(source)) (merged[k]||=[]).push(...h);
    for(const [k,h] of Object.entries(merged)){
      const ordered=h.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)), clean=[];
      for(const p of ordered){const last=clean.at(-1);if(!last||p.line!==last.line||p.over!==last.over||p.under!==last.under)clean.push(p);}
      merged[k]=clean;
    }
    return merged;
  }
  function spark(h){
    const values=h.map(p=>p.line), low=Math.min(...values)-.5, span=Math.max(...values)-low+.5;
    const points=values.map((v,i)=>`${8+i*284/Math.max(1,values.length-1)},${64-(v-low)/span*52}`).join(' ');
    return `<svg class="spark" viewBox="0 0 300 76" role="img" aria-label="Line history ${esc(values.join(' to '))}"><path d="M8 66H292" stroke="currentColor" opacity=".15"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
  }
  // What was observed around a net move (same rules as tracking.clues on the desktop). Evidence, never a confirmed cause.
  const parts=k=>k.split('|'), pct=v=>Math.round(v*100)+'%';
  const overChance=p=>Number.isFinite(p?.over)&&Number.isFinite(p?.under)?fairOver(p.over,p.under):null;
  function clues(key,h,c){
    if(!key||!netMove(h))return [];
    const all=allHistories(), first=h[0], last=h.at(-1), down=last.line<first.line, way=down?'down':'up', [event,athlete]=parts(key), out=[];
    const held=h.slice(0,h.findIndex(p=>p.line!==first.line));
    const start=overChance(first), before=held.length>1?overChance(held.at(-1)):null;
    if(start!=null&&before!=null&&(down?start-before:before-start)>=.02)out.push(`Before the number changed, the ${down?'Under':'Over'} was already getting more expensive at ${first.line} (Over chance ${pct(start)} → ${pct(before)}): money was coming in on that side.`);
    const now=overChance(last);
    if(now!=null){
      const lean=(down?now<.48:now>.52)?'still leans '+(down?'Under':'Over'):(down?now>.52:now<.48)?'now leans '+(down?'Over':'Under'):'is close to even';
      out.push(`At the new line the price ${lean}: Over ${last.line} is about ${pct(now)} with the book's cut removed.`);
    }
    const others=Object.entries(all).filter(([k])=>k!==key&&parts(k)[0]===event&&parts(k)[1]===athlete), moved=others.filter(([,o])=>netMove(o));
    const same=moved.filter(([,o])=>(o.at(-1).line<o[0].line)===down).map(([k,o])=>`${STAT_NAME[parts(k)[2]]||parts(k)[2]} ${o[0].line} → ${o.at(-1).line}`);
    if(same.length)out.push(`His other lines moved ${way} too (${same.slice(0,4).join(', ')}), which points to something about him (minutes, role or health) rather than this one stat.`);
    else if(others.length>=2&&!moved.length)out.push(`Only this line moved for him: his other ${others.length} lines in this game held, so it looks specific to this stat.`);
    const game=Object.entries(all).filter(([k,o])=>parts(k)[0]===event&&parts(k)[1]!==athlete&&netMove(o)).map(([,o])=>o);
    const withIt=game.filter(o=>(o.at(-1).line<o[0].line)===down).length;
    if(game.length>=6&&withIt/game.length>=.75)out.push(`${withIt} of the ${game.length} other lines that moved in this game also went ${way}, which usually follows a game-level change (expected pace or score, or a lineup change).`);
    else if(game.length>=6&&withIt/game.length<=.25)out.push(`Most other lines that moved in this game went the other way (${game.length-withIt} of ${game.length}), so this looks specific to him.`);
    const team=c&&S.athletes[c.id]?.team;
    if(team){
      const listed=Object.entries(S.injuries).filter(([,i])=>String(i.team)===String(team)&&i.status).map(([n,i])=>`${n}${n===c.name?' (him)':''} ${i.status}`);
      if(listed.length)out.push(`${c.team||'His team'} on ESPN's injury list right now: ${listed.slice(0,5).join(', ')}${listed.length>5?`, and ${listed.length-5} more`:''}. When each was listed is not known here.`);
    }
    return out;
  }
  // His usual line: the median of the latest lines from his last 10 tracked games (at least 3).
  function usual(key,tip){
    const [event,athlete,stat]=parts(key);
    const lines=Object.entries(allHistories()).filter(([k,o])=>{const p=parts(k);return p[0]!==event&&p[1]===athlete&&p[2]===stat&&Date.parse(o.at(-1).tip)<tip;})
      .sort(([,a],[,b])=>Date.parse(b.at(-1).tip)-Date.parse(a.at(-1).tip)).slice(0,10).map(([,o])=>o.at(-1).line).sort((a,b)=>a-b);
    const n=lines.length;
    return n<3?null:{mid:n%2?lines[(n-1)/2]:(lines[n/2-1]+lines[n/2])/2,n};
  }
  function lineLabel(line,u){
    if(!u||!Number.isFinite(line))return null;
    const gap=line-u.mid;
    if(Math.abs(gap)<1||Math.abs(gap)<.1*u.mid)return null;
    const low=gap<0;
    return {low,text:`${low?'Low':'High'} line · usual ${u.mid}`,why:`DraftKings has ${line}, ${Math.abs(gap)} ${low?'below':'above'} his usual ${u.mid} (median of his last ${u.n} tracked games). A lower line is easier for More and a higher one for Less, but lines usually sit off his usual for a reason (minutes, role, injuries, matchup), so check why first.`};
  }
  function explanation(h,c,key,label){
    const delta=h.at(-1).line-h[0].line, seen=clues(key,h,c);
    const easier=c&&delta?`The latest line is ${(delta<0)===(c.side==='more')?'easier':'harder'} to clear for ${c.side==='more'?'More':'Less'} than the first observed line. Your placed slip keeps its original line.`:'';
    const why=seen.length?`<b>What we can see around this move</b><ul class="clues">${seen.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><span class="sub">Observed clues, not a confirmed cause: the feed gives the numbers, not the reason.</span>`
      :`<b>Why it moved</b><br>ESPN reports the numbers, not the cause, and nothing else observed around it stands out. Injury news or changed betting demand could contribute.`;
    return `<p>${esc(easier)}</p>${label?`<p><b>${esc(label.text)}.</b> ${esc(label.why)}</p>`:''}<p>${why}</p>`;
  }
  function timeline(h,c,key,label){return `${spark(changes(h))}<div class="timeline">${h.map(p=>`<div><b>${p.line}</b> <span class="sub">${esc(time(p.at))} · Over ${p.over??'—'} / Under ${p.under??'—'}</span></div>`).join('')}</div>${explanation(h,c,key,label)}<p class="sub">Observed times, not exact change times. DraftKings via ESPN; PrizePicks can differ.</p>`;}
  let merged=null;  // rebuilt whenever the archive or local observations change
  const allHistories=()=>merged||=histories();
  const propFor=c=>S.props.find(p=>p.id===c.id&&p.stat===c.stat);
  const keyFor=c=>{const p=propFor(c);return p?`${p.game.id}|${c.id}|${c.stat}`:null;};
  const historyFor=c=>allHistories()[keyFor(c)]||[];
  const labelFor=c=>{const p=propFor(c);return p?lineLabel(c.line,usual(keyFor(c),Date.parse(p.game.tip))):null;};
  window.lineMoved=c=>netMove(historyFor(c));
  // 'Low line · usual 11.5': green when it favors the pick's side, red when it works against it.
  window.lineUsualHTML=c=>{const l=labelFor(c);return l?`<span class="tag ${l.low===(c.side==='more')?'good':'bad'}" title="${esc(l.why)}">${esc(l.text)}</span>`:'';};
  window.lineMovementHTML=c=>{
    const h=historyFor(c);if(!netMove(h))return '';
    return `<details class="movement-strip"><summary>DK line ${esc(moveText(h,STAT_NAME[c.stat]))}</summary>${timeline(h,c,keyFor(c),labelFor(c))}</details>`;
  };
  window.captureLineObservations=()=>{
    if(!window.__health?.ok)return;
    const now=new Date().toISOString();
    for(const p of S.props){
      if(Date.parse(p.game.tip)<=Date.now()||!Number.isFinite(p.line))continue;
      const c=candidate(p);if(!c)continue;
      const key=`${p.game.id}|${p.id}|${p.stat}`, h=local[key]||=[], last=h.at(-1);
      if(!last||last.line!==p.line||last.over!==p.over||last.under!==p.under)h.push({at:now,line:p.line,over:p.over,under:p.under,name:c.name,stat:p.stat,tip:p.game.tip});
    }
    for(const [key,h] of Object.entries(local))if(Date.parse(h.at(-1)?.tip)<Date.now()-30*864e5)delete local[key];
    store.set('pt.line.observations.v1',local);merged=null;renderMoves();
  };
  function selectedDays() {
    const period=el('record-period').value;
    const cutoff=period==='all'?'':et(new Date(Date.now()-(Number(period)-1)*864e5).toISOString());
    return Object.entries(archive?.days||{}).filter(([day])=>day>=cutoff).sort(([a],[b])=>b.localeCompare(a));
  }
  function rows(x=Number(el('record-x').value)){return selectedDays().flatMap(([,d])=>d.picks.slice(0,x));}
  function recordText(x=Number(el('record-x').value)) {
    const picks=rows(x), decided=picks.filter(p=>['hit','miss'].includes(p.result)), hits=decided.filter(p=>p.result==='hit').length;
    if(!decided.length)return `Top ${x}: no decided results yet. ${picks.length} recorded picks; ${picks.filter(p=>!p.result).length} pending.`;
    const n=decided.length,rate=hits/n,z=1.96,center=(rate+z*z/(2*n))/(1+z*z/n),half=z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/(1+z*z/n);
    return `Top ${x}: ${hits}/${n} hit (${percent(rate)}). Average predicted chance ${percent(mean(decided.map(p=>p.score)))}; market baseline ${percent(mean(decided.map(p=>p.market)))}. Approximate 95% interval ${percent(center-half)}–${percent(center+half)} (picks can be correlated). ${picks.filter(p=>!p.result).length} pending, ${picks.filter(p=>p.result==='push').length} pushes, ${picks.filter(p=>p.result==='dnp').length} DNPs. Hit rate does not measure payout or profit.`;
  }
  function renderDays(){
    const date=el('record-day').value,d=archive?.days?.[date],x=Number(el('record-x').value);
    el('record-days').innerHTML=!d?'<div class="empty">No selections recorded in this period yet. Past picks are never invented.</div>':d.status==='missed'?`<div class="empty">Missed collection · ${esc(d.reason||'No complete board before tip-off')}</div>`:
      `<p class="sub">Locked ${esc(time(d.at))} · ${esc(d.source)}</p><div class="record-grid">${d.picks.slice(0,x).map(p=>`<article class="result-card"><div class="result-head">${photo(p.name,p.id)}<div><b>#${p.rank} ${esc(p.name)}</b><div class="sub">${esc(p.matchup||'')}</div><div>${esc(p.side==='more'?'More':'Less')} <b>${p.line}</b> ${esc(STAT_NAME[p.stat])}</div></div></div><div class="result-bottom"><span class="result-badge ${esc(p.result||'')}">${esc(p.result==='hit'?'✓ Hit':p.result==='miss'?'✕ Miss':p.result||'Pending')}${p.actual!=null?` · ${p.actual}`:''}</span><span class="sub">${percent(p.score)} predicted <span class="stars">${'★'.repeat(p.signs?.length||0)}</span></span></div></article>`).join('')}</div>`;
  }
  function renderMoves(){
    const q=el('move-search').value.toLowerCase(), todayOnly=el('move-period').value==='today';
    const back=el('move-returned').checked;
    const moved=Object.entries(allHistories()).filter(([,h])=>(netMove(h)||(back&&changes(h).length>1))&&h[0].name.toLowerCase().includes(q)&&(!todayOnly||(h.at(-1).tip&&et(h.at(-1).tip)===S.today))).sort(([,a],[,b])=>Date.parse(b.at(-1).at)-Date.parse(a.at(-1).at));
    el('line-history').innerHTML=moved.map(([key,h])=>{
      const first=h[0],last=h.at(-1),delta=last.line-first.line,label=lineLabel(last.line,usual(key,Date.parse(last.tip)));
      return `<article class="move-card"><div class="result-head">${photo(first.name,key.split('|')[1])}<div><b>${esc(first.name)}</b><div class="sub">${esc(STAT_NAME[first.stat])} · DraftKings</div></div></div><div class="move-number">${first.line} → ${last.line} <small>${delta>0?'↑ +':delta<0?'↓ −':'back to the first line'}${delta?Math.abs(delta):''}</small></div><div class="sub">${esc(time(first.at))} → ${esc(time(last.at))}</div>${label?`<span class="tag goblin">${esc(label.text)}</span>`:''}${spark(changes(h))}<details><summary>Timeline & why</summary>${timeline(h,null,key,label)}</details></article>`;
    }).join('')||'<div class="empty">No lines sit away from where they were first observed in this view. Unchanged lines, price-only updates and lines that came back are left out. Try Last 30 days for older moves.</div>';
  }
  function render(){
    el('record-summary').textContent=recordText();
    const picks=rows(),decided=picks.filter(p=>['hit','miss'].includes(p.result)),hits=decided.filter(p=>p.result==='hit').length,n=decided.length;
    el('record-metrics').innerHTML=[[n?percent(hits/n):'—',`${hits}/${n} decided · actual hit rate`],[n?percent(mean(decided.map(p=>p.score))):'—','Predicted chance'],[n?percent(mean(decided.map(p=>p.market))):'—','Market baseline'],[picks.filter(p=>!p.result).length,'Pending results']].map(([v,l])=>`<div class="record-metric"><b>${v}</b><span>${l}</span></div>`).join('');
    el('record-stars').innerHTML=[2,1,0].map(s=>{const g=decided.filter(p=>p.signs?.length===s);return g.length?`<div><span class="stars">${'★'.repeat(s)||'0 stars'}</span> <b>${percent(g.filter(p=>p.result==='hit').length/g.length)}</b><div class="sub">${g.length} decided picks</div></div>`:'';}).join('');
    const selected=el('record-day').value;
    el('record-day').innerHTML=selectedDays().map(([day,d])=>`<option value="${esc(day)}" ${selected===day?'selected':''}>${esc(day)}${d.status==='missed'?' · missed':''}</option>`).join('');
    renderDays();renderMoves();
  }
  function selectView(index){
    boardArea.hidden=index!==0;panel.hidden=index===0;
    el('daily-view').hidden=index!==1;el('moves-view').hidden=index!==2;el('ask-view').hidden=index!==3;
    nav.querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('on',i===index);b.setAttribute('aria-pressed',i===index);});
    render();
  }
  nav.onclick=e=>{const b=e.target.closest('[data-view]');if(b)selectView(Number(b.dataset.view));};
  el('record-day').onchange=renderDays;el('move-search').oninput=renderMoves;el('move-period').onchange=renderMoves;el('move-returned').onchange=renderMoves;
  panel.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{el('ask-question').value=b.dataset.question;el('ask-form').requestSubmit();});
  async function refreshArchive() {
    try {
      // Pin a commit when available: raw branch URLs can serve an older CDN copy.
      // Public API quota exhaustion falls back to the timestamp-labeled raw branch.
      let url=archiveURL+'?v='+Math.floor(Date.now()/300000);
      try {
        const ref=await fetch('https://api.github.com/repos/anndrewkimm/proptracker-today/git/ref/heads/tracker-data',{cache:'no-cache',signal:AbortSignal.timeout(5000)});
        if(ref.ok) {const sha=(await ref.json()).object?.sha; if(/^[a-f0-9]{40}$/.test(sha)) url=archiveURL.replace('/tracker-data/','/'+sha+'/');}
      } catch { /* raw branch remains available without the API */ }
      const r=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if (!r.ok) throw Error('Archive not published yet');
      const data=await r.json();
      if (data.version!==1 || !data.days || !data.movement) throw Error('Archive format unavailable');
      archive=data; merged=null; store.set('pt.public.archive.v1',data);
      const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.updatedAt))/60000));
      el('archive-status').textContent=`Shared archive updated ${new Date(data.updatedAt).toLocaleString()} (${age} min ago). ${age>90?'Collection is delayed. ':''}${data.collectionOk===false?'Latest board was incomplete; no new selections locked. ':''}`;
    } catch {
      archive=store.get('pt.public.archive.v1'); merged=null;
      el('archive-status').textContent=archive?`Offline/shared archive unavailable. Showing saved history from ${new Date(archive.updatedAt).toLocaleString()}; this is not a live quote.`:'Shared archive is not available yet. The live board still works. Automatic collection needs a successful GitHub workflow run.';
    }
    render(); draw();
  }
  function evidence(question) {
    const q=question.toLowerCase(), match=q.match(/top\s*(\d+)/), x=match?Math.max(1,Math.min(20,Number(match[1]))):Number(el('record-x').value);
    const current=window.__health?.ok?board():[];
    const mentions=name=>name.toLowerCase().split(' ').some(w=>w.length>2 && q.includes(w));
    const named=current.filter(p=>mentions(p.name));
    const history=Object.entries(archive?.days||{}).sort(([a],[b])=>b.localeCompare(a))
      .flatMap(([date,d])=>d.picks.map(p=>({...p,date}))).filter(p=>mentions(p.name));
    const facts=[recordText(x)];
    for (const c of (named.length?named:current).slice(0,5)) facts.push(`${c.name}: ${c.side} ${c.line} ${STAT_NAME[c.stat]}, DraftKings via ESPN. Predicted ${percent(c.score)}, market ${percent(c.market)}. Recent form ${c.formHits}/${c.formGames}. Signs: ${c.signs.join(', ')||'none'}. ${c.injury?`Status: ${c.injury}.`:''}`);
    for (const p of history.slice(0,8)) facts.push(`Recorded ${p.date}, rank ${p.rank}: ${p.name}, ${p.side} ${p.line} ${STAT_NAME[p.stat]}. Predicted ${percent(p.score)}. Result: ${p.result||'pending'}; actual ${p.actual??'not available'}. DraftKings line frozen before tip-off.`);
    if (/line|mov|chang/.test(q)) {
      const observed=Object.values(allHistories()).filter(netMove);
      const matching=observed.filter(h=>mentions(h[0].name));
      const moved=(matching.length?matching:observed).slice(-8);
      facts.push(moved.length?moved.map(h=>`${h[0].name} ${h[0].stat}: ${h[0].line} at ${h[0].at} → ${h.at(-1).line} at ${h.at(-1).at}.`).join('\n'):'No matching observed line changes in the archive.');
    }
    facts.push(`Archive timestamp: ${archive?.updatedAt||'unavailable'}. Live board: ${window.__health?.ok?'loaded':'unavailable or incomplete'}. No personal slips, verified PrizePicks lines, or profit data are available here.`);
    return facts.join('\n\n');
  }
  el('ask-form').onsubmit=async event=>{
    event.preventDefault(); const q=el('ask-question').value.trim(); if (!q) return;
    const facts=evidence(q), button=event.target.querySelector('button'); button.disabled=true;
    el('ask-answer').textContent=engine?'Thinking on this device…':'Quick facts (not an AI response):\n\n'+facts;
    try {
      if (engine) {
        const response=await engine.chat.completions.create({messages:[
          {role:'system',content:'Explain only the supplied tracker facts. Never invent players, numbers, reasons for movement, injuries or future outcomes. Say when facts do not answer the question. Do not claim a pick is safe or guaranteed. Keep the answer brief. FACTS:\n'+facts},
          {role:'user',content:q}],temperature:0.2,max_tokens:350});
        el('ask-answer').textContent='On-device AI explanation:\n\n'+response.choices[0].message.content+'\n\nSource facts:\n'+facts;
      }
    } catch {el('ask-answer').textContent='AI unavailable. Quick facts:\n\n'+facts;}
    finally {button.disabled=false;}
  };
  el('load-ai').onclick=async()=>{
    el('load-ai').disabled=true;
    try {
      const adapter=navigator.gpu && await navigator.gpu.requestAdapter();
      if (!adapter) throw Error('This browser/device does not support WebGPU. Quick answers remain available.');
      el('ai-status').textContent='Loading the model runtime…';
      const {CreateMLCEngine}=await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const model=adapter.features.has('shader-f16')?'SmolLM2-360M-Instruct-q4f16_1-MLC':'SmolLM2-360M-Instruct-q4f32_1-MLC';
      engine=await CreateMLCEngine(model,{
        initProgressCallback:p=>{el('ai-status').textContent=p.text;}
      },{context_window_size:4096});
      el('ai-status').textContent='Local AI ready. Questions stay on this device.'; el('stop-ai').hidden=false;
    } catch(e) {el('ai-status').textContent=String(e.message||e); el('load-ai').disabled=false;}
  };
  el('stop-ai').onclick=async()=>{
    if(engine) {engine.interruptGenerate();await engine.unload();} engine=null;
    el('stop-ai').hidden=true; el('load-ai').disabled=false; el('ai-status').textContent='AI off. Downloaded model files may remain in browser storage.';
  };
  el('record-x').onchange=render; el('record-period').onchange=render;
  refreshArchive(); setInterval(()=>{if(!document.hidden) refreshArchive();},5*60000);
})();
