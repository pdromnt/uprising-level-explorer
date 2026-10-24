import {test} from "node:test";
import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import {citadelPlacements,matchesObject,objectType} from "../src/core/exploration";
import {factionImage,OWNER_COLORS} from "../src/core/faction-colors";
import {GameLibrary} from "../src/main/library";
import type {Citadel,Placement} from "../src/shared/types";
test("citadel preview preserves unclaimed sites, omits empty slots, and uses settled descriptor headings",()=>{
  const c:Citadel={id:3,owner:-1,health:5000,footprints:[],claim:{x1:0,z1:0,x2:10,z2:10},base:{x:4,z:5,heading:90},upgrades:[{x:8,z:9,heading:180,kind:0},{x:9,z:10,heading:45,kind:1},{x:2,z:3,heading:30,kind:5}]};
  const unclaimed=citadelPlacements([c]);assert.equal(unclaimed.length,1);assert.equal(unclaimed[0].citadel?.empty,true);
  const active=citadelPlacements([{...c,owner:4}]);assert.equal(active.length,3);
  assert.deepEqual(active.map(o=>[o.kind,o.heading,o.x,o.z]),[[35,90,4,5],[128,90,9,10],[137,30,2,3]]);
  assert.equal(new Set(active.map(o=>o.id)).size,3);
  assert.equal(matchesObject(active[0],"citadel","4","citadels"),true);
  assert.equal(matchesObject(active[0],"citadel","-1","citadels"),false);
  assert.equal(matchesObject(active[0],"citadel","4","vehicles"),false);
  assert.equal(objectType({kind:64} as Placement),"soldiers");
});
test("owner remapping matches actual native palettes and changes only indexed color slots, preserving cutout alpha",async()=>{
  const native=JSON.parse(await fs.readFile(new URL('../docs/evidence/exploration-native.json',import.meta.url),'utf8'));
  assert.deepEqual(OWNER_COLORS,native.owner_maps);assert.equal(native.primary_kind,35);assert.equal(native.factory_slot,1);
  const palette=new Uint8Array(1024);palette.set([20,100,200,255],148*4);palette.set([200,100,20,255],152*4);
  const image={width:4,height:1,rgba:Uint8Array.of(1,2,3,255,4,5,6,255,7,8,9,255,255,0,255,0),indices:Uint8Array.of(251,252,100,254)};
  const changed=factionImage(image,palette,5);
  assert.deepEqual([...changed.rgba.subarray(0,12)],[20,100,200,255,200,100,20,255,7,8,9,255]);
  assert.equal(changed.rgba[15],0);assert.deepEqual(factionImage(image,palette,8).rgba,changed.rgba);
  assert.equal(image.rgba[0],1);assert.equal(factionImage(image,palette,-1),image);
});
test("all 162 citadel records resolve to 51 complete active bases and 111 unclaimed sites",{skip:!process.env.UPRISING_TEST_ROOT},async()=>{
  const lib=await GameLibrary.open(process.env.UPRISING_TEST_ROOT!);let bases=0,empty=0;
  for(const mission of lib.missions){const data=await lib.load(mission.id);
    for(const o of data.citadelObjects){
      if(o.citadel!.empty){empty++;assert.equal(data.modelSelections[o.id].model,null);}
      else{bases++;const selection=data.modelSelections[o.id];assert.ok(selection.model,`${mission.title}: ${selection.reason}`);const model=data.models[selection.model!];assert.equal(model.data.meshes.length,3);assert.deepEqual(model.warnings,[]);assert.equal(selection.label,o.owner===4?'icy1':'pcy1');}
    }
  }
  assert.equal(bases,51);assert.equal(empty,111);
});
