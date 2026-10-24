import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { parseSoldierSequence, soldierView, soldierDirection } from "../src/core/sprites";
import { loadStaticSprites } from "../src/main/sprites";
import { selectModel } from "../src/core/models";
import type { ModelSelection, Placement } from "../src/shared/types";
const sequence = () => {
  const bytes = Buffer.alloc(16 + 9 * 8);
  [2, 2, 9, 8].forEach((v,i) => bytes.writeUInt32LE(v,i*4));
  for (let f=0; f<9; f++) bytes.fill(f,16+f*8,20+f*8);
  return bytes;
};
test("SQC selects frame zero from each physical view and validates padding, counts and bounds", () => {
  const bytes=sequence(), parsed=parseSoldierSequence(bytes);
  assert.deepEqual(parsed.views.map(v => [...v]), [[0,0,0,0],[3,3,3,3],[6,6,6,6]]);
  assert.throws(() => parseSoldierSequence(bytes.subarray(0,bytes.length-1)), /Truncated/);
  for (const [at,value] of [[0,0],[4,0xffffffff],[8,8],[12,3]]) {
    const bad=Buffer.from(bytes);bad.writeUInt32LE(value,at);
    assert.throws(() => parseSoldierSequence(bad));
  }
});
test("all 2048 direction samples match the native C frozen-profile fixture", async () => {
  const fixture=JSON.parse(await fs.readFile(new URL('../docs/evidence/soldier-profile-native.json',import.meta.url),'utf8'));
  let count=0;
  for (const [first,last,texture,mirror] of fixture.ranges) for (let angle=first;angle<=last;angle++) {
    const view=soldierView(angle);
    assert.equal(view.stored*3,texture,`angle ${angle}`);
    assert.equal(Number(view.mirrored),mirror,`angle ${angle}`);count++;
  }
  assert.equal(count,2048);
  assert.equal(soldierDirection(0,1,0),0);
  assert.equal(soldierDirection(1,0,0),512);
  assert.equal(soldierDirection(0,-1,0),1024);
  assert.equal(soldierDirection(-1,0,0),1536);
  assert.equal(soldierDirection(1,0,Math.PI/2),0);
});
test("soldier loader applies palette and alpha keys; malformed and missing assets retain diagnosed placeholders", async () => {
  const palette=new Uint8Array(1024);palette.set([10,120,30,255],0);palette.set([255,0,255,255],254*4);
  const bytes=sequence();bytes[16]=254;
  const selection=():ModelSelection => ({model:null,sprite:'media/sprites/insit.sqc',label:'Soldier',format:null,manager:'clan',choice:0,slot:0,provenance:'test',reason:null});
  const selections={0:selection()};
  const result=await loadStaticSprites({read:async()=>bytes}, selections, palette);
  const sprite=result['media/sprites/insit.sqc'];
  assert.equal(sprite.images[0].rgba[3],0);
  assert.equal(sprite.images[0].rgba[7],140); // Native neighbor coverage at this keyed corner.
  assert.deepEqual([...sprite.images[0].rgba.subarray(0,3)],[10,120,30]);
  let reads=0;const bad={0:selection()};
  await loadStaticSprites({read:async()=>{reads++;return bytes.subarray(0,20)}},bad,palette);
  assert.equal(reads,1,"Corrupt present SQC must not silently fall back");
  assert.equal(bad[0].sprite,null);assert.match(bad[0].reason!,/Truncated/);
  const absent={0:selection()};
  await loadStaticSprites({read:async()=>null},absent,palette);
  assert.match(absent[0].reason!,/Missing/);assert.equal(absent[0].sprite,null);
  for (const owner of [0,4,5,8]) for (let tier=0;tier<5;tier++) {
    const choice=selectModel({kind:64,owner} as Placement,{IMP_SOLDIER_TL:String(tier),RBL_SOLDIER_TL:String(tier)},tier);
    assert.equal(choice.sprite,'media/sprites/insit.sqc');assert.equal(choice.slot,0);
  }
});
