/* ===================== sim/career.js: the career's rules (plan sections 4 and 5) =====================
   Pure functions on a career object (the save holds it as JSON; app/save.js keeps it). Nothing random here: the board
   is the contract list in order, filtered by tier and what's done; each firing's dice come from fire()'s seed.
     car = {seed, name, day, money, tier, rep, stands:{s3:true}, bunker, jobs:{id:job}, done:{id:{letter,day,paid,times,again}},
            log:[entry], no (report counter), broke (tier restarts), hut (conditioning hut owned: 1)}
     job = {taken, due, pay, n (motors fired)}
   buildCost / firingCost price a motor (the hut adds its fee); slotTemp gives a slot's grain temperature; board lists the work orders on offer; takeJob, settle and buy change the career. */
const CR=v=>Math.round(v);
function newCareer(seed,name){
  return{seed:String(seed),name:String(name||"").slice(0,28)||"Saltpan Propulsion",day:1,money:CAREER.startMoney[1],tier:1,rep:0,
    stands:{s3:true},bunker:0,hut:0,jobs:{},done:{},log:[],no:0,broke:0};}
/* a firing slot's grain temperature: the hut fires at the contract's temperature, or the one the player set (hutT) */
function slotTemp(slot,c,hutT){const s=SLOTS[slot]||SLOTS.dusk;if(!s.hut)return s.tGrain;
  if(c&&c.tGrain!=null)return c.tGrain;return Math.max(HUT.min,Math.min(HUT.max,hutT!=null?hutT:s.tGrain));}
/* the motor's build cost, item by item: [{k, label, cr}] and the total */
function buildCost(m,d){
  const C=CAREER,M=m.mass,P=PROPELLANTS[d.grain.prop],K=CASES[d.case.mat],L=LINERS[d.case.liner],T=THROATS[d.nozzle.mat],I=IGNITERS[d.igniter];
  const kg=v=>(v<1?(v*1000).toFixed(0)+" g":v.toFixed(2)+" kg");
  const items=[
    {k:"prop",label:`${P.name}, ${kg(M.prop)}`,cr:CR(M.prop*P.cost*C.matMul)},
    {k:"case",label:`${K.name}, ${kg(M.case)}`,cr:CR(M.case*K.cost*C.matMul)},
    {k:"liner",label:`${L.name}, ${kg(M.liner)}`,cr:CR(M.liner*L.cost*C.matMul)},
    {k:"nozzle",label:`${T.name} nozzle, ${kg(M.nozzle)}`,cr:CR(M.nozzle*T.cost*C.matMul)},
    {k:"igniter",label:I.name,cr:CR(I.cost)},
    {k:"shop",label:"Machining and closures",cr:CR(C.shopBase+C.shopPerMm*d.case.id+(d.case.closure==="bolts"?C.perBolt*d.case.bolts:0))}];
  return{items,total:items.reduce((s,x)=>s+x.cr,0)};}
function firingCost(standId,m,d,slot){const st=STANDS[standId],b=buildCost(m,d),hut=slot&&SLOTS[slot]&&SLOTS[slot].hut?CAREER.hutFee:0;
  return{fee:st.fee,hut,build:b,total:st.fee+hut+b.total};}
/* what a job pays before the grade: a repeat order pays its share of the first fee */
const contractById=id=>CONTRACTS.find(c=>c.id===id)||null;
function basePay(car,c){const d=car.done[c.id];return CR(d&&c.repeat?c.pay*c.repeat.pay:c.pay);}
/* the work orders on offer, minus jobs in hand and finished ones (a repeat order comes back once its days have passed).
   New work at your own tier comes first, then older tiers' leftovers, then repeat orders; each group in list order. */
function board(car){
  const rank=c=>car.done[c.id]?2:(c.tier||1)===car.tier?0:1;
  return CONTRACTS.filter(c=>{if((c.tier||1)>car.tier||car.jobs[c.id])return false;const d=car.done[c.id];
    return!d||(c.repeat&&car.day>=d.again);}).map((c,i)=>[rank(c),i,c]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2]).slice(0,CAREER.boardMax);}
function canTake(car,id){
  const c=contractById(id);if(!c)return"No such work order.";
  if(car.jobs[id])return"You already have this job.";
  if(Object.keys(car.jobs).length>=CAREER.maxJobs)return`You can hold ${CAREER.maxJobs} jobs at once. Finish or drop one first.`;
  if(!car.stands[c.stand])return`This job needs ${STANDS[c.stand].name}.`;
  if(c.slot==="hut"&&!car.hut)return"This job is fired from the conditioning hut. Lease one from Facilities first.";
  if(!board(car).includes(c))return"That work order isn't on the board.";
  return"";}
function takeJob(car,id){const e=canTake(car,id);if(e)return e;const c=contractById(id);
  car.jobs[id]={taken:car.day,due:car.day+c.days,pay:basePay(car,c),n:0};return"";}
function dropJob(car,id){delete car.jobs[id];}
/* the share of the pay left on a given day: 1 on time, less each day late */
function lateShare(job,day){const late=Math.max(0,day-job.due);return{late,mul:Math.max(CAREER.lateFloor,1-CAREER.lateCut*late)};}
/* can this firing go ahead? the money may dip into the overdraft, no further */
function canAfford(car,cost){return car.money-cost>=-CAREER.overdraft;}
/* broke: not even the cheapest motor on the cheapest stand you have could be paid for */
function isBroke(car){const fee=Math.min(...Object.keys(car.stands).filter(s=>car.stands[s]).map(s=>STANDS[s].fee));
  return!canAfford(car,fee+CAREER.shopBase+20);}
function restartTier(car){car.money=CAREER.startMoney[car.tier]||CAREER.startMoney[1];car.jobs={};car.broke++;}
/* settle one firing: charge it, then (on a contract pass) pay, earn reputation and finish the job. The day moves on.
   Returns what happened, for the report and the logbook. */
function settle(car,c,g,cost){
  const day=car.day,out={day,cost,paid:0,late:0,lateMul:1,gradeMul:0,rep:0,done:false};
  car.money-=cost;
  if(c){const job=car.jobs[c.id];
    if(job){job.n++;
      if(g&&g.pass){const ls=lateShare(job,day),prev=car.done[c.id];
        out.late=ls.late;out.lateMul=ls.mul;out.gradeMul=CAREER.gradePay[g.letter];
        out.paid=CR(job.pay*out.gradeMul*ls.mul);car.money+=out.paid;
        out.rep=prev?Math.floor(CAREER.rep[g.letter]/2):CAREER.rep[g.letter];car.rep+=out.rep;
        car.done[c.id]={letter:prev&&"ABC".indexOf(prev.letter)<"ABC".indexOf(g.letter)?prev.letter:g.letter,day,paid:out.paid,
          times:(prev?prev.times:0)+1,again:c.repeat?day+c.repeat.every:null};
        delete car.jobs[c.id];out.done=true;}}}
  car.day++;
  return out;}
/* facilities: can it be bought, and buy it */
function canBuy(car,id){const f=FACILITIES[id];if(!f)return"No such facility.";
  if(owns(car,id))return"Already yours.";
  if(car.rep<f.need)return`The range wants reputation ${f.need} first (you have ${car.rep}).`;
  if(car.money<f.cost)return`It costs ${f.cost} cr; you have ${Math.max(0,car.money)} cr.`;
  return"";}
function owns(car,id){const g=FACILITIES[id].give;return g.stand?!!car.stands[g.stand]:g.bunker?car.bunker>=g.bunker:g.hut?(car.hut|0)>=g.hut:false;}
function buy(car,id){const e=canBuy(car,id);if(e)return e;const f=FACILITIES[id],g=f.give;car.money-=f.cost;
  if(g.stand)car.stands[g.stand]=true;if(g.bunker)car.bunker=Math.max(car.bunker,g.bunker);if(g.hut)car.hut=Math.max(car.hut|0,g.hut);if(g.tier)car.tier=Math.max(car.tier,g.tier);return"";}
/* the logbook keeps what's needed to fire the same motor again for its report: the dice come from the seed */
function logFiring(car,e){car.no++;e.no=car.no;car.log.push(e);if(car.log.length>CAREER.logMax)car.log.splice(0,car.log.length-CAREER.logMax);return e;}
function fireSeed(car,key,n){return car.seed+"/"+key+"/"+n;}
Object.assign(SIM,{newCareer,slotTemp,buildCost,firingCost,contractById,basePay,board,canTake,takeJob,dropJob,lateShare,canAfford,isBroke,
  restartTier,settle,canBuy,owns,buy,logFiring,fireSeed});
