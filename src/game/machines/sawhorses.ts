import { MachineType } from "../Machine";

/**
 * A pair of folding sawhorses: the cheapest thing in the store that
 * counts as a machine, and the only place a full sheet can be worked
 * (see docs/sheet-goods.md).
 *
 * Bare, they do nothing at all — they are somewhere to put a sheet. What
 * makes them a station is the circular saw dropped in their tool slot.
 * Everything that makes breaking a sheet down cumbersome comes from
 * being here rather than at the table saw:
 *
 * - No `feedsThrough`, so a 4×8 sheet needs no run of clear lane. That's
 *   the whole reason to own them: nothing else in the shop can take a
 *   full sheet at all.
 * - No tool slot to spare for a dust bag, so every cut goes on the floor.
 * - The straightedge has to be clamped down for each cut and comes off
 *   with the offcut (see circularSaw), where a fence stays where it's put.
 */
export const sawhorses: MachineType = {
  id: "sawhorses",
  name: "Sawhorses",
  description:
    "A folding pair, and a sheet of plywood across them. Nowhere near a fence — bring the saw to the work.",
  // A 4×2-ft span: the horses stand apart and the sheet bridges them,
  // overhanging on every side the way it does in a real driveway.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  collisionShapes: [{ kind: "box", min: [-0.4, -0.4], max: [2.4, 1.4] }],
  // Work them from the long side, the way you walk a saw down a cut.
  freeCellsNeeded: [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  operationPosition: [1, 2],
  cost: 30,
  materialStorage: 0,
  // One slot, and the circular saw wants it — no room for a dust bag.
  toolSlots: 1,
  // One sheet across the horses at a time.
  inputSpaces: 1,
  directFeed: true,
  // Deliberately absent: `feedsThrough`. The stock stays put and the saw
  // moves, so there is no lane to keep clear.
  operations: [],
};
