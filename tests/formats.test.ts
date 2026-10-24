import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  parseMap,
  decodeRle,
  decodeBitmap,
  parseConfig,
  parseBriefing,
} from "../src/core/formats";
import { assetKey, GameLibrary } from "../src/main/library";
test("paths use game separators and reject escapes", () => {
  assert.equal(assetKey("GRIDS\\Test.SLK"), "grids/test.slk");
  for (const name of ["../secret", "C:\\secret", "/secret", "a/../../b"])
    assert.throws(() => assetKey(name));
});
test("RLE rejects malformed, short and overflowing records", () => {
  assert.deepEqual([...decodeRle(Uint8Array.of(2, 9, 1, 3), 3)], [9, 9, 3]);
  for (const [bytes, size] of [
    [Uint8Array.of(2), 2],
    [Uint8Array.of(3, 1), 2],
    [Uint8Array.of(1, 1), 2],
  ] as const)
    assert.throws(() => decodeRle(bytes, size));
});
test("config keeps final directives; briefing preserves readable sections", () => {
  assert.deepEqual(
    parseConfig("# MAP_TEXT:wrong\nMAP_TEXT: first.cam\nMAP_TEXT: final.cam"),
    { MAP_TEXT: "final.cam" },
  );
  const b = parseBriefing(
    "OBJECTIVE_BEGIN\nKeep the base.\nOBJECTIVE_END\nSPYINFO_BEGIN\n2\nA ridge.\nSPYINFO_END",
  );
  assert.equal(b.objective, "Keep the base.");
  assert.deepEqual(b.spy, ["A ridge."]);
});
test("indexed BMP handles row padding and bottom-up orientation", () => {
  const b = Buffer.alloc(14 + 40 + 1024 + 8);
  b.write("BM");
  b.writeUInt32LE(1078, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(2, 18);
  b.writeInt32LE(2, 22);
  b.writeUInt16LE(8, 28);
  b.set([1, 2, 0, 0, 3, 4, 0, 0], 1078);
  assert.deepEqual([...decodeBitmap(b).pixels], [3, 4, 1, 2]);
  assert.throws(() => decodeBitmap(b.subarray(0, 1080)));
});
test("map rejects unsupported and truncated input", () => {
  assert.throws(() => parseMap(Buffer.from("SLICK 2.00\n")));
  assert.throws(() =>
    parseMap(Buffer.from("SLICK 1.03\nterrain 40\nslots 90\n")),
  );
});
const root = process.env.UPRISING_TEST_ROOT;
test(
  "installed corpus matches independent native audit for every map",
  { skip: !root },
  async () => {
    const corpus = JSON.parse(
      await fs.readFile(
        new URL("../docs/evidence/corpus.json", import.meta.url),
        "utf8",
      ),
    );
    let objects = 0;
    for (const fixture of corpus.levels) {
      const map = parseMap(
        await fs.readFile(path.join(root!, "GRIDS", fixture.name)),
      );
      assert.equal(map.terrain.width, fixture.width, fixture.name);
      assert.equal(map.terrain.height, fixture.height);
      assert.deepEqual(
        [map.terrain.minimum, map.terrain.maximum],
        fixture.decoded_height_range,
      );
      assert.equal(
        map.terrain.endOffset,
        fixture.size - fixture.trailing_bytes,
      );
      assert.equal(map.objects.length, fixture.objects.length);
      assert.equal(map.citadels.length, fixture.citadels.length);
      assert.equal(map.routes.length, fixture.routes.length);
      assert.equal(map.teleporters.length, fixture.teleporters.length);
      for (let i = 0; i < map.objects.length; i++) {
        const object = map.objects[i],
          original = fixture.objects[i];
        assert.deepEqual(
          [object.x, object.z, object.y],
          original.position_x_z_y,
        );
        assert.equal(object.kind, original.kind);
        assert.equal(object.sourceOffset, original.offset);
      }
      objects += map.objects.length;
    }
    assert.equal(objects, 1782);
  },
);
test(
  "all installed missions resolve textures, static models and configured source data",
  { skip: !root },
  async () => {
    const library = await GameLibrary.open(root!);
    assert.equal(library.missions.length, 30);
    let modelCount = 0,
      spriteCount = 0;
    const modelFiles = new Set<string>();
    for (const mission of library.missions) {
      const data = await library.load(mission.id);
      assert.ok(data.atlas, `${mission.title}: ${data.warnings.join("; ")}`);
      if (mission.config.SCRIPT_FILE)
        assert.ok(data.script.length > 0, mission.title);
      if (mission.config.MAP_TEXT)
        assert.ok(data.briefingText.length > 0, mission.title);
      for (const object of data.objects) {
        const selection = data.modelSelections[object.id];
        if (object.kind === 64) {
          assert.equal(selection.model, null);
          assert.ok(selection.sprite, `${mission.title}: ${selection.reason}`);
          const sprite = data.sprites[selection.sprite!];
          assert.equal(sprite.images.length, 3);
          assert.equal(sprite.width, 280 / 512);
          assert.equal(sprite.centerHeight, 140 / 512);
          assert.ok(sprite.images.every(i => i.rgba.some((v, at) => at % 4 === 3 && v === 255)));
          spriteCount++;
        } else {
          assert.ok(selection.model, `${mission.title}: ${selection.reason}`);
          modelCount++;
          modelFiles.add(selection.model!);
        }
      }
      for (const model of Object.values(data.models)) {
        assert.deepEqual(model.warnings, [], model.file);
        assert.ok(
          Object.values(model.materials).every((material) => material.image),
        );
      }
    }
    assert.equal(modelCount, 1433);
    assert.equal(spriteCount, 349);
    assert.equal(modelFiles.size, 24);
  },
);
