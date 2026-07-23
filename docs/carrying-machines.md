# Carrying machines

Shop layout management happens on the home screen, in the fiction: the
player picks machines up, lugs them across the floor, and sets them back
down. There is no separate layout editor.

## The carry verb

`L` (shortcut `carry-machine`, contextual — the placards offer it only
when it applies) is a three-way toggle:

1. **Carrying something** → put it down (if there's room).
2. **Standing on a crate** → unpack it straight into your arms.
3. **Standing at a machine's operator cell** → hoist the targeted machine
   (`X` cycles which, e.g. a table vs. the saw mounted on it).

`R` rotates the carried machine a quarter turn (`carry-rotate`; it shares
the key with `operate-machine` — exactly one is enabled at a time, see
`sharesKey` in `shortcuts.ts`).

The verb is gated by `progression.shopLayoutUnlocked` (the flag keeps its
old name for save compatibility; it unlocks on owning a miter saw) and is
hidden entirely until then, per the progressive-disclosure rule.

## Pick up

`pickUpMachineAction` / `canPickUpMachine` (`machine-actions.ts`): hands
must be free (no materials, no shop vac, no other machine), the machine
idle and emptied of work materials (input/processing/output bays), and a
worktable must have nothing mounted on it. Mounted tools, installed
upgrades, and shelf stock (`storedMaterials`) ride along.

## Put down

The placement rule (`carriedMachinePlacement`): the machine lands so that
**the player is standing at its operator cell** — you place a machine by
standing where you'd work it, which guarantees the operator cell is
reachable. Rotating spins the landing spot around the player. Machines
with no operator cell (the garbage can) land on the faced cell instead.
Validity is `canPlaceMachine` plus "not on the player's own cell";
benchtop machines can land on an empty worktable cell as usual. The
`CarriedMachineLayer` draws the ghost (green fits / red doesn't) and the
machine riding over the player's shoulders.

## Weight

`carryMoveBusyTicks`: benchtop machines carry at full walking speed;
floor machines and worktables weigh `1 + cellsOccupied.length`
tick-equivalents, which divide walking speed in `playerWalkSpeed` (same
penalty pool as deep sawdust and the vac drag — see
docs/continuous-movement.md), so rearranging heavy benches costs real
shop time.

## Crates

Machines enter the world as `GameState.machineCrates` — 1×1, walkable,
drawn as stenciled boxes (`MachineCrateSprite`):

- **Store purchases** (`buyMachineAction`) land on the open floor nearest
  the shop entrance (`ShopInfo.entrancePosition`, marked by the
  `EntranceSprite` threshold).
- **Shop-built machines** (`OperationOutput.machineOutputs`, i.e.
  worktables) land crated beside the bench that made them (`tickAction`).

`deliverMachineCrate` does the nearest-open-cell search. There is no
abstract machine storage anymore — `storage` holds only tools and
upgrades; machines always exist physically (placed, crated, or carried).
Old saves' stored machines migrate to crates at the entrance
(`migrateV15toV16`).
