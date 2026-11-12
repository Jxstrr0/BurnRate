/* ===================== sim/rng.js: the seeded random numbers =====================
   Adapted from The-Whip src/sim/rng.js (12 November 2026): sfc32 seeded by cyrb128, made a classic function, plus named
   streams (the Frontier Lab pattern): rngStreams(seed).get("variance") always gives the same sequence for that seed and
   name, so adding draws in one system (say, igniters) never reshuffles another (say, casting voids). State is four
   32-bit words and can be saved with getState() and restored with makeRng(state). */
function cyrb128(str){
  let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;
  for(let i=0;i<str.length;i++){const k=str.charCodeAt(i);
    h1=h2^Math.imul(h1^k,597399067);h2=h3^Math.imul(h2^k,2869860233);h3=h4^Math.imul(h3^k,951274213);h4=h1^Math.imul(h4^k,2716044179);}
  h1=Math.imul(h3^(h1>>>18),597399067);h2=Math.imul(h4^(h2>>>22),2869860233);h3=Math.imul(h1^(h3>>>17),951274213);h4=Math.imul(h2^(h4>>>19),2716044179);
  h1^=h2^h3^h4;h2^=h1;h3^=h1;h4^=h1;
  return[h1>>>0,h2>>>0,h3>>>0,h4>>>0];}
/* a short stable hash of a string (8 hex characters), for daily seeds and test fingerprints */
function hashStr(str){return cyrb128(String(str))[0].toString(16).padStart(8,"0");}
/* makeRng(seed string | saved [a,b,c,d]) */
function makeRng(seedOrState){
  let[a,b,c,d]=Array.isArray(seedOrState)?seedOrState:cyrb128(String(seedOrState));
  function next(){a>>>=0;b>>>=0;c>>>=0;d>>>=0;let t=(a+b)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);d=(d+1)|0;t=(t+d)|0;c=(c+t)|0;return(t>>>0)/4294967296;}
  if(!Array.isArray(seedOrState))for(let i=0;i<15;i++)next();   // warm up so similar seeds diverge at once
  const r={next,
    float:(lo=0,hi=1)=>lo+(hi-lo)*next(),
    int:(lo,hi)=>lo+Math.floor(next()*(hi-lo+1)),
    chance:p=>next()<p,
    pick:arr=>arr[Math.floor(next()*arr.length)],
    /* a normal draw (Box-Muller), clipped to +-4 sd so one freak draw can't produce a nonsense motor */
    normal(mean=0,sd=1){const u=1-next(),v=next();const z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);return mean+sd*Math.max(-4,Math.min(4,z));},
    fork:label=>makeRng(String(next())+":"+label),
    getState:()=>[a>>>0,b>>>0,c>>>0,d>>>0]};
  return r;}
/* named streams from one seed: each name gets its own independent generator */
function rngStreams(seed){const made={};return{seed:String(seed),get:name=>made[name]||(made[name]=makeRng(String(seed)+"/"+name))};}
Object.assign(SIM,{cyrb128,hashStr,makeRng,rngStreams});
