/* ===================== sim/motor.js: a design in friendly units -> a motor in SI =====================
   motorFromDesign(design) checks the design and works out everything that doesn't change during a firing: the grain
   geometry, throat and exit areas, nozzle efficiency, chamber volume, masses, ratings. It returns
   {ok, errors:[{field, text}], ...motor}. An error names the design field to fix (the UI rings that control).
   Nothing here is random; the variance model (stage 3) perturbs the motor, never the design. */
const mm=v=>v/1000;
function designErrors(d){
  const e=[],add=(field,text)=>e.push({field,text});
  const g=d.grain,c=d.case,z=d.nozzle;
  if(!PROPELLANTS[g.prop])add("grain.prop","Pick a propellant grade.");
  if(!CASES[c.mat])add("case.mat","Pick a case material.");
  if(!LINERS[c.liner])add("case.liner","Pick a liner.");
  if(!THROATS[z.mat])add("nozzle.mat","Pick a throat material.");
  if(!CLOSURES[c.closure])add("case.closure","Pick how the closures are held.");
  if(!IGNITERS[d.igniter])add("igniter","Pick an igniter.");
  if(!(c.id>=10&&c.id<=600))add("case.id","Case bore must be 10 to 600 mm.");
  if(!(c.wall>0.3&&c.wall<c.id/4))add("case.wall","Wall thickness must be more than 0.3 mm and under a quarter of the bore.");
  if(!(c.linerThk>=0.3&&c.linerThk<c.id/6))add("case.linerThk","Liner must be at least 0.3 mm and leave room for the grain.");
  const od=c.id-2*c.linerThk;
  if(!(g.segs>=1&&g.segs<=12&&Math.round(g.segs)===g.segs))add("grain.segs","1 to 12 segments.");
  if(!(g.segLen>=5&&g.segLen<=2000))add("grain.segLen","Segment length must be 5 to 2000 mm.");
  if(!["bates","tube","end"].includes(g.shape))add("grain.shape","Pick a grain shape.");
  if(g.shape!=="end"){
    if(!(g.coreD>=2))add("grain.coreD","The core needs to be at least 2 mm across.");
    else if(g.coreD>od-2)add("grain.coreD",`The core (${g.coreD} mm) leaves no propellant in a ${od.toFixed(1)} mm grain.`);
    if(z.throatD>=g.coreD)add("nozzle.throatD",`The throat (${z.throatD} mm) is as wide as the core (${g.coreD} mm): the port would choke instead of the nozzle.`);
  }
  if(!(z.throatD>=1&&z.throatD<od))add("nozzle.throatD","Throat must be at least 1 mm and narrower than the grain.");
  if(!(z.exitD>=z.throatD))add("nozzle.exitD","The exit can't be narrower than the throat.");
  else if(z.exitD>c.id+2*c.wall+20)add("nozzle.exitD","The exit is much wider than the motor.");
  if(!(z.half>=5&&z.half<=30))add("nozzle.half","Divergence half-angle must be 5 to 30 degrees.");
  if(c.closure==="bolts"&&!(c.bolts>=3&&c.bolts<=36))add("case.bolts","3 to 36 bolts.");
  return e;
}
function motorFromDesign(d){
  const errors=designErrors(d);
  if(errors.length)return{ok:false,errors};
  const prop=PROPELLANTS[d.grain.prop],cm=CASES[d.case.mat],ln=LINERS[d.case.liner],th=THROATS[d.nozzle.mat],cl=CLOSURES[d.case.closure],ig=IGNITERS[d.igniter];
  const id=mm(d.case.id),wall=mm(d.case.wall),lin=mm(d.case.linerThk),od=id-2*lin;
  const grain=buildGrain({shape:d.grain.shape,segs:d.grain.segs,segLen:mm(d.grain.segLen),coreD:mm(d.grain.coreD),od});
  const rt0=mm(d.nozzle.throatD)/2,re=mm(d.nozzle.exitD)/2,At0=PI*rt0*rt0,Ae=PI*re*re;
  const chamberLen=grain.len+TUNING.headSpace*od,Vch=PI*(od/2)*(od/2)*chamberLen;
  const clThk=TUNING.closureThk*id,caseLen=chamberLen+2*clThk;
  const nozLen=(re-rt0)/Math.tan(d.nozzle.half*PI/180)+TUNING.nozzleLen*id;
  const mass={
    prop:prop.rho*grain.V(0),
    case:cm.rho*PI*((id/2+wall)*(id/2+wall)-(id/2)*(id/2))*caseLen,
    liner:ln.rho*PI*((id/2)*(id/2)-(od/2)*(od/2))*chamberLen,
    closures:2*TUNING.closureRho*PI*(id/2)*(id/2)*clThk,
    nozzle:th.rho*PI*(id/2)*(id/2)*nozLen*TUNING.nozzleFill};
  mass.dry=mass.case+mass.liner+mass.closures+mass.nozzle;mass.total=mass.dry+mass.prop;
  const retention=d.case.closure==="bolts"?cl.perBolt*d.case.bolts:cl.perMm*PI*d.case.id;
  return{ok:true,errors,design:d,prop,caseMat:cm,liner:ln,throatMat:th,igniter:ig,
    grain,od,id,wall,linThk:lin,rt0,re,At0,Ae,eps0:Ae/At0,eta:nozzleEta(d.nozzle.half,th.finish),
    Vch,chamberLen,caseLen,length:caseLen+nozLen,diameter:id+2*wall,mass,retention,
    linerRating:ln.rate*d.case.linerThk,   // seconds of protection
    pYield:cm.yield*1e6*wall/(id/2),pUlt:cm.ult*1e6*wall/(id/2)};   // pressure at which the hoop stress reaches yield / ultimate
}
Object.assign(SIM,{designErrors,motorFromDesign});
