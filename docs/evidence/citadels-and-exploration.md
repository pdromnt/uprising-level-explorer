# Citadels, owner palettes and exploration checkpoint

Windows x64, 2026-10-23. Source reference:
`c4eeb807724756394f47a21b11aff6be7ba837cf`. The game checkout was read only.

## Citadel assembly

`level_citadel.c::attach_owner` skips owner -1. Owned records activate a primary
descriptor through `gameplay_group_activate` and `gameplay_group_primary_construct`.
The primary requests kind 0x23, item 3 from its owner catalog: player `pcy1t.bdm`
or Imperial `icy1t.bdm`. The existing three-mesh decoder renders the hull/turret/gun
hierarchy with native anchors and scale; headings retain 2048-step quantization.
Terrain sampling and model center height place the static assembly.

Upgrade identities map to kinds `[0x80,0x81,0x82,0x83,0x89,0x84,0x85,0x86,0x87,0x88]`
in `gameplay_group_bind_member`. Identity zero is an empty slot. Static recipes
follow the settled descriptor's base heading, except identity 5 which retains
its indexed heading. Specialized 0x88/0x89 presentations still require separate
recipes and use diagnosed placeholders if encountered.

Across 30 audited maps there are 162 sites: 51 owned bases (43 Imperial, eight
player) and 111 unclaimed sites. All stored upgrade slots have identity zero;
there are no occupied upgrades in this corpus. The viewer does not invent bases
for unclaimed sites or buildings for empty slots. Outlines and slot rings remain
available on the Citadels layer. Unclaimed outlines can be picked and inspected.
Derived inspector records are kept separate from the original 1,782 SLK objects.

## Owner colors

`gameplay_state_apply_palette` copies four entries from the default table at
0x589748. `world_renderer.c` remaps base entries `[251,252,251,252]` when packet
flag 0x200 is active. Default rows 0..6 are recorded in exploration-native.json.
The viewer preserves indexed texels and changes only those palette slots,
retaining alpha keys and bleeding new visible colors into transparent RGB.
Textures/materials are cached per owner; scenery uses its original palette.

Owner 8 retains the existing clan binding (5). Player rows are a default preview;
saved/network assignments are not loaded. The inspector states this distinction.
Faction colors can be disabled, and the setting persists. This is palette-index
substitution, not a whole-model tint or a claim of complete native shading parity.

## Exploration and typography

Browse objects shows placements and citadel sites with combined text/owner/type
filters. Filters also control scene visibility and remove filtered selection
helpers. Previous/next buttons and `[`/`]` cycle the filtered set and focus bounds.
Citadel inspection includes owner, health, footprints and occupied/defined slots.
The browser can remain open while inspecting; a compact scrollable layout keeps
layer controls and the inspector separate.

The bundled fonts are unchanged copies of Neuropol, Lauck Linear and Liberation
Sans from FONTS. Vite copies public/fonts into the package. Game typography is
enabled before installation selection, including the welcome screen. Turning it
off restores prior system fonts and persists across restarts. Script source stays
monospace. No game folder font dependency or additional font download is required.

## Validation and limits

- 24 tests pass, including all 30 maps, 51 decoded bases, 111 empty sites, stable
  derived IDs, empty-slot omission, heading rules and palette/alpha preservation.
- `tools/verify_exploration.py` executes actual native palette copying for all
  seven default rows and actual primary-descriptor factory selection with bounded
  memory and captured service ports. It does not run complete group activation.
- Existing native catalog fixture: 217 queries and three UV cases, zero mismatches.
- Desktop smoke covers filtered Imperial bases and unclaimed sites, navigation,
  retained selection through palette changes, fonts before installation selection,
  fallback-font persistence, picking, reading and restart persistence.
- GPU probes cover terrain seams, cutout edges, directional sprites and palette
  remapping. Browser screenshots cover ordinary and 920x680 windows.

Original-game visual comparison, terrain-conforming suspension, construction
animation, scripted captures/upgrades, specialized slot 0x88/0x89 models and
campaign/network assignment remain separate acceptance work. Retail assets and
non-Windows runtimes have not been verified.

The packaged Windows executable passes the complete desktop smoke flow, including
bundled fonts before game selection, the exact welcome title "Explore the Worlds",
system-font fallback persistence and the compact responsive viewport checks.
Screenshots of the welcome screen, ordinary browser and compact browser were
visually inspected. One current release folder is retained and smoke profiles
are removed automatically.

Packaged `resources/app.asar` SHA-256:
`160fbdc702573f17a22e60d9a8303c4832cc2add99787723263c45f873715882`.
