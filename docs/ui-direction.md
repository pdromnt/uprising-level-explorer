# Agreed UI direction

Agreed on 2026-10-22: **Windy for the interface, noclip for exploration.**

The level fills the window. Compact floating controls sit around its edges;
selection reveals contextual information. Panels expand when needed, and closing
them returns to the same camera position. The approved mockup guided the desktop implementation.

## First-version scope

- Users select their existing game installation on first launch. Validate it,
  remember the folder, and provide a way to change it later.
- Read game assets from that installation. Store viewer settings and derived
  caches separately from the game files.
- Show terrain and environment, static supported models, and selectable wireframe
  boxes for unsupported or missing models. Identify approximate bounds explicitly.
- Provide briefing and environment information plus read-only script text with
  search, line numbers, and syntax highlighting.
- No animation, mission simulation, semantic script analysis, or level editing is
  required for the initial viewer.

## Main layout

| Position | Purpose |
| --- | --- |
| Top left | Current mission, level picker, object search |
| Right edge | Compact overlay controls: units, citadels, starts, paths, teleporters |
| Bottom corner | Orbit / Fly / Top-down, reset camera, movement speed |
| Contextual card | Selected object's name, faction, coordinates and model status |
| Mission control | Open briefing, script or environment information |

The level library opens through the mission picker. It can offer searchable
previews and mission summaries without requiring a separate home screen before
exploration. The exact initial landing state remains a mockup detail.

Keep two kinds of display control distinct:

- **View mode:** textured terrain, wireframe, height shading.
- **Overlays:** independently visible units, citadels, starting positions, routes,
  and teleporter pairs.

Reading panels should expand to comfortable widths. Briefing and script content
must not be confined to a small console strip. Preserve selected level and camera
state when opening, switching, expanding or closing a panel.

Exploration should support free flight, orbit, top-down viewing, adjustable speed,
reset camera, and a shortcut to hide/show the UI. Picking an object should reveal
information without moving the camera unexpectedly; focus-on-selection can be
an explicit action.

## Design references

- [Windy's quick-layer menu](https://www.windy.com/articles/32409): compact access
  to frequently used map layers.
- [noclip controls](https://github.com/magcius/noclip.website#controls): scene
  exploration, camera modes, adjustable movement speed, hideable UI.
- [Cesium entity selection](https://cesium.com/learn/cesiumjs-learn/cesiumjs-creating-entities/):
  selecting a scene object and revealing contextual information.
- [Sketchfab Model Inspector](https://sketchfab.com/blogs/community/inspect-models-and-textures-like-never-before/):
  accessible visualization and inspection controls.

These are interaction references. The viewer should use its own restrained
visual treatment, with legible controls over both bright and dark terrain.

## Technical direction

Selected stack: Electron and Three.js WebGL2. Pure TypeScript decoders live in
`src/core/`; asset resolution stays in Electron's main process. The sandboxed
renderer receives decoded data through narrow IPC. The implementation has a real
terrain path; the mockup alone was not considered stack validation.

The asset audit used the reconstructed game folder. Retail installations need a
separate compatibility check, particularly for environment artwork replaced by
the reconstructed port. Missing optional artwork should leave level inspection
available with a clear diagnostic.

## Current implementation

The desktop viewer implements installation persistence, searchable worlds and
objects, real textured terrain, static models/citadels, directional infantry
sprites, gates, Wraith starts and teleporter artwork. Readers float, dock or
expand; selecting and focusing objects retains the exploration workflow.

Restored layered skies, native terrain lighting, frozen waves and settled poses
are implemented. Fog is manual, independent of sky, off by default and persisted.
The user-facing faction names are Imperium and Rabble; descriptive building
labels replace generic factory names. Unsupported assets retain explicit fallbacks.

See the [accuracy checkpoint](evidence/accuracy-completion.md) for verified scope
and limits. Animation, script execution and editing remain outside this version.
Retail installations and other operating systems still require acceptance.
