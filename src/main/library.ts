import { promises as fs } from "node:fs";
import path from "node:path";
import { loadStaticModels } from "./models";
import { loadStaticSprites } from "./sprites";
import { citadelPlacements } from "../core/exploration";
import {deriveScene} from "../core/derived-scene";
import {prepareTerrain,decodeDepth} from "../core/accuracy";
import {loadEnvironment} from "./environment";
import {
  decodeText,
  parseConfig,
  parseMap,
  parseBriefing,
  decodeBitmap,
  rgbaBitmap,
  decodeRle,
  requireThat,
} from "../core/formats";
import type { Library, Mission, LevelData, ImageData } from "../shared/types";
export function assetKey(name: string) {
  const key = name.replaceAll("\\", "/").toLowerCase();
  requireThat(
    !key.startsWith("/") &&
      !key.includes(":") &&
      !key.split("/").some((p) => p === ".." || p === "." || !p),
    "Invalid asset path",
  );
  return key;
}
export class GameLibrary {
  root = "";
  files = new Map<string, string>();
  archive: Buffer | null = null;
  entries = new Map<string, { size: number; packed: number; offset: number }>();
  missions: Mission[] = [];
  static async open(root: string) {
    const lib = new GameLibrary();
    lib.root = await fs.realpath(root);
    await lib.scan(lib.root, "", 0);
    requireThat(
      [...lib.files.keys()].some(
        (k) => k.startsWith("grids/") && k.endsWith(".lfl"),
      ),
      "Choose the game folder containing GRIDS and mission files.",
    );
    const archivePath = lib.files.get("uprising.cln");
    if (archivePath) {
      lib.archive = await fs.readFile(archivePath);
      const b = lib.archive;
      let pos = 0;
      const word = () => {
        requireThat(pos + 4 <= b.length, "Truncated CLN index");
        let n = b.readUInt32LE(pos);
        pos += 4;
        return n;
      };
      const count = word();
      requireThat(count <= 100000, "Invalid CLN count");
      for (let i = 0; i < count; i++) {
        const n = word();
        requireThat(n <= 4096 && pos + n <= b.length, "Invalid CLN name");
        const name = decodeText(b.subarray(pos, pos + n)).replace(/\0+$/, "");
        pos += n;
        const size = word(),
          packed = word(),
          offset = word();
        if (name && size && offset) {
          requireThat(
            offset + 12 + (packed || size) <= b.length,
            "CLN entry outside archive",
          );
          lib.entries.set(assetKey(name), {
            size,
            packed,
            offset: offset + 12,
          });
        }
      }
    }
    for (const [key] of lib.files) {
      if (!/^grids\/[^/]+\.lfl$/.test(key)) continue;
      const text = decodeText((await lib.read(key, true))!);
      const config = parseConfig(text);
      if (!config.SLK_FILE) continue;
      lib.missions.push({
        id: key,
        title: path.posix
          .basename(key, ".lfl")
          .replaceAll("_", " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        environment: (config.ENVIRONMENT_TYPE || "Unknown").replace(
          "_ENVIRONMENT",
          "",
        ),
        categories: [
          ...text.matchAll(/^\s*#(CAMPAIGN|MULTIPLAYER|QUICKSTART)/gm),
        ].map((m) => m[1]),
        config,
        mapFile: "grids/" + config.SLK_FILE,
      });
    }
    lib.missions.sort((a, b) => a.title.localeCompare(b.title));
    requireThat(lib.missions.length, "No supported missions found");
    return lib;
  }
  async scan(dir: string, prefix: string, depth: number) {
    if (depth > 5) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const key = (prefix + entry.name).toLowerCase(),
        full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (
          depth === 0 &&
          ![
            "grids",
            "tiles1",
            "bitmaps",
            "models",
            "models2",
            "impbmps",
            "media",
            "sprites",
            "rblbmps",
          ].includes(key)
        )
          continue;
        await this.scan(full, key + "/", depth + 1);
      } else if (entry.isFile()) this.files.set(key, full);
    }
  }
  async read(name: string, looseOnly = false) {
    const key = assetKey(name),
      file = this.files.get(key);
    if (file) {
      const real = await fs.realpath(file),
        relative = path.relative(this.root, real);
      requireThat(
        relative !== ".." &&
          !relative.startsWith(".." + path.sep) &&
          !path.isAbsolute(relative),
        "Asset escapes game folder",
      );
      const stat = await fs.stat(real);
      requireThat(stat.size <= 128 * 1024 * 1024, "Asset too large");
      return fs.readFile(real);
    }
    const e = !looseOnly && this.entries.get(key);
    if (!e || !this.archive) return null;
    const bytes = this.archive.subarray(
      e.offset,
      e.offset + (e.packed || e.size),
    );
    return e.packed ? decodeRle(bytes, e.size) : bytes;
  }
  info(lastMission: string | null): Library {
    return {
      root: this.root,
      missions: this.missions,
      warnings: this.archive
        ? []
        : ["No uprising.cln archive found. Some assets may be unavailable."],
      lastMission,
    };
  }
  async load(id: string, playerTechnology = 0): Promise<LevelData> {
    const mission = this.missions.find((m) => m.id === id);
    requireThat(mission, "Unknown mission");
    const mapBytes = await this.read(mission.mapFile, true);
    requireThat(mapBytes, `Missing ${mission.mapFile}`);
    const parsed = parseMap(mapBytes),
      warnings: string[] = [];
    prepareTerrain(parsed.terrain,mission.config.LIGHTING_ON!=="0");
    try {parsed.terrain.detail=decodeDepth(await this.read(mission.mapFile.replace(/\.slk$/i,".dph")),parsed.terrain);} catch(e) {warnings.push(`Depth: ${(e as Error).message}`);parsed.terrain.detail=decodeDepth(null,parsed.terrain);}
    const optional = async (name: string, loose = true) => {
      const data = await this.read(name, loose);
      if (!data) warnings.push(`Missing ${name}`);
      return data;
    };
    const configText = decodeText((await this.read(id, true))!);
    const scriptFile = mission.config.SCRIPT_FILE || null;
    const scriptBytes = scriptFile
      ? await optional("grids/" + scriptFile)
      : null;
    const briefingBytes = mission.config.MAP_TEXT
      ? await optional("grids/" + mission.config.MAP_TEXT)
      : null;
    const briefingText = briefingBytes ? decodeText(briefingBytes) : "",
      script = scriptBytes ? decodeText(scriptBytes) : "";
    let atlas: ImageData | null = null;
    let modelPalette: Uint8Array | null = null;
    const atlasColumns = Math.ceil(Math.sqrt(parsed.terrain.tileNames.length));
    try {
      const paletteBytes = await optional(
        "grids/palettes/" + mission.config.PALETTE,
      );
      if (paletteBytes) {
        const palette = decodeBitmap(paletteBytes).palette;
        modelPalette = palette;
        const count = parsed.terrain.tileNames.length,
          rows = Math.ceil(count / atlasColumns),
          width = atlasColumns * 32,
          height = rows * 32,
          rgba = new Uint8Array(width * height * 4);
        const stem = path.posix.basename(assetKey(mission.mapFile), ".slk");
        const pack = await this.read(`grids/packs/${stem}_01.pak`, true);
        if (pack)
          requireThat(
            pack.length >= 4 + count * 1024 &&
              pack[0] === 32 &&
              pack[1] === 0 &&
              pack[2] === 32 &&
              pack[3] === 0,
            "Invalid terrain tile pack",
          );
        for (let t = 0; t < count; t++) {
          let pixels: Uint8Array;
          if (pack) pixels = pack.subarray(4 + t * 1024, 4 + (t + 1) * 1024);
          else {
            const bytes = await this.read(
              "tiles1/" + parsed.terrain.tileNames[t],
            );
            requireThat(bytes, `Missing tile ${parsed.terrain.tileNames[t]}`);
            const b = decodeBitmap(bytes);
            requireThat(
              b.width === 32 && b.height === 32,
              "Invalid named tile dimensions",
            );
            pixels = b.pixels;
          }
          for (let y = 0; y < 32; y++)
            for (let x = 0; x < 32; x++) {
              const index = pixels[y * 32 + 31 - x];
              const dst =
                ((Math.floor(t / atlasColumns) * 32 + y) * width +
                  (t % atlasColumns) * 32 +
                  x) *
                4;
              rgba.set(palette.subarray(index * 4, index * 4 + 4), dst);
            }
        }
        atlas = { width, height, rgba };
      }
    } catch (e) {
      warnings.push(`Terrain textures: ${(e as Error).message}`);
    }
    const {sky,skyFile,skyLayers,warnings:skyWarnings}=await loadEnvironment(this,mission.config);
    warnings.push(...skyWarnings);
    const citadelObjects = citadelPlacements(parsed.citadels);
    const derivedObjects = deriveScene(parsed,mission.config);
    const { models, modelSelections } = await loadStaticModels(
      this,
      [...parsed.objects, ...citadelObjects.filter(o=>!o.citadel!.empty),...derivedObjects],
      mission.config,
      modelPalette,
      playerTechnology,
    );
    for (const site of citadelObjects.filter(o=>o.citadel!.empty)) modelSelections[site.id] = {
      model:null,label:"Unclaimed citadel site",format:null,manager:"unclaimed",choice:null,slot:null,
      provenance:"SLK citadel owner -1; native loading does not activate a base or upgrades",
      reason:"Unclaimed site; no base is spawned",
    };
    const sprites = await loadStaticSprites(this, modelSelections, modelPalette);
    for (const model of Object.values(models))
      for (const warning of model.warnings)
        warnings.push(`${model.file}: ${warning}`);
    return {
      ...parsed,
      citadelObjects,
      derivedObjects,
      skyLayers,
      palette:modelPalette,
      mission,
      briefing: parseBriefing(briefingText),
      script,
      scriptFile,
      briefingText,
      configText,
      warnings,
      atlas,
      atlasColumns,
      sky,
      skyFile,
      models,
      sprites,
      modelSelections,
      playerTechnology,
    };
  }
}
