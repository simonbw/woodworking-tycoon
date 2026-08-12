# Continuous Player Movement

The player walks continuously with held WASD/arrow keys; only machines and
the shop layout live on the grid. This replaced the original
one-cell-per-tick queued movement, which made the woodworker feel like a
cursor instead of a person. Material piles came off the grid the same way
(see "Free-floating piles" below).

## The split: body vs. cell

The core trick is that **GameState never learned about continuous
position**. It still stores `player.position` as a grid cell — every
cell-based system (machine targeting, attendance in `tickAction`,
sweeping, vac dumping, crate pickup, the inspector panels) is untouched.

- **The body** is a mutable singleton (`playerMotionStore.ts`): a float
  position in cell units, a heading in radians, and a `moving` flag. It is
  written by `useWalkingBody` every render frame and read imperatively
  by sprites inside `useTick` — walking causes **zero React re-renders**.
- **The cell** is derived: when the body crosses into a new cell (or the
  facing changes), `useWalkingBody` reports it and the venue's layer
  dispatches `setPlayerPositionAction(cell, direction)` — a cheap
  bookkeeping action, a few times per second at most.

Reconciliation runs the other way when the *simulation* moves the player:
`useWalkingBody` remembers the last cell it wrote, and any
`player.position` that doesn't match came from outside (a loaded save, an
E2E fixture, `__UPDATE_GAME_STATE__` teleports in tests). The body then
snaps to that cell's center. This is what keeps the Playwright specs'
`movePlayerTo(...)` helpers working.

## The pieces

| Piece | File | Role |
| --- | --- | --- |
| Pure motion math | `src/game/player-motion.ts` | integration, collision, walk speed, 4-way quantization |
| Body store | `src/components/world-view/playerMotionStore.ts` | the mutable singleton sprites read |
| Input | `src/components/world-view/heldMovementInput.ts` | tracks *held* keys (DOM side) |
| Walking | `src/components/world-view/useWalkingBody.ts` | reads the keys, integrates, cell sync, teleport snap |
| Shop's frame | `src/components/shop-view/PlayerMotionLayer.tsx` | the shop's `useTick`: its solids, its speed, the bench stance |
| Footsteps | `src/game/footsteps.ts` + `src/components/shop-view/FootstepSoundLayer.tsx` | a step every stride of floor covered |

`world-view/` is the part of this that isn't about the shop. The body is
a singleton and the venues are never on screen together, so a second
walkable place drives the same body through the same hook, with its own
solids and its own reasons to stop walking — the hook doesn't own the
frame, each venue's layer does.

## Collision

The body is a circle, moved then pushed back out of anything solid
(`stepPlayerMotion`): each substep (capped at half the body radius, so
a dropped frame can't tunnel) integrates the input, then resolves
overlap against the walkable world's edges and a flat list of
world-space solids — boxes and circles; crates and piles don't block —
by the closest-point normal. Because the push removes only the *into-the-face* component,
diagonal input into a machine slides along its face at full tangential
speed, and a shoulder grazing an outside corner deflects around it
instead of catching (corner contact pushes radially). A body that
starts a frame overlapped (a fixture teleport, a machine set down over
its margin) is pushed out to the nearest face rather than left
embedded. All pure and unit-tested (`player-motion.test.ts`).

The walkable world is the whole lot, not just the shop floor: the
building's walls are ordinary box solids with a gap at the garage door
(`wallSolids` in `src/game/lot.ts`), the parked truck is one more box
(`truckSolid`, gone while the player is away — they drove it), and the
world's hard edges are the lot's (`lotSize`: the shop's width, extended
down past the truck's nose). `collisionWorld(gameState)` in
`machine-collision.ts` assembles all of it. Outdoor cells have no
CellMap entry, which is what keeps machine placement and every other
cell verb indoors for free — the lot is walkable ground and nothing
else. (Piles aren't in the CellMap; `dropMaterialAction` checks
`isOutdoors` itself.)

The machine solids come from `shopSolids`: each
machine contributes its `MachineType.collisionShapes` — a list of
boxes/circles in the machine's local frame, rotated with the placement
(rotations are quarter-turns, so boxes stay exact) — or, when it has
none, its occupied tiles merged into as few boxes as the footprint
allows. Shapes for image-based machines are measured from their sprite
art by `npm run generate:collision-boxes` (committed as
`machine-collision-boxes.generated.ts`; re-run after art changes),
which greedily covers the silhouette with a handful of rectangles so a
concave machine — the jointer's narrow beds on a wide body — no longer
casts one fat invisible wall. Layers that slide with machine settings
(the saws' fences) are left out of the measurement; a fixed solid can't
be honest about a part that moves. Procedurally drawn machines set
their shapes by hand (the garbage can really is a circle). A machine
crosses from hand-set to measured the moment it gets real art — see
`docs/asset-backlog.md` for which ones are still waiting.

Cells are one square foot and the body radius is 0.8 cells (~10"), so
the body spans several cells: a 2-cell gap is a walkable aisle, a 1-cell
gap is not, and "standing at" a machine is a small zone of cells around
its operation position (`Machine.operationZone`) rather than one exact
cell. The union of a machine's collision shapes must reach within the
body radius of its footprint's edges (enforced in
`machine-collision.test.ts`) so the cell-underfoot bookkeeping below
never sees the player standing "in" a machine. Load the game with
`?collision` in the URL to see the solids painted over the shop, plus
the body circle that collides with them.

## Free-floating piles

Material piles don't live on the grid either: `MaterialPile.position` is
the piece's **center point** in continuous cell units, the same
coordinate space as the body, and `MaterialPile.rotation` is the
orientation it lies in (radians, world frame — 0 is square to the shop
with long stock running down the y axis, the way the sprites draw).
Dropping (F, or a hands-strip slot) passes the body's actual position
*and* the carried orientation (`heading + π/2`, the person sprite's own
frame) into `dropMaterialAction`, so a piece lands exactly where the
woodworker is standing, lying the way it looked in their arms — and
stays that way. Sequence tests omit both and the piece lands square at
the standing cell's center (`cellCenter`).

Reach is geometry, not cell membership: a pile is grabbable when its
material's resting rectangle (`materialExtentInches`, the piece's real
dimensions, turned to the pile's rotation) comes within
`PILE_REACH_CELLS` of the player's cell center (`pileWithinReach` in
`pile-helpers.ts`). Long stock is grabbable anywhere along its length —
as it actually lies, not along an axis-aligned ghost — with no
special-cased overhang cells, and the CellMap knows nothing about piles
at all — `resolveInteract` scans `gameState.materialPiles` directly (a
list of dozens at most).

The simulation still validates reach against `player.position` (the cell
underfoot), not the continuous body — actions stay pure and the hint
chips can never disagree with the keypress. Only the *drop point* and
*orientation* come from the body, threaded in as action arguments by the
DOM layer.

Piles render individually at their positions and rotations
(`MaterialPileSprite`), keyed by the material's `id`, in drop order so
the newest piece draws on top — matching the order E picks from. Pieces
set down on the very same spot facing the same way stack squarely, like
someone set them down that way on purpose — because someone did.

## Speed, not busy-ticks

The old walk charged extra *ticks* per step: deep sawdust
(`moveDustPenalty`, now deleted), dragging the shop vac. Those same
penalties now divide walking speed
(`playerWalkSpeed`): each tick-equivalent of penalty divides
`BASE_WALK_SPEED` by one more. Three penalties exist today — deep
sawdust underfoot, dragging the shop vac, and sweeping while walking
(`SWEEPING_PENALTY`). `busyTicks` survives only for genuinely
occupying work — while it's positive, movement input is ignored.

## Input rules (heldMovementInput.ts)

- Key **state**, not key presses, so it bypasses `ShortcutProvider`
  (which is keydown-only) — but the registry still owns the `move-*`
  labels for the cheat sheet and legend.
- Held keys don't drive the body while a modal is open (`useModalOpen`),
  while typing in a field, or while the player is away — the keys are
  still recorded, the gate is at read time (`readHeldMovement`) — and
  key-ups always clear, so a modal opening mid-stride never leaves the
  player marching.
- An open card can claim the vertical axis (`captureVertical`): W/S walk
  the card's rows (`panel-up`/`panel-down`) while A/D keep driving the
  body.
- Window blur clears all held keys.
- Pause (`PauseContext`) freezes the body: pausing stops the world,
  woodworker included. The pause menu is the only thing that pauses —
  there are no speed controls.

## What got deleted

- `WorkItem { type: "move" }`, `instaMovePlayerAction`, and the
  work-queue path preview (`WorkQueueSprite`). The work queue is gone
  entirely now — sweeping was the last thing in it, and it's a direct
  press (`cleanUpAction`).
- The `cancel-last-move` (Backspace) shortcut; Escape opens the pause
  menu once there's nothing left to back out of.
- `moveDustPenalty` (folded into `playerWalkSpeed`).
