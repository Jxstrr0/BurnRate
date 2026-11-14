/* ===================== vis/chart.js: the predicted curves (plan section 9.3) =====================
   curves(cv, run, o) draws chamber pressure (left scale, MPa, the predicted blue) and thrust (right scale, N, graphite)
   against time. o (all optional): pYield (Pa: the case yield line, drawn when it fits on the scale), pMin (Pa: the grade's
   stable minimum, dotted), cursor (s: a scrub line with dots on both traces), band ({t, pLo, pHi, fLo, fHi}: the scatter
   predictor's spread, shaded under each trace) and fails ([{t, p}]: where scatter motors failed, red crosses), readout
   (lines of text for the cursor, drawn in a box beside it), port ((ctx, x, y, size, tokens) => draws the end view at the cursor,
   in the readout's box). Hand-rolled Canvas 2D, no chart library. Returns the plot's geometry {L, w, tMax} so a tap can be
   turned into a time. */
function curves(cv,run,o){
  o=o||{};
  const{c,W,H}=fit(cv,o.h||(w=>Math.min(w*0.5,260))),k=tokens();
  const L=36,R=42,T=12,B=22,w=W-L-R,h=H-T-B,n=run.t.length,tMax=run.t[n-1]*1.04;
  let pPk=0,fPk=0;for(let i=0;i<n;i++){if(run.p[i]>pPk)pPk=run.p[i];if(run.f[i]>fPk)fPk=run.f[i];}
  const pMax=nice(pPk/1e6*1.12),nd=divs(pMax),fMax=nice(fPk*1.12/nd)*nd,X=t=>L+w*t/tMax,Yp=p=>T+h-h*Math.min(1.04,p/1e6/pMax),Yf=f=>T+h-h*Math.min(1.04,f/fMax);
  c.font=`10px ${k.mono}`;c.lineWidth=1;c.textBaseline="middle";
  /* the thrust scale shares the pressure scale's gridlines (nd of them), each a round step */
  for(let i=0;i<=nd;i++){const y=T+h-h*i/nd;c.strokeStyle=k.line;c.beginPath();c.moveTo(L,y+.5);c.lineTo(L+w,y+.5);c.stroke();
    c.fillStyle=k.pred;c.textAlign="right";c.fillText(fmtAxis(pMax*i/nd,pMax),L-5,y);
    c.fillStyle=k.ink;c.textAlign="left";c.fillText(fmtAxis(fMax*i/nd,fMax),L+w+5,y);}
  /* units at the top of each scale stand in for a key: blue MPa on the left, graphite N on the right */
  c.font=`600 10px ${k.mono}`;c.textBaseline="alphabetic";c.fillStyle=k.pred;c.textAlign="left";c.fillText("MPa",L+4,T+9);
  c.fillStyle=k.ink;c.textAlign="right";c.fillText("thrust N",L+w-4,T+9);c.font=`10px ${k.mono}`;
  const tStep=nice(tMax/4.5);c.fillStyle=k.muted;c.textAlign="center";c.textBaseline="alphabetic";
  for(let t=0;t<=tMax+1e-9;t+=tStep)c.fillText(t.toFixed(tStep<1?1:0)+(t?"":" s"),X(t),H-6);
  /* reference lines: case yield (stencil red, dashed) and the grade's stable minimum (dotted) */
  const ref=(p,col,dash,label)=>{if(!(p>0)||p/1e6>pMax*1.02)return;const y=Yp(p);c.save();c.setLineDash(dash);c.strokeStyle=col;c.lineWidth=1.25;
    c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();c.restore();c.fillStyle=col;c.textAlign="right";c.fillText(label,L+w-4,y-4);};
  ref(o.pYield,k.stencil,[6,4],"case yield");ref(o.pMin,k.warn,[2,3],"stable minimum");
  /* the scatter band (behind the traces), clipped to the plot, and the failed motors' crosses */
  if(o.band){const B=o.band,nb=B.t.length,area=(lo,hi,Y,col,al)=>{c.save();c.beginPath();c.rect(L,T,w,h);c.clip();c.globalAlpha=al;c.fillStyle=col;c.beginPath();
      for(let i=0;i<nb;i++){const x=X(B.t[i]),y=Y(hi[i]);i?c.lineTo(x,y):c.moveTo(x,y);}for(let i=nb-1;i>=0;i--)c.lineTo(X(B.t[i]),Y(lo[i]));c.closePath();c.fill();c.restore();};
    area(B.fLo,B.fHi,Yf,k.ink,0.13);area(B.pLo,B.pHi,Yp,k.pred,0.22);}
  if(o.fails&&o.fails.length){c.save();c.strokeStyle=k.stencil;c.lineWidth=1.75;
    for(const q of o.fails){const x=Math.min(L+w-4,X(q.t)),y=Math.max(T+4,Yp(q.p||0));c.beginPath();c.moveTo(x-3.5,y-3.5);c.lineTo(x+3.5,y+3.5);c.moveTo(x+3.5,y-3.5);c.lineTo(x-3.5,y+3.5);c.stroke();}c.restore();}
  const line=(arr,Y,col,wd)=>{c.strokeStyle=col;c.lineWidth=wd;c.lineJoin="round";c.beginPath();
    let lx=-9;for(let i=0;i<n;i++){const x=X(run.t[i]);if(i&&i<n-1&&x-lx<0.4)continue;lx=x;i?c.lineTo(x,Y(arr[i])):c.moveTo(x,Y(arr[i]));}c.stroke();};
  line(run.f,Yf,k.ink,1.5);line(run.p,Yp,k.pred,2.5);
  if(o.cursor!=null){const i=at(run,o.cursor),x=X(run.t[i]);c.strokeStyle=k.muted;c.lineWidth=1;c.setLineDash([3,3]);c.beginPath();c.moveTo(x,T);c.lineTo(x,T+h);c.stroke();c.setLineDash([]);
    for(const[y,col]of[[Yf(run.f[i]),k.ink],[Yp(run.p[i]),k.pred]]){c.fillStyle=k.card;c.beginPath();c.arc(x,y,4.5,0,7);c.fill();c.strokeStyle=col;c.lineWidth=2;c.stroke();}
    if(o.readout)readoutBox(c,k,o.readout,x,L,T,w,h,o.port);}
  return{L,w,tMax,T,h};
}
/* the cursor's readout: a card-coloured box beside the cursor (on whichever side has room), lines of mono text, and an
   optional end view of the port drawn by port(ctx, x, y, size) at its top */
function readoutBox(c,k,lines,x,L,T,w,h,port){
  c.save();c.font=`10px ${k.mono}`;
  const lh=13,pad=6,ps=port?Math.min(54,h*0.42):0,tw=Math.max(ps,...lines.map(s=>c.measureText(s).width)),bw=tw+pad*2,bh=lines.length*lh+pad*2+(ps?ps+4:0);
  const right=x+10+bw<=L+w,bx=right?x+10:Math.max(L,x-10-bw),by=T+4;
  c.globalAlpha=0.93;c.fillStyle=k.card;c.fillRect(bx,by,bw,bh);c.globalAlpha=1;c.strokeStyle=k.line;c.lineWidth=1;c.strokeRect(bx+.5,by+.5,bw-1,bh-1);
  if(ps)port(c,bx+pad+(tw-ps)/2,by+pad,ps,k);
  c.fillStyle=k.ink;c.textAlign="left";c.textBaseline="top";
  lines.forEach((s,j)=>c.fillText(s,bx+pad,by+pad+(ps?ps+4:0)+j*lh));c.restore();}
/* the sample index at or just after time t (binary search; run.t only rises) */
function at(run,t){let lo=0,hi=run.t.length-1;if(t<=run.t[0])return 0;if(t>=run.t[hi])return hi;
  while(hi-lo>1){const m=(lo+hi)>>1;if(run.t[m]<t)lo=m;else hi=m;}return hi;}
Object.assign(VIS,{curves,at,readoutBox});
