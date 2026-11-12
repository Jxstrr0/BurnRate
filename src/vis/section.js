/* ===================== vis/section.js: the motor cross-section (plan section 9.2) =====================
   section(cv, motor, x, info) draws the motor cut along its axis (forward closure on the left, nozzle on the right) with
   the grain burned back by web distance x (m), and under it an end-on view of the aft segment's port. info: lines of text
   drawn beside the end view (time, pressure...). Drawn to scale; burning surfaces glow. Stage 5 swaps the analytic
   segments for the level-set cross-section. h(width) -> height, optional. */
function section(cv,m,x,info,h){
  const{c,W,H}=fit(cv,h||(w=>Math.min(w*0.62,300))),k=tokens(),T=BURN_SIM.TUNING;
  const G=m.grain,id=m.id,R0=id/2+m.wall,clThk=T.closureThk*id,len=m.length,pad=10;
  /* side cut: scale to fit the width, and at most 55% of the height */
  const sideH=Math.min(H*0.5,(W-2*pad)*2*R0/len),s=Math.min((W-2*pad)/len,(sideH-4)/(2*R0));
  const ox=(W-len*s)/2,cy=pad+R0*s+2,X=v=>ox+v*s,Y=r=>r*s;
  const rect=(x0,x1,r0,r1,col)=>{c.fillStyle=col;c.fillRect(X(x0),cy-Y(r1),(x1-x0)*s,Y(r1-r0));c.fillRect(X(x0),cy+Y(r0),(x1-x0)*s,Y(r1-r0));};
  /* case and liner */
  rect(0,m.caseLen,id/2,R0,k.metal);
  rect(clThk,m.caseLen-clThk,m.od/2,id/2,k.liner);
  /* forward closure */
  rect(0,clThk,0,id/2,k.metalL);
  /* nozzle: the aft closure turned into a converging-diverging bore */
  const xa=m.caseLen-clThk,conv=T.nozzleLen*id*0.6,xt=xa+conv,xe=len,rt=m.rt0,re=m.re,rin=Math.max(rt*1.6,m.od/2*0.85);
  const rOutEnd=Math.max(re+m.wall*1.5,rt+m.wall*2);
  for(const sg of[-1,1]){c.fillStyle=k.metalL;c.beginPath();
    c.moveTo(X(xa),cy-sg*Y(id/2));c.lineTo(X(m.caseLen),cy-sg*Y(id/2));c.lineTo(X(m.caseLen),cy-sg*Y(R0));c.lineTo(X(xe),cy-sg*Y(rOutEnd));
    c.lineTo(X(xe),cy-sg*Y(re));c.lineTo(X(xt),cy-sg*Y(rt));c.lineTo(X(xa),cy-sg*Y(rin));c.closePath();c.fill();}
  /* grain segments, burned back by x */
  let xs=clThk+T.headSpace*m.od;const gap=T.segGap/1000;
  c.lineWidth=2;
  for(const g of G.segs){
    const L=g.L;
    if(x<g.web){
      let a0,a1,r0;
      if(g.kind==="bates"){a0=xs+x;a1=xs+L-x;r0=g.rc+x;}
      else if(g.kind==="tube"){a0=xs;a1=xs+L;r0=g.rc+x;}
      else{a0=xs;a1=xs+L-x;r0=0;}
      rect(a0,a1,r0,g.R,k.prop);
      /* the burning surfaces: the port wall, and the ends of a BATES segment or the face of an end burner */
      c.strokeStyle=k.burn;c.beginPath();
      for(const sg of[-1,1]){
        if(r0>0){c.moveTo(X(a0),cy+sg*Y(r0));c.lineTo(X(a1),cy+sg*Y(r0));}
        if(g.kind!=="tube"){c.moveTo(X(a1),cy+sg*Y(r0));c.lineTo(X(a1),cy+sg*Y(g.R));}
        if(g.kind==="bates"){c.moveTo(X(a0),cy+sg*Y(r0));c.lineTo(X(a0),cy+sg*Y(g.R));}}
      c.stroke();}
    xs+=L+gap;}
  /* the axis */
  c.strokeStyle=k.muted;c.lineWidth=1;c.setLineDash([8,3,2,3]);c.beginPath();c.moveTo(X(0)-4,cy);c.lineTo(X(len)+4,cy);c.stroke();c.setLineDash([]);
  /* end view of the aft segment (looking forward from the nozzle) */
  const top=cy+Y(R0)+12,dE=Math.max(36,Math.min(H-top-4,W*0.4)),cx=pad+dE/2,cyE=top+dE/2,sE=dE/2/R0,g=G.segs[G.segs.length-1];
  const disc=(r,col)=>{c.fillStyle=col;c.beginPath();c.arc(cx,cyE,Math.max(0,r*sE),0,7);c.fill();};
  disc(R0,k.metal);disc(id/2,k.liner);disc(m.od/2,k.card);
  if(x<g.web){
    disc(g.R,g.kind==="end"?k.burn:k.prop);
    if(g.kind!=="end"){const r=g.rc+x;disc(r,k.card);c.strokeStyle=k.burn;c.lineWidth=2;c.beginPath();c.arc(cx,cyE,r*sE,0,7);c.stroke();}}
  /* the readouts beside the end view, in columns of up to three lines */
  c.textAlign="left";c.textBaseline="top";
  const lines=info||[],rows=Math.min(3,lines.length),lh=Math.min(17,(H-top)/rows),colW=Math.max(96,(W-pad-dE-14)/2);
  lines.forEach((ln,i)=>{const col=Math.floor(i/rows),row=i%rows;c.font=i?`11px ${k.mono}`:`600 12px ${k.mono}`;c.fillStyle=i?k.muted:k.ink;
    c.fillText(ln,pad+dE+14+col*colW,top+4+row*lh);});
}
Object.assign(VIS,{section});
