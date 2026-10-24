# Desktop checkpoint, including static models and terrain seam correction

Latest checkpoint (2026-10-23): [citadels-and-exploration.md](citadels-and-exploration.md).
The current package includes frozen soldiers, 51 active citadel assemblies,
111 unclaimed sites, native default owner palette remapping, filtering/navigation
and bundled typography. All 24 tests and packaged desktop/GPU checks pass.
Current app.asar SHA-256:
`160fbdc702573f17a22e60d9a8303c4832cc2add99787723263c45f873715882`.
The checkpoint below records the earlier delivery and historical package hash.
Bundled UI fonts are the exception to its original no-game-assets statement.

Validated on Windows x64, 2026-10-23, against the reconstructed game installation
at parser baseline `ebc7dbbed0ca9a97c33a4274c1c9b363b2f05644`. The current game
checkout was `945e711fcc6716976c85db7c9f3a3cf7d35c80f3` at model integration;
the scenery/picker checkpoint observed `c4eeb807724756394f47a21b11aff6be7ba837cf`.
The scenery placement, terrain and bitmap decoder files are unchanged between them.

## Delivered

Electron 45 / Three.js 0.186.1 application, pure TypeScript format decoders,
sandboxed renderer and installation-scoped asset resolver. The portable Windows
build is generated under `releases/Uprising Level Explorer-win32-x64/`.

Packaged `resources/app.asar` SHA-256:
`a41229ceda1cfd39597d15f8e160a925104422a544015245aa3ab33057dee5f5`.

The package contains the viewer, not game assets, research reports or test profiles.
Application code and research tooling remain separate from the game checkout.

## Verified

- `npm run package`: TypeScript checking, renderer/main/preload builds and Windows
  packaging succeed.
- `npm test` with `UPRISING_TEST_ROOT`: eighteen tests pass. All 30 maps match saved
  independent/native audit counts, endpoints and height extrema; every object
  position, kind and source byte offset matches the independent report.
- Every mission's terrain atlas and configured briefing/script data resolve.
- Static model integration resolves 1,433 placements to 24 textured BDMs; the
  other 349 are soldier sprite placeholders. All 163 BDMs match native parses;
  202 actual native catalog queries and three native UV cases have zero mismatches.
  See [the model checkpoint](static-models.md).
- `npm run test:desktop` against the **packaged executable** passes folder
  rejection/selection, 30-mission listing, mission switching, terrain canvas,
  briefing/script inspection, text search, object search/selection/focus, layers,
  surface modes, flight movement, camera controls, interface hiding, folder-dialog
  cancellation and restart persistence.
- Reading panel operations preserve camera coordinates. The renderer exposes no
  Node `require` or `process` global; it only receives the narrow viewer API.
- Terrain now uses individually clamped texture-array layers and shared grid
  normals. CPU tests verify page isolation and shared-edge normals; the packaged
  executable passes a GPU test of 69,700 pixels at four scales with zero adjacent
  material color contamination. The probe forces multiple texture pages to cover
  the fallback for devices with fewer array layers. Shader errors are checked.
- Manually inspected actual Electron screenshots of Anshar terrain and the Dakka
  docked briefing layout, then inspected Dakka after the seam correction. Smoke
  screenshots are generated under `artifacts/`. Static tank and generator-building
  models were inspected in the actual app. Packaged tests also verify actual mesh
  picking, bounded technology input and the diagnosed soldier fallback.
- `npm audit --omit=optional`: zero reported vulnerabilities.
- The viewer did not modify the original game checkout. Its current worktree is clean.
- Scenery/picker corrections pass the packaged desktop checks: searchable styled
  world popover with compact-window/keyboard coverage, 17,476-pixel GPU cutout
  fringe probe, and tests of the native rotated-footprint settling rule used by
  Centari. See [the correction checkpoint](scenery-and-picker-fixes.md).

## Acceptance still open

Retail installations, Linux/macOS runtime behavior, visual comparison against the
original game, native lighting/sky fidelity and specialized model/sprite assemblies.
Wireframe dimensions/ground offsets are approximate; scripts are never executed.
The smoke test supplies native folder-dialog responses; a human should still
exercise the operating system's folder picker during acceptance.

There is no editing, animation or mission simulation. Parser tests establish
structural data agreement, not the original authoring pipeline or mission semantics.
