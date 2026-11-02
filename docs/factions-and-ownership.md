# Factions, owner slots and the static-viewer bias

Audit: 2026-11-02, using the installed 30-mission corpus and the current native
loader/HUD/catalog code. This is a read-only source/asset audit, not a recorded
gameplay session. The player Resistance and the native code's Rabble are separate
categories; treating those names as synonyms was misleading.

## Native binding chain

`source/game/level_objects.c::construct` reads the SLK owner, remaps **8 to 5**,
then indexes the runtime assignment table at `0x5f01f0`. That result selects a
manager from `0x5f0210`; the manager supplies catalog, technology and presentation.
An absent assignment skips the object. Scenery follows a different path and
selects an active scene player without interpreting its stored owner normally.

`source/game/level_selection.c::game_level_player_slot_bindings` assigns:

| Stored owner | Default interpretation |
| --- | --- |
| 0–3 | Human/player start slots; single player binds slot 0, multiplayer can remap slots |
| 4 | Imperial manager, enabled by `USE_CLAN_AI` |
| 5 | Native/Rabble manager, enabled by `USE_RABBLE` |
| 8 | Alias of 5 for ordinary placed objects |
| -1 | Unclaimed citadel; no active owner is attached |

The manager constructor retains its identifier at offset `+8`. The HUD uses that
identifier: **4 → `imperium`**, **5 → `native`**, otherwise a player name. These
are in `level_hud_widgets.c::game_level_frame_004b1510` and `initial_strings.inc`
at `0x5907ec` / `0x5907e4`. The research UI calls the native category `RABBLE`
(`0x59a6bc`). The player tank description independently distinguishes Imperium
and Native Forces as separate unit groups (`0x586390`).

The model catalogs agree: the tank family has distinct `pst*`, `ist*` and `rst*`
labels. Player, Imperial and Native/Rabble technology use separate banks. The
LFL reader sends `IMP_*` fields to manager 4 and `RBL_*` fields to manager 5
(`level_settings.c::game_level_settings_line`). Those banks do not establish a
mission's ally/enemy relationships by themselves.

## Why almost every visible placed unit says Rabble

Across the audited corpus, excluding scenery, raw SLK placements contain:

| Owner | Static unit/building records |
| --- | ---: |
| 0 | 3 |
| 5 | 1,135 |
| 8, remapped to 5 | 165 |
| 4 | 0 |

Citadel ownership tells a different story: **43 Imperial sites**, **8 player
sites** and **111 unclaimed sites**. Dakka specifically has **44 owner-5 static
units/buildings and five owner-4 occupied citadels**, plus two unclaimed sites.
Its labels therefore do not demonstrate that the Imperial side is absent.

The scripts also contain literal `CREATE_UNIT` statements for **owner 4 (90)**,
**owner 5 (99)** and **owner 0 (18)**. These are text occurrences, not executed
spawn counts; conditions, loops and variable expressions are not evaluated.
Training1 explicitly creates owner-5 `AI_TANK` and infantry targets, which is
another reason not to interpret 5 as the human player.

Imperial runtime production is separate from SLK parsing:
`level_imperial_production.c::game_level_imperial_produce` obtains a catalog
variant, takes a factory instance, chooses a valid position and publishes an
arrival/unit into the Imperial manager. The viewer does not run this machinery
or execute scripts, so it shows the predominantly native static garrisons while
omitting runtime-created armies from either side.

## UI interpretation

The current owner-5 **Rabble** label denotes Native Forces, not the player
Resistance. Clearer presentation should identify **Player/Resistance**,
**Imperium**, and **Native Forces (Rabble)** separately, preserve the raw owner
and resolved slot, and avoid assigning ally/enemy status from a label alone.
Script-created placements could eventually be inspected as explicitly marked
script references without running the mission; that is outside this audit.

The per-mission count report for this audit is generated locally at
`artifacts/faction-ownership-audit.json`. No game files or viewer labels were
changed during this investigation.
