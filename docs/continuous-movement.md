# Continuous Player Movement

The player walks continuously with held WASD/arrow keys; only machines and
the shop layout live on the grid. This replaced the original
one-cell-per-tick queued movement, which made the woodworker feel like a
cursor instead of a person.

## The split: body vs. cell

The core trick is that **GameState never learned about continuous
position**. It still stores `player.position` as a grid cell — every
cell-based system (machine targeting, attendance in `tickAction`,
sweeping, vac dumping, crate pickup, the inspector panels) is untouched.

- **The body** is a mutable singleton (`playerMotionStore.ts`): a float
  position in cell units, a heading in radians, and a `moving` flag. It is
  written by `PlayerMotionLayer` every render frame and read imperatively
  by sprites inside `useTick` — walking causes **zero React re-renders**.
- **The cell** is derived: when the body crosses into a new cell (or the
  facing changes), `PlayerMotionLayer` dispatches
  `setPlayerPositionAction(cell, direction)` — a cheap bookkeeping action,
  a few times per second at most.

Reconciliation runs the other way when the *simulation* moves the player:
`PlayerMotionLayer` remembers the last cell it wrote, and any
`player.position` that doesn't match came from outside (a loaded save, an
E2E fixture, `__UPDATE_GAME_STATE__` teleports in tests). The body then
snaps to that cell's center. This is what keeps the Playwright specs'
`movePlayerTo(...)` helpers working.

## The pieces

| Piece | File | Role |
| --- | --- | --- |
| Pure motion math | `src/game/player-motion.ts` | integration, collision, walk speed, 4-way quantization |
| Body store | `src/components/shop-view/playerMotionStore.ts` | the mutable singleton sprites read |
| Input | `src/components/shop-view/heldMovementInput.ts` | tracks *held* keys (DOM side) |
| Integrator | `src/components/shop-view/PlayerMotionLayer.tsx` | per-frame `useTick` loop, cell sync, teleport snap |

## Collision

Axis-separated body-vs-box (`stepPlayerMotion`): each axis integrates
independently and clamps the body's leading edge against the shop walls
and a flat list of world-space solid boxes (crates and piles don't
block, same as before). Diagonal input into a machine slides along its
face. The clamp compares the start and end of the whole step, so a
dropped frame can't tunnel through a machine, and a box the body already
overlaps (a fixture teleport, a machine set down over the body's margin)
never clamps — the body can always walk out, just never press deeper in.
All pure and unit-tested (`player-motion.test.ts`).

The solids come from `machine-collision.ts` (`shopSolids`): each machine
contributes its `MachineType.collisionBox` — an AABB in the machine's
local frame, rotated with the placement — or, when it has none, one full
box per occupied tile. Boxes for image-based machines are measured from
their sprite art by `npm run generate:collision-boxes` (committed as
`machine-collision-boxes.generated.ts`; re-run after art changes);
procedurally drawn machines set theirs by hand.

Cells are one square foot and the body radius is 0.8 cells (~10"), so
the body spans several cells: a 2-cell gap is a walkable aisle, a 1-cell
gap is not, and "standing at" a machine is a small zone of cells around
its operation position (`Machine.operationZone`) rather than one exact
cell. Machine collision boxes must reach within the body radius of their
footprint's edges (enforced in `machine-collision.test.ts`) so the
cell-underfoot bookkeeping below never sees the player standing "in" a
machine. Load the game with `?collision` in the URL to see the solid
boxes painted over the shop.

## Speed, not busy-ticks

The old walk charged extra *ticks* per step: deep sawdust
(`moveDustPenalty`, now deleted), dragging the shop vac, a machine over
the shoulders. Those same penalties now divide walking speed
(`playerWalkSpeed`): each tick-equivalent of penalty divides
`BASE_WALK_SPEED` by one more. `busyTicks` survives only for genuinely
occupying work (sweeping, vacuuming) — while it's positive, movement
input is ignored.

## Input rules (heldMovementInput.ts)

- Key **state**, not key presses, so it bypasses `ShortcutProvider`
  (which is keydown-only) — but the registry still owns the `move-*`
  labels for the cheat sheet and legend.
- Key-downs are ignored while a modal is open (`useModalOpen`), while
  typing in a field, or while the player is away; key-ups always clear,
  so a modal opening mid-stride never leaves the player marching.
- Window blur clears all held keys.
- Pause (`TickSpeedContext`, tick speed 0) freezes the body: pausing
  stops the world, woodworker included. Fast-forward does *not* speed up
  walking — it's for waiting out cures, not sprinting.

## What got deleted

- `WorkItem { type: "move" }`, `instaMovePlayerAction`, and the
  work-queue path preview (`WorkQueueSprite`). The work queue itself
  survives, sweep-only.
- The `cancel-last-move` (Backspace) shortcut; Escape still clears
  queued work.
- `moveDustPenalty` (folded into `playerWalkSpeed`).
