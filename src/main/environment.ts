import {decodeBitmap} from "../core/formats";
import type {ImageData} from "../shared/types";
export async function loadEnvironment(assets:{read(name:string,loose?:boolean):Promise<Uint8Array|null>},config:Record<string,string>) {
  const layers:(ImageData|null)[]=[null,null,null],warnings:string[]=[];
  let stem=(config.POLY_SKY??"").replace(/\.[^.]+$/,"");
  if(!stem || /^nosky$/i.test(stem))return {sky:null,skyFile:null,skyLayers:layers,warnings};
  const read=async(name:string,horizon=false)=>{
    const bytes=await assets.read(`grids/skies/${name}.bmp`,true);if(!bytes)return null;
    const bmp=decodeBitmap(bytes);
    if(bmp.width>256||bmp.height>256||(!horizon&&(bmp.width!==256||bmp.height!==256)))throw new Error(`Invalid sky dimensions: ${name}`);
    const rgba=new Uint8Array(bmp.width*bmp.height*4);
    for(let y=0;y<bmp.height;y++)for(let x=0;x<bmp.width;x++) {
      const at=(y*bmp.width+x)*4,index=bmp.pixels[(bmp.height-1-y)*bmp.width+x];
      rgba.set(bmp.palette.subarray(index*4,index*4+4),at);rgba[at+3]=255;
      if(horizon) {
        const fade=Math.min(16,bmp.height);
        if(rgba[at]>240&&rgba[at+2]>240&&rgba[at+1]<16)rgba[at+3]=0;
        else if(y<fade)rgba[at+3]=Math.floor(y*y*255/(fade*fade));
      }
    }
    return {width:bmp.width,height:bmp.height,rgba};
  };
  try {layers[0]=await read(stem);}catch(e){warnings.push((e as Error).message);}
  if(!layers[0]){warnings.push(`Missing or invalid ${stem}.bmp; using tempsky.bmp`);stem="tempsky";try{layers[0]=await read(stem);}catch(e){warnings.push((e as Error).message);}}
  for(let i=1;i<3;i++)try{layers[i]=await read(stem+(i===1?"2":"t"),i===2);}catch(e){warnings.push((e as Error).message);}
  return {sky:layers[0],skyFile:`grids/skies/${stem}.bmp`,skyLayers:layers,warnings};
}
