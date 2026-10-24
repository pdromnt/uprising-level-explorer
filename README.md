# Uprising Level Explorer

A read-only desktop viewer for **Uprising: Join or Die**. Explore the terrain,
units, buildings, paths and environment of a level, then inspect its briefing
and script without launching a mission or changing game files.

Built with Electron, TypeScript and Three.js/WebGL2. **Windows x64 is currently
validated.** The viewer uses your existing game installation; maps and models
are not bundled. UI fonts and the application icon are bundled separately.

## Features

- Textured terrain with recovered lighting, frozen wave displacement and ground
  contact rules.
- Static vehicles, buildings, citadels, player-start Wraiths, gate segments and
  teleporter models; directional infantry sprites frozen at their spawn frame.
- Searchable world/object browsers, faction/type filters, picking, focus and
  previous/next object navigation. Buildings use descriptive names such as
  **Rabble AAV Factory**; raw IDs remain available in the inspector.
- Orbit, free-flight and top-down cameras, independent scene layers and a
  hideable interface.
- Restored layered skies from the decompiled port. **Sky** and **Fog** have
  separate controls; fog defaults off, remembers your choice and never switches
  automatically with the camera.
- Briefings, mission configuration and script text with search, line numbers,
  highlighting and floating/docked/expanded readers. Scripts are never executed.
- Bundled game typography with a persistent system-font fallback.

Missing assets produce diagnostics and fallbacks. Single-player/multiplayer
scene previews use default native owner bindings; they do not load saved games
or network assignments.

## Run from source

Requires **Node.js 24+**, npm and an existing game installation with `GRIDS` and
`uprising.cln`. No decompiled source checkout is needed to use the viewer.

```powershell
npm ci
npm run dev
```

Choose your game folder on first launch. The viewer remembers it and the last
mission. Use **Game folder** in the header to change installations. `dev` builds
once and starts the app; rerun it after edits.

## Controls

| Action | Control |
| --- | --- |
| Orbit / zoom / pan | Drag / scroll / right-drag |
| Look around in Fly mode | Drag |
| Move in Fly mode | W A S D |
| Move down / up | Q / E |
| Faster flight | Hold Shift |
| Hide / show interface | H |
| Previous / next filtered object | [ / ] |
| Close reading/search panels | Esc |

Select an object to inspect it; **Focus object** moves the camera to it. Use the
right-hand layer controls to show/hide terrain overlays, objects, sky and fog.

## Build and validate

```powershell
npm test
npm run build
npm run package
```

Produces a single portable EXE on Windows x64 or a DMG on macOS ARM64 under
`releases/distribution/`, with a SHA-256 sidecar. The Windows EXE extracts its
runtime temporarily and needs no installation.
Close the packaged viewer before replacing it. Keep one current package instead
of copying release folders for every change; generated builds are ignored by Git.

For full corpus and desktop checks, set the installation path first:

```powershell
$env:UPRISING_TEST_ROOT = 'C:\Games\Uprising'
npm test
npm run build
npm run test:desktop
```

Without that variable, installation-dependent tests are skipped. Desktop tests
use a temporary profile and leave screenshots in ignored `artifacts/`.
See [development](docs/development.md) for packaged testing and research tools,
and [CI and releases](docs/ci-and-releases.md) for per-commit artifacts and the
manual tag-targeted release action.

## Accuracy and scope

The audited decompiled installation contains 30 missions. The viewer's decoders
were compared with native C parser results, and its lighting, height queries,
gate construction and settled poses have native comparison fixtures. Windows
GPU/desktop checks and a same-camera Dakka comparison supplement those tests.

This is a **static viewer**, not an editor or mission simulator. It does not run
scripts, animate units, reconstruct combat/destruction or show script-spawned
objects. Lighting uses a fixed seed and waves/sky scrolling freeze at tick zero.
Shadow opacity and soft shadow artwork remain approximate. Retail installation
compatibility and real-player macOS acceptance still need verification. Linux
and Intel Mac builds are not supported.

See the [accuracy checkpoint](docs/evidence/accuracy-completion.md) for precise
coverage and limits, and the [documentation index](docs/README.md) for format,
rendering and research notes. Contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Assets and licensing

This project is not affiliated with the game's rights holders. Game resources
are read from your installation. Bundled fonts/icon provenance, dependency
notices and the current source-license status are recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No project-wide source license
has been selected yet.
