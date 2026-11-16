/* ===================== app/save.js: the save, the autosave and the three slots (plan section 11.3) =====================
   S is everything Burn Rate keeps for a player:
     S = {v, career (sim/career.js's object, plus career.designs: the bench's design per job) | null,
          free (the free bench's design) | null, freeN (free firings so far, so each one rolls new dice), lastBackup (ms),
          hutT (the conditioning hut's setting, °C), daily and dailyHist (the Daily Spec, app/daily.js), sandbox (app/sandbox.js)}
   save() writes it to "brn-save" (debounced, and at once when the page hides). The three slots "brn-slot1".."brn-slot3"
   hold copies the player saves by hand, each with savedAt. Settings stay apart in "brn-settings" (this phone only), and the
   motor library and personal bests in "brn-library" (below; shared by every save, so the slots don't copy it).
   hydrate(o) checks a save's shape and runs the migrations before it becomes S; it returns false for anything it can't
   load, and leaves S alone then. Every storage call is in try/catch; nothing outside "brn-" is ever touched. */
const SAVE_V=1,SAVE_KEY="brn-save",SLOTS=3,slotKey=i=>"brn-slot"+i;
const freshSave=()=>({v:SAVE_V,career:null,free:null,freeN:0,lastBackup:0,hutT:20,daily:null,dailyHist:{},sandbox:{designs:{},n:0}});
let S=freshSave();
/* MIGRATE[v](o) turns a version-v save into a version v+1 one. None yet: SAVE_V is 1. */
const MIGRATE={};
const isObj=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const isNum=v=>typeof v==="number"&&isFinite(v);
function snapshot(){return JSON.parse(JSON.stringify({v:SAVE_V,career:S.career,free:S.free,freeN:S.freeN|0,lastBackup:S.lastBackup||0,hutT:S.hutT,daily:S.daily,dailyHist:S.dailyHist,sandbox:S.sandbox}));}
/* is this a career object the game can run? (the shape newCareer makes) */
function careerOk(c){
  if(!isObj(c))return false;
  for(const k of["day","money","tier","rep","bunker","no","broke"])if(!isNum(c[k]))return false;
  for(const k of["stands","jobs","done"])if(!isObj(c[k]))return false;
  if(!Array.isArray(c.log)||typeof c.seed!=="string"||typeof c.name!=="string")return false;
  if("designs"in c&&!isObj(c.designs))return false;
  if("retender"in c&&!isObj(c.retender))return false;
  if("won"in c&&!isNum(c.won))return false;
  for(const id in c.jobs){const j=c.jobs[id];if(!isObj(j)||!isNum(j.due)||!isNum(j.pay)||!isNum(j.n))return false;}
  return true;}
/* the Daily Spec's state (app/daily.js): today's run and the last 60 days' best grades */
function dailyOk(o){return o==null||isObj(o)&&/^\d{4}-\d{2}-\d{2}$/.test(o.date)&&isNum(o.n)&&isNum(o.bestN)&&typeof o.marks==="string"&&
  (o.best==null||/^[ABC]$/.test(o.best))&&isObj(o.design)&&designOk(o.design);}
function dailyHistOk(h){if(h==null)return true;if(!isObj(h))return false;
  for(const k in h){const e=h[k];if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!isObj(e)||!isNum(e.n)||!(e.l==null||/^[ABC]$/.test(e.l)))return false;}return true;}
function sandboxOk(o){if(o==null)return true;if(!isObj(o)||!isObj(o.designs)||!isNum(o.n))return false;
  for(const k in o.designs)if(!isObj(o.designs[k])||!designOk(o.designs[k]))return false;return true;}
function designOk(d){return d==null||isObj(d)&&isObj(d.grain)&&isObj(d.case)&&isObj(d.nozzle)&&typeof d.igniter==="string";}
function hydrate(o){
  if(!isObj(o)||!isNum(o.v)||o.v>SAVE_V||o.v<1)return false;
  o=JSON.parse(JSON.stringify(o));
  for(let v=o.v;v<SAVE_V;v++){if(!MIGRATE[v])return false;o=MIGRATE[v](o);o.v=v+1;}
  if(o.career!=null&&!careerOk(o.career))return false;
  if(!designOk(o.free)||!dailyOk(o.daily)||!dailyHistOk(o.dailyHist)||!sandboxOk(o.sandbox))return false;
  if(o.career){o.career.designs=o.career.designs||{};if(!isNum(o.career.hut))o.career.hut=0;if(!isNum(o.career.compute))o.career.compute=0;for(const k in o.career.designs)if(!designOk(o.career.designs[k]))return false;}
  S=Object.assign(freshSave(),{career:o.career||null,free:o.free||null,freeN:isNum(o.freeN)?o.freeN:0,lastBackup:isNum(o.lastBackup)?o.lastBackup:0,hutT:isNum(o.hutT)?o.hutT:20,daily:o.daily||null,dailyHist:o.dailyHist||{},sandbox:o.sandbox||{designs:{},n:0}});
  return true;}
function readKey(k){try{const j=localStorage.getItem(k);if(!j)return null;const o=JSON.parse(j);return isObj(o)?o:null;}catch(e){return null;}}
function loadSave(){const o=readKey(SAVE_KEY);if(o&&!hydrate(o))toast("The save on this phone couldn't be read. Restore a backup from Saves.",5000);}
let saveT=0;
function save(now){clearTimeout(saveT);if(!now){saveT=setTimeout(()=>save(true),400);return true;}
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot()));}catch(e){toast("This browser wouldn't save the game (storage full or blocked).");return false;}
  if(typeof buSaved==="function")buSaved();return true;}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&saveT)save(true);});
addEventListener("pagehide",()=>{if(saveT)save(true);});

/* ---- the motor library and personal bests (1.7, Kelbo 16 November 2026): "brn-library", this phone's, shared by every
   career, the free bench, the Sandbox and the Daily Spec.
     LIB = {v:1, motors:[{name, d (a design), des (its designation), at (ms)}],
            bests:{job id:{l (the best grade, "A" "B" or "C"), n (the fewest firings it took to deliver), at (ms)}}}
   Up to LIB_MAX motors. Backup codes carry it (app/savecode.js), and a restore merges it into this phone's rather than
   replacing it: a motor saved here is never lost to an older code. Every storage call is in try/catch. ---- */
const LIB_KEY="brn-library",LIB_MAX=12,LIB_NAME=40;
const freshLib=()=>({v:1,motors:[],bests:{}});
let LIB=freshLib();
function libOk(o){if(!isObj(o)||o.v!==1||!Array.isArray(o.motors)||o.motors.length>LIB_MAX*2||!isObj(o.bests))return false;
  for(const m of o.motors)if(!isObj(m)||typeof m.name!=="string"||!isObj(m.d)||!designOk(m.d)||!isNum(m.at))return false;
  for(const k in o.bests){const b=o.bests[k];if(!isObj(b)||!/^[ABC]$/.test(b.l)||!isNum(b.n)||b.n<1)return false;}
  return true;}
function loadLib(){const o=readKey(LIB_KEY);LIB=o&&libOk(o)?o:freshLib();}
function saveLib(){try{localStorage.setItem(LIB_KEY,JSON.stringify(LIB));return true;}
  catch(e){toast("This browser wouldn't save your motors (storage full or blocked).");return false;}}
const gradeBetter=(a,b)=>"ABC".indexOf(a)<"ABC".indexOf(b);
/* two libraries made one: a's motors first, then b's that a doesn't have, up to LIB_MAX; each job's best grade and
   fewest firings from either */
function libMerge(a,b){const o=freshLib(),seen=new Set();
  for(const m of a.motors.concat(b.motors)){const k=m.name+"|"+JSON.stringify(m.d);if(seen.has(k)||o.motors.length>=LIB_MAX)continue;seen.add(k);o.motors.push(JSON.parse(JSON.stringify(m)));}
  for(const L of[a,b])for(const id in L.bests){const x=L.bests[id],y=o.bests[id];
    o.bests[id]=y?{l:gradeBetter(x.l,y.l)?x.l:y.l,n:Math.min(x.n,y.n),at:Math.max(x.at||0,y.at||0)}:Object.assign({},x);}
  return o;}
/* a delivery on a career job: keep the best grade and the fewest firings. Returns what's new, and the old record so an
   aborted firing can put it back (app/game.js undoFiring) */
function recordBest(id,l,n){const b=LIB.bests[id],out={first:!b,grade:!!b&&gradeBetter(l,b.l),fewer:!!b&&n<b.n,prev:b?Object.assign({},b):null,l,n};
  LIB.bests[id]={l:b&&!gradeBetter(l,b.l)?b.l:l,n:b?Math.min(b.n,n):n,at:Date.now()};saveLib();
  out.best=LIB.bests[id];return out;}
function unrecordBest(id,prev){if(prev)LIB.bests[id]=prev;else delete LIB.bests[id];saveLib();}

/* ---- the slots ---- */
function slotInfo(i){const o=readKey(slotKey(i));if(!o)return null;const c=o.career;
  return{savedAt:isNum(o.savedAt)?o.savedAt:0,text:c&&isObj(c)?`${c.name} · day ${c.day} · ${fmtCr(c.money)}`:"No career, free bench only"};}
function saveSlot(i){const o=snapshot();o.savedAt=Date.now();try{localStorage.setItem(slotKey(i),JSON.stringify(o));return true;}catch(e){return false;}}
function loadSlot(i){const o=readKey(slotKey(i));if(!o)return false;const keep=S.lastBackup;if(!hydrate(o))return false;S.lastBackup=Math.max(keep,S.lastBackup);return save(true);}
function clearSlot(i){try{localStorage.removeItem(slotKey(i));}catch(e){}}
/* after a restore or a slot load: pick up the new S everywhere */
function applyLoaded(msg){GAME.contract=null;GAME.last=null;renderTitle();showScreen("title");if(msg)toast(msg);}
