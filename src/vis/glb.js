/* ===================== vis/glb.js: a small reader for the range model (stage 7) =====================
   glbScene(buffer) turns models/range.glb (written by tools/blender-range.py) into three.js objects. It reads only what
   that script writes: a node tree with translation / rotation / scale, meshes of indexed triangles with POSITION and
   NORMAL, and plain materials (base colour, metalness, roughness). No textures, skins, morphs or animation, so three.js's
   own GLTFLoader (and the extra 60 kB) isn't needed. Returns {root (a Group), nodes (by name), mats (by name)}.
   Materials are Lambert (cheap, flat shaded) on the Lite tier and Standard (with metal) on Full; swapMats(mats, full)
   switches them when the tier changes. */
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
    if(stride===n*bytes)return new Arr(bin.slice(start,start+a.count*n*bytes));
    const out=new Arr(a.count*n),src=new DataView(bin);   // interleaved: copy out element by element (floats only)
    for(let k=0;k<a.count;k++)for(let c=0;c<n;c++)out[k*n+c]=src.getFloat32(start+k*stride+c*4,true);
    return out;};
  const mats={};
  const matOf=i=>{const m=g.materials[i],name=m.name||("m"+i);if(mats[name])return mats[name];
    const p=m.pbrMetallicRoughness||{},c=p.baseColorFactor||[1,1,1,1];
    const mm=makeMat(full,new T.Color().setRGB(c[0],c[1],c[2],T.LinearSRGBColorSpace),p.metallicFactor??0,p.roughnessFactor??1);
    mm.name=name;return mats[name]=mm;};
  const meshes=g.meshes.map(me=>{const grp=new T.Group();
    for(const pr of me.primitives){const geo=new T.BufferGeometry();
      geo.setAttribute("position",new T.BufferAttribute(acc(pr.attributes.POSITION),3));
      if(pr.attributes.NORMAL!=null)geo.setAttribute("normal",new T.BufferAttribute(acc(pr.attributes.NORMAL),3));
      if(pr.indices!=null)geo.setIndex(new T.BufferAttribute(acc(pr.indices),1));
      if(pr.attributes.NORMAL==null)geo.computeVertexNormals();
      const ms=new T.Mesh(geo,matOf(pr.material));ms.castShadow=ms.receiveShadow=true;grp.add(ms);}
    return grp;});
  const nodes={},root=new T.Group();
  const build=i=>{const n=g.nodes[i],o=n.mesh!=null?meshes[n.mesh].clone():new T.Object3D();
    o.name=n.name||"";if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);
    if(n.scale)o.scale.fromArray(n.scale);if(n.matrix){o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}
    if(o.name)nodes[o.name]=o;(n.children||[]).forEach(c=>o.add(build(c)));return o;};
  (g.scenes[g.scene||0].nodes).forEach(i=>root.add(build(i)));
  return{root,nodes,mats};}
/* one plain material: Lambert on Lite, Standard on Full. Both flat shaded (the range is low-poly on purpose) */
function makeMat(full,color,metal,rough){
  const T=THREE;
  const m=full?new T.MeshStandardMaterial({color,metalness:Math.min(metal,0.3),roughness:rough,flatShading:true})
    :new T.MeshLambertMaterial({color,flatShading:true});
  m.userData.metal=metal;m.userData.rough=rough;return m;}
/* switch every mesh under root to the other tier's materials, keeping colours */
function swapMats(root,full){
  const cache=new Map();
  root.traverse(o=>{if(!o.isMesh||o.userData.keepMat)return;const m=o.material;if(!!m.isMeshStandardMaterial===full)return;
    if(!cache.has(m)){const n=makeMat(full,m.color.clone(),m.userData.metal??0,m.userData.rough??1);
      n.flatShading=m.flatShading;n.side=m.side;n.name=m.name;cache.set(m,n);}
    o.material=cache.get(m);});
  cache.forEach((n,m)=>m.dispose());}
Object.assign(VIS,{glbScene,swapMats});
