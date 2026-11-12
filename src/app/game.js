/* ===================== app/game.js: the way from a work order to the stand (stages 3 and 4) =====================
   GAME holds what's on screen now: the mode ("career" or "free"), the contract on the bench, the firing slot picked, the
   last firing. Everything kept lives in S (app/save.js): the career (sim/career.js's object, plus career.designs, the
   bench's design for each job) or, in free mode, S.free.
   The bench's bottom bar checks the prediction against the spec and leads to the stand: pre-fire checks (does it fit,
   is the load cell rated for it, are the parts open to you), then the firing slot (dawn, noon or dusk sets the grain
   temperature) with what the firing will cost, then app/firing.js. In a career each firing costs a range day, the stand's
   fee and the motor's materials; a pass pays and finishes the job (sim/career.js settle). */
const GAME={mode:"free",contract:null,slot:"dusk",last:null};
const PRED_TEMPS=[["ref",null],["dawn","dawn"],["noon","noon"],["dusk","dusk"]];
const inCareer=()=>GAME.mode==="career"&&!!S.career;
const gameKey=()=>GAME.contract?GAME.contract.id:"free";
const withStand=c=>c?Object.assign({},c,{stand:BURN_SIM.STANDS[c.stand]}):null;
const startDesign=c=>clone(typeof c.start==="string"?BURN_SIM.REF_DESIGNS[c.start]:c.start);
/* "80–160 N·s", "1.8 s or less", "60% or more" */
function bandText(s){const i=BURN_SIM.SPEC_INFO[s.k],u=i.unit==="%"?"%":i.unit==="×"?"×":" "+i.unit;
  return s.lo!=null&&s.hi!=null?`${s.lo}–${s.hi}${u}`:s.hi!=null?`${s.hi}${u} or less`:`${s.lo}${u} or more`;}
const fmtSpec=(k,v)=>{const i=BURN_SIM.SPEC_INFO[k];return(+v).toFixed(k==="I"&&v>=100?0:i.dp);};
/* money: "2 500 cr", "−1 200 cr" (a thin space between thousands, a real minus sign) */
function fmtCr(v){v=Math.round(+v||0);return(v<0?"−":"")+String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g," ")+" cr";}
/* the bench's design is the saved object itself, so edits save with save() */
function setDesign(d){DZ.d=d;if(inCareer()&&GAME.contract)S.career.designs[GAME.contract.id]=d;else if(!inCareer())S.free=d;save();}
function benchOpen(c,design,tGrain,predSlot){GAME.contract=c;DZ.d=design;DZ.tGrain=tGrain;DZ.predSlot=predSlot;openDesigner();}
/* open the bench on a job in hand (taking it first if it's still on the board) */
function takeContract(id){
  const car=S.career,c=BURN_SIM.contractById(id);if(!car||!c)return;
  if(!car.jobs[id]){const e=BURN_SIM.takeJob(car,id);if(e){toast(e,3600);return;}save();}
  car.designs[id]=car.designs[id]||startDesign(c);
  benchOpen(c,car.designs[id],c.slot?BURN_SIM.SLOTS[c.slot].tGrain:20,c.slot||"ref");}
function freeDesign(){GAME.mode="free";S.free=S.free||clone(BURN_SIM.DEFAULT_DESIGN);benchOpen(null,S.free,20,"ref");}

/* ---- the bench's bottom bar: the spec against the prediction, the predictor's temperature, the way to the stand ---- */
function drawGo(){
  const c=GAME.contract,r=DZ.res,locked=!!(c&&c.slot);
  const tl=DZ.predSlot==="ref"?degC(20):`${BURN_SIM.SLOTS[DZ.predSlot].name} ${degC(BURN_SIM.SLOTS[DZ.predSlot].tGrain)}`;
  let checks="";
  if(c&&r&&r.ok)checks=BURN_SIM.specCheck(c.spec,r.sum,r.motor).map(k=>`<span class="ck ${k.ok?"ok":"no"}"><i aria-hidden="true">${k.ok?"✓":"✗"}</i>${esc(k.info.short)} <b class="mono">${fmtSpec(k.k,k.v)}</b><span class="vh">${k.ok?" in spec":" out of spec"}</span></span>`).join("");
  else if(c)checks=`<span class="ck no">Can't be built</span>`;
  else checks=`<span class="ck">Free design, no client</span>`;
  $("dzGo").innerHTML=`<div class="go-l"><button type="button" class="temp mono" id="dzTemp"${locked?" disabled":""} aria-label="Predict at ${tl}${locked?" (this contract fires then)":", tap to change"}">${esc(tl)}${locked?"":" ▾"}</button><div class="cks">${checks}</div></div>
    <button type="button" class="btn pri" id="dzFire">${c?"To the stand":"Test fire"} ›</button>`;
  $("dzSite").textContent=c?c.title:"Stand 3 · Design bench";}
function cycleTemp(){
  const i=PRED_TEMPS.findIndex(p=>p[0]===DZ.predSlot),nx=PRED_TEMPS[(i+1)%PRED_TEMPS.length];
  DZ.predSlot=nx[0];DZ.tGrain=nx[1]?BURN_SIM.SLOTS[nx[1]].tGrain:20;schedule(false);
  toast(nx[1]?`Predicting at ${BURN_SIM.SLOTS[nx[1]].name.toLowerCase()}: ${degC(DZ.tGrain)} grain`:"Predicting at the reference 20 °C");}

/* ---- to the stand: pre-fire checks, then the slot ---- */
function toStand(){
  const r=DZ.res;if(!r)return;
  const fixList=list=>list.map(e=>{const c=ctlSpec(e.field);return`<li><p>${esc(e.text)}</p>${c?`<button type="button" class="btn sm" data-fix="${e.field}">Go to ${esc(c.label.toLowerCase())}</button>`:""}</li>`;}).join("");
  if(!r.ok){openSheet("Not buildable",`<p>This motor can't be built yet.</p><ul class="fixes">${fixList(r.errors)}</ul>`);return;}
  const pf=BURN_SIM.preFire(withStand(GAME.contract),DZ.d,r.motor,{sum:r.sum,tier:inCareer()?S.career.tier:null});
  if(pf.length){openSheet("It won't go on the stand",`<ul class="fixes">${fixList(pf)}</ul>`);return;}
  slotSheet();}
/* what this firing costs, and whether the bank will cover it (career only) */
function firingBill(){const c=GAME.contract,r=DZ.res;if(!inCareer()||!c||!r||!r.ok)return null;
  const b=BURN_SIM.firingCost(c.stand,r.motor,DZ.d);b.ok=BURN_SIM.canAfford(S.career,b.total);return b;}
function slotSheet(){
  const c=GAME.contract,slots=c&&c.slot?[c.slot]:["dawn","noon","dusk"];
  if(!slots.includes(GAME.slot))GAME.slot=slots[0];
  const cards=slots.map(id=>{const sl=BURN_SIM.SLOTS[id],p=BURN_SIM.predict(DZ.d,{tGrain:sl.tGrain});if(!p.ok)return"";
    const s=p.sum,crit=s.warnings.filter(w=>w.sev==="crit").length,ok=c?BURN_SIM.specCheck(c.spec,s,p.motor).filter(k=>k.ok).length:null;
    return`<button type="button" class="opt${id===GAME.slot?" on":""}" data-slot="${id}" aria-pressed="${id===GAME.slot}"><b>${sl.name} · ${degC(sl.tGrain)}</b>${crit?`<span class="tag crit">${crit} critical</span>`:""}
      <small>${esc(sl.note)}</small><small class="mono">peak ${(s.Pmax/1e6).toFixed(2)} MPa · avg ${Math.round(s.Fav)} N · ${s.tb.toFixed(2)} s${c?` · spec ${ok}/${c.spec.length}`:""}</small></button>`;}).join("");
  const b=firingBill(),car=S.career;
  const bill=b?`<div class="bill"><p class="mono">${esc(BURN_SIM.STANDS[c.stand].name)} fee ${fmtCr(b.fee)} + motor ${fmtCr(b.build.total)} = <b>${fmtCr(b.total)}</b></p>
    <p class="hint">Day ${car.day} · you have ${fmtCr(car.money)}${car.jobs[c.id]?` · due day ${car.jobs[c.id].due}`:""}. A failed motor still costs.</p>
    ${b.ok?"":`<p class="sev crit">The bank won't cover it: it lends down to ${fmtCr(-BURN_SIM.CAREER.overdraft)}. Make the motor cheaper or finish another job first.</p>`}</div>`:"";
  openSheet("Firing slot",`<p class="hint">${c&&c.slot?"This contract fires at "+BURN_SIM.SLOTS[c.slot].name.toLowerCase()+".":"Pick when to fire. The grain sits out overnight, so it fires at the air's temperature."} Each line is the predictor at that temperature; the real motor won't match it exactly.</p>
    <div class="pick">${cards}</div>${bill}<button type="button" class="btn pri big wide" data-go="1"${b&&!b.ok?" disabled":""}>Clear the range and fire</button>`);}
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.take){takeContract(b.dataset.take);return;}
  if(b.id==="dzFire"){toStand();return;}
  if(b.id==="dzTemp"){cycleTemp();return;}
  if(!b.closest("#sheet"))return;
  if(b.dataset.slot){GAME.slot=b.dataset.slot;document.querySelectorAll("#sheet [data-slot]").forEach(x=>{const on=x.dataset.slot===GAME.slot;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});}
  else if(b.dataset.go){closeSheet();startFiring(GAME.slot);}});

/* fire one motor: draw it, grade it, charge and pay (career), log it, save, then run the firing screen. undoFiring takes it
   back (an abort during the countdown): the career goes back to how it was, so the next attempt fires the same motor */
function startFiring(slot){
  const c=GAME.contract,sl=BURN_SIM.SLOTS[slot],d=clone(DZ.d);
  if(inCareer()&&c){
    const car=S.career,job=car.jobs[c.id];if(!job){toast("This job is finished. Pick another from the work orders.");return;}
    const r=DZ.res;if(!r||!r.ok){toast("This motor can't be built.");return;}
    const bill=BURN_SIM.firingCost(c.stand,r.motor,d);
    if(!BURN_SIM.canAfford(car,bill.total)){toast("The bank won't cover this firing.");return;}
    const before=clone(car),n=job.n+1,seed=BURN_SIM.fireSeed(car,c.id,n),rate=BURN_SIM.CAREER.logRate[car.bunker]||BURN_SIM.CAREER.logRate[0];
    const f=BURN_SIM.fire(d,{tGrain:sl.tGrain,logRate:rate},seed);if(!f.ok){toast("This motor can't be built.");return;}
    const g=BURN_SIM.grade(c,f),out=BURN_SIM.settle(car,c,g,bill.total);
    const entry=BURN_SIM.logFiring(car,{day:out.day,key:c.id,n,slot,seed,rate,design:d,letter:g.pass?g.letter:null,why:g.pass?null:g.why,
      fee:bill.fee,cost:bill.total,paid:out.paid,late:out.late});
    save(true);
    GAME.last={f,g,c,slot,n,key:c.id,no:entry.no,design:d,bill,out,before,money:car.money,bunker:car.bunker};
  }else{
    const n=(S.freeN|0)+1;S.freeN=n;save();
    const f=BURN_SIM.fire(d,{tGrain:sl.tGrain},"free/"+n);if(!f.ok){S.freeN=n-1;toast("This motor can't be built.");return;}
    GAME.last={f,g:null,c:null,slot,n,key:"free",no:n,design:d,bunker:1};}
  openFiring();}
function undoFiring(){const L=GAME.last;if(!L)return;
  if(L.before){const designs=S.career.designs;S.career=L.before;S.career.designs=designs;}else S.freeN=Math.max(0,(S.freeN|0)-1);
  save(true);GAME.last=null;}
/* a logbook entry's report: the same motor, conditions and seed fire the same, so the report comes back exactly */
function replayFiring(e){
  const c=BURN_SIM.contractById(e.key),f=BURN_SIM.fire(e.design,{tGrain:BURN_SIM.SLOTS[e.slot].tGrain,logRate:e.rate},e.seed);if(!f.ok)return;
  GAME.last={f,g:c?BURN_SIM.grade(c,f):null,c,slot:e.slot,n:e.n,key:e.key,no:e.no,design:e.design,entry:e,replay:true,bunker:e.rate>=BURN_SIM.CAREER.logRate[1]?1:0};
  openReport();}
