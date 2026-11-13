/* ===================== app/gfx.js: graphics settings and loading the 3D range (stage 7) =====================
   The 3D stand needs three.js (lib/three.min.js, 0.5 MB) and the range model (models/range.glb). Neither is in the page:
   gfxLoad() fetches both a few seconds after start-up (the service worker keeps them for offline play), then builds the
   scene once. Until it is ready, or on a phone without WebGL, or with Graphics set to 2D, the firing screen uses the 2D
   stand and sky (vis/stand.js, vis/flight.js).
   SETTINGS.gfx (in brn-settings): "auto" (start Full or Lite from what the phone reports, step down if frames run slow),
   "full", "lite" or "2d". SETTINGS.gfxAuto remembers an automatic step-down to Lite so the next visit starts there. */
const GFX={state:"idle",p:null};
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
/* the settings sheet (title screen): graphics now; sound and vibration join it with the sound stage */
function settingsSheet(){
  const g=SETTINGS.gfx||"auto",st=GFX.state==="failed"?`<p class="hint">This phone couldn't start the 3D stand, so the 2D one is used.</p>`:"";
  openSheet("Settings",`<fieldset class="seg-f"><legend>Graphics</legend><div class="seg" role="radiogroup" aria-label="Graphics">${GFX_OPTS.map(([k,n])=>
      `<button type="button" role="radio" aria-checked="${k===g}" data-gfx="${k}" class="btn sm${k===g?" on":""}">${n}</button>`).join("")}</div>
    <p class="hint" id="gfxNote">${esc(GFX_OPTS.find(o=>o[0]===g)[2])}</p>${st}</fieldset>`);
  $("sheetBody").addEventListener("click",e=>{const b=e.target.closest("[data-gfx]");if(!b)return;
    const k=b.dataset.gfx;SETTINGS.gfx=k;if(k!=="auto")delete SETTINGS.gfxAuto;saveSettings();
    $("sheetBody").querySelectorAll("[data-gfx]").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-checked",on);});
    $("gfxNote").textContent=GFX_OPTS.find(o=>o[0]===k)[2];
    if(GFX.state==="ready"){const S=BURN_VIS.s3.S;S.auto=k==="auto";S.stepped=0;if(k!=="2d")BURN_VIS.s3.tier(gfxTier());}
    else if(k!=="2d")gfxLoad();});}
