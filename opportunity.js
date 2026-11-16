/* Keep calculations in step with proptracker/opportunity.py; parity-tested. */
(function(root) {
  'use strict';
  const VERSION = 'market-opportunity-v2';
  const median = a => {const s=[...a].sort((a,b)=>a-b), n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
  function analyze(line, side, games, day, {absences=0,role_report=false,injury=false,coverage=true}={}) {
    const rows=games.filter(g=>g.d<day&&Number.isFinite(g.m)&&Number.isFinite(g.v)&&g.m>0&&g.m<=70&&g.v>=0)
      .sort((a,b)=>b.d.localeCompare(a.d)).slice(0,20), recent=rows.slice(0,10), flags=[];
    if(!coverage)flags.push('coverage');
    if(recent.length<5)flags.push('sample');
    if(absences||role_report||injury)flags.push('availability');
    const baseline=recent.length?median(recent.map(g=>g.v)):null, minutes=recent.length?median(recent.map(g=>g.m)):null;
    const latest=rows.length>=3?median(rows.slice(0,3).map(g=>g.m)):null;
    const prior=rows.length>=8?median(rows.slice(3,10).map(g=>g.m)):null;
    if(latest!=null&&prior!=null&&Math.abs(latest-prior)>=Math.max(4,prior*.2))flags.push('minutes');
    if(baseline!=null&&Math.abs(line-baseline)>=Math.max(2,baseline*.35))flags.push('line');
    const rate=recent.length?recent.reduce((s,g)=>s+g.v,0)/recent.reduce((s,g)=>s+g.m,0):null;
    const needed=rate>0?line/rate:null, scenarios=[];
    if(recent.length){
      const ordered=recent.map(g=>g.m).sort((a,b)=>a-b);
      const targets=new Set([.2,.5,.8].map(q=>Math.round(ordered[Math.floor((ordered.length-1)*q)])));
      if(flags.includes('availability')||flags.includes('line'))[24,32,36].forEach(m=>targets.add(m));
      for(const target of [...targets].sort((a,b)=>a-b)){
        const matched=rows.filter(g=>Math.abs(g.m-target)<=3), decided=matched.filter(g=>g.v!==line);
        scenarios.push({minutes:target,production:Math.round(rate*target*10)/10,games:decided.length,
          hits:decided.filter(g=>(g.v>line)===(side==='more')).length,pushes:matched.length-decided.length});
      }
    }
    return {version:VERSION,flags,review:!!flags.length,support:Number(recent.length>=10&&coverage)+Number(!flags.length),
      games:recent.length,median:baseline,minutes,recentMinutes:latest,priorMinutes:prior,rate,lineMinutes:needed,scenarios};
  }
  function notes(a,line,side){
    const out=['Market anchor: chance uses current sportsbook prices with the cut removed. No automatic Under bonus or boost from old hit rates.'];
    if(a.median!=null)out.push(`Line vs history: ${line} vs a median of ${a.median} in ${a.games} recent games at a median ${a.minutes} minutes. A different line can reflect a different role or matchup.`);
    if(a.lineMinutes!=null)out.push(`Opportunity needed: at his recent ${a.rate.toFixed(2)} per minute, ${line} corresponds to ${a.lineMinutes.toFixed(1)} minutes. This is a what-if calculation, not projected playing time; efficiency and usage can also change.`);
    if(a.flags.includes('minutes'))out.push(`Minutes changed: last 3 median ${a.recentMinutes}, earlier games ${a.priorMinutes}.`);
    if(a.flags.includes('availability'))out.push("Role review: absences or a player status can change opportunity. We do not allocate missing teammates' minutes automatically; the old hit rate is not evidence for tonight's role.");
    if(a.flags.includes('line'))out.push('Different setup: the line is far from recent production. Check minutes, usage and matchup before interpreting historical Overs or Unders as an advantage.');
    if(a.flags.includes('sample')||a.flags.includes('coverage'))out.push('Limited evidence: insufficient recent games or incomplete team/report coverage.');
    return out;
  }
  const api={VERSION,analyze,notes};
  if(typeof module!=='undefined')module.exports=api;
  else root.Opportunity=api;
})(globalThis);
