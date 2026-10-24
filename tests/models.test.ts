import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { parseModel, selectModel, headingRadians } from "../src/core/models";
import { modelPose } from "../src/core/models";
import { modelPrototype } from "../src/renderer/models";
import { decodeBitmap } from "../src/core/formats";
import * as T from "three";
import { loadStaticModels } from "../src/main/models";
import { GameLibrary } from "../src/main/library";
import type { Placement, ModelFormat } from "../src/shared/types";
const object = (kind: number, owner = 4): Placement => ({
  id: 0,
  kind,
  owner,
  x: 1,
  z: 1,
  y: 0,
  heading: 0,
  name: "test",
  attribute: "NULL",
  parent: "NULL",
  flags: 0,
  group: 0,
  variant: 0,
  sourceOffset: 0,
});
test("catalog selection uses native owner binding, technology rows and factory slots", () => {
  const imperial = selectModel(object(33), { IMP_TANK_TL: "3" });
  assert.equal(imperial.model, "models/ist4t.bdm");
  assert.equal(imperial.slot, 8);
  assert.equal(imperial.choice, 3);
  assert.equal(
    selectModel(object(33, 5), { RBL_TANK_TL: "3" }).model,
    "models/rst1t.bdm",
  );
  assert.equal(
    selectModel(object(33, 8), { RBL_TANK_TL: "3" }).manager,
    "clan",
  );
  assert.equal(selectModel(object(33, 0), {}, 4).model, "models/pst5t.bdm");
  assert.equal(
    selectModel(object(99, 5), { RBL_TANK_TL: "3" }).model,
    "models/rtb1.bdm",
  );
  assert.equal(selectModel(object(119), {}).model, "models/pir1.bdm");
  assert.ok(selectModel(object(191), {}).reason);
  assert.equal(selectModel(object(64), {}).sprite, "media/sprites/insit.sqc");
  assert.ok(selectModel(object(33), { IMP_TANK_TL: "99" }).reason);
});
test("headings preserve native 2048-step quantization and positive world Y rotation", () => {
  assert.equal(headingRadians(0), 0);
  assert.equal(headingRadians(90), Math.PI / 2);
  assert.equal(headingRadians(360), 0);
  assert.equal(headingRadians(-90), (3 * Math.PI) / 2);
});
test("BDM input rejects truncation and unsupported layouts", () => {
  assert.throws(() => parseModel(new Uint8Array(8), 0));
  assert.throws(() => parseModel(new Uint8Array(), 4 as ModelFormat));
});
const root = process.env.UPRISING_TEST_ROOT;
test(
  "all 163 BDMs match complete native parses in the recorded explicit layouts",
  { skip: !root },
  async () => {
    const library = await GameLibrary.open(root!),
      fixtures = JSON.parse(
        await fs.readFile(
          new URL("../docs/evidence/native-parsers.json", import.meta.url),
          "utf8",
        ),
      );
    for (const row of fixtures.models) {
      const bytes = await library.read(row.name);
      assert.ok(bytes, row.name);
      const expected = row.exact_parse_candidates[0],
        model = parseModel(bytes, expected.format);
      assert.equal(model.endOffset, expected.size, row.name);
      assert.equal(
        model.meshes[0].positions.length / 3,
        expected.vertices,
        row.name,
      );
      assert.equal(
        model.meshes[0].indices.length / 3,
        expected.triangles,
        row.name,
      );
      assert.equal(
        model.meshes[0].materials.length,
        expected.materials,
        row.name,
      );
      assert.equal(model.parts.length, expected.parts, row.name);
      assert.equal(model.markerCount, expected.markers, row.name);
      assert.equal(model.planeCount, expected.planes, row.name);
      assert.equal(model.meshes.length - 1, expected.extra_meshes, row.name);
    }
  },
);
test(
  "Dakka models retain native palette, physical BMP rows, hierarchy, scale and pose",
  { skip: !root },
  async () => {
    const library = await GameLibrary.open(root!),
      level = await library.load("grids/dakka.lfl");
    assert.ok(Object.keys(level.models).length > 0);
    for (const [file, model] of Object.entries(level.models)) {
      assert.equal(
        model.warnings.length,
        0,
        `${file}: ${model.warnings.join("; ")}`,
      );
      for (const material of Object.values(model.materials))
        assert.ok(material.image, material.path);
    }
    assert.ok(
      Object.values(level.modelSelections).some(
        (s) => s.model === "models/rst1t.bdm",
      ),
    );
    const tank = level.models["models/rst1t.bdm"],
      textures = new Map<string, T.DataTexture>(),
      prototype = modelPrototype(tank, textures);
    const hull = prototype.children[0],
      turret = hull.children[0],
      gun = turret.children[0];
    assert.equal(prototype.children.length, 1);
    assert.equal(hull.children.length, 1);
    assert.equal(turret.children.length, 1);
    assert.equal(
      gun.children.length,
      0,
      "Debris parts are not resting model children",
    );
    assert.deepEqual(
      turret.position.toArray(),
      tank.data.anchors[0].map((v) => v / 512),
    );
    assert.deepEqual(
      gun.position.toArray(),
      tank.data.anchors[1].map((v) => v / 512),
    );
    const nativeX = tank.data.meshes[0].positions[0] / 512,
      hullPositions = (hull as T.Mesh).geometry.getAttribute("position");
    assert.ok(Math.abs(hullPositions.getX(0) - nativeX) < 1e-6);
    const pose = modelPose(object(33), tank.data, 10);
    assert.equal(pose.y, Math.fround(5120 + tank.data.center[1]) / 512);
    assert.equal(modelPose({ ...object(38), y: 22 }, tank.data, 10).y, 22);
    assert.equal(
      modelPose({ ...object(176), y: -2 }, tank.data, 10).y,
      Math.fround(5120 + tank.data.center[1]) / 512,
    );
    const palette = decodeBitmap(
      (await library.read("grids/palettes/" + level.mission.config.PALETTE))!,
    ).palette;
    const first = Object.values(tank.materials)[0],
      bmp = (await library.read(first.path))!,
      view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength),
      offset = view.getUint32(10, true),
      width = view.getInt32(18, true),
      index = bmp[offset];
    assert.deepEqual(first.uvScale, [first.image!.width, first.image!.height]);
    assert.deepEqual(
      [...first.image!.rgba.subarray(0, 4)],
      [...palette.subarray(index * 4, index * 4 + 4)],
      "Native hardware row 0 uses first physical BMP row and mission palette",
    );
    const stride = (width + 3) & ~3,
      lastIndex = bmp[offset + (first.image!.height - 1) * stride];
    const last = (first.image!.height - 1) * first.image!.width * 4;
    assert.deepEqual(
      [...first.image!.rgba.subarray(last, last + 4)],
      [...palette.subarray(lastIndex * 4, lastIndex * 4 + 4)],
    );
    prototype.traverse((node) => {
      if (node instanceof T.Mesh) {
        node.geometry.dispose();
        for (const mat of Array.isArray(node.material)
          ? node.material
          : [node.material])
          mat.dispose();
      }
    });
    textures.forEach((texture) => texture.dispose());
  },
);

test(
  "Imperial/player technology previews load their actual faction materials and honor missing-asset fallback",
  { skip: !root },
  async () => {
    const library = await GameLibrary.open(root!),
      palette = decodeBitmap(
        (await library.read("grids/palettes/paldakka.bmp"))!,
      ).palette;
    const samples = [
      { ...object(33, 4), id: 1 },
      { ...object(33, 0), id: 2 },
      { ...object(129, 4), id: 3 },
      { ...object(129, 0), id: 4 },
    ];
    const result = await loadStaticModels(
      library,
      samples,
      { IMP_TANK_TL: "3" },
      palette,
      4,
    );
    assert.equal(result.modelSelections[1].model, "models/ist4t.bdm");
    assert.equal(result.modelSelections[2].model, "models/pst5t.bdm");
    assert.equal(result.modelSelections[3].model, "models/itb4.bdm");
    assert.equal(result.modelSelections[4].model, "models/ptb5.bdm");
    for (const model of Object.values(result.models)) {
      assert.deepEqual(model.warnings, []);
      assert.ok(Object.values(model.materials).every((m) => m.image));
    }
    const absent = await loadStaticModels(
      { read: async () => null },
      [object(33)],
      { IMP_TANK_TL: "3" },
      palette,
      0,
    );
    assert.equal(absent.modelSelections[0].model, null);
    assert.match(
      absent.modelSelections[0].reason!,
      /Missing models\/ist4t.bdm/,
    );
  },
);
