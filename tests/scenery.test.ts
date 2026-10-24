import { test } from "node:test";
import assert from "node:assert/strict";
import { bleedCutoutEdges } from "../src/core/cutout";
import { modelPose } from "../src/core/models";
import type { BinaryModel } from "../src/shared/types";
import { GameLibrary } from "../src/main/library";
import { ground } from "../src/renderer/scene";

test("cutout RGB extends visible colors into transparent key pixels without changing coverage", () => {
  const pixels = Uint8Array.of(
    255,
    0,
    255,
    0,
    20,
    90,
    30,
    255,
    255,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
    255,
    0,
  );
  bleedCutoutEdges(pixels, 3, 2);
  for (let i = 0; i < 6; i++) {
    assert.deepEqual([...pixels.subarray(i * 4, i * 4 + 3)], [20, 90, 30]);
    assert.equal(pixels[i * 4 + 3], i === 1 ? 255 : 0);
  }
  const invisible = Uint8Array.of(255, 0, 255, 0);
  bleedCutoutEdges(invisible, 1, 1);
  assert.deepEqual([...invisible], [0, 0, 0, 0]);
});
test("scenery settles at the lowest rotated center/corner sample, then adds model height once", () => {
  const object = {
    id: 0,
    kind: 180,
    owner: 5,
    x: 20,
    z: 30,
    y: 100,
    heading: 0,
    name: "rock",
    attribute: "NULL",
    parent: "NULL",
    flags: 0,
    group: 0,
    variant: 0,
    sourceOffset: 0,
  };
  const model = { center: [1024, 512, 512] } as BinaryModel;
  const slope = (x: number, z: number) => x + 2 * z;
  assert.equal(modelPose(object, model, slope).y, 77); // Center 80, lowest corner 76, center height 1.
  assert.equal(modelPose({ ...object, heading: 90 }, model, slope).y, 76); // Rotating the wider dimension changes support height.
  assert.equal(
    modelPose({ ...object, kind: 38 }, model, slope).y,
    100,
    "Bomber retains source altitude",
  );
  assert.equal(
    modelPose({ ...object, kind: 39 }, model, slope).y,
    100,
    "AAV retains source altitude",
  );
});
const root = process.env.UPRISING_TEST_ROOT;
test(
  "Centari scenery rests on terrain and Training cutouts contain no magenta RGB",
  { skip: !root },
  async () => {
    const library = await GameLibrary.open(root!),
      centari = await library.load("grids/centari.lfl");
    let scenery = 0;
    for (const object of centari.objects) {
      if (object.kind < 176 || object.kind > 190) continue;
      const selection = centari.modelSelections[object.id],
        model = centari.models[selection.model!].data;
      const pose = modelPose(object, model, (x, z) =>
        ground(centari.terrain, x, z),
      );
      assert.ok(
        pose.y < -10,
        "Centari rock must follow negative terrain elevation instead of stored positive Y",
      );
      assert.ok(
        pose.y <=
          ground(centari.terrain, object.x, object.z) +
            model.center[1] / 512 +
            1e-5,
      );
      scenery++;
    }
    assert.ok(scenery > 20);
    const training = await library.load("grids/training1.lfl");
    let transparent = 0;
    for (const model of Object.values(training.models))
      for (const material of Object.values(model.materials)) {
        if (!material.transparent) continue;
        const pixels = material.image!.rgba;
        let clear = 0,
          solid = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          assert.ok(
            !(
              pixels[i] === 255 &&
              pixels[i + 1] === 0 &&
              pixels[i + 2] === 255
            ),
            material.path,
          );
          if (!pixels[i + 3]) clear++;
          else solid++;
        }
        assert.ok(clear && solid);
        transparent++;
      }
    assert.ok(transparent > 0);
  },
);
