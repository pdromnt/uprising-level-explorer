import * as T from "three";
import type {ImageData} from "../shared/types";
export function skyProjection(camera:T.PerspectiveCamera,width:number,height:number) {
  const direction=camera.getWorldDirection(new T.Vector3());
  const fov=2*Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.aspect);
  return {yaw:Math.atan2(direction.x,direction.z)/(Math.PI*2),horizon:height/2+height/(2*Math.tan(T.MathUtils.degToRad(camera.fov)/2))*Math.asin(T.MathUtils.clamp(direction.y,-1,1)),yawScale:width/256*Math.PI*2/fov,repeats:fov/(Math.PI*2)*16};
}
export function makeSky(layers:(ImageData|null)[]) {
  const textures=layers.map(image=>{
    const texture=image?new T.DataTexture(image.rgba,image.width,image.height):new T.DataTexture(new Uint8Array(4),1,1);
    texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
  });
  textures[2].wrapT=T.ClampToEdgeWrapping;
  const uniforms={base:{value:textures[0]},detail:{value:textures[1]},horizonMap:{value:textures[2]},hasDetail:{value:!!layers[1]},hasHorizon:{value:!!layers[2]},viewport:{value:new T.Vector2(1,1)},yaw:{value:0},horizon:{value:0},yawScale:{value:1},repeats:{value:1}};
  const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
    vertexShader:`void main(){gl_Position=vec4(position.xy,1.0,1.0);}`,
    fragmentShader:`uniform sampler2D base,detail,horizonMap;uniform bool hasDetail,hasHorizon;uniform vec2 viewport;uniform float yaw,horizon,yawScale,repeats;
    void main(){vec2 screen=vec2(gl_FragCoord.x,viewport.y-gl_FragCoord.y);vec2 uv=screen/256.0+vec2(-yaw*yawScale,-horizon/256.0+0.5);vec3 rgb=texture2D(base,uv).rgb;if(hasDetail)rgb=mix(rgb,texture2D(detail,uv).rgb,0.5);float bottom=horizon+19.0;float top=bottom-128.0;if(hasHorizon && screen.y>=top && screen.y<=bottom){vec4 h=texture2D(horizonMap,vec2(-yaw*16.0+(screen.x/viewport.x-0.5)*repeats,1.0-(screen.y-top)/128.0));rgb=mix(rgb,h.rgb,h.a);}gl_FragColor=vec4(rgb,1.0);}`,
  });
  const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);mesh.frustumCulled=false;mesh.renderOrder=-1000;
  let fog:T.Color|null=null;
  const update=(camera:T.PerspectiveCamera,width:number,height:number)=>{
    const projection=skyProjection(camera,width,height);uniforms.viewport.value.set(width,height);uniforms.yaw.value=projection.yaw;uniforms.horizon.value=projection.horizon;uniforms.yawScale.value=projection.yawScale;uniforms.repeats.value=projection.repeats;
    if(!fog&&layers[0]) {
      const sample=(image:ImageData,u:number,v:number)=>{const x=((Math.floor(u*image.width)%image.width)+image.width)%image.width,y=((Math.floor(v*image.height)%image.height)+image.height)%image.height;return image.rgba.subarray((y*image.width+x)*4,(y*image.width+x)*4+3);};
      const sum=[0,0,0];let count=0;
      const row=Math.floor(Math.min(height-3,Math.max(1,projection.horizon-142)));
      for(let y=0;y<3;y++)for(let x=0;x<256;x++){
        const u=(x/256*width)/256-projection.yaw*projection.yawScale,v=(row+y-projection.horizon)/256+.5;
        const base=sample(layers[0],u,v),detail=layers[1]?sample(layers[1],u,v):null;
        const rgb=[0,1,2].map(i=>detail?(base[i]+detail[i])*.5:base[i]);
        if((rgb[0]===131&&rgb[1]===185&&rgb[2]===190)||(rgb[0]<80&&rgb[1]>220&&rgb[2]<80))continue;
        for(let i=0;i<3;i++)sum[i]+=rgb[i];count++;
      }
      fog=new T.Color().setRGB(...sum.map(v=>v/(Math.max(1,count)*255)) as [number,number,number],T.SRGBColorSpace);
    }
    return fog??new T.Color("#17211f");
  };
  return {mesh,update,textures};
}
