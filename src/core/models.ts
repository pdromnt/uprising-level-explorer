import { decodeText, requireThat } from "./formats";

import type {
  BinaryModel,
  ModelFormat,
  ModelMesh,
  ModelSelection,
  Placement,
} from "../shared/types";

import catalog from "./model-catalog.json";
import {accuracyTables} from "./accuracy";

export function parseModel(data: Uint8Array, format: ModelFormat): BinaryModel {
  requireThat(
    Number.isInteger(format) && format >= 0 && format <= 3,
    "Unsupported BDM layout",
  );

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  const check = (bytes: number) =>
    requireThat(
      Number.isSafeInteger(bytes) && bytes >= 0 && pos + bytes <= data.length,
      `Truncated BDM at ${pos}`,
    );

  const u16 = () => {
    check(2);
    const v = view.getUint16(pos, true);
    pos += 2;
    return v;
  };

  const u32 = () => {
    check(4);
    const v = view.getUint32(pos, true);
    pos += 4;
    return v;
  };

  const real = () => {
    check(4);
    const v = view.getFloat32(pos, true);
    pos += 4;
    requireThat(Number.isFinite(v) && Math.abs(v) < 1e9, "Invalid BDM float");
    return v;
  };

  const vector = () => [real(), real(), real()];

  const count = (max: number) => {
    const n = u32();
    requireThat(n <= max, "BDM count exceeds limit");
    return n;
  };

  const skip = (bytes: number) => {
    check(bytes);
    pos += bytes;
  };

  const mesh = (): ModelMesh => {
    const materialCount = u16();
    requireThat(materialCount < 32768, "Invalid BDM material count");

    const vertexCount = count(32768),
      triangleCount = count(1000000),
      materials: string[] = [];

    for (let i = 0; i < materialCount; i++) {
      let end = pos;
      while (end < data.length && data[end] !== 10 && end - pos < 255) end++;
      requireThat(
        end < data.length && data[end] === 10,
        "Unterminated BDM material name",
      );
      const name = decodeText(data.subarray(pos, end));
      requireThat(
        name.length > 0 && !name.includes("\0"),
        "Invalid BDM material name",
      );
      materials.push(name);
      pos = end + 1;
    }

    check(vertexCount * 12 + triangleCount * 32 + 20);

    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = real();

    const indices = new Uint16Array(triangleCount * 3);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = u16();
      requireThat(
        indices[i] < vertexCount && indices[i] < 32768,
        "Invalid BDM vertex index",
      );
    }

    const uvs = new Float32Array(triangleCount * 6);
    for (let i = 0; i < uvs.length; i++) uvs[i] = real();

    const materialIndices = new Uint16Array(triangleCount);
    for (let i = 0; i < triangleCount; i++) {
      materialIndices[i] = u16();
      requireThat(
        materialIndices[i] < materialCount,
        "Invalid BDM material index",
      );
    }

    return {
      materials,
      positions,
      indices,
      uvs,
      materialIndices,
      radius: real(),
      center: vector(),
      auxiliary: real(),
    };
  };

  const meshes = Array.from(
    { length: format === 2 ? 3 : format === 3 ? 8 : 1 },
    mesh,
  );

  const radius = real(),
    center = vector(),
    markerCount = count(100000);
  skip(markerCount * 28);

  let planeCount = 0;
  if (format === 1) {
    planeCount = count(100000);
    for (let i = 0; i < planeCount; i++) {
      const n = count(32767);
      vector();
      skip(n * 24);
    }
  }

  const groups: number[] = [],
    anchors: number[][] = [];

  if (format === 2 || format === 3) {
    for (let i = 0; i < (format === 2 ? 2 : 4); i++) groups.push(count(100000));
    if (format === 2) {
      const last = markerCount - groups[0] - groups[1];
      requireThat(last >= 0, "Invalid BDM marker groups");
      groups.push(last);
    }
    for (let i = 0; i < (format === 2 ? 3 : 6); i++) anchors.push(vector());
    if (format === 3) {
      groups.push(u32(), u32());
    }
  }

  let pointCount = 0,
    secondaryPointCount = 0;
  if (format !== 3) {
    pointCount = count(100000);
    skip(pointCount * 12);
  }
  if (format === 1) {
    secondaryPointCount = count(100000);
    skip(secondaryPointCount * 12);
  }

  const partCount = count(10000),
    partPositions = Array.from({ length: partCount }, vector),
    parts = partPositions.map((position) => ({ position, mesh: mesh() }));

  requireThat(
    pos === data.length,
    `Unexpected BDM trailing bytes: ${data.length - pos}`,
  );

  return {
    format,
    meshes,
    radius,
    center,
    markerCount,
    planeCount,
    pointCount,
    secondaryPointCount,
    groups,
    anchors,
    parts,
    endOffset: pos,
  };
}

type Family = { format: number; labels: string[] };

const families = catalog.families as Record<string, Family>;

const banks = catalog.catalogs as Record<string, Record<string, number[]>>;

const techSuffix: Record<number, string> = {
  33: "TANK",
  34: "TRRT",
  35: "CTRRT",
  36: "SAM",
  37: "LTRRT",
  38: "BOMBER",
  39: "AAV",
  40: "HTRRT",
  41: "CONVOY",
  64: "SOLDIER",
  96: "SOLDIER",
  98: "AAV",
  99: "TANK",
  100: "BOMBER",
  128: "SOLDIER",
  129: "TANK",
  130: "AAV",
  131: "BOMBER",
  132: "SOLDIER",
  133: "TANK",
  134: "AAV",
  135: "BOMBER",
  136: "SILO",
  137: "KSAT",
};

export function selectModel(
  object: Placement,
  config: Record<string, string>,
  playerTechnology = 0,
): ModelSelection {
  if(object.derived?.model) return {model:`models/${object.derived.model}.bdm`,format:object.derived.format??0,label:object.derived.model,manager:object.derived.type,choice:0,slot:0,provenance:"Native derived-scene constructor; frozen initial state",reason:null};
  let kind = object.kind,
    slot: number | null = null,
    choice: number | null = null,
    manager = "unresolved",
    provenance = "";

  const unsupported = (reason: string): ModelSelection => ({
    model: null,
    label: null,
    format: null,
    manager,
    choice,
    slot,
    provenance,
    reason,
  });

  if (kind >= 176 && kind < 192) {
    slot = kind - 176;
    kind = 176;
    manager = "scenery";
    provenance = "SLK scenery subtype";
  } else if (kind >= 119 && kind <= 122) {
    slot = kind - 119;
    kind = 119;
    manager = "fixed";
    provenance = "SLK fixed-building subtype";
  } else {
    const owner = object.owner === 8 ? 5 : object.owner;

    manager =
      owner >= 0 && owner < 4
        ? "player"
        : owner === 4
          ? "imperial"
          : owner === 5
            ? "clan"
            : "unresolved";

    if (manager === "unresolved")
      return unsupported(
        "Owner binding depends on unavailable runtime assignment",
      );

    const rows = banks[manager]?.[kind];
    if (!rows)
      return unsupported("Specialized presentation is not supported yet");

    if (manager === "player") {
      choice =
        kind === 41 ? Number(config.PLR_CONVOY_TL ?? 0) : kind===137 || kind===136 ? 0 : playerTechnology;
      provenance =
        "Viewer player-technology preview; campaign/network assignments are not loaded";
    } else {
      const key = `${manager === "imperial" ? "IMP" : "RBL"}_${techSuffix[kind]}_TL`;
      const raw = config[key];
      choice = raw === undefined ? 0 : Number(raw.split(/\s+/)[0]);
      provenance =
        raw === undefined
          ? `${key} absent; viewer choice 0 preview`
          : `LFL ${key}: ${raw}`;
    }

    if (!Number.isInteger(choice) || choice! < 0 || choice! >= rows.length)
      return unsupported("Technology choice is outside the traced catalog");

    slot = rows[choice!];
  }

  if (kind === 64) {
    if (slot !== 0) return unsupported("Unsupported soldier factory slot");
    return {
      model: null, sprite: "media/sprites/insit.sqc", label: "Soldier (spawn pose)",
      format: null, manager, choice, slot, reason: null,
      provenance: `${provenance}; class40 spawn profile 2 (insit), frozen frame 0; native size and ground offset`,
    };
  }
  const family = families[kind],
    label = family?.labels[slot!];

  if (!label) return unsupported("Factory slot has no supported model label");


  const format = family.format as ModelFormat;

  const model = `models/${label}${format === 2 ? "t" : format === 3 ? "p" : ""}.bdm`;

  return {
    model,
    label,
    format,
    manager,
    choice,
    slot,
    provenance,
    reason: null,
  };
}

export function headingRadians(degrees: number) {
  const steps =
    Math.trunc(
      Math.fround(Math.fround(degrees) * Math.fround(5.688889026641846)),
    ) & 2047;
  return (steps * Math.PI) / 1024;
}

export function modelPose(
  object: Placement,
  model: BinaryModel,
  terrainHeight: number | ((x: number, z: number) => number),
) {
  const sample =
    typeof terrainHeight === "number" ? () => terrainHeight : terrainHeight;
  const airborne = object.kind === 38 || object.kind === 39;
  let height = sample(object.x, object.z) + model.center[1] / 512;
  if ((object.kind >= 176 && object.kind <= 190) || object.derived?.type==="gate" || [33,34,36,37,40,96,98,99,100,119,120,121,122,128,129,130,131,132,133,134,135].includes(object.kind)) {
    // 433e80 -> 42ed30 overwrites the stored scenery Y after SLK construction.
    const f = Math.fround,
      px = f(f(object.x) * 512),
      pz = f(f(object.z) * 512),
      angle = headingRadians(object.heading),
      s = accuracyTables.sine[Math.round(angle*1024/Math.PI)&2047],
      c = accuracyTables.sine[(Math.round(angle*1024/Math.PI)+512)&2047];
    const width = model.center[0],
      depth = model.center[2],
      wc = f(width * c),
      nws = f(width * -s),
      nds = f(-depth * s),
      ndc = f(-depth * c),
      nwc = f(-width * c),
      ws = f(-width * -s);
    const corners = [
      [f(depth * s + px + wc), f(depth * c + pz + nws)],
      [f(px + nds + wc), f(pz + nws + ndc)],
      [f(px + nds + nwc), f(-width * -s + pz + ndc)],
      [f(depth * s + px + nwc), f(depth * c + pz + ws)],
    ];
    let lowest = f(sample(px / 512, pz / 512) * 512);
    if([34,36,37,40].includes(object.kind)) {
      const vertices=model.meshes[0].positions;
      for(let i=0;i<vertices.length;i+=3){const x=f(vertices[i]*c+vertices[i+2]*s+px),z=f(-vertices[i]*s+vertices[i+2]*c+pz);lowest=Math.min(lowest,f(sample(x/512,z/512)*512));}
    } else for (const [x, z] of corners)
      lowest = Math.min(lowest, f(sample(x / 512, z / 512) * 512));
    height = f(lowest + model.center[1]) / 512;
  }
  return {
    x: object.x,
    z: object.z,
    y: airborne || object.derived?.rawY ? object.y : height,
    heading: headingRadians(object.heading),
  };
}
