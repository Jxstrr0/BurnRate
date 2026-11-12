/* ===================== sim/grain.js: grain geometry (plan section 6.2) =====================
   A grain is one or more segments in the case. Every segment answers three questions at web distance x (metres burned
   back from the starting surface):
     A(x)      burning surface area, m²
     V(x)      propellant volume left, m³
     port(x)   flow area of the port at the segment's aft end, m² (for port-to-throat ratio and mass flux)
   plus web, the x at which it has burned out. Beyond its web a segment has A = 0 and V = 0.
   Tier 1 shapes are analytic (closed forms): "bates" (cored segments, both ends burning), "tube" (a cored grain with its
   ends inhibited), "end" (an end burner: a solid cylinder burning from its aft face). Stage 5 adds level-set shapes
   (star, slotted, finocyl, moonburner) that produce the same three tables from a rasterised cross-section. */
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
function buildGrain(g){
  const R=g.od/2,segs=[];
  if(g.shape==="end")segs.push(endSeg(R,g.segLen*g.segs));
  else for(let i=0;i<g.segs;i++)segs.push(coreSeg(R,g.coreD/2,g.segLen,g.shape==="bates"));
  const gaps=g.shape==="end"?0:(g.segs-1)*TUNING.segGap/1000;
  const len=(g.shape==="end"?g.segLen*g.segs:g.segLen*g.segs)+gaps;
  const web=Math.max(...segs.map(s=>s.web));
  return{shape:g.shape,R,segs,web,len,gaps,
    A:x=>segs.reduce((s,q)=>s+q.A(x),0),
    V:x=>segs.reduce((s,q)=>s+q.V(x),0),
    port:x=>segs[segs.length-1].port(x),
    minPort:x=>Math.min(...segs.map(q=>q.port(x)))};
}
Object.assign(SIM,{buildGrain,coreSeg,endSeg});
