// Desktop-only probes of the shipped renderer, never part of the app bundle.
import * as T from "three";
import {buildTerrain} from "../src/renderer/terrain";
import {makeSky,skyProjection} from "../src/renderer/environment";
import {MapScene} from "../src/renderer/scene";
import {modeVisible} from "../src/core/exploration";
import {nativeFog} from "../src/renderer/materials";
import type {LevelData,Terrain} from "../src/shared/types";

declare global {interface Window {
  probeAccuracy:()=>{shade:number[];sky:number[];horizon:number[];yaw:number;fog:number[];expectedFog:number};
  captureNativeView:(data:LevelData,view:number[],projection:number[])=>string;
  probeFogControl:(data:LevelData)=>boolean[];
}}
window.probeAccuracy=()=>{
  const renderer=new T.WebGLRenderer({antialias:false});renderer.setPixelRatio(1);renderer.setSize(64,64);renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-.5,.5,.5,-.5,.1,20);camera.position.set(.5,8,.5);camera.up.set(0,0,-1);camera.lookAt(.5,0,.5);
  const terrain={width:1,height:1,tileNames:["fixture"],descriptors:new Uint16Array(1),heights:new Int16Array(65536),light:new Uint8Array(65536).fill(128),minimum:0,maximum:0} as Terrain;
  const rgba=new Uint8Array(32*32*4);for(let i=0;i<rgba.length;i+=4)rgba.set([200,100,40,255],i);
  const meshes=buildTerrain(terrain,{width:32,height:32,rgba},1,256);meshes.forEach(m=>scene.add(m));
  const pixel=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
  const shade=pixel();meshes.forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.map?.dispose();m.material.dispose();});
  const image=(r:number,g:number,b:number,a=255)=>({width:1,height:1,rgba:Uint8Array.of(r,g,b,a)});
  const sky=makeSky([image(200,80,20),image(100,40,60),image(20,100,180,128)]);scene.add(sky.mesh);
  const perspective=new T.PerspectiveCamera(60,1,.1,100);perspective.lookAt(0,0,1);sky.update(perspective,64,64);
  const skyPixel=(y:number)=>{renderer.render(scene,perspective);const p=new Uint8Array(4),gl=renderer.getContext();gl.readPixels(32,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};
  // At this viewport the strip covers the top; bottom remains base/detail only.
  const skyColor=skyPixel(1),horizon=skyPixel(40),yaw=skyProjection(perspective,64,64).yaw;
  scene.remove(sky.mesh);sky.mesh.geometry.dispose();sky.mesh.material.dispose();sky.textures.forEach(t=>t.dispose());
  const geometry=new T.BufferGeometry();geometry.setAttribute("position",new T.Float32BufferAttribute([-1.6,-1.6,-2,4.8,-4.8,-6,0,3.2,-4],3));
  const material=nativeFog(new T.MeshBasicMaterial({color:0xff0000})),triangle=new T.Mesh(geometry,material);scene.add(triangle);scene.fog=new T.Fog(0,0,10);
  perspective.position.set(0,0,0);perspective.lookAt(0,0,-1);perspective.fov=90;perspective.updateProjectionMatrix();
  const fog=skyPixel(32),c=(1/64+.8)/1.6,b=((1/64+.8)-.8*c)/1.6,a=1-b-c;
  const expectedFog=255*(1-(a*Math.hypot(1.6,2)+b*Math.hypot(4.8,6)+c*4)/10);
  geometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();
  return {shade,sky:skyColor,horizon,yaw,fog,expectedFog};
};
window.captureNativeView=(data,view,projection)=>{
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-10000px;top:0;width:640px;height:480px";document.body.append(host);
  const map=new MapScene(host,false);map.renderer.setPixelRatio(1);map.resize();map.load(data);map.setMode("fly");
  map.camera.matrixWorldInverse.set(-view[0],-view[1],-view[2],-view[3]/512,view[4],view[5],view[6],view[7]/512,-view[8],-view[9],-view[10],-view[11]/512,0,0,0,1);
  map.camera.matrixWorld.copy(map.camera.matrixWorldInverse).invert();map.camera.matrixWorld.decompose(map.camera.position,map.camera.quaternion,map.camera.scale);
  map.camera.fov=2*Math.atan(480/(2*projection[11]*projection[10]))*180/Math.PI;map.camera.near=10/512;map.camera.updateProjectionMatrix();
  // Match campaign visibility and first-person exclusion. Viewer overlays stay off.
  map.groups.routes.visible=false;
  const objects=[...data.objects,...data.citadelObjects,...data.derivedObjects];
  map.filterObjects(id=>{const o=objects.find(o=>o.id===id);return !!o&&modeVisible(o,"single",data.mission.config)&&o.derived?.type!=="player-start";});
  map.scene.traverse(node=>{if(node instanceof T.Line || (node instanceof T.Mesh && ["RingGeometry","TorusGeometry"].includes(node.geometry.type)))node.visible=false;});
  map.fog(true);map.renderOnce();const result=map.renderer.domElement.toDataURL("image/png");
  map.clear();map.controls.dispose();map.renderer.dispose();map.renderer.forceContextLoss();host.remove();return result;
};
window.probeFogControl=data=>{
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-10000px;width:320px;height:240px";document.body.append(host);
  const map=new MapScene(host,false);map.load(data);map.setMode("fly");
  const result:boolean[]=[];
  map.camera.position.set(128,200,128);map.camera.lookAt(129,200,128);map.renderOnce();result.push(map.scene.fog===null);
  map.fog(true);map.renderOnce();result.push(map.scene.fog!==null);
  map.camera.position.y=0;map.camera.lookAt(129,0,128);map.renderOnce();result.push(map.scene.fog!==null);
  map.environment(false);map.renderOnce();result.push(map.scene.fog!==null&&map.sky?.visible===false);
  map.fog(false);map.renderOnce();result.push(map.scene.fog===null&&map.sky?.visible===false);
  map.load(data);map.renderOnce();result.push(map.scene.fog===null&&map.sky?.visible===true);
  map.fog(true);map.load(data);map.renderOnce();result.push(map.scene.fog!==null);
  map.clear();map.controls.dispose();map.renderer.dispose();map.renderer.forceContextLoss();host.remove();return result;
};
