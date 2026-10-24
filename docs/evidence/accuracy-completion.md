# Static scene accuracy checkpoint

2026-10-23. This checkpoint supersedes earlier statements that terrain lighting,
sky projection, vehicle attitude and cutout coverage were entirely approximate.

## Implemented scope

- Every installed mission resolves derived gate, player and teleporter artwork:
  379 gate segments over 24 routes, 99 Wraith bodies and 21 teleporter sources.
  A teleporter destination is an invisible native control object, shown only as
  a viewer navigation marker. It does not instantiate a second model.
- Gates follow the actual native constructor's 502-unit step, quantized bearing,
  rotated footprint settlement, packed depth-grid offset and wave-area sinking.
- Terrain renders native inverse shade bytes, with seed 1 jitter, original
  alternating render diagonals and native wave tables at tick zero. Collision
  height queries deliberately retain the opposite diagonal and negative-edge
  conversion rules used by the game.
- Tanks and convoys use settled native pitch/roll. Wraiths use the supporting
  plane beneath their 0.7-scaled contact corners, recovered attitude filtering
  and compensated gun mount. Static scenery and defenses use their respective
  native footprint/hull settlement rules.
- Ordinary textured meshes are unlit, front-face culled, and use native indexed
  palettes. Cutout materials retain key transparency and fractional neighbor
  coverage; soldier sprites blend without writing depth.
- The decompiled port's restored base/detail/horizon sky replaces the sphere.
  Projection follows camera yaw/pitch and horizontal FOV; optional companions,
  TempSky fallback, horizon chroma/fade and explicit `nosky` are supported.
- Fog uses view-X/Z radial distance, affine screen interpolation
  and linear blending. The observed default horizon is 20,000 native units.
  It has an independent, persisted toggle, off by default, with no camera-based
  automatic switching. Sky visibility does not change the fog setting.
- Ground shadows project native oriented model bounds along world down; soldier
  and aircraft footprints follow native size rules. The toggle and object/mode
  visibility stay synchronized.
- Default owner slot visibility is available as single-player/multiplayer
  previews. All-map-records remains the default for inspection. Original script,
  briefing and source record views remain read-only.

Auxiliary BDM records are not additional resting meshes. The native model graph
uses anchors for attachment transforms; death/fragment consumers use auxiliary
parts. Automatically rendering every auxiliary record would duplicate artwork.

## Evidence

`tools/export_accuracy.py` compiles and invokes the actual native C functions
using a bounded memory adapter. `accuracy-native.json` retains 256 lighting/RNG
samples, 128 terrain height/normal samples, all 379 gate placements, 64 settled
vehicle poses and 64 Wraith support/attitude samples. All match the viewer tests.
`accuracy-tables.json` records the source revision used for exported tables.

`accuracy-source.json` records hashes of the traced source files and the actual
native executable used for the visual reference. The source checkout is active
elsewhere; its HEAD alone does not identify the already-built executable.

An isolated, muted, windowed run of the existing decompiled executable loaded
Dakka through its own level route and wrote its own frame capture and profile
under the viewer's ignored artifacts directory. No source changes or native
rebuilds were made. GDB sampled the view matrix, projection and fog range from
that process, then detached; only that process was stopped.

`artifacts/native-reference-dakka/native-game-frame.bmp` is the game capture.
`artifacts/viewer-native-camera-dakka.png` uses the shipped MapScene renderer
with the sampled camera and projection. The native frame is the first presented
frame; the camera was sampled later, so this is visual comparison evidence, not
a synchronized pixel-diff oracle. Cockpit/HUD and simulation are intentionally
absent. Terrain shape, palette and restored sky/horizon correspond closely.

The desktop suite checks exact synthetic GPU colors for inverse terrain shading
and layered skies, plus terrain seams, cutout fringes, sprite directions/picking,
derived model inspectors, mode visibility and fallback/no-sky missions. It also
checks startup, folder validation, source readers and persisted preferences.

Final validation on Windows:

- `npm test` with the installed corpus: 32 passed, 0 failed, 0 skipped.
- `npm run package`: typecheck, production build and packaging passed.
- `npm run test:desktop` against the packaged executable: passed, including
  radial/affine fog GPU verification, manual fog at horizontal high/low cameras,
  independent sky visibility, mission/restart persistence and same-camera rendering.
- Only one release directory remains, approximately 361.1 MiB. Generated smoke
  profiles were removed after each run; no duplicate game assets were copied.
- Packaged `resources/app.asar` SHA-256:
  `3237f5f5e945a15fa46cefd412cc142d37d89d1330f3e1446a22b64666b95b8c`.

## Explicit limits

- Scripts do not execute; script-spawned objects, combat, animations, particles,
  dynamic destruction and saved/network state are outside static inspection.
- Native shadow material records at `0x624f08` and `0x624f38` were zero in the
  running reference. Their artwork/opacity is not recovered. The viewer uses
  black 28% bounds shadows and a soft procedural ground texture; these are
  approximations despite traced projection geometry. No unproven bitmap is
  presented as the original shadow art.
- Lighting seed 1, frozen tick zero and settled attitudes are reproducible
  inspection conventions, not the state of an arbitrary live game frame.
- Fog uses the observed default range; custom installed display settings are
  not loaded. The manual toggle can suppress the fog wall when exploring maps.
- Sky fog-color sampling is a bounded CPU estimate of the port's filtered band;
  filtering, gamma paths and screen clipping can still differ by a few pixels.
- Windows desktop and the installed decompiled corpus are tested. Retail asset
  installation and Linux/macOS acceptance remain unverified.

The static accuracy features are implemented. This checkpoint does not claim
complete retail pixel parity or a recovered original level authoring workflow.
