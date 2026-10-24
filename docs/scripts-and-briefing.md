# Scripts, briefing, and cross references

Initial product scope: read-only script text with search, line numbers, and
syntax highlighting. The AST, semantic links and location markers discussed
below describe future possibilities and tracing findings, not v1 requirements.

## Inspection versus execution

The viewer should show what a mission defines, where it refers to things, and
what conditions surround an action. Static inspection cannot determine every
future spawn, variable value, owner, or mission outcome.

The existing script parser is not an isolated AST library. It builds runtime
nodes, binds player and object references, allocates game-owned storage, and can
prewarm model/factory resources while parsing actions. Calling it with a dummy
application would not provide a faithful standalone script viewer.

Recommended boundary: a source-preserving lexer/parser for inspection, checked
against the native grammar. Build an AST with source spans; evaluate only clearly
defined constants. Keep execution separate and out of the first viewer.

## Traced language behavior

[script-load](source-index.md#script-load) expects `START_SCRIPT_FILE`, declarations,
then statements until `END_SCRIPT_FILE`.

[script-lexer](source-index.md#script-lexer) establishes:

- Blank lines and whole-line comments beginning with `#` after indentation are
  ignored. This is not proof that arbitrary trailing `#` starts an inline comment.
- `(`, `)`, and `,` are tokens.
- Brace-delimited message text has escape processing including newline and tab.
- `VDECL VINT name initial_value` declares a scalar.
- `VDECL VLOC name LOC(...)` or `VEC(...)` declares a spatial value.
- Conditions and statement bodies form linked native nodes, including nested
  `IF`/`THEN` and logical combinations.

`START_SECTION_OPTIONAL`, `START_SECTION_MP_ONLY`, and `START_SECTION_SP_ONLY`
control inclusion, with nested sections and `END_SECTION`. The first currently
tests the same script-enabled state set by `SCRIPT_FILE:`; the latter two test
multiplayer mode. The viewer should retain all source sections and offer mode
filtering instead of discarding text during loading.

The parser deliberately inherits some permissive numeric behavior from atoi/atof.
A source viewer can issue diagnostics, but should not silently change the source
or claim unsupported tokens are valid just because an approximate lexer found them.

## Locations and variables

[script-location](source-index.md#script-location) handles literals or references
to named vector variables. Text order is map-X, map-Z, height; native storage is
world-X, world-Y, world-Z.

```text
LOC(a,b,c) -> (131072 - a*512, c*512, b*512)
VEC(a,b,c) -> (-a*512,        c*512, b*512)
```

These constants are explicit float words in `initial_numeric_records.inc`:
`0x573fac=0x44000000` (512), `0x573fb0=0x48000000` (131072).
Intermediate float stores and command-specific placement can matter.
This explains why reusing the SLK placement transform for scripts is wrong.

Initial declarations are not necessarily later values. Commands such as
`CHANGE_LOC_VBL` and `GET_LOCATION` mutate spatial state, and some actions resolve
their variable references at runtime. Show “initial literal”, “variable reference”,
or “runtime-derived” rather than plotting every vector as a fixed spawn point.

The corpus report contains 942 lexical LOC/VEC literal occurrences across the
mission-referenced scripts, counted per mission. It is an inventory, not a full
language parse, and does not evaluate guards, mutation, or activation.

## Object creation and references

Native action constructors in `level_script.c` confirm these distinct cases:

| Construct | Inspection meaning |
| --- | --- |
| `CREATE_UNIT` | Named unit, player selector, unit kind, location/reference, yaw, further name bindings |
| `CREATE_FIXED_PU` | Named pickup at a location/reference, pickup variant and quantity |
| `CREATE_FALLING_PU` | Pickup with a radius range; not a single fixed location |
| `CREATE_TURRETS` | Aggregate action needing its own grammar/semantics |
| `CLOSE_PT`, `CITADEL_OWNED...` | Spatial/ownership conditions, not placements |
| `MOVEMENT_PATH` | Named route usage |
| Teleporter/gate commands | Changes to separately declared level entities |

`CREATE_UNIT` parses the unit token through [script-types](source-index.md#script-types).
Its grammar includes `YAW(...)`, three label fields including the unit name, and
captures player/location bindings. Certain factory templates are loaded during
parsing, another reason to avoid executing the native constructor in a viewer.

Useful cross references are object name → declarations/uses, variable → initial
value/writes/reads, route → definition/commands, and location → map marker/source
line. A duplicate label or unresolved reference should remain inspectable with
a diagnostic. Unknown commands should retain their source text.

## CAM briefing files

Despite their extension, these CAM files are not camera paths.

| Marker | Meaning / native consumer |
| --- | --- |
| `CAMPAIGN_RANKING` followed by integer | Ranking metadata, also used for game budgets |
| `OBJECTIVE_BEGIN` / `OBJECTIVE_END` | In-level objective text; [briefing](source-index.md#briefing) |
| `DESCRIPTION_BEGIN` / `DESCRIPTION_END` | Planet description; [campaign-text](source-index.md#campaign-text) |
| `SPYINFO_BEGIN` / `SPYINFO_END` | Repeatable spy-information entries, beginning with a kind integer |

The runtime has bounded display buffers and transforms line breaks in some
contexts. The viewer should preserve the complete source and display its sections
without inheriting old screen-buffer truncation. The audit records high-byte
presence because some local text is not ASCII. CP1252 is the explicit research
decoding choice; it is not a proven encoding contract for every localization.
Keep original bytes and allow a future encoding override.

## Remaining language work

The load/lexer/declaration path and representative spatial/action constructors
were traced. This audit did not independently parse every script statement,
evaluate the mission graph, or validate all branches against gameplay.

Before promising semantic script inspection, produce a complete command and
argument registry from the native constructors, preserve nested condition scopes,
and compare parser diagnostics across the whole script corpus. Plain source
browsing and conservative literal cross references can ship earlier.
