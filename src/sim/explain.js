/* ===================== sim/explain.js: why the real motor differed from the bench (1.4) =====================
   explainFiring(f, keys) walks from the bench's prediction (20 °C, the grade's and the parts' ratings) to the measured
   motor one cause at a time, re-firing the same motor with each of the firing's own deviations added in turn:
     temp     the grain at the slot's temperature instead of 20 °C
     batch    the propellant batch's burn rate
     igniter  the igniter's gas (start-up)
     throat   the throat's wear rate
     defect   a casting void or a grain crack, if the motor had one
   Each step's change in the spec's numbers is its share; the steps add up exactly to measured minus predicted, because
   the last one is the firing itself. The order is fixed (it matters a little: an effect on top of another is counted
   with the later one). Only for firings that ran to the end: a destructive failure has its own ranked factors
   (sim/fire.js), and a hang fire has no curve to explain.
   keys: the spec numbers to show (sim/grade.js specValue keys); returns {keys, bench:[values], meas:[values],
   steps:[{key, d:[change in each value]}]} or null. Pure: the same firing explains the same way. */
const EXPLAIN_KEYS=["I","Fav","tb","Pmax","Fmax","prog","Isp"];
function explainFiring(f,keys){
  if(!f||!f.ok||!f.meas||f.failure&&(f.failure.destructive||f.failure.key==="hangfire"))return null;
  keys=(keys||[]).filter(k=>EXPLAIN_KEYS.includes(k));
  if(!keys.length)keys=["I","Pmax","tb"];
  const m=f.motor,cond=f.cond,d=f.draws,V=VARIANCE,val=s=>keys.map(k=>specValue(k,s,m));
  const sum=opts=>summarize(m,simulate(m,cond,opts));
  const sBatch=sum({aMul:d.aMul}),sIgn=sum({aMul:d.aMul,ignMul:d.ignMul,ignLight:V.hangS});
  const hook=areaHook(d),sThroat=hook?sum({aMul:d.aMul,ignMul:d.ignMul,ignLight:V.hangS,eroMul:d.eroMul}):f.meas.sum;
  const chain=[["temp",f.pred.sum],["batch",sBatch],["igniter",sIgn],["throat",sThroat]];
  if(hook)chain.push(["defect",f.meas.sum]);
  let prev=val(f.pred20);const bench=prev,steps=[];
  for(const[key,s]of chain){const v=val(s);steps.push({key,d:v.map((x,i)=>x-prev[i])});prev=v;}
  return{keys,bench,meas:val(f.meas.sum),steps};}
Object.assign(SIM,{EXPLAIN_KEYS,explainFiring});
