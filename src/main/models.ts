import { decodeBitmap, requireThat } from "../core/formats";
import { parseModel, selectModel } from "../core/models";
import { bleedCutoutEdges } from "../core/cutout";
import {applyCoverage} from "../core/accuracy";
import type {
  Placement,
  StaticModel,
  ModelSelection,
  ModelMaterial,
} from "../shared/types";
interface AssetReader {
  read(name: string, looseOnly?: boolean): Promise<Uint8Array | null>;
}

export async function loadStaticModels(
  assets: AssetReader,
  objects: Placement[],
  config: Record<string, string>,
  palette: Uint8Array | null,
  playerTechnology: number,
) {
  const models: Record<string, StaticModel> = {},
    modelSelections: Record<number, ModelSelection> = {},
    textures = new Map<string, ModelMaterial>();
  const failures = new Map<string, string>();
  for (const object of objects) {
    const selection = selectModel(object, config, playerTechnology);
    modelSelections[object.id] = selection;
    if (!selection.model || selection.format === null || !selection.label)
      continue;
    const file = selection.model;
    if (failures.has(file)) {
      selection.reason = failures.get(file)!;
      selection.model = null;
      continue;
    }
    if (models[file]) continue;
    try {
      const bytes = await assets.read(file);
      requireThat(bytes, `Missing ${file}`);
      const data = parseModel(bytes, selection.format),
        materials: Record<string, ModelMaterial> = {},
        warnings: string[] = [];
      const prefix = /^i/i.test(selection.label)
        ? "impbmps/"
        : /^r/i.test(selection.label)
          ? "rblbmps/"
          : "bitmaps/";
      for (const mesh of data.meshes)
        for (const name of mesh.materials) {
          if (materials[name]) continue;
          const candidates =
            prefix === "bitmaps/"
              ? ["bitmaps/" + name]
              : [prefix + name, "bitmaps/" + name];
          let chosen = candidates[0],
            bytes: Uint8Array | null = null;
          for (const candidate of candidates) {
            bytes = await assets.read(candidate);
            if (bytes) {
              chosen = candidate;
              break;
            }
          }
          const cached = textures.get(chosen);
          if (cached) {
            materials[name] = cached;
            continue;
          }
          let transparent = /^trans/i.test(name);
          let material: ModelMaterial = {
            path: chosen,
            image: null,
            transparent,
            uvScale: [256, 256],
          };
          try {
            requireThat(bytes, `Missing material ${candidates.join(" or ")}`);
            const bmp = decodeBitmap(bytes),
              colors = palette ?? bmp.palette;
            const width = 2 ** Math.min(8, Math.floor(Math.log2(bmp.width))),
              height = 2 ** Math.min(8, Math.floor(Math.log2(bmp.height))),
              rgba = new Uint8Array(width * height * 4),
              indices = new Uint8Array(width * height);
            const bottomUp =
              new DataView(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength,
              ).getInt32(22, true) > 0;
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                // Native hardware upload retains the BMP's physical row order.
                const sourceY = bottomUp ? bmp.height - y - 1 : y,
                  index = bmp.pixels[sourceY * bmp.width + x],
                  at = (y * width + x) * 4;
                rgba.set(colors.subarray(index * 4, index * 4 + 4), at);
                indices[y * width + x] = index;
                const chroma =
                  rgba[at] === 255 &&
                  rgba[at + 1] === 0 &&
                  rgba[at + 2] === 255;
                if ((/^trans/i.test(name) && index === 254) || chroma) {
                  rgba[at + 3] = 0;
                  transparent = true;
                }
              }
            if (transparent) bleedCutoutEdges(rgba, width, height);
            const image={width,height,rgba,indices};
            if(/^trans/i.test(name))applyCoverage(image);
            material = {
              path: chosen,
              image,
              transparent,
              // Native screen_primitives rescales texel UVs before the backend's
              // 256/aspect division. Combined, that is U/width and V/height.
              uvScale: [width, height],
            };
            if (!palette)
              warnings.push(
                "Mission palette missing; using material BMP palette as a preview fallback",
              );
          } catch (e) {
            warnings.push((e as Error).message);
          }
          textures.set(chosen, material);
          materials[name] = material;
        }
      models[file] = {
        file,
        label: selection.label,
        data,
        materials,
        warnings,
      };
    } catch (e) {
      selection.reason = (e as Error).message;
      failures.set(file, selection.reason);
      selection.model = null;
    }
  }
  return { models, modelSelections };
}
