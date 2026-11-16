/* ===================== sim/hint.js: the bench's yardstick and the stuck hint (1.7) =====================
   designScore(c, d, tGrain, steps) says how far a design is from a clean delivery of contract c, by the predictor alone:
     0 is a motor in the middle of every spec band, with no flag and a margin under every rating. It returns {s, parts, p,
     refused}: parts lists what makes up the score, each {kind, key, s} (kind: flag, margin, refused, launch or spec; a spec
     part also has dir: "low", "high" or "edge"), biggest first. A design the predictor can't run scores 1e9.
   hintMove(d, f, kind, step, dir) makes one of a player's moves (HINT.moves, data/tuning.js) on a copy of d, or null.
   hint(c, d, o) is the hint: o = {tGrain, tier}. It tries every move one step each way, every part in HINT.picks the
     player has (the igniter one size either way), and the job's own solution's parts (HINT.parts) one at a time, and names the one that cuts the score most:
       {kind:"move", f, dir, issue, from, to}   a slider or stepper one way (dir +1 or -1), or a move made together
       {kind:"pick", f, v, issue, from, to}     a part to swap to (the igniter or a rocket part: they're named)
       {kind:"part", f, v, issue, from, to}     a part to look at again; the app doesn't say which (v is for the tests)
       {kind:"sound", base}                     the motor delivers on paper: a miss was the real motor's scatter
       {kind:"stuck", issue}                    nothing one step away helps
       {kind:"broken"}                          the predictor can't run this design (its red errors come first)
     issue is the biggest part of the score before the move. Only the direction is given, never a number: the player
     still finds how far.
   tools/balance-bot.js tunes every contract with designScore and hintMove, so a hint is the bot's next move. Pure: no DOM,
   no clock, no randomness. */
const HINT_OVER={liner:(q,m)=>q.tb/m.linerRating,burst:(q,m)=>q.Pmax/m.pUlt,yield:q=>1/q.sf,closure:q=>1/q.closureSf,
  pt:q=>TUNING.ptWarn/q.pt0,chuff:(q,m)=>m.prop.pMin*1e6/q.pLow};
function designScore(c,d,tGrain,steps){
  const H=HINT,parts=[],add=(o,s)=>{o.s=s;parts.push(o);return s;};
  let p;try{p=predict(d,standCond(c,{tGrain}),steps?{steps}:undefined);}catch(e){return{s:1e9,parts};}
  if(!p.ok)return{s:1e9,parts};
  const q=p.sum,m=p.motor,over={};
  for(const k in HINT_OVER)over[k]=HINT_OVER[k](q,m);
  over.sep=0.9+(d.nozzle.exitD/d.nozzle.throatD)**2/20;
  let s=0;
  /* each flag, weighted by how far over its line the motor is, so a step towards the line counts as progress */
  for(const w of q.warnings)s+=add({kind:"flag",key:w.key,sev:w.sev,text:w.text},(w.sev==="crit"?H.critW:H.warnW)*(1+Math.max(0,(over[w.key]||1)-0.9)*10));
  /* a careful player keeps a margin under every rating, flagged or not: real motors scatter round the prediction */
  for(const key of["liner","burst","yield","closure","chuff"]){const o=over[key];if(o>H.margin&&isFinite(o))s+=add({kind:"margin",key},20*(o-H.margin)**2);}
  const k=Object.assign({},c,{stand:STANDS[c.stand]}),refused=preFire(k,d,p.motor,{tier:c.tier,sum:q});
  for(const r of refused)s+=add({kind:"refused",key:r.field,text:r.text},H.refuseW);
  let sum=q;
  if(c.flight){
    const fp=predictFlight(d,p.motor,p.run,c.flight.payload);if(!fp)return{s:1e9,parts};
    sum=Object.assign({},q,{apogee:fp.apogee});
    for(const r of preLaunch(d,p.motor,p.run,c.flight.payload,c.tier))s+=add({kind:"launch",key:r.field,text:r.text},H.refuseW);}
  for(const ck of specCheck(c.spec,sum,p.motor)){
    const{lo,hi,v}=ck,o={kind:"spec",key:ck.k,v,lo,hi};
    if(lo!=null&&hi!=null){const e=Math.abs(v-(lo+hi)/2)/((hi-lo)/2);o.dir=v<lo?"low":v>hi?"high":"edge";s+=add(o,Math.max(0,e-H.bandIn)**2*4);}
    else if(hi!=null){const e=(v-hi*0.97)/hi;o.dir=v>hi?"high":"edge";s+=add(o,e>0?(e*10)**2:0);}
    else{const e=(lo*1.03-v)/lo;o.dir=v<lo?"low":"edge";s+=add(o,e>0?(e*10)**2:0);}}
  return{s,parts:parts.filter(x=>x.s>0).sort((a,b)=>b.s-a.s),p,refused};}
/* one of a player's moves on a copy of the design; null when it can't be made */
const hr1=v=>Math.round(v*10)/10;
const hGet=(d,f)=>f.split(".").reduce((o,k)=>o&&o[k],d);
function hSet(d,f,v){const p=f.split("."),l=p.pop();p.reduce((o,k)=>o[k],d)[l]=v;}
function hintMove(d,f,kind,step,dir){
  const t=JSON.parse(JSON.stringify(d));
  if(kind==="m"){
    const k=dir>0?step:1/step;
    if(f==="size"){t.case.id=Math.round(t.case.id*k);t.nozzle.throatD=hr1(t.nozzle.throatD*k);t.nozzle.exitD=hr1(t.nozzle.exitD*k);if(t.grain.coreD)t.grain.coreD=hr1(t.grain.coreD*k);t.grain.segLen=hr1(t.grain.segLen*k);}
    else if(f==="segsKeep"){const ns=t.grain.segs+dir;if(ns<1||t.grain.shape==="end")return null;t.grain.segLen=hr1(t.grain.segLen*t.grain.segs/ns);t.grain.segs=ns;}
    else{if(!t.grain.coreD)return null;t.grain.coreD=hr1(t.grain.coreD*k);t.nozzle.throatD=hr1(t.nozzle.throatD*k);t.nozzle.exitD=hr1(t.nozzle.exitD*k);}
    return t;}
  const v=hGet(d,f);if(typeof v!=="number")return null;
  let nv=kind[0]==="x"?v*(dir>0?step:1/step):v+dir*step;
  nv=kind==="xi"||kind==="i"?Math.round(nv):hr1(nv);
  if(nv===v||nv<=0)return null;
  hSet(t,f,nv);
  /* moves a player makes together: the exit follows the throat (same expansion), the core follows the grain's outside */
  if(f==="nozzle.throatD")t.nozzle.exitD=hr1(d.nozzle.exitD*nv/v);
  if((f==="case.id"||f==="case.linerThk")&&t.grain.coreD){const o0=d.case.id-2*d.case.linerThk,o1=t.case.id-2*t.case.linerThk;t.grain.coreD=hr1(d.grain.coreD*o1/o0);}
  return t;}
/* the part tables a hint may pick from, by field */
const HINT_TABLES={"grain.prop":()=>PROPELLANTS,"grain.shape":()=>GRAIN_SHAPES,"case.mat":()=>CASES,"nozzle.mat":()=>THROATS,"case.liner":()=>LINERS,
  igniter:()=>IGNITERS,"airframe.nose":()=>NOSES,"airframe.fins":()=>FINS,"airframe.body":()=>BODIES};
/* swap one part, as a player would: a new grain shape brings that shape's own features (from the solution) */
function hintSwap(c,d,f,v){
  const t=JSON.parse(JSON.stringify(d));
  if(f==="grain.shape"){const g=c.solution&&c.solution.grain&&c.solution.grain.shape===v?c.solution.grain:{shape:v};
    t.grain=Object.assign({},JSON.parse(JSON.stringify(g)),{segs:d.grain.segs,segLen:d.grain.segLen,prop:d.grain.prop,coreD:d.grain.coreD||g.coreD||d.case.id/3});}
  else if(f==="case.closure"){t.case.closure=v;if(v==="bolts"&&!t.case.bolts)t.case.bolts=6;}
  else{if(f.startsWith("airframe.")&&!t.airframe)return null;hSet(t,f,v);}
  return normDesign(t);}
function hint(c,d,o){
  o=o||{};const H=HINT,tG=o.tGrain==null?TUNING.tRef:o.tGrain,tier=o.tier||c.tier||1;
  const base=designScore(c,d,tG,H.steps);
  if(base.s>=1e9)return{kind:"broken"};
  if(base.s<H.sound)return{kind:"sound",base};
  const issue=base.parts[0];
  let best=null;const keep=(t,res)=>{if(!t)return;const r=designScore(c,t,tG,H.steps);if(r.s<base.s*(1-H.gain)&&(!best||r.s<best.to))best=Object.assign(res,{to:r.s});};
  for(const[f,step,kind]of H.moves)for(const dir of[1,-1])keep(hintMove(d,f,kind,step,dir),{kind:"move",f,dir});
  for(const f of H.picks){
    if(f.startsWith("airframe.")&&!c.flight)continue;
    const tab=HINT_TABLES[f](),cur=hGet(d,f),ids=Object.keys(tab),at=ids.indexOf(cur);
    /* igniters are in size order: one size either way (a tiny igniter in a big motor takes ages to simulate, and nobody tries it) */
    for(const v of f==="igniter"?[ids[at-1],ids[at+1]]:ids)if(v&&v!==cur&&(tab[v].tier||1)<=tier)keep(hintSwap(c,d,f,v),{kind:"pick",f,v});}
  /* the job's own solution's parts: a part to look at again, when a different one gets further than any slider */
  for(const f of H.parts){
    const v=c.solution&&hGet(c.solution,f),cur=hGet(d,f),tab=HINT_TABLES[f]&&HINT_TABLES[f]();
    if(v==null||v===cur||(tab&&tab[v]&&(tab[v].tier||1)>tier))continue;
    keep(hintSwap(c,d,f,v),{kind:"part",f,v});}
  if(!best)return{kind:"stuck",issue,from:base.s};
  return Object.assign(best,{issue,from:base.s});}
Object.assign(SIM,{designScore,hintMove,hint});
