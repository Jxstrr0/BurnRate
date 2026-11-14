/* ===================== app/scatter.js: the scatter predictor on the bench (1.4) =====================
   Kelbo's rules (14 November 2026): a facility, the Computing room (data/career.js); always on in the Sandbox, never in
   the Daily Spec; the free bench has it once the saved career owns the room. With it switched on (the Scatter button
   under the bench's chart, remembered on this phone in brn-settings as SETTINGS.scatter), SCATTER.n virtual motors
   (sim/scatter.js) rerun about a second after the design or the predictor's temperature stops changing, a few at a time
   between frames so the bench never freezes. The band (the middle 80% of the motors) and a mark for each motor that
   failed go on the curves; the line under the chart counts passes, failures and spec misses, and on a tender the
   chance that a lot of five is accepted. A flight job's motors are graded on the motor's own numbers (no flight). */
const SCAT_WAIT=900,SCAT_SLICE=22;   // ms after the last change before it starts; ms of work between frames
const SC={key:"",gen:0,P:null,list:[],i:0,timer:0,band:null,fails:[],done:false};
const scatterAvail=()=>!isDaily()&&(isSandbox()||!!(S.career&&(S.career.compute|0)>0));
const scatterOn=()=>scatterAvail()&&SETTINGS.scatter!==false;
/* what the scatter depends on: the design, the predictor's temperature and the stand's air */
const scatterKey=()=>JSON.stringify([DZ.d,DZ.tGrain,GAME.contract&&GAME.contract.stand]);
/* the design moved (a drag in progress): the band no longer fits, so it goes until the design settles */
function scatterStale(){if(SC.key&&SC.key!==scatterKey()){clearTimeout(SC.timer);SC.gen++;SC.key="";SC.band=null;SC.fails=[];SC.done=false;}}
/* after a full prediction: start a new scatter if anything it depends on changed */
function scatterKick(){
  drawScatterLine();
  if(!scatterOn()||!DZ.res||!DZ.res.ok)return;
  const key=scatterKey();if(key===SC.key)return;
  clearTimeout(SC.timer);const gen=++SC.gen;
  Object.assign(SC,{key,P:null,list:[],i:0,band:null,fails:[],done:false});drawScatterLine();
  SC.timer=setTimeout(()=>scatterRun(gen),SCAT_WAIT);}
function scatterRun(gen){
  if(gen!==SC.gen)return;
  if(!SC.P){SC.P=BURN_SIM.scatterPrep(DZ.d,BURN_SIM.standCond(GAME.contract,{tGrain:DZ.tGrain}));if(!SC.P)return;}
  const t0=performance.now(),N=BURN_SIM.SCATTER.n;
  while(SC.i<N&&performance.now()-t0<SCAT_SLICE){SC.i++;SC.list.push(BURN_SIM.scatterOne(SC.P,SC.i));}
  if(SC.i<N){drawScatterLine();SC.timer=setTimeout(()=>scatterRun(gen),0);return;}
  SC.band=BURN_SIM.scatterBand(SC.list);
  SC.fails=SC.list.filter(s=>s.destructive).map(s=>({t:s.t,p:s.p}));
  SC.done=true;drawScatterLine();if(DZ.view==="curves")drawView();}
/* the scatter's counts: passes (and letters, with a contract), each failure, spec misses */
function scatterStats(){
  const c=GAME.contract,out={n:SC.list.length,pass:0,letters:{A:0,B:0,C:0},fail:{},miss:0,yld:0};
  const spec=c?c.spec.filter(x=>x.k!=="apogee"):null,cc=c?Object.assign({},c,{spec}):null;
  for(const s of SC.list){
    if(s.key){out.fail[s.key]=(out.fail[s.key]||0)+1;continue;}   // every failure, chuffing included, earns no grade
    if(!cc){if(s.yielded)out.yld++;else out.pass++;continue;}
    const g=BURN_SIM.grade(cc,{ok:true,failure:null,meas:{sum:s.sum},motor:SC.P.m,yielded:s.yielded});
    if(g.pass){out.pass++;out.letters[g.letter]++;}else if(g.why==="yield")out.yld++;else out.miss++;}
  return out;}
const SCAT_WORD={cato:"burst",eject:"lost the nozzle",burnthrough:"burned through",hangfire:"never lit",chuff:"chuffed"};
function drawScatterLine(){
  const el=$("dzScat");if(!el)return;
  if(!scatterAvail()){el.hidden=true;return;}
  el.hidden=false;const on=SETTINGS.scatter!==false,N=BURN_SIM.SCATTER.n;
  let txt="";
  if(!on)txt="Off: tap to fire "+N+" virtual motors with the real dice.";
  else if(!DZ.res||!DZ.res.ok)txt="";
  else if(!SC.key)txt="Waiting for the design to settle…";
  else if(!SC.done)txt=SC.i?`Firing virtual motors… ${SC.i} of ${N}`:"Starting…";
  else{const st=scatterStats(),c=GAME.contract,bits=[];
    bits.push(`${st.pass} of ${st.n} ${c?"pass":"clean"}${c&&st.pass?` (${["A","B","C"].filter(l=>st.letters[l]).map(l=>st.letters[l]+" "+l).join(", ")})`:""}`);
    for(const k in st.fail)bits.push(`${st.fail[k]} ${SCAT_WORD[k]||k}`);
    if(st.miss)bits.push(`${st.miss} miss the spec`);
    if(st.yld)bits.push(`${st.yld} yield the case`);
    txt=bits.join(" · ");
    if(c&&c.lot){const L=BURN_SIM.CAREER.lot;txt+=` · a lot of ${L.n}: ${Math.round(BURN_SIM.lotOdds(st.pass/st.n,L.n,L.need)*100)}% accepted`;}
    if(c&&c.flight)txt+=" · motor only, no flight";}
  el.innerHTML=`<button type="button" class="btn sm${on?" on":""}" id="dzScatBtn" aria-pressed="${on}">Scatter</button><span class="mono" aria-live="polite">${esc(txt)}</span><button type="button" class="gl gib" data-g="scatter" aria-label="What the scatter shows"><span class="gi" aria-hidden="true">i</span></button>`;}
function toggleScatter(){SETTINGS.scatter=SETTINGS.scatter===false;saveSettings();
  if(SETTINGS.scatter){SC.key="";scatterKick();}else{clearTimeout(SC.timer);SC.gen++;Object.assign(SC,{key:"",band:null,fails:[],done:false});drawScatterLine();drawView();}}
/* the band and failure marks for the bench's curves, when they fit the design on the bench */
const scatterDraw=()=>scatterOn()&&SC.done&&SC.key===scatterKey()?{band:SC.band,fails:SC.fails}:null;
