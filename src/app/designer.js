/* ===================== app/designer.js: the design bench (stage 2; plan sections 4, 6.8 and 9.2) =====================
   The player edits a motor and the predictor redraws as they drag. Top (sticky): the live view (predicted curves or the
   cross-section, swipe or tap to switch) with a burn scrubber, the key numbers and the warning flags. Below: the tabs
   Grain · Nozzle · Case · Igniter with thumb-sized controls, and on a flight job a Rocket tab: the body tube, nose and fins,
   with the predicted flight (sim/flight.js predictFlight, no wind) and the range's launch checks as flags.
   While a slider moves, the sim runs with fewer steps (DRAG_STEPS) once per frame; on release it runs in full.
   A warning flag opens its explanation with a button that jumps to the control to change.
   The bottom bar (app/game.js) checks the contract's spec against the prediction and leads to the stand. The predictor runs
   at DZ.tGrain (20 °C, or a firing slot's temperature). DZ.d is the saved design object itself (S.career.designs[job] or
   S.free, app/save.js), so every change calls save(). In a career, parts from a tier not yet open show as locked. */
const DRAG_STEPS=110;
/* the live view's height: room for the controls below matters more than a tall chart on a short phone */
const VIEW_H=w=>Math.max(130,Math.min(w*0.46,innerHeight*0.23,250));
const DZ={d:null,tab:"grain",view:"curves",scrub:0.5,res:null,fl:null,raf:0,fast:null,inited:false,tGrain:20,predSlot:"ref",geom:null,insp:false,inspT:0};
const INSP_HOLD=2500;   // ms the chart's readout stays up after the finger lifts
const TABS=[["grain","Grain"],["nozzle","Nozzle"],["case","Case"],["igniter","Igniter"]];
const tabsNow=()=>isFlight()?TABS.concat([["airframe","Rocket"]]):TABS;
const FLAG_SHORT={burst:"Case bursts",yield:"Case yields",sf:"Thin margin",closure:"Closures",chuff:"Chuffing",pt:"Narrow port",
  flux:"Mass flux",liner:"Liner",sep:"Over-expanded",ign:"Weak igniter",spike:"Igniter spike",ero:"Erosive spike"};
const clone=o=>JSON.parse(JSON.stringify(o));
const getF=(d,f)=>f.split(".").reduce((o,k)=>o[k],d);
function setF(d,f,v){const k=f.split(".");let o=d;for(let i=0;i<k.length-1;i++)o=o[k[i]];o[k[k.length-1]]=v;}
const r1=v=>Math.round(v*10)/10;

/* ---- the controls on each tab, as data. type: pick (cards), seg (segmented buttons), step (- n +), slide ---- */
function controls(tab,d){
  const S=BURN_SIM,od=d.case.id-2*d.case.linerThk,cored=d.grain.shape!=="end",sh=S.GRAIN_SHAPES[d.grain.shape]||{uses:[]},u=f=>sh.uses.includes(f);
  const room=Math.max(1.5,(od-d.grain.coreD)/2-S.TUNING.lsWebMin),gs=d.grain.shape;
  if(tab==="grain")return[
    {f:"grain.prop",type:"pick",label:"Propellant grade",g:"grade",items:S.PROPELLANTS,
      sub:p=>`${p.rRef} mm/s at 5 MPa · n ${p.n.toFixed(2)} · ${p.rho} kg/m³ · c* ${p.cStar} m/s`},
    {f:"grain.shape",type:"pick",label:"Grain shape",g:"shape",items:S.GRAIN_SHAPES,sub:x=>x.note},
    {f:"grain.segs",type:"step",label:cored?"Segments":"Grain pieces",g:"segments",min:1,max:12},
    {f:"grain.segLen",type:"slide",label:cored?"Segment length":"Piece length",g:"web",unit:"mm",min:10,max:Math.max(60,Math.round(d.case.id*5)),step:1},
    cored&&{f:"grain.coreD",type:"slide",label:"Core diameter",g:"core",unit:"mm",min:2,max:r1(od-(sh.ls?4:3)),step:0.5},
    u("pts")&&{f:"grain.pts",type:"step",label:gs==="star"?"Points":gs==="finocyl"?"Fins":"Slots",g:"starPoints",min:gs==="star"?3:2,max:12},
    u("ptLen")&&{f:"grain.ptLen",type:"slide",label:gs==="star"?"Point reach past the core":gs==="finocyl"?"Fin reach past the core":"Slot reach past the core",g:"pointDepth",unit:"mm",min:1,max:r1(room),step:0.5},
    u("ptW")&&{f:"grain.ptW",type:"slide",label:gs==="finocyl"?"Fin width":"Slot width",g:"slotWidth",unit:"mm",min:1,max:r1(Math.max(1.5,d.grain.coreD)),step:0.5},
    u("finLen")&&{f:"grain.finLen",type:"slide",label:"Finned length (aft end)",g:"finLength",unit:"mm",min:5,max:Math.max(6,d.grain.segLen),step:1},
    u("offset")&&{f:"grain.offset",type:"slide",label:"Core offset",g:"coreOffset",unit:"mm",min:0,max:r1(room),step:0.5}
  ].filter(Boolean);
  if(tab==="nozzle")return[
    {f:"nozzle.mat",type:"pick",label:"Throat material",g:"throatMat",items:S.THROATS,
      sub:t=>`wears ${t.ero.toFixed(3)} mm/s at 5 MPa · ${t.note}`},
    {f:"nozzle.throatD",type:"slide",label:"Throat diameter",g:"throat",unit:"mm",min:1,max:r1(cored?d.grain.coreD-0.5:od-1),step:0.1},
    {f:"nozzle.exitD",type:"slide",label:"Exit diameter",g:"exit",unit:"mm",min:d.nozzle.throatD,max:Math.round(d.case.id+2*d.case.wall+18),step:0.5,
      extra:d=>`expansion ${(Math.pow(d.nozzle.exitD/d.nozzle.throatD,2)).toFixed(1)}`},
    {f:"nozzle.half",type:"slide",label:"Cone half-angle",g:"halfAngle",unit:"°",min:5,max:30,step:1}];
  if(tab==="case")return[
    {f:"case.mat",type:"pick",label:"Case material",g:"caseMat",items:S.CASES,sub:m=>`yield ${m.yield} MPa · ${m.rho} kg/m³ · ${m.note}`},
    {f:"case.id",type:"slide",label:"Bore",g:"bore",unit:"mm",min:18,max:160,step:1},
    {f:"case.wall",type:"slide",label:"Wall thickness",g:"wall",unit:"mm",min:0.5,max:r1(Math.min(12,d.case.id/4-0.1)),step:0.1,
      extra:d=>{const m=S.CASES[d.case.mat];return m?`holds ${(m.yield*d.case.wall/(d.case.id/2)).toFixed(1)} MPa at yield`:"";}},
    {f:"case.liner",type:"pick",label:"Liner",g:"liner",items:S.LINERS,sub:l=>`${l.rate} s of protection per mm`},
    {f:"case.linerThk",type:"slide",label:"Liner thickness",g:"liner",unit:"mm",min:0.3,max:r1(Math.min(6,d.case.id/6-0.1)),step:0.1,
      extra:d=>{const l=S.LINERS[d.case.liner];return l?`${(l.rate*d.case.linerThk).toFixed(1)} s of protection`:"";}},
    {f:"case.closure",type:"seg",label:"Closures held by",g:"closure",opts:[["ring","Snap ring"],["bolts","Radial bolts"]]},
    d.case.closure==="bolts"&&{f:"case.bolts",type:"step",label:"Bolts",g:"retention",min:3,max:36}
  ].filter(Boolean);
  if(tab==="airframe")return[
    {f:"airframe.info",type:"info",html:()=>`<div class="ctl rocket" id="dzRocket" aria-live="polite"></div>`},
    {f:"airframe.body",type:"pick",label:"Body tube",g:"airframe",items:S.BODIES,sub:b=>`${b.id} mm inside · ${Math.round(b.kgm*1000)} g a metre · ${b.cost} cr a metre`},
    {f:"airframe.nose",type:"pick",label:"Nose cone",g:"noseCone",items:S.NOSES,sub:n=>`drag ${n.cd.toFixed(2)} · ${n.note}`},
    {f:"airframe.fins",type:"pick",label:"Fins",g:"stability",items:S.FINS,sub:x=>`drag ${x.cd.toFixed(2)} · steady up to ${x.maxLD} body diameters long · ${x.note}`}];
  return[{f:"igniter",type:"pick",label:"Igniter",g:"igniter",items:S.IGNITERS,sub:i=>`${(i.gas*1000).toFixed(2)} g of gas over ${Math.round(i.burn*1000)} ms`}];
}
const TAB_OF=f=>f.split(".")[0];
const fmtV=(c,v)=>c.step<1?(+v).toFixed(1):String(Math.round(v));

/* keep dependent sizes legal after a change (the core inside the grain, the throat inside the core...) */
function clampDesign(d){
  const c=d.case,g=d.grain,z=d.nozzle;
  c.wall=Math.min(c.wall,r1(c.id/4-0.1));c.linerThk=Math.min(c.linerThk,r1(c.id/6-0.1));
  const od=c.id-2*c.linerThk;
  const sh=BURN_SIM.GRAIN_SHAPES[g.shape];BURN_SIM.normDesign(d);
  if(g.shape!=="end"){g.coreD=Math.max(2,Math.min(g.coreD,r1(od-(sh&&sh.ls?4:3))));z.throatD=Math.min(z.throatD,r1(g.coreD-0.5));}
  if(sh&&sh.ls){const room=Math.max(1,r1((od-g.coreD)/2-BURN_SIM.TUNING.lsWebMin));
    g.ptLen=Math.max(1,Math.min(g.ptLen,room));g.offset=Math.max(0,Math.min(g.offset,room));g.ptW=Math.max(1,Math.min(g.ptW,g.coreD));
    g.finLen=Math.max(5,Math.min(g.finLen,g.segLen));if(g.shape==="star")g.pts=Math.max(3,g.pts);}
  else z.throatD=Math.min(z.throatD,r1(od-1));
  z.throatD=Math.max(1,z.throatD);z.exitD=Math.max(z.exitD,z.throatD);
  return d;}

/* ---- rendering the tab panel ---- */
function ctlHtml(c,d){
  if(c.type==="info")return c.html(d);
  const v=getF(d,c.f),lab=`<button type="button" class="gl" data-g="${c.g}">${esc(c.label)}</button>`;
  if(c.type==="pick")return`<fieldset class="ctl pick" data-field="${c.f}"><legend>${lab}</legend>${Object.entries(c.items).map(([id,it])=>
    `<button type="button" class="opt${id===v?" on":""}" data-set="${c.f}" data-v="${id}" aria-pressed="${id===v}"><b>${esc(it.name)}</b>${isDaily()?BURN_SIM.inKit(GAME.contract.kit,c.f,id)?"":`<span class="tag lock">Not in today's kit</span>`:it.tier>1?`<span class="tag${partTier()&&it.tier>partTier()?" lock":""}">Tier ${it.tier}${partTier()&&it.tier>partTier()?" · locked":""}</span>`:""}<small>${esc(c.sub(it))}</small></button>`).join("")}</fieldset>`;
  if(c.type==="seg")return`<div class="ctl" data-field="${c.f}"><div class="ctl-h">${lab}</div><div class="segbar" role="group">${c.opts.map(([id,n])=>
    `<button type="button" data-set="${c.f}" data-v="${id}" aria-pressed="${id===v}" class="${id===v?"on":""}">${esc(n)}</button>`).join("")}</div></div>`;
  if(c.type==="step")return`<div class="ctl" data-field="${c.f}"><div class="ctl-h">${lab}<span class="val mono">${v}</span></div><div class="stepper">
    <button type="button" class="btn" data-step="${c.f}" data-by="-1" aria-label="Fewer ${esc(c.label.toLowerCase())}"${v<=c.min?" disabled":""}>−</button>
    <button type="button" class="btn" data-step="${c.f}" data-by="1" aria-label="More ${esc(c.label.toLowerCase())}"${v>=c.max?" disabled":""}>+</button></div></div>`;
  const ex=c.extra?`<span class="ex" data-ex="${c.f}">${esc(c.extra(d))}</span>`:"";
  return`<div class="ctl" data-field="${c.f}"><div class="ctl-h">${lab}<span class="val mono"><output data-out="${c.f}">${fmtV(c,v)}</output> ${c.unit}</span></div>
    <div class="slide"><button type="button" class="nudge" data-nudge="${c.f}" data-by="-1" aria-label="Less">−</button>
    <input type="range" data-slide="${c.f}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" aria-label="${esc(c.label)}">
    <button type="button" class="nudge" data-nudge="${c.f}" data-by="1" aria-label="More">+</button></div>${ex}</div>`;
}
function renderTabs(){
  if(!tabsNow().some(([id])=>id===DZ.tab))DZ.tab="grain";
  $("dzTabs").innerHTML=tabsNow().map(([id,n])=>`<button type="button" role="tab" data-tab="${id}">${n}</button>`).join("");}
function renderPanel(){
  const d=DZ.d;
  document.querySelectorAll("#dzTabs [data-tab]").forEach(b=>{const on=b.dataset.tab===DZ.tab;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});
  $("dzPanel").innerHTML=controls(DZ.tab,d).map(c=>ctlHtml(c,d)).join("");
  markErrors();drawRocket();
}
function ctlSpec(f){return controls(TAB_OF(f),DZ.d).find(c=>c.f===f);}
/* after a slider moves, update its readout and the extras of the controls on screen without rebuilding the panel */
function refreshReadouts(){
  for(const c of controls(DZ.tab,DZ.d)){if(c.type==="info")continue;
    const o=document.querySelector(`[data-out="${c.f}"]`);if(o)o.textContent=fmtV(c,getF(DZ.d,c.f));
    const e=document.querySelector(`[data-ex="${c.f}"]`);if(e&&c.extra)e.textContent=c.extra(DZ.d);}}
function markErrors(){
  const bad=new Set(DZ.res&&!DZ.res.ok?DZ.res.errors.map(e=>e.field):flightChecks().crit.map(e=>e.field));
  document.querySelectorAll("#dzPanel [data-field]").forEach(el=>el.classList.toggle("bad",bad.has(el.dataset.field)));}

/* ---- the sim, at most once a frame ---- */
function schedule(fast){
  DZ.fast=DZ.fast===null?fast:(DZ.fast&&fast);
  if(DZ.raf)return;
  DZ.raf=requestAnimationFrame(()=>{DZ.raf=0;const f=DZ.fast;DZ.fast=null;
    DZ.res=BURN_SIM.predict(DZ.d,BURN_SIM.standCond(GAME.contract,{tGrain:DZ.tGrain}),f?{steps:DRAG_STEPS}:undefined);
    DZ.fl=isFlight()&&DZ.res.ok?BURN_SIM.predictFlight(DZ.d,DZ.res.motor,DZ.res.run,payloadKg()):null;
    if(f)scatterStale();drawAll();if(!f)scatterKick();});}
/* the bench's numbers for the spec: a flight job's apogee is the predicted flight's */
function benchSum(){const r=DZ.res;return r&&r.ok?isFlight()?Object.assign({},r.sum,{apogee:DZ.fl?DZ.fl.apogee:NaN}):r.sum:null;}
/* a flight job's launch checks: crit = what stops the range launching it (sim/flight.js preLaunch), warn = a slow start */
function flightChecks(){
  const out={crit:[],warn:[]},r=DZ.res;if(!isFlight()||!r||!r.ok)return out;
  out.crit=BURN_SIM.preLaunch(DZ.d,r.motor,r.run,payloadKg(),partTier());
  const fl=DZ.fl,F=BURN_SIM.FLIGHT;
  if(fl&&fl.left&&!out.crit.length){
    if(fl.vRail<F.railMin)out.warn.push({key:"rail",short:"Slow off the rail",g:"railSpeed",field:"nozzle.throatD",
      text:`It leaves the ${F.rail} m rail at ${fl.vRail.toFixed(1)} m/s. Under ${F.railMin} m/s the fins can't steer yet, so a gust tips it over. More thrust at the start, or a lighter rocket.`});
    if(fl.twr0<F.twrMin)out.warn.push({key:"twr",short:"Slow start",g:"twr",field:"nozzle.throatD",
      text:`At liftoff the motor pushes ${fl.twr0.toFixed(1)} times the rocket's weight. Under ${F.twrMin}× it climbs off the pad slowly and the wind pushes it around.`});}
  return out;}
/* the Rocket tab's readout: the predicted flight and what the rocket is made of */
function drawRocket(){
  const el=$("dzRocket");if(!el)return;
  const r=DZ.res,fl=DZ.fl;
  if(!r||!r.ok||!fl){el.innerHTML=`<p class="hint">${r&&r.ok?"Pick a body tube, a nose and fins.":"The motor can't be built yet."}</p>`;return;}
  const R=fl.rocket,F=BURN_SIM.FLIGHT,mach=fl.vMax/F.sound,row=(g,k,v,cls)=>`<tr><th><button type="button" class="gl" data-g="${g}">${k}</button></th><td class="mono ${cls||""}">${v}</td></tr>`;
  const cost=BURN_SIM.airframeCost(DZ.d,r.motor);
  el.innerHTML=`<div class="ctl-h"><button type="button" class="gl" data-g="apogee">Predicted apogee</button><span class="val mono big">${fl.left?Math.round(fl.apogee)+" m":"no liftoff"}</span></div>
    <p class="hint">At ${degC(DZ.tGrain)}, with no wind. On the day the wind and the real motor move it.</p>
    <table class="dtab mono">${row("apogee","Top speed",`${Math.round(fl.vMax)} m/s · Mach ${mach.toFixed(2)}`)}
    ${row("railSpeed","Off the rail at",fl.vRail.toFixed(1)+" m/s",fl.vRail<F.railMin?"warn":"")}
    ${row("twr","Thrust-to-weight",fl.twr0.toFixed(1)+"×",fl.twr0<F.twrMin?"warn":"")}
    ${row("stability","Length / diameter",`${R.LD.toFixed(1)} (fins hold ${R.fins.maxLD})`,R.LD>R.fins.maxLD?"crit":"")}
    ${row("airframe","Liftoff mass",`${R.mass0.toFixed(2)} kg${R.payload?` with ${R.payload} kg payload`:""}`)}
    ${row("drag","Drag coefficient",R.cd.toFixed(2))}
    ${row("airframe","Rocket length",Math.round(R.L*1000)+" mm")}
    ${inCareer()?row("airframe","Rocket build",fmtCr(cost)):""}</table>`;}
function change(f,v,fast){
  setF(DZ.d,f,v);clampDesign(DZ.d);schedule(fast);if(!fast)save();}

/* ---- the top: designation, live view, numbers, flags ---- */
function drawAll(){
  const r=DZ.res;
  if(!r.ok){
    $("dzDes").textContent="—";$("dzNums").innerHTML="";
    $("dzFlags").innerHTML=r.errors.map(e=>`<button type="button" class="flag crit" data-fix="${e.field}">${esc(e.text)}</button>`).join("");
    const cv=$("dzCv"),{c,W,H}=BURN_VIS.fit(cv,VIEW_H);c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");
    c.font="14px "+getComputedStyle(document.documentElement).getPropertyValue("--ui");c.textAlign="center";c.fillText("This motor can't be built yet.",W/2,H/2);
    $("dzScrubV").textContent="";markErrors();drawGo();return;}
  const s=r.sum,m=r.motor;
  $("dzDes").textContent=s.designation;
  const sfCls=s.sf<1?"crit":s.sf<BURN_SIM.TUNING.sfWarn?"warn":"good";
  const cell=(g,lab,val,cls)=>`<button type="button" class="num" data-g="${g}"><span>${lab}</span><b class="mono ${cls||""}">${val}</b></button>`;
  $("dzNums").innerHTML=cell("impulse","N·s",s.I<100?s.I.toFixed(1):Math.round(s.I))+cell("thrust","Avg N",Math.round(s.Fav))+
    cell("burnTime","Burn s",s.tb.toFixed(2))+cell("pressure","Peak MPa",(s.Pmax/1e6).toFixed(2))+
    (isFlight()?cell("apogee","Apogee m",DZ.fl&&DZ.fl.left?Math.round(DZ.fl.apogee):"–"):cell("isp","Isp s",s.Isp.toFixed(0)))+cell("sf","Safety",s.sf>=10?s.sf.toFixed(0):s.sf.toFixed(2),sfCls);
  const fc=flightChecks();
  $("dzFlags").innerHTML=s.warnings.length||fc.crit.length||fc.warn.length?fc.crit.map(e=>`<button type="button" class="flag crit" data-fix="${e.field}">${esc(e.text)}</button>`).join("")+
    s.warnings.map((w,i)=>`<button type="button" class="flag ${w.sev}" data-warn="${i}">${esc(FLAG_SHORT[w.key]||w.key)}</button>`).join("")+
    fc.warn.map((w,i)=>`<button type="button" class="flag warn" data-fwarn="${i}">${esc(w.short)}</button>`).join("")
    :`<span class="flag ok">No warnings</span>`;
  drawView();markErrors();drawGo();drawRocket();
}
function drawView(){
  const r=DZ.res;if(!r||!r.ok)return;
  const run=r.run,m=r.motor,tEnd=run.t[run.t.length-1],t=DZ.scrub*tEnd,i=BURN_VIS.at(run,t);
  const info=[`t ${run.t[i].toFixed(2)} s`,`${(run.p[i]/1e6).toFixed(2)} MPa`,`${Math.round(run.f[i])} N`,`Kn ${Math.round(run.kn[i])}`,`web ${Math.min(100,Math.round(run.x[i]/run.web*100))}% burned`];
  if(DZ.view==="curves"){
    /* tap the curve (1.4): while a finger is on the chart, and a moment after, a readout box with the end view of the port */
    const ins=DZ.insp?{readout:[`t ${run.t[i].toFixed(2)} s`,`${(run.p[i]/1e6).toFixed(2)} MPa`,`${Math.round(run.f[i])} N`,`Kn ${Math.round(run.kn[i])}`,
      `burning ${(run.kn[i]*run.at[i]*1e4).toFixed(run.kn[i]*run.at[i]*1e4<100?1:0)} cm²`,`web ${Math.min(100,Math.round(run.x[i]/run.web*100))}% gone`],
      port:(c,x,y,s,k)=>BURN_VIS.endView(c,m,run.x[i],x+s/2,y+s/2,s,k)}:{};
    DZ.geom=BURN_VIS.curves($("dzCv"),run,Object.assign({h:VIEW_H,pYield:m.pYield,pMin:m.prop.pMin*1e6,cursor:run.t[i]},scatterDraw()||{},ins));}
  else{BURN_VIS.section($("dzCv"),m,run.x[i],info,VIEW_H);}
  $("dzScrubV").textContent=info.slice(0,2).join(" · ");
  $("dzCv").setAttribute("aria-label",DZ.view==="curves"?`Predicted pressure and thrust. Peak ${(r.sum.Pmax/1e6).toFixed(2)} MPa, average thrust ${Math.round(r.sum.Fav)} N over ${r.sum.tb.toFixed(2)} s.`
    :`Cross-section of the motor at ${run.t[i].toFixed(2)} s.`);
}
function setView(v){DZ.view=v;document.querySelectorAll("#dzView [data-view]").forEach(b=>{const on=b.dataset.view===v;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});drawView();}

/* ---- sheets: a warning, the data sheet ---- */
function warnSheet(w){
  const c=ctlSpec(w.field),g=GLOSS[w.gloss];
  openSheet(w.short||FLAG_SHORT[w.key]||"Warning",`<p class="sev ${w.sev}"><b>${w.sev==="crit"?"This will fail.":"Risky."}</b> ${esc(w.text)}</p>
    ${g?`<h3>${esc(g.t)}</h3><p>${esc(g.d)}</p>`:""}
    ${c?`<button type="button" class="btn pri" data-fix="${w.field}">Go to ${esc(c.label.toLowerCase())}</button>`:""}`);}
function dataRows(r){
  const s=r.sum,m=r.motor,row=(g,k,v)=>`<tr><th>${g?`<button type="button" class="gl" data-g="${g}">${k}</button>`:k}</th><td>${v}</td></tr>`;
  return[row("impulseClass","Designation",`${s.designation} (${s.cls.pct}% of ${s.cls.letter})`),row("impulse","Total impulse",s.I.toFixed(1)+" N·s"),
    row("thrust","Thrust avg / peak",`${s.Fav.toFixed(0)} / ${s.Fmax.toFixed(0)} N`),row("burnTime","Burn time",s.tb.toFixed(2)+" s"),
    row("pressure","Pressure avg / peak",`${(s.Pav/1e6).toFixed(2)} / ${(s.Pmax/1e6).toFixed(2)} MPa`),row("isp","Isp",s.Isp.toFixed(1)+" s"),
    row("kn","Kn start / range",`${s.kn0.toFixed(0)} / ${s.knMin.toFixed(0)}–${s.knMax.toFixed(0)}`),row("portThroat","Port-to-throat",s.pt0.toFixed(2)),
    row("massFlux","Peak mass flux",Math.round(s.gMax)+" kg/m²s"),
    row("erosive","Erosive burning",s.eroPeak>1.005?`+${Math.round((s.eroPeak-1)*100)}% burn rate at ${s.tEro.toFixed(2)} s`:"none"),row("sf","Case safety factor",s.sf.toFixed(2)+` (yield at ${(m.pYield/1e6).toFixed(1)} MPa)`),
    row("retention","Closure margin",s.closureSf.toFixed(2)),row("liner","Liner rating",m.linerRating.toFixed(1)+" s"),
    row("igniter","Igniter strength",s.ign.strength.toFixed(2)),row("throatMat","Throat growth","+"+(s.throatGrowth*100).toFixed(2)+"%"),
    row("exit","Expansion ratio",m.eps0.toFixed(1)),row("exponent","Pressure exponent",BURN_SIM.PROPELLANTS[DZ.d.grain.prop].n.toFixed(2)),
    row("grainTemp","Grain temperature",degC(DZ.tGrain)),
    row("","Propellant / total",`${(m.mass.prop*1000).toFixed(0)} / ${(m.mass.total*1000).toFixed(0)} g`),
    row("","Mass fraction",(s.massFrac*100).toFixed(0)+"%"),
    row("","Length × diameter",`${(m.length*1000).toFixed(0)} × ${(m.diameter*1000).toFixed(0)} mm`)].join("");}
function dataSheet(){
  const r=DZ.res;
  const refs=Object.keys(BURN_SIM.REF_DESIGNS).map((k,i)=>`<button type="button" class="btn sm" data-ref="${i}">${esc(k)}</button>`).join("");
  openSheet("Data sheet",(r.ok?`<p class="hint">Predicted at ${degC(DZ.tGrain)} grain, on the range. The real motor won't match exactly.</p><table class="dtab mono">${dataRows(r)}</table>`
    :`<p>${esc(r.errors.map(e=>e.text).join(" "))}</p>`)+`<h3>Start again from a reference motor</h3><div class="refs">${refs}</div>`);}

/* jump to the control a warning or error points at: switch tab, scroll to it, ring it */
function goToField(f){
  if(sheetOn())closeSheet();
  DZ.tab=TAB_OF(f);renderPanel();
  const el=document.querySelector(`#dzPanel [data-field="${f}"]`);if(!el)return;
  /* scroll so the control sits just under the sticky top, not hidden behind it */
  const top=el.getBoundingClientRect().top+scrollY-document.querySelector(".dz-stick").offsetHeight-14;
  window.scrollTo({top:Math.max(0,top),behavior:reduced()?"auto":"smooth"});
  el.classList.remove("ring");void el.offsetWidth;el.classList.add("ring");
  const t=el.querySelector("input,button:not(.gl)");if(t)setTimeout(()=>t.focus({preventScroll:true}),reduced()?0:350);}

/* ---- wiring, once ---- */
function initDesigner(){
  if(DZ.inited)return;DZ.inited=true;
  $("dzTabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;DZ.tab=b.dataset.tab;renderPanel();});
  $("dzView").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)setView(b.dataset.view);});
  /* on the cross-section, swipe left or right to go back to the curves (Kelbo, 14 November 2026: on the curves a drag
     scrubs instead) */
  let sx=0,sy=0;const cv=$("dzCv");
  cv.addEventListener("touchstart",e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  cv.addEventListener("touchend",e=>{if(DZ.view!=="section")return;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>50&&Math.abs(dy)<40)setView("curves");},{passive:true});
  /* on the curves, a finger (or the mouse) on the chart moves the time cursor and shows the readout; the canvas keeps
     touch-action pan-y, so an up-and-down drag still scrolls the page */
  const scrubTo=e=>{const g=DZ.geom,r=DZ.res;if(!g||!r||!r.ok)return;const b=cv.getBoundingClientRect(),run=r.run,tEnd=run.t[run.t.length-1];
    const t=(e.clientX-b.left-g.L)/g.w*g.tMax;DZ.scrub=Math.max(0,Math.min(1,t/tEnd));$("dzScrub").value=Math.round(DZ.scrub*1000);drawView();};
  let held=false;
  cv.addEventListener("pointerdown",e=>{if(DZ.view!=="curves")return;held=true;clearTimeout(DZ.inspT);DZ.insp=true;try{cv.setPointerCapture(e.pointerId);}catch(err){}scrubTo(e);});
  cv.addEventListener("pointermove",e=>{if(held)scrubTo(e);});
  const lift=()=>{if(!held)return;held=false;clearTimeout(DZ.inspT);DZ.inspT=setTimeout(()=>{DZ.insp=false;drawView();},INSP_HOLD);};
  cv.addEventListener("pointerup",lift);cv.addEventListener("pointercancel",lift);
  $("dzScrub").addEventListener("input",e=>{DZ.scrub=+e.target.value/1000;drawView();});
  $("dzScat").addEventListener("click",e=>{if(e.target.closest("#dzScatBtn"))toggleScatter();});
  const P=$("dzPanel");
  P.addEventListener("input",e=>{const f=e.target.dataset.slide;if(!f)return;change(f,+e.target.value,true);refreshReadouts();});
  P.addEventListener("change",e=>{const f=e.target.dataset.slide;if(!f)return;change(f,+e.target.value,false);renderPanel();});
  P.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b||b.classList.contains("gl"))return;
    if(b.dataset.set){const f=b.dataset.set;change(f,b.dataset.v,false);renderPanel();}
    else if(b.dataset.step){const c=ctlSpec(b.dataset.step),v=getF(DZ.d,c.f)+(+b.dataset.by);if(v>=c.min&&v<=c.max){change(c.f,v,false);renderPanel();}}
    else if(b.dataset.nudge){const c=ctlSpec(b.dataset.nudge),v=Math.max(c.min,Math.min(c.max,+(getF(DZ.d,c.f)+c.step*(+b.dataset.by)).toFixed(2)));change(c.f,v,false);renderPanel();
      const n=document.querySelector(`[data-nudge="${c.f}"][data-by="${b.dataset.by}"]`);if(n)n.focus({preventScroll:true});}});
  $("dzFlags").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;
    if(b.dataset.fix)goToField(b.dataset.fix);else if(b.dataset.warn!=null)warnSheet(DZ.res.sum.warnings[+b.dataset.warn]);
    else if(b.dataset.fwarn!=null){const w=flightChecks().warn[+b.dataset.fwarn];if(w)warnSheet(Object.assign({sev:"warn",gloss:w.g},w));}});
  /* buttons inside a sheet: jump to a control, or load a reference motor */
  document.addEventListener("click",e=>{const b=e.target.closest("#sheet button");if(!b)return;
    if(b.dataset.fix)goToField(b.dataset.fix);
    else if(b.dataset.ref!=null){setDesign(clone(Object.values(BURN_SIM.REF_DESIGNS)[+b.dataset.ref]));closeSheet();renderPanel();schedule(false);toast("Loaded "+Object.keys(BURN_SIM.REF_DESIGNS)[+b.dataset.ref]);}});
  $("dzSheet").addEventListener("click",dataSheet);
  $("dzBack").addEventListener("click",()=>{if(inCareer())openBoard();else{renderTitle();showScreen("title");}});
  addEventListener("resize",()=>{if(!$("design").hidden&&DZ.res)drawView();});
}
function openDesigner(){
  initDesigner();
  if(!DZ.d)DZ.d=clone(BURN_SIM.DEFAULT_DESIGN);
  BURN_SIM.normDesign(DZ.d);   // an older save's design gets the newer grain fields
  /* a flight job's bench opens with a rocket that fits the motor */
  if(isFlight()&&!BURN_SIM.airframeOf(DZ.d)){const m=BURN_SIM.motorFromDesign(DZ.d);DZ.d.airframe=m.ok?BURN_SIM.defaultAirframe(m):{body:"kraft43",nose:"ogive",fins:"three"};save();}
  renderTabs();showScreen("design");renderPanel();setView(DZ.view);
  $("dzScrub").value=Math.round(DZ.scrub*1000);
  DZ.res=null;DZ.fl=null;schedule(false);coachBench();
}
/* screens: one <main> shows at a time. One history entry stands for "inside the game"; the phone's Back button walks
   up a level (report -> bench -> work orders -> title; a logbook report -> logbook -> work orders) and pushes the entry
   again until the title. The firing screen ignores Back while the motor burns. */
const SCREENS=["title","board","design","fire","report","logbook"];
const curScreen=()=>SCREENS.find(s=>!$(s).hidden)||"title";
function parentScreen(id){return id==="board"?"title":id==="logbook"?"board":id==="design"?(inCareer()?"board":"title"):
  id==="report"?(GAME.last&&GAME.last.replay?"logbook":"design"):id==="fire"?"fire":"title";}
function showScreen(id){
  coachOff();if(id!=="fire"&&id!=="report")BURN_SOUND.voice.stop();   // Ruslan stops talking when you leave the stand and the report
  for(const s of SCREENS)$(s).hidden=s!==id;
  document.body.classList.toggle("has-go",id==="design");
  window.scrollTo(0,0);
  if(id!=="title"&&!(history.state&&history.state.brnScreen)){try{history.pushState({brnScreen:1},"");}catch(e){}}
  if(id==="board")renderBoard();
  if(id==="title")renderTitle();
}
window.addEventListener("popstate",e=>{if(sheetOn())return;if(e.state&&e.state.brnScreen)return;
  const cur=curScreen();if(cur==="title")return;
  const p=parentScreen(cur);if(p==="fire"){try{history.pushState({brnScreen:1},"");}catch(err){}return;}
  if(p==="logbook")openLogbook();else showScreen(p);if(p==="design"&&DZ.res)drawAll();});
