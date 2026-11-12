/* ===================== sim/ballistics.js: the firing, step by step (plan sections 6.3 to 6.6) =====================
   simulate(motor, cond, opts) fires a motor from motorFromDesign() and returns its traces.

   The model is the textbook lumped chamber: one pressure for the whole chamber, gas mass m = P·Vfree/RT, with
     dm/dt = (propellant burned) + (igniter gas) − (flow out of the throat)
     burned = rho · (V(x) − V(x + r·dt)),   r = a·P^n,   out = P·At/c* (choked; less when it isn't)
   It is stepped with backward Euler: each step solves for the new pressure so the mass balance closes exactly, so the
   mass that leaves the nozzle is the propellant + igniter gas + the air that was in the chamber, to rounding. Backward
   Euler is stable for any step, so once the igniter has done its work the steps grow to about web/steps of regression
   each (the plan's "step by web distance") and the pressure sits on the quasi-steady value P = (Kn·a·rho·c*)^(1/(1−n)).
   When the web is gone the same equation, with nothing burning, is the exponential blowdown of the tail-off
   (time constant tau = Vfree / (At · c* · Gamma²)).

   The igniter (plan section 6.3): its gas arrives over its burn time; first light comes after a delay and the flame
   spreads over the grain, both slower for a weaker igniter (strength = igniter gas / gas the chamber needs). Burning area
   is scaled by the lit fraction while the flame spreads.
   Temperature (6.6): a = a20 · exp(sigmaP · (T − 20)). Throat erosion (6.4): the throat radius grows at the material's
   rate · (P / 5 MPa)^0.8. Erosive burning (6.5) arrives in stage 5.

   cond: {tGrain (°C, default 20), pAmb (Pa, default TUNING.pAmb)}
   opts (the variance model's hooks, stage 3; all optional): {aMul, eroMul, ignMul, areaAdd(t, x) -> extra m²}
   Returns {ok, t[], p[], f[], kn[], x[], mdot[], at[], ign:{strength, delay, spread}, sepAny, chuffAny, notLit, ...}. */
function propCoef(prop,tGrain){return prop.rRef/1000/Math.pow(TUNING.pRef,prop.n)*Math.exp(prop.sigmaP*(tGrain-TUNING.tRef));}
function simulate(motor,cond,opts){
  cond=cond||{};opts=opts||{};
  const T=TUNING,prop=motor.prop,G=motor.grain,g=prop.gamma,cs=prop.cStar,rho=prop.rho;
  const RT=Math.pow(cs*vdk(g),2),n=prop.n,Pa=cond.pAmb!=null?cond.pAmb:T.pAmb,tGrain=cond.tGrain!=null?cond.tGrain:T.tRef;
  const a=propCoef(prop,tGrain)*(opts.aMul||1),eroRate=motor.throatMat.ero/1000*(opts.eroMul==null?1:opts.eroMul);
  const Vch=motor.Vch,web=G.web,dxT=web/T.steps,areaAdd=opts.areaAdd||null;
  /* igniter */
  const ig=motor.igniter,igGas=ig.gas*(opts.ignMul==null?1:opts.ignMul),need=T.ignNeedVol*(Vch-G.V(0))+T.ignNeedArea*G.A(0);
  const S=Math.max(1e-6,igGas/need),delay=T.ignDelay/S,spread=T.ignSpread/(S*S);
  const notLit=S<(opts.ignLight!=null?opts.ignLight:0);   // the variance model can set a hang-fire threshold
  const lit=t=>notLit?0:Math.max(0,Math.min(1,(t-delay)/spread));
  const igIn=(t0,t1)=>igGas*Math.max(0,Math.min(t1,ig.burn)-Math.min(t0,ig.burn))/ig.burn;
  /* outputs */
  const o={t:[],p:[],f:[],kn:[],x:[],mdot:[],at:[],cf:[]};
  let t=0,x=0,P=Pa,rt=motor.rt0,mg=P*(Vch-G.V(0))/RT,rLast=0,sepAny=false,chuffAny=false,mOut=0,mBurn=0,mIgn=0,steps=0;
  const m0=mg;
  let thrustCache={at:-1};
  const thrust=(Pn,At)=>{
    if(Math.abs(At-thrustCache.at)>1e-4*At){const eps=motor.Ae/At;thrustCache={at:At,eps,prE:presRatio(exitMach(eps,g),g)};}
    const c=thrustCoef(Pn,Pa,thrustCache.eps,g,thrustCache.prE);
    return{F:motor.eta*c.cf*Pn*At,cf:c.cf,sep:c.sep};};
  const push=(Pn,At,F,cf,mdot)=>{o.t.push(t);o.p.push(Pn);o.f.push(F);o.kn.push((G.A(x)+(areaAdd?areaAdd(t,x):0))/At);o.x.push(x);o.mdot.push(mdot);o.at.push(At);o.cf.push(cf);};
  push(P,PI*rt*rt,0,0,0);
  const ignEnd=Math.max(ig.burn,delay+spread);
  while(t<T.tMax&&steps<200000){
    steps++;
    const At=PI*rt*rt,burning=x<web,inIgn=t<ignEnd+0.01;
    let dt;
    if(inIgn)dt=T.dtIgn;
    else if(burning)dt=Math.min(T.dtMax,dxT/Math.max(rLast,1e-5));
    else{const tau=Math.max(1e-5,(Vch-G.V(x))/(At*cs*vdk(g)*vdk(g)));dt=Math.min(0.01,Math.max(2e-4,tau/4));}
    const t1=t+dt,fl=lit(t1),ign=igIn(t,t1),V0=G.V(x),mOld=mg;
    const xOf=Pn=>burning&&fl>0?Math.min(web,x+fl*a*Math.pow(Pn,n)*dt):x;
    /* extra burning area from the variance model (a void or a crack) burns at the same rate as the grain */
    const extra=areaAdd?areaAdd(t1,x):0;
    const resid=Pn=>{const xn=xOf(Pn),Vn=G.V(xn);
      const gen=rho*(V0-Vn)+(extra>0&&fl>0?rho*extra*a*Math.pow(Pn,n)*dt:0);
      const out=Pn*At/cs*chokedFrac(Pn,Pa,g)*dt;
      return(Vch-Vn)*Pn/RT-mOld-gen-ign+out;};
    /* bracket and solve (bisection on log P with a secant guess; fixed upper bound on iterations) */
    let lo=Math.min(Pa,P)*0.5,hi=Math.max(P,Pa)*2,rl=resid(lo),rh=resid(hi),k=0;
    while(rh<0&&k++<80){lo=hi;rl=rh;hi*=2;rh=resid(hi);}
    k=0;while(rl>0&&k++<60){hi=lo;rh=rl;lo*=0.5;rl=resid(lo);}
    let Pn=hi;
    for(let i=0;i<64;i++){
      let m=lo-rl*(hi-lo)/(rh-rl);                         // secant (regula falsi) guess
      if(!(m>lo&&m<hi)||i%3===2)m=Math.sqrt(lo*hi);        // every third step, or if it misbehaves: bisect in log P
      const rm=resid(m);
      if(rm<0){lo=m;rl=rm;}else{hi=m;rh=rm;}
      Pn=m;if((hi-lo)<1e-9*hi)break;}
    const xn=xOf(Pn),gen=rho*(V0-G.V(xn))+(extra>0&&fl>0?rho*extra*a*Math.pow(Pn,n)*dt:0),out=Pn*At/cs*chokedFrac(Pn,Pa,g)*dt;
    x=xn;t=t1;P=Pn;mg=(Vch-G.V(x))*P/RT;mOut+=out;mBurn+=gen;mIgn+=ign;
    rLast=fl*a*Math.pow(P,n);
    if(burning&&fl>=1&&P<prop.pMin*1e6&&x<web*0.98)chuffAny=true;
    rt+=eroRate*Math.pow(P/T.pRef,T.eroExp)*dt;
    const th=thrust(P,At);if(th.sep&&burning&&fl>=1&&x<web*0.97)sepAny=true;   // separation in the steady burn, not the start-up or tail
    push(P,At,th.F,th.cf,out/dt);
    if(!burning&&P<T.tailEnd*Pa)break;
    if(notLit&&t>ig.burn+0.3&&P<T.tailEnd*Pa)break;
  }
  return{ok:true,...o,ign:{strength:S,delay,spread,notLit},sepAny,chuffAny,notLit,
    a,tGrain,pAmb:Pa,steps,web,mass:{out:mOut,burned:mBurn,ign:mIgn,gas0:m0,gasEnd:mg},rtEnd:rt};
}
Object.assign(SIM,{propCoef,simulate});
