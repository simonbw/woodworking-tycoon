import { MachineType } from "../Machine";

export const makeshiftBench: MachineType = {
  id: "makeshiftBench",
  name: "Makeshift Bench",
  description: "A makeshift bench to place tools on.",
  cellsOccupied: [[0, 0]],
  freeCellsNeeded: [[0, 1]],
  cost: 0,
  materialStorage: 0,
  toolStorage: 0,
  className: "fill-brown-800 drop-shadow-md",
  operations: [],
  inputSpaces: 0,
};
