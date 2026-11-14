const {test}=require('node:test');
const assert=require('node:assert/strict');
const {empty,observe,grade}=require('../tracking.cjs');
const now='2026-11-11T23:00:00Z', tip='2026-11-12T00:00:00Z';
const p={id:'1',event:'12',tip,name:'Example',stat:'points',line:20.5,side:'less',score:.6,market:.52,
  kind:'standard',loaded:true,signs:['Less'],over:-110,under:-110};
const input={day:'2026-11-11',ok:true,events:[{tip}],picks:[p]};
test('daily selections freeze while observations continue changing',()=>{
  const s=observe(empty(),input,now);
  observe(s,{...input,picks:[{...p,line:22.5,score:.7}]},'2026-11-11T23:30:00Z');
  assert.equal(s.days[input.day].picks[0].line,20.5);
  assert.equal(s.days[input.day].picks[0].score,.6);
  assert.equal(s.movement['12|1|points'].length,2);
  observe(s,input,tip);
  assert.equal(s.movement['12|1|points'].length,2);
});
test('no hindsight, no partial boards, no collection too early',()=>{
  assert.deepEqual(observe(empty(),input,'2026-11-11T20:00:00Z').days,{});
  assert.deepEqual(observe(empty(),{...input,ok:false},now).days,{});
  assert.equal(observe(empty(),input,tip).days[input.day].status,'missed');
});

test('injury context is frozen with the pick, never replaced by later reports',()=>{
  const availability=['Team: Zach Edey (Out), Quinten Post (Out).'];
  const s=observe(empty(),{...input,picks:[{...p,availability,injuryCheckedAt:now}]},now);
  observe(s,{...input,picks:[{...p,availability:['No current entries']}]},'2026-11-11T23:30:00Z');
  assert.deepEqual(s.days[input.day].picks[0].availability,availability);
  assert.equal(s.days[input.day].picks[0].injuryCheckedAt,now);
});
test('one player, standard lines only, ties stable',()=>{
  const s=observe(empty(),{...input,picks:[p,{...p,stat:'rebounds'},{...p,id:'2',kind:'goblin'}]},now);
  assert.equal(s.days[input.day].picks.length,1);
});
test('empty candidates never lock and later recovery can lock before tip-off',()=>{
  const s=observe(empty(),{...input,picks:[]},now);
  assert.equal(s.days[input.day],undefined);
  observe(s,input,'2026-11-11T23:30:00Z');
  assert.equal(s.days[input.day].status,'locked');
});
test('a missed day cannot be replaced and an unknown archive version fails',()=>{
  const s=observe(empty(),input,tip);
  observe(s,input,now);
  assert.equal(s.days[input.day].status,'missed');
  assert.throws(()=>observe({version:2},input,now),/Unsupported archive/);
});
test('identical observations deduplicate, price-only changes remain visible',()=>{
  const s=observe(empty(),input,now);
  observe(s,input,'2026-11-11T23:10:00Z');
  assert.equal(s.movement['12|1|points'].length,1);
  observe(s,{...input,picks:[{...p,over:105}]},'2026-11-11T23:20:00Z');
  assert.equal(s.movement['12|1|points'].length,2);
});
function summary(stats,completed=true){return {header:{competitions:[{status:{type:{completed}}}]},boxscore:{players:[{statistics:[{labels:['PTS','REB','AST','3PT'],athletes:[{athlete:{id:'1'},stats}]}]}]}};}
test('grade final exact event box, combo stats and pushes; missing data remains pending',()=>{
  assert.equal(grade(p,summary(['20','5','3','2-5'])).result,'hit');
  assert.equal(grade({...p,line:20},summary(['20','5','3','2-5'])).result,'push');
  assert.equal(grade({...p,stat:'pts+rebs+asts'},summary(['20','5','3','2-5'])).actual,28);
  assert.equal(grade({...p,stat:'threes_made'},summary(['20','5','3','2-5'])).actual,2);
  assert.equal(grade(p,summary(['20','5','3','2-5'],false)),null);
  assert.equal(grade(p,summary(['--'])),null);
  const s=summary([]);s.boxscore.players[0].statistics[0].athletes[0].didNotPlay=true;
  assert.equal(grade(p,s).result,'dnp');
  s.boxscore.players=[]; assert.equal(grade(p,s),null);
});
