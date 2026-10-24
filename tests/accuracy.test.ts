import {test} from "node:test";
import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import {terrainLight,terrainHeight,applyCoverage,decodeDepth,detailHeight,prepareTerrain,waveHeight,accuracyTables} from "../src/core/accuracy";
import {nativeTerrainNormal,restingAttitude} from "../src/renderer/grounding";
import {deriveScene} from "../src/core/derived-scene";
import {parseMap} from "../src/core/formats";
import {GameLibrary} from "../src/main/library";
import type {Terrain,Placement,BinaryModel} from "../src/shared/types";
const fixture=JSON.parse(await fs.readFile(new URL('../docs/evidence/accuracy-native.json',import.meta.url),'utf8'));
const terrain=()=>({width:256,height:256,heights:new Int16Array(65536),flags:new Uint8Array(65536)} as Terrain);
test("terrain brightness matches all 256 actual native C samples and RNG progression",()=>{
  let seed=1;
  for(const [c,e,s,w,n,expected] of fixture.lighting){const result=terrainLight(c,e,s,w,n,seed);seed=result.seed;assert.equal(result.value,expected,`${c},${e},${s},${w},${n}`);}
});
test("height and surface normals match native C at 128 positive, negative and diagonal samples",()=>{
  const t=terrain();for(let z=0;z<256;z++)for(let x=0;x<256;x++)t.heights[z*256+x]=(x*17+z*37+(x*z%11)*100)%4000-2000;
  for(const [x,z,height,nx,ny,nz] of fixture.heightSamples){
    assert.ok(Math.abs(terrainHeight(t,x,z)-height)<1e-8,`height ${x}, ${z}: ${terrainHeight(t,x,z)} != ${height}`);
    const n=nativeTerrainNormal(t,x,z);assert.ok(n.distanceTo({x:nx,y:ny,z:nz} as any)<2e-7,`normal ${x},${z}`);
  }
});
test("DPH decodes packed x-major blocks and reconstructs bounded flag distances",()=>{
  const t=terrain(),bytes=Buffer.alloc(4096+128);bytes.writeUInt32LE(1,0);bytes[4096]=0x73;
  const depth=decodeDepth(bytes,t);assert.equal(depth[0],3);assert.equal(depth[512],7);assert.equal(depth[1],0);
  assert.throws(()=>decodeDepth(bytes.subarray(0,4200),t),/Truncated/);
  t.flags[128*256+128]=80;const generated=decodeDepth(null,t);assert.ok(generated.some(v=>v>0));t.detail=generated;
  assert.ok(detailHeight(t,128.25,128.25)<0);assert.equal(detailHeight(t,-5,20),0);
});
test("settled vehicle and Wraith contact match 128 native C poses, including support height",()=>{
  const t=terrain();for(let z=0;z<256;z++)for(let x=0;x<256;x++)t.heights[z*256+x]=(x*17+z*37+(x*z%11)*100)%4000-2000;
  const model={center:[200,140,300]} as BinaryModel;
  for(const kind of [33,32])for(const [x,z,heading,pitch,roll,height] of kind===32?fixture.playerSamples:fixture.attitudeSamples) {
    const o={kind,x,z,heading:heading*360/2048} as Placement,pose=restingAttitude(t,o,model);
    assert.equal(pose.pitch,pitch,`${kind} pitch ${x},${z}`);assert.equal(pose.roll,roll,`${kind} roll ${x},${z}`);
    if(kind===32)assert.ok(Math.abs(pose.height!-height)<1e-6,`Wraith height ${x},${z}`);
  }
});
test("frozen wave geometry uses the native primary and alternate tables",()=>{
  const t=terrain();t.flags[0]=16;t.flags[1]=64;prepareTerrain(t,false,7);
  assert.equal(t.renderHeights![0],Math.fround(waveHeight(0,0,false,7)));
  assert.equal(t.renderHeights![1],Math.fround(waveHeight(1,0,true,7)));assert.equal(t.light![0],0);
  assert.equal(accuracyTables.waves[0].length,64);
});
test("native cutout coverage preserves keys and fractional boundary alpha",()=>{
  const rgba=new Uint8Array(3*3*4).fill(255),indices=new Uint8Array(9);indices[0]=254;
  applyCoverage({width:3,height:3,rgba,indices});assert.equal(rgba[3],0);assert.equal(rgba[4*4+3],226);assert.ok(rgba[7]>0&&rgba[7]<255);
});
test("gate factory positions and headings match the real native constructor for every route",{skip:!process.env.UPRISING_TEST_ROOT},async()=>{
  const corpus=JSON.parse(await fs.readFile(new URL('../docs/evidence/corpus.json',import.meta.url),'utf8'));const actual=[];
  for(const item of corpus.levels){const map=parseMap(await fs.readFile(process.env.UPRISING_TEST_ROOT+'/GRIDS/'+item.name));actual.push(...deriveScene(map,{SCRIPT_FILE:'native'}).filter(o=>o.derived?.type==='gate'));}
  assert.equal(actual.length,fixture.gates.length);assert.equal(actual.length,379);
  actual.forEach((o,i)=>{const [x,z,y,heading]=fixture.gates[i];assert.ok(Math.abs(o.x-x)<1e-6&&Math.abs(o.z-z)<1e-6&&Math.abs(o.y-y)<1e-6,`gate ${i}`);assert.equal(Math.round(o.heading*2048/360),heading&2047,`gate heading ${i}`);});
});
test("all derived gates, player bodies and teleporter meshes resolve without placeholders",{skip:!process.env.UPRISING_TEST_ROOT},async()=>{
  const lib=await GameLibrary.open(process.env.UPRISING_TEST_ROOT!);const counts:Record<string,number>={};
  for(const m of lib.missions){const data=await lib.load(m.id);for(const o of data.derivedObjects){counts[o.derived!.type]=(counts[o.derived!.type]??0)+1;const selection=data.modelSelections[o.id];assert.ok(selection.model,`${m.title}: ${selection.reason}`);assert.deepEqual(data.models[selection.model!].warnings,[]);}}
  assert.deepEqual(counts,{'player-start':99,gate:379,teleporter:21});
});
