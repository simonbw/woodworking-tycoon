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
  cellsOccupied: [[0, 0]],
  // Hand-set (drawn procedurally): the deck in StorageRackSprite spans
  // 0.42 cells around the cell center.
  collisionBox: { min: [-0.42, -0.42], max: [0.42, 0.42] },
  // Stand at the front to stow and take — the shelf UI (and everything
  // else) hangs off the operation cell, rack or not.
  freeCellsNeeded: [[0, 1]],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 8,
  toolSlots: 0,
  inputSpaces: 0,
  operations: [],
};
