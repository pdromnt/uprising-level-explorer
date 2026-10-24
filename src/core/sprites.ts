import { requireThat } from "./formats";
import { nativeBearing } from "./accuracy";

// class40 factory/profile 2: insit, 3 animation frames, 4 directions,
// scale 280. Only frame zero is presented; three physical views cover four
// logical directions because the final side is mirrored (effect_profile.c).
export const SOLDIER = { profile: "insit", frames: 3, directions: 4, scale: 280, centerHeight: 140 } as const;

export function parseSoldierSequence(bytes: Uint8Array) {
  requireThat(bytes.length >= 16, "Truncated SQC header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(0, true), height = view.getUint32(4, true),
    count = view.getUint32(8, true), stride = view.getUint32(12, true);
  requireThat(width > 0 && height > 0 && width <= 4096 && height <= 4096, "Invalid SQC dimensions");
  requireThat(count >= 9 && count <= 65536 && stride >= width * height, "Invalid SQC frame layout");
  requireThat(16 + count * stride <= bytes.length, "Truncated SQC frames");
  return { width, height, views: [0, 1, 2].map(direction => {
    const at = 16 + direction * SOLDIER.frames * stride;
    return bytes.subarray(at, at + width * height);
  }) };
}

export function soldierView(direction: number) {
  const group = ((direction + 256) & 2047) >> 9;
  return { group, stored: group === 3 ? 1 : group, mirrored: group === 3 };
}

export function soldierDirection(dx: number, dz: number, heading: number) {
  return (nativeBearing(dx,dz)-Math.round(heading*1024/Math.PI))&2047;
}
