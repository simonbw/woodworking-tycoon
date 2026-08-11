import { MachineType } from "../Machine";

/**
 * The starter shelf every shop opens with: a plank on short legs against
 * the wall, so the first scavenged boards have somewhere to live besides
 * the floor. Half the footprint and half the capacity of the buildable
 * storage rack (storageRack.ts), which stays the upgrade. Never sold and
 * never built — it exists only in the starting layout.
 */
export const lumberShelf: MachineType = {
  id: "lumberShelf",
  name: "Lumber Shelf",
  description: "A plank on short legs. Keeps a few boards off the floor.",
  // A 2×1-ft shelf: one board deep, stock laid along it.
  cellsOccupied: [
    [0, 0],
    [1, 0],
  ],
  // Hand-set (drawn procedurally): the deck in LumberShelfSprite fills
  // the footprint to a small inset.
  collisionShapes: [{ kind: "box", min: [-0.44, -0.44], max: [1.44, 0.44] }],
  // Stand at the front to stow and take — the shelf UI (and everything
  // else) hangs off the operation cell.
  freeCellsNeeded: [
    [0, 1],
    [1, 1],
  ],
  operationPosition: [0, 1],
  cost: 0,
  materialStorage: 4,
  toolSlots: 0,
  inputSpaces: 0,
  operations: [],
};
