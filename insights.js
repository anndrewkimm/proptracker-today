'use strict';
// No keys, remote inference, or paid services. The optional model runs on this device.
if (!new URLSearchParams(location.search).has('collector')) (() => {
  const archiveURL='https://raw.githubusercontent.com/anndrewkimm/proptracker-today/tracker-data/archive.json';
  let archive=null, engine=null;
  const panel=document.createElement('details'); panel.className='box';
  panel.innerHTML=`<summary>Daily record, lines & chat</summary>
    <p class="sub">Shared automatic picks, even when your PC and both phones are off. DraftKings lines via ESPN; these are not verified PrizePicks offers.</p>
    <p id="archive-status" class="sub">Loading shared record…</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0"><label>Daily top X <select id="record-x" aria-label="Number of daily picks">${[1,3,5,10,15,20].map(x=>`<option ${x===5?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Period <select id="record-period"><option value="all">All recorded days</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label></div>
    <div id="record-summary"></div>
    <details><summary>Daily selections and results</summary><div id="record-days"></div></details>
    <details><summary>Observed line changes</summary><p class="sub">Last 30 days. Times are observations, not exact change times. Prices can change without the line moving.</p><div id="line-history"></div></details>
    <details><summary>How daily tracking works</summary><p class="sub">Selections lock once, on the first complete collection in the 90 minutes before the day's first tip-off. Standard lines, most stars then chance, one pick per player, up to 20. All days use this fixed policy. Changing top X only changes the results you view. Missed collections are labeled; historical picks are never invented.</p></details>
    <details><summary>Ask about picks</summary>
      <p class="sub">Quick answers work without an AI download. Ask about a player, line movement, or the track record.</p>
      <form id="ask-form"><input id="ask-question" aria-label="Question about picks" placeholder="How have the top 5 performed?" maxlength="600" required><button type="submit">Ask</button></form>
      <p id="ask-answer" style="white-space:pre-wrap;overflow-wrap:anywhere" role="status"></p>
      <details><summary>Optional on-device AI</summary><p class="sub">Download a small language model to this device. This can use hundreds of MB, take several minutes, and use battery. Requires WebGPU and sufficient memory. No account, API key, or paid fallback. AI explanations can be wrong; the record above is authoritative.</p>
      <button id="load-ai" type="button">Download & enable local AI</button> <button id="stop-ai" type="button" hidden>Turn AI off</button><p id="ai-status" class="sub"></p></details>
    </details>`;
  document.querySelector('main').insertBefore(panel,document.getElementById('count'));
  const el=id=>document.getElementById(id), percent=v=>`${(v*100).toFixed(1)}%`;
  function selectedDays() {
    const period=el('record-period').value;
    const cutoff=period==='all'?'':et(new Date(Date.now()-(Number(period)-1)*864e5).toISOString());
    return Object.entries(archive?.days||{}).filter(([day])=>day>=cutoff).sort(([a],[b])=>b.localeCompare(a));
  }
  function rows(x=Number(el('record-x').value)) {return selectedDays().flatMap(([,d])=>d.picks.slice(0,x));}
  function recordText(x=Number(el('record-x').value)) {
    const picks=rows(x), decided=picks.filter(p=>['hit','miss'].includes(p.result)), hits=decided.filter(p=>p.result==='hit').length;
    if (!decided.length) return `Top ${x}: no decided results yet. ${picks.length} recorded picks; ${picks.filter(p=>!p.result).length} pending.`;
    const n=decided.length, rate=hits/n, z=1.96, center=(rate+z*z/(2*n))/(1+z*z/n), half=z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/(1+z*z/n);
    const expected=mean(decided.map(p=>p.score)), market=mean(decided.map(p=>p.market));
    return `Top ${x}: ${hits}/${n} hit (${percent(rate)}). Average predicted chance ${percent(expected)}; market baseline ${percent(market)}. Approximate 95% interval ${percent(center-half)}–${percent(center+half)} (picks can be correlated). ${picks.filter(p=>!p.result).length} pending, ${picks.filter(p=>p.result==='push').length} pushes, ${picks.filter(p=>p.result==='dnp').length} DNPs. Hit rate does not measure payout or profit.`;
  }
  function render() {
    el('record-summary').textContent=recordText();
    const x=Number(el('record-x').value);
    el('record-days').innerHTML=selectedDays().map(([date,d])=>`<details><summary>${esc(date)} · ${d.status==='missed'?'Missed collection':`${d.picks.slice(0,x).length} picks`}</summary>
      <p class="sub">${d.at?`Locked ${esc(new Date(d.at).toLocaleString())} · ${esc(d.model)} · ${esc(d.source)}`:esc(d.reason)}</p>
      ${d.picks.slice(0,x).map(p=>`<p>#${p.rank} ${esc(p.name)} · ${esc(p.side)} ${p.line} ${esc(STAT_NAME[p.stat])} · ${percent(p.score)} → <b>${esc(p.result||'pending')}</b>${p.actual!=null?` (${p.actual})`:''}</p>`).join('')}</details>`).join('')||'<p class="sub">Recording starts with the next eligible slate. Past selections are not invented.</p>';
    const moved=Object.values(archive?.movement||{}).filter(h=>h.length>1).sort((a,b)=>b.at(-1).at.localeCompare(a.at(-1).at));
    el('line-history').innerHTML=moved.slice(0,100).map(h=>`<details><summary>${esc(h[0].name)} · ${esc(STAT_NAME[h[0].stat])} · ${h[0].line} → ${h.at(-1).line}</summary>${h.map(p=>`<div class="sub">${esc(new Date(p.at).toLocaleString())}: ${p.line} · Over ${p.over}, Under ${p.under}</div>`).join('')}</details>`).join('')||'<p class="sub">No observed changes yet. A first observation alone cannot show movement.</p>';
  }
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
      archive=data; store.set('pt.public.archive.v1',data);
      const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.updatedAt))/60000));
      el('archive-status').textContent=`Shared archive updated ${new Date(data.updatedAt).toLocaleString()} (${age} min ago). ${age>90?'Collection is delayed. ':''}${data.collectionOk===false?'Latest board was incomplete; no new selections locked. ':''}`;
    } catch {
      archive=store.get('pt.public.archive.v1');
      el('archive-status').textContent=archive?`Offline/shared archive unavailable. Showing saved history from ${new Date(archive.updatedAt).toLocaleString()}; this is not a live quote.`:'Shared archive is not available yet. The live board still works. Automatic collection needs a successful GitHub workflow run.';
    }
    render();
  }
  function evidence(question) {
    const q=question.toLowerCase(), match=q.match(/top\s*(\d+)/), x=match?Math.max(1,Math.min(20,Number(match[1]))):Number(el('record-x').value);
    const current=window.__health?.ok?board():[];
    const named=current.filter(p=>p.name.toLowerCase().split(' ').some(w=>w.length>2 && q.includes(w)));
    const facts=[recordText(x)];
    for (const c of (named.length?named:current).slice(0,5)) facts.push(`${c.name}: ${c.side} ${c.line} ${STAT_NAME[c.stat]}, DraftKings via ESPN. Predicted ${percent(c.score)}, market ${percent(c.market)}. Recent form ${c.formHits}/${c.formGames}. Signs: ${c.signs.join(', ')||'none'}. ${c.injury?`Status: ${c.injury}.`:''}`);
    if (/line|mov|chang/.test(q)) {
      const changes=Object.values(archive?.movement||{}).filter(h=>h.length>1 && (!named.length || named.some(c=>c.name===h[0].name))).slice(-8);
      facts.push(changes.length?changes.map(h=>`${h[0].name} ${h[0].stat}: ${h[0].line} at ${h[0].at} → ${h.at(-1).line} at ${h.at(-1).at}.`).join('\n'):'No matching observed line changes in the archive.');
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
