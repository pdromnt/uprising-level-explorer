import {test} from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {stepTank,type TankState} from "../src/core/tank";
import {TankRig} from "../src/renderer/tank";
import {terrainHeight} from "../src/core/accuracy";
import {restingAttitude} from "../src/renderer/grounding";
import type {LevelData,Placement,StaticModel} from "../src/shared/types";

test("tank locomotion accelerates, reverses, steers in place and stays bounded after long frames",()=>{
  const run=(dt:number)=>{const state:TankState={x:100,z:100,heading:0,velocity:0};for(let t=0;t<2-1e-8;t+=dt)stepTank(state,new Set(["KeyW"]),dt,25,256,256);return state;};
  const a=run(1/60),b=run(1/120);assert.ok(Math.abs(a.z-b.z)<.05);assert.equal(a.x,100);assert.equal(a.velocity,5);
  for(let i=0;i<90;i++)stepTank(a,new Set(),1/60,25,256,256);assert.equal(a.velocity,0);
  const heading=a.heading;stepTank(a,new Set(["KeyA"]),.05,25,256,256);assert.notEqual(a.heading,heading);assert.equal(a.velocity,0);
  a.x=255.49;a.z=255.49;a.heading=Math.PI/4;a.velocity=20;stepTank(a,new Set(["KeyW"]),20,100,256,256);assert.equal(a.x,255.5);assert.equal(a.z,255.5);assert.equal(a.velocity,0);
  a.x=100;a.z=100;a.heading=0;for(let i=0;i<60;i++)stepTank(a,new Set(["KeyS"]),1/60,25,256,256);assert.ok(a.z<100);assert.equal(a.velocity,-2.75);
});

test("moving Wraith follows native contact, keeps its camera out of terrain and leaves map records unchanged",()=>{
  const heights=new Int16Array(65536);for(let z=0;z<256;z++)for(let x=0;x<256;x++)heights[z*256+x]=x*12+z*6+(x>110?2000:0);
  const terrain={width:256,height:256,heights,flags:new Uint8Array(65536)};
  const start={id:2000000,kind:32,owner:0,x:100,z:100,y:0,heading:0,name:"Player start 1",derived:{type:"player-start",index:0}} as Placement;
  const data={terrain,derivedObjects:[start],palette:null} as unknown as LevelData;
  const asset={data:{center:[256,128,400],meshes:[],anchors:[]},materials:{}} as unknown as StaticModel;
  const before=JSON.stringify(start),rig=new TankRig(data,asset,start,true),camera=new T.PerspectiveCamera(50,1,.1,1800);
  rig.update(0,new Set(),25,camera,true,true);
  for(let i=0;i<180;i++){
    rig.update(1/60,new Set(i<100?["KeyW","KeyD"]:["KeyW"]),25,camera,true);
    const pose=restingAttitude(data.terrain,{...start,x:rig.state.x,z:rig.state.z,heading:rig.state.heading*180/Math.PI},asset.data);
    assert.equal(rig.model.position.y,pose.height);assert.ok(camera.position.y>=terrainHeight(data.terrain,camera.position.x,camera.position.z)+.4499);
    assert.ok(Number.isFinite(camera.position.length()));assert.ok(Math.abs(rig.model.quaternion.length()-1)<1e-8);
  }
  const saved=rig.snapshot();rig.relocate(-100,10000);assert.ok(rig.state.x>=.5);assert.ok(rig.state.z<=255.5);
  rig.restore(saved);assert.equal(rig.state.x,saved.x);assert.equal(rig.state.velocity,0);
  rig.reset();assert.equal(rig.state.x,start.x);assert.equal(rig.state.z,start.z);assert.equal(JSON.stringify(start),before);
});
