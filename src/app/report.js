/* ===================== app/report.js: the range report and the incident report (plan section 8) =====================
   After every firing: the measured trace over the prediction, the spec checked line by line, and the grade. When it
   failed, the same form becomes the incident report: the failure moment marked on the chart, the root cause in one
   sentence with the number that crossed the line, the contributing factors ranked, and "where to fix it" buttons that
   jump back to the bench and ring the control (the Escapement CERT_FIX / goFix pattern). Ruslan Abenov signs it.
   The blockhouse data (the real motor's deviations from the grade's and the materials' ratings) sit in a fold-out. */
const STAMP={cato:"CATO",eject:"Nozzle lost",burnthrough:"Burn-through",hangfire:"Hang fire",chuff:"Chuffing",spec:"Spec miss",yield:"Case yielded"};
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
  free:["Data logged. Nobody's paying for this one, so make it count.","Free firing. The range fee is not free."]};
const FAIL_GLOSS={cato:"cato",eject:"nozzleEject",burnthrough:"burnThrough",hangfire:"hangFire",chuff:"chuffing"};
const rsoLine=(key,n)=>{const a=RSO_LINES[key]||RSO_LINES.free;return a[(n-1)%a.length];};
const pctS=v=>(v>=0?"+":"−")+Math.abs(v*100).toFixed(Math.abs(v)<0.1?1:0)+"%";
function openReport(){renderReport();showScreen("report");}
function renderReport(){
  const L=GAME.last;if(!L)return;
  const f=L.f,g=L.g,c=L.c,sl=BURN_SIM.SLOTS[L.slot],fl=f.failure,ms=f.meas.sum,ps=f.pred.sum,m=f.motor;
  const pass=c?g.pass:!fl,key=c?(g.pass?g.letter:g.why):(fl?fl.key:"free");
  const stamp=c?(g.pass?`Pass · ${g.letter}`:STAMP[g.why]||"Fail"):(fl?STAMP[fl.key]:"Logged");
  /* the spec, line by line: band, predicted at this temperature, measured */
  const checks=c?g.checks.length?g.checks:BURN_SIM.specCheck(c.spec,ms,m):[];
  const predChecks=c?BURN_SIM.specCheck(c.spec,ps,m):[];
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
  fixes=[...new Set(fixes)].filter(fd=>ctlSpec(fd));
  const factors=fl?f.factors.slice(0,4):[];
  const maxF=Math.max(0.05,...factors.map(x=>Math.abs(x.pct)));
  const d=f.draws;
  const blockhouse=[`Propellant batch: ${pctS(d.aMul-1)} burn rate`,`Case tube: ${pctS(d.caseMul-1)} strength`,`Closures: ${pctS(d.retMul-1)} retention`,
    `Liner: ${pctS(d.linerMul-1)} protection`,`Igniter: ${pctS(d.ignMul-1)} gas`,`Throat wear: ×${d.eroMul.toFixed(2)}`,
    `Casting void: ${d.void?"yes, "+Math.round(d.void.frac*100)+"% extra area":"none"} (chance ${(d.voidChance*100).toFixed(1)}%)`,
    `Grain crack: ${d.crack?"yes, "+Math.round(d.crack.frac*100)+"% extra area":"none"} (chance ${(d.crackChance*100).toFixed(1)}%)`];
  $("rpBody").innerHTML=`
    <header class="rp-form"><div class="ghost" aria-hidden="true">АҚСОР · 41</div>
      <span class="site">Aqsor Range · Site 41 · Stand 3</span>
      <h2 class="sign">${fl&&fl.destructive?"Incident report":"Range report"} <span class="mono">No. 41-${String(L.no).padStart(3,"0")}</span></h2>
      <p class="rp-meta mono">${esc(ps.designation)} · ${sl.name.toLowerCase()} · ${degC(sl.tGrain)} grain · motor ${L.n}${c?` · ${esc(c.client)}`:""}</p>
      <span class="stamp big ${pass?"pass":"fail"}">${esc(stamp)}</span>${c?` <button type="button" class="gl hint" data-g="gradeLetter">How grades work</button>`:""}</header>
    <section class="card rp-chart"><canvas id="rpCv" role="img" aria-label="Predicted and measured pressure and thrust"></canvas>
      <p class="dz-key"><span class="k-pr"></span>Predicted at ${degC(sl.tGrain)}<span class="k-me"></span>Measured</p></section>
    ${cause?`<section class="card rp-cause"><h3>${fl&&FAIL_GLOSS[fl.key]?`<button type="button" class="gl" data-g="${FAIL_GLOSS[fl.key]}">Root cause</button>`:fl?"Root cause":"Why it missed"}</h3><p>${esc(cause)}</p>
      ${factors.length?`<h3><button type="button" class="gl" data-g="variance">What pushed it</button></h3><p class="hint">Red pushed it towards the line; green held it back. Ranked.</p><ol class="factors">${factors.map(x=>`<li><span class="bar ${x.pct>0?"up":"dn"}" style="width:${Math.round(Math.min(1,Math.abs(x.pct)/maxF)*100)}%"></span><span>${esc(x.text)}</span></li>`).join("")}</ol>`:""}
      ${fixes.length?`<h3>Where to fix it</h3><div class="row">${fixes.map(fd=>`<button type="button" class="btn" data-goto="${fd}">${esc(ctlSpec(fd).label)} ›</button>`).join("")}</div>`:""}</section>`:""}
    ${f.notes.filter(n=>!(c&&!g.pass&&g.why==="yield"&&n.key==="yield")).map(n=>`<p class="rp-note">${esc(n.text)}</p>`).join("")}
    <section class="card"><table class="dtab rp-tab"><thead><tr><th></th><th>Predicted</th><th>Measured</th><th></th></tr></thead><tbody>${rows}${rows?`<tr class="sep"><td colspan="4"></td></tr>`:""}${basic}</tbody></table></section>
    <details class="card rp-bh"><summary>Blockhouse data: this motor against its ratings</summary><ul class="mono">${blockhouse.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
      <p class="hint">Every real motor is a little different. These are the dice this one rolled; the next motor rolls again.</p></details>
    <footer class="rp-sign"><p>“${esc(rsoLine(key,L.n))}”</p><p class="sig">R. Abenov, RSO</p></footer>
    <div class="rp-act"><button type="button" class="btn pri" id="rpBench">Back to the bench</button><button type="button" class="btn" id="rpAgain">Fire another</button>${c?`<button type="button" class="btn" id="rpBoard">Work orders</button>`:""}</div>`;
  drawReportChart();}
function drawReportChart(){
  const L=GAME.last;if(!L||$("report").hidden&&!$("rpCv"))return;const f=L.f,fl=f.failure;
  BURN_VIS.strip($("rpCv"),{pred:f.plog,meas:f.log,pLine:f.limits.pBurst,mark:fl&&FAIL_LABEL[fl.key]?{t:fl.t,label:FAIL_LABEL[fl.key]}:null,
    events:f.events.map(e=>({t:e.t,label:e.key}))});}
function initReport(){
  $("rpBody").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.goto){showScreen("design");drawAll();goToField(b.dataset.goto);}
    else if(b.id==="rpBench"){showScreen("design");drawAll();}
    else if(b.id==="rpAgain"){showScreen("design");drawAll();toStand();}
    else if(b.id==="rpBoard")openBoard();});
  addEventListener("resize",()=>{if(!$("report").hidden)drawReportChart();});}
