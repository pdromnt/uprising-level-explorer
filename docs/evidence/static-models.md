# Static model checkpoint

Updated 2026-10-23: soldiers now use frozen directional sprites. Current coverage
is 1,433 model placements plus 349 sprites, with no placeholders across the audited
30 maps. The catalog verifier now passes 217 queries (including soldier catalogs).
See [citadels-and-exploration.md](citadels-and-exploration.md) for the current package
hash and tests, and [static-soldiers.md](static-soldiers.md) for sprite tracing.
The checkpoint below records the original model delivery and its historical hash.

Implemented on Windows x64, 2026-10-22. The previous map/BDM evidence remains pinned
to `ebc7dbbed0ca9a97c33a4274c1c9b363b2f05644`. During implementation the game checkout
advanced through manual-debugger-launcher commits `1297df49` and `945e711f`; the
traced model/catalog source files are unchanged against that baseline. The viewer
did not modify the game checkout or its assets.

## Delivered

- Bounded TypeScript BDM parser with explicit simple/collision/three-mesh/eight-mesh
  layouts. Counts, indices, finite geometry, material names and exact consumption
  are validated. The runtime chooses the layout from the declared factory family.
- Static rendering for simple, collision and three-mesh families. Three-mesh
  vehicles link hull -> turret -> gun using the first two anchors at zero local
  pitch/yaw. Auxiliary part meshes are parsed but are not automatically drawn as
  resting children. Player rigs/eight-mesh assemblies remain unsupported.
- Catalog selection from traced default records, including ordered inheritance,
  item 3 factory slots, owner 8 -> selector 5, fixed-building and scenery subtype
  normalization. Imperial selector 4 and clan selector 5 are kept distinct.
- Imperial/clan technology directives select their actual catalog rows. Absent
  directives use an explicitly identified choice-0 preview. Player records use a
  preview tier rather than pretending to know a saved campaign or network setup.
  Its selector appears only when the level contains supported player-owned models.
- Faction texture namespace with `bitmaps` fallback, mission-palette indexed BMPs,
  native physical row order, texel UV normalization and basic `trans*` cutouts.
- Native 1/512 coordinate conversion, 2,048-step heading quantization with positive
  Y rotation, model center-height grounding, and source-Y preservation for bomber
  and AAV records. Scenery follows its subsequent native footprint-settling method:
  lowest center/rotated-corner sample plus vertical extent. This second stage was
  corrected on 2026-10-23 after the Centari floating-decor report. Terrain-conforming
  vehicle suspension is not simulated.
- Shared geometry/materials across model instances; disposal on mission switching.
  Actual mesh picking respects terrain occlusion. Focus frames the whole resting
  hierarchy; the inspector reports model, manager, choice, slot and provenance.

## Verified

- All **163 BDMs** match their recorded native layout, exact byte consumption,
  primary vertex/triangle/material counts, markers, planes, extra meshes and parts.
- Actual C unit-default constructors and catalog functions match **202 queries**
  with **zero mismatches**. Actual native screen-UV conversion matches three
  square/wide/tall texture cases. See [model-catalog-native.json](model-catalog-native.json).
- All 30 installed missions resolve **1,433 model placements**, using **24 unique
  BDMs**, with no missing/invalid material warnings. The remaining **349** objects
  are soldier sprites and use labeled wireframes.
- Additional Imperial/player tank and building previews load their respective
  real faction textures; missing BDM data produces a diagnosed wireframe fallback.
- Tests cover bitmap-row/palette selection, texel UV dimensions, model scaling,
  grounding/airborne rules, heading quantization and the full three-mesh hierarchy.
- Desktop testing exercises static model search/focus/picking and soldier fallback,
  in addition to the existing viewer flow and GPU terrain seam regression probe.
- The Windows package passes those checks, including the 69,700-pixel terrain GPU
  regression probe. Actual textured tank and generator-building screenshots were
  visually inspected; this was viewer inspection, not original-game comparison.

Packaged `resources/app.asar` SHA-256:
`6631b8364f2b4ab6bbba6b17ee810d8b193e10e11109ed8ee243ef1beb3607e7`.

The catalog exporter reads semantic declarations and emits only label/slot data;
it does not ship game code, models, textures or a memory image. The native verifier
compiles an isolated temporary harness using real C functions and a bounded memory
I/O adapter. It is research tooling, not part of the application's runtime.

## Reproduce

```powershell
python tools/export_model_catalog.py 'C:\path\to\game source checkout' --output src/core/model-catalog.json
python tools/verify_model_catalog.py 'C:\path\to\game source checkout' --output docs/evidence/model-catalog-native.json
$env:UPRISING_TEST_ROOT = 'C:\path\to\game installation'
npm test
npm run package
$env:UPRISING_TEST_EXE = 'C:\path\to\packaged\Uprising Level Explorer.exe'
npm run test:desktop
```

## Still open

Visual comparison with a running original-game session, original suspension and
specialized attachment poses, soldier sprites, script-spawned objects, citadel
construction assemblies, text SDF fallback, full transparent edge coverage,
per-owner color remapping and campaign/network assignment overrides. Renderer
lighting is still an approximation. Retail and non-Windows runtime acceptance
remain separate work. A successful parser or source-rule test does not establish
all of those visual/runtime behaviors.
