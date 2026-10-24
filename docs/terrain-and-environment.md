# Terrain and environment

## Stored terrain

Source: [terrain-file](source-index.md#terrain-file),
[terrain-decoder](source-index.md#terrain-decoder).

All 30 local maps are 256×256. The decoder accepts dimensions up to 256 and owns
a fixed 256×256 cell array. Smaller dimensions have not been corpus-tested.

After the tile-name list, the consumed binary payload is:

| Block | Size | Meaning |
| --- | --- | --- |
| Tile descriptors | `W*H*2` | Row-major little-endian u16; low 14 bits select the material, high two bits select UV layout |
| Flags | `W*H` | One raw byte per cell |
| Height samples | `(W+1)*(H+1)*2` | Little-endian signed 16-bit source samples |

Total: `3*W*H + 2*(W+1)*(H+1)`, or **328,706 bytes** for 256×256.
The decoder consumes the first W heights in each of the first H rows, skips the
right-edge height, and leaves the bottom row unused. Render/sample addressing
wraps grid indices with `&255`; it does not read a separate 257th boundary row.

Stored heights are converted with the recovered float constant
`0.5120000243186951f`, truncated toward zero, and retained as signed 16-bit values.
Horizontal vertex spacing is **512 world units**. Height conversion is separate
from SLK object-coordinate conversion; do not multiply decoded heights by 512.

For Anshar, the native decoder reports world-height range **657..8421**.

## Tiles and UV layout

[terrain-tiles](source-index.md#terrain-tiles) first opens
`GRIDS/packs/<map stem>_01.pak`. A successful open selects the bank; a malformed
opened bank fails rather than retrying named tiles. If absent, it resolves each
listed tile through `tiles1/<name>`. The tile-name lines are consumed in either
case. All 30 local banks exist and have enough tiles for their maps.

[tile-pixels](source-index.md#tile-pixels) expects four header bytes encoding
u16 width=32 and height=32, followed by consecutive 1,024-byte indexed images.
It reverses X within each row. This horizontal flip must be accounted for once.

The descriptor is not a plain texture index:

```text
material_index = descriptor & 0x3fff
uv_layout      = descriptor >> 14
diagonal       = (grid_x + grid_z) & 1
```

Corners in [terrain-uv](source-index.md#terrain-uv):
`0=(x,z)`, `1=(x+1,z)`, `2=(x,z+1)`, `3=(x+1,z+1)`.

| Diagonal | Triangle corner indices |
| --- | --- |
| even / 0 | `(0,2,1)`, `(1,2,3)` |
| odd / 1 | `(0,3,1)`, `(0,2,3)` |

UVs are in 32×32 texel space with the recovered 0.2/31.8 inset:

| Layout | Corner 0 | Corner 1 | Corner 2 | Corner 3 |
| --- | --- | --- | --- | --- |
| 0 | 31.8,0.2 | 0.2,0.2 | 31.8,31.8 | 0.2,31.8 |
| 1 | 0.2,0.2 | 0.2,31.8 | 31.8,0.2 | 31.8,31.8 |
| 2 | 0.2,31.8 | 31.8,31.8 | 0.2,0.2 | 31.8,0.2 |
| 3 | 31.8,31.8 | 31.8,0.2 | 0.2,31.8 | 0.2,0.2 |

A new GPU renderer can produce a conventional mesh, but must retain this topology
and orientation. Native winding still has to be reconciled with the chosen GPU
API's coordinate convention. No visual comparison was performed in this audit.

### Viewer seam correction

The first viewer packed tiles directly into a filtered, mipmapped atlas. Its
0.2/31.8 UV inset did not isolate tiles: linear filtering could read a neighboring
tile, and lower mip levels mixed unrelated materials. Clamping the whole atlas
would only protect its outside border.

The game's `source/platform/portable_gl1.inc:423` explicitly identifies the terrain
seam fix: individual textures use `GL_CLAMP_TO_EDGE` so filtering repeats their
edge pixels. The Vulkan sampler uses the equivalent clamp mode in
`source/platform/vulkan/vulkan_draw.c`.

The viewer now uploads each tile as a separate WebGL2 texture-array layer, with
linear filtering, layer-local mipmaps and edge clamping. Layers are split across
multiple meshes when necessary to respect `MAX_ARRAY_TEXTURE_LAYERS`. The
recovered UV layouts, tile X flip, alternating diagonals and height data are
unchanged. The atlas remains a transfer representation, not the sampled GPU texture.

UV boundaries still require duplicated mesh vertices, but those vertices now
receive identical height-gradient normals at shared grid positions. Calling
`computeVertexNormals()` on the original unindexed triangle list had produced
separate face lighting, accentuating the grid. Those normals remain geometry
metadata; actual textured rendering now uses native shade bytes with inverse
texture modulation, without Three.js scene lighting.

Regression checks cover shared normals, texture-page isolation, and a real GPU
render of contrasting tiles: 69,700 pixels at four scales, including deep
minification, with zero neighboring-color contamination. Actual Dakka terrain
was also visually inspected after the correction.

## Flags, lighting, height queries

The decoder publishes `raw_flags | ((raw_flags & 0x51) ? 0x20 : 0)`.
Keep both raw and interpreted values in the viewer rather than calling every bit
a terrain type.

Source-confirmed consumers include:

- `0x10`: adds the first wave-table displacement at render time.
- `0x40`: adds the alternate wave-table displacement, when `0x10` is absent.
- `0x50`: seeds the packed depth-grid generation.
- `0x56`: contributes to movement-adjacency blocking, alongside slope tests.
- `0x02`: is tested by footprint/collision consumers.

These are observed uses, not exhaustive semantic names for all flags.

Lighting is generated from local height differences and a fixed light direction,
with an MSVC-style RNG jitter, then clamped and mapped to 0..175. A controlled
seed is needed for reproducible viewer screenshots. The native audit uses seed 1;
this is a test convention, not the game's mission-start seed.

[terrain-height](source-index.md#terrain-height) uses an alternating collision
diagonal opposite to the visible terrain diagonal. Both are retained separately.
Bilinear height interpolation would disagree with the game and can
make grounded models float or sink. Edge wrapping is also part of this function.

Wave displacement uses world X/Z, a running tick counter, and one of two recovered
tables. A static viewer can freeze its clock. The CPU row/frustum/painter pipeline
in [terrain-draw](source-index.md#terrain-draw) need not become the viewer renderer.

## Depth and overview assets

[terrain-depth](source-index.md#terrain-depth) reads `.dph` if available, otherwise
generates it from terrain flags. It is a 512×512 nibble grid, in 1,024 blocks of
16×16 samples. The file starts with 1,024 u32 presence tags; each nonzero tag is
followed, in block order, by 128 bytes. Tags are not loadable pointers.
Generation propagates four-neighbor distance passes through values 1..14 from
flag-seeded value 15. It does not establish a second terrain mesh.

Optional `GRIDS/gohs/<map>.tga` images feed overview and minimap views. The existing
consumers differ in row reversal. Use a single explicitly documented orientation
in the viewer, with native placement landmarks as checks.

## Palette, sky, fog

LFL `PALETTE:` supplies a BMP whose 256-entry BGRA table is loaded by
[palette](source-index.md#palette). Terrain tile-bank pixels are palette indices.
Model texture routing is described in [models](models-and-placement.md).

The current FSR3 port's sky is deliberately customized; it is not proof of the
retail game's original sky authoring workflow. [sky](source-index.md#sky) loads
loose BMPs using `host_file_open`:

1. `<POLY_SKY>.bmp`: base sky; absent extension is appended.
2. `<basename>2.bmp`: optional moving detail layer.
3. `<basename>t.bmp`: optional horizon layer.

Missing base artwork falls back to `tempsky.bmp` and its optional companion
layers. Empty name or `nosky` disables the layered sky. Four configured base
names are missing locally: Circus `bluesky`, and Training1/2/3 `SNST`/`SNNB`/`SNGR`.
Rhemorrah explicitly requests `nosky` and should not be reported as missing art.
The loader and desktop checks now exercise fallback upload and the explicit
no-sky case; the Dakka same-camera capture exercises all three restored layers.

Base/detail images must be 256×256 indexed BMPs; the horizon can be smaller.
The current horizon loader makes bright magenta transparent and fades its bottom
rows. Its projection follows camera yaw/pitch; `SKY_SPEED:` drives scrolling.
Fog begins from sampled sky colors, with a horizon-sampling update during drawing.
The port uses radial distance in view X/Z, affine screen-space interpolation and
linear blending. The viewer preserves these rules, using the observed default
20,000 native-unit range (start 67%); an installed game's custom display range
is not imported. Fog has an independent, persisted toggle, off by default;
camera height and angle never switch it automatically. Sky scrolling and waves freeze at tick
zero. The restored decompiled sky is the agreed visual reference, not retail.

The world-surface bridge also initializes a procedural surface with TempSky
artwork: [world](source-index.md#world). Copying a filename alone would not recreate
all of its current presentation behavior.

## Open questions

- Meaning of the 66,050-byte SLK interval after the consumed terrain payload.
- Original authoring process: mesh baking, tile generation, lighting tools.
- Complete semantic names for flag bits and all environment-specific consumers.
- Visual parity of sky/fog/wave behavior under a new camera and renderer.

None of these prevents a documented static terrain viewer.
