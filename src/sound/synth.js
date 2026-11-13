<script>
/* ===================== sound/synth.js: the BURN_SOUND block, procedural audio and vibration (stage 7) =====================
   Every sound is made in WebAudio while the game runs: there are no sound files. Three looping noise buffers (white, brown
   and a sparse "crackle" of clicks) feed the motor's roar: a low rumble and a broader roar whose loudness and brightness
   follow the live thrust, a crackle that rises when the pressure trace gets rough (chuffing, a failing motor), and a
   hiss for a burn-through's side jet. Distance (a rocket climbing away) turns it down and dulls it. The one-off sounds
   are short synth blips: countdown beeps, the firing relay's click, the data logger's chirp, and a bang for a burst.
   Vibration (navigator.vibrate, Android only: iPhones ignore it) buzzes on ignition and on failures.
   The app owns the settings: it calls setOn(sound, haptics) at start-up and when the player changes them, and unlock()
   from a tap, because phones only let a page start audio from a user gesture. The audio context sleeps while the page is
   hidden. Nothing here reads the game state: app/firing.js drives it. */
const BURN_SOUND=(()=>{"use strict";
const AC=window.AudioContext||window.webkitAudioContext;
let ctx=null,out=null,bufs=null,M=null,sndOn=true,hapOn=true;
/* the vibration patterns, in milliseconds (buzz, pause, buzz...) */
const HAPTIC={ignite:[28],cato:[90,40,220],eject:[60,40,90],burnthrough:[30,30,30,30,70],lost:[70,40,140],hangfire:[15,60,15]};
/* mixing levels: the roar's layers at full thrust, and the one-off sounds */
const MIX={master:0.8,rumble:0.9,roar:0.38,crackle:0.55,hiss:0.3,beep:0.22,click:0.45,chirp:0.11,bang:1.0};

function noise(kind,sec){
  const n=Math.floor(ctx.sampleRate*sec),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);
  if(kind==="white")for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  else if(kind==="brown"){let l=0;for(let i=0;i<n;i++){l=(l+0.02*(Math.random()*2-1))/1.02;d[i]=l*3.5;}}
  else{let a=0,k=0;for(let i=0;i<n;i++){if(Math.random()<0.0016){a=(0.3+0.7*Math.random())*(Math.random()<0.5?-1:1);k=0;}d[i]=a*Math.exp(-k/14)*(Math.random()*0.6+0.4);k++;}}
  return b;}
/* the audio context, made on first use (after a tap) */
function ensure(){
  if(!sndOn||!AC)return null;
  if(!ctx){try{ctx=new AC();}catch(e){return null;}
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=6;
    out=ctx.createGain();out.gain.value=MIX.master;out.connect(comp);comp.connect(ctx.destination);
    bufs={white:noise("white",2),brown:noise("brown",2),crackle:noise("crackle",2)};}
  if(ctx.state==="suspended")ctx.resume().catch(()=>{});
  return ctx;}
const unlock=()=>{ensure();};
const loop=buf=>{const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;s.start(0,Math.random()*1.9);return s;};
const filt=(type,f,q)=>{const x=ctx.createBiquadFilter();x.type=type;x.frequency.value=f;if(q)x.Q.value=q;return x;};
const gain=v=>{const g=ctx.createGain();g.gain.value=v;return g;};
const ease=(param,v,tc)=>param.setTargetAtTime(v,ctx.currentTime,tc||0.04);

/* ---- the motor ---- */
function motorStart(size){
  if(!ensure())return;motorStop(0);
  const bus=gain(0),far=filt("lowpass",16000);bus.connect(far);far.connect(out);
  const layer=(buf,type,f,q)=>{const s=loop(buf),x=filt(type,f,q),g=gain(0);s.connect(x);x.connect(g);g.connect(bus);return{s,x,g};};
  M={bus,far,size:Math.max(0,Math.min(1,size||0)),
    rumble:layer(bufs.brown,"lowpass",120),roar:layer(bufs.white,"lowpass",600),
    crackle:layer(bufs.crackle,"highpass",1400),hiss:layer(bufs.white,"highpass",3200)};
  ease(bus.gain,1,0.01);}
/* o: f (thrust as a share of peak, 0..1), rough (0..1, a jumpy pressure trace), jet (0..1, burn-through), dist (metres
   from the microphone), slow (true in the slow-motion replay: everything drops in pitch) */
function motorSet(o){
  if(!M||!ctx)return;
  const f=Math.max(0,Math.min(1.3,o.f||0)),sz=M.size,sl=o.slow?0.45:1,d=o.dist||0;
  const near=1/(1+d/90);
  ease(M.rumble.g.gain,MIX.rumble*f*(0.45+0.55*sz)*near);ease(M.rumble.x.frequency,(70+130*f)*(1-0.3*sz)*sl);
  ease(M.roar.g.gain,MIX.roar*Math.pow(f,0.7)*(0.8+0.2*(1-sz))*near);ease(M.roar.x.frequency,Math.max(150,(350+2700*f)*(1-0.35*sz)*sl));
  ease(M.crackle.g.gain,MIX.crackle*Math.min(1,0.12*f+0.9*(o.rough||0))*near);
  ease(M.hiss.g.gain,MIX.hiss*(o.jet||0)*near);
  ease(M.far.frequency,Math.max(350,16000/(1+d/50)),0.1);
  for(const k of["rumble","roar","crackle","hiss"])M[k].s.playbackRate.setTargetAtTime(o.slow?0.6:1,ctx.currentTime,0.05);}
function motorStop(fade){
  if(!M)return;const m=M;M=null;if(!ctx)return;
  const t=fade==null?0.35:fade;
  if(t<=0){for(const k of["rumble","roar","crackle","hiss"])try{m[k].s.stop();}catch(e){}m.bus.disconnect();return;}
  ease(m.bus.gain,0,t/3);
  for(const k of["rumble","roar","crackle","hiss"])try{m[k].s.stop(ctx.currentTime+t*2);}catch(e){}
  setTimeout(()=>{try{m.bus.disconnect();}catch(e){}},t*2000+200);}

/* ---- one-off sounds ---- */
function tone(freq,dur,vol,type,at){
  const t=ctx.currentTime+(at||0),o=ctx.createOscillator(),g=gain(0);o.type=type||"sine";o.frequency.value=freq;
  o.connect(g);g.connect(out);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.start(t);o.stop(t+dur+0.02);}
/* a countdown beep; last=true for the long high one on "Fire" */
function beep(last){if(!ensure())return;tone(last?1320:880,last?0.45:0.13,MIX.beep,"sine");}
/* the firing relay closing: a hard tick */
function click(){if(!ensure())return;
  const s=ctx.createBufferSource(),x=filt("bandpass",2600,4),g=gain(MIX.click),t=ctx.currentTime;s.buffer=bufs.white;
  s.connect(x);x.connect(g);g.connect(out);g.gain.setValueAtTime(MIX.click,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.025);
  s.start(t,Math.random());s.stop(t+0.04);tone(1700,0.03,MIX.click*0.4,"square");}
/* the data logger: two rising blips when it arms, two falling when it has saved the run */
function chirp(done){if(!ensure())return;const a=done?2800:2100,b=done?2100:2800;
  tone(a,0.06,MIX.chirp,"triangle");tone(b,0.07,MIX.chirp,"triangle",0.08);}
/* a burst (size 1), a nozzle popping out (about 0.4), a rocket breaking up (about 0.7) */
function bang(size){if(!ensure())return;
  const sz=Math.max(0.2,Math.min(1,size)),t=ctx.currentTime,dur=0.5+1.4*sz;
  const s=ctx.createBufferSource(),x=filt("lowpass",7000),g=gain(0);s.buffer=bufs.white;s.loop=true;
  s.connect(x);x.connect(g);g.connect(out);
  g.gain.setValueAtTime(MIX.bang*sz,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  x.frequency.setValueAtTime(7000,t);x.frequency.exponentialRampToValueAtTime(160,t+dur*0.8);
  s.start(t);s.stop(t+dur+0.05);
  const o=ctx.createOscillator(),og=gain(0);o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(28,t+dur*0.7);
  o.connect(og);og.connect(out);og.gain.setValueAtTime(MIX.bang*0.9*sz,t);og.gain.exponentialRampToValueAtTime(0.0001,t+dur*0.7);
  o.start(t);o.stop(t+dur);}

/* ---- vibration ---- */
const canBuzz=()=>typeof navigator!=="undefined"&&typeof navigator.vibrate==="function";
function buzz(key){if(!hapOn||!canBuzz())return;const p=HAPTIC[key];if(p)try{navigator.vibrate(p);}catch(e){}}

/* ---- switches ---- */
function setOn(sound,haptics){
  sndOn=!!sound;hapOn=!!haptics;
  if(!sndOn){motorStop(0);if(ctx&&ctx.state==="running")ctx.suspend().catch(()=>{});}
  if(!hapOn&&canBuzz())try{navigator.vibrate(0);}catch(e){}}
function stop(){motorStop(0.25);}
document.addEventListener("visibilitychange",()=>{if(!ctx)return;
  if(document.hidden)ctx.suspend().catch(()=>{});else if(sndOn)ctx.resume().catch(()=>{});});
return{unlock,setOn,stop,beep,click,chirp,bang,buzz,canBuzz,motor:{start:motorStart,set:motorSet,stop:motorStop,on:()=>!!M},HAPTIC};})();
</script>
