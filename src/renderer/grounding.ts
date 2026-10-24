import * as T from "three";
import type {Terrain,Placement,BinaryModel} from "../shared/types";
import {accuracyTables as tables,terrainHeight,detailHeight} from "../core/accuracy";
import {headingRadians} from "../core/models";
const f=Math.fround;
// gameplay_geometry_terrain_normal_values has its own triangle selection,
// retained here rather than substituting smoothed display normals.
export function nativeTerrainNormal(t:Terrain,x:number,z:number) {
  const wx=f(x*512),wz=f(z*512),integer=(v:number)=>v>=0?Math.trunc(v):Math.trunc(v)-1;
  const ix=integer(wx)>>9,iz=integer(wz)>>9,lx=f(wx-ix*512),lz=f(wz-iz*512);
  const h=(dx:number,dz:number)=>t.heights[((iz+dz)&255)*256+((ix+dx)&255)];
  let ax:number,ay:number,az:number,bx:number,by:number,bz:number;
  if(((ix+iz)&1)===0) {
    const o=h(0,0);
    if(lz<lx){ax=h(1,1)-o;ay=512;az=512;bx=h(1,0)-o;by=512;bz=0;}
    else{ax=h(0,1)-o;ay=512;az=0;bx=h(1,1)-o;by=512;bz=512;}
  }else{
    const o=h(1,0);
    if(lz<512-lx){ax=h(0,0)-o;ay=-512;az=-512;bx=h(0,1)-o;by=0;bz=512;}
    else{ax=h(0,1)-o;ay=0;az=-512;bx=h(1,1)-o;by=512;bz=512;}
  }
  const nx=f(ax*bz-bx*by),ny=f(by*ay-bz*az),nz=f(bx*az-ax*ay),inverse=1/Math.sqrt(f(nz*nz+ny*ny+nx*nx));
  return new T.Vector3(f(nx*inverse),f(ny*inverse),f(nz*inverse));
}
function nativeAsin(value:number,pitch:boolean) {
  value=f(T.MathUtils.clamp(value,-1,1));const [high,scale,low,center]=tables.attitudeConstants;
  let step:number;
  if(value>high)step=tables.asinHigh[Math.min(2048,Math.max(0,Math.trunc((value-high)*scale)))];
  else if(value<low)step=-tables.asinHigh[Math.min(2048,Math.max(0,Math.trunc((low-value)*scale)))];
  else step=tables.asin[Math.min(2048,Math.max(0,Math.trunc(value*center+center)))];
  return step;
}
export function restingAttitude(t:Terrain,o:Placement,model:BinaryModel) {
  const heading=Math.round(headingRadians(o.heading)*1024/Math.PI),sin=tables.sine[heading],cos=tables.sine[(heading+512)&2047];
  const sum=nativeTerrainNormal(t,o.x,o.z);
  let playerHeight:number|undefined;
  if(o.kind===32) {
    const width=f(model.center[0]*tables.playerCornerScale),depth=f(model.center[2]*tables.playerCornerScale),ox=f(o.x*512),oz=f(o.z*512);
    const points=[[1,1],[-1,1],[-1,-1],[1,-1]].map(([sx,sz])=>{
      const px=f(width*sx*cos+depth*sz*sin+ox)/512,pz=f(depth*sz*cos-width*sx*sin+oz)/512;
      return new T.Vector3(px*512,f((terrainHeight(t,px,pz)+detailHeight(t,px,pz))*512),pz*512);
    });
    const normal=(a:T.Vector3,b:T.Vector3,c:T.Vector3)=>{
      const ab=a.clone().sub(b),cb=c.clone().sub(b),n=ab.cross(cb);n.set(f(n.x),f(n.y),f(n.z));
      const length=f(Math.sqrt(f(n.x*n.x+n.y*n.y+n.z*n.z)));return n.set(f(n.x/length),f(n.y/length),f(n.z/length));
    };
    let n=normal(points[0],points[1],points[2]);
    if(points[3].clone().sub(points[1]).dot(n)>0)n=normal(points[1],points[2],points[3]);
    sum.copy(n);
    playerHeight=f((n.y*points[1].y+n.z*points[1].z+n.x*points[1].x-oz*n.z-ox*n.x+model.center[1])/n.y)/512;
  }
  for(const [x,z] of o.kind===32?[]:[[1,1],[-1,1],[-1,-1],[1,-1]]) {
    const px=f(model.center[0]*x*cos+model.center[2]*z*sin+o.x*512)/512,pz=f(model.center[2]*z*cos-model.center[0]*x*sin+o.z*512)/512;
    const n=nativeTerrainNormal(t,px,pz);sum.set(f(sum.x+n.x),f(sum.y+n.y),f(sum.z+n.z));
  }
  const length=f(Math.sqrt(f(sum.y*sum.y+sum.z*sum.z+sum.x*sum.x)));
  if(o.kind!==32&&length && length!==1){sum.x=f(sum.x/length);sum.z=f(sum.z/length);}
  const slope=f(sin*sum.z-cos*sum.x),roll=nativeAsin(slope,false),pitchCos=tables.sine[(roll+512)&2047];
  const ratio=f(sin!==0?(cos*slope+sum.x)/(pitchCos*sin):(sum.z-sin*slope)/(pitchCos*cos));
  const targetPitch=nativeAsin(ratio,true);
  // Freeze the native 5/6 attitude filter at its integer resting point.
  const settle=(target:number)=>{let a=0;const weight=o.kind===32?3:5;for(let i=0;i<256;i++){const b=Math.trunc((a*weight+target)/(weight+1));if(a===b)break;a=b;}return a;};
  return {heading,pitch:settle(targetPitch),roll:settle(roll),height:playerHeight};
}
export function orientationMatrix(heading:number,pitch:number,roll:number,position:T.Vector3) {
  const sin=(step:number)=>tables.sine[step&2047],ca=sin(heading+512),sa=sin(heading),cb=sin(pitch+512),sb=sin(pitch),cc=sin(roll+512),sc=sin(roll),saved=f(sc*sb);
  return new T.Matrix4().set(f(cc*ca+sc*sb*sa),f(sb*sa*cc-sc*ca),f(sa*cb),position.x,f(sc*cb),f(cc*cb),-sb,position.y,f(saved*ca-sa*cc),f(sa*sc+sb*cc*ca),f(cb*ca),position.z,0,0,0,1);
}
