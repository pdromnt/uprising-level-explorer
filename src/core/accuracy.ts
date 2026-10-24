import tables from "./accuracy-tables.json";
import type { Terrain, ImageData } from "../shared/types";
export { tables as accuracyTables };
const f=Math.fround;
export function terrainHeight(t:Terrain,x:number,z:number) {
  const wx=f(x*512),wz=f(z*512);
  const integer=(v:number)=>v>=0?Math.trunc(v):Math.trunc(v)-1;
  const ix=integer(wx)>>9,iz=integer(wz)>>9;let lx=f(wx-ix*512),lz=f(wz-iz*512);
  const h=(dx:number,dz:number)=>t.heights[((iz+dz)&255)*256+((ix+dx)&255)];
  let origin:number,hx:number,hz:number;
  if(((ix+iz)&1)===0) {
    if(lz<lx){origin=h(1,0);hx=h(0,0);hz=h(1,1);lx=512-lx;}
    else{origin=h(0,1);hx=h(1,1);hz=h(0,0);lz=512-lz;}
  }else if(lz<512-lx){origin=h(0,0);hx=h(1,0);hz=h(0,1);}
  else{origin=h(1,1);hx=h(0,1);hz=h(1,0);lx=512-lx;lz=512-lz;}
  return ((hz-origin)/512*lz+(hx-origin)/512*lx+origin)/512;
}
export function terrainLight(center:number,east:number,south:number,west:number,north:number,seed:number) {
  const direction=tables.lightDirection;
  const xs=[-(east-center)*512,-(east-center)*512,(west-center)*512,(west-center)*512];
  const zs=[-(south-center)*512,(north-center)*512,(north-center)*512,-(south-center)*512];
  let sum=0;
  for(let i=0;i<4;i++) {
    const magnitude=f(zs[i]*zs[i]+xs[i]*xs[i]+68719476736),inverse=1/Math.sqrt(magnitude);
    const dot=f(direction[0]*f(xs[i]*inverse)+(inverse*262144*direction[1]+direction[2]*f(zs[i]*inverse)));
    if(dot>0)sum=f(sum+dot);
  }
  sum=f(sum*.25);seed=(Math.imul(seed,0x343fd)+0x269ec3)>>>0;
  const value=f(((seed>>>16)&32767)*0.000030518509447574615*0.2222222238779068+sum-0.1111111119389534);
  return {value:Math.trunc(Math.max(0,Math.min(1,value))*175),seed};
}
export function waveHeight(x:number,z:number,alternate=false,tick=0) {
  const ix=Math.trunc(f(x*512)),iz=Math.trunc(f(z*512));
  return tables.waves[alternate?1:0][((((ix & 0xfffffeff)>>8)+(iz>>8)+tick*2)&126)>>1]/512;
}
export function prepareTerrain(t:Terrain,lighting=true,tick=0) {
  const light=new Uint8Array(65536),renderHeights=new Float32Array(65536);let seed=1;
  const h=(x:number,z:number)=>t.heights[(z&255)*256+(x&255)];
  for(let z=0;z<t.height;z++)for(let x=0;x<t.width;x++) {
    const at=z*256+x,result=terrainLight(h(x,z),h(x+1,z),h(x,z+1),h(x-1,z),h(x,z-1),seed);
    seed=result.seed;light[at]=lighting?result.value:0;
    const flag=t.flags[z*t.width+x];
    renderHeights[at]=h(x,z)/512+((flag&16)?waveHeight(x,z,false,tick):(flag&64)?waveHeight(x,z,true,tick):0);
  }
  t.light=light;t.renderHeights=renderHeights;
}
export function nativeBearing(x:number,z:number) {
  if(x===0 && z===0)return 0;
  x=f(x);z=f(z);let angle:number;
  if(Math.abs(x)<Math.abs(z)) {
    const index=Math.max(0,Math.min(2048,Math.trunc(x*1024/z+1024)));
    angle=tables.atan[index]+(z>0?0:1024);
  } else {
    const index=Math.max(0,Math.min(2048,Math.trunc(z*1024/x+1024)));
    angle=(x>0?512:1536)-tables.atan[index];
  }
  return angle&2047;
}
// Native alpha_mode 1: coverage of non-key neighbors, preserving its edge rule.
export function applyCoverage(image:ImageData) {
  const {width,height,rgba,indices}=image;if(!indices)return;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const at=y*width+x;if(indices[at]===254 || rgba[at*4+3]===0){rgba[at*4+3]=0;continue;}
    let neighbors=8;
    for(let dy=-1;dy<=1;dy++) {
      const row=y+dy;if(row<0||row>=height){neighbors--;continue;}
      for(let dx=-1;dx<=1;dx++){const col=x+dx;if(col<0||col>=width||indices[row*width+col]===254)neighbors--;}
    }
    rgba[at*4+3]=Math.trunc(Math.min(1,f(neighbors*0.11249999701976776+0.10000000149011612))*255);
  }
}
export function decodeDepth(bytes:Uint8Array|null,t:Terrain) {
  const out=new Uint8Array(512*512);
  if(bytes) {
    if(bytes.length<4096)throw new Error("Truncated DPH header");
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let cursor=4096;
    for(let block=0;block<1024;block++) {
      if(!view.getUint32(block*4,true))continue;
      if(cursor+128>bytes.length)throw new Error("Truncated DPH block");
      for(let x=0;x<16;x++)for(let z=0;z<16;z++)out[((block%32)*16+z)*512+Math.floor(block/32)*16+x]=(bytes[cursor+x*8+(z>>1)]>>((z&1)*4))&15;
      cursor+=128;
    }
  } else {
    for(let x=0;x<512;x++)for(let z=0;z<512;z++)if(t.flags[(z>>1)*256+(x>>1)]&80)out[z*512+x]=15;
    for(let step=1;step<15;step++) {
      let pending=false;
      for(let x=0;x<512;x++)for(let z=0;z<512;z++) {
        const at=z*512+x;if(out[at]!==15)continue;
        if((x>0&&out[at-1]<step)||(x<511&&out[at+1]<step)||(z>0&&out[at-512]<step)||(z<511&&out[at+512]<step))out[at]=step;else pending=true;
      }
      if(!pending)break;
    }
  }
  return out;
}
export function detailHeight(t:Terrain,x:number,z:number) {
  const gx=Math.trunc(x*512)>>8,gz=Math.trunc(z*512)>>8;
  if(!t.detail||gx<0||gz<0||gx>=512||gz>=512)return 0;
  const lx=x*512-gx*256,lz=z*512-gz*256;
  const nx=Math.max(0,Math.min(511,gx+(lx<=128?-1:1))),nz=Math.max(0,Math.min(511,gz+(lz<=128?-1:1)));
  const wx=Math.abs(lx-128)/256,wz=Math.abs(lz-128)/256;
  const h=(x:number,z:number)=>t.detail![z*512+x];
  const a=h(gx,gz)+(h(gx,nz)-h(gx,gz))*wz,b=h(nx,gz)+(h(nx,nz)-h(nx,gz))*wz;
  return (a+(b-a)*wx)*-8/512;
}
