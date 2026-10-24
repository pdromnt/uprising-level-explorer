# Scenery and world-picker corrections

Validated on Windows x64, 2026-10-23.

Packaged `resources/app.asar` SHA-256:
`a41229ceda1cfd39597d15f8e160a925104422a544015245aa3ab33057dee5f5`.
The packaged executable passes the desktop/GPU checks below.

- **Pink cutout fringes:** alpha-zero texels retained magenta RGB. Bilinear
  filtering and generated mipmaps mixed it into visible edges. Cutout conversion
  now honors indexed transparency/chroma and extends neighboring visible RGB
  through transparent texels, preserving their zero alpha. Training 1 foliage
  was inspected in the actual app. The GPU regression probe checks 17,476 pixels
  over four scales with zero red/blue contamination and visible cutouts at each scale.
- **Floating Centari decor:** the previous viewer implemented SLK's initial Y
  preservation for normalized type B0, but omitted scenery's subsequent footprint
  method. `source/game/level_placement.c` dispatches `433e80` to `42ed30`, implemented
  by `game_level_object_footprint` in `source/game/level_gate.c`. It settles onto
  the minimum center/rotated-corner terrain sample and adds model vertical extent
  once. The viewer follows that rule, preserving original source records. Tests
  cover a sloped/rotated footprint and actual Centari scenery; rocks/cacti were
  visually inspected resting on the terrain.
- **World picker:** replaced the expanding inline list with an independent styled
  popover. It has a bounded scrolling list, world metadata, current/active states,
  result count, empty state and keyboard navigation. Escape restores focus;
  clicking/focusing outside closes the popover. Tests cover search, Arrow keys,
  Enter, Escape, outside dismissal and fit within a 960x640 viewport. Floating
  panel stacking no longer clips the list or its search control.

`npm test` with the installed corpus passes 18 tests. Desktop tests include the
cutout GPU probe and retain the 69,700-pixel terrain seam probe. Parser/native
catalog evidence remains unchanged. This does not establish full original-game
visual parity, exact alpha-coverage behavior, or non-Windows acceptance.
