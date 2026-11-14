/* ===================== vis/strip.js: the firing's strip chart (plan sections 4 and 9.3) =====================
   strip(cv, o) draws two panels on one time axis: chamber pressure on top, thrust below. The prediction (blue, thin) is
   drawn whole; the measured trace (red, heavy) is drawn up to o.upto seconds, so the firing screen can reveal it live and
   the report can show it all. The scales come from the prediction and the case rating, never from the measured peak, so
   a burst runs off the top of the chart instead of giving itself away before it happens.
   o: {h, pred:{t,p,f}, meas:{t,p,f}, upto, pLine (Pa, the case's burst rating), mark:{t,label} (the failure moment),
       events:[{t,label}] (a void, a crack), now (true: draw a pen dot at the head of the measured trace), others (more measured
       traces, faint), fix ({W, dpr}: a set size, for the share card), cursor (s: a tapped moment, a line through both panels
       with a dot on each trace), readout (lines of text for it, in a box)}. Returns the plot's {L, w, tMax}, so a tap can
       be turned into a time. */
function strip(cv,o){
  const{c,W,H}=fit(cv,o.h||(w=>Math.min(w*0.62,300)),o.fix),k=tokens();
  const P=o.pred,M=o.meas,nP=P.t.length,nM=M.t.length;
  const L=38,R=10,T=8,B=20,gap=16,hP=Math.round((H-T-B-gap)*0.58),hF=H-T-B-gap-hP,w=W-L-R;
  const tMax=Math.max(P.t[nP-1],M.t[nM-1])*1.03||1,X=t=>L+w*Math.min(1,t/tMax);
  let pPk=0,fPk=0;for(let i=0;i<nP;i++){pPk=Math.max(pPk,P.p[i]);fPk=Math.max(fPk,P.f[i]);}
  let pTop=pPk*1.3;if(o.pLine>0&&o.pLine<pTop*1.7)pTop=Math.max(pTop,o.pLine*1.08);
  const pMax=nice(pTop/1e6),fMax=nice(fPk*1.3||1);
  const panels=[{y0:T,h:hP,max:pMax,unit:"MPa",col:k.pred,get:(s,i)=>s.p[i]/1e6},{y0:T+hP+gap,h:hF,max:fMax,unit:"thrust N",col:k.ink,get:(s,i)=>s.f[i]}];
  c.font=`10px ${k.mono}`;c.lineWidth=1;
  for(const pn of panels){
    const Y=v=>pn.y0+pn.h-pn.h*v/pn.max;
    c.textBaseline="middle";
    const nd=divs(pn.max,pn.h<=90);
    for(let i=0;i<=nd;i++){const v=pn.max*i/nd,y=Math.round(Y(v))+.5;c.strokeStyle=k.line;c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();
      c.fillStyle=k.muted;c.textAlign="right";c.fillText(fmtAxis(v,pn.max),L-5,y);}
    c.font=`600 10px ${k.mono}`;c.textBaseline="alphabetic";c.textAlign="left";c.fillStyle=k.muted;c.fillText(pn.unit,L+4,pn.y0+10);c.font=`10px ${k.mono}`;
    pn.Y=Y;}
  /* the case's burst rating on the pressure panel */
  if(o.pLine>0&&o.pLine/1e6<=pMax){const y=panels[0].Y(o.pLine/1e6);c.save();c.setLineDash([6,4]);c.strokeStyle=k.stencil;c.lineWidth=1.25;c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();c.restore();
    c.fillStyle=k.stencil;c.textAlign="right";c.textBaseline="alphabetic";c.fillText("case bursts",L+w-4,y-4);}
  /* time axis */
  const tStep=nice(tMax/5);c.fillStyle=k.muted;c.textAlign="center";c.textBaseline="alphabetic";
  for(let t=0;t<=tMax+1e-9;t+=tStep)c.fillText(t.toFixed(tStep<1?1:0)+(t?"":" s"),X(t),H-5);
  /* events and the failure mark */
  const vline=(t,col,label,dash)=>{const x=Math.round(X(t))+.5;c.save();c.setLineDash(dash);c.strokeStyle=col;c.lineWidth=1.25;c.beginPath();c.moveTo(x,T);c.lineTo(x,H-B);c.stroke();c.restore();
    if(label){c.fillStyle=col;c.font=`600 10px ${k.mono}`;c.textAlign=x>L+w*0.7?"right":"left";c.textBaseline="alphabetic";c.fillText(label,x+(x>L+w*0.7?-4:4),T+hP+gap-4);c.font=`10px ${k.mono}`;}};
  const upto=o.upto==null?Infinity:o.upto;
  for(const e of o.events||[])if(e.t<=upto)vline(e.t,k.warn,e.label,[2,3]);
  if(o.mark&&o.mark.t<=upto)vline(o.mark.t,k.stencil,o.mark.label,[]);
  /* traces, clipped to each panel so a burst runs off the top */
  const trace=(s,n,pn,col,wd,lim)=>{c.save();c.beginPath();c.rect(L,pn.y0-1,w,pn.h+2);c.clip();c.strokeStyle=col;c.lineWidth=wd;c.lineJoin="round";c.beginPath();
    let lx=-9,last=-1;for(let i=0;i<n&&s.t[i]<=lim;i++){const x=X(s.t[i]);if(i&&x-lx<0.5&&i<n-1)continue;lx=x;last=i;const y=pn.Y(pn.get(s,i));i?c.lineTo(x,y):c.moveTo(x,y);}
    c.stroke();c.restore();return last;};
  for(const pn of panels){
    /* o.others: more measured traces (a tender's lot), drawn faint under the main one */
    if(o.others){c.globalAlpha=0.3;for(const s of o.others)trace(s,s.t.length,pn,k.meas,1.2,upto);c.globalAlpha=1;}
    c.globalAlpha=0.85;trace(P,nP,pn,k.pred,1.5,Infinity);c.globalAlpha=1;
    const last=trace(M,nM,pn,k.meas,2.4,upto);
    if(o.now&&last>=0){const x=X(M.t[last]),y=Math.max(pn.y0,pn.Y(pn.get(M,last)));c.fillStyle=k.meas;c.beginPath();c.arc(x,y,3.5,0,7);c.fill();}}
  /* the tapped moment: a line, a dot on each trace (clamped into its panel), and the readout */
  if(o.cursor!=null){const t=o.cursor,x=X(t);c.save();c.strokeStyle=k.muted;c.lineWidth=1;c.setLineDash([3,3]);c.beginPath();c.moveTo(x,T);c.lineTo(x,H-B);c.stroke();c.restore();
    for(const pn of panels)for(const[s,col]of[[P,k.pred],[M,k.meas]]){if(t>s.t[s.t.length-1])continue;const i=at(s,t),y=Math.max(pn.y0,Math.min(pn.y0+pn.h,pn.Y(pn.get(s,i))));
      c.fillStyle=k.card;c.beginPath();c.arc(x,y,4,0,7);c.fill();c.strokeStyle=col;c.lineWidth=2;c.stroke();}
    if(o.readout)readoutBox(c,k,o.readout,x,L,T,w,H-T-B,null);}
  return{L,w,tMax};
}
Object.assign(VIS,{strip});
