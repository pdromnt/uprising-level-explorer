// Asset-free fixture: exercises the real MapScene controller in packaged CI.
import * as T from "three";
import {MapScene} from "../src/renderer/scene";
import type {LevelData,Placement} from "../src/shared/types";
declare global {interface Window {probeTankMode:()=>{checks:boolean[];pixels:number}}}
window.probeTankMode=()=>{
  const box=new T.BoxGeometry(1,.5,1.5),p=box.getAttribute("position"),uv=box.getAttribute("uv"),indices=box.index!.array;
  const positions=Float32Array.from(p.array,v=>v*512),uvs:number[]=[];
  for(const index of indices)uvs.push(uv.getX(index)*32,uv.getY(index)*32);
  const start={id:2000000,kind:32,owner:0,x:8,z:8,y:0,heading:0,name:"Player start",derived:{type:"player-start",index:0}} as Placement;
  const image=(rgb:number[])=>{const rgba=new Uint8Array(32*32*4);for(let i=0;i<rgba.length;i+=4)rgba.set([...rgb,255],i);return {width:32,height:32,rgba};};
  const data={terrain:{width:32,height:32,tileNames:["test"],descriptors:new Uint16Array(1024),flags:new Uint8Array(65536),heights:new Int16Array(65536),minimum:0,maximum:0},atlas:image([40,60,30]),atlasColumns:1,
    objects:[],citadelObjects:[],derivedObjects:[start],citadels:[],starts:[{x:8,z:8,heading:0}],routes:[],teleporters:[],sky:null,skyLayers:[],sprites:{},palette:null,
    models:{fixture:{file:"fixture",materials:{body:{path:"fixture",image:image([220,60,30]),transparent:false,uvScale:[32,32]}},data:{format:0,center:[256,128,384],radius:512,anchors:[],meshes:[{positions,indices:Uint16Array.from(indices),uvs:Float32Array.from(uvs),materials:["body"],materialIndices:new Uint16Array(indices.length/3),center:[256,128,384],radius:512}]} }},
    modelSelections:{[start.id]:{model:"fixture"}}} as unknown as LevelData;
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-10000px;width:320px;height:240px";document.body.append(host);
  const map=new MapScene(host,false),checks:boolean[]=[];
  try {
    map.renderer.setPixelRatio(1);map.resize();map.load(data);map.setMode("tank");map.setMode("tank");
    checks.push(map.mode==="tank"&&!!map.tank?.group.visible&&!map.targets[0].visible);
    map.keys.add("KeyW");for(let i=0;i<90;i++)map.tank!.update(1/60,map.keys,25,map.camera,true);map.keys.clear();map.renderOnce();
    checks.push(map.tank!.state.z>10&&map.tank!.state.x===8);
    const gl=map.renderer.getContext(),pixels=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]<100)visible++;
    map.filterObjects(()=>false);checks.push(map.tank!.group.visible);map.setMode("orbit");checks.push(!map.targets[0].visible&&!map.tank!.group.visible);
    map.filterObjects(()=>true);map.setMode("tank");map.setMode("orbit");checks.push(map.targets[0].visible);
    // A click must still select the original model after leaving the driver.
    for(const mode of ["orbit","fly","top"]) {
      map.setMode("tank");map.pickDrive(true);map.setMode(mode);
      const target=map.targets[0],center=new T.Box3().setFromObject(target).getCenter(new T.Vector3());
      map.camera.position.copy(center).add(new T.Vector3(0,5,5));map.camera.lookAt(center);map.controls.target.copy(center);map.renderOnce();
      let selected=-1;map.onSelect=id=>{selected=id;};
      const r=host.getBoundingClientRect();
      map.renderer.domElement.dispatchEvent(new MouseEvent("click",{clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      checks.push(selected===start.id&&!map.pickingDrive);
    }
    const bomber={...start,id:1,kind:38,x:24,z:24,y:-20,derived:undefined};
    map.load({...data,objects:[bomber,{...bomber,id:2,x:20}],modelSelections:{...data.modelSelections,1:data.modelSelections[start.id]}});
    checks.push(map.targets.find(o=>o.userData.id===1)!.position.y===3500/512);
    checks.push(map.targets.find(o=>o.userData.id===2)!.position.y===3700/512);
    map.driveHere(-100,10000);checks.push(map.mode==="tank"&&map.tank!.state.x>=.5&&map.tank!.state.x<2&&map.tank!.state.z<=31.5&&map.tank!.state.z>30);
    map.reset();checks.push(map.mode==="tank"&&map.tank!.state.x===8&&map.tank!.state.z===8);
    map.load({...data,derivedObjects:[],modelSelections:{}});map.setMode("tank");checks.push(map.mode==="orbit"&&!map.tank);
    return {checks,pixels:visible};
  } finally {map.clear();map.controls.dispose();map.renderer.dispose();map.renderer.forceContextLoss();host.remove();box.dispose();}
};
