/* ===================== app/firing.js: the static firing screen (plan sections 4 and 9.2) =====================
   A countdown, then the stand and the live strip chart: the measured trace (red) draws over the prediction (blue) as
   the motor burns, with pressure, thrust and time gauges. Burns shorter than 2 s play slowed down and burns longer than
   7 s sped up (the speed shows on screen). Abort works during the countdown; once it's lit, it's lit.
   With reduced motion on, the countdown is skipped, the burn plays without flicker or shake. */
const FR={raf:0,t0:0,phase:"idle",sp:1,count:0,tEnd:0,fPk:1};
const FIRE_COUNT=3,COUNT_STEP=0.7,AFTER=2.6;   // countdown from 3, seconds per number; seconds the stand keeps running after the burn
const FAIL_LABEL={cato:"burst",eject:"nozzle out",burnthrough:"burn-through"};
function openFiring(){
  const L=GAME.last,f=L.f,sl=BURN_SIM.SLOTS[L.slot],tG=L.tGrain??sl.tGrain;
  showScreen("fire");
  $("frSite").textContent=`${L.c?BURN_SIM.STANDS[L.c.stand].name:"Stand 3"} · ${sl.name} · ${degC(tG)} grain`;$("frDes").textContent=f.pred.sum.designation;
  const n=f.log.t.length;FR.tEnd=f.log.t[n-1];
  FR.fPk=Math.max(1,...f.plog.f);
  const dur=Math.max(2,Math.min(7,FR.tEnd));FR.sp=FR.tEnd/dur;
  $("frSpeed").textContent=FR.sp<0.85?`slowed ×${FR.sp.toFixed(2)}`:FR.sp>1.15?`sped up ×${FR.sp.toFixed(1)}`:"real time";
  $("frNext").hidden=true;$("frAbort").hidden=false;$("frAbort").disabled=false;
  FR.phase=reduced()?"burn":"count";FR.t0=performance.now();
  cancelAnimationFrame(FR.raf);FR.raf=requestAnimationFrame(frameFiring);}
function frameFiring(now){
  const L=GAME.last;if(!L||$("fire").hidden){FR.phase="idle";return;}
  const f=L.f,el=(now-FR.t0)/1000,still=reduced();
  if(FR.phase==="count"){
    const left=FIRE_COUNT-Math.floor(el/COUNT_STEP);
    $("frCount").textContent=left>0?String(left):"Fire";$("frCount").hidden=false;
    drawFiring(-1,still);
    if(el>=FIRE_COUNT*COUNT_STEP+0.25){FR.phase="burn";FR.t0=now;$("frCount").hidden=true;}
    FR.raf=requestAnimationFrame(frameFiring);return;}
  $("frCount").hidden=true;
  const t=el*FR.sp;
  drawFiring(t,still);
  if(t<FR.tEnd+AFTER)FR.raf=requestAnimationFrame(frameFiring);
  else FR.phase="done";
  if(t>=FR.tEnd&&$("frNext").hidden){$("frNext").hidden=false;$("frAbort").hidden=true;$("frNext").focus({preventScroll:true});}}
function drawFiring(t,still){
  const L=GAME.last,f=L.f,lg=f.log,m=f.motor,fl=f.failure;
  const i=t<0?0:BURN_VIS.at(lg,Math.min(t,FR.tEnd));
  const failAt=fl&&fl.destructive?fl.t:null;
  const failNow=fl&&(fl.key==="hangfire"?t>=0:failAt!=null&&t>=failAt)?{key:fl.key,age:fl.key==="hangfire"?t:t-failAt}:null;
  BURN_VIS.stand($("frStand"),{len:m.length,dia:m.diameter,f:t<0?0:lg.f[i]/FR.fPk,t,fail:failNow,still,
    smoke:t>FR.tEnd?t-FR.tEnd:(failNow&&fl.key!=="hangfire"?failNow.age:-1)});
  BURN_VIS.strip($("frStrip"),{pred:f.plog,meas:lg,upto:t<0?-1:t,now:t>=0&&t<=FR.tEnd,pLine:f.limits.pBurst,
    mark:fl&&FAIL_LABEL[fl.key]?{t:fl.t,label:FAIL_LABEL[fl.key]}:null,events:f.events.map(e=>({t:e.t,label:e.key}))});
  const tt=t<0?0:Math.min(t,FR.tEnd);
  $("frP").textContent=(t<0?0:lg.p[i]/1e6).toFixed(2);$("frF").textContent=String(Math.round(t<0?0:lg.f[i]));$("frT").textContent=tt.toFixed(2);}
function abortFiring(){
  if(FR.phase==="count"){cancelAnimationFrame(FR.raf);FR.phase="idle";undoFiring();toast("Countdown held. The motor is still on the stand.");showScreen("design");return;}
  toast("Once it's lit, it's lit.");$("frAbort").disabled=true;}
function initFiring(){
  $("frAbort").addEventListener("click",abortFiring);
  $("frNext").addEventListener("click",()=>{cancelAnimationFrame(FR.raf);FR.phase="idle";openReport();});
  addEventListener("resize",()=>{if(!$("fire").hidden&&FR.phase==="done"){drawFiring(FR.tEnd+AFTER,reduced());}});}
