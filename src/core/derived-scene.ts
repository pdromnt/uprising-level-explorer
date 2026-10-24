import type {ParsedMap,Placement} from "../shared/types";
import {accuracyTables,nativeBearing} from "./accuracy";
export function deriveScene(map:ParsedMap,config:Record<string,string>) {
  const objects:Placement[]=[];
  const add=(type:NonNullable<Placement['derived']>['type'],index:number,x:number,z:number,y:number,heading:number,name:string,kind:number,owner:number,model?:string,rawY=false)=>objects.push({id:2000000+objects.length,kind,owner,x,z,y,heading,name,attribute:"NULL",parent:"NULL",flags:0,group:0,variant:0,sourceOffset:-1,derived:{type,index,model,format:0,rawY}});
  if(config.SCRIPT_FILE)for(const route of map.routes)if(/^gate/i.test(route.name)) {
    for(let segment=0;segment+1<route.points.length;segment++) {
      const p=route.points[segment],q=route.points[segment+1];
      const base=[Math.fround(p.x*512),Math.fround(p.y*512),Math.fround(p.z*512)],end=[Math.fround(q.x*512),Math.fround(q.y*512),Math.fround(q.z*512)];
      const dx=Math.fround(end[0]-base[0]),dy=Math.fround(end[1]-base[1]),dz=Math.fround(end[2]-base[2]);
      const length=Math.fround(Math.sqrt(Math.fround(dx*dx+dy*dy+dz*dz)));
      if(!length)continue;
      const unit=[Math.fround(dx/length),Math.fround(dy/length),Math.fround(dz/length)];
      const heading=((nativeBearing(unit[0],unit[2])+512)&2047)*360/2048;
      const step=accuracyTables.gateStep;let distance=0,ox=0,oy=0,oz=0;
      const increment=unit.map(v=>Math.fround(v*step));
      do {add("gate",route.id,Math.fround(base[0]+ox)/512,Math.fround(base[2]+oz)/512,Math.fround(base[1]+oy)/512,heading,`${route.name} · segment ${segment+1} · ${objects.length}`,162,0,accuracyTables.gateModel);ox=Math.fround(ox+increment[0]);oy=Math.fround(oy+increment[1]);oz=Math.fround(oz+increment[2]);distance=Math.fround(distance+step);if(objects.length>100000)throw new Error("Gate count exceeds viewer limit");}while(distance<length);
    }
  }
  // In multi-start maps, slot zero is the overview anchor, not a player spawn.
  map.starts.forEach((start,index)=>{if(map.starts.length>1 && index===0)return;add("player-start",index,start.x,start.z,0,map.starts.length===1?0:start.heading,`Player start ${map.starts.length===1?1:index}`,32,map.starts.length===1?0:index-1);});
  map.teleporters.forEach(t=>add("teleporter",t.id,t.source.x,t.source.z,t.source.y/512,t.heading,`${t.name} · source`,161,6,accuracyTables.teleporterModel,true));
  return objects;
}
