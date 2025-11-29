import { MachineType } from "../Machine";
import { MaterialInstance } from "../Materials";

export const garbageCan: MachineType = {
  id: "garbageCan",
  name: "Garbage Can",
  description: "Dispose of unwanted materials and scraps. Materials are permanently removed.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [],
  cost: 0, // Free - basic quality of life feature
  materialStorage: 0,
  toolStorage: 0,
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
