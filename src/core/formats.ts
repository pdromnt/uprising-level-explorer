import type { ParsedMap, Briefing, Bitmap } from "../shared/types";
export const decodeText = (data: Uint8Array) =>
  new TextDecoder("windows-1252").decode(data);
export function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function parseConfig(text: string) {
  const config: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+):\s*(.*)$/.exec(line);
    if (m) config[m[1]] = m[2].trim();
  }
  return config;
}
export function parseBriefing(text: string): Briefing {
  const section = (name: string) =>
    new RegExp(`${name}_BEGIN\\s*([\\s\\S]*?)${name}_END`, "g");
  return {
    objective: section("OBJECTIVE").exec(text)?.[1].trim() ?? "",
    description: section("DESCRIPTION").exec(text)?.[1].trim() ?? "",
    spy: [...text.matchAll(section("SPYINFO"))].map((m) =>
      m[1].trim().replace(/^\d+\s*/, ""),
    ),
    ranking: Number(/CAMPAIGN_RANKING\s+(\d+)/.exec(text)?.[1]) || null,
  };
}
export function parseMap(data: Uint8Array): ParsedMap {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  const line = () => {
    while (pos < data.length) {
      let end = pos;
      while (end < data.length && data[end] !== 10) end++;
      const s = decodeText(data.subarray(pos, end)).trim();
      pos = Math.min(end + 1, data.length);
      if (s && !s.startsWith("#")) return s;
    }
    throw new Error(`Unexpected map EOF at ${pos}`);
  };
  const nums = (s: string, n: number) => {
    const a = s.split(/\s+/).map(Number);
    requireThat(
      a.length === n && a.every(Number.isFinite),
      `Invalid numeric record at ${pos}`,
    );
    return a;
  };
  const count = (name: string, max: number) => {
    const a = line().split(/\s+/);
    const n = Number(a[1]);
    requireThat(
      a[0] === name && Number.isInteger(n) && n >= 0 && n <= max,
      `Invalid ${name} section`,
    );
    return n;
  };
  const point = (a: number[]) => ({ x: a[0], z: a[1], y: a[2] });
  const start = (a: number[]) => ({ x: a[0], z: a[1], heading: a[2] });
  const rect = () => {
    const a = nums(line(), 4);
    return { x1: a[0], z1: a[1], x2: a[2], z2: a[3] };
  };
  const version = line();
  requireThat(version === "SLICK 1.03", `Unsupported map: ${version}`);
  const terrainOffset = Number(line().split(/\s+/)[1]);
  const slotsOffset = Number(line().split(/\s+/)[1]);
  requireThat(
    Number.isInteger(terrainOffset) &&
      terrainOffset >= pos &&
      terrainOffset < data.length &&
      Number.isInteger(slotsOffset) &&
      slotsOffset < data.length,
    "Invalid section offsets",
  );
  pos = terrainOffset;
  const [width, height, tileCount] = nums(line(), 3);
  requireThat(
    Number.isInteger(width) &&
      Number.isInteger(height) &&
      width > 0 &&
      height > 0 &&
      width <= 256 &&
      height <= 256 &&
      Number.isInteger(tileCount) &&
      tileCount > 0 &&
      tileCount <= 16384,
    "Invalid terrain dimensions",
  );
  const tileNames = Array.from({ length: tileCount }, line);
  const binaryOffset = pos,
    cells = width * height,
    binarySize = cells * 3 + (width + 1) * (height + 1) * 2;
  requireThat(
    binaryOffset + binarySize <= data.length &&
      slotsOffset >= binaryOffset + binarySize,
    "Terrain exceeds map bounds",
  );
  const descriptors = new Uint16Array(cells),
    flags = new Uint8Array(cells),
    heights = new Int16Array(65536);
  let minimum = Infinity,
    maximum = -Infinity;
  for (let i = 0; i < cells; i++) {
    descriptors[i] = view.getUint16(pos + i * 2, true);
    requireThat(
      (descriptors[i] & 16383) < tileCount,
      "Invalid terrain material",
    );
    const f = data[pos + cells * 2 + i];
    flags[i] = f | (f & 0x51 ? 0x20 : 0);
  }
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      const h = Math.trunc(
        view.getInt16(pos + cells * 3 + (z * (width + 1) + x) * 2, true) *
          0.5120000243186951,
      );
      heights[z * 256 + x] = h;
      minimum = Math.min(minimum, h);
      maximum = Math.max(maximum, h);
    }
  pos = slotsOffset;
  const starts = Array.from({ length: count("slots", 16) }, () =>
    start(nums(line(), 3)),
  );
  const citadels = Array.from(
    { length: count("num_citadels", 16) },
    (_, id) => {
      const words = line().split(/\s+/);
      requireThat(words.shift() === "citadel", "Invalid citadel");
      const [owner, footprintsN, upgradesN, health] = nums(words.join(" "), 4);
      requireThat(
        footprintsN >= 0 &&
          footprintsN <= 16 &&
          upgradesN >= 0 &&
          upgradesN <= 8,
        "Citadel count exceeds limits",
      );
      const footprints = Array.from({ length: footprintsN }, rect);
      requireThat(line() === "claim 1", "Invalid claim");
      const claim = rect();
      const baseLine = line();
      requireThat(baseLine.startsWith("base "), "Invalid base");
      const base = start(nums(baseLine.slice(5), 3));
      requireThat(count("upgrades", 8) === upgradesN, "Upgrade count mismatch");
      const upgrades = Array.from({ length: upgradesN }, () => {
        const a = nums(line(), 4);
        return { ...start(a), kind: a[3] };
      });
      return { id, owner, health, footprints, claim, base, upgrades };
    },
  );
  const objects = Array.from({ length: count("objects", 256) }, (_, id) => {
    const sourceOffset = pos;
    const a = line().split(/\s+/);
    requireThat(a.length === 12, "Invalid object record");
    const n = nums(a.slice(0, 6).join(" "), 6),
      tail = nums(a.slice(9).join(" "), 3);
    return {
      id,
      kind: n[0],
      owner: n[1],
      x: n[2],
      z: n[3],
      y: n[4],
      heading: n[5],
      name: a[6],
      attribute: a[7],
      parent: a[8],
      flags: tail[0],
      group: tail[1],
      variant: tail[2],
      sourceOffset,
    };
  });
  const routes = Array.from(
    { length: count("movement_paths", 64) },
    (_, id) => {
      const a = line().split(/\s+/);
      const n = Number(a[1]);
      requireThat(
        a.length === 3 && Number.isInteger(n) && n >= 0 && n <= 16,
        "Invalid route",
      );
      return {
        id,
        name: a[0],
        flags: Number(a[2]),
        points: Array.from({ length: n }, () => point(nums(line(), 3))),
      };
    },
  );
  const teleporters = Array.from(
    { length: count("teleporters", 16) },
    (_, id) => {
      const a = line().split(/\s+/);
      const n = nums(a.slice(1).join(" "), 7);
      return {
        id,
        name: a[0],
        heading: n[0],
        source: point(n.slice(1, 4)),
        destination: point(n.slice(4, 7)),
      };
    },
  );
  return {
    version,
    terrain: {
      width,
      height,
      tileNames,
      descriptors,
      flags,
      heights,
      minimum,
      maximum,
      terrainOffset,
      binaryOffset,
      binarySize,
      slotsOffset,
      endOffset: pos,
    },
    starts,
    citadels,
    objects,
    routes,
    teleporters,
  };
}
export function decodeBitmap(data: Uint8Array): Bitmap {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  requireThat(
    data.length >= 54 && data[0] === 66 && data[1] === 77,
    "Invalid BMP",
  );
  const offset = v.getUint32(10, true),
    header = v.getUint32(14, true),
    width = v.getInt32(18, true),
    rawHeight = v.getInt32(22, true),
    height = Math.abs(rawHeight),
    bpp = v.getUint16(28, true);
  requireThat(
    header >= 40 &&
      width > 0 &&
      height > 0 &&
      width <= 8192 &&
      height <= 8192 &&
      bpp === 8 &&
      v.getUint32(30, true) === 0,
    "Only uncompressed indexed BMPs are supported",
  );
  const palette = new Uint8Array(1024),
    count = v.getUint32(46, true) || 256;
  requireThat(
    count <= 256 && 14 + header + count * 4 <= offset,
    "Invalid BMP palette",
  );
  for (let i = 0; i < count; i++) {
    let p = 14 + header + i * 4;
    palette.set([data[p + 2], data[p + 1], data[p], 255], i * 4);
  }
  const stride = (width + 3) & ~3;
  requireThat(offset + stride * height <= data.length, "Truncated BMP");
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    pixels.set(
      data.subarray(
        offset + (rawHeight > 0 ? height - y - 1 : y) * stride,
        offset + (rawHeight > 0 ? height - y - 1 : y) * stride + width,
      ),
      y * width,
    );
  return { width, height, pixels, palette };
}
export function rgbaBitmap(b: Bitmap) {
  const rgba = new Uint8Array(b.width * b.height * 4);
  for (let i = 0; i < b.pixels.length; i++)
    rgba.set(b.palette.subarray(b.pixels[i] * 4, b.pixels[i] * 4 + 4), i * 4);
  return { width: b.width, height: b.height, rgba };
}
export function decodeRle(data: Uint8Array, size: number) {
  requireThat(
    size >= 0 && size <= 128 * 1024 * 1024 && data.length % 2 === 0,
    "Invalid RLE size",
  );
  const result = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < data.length; i += 2) {
    requireThat(p + data[i] <= size, "RLE overflow");
    result.fill(data[i + 1], p, p + data[i]);
    p += data[i];
  }
  requireThat(p === size, "RLE length mismatch");
  return result;
}
