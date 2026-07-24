import { MachineType } from "../Machine";

/**
 * Shop furniture with one job: a big shelf. Built at a bench from
 * rack-grade sheet stock and stout legs (see buildStorageRack in
 * benchOperations.ts) — never sold. No operations, no tools; it holds
 * more stock per cell than any worktable shelf, and that's the trade.
 */
export const storageRack: MachineType = {
  id: "storageRack",
  name: "Storage Rack",
  description: "Cheap sheet on stout legs. Holds a small lumberyard.",
  // A 2×2-ft rack: deep enough for sheet stock stood on edge.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  // Hand-set (drawn procedurally): the deck in StorageRackSprite fills
  // the footprint to a small inset.
  collisionBox: { min: [-0.44, -0.44], max: [1.44, 1.44] },
  // Stand at the front to stow and take — the shelf UI (and everything
  // else) hangs off the operation cell, rack or not.
  freeCellsNeeded: [
    [0, 2],
    [1, 2],
  ],
  operationPosition: [0, 2],
  cost: 0,
  materialStorage: 8,
  toolSlots: 0,
  inputSpaces: 0,
  operations: [],
};
