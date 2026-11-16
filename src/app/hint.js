/* ===================== app/hint.js: the stuck hint (1.7, Kelbo 16 November 2026) =====================
   When a job won't come right, the bench names the one change that helps most (sim/hint.js): the biggest problem with the
   motor as drawn, and which way to move one control. Only the direction, never the number. Two ways in:
     free   after CAREER.hintFreeAfter missed firings on a career job, your partner leaves a note: the report offers it (if
            Settings > Hint notes is on) and the Job sheet's Hint button costs nothing. Always free in the Sandbox.
     paid   before that, the Job sheet's Hint button calls in a retired engineer from the old programme, for a share of the
            job's pay (CAREER.hintShare, at least hintMin). Asking again about the same motor costs nothing.
   The Daily Spec has no hints: it's the same puzzle for everyone. The free bench has no client, so no hint either.
   A miss is a logged firing on the job, since it was taken, that didn't pass (a tender's lot or development motor too). */
const HINT_WHO={free:"Your partner's note",paid:"The consultant's note",sandbox:"A note from the bench"};
/* which way to move each control, in words; [more, less] */
const HINT_MOVE={"nozzle.throatD":["Open the throat up: a wider throat","Close the throat down: a narrower throat"],
  "grain.segLen":["Make the segments longer","Make the segments shorter"],"grain.coreD":["Open the core up: a wider core","Close the core down: a narrower core"],
  "nozzle.exitD":["A wider nozzle exit","A narrower nozzle exit"],"case.id":["A wider case: a bigger bore","A narrower case: a smaller bore"],
  "case.wall":["A thicker case wall","A thinner case wall"],"grain.segs":["Add a segment","Take a segment off"],
  "case.linerThk":["A thicker liner","A thinner liner"],"case.bolts":["More closure bolts","Fewer closure bolts"],
  size:["Scale the whole motor up: the bore, the grain and the nozzle together","Scale the whole motor down: the bore, the grain and the nozzle together"],
  segsKeep:["Cut the grain into more, shorter segments, the same length overall","Fewer, longer segments, the same length overall"],
  coreThroat:["Open the core and the throat up together","Close the core and the throat down together"]};
/* the control a move made together is set from */
const HINT_FIELD={size:"case.id",segsKeep:"grain.segs",coreThroat:"grain.coreD"};
const HINT_PART={"grain.prop":"propellant grade","grain.shape":"grain shape","case.mat":"case material","nozzle.mat":"throat material","case.liner":"liner","case.closure":"closures"};
const HINT_MARGIN={liner:"The burn is long for the liner: a motor that burns a little longer than predicted could get through to the case.",
  burst:"The peak pressure is close to the case's burst rating.",yield:"The peak pressure is close to where the case starts to yield.",
  closure:"The closures have little margin at the peak pressure.",chuff:"The pressure at the end of the burn is close to the chuffing limit."};
const HINT_TABLE={igniter:"IGNITERS","airframe.nose":"NOSES","airframe.fins":"FINS","airframe.body":"BODIES"};

/* can this bench ask for a hint at all, and on what terms */
const hintOpen=()=>!!GAME.contract&&!isDaily()&&(inCareer()||isSandbox());
function hintMisses(c){const car=S.career,j=car&&car.jobs[c.id];if(!j)return 0;
  return car.log.filter(e=>e.key===c.id&&e.day>=j.taken&&!e.letter).length;}
function hintFee(c){const C=BURN_SIM.CAREER,j=S.career&&S.career.jobs[c.id];if(!j)return 0;
  return Math.max(C.hintMin,Math.round(j.pay*C.hintShare/10)*10);}
const hintFree=c=>isSandbox()||hintMisses(c)>=BURN_SIM.CAREER.hintFreeAfter;
/* the Job sheet's button */
function hintButton(){const c=GAME.contract;if(!hintOpen())return"";
  const free=hintFree(c),n=hintMisses(c),C=BURN_SIM.CAREER;
  return`<h3>Stuck?</h3><div class="row"><button type="button" class="btn" data-hint="${free?"free":"paid"}">${free?"Hint":`Hint · ${fmtCr(hintFee(c))}`}</button></div>
    <p class="hint">${isSandbox()?"Names the biggest problem with this motor and which way to move one control. Free in the Sandbox.":free?"Your partner has seen the misses: the hint is free on this job."
    :`A retired engineer from the old programme names the biggest problem and which way to move one control. Free after ${C.hintFreeAfter} misses on a job (${n} so far).`}</p>`;}

/* the problem, in words */
function hintIssue(x){if(!x)return"";const I=BURN_SIM.SPEC_INFO;
  if(x.kind==="spec"){const i=I[x.key],v=fmtSpec(x.key,x.v)+(i.unit==="%"||i.unit==="×"?i.unit:" "+i.unit),band=bandText({k:x.key,lo:x.lo,hi:x.hi});
    return x.dir==="low"?`${i.name} is short: ${v} predicted, and the job asks for ${band}.`:x.dir==="high"?`${i.name} is over: ${v} predicted, and the job asks for ${band}.`
      :`${i.name} is inside the spec but close to its edge (${v} for ${band}), so the real motor's scatter can push it out.`;}
  if(x.kind==="flag")return`${FLAG_SHORT[x.key]||"A warning"}: ${x.text}`;
  if(x.kind==="margin")return HINT_MARGIN[x.key]||"A rating has little margin left.";
  return x.text||"";}
/* the move, in words, and the control it goes to */
function hintAdvice(h){
  if(h.kind==="move")return{text:HINT_MOVE[h.f][h.dir>0?0:1]+".",field:HINT_FIELD[h.f]||h.f};
  if(h.kind==="pick"){const it=BURN_SIM[HINT_TABLE[h.f]][h.v],c=ctlSpec(h.f);return{text:`${c?c.label:"Swap it"}: try the ${it.name.toLowerCase()}.`,field:h.f};}
  if(h.kind==="part")return{text:`Look at the ${HINT_PART[h.f]} again: a different one gets closer than any slider here.`,field:h.f};
  return null;}
/* work out a hint for the motor on the bench and show it. paid: charge the fee first (career only) */
function askHint(how){
  const c=GAME.contract;if(!c||!DZ.d||!hintOpen())return;
  const key=gameKey()+"|"+DZ.tGrain+"|"+snapNow(),seen=GAME.hintSeen&&GAME.hintSeen.key===key;
  if(how==="paid"&&!seen&&!hintFree(c)){const fee=hintFee(c);if(!BURN_SIM.canAfford(S.career,fee)){toast("The bank won't cover the consultant.");return;}}
  openSheet("Hint",`<p class="hint">Looking over the drawing…</p>`);
  setTimeout(()=>{
    const h=seen?GAME.hintSeen.h:BURN_SIM.hint(c,DZ.d,{tGrain:DZ.tGrain,tier:partTier()||c.tier});
    let paid=0;
    /* the consultant charges for a real look: not for a motor that can't be built, and not twice for the same one */
    if(how==="paid"&&!seen&&!hintFree(c)&&h.kind!=="broken"){paid=hintFee(c);S.career.money-=paid;save(true);}
    GAME.hintSeen={key,h};
    showHint(h,how==="paid"&&!hintFree(c)?"paid":isSandbox()?"sandbox":"free",paid);},reduced()?0:60);}
function showHint(h,who,paid){
  const a=hintAdvice(h);let body;
  if(h.kind==="broken")body=`<p>This motor can't be built yet. The red flags on the bench say what's wrong: fix those first.</p>`;
  else if(h.kind==="sound")body=`<p>On paper this motor delivers: in the middle of every band, with a margin under every rating.</p>
    <p>The misses were the real motor's scatter. Fire it again${scatterAvail()?", or tap Scatter on the bench to see how widely it spreads":""}.</p>`;
  else if(h.kind==="stuck")body=`<p><b>The biggest problem:</b> ${esc(hintIssue(h.issue))}</p><p>No single step from here fixes it. Try a bigger change, or start again from the job's starting motor (Data sheet).</p>`;
  else body=`<p><b>The biggest problem:</b> ${esc(hintIssue(h.issue))}</p><p><b>Try:</b> ${esc(a.text)}</p>
    <p class="hint">Only the direction: how far is up to you. The prediction redraws as you go.</p>
    ${ctlSpec(a.field)?`<div class="row"><button type="button" class="btn pri" data-hintgo="${a.field}">Go to ${esc(ctlSpec(a.field).label.toLowerCase())}</button></div>`:""}`;
  openSheet("Hint",`<p class="hint">${HINT_WHO[who]}${paid?` · ${fmtCr(paid)}`:""} · predicted at ${esc(degC(DZ.tGrain))}</p>${body}`);
  if(paid)toast(`The consultant's fee: ${fmtCr(paid)}`);}
/* the report's card: after enough misses on a job still in hand */
function hintCard(L){
  if(!L||L.replay||!L.out||!L.c||L.daily||L.sandbox||SETTINGS.hints===false)return"";
  const c=L.c,pass=L.lot?L.lot.gl.pass:L.g&&L.g.pass;
  if(pass||!S.career||!S.career.jobs[c.id]||GAME.contract!==c)return"";
  const n=hintMisses(c);if(n<BURN_SIM.CAREER.hintFreeAfter)return"";
  return`<section class="card rp-hint"><h3>Your partner's note</h3><p>${n} misses on this job. A second pair of eyes on the drawing?</p>
    <div class="row"><button type="button" class="btn" id="rpHint">Read the hint</button></div></section>`;}
document.addEventListener("click",e=>{
  const b=e.target.closest("#sheet [data-hint],#sheet [data-hintgo],#rpHint");if(!b)return;
  if(b.id==="rpHint"){askHint("free");return;}
  if(b.dataset.hint){askHint(b.dataset.hint);return;}
  const f=b.dataset.hintgo;closeSheet();if($("design").hidden){showScreen("design");drawAll();}goToField(f);});
