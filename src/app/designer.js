/* ===================== app/designer.js: the design bench (stage 2; plan sections 4, 6.8 and 9.2) =====================
   The player edits a motor and the predictor redraws as they drag. Top (sticky): the live view (predicted curves or the
   cross-section, swipe or tap to switch) with a burn scrubber, the key numbers and the warning flags. Below: the tabs
   Grain · Nozzle · Case · Igniter with thumb-sized controls.
   While a slider moves, the sim runs with fewer steps (DRAG_STEPS) once per frame; on release it runs in full.
   A warning flag opens its explanation with a button that jumps to the control to change.
   The design lives in memory only for now; saving designs arrives with careers in stage 4 (brn-save). */
const DRAG_STEPS=110;
/* the live view's height: room for the controls below matters more than a tall chart on a short phone */
const VIEW_H=w=>Math.max(130,Math.min(w*0.46,innerHeight*0.23,250));
const DZ={d:null,tab:"grain",view:"curves",scrub:0.5,res:null,raf:0,fast:null,inited:false};
const TABS=[["grain","Grain"],["nozzle","Nozzle"],["case","Case"],["igniter","Igniter"]];
const FLAG_SHORT={burst:"Case bursts",yield:"Case yields",sf:"Thin margin",closure:"Closures",chuff:"Chuffing",pt:"Narrow port",
  flux:"Mass flux",liner:"Liner",sep:"Over-expanded",ign:"Weak igniter",spike:"Igniter spike"};
const clone=o=>JSON.parse(JSON.stringify(o));
const getF=(d,f)=>f.split(".").reduce((o,k)=>o[k],d);
function setF(d,f,v){const k=f.split(".");let o=d;for(let i=0;i<k.length-1;i++)o=o[k[i]];o[k[k.length-1]]=v;}
const r1=v=>Math.round(v*10)/10;

/* ---- the controls on each tab, as data. type: pick (cards), seg (segmented buttons), step (- n +), slide ---- */
function controls(tab,d){
  const S=BURN_SIM,od=d.case.id-2*d.case.linerThk,cored=d.grain.shape!=="end";
  if(tab==="grain")return[
    {f:"grain.prop",type:"pick",label:"Propellant grade",g:"grade",items:S.PROPELLANTS,
      sub:p=>`${p.rRef} mm/s at 5 MPa · n ${p.n.toFixed(2)} · ${p.rho} kg/m³ · c* ${p.cStar} m/s`},
    {f:"grain.shape",type:"seg",label:"Grain shape",g:"shape",opts:[["bates","BATES"],["tube","Tube"],["end","End burner"]]},
    {f:"grain.segs",type:"step",label:cored?"Segments":"Grain pieces",g:"segments",min:1,max:12},
    {f:"grain.segLen",type:"slide",label:cored?"Segment length":"Piece length",g:"web",unit:"mm",min:10,max:Math.max(60,Math.round(d.case.id*5)),step:1},
    cored&&{f:"grain.coreD",type:"slide",label:"Core diameter",g:"core",unit:"mm",min:2,max:r1(od-3),step:0.5}
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
  return[{f:"igniter",type:"pick",label:"Igniter",g:"igniter",items:S.IGNITERS,sub:i=>`${(i.gas*1000).toFixed(2)} g of gas over ${Math.round(i.burn*1000)} ms`}];
}
const TAB_OF=f=>f.split(".")[0];
const fmtV=(c,v)=>c.step<1?(+v).toFixed(1):String(Math.round(v));

/* keep dependent sizes legal after a change (the core inside the grain, the throat inside the core...) */
function clampDesign(d){
  const c=d.case,g=d.grain,z=d.nozzle;
  c.wall=Math.min(c.wall,r1(c.id/4-0.1));c.linerThk=Math.min(c.linerThk,r1(c.id/6-0.1));
  const od=c.id-2*c.linerThk;
  if(g.shape!=="end"){g.coreD=Math.max(2,Math.min(g.coreD,r1(od-3)));z.throatD=Math.min(z.throatD,r1(g.coreD-0.5));}
  else z.throatD=Math.min(z.throatD,r1(od-1));
  z.throatD=Math.max(1,z.throatD);z.exitD=Math.max(z.exitD,z.throatD);
  return d;}

/* ---- rendering the tab panel ---- */
function ctlHtml(c,d){
  const v=getF(d,c.f),lab=`<button type="button" class="gl" data-g="${c.g}">${esc(c.label)}</button>`;
  if(c.type==="pick")return`<fieldset class="ctl pick" data-field="${c.f}"><legend>${lab}</legend>${Object.entries(c.items).map(([id,it])=>
    `<button type="button" class="opt${id===v?" on":""}" data-set="${c.f}" data-v="${id}" aria-pressed="${id===v}"><b>${esc(it.name)}</b>${it.tier>1?`<span class="tag">Tier ${it.tier}</span>`:""}<small>${esc(c.sub(it))}</small></button>`).join("")}</fieldset>`;
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
function renderPanel(){
  const d=DZ.d;
  document.querySelectorAll("#dzTabs [data-tab]").forEach(b=>{const on=b.dataset.tab===DZ.tab;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});
  $("dzPanel").innerHTML=controls(DZ.tab,d).map(c=>ctlHtml(c,d)).join("");
  markErrors();
}
function ctlSpec(f){return controls(TAB_OF(f),DZ.d).find(c=>c.f===f);}
/* after a slider moves, update its readout and the extras of the controls on screen without rebuilding the panel */
function refreshReadouts(){
  for(const c of controls(DZ.tab,DZ.d)){
    const o=document.querySelector(`[data-out="${c.f}"]`);if(o)o.textContent=fmtV(c,getF(DZ.d,c.f));
    const e=document.querySelector(`[data-ex="${c.f}"]`);if(e&&c.extra)e.textContent=c.extra(DZ.d);}}
function markErrors(){
  const bad=new Set(DZ.res&&!DZ.res.ok?DZ.res.errors.map(e=>e.field):[]);
  document.querySelectorAll("#dzPanel [data-field]").forEach(el=>el.classList.toggle("bad",bad.has(el.dataset.field)));}

/* ---- the sim, at most once a frame ---- */
function schedule(fast){
  DZ.fast=DZ.fast===null?fast:(DZ.fast&&fast);
  if(DZ.raf)return;
  DZ.raf=requestAnimationFrame(()=>{DZ.raf=0;const f=DZ.fast;DZ.fast=null;
    DZ.res=BURN_SIM.predict(DZ.d,{tGrain:20},f?{steps:DRAG_STEPS}:undefined);drawAll();});}
function change(f,v,fast){
  setF(DZ.d,f,v);clampDesign(DZ.d);schedule(fast);}

/* ---- the top: designation, live view, numbers, flags ---- */
function drawAll(){
  const r=DZ.res;
  if(!r.ok){
    $("dzDes").textContent="—";$("dzNums").innerHTML="";
    $("dzFlags").innerHTML=r.errors.map(e=>`<button type="button" class="flag crit" data-fix="${e.field}">${esc(e.text)}</button>`).join("");
    const cv=$("dzCv"),{c,W,H}=BURN_VIS.fit(cv,VIEW_H);c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");
    c.font="14px "+getComputedStyle(document.documentElement).getPropertyValue("--ui");c.textAlign="center";c.fillText("This motor can't be built yet.",W/2,H/2);
    $("dzScrubV").textContent="";markErrors();return;}
  const s=r.sum,m=r.motor;
  $("dzDes").textContent=s.designation;
  const sfCls=s.sf<1?"crit":s.sf<BURN_SIM.TUNING.sfWarn?"warn":"good";
  const cell=(g,lab,val,cls)=>`<button type="button" class="num" data-g="${g}"><span>${lab}</span><b class="mono ${cls||""}">${val}</b></button>`;
  $("dzNums").innerHTML=cell("impulse","N·s",s.I<100?s.I.toFixed(1):Math.round(s.I))+cell("thrust","Avg N",Math.round(s.Fav))+
    cell("burnTime","Burn s",s.tb.toFixed(2))+cell("pressure","Peak MPa",(s.Pmax/1e6).toFixed(2))+
    cell("isp","Isp s",s.Isp.toFixed(0))+cell("sf","Safety",s.sf>=10?s.sf.toFixed(0):s.sf.toFixed(2),sfCls);
  $("dzFlags").innerHTML=s.warnings.length?s.warnings.map((w,i)=>`<button type="button" class="flag ${w.sev}" data-warn="${i}">${esc(FLAG_SHORT[w.key]||w.key)}</button>`).join("")
    :`<span class="flag ok">No warnings</span>`;
  drawView();markErrors();
}
function drawView(){
  const r=DZ.res;if(!r||!r.ok)return;
  const run=r.run,m=r.motor,tEnd=run.t[run.t.length-1],t=DZ.scrub*tEnd,i=BURN_VIS.at(run,t);
  const info=[`t ${run.t[i].toFixed(2)} s`,`${(run.p[i]/1e6).toFixed(2)} MPa`,`${Math.round(run.f[i])} N`,`Kn ${Math.round(run.kn[i])}`,`web ${Math.min(100,Math.round(run.x[i]/run.web*100))}% burned`];
  if(DZ.view==="curves"){BURN_VIS.curves($("dzCv"),run,{h:VIEW_H,pYield:m.pYield,pMin:m.prop.pMin*1e6,cursor:run.t[i]});}
  else{BURN_VIS.section($("dzCv"),m,run.x[i],info,VIEW_H);}
  $("dzScrubV").textContent=info.slice(0,2).join(" · ");
  $("dzCv").setAttribute("aria-label",DZ.view==="curves"?`Predicted pressure and thrust. Peak ${(r.sum.Pmax/1e6).toFixed(2)} MPa, average thrust ${Math.round(r.sum.Fav)} N over ${r.sum.tb.toFixed(2)} s.`
    :`Cross-section of the motor at ${run.t[i].toFixed(2)} s.`);
}
function setView(v){DZ.view=v;document.querySelectorAll("#dzView [data-view]").forEach(b=>{const on=b.dataset.view===v;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});drawView();}

/* ---- sheets: a warning, the data sheet ---- */
function warnSheet(w){
  const c=ctlSpec(w.field),g=GLOSS[w.gloss];
  openSheet(FLAG_SHORT[w.key]||"Warning",`<p class="sev ${w.sev}"><b>${w.sev==="crit"?"This will fail.":"Risky."}</b> ${esc(w.text)}</p>
    ${g?`<h3>${esc(g.t)}</h3><p>${esc(g.d)}</p>`:""}
    ${c?`<button type="button" class="btn pri" data-fix="${w.field}">Go to ${esc(c.label.toLowerCase())}</button>`:""}`);}
function dataRows(r){
  const s=r.sum,m=r.motor,row=(g,k,v)=>`<tr><th>${g?`<button type="button" class="gl" data-g="${g}">${k}</button>`:k}</th><td>${v}</td></tr>`;
  return[row("impulseClass","Designation",`${s.designation} (${s.cls.pct}% of ${s.cls.letter})`),row("impulse","Total impulse",s.I.toFixed(1)+" N·s"),
    row("thrust","Thrust avg / peak",`${s.Fav.toFixed(0)} / ${s.Fmax.toFixed(0)} N`),row("burnTime","Burn time",s.tb.toFixed(2)+" s"),
    row("pressure","Pressure avg / peak",`${(s.Pav/1e6).toFixed(2)} / ${(s.Pmax/1e6).toFixed(2)} MPa`),row("isp","Isp",s.Isp.toFixed(1)+" s"),
    row("kn","Kn start / range",`${s.kn0.toFixed(0)} / ${s.knMin.toFixed(0)}–${s.knMax.toFixed(0)}`),row("portThroat","Port-to-throat",s.pt0.toFixed(2)),
    row("massFlux","Peak mass flux",Math.round(s.gMax)+" kg/m²s"),row("sf","Case safety factor",s.sf.toFixed(2)+` (yield at ${(m.pYield/1e6).toFixed(1)} MPa)`),
    row("retention","Closure margin",s.closureSf.toFixed(2)),row("liner","Liner rating",m.linerRating.toFixed(1)+" s"),
    row("igniter","Igniter strength",s.ign.strength.toFixed(2)),row("throatMat","Throat growth","+"+(s.throatGrowth*100).toFixed(2)+"%"),
    row("exit","Expansion ratio",m.eps0.toFixed(1)),
    row("","Propellant / total",`${(m.mass.prop*1000).toFixed(0)} / ${(m.mass.total*1000).toFixed(0)} g`),
    row("","Mass fraction",(s.massFrac*100).toFixed(0)+"%"),
    row("","Length × diameter",`${(m.length*1000).toFixed(0)} × ${(m.diameter*1000).toFixed(0)} mm`)].join("");}
function dataSheet(){
  const r=DZ.res;
  const refs=Object.keys(BURN_SIM.REF_DESIGNS).map((k,i)=>`<button type="button" class="btn sm" data-ref="${i}">${esc(k)}</button>`).join("");
  openSheet("Data sheet",(r.ok?`<p class="hint">Predicted at 20 °C, sea level. The real motor won't match exactly.</p><table class="dtab mono">${dataRows(r)}</table>`
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
  $("dzTabs").innerHTML=TABS.map(([id,n])=>`<button type="button" role="tab" data-tab="${id}">${n}</button>`).join("");
  $("dzTabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;DZ.tab=b.dataset.tab;renderPanel();});
  $("dzView").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)setView(b.dataset.view);});
  /* swipe the live view left or right to switch between the curves and the cross-section */
  let sx=0,sy=0;const cv=$("dzCv");
  cv.addEventListener("touchstart",e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  cv.addEventListener("touchend",e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>50&&Math.abs(dy)<40)setView(DZ.view==="curves"?"section":"curves");},{passive:true});
  $("dzScrub").addEventListener("input",e=>{DZ.scrub=+e.target.value/1000;drawView();});
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
    if(b.dataset.fix)goToField(b.dataset.fix);else if(b.dataset.warn!=null)warnSheet(DZ.res.sum.warnings[+b.dataset.warn]);});
  /* buttons inside a sheet: jump to a control, or load a reference motor */
  document.addEventListener("click",e=>{const b=e.target.closest("#sheet button");if(!b)return;
    if(b.dataset.fix)goToField(b.dataset.fix);
    else if(b.dataset.ref!=null){DZ.d=clone(Object.values(BURN_SIM.REF_DESIGNS)[+b.dataset.ref]);closeSheet();renderPanel();schedule(false);toast("Loaded "+Object.keys(BURN_SIM.REF_DESIGNS)[+b.dataset.ref]);}});
  $("dzSheet").addEventListener("click",dataSheet);
  $("dzBack").addEventListener("click",()=>showScreen("title"));
  addEventListener("resize",()=>{if(!$("design").hidden&&DZ.res)drawView();});
}
function openDesigner(){
  initDesigner();
  if(!DZ.d)DZ.d=clone(BURN_SIM.DEFAULT_DESIGN);
  showScreen("design");renderPanel();setView(DZ.view);
  $("dzScrub").value=Math.round(DZ.scrub*1000);
  DZ.res=null;schedule(false);
}
/* screens: one <main> shows at a time. The phone's Back button from the bench returns to the title. */
function showScreen(id){
  for(const s of["title","design"])$(s).hidden=s!==id;
  window.scrollTo(0,0);
  if(id==="design"&&!(history.state&&history.state.brnScreen)){try{history.pushState({brnScreen:"design"},"");}catch(e){}}
}
window.addEventListener("popstate",e=>{if(sheetOn())return;if(!(e.state&&e.state.brnScreen)&&!$("design").hidden)showScreen("title");});
