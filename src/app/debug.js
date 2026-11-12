/* ===================== app/debug.js: the ?debug=1 page =====================
   A plain bench for checking the motor model: pick a reference motor and a grain temperature, see the predicted pressure
   and thrust curves and the data-sheet numbers. Open the game with ?debug=1 on the end of the address. Not linked from
   anywhere in the game. */
function debugPage(){
  const S=BURN_SIM,names=Object.keys(S.REF_DESIGNS);
  const box=document.createElement("main");box.id="debug";box.className="concrete";
  box.innerHTML=`<div class="stripe hazard" aria-hidden="true"></div>
  <p class="site">Debug bench · motor model ${esc(VERSION)}</p>
  <h2>Predicted firing</h2>
  <label class="dbg-l">Motor <select id="dbgMotor">${names.map((k,i)=>`<option value="${i}">${esc(k)}</option>`).join("")}</select></label>
  <label class="dbg-l">Grain temperature <b id="dbgTv">20 °C</b><input type="range" id="dbgT" min="-20" max="45" step="1" value="20"></label>
  <div class="card dbg-chart"><canvas id="dbgCv" role="img" aria-label="Pressure and thrust against time"></canvas>
    <p class="dz-key"><span class="k-p"></span>Chamber pressure, MPa <span class="k-f"></span>Thrust, N</p></div>
  <div class="card"><table class="dtab mono" id="dbgSum"></table></div>
  <div id="dbgWarn"></div>
  <p class="hint"><a href="./">Back to the title</a></p>`;
  for(const s of["title","design"])$(s).hidden=true;
  $("app").appendChild(box);
  const draw=()=>{
    const d=S.REF_DESIGNS[names[+$("dbgMotor").value]],tG=+$("dbgT").value;$("dbgTv").textContent=tG+" °C";
    const r=S.predict(d,{tGrain:tG});
    if(!r.ok){$("dbgSum").innerHTML=`<tr><td>${esc(r.errors.map(e=>e.text).join(" "))}</td></tr>`;return;}
    BURN_VIS.curves($("dbgCv"),r.run,{pYield:r.motor.pYield,pMin:r.motor.prop.pMin*1e6});
    $("dbgSum").innerHTML=dataRows(r);
    $("dbgWarn").innerHTML=r.sum.warnings.length?r.sum.warnings.map(w=>`<p class="dbg-w ${w.sev}"><b>${w.sev==="crit"?"Fail":"Warning"}</b> ${esc(w.text)}</p>`).join(""):`<p class="hint">No warnings.</p>`;
  };
  $("dbgMotor").onchange=draw;$("dbgT").oninput=draw;addEventListener("resize",draw);
  draw();
}
