/* ===================== vis/stand3d.js: the test range in 3D (stage 7, plan section 9.3) =====================
   three.js (lib/three.min.js, loaded by app/gfx.js) draws Aqsor Range: the salt flat, far hills, the range model from
   models/range.glb (tools/blender-range.py: Stand 3, the blockhouse, the launch pad, the clutter), and, built here
   because they change with every design, the motor on the stand or the rocket on the rail, the plume, smoke and failures.
   The motor and rocket hardware comes from models/kit.glb (tools/blender-kit.py: unit-size parts, each scaled here to the
   design; the nozzle bell, nose and fins are lathed or built here from the real dimensions). Without the kit, plain parts.

   s3.init(canvas, glbBuffer, tier) once; s3.setup(o) for each firing; s3.draw(o) each frame. Like the 2D views it is
   driven by time: everything on screen (smoke, debris, the rocket's climb) is a function of the times passed in, so the
   slow-motion replay just plays the same seconds again, slower.
     setup o: {mode:"stand"|"launch", len, dia, caseLen, re, rt, half (motor, m and degrees), caseMat, prE (exit/chamber
               pressure), fAt(t) (thrust 0..1 of peak at sim time t), tEnd (s), wind (m/s), rocket:{D, L, body, nose,
               fins} (launch), path:{t,h,x} (the flown path), tBurn (s, flight: when the flame goes out)}
     draw o:  {t (s since ignition, <0 before), f (0..1), p (chamber Pa), fail:{key, age}, still (reduced motion)}
   Plume: its length and brightness follow thrust; shock diamonds show while the nozzle is under-expanded (exit pressure
   above the air's), and an over-expanded plume pinches in. Cameras: set shots (tap to switch) and drag to orbit; a tap
   goes back to the set shot. Tiers: "full" (standard materials, sun shadows, more smoke, sharper pixels) and "lite". */
const S3={ok:false,R:null,sc:null,cam:null,cv:null,full:true,dpr:1,world:null,nodes:{},mats:null,o:null,last:null,
  shot:0,orbit:null,ptr:new Map(),drag:null,flash:null,label:null,labelT:0,frames:[],stepped:0,onStep:null,onShot:null};
const S3_AIR=101325,S3_N={full:720,lite:260};
const SHOTS={stand:["Side on","Nozzle close-up","Blockhouse window"],launch:["Chase","Pad camera","Downrange"]};
/* deterministic per-particle randomness (0..1): the same smoke every replay */
const h01=k=>{const s=Math.sin(k*127.1+311.7)*43758.5453;return s-Math.floor(s);};
function s3Init(cv,buf,tier,kit){
  const T=THREE;S3.cv=cv;S3.full=tier!=="lite";
  try{S3.R=new T.WebGLRenderer({canvas:cv,antialias:S3.full,powerPreference:"high-performance"});}catch(e){S3.ok=false;return false;}
  const R=S3.R;R.toneMapping=T.NoToneMapping;R.shadowMap.enabled=S3.full;
  const sc=S3.sc=new T.Scene();
  sc.fog=new T.Fog(0xE9E4D8,400,7000);
  S3.cam=new T.PerspectiveCamera(30,1,0.05,40000);
  /* the sky: a gradient dome that follows the camera, faded steppe blue to a pale dusty horizon, with a sun glow */
  const sky=new T.Mesh(new T.SphereGeometry(20000,24,12),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
    uniforms:{sun:{value:new T.Vector3(0.42,0.62,-0.6).normalize()}},
    vertexShader:"varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}",
    fragmentShader:"uniform vec3 sun;varying vec3 vd;void main(){float y=max(vd.y,0.0);vec3 hor=vec3(0.914,0.894,0.847),zen=vec3(0.56,0.69,0.80);"+
      "vec3 c=mix(hor,zen,pow(y,0.55));float s=max(dot(vd,sun),0.0);c+=vec3(1.0,0.93,0.78)*(pow(s,40.0)*0.35+pow(s,600.0)*0.6);"+
      "if(vd.y<0.0)c=hor;gl_FragColor=vec4(c,1.0);}"}));
  sky.renderOrder=-1;sky.frustumCulled=false;sc.add(sky);S3.sky=sky;
  /* lights: the steppe sun and a bright sky bounce; the plume's own light sits at the nozzle */
  sc.add(new T.HemisphereLight(0xF4F2EC,0xB9B09C,1.9));
  const sun=S3.sun=new T.DirectionalLight(0xFFF2DC,1.6);sun.position.set(35,60,-50);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:200});sun.shadow.bias=-0.0006;
  sc.add(sun);sc.add(sun.target);
  S3.fire=new T.PointLight(0xFFB868,0,30,2);sc.add(S3.fire);
  /* the salt flat: a big plane with the salt-crust texture (textures/salt.jpg, one tile is 20 m; its normal map on Full).
     The plane is cut into 64 x 64 cells (huge single triangles break depth on some GPUs) and follows the camera in whole
     tiles, growing with height, so the crust stays put while the edge stays in the haze */
  const sm=new T.MeshLambertMaterial({color:0xEAE4D6,map:texGet("salt",false,true)});S3.groundRep=100;
  const ground=S3.ground=new T.Mesh(new T.PlaneGeometry(2000,2000,64,64),sm);
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.userData.keepMat=true;sc.add(ground);
  /* far hills: a ring of low ridges, blue-grey in the haze */
  const hr=BURN_SIM.makeRng("hills"),n=180,pos=[],rid=[],q=(a,r,h)=>[Math.cos(a)*r,h,Math.sin(a)*r],ph=[hr.float(0,6),hr.float(0,6),hr.float(0,6)];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,u=Math.sin(a*3+ph[0])*0.5+Math.sin(a*7+ph[1])*0.3+Math.sin(a*17+ph[2])*0.2;
    rid.push([a,3300+Math.sin(a*5+ph[1])*500,Math.max(25,90+150*u+hr.float(0,30))]);}
  for(let i=0;i<n;i++){const[a0,r0,h0]=rid[i],[a1,r1,h1]=rid[(i+1)%n],A=q(a0,r0+200,-5),B=q(a1,r1+200,-5),C=q(a1,r1,h1),D=q(a0,r0,h0);
    pos.push(...A,...B,...C,...A,...C,...D);}
  const hg=new T.BufferGeometry();hg.setAttribute("position",new T.Float32BufferAttribute(pos,3));hg.computeVertexNormals();
  const hills=new T.Mesh(hg,new T.MeshLambertMaterial({color:0xA9AEAF,side:T.DoubleSide,flatShading:true}));hills.userData.keepMat=true;sc.add(hills);
  /* the range model */
  const W=glbScene(buf,S3.full);S3.world=W.root;S3.nodes=W.nodes;S3.mats=W.mats;sc.add(W.root);W.root.updateMatrixWorld(true);
  /* the motor and rocket parts (models/kit.glb): not in the scene; s3Setup clones what each design needs */
  if(kit){const K=glbScene(kit,S3.full);K.root.traverse(o=>{if(o.material)o.material.userData.shared=true;});S3.kit={nodes:K.nodes,mats:K.mats,root:K.root};}
  /* sprites: smoke (normal blending) and glow (additive), one Points each, positions rewritten every frame */
  S3.smoke=s3Points(S3_N.full,false);S3.glow=s3Points(60,true);sc.add(S3.smoke.pts,S3.glow.pts);
  /* debris: small dark chunks, one instanced mesh */
  S3.deb=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshLambertMaterial({color:0x2E3135}),28);S3.deb.count=0;S3.deb.castShadow=true;
  S3.deb.instanceMatrix.setUsage(T.DynamicDrawUsage);S3.deb.userData.keepMat=true;S3.deb.frustumCulled=false;sc.add(S3.deb);
  /* the flash after a burst: a white wash over the view */
  const fl=document.createElement("div");fl.className="s3-flash";cv.parentNode.appendChild(fl);S3.flash=fl;
  const lb=document.createElement("div");lb.className="s3-shot";lb.setAttribute("aria-hidden","true");cv.parentNode.appendChild(lb);S3.label=lb;
  s3Input(cv);s3Tier(S3.full?"full":"lite");S3.ok=true;return true;}
/* a pool of point sprites. Each has a position, a size (m) and an alpha; the shader makes it a soft disc */
function s3Points(n,add){
  const T=THREE,geo=new T.BufferGeometry(),P=new Float32Array(n*3),Z=new Float32Array(n),A=new Float32Array(n),C=new Float32Array(n);
  geo.setAttribute("position",new T.BufferAttribute(P,3).setUsage(T.DynamicDrawUsage));geo.setAttribute("size",new T.BufferAttribute(Z,1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute("alpha",new T.BufferAttribute(A,1).setUsage(T.DynamicDrawUsage));geo.setAttribute("seed",new T.BufferAttribute(C,1));
  for(let i=0;i<n;i++)C[i]=h01(i*3.1);
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:add?T.AdditiveBlending:T.NormalBlending,
    uniforms:{scale:{value:500},tint:{value:add?new T.Vector3(1,0.72,0.38):new T.Vector3(0.70,0.69,0.67)}},
    vertexShader:"attribute float size;attribute float alpha;attribute float seed;uniform float scale;varying float va;varying float vs;"+
      "void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*scale/max(0.05,-mv.z),0.0,700.0);va=alpha*clamp((-mv.z-size*0.25)/(size*0.5),0.0,1.0);vs=seed;}",
    fragmentShader:add?"uniform vec3 tint;varying float va;void main(){vec2 q=gl_PointCoord-0.5;float d=length(q)*2.0;float a=va*pow(max(0.0,1.0-d),2.0);"+
        "gl_FragColor=vec4(mix(tint,vec3(1.0,0.97,0.88),pow(max(0.0,1.0-d),5.0))*a,a);}"
      :"uniform vec3 tint;varying float va;varying float vs;void main(){vec2 q=gl_PointCoord-0.5;float d=length(q)*2.0;float lump=0.82+0.18*sin(atan(q.y,q.x)*3.0+vs*40.0);"+
        "float a=va*(1.0-smoothstep(0.35*lump,1.0*lump,d));if(a<0.004)discard;vec3 c=tint*(1.06-0.22*gl_PointCoord.y);gl_FragColor=vec4(c,a);}"});
  const pts=new T.Points(geo,mat);pts.frustumCulled=false;pts.renderOrder=2;
  return{pts,P,Z,A,n,geo};}
/* the plume: a shell whose radius profile and glow come from a shader. Local +X is the exhaust direction, origin the exit */
function s3Plume(core){
  const T=THREE,geo=new T.CylinderGeometry(1,1,1,22,32,true);geo.translate(0,0.5,0);geo.rotateZ(-Math.PI/2);
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,
    uniforms:{L:{value:1},R:{value:0.02},F:{value:0},time:{value:0},dia:{value:0},pinch:{value:0},flick:{value:1},core:{value:core?1:0}},
    vertexShader:"uniform float L,R,F,dia,pinch,time,flick,core;varying float vu;varying vec3 vn;varying vec3 vv;"+
      "void main(){float u=position.x;vu=u;float spread=core>0.5?0.8:2.4+1.8*F;"+
      "float r=R*(1.0+spread*u)*(1.0-0.75*smoothstep(0.55,1.0,u));"+
      "r*=1.0+dia*0.22*sin(u*18.0)*(1.0-u);r*=1.0-pinch*0.35*sin(min(u*5.0,3.1416));"+
      "r*=1.0+flick*0.05*sin(time*53.0+u*9.0);"+
      "vec3 p=vec3(u*L,position.y*r,position.z*r);vec4 mv=modelViewMatrix*vec4(p,1.0);vv=normalize(-mv.xyz);vn=normalize(normalMatrix*vec3(0.0,position.y,position.z));"+
      "gl_Position=projectionMatrix*mv;}",
    fragmentShader:"uniform float F,dia,time,flick,core;varying float vu;varying vec3 vn;varying vec3 vv;"+
      "void main(){float face=pow(abs(dot(vn,vv)),core>0.5?1.2:2.2);"+
      "vec3 hot=vec3(1.0,0.97,0.86),mid=vec3(1.0,0.66,0.26),cool=vec3(0.86,0.32,0.14);"+
      "vec3 c=vu<0.25?mix(hot,mid,vu/0.25):mix(mid,cool,(vu-0.25)/0.75);"+
      "float fade=(1.0-smoothstep(0.35,1.0,vu))*smoothstep(0.0,0.03,vu+0.03);"+
      "float fl=1.0+flick*(0.12*sin(time*71.0+vu*23.0)+0.08*sin(time*137.0-vu*41.0));"+
      "float dm=dia*exp(-pow(fract(vu*5.5)-0.5,2.0)*60.0)*(1.0-vu)*1.4;"+
      "float a=face*fade*fl*(core>0.5?0.95:0.55)*clamp(F*1.4,0.0,1.0)+dm*face;"+
      "gl_FragColor=vec4((c+dm*hot)*a,a);}"});
  const m=new T.Mesh(geo,mat);m.frustumCulled=false;m.renderOrder=3;return m;}
/* ---- per firing ---- */
/* Texture tiles (m) for the parts made or re-materialled here: a texture repeats every tile metres */
const S3_TILE={metal:0.4,paint:0.8,kraft:0.3,carbon:0.1,glass:0.2,graphite:0.06,wood:0.4};
/* case materials (o.caseMat): colour, metalness, roughness, texture. Kraft and wood carry their own colour */
const S3_CASE={phenolic:[0xB09C8A,0,0.45,"kraft"],mild:[0x6B7076,0.3,0.6,"paint"],al6061:[0xB8BDC3,0.7,0.38,"metal"],
  cromo:[0x6A6F75,0.65,0.42,"metal"],composite:[0x4A4D52,0.2,0.45,"carbon"]};
/* rocket finishes by body tube family (rk.body starts kraft, glass or carbon): body, fins, nose (moulded plastic, no
   texture: the weathered paint looks dirty on a new nose), aft centering ring; tip: a metal nose tip */
const S3_ROCKET={kraft:{body:[0xFFFFFF,0,0.85,"kraft"],fin:[0xFFFFFF,0,0.75,"wood"],nose:[0xEDEBE5,0.05,0.4,null],ring:[0xFFFFFF,0,0.8,"wood"],tip:false},
  glass:{body:[0xE6E2D6,0.05,0.5,"glass"],fin:[0x2A55C9,0.05,0.5,"glass"],nose:[0xEDEBE5,0.05,0.45,"glass"],ring:[0x3E4247,0.3,0.6,"paint"],tip:true},
  carbon:{body:[0x4A4D52,0.25,0.4,"carbon"],fin:[0x4A4D52,0.25,0.4,"carbon"],nose:[0xEDEBE5,0.05,0.35,null],ring:[0x3E4247,0.3,0.6,"paint"],tip:true}};
function s3Setup(o){
  const T=THREE;S3.o=o;S3.shot=0;S3.orbit=null;S3.lastT=null;
  /* free the last firing's pieces; the kit's geometry and the shared (cached) materials stay */
  if(S3.rig){S3.sc.remove(S3.rig);S3.rig.traverse(x=>{if(x.isInstancedMesh)x.dispose();if(x.geometry&&!x.geometry.userData.kit)x.geometry.dispose();
    const m=x.material;if(m&&m.dispose&&!x.userData.shared&&!(m.userData&&m.userData.shared))m.dispose();});}
  const rig=S3.rig=new T.Group();S3.sc.add(rig);
  Object.assign(S3,{motor:null,rocket:null,nozzle:null,caseMesh:null,ign:null,keep:null,boltA:null,jet:null,halves:[],exitL:null,lift:0.02});
  if(o.mode==="stand")(S3.kit?s3KitStand:s3PlainStand)(o,rig);
  else{(S3.kit?s3KitLaunch:s3PlainLaunch)(o,rig);
    /* the wind blows along this direction (horizontal); the sim's drift x is along it */
    S3.wdir=new T.Vector3(0.8,0,0.6).normalize();}
  S3.deb.count=0;S3.flash.style.opacity=0;s3Label();return S3.R!=null;}
/* a material made here, cached for the tier and flagged shared (teardown keeps it, swapMats converts it on a tier change) */
function s3Mat(c,metal,rough,tex,vc,side){
  const C=S3.mc||(S3.mc=new Map()),k=[S3.full?1:0,c,metal,rough,tex||"",vc?1:0,side||0].join("|");let m=C.get(k);
  if(!m){m=makeMat(S3.full,new THREE.Color(c),metal,rough,tex||null,!!vc,null);if(side)m.side=side;m.userData.shared=true;C.set(k,m);}
  return m;}
/* a kit material for the current tier (the kit was loaded at the tier of the day; a later change gets a cached copy) */
function s3KitMat(m){
  if(!!m.isMeshStandardMaterial===S3.full)return m;const A=S3.kalt||(S3.kalt=new Map());let n=A.get(m);
  if(!n||!!n.isMeshStandardMaterial!==S3.full){const u=m.userData;n=makeMat(S3.full,m.color.clone(),u.metal??0,u.rough??1,u.tex,u.vc,u.emit);
    n.side=m.side;n.name=m.name;n.userData.shared=true;A.set(m,n);}
  return n;}
/* a copy of a kit part (models/kit.glb, see tools/blender-kit.py for each part's unit and anchor) added to par. Its meshes
   share the kit's geometry unless uv=[su,sv,swap] is given: then the geometry is copied and its uv multiplied (and u and v
   swapped when swap is set: brushed metal streaks along a tube rather than round it). mat: one material
   for all its meshes (else the kit's own). scl: a number or a Vector3 */
function s3Kit(name,par,pos,scl,mat,uv){
  const n=S3.kit.nodes[name];if(!n)return null;const T=THREE,g=new T.Group();g.name=name;
  for(const c of n.children){if(!c.isMesh)continue;let geo=c.geometry;geo.userData.kit=true;
    if(uv){geo=geo.clone();geo.userData={};uvScale(geo,uv[0],uv[1]);const a=geo.attributes.uv;if(uv[2]&&a)for(let i=0;i<a.count;i++)a.setXY(i,a.getY(i),a.getX(i));}
    const m=new T.Mesh(geo,mat||s3KitMat(c.material));m.castShadow=m.receiveShadow=true;g.add(m);}
  if(pos)g.position.copy(pos);if(typeof scl==="number")g.scale.setScalar(scl);else if(scl)g.scale.copy(scl);
  if(par)par.add(g);return g;}
/* a kit part repeated: one instanced mesh per material in it, one instance per matrix (bolt rings, saddles, buttons) */
function s3KitInst(name,par,mats,mat,geoFn){
  const n=S3.kit.nodes[name],out=[];if(!n||!mats.length)return out;
  for(const c of n.children){if(!c.isMesh)continue;let geo=c.geometry;geo.userData.kit=true;if(geoFn){geo=geoFn(geo.clone());geo.userData={};}
    const im=new THREE.InstancedMesh(geo,mat||s3KitMat(c.material),mats.length);mats.forEach((M,i)=>im.setMatrixAt(i,M));
    im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();im.castShadow=im.receiveShadow=true;par.add(im);out.push(im);}
  return out;}
/* a lathe from a profile of [radius, height, sharp] points (sharp: a corner, its normals not smoothed round it), with the
   uv in tiles: u round the axis at radius uR, v along the profile */
function s3Lathe(P,seg,uR,tile){
  const T=THREE,pts=[];
  /* a corner gets a twin a hair along the next edge: three's lathe weights each edge's normal by its length, so the
     twin splits the normals there */
  P.forEach((p,k)=>{pts.push(new T.Vector2(p[0],p[1]));const q=P[k+1];if(p[2]&&q&&k>0)pts.push(new T.Vector2(p[0]+(q[0]-p[0])*0.004,p[1]+(q[1]-p[1])*0.004));});
  const geo=new T.LatheGeometry(pts,seg),uv=geo.attributes.uv,np=pts.length,arc=[0];
  for(let j=1;j<np;j++)arc.push(arc[j-1]+pts[j].distanceTo(pts[j-1]));
  for(let i=0;i<=seg;i++)for(let j=0;j<np;j++)uv.setXY(i*np+j,i/seg*2*Math.PI*uR/tile,arc[j]/tile);
  uv.needsUpdate=true;return geo;}
/* the nozzle's graphite bell, lathed from the real contour: the converging inlet, the throat, the 15-degree cone to the
   exit, the lip, and the outside back into the housing. Local +X is the flow; x = 0 is its seat, Hs the housing's face */
function s3Bell(o,r,nl,Hs){
  const T=THREE,RB=0.56*r,rt=Math.max(0.0015,Math.min(o.rt,RB*0.8)),re=Math.max(rt*1.05,o.re),w=Math.max(0.04*r,0.0012);
  const xt=Math.max(nl*0.2,Math.min(nl*0.75,nl-(re-rt)/Math.tan(15*Math.PI/180))),rin=Math.min(0.92*RB,Math.max(rt*1.4,0.6*r));
  const inner=x=>x>=xt?rt+(re-rt)*(x-xt)/(nl-xt):rin,eH=Math.max(0.92*RB,inner(Math.max(Hs,xt))+w);
  const P=[[rin,0,1],[rin*0.97,0.3*xt,0],[rt+(rin-rt)*0.32,0.66*xt,0],[rt*1.05,0.9*xt,0],[rt,xt,0],[rt+(re-rt)*0.05,xt+0.05*(nl-xt),0],
    [re,nl,1],[re+w,nl,1],[eH,Hs,1],[RB*0.995,Hs,1],[RB*0.995,0,0]];
  const m=new T.Mesh(s3Lathe(P,S3.full?32:20,RB,S3_TILE.graphite),s3Mat(0x3A3C40,0.1,0.75,"graphite",false,T.DoubleSide));
  m.rotation.z=-Math.PI/2;m.castShadow=m.receiveShadow=true;return m;}
/* a fin: a slab of thickness th with its edges bevelled (width w) to a thin rounded edge, the root left square (it sits in
   the body). P: the outline, counter-clockwise seen from +Z, its last edge (P[n-1] to P[0]) the root. UVs in tiles */
function s3FinGeo(P,th,w,tile){
  const T=THREE,n=P.length,Ls=[],I=[],pos=[],uv=[],h=th/2,e=th*0.14;
  for(let k=0;k<n;k++){const a=P[k],b=P[(k+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),d=k===n-1?0:w;
    Ls.push({a:[a[0]-dy/l*d,a[1]+dx/l*d],d:[dx/l,dy/l],o:[dy/l,-dx/l]});}
  for(let k=0;k<n;k++){const A=Ls[(k+n-1)%n],B=Ls[k],den=A.d[0]*B.d[1]-A.d[1]*B.d[0],t=((B.a[0]-A.a[0])*B.d[1]-(B.a[1]-A.a[1])*B.d[0])/den;
    I.push([A.a[0]+A.d[0]*t,A.a[1]+A.d[1]*t]);}
  const tri=(a,b,c,wx,wy,wz)=>{const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    if((uy*vz-uz*vy)*wx+(uz*vx-ux*vz)*wy+(ux*vy-uy*vx)*wz<0){const s=b;b=c;c=s;}
    for(const p of[a,b,c]){pos.push(p[0],p[1],p[2]);uv.push(p[0]/tile,p[1]/tile);}};
  const quad=(a,b,c,d,wx,wy,wz)=>{tri(a,b,c,wx,wy,wz);tri(a,c,d,wx,wy,wz);};
  const at=(p,z)=>[p[0],p[1],z];
  for(let k=1;k<n-1;k++){tri(at(I[0],h),at(I[k],h),at(I[k+1],h),0,0,1);tri(at(I[0],-h),at(I[k],-h),at(I[k+1],-h),0,0,-1);}
  for(let k=0;k<n;k++){const j=(k+1)%n,o=Ls[k].o;
    quad(at(I[k],h),at(I[j],h),at(P[j],e),at(P[k],e),o[0],o[1],0.6);
    quad(at(P[k],e),at(P[j],e),at(P[j],-e),at(P[k],-e),o[0],o[1],0);
    quad(at(P[k],-e),at(P[j],-e),at(I[j],-h),at(I[k],-h),o[0],o[1],-0.6);}
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(pos,3));geo.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  geo.computeVertexNormals();return geo;}
/* the motor on Stand 3, assembled from the kit to this design. Group origin: the load-cell face (motorMount); +X aft */
function s3KitStand(o,rig){
  const T=THREE,V=(x,y,z)=>new T.Vector3(x,y,z),Q0=new T.Quaternion(),mt=S3.nodes.motorMount,base=mt?mt.position.clone():V(-0.04,0.85,0);
  const r=o.dia/2,s=r,cl=o.caseLen,nl=Math.max(0.01,o.len-cl);
  /* the closures keep their shape (scaled by r) but give way on a stubby case: together at most 40% of its length */
  const kx=Math.min(1,cl*0.4/(0.42*s)),x0=0.30*s*kx,x1=cl-0.12*s*kx,tl=Math.max(0.001,x1-x0);
  const g=S3.motor=new T.Group();g.position.copy(base);rig.add(g);const keep=S3.keep=new Set();
  /* the case: the tube in its own material, the stencil band, the test label and a taped thermocouple */
  const cc=S3_CASE[o.caseMat]||S3_CASE.al6061,ct=S3_TILE[cc[3]],caseM=s3Mat(cc[0],cc[1],cc[2],cc[3]);
  S3.caseMesh=s3Kit("caseTube",g,V(x0,0,0),V(tl,r,r),caseM,[r/ct,tl/ct,cc[3]==="metal"]);
  const bw=Math.min(tl*0.08,Math.max(0.012,0.5*r)),pt=S3_TILE.paint;
  if(tl>bw*4)s3Kit("caseBand",g,V(x0+0.12*tl,0,0),V(bw,r,r),s3Mat(0xA8322A,0,0.8,"paint"),[r/pt,bw/pt]);
  /* the label goes where no saddle strap crosses it */
  const xs=Object.keys(S3.nodes).filter(k=>/^cradle/.test(k)).map(k=>S3.nodes[k].position.x).filter(x=>x>base.x+x0+0.04&&x<base.x+x1-0.04);
  const one=!xs.length;if(one)xs.push(base.x+x0+tl*0.5);
  const sx=Math.max(0.035,Math.min(0.1,r)),lw=Math.min(r,tl*0.45/1.6);
  const lx=[0.22,0.3,0.14,0.4,0.5].map(f=>x0+f*tl).find(a=>a+1.6*lw<x1-0.3*r&&xs.every(x=>x-base.x+0.12*sx<a||x-base.x-0.12*sx>a+1.6*lw));
  s3Kit("caseLabel",g,V(lx!=null?lx:x0+0.22*tl,0,0),V(lw,r,r));
  s3Kit("tcPatch",g,V(Math.max(x0+0.5*tl,Math.min(x0+0.8*tl,x1-0.3*r)),0,0),r);
  /* the forward closure against the load cell, and the pressure transducer in its port: they stay put after a burst */
  keep.add(s3Kit("fwdClosure",g,V(x0,0,0),V(s*kx,s,s)));
  keep.add(s3Kit("transducer",g,V(x0-0.20*s*kx,0.56*s,0),0.01*Math.max(0.6,Math.min(1,r/0.04))));
  /* bolt rings: radial screws through the case into each closure, instanced. The aft ring flies on a burst or ejection */
  const hd=Math.max(0.004,Math.min(0.02,0.22*r)),nb=Math.max(6,Math.min(24,2*Math.round(Math.PI*r/(3.2*hd))));
  const ring=x=>{const M=[];for(let i=0;i<nb;i++){const a=(i+0.5)/nb*Math.PI*2;
    M.push(new T.Matrix4().compose(V(x,r*Math.cos(a),r*Math.sin(a)),new T.Quaternion().setFromAxisAngle(V(1,0,0),a),V(hd,hd,hd)));}return M;};
  s3KitInst("bolt",g,ring(x0+0.16*s*kx)).forEach(m=>keep.add(m));
  const rest=ring(x1-0.06*s*kx);S3.boltA={ims:s3KitInst("bolt",g,rest),rest,moved:false};S3.boltA.ims.forEach(m=>keep.add(m));
  /* the aft closure, then the nozzle (its own group, so an ejection can throw it): steel housing, graphite bell, igniter */
  s3Kit("aftClosure",g,V(cl,0,0),V(s*kx,s,s));
  const nz=S3.nozzle=new T.Group();nz.position.x=cl;g.add(nz);
  const hx=Math.min(s,nl*0.75/0.5);s3Kit("nozzleHousing",nz,null,V(hx,s,s));nz.add(s3Bell(o,r,nl,0.5*hx));
  S3.ign=s3Kit("igniter",nz,V(nl,0,0),0.01*Math.max(0.7,Math.min(1,r/0.03)));
  S3.exit=V(cl+nl,0,0);
  /* saddles at the stand's cradles (or one in the middle of a short motor): strap and block on the case, a post below */
  const SM=xs.map(x=>new T.Matrix4().compose(V(x-base.x,0,0),Q0,V(sx,r,r)));
  for(const nm of["saddleBand","saddleBlock"])s3KitInst(nm,g,SM).forEach(m=>keep.add(m));
  const y0=one?0.42:0.64,ph=Math.max(0.005,base.y-1.15*r-y0),pw=Math.max(0.03,0.3*sx),pd=Math.max(0.04,1.6*r);
  const posts=new T.InstancedMesh(new T.BoxGeometry(1,1,1),s3Mat(0x3E4247,0.3,0.7,"paint"),xs.length);
  xs.forEach((x,i)=>posts.setMatrixAt(i,new T.Matrix4().compose(V(x,y0+ph/2,0),Q0,V(pw,ph,pd))));
  posts.instanceMatrix.needsUpdate=true;posts.computeBoundingSphere();posts.castShadow=posts.receiveShadow=true;rig.add(posts);
  /* plume (outer and core), the side jet for a burn-through */
  S3.plume=s3Plume(false);S3.core=s3Plume(true);S3.plume.position.copy(S3.exit);S3.core.position.copy(S3.exit);g.add(S3.plume,S3.core);
  S3.jet=s3Plume(false);S3.jet.position.set(cl*0.55,r,0);S3.jet.rotation.set(0.6,0,Math.PI/2);g.add(S3.jet);
  /* the halves a burst throws: the tube cut lengthwise, in the case's material seen from both sides */
  const hm=caseM.clone();hm.side=T.DoubleSide;hm.userData.shared=false;
  S3.halves=[0,1].map(i=>{const h=new T.Mesh(uvScale(new T.CylinderGeometry(r,r,tl,20,1,true,i*Math.PI,Math.PI),Math.PI*r/ct,tl/ct),hm);
    h.castShadow=true;h.visible=false;rig.add(h);return h;});
  S3.base=base;S3.scale=Math.max(o.len,0.25);}
/* the rocket at the rail, from the kit and lathes: body tube, nose and tip, bevelled fins with fillets, rail buttons, the
   avionics band, and the motor's aft end in its retainer. Group origin: the body's aft end on its axis; local +Y is up */
function s3KitLaunch(o,rig){
  const T=THREE,V=(x,y,z)=>new T.Vector3(x,y,z),Q0=new T.Quaternion(),rk=o.rocket,D=rk.D,R=D/2,L=rk.L,noseL=Math.min(L*0.4,3*D),bodyL=L-noseL;
  const rb=S3.nodes.railBase,base=rb?rb.position.clone():V(-12,0.24,-70),seg=S3.full?32:20;
  const F=S3_ROCKET[rk.body.startsWith("kraft")?"kraft":rk.body.startsWith("glass")?"glass":"carbon"],M=a=>s3Mat(a[0],a[1],a[2],a[3]),TL=a=>S3_TILE[a[3]];
  const rm=o.dia/2,cl=o.caseLen,nl=Math.max(0.01,o.len-cl),ret=R>=1.55*rm;
  const g=S3.rocket=new T.Group();rig.add(g);
  /* the motor's aft end: held by the screw-on retainer when the body has room, else flush; mg's +X points down */
  const ya=ret?-0.42*rm:-0.12*rm;if(ret)s3Kit("motorRetainer",g,null,rm);
  const mg=new T.Group();mg.rotation.z=-Math.PI/2;mg.position.y=ya+cl;g.add(mg);
  s3Kit("aftClosure",mg,V(cl,0,0),rm);
  const nz=S3.nozzle=new T.Group();nz.position.x=cl;mg.add(nz);
  const hx=Math.min(rm,nl*0.75/0.5);s3Kit("nozzleHousing",nz,null,V(hx,rm,rm));nz.add(s3Bell(o,rm,nl,0.5*hx));
  /* the igniter leads hang out of the nozzle: tilted so both the leads and the wire fall roughly downward */
  S3.ign=s3Kit("igniter",nz,V(nl,0,0),0.01*Math.max(0.7,Math.min(1,rm/0.03)));if(S3.ign)S3.ign.rotation.z=0.65;
  S3.plume=s3Plume(false);S3.core=s3Plume(true);for(const p of[S3.plume,S3.core]){p.position.set(cl+nl,0,0);mg.add(p);}
  S3.exitL=V(0,ya-nl,0);S3.lift=nl-ya+0.02;
  g.position.set(base.x-(R+0.03),base.y+S3.lift,base.z);
  /* body tube and the aft centering ring */
  const bt=TL(F.body),bg=uvScale(new T.CylinderGeometry(R,R,bodyL,seg,1,true),2*Math.PI*R/bt,bodyL/bt);bg.translate(0,bodyL/2,0);
  const body=new T.Mesh(bg,M(F.body));body.castShadow=body.receiveShadow=true;g.add(body);
  const rgt=TL(F.ring),rg=uvScale(new T.RingGeometry(ret?1.45*rm:rm*1.02,R*0.995,seg,1),2*R/rgt,2*R/rgt);
  const cr0=new T.Mesh(rg,M(F.ring));cr0.rotation.x=Math.PI/2;cr0.position.y=0.0015;g.add(cr0);
  /* the nose: a real tangent ogive, von Karman or cone of length noseL, with its shoulder in the body, a seam groove at
     the joint and (glass and carbon rockets) a metal tip */
  const lt=F.tip?Math.max(0.008,Math.min(0.05,0.1*noseL)):0,gr=Math.max(0.0004,0.006*R),gw=Math.max(0.001,0.025*R);
  const rho=(R*R+noseL*noseL)/(2*R),prof=x=>{const d=Math.max(0,noseL-x);
    if(rk.nose==="cone")return R*d/noseL;
    if(rk.nose==="karman"){const th=Math.acos(Math.max(-1,Math.min(1,1-2*d/noseL)));return R/Math.sqrt(Math.PI)*Math.sqrt(Math.max(0,th-Math.sin(2*th)/2));}
    return Math.max(0,Math.sqrt(Math.max(0,rho*rho-(noseL-d)*(noseL-d)))+R-rho);};
  const xe=noseL-lt,NP=[[0,-0.6*R,0],[0.97*R,-0.6*R,1],[0.97*R,0,1],[R-gr,0,1],[R-gr,gw*0.5,1],[R,gw,1]],nN=S3.full?26:14;
  for(let i=1;i<=nN;i++){const u=i/nN,x=gw+(xe-gw)*(1-(1-u)*(1-u));NP.push([Math.max(lt?0:0.0002,prof(x)),x,0]);}
  if(lt)NP.push([0,xe,0]);else NP[NP.length-1][0]=0;
  const nt=TL(F.nose),nose=new T.Mesh(s3Lathe(NP,seg,R,nt),M(F.nose));nose.position.y=bodyL;nose.castShadow=nose.receiveShadow=true;g.add(nose);
  if(lt)s3Kit("noseTip",g,V(0,bodyL+xe,0),V(prof(xe),lt,prof(xe)));
  /* fins: bevelled slabs, instanced round the body, turned so none points at the rail; a fillet each side of each root */
  const nf=rk.fins==="four"||rk.fins==="long"?4:3,cr=rk.fins==="long"?2.6*D:rk.fins==="swept"?2.0*D:1.5*D,span=rk.fins==="swept"?1.3*D:D,
    sweep=rk.fins==="swept"?0.9*D:0.4*D,ct=rk.fins==="long"?1.8*D:0.6*D,th=Math.max(0.002,Math.min(0.008,0.04*D)),y0=0.01;
  const fg=s3FinGeo([[0,0],[span,cr-sweep-ct],[span,cr-sweep],[0,cr]],th,Math.min(th*2.5,span*0.08),TL(F.fin));
  const at=(i,x,y,z,sc)=>new T.Matrix4().makeRotationY((i+0.5)/nf*Math.PI*2).multiply(new T.Matrix4().compose(V(x,y,z),Q0,sc||V(1,1,1)));
  const FI=[],FA=[],FB=[],fs=Math.max(0.003,Math.min(0.012,0.06*D)),fsc=V(fs,cr,fs);
  for(let i=0;i<nf;i++){FI.push(at(i,R*0.97,y0,0));FA.push(at(i,R*0.995,y0,-th/2,fsc));FB.push(at(i,R*0.995,y0,th/2,fsc));}
  const fins=new T.InstancedMesh(fg,M(F.fin),nf);FI.forEach((m,i)=>fins.setMatrixAt(i,m));fins.instanceMatrix.needsUpdate=true;fins.computeBoundingSphere();
  fins.castShadow=fins.receiveShadow=true;g.add(fins);
  const flm=s3Mat(F.fin[0],F.fin[1],F.fin[2],F.fin[3],true),fut=g2=>uvScale(g2,fs/TL(F.fin),cr/TL(F.fin));
  s3KitInst("finFillet",g,FA,flm,fut);
  s3KitInst("finFillet",g,FB,flm,g2=>{fut(g2);g2.scale(1,1,-1);const ix=g2.index;if(ix)for(let k=0;k<ix.count;k+=3){const a=ix.getX(k+1);ix.setX(k+1,ix.getX(k+2));ix.setX(k+2,a);}return g2;});
  /* rail buttons on the rail side (+X), a low one and one up the body */
  const bh=Math.max(0.0057,Math.min(0.011,0.07*D));
  s3KitInst("railButton",g,[Math.min(bodyL*0.3,Math.max(cr*0.5,0.06)),bodyL*0.62].map(y=>new T.Matrix4().compose(V(R*0.995,y,0),Q0,V(0.03,bh,bh))));
  /* the payload bay above the motor: switch band and vents, a camera pod on the big ones; shear pins at the nose joint and
     the black roll pattern under it */
  const mTop=ya+cl,bay=bodyL-mTop;
  s3Kit("shearPins",g,V(0,bodyL-0.35*R,0),R);
  const rl=Math.min(1.5*D,bodyL*0.15);s3Kit("rollBand",g,V(0,bodyL-0.8*R-rl,0),V(R,rl,R));
  if(bay>2.4*R+rl){const yb=mTop+(bay-rl)*0.3;s3Kit("switchBand",g,V(0,yb,0),R);s3Kit("ventRing",g,V(0,yb+1.1*R,0),R);
    if(D>=0.08){const cam=s3Kit("camShroud",g,V(0,mTop+bay*0.1,-R),0.01);if(cam)cam.rotation.y=Math.PI/2;}}
  S3.base=base;S3.scale=L;}
/* the plain stand when models/kit.glb is missing: cylinders and a lathe, no textures */
function s3PlainMat(c,metal,rough){const T=THREE,m=S3.full?new T.MeshStandardMaterial({color:c,metalness:Math.min(metal,0.4),roughness:rough}):new T.MeshLambertMaterial({color:c});m.userData.metal=metal;m.userData.rough=rough;return m;}
function s3PlainStand(o,rig){
  const T=THREE,mat=s3PlainMat,CASEC={phenolic:[0x8A5A3A,0,0.8],mild:[0x5F646B,0.6,0.5],al6061:[0xB4B9BF,0.7,0.38],cromo:[0x4E5359,0.65,0.45],composite:[0x2B2D30,0.2,0.5]};
  const mt=S3.nodes.motorMount,base=mt?mt.position.clone():new T.Vector3(-0.04,0.85,0),r=o.dia/2,cl=o.caseLen,nl=Math.max(0.01,o.len-cl);
  const g=S3.motor=new T.Group();g.position.copy(base);rig.add(g);
  const cc=CASEC[o.caseMat]||CASEC.al6061,caseM=mat(cc[0],cc[1],cc[2]);
  const cyl=(rad,len,x,m,seg)=>{const c=new T.Mesh(new T.CylinderGeometry(rad,rad,len,seg||28),m);c.rotation.z=-Math.PI/2;c.position.x=x;c.castShadow=c.receiveShadow=true;return c;};
  const body=S3.caseMesh=cyl(r,cl,cl/2,caseM);g.add(body);
  g.add(cyl(r*1.05,Math.max(0.008,r*0.25),Math.max(0.004,r*0.12),mat(0x3E4247,0.5,0.5)));          // forward closure
  g.add(cyl(r*1.012,Math.max(0.01,cl*0.05),cl*0.14,mat(0xA8322A,0,0.8)));                            // stencil band
  g.add(cyl(r*1.03,Math.max(0.006,r*0.18),cl-Math.max(0.003,r*0.09),mat(0x3E4247,0.5,0.5)));        // aft closure ring
  /* nozzle: a graphite housing and the bell; it is its own group so an ejection can throw it */
  const nz=S3.nozzle=new T.Group();nz.position.x=cl;g.add(nz);
  const rt=Math.max(0.002,o.rt),re=Math.max(rt*1.05,o.re);
  const prof=[[r*0.92,0],[r*0.92,nl*0.35],[Math.max(re*1.12,rt*1.6),nl],[re,nl],[rt,nl*0.38],[rt*1.4,nl*0.2],[r*0.6,0.0001]].map(([a,b])=>new T.Vector2(a,b));
  const lat=new T.Mesh(new T.LatheGeometry(prof,28),mat(0x2E3034,0.1,0.7));lat.material.side=T.DoubleSide;lat.rotation.z=-Math.PI/2;lat.castShadow=true;nz.add(lat);
  S3.exit=new T.Vector3(cl+nl,0,0);
  /* saddles under the case at the stand's cradles (or one in the middle of a short motor) */
  const sad=mat(0x3E4247,0.5,0.5),xs=Object.keys(S3.nodes).filter(k=>/^cradle/.test(k)).map(k=>S3.nodes[k].position.x).filter(x=>x>base.x+0.05&&x<base.x+cl-0.05);
  const top=0.64;if(!xs.length)xs.push(base.x+cl/2);
  for(const x of xs){const y0=xs.length===1&&x===base.x+cl/2?0.42:top,hgt=Math.max(0.01,base.y-r-y0);
    const s=new T.Mesh(new T.BoxGeometry(0.05,hgt,Math.max(0.04,r*1.4)),sad);s.position.set(x,y0+hgt/2,0);s.castShadow=true;rig.add(s);
    const band=new T.Mesh(new T.CylinderGeometry(r*1.06,r*1.06,0.03,24,1,true),sad);band.rotation.z=-Math.PI/2;band.position.set(x-base.x,0,0);g.add(band);}
  /* plume (outer and core), the side jet for a burn-through */
  S3.plume=s3Plume(false);S3.core=s3Plume(true);S3.plume.position.copy(S3.exit);S3.core.position.copy(S3.exit);g.add(S3.plume,S3.core);
  S3.jet=s3Plume(false);S3.jet.position.set(cl*0.55,r,0);S3.jet.rotation.set(0.6,0,Math.PI/2);g.add(S3.jet);
  /* the halves a burst throws */
  S3.halves=[0,1].map(i=>{const h=new T.Mesh(new T.CylinderGeometry(r,r,cl,20,1,true,i*Math.PI,Math.PI),caseM);h.material.side=T.DoubleSide;h.castShadow=true;h.visible=false;rig.add(h);return h;});
  S3.base=base;S3.scale=Math.max(o.len,0.25);}
function s3PlainLaunch(o,rig){
  const T=THREE,mat=s3PlainMat;
  /* the rocket at the rail: body tube, nose, fins, the motor's nozzle peeping out. Local +Y is up, origin the aft end */
  const rk=o.rocket,D=rk.D,L=rk.L,noseL=Math.min(L*0.4,3*D),bodyL=L-noseL,rb=S3.nodes.railBase,base=rb?rb.position.clone():new T.Vector3(-12,0.24,-70);
  const BODYC=rk.body.startsWith("kraft")?[0xB98F5E,0,0.85]:rk.body.startsWith("glass")?[0xE6E2D6,0.05,0.5]:[0x2A2C2F,0.25,0.45];
  const g=S3.rocket=new T.Group();g.position.set(base.x-(D/2+0.03),base.y+0.02,base.z);rig.add(g);
  const bm=mat(BODYC[0],BODYC[1],BODYC[2]);
  const tube=new T.Mesh(new T.CylinderGeometry(D/2,D/2,bodyL,24),bm);tube.position.y=bodyL/2;tube.castShadow=true;g.add(tube);
  const band=new T.Mesh(new T.CylinderGeometry(D/2*1.01,D/2*1.01,Math.max(0.02,bodyL*0.06),24),mat(0x2A55C9,0.1,0.6));band.position.y=bodyL*0.72;g.add(band);
  const np=[];for(let i=0;i<=12;i++){const u=i/12;const rr=rk.nose==="cone"?(1-u):rk.nose==="ogive"?Math.sqrt(Math.max(0,1-u*u)):Math.sqrt(Math.max(0,1-u))*(1-0.08*u);np.push(new T.Vector2(Math.max(0.0005,D/2*rr),u*noseL));}
  const nose=new T.Mesh(new T.LatheGeometry(np,24),mat(0xEDEBE5,0.05,0.5));nose.position.y=bodyL;nose.castShadow=true;g.add(nose);
  const nf=rk.fins==="four"||rk.fins==="long"?4:3,cr=rk.fins==="long"?2.6*D:rk.fins==="swept"?2.0*D:1.5*D,span=rk.fins==="swept"?1.3*D:D,sweep=rk.fins==="swept"?0.9*D:0.4*D,ct=rk.fins==="long"?1.8*D:0.6*D;
  const fv=[0,0,0, 0,cr,0, span,cr-sweep,0, span,cr-sweep-ct,0];
  const fg=new T.BufferGeometry();fg.setAttribute("position",new T.Float32BufferAttribute(fv,3));fg.setIndex([0,1,2,0,2,3]);fg.computeVertexNormals();
  const fm=mat(0x2A55C9,0.1,0.6);fm.side=T.DoubleSide;
  for(let i=0;i<nf;i++){const f=new T.Mesh(fg,fm),piv=new T.Group();f.position.set(D/2*0.98,0.01,0);f.castShadow=true;piv.add(f);piv.rotation.y=i/nf*Math.PI*2;g.add(piv);}
  const nzl=new T.Mesh(new T.CylinderGeometry(Math.max(0.004,o.re*1.1),Math.max(0.004,o.re*0.8),Math.max(0.01,D*0.25),16,1,true),mat(0x2E3034,0.1,0.7));nzl.material.side=T.DoubleSide;nzl.position.y=-D*0.1;g.add(nzl);
  S3.plume=s3Plume(false);S3.core=s3Plume(true);for(const p of[S3.plume,S3.core]){p.rotation.z=-Math.PI/2;p.position.y=-D*0.22;g.add(p);}
  S3.jet=null;S3.halves=[];S3.base=base;S3.scale=L;S3.motor=null;
  }
/* ---- per frame ---- */
function s3Draw(d){
  if(!S3.ok||!S3.o)return;const T=THREE,o=S3.o,t=d.t,still=!!d.still,fail=d.fail||null,age=fail?fail.age:0;S3.last=d;
  s3Size();s3Perf();
  const flame=t>=0&&d.f>0.003&&!(fail&&(fail.key==="cato"||fail.key==="eject")&&age>0.02)&&!(fail&&fail.key==="hangfire");
  if(S3.ign)S3.ign.visible=t<0.02||!!(fail&&fail.key==="hangfire");   // the igniter goes with the first flame
  const pr=d.p*(o.prE||0.05)/S3_AIR,diam=flame&&pr>1.15?Math.min(1,Math.log(pr)/1.2):0,pinch=flame&&pr<0.75?Math.min(1,(0.75-pr)*2):0;
  const fl=Math.max(0.03,Math.min(1.25,d.f)),re=Math.max(0.004,o.re);
  const L=re*(12+46*fl)*(o.mode==="launch"?1.3:1);
  for(const[p,k]of[[S3.plume,1],[S3.core,0.32]]){const u=p.material.uniforms;p.visible=flame;u.L.value=L*k;u.R.value=re*(k<1?0.75:1);u.F.value=fl;u.time.value=t;u.dia.value=k<1?0:diam;u.pinch.value=pinch;u.flick.value=still?0:1;}
  /* nozzle light */
  const ex=new T.Vector3();
  if(o.mode==="stand"){ex.copy(S3.exit);S3.motor.localToWorld(ex);}
  else{s3Rocket(t,d);if(S3.exitL)ex.copy(S3.exitL);else ex.set(0,-o.rocket.D*0.3,0);S3.rocket.localToWorld(ex);}
  S3.fire.position.copy(ex).add(new T.Vector3(re*6,o.mode==="launch"?-re*4:0.15,0));const reach=Math.max(0.3,o.len+L);S3.fire.intensity=flame?(still?1:0.85+0.15*Math.sin(t*61))*fl*2.2*reach*reach:0;S3.fire.distance=reach*8;
  if(o.mode==="stand")s3Fail(d,fail,age,still);
  s3Smoke(d,fail,age,ex);
  s3Camera(d,fail,age,still);
  /* the flash after a burst (a short soft fade with reduced motion) */
  S3.flash.style.opacity=fail&&fail.key==="cato"&&age>=0&&age<0.5?((still?0.5:0.9)*(1-age/0.5)).toFixed(3):"0";
  S3.R.render(S3.sc,S3.cam);}
function s3Redraw(){if(S3.last)s3Draw(S3.last);}
/* failure pieces on the stand: the case halves after a burst, the thrown nozzle, the side jet of a burn-through, debris */
function s3Fail(d,fail,age,still){
  const T=THREE,o=S3.o,key=fail&&age>=0?fail.key:null,g=S3.motor,b=S3.base,r=o.dia/2,cl=o.caseLen,G=9.81;
  const split=key==="cato",keep=S3.keep;if(S3.caseMesh)S3.caseMesh.visible=!split;
  /* a burst hides the case; the forward closure, transducer, saddles and the bolt rings (kit stand) stay or fly on their own */
  g.children.forEach(c=>{if(c!==S3.nozzle&&c!==S3.plume&&c!==S3.core&&c!==S3.jet&&!(keep&&keep.has(c)))c.visible=!split;});
  /* a body thrown from p0 with velocity v, stopping where it lands */
  const toss=(p0,v,a,floor)=>{const tl=(v.y+Math.sqrt(v.y*v.y+2*G*Math.max(0,p0.y-floor)))/G,tt=Math.min(a,tl);
    return{p:new T.Vector3(p0.x+v.x*tt,Math.max(floor,p0.y+v.y*tt-0.5*G*tt*tt),p0.z+v.z*tt),tt};};
  S3.halves.forEach((h,i)=>{h.visible=split;if(!split)return;const s=i?1:-1,v=new T.Vector3(1.2,4+2*o.dia*0,s*2.6),q=toss(new T.Vector3(b.x+cl/2,b.y,s*r*0.3),v,age,r*0.5);
    h.position.copy(q.p);h.rotation.set(s*q.tt*3,0,-Math.PI/2+q.tt*1.3);});
  /* the nozzle: thrown downrange after an ejection (a burst throws it too, shorter) */
  const nz=S3.nozzle;
  if(key==="eject"||key==="cato"){const v=key==="eject"?new T.Vector3(22,5,1.5):new T.Vector3(6,3.5,-1),q=toss(new T.Vector3(b.x+cl,b.y,0),v,age,0.05);
    g.worldToLocal(q.p);nz.position.copy(q.p);nz.rotation.set(q.tt*5,q.tt*2,q.tt*7);}
  else{nz.position.set(cl,0,0);nz.rotation.set(0,0,0);}
  /* the aft bolt ring: on a burst or an ejection each screw flies off outward and lands on the salt */
  const BA=S3.boltA;
  if(BA&&(key==="cato"||key==="eject")){const p=new T.Vector3(),q=new T.Quaternion(),sc=new T.Vector3(),e=new T.Euler(),m=new T.Matrix4();
    BA.rest.forEach((M,i)=>{M.decompose(p,q,sc);const v=new T.Vector3(0,p.y,p.z).normalize().multiplyScalar(2.5+h01(i+50)*4).add(new T.Vector3(1+h01(i+51)*2,1.5,0));
      const w=toss(p.clone().add(b),v,age,0.006);w.p.sub(b);q.multiply(new T.Quaternion().setFromEuler(e.set(w.tt*(9+i),w.tt*7,0)));m.compose(w.p,q,sc);
      for(const im of BA.ims)im.setMatrixAt(i,m);});
    for(const im of BA.ims){im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();}BA.moved=true;}
  else if(BA&&BA.moved){BA.rest.forEach((M,i)=>{for(const im of BA.ims)im.setMatrixAt(i,M);});for(const im of BA.ims){im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();}BA.moved=false;}
  if(S3.jet){const on=key==="burnthrough"&&age<1.6,u=S3.jet.material.uniforms;S3.jet.visible=on;if(on){const a=1-age/1.6;u.L.value=Math.max(0.1,r*14*a);u.R.value=r*0.25;u.F.value=a;u.time.value=d.t;u.dia.value=0;u.pinch.value=0;u.flick.value=still?0:1;}}
  /* debris: a fixed pattern of chunks on ballistic arcs */
  if(split){const n=S3.deb.count=28,m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3();
    for(let i=0;i<n;i++){const sp=4+h01(i+1)*14,az=h01(i+7)*Math.PI*2,el=0.2+h01(i+13)*1.1,v=new T.Vector3(Math.cos(az)*Math.cos(el)*sp,Math.sin(el)*sp,Math.sin(az)*Math.cos(el)*sp);
      const p0=new T.Vector3(b.x+cl*(0.15+0.7*h01(i+21)),b.y,0),z=Math.max(0.012,r*(0.15+0.35*h01(i+5))),tt=toss(p0,v,age,z/2);
      e.set(tt.tt*(4+i),tt.tt*(3+i*0.5),0);q.setFromEuler(e);sc.set(z*1.6,z*0.5,z);m.compose(tt.p,q,sc);S3.deb.setMatrixAt(i,m);}
    S3.deb.instanceMatrix.needsUpdate=true;}else S3.deb.count=0;}
/* the rocket's place and attitude at time t along the flown path; on the rail before liftoff */
function s3Rocket(t,d){
  const T=THREE,o=S3.o,g=S3.rocket,P=o.path,b=S3.base,D=o.rocket.D;
  const at=BURN_VIS.pathAt(P,Math.max(0,Math.min(t,P.t[P.t.length-1]))),pos=new T.Vector3(b.x-(D/2+0.03),b.y+(S3.lift||0.02)+at.h,b.z).addScaledVector(S3.wdir,at.x);
  g.position.copy(pos);
  /* attitude: along the air flowing past, from the path's slope less the wind */
  const i=Math.min(P.t.length-2,Math.max(0,at.i));let dir=new T.Vector3(0,1,0);
  if(at.h>3&&P.t.length>1){const dt=Math.max(1e-3,P.t[i+1]-P.t[i]),vx=(P.x[i+1]-P.x[i])/dt-(o.wind||0),vh=(P.h[i+1]-P.h[i])/dt;
    if(Math.hypot(vx,vh)>0.5){dir=new T.Vector3(0,vh,0).addScaledVector(S3.wdir,vx).normalize();if(dir.y<0.05&&vh>=0)dir.y=0.05;}}
  g.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);
  const lost=o.lost!=null&&t>=o.lost;g.visible=!lost;
  if(lost){const age=t-o.lost;S3.deb.count=18;const m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),sc=new T.Vector3(),G=9.81;
    for(let k=0;k<18;k++){const sp=3+h01(k+2)*12,az=h01(k+9)*6.283,el=h01(k+4)*2-0.6,v=new T.Vector3(Math.cos(az)*Math.cos(el)*sp,Math.sin(el)*sp,Math.sin(az)*Math.cos(el)*sp);
      const a=Math.min(age,6),p=pos.clone().addScaledVector(v,a);p.y=Math.max(0.03,p.y-0.5*G*a*a);e.set(a*(3+k),a*2,0);q.setFromEuler(e);const z=D*(0.3+0.6*h01(k));sc.set(z*2,z*0.4,z);
      m.compose(p,q,sc);S3.deb.setMatrixAt(k,m);}S3.deb.instanceMatrix.needsUpdate=true;}
  else S3.deb.count=0;}
/* smoke and glow. Each smoke puff is born at a fixed time (a steady rate) and its place is a formula of its age, so the
   same moment always looks the same. Stand: puffs leave the nozzle downrange, slow, rise and drift with the wind. Launch:
   puffs stay where the rocket was and spread into a trail */
function s3Smoke(d,fail,age,ex){
  const o=S3.o,t=d.t,S=S3.smoke,G=S3.glow,n=S3.full?S3_N.full:S3_N.lite,launch=o.mode==="launch";
  const tEnd=launch?Math.min(o.tBurn,o.tEnd):o.tEnd,wind=Math.max(0.5,o.wind||1.5),sz=Math.max(0.03,o.dia);
  const life=launch?1e9:4.2,emitEnd=(fail&&(fail.key==="cato"||fail.key==="eject")?Math.min(tEnd,t-age):tEnd)+(launch?0:1.2);
  const rate=launch?n/Math.max(0.6,emitEnd+0.4):n/life,dt=1/rate,P=S.P,Z=S.Z,A=S.A;let m=0;
  const kNow=Math.min(Math.floor(Math.max(0,t)/dt),Math.floor(emitEnd/dt)),T=THREE,w=launch?S3.wdir:new THREE.Vector3(0.25,0,0.97);
  if(t>=0&&!(fail&&fail.key==="hangfire"))for(let j=0;j<n&&m<n;j++){const k=kNow-j;if(k<0)break;const te=k*dt,a=t-te;if(te>emitEnd||a<0||a>life)continue;
    const fe=te<=tEnd?Math.max(0.15,o.fAt(te)):Math.max(0,0.25*(1-(te-tEnd)/1.2)),hk=h01(k),hk2=h01(k+0.5),hk3=h01(k+0.25);
    if(fe<=0)continue;
    if(launch){const pa=BURN_VIS.pathAt(o.path,te),D=o.rocket.D,bx=S3.base.x-(D/2+0.03),bz=S3.base.z;
      const sp=(0.4+a*0.9)*(0.6+hk);P[m*3]=bx+S3.wdir.x*(pa.x+wind*a*0.9)+(hk-0.5)*sp;P[m*3+1]=S3.base.y+Math.max(0.2,pa.h-D*2+(hk2-0.5)*sp*0.6)+Math.min(a,8)*0.25;P[m*3+2]=bz+S3.wdir.z*(pa.x+wind*a*0.9)+(hk3-0.5)*sp;
      const gap=1.7*(o.path.v[Math.min(pa.i,o.path.v.length-1)]||0)/rate;Z[m]=Math.max(D*2.5,gap,(D*3.5+a*1.6)*(0.7+0.6*hk)*(0.6+fe));A[m]=Math.min(0.6,0.5*fe+0.15)*Math.min(1,a*40)*Math.max(0,1-a/60);}
    else{/* puffs start where the plume thins out and drift on: downrange, up, and away with the wind */
      const Lp=o.re*(12+46*fe),run=Lp*(0.55+0.5*hk+1.4*(1-Math.exp(-a/0.7)));
      P[m*3]=ex.x+run+w.x*wind*a*0.8+(hk-0.5)*sz*4*a;P[m*3+1]=Math.max(sz,ex.y+(0.15+0.3*hk2)*a+0.06*a*a)+(hk2-0.5)*sz*2;P[m*3+2]=ex.z+w.z*wind*a*0.6+(hk3-0.35)*sz*(2+6*a);
      Z[m]=sz*(3+a*(7+12*fe))*(0.7+0.6*hk);A[m]=(0.28+0.42*fe)*Math.min(1,a*5)*Math.pow(Math.max(0,1-a/life),1.3);}
    m++;}
  /* a hang fire: a thin wisp from the nozzle; a burst: a big grey cloud from the case */
  const wisp=fail&&age>=0&&fail.key==="hangfire",burst=fail&&age>=0&&(fail.key==="cato"||fail.key==="burnthrough"||fail.key==="eject")&&!launch;
  if(wisp)for(let j=0;j<40&&m<n;j++){const a=age-j*0.12;if(a<0)break;P[m*3]=ex.x+0.1+a*0.1;P[m*3+1]=ex.y+a*0.35;P[m*3+2]=ex.z+a*0.4*(h01(j)-0.3);Z[m]=sz+a*0.15;A[m]=0.16*Math.max(0,1-a/5);m++;}
  if(burst){const c=S3.base.clone();c.x+=o.caseLen*0.5;const big=(fail.key==="cato"?1:0.45)*Math.max(0.35,Math.min(3,o.len*2.5));
    for(let j=0;j<120&&m<n;j++){const a=age-j*0.008;if(a<0)break;const az=h01(j+40)*6.283,el=h01(j+41)*1.4,sp=(2+h01(j+42)*5)*big,run=sp*0.6*(1-Math.exp(-a/0.6));
      P[m*3]=c.x+Math.cos(az)*Math.cos(el)*run+w.x*wind*a;P[m*3+1]=Math.max(0.2,c.y+Math.sin(el)*run+0.4*a);P[m*3+2]=c.z+Math.sin(az)*Math.cos(el)*run+w.z*wind*a;
      Z[m]=(0.6+a*1.4)*big*(0.7+0.6*h01(j+43))+sz*2;A[m]=0.42*big*Math.max(0,1-a/7)*Math.min(1,a*10);m++;}}
  S.geo.setDrawRange(0,m);for(const k of["position","size","alpha"])S.geo.attributes[k].needsUpdate=true;
  /* glow: one sprite on the nozzle, and a fireball after a burst */
  let gN=0;const gl=(x,y,z,s,a)=>{G.P[gN*3]=x;G.P[gN*3+1]=y;G.P[gN*3+2]=z;G.Z[gN]=s;G.A[gN]=a;gN++;};
  const fl=d.f,flame=S3.plume.visible;
  if(flame)gl(ex.x+(launch?0:o.re*2),ex.y-(launch?o.re*2:0),ex.z,o.re*(10+14*Math.min(1,fl)),Math.min(1,0.5+0.5*fl)*(d.still?1:0.9+0.1*Math.sin(t*47)));
  if(burst&&fail.key==="cato"&&age<0.9)for(let j=0;j<40;j++){const az=h01(j+80)*6.283,el=h01(j+81)*1.5,sp=2+h01(j+82)*6,c=S3.base;
    gl(c.x+o.caseLen*0.5+Math.cos(az)*Math.cos(el)*sp*age,c.y+Math.sin(el)*sp*age,c.z+Math.sin(az)*Math.cos(el)*sp*age,(0.4+age*2.2)*(0.6+h01(j)),Math.max(0,1-age/0.9));}
  if(launch&&o.lost!=null&&t>=o.lost&&t-o.lost<0.8){const p=S3.rocket.position,a=t-o.lost;for(let j=0;j<30;j++){const az=h01(j+90)*6.283,el=h01(j+91)*3-1.5,sp=3+h01(j+92)*8;
    gl(p.x+Math.cos(az)*Math.cos(el)*sp*a,p.y+Math.sin(el)*sp*a,p.z+Math.sin(az)*Math.cos(el)*sp*a,(0.3+a*2)*(0.6+h01(j)),Math.max(0,1-a/0.8));}}
  G.geo.setDrawRange(0,gN);for(const k of["position","size","alpha"])G.geo.attributes[k].needsUpdate=true;}
/* ---- cameras: the set shot, then any orbit the player dragged in ---- */
function s3Camera(d,fail,age,still){
  const T=THREE,o=S3.o,cam=S3.cam,tgt=new T.Vector3(),pos=new T.Vector3();let fovW=0,dist=0;
  if(o.mode==="stand"){
    const b=S3.base,len=o.len,plumeL=o.re*(12+46*1.0),span=Math.max(len*1.15+plumeL*0.9,0.7);
    tgt.set(b.x+len*0.5+plumeL*0.45,b.y,0);
    if(S3.shot===0){dist=span*1.2+0.1;pos.set(tgt.x+dist*0.3,b.y+0.05+dist*0.14,-dist);}
    else if(S3.shot===1){const ex=b.x+len;tgt.set(ex+o.re*3,b.y,0);dist=Math.max(0.35,o.dia*7+len*0.25);pos.set(ex+dist*0.55,b.y+dist*0.28,-dist*0.8);}
    else{const bh=S3.nodes.blockhouse;if(bh)pos.copy(bh.localToWorld(new T.Vector3(-3.8,2.05,0.6)));else pos.set(-33,2.05,22);fovW=Math.max(span*1.7,1.8);dist=pos.distanceTo(tgt);}
  }else{
    const g=S3.rocket,L=o.rocket.L,up=new T.Vector3(0,1,0).applyQuaternion(g.quaternion);tgt.copy(g.position).addScaledVector(up,L*0.5);
    const h=g.position.y-S3.base.y,b=S3.base;
    if(S3.shot===0){/* chase: off to one side and a little below, trailing a moment behind, so the rocket pulls ahead
       through the frame with the ground, the haze and its own trail around it */
      const back=L*6+Math.min(h*0.004,L*3),tc=Math.max(0,Math.min(d.t,o.path.t[o.path.t.length-1])),now=BURN_VIS.pathAt(o.path,tc),was=BURN_VIS.pathAt(o.path,Math.max(0,tc-0.12));
      const lagV=new T.Vector3(0,now.h-was.h,0).addScaledVector(S3.wdir,now.x-was.x),lp=g.position.clone().sub(lagV.clampLength(0,L*1.5));
      pos.set(lp.x-back*0.55,lp.y+L*0.5+back*0.22,lp.z-back*0.8);if(pos.y<b.y+1.2)pos.y=b.y+1.2;}
    else if(S3.shot===1){pos.set(b.x+14,b.y+1.4,b.z-18);fovW=L*6+h*0.012;}
    else{pos.set(b.x+260,b.y+3,b.z+180);fovW=Math.max(40,(h+L)*1.5+40);tgt.y=Math.max(tgt.y,b.y+(h+L)*0.45);}
    dist=pos.distanceTo(tgt);}
  /* orbit: drag spins the camera round the target */
  if(S3.orbit){const off=pos.clone().sub(tgt),r=off.length()*S3.orbit.zoom;let az=Math.atan2(off.z,off.x)+S3.orbit.az,el=Math.asin(Math.max(-1,Math.min(1,off.y/off.length())))+S3.orbit.el;
    el=Math.max(-0.05,Math.min(1.45,el));pos.set(tgt.x+r*Math.cos(el)*Math.cos(az),tgt.y+r*Math.sin(el),tgt.z+r*Math.cos(el)*Math.sin(az));
    if(fovW)fovW*=S3.orbit.zoom;}
  if(pos.y<0.15)pos.y=0.15;
  /* shake for a moment after a burst */
  if(fail&&fail.key==="cato"&&age>=0&&age<0.7&&!still){const a=(1-age/0.7)*0.04*Math.max(1,pos.distanceTo(tgt)*0.25);pos.x+=Math.sin(age*93)*a;pos.y+=Math.cos(age*71)*a*0.6;}
  cam.position.copy(pos);cam.lookAt(tgt);dist=pos.distanceTo(tgt);
  cam.fov=fovW?Math.max(0.4,Math.min(60,2*Math.atan(fovW/2/dist)*180/Math.PI)):38;
  cam.near=Math.max(0.02,Math.min(dist*0.05,5));cam.far=40000;cam.updateProjectionMatrix();
  S3.sky.position.copy(pos);
  const alt=Math.max(0,pos.y);S3.sc.fog.near=400+alt;S3.sc.fog.far=7000+alt*3;
  const gs=Math.ceil((S3.sc.fog.far*2.2)/2000);S3.ground.scale.set(gs,gs,1);for(const m of[S3.ground.material.map,S3.ground.material.normalMap])if(m)m.repeat.set(S3.groundRep*gs,S3.groundRep*gs);
  S3.ground.position.set(Math.round(pos.x/40)*40,0,Math.round(pos.z/40)*40);
  /* the sun's shadow box follows what we look at */
  S3.sun.target.position.copy(tgt);S3.sun.position.copy(tgt).add(new T.Vector3(35,60,-50));
  const sh=Math.max(6,Math.min(60,dist*0.8));Object.assign(S3.sun.shadow.camera,{left:-sh,right:sh,top:sh,bottom:-sh});S3.sun.shadow.camera.updateProjectionMatrix();
  /* points: pixel size of one metre at one metre away */
  const sc=S3.R.getDrawingBufferSize(new T.Vector2()).y/(2*Math.tan(cam.fov*Math.PI/360));S3.smoke.pts.material.uniforms.scale.value=sc;S3.glow.pts.material.uniforms.scale.value=sc;}
function s3NextShot(){if(!S3.o)return;const n=SHOTS[S3.o.mode].length;S3.shot=(S3.shot+1)%n;S3.orbit=null;s3Label();s3Redraw();if(S3.onShot)S3.onShot(S3.shot);}
function s3Label(){if(!S3.label||!S3.o)return;S3.label.textContent=SHOTS[S3.o.mode][S3.shot];S3.label.classList.add("on");clearTimeout(S3.labelT);S3.labelT=setTimeout(()=>S3.label.classList.remove("on"),1800);}
/* drag to orbit (one finger or the mouse), pinch to zoom; a tap with no drag moves to the next set shot */
function s3Input(cv){
  cv.style.touchAction="none";
  cv.addEventListener("pointerdown",e=>{S3.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t0:performance.now()});try{cv.setPointerCapture(e.pointerId);}catch(_){}
    if(S3.ptr.size===2){const[a,b]=[...S3.ptr.values()];S3.pinch=Math.hypot(a.x-b.x,a.y-b.y);}});
  cv.addEventListener("pointermove",e=>{const p=S3.ptr.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(Math.hypot(p.x-p.x0,p.y-p.y0)>6)p.moved=true;if(!p.moved)return;
    S3.orbit=S3.orbit||{az:0,el:0,zoom:1};
    if(S3.ptr.size===2){const[a,b]=[...S3.ptr.values()],dd=Math.hypot(a.x-b.x,a.y-b.y);if(S3.pinch)S3.orbit.zoom=Math.max(0.25,Math.min(4,S3.orbit.zoom*S3.pinch/dd));S3.pinch=dd;}
    else{S3.orbit.az+=dx*0.008;S3.orbit.el+=dy*0.006;}
    if(!S3.playing)s3Redraw();});
  const up=e=>{const p=S3.ptr.get(e.pointerId);S3.ptr.delete(e.pointerId);if(S3.ptr.size<2)S3.pinch=0;
    if(p&&!p.moved&&e.type==="pointerup"&&performance.now()-p.t0<450&&S3.ptr.size===0)s3NextShot();};
  cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
  cv.addEventListener("wheel",e=>{e.preventDefault();S3.orbit=S3.orbit||{az:0,el:0,zoom:1};S3.orbit.zoom=Math.max(0.25,Math.min(4,S3.orbit.zoom*Math.exp(e.deltaY*0.001)));if(!S3.playing)s3Redraw();},{passive:false});
  cv.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();s3NextShot();}});}
/* size the drawing buffer to the canvas's CSS box */
function s3Size(){
  const cv=S3.cv,W=Math.max(200,cv.clientWidth||320),H=Math.round(Math.min(W*0.78,Math.max(240,innerHeight*0.42)));
  cv.style.height=H+"px";const pr=S3.dpr;
  if(S3.R.getPixelRatio()!==pr)S3.R.setPixelRatio(pr);
  const sz=S3.R.getSize(new THREE.Vector2());if(sz.x!==W||sz.y!==H){S3.R.setSize(W,H,false);S3.cam.aspect=W/H;}}
/* the graphics tier: Full has standard materials, sun shadows, more smoke and sharper pixels; Lite is the cheap version */
function s3Tier(t){
  S3.full=t==="full";S3.dpr=Math.min(window.devicePixelRatio||1,S3.full?2:1)*(S3.stepped>1?0.75:1);
  if(!S3.R)return;S3.R.shadowMap.enabled=S3.full;S3.sun.castShadow=S3.full;
  /* the ground's normal map only on Full (it is the biggest thing on screen) */
  if(S3.ground){const gm=S3.ground.material;gm.normalMap=S3.full?(S3.groundN=S3.groundN||texGet("salt",true,true)):null;if(gm.normalMap)gm.normalScale.set(0.8,-0.8);gm.needsUpdate=true;}
  if(S3.world)swapMats(S3.world,S3.full);if(S3.rig)swapMats(S3.rig,S3.full);
  S3.sc.traverse(o=>{if(o.material&&o.material.needsUpdate!==undefined&&o.isMesh)o.material.needsUpdate=true;});}
/* auto step-down: if frames run slow for a couple of seconds while a firing plays, drop to Lite (then to fewer pixels) */
function s3Perf(){
  if(!S3.playing||!S3.auto){S3.frames.length=0;S3.prev=0;return;}
  const now=performance.now();if(S3.prev){S3.frames.push(now-S3.prev);if(S3.frames.length>90)S3.frames.shift();}S3.prev=now;
  if(S3.frames.length<90)return;const avg=S3.frames.reduce((a,b)=>a+b,0)/S3.frames.length;
  if(avg>30&&S3.stepped<2){S3.stepped++;S3.frames.length=0;s3Tier("lite");if(S3.onStep)S3.onStep(S3.stepped);}}
Object.assign(VIS,{s3:{S:S3,init:s3Init,setup:s3Setup,draw:s3Draw,redraw:s3Redraw,next:s3NextShot,tier:s3Tier,SHOTS}});
