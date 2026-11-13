/* ===================== app/save.js: the save, the autosave and the three slots (plan section 11.3) =====================
   S is everything Burn Rate keeps for a player:
     S = {v, career (sim/career.js's object, plus career.designs: the bench's design per job) | null,
          free (the free bench's design) | null, freeN (free firings so far, so each one rolls new dice), lastBackup (ms),
          hutT (the conditioning hut's setting, °C)}
   save() writes it to "brn-save" (debounced, and at once when the page hides). The three slots "brn-slot1".."brn-slot3"
   hold copies the player saves by hand, each with savedAt. Settings stay apart in "brn-settings" (this phone only).
   hydrate(o) checks a save's shape and runs the migrations before it becomes S; it returns false for anything it can't
   load, and leaves S alone then. Every storage call is in try/catch; nothing outside "brn-" is ever touched. */
const SAVE_V=1,SAVE_KEY="brn-save",SLOTS=3,slotKey=i=>"brn-slot"+i;
const freshSave=()=>({v:SAVE_V,career:null,free:null,freeN:0,lastBackup:0,hutT:20});
let S=freshSave();
/* MIGRATE[v](o) turns a version-v save into a version v+1 one. None yet: SAVE_V is 1. */
const MIGRATE={};
const isObj=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const isNum=v=>typeof v==="number"&&isFinite(v);
function snapshot(){return JSON.parse(JSON.stringify({v:SAVE_V,career:S.career,free:S.free,freeN:S.freeN|0,lastBackup:S.lastBackup||0,hutT:S.hutT}));}
/* is this a career object the game can run? (the shape newCareer makes) */
function careerOk(c){
  if(!isObj(c))return false;
  for(const k of["day","money","tier","rep","bunker","no","broke"])if(!isNum(c[k]))return false;
  for(const k of["stands","jobs","done"])if(!isObj(c[k]))return false;
  if(!Array.isArray(c.log)||typeof c.seed!=="string"||typeof c.name!=="string")return false;
  if("designs"in c&&!isObj(c.designs))return false;
  for(const id in c.jobs){const j=c.jobs[id];if(!isObj(j)||!isNum(j.due)||!isNum(j.pay)||!isNum(j.n))return false;}
  return true;}
function designOk(d){return d==null||isObj(d)&&isObj(d.grain)&&isObj(d.case)&&isObj(d.nozzle)&&typeof d.igniter==="string";}
function hydrate(o){
  if(!isObj(o)||!isNum(o.v)||o.v>SAVE_V||o.v<1)return false;
  o=JSON.parse(JSON.stringify(o));
  for(let v=o.v;v<SAVE_V;v++){if(!MIGRATE[v])return false;o=MIGRATE[v](o);o.v=v+1;}
  if(o.career!=null&&!careerOk(o.career))return false;
  if(!designOk(o.free))return false;
  if(o.career){o.career.designs=o.career.designs||{};if(!isNum(o.career.hut))o.career.hut=0;for(const k in o.career.designs)if(!designOk(o.career.designs[k]))return false;}
  S=Object.assign(freshSave(),{career:o.career||null,free:o.free||null,freeN:isNum(o.freeN)?o.freeN:0,lastBackup:isNum(o.lastBackup)?o.lastBackup:0,hutT:isNum(o.hutT)?o.hutT:20});
  return true;}
function readKey(k){try{const j=localStorage.getItem(k);if(!j)return null;const o=JSON.parse(j);return isObj(o)?o:null;}catch(e){return null;}}
function loadSave(){const o=readKey(SAVE_KEY);if(o&&!hydrate(o))toast("The save on this phone couldn't be read. Restore a backup from Saves.",5000);}
let saveT=0;
function save(now){clearTimeout(saveT);if(!now){saveT=setTimeout(()=>save(true),400);return true;}
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot()));}catch(e){toast("This browser wouldn't save the game (storage full or blocked).");return false;}
  if(typeof buSaved==="function")buSaved();return true;}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&saveT)save(true);});
addEventListener("pagehide",()=>{if(saveT)save(true);});

/* ---- the slots ---- */
function slotInfo(i){const o=readKey(slotKey(i));if(!o)return null;const c=o.career;
  return{savedAt:isNum(o.savedAt)?o.savedAt:0,text:c&&isObj(c)?`${c.name} · day ${c.day} · ${fmtCr(c.money)}`:"No career, free bench only"};}
function saveSlot(i){const o=snapshot();o.savedAt=Date.now();try{localStorage.setItem(slotKey(i),JSON.stringify(o));return true;}catch(e){return false;}}
function loadSlot(i){const o=readKey(slotKey(i));if(!o)return false;const keep=S.lastBackup;if(!hydrate(o))return false;S.lastBackup=Math.max(keep,S.lastBackup);return save(true);}
function clearSlot(i){try{localStorage.removeItem(slotKey(i));}catch(e){}}
/* after a restore or a slot load: pick up the new S everywhere */
function applyLoaded(msg){GAME.contract=null;GAME.last=null;renderTitle();showScreen("title");if(msg)toast(msg);}
