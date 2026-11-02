// Viewer locomotion only: no game physics, collision, AI or mission state.
export interface TankState { x:number; z:number; heading:number; velocity:number }
export function stepTank(state:TankState,keys:ReadonlySet<string>,dt:number,speed:number,width:number,height:number,margin=.5) {
  const time=Math.max(0,Math.min(.05,dt));
  const throttle=Number(keys.has("KeyW"))-Number(keys.has("KeyS"));
  const maxSpeed=Math.max(1,Math.min(20,speed/5)),target=throttle*maxSpeed*(throttle<0?.55:1);
  const acceleration=(throttle?9:12)*time;
  state.velocity+=Math.max(-acceleration,Math.min(acceleration,target-state.velocity));
  const steer=Number(keys.has("KeyD"))-Number(keys.has("KeyA"));
  state.heading=(state.heading+steer*1.45*time+Math.PI*2)%(Math.PI*2);
  const x=state.x+Math.sin(state.heading)*state.velocity*time,z=state.z+Math.cos(state.heading)*state.velocity*time;
  const mx=Math.min(margin,width/2),mz=Math.min(margin,height/2);
  state.x=Math.max(mx,Math.min(width-mx,x));state.z=Math.max(mz,Math.min(height-mz,z));
  if(state.x!==x||state.z!==z)state.velocity=0;
}
