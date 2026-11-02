import * as T from "three";
import {stepTank,type TankState} from "../core/tank";
import {terrainHeight} from "../core/accuracy";
import {modelPrototype} from "./models";
import {restingAttitude,orientationMatrix,applyWraithGun} from "./grounding";
import {boundsShadow,boundsShadowPositions} from "./shadows";
import type {LevelData,Placement,StaticModel} from "../shared/types";

export interface TankView {x:number;z:number;heading:number;lookYaw:number;lookPitch:number;distance:number}
export class TankRig {
  group=new T.Group();
  model:T.Group;
  state:TankState={x:0,z:0,heading:0,velocity:0};
  lookYaw=0;
  lookPitch=.32;
  distance=8;
  private shadow:T.Mesh|null=null;
  private target=new T.Vector3();
  private get margin(){return Math.hypot(this.asset.data.center[0],this.asset.data.center[2])/512+.1;}
  constructor(private data:LevelData,private asset:StaticModel,readonly start:Placement,colors:boolean) {
    this.model=modelPrototype(asset,new Map(),colors?{palette:data.palette,owner:0}:undefined);
    this.group.add(this.model);this.reset();
    this.shadow=boundsShadow(this.model,(x,z)=>terrainHeight(data.terrain,x,z));
    if(this.shadow)this.group.add(this.shadow);
    this.group.visible=false;
  }
  reset(){this.state={x:this.start.x,z:this.start.z,heading:this.start.heading*Math.PI/180,velocity:0};this.lookYaw=0;this.lookPitch=.32;this.pose(1);}
  snapshot():TankView {return {...this.state,lookYaw:this.lookYaw,lookPitch:this.lookPitch,distance:this.distance};}
  restore(view:TankView){Object.assign(this.state,{x:view.x,z:view.z,heading:view.heading,velocity:0});this.lookYaw=view.lookYaw;this.lookPitch=view.lookPitch;this.distance=view.distance;this.pose(1);}
  relocate(x:number,z:number){const mx=Math.min(this.margin,this.data.terrain.width/2),mz=Math.min(this.margin,this.data.terrain.height/2);this.state.x=T.MathUtils.clamp(x,mx,this.data.terrain.width-mx);this.state.z=T.MathUtils.clamp(z,mz,this.data.terrain.height-mz);this.state.velocity=0;this.pose(1);}
  look(dx:number,dy:number){this.lookYaw-=dx*.005;this.lookPitch=T.MathUtils.clamp(this.lookPitch+dy*.004,.08,1.15);}
  private pose(blend:number) {
    const placement={...this.start,x:this.state.x,z:this.state.z,heading:this.state.heading*180/Math.PI};
    const pose=restingAttitude(this.data.terrain,placement,this.asset.data);
    this.model.position.set(this.state.x,pose.height??terrainHeight(this.data.terrain,this.state.x,this.state.z),this.state.z);
    const rotation=new T.Quaternion().setFromRotationMatrix(orientationMatrix(pose.heading,pose.pitch,pose.roll,new T.Vector3())).normalize();
    this.model.quaternion.slerp(rotation,blend);
    // Use the same static Wraith gun compensation as the inspected player body.
    applyWraithGun(this.model,this.asset.data,pose);
    this.model.updateWorldMatrix(true,true);
    if(this.shadow){const positions=boundsShadowPositions(this.model,(x,z)=>terrainHeight(this.data.terrain,x,z));const attribute=this.shadow.geometry.getAttribute("position") as T.BufferAttribute;attribute.set(positions);attribute.needsUpdate=true;this.shadow.geometry.computeBoundingSphere();}
    this.target.copy(this.model.position).add(new T.Vector3(0,.7,0));
  }
  update(dt:number,keys:ReadonlySet<string>,speed:number,camera:T.PerspectiveCamera,shadows:boolean,snap=false) {
    stepTank(this.state,keys,dt,speed,this.data.terrain.width,this.data.terrain.height,this.margin);
    this.pose(snap?1:1-Math.exp(-12*dt));
    if(this.shadow)this.shadow.visible=shadows;
    const yaw=this.state.heading+this.lookYaw,horizontal=Math.cos(this.lookPitch)*this.distance;
    const desired=this.target.clone().add(new T.Vector3(-Math.sin(yaw)*horizontal,Math.sin(this.lookPitch)*this.distance,-Math.cos(yaw)*horizontal));
    camera.position.lerp(desired,snap?1:1-Math.exp(-7*dt));
    // Shorten the boom against terrain, including intermediate ridges.
    const end=camera.position.clone();
    for(let i=1;i<=32;i++) {const point=this.target.clone().lerp(end,i/32);if(point.y<terrainHeight(this.data.terrain,point.x,point.z)+.45){camera.position.copy(this.target).lerp(end,Math.max(0,(i-1)/32));break;}}
    camera.position.y=Math.max(camera.position.y,terrainHeight(this.data.terrain,camera.position.x,camera.position.z)+.45);
    camera.up.set(0,1,0);camera.lookAt(this.target);
  }
}
