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

Axis-separated circle-vs-box (`stepPlayerMotion`): each axis integrates
independently and clamps the body's leading edge against blocked cells
(machine footprints and anything off the floor — crates and piles don't
block, same as before). Diagonal input into a machine slides along its
face. Each axis sweeps every cell boundary it crosses, so a dropped frame
can't tunnel through a machine. All pure and unit-tested
(`player-motion.test.ts`).

Machines that don't visually fill their tile don't block their whole tile
either: `MachineType.collisionBox` is an AABB in the machine's local frame
(rotated with the placement), and `machine-collision.ts` clips it to each
occupied cell as per-edge insets the sweep collides against. Boxes for
image-based machines are measured from their sprite art by
`npm run generate:collision-boxes` (committed as
`machine-collision-boxes.generated.ts`; re-run after art changes);
procedurally drawn machines set theirs by hand. Insets are capped at
`MAX_COLLISION_INSET` (0.25), strictly below the 0.3 body radius, so the
player's *center* can never enter an occupied cell — the cell-underfoot
bookkeeping below never sees the player standing "in" a machine. Load the
game with `?collision` in the URL to see the solid areas painted over the
shop.

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
