import * as T from "three";
import type { ImageData, Terrain } from "../shared/types";
import {nativeFogChunk,nativeFogVertex} from "./materials";

// Keep the recovered 0.2/31.8 UVs. A separate array layer gives each tile
// CLAMP_TO_EDGE semantics at every mip level, as in the game's individual textures.
const layouts = [
  [
    [31.8, 0.2],
    [0.2, 0.2],
    [31.8, 31.8],
    [0.2, 31.8],
  ],
  [
    [0.2, 0.2],
    [0.2, 31.8],
    [31.8, 0.2],
    [31.8, 31.8],
  ],
  [
    [0.2, 31.8],
    [31.8, 31.8],
    [0.2, 0.2],
    [31.8, 0.2],
  ],
  [
    [31.8, 31.8],
    [31.8, 0.2],
    [0.2, 31.8],
    [0.2, 0.2],
  ],
];

export function terrainNormal(t: Terrain, x: number, z: number) {
  const h = (x: number, z: number) =>
    t.heights[(z & 255) * 256 + (x & 255)] / 512;
  return new T.Vector3(
    h(x - 1, z) - h(x + 1, z),
    2,
    h(x, z - 1) - h(x, z + 1),
  ).normalize();
}

export function tileArrayPages(
  atlas: ImageData,
  columns: number,
  count: number,
  maxLayers: number,
) {
  if (!Number.isInteger(maxLayers) || maxLayers < 1)
    throw new Error("Invalid texture-array layer limit");
  const pages: { firstTile: number; count: number; pixels: Uint8Array }[] = [];
  for (let firstTile = 0; firstTile < count; firstTile += maxLayers) {
    const layers = Math.min(maxLayers, count - firstTile),
      pixels = new Uint8Array(layers * 32 * 32 * 4);
    for (let layer = 0; layer < layers; layer++) {
      const tile = firstTile + layer;
      for (let y = 0; y < 32; y++) {
        const src =
          ((Math.floor(tile / columns) * 32 + y) * atlas.width +
            (tile % columns) * 32) *
          4;
        pixels.set(
          atlas.rgba.subarray(src, src + 32 * 4),
          (layer * 32 * 32 + y * 32) * 4,
        );
      }
    }
    pages.push({ firstTile, count: layers, pixels });
  }
  return pages;
}

export function terrainMaterial(texture: T.DataArrayTexture | null) {
  const material = new T.MeshBasicMaterial({
    map: texture,
    vertexColors: !texture,
    side: T.FrontSide,
  });
  material.userData.terrainTexture = texture;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float tileLayer;\nattribute float nativeLight;\nout float vNativeLight;\nflat out float vTerrainLayer;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvTerrainLayer = tileLayer;\nvNativeLight = nativeLight;",
      )
      .replace("#include <project_vertex>","#include <project_vertex>\nvNativeLight *= gl_Position.w;")
      .replace("#include <fog_vertex>",nativeFogVertex);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <fog_fragment>",nativeFogChunk)
      .replace(
        "#include <map_pars_fragment>",
        "#ifdef USE_MAP\nuniform highp sampler2DArray map;\n#endif\nin float vNativeLight;\nflat in float vTerrainLayer;",
      )
      .replace(
        "#include <map_fragment>",
        "#ifdef USE_MAP\nvec4 nativeTexel = texture(map, vec3(vMapUv, vTerrainLayer));\ndiffuseColor *= sRGBTransferEOTF(vec4(nativeTexel.rgb * vNativeLight * gl_FragCoord.w, nativeTexel.a));\n#endif",
      );
  };
  material.customProgramCacheKey = () => "terrain-array-v1";
  return material;
}

export function buildTerrain(
  t: Terrain,
  atlas: ImageData | null,
  columns: number,
  maxLayers: number,
  anisotropy = 1,
) {
  const pages = atlas
    ? tileArrayPages(atlas, columns, t.tileNames.length, maxLayers)
    : [{ firstTile: 0, count: t.tileNames.length, pixels: null }];
  const buffers = pages.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    colors: [] as number[],
    layers: [] as number[],
    light: [] as number[],
  }));
  for (let z = 0; z < t.height; z++)
    for (let x = 0; x < t.width; x++) {
      const descriptor = t.descriptors[z * t.width + x],
        tile = descriptor & 16383;
      const page = atlas ? Math.floor(tile / maxLayers) : 0,
        buffer = buffers[page];
      const corners = [
          [x, z],
          [x + 1, z],
          [x, z + 1],
          [x + 1, z + 1],
        ],
        uv = layouts[descriptor >>> 14];
      for (const i of (x + z) & 1 ? [0, 3, 1, 0, 2, 3] : [0, 2, 1, 1, 2, 3]) {
        const [cx, cz] = corners[i],
          at=(cz & 255)*256+(cx & 255),
          height = t.renderHeights?.[at] ?? t.heights[at] / 512;
        buffer.positions.push(cx, height, cz);
        // UV seams require duplicate vertices, but their lighting normal must be shared.
        buffer.normals.push(...terrainNormal(t, cx, cz).toArray());
        buffer.uvs.push(uv[i][0] / 32, uv[i][1] / 32);
        buffer.layers.push(tile - pages[page].firstTile);
        // world_begin uses INVERSE_TEXTURE, with byte RGB divided by 256.
        buffer.light.push(t.light ? 1-t.light[at]/256 : 1);
        const color = new T.Color().setHSL(
          0.18,
          0.18,
          0.3 +
            (0.32 * (height * 512 - t.minimum)) /
              Math.max(1, t.maximum - t.minimum),
        );
        buffer.colors.push(color.r, color.g, color.b);
      }
    }
  return pages.flatMap((page, i) => {
    if (!buffers[i].positions.length) return [];
    const geometry = new T.BufferGeometry(),
      buffer = buffers[i];
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(buffer.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new T.Float32BufferAttribute(buffer.normals, 3),
    );
    geometry.setAttribute("uv", new T.Float32BufferAttribute(buffer.uvs, 2));
    geometry.setAttribute("nativeLight",new T.Float32BufferAttribute(buffer.light,1));
    geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(buffer.colors, 3),
    );
    geometry.setAttribute(
      "tileLayer",
      new T.Float32BufferAttribute(buffer.layers, 1),
    );
    let texture: T.DataArrayTexture | null = null;
    if (page.pixels) {
      texture = new T.DataArrayTexture(page.pixels, 32, 32, page.count);
      // Native hardware modulates palette RGB before display gamma conversion.
      texture.colorSpace = T.NoColorSpace;
      texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
      texture.magFilter = T.LinearFilter;
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
    return [new T.Mesh(geometry, terrainMaterial(texture))];
  });
}
