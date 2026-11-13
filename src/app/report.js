/* ===================== app/report.js: the range report and the incident report (plan section 8) =====================
   After every firing: the measured trace over the prediction, the spec checked line by line, and the grade. When it
   failed, the same form becomes the incident report: the failure moment marked on the chart, the root cause in one
   sentence with the number that crossed the line, the contributing factors ranked, and "where to fix it" buttons that
   jump back to the bench and ring the control (the Escapement CERT_FIX / goFix pattern). Ruslan Abenov signs it.
   The blockhouse data (the real motor's deviations from the grade's and the materials' ratings) sit in a fold-out; with
   the basic instruments only the batch and the case show (the Blockhouse instruments facility shows the rest).
   In a career the bill follows: the stand's fee, the motor's materials, the client's pay (grade and lateness) and the
   money left. A logbook entry's report (GAME.last.replay) is read-only.
   A tender's lot (GAME.last.lot) adds the lot card: every motor's result, all five traces on the chart, and the details
   below for the motor picked (the first failure to start with). A Sandbox firing (GAME.last.sandbox) is graded but has no bill. A Daily Spec firing (GAME.last.daily) shows today's best and offers Share (app/daily.js).
   A launch (f.flight) adds the flight: height against time, predicted (no wind) and real, with apogee, top speed, the
   day's wind and where it landed; the motor's own curves follow as the onboard logger's data. */
const STAMP={lot:"Tender lost",cato:"CATO",eject:"Nozzle lost",burnthrough:"Burn-through",hangfire:"Hang fire",chuff:"Chuffing",spec:"Spec miss",yield:"Case yielded"};
const RSO_LINES={
  A:["Clean curve. Write it up and go home early.","It did what you said it would. Rare. Signed.","Textbook. I'll pin the trace on the blockhouse wall."],
  B:["Close enough for the customer. Not for me.","A good motor. Next time, a better one."],
  C:["It passed. I've seen better and I've seen worse.","Inside the lines, just. Don't make a habit of it."],
  cato:["Stand 3 needs a new load cell. Bring a broom.","The case was optimistic. So were you.","I heard that one from the blockhouse, through a metre of concrete."],
  eject:["The nozzle is somewhere east of the stand. Find it before the foxes do.","Good bolts are cheaper than a new nozzle."],
  burnthrough:["The liner gave up before the propellant did.","There's a hole in your case the shape of a lesson."],
  hangfire:["We waited the full thirty minutes. Nothing. Pull it and fit a bigger igniter.","It just sat there. So did we."],
  chuff:["Sounded like a tractor that won't start. Give it more pressure.","Puff, puff, puff. The customer wanted a motor."],
  spec:["It works. It just isn't what they ordered.","A fine motor for somebody else's contract."],
  yield:["The tube came off the stand wider than it went on.","Stretched cases don't fly. Thicker wall."],
  free:["Data logged. Nobody's paying for this one, so make it count.","Free firing. The range fee is not free."],
  lost:["The recovery team brought back a bag of bits. That was the rocket.","It came apart at a height I'd rather not write down.","The motor went before the rocket did. Then the rocket went too."],
  lot:["Two out of five went wrong. The agency wanted four out of five, and so did I.","A tender is won on the worst motor, not the best one.","They'll put it out again. Bring a design with more margin."],
  lotA:["Five motors, one curve. That's what a supplier looks like.","I couldn't tell them apart on the plot. Good."],
  flyA:["Straight up, straight down, right where they wanted it. Signed.","The altimeter agrees with you. So do I."]};
const FAIL_GLOSS={cato:"cato",eject:"nozzleEject",burnthrough:"burnThrough",hangfire:"hangFire",chuff:"chuffing"};
const rsoLine=(key,n)=>{const a=RSO_LINES[key]||RSO_LINES.free;return a[(n-1)%a.length];};
const pctS=v=>(v>=0?"+":"−")+Math.abs(v*100).toFixed(Math.abs(v)<0.1?1:0)+"%";
function openReport(){renderReport();showScreen("report");}
function renderReport(){
  const L=GAME.last;if(!L)return;
  /* a lot: the details below are for the selected motor; the stamp is the lot's */
  const LT=L.lot,f=LT?LT.fires[LT.sel]:L.f,g=LT?LT.gl.grades[LT.sel]:L.g,c=L.c,sl=BURN_SIM.SLOTS[L.slot],tG=L.tGrain??sl.tGrain,fl=f.failure,ms=f.meas.sum,ps=f.pred.sum,m=f.motor;
  const fly=f.flight||null,lost=!!(fly&&fly.lost);
  let pass=c?g.pass:!fl,key=lost?"lost":c?(g.pass?(fly&&g.letter==="A"?"flyA":g.letter):g.why):(fl?fl.key:"free");
  let stamp=lost?"Rocket lost":c?(g.pass?`Pass · ${g.letter}`:STAMP[g.why]||"Fail"):(fl?STAMP[fl.key]:"Logged");
  if(LT){const G=LT.gl;pass=G.pass;key=G.pass?(G.letter==="A"&&!G.fails?"lotA":G.letter):"lot";stamp=G.pass?`Lot accepted · ${G.letter}`:"Tender lost";}
  /* the spec, line by line: band, predicted at this temperature, measured */
  const checks=c?g.checks.length?g.checks:BURN_SIM.specCheck(c.spec,ms,m):[];
  const predChecks=c?BURN_SIM.specCheck(c.spec,fly&&f.fpred?Object.assign({},ps,{apogee:f.fpred.apogee}):ps,m):[];
  const rows=checks.map((k,i)=>`<tr><th><button type="button" class="gl" data-g="${k.info.gloss||"impulse"}">${esc(k.info.name)}</button><small>${esc(bandText(k))}</small></th>
    <td class="mono">${fmtSpec(k.k,predChecks[i].v)}</td><td class="mono"><b class="${fl&&fl.destructive?"":k.ok?"good":"crit"}">${fmtSpec(k.k,k.v)}</b></td><td aria-label="${k.ok?"in spec":"out of spec"}">${fl&&fl.destructive?"–":k.ok?"✓":"✗"}</td></tr>`).join("");
  const basic=[["impulse","Total impulse",ps.I.toFixed(1),ms.I.toFixed(1),"N·s"],["thrust","Average thrust",ps.Fav.toFixed(0),ms.Fav.toFixed(0),"N"],
    ["burnTime","Burn time",ps.tb.toFixed(2),ms.tb.toFixed(2),"s"],["pressure","Peak pressure",(ps.Pmax/1e6).toFixed(2),(ms.Pmax/1e6).toFixed(2),"MPa"]]
    .map(([gk,n,a,b,u])=>`<tr><th><button type="button" class="gl" data-g="${gk}">${n}</button><small>${u}</small></th><td class="mono">${a}</td><td class="mono"><b>${b}</b></td><td></td></tr>`).join("");
  /* what went wrong and where to fix it */
  let cause="",fixes=[];
  if(fl){cause=fl.text;fixes=fixes.concat(fl.fix||[]);}
  else if(c&&!g.pass&&g.why==="spec"){const miss=g.miss||[];cause=miss.map(k=>`${k.info.name} came in at ${fmtSpec(k.k,k.v)} ${k.info.unit}; the spec asked for ${bandText(k)}.`).join(" ");
    for(const k of miss)fixes=fixes.concat(k.info.fix);}
  for(const n of f.notes)fixes=fixes.concat(n.fix||[]);
  if(c&&!g.pass&&g.why==="yield")cause=f.notes.find(n=>n.key==="yield").text;
  fixes=L.replay?[]:[...new Set(fixes)].filter(fd=>ctlSpec(fd));
  const factors=fl?f.factors.slice(0,4):[];
  const maxF=Math.max(0.05,...factors.map(x=>Math.abs(x.pct)));
  const d=f.draws,full=L.bunker>=1;
  const blockhouse=[`Propellant batch: ${pctS(d.aMul-1)} burn rate`,`Case tube: ${pctS(d.caseMul-1)} strength`].concat(full?[`Closures: ${pctS(d.retMul-1)} retention`,
    `Liner: ${pctS(d.linerMul-1)} protection`,`Igniter: ${pctS(d.ignMul-1)} gas`,`Throat wear: ×${d.eroMul.toFixed(2)}`,
    `Casting void: ${d.void?"yes, "+Math.round(d.void.frac*100)+"% extra area":"none"} (chance ${(d.voidChance*100).toFixed(1)}%)`,
    `Grain crack: ${d.crack?"yes, "+Math.round(d.crack.frac*100)+"% extra area":"none"} (chance ${(d.crackChance*100).toFixed(1)}%)`]:[]);
  /* the bill (career): live after a firing, or the logbook's short version */
  let bill="";
  if(L.out){const b=L.bill,o=L.out,car=S.career;
    bill=`<section class="card rp-bill"><h3>The bill</h3><table class="dtab mono">
      <tr><th>${fly?"Launch rail":esc(BURN_SIM.STANDS[c.stand].name)} fee, day ${o.day}</th><td>−${fmtCr(b.fee)}</td></tr>
      ${b.hut?`<tr><th>Conditioning hut</th><td>−${fmtCr(b.hut)}</td></tr>`:""}${b.air?`<tr><th>The rocket (${esc(fly?fly.rocket.body.name:"airframe")})</th><td>−${fmtCr(b.air)}</td></tr>`:""}
      <tr><th><details><summary>Motor materials${b.n>1?`, ${b.n} motors`:""}</summary><ul>${b.build.items.filter(x=>x.cr>0).map(x=>`<li>${esc(x.label)}: ${fmtCr(x.cr)}${b.n>1?" each":""}</li>`).join("")}</ul></details></th><td>−${fmtCr(b.motors||b.build.total)}</td></tr>
      ${o.paid?`<tr><th>${esc(c.client)} pays (grade ${L.lot?L.lot.gl.letter:g.letter} ×${o.gradeMul}${o.lotMul<1?`, one failure ×${o.lotMul}`:""}${o.late?`, ${o.late} day${o.late>1?"s":""} late ×${o.lateMul.toFixed(1)}`:""})</th><td class="good">+${fmtCr(o.paid)}</td></tr>`:""}
      <tr class="sep"><th>Money now</th><td class="${L.money<0?"crit":""}">${fmtCr(L.money)}</td></tr></table>
      ${o.dev?`<p class="hint">A development motor: it shows how this design fires, but the client only takes a lot of ${BURN_SIM.CAREER.lot.n}.</p>`:""}
      ${o.lost?`<p class="sev crit">Tender lost: ${L.lot.gl.fails} of the ${L.lot.fires.length} motors failed. The range puts it out again on day ${(car.retender||{})[c.id]}.</p>`:""}
      ${o.done?`<p class="hint">Job delivered.${o.rep?` Reputation +${o.rep}.`:""}</p>`:car&&car.jobs[c.id]?`<p class="hint">The job stays in hand: due day ${car.jobs[c.id].due}.</p>`:""}</section>`;}
  else if(L.replay&&L.entry){const e=L.entry;bill=`<p class="rp-note mono">Day ${e.day} · cost ${fmtCr(e.cost)}${e.paid?` · paid ${fmtCr(e.paid)}`:""}${e.late?` · ${e.late} day${e.late>1?"s":""} late`:""}</p>`;}
  const broke=L.out&&S.career&&BURN_SIM.isBroke(S.career)?`<section class="card broke"><h3 class="sign">Out of money</h3><p>The bank won't pay for another motor. The work orders offer a restart of the tier.</p></section>`:"";
  /* the Daily Spec: how today stands, and sharing it */
  const dl=L.daily?`<section class="card rp-daily"><h3>Daily Spec No. ${c.no}</h3><p>${L.daily.isBest&&L.daily.bestN>1?"<b>A new best.</b> ":""}${L.daily.best?`Today's best: <b>${L.daily.best}</b>, on firing ${L.daily.bestN}.`:"No pass yet today. Fire again: only the best counts."}</p>
    <p class="hint">${L.daily.best==="A"?"An A is as good as it gets. Share it, or keep firing for the fun of it.":"Fire as often as you like; the best grade is kept."}</p></section>`:"";
  const act=L.replay?`<button type="button" class="btn pri" id="rpLog">Back to the logbook</button>`
    :L.sandbox?`<button type="button" class="btn pri" id="rpBench">Back to the bench</button><button type="button" class="btn" id="rpAgain">Fire another</button><button type="button" class="btn" id="rpSbx">Other jobs</button><button type="button" class="btn" id="rpTitle">Title</button>`
    :L.daily?`<button type="button" class="btn pri" id="rpBench">Back to the bench</button><button type="button" class="btn" id="rpAgain">Fire another</button><button type="button" class="btn" id="rpShare">Share</button><button type="button" class="btn" id="rpTitle">Title</button>`
    :L.out&&L.out.done?`<button type="button" class="btn pri" id="rpBoard">Work orders</button><button type="button" class="btn" id="rpBench">Back to the bench</button>`
    :`<button type="button" class="btn pri" id="rpBench">Back to the bench</button>${!c||S.career&&S.career.jobs[c.id]?`<button type="button" class="btn" id="rpAgain">Fire another</button>`:""}${c?`<button type="button" class="btn" id="rpBoard">Work orders</button>`:""}`;
  $("rpBody").innerHTML=`
    <header class="rp-form"><div class="ghost" aria-hidden="true">АҚСОР · 41</div>
      <span class="site">Aqsor Range · Site 41 · ${esc(fly?"Launch rail":c?BURN_SIM.STANDS[c.stand].name:"Stand 3")}</span>
      <h2 class="sign">${fl&&fl.destructive?"Incident report":fly?"Flight report":"Range report"} <span class="mono">No. ${L.sandbox?`S-${L.n}`:L.daily?`D${c.no}-${L.n}`:`41-${String(L.no).padStart(3,"0")}`}</span></h2>
      <p class="rp-meta mono">${esc(ps.designation)} · ${sl.name.toLowerCase()} · ${degC(tG)} grain · ${LT?`lot of ${LT.fires.length}, motor ${LT.sel+1} below`:`${fly?"launch":"motor"} ${L.n}`}${c?` · ${esc(c.client)}`:""}</p>
      <span class="stamp big ${pass?"pass":"fail"}">${esc(stamp)}</span>${c?` <button type="button" class="gl hint" data-g="gradeLetter">How grades work</button>`:""}</header>
    ${broke}${dl}${LT?lotCard(L):""}${fly?flightCard(f,tG):""}<section class="card rp-chart">${fly?`<h3>Onboard logger: the motor</h3>`:""}<canvas id="rpCv" role="img" aria-label="Predicted and measured pressure and thrust"></canvas>
      <p class="dz-key"><span class="k-pr"></span>Predicted at ${degC(tG)}<span class="k-me"></span>Measured</p></section>
    ${cause?`<section class="card rp-cause"><h3>${fl&&FAIL_GLOSS[fl.key]?`<button type="button" class="gl" data-g="${FAIL_GLOSS[fl.key]}">Root cause</button>`:fl?"Root cause":"Why it missed"}</h3><p>${esc(cause)}</p>
      ${factors.length?`<h3><button type="button" class="gl" data-g="variance">What pushed it</button></h3><p class="hint">Red pushed it towards the line; green held it back. Ranked.</p><ol class="factors">${factors.map(x=>`<li><span class="bar ${x.pct>0?"up":"dn"}" style="width:${Math.round(Math.min(1,Math.abs(x.pct)/maxF)*100)}%"></span><span>${esc(x.text)}</span></li>`).join("")}</ol>`:""}
      ${fixes.length?`<h3>Where to fix it</h3><div class="row">${fixes.map(fd=>`<button type="button" class="btn" data-goto="${fd}">${esc(ctlSpec(fd).label)} ›</button>`).join("")}</div>`:""}</section>`:""}
    ${f.notes.filter(n=>!(c&&!g.pass&&g.why==="yield"&&n.key==="yield")).map(n=>`<p class="rp-note">${esc(n.text)}</p>`).join("")}
    <section class="card"><table class="dtab rp-tab"><thead><tr><th></th><th>Predicted</th><th>Measured</th><th></th></tr></thead><tbody>${rows}${rows?`<tr class="sep"><td colspan="4"></td></tr>`:""}${basic}</tbody></table></section>
    ${bill}<details class="card rp-bh"><summary>Blockhouse data: this motor against its ratings</summary><ul class="mono">${blockhouse.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
      <p class="hint">${full?"Every real motor is a little different. These are the dice this one rolled; the next motor rolls again.":"The basic data logger only catches the batch and the case. Blockhouse instruments (Facilities) read the rest: closures, liner, igniter, throat wear, voids and cracks."}</p></details>
    <footer class="rp-sign"><p>“${esc(rsoLine(key,L.n))}”</p><p class="sig">R. Abenov, RSO</p></footer>
    <div class="rp-act">${act}</div>`;
  drawReportChart();}
/* a tender's lot: one row per motor (tap one to read its details below), and the rule it was judged by */
function lotCard(L){const LT=L.lot,G=LT.gl,R=BURN_SIM.CAREER.lot;
  const rows=LT.fires.map((f,i)=>{const g=G.grades[i],s=f.meas.sum,res=g.pass?`Pass ${g.letter}`:(STAMP[g.why]||"Fail");
    return`<tr${i===LT.sel?` class="on"`:""}><th><button type="button" class="btn sm" data-lotsel="${i}" aria-pressed="${i===LT.sel}">Motor ${i+1}</button></th>
      <td class="mono">${s.I.toFixed(0)}</td><td class="mono">${(s.Pmax/1e6).toFixed(2)}</td><td><b class="${g.pass?"good":"crit"}">${esc(res)}</b></td></tr>`;}).join("");
  return`<section class="card rp-lot"><h3><button type="button" class="gl" data-g="lotTest">The lot</button></h3>
    <p class="hint">${R.n} motors from one design; ${R.need} must pass. ${G.pass?G.fails?`One failed: the lot is accepted at ${Math.round(R.failPay*100)}% of the pay.`:"Every motor passed.":`${G.fails} failed: the tender is lost.`} The lot's grade is its worst passing motor's.</p>
    <table class="dtab rp-tab"><thead><tr><th></th><th>N·s</th><th>MPa</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">The chart shows all ${LT.fires.length} motors: the selected one bold, the others faint.</p></section>`;}
/* the flight's card: the altitude chart and the numbers that made it */
function flightCard(f,tG){
  const fl=f.flight,fp=f.fpred,R=fl.rocket,row=(g,k,a,b)=>`<tr><th><button type="button" class="gl" data-g="${g}">${k}</button></th><td class="mono">${a}</td><td class="mono"><b>${b}</b></td></tr>`;
  const dir=fl.drift<0?"upwind":"downwind";
  return`<section class="card rp-fly"><h3><button type="button" class="gl" data-g="apogee">The flight</button></h3>
    <canvas id="rpFly" role="img" aria-label="Height against time: predicted apogee ${Math.round(fp.apogee)} m, ${fl.lost?`rocket lost at ${Math.round(fl.hLost)} m`:`real apogee ${Math.round(fl.apogee)} m`}"></canvas>
    <p class="dz-key"><span class="k-pr"></span>Predicted, ${degC(tG)}, no wind<span class="k-me"></span>Flown</p>
    ${fl.lost?`<p class="sev crit">The motor failed ${fl.hLost<BURN_SIM.FLIGHT.rail?`on the launch rail, ${fl.tLost.toFixed(2)} s after ignition`:`${fl.tLost.toFixed(2)} s after ignition, ${Math.round(fl.hLost)} m up`}. The rocket and the client's payload are gone.</p>`:""}
    <table class="dtab rp-tab"><thead><tr><th></th><th>Predicted</th><th>Flown</th></tr></thead><tbody>
    ${row("apogee","Apogee",Math.round(fp.apogee)+" m",fl.lost?"–":Math.round(fl.apogee)+" m")}
    ${row("apogee","Top speed",Math.round(fp.vMax)+" m/s",Math.round(fl.vMax)+" m/s")}
    ${row("railSpeed","Off the rail",fp.vRail.toFixed(1)+" m/s",fl.vRail>0?fl.vRail.toFixed(1)+" m/s":"–")}
    ${row("wind","Wind on the rail","none",fl.wind.toFixed(1)+" m/s")}
    ${fl.lost?"":row("wind","Apogee drift","0 m",`${Math.round(Math.abs(fl.drift))} m ${dir}`)}
    </tbody></table>
    <p class="hint">${esc(R.body.name)}, ${esc(R.nose.name.toLowerCase())} nose, ${esc(R.fins.name.toLowerCase())} · ${R.mass0.toFixed(2)} kg at liftoff${R.payload?`, ${R.payload} kg of it payload`:""}.</p></section>`;}
function drawReportChart(){
  const L=GAME.last;if(!L||$("report").hidden&&!$("rpCv"))return;const f=L.lot?L.lot.fires[L.lot.sel]:L.f,fl=f.failure,fly=f.flight;
  if(fly&&$("rpFly"))BURN_VIS.altitude($("rpFly"),{pred:f.fpred.samples,meas:fly.samples,apoP:f.fpred.apogee,apoM:fly.apogee,lost:fly.lost?{t:fly.tLost,h:fly.hLost}:null});
  BURN_VIS.strip($("rpCv"),{pred:f.plog,meas:f.log,pLine:f.limits.pBurst,mark:fl&&FAIL_LABEL[fl.key]?{t:fl.t,label:FAIL_LABEL[fl.key]}:null,
    events:f.events.map(e=>({t:e.t,label:e.key})),others:L.lot?L.lot.fires.filter(x=>x!==f).map(x=>x.log):null});}
function initReport(){
  $("rpBody").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.goto){if(GAME.last&&GAME.last.replay)return;showScreen("design");drawAll();goToField(b.dataset.goto);}
    else if(b.id==="rpBench"){showScreen("design");drawAll();}
    else if(b.id==="rpAgain"){showScreen("design");drawAll();toStand();}
    else if(b.id==="rpBoard")openBoard();
    else if(b.id==="rpLog")openLogbook();
    else if(b.id==="rpShare")shareDaily();
    else if(b.id==="rpSbx")sandboxSheet();
    else if(b.dataset.lotsel!=null&&GAME.last&&GAME.last.lot){GAME.last.lot.sel=+b.dataset.lotsel;const y=window.scrollY;renderReport();window.scrollTo(0,y);}
    else if(b.id==="rpTitle"){renderTitle();showScreen("title");}});
  addEventListener("resize",()=>{if(!$("report").hidden)drawReportChart();});}
