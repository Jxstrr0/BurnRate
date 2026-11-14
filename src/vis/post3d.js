/* ===================== vis/post3d.js: post effects for the 3D range (1.6) =====================
   A small, phone-sized post chain for the stand (src/vis/stand3d.js): the scene is drawn into an HDR (half-float,
   multisampled) target in linear colour, then one composite pass puts it on the canvas with bloom on the bright things
   (the plume core, lamps, sun glints, the beacon, the flash), heat shimmer behind a nozzle, exposure, a soft highlight
   roll-off, a small colour grade, a vignette, the sRGB encoding and a tiny dither against banding in the sky.
     p3Init(renderer, o)  once; true if the chain can run here (WebGL2, half-float targets). o: {samples} (MSAA, default 4,
                          0 for none). False: render straight to the canvas as before.
     p3Size(w, h, pr)     the canvas size in CSS pixels and the pixel ratio (the same numbers as renderer.setSize and
                          setPixelRatio); the targets follow the drawing buffer. Cheap when nothing changed.
     p3Render(scene, camera, opt)  draws one frame. opt (all optional): bloom (0..2, default 1), exposure (default 1),
                          shimmer (null or {x, y, dx, dy, len, w, k}), grade (null or {tint:[r,g,b], sat, contrast}),
                          vignette (0..1, default 0.25), time (s, for the shimmer).
                          shimmer: x, y the nozzle exit on screen (0..1, origin bottom left); dx, dy the way the plume runs
                          on screen, in pixels (any length, normalised here); len its length and w its half-width, both as
                          fractions of the screen height; k the strength 0..1. p3Aim() fills one from 3D points.
     p3Aim(camera, exit, end, radius, k, out)  projects a plume (exit and end as world Vector3s, radius in metres at the
                          exit) into a shimmer object (out, reused: no allocation per frame). Null when it is off screen.
     p3Samples(n)         change the MSAA samples (a tier change); p3Dispose() frees everything.
     p3Env(renderer, top, horizon, ground, sun)  a PMREM environment map from a gradient sky (three colours as hex) with a
                          soft sun spot (sun: a direction, default the stand's sun), for scene.environment, so standard
                          materials with real metalness read as metal. The last one made is freed by the next and by
                          p3Dispose.
   Linear colour: the HDR target gets three's linear working colour with no tone mapping (three only applies tone mapping
   and the output colour space when drawing to the canvas), so this file does both. A raw ShaderMaterial (the sky dome,
   the plume, the smoke sprites) gets no conversion either way: its gl_FragColor lands in the target as it is, so a colour
   written as a display (sRGB) value must be made linear to look the same through the chain (see P3_GLSL.lin).
   Cost: the scene pass, a threshold pass at half size, three smaller downsamples (1/4, 1/8, 1/16), three upsamples back
   to half size, and the full-size composite (three texture reads a pixel). Every target and material is made once; p3Render allocates nothing. */
const P3={ok:false,R:null,samples:4,W:0,H:0,rt:null,down:[],up:[],quad:null,cam:null,mats:null,env:null,
  /* the highlight roll-off: identity up to knee, then a soft shoulder that approaches white (sharp: how quickly) */
  tone:{knee:0.62,white:1.0,sharp:2.2},
  /* bloom: only what is brighter than thr (linear, with a soft knee) blooms */
  bloomThr:1.0,bloomKnee:0.4,bloomGain:1.1};
/* GLSL snippets a ShaderMaterial elsewhere can use. lin: display (sRGB) colour to linear, for shaders whose colours were
   tuned for drawing straight to the canvas */
const P3_GLSL={lin:"vec3 p3Lin(vec3 c){return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(0.04045,c));}"};
const P3_VS="varying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,0.0,1.0);}";
function p3Mat(fs,uni){
  return new THREE.ShaderMaterial({vertexShader:P3_VS,fragmentShader:fs,uniforms:uni,depthTest:false,depthWrite:false,toneMapped:false});}
function p3Target(w,h,o){
  const T=THREE;return new T.WebGLRenderTarget(w,h,Object.assign({type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.LinearFilter,
    magFilter:T.LinearFilter,wrapS:T.ClampToEdgeWrapping,wrapT:T.ClampToEdgeWrapping,depthBuffer:false,generateMipmaps:false},o||{}));}
/* can this GPU render to and filter half-float targets? A raw check (three would only log an error) */
function p3Can(R){
  const gl=R.getContext();if(typeof WebGL2RenderingContext==="undefined"||!(gl instanceof WebGL2RenderingContext))return false;
  if(!gl.getExtension("EXT_color_buffer_float")&&!gl.getExtension("EXT_color_buffer_half_float"))return false;
  let ok=false;const tx=gl.createTexture(),fb=gl.createFramebuffer();
  try{gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,4,4,0,gl.RGBA,gl.HALF_FLOAT,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tx,0);
    ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE&&!gl.isContextLost();}catch(e){ok=false;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.deleteFramebuffer(fb);gl.deleteTexture(tx);
  R.resetState();return ok;}
function p3Init(R,o){
  const T=THREE;p3Dispose();P3.R=R;if(!R||!p3Can(R))return P3.ok=false;
  const gl=R.getContext();P3.samples=Math.max(0,Math.min(o&&o.samples!=null?o.samples:4,gl.getParameter(gl.MAX_SAMPLES)|0));
  /* the scene target: full size, depth, multisampled, linear half float */
  P3.rt=p3Target(4,4,{depthBuffer:true,samples:P3.samples});
  for(let i=0;i<4;i++)P3.down.push(p3Target(4,4));
  for(let i=0;i<3;i++)P3.up.push(p3Target(4,4));
  /* one big triangle covers the screen; its shaders ignore the camera */
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  P3.quad=new T.Mesh(geo,null);P3.quad.frustumCulled=false;P3.scene=new T.Scene();P3.scene.add(P3.quad);
  P3.cam=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const V2=()=>new T.Vector2(1,1);
  /* threshold + first downsample (full -> half): four bilinear taps over a 4x4 block, each weighted by 1/(1+luma) so a
     single hot pixel (a sun glint) can't flicker the whole bloom, then the soft-knee threshold */
  const pre=p3Mat("uniform sampler2D src;uniform vec2 tx;uniform float thr,knee;varying vec2 vUv;"+
    "vec3 s(vec2 o){return min(texture2D(src,vUv+o*tx).rgb,vec3(256.0));}"+
    "float w(vec3 c){return 1.0/(1.0+dot(c,vec3(0.2126,0.7152,0.0722)));}"+
    "void main(){vec3 a=s(vec2(-1.0,-1.0)),b=s(vec2(1.0,-1.0)),c=s(vec2(-1.0,1.0)),d=s(vec2(1.0,1.0));"+
    "float wa=w(a),wb=w(b),wc=w(c),wd=w(d);vec3 m=(a*wa+b*wb+c*wc+d*wd)/(wa+wb+wc+wd);"+
    "float br=max(m.r,max(m.g,m.b));float q=clamp(br-thr+knee,0.0,2.0*knee);q=q*q/(4.0*knee+1e-4);"+
    "m*=max(q,br-thr)/max(br,1e-4);gl_FragColor=vec4(max(m,vec3(0.0)),1.0);}",
    {src:{value:null},tx:{value:V2()},thr:{value:1},knee:{value:0.3}});
  /* dual-filter downsample: the centre and four diagonal bilinear taps */
  const down=p3Mat("uniform sampler2D src;uniform vec2 tx;varying vec2 vUv;"+
    "void main(){vec3 c=texture2D(src,vUv).rgb*4.0+texture2D(src,vUv+vec2(-tx.x,-tx.y)).rgb+texture2D(src,vUv+vec2(tx.x,-tx.y)).rgb"+
    "+texture2D(src,vUv+vec2(-tx.x,tx.y)).rgb+texture2D(src,vUv+tx).rgb;gl_FragColor=vec4(c*0.125,1.0);}",
    {src:{value:null},tx:{value:V2()}});
  /* dual-filter upsample (a tent of eight taps from the smaller level) plus this level's own downsample, so every level
     adds its own width to the glow */
  const UP="vec3 up(sampler2D t,vec2 x){vec3 c=(texture2D(t,vUv+vec2(-x.x,0.0)).rgb+texture2D(t,vUv+vec2(x.x,0.0)).rgb"+
    "+texture2D(t,vUv+vec2(0.0,-x.y)).rgb+texture2D(t,vUv+vec2(0.0,x.y)).rgb)"+
    "+(texture2D(t,vUv+vec2(-x.x,-x.y)*0.5).rgb+texture2D(t,vUv+vec2(x.x,-x.y)*0.5).rgb"+
    "+texture2D(t,vUv+vec2(-x.x,x.y)*0.5).rgb+texture2D(t,vUv+vec2(x.x,x.y)*0.5).rgb)*2.0;return c/12.0;}";
  const up=p3Mat("uniform sampler2D src,add;uniform vec2 tx;varying vec2 vUv;"+UP+
    "void main(){gl_FragColor=vec4(up(src,tx)+texture2D(add,vUv).rgb,1.0);}",
    {src:{value:null},add:{value:null},tx:{value:V2()}});
  /* the composite: shimmer -> scene + bloom -> exposure -> roll-off -> grade -> sRGB -> contrast -> vignette -> dither */
  const comp=p3Mat("uniform sampler2D scn,blm;uniform float bloom,expo,vig,time,aspect,sat,con;"+
    "uniform vec4 shA;uniform vec3 shB,tint,tone;varying vec2 vUv;"+
    "float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}"+
    "float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);"+
      "return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}"+
    "vec3 roll(vec3 x){float k=tone.x,s=tone.z;vec3 e=max(x-k,0.0);return min(x,vec3(k))+e/pow(1.0+pow(e/(tone.y-k),vec3(s)),vec3(1.0/s));}"+
    "vec3 enc(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));}"+
    "void main(){vec2 uv=vUv;"+
    /* heat shimmer: a soft cone from the nozzle along the plume; two octaves of value noise, scrolling down the plume,
       push the lookup about. Strongest at the nozzle, gone by the end */
    "if(shB.z>0.0){vec2 d=normalize(shA.zw+vec2(1e-6,0.0)),p=(uv-shA.xy)*vec2(aspect,1.0);"+
      "float a=dot(p,d),r=dot(p,vec2(-d.y,d.x)),s=a/shB.x,sc=clamp(s,0.0,1.0),wd=shB.y*(1.0+1.2*sc);"+
      "float m=smoothstep(-0.04,0.06,s)*(1.0-smoothstep(0.5,1.0,s))*exp(-r*r/(wd*wd))*(1.0-0.6*sc);"+
      "if(m>0.002){vec2 q=vec2(a,r)/shB.y,t=vec2(time*7.0,0.0);"+
        "vec2 n=vec2(vn(q*vec2(1.1,1.6)-t),vn(q*vec2(1.1,1.6)-t+vec2(17.3,5.1)))-0.5;"+
        "n+=0.5*(vec2(vn(q*2.7-t*1.7+vec2(3.7,9.2)),vn(q*2.7-t*1.7+vec2(31.1,2.3)))-0.5);"+
        "uv+=n*(shB.z*m*shB.y*0.22)*vec2(1.0/aspect,1.0);}}"+
    "vec3 c=texture2D(scn,uv).rgb;"+
    "c+=texture2D(blm,vUv).rgb*bloom;"+
    "c=roll(max(c*expo,0.0))*tint;"+
    "float l=dot(c,vec3(0.2126,0.7152,0.0722));c=max(mix(vec3(l),c,sat),0.0);"+
    "c=enc(min(c,1.0));c=(c-0.5)*con+0.5;"+
    "vec2 v=(vUv-0.5)*2.0;c*=1.0-vig*0.6*smoothstep(0.4,2.0,dot(v,v));"+
    "c+=(hash(gl_FragCoord.xy+fract(time*7.13)*91.7)-0.5)/255.0;"+
    "gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);}",
    {scn:{value:null},blm:{value:null},bloom:{value:1},expo:{value:1},vig:{value:0.25},time:{value:0},
     aspect:{value:1},sat:{value:1},con:{value:1},shA:{value:new T.Vector4(0,0,1,0)},shB:{value:new T.Vector3(0,0,0)},
     tint:{value:new T.Vector3(1,1,1)},tone:{value:new T.Vector3(P3.tone.knee,P3.tone.white,P3.tone.sharp)}});
  P3.mats={pre,down,up,comp};P3.W=P3.H=0;P3.ok=true;
  const sz=R.getDrawingBufferSize(new T.Vector2());p3Resize(sz.x,sz.y);
  return true;}
/* the drawing buffer is w*pr by h*pr (as three's setSize rounds it) */
function p3Size(w,h,pr){if(P3.ok)p3Resize(Math.floor(w*(pr||1)),Math.floor(h*(pr||1)));}
function p3Resize(W,H){
  W=Math.max(1,W|0);H=Math.max(1,H|0);if(W===P3.W&&H===P3.H)return;P3.W=W;P3.H=H;
  P3.rt.setSize(W,H);let w=W,h=H;
  for(let i=0;i<4;i++){w=Math.max(1,w>>1);h=Math.max(1,h>>1);P3.down[i].setSize(w,h);if(i<3)P3.up[i].setSize(w,h);}}
function p3Samples(n){
  if(!P3.ok)return;const gl=P3.R.getContext();n=Math.max(0,Math.min(n|0,gl.getParameter(gl.MAX_SAMPLES)|0));
  if(n===P3.samples)return;P3.samples=n;P3.rt.dispose();P3.rt.samples=n;}
function p3Pass(mat,target){P3.quad.material=mat;P3.R.setRenderTarget(target);P3.R.render(P3.scene,P3.cam);}
function p3Render(scene,camera,opt){
  const R=P3.R,M=P3.mats,o=opt||{},D=P3.down,U=P3.up;if(!P3.ok)return;
  const prevTarget=R.getRenderTarget(),prevClear=R.autoClear;
  R.setRenderTarget(P3.rt);R.render(scene,camera);R.autoClear=false;
  const bl=o.bloom==null?1:Math.max(0,Math.min(2,o.bloom));
  if(bl>0){
    /* threshold to half size, then down to a sixteenth, then back up to half size, each level adding its own glow */
    let u=M.pre.uniforms;u.src.value=P3.rt.texture;u.tx.value.set(1/P3.W,1/P3.H);u.thr.value=P3.bloomThr;u.knee.value=P3.bloomKnee;p3Pass(M.pre,D[0]);
    u=M.down.uniforms;
    for(let i=1;i<4;i++){const s=D[i-1];u.src.value=s.texture;u.tx.value.set(1/s.width,1/s.height);p3Pass(M.down,D[i]);}
    u=M.up.uniforms;
    for(let i=2;i>=0;i--){const s=i===2?D[3]:U[i+1];u.src.value=s.texture;u.add.value=D[i].texture;u.tx.value.set(1/s.width,1/s.height);p3Pass(M.up,U[i]);}}
  const c=M.comp.uniforms;c.scn.value=P3.rt.texture;c.blm.value=U[0].texture;
  /* four levels add up, so a quarter each; the gain sets how strong bloom 1 is */
  c.bloom.value=bl*P3.bloomGain*0.25;c.expo.value=o.exposure==null?1:o.exposure;c.vig.value=o.vignette==null?0.25:o.vignette;
  c.time.value=o.time||0;c.aspect.value=P3.W/P3.H;c.tone.value.set(P3.tone.knee,P3.tone.white,P3.tone.sharp);
  const sh=o.shimmer;
  if(sh&&sh.k>0&&sh.len>0&&sh.w>0){c.shA.value.set(sh.x,sh.y,sh.dx,sh.dy);c.shB.value.set(sh.len,sh.w,Math.min(1,sh.k));}else c.shB.value.z=0;
  const g=o.grade;
  if(g){const t=g.tint||[1,1,1];c.tint.value.set(t[0],t[1],t[2]);c.sat.value=g.sat==null?1:g.sat;c.con.value=g.contrast==null?1:g.contrast;}
  else{c.tint.value.set(1,1,1);c.sat.value=1;c.con.value=1;}
  p3Pass(M.comp,null);
  R.autoClear=prevClear;if(prevTarget)R.setRenderTarget(prevTarget);}
/* a shimmer object from the plume in 3D: exit and end (world Vector3), radius (m at the exit), k the strength */
const P3_V=[];
function p3Aim(camera,exit,end,radius,k,out){
  if(!P3_V.length)P3_V.push(new THREE.Vector3(),new THREE.Vector3());
  const a=P3_V[0].copy(exit).project(camera),b=P3_V[1].copy(end).project(camera);
  /* behind the camera, or the exit well off screen: no shimmer */
  if(a.z>1||a.z<-1||Math.abs(a.x)>1.6||Math.abs(a.y)>1.6)return null;
  const asp=P3.W&&P3.H?P3.W/P3.H:camera.aspect||1;
  const x=a.x*0.5+0.5,y=a.y*0.5+0.5,dx=(b.x-a.x)*0.5*asp,dy=(b.y-a.y)*0.5,len=Math.hypot(dx,dy);
  if(len<1e-4)return null;
  /* the radius at the exit as a fraction of the screen height */
  const dist=P3_V[1].copy(exit).applyMatrix4(camera.matrixWorldInverse).z,th=Math.tan((camera.fov||30)*Math.PI/360);
  const w=Math.max(0.004,radius/(2*Math.max(0.05,-dist)*th));
  out=out||{};out.x=x;out.y=y;out.dx=dx;out.dy=dy;out.len=len;out.w=w;out.k=k;return out;}
/* a PMREM environment from a gradient sky with a soft sun spot. Colours are hex in sRGB (made linear here) */
function p3Env(R,top,horizon,ground,sun){
  const T=THREE;if(!R)return null;
  const tc=new T.Color(top),hc=new T.Color(horizon),gc=new T.Color(ground);
  const sd=sun?new T.Vector3().copy(sun).normalize():new T.Vector3(0.42,0.62,-0.6).normalize();
  const sc=new T.Scene(),geo=new T.SphereGeometry(10,32,16);
  const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{top:{value:new T.Vector3(tc.r,tc.g,tc.b)},hor:{value:new T.Vector3(hc.r,hc.g,hc.b)},gnd:{value:new T.Vector3(gc.r,gc.g,gc.b)},sun:{value:sd}},
    vertexShader:"varying vec3 vd;void main(){vd=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:"uniform vec3 top,hor,gnd,sun;varying vec3 vd;void main(){vec3 d=normalize(vd);float y=d.y;"+
      "vec3 c=y>0.0?mix(hor,top,pow(y,0.55)):mix(hor,gnd,smoothstep(0.0,0.25,-y));"+
      "float s=max(dot(d,sun),0.0);c+=vec3(1.0,0.92,0.78)*(pow(s,12.0)*0.6+pow(s,300.0)*14.0);"+
      "gl_FragColor=vec4(c,1.0);}"});
  sc.add(new T.Mesh(geo,mat));
  const pm=new T.PMREMGenerator(R),tgt=pm.fromScene(sc,0.02,0.1,100,{size:256});
  pm.dispose();geo.dispose();mat.dispose();
  if(P3.env)P3.env.dispose();P3.env=tgt;return tgt.texture;}
function p3Dispose(){
  if(P3.rt)P3.rt.dispose();for(const t of P3.down.concat(P3.up))t.dispose();
  if(P3.mats)for(const k in P3.mats)P3.mats[k].dispose();if(P3.quad)P3.quad.geometry.dispose();
  if(P3.env)P3.env.dispose();
  Object.assign(P3,{ok:false,rt:null,down:[],up:[],mats:null,quad:null,scene:null,env:null,W:0,H:0});}
Object.assign(VIS,{p3:{P:P3,GLSL:P3_GLSL,init:p3Init,size:p3Size,render:p3Render,aim:p3Aim,samples:p3Samples,env:p3Env,dispose:p3Dispose}});
