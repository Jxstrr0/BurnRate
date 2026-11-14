/* ===================== sim/scatter.js: the scatter predictor (the Computing room, 1.4) =====================
   The bench's prediction is the ideal motor. The scatter fires SCATTER.n virtual copies of it with the real dice (the
   same deviations a real firing draws, sim/fire.js drawVariance) so the player can see the spread before paying for a
   range day. The dice come from seeds "scatter/1" ... "scatter/n": the same set every time, so the band only moves when
   the design does, and never the seeds a real firing uses, so it can't tell you what the next motor on the stand rolls.
   The app runs it a few motors at a time (scatterOne) so the bench never freezes.
     scatterPrep(design, cond)  the motor and its full prediction at cond (the crack chance reads its start-up), shared by
                                every virtual motor; null if the design can't be built
     scatterOne(P, i, steps)    virtual motor i: {key (the failure, as sim/fire.js names them, or null), destructive,
                                t and p (s, Pa: the failure moment), yielded, sum (its summary; null after a destructive
                                failure or a hang fire), tr {t, p, f} (its trace; null with sum)}. A real firing's rules,
                                at fewer solver steps (SCATTER.steps)
     scatterBand(list, o)       the band: on a grid from 0 to the longest trace, the o.lo and o.hi fractions of the
                                motors that ran to the end, for pressure and thrust. A motor that has burned out counts
                                as its last pressure and no thrust. {t, pLo, pHi, fLo, fHi, n} or null if none ran
     lotOdds(p, n, need)        the chance that at least `need` of n motors pass, each passing with chance p (a tender)
   Pure and deterministic. */
function scatterPrep(design,cond){
  const m=motorFromDesign(design);if(!m.ok)return null;
  cond=Object.assign({tGrain:TUNING.tRef},cond||{});
  return{m,cond,pred:simulate(m,cond)};}
function scatterOne(P,i,steps){
  const m=P.m,d=drawVariance(m,P.cond,"scatter/"+i,P.pred);
  const run=simulate(m,P.cond,Object.assign(varOpts(d,steps||SCATTER.steps),{dtMul:SCATTER.dtMul}));
  let{failure,yielded}=scanFailure(m,run,limitsOf(m,d));
  if(!failure&&run.chuffAny)failure={key:"chuff",destructive:false};
  const keep=!(failure&&(failure.destructive||failure.key==="hangfire"));
  return{key:failure?failure.key:null,destructive:!!(failure&&failure.destructive),t:failure?failure.t:null,p:failure?failure.p:null,yielded,
    sum:keep?summarize(m,run):null,tr:keep?{t:run.t,p:run.p,f:run.f}:null};}
/* a trace's value at time t (linear between samples; past the end, the last pressure and no thrust) */
function traceAt(tr,t,key){
  const T=tr.t,n=T.length;if(t>=T[n-1])return key==="f"?0:tr[key][n-1];
  let lo=0,hi=n-1;while(hi-lo>1){const k=(lo+hi)>>1;if(T[k]<=t)lo=k;else hi=k;}
  const u=T[hi]>T[lo]?(t-T[lo])/(T[hi]-T[lo]):0;return tr[key][lo]+(tr[key][hi]-tr[key][lo])*u;}
function quant(sorted,q){const x=q*(sorted.length-1),i=Math.floor(x),u=x-i;return i+1<sorted.length?sorted[i]+(sorted[i+1]-sorted[i])*u:sorted[i];}
function scatterBand(list,o){
  o=Object.assign({},SCATTER,o||{});
  const tr=list.filter(s=>s&&s.tr).map(s=>s.tr);if(!tr.length)return null;
  let tMax=0;for(const x of tr)tMax=Math.max(tMax,x.t[x.t.length-1]);
  const G=o.grid,out={t:[],pLo:[],pHi:[],fLo:[],fHi:[],n:tr.length};
  for(let j=0;j<G;j++){const t=tMax*j/(G-1);out.t.push(t);
    for(const k of["p","f"]){const v=tr.map(x=>traceAt(x,t,k)).sort((a,b)=>a-b);
      out[k+"Lo"].push(quant(v,o.lo));out[k+"Hi"].push(quant(v,o.hi));}}
  return out;}
function lotOdds(p,n,need){
  let s=0,c=1;   // c = n choose k, built up as k rises
  for(let k=0;k<=n;k++){if(k>0)c=c*(n-k+1)/k;if(k>=need)s+=c*Math.pow(p,k)*Math.pow(1-p,n-k);}
  return Math.min(1,Math.max(0,s));}
Object.assign(SIM,{scatterPrep,scatterOne,scatterBand,lotOdds});
