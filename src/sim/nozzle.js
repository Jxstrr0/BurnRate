/* ===================== sim/nozzle.js: the nozzle and thrust coefficient (plan section 6.4) =====================
   Ideal one-dimensional isentropic flow of a frozen gas with ratio of specific heats gamma.
     areaRatio(M, g)        A/A* at Mach M
     exitMach(eps, g)       the supersonic Mach number with A/A* = eps (bisection, a fixed 80 steps, so it is deterministic)
     presRatio(M, g)        P/Pc at Mach M
     cfIdeal(pe, pa, pc, eps, g)  thrust coefficient: momentum term + pressure term
     vdk(g)                 Gamma, the Vandenkerckhove function: RT = (c* · Gamma)²
     chokedFrac(pc, pa, g)  mass flow through the throat as a fraction of the choked value (1 when choked)
     thrustCoef(...)        C_F with flow separation (Summerfield: the jet leaves the wall where pressure would fall under
                            sepRatio x ambient); returns {cf, sep} */
function vdk(g){return Math.sqrt(g)*Math.pow(2/(g+1),(g+1)/(2*(g-1)));}
function areaRatio(M,g){return(1/M)*Math.pow((2/(g+1))*(1+(g-1)/2*M*M),(g+1)/(2*(g-1)));}
function presRatio(M,g){return Math.pow(1+(g-1)/2*M*M,-g/(g-1));}
function exitMach(eps,g){
  if(eps<=1)return 1;
  let lo=1,hi=2;while(areaRatio(hi,g)<eps&&hi<64)hi*=2;
  for(let i=0;i<80;i++){const m=(lo+hi)/2;if(areaRatio(m,g)<eps)lo=m;else hi=m;}
  return(lo+hi)/2;}
/* the subsonic Mach number with A/A* = eps (for a nozzle that is not running full) */
function subMach(eps,g){if(eps<=1)return 1;let lo=1e-6,hi=1;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(areaRatio(m,g)>eps)lo=m;else hi=m;}return(lo+hi)/2;}
function cfMomentum(prr,g){return Math.sqrt(2*g*g/(g-1)*Math.pow(2/(g+1),(g+1)/(g-1))*Math.max(0,1-Math.pow(prr,(g-1)/g)));}
function cfIdeal(pe,pa,pc,eps,g){return cfMomentum(pe/pc,g)+(pe-pa)/pc*eps;}
function chokedFrac(pc,pa,g){
  if(pc<=pa)return 0;
  const pr=pa/pc,crit=Math.pow(2/(g+1),g/(g-1));
  if(pr<=crit)return 1;
  return Math.sqrt(2*g/(g-1)*(Math.pow(pr,2/g)-Math.pow(pr,(g+1)/g)))/vdk(g);}
/* C_F for chamber pressure pc against ambient pa through a nozzle of expansion ratio eps (exit Mach mE, exit ratio prE
   precomputed by the caller since they only change when the throat erodes) */
function thrustCoef(pc,pa,eps,g,prE){
  if(pc<=pa)return{cf:0,sep:false,choked:false};
  const crit=Math.pow(2/(g+1),g/(g-1));
  if(pa/pc>crit){   // not choked: a subsonic jet leaving the throat at ambient pressure, F/(pc·At) = rho·v²/pc
    const pr=pa/pc,cf=2*g/(g-1)*(Math.pow(pr,1/g)-pr);
    return{cf:Math.max(0,cf),sep:false,choked:false};}
  const pe=prE*pc,pSep=TUNING.sepRatio*pa;
  if(pe>=pSep)return{cf:Math.max(0,cfIdeal(pe,pa,pc,eps,g)),sep:false,choked:true};
  /* separated: the flow follows the wall only out to where the pressure reaches pSep; past that the wall sees about
     ambient. Thrust is what a nozzle cut off at that area ratio would give, plus nothing from the rest. */
  const prS=pSep/pc;
  if(prS>=crit)return{cf:Math.max(0,cfMomentum(crit,g)+(crit*pc-pa)/pc),sep:true,choked:true};
  const mS=Math.sqrt(2/(g-1)*(Math.pow(prS,-(g-1)/g)-1)),epsS=areaRatio(mS,g);
  return{cf:Math.max(0,cfIdeal(pSep,pa,pc,epsS,g)),sep:true,choked:true,epsS};
}
/* nozzle efficiency from the divergence half-angle (conical nozzle: lambda = (1 + cos a)/2) and the throat finish */
function nozzleEta(halfDeg,finish){return(1+Math.cos(halfDeg*PI/180))/2*finish;}
Object.assign(SIM,{vdk,areaRatio,presRatio,exitMach,subMach,cfMomentum,cfIdeal,chokedFrac,thrustCoef,nozzleEta});
