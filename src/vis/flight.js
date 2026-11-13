/* ===================== vis/flight.js: flight tests (stage 6; plan section 6.10) =====================
   altitude(cv, o) charts height against time: the predicted flight (blue, no wind) whole, the real one (red) up to
   o.upto seconds, each apogee marked, and an X where a rocket was lost.
     o: {h, pred:{t,h}, meas:{t,h}, upto, lost:{t,h} (optional), apoP, apoM (m, the marks' labels)}
   sky(cv, o) is the launch seen from the blockhouse: the salt flat, the rail, and the rocket's real path drawn to scale
   (height and drift on the same scale, so the wind's lean shows), the rocket at time o.t with its flame while the motor
   burns. Stateless like vis/stand.js: everything is a function of the numbers passed in.
     o: {h, path:{t,h,x}, t (s since ignition, <0 before), tBurn (s), apogee (m), lost (t of a destroyed motor, or null),
         still (reduced motion: no flicker)} */
function altitude(cv,o){
  const{c,W,H}=fit(cv,o.h||(w=>Math.min(w*0.55,260))),k=tokens();
  const P=o.pred,M=o.meas,L=46,R=12,T=12,B=22,w=W-L-R,h=H-T-B;
  const last=s=>s&&s.t.length?s.t[s.t.length-1]:0,peak=s=>s?Math.max(0,...s.h):0;
  const tMax=Math.max(last(P),last(M))*1.04||1,hMax=nice(Math.max(peak(P),peak(M))*1.1||1),nd=divs(hMax);
  const X=t=>L+w*Math.min(1,t/tMax),Y=v=>T+h-h*Math.max(0,v)/hMax;
  c.font=`10px ${k.mono}`;c.lineWidth=1;c.textBaseline="middle";
  for(let i=0;i<=nd;i++){const v=hMax*i/nd,y=Math.round(Y(v))+.5;c.strokeStyle=k.line;c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();
    c.fillStyle=k.muted;c.textAlign="right";c.fillText(v>=10000?(v/1000).toFixed(0)+"k":String(Math.round(v)),L-5,y);}
  c.font=`600 10px ${k.mono}`;c.textBaseline="alphabetic";c.textAlign="left";c.fillStyle=k.muted;c.fillText("height m",L+4,T+10);c.font=`10px ${k.mono}`;
  const tStep=nice(tMax/5);c.textAlign="center";
  for(let t=0;t<=tMax+1e-9;t+=tStep)c.fillText(t.toFixed(tStep<1?1:0)+(t?"":" s"),X(t),H-5);
  const trace=(s,col,wd,lim)=>{if(!s)return -1;c.strokeStyle=col;c.lineWidth=wd;c.lineJoin="round";c.beginPath();let n=-1;
    for(let i=0;i<s.t.length&&s.t[i]<=lim;i++){const x=X(s.t[i]),y=Y(s.h[i]);i?c.lineTo(x,y):c.moveTo(x,y);n=i;}c.stroke();return n;};
  const upto=o.upto==null?Infinity:o.upto;
  c.globalAlpha=0.85;trace(P,k.pred,1.5,Infinity);c.globalAlpha=1;
  const n=trace(M,k.meas,2.4,upto);
  /* apogee marks: a tick and the height, the prediction's above its peak, the real one beside its own */
  const mark=(s,col,label,below)=>{if(!s||!s.t.length)return;let j=0;for(let i=1;i<s.h.length;i++)if(s.h[i]>s.h[j])j=i;
    if(s.t[j]>upto&&s===M)return;const x=X(s.t[j]),y=Y(s.h[j]);c.fillStyle=col;c.beginPath();c.arc(x,y,3.5,0,7);c.fill();
    c.font=`600 10px ${k.mono}`;c.textAlign=x>L+w*0.75?"right":"left";c.textBaseline=below?"top":"alphabetic";
    c.fillText(label,x+(x>L+w*0.75?-6:6),y+(below?5:-5));c.font=`10px ${k.mono}`;c.textBaseline="alphabetic";};
  if(o.apoP!=null)mark(P,k.pred,`${Math.round(o.apoP)} m`,false);
  if(o.lost){if(o.lost.t<=upto){const x=X(o.lost.t),y=Y(o.lost.h);c.strokeStyle=k.stencil;c.lineWidth=2.5;c.beginPath();
      c.moveTo(x-5,y-5);c.lineTo(x+5,y+5);c.moveTo(x+5,y-5);c.lineTo(x-5,y+5);c.stroke();
      c.fillStyle=k.stencil;c.font=`600 10px ${k.mono}`;c.textAlign="left";c.fillText("lost",x+8,y-6);c.font=`10px ${k.mono}`;}}
  else if(o.apoM!=null)mark(M,k.meas,`${Math.round(o.apoM)} m`,true);
  if(o.now&&n>=0){c.fillStyle=k.meas;c.beginPath();c.arc(X(M.t[n]),Y(M.h[n]),3.5,0,7);c.fill();}
}
/* the rocket's position at time t along a sampled path (straight lines between samples) */
function pathAt(p,t){const n=p.t.length;if(!n)return{h:0,x:0,i:0};if(t<=p.t[0])return{h:p.h[0],x:p.x[0],i:0};
  for(let i=1;i<n;i++)if(p.t[i]>=t){const u=(t-p.t[i-1])/((p.t[i]-p.t[i-1])||1);return{h:p.h[i-1]+(p.h[i]-p.h[i-1])*u,x:p.x[i-1]+(p.x[i]-p.x[i-1])*u,i};}
  return{h:p.h[n-1],x:p.x[n-1],i:n-1};}
function sky(cv,o){
  const{c,W,H}=fit(cv,o.h||(w=>Math.min(w*0.62,280))),k=tokens();
  const P=o.path,ground=H-22,top=16,t=o.t,lost=o.lost!=null&&t>=o.lost;
  /* the scale: the whole flight fits, height and drift alike (metres per pixel the same both ways) */
  const hTop=Math.max(o.apogee||1,...P.h)*1.12||1,xs=P.x.length?[Math.min(0,...P.x),Math.max(0,...P.x)]:[0,0];
  const s=Math.min((ground-top)/hTop,(W-40)/Math.max(1,xs[1]-xs[0])),x0=W/2-((xs[0]+xs[1])/2)*s;
  const X=x=>x0+x*s,Y=v=>ground-Math.max(0,v)*s;
  const g=c.createLinearGradient(0,0,0,ground);g.addColorStop(0,k.card);g.addColorStop(1,k.line);c.fillStyle=g;c.fillRect(0,0,W,ground);
  c.fillStyle=k.line;c.fillRect(0,ground,W,H-ground);
  /* height gridlines on the left */
  const step=nice(hTop/3.2),nd=Math.floor(hTop/step);c.font=`10px ${k.mono}`;c.textBaseline="middle";c.textAlign="left";
  for(let i=1;i<=nd;i++){const v=step*i,y=Math.round(Y(v))+.5;if(y<top-4)continue;c.strokeStyle=k.line;c.globalAlpha=0.7;c.setLineDash([2,4]);c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();c.setLineDash([]);c.globalAlpha=1;
    c.fillStyle=k.muted;c.fillText(v>=10000?(v/1000).toFixed(0)+" km":Math.round(v)+" m",4,y-7);}
  /* the blockhouse far off, the rail at the launch point */
  c.fillStyle=k.metalL;c.globalAlpha=0.45;c.fillRect(W*0.06,ground-14,W*0.12,14);c.globalAlpha=1;
  const rx=X(0);c.strokeStyle=k.metal;c.lineWidth=2;c.beginPath();c.moveTo(rx,ground);c.lineTo(rx,ground-18);c.stroke();
  c.fillStyle=k.metal;c.fillRect(rx-7,ground-3,14,3);
  if(t<0){c.fillStyle=k.ink;c.fillRect(rx-1.5,ground-20,3,14);return;}
  /* the path flown so far, then the rocket */
  const here=pathAt(P,t);
  c.strokeStyle=k.meas;c.lineWidth=2;c.lineJoin="round";c.beginPath();c.moveTo(X(P.x[0]||0),Y(P.h[0]||0));
  for(let i=1;i<P.t.length&&P.t[i]<=t;i++)c.lineTo(X(P.x[i]),Y(P.h[i]));c.lineTo(X(here.x),Y(here.h));c.stroke();
  const hx=X(here.x),hy=Y(here.h);
  if(lost){const age=t-o.lost;c.fillStyle=k.burn;c.globalAlpha=Math.max(0,1-age*1.5);c.beginPath();c.arc(hx,hy,6+age*20,0,7);c.fill();c.globalAlpha=1;
    c.fillStyle=k.ink;for(let j=0;j<6;j++){const a=j*1.05+0.4,r=4+age*26;c.fillRect(hx+Math.cos(a)*r,hy+Math.sin(a)*r+age*age*30,3,3);}return;}
  /* the rocket points along its path (straight up on the rail) */
  const j=Math.max(1,here.i),dx=(P.x[j]-P.x[j-1])||0,dh=(P.h[j]-P.h[j-1])||1,ang=Math.atan2(dx*s,dh*s);
  c.save();c.translate(hx,hy);c.rotate(ang);
  if(t<o.tBurn){const fl=o.still?1:0.8+0.4*Math.abs(Math.sin(t*47));c.fillStyle=k.burn;c.beginPath();c.moveTo(-3,6);c.lineTo(3,6);c.lineTo(0,6+12*fl);c.closePath();c.fill();
    c.fillStyle=k.hazard;c.beginPath();c.moveTo(-1.5,6);c.lineTo(1.5,6);c.lineTo(0,6+6*fl);c.closePath();c.fill();}
  c.fillStyle=k.ink;c.beginPath();c.moveTo(0,-10);c.lineTo(3,-4);c.lineTo(3,6);c.lineTo(-3,6);c.lineTo(-3,-4);c.closePath();c.fill();
  c.fillRect(-6,3,12,3);c.restore();
}
Object.assign(VIS,{altitude,sky,pathAt});
