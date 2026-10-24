import * as T from "three";
import { soldierDirection, soldierView } from "../core/sprites";
import type { StaticSprite } from "../shared/types";
import { factionImage } from "../core/faction-colors";
import {nativeFog} from "./materials";

export function spriteMaterials(asset: StaticSprite, colors?: {palette:Uint8Array|null;owner:number}) {
  return [0, 1, 2, 3].map(group => {
    const view = soldierView(group * 512), original = asset.images[view.stored];
    const image = colors ? factionImage(original, colors.palette, colors.owner) : original;
    const texture = new T.DataTexture(image.rgba, image.width, image.height);
    texture.colorSpace = T.SRGBColorSpace;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearFilter;
    // Native quads inset UVs by half a texel. Each logical direction owns its
    // transform; mirrored soldiers never mutate another soldier's texture.
    const inset = .5 / image.width;
    texture.offset.set(view.mirrored ? 1 - inset : inset, .5 / image.height);
    texture.repeat.set((view.mirrored ? -1 : 1) * (1 - 2 * inset), 1 - 1 / image.height);
    texture.needsUpdate = true;
    return nativeFog(new T.SpriteMaterial({ map: texture, alphaTest: .1, transparent: true, depthWrite: false }));
  });
}

export function makeSoldier(asset: StaticSprite, materials: T.SpriteMaterial[], heading: number) {
  const root = new T.Group(), sprite = new T.Sprite(materials[0]);
  sprite.scale.set(asset.width, asset.height, 1);
  root.add(sprite);
  // Stable three-dimensional bounds for focus and selection from every view.
  // The box is invisible and never used for ray picking.
  const bounds = new T.Mesh(new T.BoxGeometry(asset.width, asset.height, asset.width), new T.MeshBasicMaterial());
  bounds.visible = false;
  root.add(bounds);
  const position = new T.Vector3();
  const update = (camera: T.Camera) => {
    root.getWorldPosition(position);
    const direction = soldierDirection(camera.position.x - position.x, camera.position.z - position.z, heading);
    sprite.material = materials[soldierView(direction).group];
  };
  return { root, sprite, update };
}
