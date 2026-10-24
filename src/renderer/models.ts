import * as T from "three";
import type { StaticModel } from "../shared/types";
import { factionImage } from "../core/faction-colors";
import {nativeFog} from "./materials";

export function modelPrototype(
  model: StaticModel,
  textures: Map<string, T.DataTexture>,
  colors?: {palette:Uint8Array|null;owner:number},
) {
  const root = new T.Group(),
    nodes: T.Mesh[] = [];
  model.data.meshes.forEach((mesh, index) => {
    const positions: number[] = [],
      uvs: number[] = [],
      geometry = new T.BufferGeometry();
    const materials = mesh.materials.map((name) => {
      const source = model.materials[name];
      let texture: T.DataTexture | null = null;
      if (source?.image) {
        const key = source.path + (colors ? `:owner${colors.owner}` : "");
        texture = textures.get(key) ?? null;
        if (!texture) {
          const image = colors ? factionImage(source.image, colors.palette, colors.owner) : source.image;
          texture = new T.DataTexture(image.rgba, image.width, image.height);
          texture.colorSpace = T.SRGBColorSpace;
          texture.magFilter = T.LinearFilter;
          texture.minFilter = T.LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.needsUpdate = true;
          textures.set(key, texture);
        }
      }
      return nativeFog(new T.MeshBasicMaterial({
        map: texture,
        color: texture ? 0xffffff : 0xa9b6aa,
        side: T.FrontSide,
        alphaTest: source?.transparent ? 0.1 : 0,
        transparent: !!source?.transparent,
      }));
    });
    for (let material = 0; material < mesh.materials.length; material++) {
      const start = positions.length / 3,
        scale = model.materials[mesh.materials[material]]?.uvScale ?? [
          256, 256,
        ];
      for (let triangle = 0; triangle < mesh.materialIndices.length; triangle++)
        if (mesh.materialIndices[triangle] === material) {
          for (let corner = 0; corner < 3; corner++) {
            const vertex = mesh.indices[triangle * 3 + corner];
            positions.push(
              mesh.positions[vertex * 3] / 512,
              mesh.positions[vertex * 3 + 1] / 512,
              mesh.positions[vertex * 3 + 2] / 512,
            );
            uvs.push(
              mesh.uvs[triangle * 6 + corner * 2] / scale[0],
              mesh.uvs[triangle * 6 + corner * 2 + 1] / scale[1],
            );
          }
        }
      if (positions.length / 3 > start)
        geometry.addGroup(start, positions.length / 3 - start, material);
    }
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const node = new T.Mesh(geometry, materials);
    node.userData.shadowExtent=mesh.center.map(v=>v*0.8999999761581421/512);
    nodes.push(node);
    if (index === 0) root.add(node);
    else if (model.data.format === 2) {
      const anchor = model.data.anchors[index - 1];
      node.position.set(anchor[0] / 512, anchor[1] / 512, anchor[2] / 512);
      nodes[index - 1].add(node);
    } else root.add(node);
  });
  return root;
}
