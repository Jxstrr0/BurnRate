/* ===================== sim/grade.js: contracts, stand checks and grading (plan section 4) =====================
   A contract's spec is a list of criteria {k, lo, hi} on the measured motor (either bound may be missing):
     I (N·s)  Fav (N)  tb (s)  Pmax (MPa)  Fmax (N)  mass (total, g)  massFrac (%)
   specValue(k, sum, motor) reads one; specCheck(spec, sum, motor) checks them all.
   grade(contract, firing): fail if the firing failed or a criterion is out of its band; otherwise A, B or C by how close
   the two-sided criteria sat to the middle of their bands (one-sided limits are pass or fail only). A case that yielded
   loses one letter (and a C that yields fails).
   preFire(contract, design, motor) lists what stops the motor going on the stand at all: it doesn't fit the stand, or it
   uses parts from a later tier. Each item names the design field to change. */
const SPEC_INFO={
  I:{name:"Total impulse",short:"I",unit:"N·s",dp:1,gloss:"impulse",fix:["grain.segs","grain.segLen"]},
  Fav:{name:"Average thrust",short:"avg",unit:"N",dp:0,gloss:"thrust",fix:["nozzle.throatD","grain.coreD"]},
  tb:{name:"Burn time",short:"burn",unit:"s",dp:2,gloss:"burnTime",fix:["grain.coreD","grain.segLen"]},
  Pmax:{name:"Peak pressure",short:"peak",unit:"MPa",dp:2,gloss:"pressure",fix:["nozzle.throatD"]},
  Fmax:{name:"Peak thrust",short:"peak",unit:"N",dp:0,gloss:"thrust",fix:["nozzle.throatD"]},
  mass:{name:"Motor mass",short:"mass",unit:"g",dp:0,gloss:"motorMass",fix:["case.mat","case.wall"]},
  massFrac:{name:"Mass fraction",short:"frac",unit:"%",dp:0,gloss:"massFrac",fix:["case.mat","case.wall"]}
};
function specValue(k,s,m){
  switch(k){case"I":return s.I;case"Fav":return s.Fav;case"tb":return s.tb;case"Pmax":return s.Pmax/1e6;case"Fmax":return s.Fmax;
    case"mass":return m.mass.total*1000;case"massFrac":return s.massFrac*100;}
  return NaN;}
/* closeness to the middle of a two-sided band: 1 in the middle, 0 at the edge, negative outside */
function specCheck(spec,s,m){
  return spec.map(c=>{const v=specValue(c.k,s,m),lo=c.lo!=null?c.lo:-Infinity,hi=c.hi!=null?c.hi:Infinity,ok=v>=lo&&v<=hi;
    const two=c.lo!=null&&c.hi!=null,close=two?1-Math.abs(v-(lo+hi)/2)/((hi-lo)/2):null;
    return{k:c.k,lo:c.lo,hi:c.hi,v,ok,close,info:SPEC_INFO[c.k]};});}
function grade(contract,f){
  if(!f.ok)return{pass:false,letter:"–",why:"invalid",checks:[]};
  const checks=specCheck(contract.spec,f.meas.sum,f.motor);
  if(f.failure)return{pass:false,letter:"–",why:f.failure.key,checks};
  const miss=checks.filter(c=>!c.ok);
  if(miss.length)return{pass:false,letter:"–",why:"spec",checks,miss};
  const cl=checks.filter(c=>c.close!=null).map(c=>c.close),worst=cl.length?Math.min(...cl):1;
  const G=GRADING;let li=worst>=G.a?0:worst>=G.b?1:2;
  if(f.yielded)li++;
  if(li>2)return{pass:false,letter:"–",why:"yield",checks};
  return{pass:true,letter:"ABC"[li],worst,checks};}
function preFire(contract,design,m){
  const out=[];if(!contract)return out;
  const st=contract.stand,add=(field,text)=>out.push({field,text});
  if(m&&m.ok){
    if(m.length*1000>st.len)add("grain.segLen",`The motor is ${Math.round(m.length*1000)} mm long; ${st.name} takes ${st.len} mm.`);
    if(m.diameter*1000>st.dia)add("case.id",`The motor is ${Math.round(m.diameter*1000)} mm across; ${st.name}'s clamps take ${st.dia} mm.`);}
  const tier=contract.tier||1,parts=[["grain.prop",PROPELLANTS[design.grain.prop],"grade"],["case.mat",CASES[design.case.mat],"case material"],
    ["case.liner",LINERS[design.case.liner],"liner"],["nozzle.mat",THROATS[design.nozzle.mat],"throat material"]];
  for(const[f,p,what]of parts)if(p&&(p.tier||1)>tier)add(f,`${p.name} is a tier ${p.tier} ${what}. This contract allows tier ${tier} parts.`);
  return out;}
Object.assign(SIM,{SPEC_INFO,specValue,specCheck,grade,preFire});
