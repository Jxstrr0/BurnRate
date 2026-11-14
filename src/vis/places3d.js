/* ===================== vis/places3d.js: where each stand is, the light of the day, the bench view (1.6) =====================
   Every stand has its own place on Site 41, each its own Blender model, all in one world frame (tools/blender_parts.py):
     s3  the hush house's indoor test cell (models/hush.glb, tools/blender-hush.py): home base from day one; the build bay
         next door, where the bench view shows the motor being designed
     s2  the outdoor stand at the range's centre (models/range.glb)
     s1  the old state booster stand with its bunker (models/stand1.glb, tools/blender-stands.py)
     s0  the altitude chamber: cameras inside the tank and out (models/chamber.glb, same script)
   and models/site.glb (tools/blender-site.py) is the rest of Site 41 out to the horizon. app/gfx.js loads range, kit and
   hush with the 3D range, the site after it, and Stand 1 and the chamber when they are first needed; s3AddPlace() puts
   each in the scene. A firing at a place that hasn't arrived yet plays on Stand 2.
   PLACES: for each place its motor mount and cradle nodes (the empties the Blender scripts write), its set shots, its
   lamps, whether it is indoors (no wind, its own light, the camera kept inside the walls) and its exhaust path.
   S3_SKY and S3_WX: the light of the firing slot (dawn, noon, dusk, or now and then a night firing under the floods) and
   the range day's weather (clear, haze, overcast, dust), both picked by s3Day() from the firing's own key, so a replay
   gets the same sky. Nothing here is physics: it only changes how the range looks. */
const PLACES={
  s2:{glb:"range",name:"Stand 2",mount:"motorMount",cradle:/^cradle\d/,low:0.42,flood:["flood0","flood1"],floodUp:9,
    shots:[{name:"Side on",kind:"side"},{name:"Nozzle close-up",kind:"close"},{name:"Blockhouse window",kind:"blockhouse"}]},
  s3:{glb:"hush",name:"Stand 3",indoor:true,mount:"hushMount",cradle:/^hushCradle\d/,lowNode:"hushLow",box:["hushCellMin","hushCellMax"],
    lamps:["hushLamp0","hushLamp1"],inlet:"hushInlet",intro:["hushBay","hushDoor"],
    shots:[{name:"Side on",kind:"side",solo:true},{name:"Nozzle close-up",kind:"close",solo:true},
      {name:"Control room",kind:"node",node:"hushWindow",fovW:[1.5,1.3],solo:true,free:true},{name:"Build bay",kind:"node",node:"hushBay",fovW:[2.4,3.2],free:true}]},
  s1:{glb:"stand1",name:"Stand 1",mount:"s1Mount",cradle:/^s1Cradle\d/,lowNode:"s1Low",flood:["s1Lamp0","s1Lamp1"],floodUp:0,
    shots:[{name:"Side on",kind:"side"},{name:"Nozzle close-up",kind:"close"},{name:"Bunker window",kind:"node",node:"s1Window",fovW:[1.7,2.6]}]},
  s0:{glb:"chamber",name:"Altitude chamber",indoor:true,mount:"s0Mount",cradle:/^s0Cradle\d/,lowNode:"s0Low",tank:["s0TankA","s0TankB",1.65],
    lampI:7,lamps:["s0Lamp0","s0Lamp1"],outlet:"s0Outlet",vacuum:true,
    shots:[{name:"Chamber camera",kind:"node",node:"s0Cam",fov:68,solo:true},{name:"Nozzle close-up",kind:"close",solo:true},
      {name:"Outside",kind:"node",node:"s0Out",look:[29,-58,3.5],out:true,free:true}]},
  /* the design bench in the hush house's build bay: the motor on two V-blocks, no flame */
  bench:{glb:"hush",name:"Build bay",indoor:true,bench:"hushBench",boxB:[[-63.6,-18.6,0.35],[-48.4,-5.4,6.5]],lamps:["hushLamp2","hushLamp3"],
    shots:[{name:"Bench",kind:"bench"},{name:"Nozzle end",kind:"benchEnd"},{name:"From the door",kind:"node",node:"hushBay",fovW:[1.6,1.2],free:true}]},
  launch:{glb:"range",name:"Launch rail",flood:["flood2","flood0"],floodUp:9,shots:[{name:"Chase"},{name:"Pad camera"},{name:"Downrange"}]}};
/* the smallest open stand that takes a motor (a free firing with no job): [stand, length mm, diameter mm] from STANDS */
function s3Fit(lenMM,diaMM){for(const k of["s3","s2","s1"]){const s=BURN_SIM.STANDS[k];if(lenMM<=s.len&&diaMM<=s.dia)return k;}return"s1";}
/* ---- the light ----
   sun: the direction toward the sun (three.js frame: +X downrange/east, +Y up, +Z south), hor/zen: the sky at the horizon
   and overhead, sunC/sunI: its colour and strength, hemi: sky and ground bounce colours and strength, fog: the haze colour,
   glow: the sky's sun-glow strength, grade: the post-effects colour grade (Full only), stars: 0..1 */
const S3_SKY={
  dawn:{sun:[0.80,0.22,-0.56],hor:0xF1DCC4,zen:0x93A9C6,sunC:0xFFD6A8,sunI:1.3,hemi:[0xEDE5DA,0xA99D8B,1.6],fog:0xEDDDCB,glow:1.3,
    grade:{tint:[1.04,0.99,0.94],sat:1.0,contrast:1.03},stars:0,smoke:[0.98,0.93,0.86]},
  noon:{sun:[0.40,0.69,-0.58],hor:0xE9E4D8,zen:0x8FB0CC,sunC:0xFFF2DC,sunI:1.6,hemi:[0xF4F2EC,0xB9B09C,1.9],fog:0xE9E4D8,glow:1,
    grade:null,stars:0,smoke:[1,1,1]},
  dusk:{sun:[-0.78,0.17,-0.45],hor:0xEFCBAA,zen:0x8093B4,sunC:0xFFB57E,sunI:1.15,hemi:[0xE9DACB,0xA48F7C,1.45],fog:0xE8D0BA,glow:1.5,
    grade:{tint:[1.06,0.97,0.90],sat:1.04,contrast:1.04},stars:0,smoke:[0.95,0.86,0.78]},
  night:{sun:[0.30,0.62,-0.50],hor:0x2E3846,zen:0x0E1522,sunC:0x9DB0D4,sunI:0.22,hemi:[0x5D6A84,0x2A2D33,0.5],fog:0x262E3B,glow:0.15,
    grade:{tint:[0.94,0.98,1.06],sat:0.85,contrast:1.06},stars:1,smoke:[0.42,0.44,0.5]}};
/* (smoke: the light on the smoke, a multiplier on its grey; indoors it is the lamps' S3_IN.smoke) */
/* the weather of a range day: how it changes the slot's light. fog: [near, far] m; mix: [colour, how much] blended into
   the sky and the haze; sun/hemi: multipliers; glow: the sun-glow multiplier */
const S3_WX={clear:{fog:[400,7000],mix:null,sun:1,hemi:1,glow:1},
  haze:{fog:[150,3200],mix:[0xE4E0D8,0.35],sun:0.85,hemi:1.02,glow:0.8},
  overcast:{fog:[200,4200],mix:[0xB4B8BC,0.6],sun:0.3,hemi:1.12,glow:0.15},
  dust:{fog:[60,1700],mix:[0xD8C3A0,0.55],sun:0.6,hemi:1.0,glow:0.5}};
/* indoors: the bounce from the walls and the lamps (cd at 1 m; a place may set its own lampI, as the tank does: its lamps sit close to the wall). Lite has no shadows, so the sun is turned right down */
const S3_IN={smoke:[0.86,0.84,0.8],hemi:[0xF0ECE4,0x8C877C,0.75],sunFull:0.45,sunLite:0.1,lamp:0xFFF0D8,lampI:26,lampD:16,env:0.25};
const S3_FLOOD={c:0xFFE4BC,i:140,d:60};
/* the firing's light: its slot's time of day and the day's weather, the same every replay. One dusk firing in five is
   held over into the night, under the floodlights; the climate plant's slot fires in the noon light */
function s3Day(key,slot){
  const h=n=>parseInt(BURN_SIM.hashStr(key+"/"+n).slice(0,6),16)/0xFFFFFF;
  let tod=slot==="dawn"||slot==="dusk"?slot:"noon";if(tod==="dusk"&&h("night")<0.2)tod="night";
  const w=h("wx"),wx=tod==="night"?(w<0.75?"clear":"haze"):w<0.55?"clear":w<0.75?"haze":w<0.9?"overcast":"dust";
  return{tod,wx};}
/* ---- loading a place ---- */
function s3AddPlace(id,buf){
  if(!S3.ok||!buf||(S3.roots&&S3.roots[id]))return!!(S3.roots&&S3.roots[id]);
  const W=glbScene(buf,S3.full);S3.sc.add(W.root);W.root.updateMatrixWorld(true);
  for(const k in W.nodes)if(!(k in S3.nodes))S3.nodes[k]=W.nodes[k];
  (S3.roots||(S3.roots={}))[id]=W.root;if(S3.last&&!S3.playing)s3Redraw();return true;}
const s3Has=id=>id==="range"||!!(S3.roots&&S3.roots[id]);
/* the place a firing plays at (o.place, else Stand 2), falling back to Stand 2 when its model isn't loaded */
function s3Place(o){
  if(o.mode==="launch")return PLACES.launch;
  const p=PLACES[o.mode==="bench"?"bench":o.place]||PLACES.s2;return s3Has(p.glb)?p:PLACES.s2;}
/* a node's world position (three.js frame), or null */
function s3Node(k){const n=k&&S3.nodes[k];return n?n.getWorldPosition(new THREE.Vector3()):null;}
/* ---- the light, each frame: the day's sky outdoors, the place's lamps indoors ---- */
function s3Light(inside){
  const T=THREE,day=S3.day||{tod:"noon",wx:"clear"},sk=S3_SKY[day.tod],wx=S3_WX[day.wx],key=day.tod+day.wx+(inside?1:0)+(S3.full?1:0)+(S3.pl?S3.pl.glb:"");
  if(S3.lightKey===key)return;S3.lightKey=key;
  /* lights and fog take colours as usual (three.js makes them linear); the sky shader takes display colours (s3Hex) */
  const C=x=>new T.Color(x),D=x=>s3Hex(new T.Color(),x),wk=wx.mix?wx.mix[1]*(day.tod==="night"?0.25:1):0;
  const mix=c=>wx.mix?c.lerp(C(wx.mix[0]),wk):c,mixD=c=>wx.mix?c.lerp(D(wx.mix[0]),wk):c;
  const u=S3.sky.material.uniforms;u.hor.value.copy(mixD(D(sk.hor)));u.zen.value.copy(mixD(D(sk.zen)));u.sunC.value.copy(D(sk.sunC));
  u.sun.value.set(...sk.sun).normalize();u.glow.value=sk.glow*wx.glow;u.stars.value=sk.stars;
  S3.sc.fog.color.copy(mix(C(sk.fog)));S3.fogNF=wx.fog;
  S3.sunDir=new T.Vector3(...sk.sun).normalize();S3.sun.color.copy(C(sk.sunC));
  const pl=S3.pl||PLACES.s2,night=day.tod==="night";
  if(inside){S3.hemi.color.set(S3_IN.hemi[0]);S3.hemi.groundColor.set(S3_IN.hemi[1]);S3.hemi.intensity=S3_IN.hemi[2]*(night?0.7:1);
    S3.sun.intensity=sk.sunI*wx.sun*(S3.full?S3_IN.sunFull:S3_IN.sunLite);}
  else{S3.hemi.color.copy(C(sk.hemi[0]));S3.hemi.groundColor.copy(C(sk.hemi[1]));S3.hemi.intensity=sk.hemi[2]*wx.hemi;S3.sun.intensity=sk.sunI*wx.sun;}
  /* two lamps: the place's own lights indoors, its floodlights at night outdoors, else off */
  const L=inside?pl.lamps:night?pl.flood:null;
  S3.lamps.forEach((l,i)=>{const p=L&&s3Node(L[i]);l.intensity=0;if(!p)return;
    if(inside){l.position.copy(p).y-=0.25;l.color.set(S3_IN.lamp);l.intensity=pl.lampI||S3_IN.lampI;l.distance=S3_IN.lampD;}
    else{l.position.copy(p).y+=pl.floodUp||0;l.color.set(S3_FLOOD.c);l.intensity=S3_FLOOD.i;l.distance=S3_FLOOD.d;}});
  /* the environment map (Full, with the post chain) lights things too, so the bounce light gives way a little */
  const env=!!(S3.env&&S3.full);S3.sc.environment=env?S3.env:null;
  if(env){S3.sc.environmentIntensity=inside?S3_IN.env:night?0.12:0.5;S3.hemi.intensity*=inside?0.85:0.72;}
  S3.smokeK=inside?S3_IN.smoke:sk.smoke.map(v=>v*(wx.sun<0.5?0.92:1));S3.grade=inside?null:sk.grade;}
/* ---- the camera through the hush house: from the build bay, through the blast door, round to the stand ---- */
function s3IntroPath(pl,pos,tgt,u){
  const T=THREE,a=s3Node(pl.intro[0]),b=s3Node(pl.intro[1]);if(!a||!b)return false;
  const w=new T.Vector3(b.x+1.3,(b.y+pos.y)/2,pos.z),P=[a,b,w,pos.clone()],D=[0];
  for(let i=1;i<P.length;i++)D.push(D[i-1]+P[i].distanceTo(P[i-1]));
  const e=u<=0?0:u>=1?1:u*u*(3-2*u),s=e*D[D.length-1];let i=0;while(i<P.length-2&&s>D[i+1])i++;
  const f=(s-D[i])/Math.max(1e-6,D[i+1]-D[i]),p0=P[Math.max(0,i-1)],p1=P[i],p2=P[i+1],p3=P[Math.min(P.length-1,i+2)],f2=f*f,f3=f2*f;
  const cr=(q0,q1,q2,q3)=>0.5*(2*q1+(q2-q0)*f+(2*q0-5*q1+4*q2-q3)*f2+(3*q1-q0-3*q2+q3)*f3);
  pos.set(cr(p0.x,p1.x,p2.x,p3.x),cr(p0.y,p1.y,p2.y,p3.y),cr(p0.z,p1.z,p2.z,p3.z));
  /* look ahead along the path at first, settling on the motor */
  const ahead=e<0.999?P[i+1]:tgt,k=Math.min(1,e*1.6);tgt.set(ahead.x+(tgt.x-ahead.x)*k,ahead.y+(tgt.y-ahead.y)*k,ahead.z+(tgt.z-ahead.z)*k);
  return true;}
/* keep the camera inside the walls: the test cell's box, the bay's box, or the chamber's tank */
function s3Clamp(pl,pos,m){
  const T=THREE;if(m==null)m=0.3;
  if(pl.box||pl.boxB){let lo,hi;
    if(pl.box){const a=s3Node(pl.box[0]),b=s3Node(pl.box[1]);if(!a||!b)return;lo=a.clone().min(b);hi=a.clone().max(b);}
    else{const[a,b]=pl.boxB;lo=new T.Vector3(a[0],a[2],-b[1]);hi=new T.Vector3(b[0],b[2],-a[1]);}
    pos.x=Math.max(lo.x+m,Math.min(hi.x-m,pos.x));pos.y=Math.max(lo.y+m,Math.min(hi.y-m,pos.y));pos.z=Math.max(lo.z+m,Math.min(hi.z-m,pos.z));}
  if(pl.tank){const a=s3Node(pl.tank[0]),b=s3Node(pl.tank[1]);if(!a||!b)return;
    pos.x=Math.max(Math.min(a.x,b.x)+0.25,Math.min(Math.max(a.x,b.x)-0.25,pos.x));
    const dy=pos.y-a.y,dz=pos.z-a.z,r=Math.hypot(dy,dz),lim=pl.tank[2]-Math.max(0.05,m);if(r>lim){pos.y=a.y+dy*lim/r;pos.z=a.z+dz*lim/r;}}}
/* a thrown part or a smoke puff kept inside the walls indoors (m: its own size) */
function s3Keep(p,m){const pl=S3.pl;if(pl&&pl.indoor&&!pl.bench)s3Clamp(pl,p,Math.min(0.6,m||0.02));return p;}
/* show only what a shot can see: inside the cell or the tank, the other models are hidden (their draw calls saved) */
function s3Solo(pl,solo){
  if(!S3.roots)return;const own=pl&&pl.glb;
  S3.world.visible=!solo||own==="range";for(const k in S3.roots)S3.roots[k].visible=!solo||k===own;}
/* ---- the bench view: the 3D canvas borrowed by the design screen ---- */
/* move the canvas (and its shot label and flash) into host, with its height from hFn(width); host null puts it back */
function s3Mount(host,hFn){
  const cv=S3.cv;if(!cv)return;if(!S3.home)S3.home={par:cv.parentNode,next:cv.nextSibling};
  const els=[cv,S3.flash,S3.label];
  if(host){for(const e of els)host.appendChild(e);S3.hFn=hFn||null;cv.hidden=false;S3.mounted=true;}
  else if(S3.mounted){const{par,next}=S3.home;for(const e of els)par.insertBefore(e,next&&next.parentNode===par?next:null);S3.hFn=null;S3.mounted=false;}}
Object.assign(VIS,{PLACES,s3Fit,s3Day,s3AddPlace,s3Has,s3Mount});
/* the places side of VIS.s3 (stand3d.js made it; these consts only exist from here down) */
Object.assign(VIS.s3,{addPlace:s3AddPlace,has:s3Has,mount:s3Mount,fit:s3Fit,day:s3Day});
