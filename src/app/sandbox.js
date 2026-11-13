/* ===================== app/sandbox.js: the Sandbox (stage 8, plan section 10) =====================
   Practice any work order up to the career's tier, with every part the career has unlocked: no money, no range days, no
   deadlines, as many firings as you like, each one graded. It opens once the career reaches tier 2 (after tier 1).
   Nothing in the Sandbox touches the career: it keeps its own bench per job and its own firing count, in the save:
     S.sandbox = {designs: {jobId: design}, n (Sandbox firings so far, so each rolls new dice)}
   Tier 4 tenders practise as single motors here: the lot of five is the career's test. */
const isSandbox=()=>GAME.mode==="sandbox"&&!!GAME.contract;
const sandboxOpen=()=>!!(S.career&&S.career.tier>=2);
function sandboxSheet(){
  if(!sandboxOpen()){toast("The Sandbox opens when your career reaches tier 2.",3600);return;}
  const tier=S.career.tier,list=BURN_SIM.CONTRACTS.filter(c=>(c.tier||1)<=tier);
  const byTier=[1,2,3,4].filter(t=>t<=tier).map(t=>{const cs=list.filter(c=>(c.tier||1)===t);if(!cs.length)return"";
    return`<h3 class="dl-h">Tier ${t}</h3>`+cs.map(c=>`<article class="wo card sbx"><header><span class="site">${esc(c.client)}</span>${S.sandbox.designs[c.id]?`<span class="tag">Bench saved</span>`:""}</header>
      <h3>${esc(c.title)}</h3>${specList(c)}<div class="row"><button type="button" class="btn pri sm" data-sbx="${c.id}">Practise</button></div></article>`).join("");}).join("");
  openSheet("Sandbox",`<p class="hint">Any work order up to tier ${tier}, with every part your career has unlocked. No money, no range days, no deadlines: fire as often as you like and see the grade. Nothing here changes your career.</p>${byTier}`);}
function openSandboxJob(id){
  const c=BURN_SIM.contractById(id);if(!c||!sandboxOpen())return;
  S.sandbox.designs[id]=S.sandbox.designs[id]||startDesign(c);save();
  /* the contract goes on GAME first: a hut job's temperature comes from it */
  GAME.mode="sandbox";GAME.contract=c;closeSheet();benchOpen(c,S.sandbox.designs[id],c.slot?slotT(c.slot):20,c.slot||"ref");}
function sandboxTitleBtn(){
  const open=sandboxOpen();
  return`<button type="button" class="btn big" id="tSbx"${open?"":` aria-disabled="true"`}><span>Sandbox</span><small>${open?`Practise any job up to tier ${S.career.tier}, no money`:"Opens when your career reaches tier 2"}</small></button>`;}
document.addEventListener("click",e=>{const b=e.target.closest("#sheet button[data-sbx]");if(b)openSandboxJob(b.dataset.sbx);});
