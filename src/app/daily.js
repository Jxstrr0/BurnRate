/* ===================== app/daily.js: the Daily Spec (stage 8) =====================
   One work order a day, the same on every phone (sim/daily.js builds it from the date). Kelbo's rules (13 November 2026):
   fire as many times as you like, the best grade is kept; the day's kit of parts is fixed and has nothing to do with the
   career, so anyone can play it from the title, career or not. Firings are free: no money, no range days.
   What it keeps, in the save (app/save.js):
     S.daily     = {date, n (firings today), best ("A" "B" "C" or null), bestN (the firing that got it), marks (one
                    character per firing: A, B, C or x for a fail), design (today's bench)}; a new date starts it over
     S.dailyHist = {"YYYY-MM-DD": {l (best letter or null), n (firings)}}, the last 60 days, for the streak
   The firing seed is "daily/<date>/<n>", so everyone's third firing of a day rolls the same dice.
   Sharing sends a short text (the number, the grade, the run of marks) through the phone's share sheet, or copies it. */
const DAILY_HIST_MAX=60,DAILY_URL="https://burnrate.longlight.games/";
let DAILY_C=null;   // today's contract, built once per date (it takes a moment)
/* the phone's own calendar date, "YYYY-MM-DD" */
function todayStr(){const d=new Date(),p=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
function dailyToday(){const t=todayStr();if(!DAILY_C||DAILY_C.daily!==t)DAILY_C=BURN_SIM.dailySpec(t);return DAILY_C;}
const isDaily=()=>GAME.mode==="daily"&&!!(GAME.contract&&GAME.contract.daily);
/* today's state, started over when the date has moved on */
function dailyState(c){
  if(!S.daily||S.daily.date!==c.daily)S.daily={date:c.daily,n:0,best:null,bestN:0,marks:"",design:clone(c.start)};
  return S.daily;}
const LETTER_RANK={A:3,B:2,C:1};
/* after a firing: count it, keep the best grade, and note the day in the history */
function dailyRecord(c,g){
  const st=dailyState(c);st.n++;st.marks=(st.marks+(g.pass?g.letter:"x")).slice(-40);
  if(g.pass&&(LETTER_RANK[g.letter]||0)>(LETTER_RANK[st.best]||0)){st.best=g.letter;st.bestN=st.n;}
  S.dailyHist=S.dailyHist||{};S.dailyHist[c.daily]={l:st.best,n:st.n};
  const keys=Object.keys(S.dailyHist).sort();while(keys.length>DAILY_HIST_MAX)delete S.dailyHist[keys.shift()];
  return st;}
/* days in a row with a pass, counting back from today (or from yesterday, if today has no pass yet) */
function dailyStreak(){
  const h=S.dailyHist||{},d=new Date();let n=0;
  const key=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
  if(!(h[key(d)]&&h[key(d)].l))d.setDate(d.getDate()-1);
  while(h[key(d)]&&h[key(d)].l){n++;d.setDate(d.getDate()-1);}
  return n;}
const KIT_NAMES=c=>[["Grades",c.kit.props,BURN_SIM.PROPELLANTS],["Grain shapes",c.kit.shapes,BURN_SIM.GRAIN_SHAPES],["Case materials",c.kit.cases,BURN_SIM.CASES],
  ["Liners",c.kit.liners,BURN_SIM.LINERS],["Throats",c.kit.throats,BURN_SIM.THROATS]];
/* the order sheet: the brief, the spec, the kit and how today is going */
function dailySheet(first){
  const c=dailyToday();if(!c){toast("Today's order didn't come together. Try again tomorrow.",4000);return;}
  const st=dailyState(c),sk=dailyStreak();
  const kit=KIT_NAMES(c).map(([h,ids,tab])=>`<li><b>${h}:</b> ${ids.map(id=>esc(tab[id].name)).join(", ")}</li>`).join("");
  const how=st.n?`<p class="hint">${st.best?`Best so far: <b>${st.best}</b>, on firing ${st.bestN}.`:"No pass yet."} ${st.n} firing${st.n>1?"s":""} today.${sk?` Streak: ${sk} day${sk>1?"s":""}.`:""}</p>`
    :`<p class="hint">Fire as often as you like: the best grade is kept. Nobody pays and nothing costs.${sk?` Streak: ${sk} day${sk>1?"s":""}.`:""}</p>`;
  openSheet(`Daily Spec No. ${c.no}`,`<div class="wo"><span class="site">${esc(c.client)}</span><h3>${esc(c.title)}</h3><p>${esc(c.brief)}</p>
    ${specList(c)}</div><h3 class="dl-h">Today's kit</h3><ul class="dl-kit">${kit}<li>Every closure and igniter.</li></ul>
    <p class="hint">Everyone gets the same order and the same kit today. A new one comes at midnight, your phone's time.</p>${how}
    ${first?`<button type="button" class="btn pri big wide" id="dlGo">To the bench</button>`:`<div class="row">${st.n?`<button type="button" class="btn" id="dlShare">Share</button>`:""}<button type="button" class="btn pri" id="dlClose">Back to the bench</button></div>`}`);}
function openDaily(){
  const c=dailyToday();if(!c){toast("Today's order didn't come together. Try again tomorrow.",4000);return;}
  const st=dailyState(c);save();
  GAME.mode="daily";benchOpen(c,st.design,BURN_SIM.slotTemp(c.slot,c,20),c.slot);
  dailySheet(true);}
function shareDaily(){
  const st=S.daily,c=dailyToday();if(!st||!c||st.date!==c.daily||!st.n)return;
  const marks=st.marks.split("").map(m=>m==="x"?"✗":m).join(" ");
  const text=`Burn Rate · Daily Spec No. ${c.no}\n${st.best?`Grade ${st.best} on firing ${st.bestN}`:`No pass in ${st.n} firing${st.n>1?"s":""}`}\n${marks}\n${DAILY_URL}`;
  const copied=()=>toast("Copied. Paste it anywhere.");
  if(navigator.share){navigator.share({text}).catch(()=>{});return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(copied,()=>toast(text,6000));return;}
  toast(text,6000);}
/* the title's button: the number, and how today is going */
function dailyTitleBtn(){
  const t=todayStr(),no=BURN_SIM.dailyNo(t),st=S.daily&&S.daily.date===t?S.daily:null;
  const sub=st&&st.n?(st.best?`Best ${st.best} · ${st.n} firing${st.n>1?"s":""}`:`No pass yet · ${st.n} firing${st.n>1?"s":""}`):"Today's order, the same for everyone";
  return`<button type="button" class="btn big" id="tDaily"><span>Daily Spec No. ${no}</span><small>${sub}</small></button>`;}
document.addEventListener("click",e=>{const b=e.target.closest("#sheet button");if(!b)return;
  if(b.id==="dlGo"||b.id==="dlClose")closeSheet();
  else if(b.id==="dlShare")shareDaily();});
