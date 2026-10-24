import * as T from "three";
import { makeSoldier, spriteMaterials } from "../src/renderer/sprites";
import { bleedCutoutEdges } from "../src/core/cutout";
import type { StaticSprite } from "../src/shared/types";
declare global { interface Window { probeSoldierSprites: () => { views: number; picked: number; samples: number; fringes: number; mirrored: boolean; factionColors: boolean } } }
window.probeSoldierSprites = () => {
  const images = [0,1,2].map(view => {
    const rgba=new Uint8Array(32*32*4);
    for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
      const color = view===0 ? [0,255,0,255] : view===2 ? [255,255,0,255] : x<16 ? [255,0,0,255] : [0,0,255,255];
      rgba.set(x>=2 && x<30 && y>=2 && y<30 ? color : [255,0,255,0],(y*32+x)*4);
    }
    bleedCutoutEdges(rgba,32,32);return {width:32,height:32,rgba};
  });
  const asset:StaticSprite={file:'fixture',profile:'insit',width:280/512,height:280/512,centerHeight:140/512,images};
  const materials=spriteMaterials(asset), soldier=makeSoldier(asset,materials,0),scene=new T.Scene();
  scene.background=new T.Color(0);scene.add(soldier.root);
  soldier.sprite.userData.id=7;
  const camera=new T.OrthographicCamera(-.5,.5,.5,-.5,.1,10);
  const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(64,64);renderer.setPixelRatio(1);
  const gl=renderer.getContext(),pixels=new Uint8Array(64*64*4),ray=new T.Raycaster();
  let views=0,picked=0,samples=0,fringes=0;const sides:number[][]=[];
  for (const [index,position] of [[0,0,3],[3,1,0],[0,2,-3],[-3,1,0]].entries()) {
    camera.position.fromArray(position);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    soldier.update(camera);renderer.render(scene,camera);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if (soldier.sprite.material===materials[index] && pixels.some((v,i)=>i%4!==3 && v>80)) views++;
    ray.setFromCamera(new T.Vector2(0,0),camera);
    if(ray.intersectObject(soldier.sprite)[0]?.object.userData.id===7)picked++;
    // The deliberate red/blue interior boundary filters to purple. Check the
    // outer cutout edges, excluding that six-pixel central transition band.
    for(let at=0;at<pixels.length;at+=4){samples++;const x=(at/4)%64;if((x<28 || x>35) && pixels[at]>20 && pixels[at+2]>20 && pixels[at+1]<10)fringes++;}
    if(index===1 || index===3) sides.push([pixels[(32*64+24)*4],pixels[(32*64+24)*4+2],pixels[(32*64+40)*4],pixels[(32*64+40)*4+2]]);
  }
  const mirrored=sides[0][0]>200 && sides[0][3]>200 && sides[1][1]>200 && sides[1][2]>200;
  const palette=new Uint8Array(1024);palette.set([0,255,0,255],148*4);
  const mappedAsset={...asset,images:images.map(i=>({...i,indices:new Uint8Array(32*32).fill(251)}))};
  const mappedMaterials=spriteMaterials(mappedAsset,{palette,owner:5});
  const mapped=makeSoldier(mappedAsset,mappedMaterials,0);
  scene.remove(soldier.root);scene.add(mapped.root);camera.position.set(3,0,0);camera.lookAt(0,0,0);mapped.update(camera);
  renderer.render(scene,camera);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const center=(32*64+32)*4;
  const factionColors=pixels[center+1]>200 && pixels[center]<5 && pixels[center+2]<5 && materials[1].map!==mappedMaterials[1].map;
  soldier.root.traverse(node=>{if(node instanceof T.Mesh){node.geometry.dispose();(node.material as T.Material).dispose();}});
  for(const material of materials){material.map?.dispose();material.dispose();}
  mapped.root.traverse(node=>{if(node instanceof T.Mesh){node.geometry.dispose();(node.material as T.Material).dispose();}});
  for(const material of mappedMaterials){material.map?.dispose();material.dispose();}
  renderer.dispose();renderer.forceContextLoss();
  return {views,picked,samples,fringes,mirrored,factionColors};
};
