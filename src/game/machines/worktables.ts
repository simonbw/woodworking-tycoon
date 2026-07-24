import { MachineType } from "../Machine";
import { Vector } from "../Vectors";
import { BENCH_OPERATIONS } from "./benchOperations";

/**
 * Worktables — shop-built benches (see the build recipes in
 * benchOperations.ts; they're never sold). A bare worktable is the
 * makeshift workbench, upgraded: the same recipe list, run faster
 * (workSpeed), with more tool slots and a shelf underneath
 * (materialStorage). The top can also carry benchtop machines wherever
 * their footprints fit — mounting the planer on a table's end leaves the
 * rest of the top free for bench work, and the shelf below doubles as the
 * machine's stand storage.
 *
 * All tables are two feet deep (cells are 1 sq ft); `widthFeet` sets the
 * run of the top. The ids keep their old grid-era names for save
 * compatibility.
 */
function worktable(
  id: string,
  name: string,
  description: string,
  widthFeet: number,
  depthFeet: number,
  stats: {
    materialStorage: number;
    toolSlots: number;
    inputSpaces: number;
    upgradeSlots: number;
  },
): MachineType {
  const cells: Vector[] = [];
  for (let y = 0; y < depthFeet; y++) {
    for (let x = 0; x < widthFeet; x++) {
      cells.push([x, y]);
    }
  }
  // Stand anywhere along the front: the operation cell anchors near the
  // middle of the front edge, and the whole front row stays clear so the
  // bench is workable along its length.
  const operationPosition: Vector = [
    Math.floor((widthFeet - 1) / 2),
    depthFeet,
  ];
  const freeCellsNeeded: Vector[] = [];
  for (let x = 0; x < widthFeet; x++) {
    freeCellsNeeded.push([x, depthFeet]);
  }
  return {
    id,
    name,
    description,
    cellsOccupied: cells,
    freeCellsNeeded,
    operationPosition,
    cost: 0,
    materialStorage: stats.materialStorage,
    toolSlots: stats.toolSlots,
    inputSpaces: stats.inputSpaces,
    // A flat, solid top that holds the work still: attended hand work
    // runs a quarter faster than on the wobbly makeshift bench
    workSpeed: 1.25,
    worktable: true,
    // Room for a vise, drawers, a second shelf… bigger tables carry more
    // (see Upgrade.ts)
    upgradeSlots: stats.upgradeSlots,
    operations: BENCH_OPERATIONS,
  };
}

export const worktable1x1 = worktable(
  "worktable1x1",
  "Small Worktable",
  "A sturdy shop-built bench, 2'×2'. Solid top, tool slots, and a shelf below.",
  2,
  2,
  { materialStorage: 3, toolSlots: 3, inputSpaces: 5, upgradeSlots: 1 },
);

export const worktable1x2 = worktable(
  "worktable1x2",
  "Worktable",
  "A full-size shop-built bench, 4'×2': room to work and a benchtop machine.",
  4,
  2,
  { materialStorage: 6, toolSlots: 4, inputSpaces: 6, upgradeSlots: 2 },
);

export const worktable1x3 = worktable(
  "worktable1x3",
  "Long Worktable",
  "A 6'×2' run of bench: machines on the ends, hand work in the middle.",
  6,
  2,
  { materialStorage: 9, toolSlots: 5, inputSpaces: 7, upgradeSlots: 3 },
);

export const worktable2x2 = worktable(
  "worktable2x2",
  "Big Worktable",
  "A deep 4'×4' island of bench space with a generous shelf underneath.",
  4,
  4,
  { materialStorage: 12, toolSlots: 6, inputSpaces: 8, upgradeSlots: 3 },
);
