import { MachineType } from "../Machine";
import { Vector } from "../Vectors";
import { BENCH_OPERATIONS } from "./benchOperations";

/**
 * Worktables — shop-built benches (see the build recipes in
 * benchOperations.ts; they're never sold). A bare worktable is the
 * makeshift workbench, upgraded: the same recipe list, run faster
 * (workSpeed), with more tool slots and a shelf underneath
 * (materialStorage). Each cell of the top can also carry one benchtop
 * machine — mounting the planer on a table's end leaves the rest of the
 * top free for bench work, and the shelf below doubles as the machine's
 * stand storage.
 */
function worktable(
  id: string,
  name: string,
  description: string,
  cells: ReadonlyArray<Vector>,
  operationPosition: Vector,
  toolSlots: number,
): MachineType {
  return {
    id,
    name,
    description,
    cellsOccupied: cells,
    freeCellsNeeded: [operationPosition],
    operationPosition,
    cost: 0,
    // The shelf underneath: three materials per cell of top
    materialStorage: cells.length * 3,
    toolSlots,
    inputSpaces: 4 + cells.length,
    // A flat, solid top that holds the work still: attended hand work
    // runs a quarter faster than on the wobbly makeshift bench
    workSpeed: 1.25,
    worktable: true,
    // Room for a vise, drawers, a second shelf… bigger tables carry more
    // (see Upgrade.ts)
    upgradeSlots: Math.min(cells.length, 3),
    operations: BENCH_OPERATIONS,
  };
}

export const worktable1x1 = worktable(
  "worktable1x1",
  "Small Worktable",
  "A sturdy shop-built bench. Solid top, tool slots, and a shelf below.",
  [[0, 0]],
  [0, 1],
  3,
);

export const worktable1x2 = worktable(
  "worktable1x2",
  "Worktable",
  "A full-size shop-built bench: room to work and a benchtop machine.",
  [
    [0, 0],
    [1, 0],
  ],
  [0, 1],
  4,
);

export const worktable1x3 = worktable(
  "worktable1x3",
  "Long Worktable",
  "A long run of bench: machines on the ends, hand work in the middle.",
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [0, 1],
  5,
);

export const worktable2x2 = worktable(
  "worktable2x2",
  "Big Worktable",
  "A deep island of bench space with a generous shelf underneath.",
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  [0, 2],
  6,
);
