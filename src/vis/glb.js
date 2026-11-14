/* ===================== vis/glb.js: a small reader for the Blender models, and the shared textures =====================
   glbScene(buffer) turns a model written by the tools/blender-*.py scripts (models/range.glb, models/kit.glb) into
   three.js objects. It reads only what those scripts write (tools/blender_lib.py): a node tree with translation /
   rotation / scale, meshes of indexed triangles with POSITION, NORMAL, TEXCOORD_0 and COLOR_0, and plain materials (base
   colour, metalness, roughness, emissive) whose extras name a texture: {tex: key in textures/, tile: metres per repeat}.
   No skins, morphs or animation, so three.js's own GLTFLoader (and the extra 60 kB) isn't needed.
   Returns {root (a Group), nodes (by name), mats (by name)}.
     - UVs are in metres (box projection in Blender); each primitive's UVs are divided by its material's tile here, so one
       texture object serves every tile size.
     - COLOR_0 is the ambient occlusion Cycles baked; it multiplies the material colour.
     - Textures come from textures/<key>.jpg (colour) and <key>-n.jpg (normal map, Full only), fetched once and shared.
       Until one arrives the material shows its plain colour; when it lands the stand redraws.
   Materials are Lambert (cheap) on the Lite tier and Standard (with normal maps) on Full; swapMats(root, full) switches
   them when the tier changes. texMat() and uvScale() let stand3d.js texture the parts it builds itself. */
const TEXL={c:new Map()};
/* one shared texture by key ("concrete", "rust"...); normal: its normal map. own: a separate texture object (its own
   repeat) that still fills in when the image lands. ph: a canvas to show until then */
function texGet(key,normal,own,ph){
  const T=THREE,k=key+(normal?"-n":"");let e=TEXL.c.get(k);
  if(!e){e={img:null,deps:[]};TEXL.c.set(k,e);const img=new Image();
    img.onload=()=>{e.img=img;for(const t of e.deps){t.image=img;t.needsUpdate=true;}if(typeof s3Redraw==="function"&&!(VIS.s3&&VIS.s3.S.playing))s3Redraw();};
    img.onerror=()=>console.warn("texture missing:",k);img.src="textures/"+k+".jpg";}
  if(!own&&e.shared)return e.shared;
  let src=e.img||ph;
  if(!src){src=document.createElement("canvas");src.width=src.height=2;const g=src.getContext("2d");g.fillStyle=normal?"#8080FF":"#FFFFFF";g.fillRect(0,0,2,2);}
  const t=new T.CanvasTexture(src);t.wrapS=t.wrapT=T.RepeatWrapping;t.flipY=false;t.anisotropy=4;
  t.colorSpace=normal?"":T.SRGBColorSpace;e.deps.push(t);if(!own)e.shared=t;return t;}
/* one material: Lambert on Lite, Standard on Full, textured when tex is a key. vc: the geometry carries baked AO */
function makeMat(full,color,metal,rough,tex,vc,emit){
  const T=THREE,o={color,vertexColors:!!vc};
  if(tex)o.map=texGet(tex,false);
  if(emit)o.emissive=emit;
  let m;
  if(full){if(tex)o.normalMap=texGet(tex,true);
    /* no environment map, so true metal would go black: cap metalness and let the texture carry the metal look */
    m=new T.MeshStandardMaterial(Object.assign(o,{metalness:Math.min(metal,0.35),roughness:rough}));
    if(tex)m.normalScale.set(0.9,-0.9);}   // glTF UVs, derivative tangents: green flips (as GLTFLoader does)
  else m=new T.MeshLambertMaterial(o);
  Object.assign(m.userData,{metal,rough,tex:tex||null,vc:!!vc,emit:emit||null});return m;}
/* a textured material for parts built in three.js (the motor, the rocket). Their UVs are three.js's own (0..1 round a
   cylinder, and so on): scale them with uvScale() to the real size in tiles */
function texMat(full,hex,metal,rough,tex){return makeMat(full,new THREE.Color(hex),metal,rough,tex,false,null);}
function uvScale(geo,su,sv){const a=geo.attributes.uv;if(!a)return geo;for(let i=0;i<a.count;i++)a.setXY(i,a.getX(i)*su,a.getY(i)*sv);a.needsUpdate=true;return geo;}
function glbScene(buf,full){
  const T=THREE,dv=new DataView(buf);
  if(dv.getUint32(0,true)!==0x46546C67)throw new Error("not a glb file");
  let off=12,json=null,bin=null;
  while(off<buf.byteLength){const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);
    if(type===0x4E4F534A)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,off+8,len)));
    else if(type===0x004E4942)bin=buf.slice(off+8,off+8+len);
    off+=8+len;}
  const g=json,COMP={5126:[Float32Array,4],5125:[Uint32Array,4],5123:[Uint16Array,2],5121:[Uint8Array,1]},SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  const acc=i=>{const a=g.accessors[i],bv=g.bufferViews[a.bufferView],[Arr,bytes]=COMP[a.componentType],n=SIZE[a.type],
      start=(bv.byteOffset||0)+(a.byteOffset||0),stride=bv.byteStride||n*bytes;
    if(stride===n*bytes)return{arr:new Arr(bin.slice(start,start+a.count*n*bytes)),n,norm:!!a.normalized};
    const out=new Arr(a.count*n),src=new DataView(bin);   // interleaved: copy out element by element (floats only)
    for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=src.getFloat32(start+k*stride+c*4,true);
    return{arr:out,n,norm:!!a.normalized};};
  const attr=i=>{const r=acc(i);return new T.BufferAttribute(r.arr,r.n,r.norm);};
  const mats={},extras=i=>(g.materials[i]&&g.materials[i].extras)||{};
  const matOf=(i,vc)=>{const m=g.materials[i]||{},name=(m.name||("m"+i))+(vc?"":"~");if(mats[name])return mats[name];
    const p=m.pbrMetallicRoughness||{},c=p.baseColorFactor||[1,1,1,1],x=extras(i),e=m.emissiveFactor;
    const emit=e&&(e[0]||e[1]||e[2])?new T.Color().setRGB(e[0],e[1],e[2],T.LinearSRGBColorSpace):null;
    const mm=makeMat(full,new T.Color().setRGB(c[0],c[1],c[2],T.LinearSRGBColorSpace),p.metallicFactor??0,p.roughnessFactor??1,x.tex||null,vc,emit);
    mm.name=m.name||"";return mats[name]=mm;};
  const meshes=g.meshes.map(me=>{const grp=new T.Group();
    for(const pr of me.primitives){const geo=new T.BufferGeometry(),A=pr.attributes;
      geo.setAttribute("position",attr(A.POSITION));
      if(A.NORMAL!=null)geo.setAttribute("normal",attr(A.NORMAL));
      if(A.TEXCOORD_0!=null){const uv=acc(A.TEXCOORD_0),tile=+extras(pr.material).tile||1;
        if(tile!==1)for(let k=0;k<uv.arr.length;k++)uv.arr[k]/=tile;
        geo.setAttribute("uv",new T.BufferAttribute(uv.arr,2));}
      if(A.COLOR_0!=null)geo.setAttribute("color",attr(A.COLOR_0));
      if(pr.indices!=null)geo.setIndex(attr(pr.indices));
      if(A.NORMAL==null)geo.computeVertexNormals();
      const ms=new T.Mesh(geo,matOf(pr.material,A.COLOR_0!=null));ms.castShadow=ms.receiveShadow=true;grp.add(ms);}
    return grp;});
  const nodes={},root=new T.Group();
  const build=i=>{const n=g.nodes[i],o=n.mesh!=null?meshes[n.mesh].clone():new T.Object3D();
    o.name=n.name||"";if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);
    if(n.scale)o.scale.fromArray(n.scale);if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}
    if(o.name)nodes[o.name]=o;(n.children||[]).forEach(c=>o.add(build(c)));return o;};
  (g.scenes[g.scene||0].nodes).forEach(i=>root.add(build(i)));
  return{root,nodes,mats};}
/* switch every mesh under root to the other tier's materials, keeping colours, textures and AO */
function swapMats(root,full){
  const cache=new Map();
  root.traverse(o=>{if(!o.isMesh||o.userData.keepMat)return;const m=o.material;if(!m||m.isShaderMaterial||!!m.isMeshStandardMaterial===full)return;
    if(!cache.has(m)){const u=m.userData,n=makeMat(full,m.color.clone(),u.metal??0,u.rough??1,u.tex,u.vc,u.emit);
      n.side=m.side;n.name=m.name;n.userData.shared=u.shared;cache.set(m,n);}
    o.material=cache.get(m);});
  cache.forEach((n,m)=>{if(!m.userData.shared)m.dispose();});}
Object.assign(VIS,{glbScene,swapMats,texGet,texMat,uvScale});
