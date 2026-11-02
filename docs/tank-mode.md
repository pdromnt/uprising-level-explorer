# Tank Mode

Tank Mode adds a controllable Wraith to the viewer. It is separate from SLK
placements and never changes map records, saved games or mission state. It
does not run scripts, animate tracks, fire weapons, create enemies or simulate
combat. Other units remain frozen.

Choose **Tank** beside the other camera modes. It starts at the first player
spawn, using the installed Wraith artwork and player palette. On multi-start
maps the overview anchor is skipped. If the Wraith asset is unavailable, the
Tank/Drive controls are disabled and ordinary inspection remains usable.

| Action | Control |
| --- | --- |
| Forward / reverse | W / S |
| Turn left / right, including in place | A / D |
| Look around the Wraith | Drag on the viewport |
| Chase distance | Scroll or the Chase distance slider |
| Movement speed | Speed slider |
| Return to player start and reset view | R or the reset button |
| Exit | Orbit, Fly or Top |

**Drive here** in the camera bar arms terrain picking; click the ground to
relocate and enter Tank Mode. Esc cancels. The inspector has a separate Drive
here action for the selected object's location. Switching worlds while driving
starts at the new world's player spawn. Material/technology preview reloads
preserve the current tank location and view. Chase distance persists across app
restarts; driving state does not.

## Movement and camera

`src/core/tank.ts` provides bounded viewer locomotion with acceleration,
deceleration, slower reverse and frame-time limits. A hull-sized margin keeps
the tank within the terrain extent. Buildings, scenery, walls, other units,
water and lava do not block movement. No slope/passability rules from the game
are applied.

`src/renderer/tank.ts` combines that state with the existing native Wraith
support-plane height, quantized heading and pitch/roll rules. The body rotation
and chase camera ease toward their targets. The gun uses the same static
compensation as the inspected Wraith model. The chase boom shortens against
intermediate terrain ridges and keeps the camera above the ground.

The controlled rig has its own model and projected bounds shadow. It is outside
object search/type/owner filtering and the Player starts layer. Its shadow
respects Ground shadows. The original Player 1 preview body is hidden while
driving and restored according to the active filters when leaving Tank Mode.
Normal picking/focus remains available in the exploration modes; focusing a
listed object exits the chase camera.

## Verification

Unit tests cover cadence, acceleration/reverse/braking, in-place steering,
bounds/long frames, native contact height, terrain camera clearance and unchanged
source records. The asset-free packaged GPU probe exercises the actual MapScene
controller, verifies visible chase-camera model pixels, reset, relocation,
filter-independent visibility, restored start markers and unavailable assets.
It also checks object clicks after switching from Tank to Orbit, Fly and Top,
including cancellation of an armed terrain placement action.

The installed-game desktop suite drives Dakka, adjusts the camera, relocates
through the inspector and terrain picker, changes materials while parked,
switches worlds, clicks actual model geometry in all three exploration modes
after driving, and verifies persisted chase distance. It writes local
screenshots into ignored `artifacts/`.
