/* ===================== app/firing.js: the static firing screen (plan sections 4 and 9.2) =====================
   A countdown, then the stand and the live strip chart: the measured trace (red) draws over the prediction (blue) as
   the motor burns, with pressure, thrust and time gauges. Burns shorter than 2 s play slowed down and burns longer than
   7 s sped up (the speed shows on screen). Abort works during the countdown; once it's lit, it's lit.
   With reduced motion on, the countdown is skipped, the burn plays without flicker or shake.
   A launch (f.flight) shows the rocket climbing from the rail (vis/flight.js sky) in place of the stand, and plays on
   past burnout to apogee: the coast is sped up to take about four seconds. The first gauge reads height.
   Stage 7: when the 3D range is loaded (app/gfx.js) the stand and the launch play in 3D (vis/stand3d.js) instead of the
   2D drawings. A motor that fails destructively gets a slow-motion replay of the moment it went (0.3x, from half a second
   before), once on its own and again from the "Watch it again" button.
   Sound and vibration (sound/synth.js) run off the same clock: countdown beeps, the relay's click, a roar that follows
   the measured thrust and crackles when the pressure gets rough, a bang when it goes. The speaker button mutes both.
   Ruslan's voice (1.3, Settings: English, Russian or off): once his range calls are loaded the countdown opens with
   "Stand is armed. Range is clear." and he calls three, two, one, fire over the tannoy in place of the beeps; a hold
   during the countdown gets "Hold, hold, hold" and "Countdown held", and the end of a run "Range is safe". */
const FR={raf:0,t0:0,phase:"idle",sp:1,count:0,tEnd:0,fPk:1,tFly:0,spC:1,d3:false,rp0:0,rp1:0,replayed:false,pre:0};
const SND={n:-1,lit:false,boom:false,out:false,saved:false};   // which sounds this run has made
const REPLAY_SP=0.3,REPLAY_PRE=0.5,REPLAY_POST=1.4;   // replay speed, and seconds shown before and after the failure
const COAST_S=4;   // seconds the coast to apogee takes on screen
/* sim time at el seconds into the burn phase: the burn at FR.sp, then a launch's coast at FR.spC, or real time after a
   static burn (so a slowed short burn doesn't leave the stand idling in slow motion afterwards) */
const frTime=el=>{const tb=FR.tEnd/FR.sp;return el<=tb?el*FR.sp:FR.tEnd+(el-tb)*(FR.tFly?FR.spC:1);};
const FIRE_COUNT=3,COUNT_STEP=0.7,AFTER=2.6;   // countdown from 3, seconds per number; seconds the stand keeps running after the burn
const ARMED_S=2.4;   // seconds before "3" while Ruslan says the stand is armed (only when his voice is on and loaded)
const VOICE_CALLS=["armed","count-3","count-2","count-1","fire","hold","held","safe"];
/* load his range calls ahead, so the countdown never waits on the network */
const voicePrep=()=>{if(SETTINGS.sound&&SETTINGS.voice!=="off")BURN_SOUND.voice.preload(VOICE_CALLS);};
/* AFTER in sim seconds at the speed the end of the run plays (real time, or a launch's sped-up coast) */
const frAfter=()=>AFTER*(FR.tFly?FR.spC:1);
const FAIL_LABEL={cato:"burst",eject:"nozzle out",burnthrough:"burn-through"};
function openFiring(){
  const L=GAME.last,f=L.f,sl=BURN_SIM.SLOTS[L.slot],tG=L.tGrain??sl.tGrain;
  showScreen("fire");
  const fly=f.flight||null;
  $("frSite").textContent=`${fly?"Launch rail":L.c?BURN_SIM.STANDS[L.c.stand].name:"Stand 3"}${L.lot?` · motor 1 of ${L.lot.fires.length}`:""} · ${sl.name} · ${degC(tG)} grain${fly?` · wind ${fly.wind.toFixed(1)} m/s`:""}`;$("frDes").textContent=f.pred.sum.designation;
  $("frPL").textContent=fly?"Height":"Pressure";$("frPU").textContent=fly?"m":"MPa";
  $("fire").setAttribute("aria-label",fly?"Launch":"Static firing");
  const n=f.log.t.length;FR.tEnd=f.log.t[n-1];
  FR.tFly=fly?Math.max(FR.tEnd,fly.lost?fly.tLost:fly.tApo):0;FR.spC=fly?Math.max(1,(FR.tFly-FR.tEnd)/COAST_S):1;
  FR.fPk=Math.max(1,...f.plog.f);FR.pPk=1;for(const p of f.log.p)if(p>FR.pPk)FR.pPk=p;
  Object.assign(SND,{n:-1,lit:false,boom:false,out:false,saved:false});BURN_SOUND.stop();BURN_SOUND.chirp(false);
  const dur=Math.max(2,Math.min(7,FR.tEnd));FR.sp=FR.tEnd/dur;
  $("frSpeed").textContent=FR.sp<0.85?`slowed ×${FR.sp.toFixed(2)}`:FR.sp>1.15?`sped up ×${FR.sp.toFixed(1)}`:"real time";
  $("frNext").hidden=true;$("frAbort").hidden=false;$("frAbort").disabled=false;$("frReplay").hidden=true;$("frPlume").hidden=true;$("frSlow").hidden=true;
  /* 3D when it's ready; otherwise start fetching it for next time and draw this one in 2D */
  FR.d3=gfx3d();if(!FR.d3)gfxLoad();
  $("frStand3").hidden=!FR.d3;$("frStand").hidden=FR.d3;
  if(FR.d3)setup3d(L);
  const fl=f.failure;FR.replayed=false;FR.rp0=fl&&fl.destructive?Math.max(0,fl.t-REPLAY_PRE):-1;FR.rp1=fl&&fl.destructive?fl.t+REPLAY_POST:-1;
  FR.phase=reduced()?"burn":"count";FR.t0=performance.now();
  voicePrep();FR.pre=FR.phase==="count"&&BURN_SOUND.voice.ready("armed")?ARMED_S:0;
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
  const L=GAME.last;if(!L||$("fire").hidden){FR.phase="idle";playing3d(false);BURN_SOUND.stop();return;}
  const f=L.f,el=Math.max(0,(now-FR.t0)/1000),still=reduced();   // a frame can be stamped a moment before t0playing3d(true);
  if(FR.phase==="replay"){const t=FR.rp0+el*REPLAY_SP;drawFiring(Math.min(t,FR.rp1),still);sndAt(Math.min(t,FR.rp1),true);
    if(t<FR.rp1)FR.raf=requestAnimationFrame(frameFiring);else endReplay();return;}
  if(FR.phase==="count"){
    const ec=el-FR.pre,V=BURN_SOUND.voice;
    if(ec<0){$("frCount").textContent="Armed";$("frCount").hidden=false;
      if(SND.n!=="armed"){SND.n="armed";V.say("armed",{pa:true,now:true});}
      drawFiring(-1,still);FR.raf=requestAnimationFrame(frameFiring);return;}
    const left=FIRE_COUNT-Math.floor(ec/COUNT_STEP);
    $("frCount").textContent=left>0?String(left):"Fire";$("frCount").hidden=false;
    if(left!==SND.n){SND.n=left;if(!V.say(left>0?"count-"+left:"fire",{pa:true,now:true}))BURN_SOUND.beep(left<=0);}
    drawFiring(-1,still);
    if(ec>=FIRE_COUNT*COUNT_STEP+0.25){FR.phase="burn";FR.t0=now;$("frCount").hidden=true;}
    FR.raf=requestAnimationFrame(frameFiring);return;}
  $("frCount").hidden=true;
  const t=frTime(el),tDone=Math.max(FR.tEnd,FR.tFly);
  drawFiring(t,still);sndAt(t,false);
  if(t<tDone+frAfter())FR.raf=requestAnimationFrame(frameFiring);
  else if(FR.rp0>=0&&!FR.replayed&&!still)startReplay();
  else{FR.phase="done";playing3d(false);sndDone();if(FR.rp0>=0)$("frReplay").hidden=false;$("frPlume").hidden=!FR.d3;}
  if(t>=tDone&&$("frNext").hidden){$("frNext").hidden=false;$("frAbort").hidden=true;$("frNext").focus({preventScroll:true});}}
/* the slow-motion replay of a failure: the same seconds again at REPLAY_SP, from the close-up camera in 3D */
function startReplay(){
  FR.replayed=true;FR.phase="replay";FR.t0=performance.now();Object.assign(SND,{lit:false,boom:false,out:false});$("frSlow").hidden=false;$("frReplay").hidden=true;
  $("frSpeed").textContent=`slowed ×${REPLAY_SP}`;
  if(FR.d3){const S=BURN_VIS.s3.S,k=GAME.last.f.failure.key;FR.shot0=S.shot;
    if(GAME.last.f.flight){S.shot=1;S.orbit=null;}else if(k==="cato"){S.shot=0;S.orbit={az:-0.35,el:0.12,zoom:0.8};}else{S.shot=1;S.orbit=null;}}
  cancelAnimationFrame(FR.raf);FR.raf=requestAnimationFrame(frameFiring);}
function endReplay(){
  FR.phase="done";playing3d(false);sndDone();$("frSlow").hidden=true;$("frReplay").hidden=false;
  $("frSpeed").textContent=FR.sp<0.85?`slowed ×${FR.sp.toFixed(2)}`:FR.sp>1.15?`sped up ×${FR.sp.toFixed(1)}`:"real time";
  if(FR.d3){const S=BURN_VIS.s3.S;S.shot=FR.shot0||0;S.orbit=null;}
  drawFiring(Math.max(FR.tEnd,FR.tFly)+frAfter(),reduced());}
/* sound and vibration at sim time t (slow: in the replay, where nothing vibrates and the relay doesn't click again) */
function sndAt(t,slow){
  if(t<0)return;
  const B=BURN_SOUND,f=GAME.last.f,lg=f.log,fl=f.failure,fly=f.flight,burning=t<=FR.tEnd;
  if(!SND.lit){SND.lit=true;if(!slow){B.click();B.buzz(fl&&fl.key==="hangfire"?"hangfire":"ignite");}}
  if(burning&&!B.motor.on())B.motor.start(Math.max(0,Math.min(1,(Math.log10(FR.fPk)-1.3)/3.2)));
  const i=BURN_VIS.at(lg,Math.min(t,FR.tEnd)),j=Math.max(0,i-2);
  B.motor.set({f:burning?lg.f[i]/FR.fPk:0,rough:burning?Math.min(1,Math.abs(lg.p[i]-lg.p[j])/FR.pPk*12):0,
    jet:fl&&fl.key==="burnthrough"&&t>=fl.t&&burning?1:0,dist:fly?BURN_VIS.pathAt(fly.samples,Math.min(t,FR.tFly)).h:0,slow});
  const boomAt=fl&&fl.destructive?fl.t:fly&&fly.lost?fly.tLost:null;
  if(boomAt!=null&&t>=boomAt&&!SND.boom){SND.boom=true;const k=fl&&fl.destructive?fl.key:"lost";
    B.bang(k==="cato"?1:k==="eject"?0.45:k==="burnthrough"?0.3:0.7);if(!slow)B.buzz(k);}
  if(!burning&&!SND.out){SND.out=true;if(!slow&&!(fl&&fl.destructive))B.click();}}
/* the run is over: the roar stops and, the first time, the logger chirps that it has saved the data */
function sndDone(){BURN_SOUND.motor.stop();if(!SND.saved){SND.saved=true;BURN_SOUND.chirp(true);BURN_SOUND.voice.say("safe",{pa:true});}}
/* the speaker button: one switch for sound and vibration together (Kelbo, 13 November 2026) */
const SPK_ON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPK_OFF='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function muteUI(){const on=SETTINGS.sound||SETTINGS.haptics,b=$("frMute");b.innerHTML=on?SPK_ON:SPK_OFF;b.setAttribute("aria-pressed",String(!on));
  b.setAttribute("aria-label",on?"Mute sound and vibration":"Sound and vibration are off. Turn them on");}
function toggleMute(){const on=!(SETTINGS.sound||SETTINGS.haptics);SETTINGS.sound=SETTINGS.haptics=on;saveSettings();
  BURN_SOUND.setOn(on,on);if(on)BURN_SOUND.unlock();muteUI();toast(on?"Sound and vibration on.":"Muted.");}
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
  if(FR.phase==="count"){cancelAnimationFrame(FR.raf);FR.phase="idle";undoFiring();toast("Countdown held. The motor is still on the stand.");showScreen("design");
    if(BURN_SOUND.voice.say("hold",{pa:true,now:true}))BURN_SOUND.voice.say("held",{pa:true});return;}
  toast("Once it's lit, it's lit.");$("frAbort").disabled=true;}
function initFiring(){
  $("frAbort").addEventListener("click",abortFiring);
  $("frNext").addEventListener("click",()=>{cancelAnimationFrame(FR.raf);FR.phase="idle";playing3d(false);BURN_SOUND.stop();openReport();});
  $("frMute").addEventListener("click",toggleMute);muteUI();
  /* phones only start audio from a tap: wake the audio on any tap or key while sound is on */
  const wake=()=>{if(SETTINGS.sound){BURN_SOUND.unlock();voicePrep();}};
  document.addEventListener("pointerdown",wake,{capture:true,passive:true});document.addEventListener("keydown",wake,{capture:true});
  $("frReplay").addEventListener("click",startReplay);
  addEventListener("resize",()=>{if(!$("fire").hidden&&FR.phase==="done"){drawFiring(Math.max(FR.tEnd,FR.tFly)+frAfter(),reduced());}});}
