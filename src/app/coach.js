/* ===================== app/coach.js: the coach-card tour (stage 8, plan section 10) =====================
   Short cards that teach the loop on the first job, each shown once. The first job ("first-light") opens with the club's
   old drawing: a thin case and a tight throat that the predictor flags and that bursts on the stand, so the cards walk
   through the bench, the incident report and the fix. The same idea as Escapement's TUT and Station Keeper's coach
   cards (cards wait for the player; the thing they talk about gets a ring), written fresh for this page.
   coach(key) shows TOUR[key] if coach cards are on and it hasn't been seen; "Got it" marks it seen (and shows the next
   card when there is one), "No more tips" turns them off. Seen cards and the switch live in brn-settings (this phone):
     SETTINGS.coach (true/false), SETTINGS.seen ({key: 1}). Settings has the switch and "Show them again". */
const TOUR={
  bench:{at:"#dzView",t:"Your first job",next:"flag",
    d:"The club wants a G motor. The curves are the predictor: pressure on top, thrust below, redrawn as you change anything. The chips along the bottom check the prediction against the client's spec."},
  flag:{at:"#dzFlags",t:"A red flag",next:"fire",when:()=>!!document.querySelector("#dzFlags .flag.crit"),
    d:"This is the club's old drawing, and the predictor thinks its case will burst. Tap a flag to read why. You can fix it now, or fire it once as it is to see what an incident report looks like."},
  fire:{at:"#dzFire",t:"To the stand",
    d:"When you're ready, take it to the stand. Every firing costs a range day, the stand's fee and the motor's materials, pass or fail."},
  failed:{at:".rp-cause",t:"The incident report",
    d:"Red is what the motor really did; blue is what you predicted. The mark shows when it went wrong. Root cause says why, with the number that crossed the line, and Where to fix it jumps straight to the control to change."},
  fix:{at:"#dzPanel .ring",t:"Two ways out",
    d:"A thicker wall holds more pressure; a bigger throat lowers the pressure. Drag and watch the flag and the peak pressure. Here the throat is the better fix: with only a thicker wall, this motor burns out too fast for the spec."},
  passed:{at:".rp-bill",t:"Paid",
    d:"A pass pays the job's fee times its grade: A ×1.2, B ×1, C ×0.8, less for each day late. The job is done; the work orders have the next one."},
  board:{at:"#bdList .wo",t:"The work orders",
    d:"Jobs in hand sit at the top with their deadlines; new work orders below. Take a job, design its motor on the bench, fire it. Reputation from good grades opens bigger stands and parts under Facilities."}};
const coachSeen=k=>!!(SETTINGS.seen&&SETTINGS.seen[k]);
let COACH=null;   // the card on screen: {key, el (the ringed element)}
function coachOff(){if(!COACH)return;const c=$("coach");if(c)c.hidden=true;if(COACH.el)COACH.el.classList.remove("coach-on");COACH=null;}
/* show a card (after the screen has drawn); delay in ms */
function coach(key,delay){
  if(SETTINGS.coach===false||coachSeen(key)||!TOUR[key])return;
  setTimeout(()=>{const T=TOUR[key];if(coachSeen(key)||(T.when&&!T.when()))return;
    const el=document.querySelector(T.at);if(!el||el.closest("[hidden]"))return;
    coachOff();COACH={key,el};
    let c=$("coach");if(!c){c=document.createElement("div");c.id="coach";c.className="coach card";c.setAttribute("role","dialog");c.setAttribute("aria-live","polite");document.body.appendChild(c);
      c.addEventListener("click",e=>{const b=e.target.closest("button");if(!b||!COACH)return;
        const k=COACH.key;SETTINGS.seen=Object.assign({},SETTINGS.seen,{[k]:1});
        if(b.dataset.coach==="off")SETTINGS.coach=false;saveSettings();coachOff();
        if(b.dataset.coach==="ok"&&TOUR[k].next)coach(TOUR[k].next,150);});}
    c.setAttribute("aria-label",T.t);
    c.innerHTML=`<b class="coach-t">${esc(T.t)}</b><p>${esc(T.d)}</p><div class="row"><button type="button" class="btn pri sm" data-coach="ok">Got it</button><button type="button" class="btn sm" data-coach="off">No more tips</button></div>`;
    c.hidden=false;
    el.classList.add("coach-on");
    const r=el.getBoundingClientRect();if(r.top<70||r.bottom>innerHeight-c.offsetHeight-20)el.scrollIntoView({block:"center",behavior:reduced()?"auto":"smooth"});
    c.querySelector("[data-coach=ok]").focus({preventScroll:true});},delay??400);}
/* the first job's hooks: the app calls these as the screens open */
const onFirstJob=()=>inCareer()&&GAME.contract&&GAME.contract.id==="first-light";
function coachBench(){if(onFirstJob())coach("bench",600);}
function coachReport(){const L=GAME.last;if(!L||L.replay||!L.out)return;
  if(!L.g.pass&&L.f.failure)coach("failed",500);else if(L.out.done)coach("passed",500);}
function coachFix(){if(onFirstJob())coach("fix",700);}
function coachBoard(){if(S.career&&S.career.day<=3)coach("board",500);}
/* leaving a screen takes its card away */
document.addEventListener("click",e=>{if(COACH&&e.target.closest("#dzBack,#rpBench,#rpBoard,#rpAgain,#bdBack,[data-take]"))coachOff();},true);
