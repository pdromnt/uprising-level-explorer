# Models, catalogs, and placement

The viewer now integrates the binary decoder and supported static model paths.
See [the implementation/validation checkpoint](evidence/static-models.md) for
coverage, preview assumptions and remaining acceptance work. The sections below
retain the broader game trace, including presentation paths not yet rendered.

## The resolution chain

An SLK object kind is not a filename or an index into the SLK preamble.
The source-confirmed route is:

```text
raw SLK kind + owner
  -> normalize special kind ranges
  -> bind owner to a current player/faction manager
  -> select that manager's catalog family and technology choice
  -> read catalog item 3 to obtain factory slot
  -> dispatch factory family for normalized kind
  -> choose label from that family's names table
  -> choose explicit model layout and filename
  -> decode geometry and materials
  -> apply placement, model offsets, and hierarchy
```

References: [object-placement](source-index.md#object-placement),
[catalog](source-index.md#catalog), [catalog-record](source-index.md#catalog-record),
[factory](source-index.md#factory), [model-load](source-index.md#model-load).

Catalog records have a 176-byte stride. The standard value query reads
`record + item*4 + (alternate ? 84 : 0)`; structure kinds 0x80..0x87 ignore the
alternate bank. Scene-player, faction-AI, and imperial managers have distinct
family/choice tables. LFL technology directives and player/campaign overrides
therefore affect which slot is selected. An inspector should expose this chain,
including unresolved choices, rather than choose a model solely by kind number.

## Kind normalization and ownership

- SLK kinds 0xB0..0xBF normalize to 0xB0, using `kind-0xB0` as slot.
  The scenery factory actually accepts only 15 slots, 0..14; 0xBF would fail.
- Kinds 0x77..0x7A normalize to 0x77, using `kind-0x77` as slot.
- Object owner 8 is remapped to selector 5 before player-slot assignment lookup.
- Unassigned or mode-disabled owners can cause a record to be skipped at runtime.
- Scenery selects an active scene player through its own path instead of using
  ordinary owner lookup.

Keep raw owner and normalized binding separately. A player's start-slot number,
catalog manager, faction, and object type are different concepts. A viewer can
show every stored placement while explaining which mode would suppress it.

The visible owner labels are **Imperium** for owner 4 and **Rabble** for owner 5,
including raw owner 8's binding to 5. The HUD calls the latter `native`, while
the research UI uses `RABBLE`; `Native Forces` and `Clan` remain search aliases. The
installed LFL files provide no separate tribe/clan names. Player slots keep
their Player 1–4 labels because saved/network player names are not loaded.
Neutral and unclaimed records retain those labels. The faction filter groups
owners 5 and 8 together, while the inspector's Source IDs preserve the raw value.

Building labels follow `level_hud_widgets.c::widget_target_name` and its native
strings: 0x60 Infantry Factory, 0x62 AAV Factory, 0x63 Tank Factory and 0x64 Bomber
Factory. The 0x80–0x83 structures are the corresponding upgrades; 0x84–0x87 are
boosters, 0x88 the energy building and 0x89 the KillSat upgrade. Fixed building
subtypes 0x77–0x7A are Generator, Needle, Tech Center and Power Plant. These labels
describe the recovered class, not a guessed function based on its texture.

## Declared model families

[model-families.json](evidence/model-families.json) decodes name-table pointers
from the source-defined initial records, using the same word-then-string order
as `game_initial_data.c`. These are declarations, not a runtime selection dump.

| Kind | Source name / role | Layout and representative labels |
| --- | --- | --- |
| 0x20 | Player vehicle rig | Three-mesh route, primary label `ppt1` |
| 0x21 | `AI_TANK` | Three-mesh; `pst1`, `ist1`, `rst1`, then higher variants |
| 0x22 | `TURRET` | Three-mesh; `ptt1`, `itt1` |
| 0x23 | `CITADEL_TURRET` | Three-mesh; `pcy1`, `icy1` |
| 0x24 | `SAMS` | Three-mesh; `psm1`, `ism1`, `rsm1` |
| 0x25 | `LIGHT_TURRET` | Three-mesh; `rlt1` |
| 0x26 | `BOMBER` | Simple; `pbm1`, `ibm1`, `rbm1`, then higher variants |
| 0x27 | `AAV` | Simple; `pav1`, `iav1`, `rav1`, then higher variants |
| 0x28 | `HEAVY_TURRET` | Three-mesh; `rht1` |
| 0x29 | `CONVOY_TRUCK` | Simple; `pcv2`, `pcv3`, `pcv1`, `pcv4` |
| 0x40 | `SOLDIER` | Sprite-profile/presentation path; not a single BDM-table entry |
| 0x60/62/63/64 | Soldier/AAV/tank/bomber generator buildings | Collision; `rib1`, `rab1`, `rtb1`, `rbb1` |
| 0x77..7A | Fixed nonplayer buildings | Collision; `pir1`, `ptb1`, `rtc1`, `rpw1` |
| 0x80..83 | Upgrade buildings | Collision; player/imperial label pairs and technology variants |
| 0x84..87 | Booster buildings | Collision; `pir1/iir1`, `ptr1/itr1`, `par1/iar1`, `pbr1/ibr1` |
| 0x88/89 | Energy / satellite structures | Specialized station payload routes; not included in the generated family table |
| 0xB0..BE | Scenery | Simple; 15 entries including rocks, cubes and other `w*` labels |

Semantic names above come from [script-types](source-index.md#script-types), not
guesses based on filenames. In particular, 0x27 is named AAV in scripts even
though its C factory is called `game_level_infantry_factory`.

This is enough to identify important viewer cases, but is not a complete catalog
of every projectile, effect, or animated constructor. The player pool accepts
more indices than its sampled primary-label row; the generated 0x20 row does not
claim to enumerate every valid player configuration.

## Binary model formats

[model-load](source-index.md#model-load) builds filenames as:

| Requested layout | Filename |
| --- | --- |
| Simple | `models/<label>.bdm` |
| Collision | `models/<label>.bdm` |
| Three mesh | `models/<label>t.bdm` |
| Eight mesh | `models/<label>p.bdm` |

There is no universal magic-based auto-detector in the traced indexed loader.
Simple and collision share the same suffix. Runtime constructor context is the
authoritative format selection. The audit tries bounded structural candidates
only to validate this corpus; it should not become the viewer's format policy.

[mesh](source-index.md#mesh) reads a mesh descriptor:

```text
u16 material_count; u32 vertex_count; u32 triangle_count
material_count newline-terminated material names
vertex_count triples of IEEE-754 f32 words
triangle_count triples of u16 vertex indices
triangle_count triples of f32 UV pairs
triangle_count u16 material indices
f32 radius; f32[3] center; f32 auxiliary
```

The actual reader treats the initial material count and indices with recovered
signed-short constraints. Its name reader strips the last returned character
and retains CR; reproduce valid-data behavior without treating malformed text
as a supported format. UVs here are not automatically normalized 0..1 values.

[bdm](source-index.md#bdm) adds format-specific sections:

- One, three, or eight mesh descriptors.
- Radius, center, and seven-word marker records.
- Collision planes and vectors in the collision layout.
- Mesh-group counts and anchors in multipart layouts.
- Point arrays, optional secondary points, part offsets and part meshes.

All 163 indexed BDMs have exactly one complete parse in the native audit:
80 simple, 54 collision, 27 three-mesh, two eight-mesh.

## Hierarchy and attachment rules

[scene](source-index.md#scene) retains main meshes plus auxiliary part meshes.
Three-mesh models link `0 -> 1 -> 2`. Eight-mesh models use links
`2->3`, `4->5`, `6->7`, `0->6`, `0->4`, `0->2`, `0->1`.
Anchors and constructor-specific local transforms then place those meshes.

An auxiliary part in a BDM is not automatically another visible child of the
resting object. Constructors request and use part data differently, including
effect/debris recipes. Rendering every parsed part at its stored offset would
be an unsupported assumption.

## Text fallback

[model-fallback](source-index.md#model-fallback) tries binary loading first for
simple/collision definitions. A clean failure, without a latched memory fault,
can enter [text-model](source-index.md#text-model):

- `models2/<label>mdl.sdf`: required render geometry.
- `...cll.sdf`: optional simple-layout hulls.
- `...cll.asc`: collision-layout contour input.
- `...sho.sdf`, `...lfr.sdf`: optional attachment/point inputs when requested.
- `...wrk.sdf`: optional part recipes when requested.

[sdf](source-index.md#sdf) parses named texture arrays, triangle/index lists,
model reuse, nested groups and transforms. It negates source X and converts V
using the supplied bias. Publication later scales UVs by signed material
dimensions minus that bias, recenters selected geometry, and converts texture
filenames to BMP paths.

Current `# TexControl` handling retains the last filename in a controller;
full texture-animation behavior is not established by parsing it. The local CLN
has only one SDF (`models/xhealth.sdf`), and this audit did not execute the text
fallback or prove it for external asset sets.

## Textures and faction appearance

[model-materials](source-index.md#model-materials) uses the model label's first
letter to choose the preferred texture namespace:

| Prefix | Preferred namespace | Missing texture fallback |
| --- | --- | --- |
| I/i | `impbmps/` | `bitmaps/` |
| R/r | `rblbmps/` | `bitmaps/` |
| Other | `bitmaps/` | None in this routine |

Material names beginning with `trans`, ignoring ASCII case, select transparent
bitmap handling. Indexed BMP dimensions, row orientation, palette use, and alpha
expansion are handled by [bitmap](source-index.md#bitmap), not by BDM geometry.
The render/palette path can additionally apply owner colors; selecting the right
texture namespace does not prove complete faction-color fidelity.

### Hardware UV and row conversion

BDM UVs are texel coordinates. `screen_primitives.c:125` scales them by
`256/max(width,height)` before `portable_gl1.inc` divides by 256 and the aspect
ratio. Together these stages reduce to **U/width, V/height**. Dividing raw BDM UVs
by 256 alone would crop/stretch smaller textures. The native verification harness
checks square, wide and tall cases.

The native hardware BMP reader retains physical file-row order. Model textures
therefore use the positive-height BMP's bottom physical row at V=0; this differs
from the normalized bitmap representation used elsewhere in the viewer. Colors
come from the current mission palette, not each material BMP's own palette.
Cutouts make index 254 transparent for `trans*` materials and honor the magenta
chroma color. Transparent texels receive the nearest visible RGB while retaining
zero alpha, preventing magenta fringes under bilinear filtering and mipmaps.
Native neighboring-texel edge coverage is now applied before upload. Default
per-owner palette remapping is implemented; saved campaign/network assignments
remain outside the default slot preview.
See [the current checkpoint](evidence/citadels-and-exploration.md).

The audit validates BDM parsing, not successful resolution/upload of every model
material. A viewer should produce a missing-texture diagnostic with provenance.

## Coordinate conversion and placement

Use an explicit conversion per source type:

| Source | Conversion into world X,Y,Z |
| --- | --- |
| SLK object `x z y` | Initially `(512*x, 512*y, 512*z)` |
| SLK ordinary path point `x z y` | `(512*x, 512*y, 512*z)` |
| SLK player starting slot | X/Z ×512; spawning later establishes altitude |
| Citadel integer rectangles | Normalize rectangle corners; X/Z ×512 |
| Teleporter `x z y` | `(512*x, y, 512*z)`; stored Y is already world scale |
| Script `LOC(x,z,y)` | `(131072 - 512*x, 512*y, 512*z)` before command-specific behavior |
| Script `VEC(x,z,y)` | `(-512*x, 512*y, 512*z)` |

For SLK objects, stored Y is then replaced with
`terrain_height(worldX,worldZ) + constructed_object.center_height`
unless the constructed type is 0x26, 0x27, or 0xB0. The center-height value is a
constructor/model result; do not assume it is always just the mesh's box midpoint.

That is only the initial placement. Scenery's placement method `433e80` invokes
`42ed30` (`source/game/level_gate.c`, `game_level_object_footprint`): it replaces Y
with the lowest terrain height at the center and four rotated half-extent corners,
then adds the model's vertical extent once. The viewer now applies this second
stage. Keeping the initially preserved SLK Y caused Centari's floating decor.

Heading conversion is `truncate(degrees * 5.688889026641846f) & 2047`.
There are 2,048 angular steps per full turn. Native orientation/axis conventions
must still be matched by visual checks in the future viewer.

Named-parent links are resolved after all SLK objects have been constructed.
These links are gameplay relationships and are not evidence that the child
position should be interpreted as a local mesh transform. Preserve both kinds
of hierarchy independently.

Paths beginning with `gate`, case-insensitively, have special gate-building
behavior; script availability also affects that route. Citadels have footprint,
claim, base and upgrade-slot geometry plus owner/catalog-driven building members.
Teleporter pairs create separate source/destination runtime objects and bind
their names through the destination. These deserve distinct inspector layers.
