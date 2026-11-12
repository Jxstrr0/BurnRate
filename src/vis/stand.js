/* ===================== vis/stand.js: the test stand, a 2D placeholder (plan section 9.3; stage 7 makes it 3D) =====================
   stand(cv, o) draws Stand 3 side on: the salt flat and a distant blockhouse, the concrete thrust block, the load cell and
   the motor lying nozzle-right, then the plume, whose length and brightness follow thrust. Stateless: everything moves as
   a function of the times passed in, so the caller only sends numbers each frame.
   o: {h, len, dia (motor size, m), f (thrust now, 0 to 1 of the predicted peak), t (s since ignition, or <0 before),
       fail:{key, age (s since it happened)}, smoke (s since the burn ended, or <0), still (reduced motion: no flicker)}
   Failures: cato (flash, the case splits, debris), eject (the nozzle flies off), burnthrough (a side jet), hangfire (a
   thin wisp, no flame). The debris pattern comes from a fixed seeded stream, so it is the same every time. */
function stand(cv,o){
  const{c,W,H}=fit(cv,o.h||(w=>Math.min(w*0.42,190))),k=tokens();
  const ground=H*0.78,fail=o.fail||null,age=fail?fail.age:0;
  /* shake for a moment after a burst */
  let sx=0,sy=0;if(fail&&fail.key==="cato"&&age<0.6&&!o.still){const a=(1-age/0.6)*6;sx=Math.sin(age*90)*a;sy=Math.cos(age*70)*a*0.6;}
  c.save();c.translate(sx,sy);
  /* sky and salt flat */
  const sky=c.createLinearGradient(0,0,0,ground);sky.addColorStop(0,k.card);sky.addColorStop(1,k.line);c.fillStyle=sky;c.fillRect(-10,-10,W+20,ground+10);
  c.fillStyle=k.line;c.fillRect(-10,ground,W+20,H-ground+10);
  /* a low blockhouse on the horizon, and a mast */
  c.fillStyle=k.metalL;c.globalAlpha=0.45;c.fillRect(W*0.06,ground-16,W*0.14,16);c.fillRect(W*0.11,ground-24,W*0.04,8);c.fillRect(W*0.86,ground-46,2,46);c.globalAlpha=1;
  /* motor size on screen: the longest of the fleet fits 46% of the width */
  const len=o.len||0.2,dia=o.dia||0.03,s=Math.min(W*0.46/len,H*0.22/dia),mL=len*s,mD=Math.max(8,dia*s);
  const blockW=Math.max(26,W*0.08),bx=W*0.16,cellW=10,mx=bx+blockW+cellW,my=ground-14-mD/2,noz=mL*0.16;
  /* thrust block and pad */
  c.fillStyle=k.metalL;c.fillRect(bx-16,ground-8,mL+blockW+60,8);
  c.fillStyle=k.metal;c.fillRect(bx,my-mD*1.4,blockW,ground-8-(my-mD*1.4));
  c.fillStyle=k.hazard;for(let i=0;i<4;i++)c.fillRect(bx+2+i*blockW/4,my-mD*1.4,blockW/8,5);
  /* load cell */
  c.fillStyle=k.ink;c.fillRect(bx+blockW,my-mD*0.3,cellW,mD*0.6);
  const ex=mx+mL,ey=my;
  const flame=o.t>=0&&o.f>0.003&&!(fail&&(fail.key==="cato"||fail.key==="eject")&&age>0.02);
  /* the plume: a cone of light whose length and brightness follow thrust */
  if(flame){const fl=Math.max(0.02,Math.min(1.3,o.f)),flick=o.still?1:0.9+0.1*Math.sin(o.t*67)+0.05*Math.sin(o.t*131);
    const pl=(W-ex)*0.95*fl*flick,ph=mD*(0.45+0.6*fl);
    const g=c.createLinearGradient(ex,0,ex+pl,0);g.addColorStop(0,"rgba(255,248,225,0.98)");g.addColorStop(0.18,"rgba(255,196,90,0.92)");g.addColorStop(0.6,"rgba(228,87,46,0.55)");g.addColorStop(1,"rgba(228,87,46,0)");
    c.fillStyle=g;c.beginPath();c.moveTo(ex,ey-ph*0.35);c.quadraticCurveTo(ex+pl*0.35,ey-ph,ex+pl,ey);c.quadraticCurveTo(ex+pl*0.35,ey+ph,ex,ey+ph*0.35);c.closePath();c.fill();
    /* shock diamonds when the plume is strong */
    if(fl>0.6){c.fillStyle="rgba(255,250,235,0.55)";for(let i=1;i<=3;i++){const dx=ex+pl*0.12*i,r=ph*0.18*(1-i*0.2);c.beginPath();c.moveTo(dx-r,ey);c.lineTo(dx,ey-r*0.7);c.lineTo(dx+r,ey);c.lineTo(dx,ey+r*0.7);c.fill();}}}
  /* the motor: case, forward closure, nozzle. After a burst the case is split and the halves are thrown */
  const split=fail&&fail.key==="cato"?Math.min(1,age*3):0;
  c.fillStyle=k.metal;
  if(!split)c.fillRect(mx,my-mD/2,mL-noz,mD);
  else{const d=split*mD*1.6;c.save();c.translate(0,-d);c.rotate(-0.08*split);c.fillRect(mx,my-mD/2,mL-noz,mD*0.45);c.restore();
    c.save();c.translate(0,d*0.5);c.rotate(0.05*split);c.fillRect(mx,my+mD*0.05,mL-noz,mD*0.45);c.restore();}
  c.fillStyle=k.metalL;c.fillRect(mx-3,my-mD/2-2,4,mD+4);
  /* nozzle: flies away right after an ejection */
  let nx=mx+mL-noz,ny=my;if(fail&&fail.key==="eject"){const a=Math.min(age,2.5);nx+=a*W*0.55;ny+=-a*40+a*a*120;if(ny>ground-mD/2)ny=ground-mD/2;}
  if(!split||split<1){c.fillStyle=k.metalL;c.beginPath();c.moveTo(nx,ny-mD*0.42);c.lineTo(nx+noz,ny-mD*0.5);c.lineTo(nx+noz,ny+mD*0.5);c.lineTo(nx,ny+mD*0.42);c.closePath();c.fill();}
  /* the case's stencil band */
  if(!split){c.fillStyle=k.stencil;c.fillRect(mx+(mL-noz)*0.12,my-mD/2,Math.max(3,mL*0.03),mD);}
  /* burn-through: a side jet from the middle of the case */
  if(fail&&fail.key==="burnthrough"&&age<1.2){const a=Math.max(0,1-age/1.2),jx=mx+(mL-noz)*0.55,jl=mD*5*a;
    const g=c.createLinearGradient(0,my-mD/2,0,my-mD/2-jl);g.addColorStop(0,"rgba(255,220,140,0.95)");g.addColorStop(1,"rgba(228,87,46,0)");
    c.fillStyle=g;c.beginPath();c.moveTo(jx-mD*0.15,my-mD/2);c.lineTo(jx-mD*0.5,my-mD/2-jl);c.lineTo(jx+mD*0.5,my-mD/2-jl);c.lineTo(jx+mD*0.15,my-mD/2);c.fill();}
  /* smoke: grey puffs drifting up and right after the burn, after a failure, or from a hang fire */
  const smokeT=o.smoke>=0?o.smoke:(fail&&fail.key==="hangfire"?Math.max(0,o.t):-1);
  if(smokeT>=0){for(let i=0;i<9;i++){const a=smokeT-i*0.18;if(a<0)continue;const r=mD*(0.4+a*0.9),x=ex+a*W*0.05+i*4,y=ey-a*22-i*2;
    c.fillStyle=`rgba(120,118,112,${Math.max(0,0.32-a*0.06)})`;c.beginPath();c.arc(x,y,r,0,7);c.fill();}}
  /* debris after a burst: a fixed pattern of fragments on ballistic arcs */
  if(split){const rng=BURN_SIM.makeRng("debris"),a=Math.min(age,2.2);c.fillStyle=k.ink;
    for(let i=0;i<14;i++){const vx=rng.float(-260,260),vy=rng.float(-320,-80),sz=rng.float(2,5),x=mx+mL*rng.float(0.2,0.8)+vx*a,y=Math.min(ground-2,my+vy*a+260*a*a);c.fillRect(x,y,sz,sz);}}
  c.restore();
  /* the flash: a white wash that fades */
  if(fail&&fail.key==="cato"&&age<0.5){c.fillStyle=`rgba(255,250,235,${(0.9*(1-age/0.5)).toFixed(3)})`;c.fillRect(0,0,W,H);}
}
Object.assign(VIS,{stand});
