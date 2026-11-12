/* ===================== sim/fire.js: a static firing, the real motor (plan sections 7 and 8) =====================
   fire(design, cond, seed) builds the motor, predicts it at the firing's grain temperature, draws the real motor's
   deviations from named random streams (data/variance.js), fires it, and walks the trace for the first failure:
     cato        the pressure passed what this case tube could hold (its ultimate, after its strength spread)
     eject       the force on the closures passed their retention: the nozzle blew out
     burnthrough the grain was still burning when the liner's protection ran out
     hangfire    the igniter never lit the grain
     chuff       the pressure sat under the grade's stable minimum (not destructive, but no grade)
   After a burst, an ejection or a burn-through the trace is cut there and the chamber vents. The measured trace is then
   logged at the data logger's rate with a little sensor noise (its own stream, display only).
   Returns {ok, motor, cond, seed, draws, events, pred:{run,sum} (predicted at this temperature), pred20 (at 20 °C, what
   the designer showed), meas:{run,sum}, log:{t,p,f}, plog:{t,p,f}, failure:{key,t,i,text,fix,destructive} | null,
   notes:[{key,text,fix}], factors:[{key,text,pct}] (ranked), yielded}. Pure and deterministic: same design, cond
   and seed, same firing. cond: {tGrain (°C), pAmb, logRate (the data logger's Hz; the blockhouse level sets it)}. */
function riseRate(run,tUntil){let r=0;for(let i=1;i<run.t.length&&run.t[i]<=tUntil;i++){const dt=run.t[i]-run.t[i-1];if(dt>0)r=Math.max(r,(run.p[i]-run.p[i-1])/dt);}return r/1e6;}
function peak(a){let m=0;for(const v of a)if(v>m)m=v;return m;}
const lerpR=(r,u)=>r[0]+(r[1]-r[0])*u;
/* the real motor's deviations. Every stream always makes the same draws in the same order, so a tuning change to one
   chance never moves another source's numbers. */
function drawVariance(m,cond,seed,pred){
  const V=VARIANCE,S=rngStreams(seed),G=m.grain;
  const d={
    aMul:Math.max(0.7,1+S.get("batch").normal(0,m.prop.aVar)),
    caseMul:Math.max(0.6,1+S.get("case").normal(0,m.caseMat.sVar)),
    eroMul:Math.max(V.eroMin,1+S.get("throat").normal(0,V.eroSd)),
    ignMul:Math.max(V.ignMin,1+S.get("igniter").normal(0,V.ignSd)),
    retMul:Math.max(0.6,1+S.get("closure").normal(0,V.retSd)),
    linerMul:Math.max(0.5,1+S.get("liner").normal(0,V.linerSd))};
  const litres=m.mass.prop/m.prop.rho*1000;
  const vr=S.get("voids"),vu=vr.next(),vAt=lerpR(V.voidAt,vr.next()),vArea=lerpR(V.voidArea,vr.next()),vLen=lerpR(V.voidLen,vr.next());
  d.voidChance=Math.min(V.voidMax,V.voidBase+V.voidPerSeg*m.design.grain.segs+V.voidPerL*litres);
  d.void=vu<d.voidChance?{x0:vAt*G.web,x1:(vAt+vLen)*G.web,area:vArea*G.A(vAt*G.web),frac:vArea}:null;
  const cr=S.get("cracks"),cu=cr.next(),cAt=lerpR(V.crackAt,cr.next()),cArea=lerpR(V.crackArea,cr.next());
  const tSteady=Math.max(m.igniter.burn,pred.ign.delay+pred.ign.spread)+0.02;
  d.rise=riseRate(pred,tSteady+0.05);
  const cold=Math.max(0,V.crackWarm-(cond.tGrain!=null?cond.tGrain:TUNING.tRef));
  d.crackChance=Math.min(V.crackMax,V.crackBase*(1+V.crackCold*cold)*Math.pow(Math.max(0,d.rise)/V.crackRise,V.crackRiseExp));
  d.crack=cu<d.crackChance?{x0:cAt*G.web,area:cArea*G.A(cAt*G.web),frac:cArea}:null;
  return d;
}
function areaHook(d){
  if(!d.void&&!d.crack)return null;
  return(t,x)=>(d.void&&x>=d.void.x0&&x<d.void.x1?d.void.area:0)+(d.crack&&x>=d.crack.x0?d.crack.area:0);}
/* cut a run's traces after sample i, then let the chamber vent: pressure falls to ambient with time constant tau;
   thrust falls with it (or at once, when the nozzle has gone) */
const RUN_KEYS=["t","p","f","kn","x","mdot","at","cf"];
function cutAndVent(run,i,tau,thrustNow){
  const o=Object.assign({},run);for(const k of RUN_KEYS)o[k]=run[k].slice(0,i+1);
  const t0=o.t[i],p0=o.p[i],f0=thrustNow?o.f[i]:0,Pa=run.pAmb;
  for(let j=1;j<=30;j++){const dt=tau*5*j/30,e=Math.exp(-dt/tau);
    o.t.push(t0+dt);o.p.push(Pa+(p0-Pa)*e);o.f.push(f0*e);o.kn.push(o.kn[i]);o.x.push(o.x[i]);o.mdot.push(o.mdot[i]*e);o.at.push(o.at[i]);o.cf.push(o.cf[i]);}
  return o;}
/* the data logger: resample to a steady rate, add sensor noise. A chuffing burn is drawn pulsing where it sat under pMin. */
function logTrace(run,seed,noise,chuff,rate){
  const V=VARIANCE,n=run.t.length,tEnd=run.t[n-1],dt=Math.max(1/(rate||V.logRate),tEnd/V.logMax),out={t:[],p:[],f:[]};
  const rn=noise?rngStreams(seed).get("sensor"):null,pPk=peak(run.p),fPk=peak(run.f);
  let j=0;
  for(let t=0;t<=tEnd+1e-9;t+=dt){
    while(j<n-2&&run.t[j+1]<t)j++;
    const t0=run.t[j],t1=run.t[j+1],u=t1>t0?Math.max(0,Math.min(1,(t-t0)/(t1-t0))):0;
    let p=run.p[j]+(run.p[j+1]-run.p[j])*u,f=run.f[j]+(run.f[j+1]-run.f[j])*u;
    if(chuff&&p<chuff.pMin&&run.x[j]<run.web*0.98&&t>chuff.t0){const k=Math.pow(0.5+0.5*Math.cos(2*PI*V.chuffHz*t),2);p=run.pAmb+(p-run.pAmb)*(0.15+1.7*k);f*=0.15+1.7*k;}
    if(rn){p+=rn.normal(0,V.noiseP*pPk);f+=rn.normal(0,V.noiseF*fPk);}
    out.t.push(t);out.p.push(Math.max(0,p));out.f.push(Math.max(0,f));}
  /* always end on the run's last sample, so a failure moment is on the log */
  if(out.t[out.t.length-1]<tEnd-1e-9){out.t.push(tEnd);out.p.push(run.p[n-1]);out.f.push(run.f[n-1]);}
  return out;}
const mpa=p=>(p/1e6).toFixed(2)+" MPa",pct=v=>(v>=0?"+":"−")+Math.abs(v*100).toFixed(0)+"%";
/* "4% stronger than its rating" */
const vs=(mul,up,dn)=>`${Math.abs((mul-1)*100).toFixed(Math.abs(mul-1)<0.1?1:0)}% ${mul>=1?up:dn}`;
function fire(design,cond,seed){
  const m=motorFromDesign(design);if(!m.ok)return{ok:false,errors:m.errors};
  cond=Object.assign({tGrain:TUNING.tRef},cond||{});seed=String(seed);
  const pred=simulate(m,cond),predSum=summarize(m,pred),pred20=summarize(m,simulate(m,{tGrain:TUNING.tRef,pAmb:cond.pAmb}));
  const d=drawVariance(m,cond,seed,pred),V=VARIANCE;
  const hook=areaHook(d),opts={aMul:d.aMul,eroMul:d.eroMul,ignMul:d.ignMul,ignLight:V.hangS,areaAdd:hook};
  let run=simulate(m,cond,opts);
  /* the same firing without the void or crack, to say how much they added */
  const base=hook?simulate(m,cond,Object.assign({},opts,{areaAdd:null})):run;
  const pBurst=m.pUlt*d.caseMul,pYield=m.pYield*d.caseMul,ret=m.retention*d.retMul,linerT=m.linerRating*d.linerMul,Ab=PI*(m.id/2)*(m.id/2);
  const tLit=run.ign.delay;
  let failure=null,yielded=false,pMaxSeen=0;
  if(run.notLit)failure={key:"hangfire",t:run.ign.delay,i:0,destructive:false};
  else for(let i=1;i<run.t.length;i++){
    const p=run.p[i],t=run.t[i];pMaxSeen=Math.max(pMaxSeen,p);
    if(p>pBurst){failure={key:"cato",t,i,destructive:true,p};break;}
    if(p*Ab>ret){failure={key:"eject",t,i,destructive:true,p,load:p*Ab};break;}
    if(run.x[i]<run.web*0.98&&t-tLit>linerT){failure={key:"burnthrough",t,i,destructive:true,p};break;}
    if(p>pYield)yielded=true;}
  if(failure&&failure.destructive){
    const tau=V.ventTau*(failure.key==="burnthrough"?3:1);
    run=cutAndVent(run,failure.i,tau,failure.key==="burnthrough");
    failure.i=run.t.length-31;}
  if(!failure&&run.chuffAny)failure={key:"chuff",t:null,i:-1,destructive:false};
  const sum=summarize(m,run);
  const events=[];
  const xT=x=>{const k=run.x.findIndex(v=>v>=x);return k<0?null:run.t[k];};
  if(d.void){const t=xT(d.void.x0);if(t!=null&&(!failure||!failure.destructive||t<=failure.t))events.push({key:"void",t,frac:d.void.frac});}
  if(d.crack){const t=xT(d.crack.x0);if(t!=null&&(!failure||!failure.destructive||t<=failure.t))events.push({key:"crack",t,frac:d.crack.frac});}
  const evText=events.map(e=>e.key==="void"?`A casting void at ${e.t.toFixed(2)} s added ${Math.round(e.frac*100)}% burning area.`
    :`A crack opened in the grain at ${e.t.toFixed(2)} s, adding ${Math.round(e.frac*100)}% burning area.`).join(" ");
  /* the root cause in one sentence, the fields to change, the factors that pushed it over, ranked */
  const factors=[],addF=(key,v,text)=>{if(isFinite(v))factors.push({key,pct:v,text});};
  const cg=cond.tGrain,slotTxt=`${cg>TUNING.tRef?"Warm":"Cold"} grain (${Math.round(cg)} °C)`;
  if(failure){
    const k=failure.key,f=failure;
    if(k==="cato"||k==="eject"){
      f.text=k==="cato"?`Peak pressure reached ${mpa(f.p)}; this case could hold ${mpa(pBurst)}.`
        :`The closures took ${(f.load/1000).toFixed(1)} kN at ${mpa(f.p)}; the retention held ${(ret/1000).toFixed(1)} kN. The nozzle let go at ${f.t.toFixed(2)} s.`;
      if(evText)f.text+=" "+evText;
      f.fix=k==="cato"?["case.wall","nozzle.throatD","case.mat"]:(design.case.closure==="bolts"?["case.bolts","case.closure","nozzle.throatD"]:["case.closure","nozzle.throatD"]);
      if(d.crack)f.fix.push("igniter");
      addF("margin",pred20.Pmax/(k==="cato"?m.pUlt:m.retention/Ab)-1,`Design margin: the predictor's peak at 20 °C was ${mpa(pred20.Pmax)} against a limit of ${mpa(k==="cato"?m.pUlt:m.retention/Ab)}.`);
      addF("temp",predSum.Pmax/pred20.Pmax-1,`${slotTxt}: ${pct(predSum.Pmax/pred20.Pmax-1)} pressure against the 20 °C prediction.`);
      addF("batch",peak(base.p)/predSum.Pmax-1,`This propellant batch burned ${vs(d.aMul,"faster","slower")} than the grade's rate: ${pct(peak(base.p)/predSum.Pmax-1)} pressure.`);
      if(hook)addF(d.crack?"crack":"void",peak(run.p.slice(0,f.i+1))/peak(base.p)-1,(d.crack?"The crack":"The void")+` added ${pct(peak(run.p.slice(0,f.i+1))/peak(base.p)-1)} pressure.`);
      if(k==="cato")addF("case",1-d.caseMul,`This case tube tested ${vs(d.caseMul,"stronger","weaker")} than its rating.`);
      else addF("closure",1-d.retMul,`These closures held ${vs(d.retMul,"more","less")} than their rating.`);
    }else if(k==="burnthrough"){
      f.text=`The grain was still burning at ${f.t.toFixed(2)} s; the liner protected the case for ${linerT.toFixed(2)} s. Hot gas burned through the wall.`;
      f.fix=["case.linerThk","case.liner","grain.coreD"];
      addF("margin",pred20.tb/m.linerRating-1,`Design margin: the predicted burn at 20 °C lasted ${pred20.tb.toFixed(2)} s against a liner rated ${m.linerRating.toFixed(2)} s.`);
      addF("temp",predSum.tb/pred20.tb-1,`${slotTxt}: ${pct(predSum.tb/pred20.tb-1)} burn time.`);
      addF("liner",1-d.linerMul,`This liner protected ${vs(d.linerMul,"longer","shorter")} than its rating.`);
      addF("batch",1/d.aMul-1,`This propellant batch burned ${vs(d.aMul,"faster","slower")} than the grade's rate.`);
    }else if(k==="hangfire"){
      const S=run.ign.strength;
      f.text=`The igniter delivered ${vs(d.ignMul,"more","less")} gas than its rating: strength ${(S*d.ignMul).toFixed(2)}, under the ${V.hangS.toFixed(2)} the grain needs to light. It never caught.`;
      f.fix=["igniter"];
      addF("margin",V.hangS/S-1,`Design margin: the igniter's rated strength is ${S.toFixed(2)}; under ${TUNING.ignWeak} is risky.`);
      addF("igniter",1-d.ignMul,`This igniter gave ${vs(d.ignMul,"more","less")} gas than its rating.`);
    }else if(k==="chuff"){
      f.text=`Pressure fell to ${mpa(sum.pLow)}, under ${m.prop.name}'s stable minimum of ${m.prop.pMin} MPa. The flame puffed out and relit: no grade.`;
      f.fix=["nozzle.throatD","grain.segs"];
      addF("margin",m.prop.pMin*1e6/pred20.pLow-1,`Design margin: the predictor's lowest steady pressure at 20 °C was ${mpa(pred20.pLow)}.`);
      addF("temp",pred20.pLow/predSum.pLow-1,`${slotTxt}: ${pct(predSum.pLow/pred20.pLow-1)} pressure against the 20 °C prediction.`);
      addF("batch",1/Math.pow(d.aMul,1/(1-m.prop.n))-1,`This propellant batch burned ${vs(d.aMul,"faster","slower")} than the grade's rate.`);
    }
    factors.sort((a,b)=>b.pct-a.pct);
  }
  const notes=[];
  if(yielded&&!(failure&&failure.key==="cato"))notes.push({key:"yield",text:`Peak pressure ${mpa(sum.Pmax)} passed this case's yield (${mpa(pYield)}): the tube stretched and can't fly. One grade off.`,fix:["case.wall"]});
  if(run.sepAny)notes.push({key:"sep",text:"The flow separated in the nozzle at ground pressure: thrust came in short.",fix:["nozzle.exitD"]});
  if(events.length&&!(failure&&failure.destructive))notes.push({key:events[0].key,text:evText,fix:[]});
  const chuffInfo=failure&&failure.key==="chuff"?{pMin:m.prop.pMin*1e6,t0:Math.max(m.igniter.burn,run.ign.delay+run.ign.spread)+0.02}:null;
  return{ok:true,motor:m,cond,seed,draws:d,events,pred:{run:pred,sum:predSum},pred20,meas:{run,sum},
    log:logTrace(run,seed,true,chuffInfo,cond.logRate),plog:logTrace(pred,seed,false,null,cond.logRate),
    failure,notes,factors,yielded,limits:{pBurst,pYield,ret,linerT}};
}
Object.assign(SIM,{riseRate,drawVariance,fire});
