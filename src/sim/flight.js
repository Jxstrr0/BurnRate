/* ===================== sim/flight.js: flight tests (stage 6; plan section 6.10) =====================
   fly(thrust, rocket, wind) flies a point-mass rocket up a launch rail and on to apogee:
     m · dv/dt = F(t) − m·g − ½ · rho(h) · |v_air|² · Cd(Mach) · A
   with an exponential atmosphere and the propellant mass falling as the impulse is spent. On the rail the rocket only
   moves along it (straight up). Off the rail it points into the air flowing past it (weathercocking), so in a wind it
   tilts upwind and loses height. With no wind this is exactly the plan's vertical 1D flight.
   rocketOf(design, motor, payload) builds the rocket from design.airframe ({body, nose, fins}) and the motor;
   preLaunch(...) lists what stops the range launching it; launch(design, cond, seed, o) fires the motor on the rocket
   (sim/fire.js, the same real-vs-predicted variance as the stand) and flies it on the measured thrust, in a seeded wind
   (its own "wind" stream). f.fpred is the predicted flight (the predictor's curve at this temperature, no wind). */
function airframeOf(d){const a=d&&d.airframe;return a&&BODIES[a.body]&&NOSES[a.nose]&&FINS[a.fins]?a:null;}
/* the smallest body the motor fits, an ogive and the fins that keep it straight (what a flight job's bench opens with) */
function defaultAirframe(m){
  const od=m.diameter*1000,bodies=Object.keys(BODIES).sort((a,b)=>BODIES[a].id-BODIES[b].id);
  const body=bodies.find(k=>BODIES[k].id>=od+FLIGHT.gap)||bodies[bodies.length-1];
  const a={body,nose:"ogive",fins:"three"},L=rocketLen(a,m);
  if(L/(BODIES[body].od/1000)>FINS.three.maxLD)a.fins="four";
  return a;}
function rocketLen(a,m){const b=BODIES[a.body],D=b.od/1000;return m.length+FLIGHT.bayLen+FLIGHT.noseL*D;}
/* the rocket as the flight needs it. payload in kg */
function rocketOf(design,m,payload){
  const a=airframeOf(design);if(!a||!m||!m.ok)return null;
  const b=BODIES[a.body],n=NOSES[a.nose],fi=FINS[a.fins],D=b.od/1000,tubeL=m.length+FLIGHT.bayLen,L=rocketLen(a,m);
  const body=b.kgm*tubeL,nose=b.kgm*FLIGHT.noseL*D*n.mass,fins=fi.mass*Math.pow(b.od/100,2);
  const shell=body+nose+fins,rec=FLIGHT.recovery+FLIGHT.recoveryPerKg*(shell+(payload||0)+m.mass.total-m.mass.prop);
  const dry=shell+rec+(payload||0)+(m.mass.total-m.mass.prop);   // everything but the propellant
  return{a,body:b,nose:n,fins:fi,D,L,LD:L/D,area:PI*D*D/4,cd:FLIGHT.cdBody+n.cd+fi.cd,dry,prop:m.mass.prop,payload:payload||0,
    mass0:dry+m.mass.prop,airframeMass:shell+rec,fits:b.id>=m.diameter*1000+FLIGHT.gap};}
/* what the airframe costs to build for one flight, cr */
function airframeCost(design,m){const a=airframeOf(design);if(!a||!m||!m.ok)return 0;
  const b=BODIES[a.body];return Math.round(b.cost*(m.length+FLIGHT.bayLen)+NOSES[a.nose].cost+FINS[a.fins].cost);}
const machMul=M=>{const T=FLIGHT.mach;if(M<=T[0][0])return T[0][1];for(let i=1;i<T.length;i++)if(M<=T[i][0]){const[a,u]=T[i-1],[b,v]=T[i];return u+(v-u)*(M-a)/(b-a);}return T[T.length-1][1];};
/* the flight. thrust: {t:[s], f:[N]} (a motor run), rocket: rocketOf(...) or any {dry, prop, cd, area}, wind (m/s).
   o.noMach: constant Cd (the tests' analytic check). Returns apogee and the trace (sampled every 0.05 s). */
function fly(thrust,rocket,wind,o){
  o=o||{};const F=FLIGHT,g=F.g0,T=thrust.t,Fv=thrust.f,n=T.length,tEnd=T[n-1];
  /* cumulative impulse, so the propellant left follows the impulse spent */
  const Ic=new Float64Array(n);for(let i=1;i<n;i++)Ic[i]=Ic[i-1]+0.5*(Fv[i]+Fv[i-1])*(T[i]-T[i-1]);
  const Itot=Ic[n-1]||1;let k=0;
  const at=t=>{if(t>=tEnd)return[0,Itot];while(k<n-2&&T[k+1]<t)k++;while(k>0&&T[k]>t)k--;const u=T[k+1]>T[k]?(t-T[k])/(T[k+1]-T[k]):0;
    return[Fv[k]+(Fv[k+1]-Fv[k])*u,Ic[k]+(Ic[k+1]-Ic[k])*u];};
  const w=wind||0,cdA=rocket.cd*rocket.area;
  let t=0,x=0,h=0,vx=0,vh=0,onRail=true,off=false,vRail=0,vMax=0,aMax=0,hBo=0,vBo=0,tOff=null,s=0;
  const out={t:[0],h:[0],x:[0],v:[0]};
  /* liftoff thrust-to-weight: the strongest push in the first 0.3 s against the loaded rocket */
  let F0=0;for(let j=0;j<n&&T[j]<=0.3;j++)F0=Math.max(F0,Fv[j]);
  const twr0=F0/((rocket.dry+rocket.prop)*g);
  while(t<F.tMax){
    const burning=t<tEnd,dt=burning?Math.min(F.dtBurn,Math.max(1e-6,tEnd-t)):F.dtCoast,   // land a step exactly on burnout
      [Ft,It]=at(t),m=rocket.dry+rocket.prop*Math.max(0,1-It/Itot);
    const rho=F.rho0*Math.exp(-Math.max(0,h)/F.hScale),ax_=vx-w,ah_=vh,va=Math.hypot(ax_,ah_);
    const cdm=o.noMach?1:machMul(va/F.sound),D=0.5*rho*va*va*cdA*cdm;
    let ax,ah;
    if(onRail){
      const net=Ft-m*g-(vh>0?D:0);
      if(!off&&net<=0){if(!burning)break;t+=dt;continue;}   // still sitting on the pad
      off=true;if(tOff==null)tOff=t;ax=0;ah=net/m;}
    else{
      /* the rocket points along the air flowing past it; thrust along that, drag against it */
      const ux=va>1e-6?ax_/va:0,uh=va>1e-6?ah_/va:1;
      ax=(Ft*ux-D*ux)/m;ah=(Ft*uh-D*uh)/m-g;}
    aMax=Math.max(aMax,Math.hypot(ax,ah+(onRail?0:g))/g);
    const vh0=vh,h0=h,x0=x;
    const vx0=vx;vx+=ax*dt;vh+=ah*dt;x+=0.5*(vx0+vx)*dt;h+=0.5*(vh0+vh)*dt;t+=dt;   // trapezoid: exact for steady acceleration
    if(onRail&&h>=F.rail){onRail=false;vRail=vh;}
    if(onRail&&h<0){h=0;vh=0;}
    const v=Math.hypot(vx,vh);vMax=Math.max(vMax,v);
    if(burning&&t>=tEnd){hBo=h;vBo=v;}
    if(off&&!onRail&&vh<0&&vh0>=0){   // apogee: interpolate where the climb rate crossed zero
      const u=vh0/(vh0-vh),ha=h0+(h-h0)*u,xa=x0+(x-x0)*u,ta=t-dt+dt*u;
      out.t.push(ta);out.h.push(ha);out.x.push(xa);out.v.push(Math.abs(vx));
      return{ok:true,left:true,apogee:ha,tApo:ta,drift:xa,vMax,aMax,vRail,twr0,hBurnout:hBo,vBurnout:vBo,tOff,wind:w,cd:rocket.cd,samples:out};}
    if(off&&onRail&&vh<0&&!burning)break;
    s+=dt;if(s>=0.05){s=0;out.t.push(t);out.h.push(h);out.x.push(x);out.v.push(v);}}
  return{ok:true,left:off,apogee:Math.max(0,h),tApo:t,drift:x,vMax,aMax,vRail,twr0,hBurnout:hBo,vBurnout:vBo,tOff,wind:w,cd:rocket.cd,samples:out};}
/* the predicted flight for a design on the bench: the predictor's curve, no wind */
function predictFlight(design,m,run,payload){const r=rocketOf(design,m,payload);if(!r)return null;const f=fly(run,r,0);f.rocket=r;return f;}
/* what stops the range launching this rocket. Each item names the design field to change */
function preLaunch(design,m,run,payload,tier){
  const out=[],add=(field,text)=>out.push({field,text}),a=airframeOf(design);
  if(!a){add("airframe.body","Pick a body tube, a nose and fins on the Rocket tab.");return out;}
  if(!m||!m.ok)return out;
  const r=rocketOf(design,m,payload);
  if(!r.fits)add("airframe.body",`The motor is ${Math.round(m.diameter*1000)} mm across; the ${r.body.name} is ${r.body.id} mm inside.`);
  if(r.LD>r.fins.maxLD)add("airframe.fins",`The rocket is ${r.LD.toFixed(0)} body diameters long; ${r.fins.name.toLowerCase()} keep it straight only up to ${r.fins.maxLD}. It would cartwheel off the rail.`);
  if(run){const fl=fly(run,r,0);if(!fl.left)add("nozzle.throatD",`The motor never lifts the ${r.mass0.toFixed(2)} kg rocket off the pad: its thrust is under the rocket's weight.`);}
  if(tier)for(const[f,p,what]of[["airframe.body",r.body,"body tube"],["airframe.nose",r.nose,"nose"],["airframe.fins",r.fins,"fin set"]])
    if((p.tier||1)>tier)add(f,`The ${p.name} is a tier ${p.tier} ${what}. You have tier ${tier} parts so far.`);
  return out;}
/* the wind on a launch day, from the firing's seed */
function windOf(seed){const F=FLIGHT,u=rngStreams(seed).get("wind").next();return F.windMin+(F.windMax-F.windMin)*Math.pow(u,F.windPow);}
/* fire the motor on the rocket and fly it. o: {payload}. A motor that bursts, blows its nozzle or burns through destroys
   the rocket: f.flight.lost = true and the flight ends there. */
function launch(design,cond,seed,o){
  const f=fire(design,cond,seed);if(!f.ok)return f;
  const payload=(o&&o.payload)||0,r=rocketOf(design,f.motor,payload);
  if(!r)return{ok:false,errors:[{field:"airframe.body",text:"No rocket picked."}]};
  const wind=windOf(seed);
  f.fpred=fly(f.pred.run,r,0);f.fpred.rocket=r;
  const lost=f.failure&&f.failure.destructive;
  const fl=fly(f.meas.run,r,wind);fl.rocket=r;
  if(lost){/* the flight stops where the motor failed */
    const tl=f.failure.t,S=fl.samples;let i=S.t.findIndex(v=>v>=tl);if(i<0)i=S.t.length-1;
    fl.lost=true;fl.tLost=tl;fl.hLost=S.h[i];fl.apogee=S.h[i];
    for(const k of["t","h","x","v"])S[k]=S[k].slice(0,i+1);}
  f.flight=fl;f.launch=true;return f;}
Object.assign(SIM,{airframeOf,defaultAirframe,rocketOf,airframeCost,machMul,fly,predictFlight,preLaunch,windOf,launch});
