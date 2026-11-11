'use strict';
// Public recommendations only. Never import the desktop database or personal slips.
const MODEL = 'phone-chance-v1';
const POLICY = 'standard-stars-chance-one-player-v1';
const identity = p => `${p.event}|${p.id}|${p.stat}`;
function empty() { return {version:1, updatedAt:null, days:{}, movement:{}}; }
function ranked(picks) {
  const seen = new Set();
  return picks.filter(p => p.kind === 'standard' && p.loaded && Number.isFinite(p.score))
    .sort((a,b) => b.signs.length-a.signs.length || b.score-a.score || identity(a).localeCompare(identity(b)))
    .filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0,20);
}
function observe(state, input, now) {
  if (state.version !== 1) throw Error('Unsupported archive version');
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw Error('Invalid observation time');
  // A partial board must not become an official daily recommendation.
  if (input.ok) {
    for (const p of input.picks) {
      if (!(Date.parse(p.tip) > time) || !Number.isFinite(p.line)) continue;
      const k = identity(p), history = state.movement[k] ||= [];
      const last = history.at(-1);
      if (!last || last.line !== p.line || last.over !== p.over || last.under !== p.under)
        history.push({at:now, line:p.line, over:p.over, under:p.under, name:p.name, stat:p.stat, tip:p.tip});
    }
  }
  const tips = input.events.map(e => Date.parse(e.tip)).filter(Number.isFinite);
  if (tips.length) {
    const first = Math.min(...tips);
    let day = state.days[input.day];
    if (!day && time >= first) {
      state.days[input.day] = {status:'missed', reason:'No complete board captured in the 90 minutes before first tip-off.', picks:[]};
    } else if (!day && input.ok && first-time <= 90*60000 && first > time) {
      const picks = ranked(input.picks.filter(p => Date.parse(p.tip)>time));
      if (picks.length) state.days[input.day] = {status:'locked', at:now, firstTip:new Date(first).toISOString(),
        model:MODEL, policy:POLICY, source:'DraftKings via ESPN', picks:picks.map((p,i) => ({...p, rank:i+1, result:null}))};
    }
  }
  // Full daily results stay; high-volume observation history has a 30-day window.
  for (const [k,h] of Object.entries(state.movement))
    if (Date.parse(h.at(-1)?.tip) < time-30*864e5) delete state.movement[k];
  state.updatedAt = now;
  return state;
}
const columns = {points:['PTS'], rebounds:['REB'], assists:['AST'], threes_made:['3PT'], steals:['STL'], blocks:['BLK'],
  'pts+rebs+asts':['PTS','REB','AST'], 'pts+rebs':['PTS','REB'], 'pts+asts':['PTS','AST'], 'rebs+asts':['REB','AST']};
function grade(pick, summary) {
  if (!summary?.header?.competitions?.[0]?.status?.type?.completed) return null;
  for (const team of summary.boxscore?.players || []) for (const group of team.statistics || []) {
    const row = group.athletes?.find(a => String(a.athlete?.id) === String(pick.id));
    if (!row) continue;
    if (row.didNotPlay === true) return {actual:null, result:'dnp'};
    const labels = group.labels || []; let actual = 0;
    if (!columns[pick.stat]) return null;
    for (const label of columns[pick.stat]) {
      const index = labels.indexOf(label), raw = row.stats?.[index];
      if (index<0 || raw == null || raw === '') return null;
      const number = Number(label==='3PT' ? String(raw).split('-')[0] : raw);
      if (!Number.isFinite(number)) return null;
      actual += number;
    }
    return {actual, result:actual===pick.line?'push':((actual>pick.line)===(pick.side==='more')?'hit':'miss')};
  }
  return null; // Missing rows are unknown, never inferred DNPs.
}
module.exports = {empty, observe, ranked, grade, identity};
