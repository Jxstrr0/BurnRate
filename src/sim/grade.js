/* ===================== sim/grade.js: contracts, stand checks and grading (plan section 4) =====================
   A contract's spec is a list of criteria {k, lo, hi} on the measured motor (either bound may be missing):
     I (N·s)  Fav (N)  tb (s)  Pmax (MPa)  Fmax (N)  mass (total, g)  massFrac (%)
   specValue(k, sum, motor) reads one; specCheck(spec, sum, motor) checks them all.
   grade(contract, firing): fail if the firing failed or a criterion is out of its band; otherwise A, B or C by how close
   the two-sided criteria sat to the middle of their bands (one-sided limits are pass or fail only). A case that yielded
   loses one letter (and a C that yields fails).
   preFire(contract, design, motor, o) lists what stops the motor going on the stand at all: it doesn't fit the stand, its
   predicted peak thrust is past the stand's load cell (o.sum), or it uses parts from a tier not yet open (o.tier: the
   career's tier; without it, the contract's). Each item names the design field to change.
   Criteria also include prog (curve shape: last third's thrust over the first third's, sim/derive.js) and, on a flight
   job (contract.flight: {payload kg}), apogee (m: the real flight's, sim/flight.js; 0 when the rocket was lost). A flight
   job's stand only sets the motor's size class: the load cell doesn't apply on the rail. */
const SPEC_INFO={
  I:{name:"Total impulse",short:"I",unit:"N·s",dp:1,gloss:"impulse",fix:["grain.segs","grain.segLen"]},
  Fav:{name:"Average thrust",short:"avg",unit:"N",dp:0,gloss:"thrust",fix:["nozzle.throatD","grain.coreD"]},
  tb:{name:"Burn time",short:"burn",unit:"s",dp:2,gloss:"burnTime",fix:["grain.coreD","grain.segLen"]},
  Pmax:{name:"Peak pressure",short:"peak",unit:"MPa",dp:2,gloss:"pressure",fix:["nozzle.throatD"]},
  Fmax:{name:"Peak thrust",short:"peak",unit:"N",dp:0,gloss:"thrust",fix:["nozzle.throatD"]},
  mass:{name:"Motor mass",short:"mass",unit:"g",dp:0,gloss:"motorMass",fix:["case.mat","case.wall"]},
  massFrac:{name:"Mass fraction",short:"frac",unit:"%",dp:0,gloss:"massFrac",fix:["case.mat","case.wall"]},
  prog:{name:"Curve shape",short:"shape",unit:"×",dp:2,gloss:"curveShape",fix:["grain.shape","grain.segLen","grain.coreD"]},
  apogee:{name:"Apogee",short:"apogee",unit:"m",dp:0,gloss:"apogee",fix:["grain.segLen","airframe.nose"]}
};
function specValue(k,s,m){
  switch(k){case"I":return s.I;case"Fav":return s.Fav;case"tb":return s.tb;case"Pmax":return s.Pmax/1e6;case"Fmax":return s.Fmax;
    case"mass":return m.mass.total*1000;case"massFrac":return s.massFrac*100;case"prog":return s.prog;case"apogee":return s.apogee;}
  return NaN;}
/* closeness to the middle of a two-sided band: 1 in the middle, 0 at the edge, negative outside */
function specCheck(spec,s,m){
  return spec.map(c=>{const v=specValue(c.k,s,m),lo=c.lo!=null?c.lo:-Infinity,hi=c.hi!=null?c.hi:Infinity,ok=v>=lo&&v<=hi;
    const two=c.lo!=null&&c.hi!=null,close=two?1-Math.abs(v-(lo+hi)/2)/((hi-lo)/2):null;
    return{k:c.k,lo:c.lo,hi:c.hi,v,ok,close,info:SPEC_INFO[c.k]};});}
function grade(contract,f){
  if(!f.ok)return{pass:false,letter:"–",why:"invalid",checks:[]};
  /* a flight job's apogee is the real flight's (sim/flight.js launch) */
  const sum=f.flight?Object.assign({},f.meas.sum,{apogee:f.flight.lost?0:f.flight.apogee}):f.meas.sum;
  const checks=specCheck(contract.spec,sum,f.motor);
  if(f.failure)return{pass:false,letter:"–",why:f.failure.key,checks};
  const miss=checks.filter(c=>!c.ok);
  if(miss.length)return{pass:false,letter:"–",why:"spec",checks,miss};
  const cl=checks.filter(c=>c.close!=null).map(c=>c.close),worst=cl.length?Math.min(...cl):1;
  const G=GRADING;let li=worst>=G.a?0:worst>=G.b?1:2;
  if(f.yielded)li++;
  if(li>2)return{pass:false,letter:"–",why:"yield",checks};
  return{pass:true,letter:"ABC"[li],worst,checks};}
function preFire(contract,design,m,o){
  const out=[];if(!contract)return out;o=o||{};
  const st=contract.stand,add=(field,text)=>out.push({field,text});
  if(m&&m.ok){
    if(m.length*1000>st.len)add("grain.segLen",`The motor is ${Math.round(m.length*1000)} mm long; ${st.name} takes ${st.len} mm.`);
    if(m.diameter*1000>st.dia)add("case.id",`The motor is ${Math.round(m.diameter*1000)} mm across; ${st.name}'s clamps take ${st.dia} mm.`);
    if(o.sum&&st.cell&&!contract.flight&&o.sum.Fmax>st.cell)add("nozzle.throatD",`The motor peaks at ${(o.sum.Fmax/1000).toFixed(2)} kN; ${st.name}'s load cell is rated ${(st.cell/1000).toFixed(1)} kN.`);}
  const tier=o.tier||contract.tier||1,parts=[["grain.prop",PROPELLANTS[design.grain.prop],"grade"],["grain.shape",GRAIN_SHAPES[design.grain.shape],"grain shape"],["case.mat",CASES[design.case.mat],"case material"],
    ["case.liner",LINERS[design.case.liner],"liner"],["nozzle.mat",THROATS[design.nozzle.mat],"throat material"]];
  for(const[f,p,what]of parts)if(p&&(p.tier||1)>tier)add(f,`${p.name} is a tier ${p.tier} ${what}. You have tier ${tier} parts${o.tier?" so far":" on this job"}.`);
  return out;}
Object.assign(SIM,{SPEC_INFO,specValue,specCheck,grade,preFire});
