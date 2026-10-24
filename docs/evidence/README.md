# Evidence and reproduction

Original parser audit: 2026-10-22. Baseline commit:
`ebc7dbbed0ca9a97c33a4274c1c9b363b2f05644`, branch `FSR3`.
The source checkout is external to this repository. Later checkpoints record
their own revisions; use [accuracy-completion.md](accuracy-completion.md) for
current behavior and limits.

| Report | Contents |
| --- | --- |
| [corpus.json](corpus.json) | Independent SLK section parsing; terrain metadata; mission dependencies; script literal inventory; source asset hashes |
| [native-parsers.json](native-parsers.json) | Actual C parser results for every map and BDM; independent/native comparisons |
| [source-index.json](source-index.json) | Source file hashes, symbols, exact lines and commit-pinned links |
| [model-families.json](model-families.json) | Decoded declared model-name tables for 24 sampled families/routes |
| [viewer-checkpoint.md](viewer-checkpoint.md) | First desktop build, packaged-runtime checks and remaining acceptance scope |
| [static-models.md](static-models.md) | Static model pipeline, supported coverage and validation limits |
| [model-catalog-native.json](model-catalog-native.json) | Actual C catalog/default and screen-UV verification |
| [scenery-and-picker-fixes.md](scenery-and-picker-fixes.md) | Cutout fringe, Centari grounding and styled world-picker regressions |
| [static-soldiers.md](static-soldiers.md) | Frozen directional sprites and native direction sampling |
| [citadels-and-exploration.md](citadels-and-exploration.md) | Earlier checkpoint: citadels, owner palettes, filtering/navigation and bundled fonts |
| [exploration-native.json](exploration-native.json) | Actual C palette copying and primary citadel factory request |
| [accuracy-completion.md](accuracy-completion.md) | Current static-scene implementation, visual comparison, manual fog and remaining limits |
| [accuracy-native.json](accuracy-native.json) | Native lighting, height/normal, gate and settled-pose fixtures |
| [accuracy-source.json](accuracy-source.json) | Traced source hashes and actual native visual-reference executable/camera |
| [app-icon.md](app-icon.md) | Extracted landing-pad icon provenance and packaged resource validation |

## Original parser audit results

- 30 SLK files and 30 LFL configurations; all map dimensions 256×256.
- 1,782 placed records, 162 citadels, 172 paths, 21 teleporter pairs.
- Every declared SLK/script/CAM/palette mission dependency resolves locally.
- All local terrain PAK banks have 32×32 headers and enough tiles.
- All normalized usable CLN payload bounds and RLE count lengths validate.
- The actual C parsers match all 30 maps on counts, parsed end offsets, dimensions,
  tile counts and decoded height extrema; zero comparison mismatches.
- All 163 BDMs consume their entire decoded resource under one supported layout:
  80 simple, 54 collision, 27 three-mesh, two eight-mesh; no ambiguous candidates.

CLN: 32,497,244 bytes, SHA-256
`45ef92741f871e2ab2935f5c4623a45eda21b37352e30cf46884f12f95ea97e1`.

Native compiler: the exact version is recorded in `native-parsers.json`.
The tested host uses Windows x64 and TDM GCC 10.3.0.

## Method

`audit_assets.py` is an independent Python reader. It does not call the game,
evaluate scripts, or publish object instances. It stores source byte offsets,
hashes, raw/normalized fields, and diagnostics.

`verify_native.py` builds `native_probe.c` with the checkout's original
`resource_file`, `host_file`, `resource_archive`, `resource_payload`,
`level_manifest`, `terrain_asset`, `level_player_slots`, `level_citadels`,
`level_objects`, `level_movement_paths`, `level_teleporters`, and `asset_mesh`
translation units. Link-time optimization drops unused runtime code; there are
no replacements for the parsed functions. Construction callbacks are inert and
return synthetic IDs solely to exercise parser completion and name linking.

The map probe decodes lighting with seed 1, calls the static section readers,
and compares metadata with the independent report. It does not load tile pixels
through the game's model/texture manager or construct real gameplay entities.

For models, the verifier decodes archived payloads into its temporary directory,
preflights structural bounds in Python, and runs `asset_model_read_format` for
each bounded full-file candidate. It retains only exact native parses. Candidate
enumeration is an audit technique, not a proposed runtime format detector.
The native mesh reader does not validate all possible nonfinite coordinates or
semantic relationships; successful parsing is not a blanket validity guarantee.

`trace_sources.py` generates pinned references and reconstructs declared initial
data bytes solely to read model-name tables. It does not execute the game.

## Commands

Run from the viewer repository root. Point `$sourceRoot` at a separate
decompiled checkout; it is not required for normal app development.

```powershell
$sourceRoot = 'C:\Source\uprising_decomp'
python tools/audit_assets.py $sourceRoot --output docs/evidence/corpus.json
python tools/verify_native.py $sourceRoot --corpus docs/evidence/corpus.json --output docs/evidence/native-parsers.json
python tools/trace_sources.py $sourceRoot --docs docs
```

The reports identify their source commit. Regenerate all three stages together
when refreshing the original parser audit. Later reports may deliberately use
a newer revision; retain each report's recorded provenance and do not present
them as a single synchronized native run.

Additional comparison/export commands (Python 3 and GCC with LTO on `PATH`):

```powershell
python tools/export_model_catalog.py $sourceRoot --output src/core/model-catalog.json
python tools/verify_model_catalog.py $sourceRoot --output docs/evidence/model-catalog-native.json
python tools/verify_soldier_profile.py $sourceRoot --output docs/evidence/soldier-profile-native.json
python tools/verify_exploration.py $sourceRoot --output docs/evidence/exploration-native.json
python tools/export_accuracy.py $sourceRoot
```

`export_accuracy.py` updates `src/core/accuracy-tables.json` and
`docs/evidence/accuracy-native.json`; review these changes with their source
revision. Runtime screenshots and user profiles belong in ignored `artifacts/`,
not in committed reports. See [development](../development.md) for app checks.

## Limits

The original parser audit compiled and executed the native research harness,
without building a viewer or game application. The subsequent Electron viewer
was built and launched separately; see [its checkpoint](viewer-checkpoint.md).
No gameplay, script execution, SDF fallback, platform portability, WASM viability
or original rendered fidelity is claimed by the parser reports.

The opaque 66,050-byte SLK interval, original authoring pipeline, complete
script-command semantics and dynamic/specialized presentation beyond the
current static accuracy checkpoint remain
explicit gaps. The documentation distinguishes these from traced loader behavior.
