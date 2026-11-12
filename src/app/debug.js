/* ===================== app/debug.js: the ?debug=1 page (stage 1) =====================
   A plain bench for the motor model before the designer exists: pick a reference motor and a grain temperature, see the
   predicted pressure and thrust curves and the data-sheet numbers. Open the game with ?debug=1 on the end of the address.
   Not linked from anywhere in the game. */
function debugPage(){
  const S=BURN_SIM,names=Object.keys(S.REF_DESIGNS);
  const box=document.createElement("main");box.id="debug";box.className="concrete";
  box.innerHTML=`<div class="stripe hazard" aria-hidden="true"></div>
  <p class="site">Debug bench · motor model ${esc(VERSION)}</p>
  <h2>Predicted firing</h2>
  <label class="dbg-l">Motor <select id="dbgMotor">${names.map((k,i)=>`<option value="${i}">${esc(k)}</option>`).join("")}</select></label>
  <label class="dbg-l">Grain temperature <b id="dbgTv">20 °C</b><input type="range" id="dbgT" min="-20" max="45" step="1" value="20"></label>
  <div class="card dbg-chart"><canvas id="dbgCv" aria-label="Pressure and thrust against time"></canvas>
    <p class="dbg-key"><span class="k-p"></span>Chamber pressure (MPa) <span class="k-f"></span>Thrust (N)</p></div>
  <div class="card"><table class="dbg-t mono" id="dbgSum"></table></div>
  <div id="dbgWarn"></div>
  <p class="hint"><a href="./">Back to the title</a></p>`;
  $("title").hidden=true;$("app").appendChild(box);
  const draw=()=>{
    const d=S.REF_DESIGNS[names[+$("dbgMotor").value]],tG=+$("dbgT").value;$("dbgTv").textContent=tG+" °C";
    const r=S.predict(d,{tGrain:tG});
    if(!r.ok){$("dbgSum").innerHTML=`<tr><td>${esc(r.errors.map(e=>e.text).join(" "))}</td></tr>`;return;}
    plot($("dbgCv"),r.run);
    const s=r.sum,m=r.motor,row=(k,v)=>`<tr><th>${k}</th><td>${v}</td></tr>`;
    $("dbgSum").innerHTML=[
      row("Designation",`${s.designation} (${s.cls.pct}% of ${s.cls.letter})`),row("Total impulse",s.I.toFixed(1)+" N·s"),
      row("Thrust avg / peak",`${s.Fav.toFixed(0)} / ${s.Fmax.toFixed(0)} N`),row("Burn time",s.tb.toFixed(2)+" s"),
      row("Pressure avg / peak",`${(s.Pav/1e6).toFixed(2)} / ${(s.Pmax/1e6).toFixed(2)} MPa`),row("Isp",s.Isp.toFixed(1)+" s"),
      row("Kn start / range",`${s.kn0.toFixed(0)} / ${s.knMin.toFixed(0)}–${s.knMax.toFixed(0)}`),row("Port-to-throat",s.pt0.toFixed(2)),
      row("Peak mass flux",Math.round(s.gMax)+" kg/m²s"),row("Case safety factor",s.sf.toFixed(2)+` (yield ${(m.pYield/1e6).toFixed(1)} MPa)`),
      row("Closure margin",s.closureSf.toFixed(2)),row("Liner rating",m.linerRating.toFixed(1)+" s"),
      row("Igniter strength",s.ign.strength.toFixed(2)),row("Throat growth","+"+(s.throatGrowth*100).toFixed(2)+"%"),
      row("Propellant / total",`${(m.mass.prop*1000).toFixed(0)} / ${(m.mass.total*1000).toFixed(0)} g`),
      row("Length × diameter",`${(m.length*1000).toFixed(0)} × ${(m.diameter*1000).toFixed(0)} mm`)].join("");
    $("dbgWarn").innerHTML=s.warnings.length?s.warnings.map(w=>`<p class="dbg-w ${w.sev}"><b>${w.sev==="crit"?"Fail":"Warning"}</b> ${esc(w.text)}</p>`).join(""):`<p class="hint">No warnings.</p>`;
  };
  $("dbgMotor").onchange=draw;$("dbgT").oninput=draw;addEventListener("resize",draw);
  draw();
}
/* two traces on one time axis: pressure on the left scale, thrust on the right */
function plot(cv,r){
  const dpr=Math.min(2,devicePixelRatio||1),W=cv.clientWidth||320,H=Math.round(W*0.62);
  cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+"px";
  const c=cv.getContext("2d"),css=getComputedStyle(document.documentElement),tok=k=>css.getPropertyValue(k).trim();
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);
  const L=40,R=44,T=10,B=26,w=W-L-R,h=H-T-B,tMax=r.t[r.t.length-1]*1.04;
  const pMax=nice(Math.max(...r.p)/1e6*1.1),fMax=nice(Math.max(...r.f)*1.1);
  c.font=`11px ${tok("--mono")}`;c.lineWidth=1;
  for(let i=0;i<=4;i++){const y=T+h-h*i/4;c.strokeStyle=tok("--line");c.beginPath();c.moveTo(L,y);c.lineTo(L+w,y);c.stroke();
    c.fillStyle=tok("--pred");c.textAlign="right";c.fillText((pMax*i/4).toFixed(pMax<4?1:0),L-5,y+4);
    c.fillStyle=tok("--ink");c.textAlign="left";c.fillText((fMax*i/4).toFixed(0),L+w+5,y+4);}
  const tStep=nice(tMax/4);c.fillStyle=tok("--muted");c.textAlign="center";
  for(let t=0;t<=tMax;t+=tStep)c.fillText(t.toFixed(tStep<1?1:0)+" s",L+w*t/tMax,H-8);
  const line=(arr,k,max,col,wd)=>{c.strokeStyle=col;c.lineWidth=wd;c.beginPath();
    for(let i=0;i<arr.length;i++){const x=L+w*r.t[i]/tMax,y=T+h-h*Math.min(1.05,arr[i]*k/max);i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();};
  line(r.f,1,fMax,tok("--ink"),1.5);line(r.p,1e-6,pMax,tok("--pred"),2.5);
}
function nice(v){if(!(v>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),m=v/e;return(m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e;}
