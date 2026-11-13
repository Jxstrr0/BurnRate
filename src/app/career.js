/* ===================== app/career.js: the title, the work orders, facilities, the logbook and saves (stage 4) =====================
   The title offers Continue (the career on this phone), New career, the Daily Spec (app/daily.js), the Sandbox (app/sandbox.js), Free design and Saves. The board shows the startup's
   day, money and reputation, the jobs in hand (with their deadlines) and the work orders on offer; facilities (the
   blockhouse instruments, the Stand 2 lease) sit under it. The logbook lists every firing; tapping one fires the same
   motor again from its seed, so its report comes back exactly. Going broke offers a restart of the tier.
   The rules are sim/career.js's; this file only draws them and saves after each change. */
const NAME_IDEAS=["Saltpan Propulsion","Two Stand Rocketry","Blockhouse Nine","Steppe Motor Works","Long Burn Ltd"];

/* ---- the title ---- */
function renderTitle(){
  const c=S.career;
  $("tActions").innerHTML=(c?`<button type="button" class="btn pri big" id="tCont"><span>Continue</span><small>${esc(c.name)} · day ${c.day} · ${fmtCr(c.money)}</small></button>
      <button type="button" class="btn big" id="tNew">New career</button>`
    :`<button type="button" class="btn pri big" id="tNew">New career</button>`)+
    dailyTitleBtn()+(S.career?sandboxTitleBtn():"")+`<button type="button" class="btn big" id="tFree">Free design</button>
    <button type="button" class="btn" id="tSaves">Saves and backups</button>
    <button type="button" class="btn" id="tSet">Settings</button>
    <p class="note">${c?"Your career saves on this phone as you play. Keep a backup somewhere else too.":"Run a two-person rocket startup on a leased state test stand: take work orders, design motors, fire them and get paid."}</p>`;}
function initTitle(){
  $("tActions").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.id==="tCont"){GAME.mode="career";openBoard();}
    else if(b.id==="tNew")newCareerSheet();
    else if(b.id==="tFree")freeDesign();
    else if(b.id==="tDaily")openDaily();
    else if(b.id==="tSbx")sandboxSheet();
    else if(b.id==="tSaves")savesSheet();
    else if(b.id==="tSet")settingsSheet();});}
function newCareerSheet(){
  const has=!!S.career,idea=NAME_IDEAS[Math.floor(Math.random()*NAME_IDEAS.length)];
  openSheet("New career",`<p>Two engineers, a van, a laptop and a lease on Stand 3 at Aqsor Range, the old state programme's Site 41 on the salt flat of the Altyn Steppe Republic.</p>
    <label class="fld"><span>Name your startup</span><input type="text" id="ncName" maxlength="28" value="${esc(idea)}" autocomplete="off" spellcheck="false"></label>
    <p class="hint">You start with ${fmtCr(BURN_SIM.CAREER.startMoney[1])}. Every firing costs a range day, the stand's fee and the motor's materials. A pass pays; a failure only teaches.</p>
    ${has?`<p class="sev warn"><b>This replaces the career on this phone</b> (${esc(S.career.name)}, day ${S.career.day}). Put it in a save slot first if you want to keep it.</p>`:""}
    <button type="button" class="btn pri big wide" id="ncGo">Sign the lease</button>`);
  $("ncGo").addEventListener("click",()=>{
    const name=$("ncName").value.replace(/[\u0000-\u001f<>]/g,"").trim()||idea;
    const seed=Date.now().toString(36)+Math.floor(Math.random()*1e9).toString(36);   // the career's dice: a fresh seed per career
    S.career=BURN_SIM.newCareer(seed,name);S.career.designs={};save(true);
    closeSheet();GAME.mode="career";renderTitle();openBoard();toast(`${name} signs the lease on Stand 3.`);});}

/* ---- the board ---- */
function openBoard(){GAME.contract=null;renderBoard();showScreen("board");}
function dueText(car,job){const left=job.due-car.day;
  if(left>1)return`${left} range days left`;if(left===1)return"due tomorrow";if(left===0)return"due today";
  const ls=BURN_SIM.lateShare(job,car.day);return`${ls.late} day${ls.late>1?"s":""} late · pay ${Math.round(ls.mul*100)}%`;}
function specList(c,o){const sl=c.slot&&BURN_SIM.SLOTS[c.slot],tG=sl&&BURN_SIM.slotTemp(c.slot,c,20);
  return`<ul class="wo-spec">${c.lot&&!(o&&o.practice)?`<li><button type="button" class="gl" data-g="lotTest">Delivered as a lot</button> <b>${BURN_SIM.CAREER.lot.n} motors, ${BURN_SIM.CAREER.lot.need} must pass</b></li>`:""}${c.spec.map(s=>`<li><button type="button" class="gl" data-g="${BURN_SIM.SPEC_INFO[s.k].gloss||"impulse"}">${esc(BURN_SIM.SPEC_INFO[s.k].name)}</button> <b class="mono">${esc(bandText(s))}</b></li>`).join("")}
    ${sl?sl.hut?`<li>Conditioned in the hut to <b class="mono">${degC(tG)}</b></li>`:`<li>Fired at <b>${sl.name.toLowerCase()}</b> <span class="mono">(${degC(tG)})</span></li>`:""}
    ${c.flight?`<li>Flies from the <b>launch rail</b> with a <b class="mono">${c.flight.payload} kg</b> payload</li>`:c.stand!=="s3"?`<li>On <b>${esc(BURN_SIM.STANDS[c.stand].name)}</b></li>`:""}</ul>`;}
function renderBoard(){
  const car=S.career;if(!car){$("bdList").innerHTML="";return;}
  const S_=BURN_SIM,jobs=Object.keys(car.jobs),offers=S_.board(car),broke=S_.isBroke(car);
  const stands=Object.keys(car.stands).filter(k=>car.stands[k]).map(k=>S_.STANDS[k].name).join(" · ");
  $("bdSite").textContent=`Aqsor Range · ${stands}`;
  let h=`<section class="card bd-status"><div class="bd-who"><b class="sign">${esc(car.name)}</b><span class="hint">Tier ${car.tier}</span></div>
    <dl class="bd-nums"><div><dt>Day</dt><dd class="mono">${car.day}</dd></div><div><dt>Money</dt><dd class="mono ${car.money<0?"crit":""}">${fmtCr(car.money)}</dd></div>
    <div><dt><button type="button" class="gl" data-g="reputation">Reputation</button></dt><dd class="mono">${car.rep}</dd></div></dl>
    <div class="row"><button type="button" class="btn sm" id="bdLog">Logbook</button><button type="button" class="btn sm" id="bdFac">Facilities</button><button type="button" class="btn sm" id="bdSaves">Saves</button></div></section>`;
  if(broke)h+=`<section class="card broke"><h3 class="sign">Out of money</h3><p>The bank has stopped lending: not even the smallest motor on your stand can be paid for. Restart tier ${car.tier} with ${fmtCr(S_.CAREER.startMoney[car.tier])} (your jobs in hand are dropped; reputation, facilities and finished work stay), or start a new career.</p>
    <div class="row"><button type="button" class="btn pri" id="bdRestart">Restart tier ${car.tier}</button><button type="button" class="btn" id="bdNew">New career</button></div></section>`;
  h+=`<h3 class="bd-h">Jobs in hand <span class="hint">${jobs.length} of ${S_.CAREER.maxJobs}</span></h3>`;
  h+=jobs.length?jobs.map(id=>{const c=S_.contractById(id),j=car.jobs[id],late=car.day>j.due;
    return`<article class="wo card job"><header><span class="site">${esc(c.client)}</span><span class="tag ${late?"crit":""}">${esc(dueText(car,j))}</span></header>
      <h3>${esc(c.title)}</h3>${specList(c)}
      <p class="hint mono">Pays ${fmtCr(j.pay)} (×1.2 for an A) · due day ${j.due} · ${j.n} motor${j.n===1?"":"s"} fired</p>
      <div class="row"><button type="button" class="btn pri" data-take="${id}">To the bench</button><button type="button" class="btn sm" data-drop="${id}">Drop</button></div></article>`;}).join("")
    :`<p class="hint">No jobs in hand. Take one from the board below.</p>`;
  h+=`<h3 class="bd-h">On the board</h3>`;
  h+=offers.length?offers.map(c=>{const why=S_.canTake(car,c.id),rep=car.done[c.id];
    return`<article class="wo card"><header><span class="site">${esc(c.client)}</span>${rep?`<span class="tag">Repeat order</span>`:c.tier>1?`<span class="tag">Tier ${c.tier}</span>`:""}</header>
      <h3>${esc(c.title)}</h3><p>${esc(c.brief)}</p>${specList(c)}
      <p class="hint mono">Pays ${fmtCr(S_.basePay(car,c))} · ${c.days} range days to deliver</p>
      <div class="row"><button type="button" class="btn pri" data-take="${c.id}"${why?" disabled":""}>Take the job</button>${why?`<span class="hint">${esc(why)}</span>`:""}</div></article>`;}).join("")
    :`<p class="hint">Nothing new on the board today.${car.tier<2?" Build your reputation and lease Stand 2 for bigger work.":car.tier<3?" Build your reputation and lease Stand 1 for the big boosters.":" More clients arrive in a coming update; repeat orders come back after a few days."}</p>`;
  $("bdList").innerHTML=h;}
function initBoard(){
  $("bdBack").addEventListener("click",()=>{renderTitle();showScreen("title");});
  $("bdList").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const car=S.career;
    if(b.id==="bdLog")openLogbook();else if(b.id==="bdFac")facilitiesSheet();else if(b.id==="bdSaves")savesSheet();
    else if(b.id==="bdRestart"){BURN_SIM.restartTier(car);save(true);renderBoard();toast(`Tier ${car.tier} restarted with ${fmtCr(car.money)}.`);}
    else if(b.id==="bdNew")newCareerSheet();
    else if(b.dataset.drop){const c=BURN_SIM.contractById(b.dataset.drop);
      if(confirm(`Drop "${c.title}"? It goes back on the board; the money spent on it is gone.`)){BURN_SIM.dropJob(car,c.id);save(true);renderBoard();}}});
  $("lgBack").addEventListener("click",openBoard);
  $("lgList").addEventListener("click",e=>{const b=e.target.closest("[data-log]");if(!b)return;const en=S.career.log.find(x=>x.no===+b.dataset.log);if(en)replayFiring(en);});}

/* ---- facilities ---- */
function facilitiesSheet(){
  const car=S.career,F=BURN_SIM.FACILITIES;
  openSheet("Facilities",`<p class="hint">Leases and kit from the Range Authority. Each needs a reputation the range trusts and the money up front.</p>`+
    Object.keys(F).map(id=>{const f=F[id],own=BURN_SIM.owns(car,id),why=own?"":BURN_SIM.canBuy(car,id);
      return`<article class="card fac"><h3>${esc(f.name)}</h3><p>${esc(f.note)}</p><p class="hint mono">${fmtCr(f.cost)} · needs reputation ${f.need}</p>
        ${own?`<span class="stamp pass">Yours</span>`:`<button type="button" class="btn pri" data-buy="${id}"${why?" disabled":""}>Buy</button>${why?` <span class="hint">${esc(why)}</span>`:""}`}</article>`;}).join(""));}
document.addEventListener("click",e=>{const b=e.target.closest("#sheet [data-buy]");if(!b)return;const car=S.career,id=b.dataset.buy;
  const err=BURN_SIM.buy(car,id);if(err){toast(err);return;}save(true);closeSheet();renderBoard();
  const g=BURN_SIM.FACILITIES[id].give;
  toast(g.stand?`${BURN_SIM.STANDS[g.stand].name} is yours: tier ${g.tier} parts and work are open.`
    :g.hut?"The conditioning hut is yours: pick it as the firing slot and set its temperature.":`${BURN_SIM.FACILITIES[id].name}: installed.`,3600);});

/* ---- the logbook ---- */
function openLogbook(){
  const car=S.career,L=car.log.slice().reverse();
  $("lgList").innerHTML=L.length?L.map(e=>{const c=BURN_SIM.contractById(e.key),res=e.letter?`${e.lot?"Lot":"Pass"} ${e.letter}`:(STAMP[e.why]||"Fail");
    return`<button type="button" class="lg-row" data-log="${e.no}"><span class="mono lg-no">41-${String(e.no).padStart(3,"0")}</span>
      <span class="lg-mid"><b>${esc(c?c.title:e.key)}</b><small>Day ${e.day} · ${esc(BURN_SIM.SLOTS[e.slot].name.toLowerCase())}${e.tGrain!=null?" "+degC(e.tGrain):""} · ${e.lot?`lot of ${e.lot}${e.fails?`, ${e.fails} failed`:""}`:`${c&&c.flight?"launch":"motor"} ${e.n}${e.dev?" (development)":""}`}</small></span>
      <span class="lg-end"><span class="stamp ${e.letter?"pass":"fail"}">${esc(res)}</span><small class="mono">${e.paid?"+"+fmtCr(e.paid):"−"+fmtCr(e.cost)}</small></span></button>`;}).join("")
    :`<p class="hint">No firings yet. Every motor you fire is written up here, and you can read its report again.</p>`;
  showScreen("logbook");}

/* ---- saves: three slots, backups ---- */
function savesSheet(){
  const when=t=>t?new Date(t).toLocaleString("en-GB",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";
  const rows=[];for(let i=1;i<=SLOTS;i++){const s=slotInfo(i);
    rows.push(`<li class="slot"><div><b>Slot ${i}</b><small>${s?esc(s.text)+(s.savedAt?" · "+when(s.savedAt):""):"Empty"}</small></div>
      <div class="row"><button type="button" class="btn sm" data-slot-save="${i}">Save here</button>${s?`<button type="button" class="btn sm" data-slot-load="${i}">Load</button><button type="button" class="btn sm" data-slot-clear="${i}">Clear</button>`:""}</div></li>`);}
  openSheet("Saves and backups",`<p class="hint">The game saves itself on this phone as you play. Slots keep extra copies; a backup keeps everything somewhere else.</p>
    <h3>Save slots</h3><ul class="slots">${rows.join("")}</ul>
    <h3>Backups</h3><div class="row wrap"><button type="button" class="btn" data-bu="file">Save a backup file</button><button type="button" class="btn" data-bu="load">Load a backup file</button>
    <button type="button" class="btn" data-bu="backup">Copy a backup code</button><button type="button" class="btn" data-bu="restore">Paste a backup code</button></div>
    <p class="hint" data-bk-store hidden></p>`);
  buStoreLine();}
document.addEventListener("click",e=>{const b=e.target.closest("#sheet button");if(!b)return;const d=b.dataset;
  if(d.slotSave){const i=+d.slotSave;if(slotInfo(i)&&!confirm(`Overwrite slot ${i}?`))return;
    if(saveSlot(i)){toast(`Saved to slot ${i}`);savesSheet();}else toast("This browser wouldn't save (storage full or blocked).");}
  else if(d.slotLoad){const i=+d.slotLoad;if(!confirm(`Load slot ${i}? It replaces the game you're playing now${S.career?` (${S.career.name}, day ${S.career.day})`:""}.`))return;
    if(loadSlot(i)){closeSheet();applyLoaded(`Slot ${i} loaded`);}else toast("That slot couldn't be read.");}
  else if(d.slotClear){const i=+d.slotClear;if(confirm(`Clear slot ${i}?`)){clearSlot(i);savesSheet();}}});
