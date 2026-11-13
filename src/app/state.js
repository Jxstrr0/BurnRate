<script>
/* ===================== app/state.js: version, settings, small helpers, the sheet =====================
   The app glue reads BURN_SIM and draws the page; it is the only place that touches localStorage.
   Storage (plan section 11.3): every key starts "brn-": brn-settings (this phone only), brn-save (the game,
   app/save.js) and brn-slot1..3 (save slots). Never localStorage.clear(), never touch another prefix. All access is wrapped in try/catch. */
const VERSION="1.2.0.0";
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* a temperature with a real minus sign: "−6 °C" */
const degC=t=>(t<0?"−":"")+Math.abs(t)+" °C";
const reduced=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- settings (this phone only): brn-settings ---- */
const SET_KEY="brn-settings",SET_DEF={theme:"light",sound:true,haptics:true,gfx:"auto",coach:true,seen:{}};
let SETTINGS=Object.assign({},SET_DEF);
function loadSettings(){try{const o=JSON.parse(localStorage.getItem(SET_KEY)||"null");if(o&&typeof o==="object"&&!Array.isArray(o))SETTINGS=Object.assign({},SET_DEF,o);}catch(e){}}
function saveSettings(){try{localStorage.setItem(SET_KEY,JSON.stringify(SETTINGS));}catch(e){}}
/* the theme: "light" (Day, the default), "dark" (Night shift) or "auto" (match the phone). head.html sets it early from
   the same setting so a night-shift phone never flashes light; this keeps it right afterwards and repaints the bar colour */
const THEME_OPTS=[["light","Day"],["dark","Night shift"],["auto","Match phone"]];
const darkQ=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
function applyTheme(){const t=SETTINGS.theme==="dark"||(SETTINGS.theme==="auto"&&darkQ&&darkQ.matches)?"dark":"light";
  document.documentElement.dataset.theme=t;
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=getComputedStyle(document.documentElement).getPropertyValue("--ground").trim()||"#E6E3DC";}
if(darkQ&&darkQ.addEventListener)darkQ.addEventListener("change",()=>{if(SETTINGS.theme==="auto")applyTheme();});

/* ---- toast ---- */
function toast(msg,ms){const t=$("toast");t.textContent=msg;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),ms||2600);}

/* ---- the sheet: a bottom drawer. Adapted from Escapement openSheet / sheetHist in src/app/state.js (12 November 2026):
   the phone's Back button closes an open sheet instead of leaving the game. One history entry is pushed when a sheet opens
   and left in place when it closes; the next sheet reuses it. ---- */
let sheetBack=null,sheetPushed=false;
const sheetOn=()=>$("sheet").classList.contains("on");
function openSheet(title,html){sheetBack=sheetOn()?sheetBack:document.activeElement;$("sheetTitle").textContent=title;
  const ob=$("sheetBody"),nb=ob.cloneNode(false);ob.replaceWith(nb);nb.innerHTML=html;sheetHist();
  $("sheet").classList.add("on");$("scrim").classList.add("on");$("sheetBody").scrollTop=0;$("sheetClose").focus({preventScroll:true});}
function closeSheet(){$("sheet").classList.remove("on");$("scrim").classList.remove("on");if(sheetBack&&sheetBack.focus)sheetBack.focus({preventScroll:true});sheetBack=null;}
function sheetHist(){if(sheetPushed)return;try{history.pushState({brnSheet:1},"");sheetPushed=true;}catch(e){}}
window.addEventListener("popstate",()=>{if(!sheetPushed)return;sheetPushed=false;if(sheetOn())closeSheet();});
$("sheetClose").addEventListener("click",closeSheet);$("scrim").addEventListener("click",closeSheet);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&sheetOn())closeSheet();});
