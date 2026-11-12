/* ===================== app/game.js: the first playable's work orders and the way to the stand (stage 3) =====================
   GAME holds this visit's play in memory: the contract in hand, the design kept for each contract, how many motors each
   has fired, the best grade, the firing log. Nothing is saved yet: careers, money and save slots arrive in stage 4.
   The board lists the fixed contracts (data/contracts.js). Taking one opens the bench with its start design. The bench's
   bottom bar checks the prediction against the spec and leads to the stand: pre-fire checks (does it fit, are the parts
   allowed), then the firing slot (dawn, noon or dusk sets the grain temperature), then app/firing.js. */
const GAME={contract:null,designs:{},attempts:{},best:{},log:[],slot:"dusk",last:null};
const PRED_TEMPS=[["ref",null],["dawn","dawn"],["noon","noon"],["dusk","dusk"]];
const gameKey=()=>GAME.contract?GAME.contract.id:"free";
const withStand=c=>c?Object.assign({},c,{stand:BURN_SIM.STANDS[c.stand]}):null;
const startDesign=c=>clone(typeof c.start==="string"?BURN_SIM.REF_DESIGNS[c.start]:c.start);
const GRADE_RANK={A:3,B:2,C:1};
/* "80–160 N·s", "1.8 s or less", "60% or more" */
function bandText(s){const i=BURN_SIM.SPEC_INFO[s.k],u=i.unit==="%"?"%":" "+i.unit;
  return s.lo!=null&&s.hi!=null?`${s.lo}–${s.hi}${u}`:s.hi!=null?`${s.hi}${u} or less`:`${s.lo}${u} or more`;}
const fmtSpec=(k,v)=>{const i=BURN_SIM.SPEC_INFO[k];return(+v).toFixed(k==="I"&&v>=100?0:i.dp);};
function setDesign(d){DZ.d=d;GAME.designs[gameKey()]=d;}

/* ---- the board ---- */
function renderBoard(){
  $("bdList").innerHTML=BURN_SIM.CONTRACTS.map((c,i)=>{const b=GAME.best[c.id],n=GAME.attempts[c.id]||0,sl=c.slot&&BURN_SIM.SLOTS[c.slot];
    return`<article class="wo card"><header><span class="site">Work order ${String(i+1).padStart(2,"0")} · ${esc(c.client)}</span>${b?`<span class="stamp pass">${b}</span>`:""}</header>
      <h3>${esc(c.title)}</h3><p>${esc(c.brief)}</p>
      <ul class="wo-spec">${c.spec.map(s=>`<li><button type="button" class="gl" data-g="${BURN_SIM.SPEC_INFO[s.k].gloss||"impulse"}">${esc(BURN_SIM.SPEC_INFO[s.k].name)}</button> <b class="mono">${esc(bandText(s))}</b></li>`).join("")}
        ${sl?`<li>Fired at <b>${sl.name.toLowerCase()}</b> <span class="mono">(${degC(sl.tGrain)})</span></li>`:""}</ul>
      <div class="row"><button type="button" class="btn pri" data-take="${c.id}">${GAME.designs[c.id]?"Back to this job":"Take the job"}</button>
      ${n?`<span class="hint">${n} motor${n>1?"s":""} fired${b?`, best ${b}`:""}</span>`:""}</div></article>`;}).join("");}
function openBoard(){renderBoard();showScreen("board");}
function takeContract(id){
  const c=BURN_SIM.CONTRACTS.find(x=>x.id===id);if(!c)return;
  GAME.contract=c;DZ.d=GAME.designs[id]||(GAME.designs[id]=startDesign(c));
  DZ.tGrain=c.slot?BURN_SIM.SLOTS[c.slot].tGrain:20;DZ.predSlot=c.slot||"ref";
  openDesigner();}
function freeDesign(){GAME.contract=null;DZ.d=GAME.designs.free||(GAME.designs.free=clone(BURN_SIM.DEFAULT_DESIGN));DZ.tGrain=20;DZ.predSlot="ref";openDesigner();}

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
  const pf=BURN_SIM.preFire(withStand(GAME.contract),DZ.d,r.motor);
  if(pf.length){openSheet("It won't go on the stand",`<ul class="fixes">${fixList(pf)}</ul>`);return;}
  slotSheet();}
function slotSheet(){
  const c=GAME.contract,slots=c&&c.slot?[c.slot]:["dawn","noon","dusk"];
  if(!slots.includes(GAME.slot))GAME.slot=slots[0];
  const cards=slots.map(id=>{const sl=BURN_SIM.SLOTS[id],p=BURN_SIM.predict(DZ.d,{tGrain:sl.tGrain});if(!p.ok)return"";
    const s=p.sum,crit=s.warnings.filter(w=>w.sev==="crit").length,ok=c?BURN_SIM.specCheck(c.spec,s,p.motor).filter(k=>k.ok).length:null;
    return`<button type="button" class="opt${id===GAME.slot?" on":""}" data-slot="${id}" aria-pressed="${id===GAME.slot}"><b>${sl.name} · ${degC(sl.tGrain)}</b>${crit?`<span class="tag crit">${crit} critical</span>`:""}
      <small>${esc(sl.note)}</small><small class="mono">peak ${(s.Pmax/1e6).toFixed(2)} MPa · avg ${Math.round(s.Fav)} N · ${s.tb.toFixed(2)} s${c?` · spec ${ok}/${c.spec.length}`:""}</small></button>`;}).join("");
  openSheet("Firing slot",`<p class="hint">${c&&c.slot?"This contract fires at "+BURN_SIM.SLOTS[c.slot].name.toLowerCase()+".":"Pick when to fire. The grain sits out overnight, so it fires at the air's temperature."} Each line is the predictor at that temperature; the real motor won't match it exactly.</p>
    <div class="pick">${cards}</div><button type="button" class="btn pri big wide" data-go="1">Clear the range and fire</button>`);}
document.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.take){takeContract(b.dataset.take);return;}
  if(b.id==="dzFire"){toStand();return;}
  if(b.id==="dzTemp"){cycleTemp();return;}
  if(!b.closest("#sheet"))return;
  if(b.dataset.slot){GAME.slot=b.dataset.slot;document.querySelectorAll("#sheet [data-slot]").forEach(x=>{const on=x.dataset.slot===GAME.slot;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on);});}
  else if(b.dataset.go){closeSheet();startFiring(GAME.slot);}});

/* fire one motor: draw it, grade it, log it, then run the firing screen. undoFiring takes it back (an abort during the
   countdown): the same motor stays on the stand, so the next attempt fires it again */
function startFiring(slot){
  const c=GAME.contract,key=gameKey(),n=(GAME.attempts[key]||0)+1;GAME.attempts[key]=n;
  const sl=BURN_SIM.SLOTS[slot],f=BURN_SIM.fire(DZ.d,{tGrain:sl.tGrain},key+"/"+n);
  if(!f.ok){toast("This motor can't be built.");return;}
  const g=c?BURN_SIM.grade(c,f):null,prevBest=c?GAME.best[c.id]:null;
  if(g&&g.pass&&(!GAME.best[c.id]||GRADE_RANK[g.letter]>GRADE_RANK[GAME.best[c.id]]))GAME.best[c.id]=g.letter;
  GAME.log.push({key,n,slot,letter:g?g.letter:null});
  GAME.last={f,g,c,slot,n,key,prevBest,no:GAME.log.length,design:clone(DZ.d)};
  openFiring();}
function undoFiring(){const L=GAME.last;if(!L)return;GAME.attempts[L.key]=L.n-1;GAME.log.pop();if(L.c){if(L.prevBest)GAME.best[L.c.id]=L.prevBest;else delete GAME.best[L.c.id];}GAME.last=null;}
