# Assets and third-party notices

## Game assets

Uprising: Join or Die game assets remain the property of their respective rights
holders. The viewer reads maps, models, palettes, sprites, scripts and environment
art from the user's existing installation; those resources are not included in
the repository or portable application, except for the fonts and icon below.

The bundled icon derives from `rblbmps/rabfly.bmp`, referenced by `models/rab1.bdm`.
[Icon provenance](docs/evidence/app-icon.md) records its source hash and conversion.
Its inclusion does not grant a new license to the original artwork.

## Fonts

The following files were copied unchanged from the reference installation's
`FONTS` folder. Embedded font metadata and copyright notices are retained.

| Font | Bundled file | License information |
| --- | --- | --- |
| Liberation Sans Regular | `public/fonts/LiberationSans-Regular.ttf` | SIL Open Font License 1.1; full notice in [LICENSE-Liberation.txt](public/fonts/LICENSE-Liberation.txt) |
| Neuropol Medium | `public/fonts/Neuropol.ttf` | Original embedded notices retained; redistribution terms have not been established by this project |
| Lauck Linear Plain | `public/fonts/LAUCLP__.TTF` | Original embedded notices retained; redistribution terms have not been established by this project |

## Research sources and dependencies

Format documentation, catalog tables and native comparison work reference
[pdromnt/uprising_decomp](https://github.com/pdromnt/uprising_decomp). The
[source index](docs/source-index.md) and [evidence reports](docs/evidence/README.md)
record inspected revisions and file hashes. Public source availability does not
establish reuse or redistribution terms.

Electron, Three.js and the other npm dependencies retain their own licenses and
notices. `package-lock.json` records the resolved dependency versions. Preserve
the license files supplied with packaged dependencies.

No project-wide source license has been selected for this viewer. This document
records provenance and known notices; it does not supply missing permissions for
the source, game-derived artwork or bundled fonts.
