/* ===================== sim/levelset.js: level-set grain cross-sections (plan section 6.2) =====================
   For the shapes with no closed form (star, slotted, finocyl fins, moonburner) the grain's cross-section is laid on a
   square grid (TUNING.lsGrid cells across the grain), and every cell gets its exact signed distance from the port's edge
   (negative inside the port): every port here is built from circles, polygons and rectangles, which all have a
   closed-form distance. The burning surface after the grain has burned back by web x is the contour where distance = x
   (the front moves at the same speed everywhere, so the burned region is everything within x of the first port), so:
     port area P(x)   = every cell the contour has passed; a cell burns smoothly over one cell width, from its centre
                        distance minus half a cell to plus half a cell, so the edge is not a staircase
     perimeter p(x)   = dP/dx (smoothed over a few cells)
     propellant left  = the grain's area minus what has burned
   lsTable(params) returns those three as tables against x, plus the distance map for the cross-section view.
   A table only depends on the cross-section, so the last few are kept (the same key always gives the same table: the
   memo doesn't change any result). A circle drawn this way matches the analytic tube (tools/sim-tests/levelset.js). */
const LS_MEMO=[];
/* the port's signed distance sd(x, y), in metres from the grain's axis: negative inside the port, positive in the
   propellant. p: {shape, rc, pts, ptLen, ptW, offset} */
function portDist(p){
  const rc=p.rc;
  if(p.shape==="star"){
    /* a star polygon: the points' tips at rc + ptLen, the valleys between them at rc */
    const vx=[],vy=[],n=p.pts;
    for(let k=0;k<2*n;k++){const a=PI*k/n+PI/2,r=k%2?rc:rc+p.ptLen;vx.push(r*Math.cos(a));vy.push(r*Math.sin(a));}
    const m=vx.length;
    return(x,y)=>{let ins=false,d2=Infinity;
      for(let i=0,j=m-1;i<m;j=i++){
        if((vy[i]>y)!==(vy[j]>y)&&x<(vx[j]-vx[i])*(y-vy[i])/(vy[j]-vy[i])+vx[i])ins=!ins;
        const ex=vx[i]-vx[j],ey=vy[i]-vy[j],wx=x-vx[j],wy=y-vy[j],t=Math.max(0,Math.min(1,(wx*ex+wy*ey)/(ex*ex+ey*ey)));
        const dx=wx-t*ex,dy=wy-t*ey;d2=Math.min(d2,dx*dx+dy*dy);}
      const d=Math.sqrt(d2);return ins?-d:d;};}
  if(p.shape==="slots"){
    /* the core plus radial slots of width ptW reaching out to rc + ptLen: the union of a circle and rectangles */
    const n=p.pts,tip=rc+p.ptLen,hw=p.ptW/2,cs=[],sn=[];
    for(let k=0;k<n;k++){const a=2*PI*k/n+PI/2;cs.push(Math.cos(a));sn.push(Math.sin(a));}
    return(x,y)=>{let d=Math.hypot(x,y)-rc;
      for(let k=0;k<n;k++){const u=x*cs[k]+y*sn[k]-tip/2,v=-x*sn[k]+y*cs[k];
        const qx=Math.abs(u)-tip/2,qy=Math.abs(v)-hw;
        d=Math.min(d,Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0));}
      return d;};}
  if(p.shape==="moon"){const o=p.offset;return(x,y)=>Math.hypot(x,y-o)-rc;}   // the core moved off the axis (upwards)
  return(x,y)=>Math.hypot(x,y)-rc;}                                            // a plain round core
/* the port's shape as an inside(x, y) test */
function portTest(p){const sd=portDist(p);return(x,y)=>sd(x,y)<0;}
/* the table for one cross-section. p: {shape, R, rc, pts, ptLen, ptW, offset} in metres */
function lsTable(p){
  const N=TUNING.lsGrid,key=[p.shape,p.R,p.rc,p.pts,p.ptLen,p.ptW,p.offset,N].join("|");
  const hit=LS_MEMO.find(e=>e.key===key);if(hit)return hit.tab;
  const R=p.R,c=2*R/N,sd=portDist(p);
  /* s: each cell's centre distance (−1 on the port, NaN outside the grain), kept for the cross-section view;
     u: where each cell starts to burn (half a cell before the front reaches its centre); deep port cells all sit at −1.5 cells */
  const s=new Float32Array(N*N),u=new Float64Array(N*N);let nDisk=0,nPort=0,sMax=0;
  for(let j=0;j<N;j++){const y=-R+(j+0.5)*c;for(let i=0;i<N;i++){const x=-R+(i+0.5)*c,q=j*N+i;
    if(x*x+y*y>R*R){s[q]=NaN;u[q]=NaN;continue;}
    const v=sd(x,y);nDisk++;u[q]=Math.max(-1.5*c,v-c/2);
    if(v<0){s[q]=-1;nPort++;}else{s[q]=v;if(v>sMax)sMax=v;}}}
  /* histogram of burn starts in fine bins (c/32), then the port area at x_k = k·h: every cell counts in full once the
     front is half a cell past its centre, and in part (a straight ramp) over the cell width before that */
  const b=c/32,o=2*c,nf=Math.ceil((sMax+c/2+o)/b)+2,F=new Float64Array(nf);   // bins start at −o
  for(let q=0;q<N*N;q++){const v=u[q];if(v===v)F[Math.min(nf-1,Math.floor((v+o)/b))]++;}
  const h=c/4,nb=Math.ceil((sMax+c/2)/h)+2,P=new Float64Array(nb+1);
  let full=0,fi=0;   // full: cells whose burn start is at least one cell behind x; fi: the first bin not yet in it
  for(let k=0;k<=nb;k++){const x=k*h;
    while(fi<nf&&-o+(fi+1)*b<=x-c){full+=F[fi];fi++;}
    let part=0;for(let i=fi;i<nf;i++){const ui=-o+(i+0.5)*b;if(ui>=x)break;part+=F[i]*Math.min(1,(x-ui)/c);}
    P[k]=(full+part)*c*c;}
  /* the perimeter: dP/dx over a window TUNING.lsSmooth cells wide; within the first half window it looks forward only */
  const per=new Float64Array(nb+1),w=Math.max(1,Math.round(TUNING.lsSmooth*2));   // half window, in quarter-cell bins
  for(let k=0;k<=nb;k++){const a=Math.max(0,k-w),e=Math.min(nb,k+w);per[k]=e>a?(P[e]-P[a])/((e-a)*h):0;}
  for(let k=0;k<w&&k+w<=nb;k++)per[k]=(P[k+w]-P[k])/(w*h);
  const Ad=nDisk*c*c,Ag=Ad-P[0],web=sMax+c/2;
  const at=(arr,x)=>{if(x<=0)return arr[0];const r=x/h,k=Math.floor(r);if(k>=nb)return arr[nb];return arr[k]+(arr[k+1]-arr[k])*(r-k);};
  const tab={N,c,R,web,s,nPort,nGrain:nDisk-nPort,port0:P[0],grain0:Ag,
    per:x=>x>=web?0:at(per,x),
    port:x=>Math.min(PI*R*R,at(P,Math.min(x,web))),
    area:x=>x>=web?0:Math.max(0,Ag-(at(P,x)-P[0]))};   // propellant left in the cross-section, m²
  LS_MEMO.unshift({key,tab});if(LS_MEMO.length>8)LS_MEMO.pop();
  return tab;}
/* a level-set segment of length L, ends inhibited. pieces: [{tab, L}] forward to aft (a finocyl segment is a plain core
   forward and the finned part aft); the segment answers the same questions as the analytic ones in sim/grain.js */
function lsSeg(R,pieces,shape){
  const L=pieces.reduce((s,p)=>s+p.L,0),web=Math.max(...pieces.map(p=>p.tab.web)),aft=pieces[pieces.length-1].tab;
  return{kind:"ls",shape,R,L,web,pieces,rc:0,
    A(x){return x>=web?0:pieces.reduce((s,p)=>s+p.tab.per(x)*p.L,0);},
    V(x){return x>=web?0:pieces.reduce((s,p)=>s+p.tab.area(x)*p.L,0);},
    port(x){return aft.port(x);},
    minPort(x){return Math.min(...pieces.map(p=>p.tab.port(x)));}};}
Object.assign(SIM,{portDist,portTest,lsTable,lsSeg});
