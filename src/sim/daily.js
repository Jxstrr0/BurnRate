/* ===================== sim/daily.js: the Daily Spec (stage 8) =====================
   dailySpec("YYYY-MM-DD") builds the day's work order from the date alone, so every phone gets the same one:
     1. a kit of parts (data/daily.js): two grades, BATES plus two more grain shapes, two case materials; tier 1-2 liners
        and throats, every closure and igniter
     2. an order (which criteria) and a client, and the firing slot (dawn, noon or dusk), which sets the grain temperature
     3. a hidden reference motor built from the kit: random sizes, the throat tuned to a target pressure, the igniter and
        liner sized, and kept only if it fits Stand 3 and raises no warning at all
     4. the spec: each criterion's band centred on what the predictor says the reference does at the slot's temperature
   So every day is solvable with that day's parts, and the reference fires inside its own bands nearly always (the test in
   tools/sim-tests/daily.js fires a month of days to check). The returned contract has the usual shape (sim/grade.js
   grades it) plus daily (the date), no (Daily Spec number), kit, and solution (the reference, for the tests only).
   kitCheck(kit, design) lists the parts of a design that aren't in the kit, each with the field to change.
   No Date here (the sim stays pure): the app passes the phone's local date as a string. */
/* days since 1970-01-01 for a calendar date (Howard Hinnant's days_from_civil) */
function civilDays(y,m,d){y-=m<=2?1:0;const era=Math.floor(y/400),yoe=y-era*400,doy=Math.floor((153*(m+(m>2?-3:9))+2)/5)+d-1,
  doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;return era*146097+doe-719468;}
const parseYMD=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));return m?[+m[1],+m[2],+m[3]]:null;};
/* Daily Spec No. 1 is DAILY.epoch */
function dailyNo(date){const a=parseYMD(date),e=parseYMD(DAILY.epoch);return a?civilDays(...a)-civilDays(...e)+1:0;}
const pickN=(r,arr,n)=>{const a=arr.slice(),out=[];while(out.length<n&&a.length)out.push(a.splice(Math.floor(r.next()*a.length),1)[0]);return out;};
const tierOk=tab=>Object.keys(tab).filter(k=>(tab[k].tier||1)<=2);
function dailyKit(r){const K=DAILY.kit;
  return{props:pickN(r,K.props,K.nProps),shapes:["bates"].concat(pickN(r,K.shapes,K.nShapes)),cases:pickN(r,K.cases,K.nCases),
    liners:tierOk(LINERS),throats:tierOk(THROATS)};}
/* round to a step that is fine enough for the band's width */
const niceRound=(v,step,width)=>{const s=width<4*step?step/5:step;return Math.round(v/s)*s;};
const fix3=v=>Math.round(v*1000)/1000;
/* the hidden reference motor; null if none of the tries came out clean (the tests check that never happens) */
function dailyRef(r,kit,tGrain,stand){
  const Z=DAILY.size,shapes=kit.shapes.filter(s=>!GRAIN_SHAPES[s].ls),r1=v=>Math.round(v*10)/10;
  const clean=p=>p.ok&&!p.sum.warnings.length&&p.motor.length*1000<=stand.len&&p.motor.diameter*1000<=stand.dia&&p.sum.Fmax<=stand.cell;
  for(let k=0;k<Z.tries;k++){
    const shape=r.pick(shapes),mat=r.pick(kit.cases),prop=r.pick(kit.props),id=r.pick(Z.bores),liner=kit.liners.includes("rubber")&&r.chance(0.4)?"rubber":"paper";
    const linerThk=liner==="rubber"?1.5:1.0,od=id-2*linerThk;
    const g={prop,shape,segs:1,segLen:0,coreD:0};
    if(shape==="bates"){g.segs=r.int(Z.segs[0],Z.segs[1]);g.segLen=Math.round(r.float(Z.segLen[0],Z.segLen[1]));}
    else if(shape==="tube")g.segLen=Math.round(r.float(Z.tubeLen[0],Z.tubeLen[1]));
    else g.segLen=Math.round(r.float(Z.endLen[0],Z.endLen[1]));
    if(shape!=="end")g.coreD=r1(od*r.float(Z.core[0],Z.core[1]));
    const d=normDesign({grain:g,case:{mat,id,wall:Z.wall[mat],liner,linerThk,closure:"ring",bolts:6},
      nozzle:{mat:kit.throats.includes("graphite")?"graphite":kit.throats[0],throatD:shape==="end"?r1(od*0.12):r1(g.coreD*0.6),exitD:0,half:15},igniter:"s"});
    /* tune the throat towards the target peak pressure: Pc goes as Kn^(1/(1-n)), so the throat scales as P^((1-n)/2) */
    const pT=r.float(Z.pMPa[0],Z.pMPa[1])*1e6,n=PROPELLANTS[prop].n,maxT=shape==="end"?od-1:g.coreD-0.5,eps=r.float(Z.eps[0],Z.eps[1]);
    let ok=true;
    for(let it=0;it<4;it++){d.nozzle.exitD=r1(d.nozzle.throatD*Math.sqrt(eps));
      const p=predict(d,{tGrain},{steps:110});if(!p.ok){ok=false;break;}
      d.nozzle.throatD=r1(Math.max(1.5,Math.min(maxT,d.nozzle.throatD*Math.pow(p.sum.Pmax/pT,(1-n)/2))));}
    if(!ok)continue;
    d.nozzle.exitD=r1(d.nozzle.throatD*Math.sqrt(eps));
    /* the smallest igniter that lights it cleanly, and a thicker liner if the burn needs one */
    let best=null;
    for(const ig of Object.keys(IGNITERS)){d.igniter=ig;const p=predict(d,{tGrain},{steps:110});if(!p.ok)break;
      const keys=p.sum.warnings.map(w=>w.key);if(keys.includes("liner")&&d.case.linerThk<3){d.case.linerThk+=1;}
      if(p.sum.ign.strength>=TUNING.ignWeak*Z.ignMargin&&!keys.includes("spike")){best=ig;break;}}
    if(!best)continue;
    d.igniter=best;
    const p=predict(d,{tGrain});
    if(clean(p))return{design:d,pred:p};}
  return null;}
function dailySpec(date){
  const R=rngStreams("daily/"+date),r=R.get("spec"),stand=STANDS[DAILY.size.stand];
  const kit=dailyKit(R.get("kit")),order=r.pick(DAILY.orders),client=r.pick(DAILY.clients),slot=r.pick(["dawn","noon","dusk"]);
  const tGrain=SLOTS[slot].tGrain,ref=dailyRef(R.get("reference"),kit,tGrain,stand);
  if(!ref)return null;
  const s=ref.pred.sum,m=ref.pred.motor;
  const spec=order.spec.map(k=>{const B=DAILY.band[k],v=specValue(k,s,m);
    if(B.w){const w=v*B.w;return{k,lo:fix3(niceRound(v-w,B.r,w)),hi:fix3(niceRound(v+w,B.r,w))};}
    const w=v*B.up;return{k,hi:fix3(niceRound(v+w,B.r,w))};});
  const start=clone(DEFAULT_DESIGN);start.grain.prop=kit.props[0];start.case.mat=kit.cases[0];start.case.wall=DAILY.size.wall[kit.cases[0]];
  return{id:"daily",daily:date,no:dailyNo(date),client,title:order.title,brief:order.brief.replace("{client}",client),tier:2,stand:DAILY.size.stand,
    slot,pay:0,days:1,spec,kit,start,solution:ref.design};}
const clone=o=>JSON.parse(JSON.stringify(o));
const KIT_PARTS=[["grain.prop","props",PROPELLANTS,"grade"],["grain.shape","shapes",GRAIN_SHAPES,"grain shape"],["case.mat","cases",CASES,"case material"],
  ["case.liner","liners",LINERS,"liner"],["nozzle.mat","throats",THROATS,"throat material"]];
function kitCheck(kit,d){const out=[];
  for(const[f,k,tab,what]of KIT_PARTS){const v=f.split(".").reduce((o,x)=>o[x],d);
    if(!kit[k].includes(v))out.push({field:f,text:`${tab[v]?tab[v].name:v} isn't in today's kit. Pick a ${what} from the kit.`});}
  return out;}
/* is part id in the kit for this design field? (the bench greys out the rest) */
const inKit=(kit,field,id)=>{const p=KIT_PARTS.find(x=>x[0]===field);return!p||kit[p[1]].includes(id);};
Object.assign(SIM,{dailyNo,dailySpec,dailyKit,kitCheck,inKit});
