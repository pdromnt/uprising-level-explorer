import type { DataArrayTexture } from "three";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTerrain, tileArrayPages } from "../src/renderer/terrain";
import type { Terrain } from "../src/shared/types";

export function fixtureTerrain(): Terrain {
  const heights = new Int16Array(65536);
  heights[1] = 256;
  heights[256] = 128;
  heights[257] = 1536;
  heights[258] = 768;
  return {
    width: 2,
    height: 2,
    tileNames: ["red", "green", "blue"],
    descriptors: Uint16Array.of(0, 1 | (1 << 14), 2 | (2 << 14), 0 | (3 << 14)),
    flags: new Uint8Array(4),
    heights,
    minimum: 0,
    maximum: 1536,
    terrainOffset: 0,
    binaryOffset: 0,
    binarySize: 0,
    slotsOffset: 0,
    endOffset: 0,
  };
}
export function fixtureAtlas() {
  const rgba = new Uint8Array(96 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 96; x++) {
      const at = (y * 96 + x) * 4;
      rgba[at + Math.floor(x / 32)] = 255;
      rgba[at + 3] = 255;
    }
  return { width: 96, height: 32, rgba };
}
test("tile pages isolate contrasting neighboring materials and respect small GPU limits", () => {
  const pages = tileArrayPages(fixtureAtlas(), 3, 3, 2);
  assert.deepEqual(
    pages.map((p) => [p.firstTile, p.count]),
    [
      [0, 2],
      [2, 1],
    ],
  );
  for (let tile = 0; tile < 3; tile++) {
    const page = pages[Math.floor(tile / 2)],
      layer = tile - page.firstTile;
    for (let pixel = 0; pixel < 1024; pixel++) {
      const actual = [
        ...page.pixels.subarray(
          (layer * 1024 + pixel) * 4,
          (layer * 1024 + pixel + 1) * 4,
        ),
      ];
      const expected = [0, 0, 0, 255];
      expected[tile] = 255;
      assert.deepEqual(actual, expected);
    }
  }
});
test("UV-split terrain vertices share positions and lighting normals across tiles and diagonals", () => {
  const meshes = buildTerrain(fixtureTerrain(), fixtureAtlas(), 3, 2);
  const byPosition = new Map<string, number[]>();
  let duplicates = 0,
    vertices = 0;
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position"),
      normal = mesh.geometry.getAttribute("normal"),
      uv = mesh.geometry.getAttribute("uv"),
      layers = mesh.geometry.getAttribute("tileLayer");
    vertices += pos.count;
    for (let i = 0; i < pos.count; i++) {
      const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].join(","),
        n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
      assert.ok(n[1] > 0);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-6);
      const old = byPosition.get(key);
      if (old) {
        assert.deepEqual(n, old);
        duplicates++;
      } else byPosition.set(key, n);
      assert.ok(
        uv.getX(i) > 0 && uv.getX(i) < 1 && uv.getY(i) > 0 && uv.getY(i) < 1,
      );
      assert.ok(
        layers.getX(i) >= 0 &&
          layers.getX(i) < (mesh.material.map as DataArrayTexture).image.depth,
      );
    }
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  }
  assert.equal(vertices, 24);
  assert.ok(duplicates > 0);
  assert.equal(byPosition.size, 9);
});
