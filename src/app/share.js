/* ===================== app/share.js: the motor data sheet, as a picture (stage 8, plan section 10) =====================
   A passed job's report has a "Data sheet" button. It draws a 1080 x 1350 picture of the motor's certificate: the range
   header and report number, the grade stamp, the designation, the client and job, the strip chart (measured red over
   predicted blue), six numbers with the prediction under each, the spec lines with their ticks, the RSO's line and the
   game's address. The phone's share sheet sends it as a PNG (navigator.share with a file), or "Save picture" downloads it.
   Everything is drawn here on a canvas, in the page's own colours and fonts; nothing leaves the phone unless the player
   shares it. The card is laid out at 540 x 675 and drawn at twice that size. */
const SHARE_W=540,SHARE_H=675,SHARE_DPR=2;
let SHARE_PNG=null;   // {blob, url, name} of the last card drawn
/* what the card shows: the report's motor (a lot's selected motor), and the lot's verdict when there is one */
function shareInfo(L){
  /* a lot's sheet shows the selected motor if it passed, else the first motor that did */
  const LT=L.lot?Object.assign({},L.lot,{sel:L.lot.gl.grades[L.lot.sel].pass?L.lot.sel:Math.max(0,L.lot.gl.grades.findIndex(x=>x.pass))}):null;
  const f=LT?LT.fires[LT.sel]:L.f,g=LT?LT.gl.grades[LT.sel]:L.g,c=L.c;
  const letter=LT?LT.gl.letter:g.letter,stamp=LT?`Lot accepted · ${letter}`:`Pass · ${letter}`;
  const key=LT?(letter==="A"&&!LT.gl.fails?"lotA":letter):(f.flight&&letter==="A"?"flyA":letter);
  return{f,g,c,LT,stamp,key,no:reportNo(L),tG:L.tGrain??BURN_SIM.SLOTS[L.slot].tGrain};}
/* can this report have a data sheet? a passed job with a motor that came home */
const canShareSheet=L=>!!(L&&L.c&&(L.lot?L.lot.gl.pass:L.g.pass)&&!(L.f.flight&&L.f.flight.lost));
/* lines of text no wider than w */
function wrapText(c,text,w){const out=[];let line="";
  for(const word of String(text).split(" ")){const t=line?line+" "+word:word;if(line&&c.measureText(t).width>w){out.push(line);line=word;}else line=t;}
  if(line)out.push(line);return out;}
async function drawShareCard(L){
  const I=shareInfo(L),{f,c,LT}=I,ms=f.meas.sum,ps=f.pred.sum,m=f.motor,k=BURN_VIS.tokens(),s=getComputedStyle(document.documentElement);
  const tok=n=>s.getPropertyValue(n).trim(),ui=tok("--ui"),sign=tok("--sign"),mono=k.mono,good=tok("--good"),ground=tok("--ground"),stateD=tok("--stateD");
  try{await Promise.all([`20px ${sign}`,`20px ${mono}`,`600 20px ${mono}`,`20px ${ui}`,`600 20px ${ui}`].map(x=>document.fonts.load(x)));}catch(e){}
  const cv=document.createElement("canvas");cv.width=SHARE_W*SHARE_DPR;cv.height=SHARE_H*SHARE_DPR;
  const x=cv.getContext("2d");x.scale(SHARE_DPR,SHARE_DPR);
  const text=(t,px,py,font,col,align)=>{x.font=font;x.fillStyle=col;x.textAlign=align||"left";x.textBaseline="alphabetic";x.fillText(t,px,py);};
  /* the ground, the sheet and the hazard stripe along its top */
  x.fillStyle=ground;x.fillRect(0,0,SHARE_W,SHARE_H);
  const X0=18,Y0=18,W=SHARE_W-36,H=SHARE_H-36,P=24;
  x.fillStyle=k.card;x.fillRect(X0,Y0,W,H);x.strokeStyle=k.line;x.lineWidth=1;x.strokeRect(X0+.5,Y0+.5,W-1,H-1);
  x.save();x.beginPath();x.rect(X0,Y0,W,9);x.clip();x.fillStyle=k.ink;x.fillRect(X0,Y0,W,9);x.fillStyle=k.hazard;
  for(let i=-20;i<W+20;i+=20){x.beginPath();x.moveTo(X0+i,Y0+9);x.lineTo(X0+i+10,Y0+9);x.lineTo(X0+i+19,Y0);x.lineTo(X0+i+9,Y0);x.fill();}x.restore();
  /* the header: where, what, which report; the stamp on the right */
  const L0=X0+P,R0=X0+W-P;
  const where=f.flight?"Launch rail":BURN_SIM.STANDS[c.stand].name;
  text(`AQSOR RANGE · SITE 41 · ${where.toUpperCase()}`,L0,Y0+38,`9px ${mono}`,k.muted);
  text("Motor data sheet",L0,Y0+68,`26px ${sign}`,k.ink);
  text(`${f.flight?"Flight":"Range"} report No. ${I.no} · ${BURN_SIM.SLOTS[L.slot].name.toLowerCase()} · ${degC(I.tG)} grain`,L0,Y0+86,`9px ${mono}`,k.muted);
  /* the stamp, shrunk to fit beside the title (a lot's is longer) */
  const st=I.stamp.toUpperCase();x.font=`20px ${sign}`;const fs=Math.min(20,20*150/x.measureText(st).width);x.font=`${fs.toFixed(1)}px ${sign}`;const sw=x.measureText(st).width+22;
  x.save();x.translate(R0-sw/2-6,Y0+56);x.rotate(-4*Math.PI/180);
  x.strokeStyle=good;x.lineWidth=3;x.strokeRect(-sw/2,-fs*0.85,sw,fs*1.7);x.fillStyle=good;x.textAlign="center";x.textBaseline="middle";x.fillText(st,0,1);x.restore();
  /* the designation, big, with the client and the job beside it */
  const yD=Y0+142;
  text(ms.designation,L0,yD,`600 48px ${mono}`,k.ink);
  const cx=L0+x.measureText(ms.designation).width+18,cw=R0-cx;
  text(c.client,cx,yD-26,`12px ${ui}`,k.muted);
  x.font=`600 16px ${ui}`;wrapText(x,c.title,cw).slice(0,2).forEach((t,i)=>text(t,cx,yD-6+i*18,`600 16px ${ui}`,k.ink));
  /* laid out from the foot up: the RSO's line, the spec, the numbers, the key; the chart takes the height that's left */
  const checks=(LT?BURN_SIM.specCheck(c.spec,ms,m):(I.g.checks&&I.g.checks.length?I.g.checks:BURN_SIM.specCheck(c.spec,ms,m))).slice(0,4);
  x.font=`italic 12px ${ui}`;const q=wrapText(x,`“${rsoLine(I.key,L.n)}”`,R0-L0-110).slice(0,2);
  const yQ=Y0+H-54,quoteTop=yQ-(q.length-1)*15-12,rows=Math.ceil(checks.length/2);
  const specTop=quoteTop-16-(22+rows*18),numsTop=specTop-128,yKey=numsTop-14,chTop=yD+20,chH=Math.max(120,yKey-18-chTop);
  /* the strip chart, drawn by the report's own chart code at a set size */
  const sc=document.createElement("canvas"),chW=W-2*P;
  BURN_VIS.strip(sc,{h:()=>chH,fix:{W:chW,dpr:SHARE_DPR},pred:f.plog,meas:f.log,pLine:f.limits.pBurst,events:[],others:LT?LT.fires.filter(z=>z!==f).map(z=>z.log):null});
  x.drawImage(sc,L0,chTop,chW,chH);
  /* the key */
  x.lineWidth=2;x.strokeStyle=k.pred;x.beginPath();x.moveTo(L0,yKey-4);x.lineTo(L0+18,yKey-4);x.stroke();
  text(`Predicted at ${degC(I.tG)}`,L0+24,yKey,`10px ${ui}`,k.muted);
  const kx=L0+24+x.measureText(`Predicted at ${degC(I.tG)}`).width+16;
  x.lineWidth=3;x.strokeStyle=k.meas;x.beginPath();x.moveTo(kx,yKey-4);x.lineTo(kx+18,yKey-4);x.stroke();
  text(LT?`Measured, motor ${LT.sel+1} of ${LT.fires.length}`:"Measured",kx+24,yKey,`10px ${ui}`,k.muted);
  const rule=yy=>{x.strokeStyle=k.line;x.lineWidth=1;x.beginPath();x.moveTo(L0,yy+.5);x.lineTo(R0,yy+.5);x.stroke();};
  /* six numbers: measured, big; predicted, small and blue */
  rule(numsTop);
  const nums=[["Total impulse",ms.I.toFixed(1),ps.I.toFixed(1),"N·s"],["Average thrust",ms.Fav.toFixed(0),ps.Fav.toFixed(0),"N"],
    ["Peak pressure",(ms.Pmax/1e6).toFixed(2),(ps.Pmax/1e6).toFixed(2),"MPa"],["Burn time",ms.tb.toFixed(2),ps.tb.toFixed(2),"s"],
    ["Specific impulse",ms.Isp.toFixed(0),ps.Isp.toFixed(0),"s"],m.mass.total<1?["Loaded mass",(m.mass.total*1000).toFixed(0),null,"g"]:["Loaded mass",m.mass.total.toFixed(2),null,"kg"]];
  const colW=(R0-L0)/3;
  nums.forEach(([lab,v,p,u],i)=>{const nx=L0+(i%3)*colW,ny=numsTop+20+Math.floor(i/3)*52;
    text(lab,nx,ny,`10px ${ui}`,k.muted);
    text(v,nx,ny+22,`600 19px ${mono}`,k.ink);text(u,nx+x.measureText(v).width+4,ny+22,`10px ${mono}`,k.muted);
    if(p!=null)text(`pred ${p}`,nx,ny+35,`9px ${mono}`,k.pred);});
  /* the client's spec, two to a row: the band and what the motor did */
  rule(specTop);
  text(LT?`THE CLIENT'S SPEC · LOT OF ${LT.fires.length}, ${LT.fires.length-LT.gl.fails} PASSED`:"THE CLIENT'S SPEC",L0,specTop+18,`600 9px ${mono}`,k.muted);
  const half=(R0-L0)/2;
  checks.forEach((ck,i)=>{const sx=L0+(i%2)*half,sy=specTop+38+Math.floor(i/2)*18,right=sx+half-(i%2?0:14);
    text(ck.ok?"✓":"✗",sx,sy,`600 11px ${mono}`,ck.ok?good:k.stencil);
    text(ck.info.name,sx+15,sy,`11px ${ui}`,k.ink);const nw=x.measureText(ck.info.name).width;
    let r=`${bandText(ck)} · ${fmtSpec(ck.k,ck.v)}`;x.font=`9px ${mono}`;if(sx+15+nw+8+x.measureText(r).width>right)r=fmtSpec(ck.k,ck.v);
    text(r,right,sy,`9px ${mono}`,k.muted,"right");});
  /* the RSO signs it; the game's name and address at the foot */
  q.forEach((t,i)=>text(t,L0,yQ-(q.length-1-i)*15,`12px ${ui}`,k.ink));
  text("R. Abenov, RSO",R0,yQ,`600 11px ${ui}`,stateD,"right");
  rule(Y0+H-40);
  text("BURN RATE",L0,Y0+H-16,`18px ${sign}`,k.ink);
  text("burnrate.longlight.games",R0,Y0+H-17,`10px ${mono}`,k.muted,"right");
  const blob=await new Promise(r=>cv.toBlob(r,"image/png"));
  return{blob,name:`burnrate-${ms.designation}-${I.no}.png`.replace(/[^\w.-]+/g,"-")};}
/* the sheet: the picture, Share (when the phone can share files) and Save picture */
async function openShareSheet(){
  const L=GAME.last;if(!canShareSheet(L))return;
  openSheet("Data sheet",`<div class="sh-wrap"><p class="hint" id="shWait">Drawing the data sheet…</p><img id="shImg" class="sh-img" alt="" hidden></div>
    <div class="row"><button type="button" class="btn pri" id="shShare" hidden>Share</button><button type="button" class="btn" id="shSave" disabled>Save picture</button></div>
    <p class="hint">A picture of this motor's certificate, to send to anyone. Nothing is sent unless you share it.</p>`);
  let out;try{out=await drawShareCard(L);}catch(e){console.error(e);out=null;}
  if(!out||!out.blob){const w=$("shWait");if(w)w.textContent="This phone couldn't draw the picture.";return;}
  if(SHARE_PNG)URL.revokeObjectURL(SHARE_PNG.url);
  SHARE_PNG={blob:out.blob,name:out.name,url:URL.createObjectURL(out.blob)};
  const img=$("shImg");if(!img)return;
  img.src=SHARE_PNG.url;img.alt=`Motor data sheet for ${L.f.meas.sum.designation}, ${L.c.client}`;img.hidden=false;$("shWait").hidden=true;$("shSave").disabled=false;
  const file=shareFile();$("shShare").hidden=!(file&&navigator.canShare&&navigator.canShare({files:[file]}));}
const shareFile=()=>{try{return SHARE_PNG&&new File([SHARE_PNG.blob],SHARE_PNG.name,{type:"image/png"});}catch(e){return null;}};
function savePicture(){if(!SHARE_PNG)return;const a=document.createElement("a");a.href=SHARE_PNG.url;a.download=SHARE_PNG.name;document.body.appendChild(a);a.click();a.remove();toast("Saved to your downloads.");}
document.addEventListener("click",e=>{const b=e.target.closest("#sheet button");if(!b)return;
  if(b.id==="shSave")savePicture();
  else if(b.id==="shShare"){const file=shareFile();if(file)navigator.share({files:[file],title:"Burn Rate data sheet"}).catch(()=>{});}});
