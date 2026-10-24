import type {Material} from "three";
// The port submits already projected vertices (clip W=1): fog is radial in
// view X/Z and interpolates affinely in screen space, not perspectively.
export const nativeFogVertex=`#ifdef USE_FOG
vFogDepth=length(mvPosition.xz)*gl_Position.w;
#endif`;
export const nativeFogChunk=`#ifdef USE_FOG
float fogFactor=clamp((vFogDepth*gl_FragCoord.w-fogNear)/max(0.0001,fogFar-fogNear),0.0,1.0);
gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
#endif`;
export function nativeFog<T extends Material>(material:T):T {
  material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace("#include <fog_vertex>",nativeFogVertex);shader.fragmentShader=shader.fragmentShader.replace("#include <fog_fragment>",nativeFogChunk);};
  material.customProgramCacheKey=()=>"native-radial-affine-fog";
  return material;
}
