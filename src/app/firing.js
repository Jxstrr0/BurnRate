/* ===================== app/firing.js: the static firing screen (plan sections 4 and 9.2) =====================
   A countdown, then the stand and the live strip chart: the measured trace (red) draws over the prediction (blue) as
   the motor burns, with pressure, thrust and time gauges. Burns shorter than 2 s play slowed down and burns longer than
   7 s sped up (the speed shows on screen). Abort works during the countdown; once it's lit, it's lit.
   With reduced motion on, the countdown is skipped, the burn plays without flicker or shake.
   A launch (f.flight) shows the rocket climbing from the rail (vis/flight.js sky) in place of the stand, and plays on
   past burnout to apogee: the coast is sped up to take about four seconds. The first gauge reads height.
   Stage 7: when the 3D range is loaded (app/gfx.js) the stand and the launch play in 3D (vis/stand3d.js) instead of the
   2D drawings. A motor that fails destructively gets a slow-motion replay of the moment it went (0.3x, from half a second
   before), once on its own and again from the "Watch it again" button. */
const FR={raf:0,t0:0,phase:"idle",sp:1,count:0,tEnd:0,fPk:1,tFly:0,spC:1,d3:false,rp0:0,rp1:0,replayed:false};
const REPLAY_SP=0.3,REPLAY_PRE=0.5,REPLAY_POST=1.4;   // replay speed, and seconds shown before and after the failure
const COAST_S=4;   // seconds the coast to apogee takes on screen
/* sim time at el seconds into the burn phase: the burn at FR.sp, then a launch's coast at FR.spC */
const frTime=el=>{const tb=FR.tEnd/FR.sp;return el<=tb||!FR.tFly?el*FR.sp:FR.tEnd+(el-tb)*FR.spC;};
const FIRE_COUNT=3,COUNT_STEP=0.7,AFTER=2.6;   // countdown from 3, seconds per number; seconds the stand keeps running after the burn
const FAIL_LABEL={cato:"burst",eject:"nozzle out",burnthrough:"burn-through"};
function openFiring(){
  const L=GAME.last,f=L.f,sl=BURN_SIM.SLOTS[L.slot],tG=L.tGrain??sl.tGrain;
  showScreen("fire");
  const fly=f.flight||null;
  $("frSite").textContent=`${fly?"Launch rail":L.c?BURN_SIM.STANDS[L.c.stand].name:"Stand 3"} · ${sl.name} · ${degC(tG)} grain${fly?` · wind ${fly.wind.toFixed(1)} m/s`:""}`;$("frDes").textContent=f.pred.sum.designation;
  $("frPL").textContent=fly?"Height":"Pressure";$("frPU").textContent=fly?"m":"MPa";
  $("fire").setAttribute("aria-label",fly?"Launch":"Static firing");
  const n=f.log.t.length;FR.tEnd=f.log.t[n-1];
  FR.tFly=fly?Math.max(FR.tEnd,fly.lost?fly.tLost:fly.tApo):0;FR.spC=fly?Math.max(1,(FR.tFly-FR.tEnd)/COAST_S):1;
  FR.fPk=Math.max(1,...f.plog.f);
  const dur=Math.max(2,Math.min(7,FR.tEnd));FR.sp=FR.tEnd/dur;
  $("frSpeed").textContent=FR.sp<0.85?`slowed ×${FR.sp.toFixed(2)}`:FR.sp>1.15?`sped up ×${FR.sp.toFixed(1)}`:"real time";
  $("frNext").hidden=true;$("frAbort").hidden=false;$("frAbort").disabled=false;$("frReplay").hidden=true;$("frPlume").hidden=true;$("frSlow").hidden=true;
  /* 3D when it's ready; otherwise start fetching it for next time and draw this one in 2D */
  FR.d3=gfx3d();if(!FR.d3)gfxLoad();
  $("frStand3").hidden=!FR.d3;$("frStand").hidden=FR.d3;
  if(FR.d3)setup3d(L);
  const fl=f.failure;FR.replayed=false;FR.rp0=fl&&fl.destructive?Math.max(0,fl.t-REPLAY_PRE):-1;FR.rp1=fl&&fl.destructive?fl.t+REPLAY_POST:-1;
  FR.phase=reduced()?"burn":"count";FR.t0=performance.now();
  cancelAnimationFrame(FR.raf);FR.raf=requestAnimationFrame(frameFiring);}
/* hand the firing to the 3D stand: motor size, nozzle, thrust curve, and for a launch the rocket and its path */
function setup3d(L){
  const f=L.f,m=f.motor,lg=f.log,g=m.prop.gamma,fly=f.flight,fl=f.failure;
  const o={mode:fly?"launch":"stand",len:m.length,dia:m.diameter,caseLen:m.caseLen,re:m.re,rt:m.rt0,caseMat:m.design.case.mat,
    prE:BURN_SIM.presRatio(BURN_SIM.exitMach(m.eps0,g),g),tEnd:FR.tEnd,fAt:t=>lg.f[BURN_VIS.at(lg,Math.min(t,FR.tEnd))]/FR.fPk};
  if(fly){const r=fly.rocket;Object.assign(o,{rocket:{D:r.D,L:r.L,body:r.a.body,nose:r.a.nose,fins:r.a.fins},path:fly.samples,wind:fly.wind,
    tBurn:fl&&fl.destructive?Math.min(fl.t,FR.tEnd):FR.tEnd,lost:fly.lost?fly.tLost:null});}
  BURN_VIS.s3.setup(o);}
function frameFiring(now){
  const L=GAME.last;if(!L||$("fire").hidden){FR.phase="idle";playing3d(false);return;}
  const f=L.f,el=(now-FR.t0)/1000,still=reduced();playing3d(true);
  if(FR.phase==="replay"){const t=FR.rp0+el*REPLAY_SP;drawFiring(Math.min(t,FR.rp1),still);
    if(t<FR.rp1)FR.raf=requestAnimationFrame(frameFiring);else endReplay();return;}
  if(FR.phase==="count"){
    const left=FIRE_COUNT-Math.floor(el/COUNT_STEP);
    $("frCount").textContent=left>0?String(left):"Fire";$("frCount").hidden=false;
    drawFiring(-1,still);
    if(el>=FIRE_COUNT*COUNT_STEP+0.25){FR.phase="burn";FR.t0=now;$("frCount").hidden=true;}
    FR.raf=requestAnimationFrame(frameFiring);return;}
  $("frCount").hidden=true;
  const t=frTime(el),tDone=Math.max(FR.tEnd,FR.tFly);
  drawFiring(t,still);
  if(t<tDone+AFTER*(FR.tFly?FR.spC:1))FR.raf=requestAnimationFrame(frameFiring);
  else if(FR.rp0>=0&&!FR.replayed&&!still)startReplay();
  else{FR.phase="done";playing3d(false);if(FR.rp0>=0)$("frReplay").hidden=false;$("frPlume").hidden=!FR.d3;}
  if(t>=tDone&&$("frNext").hidden){$("frNext").hidden=false;$("frAbort").hidden=true;$("frNext").focus({preventScroll:true});}}
/* the slow-motion replay of a failure: the same seconds again at REPLAY_SP, from the close-up camera in 3D */
function startReplay(){
  FR.replayed=true;FR.phase="replay";FR.t0=performance.now();$("frSlow").hidden=false;$("frReplay").hidden=true;
  $("frSpeed").textContent=`slowed ×${REPLAY_SP}`;
  if(FR.d3){const S=BURN_VIS.s3.S,k=GAME.last.f.failure.key;FR.shot0=S.shot;
    if(GAME.last.f.flight){S.shot=1;S.orbit=null;}else if(k==="cato"){S.shot=0;S.orbit={az:-0.35,el:0.12,zoom:0.8};}else{S.shot=1;S.orbit=null;}}
  cancelAnimationFrame(FR.raf);FR.raf=requestAnimationFrame(frameFiring);}
function endReplay(){
  FR.phase="done";playing3d(false);$("frSlow").hidden=true;$("frReplay").hidden=false;
  $("frSpeed").textContent=FR.sp<0.85?`slowed ×${FR.sp.toFixed(2)}`:FR.sp>1.15?`sped up ×${FR.sp.toFixed(1)}`:"real time";
  if(FR.d3){const S=BURN_VIS.s3.S;S.shot=FR.shot0||0;S.orbit=null;}
  drawFiring(Math.max(FR.tEnd,FR.tFly)+AFTER,reduced());}
const playing3d=on=>{if(FR.d3)BURN_VIS.s3.S.playing=on;};
function drawFiring(t,still){
  const L=GAME.last,f=L.f,lg=f.log,m=f.motor,fl=f.failure;
  const i=t<0?0:BURN_VIS.at(lg,Math.min(t,FR.tEnd));
  const failAt=fl&&fl.destructive?fl.t:null;
  const failNow=fl&&(fl.key==="hangfire"?t>=0:failAt!=null&&t>=failAt)?{key:fl.key,age:fl.key==="hangfire"?t:t-failAt}:null;
  const fly=f.flight;
  if(FR.d3)BURN_VIS.s3.draw({t,f:t<0||t>FR.tEnd?0:lg.f[i]/FR.fPk,p:t<0||t>FR.tEnd?0:lg.p[i],fail:failNow,still});
  else if(fly)BURN_VIS.sky($("frStand"),{path:fly.samples,t,tBurn:failAt!=null?Math.min(failAt,FR.tEnd):FR.tEnd,apogee:Math.max(fly.apogee,f.fpred?f.fpred.apogee:0),lost:fly.lost?fly.tLost:null,still,
    h:w=>Math.min(w*0.62,260)});
  else BURN_VIS.stand($("frStand"),{len:m.length,dia:m.diameter,f:t<0?0:lg.f[i]/FR.fPk,t,fail:failNow,still,
    smoke:t>FR.tEnd?t-FR.tEnd:(failNow&&fl.key!=="hangfire"?failNow.age:-1)});
  BURN_VIS.strip($("frStrip"),{pred:f.plog,meas:lg,upto:t<0?-1:t,now:t>=0&&t<=FR.tEnd,pLine:f.limits.pBurst,
    mark:fl&&FAIL_LABEL[fl.key]?{t:fl.t,label:FAIL_LABEL[fl.key]}:null,events:f.events.map(e=>({t:e.t,label:e.key}))});
  const tt=t<0?0:Math.min(t,fly?FR.tFly:FR.tEnd);
  $("frP").textContent=fly?String(Math.round(t<0?0:BURN_VIS.pathAt(fly.samples,Math.min(t,FR.tFly)).h)):(t<0?0:lg.p[i]/1e6).toFixed(2);$("frF").textContent=String(Math.round(t<0?0:lg.f[i]));$("frT").textContent=tt.toFixed(2);}
function abortFiring(){
  if(FR.phase==="count"){cancelAnimationFrame(FR.raf);FR.phase="idle";undoFiring();toast("Countdown held. The motor is still on the stand.");showScreen("design");return;}
  toast("Once it's lit, it's lit.");$("frAbort").disabled=true;}
function initFiring(){
  $("frAbort").addEventListener("click",abortFiring);
  $("frNext").addEventListener("click",()=>{cancelAnimationFrame(FR.raf);FR.phase="idle";playing3d(false);openReport();});
  $("frReplay").addEventListener("click",startReplay);
  addEventListener("resize",()=>{if(!$("fire").hidden&&FR.phase==="done"){drawFiring(Math.max(FR.tEnd,FR.tFly)+AFTER,reduced());}});}
