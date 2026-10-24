import * as T from "three";
// Native world-down vector is (0,-1,0): project the actual transformed bounds
// vertically onto the same terrain sampler, rather than inventing a sun angle.
export function boundsShadow(root:T.Object3D,ground:(x:number,z:number)=>number) {
  root.updateWorldMatrix(true,true);
  const vertices:number[]=[],signs=[[1,1,1],[-1,1,1],[-1,1,-1],[1,1,-1],[1,-1,1],[-1,-1,1],[-1,-1,-1],[1,-1,-1]];
  const faces=[[[0,3,2,1],[4,5,6,7]],[[0,1,5,4],[3,7,6,2]],[[0,4,7,3],[1,2,6,5]]];
  root.traverse(node=>{
    if(!(node instanceof T.Mesh)||!node.userData.shadowExtent)return;
    const extent=node.userData.shadowExtent as number[],corners=signs.map(sign=>new T.Vector3(...sign.map((s,i)=>s*extent[i]) as [number,number,number]).applyMatrix4(node.matrixWorld));
    for(const pair of faces) {
      let face=pair[0];const a=corners[face[1]].clone().sub(corners[face[0]]),b=corners[face[3]].clone().sub(corners[face[0]]);
      if(-a.cross(b).y>=0)face=pair[1];
      for(const index of [0,1,2,0,2,3]){const p=corners[face[index]];vertices.push(p.x,ground(p.x,p.z)+.004,p.z);}
    }
  });
  if(!vertices.length)return null;
  const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
  return new T.Mesh(geometry,new T.MeshBasicMaterial({color:0,transparent:true,opacity:.28,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:T.DoubleSide}));
}
export function groundShadow(x:number,z:number,diameter:number,ground:(x:number,z:number)=>number) {
  const vertices:number[]=[],uv:number[]=[];
  for(const [u,v] of [[0,0],[0,1],[1,0],[1,0],[0,1],[1,1]]){const px=x+(u-.5)*diameter,pz=z+(v-.5)*diameter;vertices.push(px,ground(px,pz)+.004,pz);uv.push(u,v);}
  const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));geometry.setAttribute("uv",new T.Float32BufferAttribute(uv,2));
  const rgba=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const d=Math.hypot((x+.5)/16-1,(y+.5)/16-1);rgba[(y*32+x)*4+3]=Math.round(Math.max(0,1-d)*100);}
  const texture=new T.DataTexture(rgba,32,32);texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
  return new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
}
