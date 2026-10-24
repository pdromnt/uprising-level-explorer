# Static soldier checkpoint

Superseded package checkpoint: [citadels-and-exploration.md](citadels-and-exploration.md)
adds owner palettes, citadels, exploration controls and bundled fonts. The package
hash and owner-color limitation below describe this earlier soldier delivery.

Implemented on Windows x64, 2026-10-23. Reference source commit:
`c4eeb807724756394f47a21b11aff6be7ba837cf`. Game source and assets were read only;
the viewer loads artwork from the user's installation. No artwork is bundled.

## Trace and format

`source/game/level_vehicle_factory.c`, `game_level_class40_factory` constructs a
shared seven-profile bank for soldier kind 0x40. Its factory supports slot 0.
`game_level_class40_place` selects profile 2 explicitly. All three faction catalogs
resolve their five soldier tiers to slot 0; this does not imply identical gameplay
statistics or owner-color processing.

| Index | Name | Frames | Directions | Duration | Scale | Flags |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | inrn | 10 | 8 | 18 | 280 | 1 |
| 1 | insh | 6 | 8 | 15 | 280 | 0 |
| 2 | insit | 3 | 4 | 24 | 280 | 0 |
| 3 | incrc | 1 | 4 | 64 | 280 | 1 |
| 4 | insta | 3 | 4 | 24 | 280 | 0 |
| 5 | inst | 2 | 8 | 120 | 280 | 1 |
| 6 | indi | 10 | 4 | 20 | 280 | 2 |

These metadata tables start at 0x583358 (names), 0x583378 (frames),
0x583398 (directions), 0x5833b8 (duration), 0x5833d8 (scale) and 0x5833f8 (flags).

`source/core/effect_profile.c` loads `media/sprites/<name>.sqc` first, falling back
to `sprites/<name><direction><frame>.bmp` only if the sequence is absent. Four
little-endian u32 fields describe width, height, stored-frame count and stride.
Payload begins at byte 16; each stride contains width*height indexed pixels and
optional padding. At least `(directions/2+1)*frames` stored frames must fit.
The viewer validates the complete declared payload before taking frozen frame 0.
Missing or corrupt assets retain a diagnosed wireframe.

`insit.sqc` in this installation is 36,880 bytes: 64x64, nine frames, stride 4096.
Three physical views each contain three animation frames. Logical views 0/1/2/3
use physical views 0/1/2/1; only view 3 is mirrored. Frozen frame-zero indices are
0/3/6/3. Native `effect_profile_sample` rounds directional groups by adding 256
before the 9-bit shift. The viewer never advances the animation frame.

`source/core/effect_model.c` sets quad width to scale and height to
`scale*pixelHeight/pixelWidth`; here both are 280/512 viewer units. Soldier object
dimensions set center height to 140/512 above sampled terrain. Its camera bearing
is relative to quantized object heading. The viewer uses analytic atan2; the game
uses an integer atan table, so direction-switch boundaries can differ slightly.
The full camera-facing quad follows pitch as well as yaw.

SQC physical row order is retained, mission palette colors are applied, index 254
and magenta are cut out, transparent RGB is dilated to prevent filtering fringes,
and UVs use a half-texel inset. Four materials are shared per level, with separate
mirrored UV transforms. Mission switching disposes every direction's texture and
material, including directions no surviving sprite currently displays. Stable
invisible bounds support focus/selection; the actual sprite is ray-pickable.

## Verification

- All 30 maps: 1,433 model placements, 349 sprites, 24 unique BDM assets, zero
  remaining wireframe placeholders in the audited reconstructed installation.
- 21 automated tests pass, including truncated/padded/invalid SQC records,
  frozen-frame indexing, alpha/palette processing and diagnosed asset failure.
- Actual native catalog functions: 217 queries, three UV cases, zero mismatches.
- Actual native `effect_profile_sample`: all 2,048 angles at tick 0 match stored
  frame and mirroring decisions. Its bounded harness supplies profile metadata
  and folded texture handles; it does not execute the native resource loader.
- GPU probe: 16,384 pixels over four camera directions/elevations, correct mirrored
  side, visible camera-facing quads, ray picking and no outer magenta fringe.
- Existing terrain and cutout probes: 69,700 and 17,476 pixels respectively.
- Full desktop flow and actual Aranon soldier focus/picking pass in the packaged
  Windows executable. The resulting soldier screenshot was visually inspected.
- One current release folder is retained; smoke profiles are removed after each
  run. No alternate Electron release copy was created.

Packaged `resources/app.asar` SHA-256:
`0870e5ca6e00d6c3c4c095d44a424a44faba97f99a80c6bce91c61add1700bfb`.

```powershell
python tools/verify_soldier_profile.py 'C:\path\to\game source checkout' --output docs/evidence/soldier-profile-native.json
python tools/verify_model_catalog.py 'C:\path\to\game source checkout' --output docs/evidence/model-catalog-native.json
$env:UPRISING_TEST_ROOT = 'C:\path\to\game installation'
npm test
npm run package
$env:UPRISING_TEST_EXE = 'C:\path\to\packaged\Uprising Level Explorer.exe'
npm run test:desktop
```

## Limits

Pose is frozen at the initial spawn profile/frame. No state changes, animation,
script-spawned actors or per-owner palette remapping. Native edge-coverage/shading
and exact integer-atan parity are not reproduced. Original-game visual comparison,
retail asset compatibility and Linux/macOS runtime acceptance remain open.
