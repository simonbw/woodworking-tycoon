import { MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";

export const garbageCan: MachineType = {
  id: "garbageCan",
  name: "Garbage Can",
  description:
    "Dispose of unwanted materials and scraps. Materials are permanently removed.",
  // A full-size shop can (22" across) sits on a 2×2-ft patch of floor.
  cellsOccupied: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  // Hand-set (the can is drawn procedurally, not from an image): the lid
  // circle in GarbageCanSprite is 0.93 cells around the footprint center.
  collisionBox: { min: [-0.43, -0.43], max: [1.43, 1.43] },
  freeCellsNeeded: [],
  cost: 0, // Free - basic quality of life feature
  materialStorage: 0,
  toolSlots: 0,
  inputSpaces: 5, // Can accept multiple materials at once
  operations: [
    {
      name: "Dispose",
      id: "dispose",
      duration: 1, // Very quick operation
      inputMaterials: [{ quantity: 1 }], // Accept any single material
      output: (materials: ReadonlyArray<MaterialInstance>) => {
        // Material is destroyed - no outputs, no inputs returned
        return {
          inputs: [],
          outputs: [],
        };
      },
    },
  ],
};
