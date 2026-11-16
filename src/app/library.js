/* ===================== app/library.js: your motors (1.7, Kelbo 16 November 2026) =====================
   The Data sheet's "Your motors": save the motor on the bench under a name, load one back, delete one. Up to LIB_MAX,
   kept in brn-library (app/save.js) so every career, the free bench, the Sandbox and the Daily Spec share them. A saved
   motor keeps every part it had: one that uses parts this career hasn't opened yet shows its tier, and the bench marks
   those parts as locked when it's loaded (the stand refuses them as usual). Loading is one step for Undo. */
const PART_TABS=[["grain.prop","PROPELLANTS"],["grain.shape","GRAIN_SHAPES"],["case.mat","CASES"],["case.liner","LINERS"],["nozzle.mat","THROATS"],
  ["airframe.body","BODIES"],["airframe.nose","NOSES"],["airframe.fins","FINS"]];
/* the highest part tier a motor uses */
function motorTier(d){let t=1;for(const[f,tab]of PART_TABS){const id=f.split(".").reduce((o,k)=>o&&o[k],d),p=id&&BURN_SIM[tab][id];if(p&&(p.tier||1)>t)t=p.tier;}return t;}
const libDefault=()=>{const r=DZ.res,des=r&&r.ok?r.sum.designation:"Motor",c=GAME.contract;
  return(des+" · "+(c?c.title:"Free bench")).slice(0,LIB_NAME);};
function libSection(){
  const r=DZ.res,pt=partTier(),full=LIB.motors.length>=LIB_MAX;
  const list=LIB.motors.map((m,i)=>{const t=motorTier(m.d),lock=pt&&t>pt;
    return`<li><div class="lb-n"><b>${esc(m.name)}</b><span class="hint mono">${esc(m.des||"")}${t>1?` · <span class="tag${lock?" lock":""}">Tier ${t}${lock?" · locked parts":""}</span>`:""}</span></div>
      <div class="lb-b"><button type="button" class="btn sm" data-libload="${i}">Load</button><button type="button" class="btn sm" data-libdel="${i}" aria-label="Delete ${esc(m.name)}">Delete</button></div></li>`;}).join("");
  const form=!r||!r.ok?`<p class="hint">A motor that can't be built can't be saved: fix its red flags first.</p>`
    :full?`<p class="hint">The library is full (${LIB_MAX} motors). Delete one to save this one.</p>`
    :`<form class="lb-save" id="libForm"><label for="libName" class="vh">Name for this motor</label><input id="libName" maxlength="${LIB_NAME}" value="${esc(libDefault())}" autocomplete="off" spellcheck="false">
      <button type="submit" class="btn sm pri">Save this motor</button></form>`;
  return`<h3>Your motors <span class="hint">${LIB.motors.length} of ${LIB_MAX}</span></h3>${form}
    ${list?`<ul class="lb-list">${list}</ul>`:`<p class="hint">No motors saved yet. A saved motor can be loaded on any bench, in any career on this phone.</p>`}`;}
function libSave(name){
  const r=DZ.res;if(!r||!r.ok||LIB.motors.length>=LIB_MAX)return;
  name=String(name||"").trim().slice(0,LIB_NAME)||libDefault();
  LIB.motors.unshift({name,d:clone(DZ.d),des:r.sum.designation,at:Date.now()});
  if(saveLib())toast(`Saved: ${name}`);else LIB.motors.shift();
  dataSheet();}
function libLoad(i){const m=LIB.motors[i];if(!m)return;
  const before=snapNow();closeSheet();benchSwap(clone(m.d));remember(before);toast(`Loaded ${m.name}. Undo brings yours back`,3600);}
function libDelete(i){const m=LIB.motors[i];if(!m||!confirm(`Delete "${m.name}" from your motors?`))return;
  LIB.motors.splice(i,1);saveLib();dataSheet();}
document.addEventListener("submit",e=>{if(e.target.id!=="libForm")return;e.preventDefault();libSave($("libName").value);});
document.addEventListener("click",e=>{const b=e.target.closest("#sheet [data-libload],#sheet [data-libdel]");if(!b)return;
  if(b.dataset.libload!=null)libLoad(+b.dataset.libload);else libDelete(+b.dataset.libdel);});
