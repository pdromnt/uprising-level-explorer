import type { ImageData } from "../shared/types";
import { bleedCutoutEdges } from "./cutout";
// initial_numeric_records 0x589748, consumed by gameplay_state_apply_palette.
// Defaults are a viewer preview: saved/network player colors are not loaded.
export const OWNER_COLORS = [[246,247,246,247],[165,168,165,168],[82,83,82,83],[10,15,10,15],[251,252,251,252],[148,152,148,152],[10,15,10,15]];
export const BASE_COLORS = [251,252,251,252];
export function paletteOwner(owner: number) { return owner===8 ? 5 : owner; }
export function factionImage(image: ImageData, palette: Uint8Array | null, owner: number): ImageData {
  const mapping=OWNER_COLORS[paletteOwner(owner)];
  if(!palette || !mapping || !image.indices) return image;
  const rgba=new Uint8Array(image.rgba);
  for(let i=0;i<image.indices.length;i++) {
    const at=BASE_COLORS.lastIndexOf(image.indices[i]);
    if(at<0 || !rgba[i*4+3]) continue;
    rgba.set(palette.subarray(mapping[at]*4,mapping[at]*4+3),i*4);
  }
  if(rgba.some((v,i)=>i%4===3 && v===0)) bleedCutoutEdges(rgba,image.width,image.height);
  return {...image,rgba};
}
