# Documentation

Start with the [project README](../README.md) for features, controls and running
the viewer. This index separates current implementation notes from research
history. The viewer is read-only; a game installation supplies its level assets.

## Development and current behavior

- [Development](development.md): setup, architecture, validation and packaging.
- [CI and releases](ci-and-releases.md): Windows x64/macOS ARM64 commit builds
  and manual releases from an existing tag.
- [Contributing](../CONTRIBUTING.md): change boundaries and review expectations.
- [Static accuracy checkpoint](evidence/accuracy-completion.md): supported scene
  behavior, native comparisons, manual fog and remaining fidelity limits.
- [Assets and third-party notices](../THIRD_PARTY_NOTICES.md): bundled fonts,
  application icon, source references and licensing status.

## File formats and reconstruction

- [Loading and files](loading-and-files.md): CLN lookup, RLE and installation I/O.
- [Terrain and environment](terrain-and-environment.md): SLK tiles, coordinates,
  lighting, depth, waves and restored layered skies.
- [Models and placement](models-and-placement.md): BDM layouts, catalogs,
  faction names, building types and ground contact.
- [Rendering trace](rendering-path.md): the game's submission path and how it
  differs from the viewer's WebGL renderer.
- [Scripts and briefings](scripts-and-briefing.md): readable text, encoding and
  future semantic research. Scripts are never executed by the viewer.
- [Pinned source index](source-index.md): the original audit's exact references.

## Evidence and design history

[Evidence and reproduction](evidence/README.md) indexes the native fixtures,
corpus reports and dated checkpoints. Older checkpoints describe the state at
their recorded date; use the current accuracy checkpoint for present behavior.

[Viewer boundaries](viewer-boundaries.md) preserves scope and stack decisions.
[UI direction](ui-direction.md) explains the map-first interaction design.
