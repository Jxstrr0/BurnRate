/* ===================== sim/grain.js: grain geometry (plan section 6.2) =====================
   A grain is one or more segments in the case. Every segment answers three questions at web distance x (metres burned
   back from the starting surface):
     A(x)      burning surface area, m²
     V(x)      propellant volume left, m³
     port(x)   flow area of the port at the segment's aft end, m² (for port-to-throat ratio and mass flux)
   plus web, the x at which it has burned out. Beyond its web a segment has A = 0 and V = 0.
   Tier 1 shapes are analytic (closed forms): "bates" (cored segments, both ends burning), "tube" (a cored grain with its
   ends inhibited), "end" (an end burner: a solid cylinder burning from its aft face). The level-set shapes (sim/levelset.js)
   answer the same questions from a cross-section drawn on a grid, ends inhibited: "star" (a star-shaped port), "slots"
   (a core with radial slots), "finocyl" (a plain core forward, the slotted section over the aft finLen of each segment)
   and "moon" (a moonburner: a round core moved off the axis by offset). */
const PI=Math.PI;
/* one cored segment: outer radius R, core radius rc, length L, ends burning (true) or inhibited (false) */
function coreSeg(R,rc,L,endsBurn){
  const web=endsBurn?Math.min(R-rc,L/2):R-rc;
  const len=x=>endsBurn?L-2*x:L;
  return{kind:endsBurn?"bates":"tube",R,rc,L,web,
    A(x){if(x>=web)return 0;const r=rc+x;return 2*PI*r*len(x)+(endsBurn?2*PI*(R*R-r*r):0);},
    V(x){if(x>=web)return 0;const r=rc+x;return PI*(R*R-r*r)*len(x);},
    port(x){const r=Math.min(R,rc+Math.max(0,x));return PI*r*r;}};
}
/* an end burner: one solid cylinder of radius R and length L burning from its aft face */
function endSeg(R,L){
  return{kind:"end",R,rc:0,L,web:L,
    A(x){return x>=L?0:PI*R*R;},
    V(x){return x>=L?0:PI*R*R*(L-x);},
    port(){return PI*R*R;}};
}
/* buildGrain({shape, segs, segLen, coreD, od}) in metres. Returns the segments and whole-grain helpers.
   Segments are listed forward to aft; the aft one carries the whole mass flow past its port. */
function lsSegment(g,R){
  const rc=g.coreD/2,base={R,rc,pts:g.pts,ptLen:g.ptLen,ptW:g.ptW,offset:g.offset};
  if(g.shape==="finocyl"){
    const Lf=Math.min(g.finLen,g.segLen),pieces=[];
    if(g.segLen-Lf>1e-6)pieces.push({tab:lsTable({shape:"core",R,rc}),L:g.segLen-Lf});
    pieces.push({tab:lsTable(Object.assign({},base,{shape:"slots"})),L:Lf});
    return lsSeg(R,pieces,"finocyl");}
  return lsSeg(R,[{tab:lsTable(Object.assign({},base,{shape:g.shape})),L:g.segLen}],g.shape);}
function buildGrain(g){
  const R=g.od/2,segs=[];
  if(g.shape==="end")segs.push(endSeg(R,g.segLen*g.segs));
  else if(GRAIN_SHAPES[g.shape]&&GRAIN_SHAPES[g.shape].ls)for(let i=0;i<g.segs;i++)segs.push(lsSegment(g,R));
  else for(let i=0;i<g.segs;i++)segs.push(coreSeg(R,g.coreD/2,g.segLen,g.shape==="bates"));
  const gaps=g.shape==="end"?0:(g.segs-1)*TUNING.segGap/1000;
  const len=(g.shape==="end"?g.segLen*g.segs:g.segLen*g.segs)+gaps;
  const web=Math.max(...segs.map(s=>s.web));
  return{shape:g.shape,R,segs,web,len,gaps,
    A:x=>segs.reduce((s,q)=>s+q.A(x),0),
    V:x=>segs.reduce((s,q)=>s+q.V(x),0),
    port:x=>segs[segs.length-1].port(x),
    minPort:x=>Math.min(...segs.map(q=>q.minPort?q.minPort(x):q.port(x)))};
}
Object.assign(SIM,{buildGrain,coreSeg,endSeg,lsSegment});
