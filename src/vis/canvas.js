/* ===================== vis/canvas.js: shared canvas helpers =====================
   fit(cv, h) sizes a canvas to its CSS width at the screen's pixel ratio (capped at 2) and returns {c, W, H};
   tokens() reads the colour and font tokens; nice(v) rounds an axis maximum up to 1, 2, 2.5 or 5 x 10^k; divs(max) picks a
   gridline count that keeps every axis label a round number. */
function fit(cv,h){
  const dpr=Math.min(2,window.devicePixelRatio||1),W=Math.max(200,cv.clientWidth||320),H=Math.round(h(W));
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
  cv.style.height=H+"px";
  const c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,W,H);return{c,W,H};}
function tokens(){const s=getComputedStyle(document.documentElement),g=k=>s.getPropertyValue(k).trim();
  return{ink:g("--ink"),muted:g("--muted"),line:g("--line"),pred:g("--pred"),meas:g("--meas"),stencil:g("--stencil"),warn:g("--warn"),
    card:g("--card"),prop:g("--prop"),propD:g("--propD"),liner:g("--linerC"),metal:g("--metal"),metalL:g("--metalL"),burn:g("--burn"),
    mono:g("--mono")};}
function nice(v){if(!(v>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),m=v/e;return(m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*e;}
/* how many gridlines to split an axis into so every label is a round number (5 -> 5 steps of 1, 2.5 -> 5 of 0.5, 2 -> 4 of 0.5) */
function divs(max,few){const opts=few?[2,1]:[4,5,2];return opts.find(n=>Math.abs(Math.round(max/n*10)-max/n*10)<1e-9)||opts[0];}
function fmtAxis(v,max){return max<4?v.toFixed(1):max<20&&v%1?v.toFixed(1):v.toFixed(0);}
Object.assign(VIS,{fit,tokens,nice,divs});
