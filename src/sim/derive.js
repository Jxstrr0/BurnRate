/* ===================== sim/derive.js: the data sheet, structure checks and warnings (plan sections 6.7 to 6.9) =====================
   summarize(motor, run) turns a run's traces into the numbers a data sheet shows, the structural margins, and the live
   warnings the designer flags (each with the design field to fix and a glossary key). Pure; nothing random.
   predict(design, cond, opts) = motorFromDesign + simulate + summarize, the designer's one call. */
function impulseClass(I){
  if(!(I>0))return{letter:"–",pct:0};
  const k=Math.max(0,Math.ceil(Math.log2(I/TUNING.classTop)-1e-12)),top=TUNING.classTop*Math.pow(2,k),bot=k?top/2:0;
  return{letter:TUNING.classLetters[Math.min(k,TUNING.classLetters.length-1)],pct:Math.round(100*(I-bot)/(top-bot)),top,bot};}
function trapz(y,t,i0,i1){let s=0;for(let i=Math.max(1,i0||1);i<=(i1==null?t.length-1:i1);i++)s+=(y[i]+y[i-1])/2*(t[i]-t[i-1]);return s;}
function summarize(m,r){
  const T=TUNING,n=r.t.length;
  let iF=0,iP=0;for(let i=1;i<n;i++){if(r.f[i]>r.f[iF])iF=i;if(r.p[i]>r.p[iP])iP=i;}
  const Fmax=r.f[iF],Pmax=r.p[iP],I=trapz(r.f,r.t);
  /* burn time: from 5% of peak thrust rising to 5% falling */
  let i0=0,i1=n-1;while(i0<n-1&&r.f[i0]<0.05*Fmax)i0++;while(i1>0&&r.f[i1]<0.05*Fmax)i1--;
  const tb=i1>i0?r.t[i1]-r.t[i0]:0,Fav=tb>0?I/tb:0,Pav=tb>0?trapz(r.p,r.t,i0+1,i1)/tb:0;
  /* the steady part of the burn: igniter spent, web left; Kn range and pressure range there */
  const tSteady=Math.max(m.igniter.burn,r.ign.delay+r.ign.spread)+0.02;   // the igniter is spent
  let knMin=Infinity,knMax=0,pLow=Infinity,pHigh=0,gMax=0;
  for(let i=1;i<n;i++){
    if(r.x[i]<r.web*0.97&&r.t[i]>tSteady){knMin=Math.min(knMin,r.kn[i]);knMax=Math.max(knMax,r.kn[i]);pLow=Math.min(pLow,r.p[i]);pHigh=Math.max(pHigh,r.p[i]);}
    if(r.x[i]<r.web)gMax=Math.max(gMax,r.mdot[i]/m.grain.port(r.x[i]));}
  if(!isFinite(knMin)){knMin=knMax=0;pLow=0;}
  /* a start spike: the peak comes while the igniter is still burning and stands well over the steady burn */
  const spike=pHigh>0&&r.t[iP]<tSteady&&Pmax>T.spikeWarn*pHigh;
  /* curve shape: mean thrust over the last third of the burn over the first third. 1 is neutral, over 1 progressive
     (thrust climbs), under 1 regressive (thrust falls). A tier 2 spec criterion ("prog"). */
  let prog=1;if(tb>0){const a=r.t[i0],b=r.t[i1],th=tb/3;let s1=0,n1=0,s3=0,n3=0;
    for(let i=i0;i<=i1;i++){const t=r.t[i],dt=(r.t[Math.min(i+1,n-1)]-r.t[Math.max(i-1,0)])/2;if(t<a+th){s1+=r.f[i]*dt;n1+=dt;}else if(t>b-th){s3+=r.f[i]*dt;n3+=dt;}}
    if(n1>0&&n3>0&&s1>0)prog=(s3/n3)/(s1/n1);}
  const mp=m.mass.prop,Isp=mp>0?I/(mp*T.g0):0,cls=impulseClass(I);
  const hoop=Pmax*(m.id/2)/m.wall,closureLoad=Pmax*PI*(m.id/2)*(m.id/2);
  const s={I,Fmax,tFmax:r.t[iF],Pmax,tPmax:r.t[iP],tb,tStart:r.t[i0],tEnd:r.t[i1],Fav,Pav,Isp,cls,
    designation:cls.letter+Math.round(Fav),prog,knMin,knMax,pHigh,spike,kn0:m.grain.A(0)/m.At0,pLow,gMax,
    pt0:m.grain.minPort(0)/m.At0,massFrac:mp/m.mass.total,mass:m.mass,
    hoop,sf:m.caseMat.yield*1e6/hoop,sfUlt:m.caseMat.ult*1e6/hoop,closureLoad,closureSf:m.retention/closureLoad,
    linerRating:m.linerRating,burnAll:r.t[n-1],sep:r.sepAny,chuff:r.chuffAny,ign:r.ign,rtEnd:r.rtEnd,
    throatGrowth:r.rtEnd/m.rt0-1,eroPeak:r.eroPeak||1,tEro:r.tEro||0};
  s.warnings=warnings(m,s);
  return s;
}
/* the designer's live flags (plan section 6.8): {key, sev ("warn" | "crit"), text, field (the control to change), gloss} */
function warnings(m,s){
  const T=TUNING,w=[],add=(key,sev,text,field,gloss)=>w.push({key,sev,text,field,gloss:gloss||key});
  const mpa=p=>(p/1e6).toFixed(2)+" MPa";
  if(s.Pmax>m.pUlt)add("burst","crit",`Peak pressure ${mpa(s.Pmax)} is past what the case can hold (${mpa(m.pUlt)}). It will burst.`,"case.wall","cato");
  else if(s.sf<1)add("yield","crit",`Peak pressure ${mpa(s.Pmax)} is past the case's yield (${mpa(m.pYield)}). Safety factor ${s.sf.toFixed(2)}.`,"case.wall","sf");
  else if(s.sf<T.sfWarn)add("sf","warn",`Case safety factor ${s.sf.toFixed(2)} at peak pressure. Aim for ${T.sfWarn} or more.`,"case.wall","sf");
  if(s.closureSf<1)add("closure","crit",`The closures see ${(s.closureLoad/1000).toFixed(1)} kN; the retention is rated ${(m.retention/1000).toFixed(1)} kN. The nozzle will blow out.`,"case.closure","retention");
  else if(s.closureSf<T.sfWarn)add("closure","warn",`Closure retention margin ${s.closureSf.toFixed(2)}. Aim for ${T.sfWarn} or more.`,"case.closure","retention");
  if(s.pLow>0&&s.pLow<m.prop.pMin*1e6)add("chuff","warn",`Pressure falls to ${mpa(s.pLow)}, under ${m.prop.name}'s stable minimum of ${m.prop.pMin} MPa. Expect chuffing.`,"nozzle.throatD","chuffing");
  if(s.pt0<T.ptWarn)add("pt","warn",`Port-to-throat ratio ${s.pt0.toFixed(2)} at ignition. Under ${T.ptWarn}, expect an erosive spike.`,"grain.coreD","portThroat");
  if(s.eroPeak>T.eroWarn)add("ero",s.eroPeak>1.25?"crit":"warn",`Erosive burning: gas scouring the narrow port speeds the burn by up to ${Math.round((s.eroPeak-1)*100)}% at ${s.tEro.toFixed(2)} s, and the pressure with it.`,"grain.coreD","erosive");
  if(s.gMax>T.gWarn)add("flux","warn",`Peak mass flux ${Math.round(s.gMax)} kg/m²s. Over ${T.gWarn}, the port scours the grain.`,"grain.coreD","massFlux");
  if(s.tb>m.linerRating)add("liner","crit",`The burn lasts ${s.tb.toFixed(1)} s; the liner protects the case for ${m.linerRating.toFixed(1)} s. Expect a burn-through.`,"case.linerThk","liner");
  else if(s.tb>T.linerWarn*m.linerRating)add("liner","warn",`The burn (${s.tb.toFixed(1)} s) uses most of the liner's ${m.linerRating.toFixed(1)} s.`,"case.linerThk","liner");
  if(s.sep)add("sep","warn","The nozzle is over-expanded for the ground: the flow separates and thrust drops.","nozzle.exitD","separation");
  if(s.spike)add("spike","warn",`The igniter alone pushes the chamber to ${mpa(s.Pmax)}, well over the burn's ${mpa(s.pHigh)}. A smaller igniter would do.`,"igniter","ignSpike");
  if(s.ign.strength<T.ignWeak)add("ign","warn",`The igniter is weak for this motor (strength ${s.ign.strength.toFixed(2)}). Slow start or a hang fire.`,"igniter","hangFire");
  return w;
}
function predict(design,cond,opts){const m=motorFromDesign(design);if(!m.ok)return{ok:false,errors:m.errors};const r=simulate(m,cond,opts);return{ok:true,motor:m,run:r,sum:summarize(m,r)};}
Object.assign(SIM,{impulseClass,trapz,summarize,warnings,predict});
