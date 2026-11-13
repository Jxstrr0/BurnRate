/* ===================== app/gfx.js: graphics settings and loading the 3D range (stage 7) =====================
   The 3D stand needs three.js (lib/three.min.js, 0.5 MB) and the range model (models/range.glb). Neither is in the page:
   gfxLoad() fetches both a few seconds after start-up (the service worker keeps them for offline play), then builds the
   scene once. Until it is ready, or on a phone without WebGL, or with Graphics set to 2D, the firing screen uses the 2D
   stand and sky (vis/stand.js, vis/flight.js).
   SETTINGS.gfx (in brn-settings): "auto" (start Full or Lite from what the phone reports, step down if frames run slow),
   "full", "lite" or "2d". SETTINGS.gfxAuto remembers an automatic step-down to Lite so the next visit starts there. */
const GFX={state:"idle",p:null};
/* Ruslan's voice: [setting, button, the button text's language] */
const VOICE_OPTS=[["en","English",""],["ru","Русский","ru"],["off","Off",""]];
const GFX_OPTS=[["auto","Auto","Full on a quick phone; steps down to Lite if the stand stutters."],["full","Full","Shadows, metal and the most smoke."],
  ["lite","Lite","Plainer, for older phones and batteries."],["2d","2D","The flat drawing: no 3D at all."]];
const gfxWant=()=>SETTINGS.gfx!=="2d";
const gfx3d=()=>gfxWant()&&GFX.state==="ready";
function gfxTier(){
  if(SETTINGS.gfx==="full"||SETTINGS.gfx==="lite")return SETTINGS.gfx;
  if(SETTINGS.gfxAuto==="lite")return"lite";
  const mem=navigator.deviceMemory||8,cores=navigator.hardwareConcurrency||8;
  return mem<=3||cores<=4?"lite":"full";}
function gfxLoad(){
  if(GFX.p||!gfxWant())return GFX.p;
  GFX.state="loading";
  GFX.p=new Promise((ok,bad)=>{const s=document.createElement("script");s.src="lib/three.min.js";s.onload=ok;s.onerror=()=>bad(new Error("lib/three.min.js"));document.head.appendChild(s);})
    .then(()=>fetch("models/range.glb")).then(r=>{if(!r.ok)throw new Error("models/range.glb "+r.status);return r.arrayBuffer();})
    .then(buf=>{const s3=BURN_VIS.s3;if(!s3.init($("frStand3"),buf,gfxTier())){GFX.state="failed";return;}
      s3.S.auto=SETTINGS.gfx==="auto";
      s3.S.onStep=n=>{SETTINGS.gfxAuto="lite";saveSettings();toast(n>1?"Graphics turned down again to keep the stand smooth.":"Graphics stepped down to Lite to keep the stand smooth.");};
      GFX.state="ready";})
    .catch(e=>{GFX.state="failed";console.warn("3D stand unavailable:",e&&e.message);});
  return GFX.p;}
/* the settings sheet (title screen): theme, graphics, sound and vibration */
function settingsSheet(){
  const g=SETTINGS.gfx||"auto",st=GFX.state==="failed"?`<p class="hint">This phone couldn't start the 3D stand, so the 2D one is used.</p>`:"";
  const onOff=(key,label,note)=>`<fieldset class="seg-f"><legend>${label}</legend><div class="seg two" role="radiogroup" aria-label="${label}">${[[true,"On"],[false,"Off"]].map(([v,n])=>
      `<button type="button" role="radio" aria-checked="${SETTINGS[key]===v}" data-set="${key}" data-v="${v}" class="btn sm${SETTINGS[key]===v?" on":""}">${n}</button>`).join("")}</div>${note}</fieldset>`;
  const th=SETTINGS.theme||"light";const vc=SETTINGS.voice||"en";
  openSheet("Settings",`<fieldset class="seg-f"><legend>Theme</legend><div class="seg three" role="radiogroup" aria-label="Theme">${THEME_OPTS.map(([k,n])=>
      `<button type="button" role="radio" aria-checked="${k===th}" data-theme-set="${k}" class="btn sm${k===th?" on":""}">${n}</button>`).join("")}</div>
    <p class="hint">Night shift is the blockhouse after dark. Match phone follows your phone's dark mode.</p></fieldset>`+
    `<fieldset class="seg-f"><legend>Graphics</legend><div class="seg" role="radiogroup" aria-label="Graphics">${GFX_OPTS.map(([k,n])=>
      `<button type="button" role="radio" aria-checked="${k===g}" data-gfx="${k}" class="btn sm${k===g?" on":""}">${n}</button>`).join("")}</div>
    <p class="hint" id="gfxNote">${esc(GFX_OPTS.find(o=>o[0]===g)[2])}</p>${st}</fieldset>`+
    onOff("sound","Sound",`<p class="hint">The motor, the countdown and the stand's relays. The speaker button on the stand mutes sound and vibration together.</p>`)+
    `<fieldset class="seg-f"><legend>Ruslan's voice</legend><div class="seg three" role="radiogroup" aria-label="Ruslan's voice">${VOICE_OPTS.map(([k,n,l])=>
      `<button type="button" role="radio" aria-checked="${k===vc}" data-voice-set="${k}"${l?` lang="${l}"`:""} class="btn sm${k===vc?" on":""}">${n}</button>`).join("")}</div>
    <p class="hint">The Range Safety Officer calls the countdown over the tannoy and reads his sign-off on each report. Needs Sound on. The voice is AI-generated.</p></fieldset>`+
    onOff("haptics","Vibration",BURN_SOUND.canBuzz()?`<p class="hint">A buzz when the motor lights and when something goes wrong.</p>`:`<p class="hint">This phone's browser doesn't let web pages vibrate (iPhones never do).</p>`)+
    onOff("coach","Coach cards",`<p class="hint">Short tips on your first job, each shown once. <button type="button" class="btn sm" id="coachAgain">Show them again</button></p>`));
  $("sheetBody").addEventListener("click",e=>{
    if(e.target.closest("#coachAgain")){SETTINGS.seen={};SETTINGS.coach=true;saveSettings();closeSheet();toast("Coach cards will show again on your first job.");return;}
    const th=e.target.closest("[data-theme-set]");
    if(th){SETTINGS.theme=th.dataset.themeSet;saveSettings();applyTheme();
      $("sheetBody").querySelectorAll("[data-theme-set]").forEach(x=>{const on=x===th;x.classList.toggle("on",on);x.setAttribute("aria-checked",on);});return;}
    const vb=e.target.closest("[data-voice-set]");
    if(vb){const v=vb.dataset.voiceSet;SETTINGS.voice=v;saveSettings();BURN_SOUND.voice.lang(v);
      if(v!=="off"&&SETTINGS.sound){BURN_SOUND.unlock();voicePrep();BURN_SOUND.voice.say("armed",{pa:true});}   // a sample
      $("sheetBody").querySelectorAll("[data-voice-set]").forEach(x=>{const on=x===vb;x.classList.toggle("on",on);x.setAttribute("aria-checked",on);});return;}
    const t=e.target.closest("[data-set]");
    if(t){const k=t.dataset.set,v=t.dataset.v==="true";SETTINGS[k]=v;saveSettings();BURN_SOUND.setOn(SETTINGS.sound,SETTINGS.haptics);
      if(k==="sound"&&v)BURN_SOUND.unlock();if(k==="haptics"&&v)BURN_SOUND.buzz("ignite");
      $("sheetBody").querySelectorAll(`[data-set="${k}"]`).forEach(x=>{const on=x===t;x.classList.toggle("on",on);x.setAttribute("aria-checked",on);});
      muteUI();return;}
    const b=e.target.closest("[data-gfx]");if(!b)return;
    const k=b.dataset.gfx;SETTINGS.gfx=k;if(k!=="auto")delete SETTINGS.gfxAuto;saveSettings();
    $("sheetBody").querySelectorAll("[data-gfx]").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-checked",on);});
    $("gfxNote").textContent=GFX_OPTS.find(o=>o[0]===k)[2];
    if(GFX.state==="ready"){const S=BURN_VIS.s3.S;S.auto=k==="auto";S.stepped=0;if(k!=="2d")BURN_VIS.s3.tier(gfxTier());}
    else if(k!=="2d")gfxLoad();});}
