/* ===================== sim/levelset.js: level-set grain cross-sections (plan section 6.2) =====================
   For the shapes with no closed form (star, slotted, finocyl fins, moonburner) the port's cross-section is drawn on a
   square grid (TUNING.lsGrid cells across the grain), and every propellant cell gets its distance from the port with an
   exact Euclidean distance transform (Felzenszwalb and Huttenlocher's two-pass method). The burning surface after the
   grain has burned back by web x is the contour where distance = x, so:
     port area P(x)   = the port at the start plus every cell the contour has passed (each cell burns over one cell
                        width, so the area grows smoothly, not in steps)
     perimeter p(x)   = dP/dx (smoothed over about a cell)
     propellant left  = the grain's area minus what has burned
   lsTable(params) returns those three as tables against x, plus the distance map for the cross-section view.
   A table only depends on the cross-section, so the last few are kept (the same key always gives the same table: the
   memo doesn't change any result). A circle drawn this way matches the analytic tube (tools/sim-tests/levelset.js). */
const LS_MEMO=[];
/* the port's shape as an inside(x, y) test, in metres from the grain's axis. p: {shape, rc, pts, ptLen, ptW, offset} */
function portTest(p){
  const rc=p.rc;
  if(p.shape==="star"){
    /* a star polygon: the points' tips at rc + ptLen, the valleys between them at rc */
    const vx=[],vy=[],n=p.pts;
    for(let k=0;k<2*n;k++){const a=PI*k/n+PI/2,r=k%2?rc:rc+p.ptLen;vx.push(r*Math.cos(a));vy.push(r*Math.sin(a));}
    return(x,y)=>{let ins=false;for(let i=0,j=vx.length-1;i<vx.length;j=i++)
      if((vy[i]>y)!==(vy[j]>y)&&x<(vx[j]-vx[i])*(y-vy[i])/(vy[j]-vy[i])+vx[i])ins=!ins;return ins;};}
  if(p.shape==="slots"){
    /* the core plus radial slots of width ptW reaching out to rc + ptLen */
    const n=p.pts,tip=rc+p.ptLen,hw=p.ptW/2,cs=[],sn=[];
    for(let k=0;k<n;k++){const a=2*PI*k/n+PI/2;cs.push(Math.cos(a));sn.push(Math.sin(a));}
    return(x,y)=>{if(x*x+y*y<=rc*rc)return true;
      for(let k=0;k<n;k++){const u=x*cs[k]+y*sn[k],v=-x*sn[k]+y*cs[k];if(u>=0&&u<=tip&&Math.abs(v)<=hw)return true;}return false;};}
  if(p.shape==="moon"){const o=p.offset;return(x,y)=>x*x+(y-o)*(y-o)<=rc*rc;}   // the core moved off the axis (upwards)
  return(x,y)=>x*x+y*y<=rc*rc;}                                                   // a plain round core
/* squared Euclidean distance transform along one line (f: 0 on the port, BIG elsewhere) */
function edt1(f,n,d,v,z){
  let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
  for(let q=1;q<n;q++){
    let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);
    while(s<=z[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);}
    k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}
  k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])*(q-v[k])+f[v[k]];}}
/* the table for one cross-section. p: {shape, R, rc, pts, ptLen, ptW, offset} in metres */
function lsTable(p){
  const N=TUNING.lsGrid,key=[p.shape,p.R,p.rc,p.pts,p.ptLen,p.ptW,p.offset,N].join("|");
  const hit=LS_MEMO.find(e=>e.key===key);if(hit)return hit.tab;
  const R=p.R,c=2*R/N,inPort=portTest(p),BIG=1e10;
  /* the grid: 0 outside the grain, 1 port, 2 propellant */
  const kind=new Uint8Array(N*N),D=new Float64Array(N*N);
  let nPort=0,nGrain=0;
  for(let j=0;j<N;j++){const y=-R+(j+0.5)*c;for(let i=0;i<N;i++){const x=-R+(i+0.5)*c,q=j*N+i;
    if(x*x+y*y>R*R)continue;
    if(inPort(x,y)){kind[q]=1;nPort++;}else{kind[q]=2;nGrain++;}}}
  /* distance (in cells) from every cell to the nearest port cell: columns, then rows */
  const f=new Float64Array(N),d=new Float64Array(N),v=new Int32Array(N),z=new Float64Array(N+1);
  for(let q=0;q<N*N;q++)D[q]=kind[q]===1?0:BIG;
  for(let i=0;i<N;i++){for(let j=0;j<N;j++)f[j]=D[j*N+i];edt1(f,N,d,v,z);for(let j=0;j<N;j++)D[j*N+i]=d[j];}
  for(let j=0;j<N;j++){for(let i=0;i<N;i++)f[i]=D[j*N+i];edt1(f,N,d,v,z);for(let i=0;i<N;i++)D[j*N+i]=d[i];}
  /* each propellant cell burns over one cell width: from s = (distance to the nearest port cell) − one cell, to s + c.
     s is kept for the cross-section view (−1 on the port, NaN outside the grain) */
  const s=new Float32Array(N*N);let sMax=0;
  for(let q=0;q<N*N;q++){if(kind[q]===0){s[q]=NaN;continue;}if(kind[q]===1){s[q]=-1;continue;}
    const sv=Math.max(0,Math.sqrt(D[q])*c-c);s[q]=sv;if(sv>sMax)sMax=sv;}
  /* histogram in quarter-cell bins, then the port area at each bin edge x_k = k·h */
  const h=c/4,nb=Math.ceil((sMax+c)/h)+6,H=new Float64Array(nb);
  for(let q=0;q<N*N;q++)if(kind[q]===2)H[Math.min(nb-1,Math.floor(s[q]/h))]++;
  const P=new Float64Array(nb+1);let full=0;
  for(let k=0;k<=nb;k++){
    if(k-5>=0)full+=H[k-5];
    let part=0;for(let j=Math.max(0,k-4);j<k;j++)part+=H[j]*Math.min(1,(k-j-0.5)/4);
    P[k]=(nPort+full+part)*c*c;}
  /* the perimeter: dP/dx over a window TUNING.lsSmooth cells wide (distances on a grid come in steps, so a narrower
     window is noisy); within the first half window it looks forward only */
  const per=new Float64Array(nb+1),w=Math.max(1,Math.round(TUNING.lsSmooth*2));   // half window, in quarter-cell bins
  for(let k=0;k<=nb;k++){const a=Math.max(0,k-w),b=Math.min(nb,k+w);per[k]=b>a?(P[b]-P[a])/((b-a)*h):0;}
  for(let k=0;k<w&&k+w<=nb;k++)per[k]=(P[k+w]-P[k])/(w*h);
  const Ag=nGrain*c*c,web=sMax+c;
  const at=(arr,x)=>{if(x<=0)return arr[0];const u=x/h,k=Math.floor(u);if(k>=nb)return arr[nb];return arr[k]+(arr[k+1]-arr[k])*(u-k);};
  const tab={N,c,R,web,s,nPort,nGrain,port0:nPort*c*c,grain0:Ag,
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
Object.assign(SIM,{portTest,lsTable,lsSeg});
