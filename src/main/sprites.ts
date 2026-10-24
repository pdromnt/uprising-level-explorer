import { decodeBitmap, requireThat } from "../core/formats";
import { bleedCutoutEdges } from "../core/cutout";
import {applyCoverage} from "../core/accuracy";
import { parseSoldierSequence, SOLDIER } from "../core/sprites";
import type { ModelSelection, StaticSprite } from "../shared/types";

export async function loadStaticSprites(
  assets: { read(name: string): Promise<Uint8Array | null> },
  selections: Record<number, ModelSelection>, palette: Uint8Array | null,
) {
  const sprites: Record<string, StaticSprite> = {};
  const soldiers = Object.values(selections).filter(s => s.sprite);
  if (!soldiers.length) return sprites;
  const file = "media/sprites/insit.sqc";
  try {
    requireThat(palette, "Soldier sprite requires the mission palette");
    const bytes = await assets.read(file);
    let width: number, height: number, views: Uint8Array[];
    if (bytes) ({ width, height, views } = parseSoldierSequence(bytes));
    else {
      // Native fallback is used only when the sequence is absent.
      const frames = [];
      for (let d = 0; d < 3; d++) {
        const name = `sprites/insit${d}0.bmp`, bmpBytes = await assets.read(name);
        requireThat(bmpBytes, `Missing ${file} and ${name}`);
        const bmp = decodeBitmap(bmpBytes);
        const bottomUp = new DataView(bmpBytes.buffer, bmpBytes.byteOffset, bmpBytes.byteLength).getInt32(22, true) > 0;
        const pixels = new Uint8Array(bmp.pixels.length);
        for (let y = 0; y < bmp.height; y++) pixels.set(bmp.pixels.subarray((bottomUp ? bmp.height-y-1 : y)*bmp.width, (bottomUp ? bmp.height-y : y+1)*bmp.width), y*bmp.width);
        frames.push({ ...bmp, pixels });
      }
      width = frames[0].width; height = frames[0].height;
      requireThat(frames.every(f => f.width === width && f.height === height), "Inconsistent soldier frame dimensions");
      views = frames.map(f => f.pixels);
    }
    sprites[file] = {
      file: bytes ? file : "sprites/insit{0,1,2}0.bmp", profile: SOLDIER.profile,
      width: SOLDIER.scale / 512, height: SOLDIER.scale / width * height / 512,
      centerHeight: SOLDIER.centerHeight / 512,
      images: views.map(pixels => {
        const rgba = new Uint8Array(width * height * 4);
        for (let i = 0; i < pixels.length; i++) {
          const at = i * 4, color = pixels[i] * 4;
          rgba.set(palette!.subarray(color, color + 4), at);
          rgba[at+3] = pixels[i] === 254 || (rgba[at] === 255 && rgba[at+1] === 0 && rgba[at+2] === 255) ? 0 : 255;
        }
        bleedCutoutEdges(rgba, width, height);
        const image={ width, height, rgba, indices: pixels };applyCoverage(image);return image;
      }),
    };
  } catch (e) {
    for (const selection of soldiers) {
      selection.sprite = null;
      selection.reason = (e as Error).message;
    }
  }
  return sprites;
}
